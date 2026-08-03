import { BookOpen, CalendarCheck, CheckSquare, Heart, Inbox, Map as MapIcon, Newspaper, PenLine, Sprout } from "lucide-react";
import type { ComponentType, CSSProperties } from "react";
import type { AppId, TabId } from "./types";

// ★3つのアプリの定義。タブバーの上を左右にスワイプすると、この配列の順に
// **無限に循環**して切り替わる(右端からさらに右へ払うと先頭へ回り込む)。
// 並びは左からジャーナル・タスク・ブリーフ。
//
// 3アプリはデザイン言語(PAPER/INK/影/角丸/カードの語彙)も**地の色(BG)**も
// すべて共有する。背景(components/AppBackdrop.tsx)は3アプリで1枚のグリッドを
// 共有し、アプリを移るとマスの大きさだけが変わる。

export type TabIcon = ComponentType<{ size?: number; strokeWidth?: number; color?: string; style?: CSSProperties }>;

export interface AppTabDef {
  id: TabId;
  label: string;
  Icon: TabIcon;
}

export interface AppDef {
  id: AppId;
  label: string;
  tabs: AppTabDef[];
}

export const APPS: AppDef[] = [
  {
    id: "journal",
    label: "ジャーナル",
    tabs: [
      { id: "journal-today", label: "今日", Icon: PenLine },
      { id: "journal-archive", label: "アーカイブ", Icon: BookOpen },
    ],
  },
  {
    id: "tasks",
    label: "タスク",
    tabs: [
      { id: "tasks-inbox", label: "インボックス", Icon: Inbox },
      { id: "tasks-today", label: "今日", Icon: CheckSquare },
      { id: "tasks-all", label: "すべて", Icon: CalendarCheck },
    ],
  },
  {
    id: "life",
    label: "ブリーフ",
    tabs: [
      { id: "brief", label: "ブリーフ", Icon: Newspaper },
      { id: "goals", label: "ゴール", Icon: Sprout },
      { id: "stock", label: "ストック", Icon: Heart },
      { id: "execute", label: "プラン", Icon: MapIcon },
    ],
  },
];

export const appDef = (id: AppId): AppDef => APPS.find((a) => a.id === id) ?? APPS[2];

// 左右スワイプでの循環。dir=1で右隣、-1で左隣。端は反対の端へ回る。
export function cycleApp(id: AppId, dir: 1 | -1): AppId {
  const i = APPS.findIndex((a) => a.id === id);
  const next = (i + dir + APPS.length) % APPS.length;
  return APPS[next].id;
}

// 各アプリを開いたとき最初に見せるタブ。
export const DEFAULT_TAB: Record<AppId, TabId> = {
  tasks: "tasks-inbox",
  life: "brief",
  journal: "journal-today",
};
