"use client";

import { SPACE, TYPE, TRACK, LEAD, WEIGHT } from "@/lib/tokens";
import { KIND_DOMAIN, SANS } from "@/lib/constants";
import { DOMAIN_COLOR, DOMAIN_SUB } from "@/lib/palette";
import {
  Lede, Mark, Meta, Pad, Photo, Sheet,
  partsOf, type SampleProps,
} from "./TicketParts";

// 案N6「柱」｜左に色の細い柱（縦に組んだ題）、右に写真。
//
// ★出どころは短冊（縦に1行だけ組む札）。既存の5案は**どれも横に割って**いたので、
//   **縦に割る**という一手だけを足した案。
// ★★題は `writing-mode: vertical-rl` で縦に組む。**和文だけの技**なので、
//   欧文が混ざる印（`Mark`）は横のまま下段へ置く。
// ★★写真は柱の右で**余りを全部取る**（高さも幅も決め打ちしない）。

/** 色の柱の幅（券の幅に対する割合）。★目盛りの外（版面の割り付け）。 */
const COLUMN = "32%";

export function TicketN6({ data, punch, deck, width }: SampleProps) {
  const domain = KIND_DOMAIN[data.kind];
  const color = DOMAIN_COLOR[domain];
  const { period, until, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={color}>
      {/* 上段 ── 縦に二分。★写真は残り全部。 */}
      <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
        <div style={{
          flex: `0 0 ${COLUMN}`, position: "relative", zIndex: 2,
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          padding: `${SPACE.lg}px 0`,
        }}>
          <span style={{
            writingMode: "vertical-rl",
            fontFamily: SANS, fontSize: TYPE.head, fontWeight: WEIGHT.black,
            lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: DOMAIN_SUB[domain],
            maxHeight: "100%", overflow: "hidden",
          }}>{data.title}</span>
        </div>
        <Photo src={data.image ?? ""} style={{ flex: "1 1 auto" }} />
      </div>
      {/* 下段 ── 印・要約・会期。★版面の左端は `Pad` が1本にそろえる。 */}
      <Pad style={{ flex: "none", paddingTop: SPACE.md, paddingBottom: SPACE.lg, gap: SPACE.md }}>
        <Mark data={data} />
        {data.summary && <Lede>{data.summary}</Lede>}
        <Meta period={period} until={until} place={place} />
      </Pad>
    </Sheet>
  );
}
