"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BD_GREY, JOURNAL_BG } from "@/lib/constants";
import { GROUND_EASE, GROUND_MS, onGround, pushGround } from "@/lib/ground";
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

  // ★地色の窓口は lib/ground.ts だけ(html の背景 + theme-color をセットで書く)。
  // ここは「いちばん下の層」を積むだけ。全画面のオーバーレイはこの上へ積む。
  // ★アプリの地は**いちばん下の層**。全画面のオーバーレイ(入力画面・録音)は
  //   `"overlay"` で積むので、ここが積み直してもあちらの色は奪えない
  //   (2026-08-19・第26巡。奪えていたのが「一番下だけ背景が適応されない」の正体)。
  useEffect(() => pushGround(ground, "app"), [ground]);

  // ★★**塗る色は自分で決めない**(2026-08-19・第27巡)。積むのはアプリの層
  //   （いちばん下）だが、**塗るのは積み木の勝者**。入力画面や録音が開けば
  //   帆布も一緒にその色になる。html・theme-color と必ず同じ色・同じ時間。
  const [paint, setPaint] = useState(ground);
  useEffect(() => onGround(setPaint), []);

  // ★body直下へポータルで描き、**`position: fixed; inset: 0`**。
  // ★★`width: 100vw; height: 100lvh` をやめた(2026-08-19・第27巡)。
  //   iOS のスタンドアロン(ホーム画面へ追加した PWA)では `lvh` が下の
  //   セーフエリアを含まないことがあり、そのぶん**帆布が画面の下まで
  //   届かなかった**。届かない所は端末が manifest の色で塗るので、
  //   そこだけ別色の帯として残る。`viewport-fit=cover` の固定要素の
  //   `inset: 0` は**セーフエリアを含む画面全体**なので、`lvh` がどう
  //   計算されようと届かない場所が無くなる。
  if (typeof document === "undefined") return null;
  return createPortal((
    <div aria-hidden data-backdrop data-paint style={{
      // ★画面の下の帯まで塗る(第34巡)。`inset: 0` だけだと iOS では 47px 届かない。
      position: "fixed", inset: 0, height: "var(--screen-h)",
      pointerEvents: "none", zIndex: -1, background: paint,
      // ★時間と曲線は `lib/ground.ts` の1か所から。列の横スライド(.app-track)と
      //   **同じ**にすること。420ms ease だった頃は、列(380ms)・html(即座)と
      //   三者三様で「遷移したとき背景が同時に切り替わらない」と報告された。
      transition: `background-color ${GROUND_MS}ms ${GROUND_EASE}`,
    }} />
  ), document.body);
}
