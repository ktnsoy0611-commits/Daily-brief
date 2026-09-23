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

/**
 * 山へ落とす枚数。★目盛りの外（画面の詰まり具合）。
 * ★★★**第128巡に 3 → 2**（ユーザー指定「**提案の図形は最大2個に減らし、一つあたりの
 *   大きさを1.5倍くらいに**」）。★**山の提案は「今日へ割り当てた提案」と合わせて
 *   2枚まで** ―― 割り当てたぶんだけ、おすすめを減らす（`HomeTab.picks`）。
 */
export const OFFER_PICKS = 2;

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

/**
 * ★**ドメインを人の言葉で**（帯の文章が使う）。カタカナの符丁（バショ／タイケン…）は
 * **図と色の語彙**なので、文の中には置かない。★文面にはしない（帯の文章は第130巡に削除）。
 */
const DOMAIN_JP: Record<ItemDomain, string> = {
  place: "場所", experience: "体験", info: "読みもの", thing: "もの",
};

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
function interestHit(c: BriefCard, state: AppState): { hit: number; word: string } {
  const list = (state.profile?.interests ?? []).filter((i) => (i.label ?? "").trim().length >= 2);
  if (!list.length) return { hit: 0, word: "" };
  const text = textOf(c);
  const top = Math.max(...list.map((i) => i.weight || 1));
  let sum = 0;
  // ★★**当たった中でいちばん重い語**を控える（帯の文章がそれを名指す）。
  let word = ""; let best = -1;
  for (const i of list) {
    if (!text.includes(i.label.toLowerCase())) continue;
    const wgt = i.weight || 1;
    sum += wgt;
    if (wgt > best) { best = wgt; word = i.label; }
  }
  return { hit: Math.min(1, sum / Math.max(1, top)), word };
}

/**
 * ★★★**人に見せる「選んだ理由」**（2026-09-18・第121巡にユーザー指定
 * 「**おすすめの理由**を帯の文章で流す」）。
 * ★★**いちばん効いた1つだけ**を返す ―― 全部並べると言い訳に見える。
 * ★`word` はその理由の主語（願いの題／ゴールの題／好みの語／ドメインの名）。
 * ★★**文面はもう作らない**（帯の文章＝`lib/bandNotes.ts` は第130巡に削除。`reason` は採点の根拠としてだけ残る）―― 理由と言葉づかいを
 *   別の場所に置いておくと、片方だけ直す事故が起きない。
 */
export type OfferReasonKind = "wish" | "goal" | "interest" | "history" | "fresh";
export interface OfferReason { kind: OfferReasonKind; word: string }

export interface OfferPick {
  ed: string; card: BriefCard; score: number; why: string;
  /** ★人に見せる理由（いちばん効いた1つ）。無いこともある。 */
  reason?: OfferReason;
}

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

  // ★★★**写真のあるカードだけ**（2026-09-19・第124巡にユーザー指定
  //   「**ホームに落ちてくる提案は画像があるもの限定にしてください**」）。
  //   ★★山の提案は**写真を切り抜いた絵**なので、写真が無いと**色ベタの形**に
  //     なる ―― そこだけ別のデザインを用意するより、**出さないほうが強い**。
  //   ★★**Explore のデッキには今までどおり全部出る**（あちらは版面が別）。
  const scored = unreadEntries(state)
    .filter(({ card }) => !!card.images?.[0])
    .map(({ ed, card }) => {
    const dom = KIND_DOMAIN[card.kind ?? "place"] ?? "info";
    const why: string[] = [];
    let s = 0;
    // ★★**理由は「足した点がいちばん大きかったもの」1つ**（上の `OfferReason`）。
    let top = 0; let reason: OfferReason | undefined;
    const add = (pt: number, kind: OfferReasonKind, word: string) => {
      s += pt;
      if (pt > top) { top = pt; reason = { kind, word }; }
    };
    if (card.sourceWishId && wishes.has(card.sourceWishId)) {
      const w = (state.wishes ?? []).find((q) => q.id === card.sourceWishId);
      add(W_WISH, "wish", w?.title ?? "");
      why.push("願い");
    }
    if (card.goalId && goals.has(card.goalId)) {
      const g = (state.goals ?? []).find((q) => q.id === card.goalId);
      add(W_GOAL, "goal", g?.title ?? "");
      why.push("ゴール");
    }
    const { hit, word } = interestHit(card, state);
    if (hit > 0) { add(W_INTEREST * hit, "interest", word); why.push(`好み${hit.toFixed(2)}`); }
    const b = bias[dom] ?? 0;
    if (b !== 0) {
      // ★★**「よく残している」だけを理由にする**（減点は人に言わない）。
      if (b > 0) add(W_HISTORY * b, "history", DOMAIN_JP[dom]); else s += W_HISTORY * b;
      why.push(`履歴${b >= 0 ? "+" : ""}${b.toFixed(2)}`);
    }
    if (ed === newest) { add(W_FRESH, "fresh", ""); why.push("新着"); }
    return { ed, card, score: s, why: why.join("/") || "—", dom, reason };
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
    out.push({ ed: x.ed, card: x.card, score: x.score, why: x.why, reason: x.reason });
  }
  // ★★**幅の門で足りなくなったら、順位のまま埋める**（3枚に満たないより出すほうがよい）。
  for (const x of scored) {
    if (out.length >= n) break;
    if (out.some((o) => o.card.id === x.card.id)) continue;
    out.push({ ed: x.ed, card: x.card, score: x.score, why: x.why, reason: x.reason });
  }
  return out;
}
