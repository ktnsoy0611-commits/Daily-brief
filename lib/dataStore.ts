import { DEFAULT_STATE, STORAGE_KEY } from "./constants";
import type { AppState, Item, ItemKind } from "./types";

// v19プロトタイプの window.storage (サンドボックス専用API) を、実ブラウザで
// 動く localStorage に差し替えたもの。load/save/clear のインターフェースは
// 維持しているので、フェーズ1-3でSupabase版に差し替える際もUI側は無変更。
let memoryStore: AppState | null = null;
let memoryMode = typeof window === "undefined" || typeof window.localStorage === "undefined";

// 旧「場所(Keep)」時代の自由文カテゴリからItemの種類を推定する。旧データの
// 一度きりの移行にしか使わない(現行のコードはItem.kindを直接持つため、
// この正規表現の推定に依存する箇所はもう無い)。
function legacyKindOf(category: string | undefined): ItemKind {
  if (!category) return "place";
  if (/映画/.test(category)) return "movie";
  if (/展覧会/.test(category)) return "exhibition";
  if (/コンサート|ライブ/.test(category)) return "live";
  return "place";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrate(s: any): AppState {
  // 最古の形式(wishlist単一配列)はまず旧v2形式(wishes+keeps)へ持ち上げる。
  if (!s.wishes) {
    const lifted: { wishes: unknown[]; keeps: unknown[] } = { wishes: [], keeps: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s.wishlist ?? []).forEach((w: any) => {
      if (w.source === "daily-brief" || w.keptAt) {
        lifted.keeps.push({
          id: w.id, title: w.title, category: w.category, area: w.area,
          status: w.status === "done" ? "done" : "candidate",
          keptAt: w.keptAt ?? w.addedAt,
        });
      } else {
        lifted.wishes.push({
          id: w.id, title: w.title,
          status: w.status === "done" ? "fulfilled" : "stock",
          addedAt: w.addedAt, fulfilledAt: w.doneAt,
        });
      }
    });
    s = lifted;
  }

  const merged = { ...structuredClone(DEFAULT_STATE), ...s };
  merged.magazine = merged.magazine ?? null;
  merged.profile = merged.profile ?? structuredClone(DEFAULT_STATE.profile);
  merged.weekendMeta = merged.weekendMeta ?? structuredClone(DEFAULT_STATE.weekendMeta);
  merged.goals = merged.goals ?? [];
  merged.pendingReview = merged.pendingReview ?? [];
  merged.sources = merged.sources ?? [];
  merged.items = merged.items ?? [];
  merged.bindLog = merged.bindLog ?? [];

  // ---- 場所(keeps)+作品(records.media)の2コンテナ → Item統一への移行 ----
  // 「場所か作品か」は排他ではなく「種類(kind)×場所の有無(area)」の直交と
  // いう再設計に伴い、両コンテナを単一のitems配列へ畳み込む。
  if (merged.keeps || merged.records) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oldKeeps: any[] = merged.keeps ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let oldMedia: any[] = merged.records?.media ?? [];
    // さらに古い形式(records.books)もこの機会に吸収する。
    if (merged.records?.books) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      oldMedia = [...oldMedia, ...merged.records.books.map((b: any) => ({ ...b, kind: "book", creator: b.author }))];
    }
    const fromKeeps: Item[] = oldKeeps.map((k) => ({
      id: k.id, kind: legacyKindOf(k.category), title: k.title, category: k.category,
      area: k.area, status: k.status === "planned" ? "planned" : k.status === "done" ? "done" : "candidate",
      addedAt: k.keptAt, doneAt: k.doneAt, expiresAt: k.expiresAt,
      images: k.images, meta: k.meta, sourceUrl: k.sourceUrl, sourceLabel: k.sourceLabel, color: k.color,
      origin: k.origin === "manual" ? "manual" : "brief",
    }));
    const fromMedia: Item[] = oldMedia.map((r) => ({
      id: r.id, kind: (r.kind ?? "movie") as ItemKind, title: r.title, creator: r.creator || undefined,
      status: (r.status ?? "done") === "done" ? "done" : "candidate",
      addedAt: r.addedAt, doneAt: r.doneAt,
      images: r.image ? [r.image] : undefined, sourceUrl: r.sourceUrl, sourceLabel: r.sourceLabel,
      color: r.color, good: r.good,
      origin: r.origin === "manual" ? "manual" : "brief",
    }));
    // 旧フローでは「場所のKeepを実行すると作品のコピーがrecords.mediaへ増える」
    // 二重記録があった(sourceKeepIdで元のKeepを指す)。統一後は1つのItemが
    // 両方の顔(種類+場所)を持てるため、コピー側は捨てる(元のKeep側は
    // legacyKindOfにより既に作品の種類を得ている)。
    merged.items = [
      ...fromKeeps,
      ...fromMedia.filter((_, idx) => !oldMedia[idx].sourceKeepId),
    ];
    delete merged.keeps;
    delete merged.records;
    // マガジンの参照は {id, type} → idの配列へ。
    if (merged.magazine?.itemIds) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      merged.magazine.itemIds = merged.magazine.itemIds.map((r: any) => (typeof r === "string" ? r : r.id));
    }
  }

  // Wishから使われていなかった分類(旧categoryId/category、do/buy/go)を落とし、
  // 自由文+状態+新しい4ドメイン分類(category: ItemDomain)だけの構造に揃える。
  // 旧「観たい」カテゴリのウィッシュは作品のItemへ変換。それ以外の既存
  // ウィッシュはcategoryフィールドを持たないため、"experience"を暫定の
  // 既定値として補う(以前の分類が無いので機械的な判定はできない。実害は
  // 表示分類だけで、ユーザーが後から書き直せば直る)。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  merged.wishes = (merged.wishes ?? []).flatMap((w: any) => {
    if (w.categoryId === "watch") {
      merged.items.push({
        id: `item-migrated-${w.id}`, kind: "movie", title: w.title,
        status: w.status === "fulfilled" ? "done" : "candidate",
        addedAt: w.addedAt, doneAt: w.status === "fulfilled" ? (w.fulfilledAt ?? w.addedAt) : undefined,
        origin: "manual",
      } satisfies Item);
      return [];
    }
    return [{ id: w.id, title: w.title, category: w.category ?? "experience", status: w.status, addedAt: w.addedAt, fulfilledAt: w.fulfilledAt }];
  });

  return merged as AppState;
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
