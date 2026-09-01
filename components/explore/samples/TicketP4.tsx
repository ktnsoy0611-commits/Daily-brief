"use client";

import { SPACE } from "@/lib/tokens";
import {
  Figure, Lede, Mark, Pad, Period, SAFE, Sheet, Title, Venue,
  partsOf, type SampleProps,
} from "./TicketParts";

// 案P4「活字」｜**語と余白が主役**。写真は小さな正方形のデュオトーンに落とす。
//
// ★★いちばんミニマルな案。「タイポグラフィが際立った」を**文字通り**に取ると
//   こうなる ―― 券を開いた瞬間に見えるのは語1つで、写真は添え物。
// ★★★**写真は伸ばさない**（`flex: none`）。この案だけは「写真が余りを全部取る」
//   規則の外にいて、**余りは白のまま残す**のが狙い。空きではなく**間**。
// ★上下とも `SAFE` を取り、四隅の欠けは**白い余白の中で**抜ける。

export function TicketP4({ data, punch, deck, width }: SampleProps) {
  const { period, until, place, area } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width}>
      <Pad style={{
        flex: "1 1 auto", minHeight: 0, justifyContent: "space-between",
        paddingTop: SAFE, paddingBottom: SAFE, gap: SPACE.xl,
      }}>
        <span style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <Mark data={data} />
          <Period period={period} until={until} />
        </span>
        {/* ★★★**小窓は「残った高さ」から作る**（幅から作らない）。幅で決めると、
            語が大きい券で中身が紙より高くなり、**下の余白ごと外へ押し出されて
            文字が切り欠きに掛かる**（第81巡に実測 … 16px しか空かなかった）。
            高さから作れば、語が大きいぶん小窓が小さくなって必ず収まる。 */}
        <span style={{ flex: "1 1 auto", minHeight: 0, display: "flex" }}>
          <Figure data={data} style={{ flex: "none", height: "100%", aspectRatio: "1", minHeight: 0 }} />
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
