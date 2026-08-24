import type { TabIconName } from "@/components/TabIcons";
import type { AppId, TabId } from "./types";

// ★3つのアプリの定義。タブバーの上を左右にスワイプすると、この配列の順に
// **無限に循環**して切り替わる(右端からさらに右へ払うと先頭へ回り込む)。
// 並びは左からジャーナル・タスク・ブリーフ。
//
// 3アプリはデザイン言語(PAPER/INK/影/角丸/カードの語彙)も**地の色(BG)**も
// すべて共有する。背景(components/AppBackdrop.tsx)は3アプリで1枚のグリッドを
// 共有し、アプリを移るとマスの大きさだけが変わる。

export interface AppTabDef {
  id: TabId;
  /** 読み上げ・押した時のトースト用。 */
  label: string;
  /** タブバーに出す短い英語(本文と同じ書体で小さく置く)。 */
  en: string;
  icon: TabIconName;
}

export interface AppDef {
  id: AppId;
  label: string;
  /** 画面左上(Masthead)に出す**アプリの名前**。幾何アルファベットで描くので
   *  A-Z・0-9のみ。タブごとではなくアプリごとなのが正(2026-08-04にユーザー
   *  指定で、左上はタブ名からアプリ名へ変えた)。 */
  en: string;
  tabs: AppTabDef[];
}

export const APPS: AppDef[] = [
  {
    id: "journal",
    label: "ジャーナル",
    en: "JOURNAL",
    tabs: [
      { id: "journal-record", label: "レコード", en: "RECORD", icon: "cassette" },
      { id: "journal-today", label: "今日", en: "TODAY", icon: "pen" },
      { id: "journal-archive", label: "アーカイブ", en: "ARCHIVE", icon: "dots" },
    ],
  },
  {
    id: "tasks",
    label: "タスク",
    en: "TASK",
    tabs: [
      // ★★並びが**そのまま上→下**。下の層へ行くほど印が右へ滑る。
      //   `components/tasks/TaskSpace.tsx` の `TASK_LAYERS` と必ず揃えること。
      { id: "tasks-drift", label: "候補", en: "DRIFT", icon: "drift" },
      { id: "tasks-gravity", label: "タスク", en: "GRAVITY", icon: "pile" },
      { id: "tasks-top", label: "日付", en: "TOP", icon: "holes" },
      { id: "tasks-under", label: "地中", en: "UNDER", icon: "strata" },
    ],
  },
  {
    id: "life",
    label: "ブリーフ",
    en: "EXPLORE",
    tabs: [
      { id: "brief", label: "ブリーフ", en: "BRIEF", icon: "list" },
      { id: "goals", label: "ゴール", en: "GOALS", icon: "pie" },
      { id: "stock", label: "ストック", en: "STOCK", icon: "layers" },
      { id: "execute", label: "プラン", en: "PLAN", icon: "pin" },
    ],
  },
];

export const appDef = (id: AppId): AppDef => APPS.find((a) => a.id === id) ?? APPS[2];

/** 画面左上に出すアプリの名前。どのタブでもアプリ名を出す。 */
export const appTitle = (id: AppId): string => appDef(id).en;

// 左右スワイプでの循環。dir=1で右隣、-1で左隣。端は反対の端へ回る。
export function cycleApp(id: AppId, dir: 1 | -1): AppId {
  const i = APPS.findIndex((a) => a.id === id);
  const next = (i + dir + APPS.length) % APPS.length;
  return APPS[next].id;
}

// 各アプリを開いたとき最初に見せるタブ。
export const DEFAULT_TAB: Record<AppId, TabId> = {
  tasks: "tasks-drift",
  life: "brief",
  journal: "journal-record",
};
