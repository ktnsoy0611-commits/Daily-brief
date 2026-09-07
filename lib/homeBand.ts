import type { AppState, BriefCard, Task } from "./types";
import { HOME_PALETTE } from "./constants";

// ★★★**帯に何が並ぶかを決める唯一の場所**（2026-09-07・ホームの帯）。
//
// 帯は **AI が差し出したもの**の列で、中身は5種類。**種類は塗りの色で見分ける**
// （印もアイコンも付けない ―― 列に印が並ぶと、印が「模様」になって印でなくなる）。
//
// | # | 種類 | 面 | 文字 | 写真 |
// |---|---|---|---|---|
// | 1 | 今日入った、おすすめの提案 | STORM | 墨 | ○ |
// | 2 | 今日行くのがおすすめの提案 | SEA | 地の色 | ○ |
// | 3 | JOURNAL から抽出されたタスクの候補 | CREAM | 墨 | ― |
// | 4 | フォローアップのタスクの候補 | ROSE | 墨（16px/700 以上） | ― |
// | 5 | 期日を割り当てていないタスク | SKY | 墨 | ― |
//
// ★★段は**3段**（2026-09-07 ユーザー確定）… 上＝1・2（写真を持つものがまとまる）／
//   中＝3・4／下＝5。**空の段は消す**（無いものを説明しない）。

/** 帯の1件。★**印（アイコン・矢印）は持たない。** */
export interface BandItem {
  id: string;
  /** 5種類のどれか。面の色と、下ろしたときの行き先を決める。 */
  kind: BandKind;
  /** ピルに出る1行。 */
  text: string;
  /** 1・2 だけが持つ。ピルの頭の丸い写真。 */
  photo?: string;
  /** 4 だけが持つ。どのタスクへのフォローアップか。 */
  parentId?: string;
}

export type BandKind = "offer" | "today" | "voice" | "followup" | "someday";

/** ★★**種類 → 面の色**。ここが「5種類を塗りの色で見分ける」の唯一の表。 */
export const BAND_FACE: Record<BandKind, string> = {
  offer: HOME_PALETTE.storm,      // 1 今日入った提案
  today: HOME_PALETTE.sea,        // 2 今日行くのがおすすめ
  voice: HOME_PALETTE.cream,      // 3 JOURNAL からの候補
  followup: HOME_PALETTE.rose,    // 4 フォローアップ
  someday: HOME_PALETTE.sky,      // 5 期日未割当
};

/** どの段に置くか（0=上 / 1=中 / 2=下）。 */
export const BAND_ROW: Record<BandKind, 0 | 1 | 2> = {
  offer: 0, today: 0, voice: 1, followup: 1, someday: 2,
};

/**
 * ★段ごとの件数の上限（2026-09-07 ユーザー確定）。★目盛りの外（部品の寸法）。
 * 期日未割当のタスクは数十件になり得るので、**先頭の数件だけ**を並べる ――
 * 全部並べると一周が数分になり、同じピルが戻ってくる前に忘れられる。
 */
export const BAND_LIMIT = 6;

const cardText = (c: BriefCard): string => c.title || c.trigger || c.category;

/**
 * その日のデッキのうち、まだ決めていないカード。
 * ★山の**トゲトゲの円**が数えるのもこれ（未読の全枚数。2026-09-07 ユーザー確定）。
 */
export function unreadCards(state: AppState, dayKey: string): BriefCard[] {
  const deck = state.generatedDecks?.[dayKey] ?? [];
  const decided = new Set(Object.keys(state.briefs?.[dayKey]?.decisions ?? {}));
  return deck.filter((c): c is BriefCard => !("type" in c && c.type) && !decided.has(String(c.id)));
}

/** 帯の中身（種類ごと）。★**出どころだけで決める**（切実さで混ぜない）。 */
export function bandItems(state: AppState, dayKey: string): BandItem[] {
  const out: BandItem[] = [];

  // 1 今日入った、おすすめの提案。
  for (const c of unreadCards(state, dayKey)) {
    out.push({ id: `offer-${c.id}`, kind: "offer", text: cardText(c), photo: c.images?.[0] });
  }

  // 2 今日行くのがおすすめの提案。
  // ★★★**まだ出どころが無い**（2026-09-07）。「今日行くべき」を選ぶ生成は
  //   これから作る（段取りの最後）。それまでこの種類は 0 件のまま。
  //   ★ここに `magazine`（自分でバインドした今日の予定）を流し込まないこと ――
  //   それは「AI のおすすめ」ではなく「自分で決めたもの」で、意味が違う。

  // 3 JOURNAL のデータから抽出されたタスクの候補（Cowork が声・日記から作る）。
  for (const c of state.inbox ?? []) {
    if (c.dueDate) continue;                       // 日付が付いたものは帯に居ない
    out.push({ id: `voice-${c.id}`, kind: "voice", text: c.title });
  }

  // 4 既存のタスクへのフォローアップ（`lib/taskSuggest.ts` が作る）。
  for (const t of state.tasks ?? []) {
    if (t.done) continue;
    for (const s of t.suggestions ?? []) {
      out.push({ id: `follow-${s.id}`, kind: "followup", text: s.title, parentId: t.id });
    }
  }

  // 5 期日を割り当てていないタスク。
  for (const t of state.tasks ?? []) {
    if (t.done || t.dueDate) continue;
    out.push({ id: `someday-${t.id}`, kind: "someday", text: t.title });
  }

  return out;
}

/** 3段ぶんに振り分け、段ごとに上限で切る。★空の段はそのまま空で返す（描く側が消す）。 */
export function bandRows(state: AppState, dayKey: string): [BandItem[], BandItem[], BandItem[]] {
  const rows: [BandItem[], BandItem[], BandItem[]] = [[], [], []];
  for (const it of bandItems(state, dayKey)) rows[BAND_ROW[it.kind]].push(it);
  return rows.map((r) => r.slice(0, BAND_LIMIT)) as [BandItem[], BandItem[], BandItem[]];
}
