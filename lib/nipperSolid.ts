// ★★改札鋏の立体。**ローポリ（面取りした多角柱の集合）＋フラットシェーディング**。
//
// なぜ要るか … 8巡目までは「背骨に沿って輪郭を掃引し、幅方向を帯に塗り分ける」
// 作りだった。あれは**2Dの輪郭に階調を塗った絵**で、面を持っていない。だから
// 面と面の境（稜線）が生まれず、どこを直しても「塗ったイラスト」に見えた
// （ユーザー評「すごくチープ」）。**輪郭を描くのをやめ、立体を組んで面を落とす。**
//
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。
//
// 局所座標 … **鋲（中央の関節）が原点／+y が上（刃先）／+x が右／+z が手前**。

export interface V3 { x: number; y: number; z: number }
export interface P2 { x: number; y: number }
/** 多角形と、**外を向いた法線**と、そこから引いた**明るさの段**（0=暗い … 5=明るい）。 */
export interface Face { p: V3[]; n: V3; tone: number }
/** 明るさの段の数。`NIPPER_PAINT.ramp` の長さと対。 */
export const TONES = 6;

// ---- 断面 --------------------------------------------------------------
/**
 * ★**断面はこの八角形ひとつだけ**（角を落とした四角＝面取りされた直方体）。
 * 刃も柄も鋲もこれを押し出して作るので、**曲線は一度も出てこない**。
 * `[x, z]` の単位。`hw`（半幅）と `hd`（半分の厚み）で伸ばす。
 */
const C = 0.45;
const SECTION: [number, number][] = [
  [1, C], [C, 1], [-C, 1], [-1, C], [-1, -C], [-C, -1], [C, -1], [1, -C],
];

// ---- 光 ----------------------------------------------------------------
// ★ほぼ真横（左）から、わずかに上・手前。**面の x の向きがそのまま段になる**ように
//   選んである ― 左を向く面ほど明るく、右を向く面ほど暗い。
//     正面 = 2（基本）／左の面取り・左の側面 = 4／右を向く面 = 0
//   ★★段5（最も明るい）は**光へ正面から向いた面にしか出ない**。だから絞りの
//     途中の面取りだけが光る＝ハイライトが**面のわずかな傾きの差**を伝える。
//     光を正面寄りにすると正面も面取りも一緒に白く飛ぶ（9巡目に実際に飛んだ）。
const LIGHT = norm({ x: -0.86, y: 0.30, z: 0.42 });
/** 内積を段へ量子化する幅。**段は6つだけ。境界は硬いまま（グラデーション禁止）。** */
const LIT_LOW = -0.05;
const LIT_SPAN = 1.11;

function norm(v: V3): V3 {
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x,
});

/** 面の向きだけで階調を決める（＝フラットシェーディング）。手で塗らない。 */
export function toneOf(n: V3): number {
  const t = (dot(n, LIGHT) - LIT_LOW) / LIT_SPAN;
  return Math.max(0, Math.min(TONES - 1, Math.round(t * (TONES - 1))));
}

// ---- 押し出し ----------------------------------------------------------
/** 駅。`[y, 半幅, 半分の厚み, x の中心]`。 */
export type Station = [number, number, number, number];

const ring = ([y, hw, hd, cx]: Station, zc: number): V3[] =>
  SECTION.map(([sx, sz]) => ({ x: cx + sx * hw, y, z: zc + sz * hd }));

const neg = (a: V3): V3 => ({ x: -a.x, y: -a.y, z: -a.z });
const face = (p: V3[], n: V3): Face => ({ p, n, tone: toneOf(n) });
const mid = (p: V3[]): V3 => ({
  x: p.reduce((s, q) => s + q.x, 0) / p.length,
  y: p.reduce((s, q) => s + q.y, 0) / p.length,
  z: p.reduce((s, q) => s + q.z, 0) / p.length,
});

/**
 * 断面を駅に沿って押し出す。駅の間の側面は四角形の面、両端は蓋。
 * ★法線は**軸から外を向く**ように揃える（内向きだと明暗が裏返る）。
 */
export function extrude(st: Station[], zc = 0): Face[] {
  const rings = st.map((s) => ring(s, zc));
  const faces: Face[] = [];
  for (let k = 0; k + 1 < rings.length; k++) {
    const a = rings[k], b = rings[k + 1];
    const axis: V3 = { x: (st[k][3] + st[k + 1][3]) / 2, y: (st[k][0] + st[k + 1][0]) / 2, z: zc };
    for (let i = 0; i < SECTION.length; i++) {
      const j = (i + 1) % SECTION.length;
      const p = [a[i], a[j], b[j], b[i]];
      const n = norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
      const out = dot(n, sub(mid(p), axis)) >= 0;
      faces.push(face(out ? p : [...p].reverse(), out ? n : neg(n)));
    }
  }
  faces.push(face([...rings[0]].reverse(), { x: 0, y: -1, z: 0 }));
  faces.push(face(rings[rings.length - 1], { x: 0, y: 1, z: 0 }));
  return faces;
}

// ---- 投影 --------------------------------------------------------------
// ★7巡目に決めた一点透視。**触らない。**
//     proj(p) = { x: p.x + p.z·away.x, y: −p.y + p.z·away.y }
//     away = (鋏の位置 − 画面の中心) ÷ カメラの高さ
//   消失点は画面の中心。**手前の面ほど中心から外へ逃げる**ので、鋏を掴んで
//   動かすとパースが付いてくる（鋏を右に置けば左面、左に置けば右面が見える）。
export const proj = (p: V3, a: P2): P2 => ({ x: p.x + p.z * a.x, y: -p.y + p.z * a.y });

export const toPath = (pts: P2[]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + "Z";

/**
 * 描く面を選んで並べる。
 * 1. **裏の面を落とす**（この投影の視線は `(a.x, a.y, −1)`）。
 * 2. **奥から手前へ**（画家のアルゴリズム）。この投影では奥行きは z そのもの。
 * ★これで腕どうしの隠れが自動で正しくなる。手で細くして誤魔化さなくてよい。
 */
export function drawOrder(faces: Face[], a: P2): { d: string; tone: number }[] {
  return faces
    .filter((f) => f.n.z > f.n.x * a.x + f.n.y * a.y)
    .map((f) => ({ f, z: mid(f.p).z }))
    .sort((u, v) => u.z - v.z)
    .map(({ f }) => ({ d: toPath(f.p.map((q) => proj(q, a))), tone: f.tone }));
}

/**
 * z 軸まわりの短い多角柱（鋲の頭）。★断面は同じ八角形。
 * `extrude` は y に沿ってしか押し出せないので、鋲だけこちらで作る。
 */
export function bossZ(r: number, z0: number, z1: number): Face[] {
  const at = (z: number) => SECTION.map(([sx, sy]) => ({ x: sx * r, y: sy * r, z }));
  const a = at(z0), b = at(z1);
  const faces: Face[] = [];
  for (let i = 0; i < SECTION.length; i++) {
    const j = (i + 1) % SECTION.length;
    const p = [a[i], a[j], b[j], b[i]];
    const n = norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
    const out = dot(n, mid(p)) >= 0;
    faces.push(face(out ? p : [...p].reverse(), out ? n : neg(n)));
  }
  faces.push(face(b, { x: 0, y: 0, z: 1 }));
  return faces;
}

/**
 * 影のための、部品の**輪郭だけ**の多角形（xy 面）。
 * ★面を全部落とすと数が爆発するので、影は輪郭で足りる。
 */
export function outline(st: Station[], zc: number, a: P2): string {
  const side = (s: number) => st.map(([y, hw, , cx]) => proj({ x: cx + s * hw, y, z: zc }, a));
  return toPath([...side(1), ...side(-1).reverse()]);
}
