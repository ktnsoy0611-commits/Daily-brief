import { BookOpen, CalendarCheck, CheckSquare, Heart, Inbox, Map as MapIcon, Newspaper, PenLine, Sprout } from "lucide-react";
import type { ComponentType, CSSProperties } from "react";
import type { AppId, TabId } from "./types";

// ★3つのアプリの定義。タブバーの上を左右にスワイプすると、この配列の順に
// 循環して切り替わる(端まで行くと反対の端へ回る)。今のアプリ(life)を
// 真ん中に置いてあるので、タスク・ジャーナルのどちらへも1回で行ける。
//
// 3アプリはデザイン言語(PAPER/INK/影/角丸/カードの語彙)も**地の色(BG)**も
// すべて共有する。背景(components/AppBackdrop.tsx)は下の BACKDROP_MODE で
// アプリごとの「並べ方」だけを切り替える。

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
  {
    id: "journal",
    label: "ジャーナル",
    tabs: [
      { id: "journal-today", label: "今日", Icon: PenLine },
      { id: "journal-archive", label: "アーカイブ", Icon: BookOpen },
    ],
  },
];

export const appDef = (id: AppId): AppDef => APPS.find((a) => a.id === id) ?? APPS[1];

// ---- 背景の並べ方 -------------------------------------------------------
// 実際の寸法・座標の計算は components/AppBackdrop.tsx。ここは「どのアプリが
// どの並べ方か」だけを持つ。
//
//   merged  … 画面幅いっぱいを1辺とする正方形のグリッドを画面中心から
//             上下へ展開し、その各マスに内接する正円を置く(上下ははみ出す)。
//   leftFans… 上のグリッドをさらに四分割した細かいグリッドで、画面左の
//             一列だけに「左下が角の扇形」を置く。他のマスは空。
//   dots    … leftFans と同じ細かいグリッドの、すべてのマスに円を置く。
//
// 3つは同じ土台(細かいグリッドのマス)を共有していて、merged はそのマスが
// 4倍に育って重なり合った結果として大きな円になる。だからアプリを移るときは
// 「グリッドが細かく割れる/大きくまとまる」という一続きの動きになる。
export type BackdropMode = "merged" | "leftFans" | "dots";
export const BACKDROP_MODE: Record<AppId, BackdropMode> = {
  tasks: "leftFans",
  life: "merged",
  journal: "dots",
};

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
