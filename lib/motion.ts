// ★★モーションの語彙(JS 側)。CSS 側は `app/globals.css` の :root と対。
// **数字を増やさないこと** — 曲線は4本、時間は5つだけ。
//
// 考え方(2026-08-19・第26巡にユーザー確定): 初速を高く、終点へ向けて長く
// 滑らかに収束させる**非対称な減速**。対称な ease-in-out は使わない
// (動き出しと止まりに機械的な硬さが出る)。

/** 主役。定位置への吸着を優雅に見せる。CSS の `--ease-settle` と同じ値。 */
export const EASE_SETTLE = [0.16, 1, 0.3, 1] as const;
/** 面が出入りする(iOS のシート)。CSS の `--ease-sheet` と同じ値。 */
export const EASE_SHEET = [0.32, 0.72, 0, 1] as const;

/** 大きな面が開く / 閉じる(秒)。CSS の `--t-in` / `--t-out` と同じ値。 */
export const T_IN = 0.7;
export const T_OUT = 0.6;
/** 中の要素ひとつ / 時間差。CSS の `--t-item` / `--t-step` と同じ値。 */
export const T_ITEM = 0.42;
export const T_STEP = 0.05;

/** ＋と入力画面の地をつなぐ共有要素の動き。 */
export const SURFACE_IN = { duration: T_IN, ease: EASE_SETTLE };
export const SURFACE_OUT = { duration: T_OUT, ease: EASE_SETTLE };

/** ★＋ボタンと入力画面の地を結ぶ合図。両方が同じ文字列を使う。 */
export const SURFACE_ID = "composer-surface";

/** ★＋ボタンの位置。閉じるときの行き先に使う。 */
export interface SurfaceOrigin { x: number; y: number; w: number; h: number }
let origin: SurfaceOrigin | null = null;

/** ＋を押した瞬間に、その丸の場所を控える。 */
export function setSurfaceOrigin(el: Element | null): void {
  if (!el) { origin = null; return; }
  const r = el.getBoundingClientRect();
  origin = { x: r.left, y: r.top, w: r.width, h: r.height };
}

/**
 * 閉じるときに戻る先。★控えが無いとき(＋以外から開いた・別のタブに居る)は
 * **画面下端の中央**を終点にする — どこへ帰るか分からないより、
 * 一貫した場所へ吸い込まれる方が落ち着いて見える。
 */
export function surfaceOrigin(): SurfaceOrigin {
  if (origin) return origin;
  const w = typeof window === "undefined" ? 390 : window.innerWidth;
  const h = typeof window === "undefined" ? 844 : window.innerHeight;
  return { x: w / 2 - 27, y: h - 96, w: 54, h: 54 };
}
