"use client";

import { SPACE } from "@/lib/tokens";
import { KIND_DOMAIN, PAPER, TICKET_DOMAIN_COLOR } from "@/lib/constants";
import {
  Field, Masthead, Pad, Perf, Photo, Rule, RULE_BAR, Sheet, Stub, Summary, Title,
  partsOf, type SampleProps,
} from "./TicketParts";

// 案B｜**Grilli の名刺を反転**。**色が上1／クリームが下3**。
//
// ★この案だけの手 … 色が「券の頭」として帯になり、写真と欄は**クリームの上**に乗る。
//   写真が色に浮かないので素直で、束ねたときは**色の帯だけが揃って見える**
//   ＝ ストックの格子が読みやすい。
// ★クリームは既存の `PAPER`。参照のクリームはもっと暖かいので、
//   **温度は色の回で決める**（第71巡は色を触らない）。

/** 上下の割り（1 : 3）。★目盛りの外（版面の割り・ユーザー指定） */
const HEAD = 1;
const BODY = 3;
/** 写真の高さ（本文の面に対する比）。★目盛りの外（図形） */
const PHOTO_GROW = "0 0 38%";

export function TicketB({ data, punch, deck, width }: SampleProps) {
  const color = TICKET_DOMAIN_COLOR[KIND_DOMAIN[data.kind]];
  const { period, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={PAPER}>
      {/* 頭 ── ドメイン色の帯 */}
      <div style={{ flex: `${HEAD} 1 0`, minHeight: 0, background: color, position: "relative", zIndex: 2 }}>
        <Pad style={{ height: "100%", paddingTop: SPACE.lg, paddingBottom: SPACE.md, justifyContent: "space-between" }}>
          <Masthead data={data} />
          <Title>{data.title}</Title>
        </Pad>
      </div>

      {/* 本文 ── クリーム */}
      <div style={{ flex: `${BODY} 1 0`, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Pad style={{ flex: "1 1 auto", minHeight: 0 }}>
          {data.image && (
            <Photo src={data.image} grow={PHOTO_GROW} style={{ marginTop: SPACE.lg }} />
          )}
          {data.summary && (
            <Summary style={{ marginTop: SPACE.lg }}>{data.summary}</Summary>
          )}
          <span aria-hidden style={{ flex: "1 1 0", minHeight: SPACE.lg }} />
        </Pad>

        {/* ★太いバーが大区分（AuBe の手）。細罫は行のあいだ。 */}
        <Rule weight={RULE_BAR} />
        <Pad style={{ flex: "none", gap: SPACE.md, paddingBlock: SPACE.md }}>
          <Field ja="会期" en={data.soon ? "Soon" : "Period"}>{period}</Field>
          <Field ja="会場" en="Venue">{place}</Field>
        </Pad>

        <Perf />
        <Pad style={{ flex: "none" }}><Stub serial={data.serial} /></Pad>
      </div>
    </Sheet>
  );
}
