// ★実機の数値を画面に出すかどうかの印(2026-08-19・第21巡にユーザー確定)。
//
// この環境では iPhone を動かせないので、レイアウトの崩れを**推測で**直しては
// 外し続けていた(同じ場所で3巡)。崩れた瞬間の写真1枚で決められるように、
// キーボードと矩形の実測値を画面の隅に出す。**直ったら撤去する。**
//
// 設定(ProfileTab)の「開発用」から切り替える。`localStorage` に置くのは、
// アプリの state に混ぜるとクラウド同期に乗ってしまうため。

const KEY = "qol-debug-viewport";

export function isViewportDebug(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

export function setViewportDebug(on: boolean): void {
  if (typeof localStorage === "undefined") return;
  if (on) localStorage.setItem(KEY, "1");
  else localStorage.removeItem(KEY);
}
