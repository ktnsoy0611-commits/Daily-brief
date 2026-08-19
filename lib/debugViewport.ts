// ★実機の数値を画面に出すかどうかの印(2026-08-19・第21巡)。
//
// この環境では iPhone を動かせないので、レイアウトの崩れを**推測で**直しては
// 外し続けていた。崩れた瞬間の写真1枚で決められるように、キーボードと矩形の
// 実測値を画面の隅に出す。**直ったら撤去する。**
//
// ★もう一つ「ずれの補正を試す(旧方式)」の印を持つ(第24巡)。第18〜23巡の
// `--vvtop` の仕組み(`components/tasks/legacyShift.ts`)を呼び戻すスイッチで、
// **既定は切ってある**。実機で見比べるためだけのもので、**次巡で撤去する**。

const KEY = "qol-debug-viewport";
// ★第23巡の "qol-debug-noshift"(補正を切る)とは別のキーにしてある。意味が
//   逆になったので、実機に古い印が残っていても**新しい既定から始まる**。
const KEY_LEGACY = "qol-debug-legacy-shift";

const on = (k: string) => typeof localStorage !== "undefined" && localStorage.getItem(k) === "1";
const set = (k: string, v: boolean) => {
  if (typeof localStorage === "undefined") return;
  if (v) localStorage.setItem(k, "1");
  else localStorage.removeItem(k);
};

export const isViewportDebug = (): boolean => on(KEY);
export const setViewportDebug = (v: boolean): void => set(KEY, v);

/** true のあいだ、旧方式のずれの補正(`--vvtop`)を動かす。★次巡で撤去。 */
export const isLegacyShift = (): boolean => on(KEY_LEGACY);
export const setLegacyShift = (v: boolean): void => set(KEY_LEGACY, v);
