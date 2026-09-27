// ★★★**帯の下の段を AI が選ぶ ―― プロンプト・検品・順位はここ1つ**（2026-09-27・第133巡）。
//   プロンプトは**ユーザー承認済みの第3稿**（`docs/band-curation.md` §3）。**1文字も変えない**
//   （変えるなら文面を先に見せて承認を取る。CLAUDE.md の約束）。
//
// ★★★**AI は「観点ごとの点」と理由を出すだけ。順位はコードが重みで決める**
//   （`CURATE_WEIGHTS`）―― 重みを直すのにプロンプトを触らなくてよく、並びの根拠を点で言える。
// ★★サーバー（`app/api/curate-band/route.ts`）とクライアント（`lib/bandCurateClient.ts`）の
//   両方が読むので、**Gemini の呼び出しをここへ持ち込まない**（`callGemini` はサーバーだけ）。

import type { BandItem } from "./homeBand";

export const SYSTEM_CURATE = `次の材料から、候補それぞれを下の観点で評価し、いまおすすめする理由を書いてください。

# 材料
<いま>: 日付・曜日・時刻
<予定>: 今日とこの先7日のタスク（題・日付・時刻）
<好み>: 好みの語
<傾向>: 手配を忘れる・後回しにするなどの傾向
<最近の反応>: 直近14日に、残した・飛ばした・済ませたものの数（種類ごと）
<候補>: id・種類・題・事実（期日・会期の終わり・行ける時間帯・どの予定の準備か・登録した日）

# 評価の観点（それぞれ 0〜3 点）
- 時機: いまの時刻・曜日にできるか。期日や会期の終わりが近いほど高い。
- 必要性: やらないと予定に差し支えるか。<傾向>に当たること（忘れがちな手配など）なら高い。
- 好み: <好み>や、最近残した・済ませた種類に近いほど高い。最近飛ばしてきた種類に近いほど低い。
- 余裕: 今日の予定の時刻と重ならず、いまから無理なくできるほど高い。
- 放置: 登録してから長く手を付けていないほど高い（日付の無いタスクだけ。他は 0）。

# 出力
JSON の配列だけ。候補ごとに1要素で、
id・時機・必要性・好み・余裕・放置（数）・why（文字列）。
why は、点のいちばん高い観点を根拠に、材料から言えることだけで20字前後の1文。`;

/** 候補の1件（プロンプトへ渡す形）。 */
export interface CurateCandidate { id: string; kind: string; title: string; facts: string }

/** クライアント → サーバーへ渡す材料（`<傾向>` だけはサーバーが my-brain から足す）。 */
export interface CurateInput {
  now: string;
  schedule: string[];
  interests: string[];
  reactions: string[];
  candidates: CurateCandidate[];
}

export function buildCuratePrompt(input: CurateInput, patterns: string[]): string {
  const list = (xs: string[]) => (xs.length ? `\n${xs.map((x) => `- ${x}`).join("\n")}\n` : "記録なし");
  const cands = input.candidates
    .map((c) => `- ${c.id} ／ ${c.kind} ／ ${c.title}${c.facts ? ` ／ ${c.facts}` : ""}`)
    .join("\n");
  return `<いま>${input.now}</いま>
<予定>${list(input.schedule)}</予定>
<好み>${input.interests.length ? input.interests.join("、") : "記録なし"}</好み>
<傾向>${list(patterns)}</傾向>
<最近の反応>${list(input.reactions)}</最近の反応>
<候補>
${cands}
</候補>`;
}

/** AI が付けた点（観点ごと 0〜3）と理由。 */
export interface CurateScore {
  id: string; timing: number; need: number; like: number; room: number; idle: number; why: string;
}

/**
 * ★★★**重み**（ユーザー承認「**これで良いです**」）。★目盛りの外（仕様の数）。
 * 合計 ＝ 3×時機 ＋ 3×必要性 ＋ 2×好み ＋ 1×余裕 ＋ 1×放置。
 */
export const CURATE_WEIGHTS = { timing: 3, need: 3, like: 2, room: 1, idle: 1 } as const;
/** ★帯の下の段に出す件数。 */
export const CURATE_PICK = 5;
/** ★提案（今日行けるもの）は何件まで（種類の偏りの上限。プロンプトではなくコードが持つ）。 */
export const CURATE_OFFER_MAX = 2;
/** ★理由の長さの上限（20字前後と頼んでいるが、はみ出した分は切る）。 */
const WHY_MAX = 40;

export const scoreOf = (s: CurateScore) =>
  s.timing * CURATE_WEIGHTS.timing + s.need * CURATE_WEIGHTS.need + s.like * CURATE_WEIGHTS.like
  + s.room * CURATE_WEIGHTS.room + s.idle * CURATE_WEIGHTS.idle;

/** ★AI の生の出力を検品する（知らない id・重複・範囲外の点を捨てる）。 */
export function validateScores(raw: unknown, ids: ReadonlySet<string>): CurateScore[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const pt = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : 0;
  };
  const out: CurateScore[] = [];
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    if (!id || !ids.has(id) || seen.has(id)) continue;
    seen.add(id);
    const why = typeof o.why === "string" ? o.why.trim().slice(0, WHY_MAX) : "";
    out.push({
      id, timing: pt(o["時機"]), need: pt(o["必要性"]), like: pt(o["好み"]),
      room: pt(o["余裕"]), idle: pt(o["放置"]), why,
    });
  }
  return out;
}

/**
 * ★★★**点から帯の下の段を組む**。合計の高い順・同点は元の並び（規則の並び ＝ 期日の近い順）。
 * 提案は `CURATE_OFFER_MAX` 件まで。★★**理由は AI のもの**に差し替える（空なら規則の理由のまま）。
 * ★点の付いていない候補（AI が落とした）は選ばない。
 */
export function rankCurated(items: BandItem[], scores: CurateScore[]): BandItem[] {
  const by = new Map(scores.map((s) => [s.id, s]));
  const ranked = items
    .map((it, i) => ({ it, i, s: by.get(it.id) }))
    .filter((x): x is { it: BandItem; i: number; s: CurateScore } => !!x.s)
    .sort((a, b) => scoreOf(b.s) - scoreOf(a.s) || a.i - b.i);
  const out: BandItem[] = [];
  let offers = 0;
  for (const { it, s } of ranked) {
    if (out.length >= CURATE_PICK) break;
    const isOffer = it.kind === "today" || it.kind === "offer";
    if (isOffer && offers >= CURATE_OFFER_MAX) continue;
    if (isOffer) offers += 1;
    out.push({ ...it, why: s.why || it.why });
  }
  return out;
}
