"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// ★声のメモのカセットプレイヤー。中身は React Three Fiber の本物の3Dモデル
// (components/CassettePlayerScene.tsx)。ここは「置き場所と大きさ」だけを
// 決める薄い入れ物で、外から見た使い方(width / mode / onTap)は以前の
// CSSで組んでいた頃と同じ。
//
// ★three / R3F / drei はここでしか使わないので **遅延読み込み** にしてある
// (`ssr:false` の dynamic import)。1MB近いライブラリなので、これを静的に
// import すると3つのアプリ全部の初回読み込みが重くなる。プレイヤーが
// 画面に出る場面(ジャーナルのレコードタブ・録音中の幕)でだけ取りに行く。

export type PlayerMode = "idle" | "recording" | "sending";

// モデルの縦横比(実機 91×116mm)。呼び出し側は幅だけを渡す。
const ASPECT = 240 / 306;

const Scene = dynamic(() => import("@/components/CassettePlayerScene"), {
  ssr: false,
  loading: () => null,
});

export function CassettePlayer({ width = 240, mode, onTap, eager }: { width?: number; mode: PlayerMode; onTap?: () => void; /** 待たずにすぐ組み立てる(録音中の幕のように、出た瞬間に見えていないと困る場面) */ eager?: boolean }) {
  const recording = mode === "recording";
  // ★画面に出ていない間はWebGLを1フレームも回さない。3つのアプリの列は
  // 全部マウントされたままなので(§14)、これをしないと、レコードタブを
  // 一度開いたあとは他のアプリを触っている間もずっと描き続けてしまう。
  // いちど見えたら**アンマウントはしない**(WebGLの作り直しの方が高くつく)。
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(!!eager);
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") { setSeen(true); setOnScreen(true); return; }
    // ★最初に組み立てるのは、画面に入ってから少し待ってから。three の
    // 読み込み・WebGLの初期化・シェーダのコンパイルで数百ms止まるので、
    // アプリを横に払っている最中にこれをやるとスワイプが引っかかる
    // (実測でスワイプ1回に2.5秒のlong taskが乗った)。落ち着いてから始める。
    let timer = 0;
    const io = new IntersectionObserver((entries) => {
      const on = entries[entries.length - 1].isIntersecting;
      setOnScreen(on);
      window.clearTimeout(timer);
      if (on) timer = window.setTimeout(() => setSeen(true), eager ? 0 : 420);
    });
    io.observe(el);
    return () => { window.clearTimeout(timer); io.disconnect(); };
  }, [eager]);
  return (
    <div
      ref={box}
      className="cp-enter"
      onClick={onTap}
      role={onTap ? "button" : undefined}
      aria-label={onTap ? (recording ? "録音を終える" : "録音する") : undefined}
      style={{
        width, height: width / ASPECT,
        cursor: onTap ? "pointer" : "default",
        // ★キャンバスの中はWebGLなので、指の操作はここで受け止める
        // (中身にイベントを拾わせない)。
        touchAction: "manipulation",
      }}
    >
      {seen && <Scene mode={mode} active={onScreen} />}
    </div>
  );
}
