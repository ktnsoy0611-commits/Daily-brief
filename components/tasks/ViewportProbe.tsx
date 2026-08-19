"use client";

import { useEffect, useRef, useState } from "react";
import { SANS } from "@/lib/constants";

// ★★入力画面の隅に、実機の数値を出すだけの部品(2026-08-19・第21巡)。
// **直ったら撤去する**(`lib/debugViewport.ts` と設定のスイッチも一緒に)。
//
// 読み方:
//   kb   … いま持ち上げている量(`--kb`)。キーボード＋その上の帯の高さ。
//   vv   … 見えている高さ @ 見えている矩形のずれ(`visualViewport`)。
//   scr  … 文書のスクロール量。0 でなければ器が引きずられている。
//   fit  … いま中身を下げている量(`--vvtop`)。ずれと一致しているのが正しい。
//   bar  … 上のバーの上端が、見えている上端から何px下か。**0 が正しい。**
//   safe … セーフエリアの上/下(`env(safe-area-inset-*)`)。
//   sheet… 日程シートの下端が、見えている下端から何px上か。0 が正しい。

const read = () => {
  const vv = window.visualViewport;
  const shell = document.querySelector<HTMLElement>("[data-composer-shell]");
  const bar = document.querySelector<HTMLElement>("[data-topbar]");
  const sheet = document.querySelector<HTMLElement>("[data-when]");
  const cs = shell ? getComputedStyle(shell) : null;
  const top = vv ? vv.offsetTop : 0;
  const vh = vv ? vv.height : window.innerHeight;
  return {
    kb: cs ? cs.getPropertyValue("--kb").trim() || "0px" : "-",
    fit: cs ? cs.getPropertyValue("--vvtop").trim() || "0px" : "-",
    vh: Math.round(vh),
    top: Math.round(top),
    scr: Math.round(window.scrollY || 0),
    lvh: shell ? shell.offsetHeight : 0,
    // ★見えている上端からの距離。器がずれていなければ、上のバーの上端は
    //   セーフエリアぶんだけ下 ＝ safe.t と一致する。
    bar: bar ? Math.round(bar.getBoundingClientRect().top - top) : null,
    sheet: sheet ? Math.round(top + vh - sheet.getBoundingClientRect().bottom) : null,
  };
};

export function ViewportProbe() {
  const [v, setV] = useState(read);
  const satRef = useRef<HTMLSpanElement | null>(null);
  const sabRef = useRef<HTMLSpanElement | null>(null);
  const [safe, setSafe] = useState({ t: 0, b: 0 });

  useEffect(() => {
    // ★env() は JS から直接読めないので、その高さの箱を置いて測る。
    const t = satRef.current?.offsetHeight ?? 0;
    const b = sabRef.current?.offsetHeight ?? 0;
    setSafe({ t, b });
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
      position: "absolute", left: 8, top: 8, zIndex: 9, pointerEvents: "none",
      padding: "5px 7px", borderRadius: 8, background: "rgba(0,0,0,0.62)",
      fontFamily: SANS, fontSize: 9.5, lineHeight: 1.5, letterSpacing: "0.02em",
      color: "#7CF7C6", whiteSpace: "pre", textAlign: "left",
    }}>
      <span ref={satRef} style={{ display: "block", height: "env(safe-area-inset-top)", width: 0 }} />
      <span ref={sabRef} style={{ display: "block", height: "env(safe-area-inset-bottom)", width: 0 }} />
      {`kb ${v.kb} / lvh ${v.lvh}\nvv ${v.vh} @ ${v.top} / scr ${v.scr}\nfit ${v.fit} / bar ${v.bar ?? "-"}\nsafe ${safe.t}/${safe.b} / sheet ${v.sheet ?? "-"}`}
    </div>
  );
}
