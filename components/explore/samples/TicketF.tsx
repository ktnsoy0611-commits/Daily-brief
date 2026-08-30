"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT } from "@/lib/tokens";
import { INK, KIND_DOMAIN, LATIN, SANS, TICKET_DOMAIN_COLOR, itemKindOf } from "@/lib/constants";
import { shade } from "@/lib/helpers";
import { serialOf } from "@/lib/ticket";
import {
  Pad, Perf, Photo, Sheet, Stub, Summary, Title, partsOf, type SampleProps,
} from "./TicketParts";

// 案F｜**Adobe Fonts のポスター**。全面1色に、**同じ色相の濃い段**だけで奥行きを作る。
//
// ★この案だけの手 … ①第2の色相を入れない（濃い段は `shade` で同じ色から作る）
//   ②**罫を1本も引かない** ③代わりに**四隅の極小のメタ欄**が版面を締める
//   （Adobe のポスターは制作メモと番号を四隅に置いている）。
// ★いちばん「印刷物」に見える案。罫が無いぶん、粒（紙の質感）がよく効く。

/** 同心の輪の数と、1段ごとに暗くする量。★目盛りの外（図形） */
const RINGS = 5;
const STEP = -7;
/** 輪の大きさ（券の幅に対する比）と位置。★目盛りの外（図形） */
const RING = { w: 96, top: 20, left: 26 };  // ★目盛りの外（図形の座標系）
/** 写真の高さ（券の高さに対する比）。★目盛りの外（図形） */
const PHOTO_GROW = "0 0 30%";

export function TicketF({ data, punch, deck, width }: SampleProps) {
  const domain = KIND_DOMAIN[data.kind];
  const color = TICKET_DOMAIN_COLOR[domain];
  const { period, place } = partsOf(data);
  const micro: React.CSSProperties = {
    fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
    letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: INK, textTransform: "uppercase",
  };
  const microJa: React.CSSProperties = {
    fontFamily: SANS, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
    letterSpacing: TRACK.normal, lineHeight: LEAD.flat, color: INK,
  };

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={color}>
      {/* ★同心の輪。**同じ色相の濃い段だけ**で作る（Adobe の手）。 */}
      <span aria-hidden style={{
        position: "absolute", zIndex: 1,
        width: `${RING.w}%`, aspectRatio: "1", top: `${RING.top}%`, left: `${RING.left}%`,
      }}>
        {Array.from({ length: RINGS }, (_, i) => (
          <span key={i} style={{
            position: "absolute", borderRadius: "50%",
            inset: `${(i / RINGS) * 50}%`,
            background: shade(color, STEP * (i + 1)),
          }} />
        ))}
      </span>

      {/* 頭 ── 極小のメタ欄（左）と番号（右） */}
      <Pad style={{ flex: "none", paddingTop: SPACE.lg }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: SPACE.sm }}>
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span style={micro}>Explore — {data.handwritten ? "Self issued" : itemKindOf(data.kind).en}</span>
            <span style={microJa}>{data.soon ? "会期が近い" : "提案"}</span>
          </span>
          <span style={{ ...micro, fontVariantNumeric: "tabular-nums" }}>Nº {serialOf(data.serial)}</span>
        </div>
      </Pad>

      <Pad style={{ flex: "1 1 auto", minHeight: 0, paddingTop: SPACE.xl }}>
        <Title>{data.title}</Title>
        <span aria-hidden style={{ flex: "1 1 0", minHeight: SPACE.md }} />
        {data.image && (
          <Photo src={data.image} grow={PHOTO_GROW} />
        )}
        {data.summary && (
          <Summary style={{ marginTop: SPACE.md }}>{data.summary}</Summary>
        )}
        <span aria-hidden style={{ flex: "1 1 0", minHeight: SPACE.md }} />
      </Pad>

      {/* 足 ── 罫を引かず、**極小の格子**で締める（Adobe の手） */}
      <Pad style={{ flex: "none", paddingBottom: SPACE.md }}>
        <div style={{ display: "flex", gap: SPACE.lg }}>
          {[
            { ja: "会期", en: data.soon ? "Soon" : "Period", v: period },
            { ja: "会場", en: "Venue", v: place },
          ].map((f) => (
            <span key={f.ja} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <span style={micro}>{f.en}</span>
              <span style={{
                fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold,
                lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: INK,
                fontVariantNumeric: "tabular-nums",
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}>{f.v}</span>
            </span>
          ))}
        </div>
      </Pad>

      <Perf />
      <Pad style={{ flex: "none" }}><Stub serial={data.serial} /></Pad>
    </Sheet>
  );
}
