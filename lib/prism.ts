import { FIVE_W_KEYS } from "./types";
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
  // 底面は閉じた形では上下の蓋そのもの。
  out.set("base0", lightAt(ring.map((p) => ({ x: p.x, y: half, z: p.y }))));
  out.set("base1", lightAt(ring.map((p) => ({ x: p.x, y: -half, z: p.y }))));
  return out;
}

/** 底面の蝶番にする小辺。**周の真ん中**を選ぶ。
 *  ★端(小辺0)を蝶番にすると、展開図で底面が帯の左端に寄って絵が偏る。
 *  真ん中にすると底面が帯の中央に載り、展開図として素直に読める。 */
function hingeIndex(edges: SubEdge[]): number {
  const total = edges.reduce((s, e) => s + e.len, 0);
  let acc = 0;
  for (let i = 0; i < edges.length; i++) {
    if (acc + edges[i].len >= total / 2) return i;
    acc += edges[i].len;
  }
  return 0;
}

/** v を90度回す。s で向きを選ぶ。 */
const rot90 = (v: Pt, s: number): Pt => (s >= 0 ? { x: -v.y, y: v.x } : { x: v.y, y: -v.x });

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

  // 底面。周の真ん中の小辺を蝶番にして、そこを軸に回る。
  // 折り具合 t での回転角: t=1 で帯と同じ平面(平ら)、t=0 で水平(蓋になる)。
  const phi = (1 - t) * (Math.PI / 2);
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const h = hingeIndex(edges);
  const ring = closed.slice(0, closed.length - 1);

  // 閉じた形での蝶番の枠(向き u0 と、多角形の内側を向く法線 n0)。
  const q0 = closed[h];
  const q1 = closed[h + 1];
  const len0 = Math.max(Math.hypot(q1.x - q0.x, q1.y - q0.y), 1e-9);
  const u0: Pt = { x: (q1.x - q0.x) / len0, y: (q1.y - q0.y) / len0 };
  const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p.y, 0) / ring.length;
  // 内側がどちら回りかを、重心の位置で決める。
  const side = (cx - q0.x) * (-u0.y) + (cy - q0.y) * u0.x >= 0 ? 1 : -1;
  const n0 = rot90(u0, side);
  // 各頂点を(蝶番に沿う量 a、蝶番から内側へ入る量 b)で表す。
  const local = ring.map((p) => ({
    a: (p.x - q0.x) * u0.x + (p.y - q0.y) * u0.y,
    b: (p.x - q0.x) * n0.x + (p.y - q0.y) * n0.y,
  }));

  // 折り具合 t での蝶番の枠。
  let dirH = 0;
  for (let m = 0; m < h; m++) dirH += (1 - t) * edges[m].turn;
  const u: Pt = { x: Math.cos(dirH), y: Math.sin(dirH) };
  const nIn = rot90(u, side);
  const hx = line[h].x;
  const hz = line[h].y;
  const cap = (sign: 1 | -1) => local.map(({ a, b }) => ({
    x: hx + a * u.x + b * sinP * nIn.x,
    y: sign * (half + b * cosP),
    z: hz + a * u.y + b * sinP * nIn.y,
  }));

  out.unshift({ slot: "base1", pts3: cap(-1) });
  out.push({ slot: "base0", pts3: cap(1) });

  return out
    .map(({ slot, pts3 }) => ({
      slot,
      points: pts3.map(proj),
      depth: depthOf(centroid3(pts3)),
      light: lights.get(slot) ?? 0.5,
    }))
    .sort((a, b) => a.depth - b.depth);
}

/**
 * 底面の輪郭。**柱を倒してこちらへ向けた姿**(2026-08-12にユーザー確定)。
 * 見えるのは底面そのものなので、面の数の違いが図形の違いとして出る:
 *   3面=円 / 4面=半円 / 5面=三角 / 6面=四角。
 * 座標は -0.5〜0.5 に正規化してあり、そのまま一辺の長さを掛けて使える。
 */
export function baseOutline(faceCount: number): Pt[] {
  const { pts } = basePolygon(lateralCount(faceCount));
  // 幅・高さのどちらもはみ出さないよう、外接する箱で正規化する。
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

/** 5W1Hのうち、いまこの立体の面に乗っているもの。
 *  ★「中身が入っているもの」ではなく「面として置かれているもの」で数える。
 *  ＋で面を足した直後はまだ空なので、中身で数えると面が生えてこない。 */
export function keysOnNet(
  values: Partial<Record<FiveWKey, string | undefined>>,
  placed: Partial<Record<PrismSlot, FiveWKey>> | undefined,
): FiveWKey[] {
  const set = new Set<FiveWKey>();
  for (const k of FIVE_W_KEYS) if ((values[k] ?? "").trim() !== "") set.add(k);
  // 置き場所の指定があるもの(中身はまだ空でもよい)。
  if (placed) for (const slot of Object.keys(placed) as PrismSlot[]) {
    const k = placed[slot];
    if (k && FIVE_W_KEYS.includes(k)) set.add(k);
  }
  return FIVE_W_KEYS.filter((k) => set.has(k));
}

/**
 * 5W1Hの中身と、本人が置いた位置(faces)から、各面に何が乗るかを決める。
 * 置き場所の指定が無いものは、空いている面へ前から順に入れる。
 *
 * 最小は円柱(3面)なので、乗っている項目が2つに満たないうちは
 * **空白の面**が残る(そこはタップして中身を選べる)。
 */
export function assignFaces(
  values: Partial<Record<FiveWKey, string | undefined>>,
  placed: Partial<Record<PrismSlot, FiveWKey>> | undefined,
  title: string,
): { faceCount: number; assigns: FaceAssign[] } {
  const onNet = keysOnNet(values, placed);
  const faceCount = clampFaces(1 + onNet.length);
  const slots = prismSlots(faceCount);
  const used = new Set<FiveWKey>();
  const bySlot = new Map<PrismSlot, FiveWKey>();

  // 本人が置いた位置を先に確定する(その立体に無い面への指定は捨てる)。
  for (const slot of slots) {
    if (slot === "base0") continue; // タイトル固定
    const key = placed?.[slot];
    if (key && onNet.includes(key) && !used.has(key)) {
      used.add(key);
      bySlot.set(slot, key);
    }
  }
  // 残りを、空いている面へ前から順に。
  const rest = onNet.filter((k) => !used.has(k));
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

/** ＋で新しい面を足したときの、置き場所の指定の作り直し。
 *  `end` は帯のどちら端で＋を押したか。左端なら側面の先頭へ割り込ませる。 */
export function withKeyPlaced(
  values: Partial<Record<FiveWKey, string | undefined>>,
  placed: Partial<Record<PrismSlot, FiveWKey>> | undefined,
  title: string,
  key: FiveWKey,
  end: "left" | "right",
): Partial<Record<PrismSlot, FiveWKey>> {
  const cur = assignFaces(values, placed, title).assigns;
  const sides = cur.filter((a) => a.slot.startsWith("side")).map((a) => a.key);
  const base1 = cur.find((a) => a.slot === "base1")?.key ?? null;
  const nextSides = end === "left" ? [key, ...sides] : [...sides, key];

  // 新しい立体の面の並びへ入れ直す。側面に入り切らない分は底面へ回す。
  const count = clampFaces(1 + keysOnNet(values, placed).length + 1);
  const slotList = lateralSlots(count);
  const out: Partial<Record<PrismSlot, FiveWKey>> = {};
  const overflow: FiveWKey[] = [];
  nextSides.forEach((k, i) => {
    if (!k) return;
    if (i < slotList.length) out[slotList[i]] = k;
    else overflow.push(k);
  });
  const b1 = base1 ?? overflow.shift() ?? null;
  if (b1) out.base1 = b1;
  return out;
}

/** 面から項目を外したときの置き場所。外した項目の中身も空にする側は呼び出し元で。 */
export function withKeyRemoved(
  values: Partial<Record<FiveWKey, string | undefined>>,
  placed: Partial<Record<PrismSlot, FiveWKey>> | undefined,
  title: string,
  key: FiveWKey,
): Partial<Record<PrismSlot, FiveWKey>> {
  const cur = assignFaces(values, placed, title).assigns;
  const kept = cur.filter((a) => a.key && a.key !== key).map((a) => a.key as FiveWKey);
  const count = clampFaces(1 + kept.length);
  const slotList = lateralSlots(count);
  const out: Partial<Record<PrismSlot, FiveWKey>> = {};
  kept.forEach((k, i) => {
    if (i < slotList.length) out[slotList[i]] = k;
    else out.base1 = k;
  });
  return out;
}
