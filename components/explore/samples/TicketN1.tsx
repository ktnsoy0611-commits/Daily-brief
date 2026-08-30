"use client";

import { SPACE } from "@/lib/tokens";
import { KIND_DOMAIN, INK, TICKET_DOMAIN_COLOR } from "@/lib/constants";
import {
  Figure, Lede, Mark, Meta, Pad, Rule, RULE_BAR, Sheet, Title,
  partsOf, type SampleProps,
} from "./TicketParts";

// 案N1「帯」｜写真が上、下が色の面。太いバー1本で割る。
//
// ★出どころはポッドキャストのカード（写真の下に、詰めた文字の束が来る形）。
// ★★**写真は余りを全部取る**（高さを決め打ちしない）。だから文字の束が短い券ほど
//   写真が大きくなり、**空きが出ない**。
// ★束の間は `md`、束の中は `xs`（design.md §5-2）。

export function TicketN1({ data, punch, deck, width }: SampleProps) {
  const color = TICKET_DOMAIN_COLOR[KIND_DOMAIN[data.kind]];
  const { period, until, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={color}>
      <Figure data={data} fill={INK} />
      {/* ★太いバーが大区分。紙の端まで走る。 */}
      <Rule weight={RULE_BAR} />
      <Pad style={{ flex: "none", paddingTop: SPACE.md, paddingBottom: SPACE.lg, gap: SPACE.md }}>
        <Mark data={data} />
        {/* 【主】題と【付帯】要約は**ひと束**なので `xs` で詰める。 */}
        <span style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <Title>{data.title}</Title>
          {data.summary && <Lede>{data.summary}</Lede>}
        </span>
        <Meta period={period} until={until} place={place} />
      </Pad>
    </Sheet>
  );
}
