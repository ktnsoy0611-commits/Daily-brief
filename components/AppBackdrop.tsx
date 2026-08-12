"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { BD_GREY, JOURNAL_BG } from "@/lib/constants";
import type { AppId } from "@/lib/types";

// ★アプリの地(2026-08-11・作り直し)。
//
// 以前はアプリごとに大きな幾何学(帯・三角・扇形・円)を並べ、切り替えのたびに
// 「去る/来る」のアニメーションを流していた。方針転換(極限までシンプルに)に
// 伴い、**図形もアニメーションもすべて撤去**し、ベタ塗りの1色だけにした。
// ジャーナルは参考画像の暖かみのある中間グレー、他のアプリは従来の中性グレー。
//
// ★色は **html にだけ** 書く。シェルの高さは 100svh 固定なので、iOSで
// ツールバーが引っ込んで表示領域が広がると、その差の帯が地の色のまま残る。
// 違う色だと、そこが「画面の端」の線として見えてしまう(実機で報告された症状)。
// ★★body には絶対に書かないこと。この地は body 直下の zIndex:-1 にあり、
// CSSの描画順では「負のz-index」は「in-flowの子孫の背景」より先に描かれる
// ため、body に不透明な色があると塗りつぶされる(2026-08-04にこれで背景が
// 丸ごと消えた)。html の色はキャンバスへ伝播して最初に描かれるので、
// 正しく下に回る。

export function groundOf(app: AppId): string {
  return app === "journal" ? JOURNAL_BG : BD_GREY;
}

// ★★ここが塗るのは「列の外」だけ(2026-08-12)。
// アプリの地色は **列(AppShell の AppColumn)が自分で持つ**ようになった。
// 以前は画面全体に1枚だけ敷いたこの帆布が現在のアプリの色を塗り、切り替えの
// たびにクロスフェードしていたため、列が横へスライドするのに地色だけがその場で
// 混ざり、遷移中に「新しいアプリの領域に古い地色が残る」状態になっていた
// (タブバーの下などに境目が見えた直接の原因)。
// いまは列が不透明なのでこの帆布は普段は見えない。役目は、シェル(100svh)の
// 外側 — iOSのオーバースクロールやセーフエリアの帯 — に地の色を用意しておく
// ことだけ。★アプリの地色を変えるときは groundOf を直せばよく、列も帆布も
// html も同じ関数を見ているので、ズレようがない。
export function AppBackdrop({ appId }: { appId: AppId }) {
  const ground = groundOf(appId);

  useEffect(() => {
    document.documentElement.style.backgroundColor = ground;
  }, [ground]);

  // ★body直下へポータルで描き、高さは 100lvh(表示領域が最大のときの高さ)。
  // シェルは 100svh 固定 + overflow:hidden なので、ここへ置かないと、
  // ツールバーが引っ込んだときの差の帯だけ色が途切れて見える。
  if (typeof document === "undefined") return null;
  return createPortal((
    <div aria-hidden style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100lvh",
      pointerEvents: "none", zIndex: -1, background: ground,
      transition: "background 420ms ease",
    }} />
  ), document.body);
}
