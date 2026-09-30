import { AREA_COORDS, AREA_FALLBACK, AREA_LATLNG, BRIEF_RETENTION_DAYS, KEEP_MAX_AGE_DAYS, KIND_DOMAIN } from "./constants";
import type { BriefState, Item, ItemDomain } from "./types";

export const pad = (n: number) => String(n).padStart(2, "0");

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

// 記録タブの日付別ビュー用: 実行日をキー(YYYY-MM-DD, ローカル日付)と
// 表示ラベル(7月6日（月）)に変換する。ラベルは元のisoから直接曜日を
// 出すことで、キー文字列を再パースするタイムゾーンのズレを避ける。
const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];
export function dayInfo(iso: string) {
  const d = new Date(iso);
  return {
    key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    label: `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS_JA[d.getDay()]}）`,
  };
}

export function daysBetween(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/**
 * ★★★**振動**（2026-09-27・第133巡に iPhone でも鳴るようにした）。
 * ★★★**iPhone の Safari には `navigator.vibrate` が無い** ―― アプリ中の約 100 か所の `haptic()` は
 *   **iPhone では1つも鳴っていなかった**。iOS 18 から、`<input type="checkbox" switch>` を
 *   **その `<label>` の `click()` で切り替えると**システムの振動が1回鳴る。見えない1組を1度だけ作り、
 *   それを押す（指の操作の中で呼ばれたときに鳴る。タイマーの中からは鳴らないことがある）。
 * ★★鳴らせる環境（Android など）は今までどおり `vibrate(ms)`。★続けて呼ばれても `GAP_MS` に1回。
 */
let hapticLabel: HTMLLabelElement | null = null;
let hapticAt = 0;
const HAPTIC_GAP_MS = 40;
export function haptic(ms = 10) {
  if (typeof navigator === "undefined" || typeof document === "undefined") return;
  const now = performance.now();
  if (now - hapticAt < HAPTIC_GAP_MS) return;
  hapticAt = now;
  if (navigator.vibrate) { navigator.vibrate(ms); return; }
  try {
    if (!hapticLabel) {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.id = "haptic-switch";
      input.tabIndex = -1;
      input.setAttribute("aria-hidden", "true");
      const label = document.createElement("label");
      label.htmlFor = input.id;
      label.setAttribute("aria-hidden", "true");
      const hide = "position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
      input.style.cssText = hide; label.style.cssText = hide;
      document.body.append(input, label);
      hapticLabel = label;
    }
    hapticLabel.click();
  } catch { /* 鳴らないだけ */ }
}

export function ratingLabel(r: 1 | 2 | 3 | null | undefined) {
  return r === 1 ? "伸び悩み" : r === 2 ? "まずまず" : "大きく前進";
}

export function mapsUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
export function img(seed: string, w = 400, h = 300) {
  // 実URL(OGP画像など)はそのまま使う。それ以外(旧来のシード)はプレースホルダへ。
  if (/^https?:\/\//i.test(seed)) return seed;
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

// hex色をpercent(-100〜100)分だけ明るく/暗くする。カードの単色塗りに
// 斜めグラデーションの陰影を足すためだけの簡易実装。
export function shade(hex: string, percent: number) {
  const n = hex.replace("#", "");
  const num = parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// ---- Itemの分類セレクタ -------------------------------------------------
// 場所プロパティを持つか(=「行く」が絡むか)。地図・モデルプランの
// クラスタリングはすべてこの述語を基準にする。ドメイン(何であるか)とは
// 完全に独立した別軸: タイケン・ジョウホウ・モノのItemもareaを持ちうる。
export function hasPlace(item: { area?: string; lat?: number; lng?: number }) {
  // 実座標(lat/lng)を持つものは、自由文のarea(エリア名)が空でも「場所が
  // 絡む」とみなして地図に出す(フェーズBでURLから座標だけ取れてエリア名は
  // 未入力、というItemが生まれるようになったため)。
  if (typeof item.lat === "number" && typeof item.lng === "number") return true;
  return !!item.area && item.area !== "—";
}

// 実地図(Leaflet)に置くための実緯度経度。Item自身のlat/lngを最優先し、
// 無ければエリア名から既知エリアの実座標(AREA_LATLNG)へフォールバック。
// どちらも無ければnull(実地図には置けない=ピンを出さない)。
export function itemLatLng(item: { area?: string; lat?: number; lng?: number }): { lat: number; lng: number } | null {
  if (typeof item.lat === "number" && typeof item.lng === "number") return { lat: item.lat, lng: item.lng };
  const a = item.area ? AREA_LATLNG[item.area] : undefined;
  return a ?? null;
}
// 願望の4ドメイン(モノ/バショ/タイケン/ジョウホウ)への規格化された振り分け。
// ウィッシュ・ストック・プラン・アーカイブの棚は、すべてこのドメイン
// 1本を共通の主軸にしている。
export function domainOf(item: Item): ItemDomain {
  return KIND_DOMAIN[item.kind];
}
// ウィッシュから生まれたカード(sourceWishId一致)のうち、少なくとも1件が
// 「バインドされた」(現在プランに入っている、または既に実行済み=かつて
// バインドされた)状態かどうか。アーカイブのウィッシュ一覧のチェックマークに使う。
export function isWishBound(wish: { id: string }, items: Item[]): boolean {
  return items.some((i) => i.sourceWishId === wish.id && i.status !== "candidate");
}

// Itemの自動失効: 展覧会/ライブなどexpiresAt(会期末・予約締切)を持つものは
// それを過ぎたら、場所が絡むものは一律30日を過ぎたら削除する。場所を持たない
// 作品・モノ(旧作映画・積読の本・買いたいモノ)は腐らないので自動失効しない。
// 実行済み(done)は記録として残すため対象外。
export function isExpiredItem(item: Item) {
  if (item.status === "done") return false;
  if (item.expiresAt) return new Date() > new Date(item.expiresAt);
  if (!hasPlace(item)) return false;
  return daysBetween(item.addedAt) > KEEP_MAX_AGE_DAYS;
}

// ブリーフの記録(briefs[日付])は当日限りしか
// 参照されない(BriefTabは常にtodayKey()ベースのキーだけを読む)ため、
// 一定日数を過ぎたものは死重として削除する。日付部分だけ取り出せない
// キー(不正な形式)は判定できないため安全側で残す。
// キーは日付("YYYY-MM-DD")。旧形式("...-am"/"-pm")も読めるようにしてある。
export function pruneOldBriefs(briefs: Record<string, BriefState>): { pruned: Record<string, BriefState>; changed: boolean } {
  const pruned: Record<string, BriefState> = {};
  let changed = false;
  Object.entries(briefs).forEach(([key, value]) => {
    const m = key.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m && daysBetween(m[1]) > BRIEF_RETENTION_DAYS) {
      changed = true;
      return;
    }
    pruned[key] = value;
  });
  return { pruned, changed };
}

// 実座標(緯度経度)を、自作地図の0〜100%座標へ正規化する(フェーズB、
// SYSTEM-DESIGN.md §8.1「スタイライズド地図+実座標」)。生活圏=東京23区を
// 囲む固定のバウンディングボックスに対して線形投影する。緯度は北ほど地図の
// 上(=y%が小さい)になるよう反転する。端の見切れ防止に少しクランプする。
const TOKYO_BOUNDS = { latMin: 35.52, latMax: 35.83, lngMin: 139.56, lngMax: 139.92 };
export function projectLatLng(lat: number, lng: number) {
  const x = ((lng - TOKYO_BOUNDS.lngMin) / (TOKYO_BOUNDS.lngMax - TOKYO_BOUNDS.lngMin)) * 100;
  const y = ((TOKYO_BOUNDS.latMax - lat) / (TOKYO_BOUNDS.latMax - TOKYO_BOUNDS.latMin)) * 100;
  return { x: Math.min(96, Math.max(4, x)), y: Math.min(92, Math.max(6, y)) };
}

// 地図上のピン位置。実座標(lat/lng)を持つItemはそれを投影した実位置に、
// 持たないItemは従来どおりareaのAREA_COORDS中心+idハッシュのゆらぎに置く
// (フォールバック)。実データが入るほど地図が正確になり、入っていない
// ものも「エリアのあたり」には必ず出る、という多段設計。
export function pinPosition(item: { id: string; area?: string; lat?: number; lng?: number }) {
  if (typeof item.lat === "number" && typeof item.lng === "number") {
    return projectLatLng(item.lat, item.lng);
  }
  const base = AREA_COORDS[item.area ?? ""] ?? AREA_FALLBACK;
  let h = 0;
  const id = item.id || "";
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const jx = ((h % 11) - 5) * 0.7;
  const jy = (((h >> 3) % 11) - 5) * 0.7;
  return { x: Math.min(95, Math.max(5, base.x + jx)), y: Math.min(92, Math.max(8, base.y + jy)) };
}


// 選んだItemのidから、今日のマガジン(プランタブの確定リスト)を組み立てる。
// プランタブ自身の操作と、ストックタブを含む他タブから使う共通のフローティング
// 「バインド！」のどちらからも同じ組み立てロジックを使うための純粋関数
// (状態の書き換えはせず、次のAppStateを返すだけ)。場所の有無を問わず、
// 選ばれたItemはすべてplannedになる(以前は場所のKeepだけがplannedになり、
// ★★★**`buildMagazine` は第102巡に削除した。復活させない。**
//   「その日の予定」は **`Item.plannedFor`**（`lib/types.ts`）が持つ ―― `magazine` は
//   **1日ぶんしか持てない**うえ、**呼び手が 0 件**で（アプリからは誰も書かなかった）
//   ホームの山の提案の円は**常に 0 個**だった。
//   ★`AppState.magazine` と `ItemStatus` の `"planned"` は、起動時の後片付けと
//   永続化の移行に絡むので**まだ残っている**。次の巡で消すこと。
