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
 * ★★★**ホームの山のタスクの横幅の倍率**（2026-09-19・第124巡にユーザー指定
 * 「**もう少し横幅を今の2倍くらい大きくしてください**」）。
 * ★★**効くのは `rowSpecOf` だけ**（＝ホームの山）。GRAVITY の `specOf` は素のまま。
 * ★★★**幅を広げると字も大きくなるわけではない** ―― 字の大きさは**段の高さ**が
 *   決める（`layoutInRows` の `pitch × ROW_FILL`）ので、増えるのは**字の両脇の
 *   余り**だけ。**長い題ほど折り返さずに収まる**のが利き目。
 * ★目盛りの外（図形の座標系）。
 */
export const ROW_WIDE = 2;

/**
 * 1段に入る文字数の目安（**横長にする前**の基準）。★参照の1段は 399×131 で
 * 字は段の高さの約 0.62 倍 ＝ **1行 約4.9字**。
 * ★目盛りの外（図形の座標系）。
 */
const CH_1 = 5;
/** 2段に収める文字数の目安（同上）。 */
const CH_2 = 12;

/**
 * 題の文字数 → **段の数**（1..3）。
 * ★★**字の大きさは面積に比例し、箱の幅も面積の平方根に比例する**ので、
 *   1段に入る文字数は**大きさによらず一定**。だから文字数だけで決めてよい。
 * ★★実際に描く段の数は `lib/solidPaint.ts` の `plan()` が**組んでみて**決める。
 *   ここは**箱の形をあらかじめその段数に合わせておく**ための見積もり。
 *
 * ★★★**横長にしたぶんだけ、1段に入る量を増やす**（2026-09-20・第125巡に
 *   ユーザー指定「**タスクの図形は横長にした分、文字が一段に入る量を増やして
 *   ください**」）―― 閾値に **`ROW_WIDE`(2) を掛ける**。
 *   ★★★**`ROW_WIDE` を掛けた幅は、第124巡までは「字の両脇の余り」でしかなかった**
 *     ―― 箱は 2倍 広いのに折り返しの目安は元のままだったので、**10文字の題が
 *     すかすかの2段**になっていた。**同じ数から両方を出せば、広げたぶんが
 *     そのまま字に回る。**
 *   ★★**返す段の数はここ1か所**（`rowSpecOf`・`ratioOf`・`taskBitmap`・幽霊が
 *     全部これを読む）。**ホームだけ別の閾値にしない** ―― 絵と物理がずれる。
 */
export function rowsOf(title: string): number {
  const n = (title ?? "").trim().length;
  if (n <= CH_1 * ROW_WIDE) return 1;
  if (n <= CH_2 * ROW_WIDE) return 2;
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
 * ★★★**ホームの山の格子**（2026-09-27・第133巡にユーザー指定「**図形の大きさと形は、
 * それぞれで勝手に調整するのではなく、デザインシステムを統一してください。正方形の
 * グリッドを設定して…**」）。**1マス ＝ 山の内寸の幅 ÷ `GRID_COLS`**。図形の外枠は
 * 必ずマスの整数倍 … 提案 2×2／JOURNAL の円 2×2／日付 3×1／タスク 2〜4×1／
 * **焦点のタスク 4×2**。★格子の線は画面に出さない。★目盛りの外（図形の座標系）。
 * ★★★**第116〜132巡の `rowSpecOf`（段の高さ ＝ 板の半分を物差しにした箱）は削除した。
 *   復活させない** ―― 図形ごとに別の物差し（段・板・px 固定の円）を持っていたので、
 *   ユーザーの言う「それぞれで勝手に調整」になっていた。**物差しはマス1つ。**
 * ★★**`specOf`（GRAVITY）は触っていない。**
 */
export const GRID_COLS = 5;
/** ★タスクの幅（マス）の下限と上限。★上限を `GRID_COLS` にしない（壁に挟まって動けない）。 */
export const TASK_COLS_MIN = 2;
export const TASK_COLS_MAX = 4;
/** ★焦点のタスクの箱（マス）。 */
export const FOCUS_COLS = 4;
export const FOCUS_ROWS = 2;

/** 題のおおよその幅（全角 ＝ 1）。★欧文・数字は半分強。**純粋な関数**（書体の到着で箱が変わらない）。 */
const emOf = (s: string): number =>
  [...s].reduce((a, c) => a + (c.charCodeAt(0) < 0x2e80 ? 0.55 : 1), 0);

/**
 * `lines` 行を組むのに要る**ピルの幅**（刻み ＝ 高さ ÷ 2 を 1 とする）。
 * ★`lib/textFit.ts` の `layoutInRows` と同じ幾何 ―― 字は刻みの `ROW_FILL`、上下の余りを
 *   `ROW_SIDE` 倍して左右にも取り、**行の上端・下端が角丸に食い込むぶん**を足す。
 */
function pillWidthFor(em: number, lines: number): number {
  const lh = LINE_H * ROW_FILL;
  const bezel = (1 - lh) / 2;
  const cy = lines > 1 ? 0.5 : 0;           // 行の中心（刻み。角丸の半径 ＝ 1）
  const e = Math.min(1, cy + lh / 2);
  const loss = 1 - Math.sqrt(Math.max(0, 1 - e * e));
  return ROW_FILL * em + 2 * loss + 2 * bezel * ROW_SIDE;
}

/**
 * ★★★**タスクの格子の箱（マス）と行の数**。ホームの山・引き下ろしの幽霊・戻す幽霊が
 * **同じ1本**を読む（2か所で数えると、落ちた瞬間に大きさが飛ぶ）。
 * ★★**字の大きさは全部のタスクで同じ** ―― 行は必ず「箱の高さ ÷ 2」の刻みで組む
 *   （1行の題も同じ字で、上下の中央に置く）。焦点は箱が 2 マスなので字も 2倍。
 * ★★幅は**2行で収まる最小のマス**と**1行で収まる最小のマス**の狭いほう（同じなら1行）。
 */
export interface TaskCells { cols: number; rows: number; lines: number }
export function taskCellsOf(title: string, focus = false): TaskCells {
  const em = Math.max(1, emOf((title ?? "").trim()));
  // ★2行のときの長いほうの行（`splitLines` は字数で揃えるので、半分 ＋ 1字ぶんの揺れ）。
  const em2 = em / 2 + 0.5;
  // ★焦点は 4×2 マス ＝ 刻みが 1 マス。幅は刻み 4 つぶん。
  if (focus) return { cols: FOCUS_COLS, rows: FOCUS_ROWS, lines: pillWidthFor(em, 1) <= FOCUS_COLS ? 1 : 2 };
  // ★1 マスの高さ ＝ 刻み 2 つ ＝ **1 マスの幅も刻み 2 つぶん**。
  const c1 = Math.max(TASK_COLS_MIN, Math.ceil(pillWidthFor(em, 1) / 2 - 1e-6));
  const c2 = Math.max(TASK_COLS_MIN, Math.ceil(pillWidthFor(em2, 2) / 2 - 1e-6));
  const one = c1 <= c2;
  const cols = one ? c1 : c2;
  // ★上限を越える長い題は 2 行・上限の幅（字は `layoutInRows` が入るまで縮める）。
  if (cols > TASK_COLS_MAX) return { cols: TASK_COLS_MAX, rows: 1, lines: 2 };
  return { cols, rows: 1, lines: one ? 1 : 2 };
}

/** ★ピル（角丸 ＝ 高さの半分）の塗り率。`ar` ＝ 幅 ÷ 高さ。予算と重さが読む。 */
export const pillInk = (ar: number): number => 1 - (4 - Math.PI) / (4 * Math.max(1, ar));

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
