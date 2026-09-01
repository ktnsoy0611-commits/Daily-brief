"use client";

import { SPACE } from "@/lib/tokens";
import {
  DomainMark, Figure, Lede, Mark, Pad, Period, SAFE, Sheet, Title, Venue,
  partsOf, type SampleProps,
} from "./TicketParts";

// 案P2「逆天地」｜**デュオトーンの写真が上、言葉が下**。P1 の上下を入れ替えたもの。
//
// ★★入れ替えるだけで読む順番が変わる ―― P1 は「言葉 → 絵」で刷り物、
//   P2 は「絵 → 言葉」で**券そのもの**（もぎる側に文字が集まる）。
//   どちらが良いかは実機で並べないと決まらないので、両方を見本帳に置く。
// ★写真は上の欠けへ噛み、文字の帯は `SAFE` ぶん下端から離れる。

export function TicketP2({ data, punch, deck, width }: SampleProps) {
  const { period, until, place, area } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width}>
      <div style={{ flex: "1 1 auto", minHeight: 0, position: "relative", display: "flex" }}>
        <Figure data={data} />
        <DomainMark data={data} style={{ bottom: SPACE.sm }} />
      </div>
      <Pad style={{ flex: "none", paddingTop: SPACE.lg, paddingBottom: SAFE, gap: SPACE.xl }}>
        <span style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <Mark data={data} />
          <Period period={period} until={until} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <Title>{data.title}</Title>
          {data.summary && <Lede lines={2}>{data.summary}</Lede>}
          <Venue place={place} area={area} />
        </span>
      </Pad>
    </Sheet>
  );
}
