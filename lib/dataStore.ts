import { DEFAULT_STATE, STORAGE_KEY } from "./constants";
import type { AppState } from "./types";

// v19プロトタイプの window.storage (サンドボックス専用API) を、実ブラウザで
// 動く localStorage に差し替えたもの。load/save/clear のインターフェースは
// 維持しているので、フェーズ1-3でSupabase版に差し替える際もUI側は無変更。
let memoryStore: AppState | null = null;
let memoryMode = typeof window === "undefined" || typeof window.localStorage === "undefined";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrate(s: any): AppState {
  if (s.wishes && s.keeps) {
    const merged = { ...structuredClone(DEFAULT_STATE), ...s };
    merged.magazine = merged.magazine ?? null;
    merged.profile = merged.profile ?? structuredClone(DEFAULT_STATE.profile);
    merged.records = merged.records ?? structuredClone(DEFAULT_STATE.records);
    // 旧形式(records.books)からの移行: 本のレコードをmedia配列(kind:"book")に統合する
    if (merged.records.books) {
      merged.records.media = [
        ...(merged.records.media ?? []),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...merged.records.books.map((b: any) => ({ ...b, kind: "book", creator: b.author })),
      ];
      delete merged.records.books;
    }
    merged.records.media = merged.records.media ?? [];
    merged.weekendMeta = merged.weekendMeta ?? structuredClone(DEFAULT_STATE.weekendMeta);
    merged.goals = merged.goals ?? [];
    merged.pendingReview = merged.pendingReview ?? [];
    merged.sources = merged.sources ?? [];

    // 情報設計の再編: メディアの「KEEPしただけ」状態を表す値をcandidate→keepに改名。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    merged.records.media.forEach((r: any) => {
      if (r.status === "candidate") r.status = "keep";
    });
    // 旧「観たい」カテゴリの願望は、ストックタブの「作品」棚(メディア記録)に統合された。
    // 種類が推定できない場合は「映画」として変換する。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacyWatchWishes = (merged.wishes ?? []).filter((w: any) => w.categoryId === "watch");
    if (legacyWatchWishes.length > 0) {
      merged.wishes = merged.wishes.filter((w: { categoryId: string }) => w.categoryId !== "watch");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      legacyWatchWishes.forEach((w: any) => {
        merged.records.media.push({
          id: `media-migrated-${w.id}`, kind: "movie", title: w.title, creator: "",
          addedAt: w.addedAt, status: w.status === "fulfilled" ? "done" : "keep",
          doneAt: w.status === "fulfilled" ? (w.fulfilledAt ?? w.addedAt) : undefined,
        });
      });
    }

    return merged as AppState;
  }
  const v2: AppState = { ...structuredClone(DEFAULT_STATE) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (s.wishlist ?? []).forEach((w: any) => {
    if (w.source === "daily-brief" || w.keptAt) {
      v2.keeps.push({
        id: w.id, title: w.title, category: w.category, area: w.area,
        status: w.status === "done" ? "done" : "candidate",
        keptAt: w.keptAt ?? w.addedAt,
      });
    } else {
      v2.wishes.push({
        id: w.id, title: w.title, category: w.category, categoryId: w.categoryId,
        status: w.status === "done" ? "fulfilled" : "stock",
        addedAt: w.addedAt, fulfilledAt: w.doneAt,
      });
    }
  });
  return v2;
}

export const DataStore = {
  get mode(): "memory" | "persistent" {
    return memoryMode ? "memory" : "persistent";
  },
  async load(): Promise<AppState> {
    if (memoryMode) return migrate(memoryStore ?? structuredClone(DEFAULT_STATE));
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return migrate(raw ? JSON.parse(raw) : structuredClone(DEFAULT_STATE));
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  },
  async save(state: AppState): Promise<"memory" | "persistent"> {
    memoryStore = state;
    if (memoryMode) return "memory";
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return "persistent";
    } catch (e) {
      console.warn("永続化に失敗。メモリモードに切り替えます:", e);
      memoryMode = true;
      return "memory";
    }
  },
  async clear() {
    memoryStore = null;
    if (!memoryMode) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* noop */
      }
    }
  },
};
