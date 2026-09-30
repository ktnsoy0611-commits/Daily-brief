import type { TabIconName } from "@/components/TabIcons";
import type { AppId, TabId } from "./types";

// ★★★**4つのアプリの定義**（第134巡に作り直し）。並びは**下のバーの並び**そのもの
// （HOME／EXPLORE／TASK／JOURNAL。ユーザー確定）。横に払ってアプリを替える操作は無い。
// ★`tabs` は**バーに出さない**。アプリの中の区分けは縦のモジュール（`components/AppModules.tsx`）で、
//   ここの `tabs` は「`goTab(id)` でどのアプリのどのモジュールへ行くか」の索引として残っている。

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
    id: "home",
    label: "ホーム",
    en: "HOME",
    // ★1枚きり（送らない）。
    tabs: [{ id: "home", label: "ホーム", en: "HOME", icon: "list" }],
  },
  {
    id: "life",
    label: "エクスプロア",
    en: "EXPLORE",
    // ★★モジュールは BRIEF → STOCK の2つ（第134巡にユーザー確定）。★PLAN の枠は無い ―― プランは
    //   STOCK の頭のピルから作る。★`DEV`（確認用）は設定の中へ移した。
    tabs: [
      { id: "brief", label: "ブリーフ", en: "BRIEF", icon: "list" },
      { id: "stock", label: "ストック", en: "STOCK", icon: "layers" },
    ],
  },
  {
    id: "tasks",
    label: "タスク",
    en: "TASK",
    // ★TASK は作り直すまで1枚のまま（送りを掛けない）。★★第135巡から最初は**日付の列**（TIMELINE）。
    //   ALIGN（`tasks-gravity`）と DRIFT は右上の仮のタブから開く（のちに作り直す）。
    tabs: [
      { id: "tasks-timeline", label: "タスク", en: "TIMELINE", icon: "pile" },
      { id: "tasks-gravity", label: "一覧", en: "ALIGN", icon: "pile" },
      { id: "tasks-drift", label: "候補", en: "DRIFT", icon: "drift" },
    ],
  },
  {
    id: "journal",
    label: "ジャーナル",
    en: "JOURNAL",
    // ★★モジュールは RECORD → LOG の2つ。いまの TODAY と ARCHIVE は LOG の中身（LOG は作り直す）。
    tabs: [
      { id: "journal-record", label: "レコード", en: "RECORD", icon: "recorder" },
      { id: "journal-today", label: "今日", en: "LOG", icon: "pen" },
      { id: "journal-archive", label: "アーカイブ", en: "LOG", icon: "dots" },
    ],
  },
];

export const appDef = (id: AppId): AppDef => APPS.find((a) => a.id === id) ?? APPS[0];

/** 画面左上に出すアプリの名前。どのタブでもアプリ名を出す。 */
export const appTitle = (id: AppId): string => appDef(id).en;

// 各アプリを開いたとき最初に見せるタブ。
export const DEFAULT_TAB: Record<AppId, TabId> = {
  home: "home",
  tasks: "tasks-timeline",
  life: "brief",
  journal: "journal-record",
};
