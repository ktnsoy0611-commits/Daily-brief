// Loose, pragmatic types for the app's client-side state. These describe the
// shape produced by the v19 prototype; field names intentionally stay camelCase
// here even though the eventual Supabase schema is snake_case (mapping happens
// at the data-access layer when that swap happens, not in these UI-facing types).

import type { ReactNode } from "react";

// do/buy/go の3値は、かつてWishにも付いていたが実際には一切使われて
// いなかった(追加時は常に"do"がハードコードされていた)ため、Wishからは
// 削除した。現在はプロフィールの興味(Interest)の分類にだけ使っている。
export type CategoryId = "do" | "buy" | "go";

// ウィッシュ = まだ形のない自由文の願い。構造(種類・場所・期限)は持たない。
// 役割は (1)興味検出・ブリーフ生成の種になること (2)ブリーフがItemという
// 形にして返してくれること(そのItemはorigin:"wish"とsourceWishIdを持つ)。
// 具体的な行き先・作品・モノの構造はすべて下流のItemが担う。
export interface Wish {
  id: string;
  title: string;
  status: "stock" | "fulfilled";
  addedAt: string;
  fulfilledAt?: string;
}

// ---- Item: 収集物の統一モデル ------------------------------------------------
//
// 以前は「場所(Keep)」と「作品(MediaRecord)」の2つのコンテナに完全分離して
// いたが、現実は排他的ではない(新作映画=作品+映画館という場所 / 旧作映画=
// 場所なしの作品 / そこでしか買えないモノ=モノ+店という場所)ため、
// 「何であるか(kind)」と「どこかへ行くことが絡むか(area、場所プロパティ)」を
// 直交させた1つのItemに統一した。アクション(観る/読む/聴く/買う/行く)は
// 保存せず、kindと場所の有無から導出する(ITEM_KINDSのdoneActionLabel)。
//   - 地図に出る = areaを持つItem
//   - アーカイブの「作品」棚 = kindが作品系のItem(場所の有無を問わない)
//   - 失効 = expiresAt(会期・締切)を持つものはその日、場所を持つものは
//     30日の既定、場所を持たない作品・モノは自動失効しない
export type ItemKind = "place" | "movie" | "exhibition" | "live" | "book" | "album" | "thing";
export type ItemStatus = "candidate" | "planned" | "done";
// brief=ブリーフのKEEPから / manual=ストックで手動追加 / wish=ウィッシュが
// ブリーフを経て形になったもの(sourceWishIdで元の願いへ辿れる)
export type ItemOrigin = "brief" | "manual" | "wish";

export interface Item {
  id: string;
  kind: ItemKind;
  title: string;
  creator?: string;
  // 表示用のジャンルラベル(自由文、「近所の発見」など)。分類には使わない。
  category?: string;
  // 場所プロパティ。値があれば「行く」が絡むアイテムとして地図・行き先棚に出る。
  area?: string;
  status: ItemStatus;
  addedAt: string;
  doneAt?: string;
  // 会期末・予約締切・上映終了など。過ぎたら自動失効する。
  expiresAt?: string;
  // 予算・価格の目安(自由文)。
  price?: string;
  images?: string[];
  meta?: string[];
  sourceUrl?: string;
  sourceLabel?: string;
  color?: string;
  good?: boolean;
  origin: ItemOrigin;
  sourceWishId?: string;
}

// 作品系のkind(アーカイブで「作品」棚に立つもの)
export const WORK_KINDS: ItemKind[] = ["movie", "exhibition", "live", "book", "album"];

export interface CheckIn {
  id: string;
  at: string;
  text: string;
  source: "prompted" | "manual";
  kind?: "milestone";
  rating?: 1 | 2 | 3;
}

export interface Goal {
  id: string;
  title: string;
  addedAt: string;
  checkIns: CheckIn[];
}

export interface Interest {
  id: string;
  label: string;
  categoryId: CategoryId;
  kind: "hobby" | "artist" | "architect";
  weight: number;
  source: "auto" | "user";
  addedAt?: string;
}

export interface Profile {
  interests: Interest[];
  currentFocus: string;
}

export interface Source {
  id: string;
  url: string;
  label: string;
  addedAt: string;
}

// マガジン(プランの確定リスト)はItemのidを参照するだけの薄い層。
// Itemの統一により、以前の {id, type: "keep" | "media"} という判別は不要になった。
export interface Magazine {
  dateKey: string;
  decidedAt: string;
  itemIds: string[];
}

export interface BriefState {
  decisions: Record<string, string>;
  feedback?: Record<string, boolean>;
  completedAt?: string;
}

export interface WeekendMeta {
  lastSeenBundleWeek: string | null;
}

export interface AppState {
  wishes: Wish[];
  items: Item[];
  briefs: Record<string, BriefState>;
  magazine: Magazine | null;
  profile: Profile;
  weekendMeta: WeekendMeta;
  goals: Goal[];
  pendingReview: string[];
  sources: Source[];
}

export interface BriefCard {
  // GrowthCardとの判別可能union化のため、常にundefinedの同名フィールドを持つ
  type?: undefined;
  id: number;
  glyph?: string;
  category: string;
  categoryJp?: string;
  trigger: string;
  area?: string;
  color?: string;
  title: string;
  body: string;
  meta?: string[];
  bg: string;
  fg: string;
  accent?: string;
  serendipity?: boolean;
  images?: string[];
  sourceUrl?: string;
  sourceLabel?: string;
  // KEEPしたときに作られるItemの種類。省略時は"place"(行く場所の提案)。
  kind?: ItemKind;
  // このカードがどのウィッシュに応えたものか(タイトル一致で照合)。フェーズ2の
  // Gemini生成ではidの明示的な紐付けに置き換わる、フェーズ1の暫定表現。
  sourceWishTitle?: string;
}

export interface GrowthCard {
  id: string;
  type: "checkin" | "milestone";
  goalId: string;
  goalTitle: string;
}

export type DeckCard = BriefCard | GrowthCard;

export function isGrowthCard(card: DeckCard): card is GrowthCard {
  return (card as GrowthCard).type === "checkin" || (card as GrowthCard).type === "milestone";
}

export type TabId = "records" | "brief" | "stock" | "goals" | "execute";

// プラン(実行タブ)へバインドする候補の選択。タブを跨いで持ち回せるよう
// AppShellへ状態を引き上げ、ストックタブ・プランタブどちらからも同じ
// 選択を読み書きする。Itemの統一により、単一のid配列になった。
export interface PlanSelection {
  itemIds: string[];
}

export interface TabProps {
  appState: AppState;
  persist: (next: AppState) => void;
  showToast: (msg: string) => void;
  goTab: (tab: TabId) => void;
  profileButton?: ReactNode;
  selection: PlanSelection;
  toggleItemSelection: (id: string) => void;
  addItemIds: (ids: string[]) => void;
  setSelection: (next: PlanSelection) => void;
}
