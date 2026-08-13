import { SIDE_KEYS } from "./types";
import type { SolidSpec } from "./solid";
import type { InboxCandidate, SideKey, Task, TaskWeight } from "./types";

// ★タスク → 立体の寸法。**純粋関数だけ**。単体テストで検証する。
// 対応(2026-08-13にユーザー確定):
//   軸(X)方向の長さ  = Title の文字数
//   断面(Y/Z)の半径  = Importance(小/中/大)。物理の重さも同じ値から。
//   断面の形         = 埋まっている側面の数(1..4)
//   スラブの枚数     = 残っているサブタスクの数
// 切迫度(期日)は**大きさではなく落ちてくる順**に効く(下記 dropOrder)。

/** 重要度(1=小 2=中 3=大、未設定は中) → 断面の半径。 */
export const radiusOf = (w: TaskWeight | undefined): number =>
  ({ 1: 0.62, 2: 1.0, 3: 1.5 })[w ?? 2];

/** 重要度 → 0〜1(表示の目盛りなどで使う)。 */
export const weightOf = (w: TaskWeight | undefined): number =>
  ({ 1: 0.2, 2: 0.55, 3: 1 })[w ?? 2];

export const LEN_MIN = 1.4;
export const LEN_MAX = 4.2;

/** タイトルの文字数 → 軸方向の長さ。 */
export function lenOf(title: string): number {
  const n = (title ?? "").trim().length;
  return Math.max(LEN_MIN, Math.min(LEN_MAX, 1.1 + n * 0.16));
}

/** 埋まっている側面。先頭は必ず title(必須なので常に埋まっている扱い)。 */
export function sidesOf(t: Partial<Task> | Partial<InboxCandidate>): SideKey[] {
  const has = (v: string | undefined) => (v ?? "").trim() !== "";
  return SIDE_KEYS.filter((k) =>
    k === "title" ? true : has((t as Record<string, string | undefined>)[k]));
}

/** 残っているサブタスクの数 = スラブの枚数(最低1枚)。 */
export const slabsOf = (t: Pick<Task, "subtasks">): number =>
  Math.max(1, (t.subtasks ?? []).filter((s) => !s.done).length);

/**
 * タスク → 立体の仕様。
 *
 * ★軸の長さは「タイトルの文字数 × 残りの割合」。手順を1つ済ませるたびに
 * スラブが1枚消え、その分だけ立体が短く・軽くなる(ユーザー確定)。
 * 手順が無いものは常に満尺。
 */
export function specOf(t: Partial<Task> & { title: string }): SolidSpec {
  const all = t.subtasks ?? [];
  const slabs = slabsOf(t as Pick<Task, "subtasks">);
  const progress = all.length ? slabs / all.length : 1;
  return {
    sides: sidesOf(t),
    len: Math.max(0.95, lenOf(t.title) * progress),
    radius: radiusOf(t.weight),
    slabs,
  };
}

/** 物理の重さ。断面積 × 長さ(= 体積)に比例させる。 */
export const massOf = (spec: SolidSpec): number =>
  spec.radius * spec.radius * spec.len;

/** 画面に描くときの倍率(1単位 = 何px か)。 */
export const UNIT_PX = 46;

/** 期日までの日数 → 切迫度(0〜1)。 */
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

/**
 * 落ちてくる順。**切迫しているものほど先に落ちて山の下になる**。
 * 大きさは重要度だけで決まるので、切迫度はこちらで効かせる。
 */
export function dropOrder<T extends Pick<Task, "dueDate">>(tasks: T[], today: Date): T[] {
  return [...tasks].sort((a, b) => urgencyOf(b.dueDate, today) - urgencyOf(a.dueDate, today));
}
