"use client";

import { SPACE, TYPE, TRACK, LEAD, WEIGHT } from "@/lib/tokens";
import { KIND_DOMAIN, LATIN, PAPER, itemKindOf } from "@/lib/constants";
import { DOMAIN_COLOR, DOMAIN_SUB, bodyInkOn } from "@/lib/palette";
import {
  Figure, Lede, Meta, Pad, Sheet, Title,
  partsOf, type SampleProps,
} from "./TicketParts";

// 案N8「半券」｜右端に**ちぎり取る細い半券**。そこだけ色で、本体は白い面。
//
// ★出どころは実物の入場券（もぎりの線から右が半券として残る）。
// ★★紙の地は色のまま。**本体側に白い面を敷いて**右の帯だけ色を残す ――
//   こうすると「1枚の色紙に白を刷った」券になり、縁の切り欠きも色のまま抜ける。
// ★★もぎりの線は**点線**。券の語彙として唯一許す線で、他の案の罫とは役が違う
//   （区切りではなく「ここで切れる」という指示）。
// ★★半券には**印だけ**を縦に置く。段は増やさない（`nano` 7 のまま）。

/** 半券の幅（券の幅に対する割合）。★目盛りの外（版面の割り付け）。 */
const STUB = "20%";
/** もぎりの点線。★目盛りの外（図形）。 */
const PERF = 3;

export function TicketN8({ data, punch, deck, width }: SampleProps) {
  const domain = KIND_DOMAIN[data.kind];
  const color = DOMAIN_COLOR[domain];
  const { period, until, place } = partsOf(data);
  const stubInk = DOMAIN_SUB[domain];

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={color}>
      <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0, position: "relative", zIndex: 2 }}>
        {/* 本体 ── 白い面。★写真も文字もここに乗る。 */}
        <div style={{
          flex: "1 1 auto", minWidth: 0, background: PAPER,
          display: "flex", flexDirection: "column",
        }}>
          <Figure data={data} fill={color} />
          <Pad style={{ flex: "none", paddingTop: SPACE.md, paddingBottom: SPACE.lg, gap: SPACE.md }}>
            <span style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
              <Title ink={bodyInkOn(PAPER)}>{data.title}</Title>
              {data.summary && <Lede ink={bodyInkOn(PAPER)}>{data.summary}</Lede>}
            </span>
            <Meta period={period} until={until} place={place} ink={bodyInkOn(PAPER)} />
          </Pad>
        </div>
        {/* もぎりの線。 */}
        <span aria-hidden style={{
          flex: "none", width: PERF,
          backgroundImage: `repeating-linear-gradient(to bottom, ${PAPER} 0 ${PERF}px, transparent ${PERF}px ${PERF * 2}px)`,
        }} />
        {/* 半券 ── 色のまま。印を縦に。 */}
        <div style={{
          flex: `0 0 ${STUB}`, display: "flex", alignItems: "center", justifyContent: "center",
          padding: `${SPACE.lg}px 0`,
        }}>
          <span style={{
            writingMode: "vertical-rl",
            fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
            letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: stubInk,
            textTransform: "uppercase", whiteSpace: "nowrap",
          }}>{data.handwritten ? "Self issued" : itemKindOf(data.kind).en}</span>
        </div>
      </div>
    </Sheet>
  );
}
