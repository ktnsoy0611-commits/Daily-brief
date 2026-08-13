import type { Task, TaskWeight } from "./types";

// ★タスクの物体の大きさ。**重要度 × 切迫度**で決める(ユーザー確定)。
// 「何が差し迫っているか」を日付の文字ではなく、山の中の物の大きさで
// 直感的に見せるための唯一の物差し。純粋関数だけ。単体テストで検証する。

/** 期日までの日数 → 切迫度(0〜1)。期日が無いものは最小。 */
export function urgencyOf(dueDate: string | undefined, today: Date): number {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return 0;
  const [y, m, d] = dueDate.split("-").map(Number);
  const due = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((due - now) / 86400000);
  if (days <= 0) return 1;      // 今日・過ぎている
  if (days <= 2) return 0.8;    // 明日・明後日
  if (days <= 7) return 0.5;    // 今週のうち
  if (days <= 30) return 0.25;  // 今月のうち
  return 0.1;                   // それより先
}

/** 重要度(1=小 2=中 3=大、未設定は中) → 0〜1。 */
export const weightOf = (w: TaskWeight | undefined): number =>
  ({ 1: 0.2, 2: 0.55, 3: 1 })[w ?? 2];

/** 物体の一辺(px)。 */
export const MIN_SIDE = 52;
export const MAX_SIDE = 138;

/** 0〜1 の「効き具合」。重要度と切迫度をこの比で混ぜる。
 *  ★重要度をわずかに重く見る。半々にすると「どうでもいいが今日が期限」の
 *  ものが「重いが期日は先」のものより大きくなり、山の中で大事なものが
 *  埋もれてしまう(単体テストで実際に起きた)。 */
export const pressureOf = (task: Pick<Task, "weight" | "dueDate">, today: Date): number =>
  0.55 * weightOf(task.weight) + 0.45 * urgencyOf(task.dueDate, today);

export function sideOf(task: Pick<Task, "weight" | "dueDate">, today: Date): number {
  return MIN_SIDE + (MAX_SIDE - MIN_SIDE) * pressureOf(task, today);
}
