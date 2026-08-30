import type { ComponentType } from "react";

import { TicketN1 } from "./TicketN1";
import { TicketN2 } from "./TicketN2";
import { TicketN3 } from "./TicketN3";
import { TicketN4 } from "./TicketN4";
import { TicketN5 } from "./TicketN5";
import type { SampleProps } from "./TicketParts";

// ★★★**券の見本帳の一覧**（第71巡に7案 → 第72巡に3案へ組み直し）。
//   選ばれた1案を `components/explore/Ticket.tsx` へ畳み、**このディレクトリごと消す**。
//
// ★5案は**同じ情報の階層**を持ち、**写真と色の出会い方**だけが違う。
//   比べるのは「**色がどれだけ見えるか**」―― N2（帯だけ）→ N1 → N5（上下から挟む）
//   → N3（額） → N4（色が主役）の順に色の面積が増える。

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
];
