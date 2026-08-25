// ★★★**図形の動きの土台**(2026-08-24・第55巡)。
//
// なぜ要るか … これまで canvas の図形は「経過時間 ÷ 持ち時間」を三次カーブに
// 通して動かしていた。つまり**全部が同時に動き出し、同時に止まる**。実機で
// 「モーションがチープ」と言われた原因はここで、カーブを差し替えても直らない
// (同時に始まって同時に終わる、という骨格そのものが安っぽい)。
//
// バネ(減衰振動)は**位置と速度を持つ**ので、
//   ・押し出しの粘り(動き出しが遅れる)
//   ・慣性(目標が変わっても速度が引き継がれる)
//   ・止まり際の収束(ピタリと止まらず、静かに寄る)
// が勝手に出る。指を離したあとの続きも自然につながる。
//
// ★これは **canvas に描く図形の座標系**の話で、`lib/tokens.ts` の例外2に当たる。
//   CSS の transition / animation は従来どおり `lib/motion.ts` と `:root` の
//   語彙(曲線4本・時間5つ)から引くこと。**そちらへ持ち出さない。**

export interface Spring {
  /** いまの値。 */
  p: number;
  /** いまの速さ(1フレームあたり)。 */
  v: number;
}

export const spring = (p = 0, v = 0): Spring => ({ p, v });

/**
 * 目標へ1フレームぶん近づける。
 *
 * `k` … 引き寄せる強さ。大きいほど速い。
 * `d` … 減衰。`2*sqrt(k)` でちょうど収束(行き過ぎない)。それより小さいと
 *        わずかに行き過ぎてから戻る ― **その揺り返しが「慣性」に見える**。
 */
export function springTo(s: Spring, target: number, k: number, d: number): Spring {
  s.v += (target - s.p) * k - s.v * d;
  s.p += s.v;
  return s;
}

/** ほぼ着いたか(ループを止めてよいか)。 */
export const settled = (s: Spring, target: number, eps = 0.001): boolean =>
  Math.abs(target - s.p) < eps && Math.abs(s.v) < eps;

/** 0→1 を運ぶときの手ざわり。**わずかに行き過ぎる**ので慣性が出る。 */
export const K_TRAVEL = 0.016;
export const D_TRAVEL = 0.19;
/** 定位置へ吸い付くとき(行き過ぎない)。 */
export const K_SETTLE = 0.020;
export const D_SETTLE = 0.28;
