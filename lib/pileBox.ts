import { NAV_CREATE_SLOT, NAV_H, navHeightPx } from "./constants";
import { SPACE } from "./tokens";

// ★★★**山の器（壁と床）の寸法はここ1つ**（2026-09-11・第91巡）。
//
// ★★★**なぜ切り出したか。** GRAVITY（`components/tabs/GravityTab.tsx`）とホームの山
// （`components/home/Pile.tsx`）が同じ器を別々に持っていて、**ホームだけ他の要素と
// 揃っていなかった** ―― 実測 … 図形の壁は画面の端から **32px**（列の
// `padding: 0 SPACE.lg` の内側で、さらに 16 の生の数字を足していた）なのに、
// タブバーは画面の端から **16px**（`AppShell.tsx` の `padding: 0 ${SPACE.lg}px`）。
// 床も、GRAVITY が持っている「タブバーの上から浮かせる」を持っていなかった。
// ★★**器の数字を2度書かない。両方がここを読む。**

/**
 * ★山の左右の内寸。**タブバーの左右と同じ**（`AppShell` の `padding: 0 SPACE.lg`）。
 * ★★**左右の出どころはここだけ** ―― 壁も、湧く x も、使える幅も全部これを通す。
 */
export const PILE_INSET = SPACE.lg;

/** 山が使える幅（器の幅から左右の内寸を引いたもの）。 */
export const pileWOf = (w: number) => Math.max(80, w - PILE_INSET * 2);

// ★★★**タブバーの帯は左右対称ではない**（2026-09-13・第101巡にユーザー指摘
//   「ホームの図形が**移動できる幅がまだタブバーの横幅と合っていません**」）。
//   実測（390px 幅）… **帯（白いピル）は [16, 310]** ／「作る」の丸は [322, 374] ／
//   **山の壁は [16, 374]** ―― 右がちょうど `NAV_CREATE_SLOT`(64) ぶん外に居た。
//   ★★`PILE_INSET` は**左右対称の1つの数**なので、構造的にこれを表現できない。
//   → **左右を別の関数**にする。★`PILE_INSET` はそのまま残す（`VoiceStudio` の
//   段の幅は左右対称でなければならないので、あちらは触らない）。

/** 山の左の内寸（＝タブバーの帯の左端）。 */
export const pileLeftOf = () => PILE_INSET;
/** 山の右の内寸（＝タブバーの**帯**の右端。「作る」の丸の下へは行かせない）。 */
export const pileRightOf = (w: number) =>
  Math.max(pileLeftOf() + 80, w - PILE_INSET - NAV_CREATE_SLOT);
/** 山が使える幅（左右の内寸のあいだ）。 */
export const pileSpanOf = (w: number) => pileRightOf(w) - pileLeftOf();

/**
 * ★地面をタブバーの上端からどれだけ浮かせるか（2026-08-25・第57巡にユーザー確定
 * 「地面が低すぎる」）。★★**床の位置の出どころはここだけ。**
 */
export const GROUND_LIFT = SPACE.xxl;

/**
 * 床の y（器の座標）。★★★**`navHeightPx()` を自分で測らない**
 * ―― `.app-nav` の矩形は `NAV_H` と一致しない（Chromium 81px／実機 132px）。
 */
export const floorYOf = (h: number) => h - navHeightPx() - GROUND_LIFT;

/**
 * ★DOM 側で「物理の床と同じ高さ」を書きたいときの下端。
 * **物理の床と同じだけ**上げないと、図形が帯から浮いて積まれる（第57巡に踏んだ）。
 */
export const pileBandBottom = `calc(${NAV_H} + ${SPACE.xl + GROUND_LIFT}px)`;
