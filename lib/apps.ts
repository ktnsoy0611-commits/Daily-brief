import { BookOpen, CalendarCheck, CheckSquare, Heart, Inbox, Map as MapIcon, Newspaper, PenLine, Sprout } from "lucide-react";
import type { ComponentType, CSSProperties } from "react";
import type { PlaneShape } from "@/components/Binder";
import type { AppId, TabId } from "./types";

// ★3つのアプリの定義。タブバーの上を左右にスワイプすると、この配列の順に
// 循環して切り替わる(端まで行くと反対の端へ回る)。今のアプリ(life)を
// 真ん中に置いてあるので、タスク・ジャーナルのどちらへも1回で行ける。
//
// 3アプリはデザイン言語(PAPER/INK/影/角丸/カードの語彙)も**地の色(BG)**も
// すべて共有する。違うのは、背景に置いた大きな図形ひとつ(symbol)と中身だけ。
// 以前はアプリごとに地の色を変えていたが、ネオバウハウス化(2026-08-02)で
// 地はほんとに薄いグレー1色へ統一し、識別は図形が担うことにした。

export type TabIcon = ComponentType<{ size?: number; strokeWidth?: number; color?: string; style?: CSSProperties }>;

export interface AppTabDef {
  id: TabId;
  label: string;
  Icon: TabIcon;
}

// 背景の透かし図形。図形の語彙はバインダー(components/Binder.tsx の
// PlaneShape)をそのまま使い、新しい形を増やさない。置き場所も、バインダーが
// 「帯の位置で種別を分ける」のと同じ考えを画面に写している。
export interface AppSymbol {
  shape: PlaneShape;
  // 図形の一辺(画面幅に対する割合)。1を超えると画面外へはみ出す。
  size: number;
  // 中心の位置(画面に対する割合)。0.5が中央、負や1超で画面外へ。
  x: number;
  y: number;
}

export interface AppDef {
  id: AppId;
  label: string;
  symbol: AppSymbol;
  tabs: AppTabDef[];
}

export const APPS: AppDef[] = [
  {
    id: "tasks",
    label: "タスク",
    // 左上から差し込む四半円(バインダーの side = 左端の帯に対応)。
    symbol: { shape: "quarterTL", size: 1.15, x: 0.02, y: 0.2 },
    tabs: [
      { id: "tasks-inbox", label: "インボックス", Icon: Inbox },
      { id: "tasks-today", label: "今日", Icon: CheckSquare },
      { id: "tasks-all", label: "すべて", Icon: CalendarCheck },
    ],
  },
  {
    id: "life",
    label: "ブリーフ",
    // 右上からはみ出す円(バインダーの target = 上端中央からはみ出す円に対応)。
    symbol: { shape: "circle", size: 1.05, x: 0.86, y: 0.16 },
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
    // 下端中央から立ち上がる半円(バインダーの stamp = 下端の帯に対応)。
    // semicircleUp は箱の「下半分」に描かれるので、箱の中心を画面の3/4あたりに
    // 置くと、ドームが画面の下端から立ち上がる形になる。
    symbol: { shape: "semicircleUp", size: 1.6, x: 0.5, y: 0.75 },
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
  tasks: "tasks-inbox",
  life: "brief",
  journal: "journal-today",
};
