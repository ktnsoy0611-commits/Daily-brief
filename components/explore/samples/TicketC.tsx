"use client";

import { SPACE } from "@/lib/tokens";
import { INK, KIND_DOMAIN, PAPER, TICKET_DOMAIN_COLOR } from "@/lib/constants";
import {
  FieldValue, Masthead, Pad, PairLabel, Perf, Photo, RULE_HAIR, Sheet, Stub, Summary, Title,
  LABEL_W, partsOf, type SampleProps,
} from "./TicketParts";

// 案C｜**Grilli の名刺そのまま**。**クリームが上1／色が下3**。
//
// ★この案だけの手 … 欄が**罫で囲った箱**になる（Grilli の下端の多言語表と同じ役）。
//   参照4枚のうち色の面積がいちばん大きく、束ねたときいちばん強い。
// ★★写真が色ベタの上に乗るので、写真だけが「穴」に見えるおそれがある
//   ―― 参照4枚はどれも写真を使っていないので、ここは前例が無い。**実機で見て判断する。**

/** 上下の割り（1 : 3）。★目盛りの外（版面の割り・ユーザー指定） */
const HEAD = 1;
const BODY = 3;
/** 写真の高さ（本文の面に対する比）。★目盛りの外（図形） */
const PHOTO_GROW = "0 0 36%";

/** 罫で囲った表の1行。★描くたびに作らない（`react-hooks/static-components`）。 */
function Row({ ja, en, children, last }: {
  ja: string; en: string; children: React.ReactNode; last?: boolean;
}) {
  return (
    // ★升は上下いっぱいに伸ばし、中身は升の中心へ置く（design.md §1 の③＝意匠）。
    <div style={{
      display: "flex", alignItems: "stretch",
      borderBottom: last ? undefined : `${RULE_HAIR}px solid ${INK}`,
    }}>
      <span style={{
        flex: "none", width: LABEL_W, display: "flex", alignItems: "center",
        padding: `${SPACE.sm}px ${SPACE.sm}px`,
        borderRight: `${RULE_HAIR}px solid ${INK}`,
      }}>
        <PairLabel ja={ja} en={en} />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", padding: `${SPACE.sm}px` }}>
        <FieldValue>{children}</FieldValue>
      </span>
    </div>
  );
}

export function TicketC({ data, punch, deck, width }: SampleProps) {
  const color = TICKET_DOMAIN_COLOR[KIND_DOMAIN[data.kind]];
  const { period, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={color}>
      {/* 頭 ── クリーム */}
      <div style={{ flex: `${HEAD} 1 0`, minHeight: 0, background: PAPER, position: "relative", zIndex: 2 }}>
        <Pad style={{ height: "100%", paddingTop: SPACE.lg, paddingBottom: SPACE.md, justifyContent: "space-between" }}>
          <Masthead data={data} />
          <Title>{data.title}</Title>
        </Pad>
      </div>

      {/* 本文 ── ドメイン色 */}
      <div style={{ flex: `${BODY} 1 0`, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Pad style={{ flex: "1 1 auto", minHeight: 0 }}>
          {data.image && (
            <Photo src={data.image} grow={PHOTO_GROW} style={{ marginTop: SPACE.lg }} />
          )}
          {data.summary && (
            <Summary style={{ marginTop: SPACE.lg }}>{data.summary}</Summary>
          )}
          <span aria-hidden style={{ flex: "1 1 0", minHeight: SPACE.lg }} />

          {/* ★罫で囲った表（Grilli の手） */}
          <div style={{ flex: "none", border: `${RULE_HAIR}px solid ${INK}`, marginBottom: SPACE.md }}>
            <Row ja="会期" en={data.soon ? "Soon" : "Period"}>{period}</Row>
            <Row ja="会場" en="Venue" last>{place}</Row>
          </div>
        </Pad>

        <Perf />
        <Pad style={{ flex: "none" }}><Stub serial={data.serial} /></Pad>
      </div>
    </Sheet>
  );
}
