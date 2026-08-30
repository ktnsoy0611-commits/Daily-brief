import type { ComponentType } from "react";

import { Ticket } from "../Ticket";
import { TicketA } from "./TicketA";
import { TicketB } from "./TicketB";
import { TicketC } from "./TicketC";
import { TicketD } from "./TicketD";
import { TicketE } from "./TicketE";
import { TicketF } from "./TicketF";
import type { SampleProps } from "./TicketParts";

// ★★★**券の見本帳の一覧**（2026-08-31・第71巡）。
//   ユーザー指定「色々なデザイン見たい」に対して、**完成した案を並べて実機で選ぶ**。
//   選ばれた1案を `components/explore/Ticket.tsx` へ畳み、**このディレクトリごと消す**。
//
// ★どの案も参照4枚（Vitsœ の荷札／AuBe のポスター／Grilli の名刺／
//   Adobe Fonts のポスター）の**どれか1枚の作法**を素直に写したもの。
//   分解表は `docs/explore-redesign.md` §2。

export interface TicketSample {
  id: string;
  /** 案の名前（実機で読む短い見出し）。 */
  name: string;
  /** 何を写したか。 */
  from: string;
  Render: ComponentType<SampleProps>;
}

export const TICKET_SAMPLES: TicketSample[] = [
  { id: "0", name: "現行", from: "いま動いているもの", Render: Ticket },
  { id: "A", name: "端まで走る罫", from: "Vitsœ の荷札", Render: TicketA },
  { id: "B", name: "色が上1／クリーム下3", from: "Grilli の名刺を反転", Render: TicketB },
  { id: "C", name: "クリーム上1／色が下3", from: "Grilli の名刺", Render: TicketC },
  { id: "D", name: "写真が上1／色が下3", from: "券らしさ", Render: TicketD },
  { id: "E", name: "クリーム地に色の幾何形", from: "AuBe のポスター", Render: TicketE },
  { id: "F", name: "同じ色相の濃い段だけ", from: "Adobe Fonts のポスター", Render: TicketF },
];
