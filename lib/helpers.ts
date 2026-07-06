import { AREA_COORDS, AREA_FALLBACK, AUTO_THRESHOLD, INTEREST_RULES, KEEP_MAX_AGE_DAYS } from "./constants";
import type { AppState, Interest, Keep, Wish } from "./types";

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

// Keepの自動失効: 展覧会/ライブなどexpiresAt(会期末・予約締切)を持つものは
// それを過ぎたら、持たないものも一律30日を過ぎたら削除する。実行済み(done)は
// 記録として残すため対象外。
export function isExpiredKeep(k: Keep) {
  if (k.status === "done") return false;
  if (k.expiresAt) return new Date() > new Date(k.expiresAt);
  return daysBetween(k.keptAt) > KEEP_MAX_AGE_DAYS;
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
export function detectInterests(wishes: Wish[], keeps: Keep[]): Omit<Interest, "id" | "addedAt">[] {
  const titles = [...wishes.map((w) => w.title), ...keeps.map((k) => k.title)];
  const results: Omit<Interest, "id" | "addedAt">[] = [];
  INTEREST_RULES.forEach((rule) => {
    const count = titles.filter((t) => rule.match.test(t)).length;
    if (count >= AUTO_THRESHOLD) {
      results.push({ label: rule.label, categoryId: rule.categoryId, kind: rule.kind, weight: count, source: "auto" });
    }
  });
  return results;
}

// KEEPしたが、まだ読んでいない/観ていない/聴いていないメディア記録
export function candidateMedia(state: AppState) {
  return (state.records?.media ?? []).filter((r) => r.status === "candidate");
}

// Keepのカテゴリ文字列から、メディア記録に該当する種類を推定する。
// 該当しなければnull(=カフェや古着など、単なる「行った場所」として扱う)。
export function inferMediaKind(category: string | undefined) {
  if (!category) return null;
  if (/映画/.test(category)) return "movie" as const;
  if (/展覧会/.test(category)) return "exhibition" as const;
  if (/コンサート|ライブ/.test(category)) return "live" as const;
  return null;
}
