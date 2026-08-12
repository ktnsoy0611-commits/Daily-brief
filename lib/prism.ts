import type { FiveWKey, PrismSlot } from "./types";

// ★タスクの立体(柱体)の幾何。**純粋関数だけ**。単体テストで検証する。
//
// タスクは「タイトル(=なにを)+ 埋まっている5W1H」の数だけ面を持ち、
// 面の数が増えるほど角ばっていく(2026-08-12にユーザー確定):
//
//   面3 = 円柱   底面=円   ×2 / 側面=曲面 ×1
//   面4 = 半円柱 底面=半円 ×2 / 側面=曲面 ×1 + 平面 ×1
//   面5 = 三角柱 底面=三角 ×2 / 側面=平面 ×3
//   面6 = 四角柱 底面=四角 ×2 / 側面=平面 ×4
//
// つまり「底面2枚 + 側面 k 枚」の一本道で、k = 面の数 − 2。
// 展開図は常に「底面 + 側面の帯 + 底面」の帯状になる。
//
// ★CSS の 3D 変形(perspective / preserve-3d / rotateX)は使わない。
// このコードベースはそれで Safari の描画崩れを5回踏んでいる(§5・§7.9・
// §7.14・§7.32・§7.35)。ここでは3D座標を自分で持ち、**平行投影**して
// 多角形として描くだけにする。折り具合 t で投影も補間するので、
// t=1(平ら)では正面から見た本物の展開図に一致する。

export const PRISM_MIN_FACES = 3;
export const PRISM_MAX_FACES = 6;

/** 底面の半径。すべての寸法はこれを 1 とした比で持つ。 */
const R = 1;
/** 柱の高さ。 */
export const PRISM_H = 1.7;
/** 曲面をいくつの平面で近似するか(描画のためだけ。意味の上では1枚の面)。 */
const ARC_STEPS = 20;

export interface Pt { x: number; y: number }
export interface Vec3 { x: number; y: number; z: number }

export interface PrismFace {
  slot: PrismSlot;
  /** 投影済みの多角形。 */
  points: Pt[];
  /** 奥行き。大きいほど手前(この順で後から描く)。 */
  depth: number;
  /** 0(光に背く)〜1(光を正面から受ける)。面ごとの明度に使う。 */
  light: number;
}

/** 面の数 → 側面の数。 */
export const lateralCount = (faceCount: number): number => clampFaces(faceCount) - 2;

export const clampFaces = (n: number): number =>
  Math.max(PRISM_MIN_FACES, Math.min(PRISM_MAX_FACES, Math.round(n || 0)));

/** 面の数 → 立体の名前(表示用)。 */
export const prismName = (faceCount: number): string =>
  ["円柱", "半円柱", "三角柱", "四角柱"][lateralCount(faceCount) - 1] ?? "円柱";

/** 側面のスロット名。帯に横一列に並ぶ順。 */
export const lateralSlots = (faceCount: number): PrismSlot[] =>
  Array.from({ length: lateralCount(faceCount) }, (_, i) => `side${i}` as PrismSlot);

/** その立体が持つ全スロット。展開図の並び順(上の底面 → 側面 → 下の底面)。 */
export const prismSlots = (faceCount: number): PrismSlot[] =>
  ["base0", ...lateralSlots(faceCount), "base1"] as PrismSlot[];

// ── 底面の輪郭 ────────────────────────────────────────────────
// 反時計回りの凸多角形として持つ。辺 i は pts[i] → pts[(i+1)%N]。
// 曲面(円・半円の弧)は ARC_STEPS 本の弦で近似するが、**意味の上では1枚の面**
// なので slotOf は同じ側面を指す。

function basePolygon(lateral: number): { pts: Pt[]; slotOf: PrismSlot[] } {
  if (lateral === 1) {
    // 円。全周が1枚の曲面。
    const pts: Pt[] = [];
    for (let i = 0; i < ARC_STEPS; i++) {
      const a = (2 * Math.PI * i) / ARC_STEPS;
      pts.push({ x: Math.cos(a) * R, y: Math.sin(a) * R });
    }
    return { pts, slotOf: pts.map(() => "side0" as PrismSlot) };
  }
  if (lateral === 2) {
    // 半円。直径(平面)+ 弧(曲面)の2枚。
    // ★直径を**辺0**にし、時計回りに回る。walk は必ず辺0を +X 方向へ置くので、
    // この向きにすると平らな面が手前を向き、半円柱だと一目で分かる
    // (弧を辺0にすると平らな面が裏へ回り、円柱と見分けが付かなくなる)。
    const pts: Pt[] = [{ x: -R, y: 0 }, { x: R, y: 0 }];
    for (let i = 1; i < ARC_STEPS; i++) {
      const a = -(Math.PI * i) / ARC_STEPS;
      pts.push({ x: Math.cos(a) * R, y: Math.sin(a) * R });
    }
    // 辺0 = 直径、それ以降 = 弧。
    const slotOf = pts.map((_, i) => (i === 0 ? "side0" : "side1") as PrismSlot);
    return { pts, slotOf };
  }
  // 正三角形・正方形。半径 R の円に内接させる。
  const n = lateral;
  const off = n === 4 ? Math.PI / 4 : Math.PI / 2;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = off + (2 * Math.PI * i) / n;
    pts.push({ x: Math.cos(a) * R, y: Math.sin(a) * R });
  }
  return { pts, slotOf: pts.map((_, i) => `side${i}` as PrismSlot) };
}

interface SubEdge { slot: PrismSlot; len: number; turn: number }

/** 底面の輪郭を「長さと、その先での曲がり角」の並びに直す。
 *  曲がり角の合計は必ず 2π(凸な閉じた多角形なので)。 */
function subEdges(lateral: number): SubEdge[] {
  const { pts, slotOf } = basePolygon(lateral);
  const n = pts.length;
  const dirs: number[] = [];
  const lens: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    lens.push(Math.hypot(b.x - a.x, b.y - a.y));
    dirs.push(Math.atan2(b.y - a.y, b.x - a.x));
  }
  return dirs.map((d, i) => {
    let turn = dirs[(i + 1) % n] - d;
    while (turn <= -Math.PI) turn += 2 * Math.PI;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    return { slot: slotOf[i], len: lens[i], turn };
  });
}

/** 折り具合 t での断面の折れ線。t=0 で閉じ、t=1 で一直線になる。
 *  返り値の長さは 辺の数 + 1(t=0 では最後の点が最初と一致する)。 */
function walk(edges: SubEdge[], t: number): Pt[] {
  const pts: Pt[] = [{ x: 0, y: 0 }];
  let dir = 0;
  for (const e of edges) {
    const last = pts[pts.length - 1];
    pts.push({ x: last.x + Math.cos(dir) * e.len, y: last.y + Math.sin(dir) * e.len });
    dir += (1 - t) * e.turn;
  }
  return pts;
}

// ── 投影 ────────────────────────────────────────────────────
// t=0 はアイソメトリック(立体に見える)、t=1 は正面(展開図がそのまま出る)。
// どちらも**平行投影**なので、その間も含めて常にアフィン変換であり、
// CSS の 3D 変形を一切使わずに描ける。

export function projector(t: number): (p: Vec3) => Pt {
  const c = Math.cos(Math.PI / 6);
  const s = Math.sin(Math.PI / 6);
  const k = 1 - t; // 1=アイソメ 0=正面
  const ax = c * k + (1 - k);
  const az = -c * k;
  const bx = s * k;
  const bz = s * k;
  return (p) => ({ x: p.x * ax + p.z * az, y: p.x * bx - p.y + p.z * bz });
}

/** アイソメトリックでの視線方向。手前ほど大きい値になる。 */
const depthOf = (p: Vec3) => p.x + p.y + p.z;

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

// 光の向き。上から強く、横の2面は互いに差が付くように傾けてある
// (アイソメで同時に見える2つの側面が同じ明度になると、その間の稜線が
// 消えて立体に見えなくなるため)。
const LIGHT = (() => {
  const v = { x: -0.30, y: 0.80, z: -0.52 };
  const m = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / m, y: v.y / m, z: v.z / m };
})();

/** 面ごとの明度。0(暗い)〜1(明るい)。
 *  ★閉じた形(t=0)から**一度だけ**決める。折りたたみの途中で明度が
 *  揺れると面の同一性が読めなくなるので、面は最初から最後まで自分の色を持つ。 */
function slotLight(k: number): Map<PrismSlot, number> {
  const edges = subEdges(k);
  const closed = walk(edges, 0);
  const half = PRISM_H / 2;
  // 立体の中心(外向きの法線を判定するため)。
  const ring = closed.slice(0, closed.length - 1);
  const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
  const cz = ring.reduce((s, p) => s + p.y, 0) / ring.length;
  const centre = { x: cx, y: 0, z: cz };

  const lightAt = (pts3: Vec3[]) => {
    const n = normalOf(pts3);
    const c = centroid3(pts3);
    const outward = (c.x - centre.x) * n.x + (c.y - centre.y) * n.y + (c.z - centre.z) * n.z;
    const s = outward < 0 ? -1 : 1;
    const dot = s * (n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z);
    // 両面ランバート。-1〜1 を 0〜1 へ。
    return Math.max(0, Math.min(1, 0.5 + 0.5 * dot));
  };

  const out = new Map<PrismSlot, number>();
  // 側面。巻きついている面(円柱の全周・半円柱の弧)は、**いちばん手前を
  // 向いている小片**の明度をその面の色にする(見えている側の色になる)。
  let i = 0;
  while (i < edges.length) {
    const slot = edges[i].slot;
    let j = i;
    let best = -Infinity;
    let bestLight = 0.5;
    while (j < edges.length && edges[j].slot === slot) {
      const quad = quadOf(closed, j, half);
      const d = depthOf(centroid3(quad));
      if (d > best) { best = d; bestLight = lightAt(quad); }
      j++;
    }
    out.set(slot, bestLight);
    i = j;
  }
  const local = ring.map((p) => ({ a: p.x, b: p.y }));
  out.set("base0", lightAt(local.map(({ a, b }) => ({ x: a, y: half, z: b }))));
  out.set("base1", lightAt(local.map(({ a, b }) => ({ x: a, y: -half, z: b }))));
  return out;
}

/** 断面の折れ線の i 番目の小辺を、高さ方向に伸ばした四角形。 */
function quadOf(line: Pt[], i: number, half: number): Vec3[] {
  return [
    { x: line[i].x, y: half, z: line[i].y },
    { x: line[i + 1].x, y: half, z: line[i + 1].y },
    { x: line[i + 1].x, y: -half, z: line[i + 1].y },
    { x: line[i].x, y: -half, z: line[i].y },
  ];
}

/**
 * 折り具合 t での各面。
 * t=0 = 閉じた立体、t=1 = 平らな展開図。奥から順(描く順)に並んでいる。
 */
export function prismFaces(faceCount: number, t: number): PrismFace[] {
  return build(faceCount, t, false);
}

/**
 * 描くための多角形。**側面は小さな四角形に分割して返す**。
 *
 * ★円柱の側面は全周を1枚で覆うため、「上端の折れ線 + 下端の折れ線を逆順」の
 * 1枚の多角形にすると自己交差した退化多角形になり、塗りが打ち消えて胴が
 * 消える(実際に消えた)。小片に分けて1枚ずつ塗ればその問題が起きない。
 * 同じスロットの小片は**同じ色**を使うので、見た目は1枚のベタ塗りの面のまま。
 */
export function prismDraw(faceCount: number, t: number): PrismFace[] {
  return build(faceCount, t, true);
}

function build(faceCount: number, t: number, split: boolean): PrismFace[] {
  const k = lateralCount(faceCount);
  const edges = subEdges(k);
  const line = walk(edges, t);
  const closed = walk(edges, 0);
  const proj = projector(t);
  const half = PRISM_H / 2;
  const lights = slotLight(k);

  const out: { slot: PrismSlot; pts3: Vec3[] }[] = [];

  // 側面。
  let i = 0;
  while (i < edges.length) {
    const slot = edges[i].slot;
    let j = i;
    while (j < edges.length && edges[j].slot === slot) j++;
    if (split) {
      for (let m = i; m < j; m++) out.push({ slot, pts3: quadOf(line, m, half) });
    } else {
      // 同じスロットの小辺をひとつの面にまとめた輪郭(展開図で使う)。
      const top: Vec3[] = [];
      const bottom: Vec3[] = [];
      for (let m = i; m <= j; m++) {
        top.push({ x: line[m].x, y: half, z: line[m].y });
        bottom.push({ x: line[m].x, y: -half, z: line[m].y });
      }
      out.push({ slot, pts3: [...top, ...bottom.reverse()] });
    }
    i = j;
  }

  // 底面。蝶番は側面0の上端(base0)・下端(base1)で、そこを軸に回る。
  // 折り具合 t での回転角: t=1 で帯と同じ平面(平ら)、t=0 で水平(蓋になる)。
  const phi = (1 - t) * (Math.PI / 2);
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  // 蝶番(=側面0の最初の小辺)は常に原点から +X 方向。多角形はその
  // どちら側にあるか(内側の向き)を、閉じた形の重心から決める。
  let cz = 0;
  for (let m = 0; m < closed.length - 1; m++) cz += closed[m].y;
  const sgn = cz >= 0 ? 1 : -1;

  const local = closed.slice(0, closed.length - 1).map((p) => ({ a: p.x, b: p.y * sgn }));
  out.unshift({
    slot: "base1",
    pts3: local.map(({ a, b }) => ({ x: a, y: -half - b * cosP, z: b * sinP * sgn })),
  });
  out.push({
    slot: "base0",
    pts3: local.map(({ a, b }) => ({ x: a, y: half + b * cosP, z: b * sinP * sgn })),
  });

  return out
    .map(({ slot, pts3 }) => ({
      slot,
      points: pts3.map(proj),
      depth: depthOf(centroid3(pts3)),
      light: lights.get(slot) ?? 0.5,
    }))
    .sort((a, b) => a.depth - b.depth);
}

// ── 器に収める ──────────────────────────────────────────────

export interface Box { minX: number; minY: number; maxX: number; maxY: number }

export function boundsOf(faces: PrismFace[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of faces) for (const p of f.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** 面の座標を、幅 w・高さ h の器の中央へ収める倍率と移動量。
 *  scale を外から渡すと倍率は固定したまま中央寄せだけする(折りたたみの
 *  途中で拡大率が揺れないようにするため)。 */
export function fitTo(box: Box, w: number, h: number, pad = 0, scale?: number) {
  const bw = Math.max(box.maxX - box.minX, 1e-6);
  const bh = Math.max(box.maxY - box.minY, 1e-6);
  const s = scale ?? Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  return {
    scale: s,
    dx: w / 2 - ((box.minX + box.maxX) / 2) * s,
    dy: h / 2 - ((box.minY + box.maxY) / 2) * s,
  };
}

export function toPath(points: Pt[], scale: number, dx: number, dy: number): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${(p.x * scale + dx).toFixed(2)} ${(p.y * scale + dy).toFixed(2)}`).join("") + "Z";
}

// ── 面の割り当て ────────────────────────────────────────────
// 「面の数 = 1(タイトル) + 埋まっている5W1Hの数」。最小は円柱(3面)なので、
// 埋まっていない面が残ることがある(そこは空白の面として触れる)。

export interface FaceAssign {
  slot: PrismSlot;
  /** タイトル(=なにを)の面なら null。 */
  key: FiveWKey | null;
  /** その面の中身。空なら未入力。 */
  value: string;
}

/**
 * 5W1Hの中身と、本人が置いた位置(faces)から、各面に何が乗るかを決める。
 * 置き場所の指定が無いものは、空いている面へ前から順に入れる。
 */
export function assignFaces(
  values: Partial<Record<FiveWKey, string | undefined>>,
  placed: Partial<Record<PrismSlot, FiveWKey>> | undefined,
  title: string,
): { faceCount: number; assigns: FaceAssign[] } {
  const filled = (Object.keys(values) as FiveWKey[]).filter((k) => (values[k] ?? "").trim() !== "");
  const faceCount = clampFaces(1 + filled.length);
  const slots = prismSlots(faceCount);
  const used = new Set<FiveWKey>();
  const bySlot = new Map<PrismSlot, FiveWKey>();

  // 本人が置いた位置を先に確定する(その立体に無い面・埋まっていない項目は捨てる)。
  for (const slot of slots) {
    if (slot === "base0") continue; // タイトル固定
    const key = placed?.[slot];
    if (key && filled.includes(key) && !used.has(key)) {
      used.add(key);
      bySlot.set(slot, key);
    }
  }
  // 残りを、空いている面へ前から順に。
  const rest = filled.filter((k) => !used.has(k));
  for (const slot of slots) {
    if (slot === "base0" || bySlot.has(slot)) continue;
    const key = rest.shift();
    if (!key) break;
    bySlot.set(slot, key);
  }

  return {
    faceCount,
    assigns: slots.map((slot) => {
      if (slot === "base0") return { slot, key: null, value: title };
      const key = bySlot.get(slot) ?? null;
      return { slot, key, value: key ? (values[key] ?? "") : "" };
    }),
  };
}
