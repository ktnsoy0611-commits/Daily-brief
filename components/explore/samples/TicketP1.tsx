"use client";

import { SPACE } from "@/lib/tokens";
import {
  Figure, Lede, Mark, Meta, Pad, SAFE, Sheet, Title, partsOf, type SampleProps,
} from "./TicketParts";

// 案P1「天地」｜**言葉が上、写真が下**。いちばん素直な組み方。
//
// ★大きな英語 → 題 → 要約 → 会期 と、上から下へ**そのまま読み下せる**。
//   写真は残り全部を取って、**下の欠けへ噛む**（紙の端まで出る）。
// ★★上端の帯は `SAFE`（＝切り欠きの半径）ぶん下がるので、**文字が欠けに
//   一度も掛からない**。写真は逆に噛ませる ―― 避けるのは文字だけ。

export function TicketP1({ data, punch, deck, width }: SampleProps) {
  const { period, until, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width}>
      <Pad style={{ flex: "none", paddingTop: SAFE, paddingBottom: SPACE.lg, gap: SPACE.md }}>
        <Mark data={data} />
        {/* 【主】題と【付帯】要約は**ひと束**なので `xs` で詰める。 */}
        <span style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <Title>{data.title}</Title>
          {data.summary && <Lede>{data.summary}</Lede>}
        </span>
        <Meta period={period} until={until} place={place} />
      </Pad>
      <Figure data={data} />
    </Sheet>
  );
}
