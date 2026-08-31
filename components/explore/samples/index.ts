import type { ComponentType } from "react";

import { TicketN1 } from "./TicketN1";
import { TicketN2 } from "./TicketN2";
import { TicketN3 } from "./TicketN3";
import { TicketN4 } from "./TicketN4";
import { TicketN5 } from "./TicketN5";
import { TicketN6 } from "./TicketN6";
import { TicketN7 } from "./TicketN7";
import { TicketN8 } from "./TicketN8";
import { TicketN9 } from "./TicketN9";
import type { SampleProps } from "./TicketParts";

// ★★★**券の見本帳の一覧**（第71巡に7案 → 第72巡に3案へ組み直し）。
//   選ばれた1案を `components/explore/Ticket.tsx` へ畳み、**このディレクトリごと消す**。
//
// ★★**2つの軸で振ってある**（第79巡に4案を足して9案へ）:
//   ・**N1〜N5** … 「**色がどれだけ見えるか**」。N2（帯だけ）→ N1 → N5（上下から
//     挟む）→ N3（額）→ N4（色が主役）の順に色の面積が増える。
//   ・**N6〜N9** … 「**面をどう割るか**」。N1〜N5 はどれも**横に割って**いたので、
//     縦に割る（N6）／重ねる（N7）／切り離す（N8）／上下を入れ替える（N9）を足した。
// ★★★見本帳は**案ごとに違う色**で並べる（`DevStageTab` が4つのドメインを巡らせる）。
//   同じ版面でも紙の色で印象が変わるので、1色で9枚並べても比べられない。

export interface TicketSample {
  id: string;
  /** 案の名前（実機で読む短い見出し）。 */
  name: string;
  /** 何を写したか。 */
  from: string;
  Render: ComponentType<SampleProps>;
}

export const TICKET_SAMPLES: TicketSample[] = [
  { id: "N1", name: "帯 ── 写真が上、下が色", from: "ポッドキャストのカード", Render: TicketN1 },
  { id: "N2", name: "全面 ── 写真いっぱい、下に色の帯", from: "イベントのカード", Render: TicketN2 },
  { id: "N3", name: "額 ── 色の地に写真を貼る", from: "Vitsœ の荷札", Render: TicketN3 },
  { id: "N4", name: "札 ── 色が主役、写真は小窓", from: "組織カード", Render: TicketN4 },
  { id: "N5", name: "挟み ── 色の帯が上下から挟む", from: "実物の券", Render: TicketN5 },
  { id: "N6", name: "柱 ── 左に色の柱、題を縦に組む", from: "短冊", Render: TicketN6 },
  { id: "N7", name: "札 ── 写真に色の札が差し込む", from: "美術館のキャプション", Render: TicketN7 },
  { id: "N8", name: "半券 ── 右端がちぎれる、本体は白", from: "実物の入場券", Render: TicketN8 },
  { id: "N9", name: "見出し ── 色が上、写真が下（N1 の反転）", from: "新聞の1面", Render: TicketN9 },
];
