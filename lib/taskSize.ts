import { SIDE_KEYS } from "./types";
import { MAX_ROWS, STACK_INK, type SolidSpec } from "./solid";
// ★★箱の比は「字をどう詰めるか」から出る（`rowAspect`）。**数を2度書かない**。
import { LINE_H, ROW_FILL, ROW_SIDE } from "./textFit";
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
 *
 * ★★★**字の大きさを決める側と同じ数から出す**（2026-09-13・第100巡）。
 *   `lib/textFit.ts` の `layoutInRows` は 1段の刻み `pitch` に対して
 *   字を `pitch × ROW_FILL` で置き、**四方に `pitch × (1 − LINE_H × ROW_FILL) / 2`
 *   のベゼル**を取る。だから `per` 文字を収めるのに要る幅は
 *     `pitch × (ROW_FILL × per + (1 − LINE_H × ROW_FILL))`
 *   ―― 第99巡は**ベゼルの項が無く**、箱が字にわずかに足りなかった。
 * ★★これが無いと、**長い題 × 低い重要度**の図形で字が入らずに**文字が消える**
 *   （3段が上限なので、段を増やして逃げられない）。
 * ★★★**純粋な関数のまま保つこと**（`advanceOf` で実測しない）―― 書体が届いた
 *   瞬間に箱が変わると、1度しか作らない物理の body とずれる（第99巡の轍）。
 */
export function rowAspect(title: string, rows: number): number {
  const per = Math.ceil(((title ?? "").trim().length || 1) / Math.max(1, rows));
  return Math.max(ROW_AR, ROW_FILL * per + ROW_SIDE * (1 - LINE_H * ROW_FILL));
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

/**
 * ★★★**段の高さを物差しにした外接箱**（2026-09-17・第116巡にユーザー指定
 * 「**1段ごとのピルの大きさは同じで、2段の時はそれが2個、3段の時はそれが3個、
 * そのまま積み上がったような形にしてください。で文字の大きさを揃えてください**」）。
 *
 * ★★★**`specOf` との違いはここだけ** ―― あちらは**面積**（＝重要度）を先に決めて
 *   比で割るので、**段が増えるほど段の高さが痩せ、字も小さくなる**
 *   （実測 … 同じ面積で 1段の段の高さ `0.511√A` に対し 3段は `0.256√A` ＝ **ちょうど半分**。
 *   これが「1段と2段と3段で大きさが全く違う」の正体）。
 *   こちらは**段の高さを 1 に固定**し、箱がそれに従う:
 *     `h = 段の数` ／ `w = rowAspect`（＝その段が抱える文字数）。
 *   → **どの図形でも段の厚みが同じ＝字の大きさも同じ**（字は `pitch × ROW_FILL` で、
 *     `pitch = h / rows = 1`）。
 * ★★**幅だけは題の長さで伸びる** ―― 字を同じ大きさで折り返さずに収めるには、
 *   文字数ぶんの幅が要る。**幅も固定にすると、字が縮むか `…` で消える**かの
 *   どちらかになり、ユーザーの「文字の大きさを揃えて」と両立しない。
 * ★★★**`specOf` は 1 行も変えない** ―― TASK（GRAVITY）は重要度で大きさが変わるまま。
 *   **読み替えるのはホームの山だけ**（`components/home/pileWorld.ts`）。
 */
export function rowSpecOf(t: Partial<Task> & { title: string }): SolidSpec {
  const rows = rowsOf(t.title);
  const w = rowAspect(t.title, rows);
  const h = rows;
  return {
    sides: sidesOf(t),
    // ★**塗られる**面積（物理の重さ・予算の割り当てが読む）。塗り率は積みと同じ。
    area: w * h * STACK_INK,
    w,
    h,
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
