// ★実機の数値を画面に出すかどうかの印(2026-08-19・第21巡)。
//
// この環境では iPhone を動かせないので、レイアウトの崩れを**推測で**直しては
// 外し続けていた。崩れた瞬間の写真1枚で決められるように、キーボードと矩形の
// 実測値を画面の隅に出す。**直ったら撤去する。**
//
// ★第23巡の「ずれの補正を切る」と第24巡の「旧方式を試す」は撤去した。
//   ずれの補正(`--vvtop`)という仕組み自体が無くなったため — 器は
//   `visualViewport` の矩形そのものになり、補正すべきものが存在しない。

const KEY = "qol-debug-viewport";

export const isViewportDebug = (): boolean =>
  typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";

export const setViewportDebug = (v: boolean): void => {
  if (typeof localStorage === "undefined") return;
  if (v) localStorage.setItem(KEY, "1");
  else localStorage.removeItem(KEY);
};
