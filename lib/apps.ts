import { BookOpen, CalendarCheck, CheckSquare, Heart, Map as MapIcon, Newspaper, PenLine, Sprout } from "lucide-react";
import type { ComponentType, CSSProperties } from "react";
import { BG, JOURNAL_BG, TASKS_BG } from "./constants";
import type { AppId, TabId } from "./types";

// ★3つのアプリの定義。タブバーの上を左右にスワイプすると、この配列の順に
// 循環して切り替わる(端まで行くと反対の端へ回る)。今のアプリ(life)を
// 真ん中に置いてあるので、タスク・ジャーナルのどちらへも1回で行ける。
//
// 3アプリはデザイン言語(PAPER/INK/影/角丸/カードの語彙)をすべて共有し、
// 違うのは地の色(bg)と中身だけ。タブバー・ヘッダー・シートの作りも共通の
// ものをそのまま使う。

export type TabIcon = ComponentType<{ size?: number; strokeWidth?: number; color?: string; style?: CSSProperties }>;

export interface AppTabDef {
  id: TabId;
  label: string;
  Icon: TabIcon;
}

export interface AppDef {
  id: AppId;
  label: string;
  bg: string;
  tabs: AppTabDef[];
}

export const APPS: AppDef[] = [
  {
    id: "tasks",
    label: "タスク",
    bg: TASKS_BG,
    tabs: [
      { id: "tasks-today", label: "今日", Icon: CheckSquare },
      { id: "tasks-all", label: "すべて", Icon: CalendarCheck },
    ],
  },
  {
    id: "life",
    label: "ブリーフ",
    bg: BG,
    tabs: [
      { id: "brief", label: "ブリーフ", Icon: Newspaper },
      { id: "goals", label: "ゴール", Icon: Sprout },
      { id: "stock", label: "ストック", Icon: Heart },
      { id: "execute", label: "プラン", Icon: MapIcon },
    ],
  },
  {
    id: "journal",
    label: "ジャーナル",
    bg: JOURNAL_BG,
    tabs: [
      { id: "journal-today", label: "今日", Icon: PenLine },
      { id: "journal-archive", label: "アーカイブ", Icon: BookOpen },
    ],
  },
];

export const appDef = (id: AppId): AppDef => APPS.find((a) => a.id === id) ?? APPS[1];

// 左右スワイプでの循環。dir=1で右隣、-1で左隣。端は反対の端へ回る。
export function cycleApp(id: AppId, dir: 1 | -1): AppId {
  const i = APPS.findIndex((a) => a.id === id);
  const next = (i + dir + APPS.length) % APPS.length;
  return APPS[next].id;
}

// 各アプリを開いたとき最初に見せるタブ。
export const DEFAULT_TAB: Record<AppId, TabId> = {
  tasks: "tasks-today",
  life: "brief",
  journal: "journal-today",
};
