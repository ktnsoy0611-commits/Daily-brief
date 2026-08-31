"use client";

import { SPACE } from "@/lib/tokens";
import { KIND_DOMAIN } from "@/lib/constants";
import { DOMAIN_COLOR } from "@/lib/palette";
import {
  Grain, Lede, Mark, Meta, Pad, Photo, Sheet, Title,
  partsOf, type SampleProps,
} from "./TicketParts";

// 案N7「札」｜写真が全面。左から差し込む**色の札**に題を載せる。
//
// ★出どころは美術館のキャプション（作品の脇に差してある札）。
// ★★札は**左端から**始まり、右は途中で止まる ―― こうすると
//   「貼り付けた札」に見えるうえ、**版面の左端は他の案と同じ1本のまま**
//   （`Pad` の左パディングに乗る）。右を空けるだけなので §2 を破らない。
// ★★写真は札の下でも続いているので、**余りを全部取る**規則はそのまま。

/** 札が右をどこまで空けるか（券の幅に対する割合）。★目盛りの外（版面の割り付け）。 */
const TAB_GAP = "18%";

export function TicketN7({ data, punch, deck, width }: SampleProps) {
  const color = DOMAIN_COLOR[KIND_DOMAIN[data.kind]];
  const { period, until, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={color}>
      <Photo src={data.image ?? ""} />
      {/* ★札。写真の上へ**食い込ませる**（負の余白）。zIndex は写真より上。 */}
      <Pad style={{
        flex: "none", zIndex: 3, marginRight: TAB_GAP, marginTop: `-${SPACE.xxl}px`,
        background: color, paddingTop: SPACE.md, paddingBottom: SPACE.md, gap: SPACE.xs,
      }}>
        <Grain />
        <Mark data={data} />
        <Title>{data.title}</Title>
      </Pad>
      <Pad style={{ flex: "none", paddingTop: SPACE.md, paddingBottom: SPACE.lg, gap: SPACE.md }}>
        {data.summary && <Lede>{data.summary}</Lede>}
        <Meta period={period} until={until} place={place} />
      </Pad>
    </Sheet>
  );
}
