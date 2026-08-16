import { SIDE_KEYS } from "./types";
import { inkRatio, naturalRatio, type SolidSpec } from "./solid";
import type { InboxCandidate, SideKey, Task, TaskWeight } from "./types";

// ★タスク → 図形の寸法。**純粋関数だけ**。単体テストで検証する。
//
// 対応(2026-08-16にユーザー確定。それまでの「文字数=横幅 / 重要度=高さ /
// 手順の数=長さ」は、大きさが何を表しているのか読めないので作り直した):
//
//   **塗られる面積 = 重要度** … WEIGHT(小/中/大) × 期限の倍率。これだけ。
//     形ごとの塗り率(inkRatio)で外接箱を広げるので、三角でも四角でも
//     同じ重要度なら**色の量が同じ**になる。
//   **縦横比** … **四角だけ**、題の長さのはしご(RATIOS)で横に伸びる。
//     円 1:1・半円 2:1・三角 1.155:1 は**その形の比を必ず保つ**
//     (2026-08-16にユーザー確定。歪ませない)。
//   形 = 埋まっている側面の数(1..4)
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

/**
 * ★期限 → 面積の倍率(2026-08-16にユーザー確定で強くした)。
 * 切迫したものを大きく、**遠いものはその分小さく**する。以前は
 * 1.0〜1.6 倍しか動かず「期限による差が小さい」と指摘された。
 * これで面積の幅は 8:1 → **24:1**(辺の比 2.8:1 → 4.9:1)。
 */
export function urgencyScale(dueDate: string | undefined, today: Date): number {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return 0.55; // 期日なし
  const days = daysUntil(dueDate, today);
  if (days <= 0) return 2.2;    // 今日・過ぎている
  if (days <= 2) return 1.6;    // 明日・明後日
  if (days <= 7) return 1.1;    // 今週のうち
  if (days <= 30) return 0.7;   // 今月のうち
  return 0.45;                  // それより先
}

/**
 * その図形の**塗られる面積**(solid²)。大きさに効くのはここだけ。
 * WEIGHT の土台に、期限の倍率を掛ける。
 */
export function areaOf(t: Partial<Task>, today: Date): number {
  return weightArea(t.weight) * urgencyScale(t.dueDate, today);
}

/**
 * ★縦横比(横 ÷ 縦)の**はしご**(2026-08-16にユーザー確定)。
 *
 * 以前は 0.75〜3.2 の連続値だったため、ダミー16件のうち9件が 1.0〜2.4 に
 * 密集し、さらに4件が下限に・1件が上限に貼り付いて同じ形になっていた
 * (「形にメリハリがない」というユーザー指摘)。**必ずこの6段のどれか**に
 * スナップさせることで、縦長・正方形・帯 がはっきり見分けられるようにする。
 *
 * 単純な整数比に揃えてあるのは、積んだときの収まりを良くするため。
 */
export const RATIOS = [1 / 2, 3 / 4, 1, 3 / 2, 5 / 2, 4] as const;

/** タイトルの文字数 → 比率の段。長い題ほど横長。 */
export function ratioOf(title: string): number {
  const n = (title ?? "").trim().length;
  if (n <= 2) return RATIOS[0];   // 縦長
  if (n <= 4) return RATIOS[1];   // やや縦長
  if (n <= 6) return RATIOS[2];   // 正方形
  if (n <= 9) return RATIOS[3];   // 横長
  if (n <= 14) return RATIOS[4];  // 帯
  return RATIOS[5];               // 細長い帯
}

/** ★はしごで伸びるのは**四角だけ**(2026-08-16にユーザー確定)。
 *  円・半円・三角は伸ばさず、面積のぶんだけ単純に大きくなる。 */
const STRETCHES = (sides: number) => sides === 4;

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
  const sides = sidesOf(t);
  const n = sides.length;
  // ★**塗られる**面積を重要度に揃える。形ごとの塗り率で外接箱を広げるので、
  // 三角でも四角でも同じ重要度なら色の量が同じになる。
  const boxArea = area / inkRatio(n);
  // ★幅に上限を置かないこと。以前は LEN_MAX 4.0 で頭打ちにして余りを高さへ
  // 回していたため、本来 2:1 の半円が 1.06:1 のドームに潰れていた。
  // 画面に収める役目は GravityTab の一括スケールが持っている。
  const r = STRETCHES(n) ? ratioOf(t.title) : naturalRatio(n);
  const w = Math.sqrt(boxArea * r);
  return {
    sides,
    area,
    w,
    h: boxArea / w,
    slabs: slabsOf(t as Pick<Task, "subtasks">),
  };
}

/** 物理の重さ。**塗られる面積 = 重要度**にそのまま比例させる。 */
export const massOf = (spec: SolidSpec): number => spec.area;

/** 画面に描くときの倍率(1単位 = 何px か)。 */
export const UNIT_PX = 46;

/** 期日までの日数。 */
export function daysUntil(dueDate: string, today: Date): number {
  const [y, m, d] = dueDate.split("-").map(Number);
  const due = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due - now) / 86400000);
}

/** 期日までの日数 → 切迫度(0〜1)。**落ちてくる順**に使う。 */
export function urgencyOf(dueDate: string | undefined, today: Date): number {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return 0;
  const days = daysUntil(dueDate, today);
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
