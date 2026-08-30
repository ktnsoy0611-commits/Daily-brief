"use client";

import { SPACE } from "@/lib/tokens";
import {
  INK, KIND_DOMAIN,
} from "@/lib/constants";
import { DOMAIN_COLOR } from "@/lib/palette";
import {
  Figure, Lede, Mark, Meta, Pad, Sheet, Title, partsOf, type SampleProps,
} from "./TicketParts";

// 案N4「札」｜**色が主役**。写真は右上の正方形だけ。
//
// ★★他の3案は「写真が大半で、色は帯としてしか見えない」ので、その反対側を出す
//   （2026-08-31・ユーザー指定「アクセントカラーしか見えないデザインしかない」）。
//   色が券の **7割** を占め、ドメインの色が遠目にも読める。
// ★出どころは組織カード ―― 分類が左上、印が右上、文字の束は**下に寄せる**。
//   途中の空きは**色そのものが埋める**ので、無駄には見えない。

/** 写真の一辺（券の幅に対する％）。★目盛りの外（図形） */
const THUMB = 38;

export function TicketN4({ data, punch, deck, width }: SampleProps) {
  const color = DOMAIN_COLOR[KIND_DOMAIN[data.kind]];
  const { period, until, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={color}>
      <Pad style={{
        flex: "1 1 auto", minHeight: 0, justifyContent: "space-between",
        paddingTop: SPACE.lg, paddingBottom: SPACE.lg, gap: SPACE.md,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: SPACE.md }}>
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: SPACE.md }}>
            <Mark data={data} />
            <Title>{data.title}</Title>
          </span>
          {/* ★正方形の小窓。`Figure` は `flex: 1` で伸びるので、ここでは殺す。 */}
          <span style={{ flex: "none", width: `${THUMB}%`, aspectRatio: "1", display: "flex" }}>
            <Figure data={data} fill={INK} style={{ flex: "1 1 auto", minHeight: 0 }} />
          </span>
        </div>
        <span style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
          {data.summary && <Lede>{data.summary}</Lede>}
          <Meta period={period} until={until} place={place} />
        </span>
      </Pad>
    </Sheet>
  );
}
