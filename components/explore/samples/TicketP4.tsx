"use client";

import { SPACE } from "@/lib/tokens";
import {
  Figure, Lede, Mark, Meta, Pad, SAFE, Sheet, Title, partsOf, type SampleProps,
} from "./TicketParts";

// 案P4「活字」｜**大きな英語と余白が主役**。写真は小さな正方形に落とす。
//
// ★★いちばんミニマルな案。「タイポグラフィが際立った」を**文字通り**に取ると
//   こうなる ―― 券を開いた瞬間に見えるのは語1つで、写真は添え物。
// ★★★**写真は伸ばさない**（`flex: none`）。この案だけは「写真が余りを全部取る」
//   規則の外にいて、**余りは白のまま残す**のが狙い。空きではなく間。
// ★上下とも `SAFE` を取り、四隅の欠けは**白い余白の中で**抜ける。

/** 写真の一辺（券の幅に対する％）。★目盛りの外（版面の割り付け）。 */
const THUMB = 44;

export function TicketP4({ data, punch, deck, width }: SampleProps) {
  const { period, until, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width}>
      <Pad style={{
        flex: "1 1 auto", minHeight: 0, justifyContent: "space-between",
        paddingTop: SAFE, paddingBottom: SAFE, gap: SPACE.lg,
      }}>
        <Mark data={data} />
        <span style={{ flex: "none", width: `${THUMB}%`, aspectRatio: "1", display: "flex" }}>
          <Figure data={data} style={{ flex: "1 1 auto", minHeight: 0 }} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
          <span style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
            <Title>{data.title}</Title>
            {data.summary && <Lede lines={2}>{data.summary}</Lede>}
          </span>
          <Meta period={period} until={until} place={place} />
        </span>
      </Pad>
    </Sheet>
  );
}
