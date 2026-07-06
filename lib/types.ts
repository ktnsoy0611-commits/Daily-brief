// Loose, pragmatic types for the app's client-side state. These describe the
// shape produced by the v19 prototype; field names intentionally stay camelCase
// here even though the eventual Supabase schema is snake_case (mapping happens
// at the data-access layer when that swap happens, not in these UI-facing types).

export type CategoryId = "do" | "buy" | "go";

export interface Wish {
  id: string;
  title: string;
  category: string;
  categoryId: CategoryId;
  status: "stock" | "fulfilled";
  addedAt: string;
  fulfilledAt?: string;
}

export type KeepStatus = "candidate" | "planned" | "done";

export interface Keep {
  id: string;
  title: string;
  category?: string;
  area?: string;
  status: KeepStatus;
  keptAt: string;
  doneAt?: string;
  expiresAt?: string;
  images?: string[];
  meta?: string[];
  sourceUrl?: string;
  sourceLabel?: string;
  color?: string;
}

export type MediaKindId = "movie" | "exhibition" | "live" | "book" | "album";

export interface MediaRecord {
  id: string;
  kind: MediaKindId;
  title: string;
  creator?: string;
  addedAt: string;
  // KEEPしただけでまだ読んでいない/観ていない状態。省略時は既存経路(マガジン✓/
  // 行きましたか通知/手動+)と同じ"done"として扱う。
  status?: "keep" | "done";
  doneAt?: string;
  image?: string;
  color?: string;
  good?: boolean;
  sourceKeepId?: string;
  sourceUrl?: string;
  sourceLabel?: string;
}

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

export interface MagazineItemRef {
  id: string;
  type: "keep" | "media";
}

export interface Magazine {
  dateKey: string;
  decidedAt: string;
  itemIds: MagazineItemRef[];
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
  keeps: Keep[];
  briefs: Record<string, BriefState>;
  magazine: Magazine | null;
  profile: Profile;
  records: { media: MediaRecord[] };
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
  mediaKind?: MediaKindId;
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

export interface TabProps {
  appState: AppState;
  persist: (next: AppState) => void;
  showToast: (msg: string) => void;
  goTab: (tab: TabId) => void;
}
