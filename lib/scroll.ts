// ★★★**スクロールの語彙はここだけ**(2026-08-25・第59巡)。
//
// 指で 1:1 に動かし、離したら投げて、減衰して、最寄りへ吸着する ― という
// 「いくつ目を見ているか」型のスクロールを1つにまとめた。ALIGN(縦の円弧)が
// まず使う。★ユーザー指定「このスクロールの慣性が良かったら他のスクロール
// (TIMELINE の横送り)にも展開していく」ので、**最初から共通の部品**にしてある。
//
// ★第58巡は効きが強すぎて「少し払っただけで画面の下まで行く」「慣性で全部
//   潰れる」になったので、第59巡に**指の効きと投げをまとめて 0.2 倍**にした。
//   ★★第60巡はその逆の指摘 ―「指のスクロールに追従しなさすぎる。わざと遅く
//   しすぎている。もう少し普通の動きに寄せて」。**指の効き(`SCROLL_GAIN`)だけを
//   普通(1.0)へ寄せ、投げ(`FLICK_K`)は下げて**釣り合いを保つ
//   (`flickThrow` は両方を掛けるので、効きを上げると投げは勝手に伸びる)。
//   ★★★第61巡「まだ指に追従せず重い」でもう一段(0.55 → 0.85)、
//   第62巡「100パーセントで指に追従させて」で **1.0(＝完全に 1:1)** に到達した。
//   強さを触りたくなったら `SCROLL_GAIN` と `FLICK_K` の2つだけを見ること。
//
// ★これは canvas と物理の座標系の道具(`lib/spring.ts` と同じ扱い)。
//   CSS の transition には持ち込まない。

/** 位置(いくつ目)と、離したあとの速さ。 */
export interface Flick { p: number; v: number }

export const flick = (p = 0): Flick => ({ p, v: 0 });

/** ★指の効き。1 なら「1ピッチ動かしたら1つ進む」。第62巡に **1.0＝完全な 1:1**
 *  (ユーザー指定)。★ここは**もう上げない** — 1 を超えると指より速く動く。 */
export const SCROLL_GAIN = 1.0;
/** 離したあとの減衰(1フレームあたり)。 */
export const SCROLL_DECAY = 0.9;
/** 投げの強さ。指の速さ(px/イベント)をどれだけ先へ伸ばすか。第61巡の 0.11 → 0.08
 *  (`SCROLL_GAIN` を上げたぶん、掛け算の総量が上がりすぎないように下げる)。 */
export const FLICK_K = 0.08;
/** これより遅い投げは「置いた」とみなして、その場で最寄りへ吸着する。 */
const V_MIN = 0.0015;
/** ★★★投げの速さの**上限**(1フレームに進む「いくつ目」。第62巡)。
 *  上限が無いと、強く払ったとき1フレームで端まで飛び、**呼ぶ側の連鎖のバネが
 *  巨大な目標差を一度に受けて暴れる**(第62巡のユーザー報告「勢いをつけ過ぎて
 *  スクロールすると画面がバグる」)。1フレームに1つ弱で頭打ちにすれば、
 *  速い払いは「速く送る」だけで済み、行が画面の外へ飛ばない。 */
const V_MAX = 0.9;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 指で動かす。`deltaPx` は指の移動量(px)、`pitch` は1つぶんの距離(px)。 */
export function flickBy(f: Flick, deltaPx: number, pitch: number, lo: number, hi: number): void {
  f.p = clamp(f.p - (deltaPx * SCROLL_GAIN) / pitch, lo, hi);
}

/** 離した瞬間。`vPx` は指の速さ(px/イベント)。 */
export function flickThrow(f: Flick, vPx: number, pitch: number): void {
  f.v = clamp(-(vPx * FLICK_K * SCROLL_GAIN) / pitch, -V_MAX, V_MAX);
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
