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

// ★背景の構図。バインダーの表紙とまったく同じ文法にしてある:
// **無地の下地 ＋ 帯(位置が種別の印) ＋ 帯の中の正方形セルに図形**。
// 図形の語彙はバインダー(components/Binder.tsx の PlaneShape)をそのまま使い、
// 新しい形は増やさない。セルの作り方(帯の短辺を1辺とする正方形)も
// Binder.tsx の SquareCell と同じで、グリッドを守っている。
//
// アプリの識別は「帯の位置」が担う: 左端(タスク)/ 上端(ブリーフ)/ 下端
// (ジャーナル)と直交しているので、ひと目で違う画面だと分かる。
// 色は使わない(グレーの濃淡2段だけ)——ユーザー指定。
export interface AppSymbol {
  // 帯の位置。バインダーの side / geo / stamp に対応する。
  band: "left" | "top" | "bottom";
  // 帯の太さ。縦帯(left)なら画面の幅に対する割合、横帯(top/bottom)なら高さに
  // 対する割合。**セルの一辺はこの太さと「帯の長辺÷count」の小さい方**になる
  // (AppBackdrop の cellSide 参照。片方だけで決めると最後の1個がはみ出す)。
  thickness: number;
  // 帯の中に置く図形と、その数。「大きく少なく」の指定により2〜3個。
  shape: PlaneShape;
  count: number;
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
    // 左端の縦帯 + 四半円を縦に3つ(バインダーの side = タイケンの構図)。
    symbol: { band: "left", thickness: 0.4, shape: "quarterTL", count: 3 },
    tabs: [
      { id: "tasks-inbox", label: "インボックス", Icon: Inbox },
      { id: "tasks-today", label: "今日", Icon: CheckSquare },
      { id: "tasks-all", label: "すべて", Icon: CalendarCheck },
    ],
  },
  {
    id: "life",
    label: "ブリーフ",
    // 上端の帯 + 円を横に2つ(バインダーの geo = バショの構図)。
    symbol: { band: "top", thickness: 0.23, shape: "circle", count: 2 },
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
    // 下端の帯 + 半円を横に3つ連ねる(バインダーの stamp/media = モノ・
    // ジョウホウの構図。タイケンのグルメと同じ「半円が連なる」見え方)。
    // 帯は画面の下端まで伸ばすが、図形は帯の上の縁に揃えてタブバーに
    // 隠れないようにしてある(AppBackdrop の alignItems)。
    symbol: { band: "bottom", thickness: 0.26, shape: "semicircleUp", count: 3 },
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
