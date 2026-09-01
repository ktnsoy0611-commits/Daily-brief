"use client";

import { SPACE } from "@/lib/tokens";
import {
  DomainMark, Figure, Lede, Mark, Pad, Period, SAFE, Sheet, Title, Venue,
  partsOf, type SampleProps,
} from "./TicketParts";

// 案P1「天地」｜**言葉が上、デュオトーンの写真が下**。いちばん素直な組み方。
//
// ★大きな英語（紙の幅いっぱい）→ 会期の括弧 → 題 → 要約 → 会場 と、上から下へ
//   そのまま読み下せる。写真は残り全部を取って、**下の欠けへ噛む**。
// ★★余白は**2値**（束の中は `xs`／束と束の間は `xl`）。`md` を使わない ――
//   どこが束かが見えるようにするため（design.md §5-2）。
// ★印（ドメインの幾何形）は写真の左下に紙の色で抜く。

export function TicketP1({ data, punch, deck, width }: SampleProps) {
  const { period, until, place, area } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width}>
      <Pad style={{ flex: "none", paddingTop: SAFE, paddingBottom: SPACE.xl, gap: SPACE.xl }}>
        {/* 【印】＋【従】会期。★語と括弧はひと束なので `xs` で詰める。 */}
        <span style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <Mark data={data} />
          <Period period={period} until={until} />
        </span>
        {/* 【主】題 ＋【付帯】要約 ＋【従】会場でもうひと束。 */}
        <span style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <Title>{data.title}</Title>
          {data.summary && <Lede>{data.summary}</Lede>}
          <Venue place={place} area={area} />
        </span>
      </Pad>
      <div style={{ flex: "1 1 auto", minHeight: 0, position: "relative", display: "flex" }}>
        <Figure data={data} />
        <DomainMark data={data} />
      </div>
    </Sheet>
  );
}
