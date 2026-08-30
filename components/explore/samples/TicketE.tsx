"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT } from "@/lib/tokens";
import { INK, KIND_DOMAIN, LATIN, PAPER, TICKET_DOMAIN_COLOR, itemKindOf } from "@/lib/constants";
import { serialOf } from "@/lib/ticket";
import {
  DomainFigure, Field, Pad, Perf, Photo, Rule, RULE_BAR,
  Sheet, Stub, Summary, Title, partsOf, type SampleProps,
} from "./TicketParts";

// 案E｜**AuBe のポスター**。クリーム地に、**色の幾何形が1つ**だけ。
//
// ★この案だけの手 … ①地はクリームのまま ②**色は幾何形と券種のラベルだけ**に出る
//   （AuBe はロゴと図形だけが色で、他は全部黒）③図形は**文字の背後**を通る
//   ④太い黒バーが大区分。
// ★束ねたときいちばん静かで、写真が主役になれる。逆に、遠目には
//   ドメインの色が読みにくい（色の面積が小さいため）。

/** 幾何形の大きさ（券の幅に対する比）と位置。★目盛りの外（図形）
 *  ★★**題の背後だけ**を通す。大きくすると写真と重なり、写真が図形を
 *    分断して事故に見える（第71巡に実測）。AuBe も図形が通るのは**文字の背後**だけ。 */
const FIG = { w: 46, top: 2, right: -4 };  // ★目盛りの外（図形の座標系）
/** 写真の高さ（券の高さに対する比）。★目盛りの外（図形） */
const PHOTO_GROW = "0 0 30%";

export function TicketE({ data, punch, deck, width }: SampleProps) {
  const domain = KIND_DOMAIN[data.kind];
  const color = TICKET_DOMAIN_COLOR[domain];
  const { period, place } = partsOf(data);
  const cap: React.CSSProperties = {
    fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
    letterSpacing: TRACK.caps, lineHeight: LEAD.flat, textTransform: "uppercase",
  };

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={PAPER}>
      {/* ★図形は**文字の背後**（AuBe の手）。文字は黒のまま読める。 */}
      <span aria-hidden style={{
        position: "absolute", zIndex: 1,
        width: `${FIG.w}%`, aspectRatio: "1",
        top: `${FIG.top}%`, right: `${FIG.right}%`,
      }}>
        <DomainFigure domain={domain} fill={color} style={{ width: "100%", height: "100%" }} />
      </span>

      <Pad style={{ flex: "none", paddingTop: SPACE.lg, paddingBottom: SPACE.sm }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: SPACE.sm }}>
          {/* ★券種だけが色（AuBe のロゴと同じ役） */}
          <span style={{ ...cap, color }}>
            {data.handwritten ? "Self issued" : itemKindOf(data.kind).en}
          </span>
          <span style={{ ...cap, color: INK, fontVariantNumeric: "tabular-nums" }}>
            Nº {serialOf(data.serial)}
          </span>
        </div>
      </Pad>
      {/* ★太い黒バーが大区分。紙の端まで走る。 */}
      <Rule weight={RULE_BAR} />

      <Pad style={{ flex: "1 1 auto", minHeight: 0, paddingTop: SPACE.lg }}>
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

      <Rule />
      <Pad style={{ flex: "none", gap: SPACE.md, paddingBlock: SPACE.md }}>
        <Field ja="会期" en={data.soon ? "Soon" : "Period"}>{period}</Field>
        <Field ja="会場" en="Venue">{place}</Field>
      </Pad>

      <Perf />
      <Pad style={{ flex: "none" }}><Stub serial={data.serial} /></Pad>
    </Sheet>
  );
}
