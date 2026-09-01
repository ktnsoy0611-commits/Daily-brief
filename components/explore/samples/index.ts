import type { ComponentType } from "react";

import { TicketP1 } from "./TicketP1";
import { TicketP2 } from "./TicketP2";
import { TicketP3 } from "./TicketP3";
import { TicketP4 } from "./TicketP4";
import type { SampleProps } from "./TicketParts";

// ★★★**券の見本帳の一覧**（第72巡 3案 → 第79巡 9案 → 第80巡に**4案へ絞った**）。
//   選ばれた1案を `components/explore/Ticket.tsx` へ畳み、**このディレクトリごと消す**。
//
// ★★振っている軸は**大きな英語と写真がどう出会うか**（第80巡）。
// ★★★第81巡に **P3 だけ「全面が色」**にした ―― 第80巡のユーザー指定
//   「色は背景ではなくワンポイントで」と、第81巡に提示された参照（5枚中3枚が
//   全面の色）が正面から食い違うので、**言葉で決めずに実機で並べて決める**。
// ★★見本帳は**案ごとに違うドメイン**で並ぶ（`DevStageTab` の `SAMPLES` 4枚）。

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
  { id: "P3", name: "全面 ── 紙が色。写真が地から浮く", from: "Post Familiar", Render: TicketP3 },
  { id: "P4", name: "活字 ── 語と余白が主役", from: "スイスの版面", Render: TicketP4 },
];
