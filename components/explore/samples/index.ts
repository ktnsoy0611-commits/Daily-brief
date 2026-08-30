import type { ComponentType } from "react";

import { TicketN1 } from "./TicketN1";
import { TicketN2 } from "./TicketN2";
import { TicketN3 } from "./TicketN3";
import type { SampleProps } from "./TicketParts";

// ★★★**券の見本帳の一覧**（第71巡に7案 → 第72巡に3案へ組み直し）。
//   選ばれた1案を `components/explore/Ticket.tsx` へ畳み、**このディレクトリごと消す**。
//
// ★3案は**同じ情報の階層**を持ち、**写真と色の出会い方**だけが違う。
//   版面の割り方を比べるのではなく、「写真をどれだけ大きく取れるか」を比べる。

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
];
