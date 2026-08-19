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
//   bar  … ★上のバーの上端(そのままの rect.top)。**セーフエリア上(safe の左)と
//        一致していれば正しい。**大きい値なら中身が下へ落ちている。
//        第23巡までは `vv.offsetTop` を引いていたので、崩れている写真でも 0 と
//        表示され、いちばん知りたいことが読めなかった。
//   ★shl … **器の rect.top**。★★doc … html の rect.top。
//        この2つだけが `vv.offsetTop` を物差しに使っていない。読み方:
//          shl ≒ 0    … 器は見えている領域に貼り付いている ＝ ずれの補正は不要。
//          shl ≒ −top … 器が本当に押し上げられている ＝ 補正が要る。
//        第22巡の「ずれ残り」を消したのは、あれが `印の rect.top − vv.offsetTop`
//        で、**疑っている値そのものを物差しにしていた**から(必ず 0 になる)。
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
    vh: Math.round(vh),
    top: Math.round(top),
    scr: Math.round(window.scrollY || 0),
    lvh: shell ? shell.offsetHeight : 0,
    // ★引き算をしない。器がずれていなければ、上のバーの上端は
    //   セーフエリアぶんだけ下 ＝ safe.t と一致する。
    bar: bar ? Math.round(bar.getBoundingClientRect().top) : null,
    // ★物差しが循環していない2つ。
    shl: shell ? Math.round(shell.getBoundingClientRect().top) : null,
    doc: Math.round(document.documentElement.getBoundingClientRect().top),
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
      {`kb ${v.kb}  lvh ${v.lvh}\nvv ${v.vh} @ ${v.top}  scr ${v.scr}\nshl ${v.shl ?? "-"}  doc ${v.doc}\nbar ${v.bar ?? "-"}  sheet ${v.sheet ?? "-"}\nsafe ${safe.t}/${safe.b}`}
    </div>
  );
}
