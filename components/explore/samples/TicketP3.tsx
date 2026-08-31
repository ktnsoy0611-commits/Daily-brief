"use client";

import { SPACE } from "@/lib/tokens";
import { PAPER } from "@/lib/constants";
import {
  Figure, Grain, Lede, Mark, Meta, Pad, SAFE, Sheet, Title, partsOf, type SampleProps,
} from "./TicketParts";

// 案P3「重ね」｜写真が全面。**下端に白い帯が渡り**、その中で言葉が組まれる。
//
// ★出どころは映画のポスター（絵の上に、白く抜いた帯で情報を載せる）。
// ★★帯は**紙と同じ白**（色ではない）。色が面になる場所を作らないという
//   第80巡の規則を破らずに、写真を紙いっぱいまで使える。
// ★★写真は `flex: 1` で余りを取り、帯が**その上へ食い込む**（負の余白）。
//   これで写真は上の欠けにも左右の端にも届く。

export function TicketP3({ data, punch, deck, width }: SampleProps) {
  const { period, until, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width}>
      <Figure data={data} />
      <Pad style={{
        flex: "none", zIndex: 3, marginTop: `-${SPACE.xxl}px`,
        background: PAPER, paddingTop: SPACE.lg, paddingBottom: SAFE, gap: SPACE.md,
      }}>
        <Grain />
        <Mark data={data} />
        <span style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <Title>{data.title}</Title>
          {data.summary && <Lede lines={2}>{data.summary}</Lede>}
        </span>
        <Meta period={period} until={until} place={place} />
      </Pad>
    </Sheet>
  );
}
