import { NAV_H, navHeightPx } from "./constants";
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

// ★★★**セーフエリアは左右対称。もう振らない**（2026-09-14・第102巡にユーザー確定）。
//
//   **タブバーとは「右下の丸を含めた行」のこと**なので、揃えるべき幅は
//   **`[SPACE.lg, w − SPACE.lg]`** ―― 白い帯（ピル）の右端 310 ではない。
//   ★★第101巡に「移動できる幅がタブバーの横幅と合っていない」を**帯の右端**と
//     読んで右の壁を 310 へ寄せたのは**誤り**で、ユーザーに「**右端が大きく
//     開きすぎ。左右のセーフエリアの幅は全てのデザインで統一する必要がある**」と
//     差し戻された。`pileLeftOf`/`pileRightOf`/`pileSpanOf` は削除。
//   ★★★**左右で違う数を持たせないこと。** 非対称にした瞬間、山だけが他の画面と
//     違う幅になる ―― それがこの巡で戻した理由そのもの。

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
