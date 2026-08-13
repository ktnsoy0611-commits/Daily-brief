import type { SideKey } from "./types";

// ★タスクの立体の幾何。**純粋関数だけ**。単体テストで検証する。
//
// 立体は「横倒しの柱」。寸法の対応は次のとおり(2026-08-13にユーザー確定):
//
//   軸 = X(横)          … len。**Title の文字数に比例**して伸びる。
//   断面 = Y/Z          … radius。**Importance(小/中/大)**。物理の重さもここから。
//   断面の形            … 埋まっている側面の数
//                          1=円 / 2=半円 / 3=三角 / 4=四角
//   上下の面(cap)       … **タグの色**。BOTTOM VIEW ではこの面だけが見える。
//   スラブ              … 軸方向に n 等分。**残っているサブタスクの数**。
//                          間にわずかな切れ目(スリット)が入る。
//
// ★CSS の 3D 変形(perspective / preserve-3d / rotateX)は使わない。
// このコードベースはそれで Safari の描画崩れを5回踏んでいる(§5・§7.9・
// §7.14・§7.32・§7.35)。3D座標を自分で持ち、**平行投影**して多角形として
// 描くだけにする。平行投影なので、面の (u,v) 矩形 → 画面の四辺形は常に
// **アフィン変換**であり、文字の短冊をそのまま貼れる(lib/solidPaint.ts)。

export const MIN_SIDES = 1;
export const MAX_SIDES = 4;

/** 曲面をいくつの平面で近似するか(描画のためだけ。意味の上では1枚の面)。 */
export const ARC_STEPS = 18;

/** スラブとスラブの間の切れ目。軸方向の長さに対する割合。 */
export const SLIT = 0.055;

export interface Pt { x: number; y: number }
export interface Vec3 { x: number; y: number; z: number }

export interface SolidSpec {
  /** 埋まっている側面。SIDE_KEYS の順。先頭は必ず "title"。1〜4枚。 */
  sides: SideKey[];
  /** 軸(X)方向の長さ。 */
  len: number;
  /** 断面(Y/Z)の半径。 */
  radius: number;
  /** スラブの枚数(1以上)。 */
  slabs: number;
}

/** 描く単位。側面は小片に割ってあるので、そのまま塗れば自己交差しない。 */
export interface Facet {
  kind: "side" | "cap";
  /** 側面ならどの項目の面か。cap は null(タグの色)。 */
  key: SideKey | null;
  /** 何枚目のスラブか(0 起点)。 */
  slab: number;
  /** 投影済みの多角形。 */
  points: Pt[];
  /** 奥行き。大きいほど手前(この順で後から描く)。 */
  depth: number;
  /** 0(光に背く)〜1(光を正面から受ける)。 */
  light: number;
  /** この小片が担当する、面の周方向の範囲(0..1)。文字の短冊を切るのに使う。 */
  u0: number;
  u1: number;
  /** この小片が担当する、面の軸方向の範囲(0..1)。スラブで分かれる。 */
  v0: number;
  v1: number;
}

export const clampSides = (n: number): number =>
  Math.max(MIN_SIDES, Math.min(MAX_SIDES, Math.round(n || 0)));

/** 断面の形の名前(表示・テスト用)。 */
export const sectionName = (n: number): string =>
  ["円", "半円", "三角", "四角"][clampSides(n) - 1];

// ── 断面の輪郭 ──────────────────────────────────────────────
// 反時計回りの凸多角形として持つ。辺 i は pts[i] → pts[(i+1)%N]。
// 曲面(円・半円の弧)は ARC_STEPS 本の弦で近似するが、**意味の上では1枚の面**
// なので keyIndexOf は同じ側面を指す。

interface Section { pts: Pt[]; keyIndex: number[] }

export function section(sides: number): Section {
  const n = clampSides(sides);
  if (n === 1) {
    // 円。全周が1枚の曲面。
    const pts: Pt[] = [];
    for (let i = 0; i < ARC_STEPS; i++) {
      const a = (2 * Math.PI * i) / ARC_STEPS;
      pts.push({ x: Math.cos(a), y: Math.sin(a) });
    }
    return { pts, keyIndex: pts.map(() => 0) };
  }
  if (n === 2) {
    // 半円。直径(平面)+ 弧(曲面)の2枚。
    // ★直径を**辺0**にし、その面が正面(+z)を向くように立てる。TITLE は必ず
    // 辺0に載るので、平らな面が手前を向いて半円柱だと一目で分かる
    // (弧を手前にすると円柱と見分けが付かなくなる)。
    const pts: Pt[] = [{ x: 0, y: -1 }, { x: 0, y: 1 }];
    for (let i = 1; i < ARC_STEPS; i++) {
      const a = Math.PI / 2 + (Math.PI * i) / ARC_STEPS;
      pts.push({ x: Math.cos(a), y: Math.sin(a) });
    }
    return { pts, keyIndex: pts.map((_, i) => (i === 0 ? 0 : 1)) };
  }
  // 正三角形・正方形。半径 1 の円に内接させる。
  // ★辺0の外向き法線がちょうど正面(+z、角度0)を向く向きに回してある
  // (反時計回りの n 角形では、辺 i の法線の角度は off + (2i+1)π/n)。
  // これで TITLE の面が常に手前を向き、いちばん読みやすい位置に来る。
  const off = -Math.PI / n;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = off + (2 * Math.PI * i) / n;
    pts.push({ x: Math.cos(a), y: Math.sin(a) });
  }
  return { pts, keyIndex: pts.map((_, i) => i) };
}

/** 断面の輪郭を -0.5〜0.5 に正規化したもの。BOTTOM VIEW がそのまま使う。 */
export function capOutline(sides: number): Pt[] {
  const { pts } = section(sides);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const s = 1 / Math.max(maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // 画面の座標(yは下向き)へ合わせる。
  return pts.map((p) => ({ x: (p.x - cx) * s, y: -(p.y - cy) * s }));
}

// ── 投影 ────────────────────────────────────────────────────
// FRONT = アイソメトリック。**平行投影**なので、面ごとのアフィン変換で
// 文字を貼れる。BOTTOM は別扱い(断面をそのまま描くだけ)。
//
// 3D座標の取り方: 軸 = X(横)、断面 = (y, z)。

// 奥行き(z)の効き。★TITLE の面は z が一定の平面なので、この値をいくら変えても
// **正面の面だけは歪まない**(x→x / y→-y のまま)。大きくすると上面・側面が
// 広く見えるようになるので、そちらが読める範囲でなるべく大きく取る。
const ISO_DEPTH = 0.78;
const ISO_C = Math.cos(Math.PI / 6) * ISO_DEPTH;
const ISO_S = Math.sin(Math.PI / 6) * ISO_DEPTH;

/** アイソメトリック投影。 */
export function projectFront(p: Vec3): Pt {
  return {
    x: p.x + p.z * ISO_C,
    y: -p.y + p.z * ISO_S,
  };
}

/** 視線方向の深さ。手前ほど大きい。 */
const depthOf = (p: Vec3) => p.x * 0.12 + p.y * 0.5 + p.z;

function centroid3(ps: Vec3[]): Vec3 {
  let x = 0, y = 0, z = 0;
  for (const p of ps) { x += p.x; y += p.y; z += p.z; }
  return { x: x / ps.length, y: y / ps.length, z: z / ps.length };
}

/** 多角形の法線(最初の、つぶれていない3点から)。 */
function normalOf(ps: Vec3[]): Vec3 {
  const a = ps[0];
  for (let i = 1; i < ps.length - 1; i++) {
    const u = { x: ps[i].x - a.x, y: ps[i].y - a.y, z: ps[i].z - a.z };
    const v = { x: ps[i + 1].x - a.x, y: ps[i + 1].y - a.y, z: ps[i + 1].z - a.z };
    const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
    const m = Math.hypot(n.x, n.y, n.z);
    if (m > 1e-6) return { x: n.x / m, y: n.y / m, z: n.z / m };
  }
  return { x: 0, y: 1, z: 0 };
}

// 光の向き。上から強く、同時に見える2面に差が付くよう傾けてある
// (同じ明度になると稜線が消えて立体に見えなくなるため)。
const LIGHT = (() => {
  const v = { x: -0.22, y: 0.82, z: 0.52 };
  const m = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / m, y: v.y / m, z: v.z / m };
})();

/** 面の明度。両面ランバート(外向きかどうかを中心との位置関係で決める)。 */
function lightAt(pts3: Vec3[], centre: Vec3): number {
  const n = normalOf(pts3);
  const c = centroid3(pts3);
  const outward = (c.x - centre.x) * n.x + (c.y - centre.y) * n.y + (c.z - centre.z) * n.z;
  const s = outward < 0 ? -1 : 1;
  const dot = s * (n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z);
  return Math.max(0, Math.min(1, 0.5 + 0.5 * dot));
}

/** スラブの軸方向の範囲。スリットのぶんを内側へ詰める。 */
export function slabRanges(slabs: number): { v0: number; v1: number }[] {
  const n = Math.max(1, Math.round(slabs || 1));
  if (n === 1) return [{ v0: 0, v1: 1 }];
  const gap = SLIT / n;
  const step = 1 / n;
  return Array.from({ length: n }, (_, i) => ({
    v0: i * step + (i === 0 ? 0 : gap / 2),
    v1: (i + 1) * step - (i === n - 1 ? 0 : gap / 2),
  }));
}

/**
 * 立体を描くための小片。奥から順(この順で塗る)。
 *
 * ★側面は必ず小片(四角形)に割る。全周を1枚の多角形にすると自己交差した
 * 退化多角形になり、nonzero 塗りで打ち消えて胴が消える(§52.3 で実際に起きた)。
 * 同じ面の小片は同じ色なので、見た目は1枚のベタ塗りの面のまま。
 */
export function facetsOf(spec: SolidSpec): Facet[] {
  const sides = clampSides(spec.sides.length);
  const { pts, keyIndex } = section(sides);
  const r = spec.radius;
  const L = spec.len;
  const ranges = slabRanges(spec.slabs);
  const centre: Vec3 = { x: 0, y: 0, z: 0 };

  // 断面の周に沿った累積長さ → 面ごとの u(0..1)。
  const n = pts.length;
  const seg = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
  // 面ごとの合計長さと、その面の中での開始位置。
  const total = new Map<number, number>();
  seg.forEach((len, i) => total.set(keyIndex[i], (total.get(keyIndex[i]) ?? 0) + len));
  const acc = new Map<number, number>();

  const out: { f: Omit<Facet, "points" | "depth" | "light">; pts3: Vec3[] }[] = [];

  ranges.forEach((range, slab) => {
    const x0 = (range.v0 - 0.5) * L;
    const x1 = (range.v1 - 0.5) * L;

    // 側面(小片)。
    acc.clear();
    for (let i = 0; i < n; i++) {
      const ki = keyIndex[i];
      const start = acc.get(ki) ?? 0;
      const end = start + seg[i];
      acc.set(ki, end);
      const span = total.get(ki) || 1;
      const a = pts[i];
      const b = pts[(i + 1) % n];
      out.push({
        f: {
          kind: "side", key: spec.sides[ki] ?? null, slab,
          u0: start / span, u1: end / span, v0: range.v0, v1: range.v1,
        },
        pts3: [
          { x: x0, y: a.y * r, z: a.x * r },
          { x: x1, y: a.y * r, z: a.x * r },
          { x: x1, y: b.y * r, z: b.x * r },
          { x: x0, y: b.y * r, z: b.x * r },
        ],
      });
    }

    // 上下の面(タグの色)。軸の両端。
    const ring = pts.map((p) => ({ y: p.y * r, z: p.x * r }));
    out.push({
      f: { kind: "cap", key: null, slab, u0: 0, u1: 1, v0: range.v0, v1: range.v1 },
      pts3: ring.map((p) => ({ x: x1, y: p.y, z: p.z })),
    });
    out.push({
      f: { kind: "cap", key: null, slab, u0: 0, u1: 1, v0: range.v0, v1: range.v1 },
      pts3: [...ring].reverse().map((p) => ({ x: x0, y: p.y, z: p.z })),
    });
  });

  return out
    .map(({ f, pts3 }) => ({
      ...f,
      points: pts3.map(projectFront),
      depth: depthOf(centroid3(pts3)),
      light: lightAt(pts3, centre),
    }))
    .sort((a, b) => a.depth - b.depth);
}

// ── シルエット(物理の形) ────────────────────────────────────
// FRONT 投影の外形。matter.js の当たり判定にそのまま渡す。
// ビューを切り替えても body は作り直さない(作り直すと山が崩れる)ので、
// **FRONT を正**とする。

/** 反時計回りの凸包(Andrew's monotone chain)。 */
export function convexHull(points: Pt[]): Pt[] {
  const ps = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (ps.length < 3) return ps;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of ps) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** 多角形の面積の重心。matter.js の `fromVertices` が物体の中心に選ぶ点と同じ。
 *  絵と当たり判定をぴったり重ねるために使う。 */
export function areaCentroid(pts: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-12) {
    const b = boundsOf(pts);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** FRONT 投影のシルエット(反時計回りの凸多角形)。 */
export function silhouette(spec: SolidSpec): Pt[] {
  // スリットは輪郭に影響しないので、1枚のスラブとして外形だけを取る。
  const solid = facetsOf({ ...spec, slabs: 1 });
  const all: Pt[] = [];
  for (const f of solid) all.push(...f.points);
  return convexHull(all);
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

export const facetBounds = (facets: Facet[]): Box =>
  boundsOf(facets.flatMap((f) => f.points));

/** 幅 w・高さ h の器の中央へ収める倍率と移動量。 */
export function fitTo(box: Box, w: number, h: number, pad = 0) {
  const bw = Math.max(box.maxX - box.minX, 1e-6);
  const bh = Math.max(box.maxY - box.minY, 1e-6);
  const s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  return {
    scale: s,
    dx: w / 2 - ((box.minX + box.maxX) / 2) * s,
    dy: h / 2 - ((box.minY + box.maxY) / 2) * s,
  };
}
