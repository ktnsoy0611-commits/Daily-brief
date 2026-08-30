// ★★開発用。**なぞって得たパスを「整理」する**（22巡目）。
//
//   node tools/trace-nipper.mjs …  → lib/nipperShapeRaw.ts（生のトレース）
//   npx tsx tools/clean-nipper.mts → lib/nipperShape.ts    （整理済み。立体はこれを読む）
//
//   ★★シルエットは変えない。やるのは3つだけ:
//     ・無駄な点を減らす（潰れた辺・同じ向きの直線の連続）
//     ・直線をまっすぐにする（軸へ吸着し、近い座標を1つに揃える）
//     ・ガタついた折れ線を弧にする
//   ★スリットだけは**指定どおりの造形**（軸平行の長方形）なので、許容の外。
//
//   ★★元データは docs/archive/nipper-shape-21.ts に凍結してある。**消さない。**
import { writeFileSync } from "node:fs";
import {
  NIPPER_COIL, NIPPER_EXTENT, NIPPER_LEFT_PIECES, NIPPER_PIVOT, NIPPER_RIGHT_PIECES, NIPPER_SLOT,
} from "../lib/nipperShapeRaw";
import type { NipperEdge, NipperPiece, P2 } from "../lib/nipperPath";
// ★面取りの幅は `lib/nipperMesh.ts` が持ち主。ここで数字を書き写さない。
import { CHAMFER } from "../lib/nipperMesh";

// ---- 目盛り（触るのはここだけ） -------------------------------------------
/** シルエットがずれてよい量（単位）。図の線の太さは 4.4。 */
const TOL = 6;
/** これより短い辺は潰れているとみなす。 */
const MIN_EDGE = 5;
/** 直線をまとめてよい向きの差（度）。 */
const MERGE_DEG = 8;
/** これより急に折れていたら「カーブ」ではなく**角**（弧に置き換えない）。 */
const MAX_TURN_DEG = 40;
/** 軸に吸着させる幅／座標を1つに揃えるクラスタの幅。 */
const SNAP = 4;
/** 弧の膨らみがこれ未満なら直線に戻す。★大きいだけの本物の緩いカーブは残す。 */
const FLAT_SAG = 2.5;
/** スリットの溝（★軸平行の長方形。指定どおりの造形）。 */
//   ★幅は面取り(7)の2倍より広く取る。狭いと寄せた輪郭が潰れて bevel が破綻する。
//   ★元の溝は右へ 50 ほど傾いているので、垂直にすると下で 36 ほどずれる（指定どおり）。
const SLOT = { xL: 155, xR: 175, yBottom: -229 };

/**
 * ★持ち手の**内側**を削る（図面はパースで持ち手が太い。**外側と先端の底は正しい**）。
 * 値は**ユーザーのスクショの青い線から実測**した（23巡目・比較 左764行／右751行）。
 * ★青い線の太さは 13px ＝ 約9.7単位あるので、**線の内側の縁**（＝残す材料の境目）で
 *   測る。中心で測ると全体に約5単位ぶん多く出て、削る量 0 のはずの上端でも 6 出る。
 * ★左右で実測が違った（右15／左9）が、これは**パースの見え方の差**なので
 *   （右の持ち手だけ内側の側面が見えている）、ユーザー確定で**平均を左右に当てる**。
 */
const SHAVE = {
  /** これより下を「持ち手」とみなす。 */
  topY: -360,
  /** いちばん削る量（単位）。t=0 が頭との付け根、t=1 が内側のベベルの付け根。 */
  max: 12,
  /** ここまでで max に達する（なめらかに立ち上げる）。 */
  ramp: 0.7,
  /**
   * ★その高さの**正面の面の幅**（＝幅 − 面取り2つ）に対する上限。
   * これが**先端を守る** ―― 右の内側のベベルは横に 11 単位しか走っていないので、
   * 根元を 12 動かすとベベルが裏返る。実測でも先端では青い線が縁へ戻っていた。
   */
  cap: 0.30,
};

// ---- 小道具 ---------------------------------------------------------------
const TAU = Math.PI * 2;
const hyp = (a: P2, b: P2) => Math.hypot(b.x - a.x, b.y - a.y);
const wrap = (t: number) => ((t % TAU) + TAU) % TAU;
const deg = (r: number) => (r * 180) / Math.PI;

/** 弧の掃き角（回る向きこみ）。 */
const sweepOf = (from: P2, e: NipperEdge) => {
  const c = e.c!;
  const a0 = Math.atan2(from.y - c.y, from.x - c.x);
  const a1 = Math.atan2(e.to.y - c.y, e.to.x - c.x);
  return e.ccw ? wrap(a1 - a0) : -wrap(a0 - a1);
};

/** 辺を点に開く（`lib/nipperMesh.ts` の `flattenPiece` と同じ刻み）。 */
function openEdge(from: P2, e: NipperEdge, step = Math.PI / 45): P2[] {
  if (!e.r || !e.c) return [e.to];
  const d = sweepOf(from, e);
  const n = Math.max(1, Math.ceil(Math.abs(d) / step));
  const c = e.c, a0 = Math.atan2(from.y - c.y, from.x - c.x);
  const out: P2[] = [];
  for (let i = 1; i <= n; i++) {
    const t = a0 + (d * i) / n;
    out.push({ x: c.x + Math.cos(t) * e.r, y: c.y + Math.sin(t) * e.r });
  }
  return out;
}

/** 片を点の列に開く。 */
function toPoints(pc: NipperPiece, step = Math.PI / 90): P2[] {
  const out: P2[] = [pc.start];
  let cur = pc.start;
  for (const e of pc.edges) { const seg = openEdge(cur, e, step); out.push(...seg); cur = seg[seg.length - 1]; }
  return out;
}

/** 点から線分までの距離。 */
function distSeg(p: P2, a: P2, b: P2) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
/** 点から折れ線までの最短距離。 */
const distPath = (p: P2, poly: P2[]) => {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = distSeg(p, poly[i], poly[(i + 1) % poly.length]);
    if (d < m) m = d;
  }
  return m;
};

/** 最小二乗の円あて（Taubin）。トレース側と同じ。 */
function fitCircle(pts: P2[]) {
  const n = pts.length;
  if (n < 4) return null;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p.x; my += p.y; }
  mx /= n; my /= n;
  let Suu = 0, Suv = 0, Svv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
  for (const p of pts) {
    const u = p.x - mx, v = p.y - my;
    Suu += u * u; Svv += v * v; Suv += u * v;
    Suuu += u * u * u; Svvv += v * v * v; Suvv += u * v * v; Svuu += v * u * u;
  }
  const det = Suu * Svv - Suv * Suv;
  if (Math.abs(det) < 1e-9) return null;
  const c1 = (Suuu + Suvv) / 2, c2 = (Svvv + Svuu) / 2;
  const uc = (c1 * Svv - c2 * Suv) / det, vc = (c2 * Suu - c1 * Suv) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (Suu + Svv) / n);
  if (!isFinite(r) || r <= 0) return null;
  return { c: { x: mx + uc, y: my + vc }, r };
}

// ---- 規則1: 潰れた辺を落とす ----------------------------------------------
function dropTiny(pc: NipperPiece): NipperPiece {
  const edges: NipperEdge[] = [];
  let cur = pc.start;
  for (const e of pc.edges) {
    if (hyp(cur, e.to) < MIN_EDGE && edges.length) {
      // 前の辺の終点をここまで伸ばして吸収する
      edges[edges.length - 1] = { ...edges[edges.length - 1], to: e.to };
      cur = e.to;
      continue;
    }
    edges.push(e); cur = e.to;
  }
  // 最後の辺が始点に戻りきらない場合は閉じる
  const last = edges[edges.length - 1];
  if (last && hyp(last.to, pc.start) > 1e-6) edges[edges.length - 1] = { ...last, to: pc.start };
  return { ...pc, edges };
}

// ---- 規則2: 同じ向きの直線をまとめる --------------------------------------
function mergeLines(pc: NipperPiece): NipperPiece {
  for (;;) {
    let done = true;
    const edges = pc.edges;
    let cur = pc.start;
    for (let i = 0; i + 1 < edges.length; i++) {
      const a = edges[i], b = edges[i + 1];
      const from = cur;
      cur = a.to;
      if (a.r || b.r) continue;
      if (!!a.inner !== !!b.inner) continue;          // 段の境目の印はまたがない
      const t1 = Math.atan2(a.to.y - from.y, a.to.x - from.x);
      const t2 = Math.atan2(b.to.y - a.to.y, b.to.x - a.to.x);
      let d = deg(t2 - t1); d = ((d + 540) % 360) - 180;
      if (Math.abs(d) > MERGE_DEG) continue;
      // まとめたときのずれ（消える角の、新しい弦からの距離）
      if (distSeg(a.to, from, b.to) > TOL) continue;
      pc = { ...pc, edges: [...edges.slice(0, i), { ...b }, ...edges.slice(i + 2)] };
      done = false;
      break;
    }
    if (done) break;
  }
  return pc;
}

// ---- 規則3: 軸へ吸着し、近い座標を1つに揃える -----------------------------
/** 端点を動かしたあと、**同じ半径・同じ回る向きで両端を通る**ように弧の中心を引き直す。 */
function recentre(from: P2, e: NipperEdge): NipperEdge {
  if (!e.r || !e.c) return e;
  const mx = (from.x + e.to.x) / 2, my = (from.y + e.to.y) / 2;
  const dx = e.to.x - from.x, dy = e.to.y - from.y;
  const half = Math.hypot(dx, dy) / 2;
  const r = Math.max(e.r, half + 1e-6);              // 端が離れすぎたら半径を広げる
  const h = Math.sqrt(Math.max(0, r * r - half * half));
  // 弦の左右どちらに中心が来るかは、いまの中心と同じ側に合わせる
  const nx = -dy / (half * 2 || 1), ny = dx / (half * 2 || 1);
  const side = (e.c.x - mx) * nx + (e.c.y - my) * ny >= 0 ? 1 : -1;
  return { ...e, r, c: { x: mx + nx * h * side, y: my + ny * h * side } };
}

function snapAxes(pc: NipperPiece): NipperPiece {
  // 端点をぜんぶ集める（始点＝最後の辺の終点）
  const pts: P2[] = [pc.start, ...pc.edges.map((e) => ({ ...e.to }))];
  const n = pts.length;
  // (a) 軸に近い辺は、両端を平均へ寄せて完全に軸平行にする
  for (let i = 0; i + 1 < n; i++) {
    const a = pts[i], b = pts[i + 1];
    if (Math.abs(b.x - a.x) < SNAP && Math.abs(b.x - a.x) > 0) {
      const m = (a.x + b.x) / 2; a.x = m; b.x = m;
    }
    if (Math.abs(b.y - a.y) < SNAP && Math.abs(b.y - a.y) > 0) {
      const m = (a.y + b.y) / 2; a.y = m; b.y = m;
    }
  }
  // (b) 近い座標をクラスタにして1つへ揃える（x=12.3 と x=12.8 を両方 x=13 に）
  const unify = (key: "x" | "y") => {
    const order = pts.map((_, i) => i).sort((i, j) => pts[i][key] - pts[j][key]);
    let k = 0;
    while (k < order.length) {
      let j = k;
      while (j + 1 < order.length && pts[order[j + 1]][key] - pts[order[k]][key] < SNAP) j++;
      if (j > k) {
        let m = 0;
        for (let t = k; t <= j; t++) m += pts[order[t]][key];
        m = Math.round((m / (j - k + 1)) * 10) / 10;
        for (let t = k; t <= j; t++) pts[order[t]][key] = m;
      }
      k = j + 1;
    }
  };
  unify("x"); unify("y");
  // 始点と最後の終点は同じ点なので合わせ直す
  pts[n - 1] = { ...pts[0] };
  const edges = pc.edges.map((e, i) => recentre(pts[i], { ...e, to: pts[i + 1] }));
  return { ...pc, start: pts[0], edges };
}

// ---- 規則4: 折れ線のカーブを弧にする --------------------------------------
function linesToArc(pc: NipperPiece): NipperPiece {
  for (;;) {
    const edges = pc.edges;
    let cur = pc.start, replaced = false;
    for (let i = 0; i < edges.length && !replaced; i++) {
      if (edges[i].r) { cur = edges[i].to; continue; }
      // 同じ向きに曲がり続ける直線の並びを探す
      const from = cur;
      let j = i, sign = 0;
      const pts: P2[] = [from];
      while (j < edges.length && !edges[j].r && !!edges[j].inner === !!edges[i].inner) {
        pts.push(edges[j].to);
        if (pts.length >= 3) {
          const a = pts[pts.length - 3], b = pts[pts.length - 2], c = pts[pts.length - 1];
          const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
          const s = cr > 0 ? 1 : cr < 0 ? -1 : 0;
          // ★★急な折れは「カーブ」ではなく**角**。ここを見ないと、直角3つの
          //   長方形（スリット）にまで円を当ててしまう（22巡目に実測）。
          let turn = deg(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x));
          turn = Math.abs(((turn + 540) % 360) - 180);
          if (s === 0 || turn > MAX_TURN_DEG) { pts.pop(); break; }
          if (sign === 0) sign = s;
          else if (s !== sign) { pts.pop(); break; }
        }
        j++;
      }
      const used = pts.length - 1;
      if (used >= 3) {
        const fit = fitCircle(pts);
        if (fit) {
          let worst = 0;
          for (const p of pts) worst = Math.max(worst, Math.abs(hyp(p, fit.c) - fit.r));
          if (worst <= TOL) {
            const to = pts[pts.length - 1];
            const a0 = Math.atan2(from.y - fit.c.y, from.x - fit.c.x);
            const a1 = Math.atan2(to.y - fit.c.y, to.x - fit.c.x);
            // 中点が掃きの中に入る向きを採る（20巡目と同じ決め方）
            const mid = pts[pts.length >> 1];
            const am = wrap(Math.atan2(mid.y - fit.c.y, mid.x - fit.c.x) - a0);
            const ccw = am <= wrap(a1 - a0);
            const arc: NipperEdge = {
              to, r: fit.r, c: fit.c, ccw, inner: edges[i].inner,
            };
            pc = { ...pc, edges: [...edges.slice(0, i), arc, ...edges.slice(i + used)] };
            replaced = true;
            break;
          }
        }
      }
      cur = edges[i].to;
    }
    if (!replaced) break;
  }
  return pc;
}

// ---- 規則5: ほぼ直線の弧を直線に戻す --------------------------------------
function flattenArcs(pc: NipperPiece): NipperPiece {
  let cur = pc.start;
  const edges = pc.edges.map((e) => {
    const from = cur; cur = e.to;
    if (!e.r || !e.c) return e;
    const half = hyp(from, e.to) / 2;
    const sag = e.r - Math.sqrt(Math.max(0, e.r * e.r - half * half));
    if (sag >= FLAT_SAG) return e;
    return { to: e.to, inner: e.inner };
  });
  return { ...pc, edges };
}

// ---- 規則6: スリットを作り直す（★指定どおりの造形。許容の外） --------------
//   口 … 天から溝の肩まで**直線2本**（角はシャープ）
//   溝 … **軸平行の長方形**。左右の壁は垂直、底は水平。曲線は使わない。
function rebuildSlot(pc: NipperPiece): NipperPiece {
  const pts: P2[] = [pc.start, ...pc.edges.map((e) => ({ ...e.to }))];
  // ★スリットの範囲は**元の bbox**で決める（少し広げて拾う）。
  //   「天に近い点」などの当てずっぽうで探すと、始点（202.4, 0）を拾って
  //   輪郭の大半を切り落とす（22巡目に実測 ― ずれが 675 になった）。
  const inBox = (p: P2) => p.x > NIPPER_SLOT.x0 - 10 && p.x < NIPPER_SLOT.x1 + 10
    && p.y > NIPPER_SLOT.y0 - 10 && p.y < NIPPER_SLOT.y1 - 10;
  let i0 = -1, i1 = -1;
  for (let i = 0; i < pts.length; i++) {
    if (!inBox(pts[i])) continue;
    let j = i;
    while (j + 1 < pts.length && inBox(pts[j + 1])) j++;
    if (j - i > i1 - i0) { i0 = i; i1 = j; }
    i = j;
  }
  if (i0 < 0 || i1 - i0 < 4) return pc;
  // 口の肩（＝溝の上端）の高さは、元の2点目の高さをそのまま使う
  const yShoulder = Math.max(pts[i0 + 1].y, pts[i1].y);
  const rebuilt: NipperEdge[] = [
    { to: { x: SLOT.xL, y: yShoulder } },        // 口の左の斜め（直線・角はシャープ）
    { to: { x: SLOT.xL, y: SLOT.yBottom } },     // 溝の左の壁（垂直）
    { to: { x: SLOT.xR, y: SLOT.yBottom } },     // 溝の底（水平）
    { to: { x: SLOT.xR, y: yShoulder } },        // 溝の右の壁（垂直）
  ];
  // pts[i] は edges[i-1] の終点。i0 の点は残し、i0+1〜i1 を置き換える。
  return { ...pc, edges: [...pc.edges.slice(0, i0), ...rebuilt, ...pc.edges.slice(i1)] };
}

// ---- 規則8: 持ち手の内側を削る --------------------------------------------
/** なめらかな立ち上がり（0→1）。 */
const smooth = (t: number) => { const u = t < 0 ? 0 : t > 1 ? 1 : t; return u * u * (3 - 2 * u); };

/**
 * 走査線ごとの、持ち手の**内側と外側**の x（内側＝道具の中心線 x=0 に近いほう）。
 */
function widthAt(pc: NipperPiece) {
  const poly = toPoints(pc, Math.PI / 180);
  return (y: number): [number, number] | null => {
    const xs: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) xs.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
    }
    if (xs.length < 2) return null;
    xs.sort((m, n) => m - n);
    const lo = xs[0], hi = xs[xs.length - 1];
    return Math.abs(lo) < Math.abs(hi) ? [lo, hi] : [hi, lo];   // [内, 外]
  };
}

/** 3点を通る円。★端点を動かしたあとの弧はこれで引き直す（3点で一意に決まる）。 */
function circleThrough(a: P2, b: P2, c: P2) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const sa = a.x * a.x + a.y * a.y, sb = b.x * b.x + b.y * b.y, sc = c.x * c.x + c.y * c.y;
  const cx = (sa * (b.y - c.y) + sb * (c.y - a.y) + sc * (a.y - b.y)) / d;
  const cy = (sa * (c.x - b.x) + sb * (a.x - c.x) + sc * (b.x - a.x)) / d;
  return { c: { x: cx, y: cy }, r: Math.hypot(a.x - cx, a.y - cy) };
}

/** 弧の中点（掃きの半分のところ）。 */
const arcMid = (from: P2, e: NipperEdge): P2 => {
  const c = e.c!, t = Math.atan2(from.y - c.y, from.x - c.x) + sweepOf(from, e) / 2;
  return { x: c.x + Math.cos(t) * e.r!, y: c.y + Math.sin(t) * e.r! };
};

interface Shaved {
  pc: NipperPiece; head: P2; root: P2; arcs: number;
  /** 根元で削った量。 */ peak: number;
  /** 弧を引き直したときの、狙いからの最大のずれ。 */ off: number;
  /** 内側のベベルに残った横の走り。 */ bevel: number;
}

/**
 * 持ち手の内側の弧を、`SHAVE` のぶんだけ**外側へ水平に**ずらす。
 * ★**辺の番号は書かない。走って見つける** ―― 辺の番号を書くと、整理の規則を
 *   変えたとたんに別の場所を削りにいく（22巡目にスリットで実際に起きた）。
 * ★弧は**始点・中点・終点の3点**を動かして引き直すので、**辺の数は変わらない**。
 */
function shaveInner(pc: NipperPiece): Shaved | null {
  const W = widthAt(pc);
  const isInner = (p: P2) => {
    if (p.y > SHAVE.topY) return false;
    const w = W(p.y);
    return !!w && Math.abs(p.x - w[0]) < Math.abs(p.x - w[1]);
  };
  // 内側に載っている弧が、いちばん長く連なったところ。
  // ★**両端とも**内側であること ―― 終点だけ見ると、頭から降りてくる弧
  //   （左では段の境目の印を持つ辺）まで巻き込む。
  const startOf0 = (i: number) => (i === 0 ? pc.start : pc.edges[i - 1].to);
  const ok = (i: number) => !!pc.edges[i].r && isInner(pc.edges[i].to) && isInner(startOf0(i));
  let best = { i: -1, len: 0 };
  for (let i = 0; i < pc.edges.length; i++) {
    if (!ok(i)) continue;
    let j = i;
    while (j < pc.edges.length && ok(j)) j++;
    if (j - i > best.len) best = { i, len: j - i };
    i = j;
  }
  if (best.len < 2) return null;

  const i0 = best.i, i1 = best.i + best.len;
  const startOf = (i: number) => (i === 0 ? pc.start : pc.edges[i - 1].to);
  const ends: [P2, P2] = [startOf(i0), pc.edges[i1 - 1].to];
  // ★**辿る向きは片によって逆**（右は下から上、左は上から下）。y で決める ――
  //   辺の並び順で決めると、片方だけ t が裏返って上下逆に削れる。
  const head = ends[0].y > ends[1].y ? ends[0] : ends[1];   // 頭との付け根（削る量 0）
  const root = ends[0].y > ends[1].y ? ends[1] : ends[0];   // 内側のベベルの付け根（最大）
  const w0 = W(head.y)!;
  const dir = Math.sign(w0[1] - w0[0]);                     // 中心線から遠ざかる向き

  const shave = (p: P2) => {
    const t = (p.y - head.y) / (root.y - head.y);
    const w = W(p.y);
    const face = w ? Math.abs(w[1] - w[0]) - 2 * CHAMFER : Infinity;
    return Math.min(SHAVE.max * smooth(t / SHAVE.ramp), SHAVE.cap * face);
  };
  const move = (p: P2): P2 => ({ x: p.x + dir * shave(p), y: p.y });

  const edges = pc.edges.map((e) => ({ ...e }));
  let cur = startOf(i0), off = 0;
  for (let i = i0; i < i1; i++) {
    const e = edges[i], from = cur;
    const a = move(from), b = move(arcMid(from, e)), c = move(e.to);
    cur = e.to;
    const fit = circleThrough(a, b, c);
    if (!fit) continue;
    // 回る向きは「中点が掃きの中に来るほう」を採る（`linesToArc` と同じ決め方）
    let put: NipperEdge = { ...e, to: c, r: fit.r, c: fit.c, ccw: true };
    if (hyp(arcMid(a, put), b) > hyp(arcMid(a, { ...put, ccw: false }), b)) put = { ...put, ccw: false };
    edges[i] = put;
    // 狙い（元の弧を細かく開いて動かした点）が、引き直した円からどれだけ外れるか。
    // ★円までの距離は | |p−中心| − 半径 | で厳密に出る（総当たりは要らない）。
    for (const q of [a, ...openEdge(from, e, Math.PI / 90).map((r) => move(r))]) {
      const d = Math.abs(hyp(q, fit.c) - fit.r);
      if (d > off) off = d;
    }
  }
  // ★run の**始点**は「1つ前の辺の終点」なので、そこも動かす ―― 右の片は
  //   始点が根元なので、直さないと弧が実際の始点を通らなくなる（浮いて隙間が出る）。
  //   頭の側は削る量 0 なので、どちらの向きでも安全。
  let start = pc.start;
  if (i0 === 0) start = move(pc.start);
  else edges[i0 - 1] = { ...edges[i0 - 1], to: move(startOf(i0)) };
  const out = { ...pc, start, edges };
  // 内側のベベル … 根元の側で run に隣り合う辺。その横の走りが残っているか。
  const outStartOf = (i: number) => (i === 0 ? out.start : out.edges[i - 1].to);
  const bevel = startOf(i0).y === root.y
    ? Math.abs(outStartOf(i0).x - outStartOf(i0 - 1 < 0 ? out.edges.length - 1 : i0 - 1).x)
    : Math.abs(out.edges[i1 - 1].to.x - out.edges[i1 % out.edges.length].to.x);
  return {
    pc: out, head, root, arcs: best.len,
    peak: shave(root), off, bevel,
  };
}

// ---- 規則7: 面取りの余裕を確かめる ----------------------------------------
/** いちばん細いくびれ（向かい合う辺の距離）。面取り 7 を両側から取るので 14 は要る。 */
function narrowest(pc: NipperPiece) {
  const poly = toPoints(pc, Math.PI / 30);
  let m = Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    for (let j = i + 6; j < poly.length - 2; j += 2) {
      // 輪郭に沿って十分に離れている点どうしだけを見る（隣は当然近い）
      const along = Math.min(j - i, poly.length - (j - i));
      if (along < 8) continue;
      const d = hyp(poly[i], poly[j]);
      if (d < m) m = d;
    }
  }
  return m;
}

// ---- 走らせる -------------------------------------------------------------
const round = (v: number) => Math.round(v * 10) / 10;
const fmtP = (p: P2) => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;
const stats = (pc: NipperPiece) => {
  const arcs = pc.edges.filter((e) => e.r).length;
  let axis = 0, tiny = 0, cur = pc.start;
  for (const e of pc.edges) {
    if (Math.abs(e.to.x - cur.x) < 1e-9 || Math.abs(e.to.y - cur.y) < 1e-9) axis++;
    if (hyp(cur, e.to) < MIN_EDGE) tiny++;
    cur = e.to;
  }
  return { edges: pc.edges.length, lines: pc.edges.length - arcs, arcs, axis, tiny };
};

const NAMES = ["右 t0", "左 t0", "左 t1"];
const rawAll: NipperPiece[] = [...NIPPER_RIGHT_PIECES, ...NIPPER_LEFT_PIECES];
const cleanAll: NipperPiece[] = [];

rawAll.forEach((rawPc, k) => {
  let pc: NipperPiece = { ...rawPc, edges: rawPc.edges.map((e) => ({ ...e })) };
  pc = dropTiny(pc);
  pc = mergeLines(pc);
  pc = linesToArc(pc);
  pc = flattenArcs(pc);
  pc = snapAxes(pc);
  // ★スリットは**いちばん最後**に作る。先に作ると、あとの規則が直角を丸めてしまう。
  if (k === 0) pc = rebuildSlot(pc);
  // ★持ち手を削るのも最後（先にやると、あとの規則が削った弧を当て直す）。
  const sh = shaveInner(pc);
  if (sh) pc = sh.pc;
  pc = dropTiny(pc);
  // 座標を 0.1 に丸める
  pc = {
    ...pc,
    start: { x: round(pc.start.x), y: round(pc.start.y) },
    edges: pc.edges.map((e) => ({
      ...e, to: { x: round(e.to.x), y: round(e.to.y) },
      ...(e.r ? { r: round(e.r), c: { x: round(e.c!.x), y: round(e.c!.y) } } : {}),
    })),
  };
  cleanAll.push(pc);

  // --- 検証の数値 ---
  const a = stats(rawPc), b = stats(pc);
  const rawPts = toPoints(rawPc, Math.PI / 180);
  const cleanPts = toPoints(pc, Math.PI / 180);
  let worst = 0, worstSlot = 0, worstShave = 0;
  const inSlot = (p: P2) => k === 0 && p.x > SLOT.xL - 60 && p.x < SLOT.xR + 60 && p.y > SLOT.yBottom - 20 && p.y < 20;
  // ★削った持ち手の内側は**意図して形を変えた**ので、シルエットの検査から外して別に出す。
  const rawW = widthAt(rawPc);
  const inShave = (p: P2) => {
    if (!sh || p.y > SHAVE.topY) return false;
    const w = rawW(p.y);
    return !!w && Math.abs(p.x - w[0]) < Math.abs(p.x - w[1]);   // 内側の縁だけ
  };
  for (const p of rawPts) {
    const d = distPath(p, cleanPts);
    if (inSlot(p)) { if (d > worstSlot) worstSlot = d; }
    else if (inShave(p)) { if (d > worstShave) worstShave = d; }
    else if (d > worst) worst = d;
  }
  console.log(`${NAMES[k]}  辺 ${a.edges}→${b.edges}`
    + `（直 ${a.lines}→${b.lines} / 弧 ${a.arcs}→${b.arcs}）`
    + ` 軸平行 ${a.axis}→${b.axis} 潰れ ${a.tiny}→${b.tiny}`
    + ` ／ ずれ 最大 ${worst.toFixed(2)}（許容 ${TOL}）`
    + (k === 0 ? ` ／ スリット ${worstSlot.toFixed(1)}（指定の造形）` : "")
    + ` ／ 最小のくびれ ${narrowest(pc).toFixed(1)}（面取り2倍 = ${2 * CHAMFER}）`);
  if (sh) console.log(`      └ 持ち手の内側を削った … 弧 ${sh.arcs} 本`
    + `（${fmtP(sh.head)} 〜 ${fmtP(sh.root)}）`
    + ` ／ 根元で ${sh.peak.toFixed(1)} 単位 ／ 元の形からのずれ ${worstShave.toFixed(1)}（指定の造形）`
    + ` ／ 弧の引き直しのずれ ${sh.off.toFixed(2)} ／ 内側のベベルの残り ${sh.bevel.toFixed(1)}`);
});

// ---- 吐く -----------------------------------------------------------------
const fmt = (pc: NipperPiece) => {
  const body = pc.edges.map((e) => {
    const inner = e.inner ? ", 1" : "";
    if (!e.r || !e.c) return `    L(${e.to.x}, ${e.to.y}${inner}),`;
    return `    A(${e.to.x}, ${e.to.y}, ${e.r}, ${e.c.x}, ${e.c.y}, ${e.ccw ? 1 : 0}${inner}),`;
  }).join("\n");
  return `  piece(${pc.tier}, ${pc.start.x}, ${pc.start.y}, [\n${body}\n  ]),`;
};
const ts = `// ★★★**生成物。手で直さない。**
//   \`npx tsx tools/clean-nipper.mts\` が \`lib/nipperShapeRaw.ts\`（生のトレース）を
//   整えて作る。**形を変えたいときは規則（tools/clean-nipper.mts の先頭の目盛り）を
//   直して走らせ直す。**
//
//   ★★元データは \`docs/archive/nipper-shape-21.ts\` に凍結してある（誰も import しない）。
//     整理でシルエットが崩れたら、そこへ戻せば必ず 21巡目の形に復帰できる。
//
//   整理でやっていること（シルエットは変えない。許容 ${TOL} 単位）:
//   ・潰れた辺（長さ ${MIN_EDGE} 未満）を落とす
//   ・同じ向き（差 ${MERGE_DEG}° 未満）の直線をまとめる
//   ・折れ線で近似したカーブを**円弧1本**にする
//   ・膨らみ ${FLAT_SAG} 未満の弧を直線に戻す（大きいだけの本物のカーブは残す）
//   ・軸に近い辺を**完全に軸平行**にし、${SNAP} 単位以内の座標を1つに揃える
//   ★スリットだけは**指定どおりの造形**（軸平行の長方形）なので許容の外 ――
//     左の壁 x=${SLOT.xL} / 右の壁 x=${SLOT.xR} / 底 y=${SLOT.yBottom}。
import { A, L, piece, type NipperPiece } from "@/lib/nipperPath";

export type { NipperEdge, NipperPiece, P2 } from "@/lib/nipperPath";

/** 右の部品（先端の箱と右の持ち手）。**動かない**。 */
export const NIPPER_RIGHT_PIECES: NipperPiece[] = [
${fmt(cleanAll[0])}
];

/** 左の部品（先端の板と左の持ち手）。★支点まわりに回る。赤の中へ挟み込まれる。 */
export const NIPPER_LEFT_PIECES: NipperPiece[] = [
${fmt(cleanAll[1])}
${fmt(cleanAll[2])}
];

/** 紙が入るスリット（★軸平行の長方形にした溝）。 */
export const NIPPER_SLOT = {
  x0: ${SLOT.xL}, x1: ${SLOT.xR}, y0: ${SLOT.yBottom}, y1: ${NIPPER_SLOT.y1},
};

/** バネ。★測り方は \`tools/trace-nipper.mjs\`（整理では触らない）。 */
export const NIPPER_COIL = ${JSON.stringify(NIPPER_COIL, null, 2).replace(/\n/g, "\n")};

/** ★支点。2部品が重なっているところの下の端。 */
export const NIPPER_PIVOT = ${JSON.stringify(NIPPER_PIVOT)};

/** 道具全体の広がり。 */
export const NIPPER_EXTENT = ${JSON.stringify(NIPPER_EXTENT)};
`;
writeFileSync("lib/nipperShape.ts", ts);
const tot = (a: NipperPiece[]) => a.reduce((s, q) => s + q.edges.length, 0);
console.log(`\n→ lib/nipperShape.ts（辺 ${tot(rawAll)} → ${tot(cleanAll)}）`);
