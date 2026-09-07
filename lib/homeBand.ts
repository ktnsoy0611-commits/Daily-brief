import type { AppState, BriefCard, InboxCandidate, Task } from "./types";
import { colorOfKind } from "./palette";
import { resolveTag, tagColor } from "./taskTags";

// ★★★**帯に何が並ぶかを決める唯一の場所**（2026-09-07・ホームの帯）。
//
// 帯は **AI が差し出したもの**の列で、中身は5種類。
//
// | # | 種類 | 出どころ | 面の色 |
// |---|---|---|---|
// | 1 | 今日入った、おすすめの提案 | その日のデッキの未読カード | **そのカードの色**（Explore と同じ） |
// | 2 | 今日行くのがおすすめの提案 | ★これから作る生成 | 同上 |
// | 3 | JOURNAL から抽出されたタスクの候補 | `inbox`（Cowork が声・日記から作る） | **そのタグの色**（TASK と同じ） |
// | 4 | フォローアップのタスクの候補 | `Task.suggestions`（`lib/taskSuggest.ts`） | **親タスクのタグの色** |
// | 5 | 期日を割り当てていないタスク | `tasks`（期日なし） | **そのタグの色** |
//
// ★★★**色は「その中身が既存のアプリで持っている色」をそのまま持ってくる**
//   （2026-09-07 ユーザー確定「既存のカラースキームを使う」）。だから
//   **ホームの提案は Explore のそのカードと同じ色**、**ホームのタスクは TASK の
//   その図形と同じ色**になり、画面をまたいでも同じものが同じ色で居続ける。
//   ★★種類の見分けは**色ではなく、写真の有無と厚み**が担う（上の段だけ厚く、
//   先頭に丸い写真か字面が付く）。
//
// ★★段は**3段** … 上＝1・2（写真を持つものがまとまる）／中＝3・4／下＝5。
//   **空の段は消す**（無いものを説明しない）。

/** 帯の1件。★**印（アイコン・矢印）は持たない。** */
export interface BandItem {
  id: string;
  kind: BandKind;
  /** ピルに出る1行。 */
  text: string;
  /** ★その中身が既存のアプリで持っている色。 */
  face: string;
  /** 1・2 だけが持つ。先頭の丸い写真。 */
  photo?: string;
  /** ★写真が無い提案の丸に入る**字面**（「展」「本」）。Explore と同じ規則。 */
  glyph?: string;
  /** 4 だけが持つ。どのタスクへのフォローアップか。 */
  parentId?: string;
}

export type BandKind = "offer" | "today" | "voice" | "followup" | "someday";

/** どの段に置くか（0=上 / 1=中 / 2=下）。 */
export const BAND_ROW: Record<BandKind, 0 | 1 | 2> = {
  offer: 0, today: 0, voice: 1, followup: 1, someday: 2,
};

/**
 * ★段ごとの件数の上限（2026-09-07 ユーザー確定）。★目盛りの外（部品の寸法）。
 * 期日未割当のタスクは数十件になり得るので、**先頭の数件だけ**を並べる ――
 * 全部並べると一周が長くなりすぎ、同じピルが戻ってくる前に忘れられる。
 */
export const BAND_LIMIT = 6;

const cardText = (c: BriefCard): string => c.title || c.trigger || c.category;
/** そのカードの色。★`BriefCard.color` は `deckStyle` がドメインから入れている。 */
const cardFace = (c: BriefCard): string => c.color ?? colorOfKind(c.kind ?? "info");
/** そのタスク／候補の色。★TASK の図形と同じ規則（タグ → 色）。 */
const taskFace = (t: Partial<Task> | Partial<InboxCandidate>, seed: string): string =>
  tagColor(resolveTag(t.tag, seed, t.title, t.context, t.belongings));

/**
 * まだ決めていない提案のカード。
 * ★山の**トゲトゲの円**が数えるのもこれ（未読の全枚数。2026-09-07 ユーザー確定）。
 *
 * ★★★**「今日の号」だけを見てはいけない**（2026-09-07・実機で帯の1段目が
 * 空になって発覚）。既存の BRIEF は、デッキを**日をまたいだ未消化のプール**
 * として持っている ―― 新しい号から順に集め、**どの日の決定でも**消化済みなら
 * 除き、会期切れも除く。夜間の生成がまだ走っていない日は今日の号が存在しない
 * ので、今日だけを見ると**必ず空**になる。
 * ★ここは `components/tabs/BriefTab.tsx` の `deck` と**同じ規則**にしてある。
 * 片方を直したらもう片方も直すこと（同じものを2つの画面に出しているため）。
 */
export function unreadCards(state: AppState): BriefCard[] {
  const decks = state.generatedDecks ?? {};
  // ★決定は日ごとの `briefs[*]` に散っている。カード id は生成ごとに一意なので、
  //   全日ぶんをマージして引く（BriefTab の `allDecisions` と同じ）。
  const decided = new Set<string>();
  for (const b of Object.values(state.briefs ?? {})) {
    for (const id of Object.keys(b?.decisions ?? {})) decided.add(id);
  }
  const now = Date.now();
  const seen = new Set<string>();
  const pool: BriefCard[] = [];
  // ★キー（"YYYY-MM-DD"）は文字列比較で新しい順に並ぶ。
  for (const ek of Object.keys(decks).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))) {
    for (const c of decks[ek] ?? []) {
      if ("type" in c && c.type) continue;            // 育成カードは提案ではない
      const id = String(c.id);
      if (seen.has(id) || decided.has(id)) continue;
      seen.add(id);
      if (c.expiresAt) {
        const t = Date.parse(c.expiresAt);
        if (!Number.isNaN(t) && t < now) continue;    // 会期切れは出さない
      }
      pool.push(c);
    }
  }
  return pool;
}

/** 帯の中身（種類ごと）。★**出どころだけで決める**（切実さで混ぜない）。 */
export function bandItems(state: AppState): BandItem[] {
  const out: BandItem[] = [];

  // 1 今日入った、おすすめの提案。★色も写真も字面も、Explore のカードのまま。
  for (const c of unreadCards(state)) {
    out.push({
      id: `offer-${c.id}`, kind: "offer", text: cardText(c),
      face: cardFace(c), photo: c.images?.[0], glyph: c.glyph,
    });
  }

  // 2 今日行くのがおすすめの提案。
  // ★★★**まだ出どころが無い**（2026-09-07）。「今日行くべき」を選ぶ生成は
  //   これから作る（段取りの最後）。それまでこの種類は 0 件のまま。
  //   ★ここに `magazine`（自分でバインドした今日の予定）を流し込まないこと ――
  //   それは「AI のおすすめ」ではなく「自分で決めたもの」で、意味が違う。

  // 3 JOURNAL のデータから抽出されたタスクの候補。
  for (const c of state.inbox ?? []) {
    if (c.dueDate) continue;                       // 日付が付いたものは帯に居ない
    out.push({ id: `voice-${c.id}`, kind: "voice", text: c.title, face: taskFace(c, c.id) });
  }

  // 4 既存のタスクへのフォローアップ（`lib/taskSuggest.ts` が作る）。
  for (const t of state.tasks ?? []) {
    if (t.done) continue;
    for (const s of t.suggestions ?? []) {
      out.push({
        id: `follow-${s.id}`, kind: "followup", text: s.title,
        face: taskFace(t, t.id), parentId: t.id,
      });
    }
  }

  // 5 期日を割り当てていないタスク。
  for (const t of state.tasks ?? []) {
    if (t.done || t.dueDate) continue;
    out.push({ id: `someday-${t.id}`, kind: "someday", text: t.title, face: taskFace(t, t.id) });
  }

  return out;
}

/** 3段ぶんに振り分け、段ごとに上限で切る。★空の段はそのまま空で返す（描く側が消す）。 */
export function bandRows(state: AppState): [BandItem[], BandItem[], BandItem[]] {
  const rows: [BandItem[], BandItem[], BandItem[]] = [[], [], []];
  for (const it of bandItems(state)) rows[BAND_ROW[it.kind]].push(it);
  return rows.map((r) => r.slice(0, BAND_LIMIT)) as [BandItem[], BandItem[], BandItem[]];
}
