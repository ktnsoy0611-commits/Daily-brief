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

// ★背景の構図。バインダーの表紙の中でも **geo(バショ)の grid2x2**
// (components/Binder.tsx)と同じ文法にしてある:
//
//   正方形のブロックを真の2x2の正方形セルに割り、
//   セルごとに明度の段と、三角・円・扇形(四半円)・半円をひとつ置く
//
// 図形の語彙は Binder.tsx の PlaneShape をそのまま使い、新しい形は
// 増やさない。バインダーは色相を持つがこちらはグレーの明度差だけで、
// 地に溶ける透かしとして敷く。
//
// アプリの識別は「ブロックの位置(上/中央/下)」と「セルの組み方」が担う。
// 色では区別しない——ユーザー指定。
// 明度の段。SHADE を基準に shade() で振る(AppBackdrop)。地(BG)との差が
// 小さい淡いグレーの範囲に収め、透かしとして読ませる。
export type AppTone = "pale" | "mid" | "deep";

export interface AppCell {
  // セルの下地。
  bg: AppTone;
  // セルいっぱいに敷く図形と、その色。null なら下地だけの色面
  // (バインダーの units 構図が「図形入りのセル」と「無地の色面」を
  // 混ぜているのと同じ。全セルを図形で埋める必要はない)。
  shape: PlaneShape | null;
  fg?: AppTone;
}

export interface AppSymbol {
  // 正方形のブロックを画面のどこに置くか。バインダーで「帯の位置」が
  // 種別の印だったのと同じ役割を、ここではブロックの位置が担う。
  anchor: "top" | "center" | "bottom";
  // 2x2 のグリッド。左上・右上・左下・右下の順。null は下地のまま
  // (＝グリッドに穴を空ける)。ブロックは画面幅ちょうどなので、各セルは
  // 常に「画面幅の半分」を1辺とする真の正方形になる。
  cells: (AppCell | null)[];
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
    // 上に寄せたブロック。角のある図形(三角・扇形)を主にして、下2つの
    // アプリと図形の系統でも見分けられるようにしている。
    symbol: {
      anchor: "top",
      cells: [
        { bg: "mid", shape: "quarterBR", fg: "deep" },
        { bg: "pale", shape: "triangleDown", fg: "mid" },
        null,
        { bg: "deep", shape: "circle", fg: "pale" },
      ],
    },
    tabs: [
      { id: "tasks-inbox", label: "インボックス", Icon: Inbox },
      { id: "tasks-today", label: "今日", Icon: CheckSquare },
      { id: "tasks-all", label: "すべて", Icon: CalendarCheck },
    ],
  },
  {
    id: "life",
    label: "ブリーフ",
    // 画面の中央に据えたブロック。円系(円・半円)を主にする。
    symbol: {
      anchor: "center",
      cells: [
        { bg: "pale", shape: "circle", fg: "deep" },
        { bg: "deep", shape: null },
        { bg: "mid", shape: "semicircleDown", fg: "pale" },
        { bg: "pale", shape: "quarterTL", fg: "mid" },
      ],
    },
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
    // 下に寄せたブロック。扇形(四半円)を主にする。下段はタブバーに
    // 重なるので、読ませたい図形は上段に置いてある。
    symbol: {
      anchor: "bottom",
      cells: [
        { bg: "deep", shape: "quarterTR", fg: "pale" },
        { bg: "mid", shape: "triangleUp", fg: "deep" },
        { bg: "pale", shape: "quarterBL", fg: "mid" },
        null,
      ],
    },
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
