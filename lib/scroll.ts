// ★★★**スクロールの語彙はここだけ**(2026-08-25・第59巡)。
//
// 指で 1:1 に動かし、離したら投げて、減衰して、最寄りへ吸着する ― という
// 「いくつ目を見ているか」型のスクロールを1つにまとめた。ALIGN(縦の円弧)が
// まず使う。★ユーザー指定「このスクロールの慣性が良かったら他のスクロール
// (TIMELINE の横送り)にも展開していく」ので、**最初から共通の部品**にしてある。
//
// ★第58巡は効きが強すぎて「少し払っただけで画面の下まで行く」「慣性で全部
//   潰れる」になった。**指の効きと投げをまとめて 0.2 倍**にしたのがこの版。
//   強さを触りたくなったら `SCROLL_GAIN` と `FLICK_K` の2つだけを見ること。
//
// ★これは canvas と物理の座標系の道具(`lib/spring.ts` と同じ扱い)。
//   CSS の transition には持ち込まない。

/** 位置(いくつ目)と、離したあとの速さ。 */
export interface Flick { p: number; v: number }

export const flick = (p = 0): Flick => ({ p, v: 0 });

/** ★指の効き。1 なら「1ピッチ動かしたら1つ進む」。第58巡の 1.0 → 0.2。 */
export const SCROLL_GAIN = 0.2;
/** 離したあとの減衰(1フレームあたり)。 */
export const SCROLL_DECAY = 0.9;
/** 投げの強さ。指の速さ(px/イベント)をどれだけ先へ伸ばすか。第58巡の 0.9 → 0.18。 */
export const FLICK_K = 0.18;
/** これより遅い投げは「置いた」とみなして、その場で最寄りへ吸着する。 */
const V_MIN = 0.0015;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 指で動かす。`deltaPx` は指の移動量(px)、`pitch` は1つぶんの距離(px)。 */
export function flickBy(f: Flick, deltaPx: number, pitch: number, lo: number, hi: number): void {
  f.p = clamp(f.p - (deltaPx * SCROLL_GAIN) / pitch, lo, hi);
}

/** 離した瞬間。`vPx` は指の速さ(px/イベント)。 */
export function flickThrow(f: Flick, vPx: number, pitch: number): void {
  f.v = -(vPx * FLICK_K * SCROLL_GAIN) / pitch;
}

/**
 * 毎フレーム進める。**動いたら true**(呼ぶ側はループを回し続ける)。
 * 減衰しきったら `snap` が true のとき最寄りの整数へ落ち着く。
 */
export function flickStep(f: Flick, lo: number, hi: number, snap = true): boolean {
  if (Math.abs(f.v) > V_MIN) {
    f.p = clamp(f.p + f.v, lo, hi);
    f.v *= SCROLL_DECAY;
    return true;
  }
  if (f.v !== 0) {
    f.v = 0;
    if (snap) f.p = clamp(Math.round(f.p), Math.ceil(lo), Math.floor(hi));
  }
  return false;
}
