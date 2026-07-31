// プラン生成(プランタブの「プランを生成」)の中核。ストックの候補カードから、
// 重さの違う3案(1日/半日/さくっと)をGeminiに編成させる。
//
// 設計方針は briefPipeline と同じ「機械的処理はコードで、LLMに投機させない」:
//   - 距離の計算・近さのグループ分けはコード(haversine+貪欲クラスタリング)が行い、
//     Geminiには「同じ記号どうしは近い」という記号だけを渡す(LLMに緯度経度の
//     距離計算をさせない)。
//   - Geminiが返すのは「どのidをどの順で組むか」と文面だけ。id は渡した候補の
//     集合に含まれるものだけを通し(捏造・改変の排除)、件数の上限もコードが切る。
//   - プランの移動距離(spanKm)・エリアの一覧も、返ってきたidからコードが再計算する
//     (AIの自己申告を信用しない)。
//
// GEMINI_API_KEY は NEXT_PUBLIC_ を付けずサーバー側だけが読む。

import { callGemini, extractJsonArray, type TokenUsage } from "./briefPipeline";
import { itemKindOf } from "./constants";
import type { GeneratedPlan, ItemKind, PlanStop, PlanWeight } from "./types";

// データモデルの正は lib/types.ts。ここは使う側の入口として re-export する。
export type { GeneratedPlan, PlanStop, PlanWeight };

// 同じ「近さグループ」とみなす半径(km)。徒歩〜ひと駅の感覚。
const CLUSTER_RADIUS_KM = 1.2;
// 1プランに入れる件数の上限(重さごと)。プロンプトでも指示するが、最終的な
// 頭打ちはコード側で切る。
export const PLAN_STOP_CAP: Record<PlanWeight, number> = { full: 5, half: 3, light: 2 };
// プロンプトへ渡す候補の上限(トークンと編成の見通しのため)。
const CANDIDATE_LIMIT = 60;

export const PLAN_WEIGHTS: PlanWeight[] = ["full", "half", "light"];

export type PlanCandidate = {
  id: string;
  title: string;
  kind: ItemKind;
  area?: string;
  lat?: number;
  lng?: number;
  summary?: string;
};

export type PlanResult =
  | { ok: true; plans: GeneratedPlan[]; tokens: TokenUsage; dropped: number }
  | { ok: false; reason: string; detail?: string };

// ---- 距離・近さグループ(コード) ------------------------------------------
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const hasCoords = (c: PlanCandidate): c is PlanCandidate & { lat: number; lng: number } =>
  typeof c.lat === "number" && typeof c.lng === "number";

// 候補を「近さグループ」に振り分ける。座標を持つものは貪欲クラスタリング
// (先に出来たグループの代表点から半径内なら同じグループ)でA・B・C…を振る。
// 座標が無いものはエリア名でまとめ、エリアも無ければ「?」(位置不明)。
export function groupByProximity(candidates: PlanCandidate[]): Map<string, string> {
  const groups = new Map<string, string>();
  const seeds: { label: string; lat: number; lng: number }[] = [];
  const letter = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : "");
  const areaLabels = new Map<string, string>();
  candidates.forEach((c) => {
    if (hasCoords(c)) {
      const near = seeds.find((s) => haversineKm(s, c) <= CLUSTER_RADIUS_KM);
      if (near) {
        groups.set(c.id, near.label);
      } else {
        const label = letter(seeds.length);
        seeds.push({ label, lat: c.lat, lng: c.lng });
        groups.set(c.id, label);
      }
      return;
    }
    const area = c.area && c.area !== "—" ? c.area : null;
    if (!area) {
      groups.set(c.id, "?");
      return;
    }
    let label = areaLabels.get(area);
    if (!label) {
      label = `area${areaLabels.size + 1}`;
      areaLabels.set(area, label);
    }
    groups.set(c.id, label);
  });
  return groups;
}

// プランの広がり(km)。座標を持つ2件以上があるときだけ、最も離れた2点の距離を返す。
export function planSpanKm(stops: PlanCandidate[]): number | null {
  const pts = stops.filter(hasCoords);
  if (pts.length < 2) return null;
  let max = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) max = Math.max(max, haversineKm(pts[i], pts[j]));
  }
  return Math.round(max * 10) / 10;
}

// ---- AI出力の検証(コード) -------------------------------------------------
type RawPlan = { weight?: unknown; title?: unknown; summary?: unknown; stops?: unknown };

// Geminiの生出力を、渡した候補の集合に照らして検証する。
//   - idは候補プールに実在するものだけを通す(捏造・改変の排除)
//   - 1プラン内の重複idを除去し、重さごとの上限で切る
//   - 同じweightが複数返ってきたら最初の1つだけ採る
//   - stopsが空になったプランは捨てる
// 返り値のdroppedは「弾いたstopの数」(可観測性のため)。
export function validatePlans(
  raw: unknown,
  candidates: PlanCandidate[],
): { plans: GeneratedPlan[]; dropped: number } {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const list: RawPlan[] = Array.isArray(raw) ? (raw as RawPlan[]) : [];
  const plans: GeneratedPlan[] = [];
  const usedWeights = new Set<PlanWeight>();
  let dropped = 0;

  list.forEach((p) => {
    const weight = PLAN_WEIGHTS.find((w) => w === p.weight);
    if (!weight || usedWeights.has(weight)) return;
    const rawStops = Array.isArray(p.stops) ? p.stops : [];
    const seen = new Set<string>();
    const stops: PlanStop[] = [];
    rawStops.forEach((s) => {
      const id = typeof s === "string" ? s : typeof (s as PlanStop)?.id === "string" ? (s as PlanStop).id : "";
      if (!id || !byId.has(id) || seen.has(id)) { dropped++; return; }
      if (stops.length >= PLAN_STOP_CAP[weight]) { dropped++; return; }
      seen.add(id);
      const note = typeof (s as PlanStop)?.note === "string" ? (s as PlanStop).note!.trim() : undefined;
      stops.push({ id, note: note || undefined });
    });
    if (stops.length === 0) return;
    const stopItems = stops.map((s) => byId.get(s.id)!);
    const areas = Array.from(new Set(stopItems.map((i) => i.area).filter((a): a is string => !!a && a !== "—")));
    usedWeights.add(weight);
    plans.push({
      weight,
      title: typeof p.title === "string" && p.title.trim() ? p.title.trim() : areas[0] ? `${areas[0]}をめぐる` : "めぐるプラン",
      summary: typeof p.summary === "string" ? p.summary.trim() : "",
      stops,
      areas,
      spanKm: planSpanKm(stopItems),
    });
  });

  // 重さの順(1日→半日→さくっと)で並べて返す。
  plans.sort((a, b) => PLAN_WEIGHTS.indexOf(a.weight) - PLAN_WEIGHTS.indexOf(b.weight));
  return { plans, dropped };
}

// ---- プロンプト -----------------------------------------------------------
const SYSTEM_PLAN = `あなたは外出プランを編成するモジュールです。渡された候補一覧だけを使い、重さの違う3つのプランをJSON配列で出力します。

# 入力仕様
<基準日>: 本日の日付
<エリア指定>: 利用者が指定したエリア。「指定なし」のときは候補全体から選ぶ
<候補一覧>: 1行1件。書式は [id] 名称 ｜ 種類 ｜ エリア ｜ 近さ:記号 ｜ メモ
  近さ:記号 は地理的な近さを表す。同じ記号の候補どうしは徒歩圏内にある。「?」は位置が不明

# 編成ルール
1. 候補一覧に無いものを登場させない。名称・場所・期間・料金を創作しない。id は一覧のものを一字一句そのまま使う。
2. 3つのプランを、かける時間の重さで分ける。
   full: 一日かけて楽しむ。3〜5件
   half: 半日で回る。2〜3件
   light: 1〜2時間で済ませる。1〜2件
3. 1つのプランの中では、近さの記号が同じ候補を優先して組み合わせる。別の記号をまたぐ場合は、移動が必要であることを summary に書く。
4. <エリア指定>があるときは、そのエリアの候補を中心に組む。
5. stops は実際に回る順に並べる。移動の効率と、時間帯として自然な流れ(食事は昼か夜、屋内と屋外の並び)で順序を決める。
6. 同じ候補を1つのプランの中で2回使わない。プランをまたいで同じ候補を使うのは構わない。
7. 利用者の予定・移動手段・同行者・予算を推測して書かない。候補一覧に無い情報を補わない。
8. title は10〜18字程度。summary は1〜2文で、その組み合わせを勧める理由が分かるようにする。note は各候補について15字程度の一言(不要なら省略)。

# 出力契約
下記フィールドのJSON配列のみを出力する。要素は3つ(full・half・light を各1つ)。
weight: "full" | "half" | "light"
title: 文字列
summary: 文字列
stops: [{ id: 文字列, note: 文字列(任意) }]`;

function candidateLine(c: PlanCandidate, group: string): string {
  const kind = itemKindOf(c.kind).label;
  const area = c.area && c.area !== "—" ? c.area : "エリア不明";
  const memo = (c.summary ?? "").replace(/\s+/g, " ").slice(0, 60);
  return `[${c.id}] ${c.title} ｜ ${kind} ｜ ${area} ｜ 近さ:${group}${memo ? ` ｜ ${memo}` : ""}`;
}

export function buildPlanUserPrompt(candidates: PlanCandidate[], area: string | null, todayJp: string): string {
  const groups = groupByProximity(candidates);
  const lines = candidates.map((c) => candidateLine(c, groups.get(c.id) ?? "?")).join("\n");
  return `<基準日>${todayJp}</基準日>
<エリア指定>${area && area.trim() ? area.trim() : "指定なし"}</エリア指定>
<候補一覧>
${lines}
</候補一覧>`;
}

// ---- 本体 -----------------------------------------------------------------
export async function buildPlans(input: { candidates: PlanCandidate[]; area?: string | null }): Promise<PlanResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: "no_key" };
  const candidates = input.candidates.slice(0, CANDIDATE_LIMIT);
  if (candidates.length === 0) return { ok: false, reason: "no_candidates" };

  const todayJp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const user = buildPlanUserPrompt(candidates, input.area ?? null, todayJp);
  const res = await callGemini(key, SYSTEM_PLAN, user, true, 2048);
  if (!res.ok) return { ok: false, reason: `gemini_${res.status}`, detail: res.detail };

  const raw = extractJsonArray<RawPlan>(res.text);
  if (!raw) return { ok: false, reason: "parse_failed", detail: res.text.slice(0, 300) };
  const { plans, dropped } = validatePlans(raw, candidates);
  if (plans.length === 0) return { ok: false, reason: "empty", detail: res.text.slice(0, 300) };
  return { ok: true, plans, tokens: res.usage, dropped };
}
