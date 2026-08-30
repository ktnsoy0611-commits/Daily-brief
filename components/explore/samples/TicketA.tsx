"use client";

import { SPACE } from "@/lib/tokens";
import { KIND_DOMAIN, TICKET_DOMAIN_COLOR } from "@/lib/constants";
import {
  Masthead, Pad, Perf, Photo, Rule, Sheet, Stub, Summary, Title,
  PairLabel, FieldValue, VRule, LABEL_W, partsOf, type SampleProps,
} from "./TicketParts";

// 案A｜**Vitsœ の荷札**。全面が色紙で、**罫が紙の端まで走る**。
//
// ★この案だけの手 … ①罫が版面の中で止まらず**紙の縁に触れる** ②欄が
//   **縦の罫で仕切られた表**になる（Vitsœ は縦の罫で面を割って左を記入欄にしている）。
// ★参照4枚のうち、いちばん「用の道具」に見える案。

/** 写真の高さ（券の高さに対する比。横長の帯）。★目盛りの外（図形） */
const PHOTO_GROW = "0 0 34%";

/** 表の1行。★ラベルと値のあいだに**縦の罫**が立つ。
 *  ★★描くたびに作らない（`react-hooks/static-components`）―― 中で定義すると
 *    毎回**別の型**になり、React が木を作り直して状態が飛ぶ。 */
function Row({ ja, en, children }: { ja: string; en: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: SPACE.sm, paddingBlock: SPACE.sm }}>
      <PairLabel ja={ja} en={en} width={LABEL_W} />
      <VRule />
      {/* ★center は意匠 ―― 罫で仕切った升の中に置く（design.md §1 の③）。 */}
      <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", paddingLeft: SPACE.xs }}>
        <FieldValue>{children}</FieldValue>
      </span>
    </div>
  );
}

export function TicketA({ data, punch, deck, width }: SampleProps) {
  const stock = TICKET_DOMAIN_COLOR[KIND_DOMAIN[data.kind]];
  const { period, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={stock}>
      <Pad style={{ flex: "none", paddingTop: SPACE.lg, paddingBottom: SPACE.sm }}>
        <Masthead data={data} />
      </Pad>
      {/* ★罫は `Pad` の外＝**紙の端まで**走る */}
      <Rule />

      <Pad style={{ flex: "1 1 auto", minHeight: 0 }}>
        {data.image && (
          <Photo src={data.image} grow={PHOTO_GROW} style={{ marginTop: SPACE.lg }} />
        )}
        <span aria-hidden style={{ flex: "3 1 0", minHeight: SPACE.lg }} />
        <Title>{data.title}</Title>
        {data.summary && (
          <Summary style={{ marginTop: SPACE.md }}>{data.summary}</Summary>
        )}
        <span aria-hidden style={{ flex: "5 1 0", minHeight: SPACE.lg }} />
      </Pad>

      <Rule />
      <Pad style={{ flex: "none" }}><Row ja="会期" en={data.soon ? "Soon" : "Period"}>{period}</Row></Pad>
      <Rule />
      <Pad style={{ flex: "none" }}><Row ja="会場" en="Venue">{place}</Row></Pad>

      <Perf />
      <Pad style={{ flex: "none" }}><Stub serial={data.serial} /></Pad>
    </Sheet>
  );
}
