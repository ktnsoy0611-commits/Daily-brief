"use client";

import { useEffect, useState } from "react";

// ★★★**券の質感を知っている唯一の場所**(第71巡に「印刷の粒」で導入、
// 2026-08-31・**第76巡に網点へ差し替え**)。作り方は `tools/make-halftone.mjs`。
//
// ★★★**券も図形も同じ 1 枚**（ユーザー指定「両方とも網点」）。
//   第75巡までの「券は板紙・図形は切った紙。混ぜない」は**この巡で撤回**。
//   違うのは**乗せ方**だけ … 券は DOM なので CSS の面、図形（`lib/paperTexture.ts`）
//   は canvas に焼き込む。
//
// ★★★**平均 128 を `soft-light` で乗せる**。ここが第76巡の肝。
//   それまでは平均 245 のタイルを `multiply` で敷いていた。色相は動かないが
//   **一律 ×0.9616 で暗くなる** ―― `multiply` は原理的に**暗くしかできない**ので、
//   「質感だけ乗せる」ことができない。`soft-light` は **128 が恒等**なので、
//   明暗だけを足して**地の色を動かさない**。
//   ★さらに券本体（`components/explore/Ticket.tsx`）は第76巡まで**茶色いカラー
//     写真**を `multiply` 0.42 で敷いていた（R×0.868 / G×0.840 / B×0.809 ＝
//     13〜19% 暗くなり、青だけ 6pt 余計に落ちる茶色かぶり）。それが
//     ユーザーの言う「濁った色」で、いまはこの面に一本化した。
//
// ★★★**1画像画素 = 1デバイス画素**で敷く。だから `background-size` は
//   `GRAIN_TILE / devicePixelRatio` の CSS px。等倍(`auto`)にすると 3x の実機で
//   網点が3倍に太り、「印刷の点」ではなく「水玉」に見える。
//
// ★★質感は**色のすぐ上・文字の下**に置くこと。最前面へ出すと写真も文字も霞む。

/** タイルの画像(`tools/make-halftone.mjs` の生成物)。★図形と**同じ 1 枚**。 */
export const GRAIN_SRC = "/halftone.webp";
/** タイル1辺(**デバイス**画素)。★`tools/make-halftone.mjs` の `N` と同じ値
 *  ―― 網点の周期 9px × 14 ＝ 126。**整数周期なので継ぎ目が構造として無い**。 */
export const GRAIN_TILE = 126;
/**
 * 濃さ(`soft-light` の不透明度)。★**強さの目盛りはこれ1つだけ**。
 * ★★タイルの平均は **128 ちょうど**（`soft-light` の恒等点）なので、
 *   ここをいくつにしても**地の色は動かない**。動くのは質感の強さだけ。
 * ★第71巡は「濃さは不透明度ではなくタイルの中央で決める」と書いてあったが、
 *   それは `multiply` だったから ―― `multiply` は中央でしか強さを作れない。
 *   `soft-light` になったので、**中央は 128 に固定し、強さは不透明度で作る**。
 */
export const GRAIN_ALPHA = 0.55;

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

/** 券の面へ敷く質感の style。★`position: absolute; inset: 0` の面に当てる。 */
export function grainStyle(dpr: number): React.CSSProperties {
  const css = GRAIN_TILE / (dpr || 1);
  return {
    position: "absolute", inset: 0, pointerEvents: "none",
    backgroundImage: `url("${GRAIN_SRC}")`,
    backgroundRepeat: "repeat",
    backgroundSize: `${css}px ${css}px`,
    mixBlendMode: "soft-light",
    opacity: GRAIN_ALPHA,
  };
}
