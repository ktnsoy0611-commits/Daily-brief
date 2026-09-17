import { KIND_DOMAIN } from "./constants";
import { unreadEntries } from "./homeBand";
import type { AppState, BriefCard, ItemDomain } from "./types";

// ★★★**山へ落とす「おすすめの提案」の選び方はここ1つ**（2026-09-17・第119巡に
//   ユーザー指定「**その日とか、その時の Explore で溜まっている（もしくは新着の）
//   もののうち最もおすすめなのを3件ほど抽出し、ホームに落とすようにしたい。
//   おすすめ3件は時間とか関係なく私が一番好みそうなものを選べばよい**」）。
//
// ★★★**AI を使わない。** 理由は `lib/todayPick.ts` とまったく同じ:
//   ① **材料はクライアントに全部ある**（好み・願い・ゴール・過去の KEEP/SKIP）ので、
//      モデルに聞いても新しい情報が増えない。
//   ② **夜間生成が止まっていても効く**（いまは `POOL_CAP` で止まったまま）。
//   ③ **嘘をつかない** ―― 採点の根拠がその場で説明できる。
//
// ★★★**`lib/todayPick.ts` とは別物**。あちらは**ストック（`Item`）から「今日これから
//   行けるもの」**を選んで**帯**へ流す（時間帯の表を見る）。こちらは
//   **まだ読んでいない提案（`BriefCard`）から「好みそうなもの」**を選んで**山**へ落とす。
//   ★**時間帯は見ない**（ユーザー確定「時間とか関係なく」）。

/** 山へ落とす枚数（ユーザー指定「3件ほど」）。★目盛りの外（画面の詰まり具合）。 */
export const OFFER_PICKS = 3;

/**
 * ★★同じドメインは何枚まで混ぜてよいか。
 * ★★★**入れないと「展覧会が3枚」になる** ―― 採点は好みに寄るので、好きな
 *   ドメインが上位を独占する。山は**その日の入口**なので、**幅**があるほうが良い。
 */
const PER_DOMAIN = 2;

/** 採点の重み。★大きいほど強い理由。**目盛りの外（おすすめの設計）**。 */
const W_WISH = 3.0;      // その願いに応えたカード
const W_GOAL = 2.0;      // そのゴールのためのカード
const W_INTEREST = 2.0;  // 好みの語に当たった（当たり具合を 0〜1 にして掛ける）
const W_HISTORY = 1.0;   // そのドメインを過去に KEEP した率（全体との差）
const W_FRESH = 0.6;     // いちばん新しい号

/** その号が「いちばん新しい号」か（キーは "YYYY-MM-DD" で文字列比較できる）。 */
const newestEdition = (state: AppState): string =>
  Object.keys(state.generatedDecks ?? {}).sort().at(-1) ?? "";

/**
 * ★★**ドメインごとの「KEEP した率 − 全体の率」**（-1〜1）。
 * ★決定は号をまたいで `briefs[*].decisions` に散っているので、カードの側から引く。
 * ★★**判断の材料が少ないうちは 0 に寄せる**（`+ PRIOR` の平滑化）。3枚しか
 *   決めていない日に「このドメインが好き」と断定しない。
 */
const PRIOR = 4;
function domainBias(state: AppState): Record<ItemDomain, number> {
  const dec = new Map<string, "keep" | "skip">();
  for (const b of Object.values(state.briefs ?? {})) {
    for (const [id, d] of Object.entries(b?.decisions ?? {})) {
      if (d === "keep" || d === "skip") dec.set(id, d);
    }
  }
  const keep: Record<string, number> = {}; const all: Record<string, number> = {};
  let keepAll = 0; let n = 0;
  for (const deck of Object.values(state.generatedDecks ?? {})) {
    for (const c of deck) {
      if ("type" in c && c.type) continue;
      const d = dec.get(String(c.id));
      if (!d) continue;
      const dom = KIND_DOMAIN[c.kind ?? "place"] ?? "info";
      all[dom] = (all[dom] ?? 0) + 1;
      if (d === "keep") { keep[dom] = (keep[dom] ?? 0) + 1; keepAll += 1; }
      n += 1;
    }
  }
  const base = n ? keepAll / n : 0;
  const out = {} as Record<ItemDomain, number>;
  for (const dom of ["place", "experience", "info", "thing"] as ItemDomain[]) {
    const a = all[dom] ?? 0;
    // ★★平滑化 … 件数が少ないうちは全体の率（＝差 0）へ引き戻す。
    out[dom] = a ? ((keep[dom] ?? 0) + base * PRIOR) / (a + PRIOR) - base : 0;
  }
  return out;
}

/** そのカードの字面ぜんぶ（好みの語を探す先）。 */
const textOf = (c: BriefCard): string =>
  [c.title, c.body, c.detail, c.categoryJp, c.category, c.trigger, c.area,
    ...(c.meta ?? [])].filter(Boolean).join(" ").toLowerCase();

/**
 * ★★**好みへの当たり具合（0〜1）**。`profile.interests` の語が字面に含まれたら、
 * その `weight` を足して**いちばん重い1語で割る**（＝「一番好きな語に当たったら 1」）。
 * ★★**語が空・1文字のものは飛ばす**（「本」のような語が何にでも当たる）。
 */
function interestHit(c: BriefCard, state: AppState): number {
  const list = (state.profile?.interests ?? []).filter((i) => (i.label ?? "").trim().length >= 2);
  if (!list.length) return 0;
  const text = textOf(c);
  const top = Math.max(...list.map((i) => i.weight || 1));
  let sum = 0;
  for (const i of list) if (text.includes(i.label.toLowerCase())) sum += i.weight || 1;
  return Math.min(1, sum / Math.max(1, top));
}

export interface OfferPick { ed: string; card: BriefCard; score: number; why: string }

/**
 * ★★★**まだ読んでいない提案から「好みそうな」ものを選ぶ**。
 * ★戻り値は**号のキーごと**（KEEP するとき `ed` が要る ―― `lib/keepCard.ts`）。
 * ★`why` は採点の根拠（開発用。画面には出さない）。
 */
export function pickOffers(state: AppState, n = OFFER_PICKS): OfferPick[] {
  const bias = domainBias(state);
  const newest = newestEdition(state);
  const wishes = new Set((state.wishes ?? []).filter((w) => w.status === "stock").map((w) => w.id));
  const goals = new Set((state.goals ?? []).map((g) => g.id));

  const scored = unreadEntries(state).map(({ ed, card }) => {
    const dom = KIND_DOMAIN[card.kind ?? "place"] ?? "info";
    const why: string[] = [];
    let s = 0;
    if (card.sourceWishId && wishes.has(card.sourceWishId)) { s += W_WISH; why.push("願い"); }
    if (card.goalId && goals.has(card.goalId)) { s += W_GOAL; why.push("ゴール"); }
    const hit = interestHit(card, state);
    if (hit > 0) { s += W_INTEREST * hit; why.push(`好み${hit.toFixed(2)}`); }
    const b = bias[dom] ?? 0;
    if (b !== 0) { s += W_HISTORY * b; why.push(`履歴${b >= 0 ? "+" : ""}${b.toFixed(2)}`); }
    if (ed === newest) { s += W_FRESH; why.push("新着"); }
    return { ed, card, score: s, why: why.join("/") || "—", dom };
  });

  // ★★**同点は「新しい号が先」**（`unreadEntries` が新しい順に返すので、
  //   安定ソートのまま並びを保てばよい）。
  scored.sort((a, b) => b.score - a.score);

  const out: OfferPick[] = [];
  const used: Record<string, number> = {};
  for (const x of scored) {
    if (out.length >= n) break;
    if ((used[x.dom] ?? 0) >= PER_DOMAIN) continue;   // ★幅を作る
    used[x.dom] = (used[x.dom] ?? 0) + 1;
    out.push({ ed: x.ed, card: x.card, score: x.score, why: x.why });
  }
  // ★★**幅の門で足りなくなったら、順位のまま埋める**（3枚に満たないより出すほうがよい）。
  for (const x of scored) {
    if (out.length >= n) break;
    if (out.some((o) => o.card.id === x.card.id)) continue;
    out.push({ ed: x.ed, card: x.card, score: x.score, why: x.why });
  }
  return out;
}
