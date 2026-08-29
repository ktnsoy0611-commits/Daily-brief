// 改札鋏の**パスの語彙**。★手書き（生成物ではない）。
//   トレースの生の出力（`lib/nipperShapeRaw.ts`）と、それを整理したもの
//   （`lib/nipperShape.ts`）の**両方**がここの型と道具を使う。

/** 平面の点。★この表は**描き方から独立している**ので、ここで持つ。 */
export interface P2 { x: number; y: number }

/**
 * 辺。`r` があれば**円弧**（`c` は中心）、無ければ**直線**。
 * ★★20巡目に、なぞった点の羅列をやめて**直線と円弧の並び**にした。
 * ★`inner` は**段の境目**の印。そこは面取りしない ―― 面取りを回すと段差が
 *   坂に見える。印が**辺ごと**なのは、1本の辺がまるごと外の輪郭かまるごと境目の
 *   どちらかだから。
 */
export interface NipperEdge { to: P2; r?: number; c?: P2; ccw?: boolean; inner?: boolean }

/**
 * ★★**押し出す単位**。`tier` は 0=厚 / 1=薄。
 * **実際の厚みは `lib/nipperRig.ts` が決める**（ここは「どこがどの段か」だけ）。
 * ★右の部品は一定の厚みなので1枚。左は厚みの塗り分けで2枚に割れる。
 */
export interface NipperPiece { tier: 0 | 1; start: P2; edges: NipperEdge[] }

/** 直線の辺。 */
export const L = (x: number, y: number, inner?: 1): NipperEdge =>
  ({ to: { x, y }, inner: inner === 1 });

/** 円弧の辺。`ccw` は回る向き（1=反時計回り）。 */
export const A = (
  x: number, y: number, r: number, cx: number, cy: number, ccw: 0 | 1, inner?: 1,
): NipperEdge => ({ to: { x, y }, r, c: { x: cx, y: cy }, ccw: ccw === 1, inner: inner === 1 });

/** 片ひとつ。 */
export const piece = (
  tier: 0 | 1, sx: number, sy: number, edges: NipperEdge[],
): NipperPiece => ({ tier, start: { x: sx, y: sy }, edges });
