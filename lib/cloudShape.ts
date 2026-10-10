// ★★★**tips の雲の形はここ1つ**（2026-10-10・第137巡。ユーザー承認の試作から移した）。
//   円を面の上に貼るのではなく、**円と面の距離の場を smooth-min で溶かし合わせた1つの輪郭**を画素ごとに塗る
//   （ユーザー指摘「ピル型に円を適当につけただけに見える」の答え）。左右の円が底の角そのものになり、大きな円が上に乗る。
//   ★雲ごとの「くせ」（こぶの大きさ・位置・数）は種から決める ―― 雲が全部同じ形にならない（ユーザー指定「もう少しランダムに」）。
//   ★閉じた雲と開いた雲は**同じ5つのこぶの席**を持つので、開閉は席ごとに線形に移すだけで1つの雲のまま育つ。
//   ★寸法はすべて絵の寸法（`design.md` §7 目盛りの外）。

type Circle = { x: number; y: number; r: number };
type Box = { x: number; y: number; hw: number; hh: number; rr: number };
export type CloudGeo = { box: Box; bumps: Circle[]; k: number; floor: number; kf: number };
export type Genes = {
  l: number; r: number; b: number; bx: number; by: number;
  extra: boolean; ex: number; er: number; ox: number[]; or: number[];
};

const smin = (a: number, b: number, k: number) => {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const sdC = (x: number, y: number, c: Circle) => Math.hypot(x - c.x, y - c.y) - Math.max(0.1, c.r);
const sdB = (x: number, y: number, b: Box) => {
  const qx = Math.abs(x - b.x) - b.hw + b.rr, qy = Math.abs(y - b.y) - b.hh + b.rr;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - b.rr;
};
const sdCloud = (P: CloudGeo, x: number, y: number) => {
  let d = sdB(x, y, P.box);
  for (const c of P.bumps) d = smin(d, sdC(x, y, c), P.k);
  return -smin(-d, P.floor - y, P.kf); // 底は平らに切る
};

/** 種から雲のくせを作る（同じ種なら同じ形）。 */
export function genesOf(seed: number): Genes {
  let x = Math.sin(seed * 9301 + 49297) * 233280;
  const rnd = () => (x = Math.sin(x) * 10000, x - Math.floor(x));
  return {
    l: 0.30 + rnd() * 0.10, r: 0.25 + rnd() * 0.10, b: 0.44 + rnd() * 0.10, bx: 0.36 + rnd() * 0.26, by: rnd() * 0.08,
    extra: rnd() < 0.55, ex: rnd() < 0.5 ? 0.28 : 0.72, er: 0.26 + rnd() * 0.08,
    ox: [rnd(), rnd(), rnd()].map((v) => (v - 0.5) * 0.14), or: [rnd(), rnd(), rnd()].map((v) => 0.88 + v * 0.24),
  };
}

/** 文字列（tip の id）から種を作る。 */
export const seedOf = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 100003; return (h % 6000) / 1000; };

/**
 * 閉じた雲（w × H）。`ph` はこぶごとの位相 ―― こぶがそれぞれの間合いで 6% 膨らんで縮み、上下にも少し揺れる。
 */
export function closedGeo(w: number, H: number, ph: number[], g: Genes): CloudGeo {
  const R = (r: number, i: number) => r * (1 + 0.06 * Math.sin(ph[i])), dy = (i: number) => H * 0.03 * Math.sin(ph[i] * 0.7 + i);
  const s = Math.min(1.3, Math.max(1, w / (H * 2.1)));
  const rl = H * g.l * s, rr = H * g.r * s, rb = H * g.b;
  const bx = Math.min(w - rr - rb * 0.4, Math.max(rl + rb * 0.4, w * g.bx));
  const Lb = { x: rl, y: H - rl + dy(0), r: R(rl, 0) }, Rt = { x: w - rr, y: H - rr + dy(2), r: R(rr, 2) };
  const top = { x: bx, y: rb + H * g.by + dy(1), r: R(rb, 1) };
  const ex = g.extra ? { x: w * g.ex, y: H * 0.36 + dy(1), r: R(H * g.er, g.ex < 0.5 ? 0 : 2) } : { ...Rt };
  return {
    box: { x: w / 2, y: H * 0.78, hw: w / 2 - H * 0.2, hh: H * 0.22, rr: H * 0.1 }, floor: H, kf: H * 0.22, k: H * 0.12,
    bumps: [Lb, Rt, { ...Lb }, top, ex],
  };
}

/** 開いた雲（w × h）。下の角に円が2つ、上に円が3つ。大きさと位置は雲のくせで少しずつ違える。 */
export function openGeo(w: number, h: number, g: Genes): CloudGeo {
  const lo = 44, hi = 40 * g.or[0], rb = 52 * g.or[1], rt = 36 * g.or[2];
  return {
    box: { x: w / 2, y: (h + 40) / 2, hw: w / 2 - 14, hh: (h - 40) / 2, rr: 20 }, floor: h, kf: 12, k: 16,
    bumps: [{ x: lo, y: h - lo, r: lo }, { x: w - lo + 4, y: h - lo + 4, r: lo - 4 }, { x: hi + 6, y: 18 + hi, r: hi },
      { x: w * (0.52 + g.ox[1]), y: Math.max(rb, 46), r: rb }, { x: w - 4 - rt, y: 30 + rt, r: rt }],
  };
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpGeo = (A: CloudGeo, B: CloudGeo, t: number): CloudGeo => ({
  box: {
    x: mix(A.box.x, B.box.x, t), y: mix(A.box.y, B.box.y, t), hw: Math.max(1, mix(A.box.hw, B.box.hw, t)),
    hh: Math.max(1, mix(A.box.hh, B.box.hh, t)), rr: Math.max(0, mix(A.box.rr, B.box.rr, t)),
  },
  bumps: A.bumps.map((c, i) => ({ x: mix(c.x, B.bumps[i].x, t), y: mix(c.y, B.bumps[i].y, t), r: mix(c.r, B.bumps[i].r, t) })),
  k: Math.max(0, mix(A.k, B.k, t)), floor: mix(A.floor, B.floor, t), kf: Math.max(0, mix(A.kf, B.kf, t)),
});
export const shiftGeo = (P: CloudGeo, dx: number, dy: number): CloudGeo => ({
  ...P, box: { ...P.box, x: P.box.x + dx, y: P.box.y + dy }, bumps: P.bumps.map((c) => ({ ...c, x: c.x + dx, y: c.y + dy })), floor: P.floor + dy,
});

const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * 雲を canvas へ塗る。`pad` ＝ 器の外へ描ける幅（開くときは行き過ぎで膨らむぶん広く取る）。
 * ★canvas の位置と大きさもここで合わせる（器の外へ `pad` だけはみ出す）。
 */
export function paintCloud(cv: HTMLCanvasElement, P: CloudGeo, w: number, h: number, color: string, pad: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.ceil((w + pad * 2) * dpr), Hh = Math.ceil((h + pad * 2) * dpr);
  if (cv.width !== W || cv.height !== Hh) {
    cv.width = W; cv.height = Hh;
    Object.assign(cv.style, { left: `${-pad}px`, top: `${-pad}px`, width: `${w + pad * 2}px`, height: `${h + pad * 2}px` });
  }
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const [r, g, b] = rgbOf(color);
  const im = ctx.createImageData(W, Hh), d = im.data;
  for (let j = 0; j < Hh; j++) {
    const y = (j + 0.5) / dpr - pad;
    for (let i = 0; i < W; i++) {
      const x = (i + 0.5) / dpr - pad, q = sdCloud(P, x, y) * dpr;
      if (q >= 0.5) continue;
      const o = (j * W + i) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = q <= -0.5 ? 255 : Math.round((0.5 - q) * 255);
    }
  }
  ctx.putImageData(im, 0, 0);
}
