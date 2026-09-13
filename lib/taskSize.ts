import { SIDE_KEYS } from "./types";
import { MAX_ROWS, STACK_INK, type SolidSpec } from "./solid";
import type { InboxCandidate, SideKey, Task, TaskWeight } from "./types";

// ★タスク → 図形の寸法。**純粋関数だけ**。単体テストで検証する。
//
// 対応(2026-08-16にユーザー確定。それまでの「文字数=横幅 / 重要度=高さ /
// 手順の数=長さ」は、大きさが何を表しているのか読めないので作り直した):
//
//   **塗られる面積 = 重要度** … WEIGHT(小/中/大) × 期限の倍率。これだけ。
//     ピルの積みの塗り率(STACK_INK)で外接箱を広げるので、段の数が違っても
//     同じ重要度なら**色の量が同じ**になる。
//   **縦横比** … **1段の比 ÷ 段の数**（`ratioOf`）。1段なら横長、3段でほぼ正方形。
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
 * ★★★**箱の比は「段の数」から出る**（2026-09-13・第99巡）。
 *
 * 形が「ピルの積み」1つになったので、比は**1段の比 ÷ 段の数**でなければ
 * ならない ―― 1段なら横長、3段ならほぼ正方形。
 * ★★★第98巡までの `ratioOf`（題が長いほど横長）は**向きが逆だった** ――
 *   短い題は1段なので**横長**であるべきなのに、`RATIOS[0]`（1/2）で**縦長**に
 *   なり、1段のピルが**楕円**に潰れていた（実機の山で確認）。
 *
 * ★1段の比 3 は**参照画像の実測**（399 / 131 ＝ 3.05）。
 */
export const ROW_AR = 3;

/**
 * 題の文字数 → **段の数**（1..3）。
 * ★★**字の大きさは面積に比例し、箱の幅も面積の平方根に比例する**ので、
 *   1段に入る文字数は**大きさによらず一定**。だから文字数だけで決めてよい。
 * ★★実際に描く段の数は `lib/solidPaint.ts` の `plan()` が**組んでみて**決める。
 *   ここは**箱の形をあらかじめその段数に合わせておく**ための見積もり。
 */
export function rowsOf(title: string): number {
  const n = (title ?? "").trim().length;
  if (n <= 5) return 1;
  if (n <= 12) return 2;
  return MAX_ROWS;
}

/**
 * ★**1段の比は「その行が何文字を抱えるか」で伸びる**（下限は `ROW_AR`）。
 * 参照の1段は 399 × 131 で、字は段の高さの約 0.62 倍 ―― つまり **1行 約4.9字**。
 * だから **1字あたり 0.62** を掛ければ、字の大きさを保ったまま行が伸びる。
 * ★★これが無いと、**長い題 × 低い重要度**の図形で字が入らずに**文字が消える**
 *   （3段が上限なので、段を増やして逃げられない）。
 */
const CHARS_AR = 0.62;
export function rowAspect(title: string, rows: number): number {
  const per = Math.ceil(((title ?? "").trim().length || 1) / Math.max(1, rows));
  return Math.max(ROW_AR, per * CHARS_AR);
}

/** 縦横比(横 ÷ 縦)。★**1段の比 ÷ 段の数**。 */
export function ratioOf(title: string): number {
  const rows = rowsOf(title);
  return rowAspect(title, rows) / rows;
}

// ★★★**伸びるのは全部**（2026-09-13・第99巡）。形が「ピルの積み」1つになり、
//   守るべき「その形の自然な比」が無くなったので、`STRETCHES`（四角だけ伸ばす）と
//   `naturalRatio` は消えた。**箱の比は題の長さ（`ratioOf`）だけが決める。**

/** 埋まっている側面。先頭は必ず title(必須なので常に埋まっている扱い)。
 *  ★2番目は **dueDate**(2026-08-16確定。自由文の when は廃止)。
 *  ★★★**もう形を選ばない**（第99巡）。使うのは `isDated`（"due" が入っているか）だけ。 */
export function sidesOf(t: Partial<Task> | Partial<InboxCandidate>): SideKey[] {
  const has = (v: string | undefined) => (v ?? "").trim() !== "";
  const src = t as Record<string, string | undefined>;
  return SIDE_KEYS.filter((k) =>
    k === "title" ? true : has(k === "due" ? src.dueDate : src[k]));
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
  // ★**塗られる**面積を重要度に揃える。ピルの積みの塗り率で外接箱を広げるので、
  // 段の数が違っても同じ重要度なら色の量が同じになる。
  const boxArea = area / STACK_INK;
  // ★幅に上限を置かないこと。画面に収める役目は GravityTab の一括スケールが持つ。
  const r = ratioOf(t.title);
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
