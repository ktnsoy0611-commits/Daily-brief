"use client";

import { useEffect, useRef, useState } from "react";
import { SANS } from "@/lib/constants";

// ★★入力画面の隅に、実機の数値を出すだけの部品(2026-08-19・第21巡)。
// **直ったら撤去する**(`lib/debugViewport.ts` と設定のスイッチも一緒に)。
//
// 読み方（★「器 上/下」が 0 なら、器は見えている矩形とぴったり重なっている）:
//   vv    … 見えている高さ @ 上へのずれ / inner … window.innerHeight
//   器上/下 … 器の上端・下端が見えている矩形から何pxずれているか。**両方 0 が正しい。**
//   bar   … 上のバーの上端が器の上端から何px下か（＝セーフエリア上と一致）
//   帯    … 帯の下端が見えている下端から何px上か。**0 が正しい。**
//   sheet … 日程シートの下端が見えている下端から何px上か。**0 が正しい。**
//   safe  … セーフエリアの上/下

const read = () => {
  const vv = window.visualViewport;
  const shell = document.querySelector<HTMLElement>("[data-composer-shell]");
  const bar = document.querySelector<HTMLElement>("[data-topbar]");
  const dock = document.querySelector<HTMLElement>("[data-dock]");
  const sheet = document.querySelector<HTMLElement>("[data-when]");
  const top = vv ? vv.offsetTop : 0;
  const vh = vv ? vv.height : window.innerHeight;
  const r = shell?.getBoundingClientRect();
  return {
    vh: Math.round(vh), top: Math.round(top), inner: window.innerHeight,
    // 器の上端/下端が、見えている矩形とどれだけずれているか。**両方 0 が正しい。**
    st: r ? Math.round(r.top - top) : null,
    sb: r ? Math.round(r.bottom - (top + vh)) : null,
    // 上のバーの上端(器の上端から何px下か。＝セーフエリア上と一致するのが正しい)
    bar: bar && r ? Math.round(bar.getBoundingClientRect().top - r.top) : null,
    // 帯の下端と、日程シートの下端が見えている下端から何px上か。**0 が正しい。**
    dock: dock ? Math.round(top + vh - dock.getBoundingClientRect().bottom) : null,
    sheet: sheet ? Math.round(top + vh - sheet.getBoundingClientRect().bottom) : null,
  };
};

export function ViewportProbe() {
  const [v, setV] = useState(read);
  const satRef = useRef<HTMLSpanElement | null>(null);
  const sabRef = useRef<HTMLSpanElement | null>(null);
  const fixRef = useRef<HTMLSpanElement | null>(null);
  const [safe, setSafe] = useState({ t: 0, b: 0 });
  // ★★**画面の下端がページの外かどうか**を決める数値(2026-08-19・第29巡)。
  //   `fixed; inset: 0` の箱の高さが `screen.height` より小さければ、
  //   その差ぶんは**ページが一切塗れない領域**(実機で 47pt あった)。
  const [screen, setScreen] = useState({ fix: 0, dev: 0, dpr: 1, standalone: "?" });

  useEffect(() => {
    // ★env() は JS から直接読めないので、その高さの箱を置いて測る。
    const t = satRef.current?.offsetHeight ?? 0;
    const b = sabRef.current?.offsetHeight ?? 0;
    setSafe({ t, b });
    const nav = navigator as Navigator & { standalone?: boolean };
    setScreen({
      fix: Math.round(fixRef.current?.getBoundingClientRect().height ?? 0),
      dev: Math.round(window.screen.height),
      dpr: window.devicePixelRatio,
      standalone: `${nav.standalone ? "A" : "-"}${matchMedia("(display-mode: standalone)").matches ? "M" : "-"}`,
    });
  }, []);

  useEffect(() => {
    // ★rAF で回し続ける。イベントを取りこぼしていること自体を疑っているので、
    //   ここはイベントに頼らない(この部品は開発用なので回しても構わない)。
    let id = 0;
    const tick = () => { setV(read()); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div aria-hidden style={{
      // ★★★**画面そのものに貼る**(第24巡)。器の中の absolute にしていたが、
      //   実機で「崩れすぎて数値が読み取れなかった」と報告された。器ごと
      //   ずれても・何が手前に来ても読めるように、`fixed` の最前面へ置く。
      position: "fixed", left: 8, top: 8, zIndex: 2147483000, pointerEvents: "none",
      padding: "7px 10px", borderRadius: 10, background: "rgba(0,0,0,0.78)",
      // ★★**9.5px では実機の写真で読めなかった**(第23巡に実機で報告)。
      //   開発用なので見た目より読めることを優先する。
      fontFamily: SANS, fontSize: 15, fontWeight: 700, lineHeight: 1.45,
      color: "#7CF7C6", whiteSpace: "pre", textAlign: "left",
    }}>
      <span ref={satRef} style={{ display: "block", height: "env(safe-area-inset-top)", width: 0 }} />
      <span ref={sabRef} style={{ display: "block", height: "env(safe-area-inset-bottom)", width: 0 }} />
      {/* ★`fixed; inset: 0` が実際に何 px あるか。画面の高さより小さければ、
          その差がページの外(＝下端の帯)。 */}
      <span ref={fixRef} aria-hidden style={{ position: "fixed", inset: 0, width: 0, pointerEvents: "none" }} />
      {`vv ${v.vh} @ ${v.top}  inner ${v.inner}\n器 上${v.st ?? "-"} 下${v.sb ?? "-"}\nbar ${v.bar ?? "-"}  帯 ${v.dock ?? "-"}\nsheet ${v.sheet ?? "-"}  safe ${safe.t}/${safe.b}\n★fixed ${screen.fix} / 画面 ${screen.dev}  ${screen.standalone}\n★はみ出し ${screen.dev - screen.fix}`}
    </div>
  );
}
