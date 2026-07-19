import { DEFAULT_STATE, STORAGE_KEY } from "./constants";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import type { AppState, Item, ItemKind } from "./types";

// v19プロトタイプの window.storage (サンドボックス専用API) を、実ブラウザで
// 動く localStorage に差し替えたもの。load/save/clear のインターフェースは
// 維持しているので、Supabase版に差し替える際もUI側は無変更。
//
// 永続化には3モードある(この優先順で選ばれる):
//   cloud      … Supabaseが構成済み(環境変数あり)かつログイン済み。
//                AppStateをトップレベルキーごとの行(app_stateテーブル)に保存。
//   persistent … 上記でないブラウザ環境。従来どおりlocalStorage。
//   memory     … localStorageも使えない環境(SSR等)。プロセス内メモリのみ。
// 環境変数が無い/未ログインの間はcloudに落ちないため、これまでと完全に
// 同じ挙動(localStorage)で動く。キーとログインが揃って初めてcloudになる。
type StorageMode = "memory" | "persistent" | "cloud";

let memoryStore: AppState | null = null;
let memoryMode = typeof window === "undefined" || typeof window.localStorage === "undefined";
// load()時にセッションを確認して立てる。これがtrueの間だけsave/loadがSupabaseを使う。
let cloudActive = false;

// サーバー(夜間Cron=app/api/cron/build-brief)が所有するキー。クライアントからは
// upsertで上書きしないよう save 時に除外する。load では全キーを読むため、Cronが
// 書いたデッキ(generatedDecks)はクライアントに反映されるが、クライアントの保存が
// それを消すことはない。
const SERVER_OWNED_KEYS: ReadonlySet<string> = new Set<string>(["generatedDecks"]);

async function hasSession(): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

// app_stateの行(key,value)からAppStateを組み立て、migrate()で欠損キーを補う。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assembleFromRows(rows: { key: string; value: any }[]): AppState {
  const obj: Record<string, unknown> = {};
  rows.forEach((r) => { obj[r.key] = r.value; });
  return migrate(obj);
}

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
  merged.generatedDecks = merged.generatedDecks ?? {};

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

// localStorageからAppStateを読む(cloudフォールバック時にも使う)。
function loadLocal(): AppState {
  if (memoryMode) return migrate(memoryStore ?? structuredClone(DEFAULT_STATE));
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return migrate(raw ? JSON.parse(raw) : structuredClone(DEFAULT_STATE));
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

// AppStateをapp_stateのキーごとの行としてupsertする。
async function saveCloud(state: AppState): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user.id;
    if (!userId) return false;
    const rows = Object.entries(state)
      .filter(([key]) => !SERVER_OWNED_KEYS.has(key))
      .map(([key, value]) => ({ user_id: userId, key, value, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("app_state").upsert(rows, { onConflict: "user_id,key" });
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn("Supabaseへの保存に失敗。localStorageにフォールバックします:", e);
    return false;
  }
}

export const DataStore = {
  get mode(): StorageMode {
    if (cloudActive) return "cloud";
    return memoryMode ? "memory" : "persistent";
  },
  async load(): Promise<AppState> {
    // クラウド優先: 構成済みかつログイン済みのときだけ。
    if (isSupabaseConfigured && supabase && (await hasSession())) {
      try {
        const { data, error } = await supabase.from("app_state").select("key, value");
        if (error) throw error;
        cloudActive = true;
        if (data && data.length > 0) {
          const cloud = assembleFromRows(data);
          memoryStore = cloud;
          return cloud;
        }
        // クラウドが空 = 初回ログイン。既存のlocalStorageデータをそのまま
        // 引き継ぎ、次のsave()でクラウドへ押し上げる(移行はmigrate()を通す)。
        const local = loadLocal();
        memoryStore = local;
        await saveCloud(local);
        return local;
      } catch (e) {
        console.warn("Supabaseからの読み込みに失敗。localStorageにフォールバックします:", e);
        cloudActive = false;
      }
    }
    cloudActive = false;
    return loadLocal();
  },
  async save(state: AppState): Promise<StorageMode> {
    memoryStore = state;
    // クラウドが有効なら、まずクラウドへ。失敗したらlocalStorageへ落ちる。
    if (cloudActive) {
      if (await saveCloud(state)) return "cloud";
      cloudActive = false;
    }
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
    if (cloudActive && supabase) {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const userId = sess.session?.user.id;
        if (userId) await supabase.from("app_state").delete().eq("user_id", userId);
      } catch {
        /* noop */
      }
    }
    if (!memoryMode) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* noop */
      }
    }
  },
};
