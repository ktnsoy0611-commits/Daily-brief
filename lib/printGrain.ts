"use client";

import { useEffect, useState } from "react";

// ★★★**券の「印刷の粒」を知っている唯一の場所**(2026-08-31・第71巡にユーザー指定
// 「印刷の粒(均一で細かい)」)。作り方は `tools/make-grain.mjs`。
//
// ★★`lib/paperTexture.ts`(クラフト紙)と**別物として並べる**。混ぜないこと。
//   ・クラフト紙 … **タスクの図形**に焼き込む。第65巡にユーザーが確定した写真で、
//     `CLAUDE.md` に「写真には二度と手を入れない」と書いてある。触らない。
//   ・印刷の粒 … **券**に敷く。券は板紙、図形は切った紙 ―― 別の物なので目も違う。
// ★写真をそのまま券へ敷いていた第69〜70巡は、実機で**ムラ(雲のような濃淡)**に
//   見えていた。券は面が広いので、写真が持つ低い刻みの起伏が雲として出る。
//
// ★★★**1画像画素 = 1デバイス画素**で敷く。だから `background-size` は
//   `GRAIN_TILE / devicePixelRatio` の CSS px。等倍(`auto`)にすると 3x の実機で
//   粒が3倍に太り、「均一な粒」ではなく「砂」に見える。

/** タイルの画像(`tools/make-grain.mjs` の生成物)。 */
export const GRAIN_SRC = "/print-grain.webp";
/** タイル1辺(**デバイス**画素)。★`tools/make-grain.mjs` の `N` と同じ値。 */
export const GRAIN_TILE = 128;
/**
 * 濃さ(multiply の不透明度)。★**強さの目盛りはこれ1つだけ**。
 * ★★タイルは**白のすぐ下**(中央 247・深さ 12)で作ってあるので、1.0 が
 *   「刷り上がりそのまま」。薄くしたいときだけ下げる。
 * ★中央 128 のタイルを 0.22 で敷いていた第71巡の初回は、**クリームの紙が
 *   灰色**に見えた(PAPER #FAFAF9 が 222 まで沈んだ)。濃さは不透明度ではなく
 *   **タイルの中央**で決めること。
 */
export const GRAIN_ALPHA = 1;

/**
 * いまの画面の画素密度。★サーバーでは 1 を返し、乗ってから本当の値へ差し替える
 * (粒は飾りなので、立ち上がりに一度切り替わっても見えない)。
 */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(1);
  useEffect(() => {
    const read = () => setDpr(window.devicePixelRatio || 1);
    read();
    // ★端末を回すと変わることがある(ブラウザの拡大でも変わる)。
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return dpr;
}

/** 券の面へ敷く粒の style。★`position: absolute; inset: 0` の面に当てる。 */
export function grainStyle(dpr: number): React.CSSProperties {
  const css = GRAIN_TILE / (dpr || 1);
  return {
    position: "absolute", inset: 0, pointerEvents: "none",
    backgroundImage: `url("${GRAIN_SRC}")`,
    backgroundRepeat: "repeat",
    backgroundSize: `${css}px ${css}px`,
    mixBlendMode: "multiply",
    opacity: GRAIN_ALPHA,
  };
}
