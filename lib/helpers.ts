import { AREA_COORDS, AREA_FALLBACK, AUTO_THRESHOLD, INTEREST_RULES, KEEP_MAX_AGE_DAYS } from "./constants";
import type { AppState, Interest, Item, ItemOrigin, Wish } from "./types";
import { WORK_KINDS } from "./types";

export const pad = (n: number) => String(n).padStart(2, "0");

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayLabel() {
  const d = new Date();
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${days[d.getDay()]}`;
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

export function haptic(ms = 10) {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
}

export function ratingLabel(r: 1 | 2 | 3 | null | undefined) {
  return r === 1 ? "伸び悩み" : r === 2 ? "まずまず" : "大きく前進";
}

export function mapsUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
export function searchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
export function img(seed: string, w = 400, h = 300) {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

export function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
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
// 場所プロパティを持つか(=「行く」が絡むか)。地図・行き先棚・モデルプランの
// クラスタリングはすべてこの述語を基準にする。
export function hasPlace(item: Item) {
  return !!item.area && item.area !== "—";
}
// アーカイブ・ストックの「作品」棚に立つ種類か。
export function isWork(item: Item) {
  return WORK_KINDS.includes(item.kind);
}
// 統一された棚の振り分け: 行き先(場所が絡む) / 作品(場所なしの作品) /
// モノ(場所なしのthingなど)。1つのItemはちょうど1つの棚にだけ立つ。
// 展覧会+場所のように両方の性質を持つものは「行き先」を優先する
// (プランに組み込む・地図で選ぶという行動の単位が場所だから)。
export type ShelfId = "dest" | "work" | "thing";
export function shelfOf(item: Item): ShelfId {
  if (hasPlace(item) || item.kind === "place") return "dest";
  if (isWork(item)) return "work";
  return "thing";
}
// KEEP/WISHバッジ: ブリーフ由来はKEEP、ウィッシュ由来はWISH、手動はバッジ無し。
export function originBadge(origin: ItemOrigin | undefined): "keep" | "wish" | undefined {
  if (origin === "wish") return "wish";
  if (origin === "manual") return undefined;
  return "keep";
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

// おすすめプランは木曜日に更新される、という仕様のための「週キー」。
// 直近の木曜日の日付をキーにすることで、木曜日を跨ぐたびに自動で変わる。
export function mostRecentThursday(d = new Date()) {
  const day = d.getDay();
  const diff = (day - 4 + 7) % 7;
  const thu = new Date(d);
  thu.setDate(d.getDate() - diff);
  thu.setHours(0, 0, 0, 0);
  return thu.toISOString().slice(0, 10);
}

export function pinPosition(item: { id: string; area?: string }) {
  const base = AREA_COORDS[item.area ?? ""] ?? AREA_FALLBACK;
  let h = 0;
  const id = item.id || "";
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const jx = ((h % 11) - 5) * 0.7;
  const jy = (((h >> 3) % 11) - 5) * 0.7;
  return { x: Math.min(95, Math.max(5, base.x + jx)), y: Math.min(92, Math.max(8, base.y + jy)) };
}

// ---- 興味の自動検出（プロトタイプ: キーワード頻度。本実装ではGeminiに置換） --
export function detectInterests(wishes: Wish[], items: Item[]): Omit<Interest, "id" | "addedAt">[] {
  const titles = [...wishes.map((w) => w.title), ...items.map((i) => i.title)];
  const results: Omit<Interest, "id" | "addedAt">[] = [];
  INTEREST_RULES.forEach((rule) => {
    const count = titles.filter((t) => rule.match.test(t)).length;
    if (count >= AUTO_THRESHOLD) {
      results.push({ label: rule.label, categoryId: rule.categoryId, kind: rule.kind, weight: count, source: "auto" });
    }
  });
  return results;
}

// 選んだItemのidから、今日のマガジン(プランタブの確定リスト)を組み立てる。
// プランタブ自身の操作と、ストックタブを含む他タブから使う共通のフローティング
// 「バインド！」のどちらからも同じ組み立てロジックを使うための純粋関数
// (状態の書き換えはせず、次のAppStateを返すだけ)。場所の有無を問わず、
// 選ばれたItemはすべてplannedになる(以前は場所のKeepだけがplannedになり、
// 作品側は状態が変わらないという非対称があった)。
export function buildMagazine(state: AppState, itemIds: string[]): AppState {
  const next = structuredClone(state);
  next.items.forEach((i) => { if (i.status === "planned") i.status = "candidate"; });
  next.items.forEach((i) => { if (itemIds.includes(i.id)) i.status = "planned"; });
  next.magazine = { dateKey: todayKey(), decidedAt: new Date().toISOString(), itemIds: [...itemIds] };
  return next;
}
