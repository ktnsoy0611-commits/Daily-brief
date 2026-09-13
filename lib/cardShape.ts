import { PUNCH_BY_DOMAIN, type PunchShape } from "./ticket";
import type { ItemDomain } from "./types";

// ★★★**札の外形（写真を切り抜く形）はここ1つ**（2026-09-13・第94〜95巡）。
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
// ★★★**形は参照画像（Google Labs）に在るものだけを使う**（第95巡にユーザー指摘
//   「形が写真（＝参照）と違うものばかり」）。第94巡の**ドームと台形は参照に
//   1枚も無かった**ので捨てた。参照の語彙は「波打つ四角・六角形・四つ葉・
//   トゲトゲ・角丸四角・いびつな塊」。
//
// | ドメイン | 鋏痕の性格 | 札の外形 | 参照のどれ |
// |---|---|---|---|
// | バショ place | 弧（arch） | **四つ葉** … 輪郭が全部円弧 | GenChess / Say What You See |
// | タイケン experience | 斜め（trapezoid） | **六角形** … 直線の斜め4本 | Illuminate / GenType |
// | ジョウホウ info | 直角（square） | **波打つ四角** … 角は立ち縁だけ揺れる | Gen AI in Chrome |
// | モノ thing | 切れ込み（fork） | **トゲトゲ** … 尖りのあいだに切れ込み | MusicFX |
//
// ★★**トゲトゲはホームの山の EXPLORE のバッジ**（`zigVerts`。`ZIG_N`＝12）と
//   同じ性格を借りている。どちらも EXPLORE なので、語彙は割れない。
//
// ─────────────────────────────────────────────────────────────
// ★★★**CSS のマスクをやめ、SVG の `clipPath` で切る**（2026-09-13・第95巡）。
//
// ★★★**なぜ替えたか。** 実機（iOS）で写真が**指定した形とはまったく違う形**に
//   切り抜かれた（ユーザー報告 ＋ スクリーンショット）。実測すると、切り抜かれた
//   領域は**器の高さと同じ辺の正方形**で、器の幅（914 デバイス画素）より
//   **254px 狭かった** ―― つまり **`mask-size: 100% 100%` が効かず、SVG が
//   固有の 1:1 の比のまま置かれていた**。
//   ★★プロパティの書き漏らしではない（`maskImage`/`maskSize`/`maskRepeat`/
//     `maskPosition` を `Webkit` 付きと**対で8本**書いてあった）。
//   ★★Chromium でも、Playwright の WebKit でも**再現しない**。実機の WebKit
//     だけが違う ―― だから「Chromium で直るまで調整する」では永久に直らない。
//
// ★★★**`clipPathUnits="objectBoundingBox"` なら画像としての寸法計算が無い。**
//   パスを 0〜1 の器で書くと、**器の比へそのまま伸びる**（`preserveAspectRatio`
//   も、データURIの解析も、マスクの合成も、**全部いなくなる**）。
// ★★**`clipPath` と `WebkitClipPath` は必ず対で書く**（`TimeRange` と同じ作法）。
//   効かない環境では**ひとりでに素の矩形へ戻る**（マスクと同じ振る舞い）。
// ★★★**切るのは写真だけ。札そのものには掛けない** ―― 掛けると `box-shadow` が
//   出なくなる（`design.md` §3-c。第78〜80巡に3巡気づかなかった）。

export type CardShape = "clover" | "hexagon" | "wave" | "starburst";

/** ★★★**手で書かない表**。券の鋏痕の性格と1対1で対応させる。 */
const SHAPE_BY_PUNCH: Record<PunchShape, CardShape> = {
  arch: "clover",
  trapezoid: "hexagon",
  square: "wave",
  fork: "starburst",
};

export const CARD_SHAPES: CardShape[] = ["clover", "hexagon", "wave", "starburst"];

export const cardShapeOf = (domain: ItemDomain): CardShape =>
  SHAPE_BY_PUNCH[PUNCH_BY_DOMAIN[domain]];

// ── 輪郭 ────────────────────────────────────────────────────
// ★ここから下はすべて **0〜1 の器の中の座標**（★目盛りの外＝図形の座標系）。
//   `clipPathUnits="objectBoundingBox"` なので、器の比に合わせて縦横へ伸びる。

/** 四つ葉 … 切れ込みの深さ。★0.3 では十字になって字面がはみ出た（第94巡に実測）。 */
const CLOVER_AMP = 0.14;
/** 波打つ四角 … 四角らしさ（大きいほど角が立つ）と、縁の揺れの深さ・数。 */
const WAVE_N = 7;
const WAVE_AMP = 0.075;
const WAVE_LOBES = 8;
/** 六角形 … 上辺・下辺が左右からどれだけ入るか（0.5 で菱形）。 */
const HEX_IN = 0.22;
/** 六角形の角の丸み（0〜1 の器での半径）。 */
const HEX_R = 0.07;
/** トゲトゲ … 尖りの数と、谷の深さ（外の半径に対する割合）。 */
const STAR_N = 12;
const STAR_IN = 0.82;
/** 極座標で作る形の分割数（多いほど滑らか。パスの長さと引き換え）。 */
const STEPS = 144;
/** 角の丸みを何本の直線に割るか（`Q` を平らにする）。 */
const ROUND_SEG = 6;

/** 0〜1 の器の中の点。 */
export type Pt = [number, number];

/** 極座標の形を点の列へ。`rad(θ)` は 0〜1 の半径（1 で器いっぱい）。 */
function polar(rad: (t: number) => number, steps = STEPS): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const r = rad(t) * 0.5;
    pts.push([0.5 + Math.cos(t) * r, 0.5 + Math.sin(t) * r]);
  }
  return pts;
}

/** 超楕円（|x|^n + |y|^n = 1）の半径。n が大きいほど四角に近い。 */
const superR = (t: number, n: number): number =>
  1 / (Math.abs(Math.cos(t)) ** n + Math.abs(Math.sin(t)) ** n) ** (1 / n);

/**
 * 角を丸めた多角形を**点の列**へ。★角は二次ベジェを `ROUND_SEG` に割って平らにする
 * （`A` も `Q` も `objectBoundingBox` では器の比で歪むし、canvas と分かれる）。
 */
function roundedPoly(corners: readonly Pt[], r: number): Pt[] {
  const n = corners.length;
  const out: Pt[] = [];
  const at = (i: number) => corners[(i + n) % n];
  const to = (a: Pt, b: Pt, d: number): Pt => {
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(d, len / 2) / len;
    return [a[0] + dx * k, a[1] + dy * k];
  };
  for (let i = 0; i < n; i++) {
    const c = at(i);
    const s0 = to(c, at(i - 1), r);
    const s1 = to(c, at(i + 1), r);
    out.push(s0);
    for (let k = 1; k <= ROUND_SEG; k++) {
      const u = k / ROUND_SEG; const v = 1 - u;
      out.push([
        v * v * s0[0] + 2 * v * u * c[0] + u * u * s1[0],
        v * v * s0[1] + 2 * v * u * c[1] + u * u * s1[1],
      ]);
    }
  }
  return out;
}

/**
 * ★★★**形の正はこの点の列**（2026-09-13・第96巡）。
 * SVG のパス（札の `clip-path`）も canvas の輪郭（ホームの山）も**ここから導く**。
 * ★前は SVG の文字列しか返さなかったので、canvas から使えなかった。
 * **形を2度書かない**という約束を、技術をまたいでも守るための作り替え。
 */
export function cardShapePoints(shape: CardShape): Pt[] {
  switch (shape) {
    // 弧 … 角に葉4つ、辺の真ん中に切れ込み4つ。輪郭が**全部円弧**（券の `arch`）。
    // ★★`-cos(4θ)` で山を**斜め（角）**へ置く。`+cos` だと十字になる（第94巡）。
    case "clover":
      return polar((t) => 1 - CLOVER_AMP - CLOVER_AMP * Math.cos(4 * t));
    // 斜め … 左右が尖り上下が平ら。**直線の斜め4本**が鋏痕の性格（券の `trapezoid`）。
    case "hexagon":
      return roundedPoly([
        [0, 0.5], [HEX_IN, 0], [1 - HEX_IN, 0],
        [1, 0.5], [1 - HEX_IN, 1], [HEX_IN, 1],
      ], HEX_R);
    // 直角 … 基本は四角（超楕円）で、縁だけが揺れる（券の `square`）。
    case "wave":
      return polar((t) => superR(t, WAVE_N) * (1 + WAVE_AMP * Math.cos(WAVE_LOBES * t)));
    // 切れ込み … 尖りのあいだに切れ込み（券の `fork`）。★谷を深くしすぎない
    //   ―― 第94巡に四つ葉で踏んだ（字面が形からはみ出す）。
    case "starburst":
    default: {
      // ★尖りと谷を1つおきに置く。**極座標の関数では書けない**（同じ角度に
      //   2つの半径が要るのではなく、頂点の並びそのものが交互だから）。
      const pts: Pt[] = [];
      for (let i = 0; i < STAR_N * 2; i++) {
        const t = (i / (STAR_N * 2)) * Math.PI * 2 - Math.PI / 2;
        const r = (i % 2 === 0 ? 1 : STAR_IN) * 0.5;
        pts.push([0.5 + Math.cos(t) * r, 0.5 + Math.sin(t) * r]);
      }
      return pts;
    }
  }
}

/** 0〜1 の器の中の SVG のパス。★`clipPathUnits="objectBoundingBox"` がそのまま読む。 */
export function cardShapePath(shape: CardShape): string {
  const pts = cardShapePoints(shape);
  return `M${pts.map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join("L")}Z`;
}

/**
 * ★canvas に**中心が原点・外接箱が `size` 四方**の輪郭を引く（塗りも線も呼ぶ側）。
 * ★★**必ず正方形で渡すこと** ―― 横長の箱に入れると、札で潰れていたのと
 *   同じことが山でも起きる（山の提案は半径で作るので最初から正方形）。
 */
export function traceCardShape(
  ctx: CanvasRenderingContext2D, shape: CardShape, size: number,
): void {
  const pts = cardShapePoints(shape);
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const px = (x - 0.5) * size; const py = (y - 0.5) * size;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

/**
 * ★★その形で切り抜くスタイル。**写真の器に当てる**（札には当てない）。
 * `id` は `CardShapeDefs` が描いた `<clipPath>` の id。
 * ★`clipPath` と `WebkitClipPath` は**必ず対で**書く。
 */
export function cardShapeClip(shape: CardShape, prefix: string): React.CSSProperties {
  const url = `url(#${prefix}-${shape})`;
  return { clipPath: url, WebkitClipPath: url } as React.CSSProperties;
}
