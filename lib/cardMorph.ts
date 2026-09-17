import { cardShapePoints, type CardShape, type Pt } from "./cardShape";

// ★★★**札の形 → 角丸四角への変形はここ1つ**（2026-09-18・第120巡にユーザー指定）。
//
// > 「**写真部分をタップすると、マスクの枠だけが回りながらアニメーションし、画像の
// > 表示領域が大きくなっていきます。広がるのですが最終的に、画像の周りに色のついた
// > ベゼルが残るようにし、画面的には画面全体そのジャンルのベタ塗りに、角丸の四角で
// > マスクされた写真が画面上半分より大きいくらいに大きく表示され、下に詳細文**」
//
// ★★★**作法は `lib/solid.ts` の `waist` と同じ** ―― **点の数を変えずに半径を
//   lerp する**ので、途中で再標本化が要らず、どのフレームでも閉じた多角形になる。
//   ★★そのために**両端を「中心から等角に測った半径の列」へ直す**（`raysOf`）。
//     札の4つの形も角丸四角も**中心から見て半径が1つに決まる**（星形領域）ので、
//     この直し方で情報が落ちない。
//
// ★★★**回るのは「測る向き」**（`spin`）。写真そのものには触らない ―― ユーザーの
//   言葉どおり「**枠だけが回りながら**」。
// ★★★**半回転（180°）で着地する**。札の4つの形も角丸四角も**点対称**なので、
//   180° 回しても**始めと終わりの見た目は揃う**。360° は回しすぎ、90° だと
//   最後に四角が傾いたまま止まる。
//
// ★★★**CSS の `clip-path` の補間に頼らない** ―― `path()` どうしの補間は
//   コマンド列が一致したときだけで、実機の WebKit で効くかは版に依る。
//   **毎フレーム `d` を書く**ほうが、どの端末でも同じ絵になる。
// ★★**`clipPathUnits` は `userSpaceOnUse`** ―― `objectBoundingBox` は器の比へ
//   引き伸ばすので、**角丸の丸が楕円になる**（`lib/cardShape.ts` の頭と同じ罠）。

/** ★等角に測り直す光線の本数。★**偶数**（左右の対称性を式に保証させる）。★目盛りの外（絵の刻み）。 */
const RAYS = 144;
/** ★角丸の弧を何本の直線で描くか。★目盛りの外（絵の刻み）。 */
const ARC_SEG = 14;
/** ★半回転で着地する（上の注釈）。★目盛りの外（手つき）。 */
export const MORPH_TURN = Math.PI;

/**
 * 中心が原点の多角形を「等角 `RAYS` 方向の半径」へ。
 * ★★**星形領域だけに使える**（中心から見て縁が1点に決まる形）。札の4つの形も
 *   角丸四角もそうである ―― そうでない形を足すときは、ここで破綻する。
 */
function raysOf(pts: readonly Pt[]): number[] {
  const out = new Array<number>(RAYS).fill(0);
  // ★★★**いちばん遠い頂点より外は採らない**（第120巡）―― 光線とほぼ平行な辺は、
  //   `u` が 0〜1 に入ったまま **`t` だけが桁違いに大きく**なることがある
  //   （分母が 0 に近い）。1本でも外れると、**その向きにだけ棘が飛び出す**。
  let far = 0;
  for (const [x, y] of pts) far = Math.max(far, Math.hypot(x, y));
  const lim = far * 1.001;
  for (let k = 0; k < RAYS; k++) {
    const a = (k / RAYS) * Math.PI * 2;
    const dx = Math.cos(a); const dy = Math.sin(a);
    let hit = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      const ex = x2 - x1; const ey = y2 - y1;
      // 原点からの光線 `t·d`（t ≥ 0）と 線分 `p1 + u·e`（0 ≤ u ≤ 1）の交点。
      const det = ex * dy - ey * dx;
      if (Math.abs(det) < 1e-9) continue;          // 平行
      // ★★★**`u` の両端には遊びを持たせる**（第120巡）―― 形の点は**等角に**
      //   作られていて（`unionOfCircles`）、288 点は 96 本の光線で割り切れるので、
      //   **3本に1本は頂点をちょうど通る**。素の `u > 1` だと 1.0000000002 が
      //   落ちて**その向きだけ半径 0**になり、**谷のような切れ込みが1本走る**
      //   （実測 … 波打つ四角で 96 本中 2 本が 0 になった）。
      const u = (dx * y1 - dy * x1) / det;
      if (u < -1e-9 || u > 1 + 1e-9) continue;
      const t = (ex * y1 - ey * x1) / det;
      if (t > hit && t <= lim) hit = t;
    }
    out[k] = hit;
  }
  return out;
}

/** 中心が原点の角丸四角を点の列へ。★弧は `ARC_SEG` 本の直線に割る。 */
function roundRectPoints(w: number, h: number, r: number): Pt[] {
  const hw = w / 2; const hh = h / 2;
  const rr = Math.max(0, Math.min(r, hw, hh));
  const out: Pt[] = [];
  // 右下 → 左下 → 左上 → 右上（角の中心と、そこから伸びる四分円）。
  const corners: [number, number, number][] = [
    [hw - rr, hh - rr, 0], [-(hw - rr), hh - rr, Math.PI / 2],
    [-(hw - rr), -(hh - rr), Math.PI], [hw - rr, -(hh - rr), -Math.PI / 2],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= ARC_SEG; k++) {
      const a = a0 + (k / ARC_SEG) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  }
  return out;
}

/** 出発点 … 押した写真の**正方形**（画面の座標）。 */
export interface MorphFrom { cx: number; cy: number; size: number }
/** 行き先 … 角丸四角（画面の座標）。 */
export interface MorphTo { cx: number; cy: number; w: number; h: number; r: number }

/**
 * ★★★**両端を測っておいて、毎フレームは lerp だけ**。
 * `p` は**すでに曲線を通した進み**（0＝札の形／1＝角丸四角）。
 * 返すのは SVG の `d`（`clipPathUnits="userSpaceOnUse"`）。
 */
export function cardMorph(shape: CardShape, from: MorphFrom, to: MorphTo): (p: number) => string {
  const src = cardShapePoints(shape).map(
    ([x, y]) => [(x - 0.5) * from.size, (y - 0.5) * from.size] as Pt);
  const a = raysOf(src);
  const b = raysOf(roundRectPoints(to.w, to.h, to.r));
  return (p: number) => {
    const q = Math.max(0, Math.min(1, p));
    const cx = from.cx + (to.cx - from.cx) * q;
    const cy = from.cy + (to.cy - from.cy) * q;
    // ★★**回るのは測る向き**（写真には触らない）。★半回転で着地する。
    const spin = MORPH_TURN * q;
    let d = "";
    for (let k = 0; k < RAYS; k++) {
      const ang = (k / RAYS) * Math.PI * 2;
      const r = a[k] + (b[k] - a[k]) * q;
      const x = cx + Math.cos(ang + spin) * r;
      const y = cy + Math.sin(ang + spin) * r;
      d += `${k === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return `${d}Z`;
  };
}
