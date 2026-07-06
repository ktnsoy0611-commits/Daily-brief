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
