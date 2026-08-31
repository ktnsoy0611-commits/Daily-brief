"use client";

import { SPACE } from "@/lib/tokens";
import { KIND_DOMAIN } from "@/lib/constants";
import { DOMAIN_COLOR } from "@/lib/palette";
import {
  Figure, Grain, Lede, Mark, Meta, Pad, Rule, RULE_BAR, Sheet, Title,
  partsOf, type SampleProps,
} from "./TicketParts";

// 案N9「見出し」｜色が**上**、写真が下。N1（帯）の**上下を入れ替えた**もの。
//
// ★★入れ替えただけに見えて、読む順番が変わる ―― N1 は「絵 → 言葉」で
//   ポッドキャストのカード、N9 は「見出し → 絵」で**新聞の1面**になる。
//   どちらが良いかは実機で並べないと決まらないので、両方を見本帳に置く。
// ★★会期の升は**写真に重ねる**（下の余白へ落とすと写真が痩せる）。
// ★写真は下で**余りを全部取る**。

export function TicketN9({ data, punch, deck, width }: SampleProps) {
  const color = DOMAIN_COLOR[KIND_DOMAIN[data.kind]];
  const { period, until, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={color}>
      <Pad style={{ flex: "none", paddingTop: SPACE.lg, paddingBottom: SPACE.md, gap: SPACE.md }}>
        <Mark data={data} />
        <span style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <Title>{data.title}</Title>
          {data.summary && <Lede>{data.summary}</Lede>}
        </span>
      </Pad>
      {/* ★太いバーが大区分。紙の端まで走る（N1 と同じ役）。 */}
      <Rule weight={RULE_BAR} />
      <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
        <Figure data={data} fill={color} />
        {/* ★升は写真の下端に重ねる。★**色の面ごと**重ねる ―― 写真の上に
            直に文字を置くと、写真しだいで読めなくなる（色は測れるが写真は測れない）。 */}
        <Pad style={{
          position: "absolute", zIndex: 3, left: 0, right: 0, bottom: 0,
          background: color, paddingTop: SPACE.md, paddingBottom: SPACE.md,
        }}>
          <Grain />
          <Meta period={period} until={until} place={place} />
        </Pad>
      </div>
    </Sheet>
  );
}
