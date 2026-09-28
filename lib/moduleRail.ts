// ★★★**モジュール送り（アプリの中の縦の送り）の算数はここ1つ**（2026-09-28・第134巡）。
//
// ユーザー指定 …
//   「**スクロールは自由に止めたりできる感じではなくて、スワイプすると、各モジュールごとに
//   スナップして動く感じ**」「**スクロールしたら、record の UI の上端があったところまで
//   ログの UI が上がっていってスナップする**」
//   「**タスク一覧（ALIGN）のスクロールのアニメーション（全体が柔らかく、慣性がある感じ）を、
//   アプリ全体のアプリ内のスクロールに応用したい**」
//
// 作りは ALIGN と同じ2層 …
//   ① **先頭（`x`）** … 指に 1:1。離したら「この払いならここまで届く」を**離した瞬間に決め**、
//      そこへ**ちょうど収束するバネ**（`SNAP_K`/`SNAP_D`）で運ぶ（`lib/scroll.ts` の第67巡の教訓 ――
//      自由に減速させてから丸めると「止まってからガクッ」「向きの反転」が必ず出る）。
//   ② **連鎖（`ys`）** … 1枚ずつが自分のバネで先頭を追う。触った1枚（焦点）がいちばん硬く、
//      離れるほど柔らかい（`chainSpring`）。★係数は ALIGN と**同じ数**。
// ★止まる所（`snaps`）は**各1枚の上端**。1枚 ＝ モジュール、または長いモジュールの中の1行。
// ★★1枚どうしが**重ならない**ように、連鎖の遅れは隙間の `GAP_KEEP` 倍までしか詰めさせない
//   （ALIGN は行の間隔が広いので要らなかったが、ここは 16px の隙間しか無い）。
// ★これは物理の座標系の道具（`lib/spring.ts` と同じ扱い）。**固定の刻みで進める**（呼ぶ側が
//   `RAIL_STEP_MS` ごとに `railStep` を呼ぶ ―― 120Hz の実機で2倍速にしないため）。
// ★目盛りの外（手ざわりの係数）。

import { rubber, spring, springTo, type Spring } from "./spring";
import { chainSpring, SNAP_D, SNAP_K } from "./scroll";

export const RAIL_STEP_MS = 1000 / 60;

/** 端を越えて引いたときに伸びる最大（px）。 */
const OVER = 96;
/** 離したときの速さ（px/刻み）× この数 ＝ 届く見込みの距離。 */
const THROW_FRAMES = 14;
/** これより速く払ったら、見込みが今の1枚に落ちても**少なくとも1枚**は進む。 */
const STEP_V = 1.2;
/** 1回の払いで進む上限（枚）。 */
const REACH_MAX = 3;
/** 連鎖で詰まってよい下限（隙間に対する比）。 */
const GAP_KEEP = 0.25;
/** 着いたと見なす近さ（px）。 */
const EPS = 0.2;

export interface Rail {
  /** 指が動かした生の位置（端を越えることがある）。 */
  raw: number;
  /** 先頭の位置（上へ送った量。0 ＝ 1枚目の上端が線の上）。 */
  x: Spring;
  /** 離したあとの行き先（`null` ＝ 決まっていない）。 */
  target: number | null;
  /** 指が乗っているか。 */
  held: boolean;
  /** 連鎖の焦点（触った1枚）。 */
  focus: number;
  /** 1枚ずつの追従。 */
  ys: Spring[];
  tops: number[];
  heights: number[];
  gap: number;
  snaps: number[];
  max: number;
}

export const makeRail = (): Rail => ({
  raw: 0, x: spring(0), target: null, held: false, focus: 0,
  ys: [], tops: [], heights: [], gap: 0, snaps: [0], max: 0,
});

/** 1枚ずつの高さから並びと止まる所を決め直す。★位置は保つ（寸法が変わっても飛ばない）。 */
export function railLayout(r: Rail, heights: number[], gap: number, viewH: number, endPad: number): void {
  r.heights = heights;
  r.gap = gap;
  const tops: number[] = [];
  let y = 0;
  for (const h of heights) { tops.push(y); y += h + gap; }
  r.tops = tops;
  const total = Math.max(0, y - gap) + endPad;
  r.max = Math.max(0, total - viewH);
  const snaps: number[] = [];
  for (const t of tops) {
    const s = Math.min(t, r.max);
    if (!snaps.length || s - snaps[snaps.length - 1] > 1) snaps.push(s);
  }
  if (r.max - snaps[snaps.length - 1] > 1) snaps.push(r.max);
  r.snaps = snaps;
  while (r.ys.length < heights.length) r.ys.push(spring(r.x.p));
  r.ys.length = heights.length;
  if (!r.held && r.target === null) {
    const s = nearestSnap(r, r.x.p);
    if (Math.abs(r.snaps[s] - r.x.p) > EPS) r.target = r.snaps[s];
  }
}

/** 端の外はゴム（`lib/spring.ts` の `rubber` ＝ 閾値で傾き 1 の継ぎ目の無い手ざわり）。 */
function shown(r: Rail, raw: number): number {
  if (raw < 0) return -OVER * (rubber(1 + -raw / OVER, 2) - 1);
  if (raw > r.max) return r.max + OVER * (rubber(1 + (raw - r.max) / OVER, 2) - 1);
  return raw;
}

function nearestSnap(r: Rail, x: number): number {
  let best = 0;
  for (let i = 1; i < r.snaps.length; i += 1) if (Math.abs(r.snaps[i] - x) < Math.abs(r.snaps[best] - x)) best = i;
  return best;
}

/** いま線の上にある（いちばん近い）1枚の番号。見出しの下の名前が読む。 */
export const railIndex = (r: Rail): number => railIndexAt(r, r.target ?? r.x.p);

/** 画面の y（器の上端から）にいる1枚。 */
export function railPieceAt(r: Rail, y: number): number {
  for (let i = 0; i < r.tops.length; i += 1) {
    const top = pieceY(r, i);
    if (y >= top && y <= top + r.heights[i] + r.gap) return i;
  }
  return railIndex(r);
}

/** 指が乗った。★投げの途中でも、その場で掴む（吸着を止める）。 */
export function railHold(r: Rail, focus: number): void {
  r.held = true;
  r.target = null;
  r.focus = focus;
  r.raw = r.x.p;
}

/** 指で動かす（`dy` は指の移動量。上へ ＝ 負）。 */
export function railDrag(r: Rail, dy: number): void {
  const before = r.x.p;
  r.raw -= dy;
  r.x.p = shown(r, r.raw);
  r.x.v = r.x.p - before;
}

/** 離した。`vy` は指の速さ（px/刻み。上へ ＝ 負）。行き先をこの瞬間に決める。 */
export function railRelease(r: Rail, vy: number): void {
  r.held = false;
  const v = -vy;
  r.x.v = v;
  const cur = nearestSnap(r, r.x.p);
  let to = nearestSnap(r, r.x.p + v * THROW_FRAMES);
  if (Math.abs(v) > STEP_V && to === cur) to = cur + Math.sign(v);
  to = Math.max(cur - REACH_MAX, Math.min(cur + REACH_MAX, to));
  to = Math.max(0, Math.min(r.snaps.length - 1, to));
  r.target = r.snaps[to];
  // ★焦点は「行き先の1枚」へ移す（着地する1枚がいちばん硬く、周りが遅れて着く ＝ ALIGN と同じ）。
  r.focus = railIndexAt(r, r.target);
}

function railIndexAt(r: Rail, x: number): number {
  let best = 0;
  for (let i = 1; i < r.tops.length; i += 1) if (Math.abs(r.tops[i] - x) < Math.abs(r.tops[best] - x)) best = i;
  return best;
}

/** 1枚の上端（器の上端から）。 */
export const pieceY = (r: Rail, i: number): number => r.tops[i] - r.ys[i].p;

/** 1刻み進める。**まだ動いていれば true**。 */
export function railStep(r: Rail): boolean {
  let moving = r.held;
  if (!r.held && r.target !== null) {
    springTo(r.x, r.target, SNAP_K, SNAP_D);
    if (Math.abs(r.target - r.x.p) < EPS && Math.abs(r.x.v) < EPS) {
      r.x.p = r.target; r.x.v = 0; r.target = null; r.raw = r.x.p;
    } else moving = true;
  }
  const n = r.ys.length;
  for (let i = 0; i < n; i += 1) {
    const ch = chainSpring(i - r.focus);
    springTo(r.ys[i], r.x.p, ch.k, ch.d);
  }
  // ★重ならない（焦点から外へ順に、隣を押す）。
  const keep = r.gap * GAP_KEEP;
  for (let i = r.focus + 1; i < n; i += 1) {
    const floor = pieceY(r, i - 1) + r.heights[i - 1] + keep;
    if (pieceY(r, i) < floor) { r.ys[i].p = r.tops[i] - floor; r.ys[i].v = r.ys[i - 1].v; }
  }
  for (let i = r.focus - 1; i >= 0; i -= 1) {
    const ceil = pieceY(r, i + 1) - keep - r.heights[i];
    if (pieceY(r, i) > ceil) { r.ys[i].p = r.tops[i] - ceil; r.ys[i].v = r.ys[i + 1].v; }
  }
  let still = !moving;
  for (const s of r.ys) if (Math.abs(s.p - r.x.p) > EPS || Math.abs(s.v) > EPS) { still = false; break; }
  if (still) { for (const s of r.ys) { s.p = r.x.p; s.v = 0; } return false; }
  return true;
}
