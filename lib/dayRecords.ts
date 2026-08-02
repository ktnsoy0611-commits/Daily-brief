import { dayInfo } from "./helpers";
import type { AppState, Item, JournalEntry, Task } from "./types";

// ★1日の記録。アーカイブ(ジャーナルアプリ)は「1日=1枚のカード」で、
// その日に実行したカード・済ませたタスク・書いたジャーナルを1枚にまとめる。
// 以前はアーカイブ専用タブでドメイン別のバインダー棚に積んでいたが、
// 「その日に何をしたか」を1枚で見渡せる形へ作り替えた(HANDOFF §10)。
export interface DayRecord {
  dateKey: string;  // YYYY-MM-DD(ローカル日付)
  label: string;    // 7月31日（金）
  items: Item[];        // その日 done になったカード
  tasks: Task[];        // その日 済ませたタスク
  entries: JournalEntry[];  // その日書いたジャーナル
}

const timeOf = (iso?: string) => (iso ? new Date(iso).getTime() : 0);

// ジャーナルは date(YYYY-MM-DD)を持つが、古い/欠けたデータのために
// createdAt からも日付を導けるようにしておく。
const entryDateKey = (e: JournalEntry) => e.date || dayInfo(e.createdAt).key;

export function buildDayRecords(state: AppState): DayRecord[] {
  const byDay = new Map<string, DayRecord>();
  const touch = (key: string, label: string): DayRecord => {
    const cur = byDay.get(key);
    if (cur) return cur;
    const rec: DayRecord = { dateKey: key, label, items: [], tasks: [], entries: [] };
    byDay.set(key, rec);
    return rec;
  };

  state.items.forEach((i) => {
    if (i.status !== "done" || !i.doneAt) return;
    const { key, label } = dayInfo(i.doneAt);
    touch(key, label).items.push(i);
  });
  (state.tasks ?? []).forEach((t) => {
    if (!t.done || !t.doneAt) return;
    const { key, label } = dayInfo(t.doneAt);
    touch(key, label).tasks.push(t);
  });
  (state.journal ?? []).forEach((e) => {
    const key = entryDateKey(e);
    touch(key, dayInfo(e.createdAt).label).entries.push(e);
  });

  const days = Array.from(byDay.values());
  days.forEach((d) => {
    d.items.sort((a, b) => timeOf(a.doneAt) - timeOf(b.doneAt));
    d.tasks.sort((a, b) => timeOf(a.doneAt) - timeOf(b.doneAt));
    d.entries.sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt));
  });
  // 新しい日が上。
  return days.sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0));
}

export const dayRecordCount = (d: DayRecord) => d.items.length + d.tasks.length + d.entries.length;

// 月ごとのまとまり(アーカイブの見出し用)。
export function groupByMonth(days: DayRecord[]): { month: string; label: string; days: DayRecord[] }[] {
  const out: { month: string; label: string; days: DayRecord[] }[] = [];
  days.forEach((d) => {
    const month = d.dateKey.slice(0, 7);
    const last = out[out.length - 1];
    if (last && last.month === month) last.days.push(d);
    else out.push({ month, label: `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`, days: [d] });
  });
  return out;
}
