/**
 * ★★★**ハーフトーン（点の格子）の作り方はここ1つ**（2026-09-20・第126巡に
 * ユーザー指定「**帯のピルはハーフトーンで塗る感じにしてください。文字の周りは
 * ハーフトーンがない感じにして**」）。
 *
 * ★★★**同じ格子を2つの技術が描く** ―― 帯のピル（**CSS の背景**）と、
 *   引き下ろしの幽霊（**canvas**。`components/home/pillGhost.ts`）。
 *   **1px でも下へ引いた瞬間に DOM から canvas へ写し取る**ので、
 *   **格子の間隔も点の半径もここから両方が引かないと、その瞬間に絵が変わる。**
 *
 * ★★★**点は「面の色」・地は素のまま** ―― ベタ塗りと違って**地が透けて見える**ので、
 *   参照画像のような**明度差の小さい色でも形が読める**（彩度だけで立つ）。
 *
 * ★★★**文字の周りには点を置かない**（`PILL_KNOCK`）―― 点の上に字を置くと、
 *   小さな和文は**画数と点が同じ太さ**になって潰れる。字の後ろに**地の色の
 *   角丸**を敷いて、そこだけ格子を抜く。
 */

import type { CSSProperties } from "react";
import { SPACE } from "./tokens";

/** 格子の間隔（px）。★目盛りの外（絵の刻み）。 */
export const HT_STEP = 5;
/**
 * 点の半径（px）。★目盛りの外（絵の刻み）。
 * ★★**比ではなく px** ―― 点は「印刷の網点」なので、器の大きさで太らせない。
 * ★★間隔の 27%（`HT_STEP` 5 に対し 1.35）＝ 面積で約 23%。参照画像の
 *   ベタ塗りに対して**同じ色が薄い面として読める**ところ。
 */
export const HT_DOT = 1.35;
/** 点と透明のあいだの「にじみ」（px）。★これが 0 だと画素の縁がギザギザに出る。 */
const HT_FEATHER = 0.6;

/**
 * ★**CSS の背景**（DOM のピル）。`backgroundColor` は呼ぶ側が地の色で敷く。
 * ★★`background-image` は**要素の左上から**敷かれる ―― 帯のピルは流れるので、
 *   格子の位相が画面に対して動く。**それでよい**（点が動くのではなく紙が動く）。
 */
export const halftoneCss = (color: string): CSSProperties => ({
  backgroundImage:
    `radial-gradient(circle at 50% 50%, ${color} ${HT_DOT}px, transparent ${HT_DOT + HT_FEATHER}px)`,
  backgroundSize: `${HT_STEP}px ${HT_STEP}px`,
  backgroundRepeat: "repeat",
});

/**
 * ★★**文字の周りに空ける「地」の余白**（左右）。★`SPACE` から引く。
 * ★★**DOM（`components/home/Band.tsx`）と canvas（`pillGhost`）と
 *   `pillWidth()` の3つが読む** ―― 1つでも読み忘れるとピルの幅が食い違う。
 */
export const PILL_KNOCK = SPACE.sm;

/**
 * ★**canvas**（引き下ろしの幽霊）。呼ぶ側が**先に形で `clip()` しておく**こと。
 * @param x0 y0 w h 点を敷く矩形（呼ぶ側の座標系）
 */
const patCache = new Map<string, CanvasPattern | null>();

export function drawHalftone(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, w: number, h: number,
  color: string, alpha = 1,
): void {
  if (alpha <= 0 || w <= 0 || h <= 0) return;
  // ★★★**点は「1マスの模様」を1度だけ焼いて繰り返す**（`createPattern`）。
  //   ★★**毎フレーム `arc()` を並べないこと** ―― 300×44 のピルで 1フレーム
  //     **530 個**になり、120Hz の実機では引き下ろしの最中ずっと効く。
  //   ★模様は色ごとに憶える（色は7つしかない）。
  let pat = patCache.get(color);
  if (pat === undefined) {
    pat = null;
    const cell = document.createElement("canvas");
    // ★★**整数の箱**（`HT_STEP` は整数）。小数だと繰り返しの継ぎ目がにじむ。
    cell.width = HT_STEP; cell.height = HT_STEP;
    const c = cell.getContext("2d");
    if (c) {
      c.fillStyle = color;
      c.beginPath();
      c.arc(HT_STEP / 2, HT_STEP / 2, HT_DOT, 0, Math.PI * 2);
      c.fill();
      pat = ctx.createPattern(cell, "repeat");
    }
    patCache.set(color, pat);
  }
  if (!pat) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  // ★格子の位相を矩形の左上へ（CSS の `background-image` と同じ起点）。
  ctx.translate(x0, y0);
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
