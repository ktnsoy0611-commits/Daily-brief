"use client";

import { SPACE } from "@/lib/tokens";
import { KIND_DOMAIN, TICKET_DOMAIN_COLOR } from "@/lib/constants";
import {
  DomainFigure, Field, Masthead, Pad, Perf, Photo, Rule, RULE_BAR,
  Sheet, Stub, Summary, Title, partsOf, type SampleProps,
} from "./TicketParts";

// 案D｜**写真が上1／色が下3**。
//
// ★この案だけの手 … 写真そのものを上の面にする（**裁ち落とし**）。
//   「写真をどこへ置くか」の問題が消え、いちばん券らしい。
// ★★写真の無い券（自分で書いた券）は上の面が空くので、
//   **ドメインの幾何形**で埋める（AuBe の作法をここで借りる）。

/** 上下の割り（1 : 3）。★目盛りの外（版面の割り・ユーザー指定） */
const HEAD = 1;
const BODY = 3;

export function TicketD({ data, punch, deck, width }: SampleProps) {
  const domain = KIND_DOMAIN[data.kind];
  const color = TICKET_DOMAIN_COLOR[domain];
  const { period, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={color}>
      {/* 頭 ── 写真（裁ち落とし）。無ければドメインの幾何形。 */}
      <div style={{ flex: `${HEAD} 1 0`, minHeight: 0, display: "flex", position: "relative", zIndex: 2 }}>
        {data.image
          ? <Photo src={data.image} grow="1 1 auto" />
          : <DomainFigure domain={domain} fill={color} style={{ width: "100%", height: "100%" }} />}
      </div>

      {/* 本文 ── ドメイン色 */}
      <div style={{ flex: `${BODY} 1 0`, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Pad style={{ flex: "none", paddingTop: SPACE.md, paddingBottom: SPACE.sm }}>
          <Masthead data={data} />
        </Pad>
        {/* ★太いバー1本だけが大区分（AuBe の手）。紙の端まで走る。 */}
        <Rule weight={RULE_BAR} />

        <Pad style={{ flex: "1 1 auto", minHeight: 0, paddingTop: SPACE.lg }}>
          <Title>{data.title}</Title>
          {data.summary && (
            <Summary style={{ marginTop: SPACE.md }}>{data.summary}</Summary>
          )}
          <span aria-hidden style={{ flex: "1 1 0", minHeight: SPACE.lg }} />
        </Pad>

        <Rule />
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
