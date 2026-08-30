"use client";

import { useEffect, useRef, useState } from "react";

import { BG, KIND_DOMAIN, TICKET_DOMAIN_COLOR } from "@/lib/constants";
import { Ticket, type TicketData } from "@/components/explore/Ticket";
import { TicketStage } from "@/components/explore/TicketStage";

// ★★**確認用のタブ**（第70巡）。刷新した券と鋏を**実機で**見るためだけに在る。
//   Explore の刷新（提案 TODAY）が本物になったら、このファイルごと消す
//   ―― あわせて `lib/apps.ts` の `life-dev` の行、`lib/types.ts` の
//   `LifeTabId`、`components/TabIcons.tsx` の `ticket` も消すこと。
//
// ★中身は `/dev/explore` の「Today — 3D の場」と**同じ形**。値を二重に持たないよう、
//   場所は**画面の幅・高さに対する割合**で決める（実機の画面がどの寸法でも同じ構図）。

// ★★構図は **/dev/explore の「3D の場・定位置」とそっくり同じ**にする（ユーザーが
//   その画で確認済み）。あちらは 390 × 844 の枠に実寸で置いているので、ここでは
//   **その枠に対する割合**に直して持つ ―― 実機の画面幅が違っても同じ構図になる。

/** 券の幅（画面の幅に対する割合）。★あちらの 300 / 390。 */
const CARD_W = 300 / 390;
/** 券の縦横比。★`TICKET_ASPECT`（13 / 21）と同じ。 */
const CARD_R = 21 / 13;
/** 鋏の幅（画面の幅に対する割合）。★**図そのものの幅**。あちらの 260 / 390。 */
const TOOL_W = 260 / 390;
/** 鋏の口の場所（★**タブバーを除いた**見えている範囲に対する割合）。あちらの 312, 726。 */
const NOSE = { x: 312 / 390, y: 726 / 844 };
/** 鋏の姿勢。★あちらと同じ値（ユーザー指定）。 */
const YAW = 80;
const TILT = 22;
/** 券の面からの隔たり（正＝手前）。 */
const TOOL_Z = 60;

/** 写真の代わりの面。★外に取りに行かず、その場で作る（`app/dev/explore` と同じ）。 */
function fakePhoto(a: string, b: string) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="240">'
    + '<defs><radialGradient id="g" cx="28%" cy="18%" r="88%">'
    + `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>`
    + '</radialGradient></defs><rect width="300" height="240" fill="url(#g)"/>'
    + `<rect x="30" y="120" width="42" height="120" fill="${a}" opacity="0.5"/>`
    + `<rect x="196" y="30" width="30" height="210" fill="${b}" opacity="0.45"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 見本の1枚。★本番はここが生成された券になる。
const SAMPLE: TicketData = {
  kind: "exhibition", glyph: "展", title: "見えないものたちの庭",
  summary: "音と光だけで構成された9つの部屋を、順路を決めずに歩く。図録は会期後半に出る。",
  venue: "東京都現代美術館", area: "清澄白河", date: "12.02", until: "03.16", soon: true,
  image: fakePhoto("#FFE58A", "#101B3A"), serial: 143, // ★目盛りの外（ダミー画像の色）
};

export function DevStageTab() {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [nav, setNav] = useState(0);

  // ★器の実寸を測ってから描く。`TicketStage` は CSS px を場の単位として使うので、
  //   画面の寸法がそのまま構図になる（実機の幅にそのまま追従する）。
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
      // ★★タブバーの高さは**実寸を測る**。`--nav-h` は `calc`／`env()` 混じりの
      //   文字列なので `parseFloat` では読めない（第70巡に実測 ―― 0 が返り、
      //   券が下へ寄って鋏がタブバーの裏に隠れた）。
      const bar = document.querySelector(".app-nav");
      setNav(bar ? Math.round(bar.getBoundingClientRect().height) : 0);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cardW = size ? Math.round(size.w * CARD_W) : 0;
  const cardH = Math.round(cardW * CARD_R);
  // ★★**タブバーの裏を数に入れない**。券はタブバーより上の**見えている範囲**の
  //   真ん中へ置く（そうしないと鋏がタブバーに隠れて確認にならない）。
  const view = size ? size.h - nav : 0;

  return (
    <div ref={box} className="full-bleed" style={{ position: "absolute", inset: 0, background: BG }}>
      {size && (
        <TicketStage
          w={size.w} h={size.h}
          card={{
            x: Math.round((size.w - cardW) / 2),
            y: Math.round((view - cardH) / 2),
            w: cardW, h: cardH,
            paper: TICKET_DOMAIN_COLOR[KIND_DOMAIN[SAMPLE.kind]],
          }}
          nipper={{
            nose: { x: Math.round(size.w * NOSE.x), y: Math.round(view * NOSE.y) },
            w: Math.round(size.w * TOOL_W), open: 1, z: TOOL_Z, yaw: YAW, tilt: TILT,
          }}
        >
          <Ticket data={SAMPLE} punch={null} deck={BG} width={cardW} />
        </TicketStage>
      )}
    </div>
  );
}
