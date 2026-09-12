import { PUNCH_BY_DOMAIN, type PunchShape } from "./ticket";
import type { ItemDomain } from "./types";

// ★★★**札の外形（写真を切り抜く形）はここ1つ**（2026-09-13・第94巡）。
//
// ★★★**形の約束はアプリ全体で1つ。** `lib/ticket.ts` が既に
// 「4ドメイン ↔ 4つの形」を持っていて、そこにこう書いてある ――
//   > ★この形は3か所で同じ意味を持つ: 1. 券の縁の切り欠き 2. マップ上のノードの形
//   > 3. ストックの絞り込みアイコン。**どれか1つだけ形を変えると、文字を使わない
//   > 分類の約束が壊れる。**
// **札の外形はその4か所目**（2026-09-13 ユーザー確定「既存の性格を引き継ぐ」）。
// ★★★だから**割り当てを手で書かない。`PUNCH_BY_DOMAIN` から導く。**
//   そうすれば、片方だけ直すことが原理的にできない。
//
// | ドメイン | 鋏痕の性格 | 札の外形 |
// |---|---|---|
// | バショ place | 弧（arch） | **ドーム** … 上辺が大きな弧、下は角丸 |
// | タイケン experience | 斜め（trapezoid） | **台形** … 斜め2本＋平らな上下 |
// | ジョウホウ info | 直角（square） | **波打つ角丸四角** … 基本は四角、縁だけ揺れる |
// | モノ thing | 切れ込み（fork） | **四つ葉** … ローブ4つのあいだに切れ込み |
//
// ★★**マスクは1枚だけ**（`maskComposite` を使わない）。`scallopMask`
//   （`components/explore/samples/TicketParts.tsx`）は層を6枚掛け合わせるので
//   「小さな箱に `no-repeat` で置くと要素が丸ごと消える」罠があるが、
//   **1枚なら合成が無いので罠も無い**。使えない環境では素の矩形へ戻る。
// ★★★**マスクは写真だけに掛ける。札そのものには掛けない** ―― 掛けると
//   `box-shadow` が出なくなる（`design.md` §3-c。第78〜80巡に3巡気づかなかった）。

export type CardShape = "dome" | "wedge" | "wave" | "clover";

/** ★★★**手で書かない表**。券の鋏痕の性格と1対1で対応させる。 */
const SHAPE_BY_PUNCH: Record<PunchShape, CardShape> = {
  arch: "dome",
  trapezoid: "wedge",
  square: "wave",
  fork: "clover",
};

export const cardShapeOf = (domain: ItemDomain): CardShape =>
  SHAPE_BY_PUNCH[PUNCH_BY_DOMAIN[domain]];

// ── 輪郭 ────────────────────────────────────────────────────
// ★ここから下はすべて **0〜100 の器の中の座標**（★目盛りの外＝図形の座標系）。
//   `preserveAspectRatio='none'` で器の比に合わせて伸びる（参照デザインと同じ）。

/** 下の角の丸み。 */
const FOOT = 10;
/** 台形の肩の寄り（上辺が左右からどれだけ入るか）。 */
const WEDGE_IN = 19;
/**
 * 波打つ四角 … 四角らしさ（大きいほど角が立つ）と、縁の揺れの深さ・数。
 * ★★`WAVE_N` は **7**（第94巡）―― 4.2 では角が丸くて**四つ葉と見分けにくかった**。
 *   券の `square` は「**直角**」の性格なので、角は立てて**縁だけを揺らす**。
 */
const WAVE_N = 7;
const WAVE_AMP = 0.075;
const WAVE_LOBES = 8;
/**
 * 四つ葉 … 切れ込みの深さ。★★**0.3 では深すぎた**（第94巡に実測）――
 * 半径が 0.4〜1.0 に振れて**十字**になり、伸ばした器の中で字面がはみ出した。
 * 0.14 は 0.72〜1.00 で、**角に葉・辺の真ん中に切れ込み**が読める最小の深さ。
 */
const CLOVER_AMP = 0.14;
/** 極座標で作る形の分割数（多いほど滑らか。データURIの長さと引き換え）。 */
const STEPS = 144;

/** 極座標の形を閉じた多角形のパスへ。`rad(θ)` は 0〜1 の半径。 */
function polar(rad: (t: number) => number): string {
  const pts: string[] = [];
  for (let i = 0; i < STEPS; i++) {
    const t = (i / STEPS) * Math.PI * 2 - Math.PI / 2;
    const r = rad(t) * 50;
    pts.push(`${(50 + Math.cos(t) * r).toFixed(2)} ${(50 + Math.sin(t) * r).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

/** 超楕円（|x|^n + |y|^n = 1）の半径。n が大きいほど四角に近い。 */
const superR = (t: number, n: number): number =>
  1 / (Math.abs(Math.cos(t)) ** n + Math.abs(Math.sin(t)) ** n) ** (1 / n);

function outline(shape: CardShape): string {
  switch (shape) {
    // 弧 … 上辺が大きな弧。下は平らで角だけ丸い（券の `arch` と同じ性格）。
    case "dome":
      return `M0 100V50A50 50 0 0 1 100 50V${100 - FOOT}`
        + `Q100 100 ${100 - FOOT} 100H${FOOT}Q0 100 0 ${100 - FOOT}Z`;
    // 斜め … 上辺が狭く下辺が広い。斜め2本＋平らな上下（券の `trapezoid`）。
    case "wedge":
      return `M${WEDGE_IN + FOOT / 2} 0H${100 - WEDGE_IN - FOOT / 2}`
        + `Q${100 - WEDGE_IN} 0 ${100 - WEDGE_IN + 1} ${FOOT / 2}`
        + `L${100 - FOOT / 2} ${100 - FOOT}Q100 100 ${100 - FOOT} 100`
        + `H${FOOT}Q0 100 ${FOOT / 2} ${100 - FOOT}`
        + `L${WEDGE_IN - 1} ${FOOT / 2}Q${WEDGE_IN} 0 ${WEDGE_IN + FOOT / 2} 0Z`;
    // 直角 … 基本は四角（超楕円）で、縁だけが揺れる（券の `square`）。
    case "wave":
      return polar((t) => superR(t, WAVE_N) * (1 + WAVE_AMP * Math.cos(WAVE_LOBES * t)));
    // 切れ込み … 角に葉4つ、辺の真ん中に切れ込み4つ（券の `fork`）。
    // ★★`-cos(4θ)` にして**山を斜め（角）へ**置く ―― `+cos` だと山が辺の
    //   真ん中に来て**十字**になり、札の中に字面が収まらなかった（第94巡）。
    case "clover":
    default:
      return polar((t) => 1 - CLOVER_AMP - CLOVER_AMP * Math.cos(4 * t));
  }
}

/** SVG を CSS の `url()` へ。★`#` は `%23`、引用符は `'` にして囲みを壊さない。 */
const toUri = (path: string): string => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' `
    + `preserveAspectRatio='none'><path d='${path}' fill='%23000'/></svg>`;   /* ★目盛りの外（マスクの #000 は「色」でなく「不透明」） */
  return `url("data:image/svg+xml,${svg.replace(/</g, "%3C").replace(/>/g, "%3E")}")`;
};

const cache = new Map<CardShape, React.CSSProperties>();

/**
 * ★★その形で切り抜くスタイル。**写真の器に当てる**（札には当てない）。
 * ★`maskImage` と `WebkitMaskImage` は**必ず対で**書く（`TimeRange` と同じ作法）。
 */
export function cardShapeMask(shape: CardShape): React.CSSProperties {
  const hit = cache.get(shape);
  if (hit) return hit;
  const image = toUri(outline(shape));
  const made: React.CSSProperties = {
    maskImage: image, WebkitMaskImage: image,
    maskSize: "100% 100%", WebkitMaskSize: "100% 100%",
    maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
    maskPosition: "center", WebkitMaskPosition: "center",
  } as React.CSSProperties;
  cache.set(shape, made);
  return made;
}
