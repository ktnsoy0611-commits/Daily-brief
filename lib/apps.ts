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
      // ★第52巡に TOP/UNDER を破棄。タスク図形は常に GRAVITY にだけ在り、詳細リスト
      //   (ALIGN)・俯瞰(TIMELINE)は GRAVITY 内の物理モードで見せる(GravityTab)。
      //   DRIFT(候補の無重力の場)は当面タブとして残す(GRAVITY への集約は別途)。
      { id: "tasks-drift", label: "候補", en: "DRIFT", icon: "drift" },
      { id: "tasks-gravity", label: "タスク", en: "GRAVITY", icon: "pile" },
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
      // ★★**確認用**（第70巡）。刷新した券と鋏を実機で見るためだけのタブ。
      //   Explore の刷新が終わったら**この行ごと消す**。
      { id: "life-dev", label: "確認", en: "DEV", icon: "ticket" },
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
