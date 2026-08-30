"use client";

import { SPACE, RADIUS } from "@/lib/tokens";
import {
  INK, KIND_DOMAIN,
} from "@/lib/constants";
import { DOMAIN_COLOR } from "@/lib/palette";
import {
  Figure, Lede, Mark, Meta, Pad, Sheet, Title, partsOf, type SampleProps,
} from "./TicketParts";

// 案N2「全面」｜写真が**カードいっぱい**。色の面は**内側に浮く板**として重なる。
//
// ★出どころはイベントのカード。★★色の板を**紙の縁から離す**のがこの案の要
//   ―― 縁まで伸ばすと N1（上下に割る）と見分けが付かなくなる（第72巡に実測）。
//   写真が板の左右と下に見えるので、**写真がいちばん大きく見える案**になる。

/** 色の板の内側の余白（券の幅に対する％）。★目盛りの外（図形） */
const INSET = 4;

export function TicketN2({ data, punch, deck, width }: SampleProps) {
  const color = DOMAIN_COLOR[KIND_DOMAIN[data.kind]];
  const { period, until, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={color}>
      {/* ★写真は紙いっぱい（裁ち落とし）。 */}
      <Figure data={data} fill={INK} style={{
        position: "absolute", inset: 0, flex: "none", minHeight: 0,
      }} />
      <span aria-hidden style={{ flex: "1 1 auto", minHeight: 0 }} />
      <Pad style={{
        flex: "none", background: color, borderRadius: RADIUS.sm,
        margin: `0 ${INSET}% ${INSET}%`, paddingBlock: SPACE.md, gap: SPACE.md,
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
