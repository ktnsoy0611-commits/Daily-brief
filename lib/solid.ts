import type { SideKey } from "./types";

// ★タスクの図形。**純粋関数だけ**。単体テストで検証する。
//
// ★3D は持たない(2026-08-13にユーザー確定)。
// 「どちらのビューでも、アイソメではなく**各立面**を表示する。なのでシステム的に
// 3Dである必要はない」という指定により、投影・陰影・凸包の類はすべて撤去した。
// ★図形は**断面の形**(円 / 半円 / 三角 / 四角)ひとつ。ビューを切り替えても
// 形は変わらず、**載る文字だけ**が変わる(2026-08-16にユーザー確定)。
//
//   ネームビュー … タスクの題が中央に載る
//   タグビュー   … タグの英字が図形いっぱいに載る
//
// 寸法の対応(lib/taskSize.ts):
//   area  = **塗られる**面積 = 重要度(WEIGHT × 期限の切迫度)。
//           大きさに効くのはこれだけ。形ごとの塗り率(inkRatio)で外接箱を
//           広げるので、**形が違っても同じ重要度なら色の量が同じ**。
//   w / h = 外接箱。**四角だけ**題の長さで横に伸び、円・半円・三角は
//           その形の自然な比(1:1 / 2:1 / 1.155:1)を必ず保つ。
//   sides = 埋まっている側面の数 → 形
//   slabs = 残っている手順 → 何枚に割れるか(大きさには効かない)

export const MIN_SIDES = 1;
export const MAX_SIDES = 4;

/** 曲線をいくつの線分で近似するか。 */
export const ARC_STEPS = 36;

/** スラブとスラブの間の切れ目。軸方向の長さに対する割合。 */
export const SLIT = 0.055;

export interface Pt { x: number; y: number }

export interface SolidSpec {
  /** 埋まっている側面。SIDE_KEYS の順。先頭は必ず "title"。1〜4枚。 */
  sides: SideKey[];
  /** ★**塗られる**面積(=重要度)。solid²。
   *  文字の大きさ・物理の重さ・LOD・間引きの基準はすべてここから引く。 */
  area: number;
  /** 外接箱。ビューによらず1つ。 */
  w: number;
  h: number;
  /** スラブの枚数(1以上)。 */
  slabs: number;
}

export const clampSides = (n: number): number =>
  Math.max(MIN_SIDES, Math.min(MAX_SIDES, Math.round(n || 0)));

/** 断面の形の名前(表示・テスト用)。 */
export const sectionName = (n: number): string =>
  ["円", "半円", "三角", "四角"][clampSides(n) - 1];

// ── 断面の形 ────────────────────────────────────────────────
// 反時計回りの多角形。円と半円の弧は ARC_STEPS 本の弦で近似する。

export function section(sides: number): Pt[] {
  const n = clampSides(sides);
  if (n === 1) {
    // 円。
    const pts: Pt[] = [];
    for (let i = 0; i < ARC_STEPS; i++) {
      const a = (2 * Math.PI * i) / ARC_STEPS;
      pts.push({ x: Math.cos(a), y: Math.sin(a) });
    }
    return pts;
  }
  if (n === 2) {
    // 半円。平らな面を下に、弧が上へふくらむ。
    const pts: Pt[] = [{ x: 1, y: 0 }];
    for (let i = 1; i <= ARC_STEPS; i++) {
      const a = (Math.PI * i) / ARC_STEPS;
      pts.push({ x: Math.cos(a), y: Math.sin(a) });
    }
    return pts;
  }
  // 正三角形・正方形。半径 1 の円に内接させる。
  // 三角は頂点が上、四角は辺が水平になる向き。
  const off = n === 3 ? Math.PI / 2 : Math.PI / 4;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = off + (2 * Math.PI * i) / n;
    pts.push({ x: Math.cos(a), y: Math.sin(a) });
  }
  return pts;
}

/**
 * 断面の輪郭を **縦横とも -0.5〜0.5 に正規化**したもの。
 * 画面の座標(y は下向き)に合わせてある。
 *
 * ★縦横を**別々に**1へ揃えるのが要点。こうしておくと、呼び出し側が
 * `(w, h)` を掛けた結果の外接箱がちょうど `w × h` になり、
 * 「箱の面積 × 塗り率 = 塗られる面積」が形によらず成立する。
 * (以前は「長い方の辺だけ 1」に揃えていたため、半円は狙いの 1/2、
 *  三角は 0.87 の面積にしかならなかった。)
 * その形の本来の縦横比は naturalRatio() が別に持つ。
 */
export function sectionOutline(sides: number): Pt[] {
  const pts = section(sides);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const sx = 1 / (maxX - minX);
  const sy = 1 / (maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return pts.map((p) => ({ x: (p.x - cx) * sx, y: -(p.y - cy) * sy }));
}

/**
 * その断面の形の中で、文字を置ける矩形(-0.5〜0.5 の座標系)。
 * 形ごとに手で決めた値。曲線や斜辺に文字が食い込まないところまで。
 */
export function innerBox(sides: number): { x: number; y: number; w: number; h: number } {
  // ★sectionOutline は**縦横とも -0.5〜0.5**。ここの値もその座標系で書く
  // (以前は「長い方だけ 1」の座標系だったので、半円と三角の縦の値が違う)。
  switch (clampSides(sides)) {
    // 円: 内接する正方形(半径0.5 → 一辺 0.707)。
    case 1: return { x: -0.35, y: -0.35, w: 0.70, h: 0.70 };
    // 半円: 平らな辺が下(y=+0.5)。最大内接矩形は高さ・半幅とも r/√2 のとき
    //   (正規化後 0.707 角)。★以前は 0.34 角と本来の半分以下しか取れておらず、
    //   半円だけ文字が極端に小さくなっていた。
    case 2: return { x: -0.35, y: -0.21, w: 0.70, h: 0.70 };
    // 三角: 頂点が上。底辺に寄せた内接矩形。
    case 3: return { x: -0.24, y: 0.0, w: 0.48, h: 0.473 };
    // 四角。
    default: return { x: -0.46, y: -0.43, w: 0.92, h: 0.86 };
  }
}

/**
 * ★その断面の、**高さ y での半幅**(sectionOutline と同じ -0.5〜0.5 の座標系。
 * y は下向き)。文字を「形に合わせて折り返す」ために要る。
 *
 * innerBox(矩形1つ)では三角がどうしても不利になる — 外接箱の 23% しか
 * 取れず、四角(79%)に対して文字が半分以下になっていた(2026-08-16にユーザー
 * 指摘)。行ごとにここで幅を引けば、下の広いところは目一杯使える。
 */
export function halfWidthAt(sides: number, y: number): number {
  const t = Math.max(-0.5, Math.min(0.5, y));
  switch (clampSides(sides)) {
    // 円。
    case 1: return Math.sqrt(Math.max(0, 0.25 - t * t));
    // 半円。平らな辺が下(y=+0.5)、弧が上。
    case 2: return Math.sqrt(Math.max(0, 1 - (0.5 - t) * (0.5 - t))) / 2;
    // 三角。頂点が上(y=-0.5)、底辺が下。
    case 3: return (t + 0.5) / 2;
    // 四角。
    default: return 0.5;
  }
}

/** 多角形の面積(符号なし)。 */
export function areaOfPoly(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/**
 * ★その形が外接箱のうち何割を塗るか。円/半円 0.78・三角 0.50・四角 1.00。
 * **同じ重要度なら形が違っても色の量が同じ**になるよう、外接箱の面積を
 * これで割って広げる(2026-08-16にユーザー確定)。
 * 定数を手で書かず section() から出すので、形を足しても勝手に追随する。
 */
const inkCache = new Map<number, number>();
export function inkRatio(sides: number): number {
  const n = clampSides(sides);
  const hit = inkCache.get(n);
  if (hit !== undefined) return hit;
  const o = sectionOutline(n);
  const b = boundsOf(o);
  const r = areaOfPoly(o) / ((b.maxX - b.minX) * (b.maxY - b.minY));
  inkCache.set(n, r);
  return r;
}

/** その形の**本来の**縦横比(横 ÷ 縦)。円=1、半円=2、三角≒1.155、四角=1。
 *  sectionOutline は縦横とも 1 に潰してあるので、比はここから取る。 */
export function naturalRatio(sides: number): number {
  const b = boundsOf(section(sides));
  return (b.maxX - b.minX) / (b.maxY - b.minY);
}

// ── 立面 ────────────────────────────────────────────────────

/** 外接箱。単位は solid 座標。 */
export const rectOf = (spec: SolidSpec): { w: number; h: number } =>
  ({ w: spec.w, h: spec.h });

/**
 * FRONT の長方形を、スラブの枚数だけ横に割ったもの。中央を 0 とした座標。
 * 間には SLIT ぶんの切れ目が入る(残っている手順の数だけ層に見える)。
 */
export function slabRects(spec: SolidSpec): { x0: number; x1: number }[] {
  const n = Math.max(1, Math.round(spec.slabs || 1));
  const L = spec.w;
  if (n === 1) return [{ x0: -L / 2, x1: L / 2 }];
  const gap = (SLIT * L) / n;
  const step = L / n;
  return Array.from({ length: n }, (_, i) => ({
    x0: -L / 2 + i * step + (i === 0 ? 0 : gap / 2),
    x1: -L / 2 + (i + 1) * step - (i === n - 1 ? 0 : gap / 2),
  }));
}

// ── 器に収める ──────────────────────────────────────────────

export interface Box { minX: number; minY: number; maxX: number; maxY: number }

export function boundsOf(points: Pt[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
