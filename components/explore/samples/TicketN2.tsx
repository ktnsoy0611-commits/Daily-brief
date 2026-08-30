"use client";

import { SPACE } from "@/lib/tokens";
import { KIND_DOMAIN, INK, TICKET_DOMAIN_COLOR } from "@/lib/constants";
import {
  Figure, Lede, Mark, Meta, Pad, Sheet, Title, partsOf, type SampleProps,
} from "./TicketParts";

// 案N2「全面」｜写真が**カードいっぱい**。下に色の帯が重なる。
//
// ★出どころはイベントのカード。**写真をいちばん大きく取れるのはこの形だけ**
//   ―― 上下に割ると、文字の束のぶんだけ写真が痩せる。
// ★帯は不透明（黒い文字を読ませるため）。暗幕は敷かない ―― 色は紙の1色だけ。

export function TicketN2({ data, punch, deck, width }: SampleProps) {
  const color = TICKET_DOMAIN_COLOR[KIND_DOMAIN[data.kind]];
  const { period, until, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={color}>
      <Figure data={data} fill={INK} />
      <Pad style={{
        flex: "none", background: color,
        paddingTop: SPACE.md, paddingBottom: SPACE.lg, gap: SPACE.md,
      }}>
        <Mark data={data} />
        <span style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <Title>{data.title}</Title>
          {data.summary && <Lede>{data.summary}</Lede>}
        </span>
        <Meta period={period} until={until} place={place} />
      </Pad>
    </Sheet>
  );
}
