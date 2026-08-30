"use client";

import { SPACE } from "@/lib/tokens";
import {
  INK, KIND_DOMAIN,
} from "@/lib/constants";
import { DOMAIN_COLOR } from "@/lib/palette";
import {
  Figure, Lede, Mark, Meta, Pad, Rule, Sheet, Title, partsOf, type SampleProps,
} from "./TicketParts";

// 案N3「額」｜色の地に、写真が**三方の余白**をとって載る。
//
// ★出どころは Vitsœ の荷札（刷り物の作法）。写真が紙の上に「貼ってある」ように見える。
// ★★**版面の左端が1本**になるのがこの案でいちばんよく分かる ――
//   券種・写真・題・要約・升の左端が、すべて同じ縦線に乗る。
// ★写真は余りを全部取る（`Figure` が `flex: 1`）。

export function TicketN3({ data, punch, deck, width }: SampleProps) {
  const color = DOMAIN_COLOR[KIND_DOMAIN[data.kind]];
  const { period, until, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={color}>
      <Pad style={{ flex: "none", paddingTop: SPACE.lg, paddingBottom: SPACE.sm }}>
        <Mark data={data} />
      </Pad>
      <Rule />
      <Pad style={{ flex: "1 1 auto", minHeight: 0, paddingTop: SPACE.md }}>
        <Figure data={data} fill={INK} />
      </Pad>
      <Pad style={{ flex: "none", paddingTop: SPACE.md, paddingBottom: SPACE.lg, gap: SPACE.md }}>
        <span style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <Title>{data.title}</Title>
          {data.summary && <Lede>{data.summary}</Lede>}
        </span>
        <Meta period={period} until={until} place={place} />
      </Pad>
    </Sheet>
  );
}
