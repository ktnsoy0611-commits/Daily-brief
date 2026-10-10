import { pad } from "./helpers";
import type { AppState, Task } from "./types";

// ★★★**新しい TASK の画面の「中身」と「操作」はここ1つ**（2026-10-10・第137巡。ユーザー承認の試作
//   https://claude.ai/artifact/VpzPX2vMvLk9ZE8w5pSAek の実装）。画面（`components/tasks/TaskBoard.tsx`）は
//   ここが返す並びを描き、ここの関数で下書き（`structuredClone` 済み）を書き換えて保存するだけ。
//   ★日付の並び・札の山・操作を画面の中に書かない（帯・山・通知が同じタスクを読むので、規則が2か所に分かれると食い違う）。

const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const dayMs = 86400000;
const at = (iso: string) => new Date(`${iso}T00:00:00`);
/** `iso` が `today` の何日後か（前なら負）。 */
export const dayDiff = (iso: string, today: string) => Math.round((at(iso).getTime() - at(today).getTime()) / dayMs);
export const isoPlus = (today: string, n: number) => {
  const d = at(today);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export type DayGroup = {
  key: string;
  /** 見出しの和文（今日／明日／10月14日）。 */
  jp: string;
  /** 見出しの欧文（FRI 10.9）。 */
  en: string;
  /** 日付の無い「いつか」か。 */
  someday: boolean;
  tasks: Task[];
};

function headOf(iso: string, today: string): { jp: string; en: string } {
  const d = at(iso);
  const n = dayDiff(iso, today);
  const en = `${WD[d.getDay()]} ${d.getMonth() + 1}.${d.getDate()}`;
  const jp = n === 0 ? "今日" : n === 1 ? "明日" : n === 2 ? "明後日" : `${d.getMonth() + 1}月${d.getDate()}日`;
  return { jp, en };
}

/** 済んでいないタスクを日付ごとに。過ぎたものは先頭の「過ぎた」へ、日付の無いものは最後の「いつか」へ。 */
export function groupsOf(tasks: Task[], today: string): DayGroup[] {
  const live = (tasks ?? []).filter((t) => !t.done && t.title?.trim());
  const byTime = (a: Task, b: Task) => (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99") || a.createdAt.localeCompare(b.createdAt);
  const out: DayGroup[] = [];
  const past = live.filter((t) => t.dueDate && t.dueDate < today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || byTime(a, b));
  if (past.length) out.push({ key: "past", jp: "過ぎた", en: "PAST", someday: false, tasks: past });
  const dated = live.filter((t) => t.dueDate && t.dueDate >= today);
  for (const iso of [...new Set(dated.map((t) => t.dueDate!))].sort()) {
    out.push({ key: iso, ...headOf(iso, today), someday: false, tasks: dated.filter((t) => t.dueDate === iso).sort(byTime) });
  }
  const someday = live.filter((t) => !t.dueDate).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (someday.length) out.push({ key: "someday", jp: "いつか", en: "SOMEDAY", someday: true, tasks: someday });
  return out;
}

/** tips の雲を出すのは、今日から3日以内のタスクだけ（それより先は確かめても忘れる）。 */
export const TIPS_DAYS = 3;
export const tipsOf = (t: Task, today: string) =>
  t.dueDate && dayDiff(t.dueDate, today) >= 0 && dayDiff(t.dueDate, today) <= TIPS_DAYS
    ? (t.tips ?? []).filter((p) => !p.checked).slice(0, 2)
    : [];

// ── 上の札（先回り） ─────────────────────────────────────────
export type DeckCard =
  | { key: string; kind: "suggest"; taskId: string; sugId: string; parent: string; title: string; why?: string }
  | { key: string; kind: "voice"; candId: string; title: string; why?: string; dueDate?: string };

/** 札の山 … 近い予定の準備（AI の提案）を期日の近い順に、そのあとに声からの候補。 */
export function deckOf(state: AppState, today: string): DeckCard[] {
  const out: DeckCard[] = [];
  const tasks = (state.tasks ?? []).filter((t) => !t.done && (t.suggestions ?? []).length)
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  for (const t of tasks) {
    if (t.dueDate && t.dueDate < today) continue;
    for (const s of t.suggestions ?? []) {
      out.push({ key: `s-${t.id}-${s.id}`, kind: "suggest", taskId: t.id, sugId: s.id, parent: t.title, title: s.title, why: s.why });
    }
  }
  for (const c of state.inbox ?? []) {
    if (c.kind !== "task" || !c.title?.trim()) continue;
    const said = c.sourceText?.trim();
    out.push({
      key: `v-${c.id}`, kind: "voice", candId: c.id, title: c.title, dueDate: c.dueDate,
      why: said ? `「${said.length > 40 ? `${said.slice(0, 40)}…` : said}」と話していました` : undefined,
    });
  }
  return out;
}

// ── 操作（下書きを書き換える。保存は呼ぶ側） ─────────────────────
const now = () => new Date().toISOString();
const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const find = (s: AppState, id: string) => (s.tasks ?? []).find((t) => t.id === id);

const remember = (s: AppState, candId: string) => {
  s.profile = s.profile ?? { interests: [] };
  s.profile.handledInbox = Array.from(new Set([...(s.profile.handledInbox ?? []), candId])).slice(-500);
};

/** 声の候補をタスクにする（`due` が無ければ候補の日付、それも無ければ「いつか」）。作ったタスクの id を返す。 */
export function acceptVoice(s: AppState, candId: string, due?: string | null): string | null {
  const c = (s.inbox ?? []).find((x) => x.id === candId);
  if (!c) return null;
  const id = uid("task");
  s.tasks.unshift({
    id, title: c.title,
    dueDate: due === null ? undefined : due ?? c.dueDate, endDate: c.endDate, dueTime: c.dueTime, endTime: c.endTime,
    context: c.context, belongings: c.belongings,
    weight: c.weight ?? 2, note: c.note, done: false, createdAt: now(),
  });
  s.inbox = s.inbox.filter((x) => x.id !== candId);
  remember(s, candId);
  return id;
}

export function rejectVoice(s: AppState, candId: string) {
  s.inbox = (s.inbox ?? []).filter((x) => x.id !== candId);
  remember(s, candId);
}

/** 準備の提案をサブタスクにする。 */
export function adoptSuggestion(s: AppState, taskId: string, sugId: string): string | null {
  const t = find(s, taskId);
  const g = t?.suggestions?.find((x) => x.id === sugId);
  if (!t || !g) return null;
  const id = uid("sub");
  t.subtasks = [...(t.subtasks ?? []), { id, title: g.title, done: false, fromSuggestion: true }];
  t.suggestions = (t.suggestions ?? []).filter((x) => x.id !== sugId);
  return id;
}

export function dropSuggestion(s: AppState, taskId: string, sugId: string) {
  const t = find(s, taskId);
  if (t) t.suggestions = (t.suggestions ?? []).filter((x) => x.id !== sugId);
}

export function finishSub(s: AppState, taskId: string, subId: string) {
  const sub = find(s, taskId)?.subtasks?.find((x) => x.id === subId);
  if (sub) { sub.done = true; sub.doneAt = now(); }
}

export function finishTask(s: AppState, id: string) {
  const t = find(s, id);
  if (t) { t.done = true; t.doneAt = now(); }
}

export function removeTask(s: AppState, id: string) {
  s.tasks = (s.tasks ?? []).filter((t) => t.id !== id);
}

/** 元に戻す … 消す・済ませる前のタスクをそのまま戻す（同じ id があれば置き換える）。 */
export function restoreTask(s: AppState, before: Task) {
  const i = (s.tasks ?? []).findIndex((t) => t.id === before.id);
  if (i >= 0) s.tasks[i] = before;
  else s.tasks.unshift(before);
}

export function setDue(s: AppState, id: string, iso: string | null) {
  const t = find(s, id);
  if (!t) return;
  if (iso) t.dueDate = iso;
  else { delete t.dueDate; delete t.endDate; delete t.dueTime; delete t.endTime; }
}

export function checkTip(s: AppState, taskId: string, tipId: string) {
  const p = find(s, taskId)?.tips?.find((x) => x.id === tipId);
  if (p) p.checked = true;
}

/** 雲の「やることに」… 一言をサブタスクにして、雲は閉じる。 */
export function tipToSub(s: AppState, taskId: string, tipId: string) {
  const t = find(s, taskId);
  const p = t?.tips?.find((x) => x.id === tipId);
  if (!t || !p) return;
  t.subtasks = [...(t.subtasks ?? []), { id: uid("sub"), title: p.todo, done: false, fromSuggestion: true }];
  p.checked = true;
}

// ── 日付の受け皿 ───────────────────────────────────────────
export type DateSlot = { key: string; jp: string; en: string; iso: string | null; other?: boolean };

/** 受け皿の6つ（今日・明日・明後日・週末・来週・いつか）と「ほかの日」。 */
export function slotsOf(today: string): DateSlot[] {
  const d = at(today).getDay();
  const toSat = (6 - d + 7) % 7 || 7;
  const toMon = (1 - d + 7) % 7 || 7;
  const mk = (key: string, jp: string, n: number): DateSlot => {
    const iso = isoPlus(today, n);
    const x = at(iso);
    return { key, jp, en: `${WD[x.getDay()]} ${x.getMonth() + 1}.${x.getDate()}`, iso };
  };
  // ★週末・来週が明日・明後日と重なるときは、その次の週へ（同じ日の升を2つ並べない）。
  const far = (n: number) => (n <= 2 ? n + 7 : n);
  return [
    mk("today", "今日", 0), mk("tomorrow", "明日", 1), mk("after", "明後日", 2),
    mk("weekend", "週末", far(toSat)), mk("next", "来週", far(toMon)),
    { key: "someday", jp: "いつか", en: "SOMEDAY", iso: null },
    { key: "other", jp: "ほかの日", en: "PICK", iso: null, other: true },
  ];
}
