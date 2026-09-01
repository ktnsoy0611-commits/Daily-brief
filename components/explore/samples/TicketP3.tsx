"use client";

import { SPACE } from "@/lib/tokens";
import { KIND_DOMAIN } from "@/lib/constants";
import { DOMAIN_COLOR } from "@/lib/palette";
import {
  DomainMark, Figure, Lede, Mark, Pad, Period, SAFE, Sheet, Title, Venue,
  partsOf, type SampleProps,
} from "./TicketParts";

// 案P3「全面」｜★★★**この案だけ紙がドメインの色**。参照 Post Familiar の作法。
//
// ★★★第80巡にユーザー指定「色は背景として使うのではなく、大きな文字のアクセントや
//   アイコンなどワンポイントで」。だが第81巡に提示された参照は5枚中3枚が**全面の色**
//   だった。**言葉で決めずに実機で並べて決める**ために、4案のうち1つだけ色の紙にする。
// ★★色の紙でも**デュオトーンの式は同じ**（影＝地の色／光＝紙）。写真の影が地へ
//   溶けるので、**写真が色の面から浮き上がってくる**ように見える ―― これが
//   Post Familiar の見え方の正体。
// ★★★**色の上にもう1つ色を置かない。** 文字も印も紙の色1つ（`skinOf` が導く）。

export function TicketP3({ data, punch, deck, width }: SampleProps) {
  const { period, until, place, area } = partsOf(data);
  const color = DOMAIN_COLOR[KIND_DOMAIN[data.kind]];

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={color}>
      <Pad style={{ flex: "none", paddingTop: SAFE, paddingBottom: SPACE.lg, gap: SPACE.xs }}>
        <Mark data={data} />
        <Period period={period} until={until} />
      </Pad>
      <div style={{ flex: "1 1 auto", minHeight: 0, position: "relative", display: "flex" }}>
        <Figure data={data} />
        <DomainMark data={data} />
      </div>
      <Pad style={{ flex: "none", paddingTop: SPACE.lg, paddingBottom: SAFE, gap: SPACE.xs }}>
        <Title>{data.title}</Title>
        {data.summary && <Lede lines={2}>{data.summary}</Lede>}
        <Venue place={place} area={area} />
      </Pad>
    </Sheet>
  );
}
