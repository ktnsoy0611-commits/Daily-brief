// ★実機の数値を画面に出すかどうかの印(2026-08-19・第21巡にユーザー確定)。
//
// この環境では iPhone を動かせないので、レイアウトの崩れを**推測で**直しては
// 外し続けていた。崩れた瞬間の写真1枚で決められるように、キーボードと矩形の
// 実測値を画面の隅に出す。**直ったら撤去する。**
//
// ★もう一つ「ずれの補正を切る」印も持つ(第23巡)。`--vvtop` を 0 に固定する
// スイッチで、**`visualViewport.offsetTop` が当てになる端末かどうか**を
// 実機で 10 秒で見分けるためのもの。切って直るなら、あの値は信じられない。

const KEY = "qol-debug-viewport";
const KEY_NO_SHIFT = "qol-debug-noshift";

const on = (k: string) => typeof localStorage !== "undefined" && localStorage.getItem(k) === "1";
const set = (k: string, v: boolean) => {
  if (typeof localStorage === "undefined") return;
  if (v) localStorage.setItem(k, "1");
  else localStorage.removeItem(k);
};

export const isViewportDebug = (): boolean => on(KEY);
export const setViewportDebug = (v: boolean): void => set(KEY, v);

/** true のあいだ、ずれの補正を一切しない(`--vvtop` は 0 のまま)。 */
export const isShiftOff = (): boolean => on(KEY_NO_SHIFT);
export const setShiftOff = (v: boolean): void => set(KEY_NO_SHIFT, v);
