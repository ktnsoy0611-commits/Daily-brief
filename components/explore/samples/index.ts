import type { ComponentType } from "react";

import { TicketP1 } from "./TicketP1";
import { TicketP2 } from "./TicketP2";
import { TicketP3 } from "./TicketP3";
import { TicketP4 } from "./TicketP4";
import type { SampleProps } from "./TicketParts";

// ★★★**券の見本帳の一覧**（第72巡 3案 → 第79巡 9案 → 第80巡に**4案へ絞った**）。
//   選ばれた1案を `components/explore/Ticket.tsx` へ畳み、**このディレクトリごと消す**。
//
// ★★★9案は「**色がどれだけ見えるか**」「**面をどう割るか**」で振ってあったが、
//   第80巡に**色が面から退いた**（紙は白1色）ので、前半5案の前提そのものが消えた。
//   いま振っている軸は1つ ―― **大きな英語と写真がどう出会うか**。
//
// ★★見本帳は**案ごとに違うドメイン**で並ぶ（`DevStageTab` の `SAMPLES` 4枚）。
//   紙は白のままで、**大きな英語の色だけ**が案ごとに変わる。

export interface TicketSample {
  id: string;
  /** 案の名前（実機で読む短い見出し）。 */
  name: string;
  /** 何を写したか。 */
  from: string;
  Render: ComponentType<SampleProps>;
}

export const TICKET_SAMPLES: TicketSample[] = [
  { id: "P1", name: "天地 ── 言葉が上、写真が下", from: "刷り物の作法", Render: TicketP1 },
  { id: "P2", name: "逆天地 ── 写真が上、言葉が下", from: "実物の券", Render: TicketP2 },
  { id: "P3", name: "重ね ── 写真の上に白い帯", from: "映画のポスター", Render: TicketP3 },
  { id: "P4", name: "活字 ── 語が主役、写真は小窓", from: "スイスの版面", Render: TicketP4 },
];
