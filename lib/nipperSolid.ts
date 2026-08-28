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
// ★面取りの深さ。**0.45 は深すぎ（明るい左の帯が広く走る）／0.80 は浅すぎ**
//   （面が減って厚みが消え、板に見える。11巡目に実際にそうなった）。0.60 が両立点。
const C = 0.60;
const SECTION: [number, number][] = [
  [1, C], [C, 1], [-C, 1], [-1, C], [-1, -C], [-C, -1], [C, -1], [1, -C],
];

// ---- 光 ----------------------------------------------------------------
// ★ほぼ真横（左）から、わずかに上・手前。**面の x の向きがそのまま段になる**ように
//   選んである ― 左を向く面ほど明るく、右を向く面ほど暗い。
//     正面 = 3（基本）／天 = 4／左の側面 = 4／右の面取り = 1／右の側面 = 0
//   ★正面を暗い段に置くと、白地の上で道具全体が黒っぽく沈む（11巡目に実測）。
//   ★★**段の幅を広く取って、見える面を真ん中に寄せる**（12巡目）。狭くすると
//     左の縁が真っ白・右の縁が真っ黒になり、参考の道具（明暗の幅が狭い鋼）から
//     離れる。段5は光へ正面から向いた面にしか出ない＝まれなハイライトでよい。
//   ★★段5（最も明るい）は**光へ正面から向いた面にしか出ない**。だから絞りの
//     途中の面取りだけが光る＝ハイライトが**面のわずかな傾きの差**を伝える。
//     光を正面寄りにすると正面も面取りも一緒に白く飛ぶ（9巡目に実際に飛んだ）。
const LIGHT = norm({ x: -0.86, y: 0.30, z: 0.42 });
/**
 * ★**天からの拾い光**。上を向いた面だけを持ち上げる（空の照り返し）。
 * これが無いと、真横から当てた光では**天面と正面が同じ段**になって、
 * 見下ろしているのに塊の天が立たない（11巡目に実測）。
 */
const SKY = 0.45;
/** 内積を段へ量子化する幅。**段は6つだけ。境界は硬いまま（グラデーション禁止）。** */
const LIT_LOW = -0.895;
const LIT_SPAN = 2.19;

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
  const t = (dot(n, LIGHT) + SKY * n.y - LIT_LOW) / LIT_SPAN;
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
    // ★★y の符号に注意。法線は局所座標（+y が上）だが、画面は y が下向きなので、
    //   カメラの向きと内積を取るときに **+n.y·a.y** になる（−ではない）。
    //   10巡目まで − にしていたせいで**上を向いた面が常に落ちていた** ―
    //   見下ろしているのに頭の天面が一度も描かれず、絵が平たく見えていた。
    .filter((f) => f.n.z + f.n.y * a.y > f.n.x * a.x)
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
 * 任意の3D折れ線に沿った**管**（針金）。断面は同じ八角形なので曲線は出てこない。
 * ★接線から枠（法線・従法線）を作って断面を立てる。バネの針金に使う。
 */
export function tube(path: V3[], r: number): Face[] {
  const rings = path.map((p, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const t = norm(sub(b, a));
    // 参照は z 軸。接線がそれとほぼ平行なときだけ y 軸へ逃がす。
    const ref: V3 = Math.abs(t.z) > 0.9 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
    const u = norm(cross(ref, t)), v = cross(t, u);
    return SECTION.map(([sx, sz]) => ({
      x: p.x + (u.x * sx + v.x * sz) * r,
      y: p.y + (u.y * sx + v.y * sz) * r,
      z: p.z + (u.z * sx + v.z * sz) * r,
    }));
  });
  const faces: Face[] = [];
  for (let k = 0; k + 1 < rings.length; k++) {
    const a = rings[k], b = rings[k + 1];
    const axis = mid([path[k], path[k + 1]]);
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

/** 軸に沿った直方体。★面取りしない ― 溝や欠きのための素直な箱。 */
export function slab(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Face[] {
  const P = (x: number, y: number, z: number): V3 => ({ x, y, z });
  const q = [
    [[P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], { x: 0, y: 0, z: 1 }],
    [[P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0)], { x: 0, y: 0, z: -1 }],
    [[P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1)], { x: 1, y: 0, z: 0 }],
    [[P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)], { x: -1, y: 0, z: 0 }],
    [[P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], { x: 0, y: 1, z: 0 }],
    [[P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], { x: 0, y: -1, z: 0 }],
  ] as const;
  return q.map(([p, n]) => face([...p], n));
}

/**
 * 面を裏返す ＝ **凹み**にする。内側の壁が見えるようになり、階調も内向きで引き直す。
 * ★手前を向いていた蓋は自動で裏になって落ちるので、覗き込んだ穴になる。
 */
export const invert = (faces: Face[]): Face[] =>
  faces.map((f) => face([...f.p].reverse(), neg(f.n)));

// ---- 正射影の三面図（★開発用の検証にだけ使う） -----------------------------
// 形を言葉で詰めるには、パースの付いた1枚では足りない。**正面・側面・上面**を
// 素直な正射影で出して、面ごとに指摘できるようにする。
// ★この道具の機構は x–y 面にある（腕はここで開く）ので、**正面図が実物の側面写真に
//   あたる**。側面図は厚み、上面図は頭の断面を見る。
export type Ortho = "front" | "side" | "top";

// ★★三面図は**それぞれの視点から照らし直す**。本番の固定光をそのまま使うと、
//   側面図が真っ黒になって形が読めない（検証にならない）。
//   光はどの図でも「見る人の左上・手前」から。
const ORTHO: Record<Ortho, {
  to: (p: V3) => P2; depth: (p: V3) => number; facing: (n: V3) => number; light: V3;
}> = {
  /** 正面（+z から見る）。機構の面。 */
  front: {
    to: (p) => ({ x: p.x, y: -p.y }), depth: (p) => p.z, facing: (n) => n.z,
    light: norm({ x: -0.66, y: 0.42, z: 0.62 }),
  },
  /** 側面（+x ＝ 右から見る）。厚み。 */
  side: {
    to: (p) => ({ x: -p.z, y: -p.y }), depth: (p) => p.x, facing: (n) => n.x,
    light: norm({ x: 0.62, y: 0.42, z: 0.66 }),
  },
  /** 上面（+y ＝ 上から見る）。手前が下。 */
  top: {
    to: (p) => ({ x: p.x, y: p.z }), depth: (p) => p.y, facing: (n) => n.y,
    light: norm({ x: -0.66, y: 0.62, z: -0.42 }),
  },
};

export function orthoOrder(faces: Face[], view: Ortho): { d: string; tone: number }[] {
  const v = ORTHO[view];
  const tone = (n: V3) => {
    const t = (dot(n, v.light) - LIT_LOW) / LIT_SPAN;
    return Math.max(0, Math.min(TONES - 1, Math.round(t * (TONES - 1))));
  };
  return faces
    .filter((f) => v.facing(f.n) > 0.001)
    .map((f) => ({ f, z: v.depth(mid(f.p)) }))
    .sort((a, b) => a.z - b.z)
    .map(({ f }) => ({ d: toPath(f.p.map(v.to)), tone: tone(f.n) }));
}

/** 三面図の枠を決めるための、投影後の広がり。 */
export function orthoBounds(faces: Face[], view: Ortho) {
  const v = ORTHO[view];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const f of faces) for (const p of f.p) {
    const q = v.to(p);
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x);
    y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
