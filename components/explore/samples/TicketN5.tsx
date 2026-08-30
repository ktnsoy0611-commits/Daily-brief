"use client";

import { SPACE } from "@/lib/tokens";
import { INK, KIND_DOMAIN, TICKET_DOMAIN_COLOR } from "@/lib/constants";
import {
  Figure, Lede, Mark, Meta, Pad, Rule, Sheet, Title, partsOf, type SampleProps,
} from "./TicketParts";

// 案N5「挟み」｜色の帯が**上と下から写真を挟む**。
//
// ★色が2か所に出るので、写真が大きくても**ドメインの色が読める**
//   （2026-08-31・ユーザー指定「アクセントカラーしか見えないデザインしかない」）。
// ★上下から挟む形はいちばん**券らしい**（実物の券も、券種の帯と情報の帯で
//   図版を挟んでいる）。細罫が帯と写真の境目を締める。

export function TicketN5({ data, punch, deck, width }: SampleProps) {
  const color = TICKET_DOMAIN_COLOR[KIND_DOMAIN[data.kind]];
  const { period, until, place } = partsOf(data);

  return (
    <Sheet data={data} punch={punch} deck={deck} width={width} stock={color}>
      {/* 上の帯 ── 券種だけ */}
      <Pad style={{ flex: "none", paddingTop: SPACE.md, paddingBottom: SPACE.md }}>
        <Mark data={data} />
      </Pad>
      <Rule />
      <Figure data={data} fill={INK} />
      <Rule />
      {/* 下の帯 ── 題・要約・会期と会場 */}
      <Pad style={{ flex: "none", paddingTop: SPACE.md, paddingBottom: SPACE.lg, gap: SPACE.md }}>
        <span style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <Title>{data.title}</Title>
          {data.summary && <Lede>{data.summary}</Lede>}
        </span>
        <Meta period={period} until={until} place={place} />
      </Pad>
    </Sheet>
  );
}
