import { SIDE_KEYS } from "./types";
import type { SolidSpec } from "./solid";
import type { InboxCandidate, SideKey, Task, TaskWeight } from "./types";

// ★タスク → 図形の寸法。**純粋関数だけ**。単体テストで検証する。
//
// 対応(2026-08-16にユーザー確定。それまでの「文字数=横幅 / 重要度=高さ /
// 手順の数=長さ」は、大きさが何を表しているのか読めないので作り直した):
//
//   **面積 = 重要度**   … WEIGHT(小/中/大) と 期限の切迫度 の合成。これだけ。
//   **横幅 = タイトルの長さ** … 画面幅の約2/3(LEN_MAX)で頭打ち。超えたら折り返す。
//   高さ   = 面積 ÷ 横幅（極端に平たくならないようアスペクトを挟む）
//   断面の大きさ = √面積 … FRONT の平たさに引きずられない
//   断面の形 = 埋まっている側面の数(1..4)
//   スラブの枚数 = 残っているサブタスクの数（大きさには効かない）
//
// 切迫度は**大きさ**と**落ちてくる順**の両方に効く(下記 dropOrder)。

/** 重要度(1=小 2=中 3=大、未設定は中) → 面積の土台。
 *  ★面積比 1 : 2.25 : 5。以前の実効比(1 : 1.6 : 2.4)では「重要度による差が
 *  小さい」とユーザーに指摘されたので、はっきり差が出るまで広げてある。 */
export const weightArea = (w: TaskWeight | undefined): number =>
  ({ 1: 1.6, 2: 3.6, 3: 8.0 })[w ?? 2];

/** 重要度 → 0〜1(表示の目盛りなどで使う)。 */
export const weightOf = (w: TaskWeight | undefined): number =>
  ({ 1: 0.2, 2: 0.55, 3: 1 })[w ?? 2];

/** 切迫しているものをどこまで大きく見せるか(今日締切で 1 + これ 倍)。 */
export const URGENCY_K = 0.6;

/**
 * その図形の**面積**(solid²)。大きさに効くのはここだけ。
 * WEIGHT の土台に、期限の切迫度を掛けて持ち上げる。
 */
export function areaOf(t: Partial<Task>, today: Date): number {
  return weightArea(t.weight) * (1 + urgencyOf(t.dueDate, today) * URGENCY_K);
}

export const LEN_MIN = 1.4;
/** ★横幅の上限。UNIT=64 のとき 256px ＝ 390px 画面の約 2/3(ユーザー指定)。
 *  これを超える長さのタイトルは、幅を伸ばさず折り返す。 */
export const LEN_MAX = 4.0;

/** 横幅 ÷ 高さ の上限。これ以上平たい帯にはしない。
 *  ★高さを下から押さえるのではなく、**横幅を上から押さえる**こと。
 *  高さを押さえると面積が目標より膨らみ、「面積=重要度」が崩れる
 *  (長い題の中くらいのタスクが、大きいタスクに見えてしまう)。
 *  幅が足りないぶんは折り返しが受け持つ(ユーザー指定)。 */
const ASPECT_MAX = 3.2;
/** 横幅 ÷ 高さ の下限。これ以上細い塔にはしない
 *  (重要度=大 × 短い題 が、幅1.6・高さ5の柱になってしまうため)。
 *  こちらも高さではなく**幅を広げて**合わせるので、面積は保たれる。 */
const ASPECT_MIN = 0.75;

/** タイトルの文字数 → 横幅。 */
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
 * タスク → 図形の仕様。
 *
 * 面積は重要度だけで決まり、その面積を「タイトルの長さで決めた横幅」で割って
 * 高さを出す。手順(サブタスク)の数は**大きさに効かない** — 長方形を何枚に
 * 割るか(slabs)だけに効く。
 */
export function specOf(t: Partial<Task> & { title: string }, today = new Date()): SolidSpec {
  const area = areaOf(t, today);
  // 幅はタイトルの長さ。ただし「画面幅の2/3(LEN_MAX)」と「その面積で
  // 平たくなりすぎない幅」の小さい方で頭打ちにする。→ 高さは常に area/len で、
  // **面積はぴったり重要度どおり**になる。
  const cap = Math.max(LEN_MIN, Math.min(LEN_MAX, Math.sqrt(area * ASPECT_MAX)));
  const floor = Math.min(cap, Math.sqrt(area * ASPECT_MIN));
  const len = Math.max(floor, Math.min(lenOf(t.title), cap));
  return {
    sides: sidesOf(t),
    len,
    radius: area / len / 2,
    // 断面は面積をそのまま持つ(FRONT が平たくても BOTTOM は痩せない)。
    section: Math.sqrt(area),
    slabs: slabsOf(t as Pick<Task, "subtasks">),
  };
}

/** 物理の重さ。**面積 = 重要度**にそのまま比例させる。 */
export const massOf = (spec: SolidSpec): number => spec.section * spec.section;

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
