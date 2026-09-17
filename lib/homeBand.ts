import type { AppState, BriefCard, ItemKind } from "./types";
import { genreOfKind, glyphOfKind } from "./deckStyle";
import { colorOfKind } from "./palette";
import { TASK_FACE } from "./constants";
import { pickTodayItems } from "./todayPick";

// ★★★**帯に何が並ぶかを決める唯一の場所**（2026-09-07・ホームの帯）。
//
// 帯は **AI が差し出したもの**の列で、中身は5種類。
//
// | # | 種類 | 出どころ | 面の色 |
// |---|---|---|---|
// | 1 | 今日入った、おすすめの提案 | その日のデッキの未読カード | **そのカードの色**（Explore と同じ） |
// | 2 | 今日行くのがおすすめの提案 | ストック（`items`）を `lib/todayPick.ts` が選ぶ | 同上 |
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
// ★★★段は**2段**（2026-09-09 ユーザー指定「タスク系のピルは一段に」）…
//   **上＝1・2**（提案。写真を持つものがまとまる）／**下＝3・4・5**（タスク系）。
//   **空の段は消す**（無いものを説明しない）。
// ★★★タスク系の1段の中は、**塗りと線で「まだ提案か／もう自分のものか」を分ける**
//   （2026-09-09 ユーザー指定）:
//   ・**塗り** … 3・4（AI がまだ差し出している最中のもの）。
//   ・**線と文字だけ** … 5（**すでに登録してあるタスク**。自分が受け取り済み）。
//   **色は TASK のメインカラー1色**（家族の濃淡には振らない）―― 1段に混ざるので、
//   色まで散らすと「塗りか線か」の区別が読めなくなる。

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
  /** ★1・2 だけが持つ。**ピルの2行目**に小さく出るジャンル（「展覧会」「場所」）。 */
  genre?: string;
  /** 4 だけが持つ。どのタスクへのフォローアップか。 */
  parentId?: string;
  /**
   * ★★**1・2 だけが持つ。`ItemKind`**（2026-09-17・第118巡）。
   * ★★★**提案（`offer`）にはまだ `Item` が無い**ので、`HomeTab.srcOf` から
   *   `kind` を引けない ―― 幽霊の**札の形**（`lib/cardShape.ts`）がそれで
   *   決まるので、**帯の側から持たせる**。
   */
  itemKind?: ItemKind;
}

export type BandKind = "offer" | "today" | "voice" | "followup" | "someday";

/** どの段に置くか（0=上＝提案 / 1=下＝タスク系）。 */
export const BAND_ROW: Record<BandKind, 0 | 1> = {
  offer: 0, today: 0, voice: 1, followup: 1, someday: 1,
};

/**
 * ★★★**線と文字だけ**で描く種類（2026-09-12・第93巡）。
 * **合図は「日付があるか／ないか」の1つだけ** ―― 下の段（3 声の候補・
 * 4 フォローアップ・5 期日未割当のタスク）は**3種とも日付を持たない**ので、
 * **下の段はまるごと輪郭**になる。
 * ★★**前巡の指定「フォローアップは塗りのまま／登録済みだけ線」は、今回の
 *   「日付あり／なしだけ」に置き換わった**（同じことを2つの言い方で言わない）。
 * ★上の段（EXPLORE の提案）は**塗りのまま** ―― 黄は地との比が 1.27 しかなく、
 *   **線にすると実機で消える**（ユーザー確定「輪郭はタスクだけ」）。
 */
export const isOutlined = (kind: BandKind): boolean => BAND_ROW[kind] === 1;

/**
 * ★段ごとの件数の上限（2026-09-07 ユーザー確定）。★目盛りの外（部品の寸法）。
 * 期日未割当のタスクは数十件になり得るので、**先頭の数件だけ**を並べる ――
 * 全部並べると一周が長くなりすぎ、同じピルが戻ってくる前に忘れられる。
 */
export const BAND_LIMIT = 6;
/**
 * ★下の段は**3種類（3・4・5）が1段に同居する**ので広げる（2026-09-09）。
 * 6 のままだと、フォローアップが6件あるだけで**登録済みのタスクが1件も
 * 出てこない**（種類ごとの取り分が無いため）。★目盛りの外（部品の寸法）。
 */
export const BAND_LIMIT_TASKS = 9;

/**
 * ★★★**未読の提案は 15 枚までしか見せない**（2026-09-11 ユーザー確定
 * 「41 は多すぎて見る気が起きない。15 ぐらいで止めて」）。★目盛りの外（部品の数）。
 *
 * ★★**上限の出どころはここ1つ。** これまで `BriefTab` に 30、夜間の生成
 * （`app/api/cron/build-brief/route.ts`）に 40 と**2つあってずれていた**ので、
 * ホームの数字（41）とデッキの枚数（30）が食い違っていた。
 *
 * ★★★**いまは「表示だけ」の上限**（ユーザー確定）。裏の `generatedDecks` は
 * 減らないので、**夜間の生成は `POOL_CAP` の番に掛かったまま止まり続ける**
 * ―― 新しい提案が増えないのが気になったら、`route.ts` の `POOL_CAP` を
 * この値にし、古い未読を落とす処理を足す（＝**実際に捨てる**側へ切り替える）。
 * ★**`generatedDecks` はサーバーのもの**（`lib/dataStore.ts` の
 * `SERVER_OWNED_KEYS`）なので、本当に減らせるのは生成側だけ。
 */
export const BRIEF_POOL_CAP = 15;

const cardText = (c: BriefCard): string => c.title || c.trigger || c.category;
/**
 * そのカードの色。
 * ★★★**`BriefCard.color` を信じてはいけない**（2026-09-09・実機で発覚）。
 *   `deckStyle` が**生成した夜のパレット**で色を焼き込んでいるので、配色を
 *   替えても**過去に生成された号は昔の色のまま**出てくる（展覧会が古いオレンジ
 *   のままだったのがこれ）。**いま生きている表から毎回引き直す。**
 */
const cardFace = (c: BriefCard): string => colorOfKind(c.kind ?? "info");
/**
 * タスク系のピルの色。★★**無彩色のグレー1色**（第117巡にユーザー指定）。
 * ★第93巡にタグを廃止したので、分岐そのものが消えた（`lib/constants.ts` の1か所）。
 */
const taskFace = (): string => TASK_FACE;

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
  return unreadEntries(state).map((e) => e.card);
}

/**
 * ★★★**未読の提案を「元の号のキーごと」返す**（2026-09-17・第118巡）。
 *
 * ★★★**`ed`（号のキー）が要るのは KEEP のため** ―― 帯から提案のピルを
 *   引き下ろすと `lib/keepCard.ts` で `Item` を作るが、その id は
 *   `brief-<ed>-<card.id>` で、決定も `briefs[ed].decisions` へ打つ。
 *   **`BriefCard` だけ返していたので `ed` が取れなかった**（＝ホーム側からは
 *   KEEP できず、引き下ろしても何も起きずに消えていた）。
 * ★`unreadCards` はこの薄い包み（既存の呼び手はそのまま）。
 */
export function unreadEntries(state: AppState): { ed: string; card: BriefCard }[] {
  const decks = state.generatedDecks ?? {};
  // ★決定は日ごとの `briefs[*]` に散っている。カード id は生成ごとに一意なので、
  //   全日ぶんをマージして引く（BriefTab の `allDecisions` と同じ）。
  const decided = new Set<string>();
  for (const b of Object.values(state.briefs ?? {})) {
    for (const id of Object.keys(b?.decisions ?? {})) decided.add(id);
  }
  const now = Date.now();
  const seen = new Set<string>();
  const pool: { ed: string; card: BriefCard }[] = [];
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
      pool.push({ ed: ek, card: c });
      // ★★**新しい順に 15 枚で打ち切る**（`BRIEF_POOL_CAP`）。キーは
      //   "YYYY-MM-DD" の文字列比較で**新しい号から**回っているので、
      //   ここで止めれば残るのは**いちばん新しい 15 枚**になる。
      if (pool.length >= BRIEF_POOL_CAP) return pool;
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
      id: `offer-${c.id}`, kind: "offer", text: cardText(c), itemKind: c.kind ?? "place",
      face: cardFace(c), photo: c.images?.[0], glyph: c.glyph,
      // ★★ジャンルも**いま生きている表から引く**（`c.category` は生成時の焼き込み）。
      genre: genreOfKind(c.kind ?? "info"),
    });
  }

  // 2 今日行くのがおすすめの提案。
  // ★★★**ストックの中から「今日これから行ける」もの**（2026-09-13・第99巡に
  //   ユーザー指定「その日の分を読み終わっても、**ストックしてあって今日行くのが
  //   おすすめのもの**を出しておいて。**夜に美術館**は現実的でないので…」）。
  //   ★★**選び方は `lib/todayPick.ts` の1か所**（`kind` ごとの時間帯の表）。
  //     ★これは**営業時間そのものではなく近似**である ―― `Item` に営業時間が
  //     1つも無いため。理由と限界は `todayPick.ts` の頭に書いた。
  //   ★★**`offer` の後ろに積む** ―― 上限（`BAND_LIMIT`）は上から詰めるので、
  //     未読の提案が残っているうちは出ない。ユーザーの言葉「**その日の分を
  //     読み終わっても**」が、そのまま順番になっている。
  //   ★ここに `magazine`（自分でバインドした今日の予定）を流し込まないこと ――
  //   それは「AI のおすすめ」ではなく「自分で決めたもの」で、意味が違う。
  // ★★**自分で帯へ置いたものは時間帯で落とさない**（`force`。第114巡）。
  const kept = new Set<string>();
  for (const p of state.bandPins ?? []) {
    if (p.id.startsWith("today-")) kept.add(p.id.slice("today-".length));
  }
  for (const it of pickTodayItems(state.items ?? [], new Date(), kept)) {
    out.push({
      id: `today-${it.id}`, kind: "today", text: it.title, itemKind: it.kind,
      // ★★焼き込まれた `it.color` は信じない（`cardFace` と同じ理由）。
      face: colorOfKind(it.kind), photo: it.images?.[0], glyph: glyphOfKind(it.kind),
      genre: genreOfKind(it.kind),
    });
  }

  // 3 JOURNAL のデータから抽出されたタスクの候補。
  for (const c of state.inbox ?? []) {
    if (c.dueDate) continue;                       // 日付が付いたものは帯に居ない
    out.push({ id: `voice-${c.id}`, kind: "voice", text: c.title, face: taskFace() });
  }

  // 4 既存のタスクへのフォローアップ（`lib/taskSuggest.ts` が作る）。
  for (const t of state.tasks ?? []) {
    if (t.done) continue;
    for (const s of t.suggestions ?? []) {
      out.push({
        id: `follow-${s.id}`, kind: "followup", text: s.title,
        face: taskFace(), parentId: t.id,
      });
    }
  }

  // 5 期日を割り当てていないタスク。
  for (const t of state.tasks ?? []) {
    if (t.done || t.dueDate) continue;
    out.push({ id: `someday-${t.id}`, kind: "someday", text: t.title, face: taskFace() });
  }

  return out;
}

/**
 * 2段ぶんに振り分け、段ごとに上限で切る。★空の段はそのまま空で返す（描く側が消す）。
 *
 * @param keepId ★★★**上限で切り落としてはいけない id**（2026-09-15・第111巡）。
 *   ★★★**山から帯へ戻したタスクが「黙って消える」のを止めるためのもの。**
 *     戻したタスクは `appState.tasks` での位置で並ぶ（`unassign` は `dueDate` を
 *     消すだけで**並べ替えない**）ので、**9件目より後ろになると `slice` に
 *     切り落とされる** ―― それでも画面には「帯へ戻しました」と出ていた。
 *   ★★**並び順は 1つも変えない**（`tasks` の順は GRAVITY と共有している）。
 *     **その id が入るところまで段を伸ばすだけ。**
 *   ★帯は輪なので、**入ってさえいれば必ず流れてくる**（ユーザー確定
 *     「**画面外に出たらいいように処理して**」）。
 */
export function bandRows(state: AppState, keepId?: string | null): [BandItem[], BandItem[]] {
  const rows: [BandItem[], BandItem[]] = [[], []];
  for (const it of bandItems(state)) rows[BAND_ROW[it.kind]].push(it);
  // ★★★**留め金を当てる**（下の `pinBand`）。**段ごと**に当てるので、
  //   段をまたぐ留め金は自然に無効になる（相手が同じ段に居ない）。
  const pins = state.bandPins ?? [];
  rows[0] = applyPins(rows[0], pins);
  rows[1] = applyPins(rows[1], pins);
  const cut = (list: BandItem[], lim: number) => {
    const at = keepId ? list.findIndex((it) => it.id === keepId) : -1;
    return list.slice(0, at >= lim ? at + 1 : lim);
  };
  return [cut(rows[0], BAND_LIMIT), cut(rows[1], BAND_LIMIT_TASKS)];
}

/**
 * ★★★**帯の並びの記憶＝「留め金」**（2026-09-16・第114巡にユーザー指定
 * 「**どんな時でも、帯に近づけるとその場所で、ピルの列に間が空いて、図形を
 * 入れ込めるようにしてください。これは絶対です**」）。
 *
 * 1つの留め金は「**この id は、この id の次に置く**」。`after` が空文字なら段の先頭。
 *
 * ★★★**なぜ「順番の配列」ではなく「留め金」なのか。**
 *   帯の中身は毎日入れ替わる（提案が増え、タスクに日付が付いて消える）ので、
 *   全件の並びを持つと**翌日にはほとんどが消えた id の列**になる。留め金なら、
 *   隣が消えても**自然な位置へ戻るだけ**で壊れない。
 * ★★★**なぜ `tasks` や `items` の並びを触らないのか**（第112巡はそうしていた）。
 *   ① `tasks` の並びは GRAVITY の山・ALIGN の一覧と**共有**していて、帯を
 *      並べ替えると**関係ない画面まで動く**。
 *   ② 声の候補（`inbox`）とフォローアップ（`Task.suggestions`）は**持ち主が別**
 *      なので、`tasks` を並べ替えても動かせない ―― つまり
 *      **「任意のピルとピルの間」が原理的に作れなかった**。
 *   留め金は**表示の並びだけ**を持つので、5種類すべてを、段をまたがずに置ける。
 */
export type BandPin = NonNullable<AppState["bandPins"]>[number];

/** 留め金を当てて並べ替える（段ごと）。★**古い留め金から順に効く**。 */
function applyPins(list: BandItem[], pins: readonly BandPin[]): BandItem[] {
  const here = pins.filter((p) => list.some((it) => it.id === p.id));
  if (!here.length) return list;
  const held = new Set(here.map((p) => p.id));
  const out = list.filter((it) => !held.has(it.id));
  for (const p of here) {
    const it = list.find((x) => x.id === p.id);
    if (!it) continue;
    if (!p.after) { out.unshift(it); continue; }
    const k = out.findIndex((x) => x.id === p.after);
    // ★★**隣が居なくなっていたら、自然な位置（末尾）へ戻す** ―― 留め金は
    //   「約束」ではなく「覚え書き」。相手が消えたら黙って諦める。
    out.splice(k < 0 ? out.length : k + 1, 0, it);
  }
  return out;
}

/**
 * ★★★**そのピルを「`after` の次」に置くと憶える**（`after` が空なら段の先頭）。
 * ★★**`state` を直接書き換える**（呼ぶ側が `structuredClone` 済み）。
 * ★★**帯に居なくなった留め金は捨てる**（溜めない）。
 */
export function pinBand(state: AppState, id: string, after: string): void {
  // ★★**先に自分の古い留め金を外す**（1つの id に留め金は1つ）。
  const was = (state.bandPins ?? []).filter((p) => p.id !== id);
  // ★★**いま帯に居るものだけ残す** ―― 相手（`after`）が消えた留め金も捨てる。
  //   ★自分自身はこれから入るので、生きているかの判定から外す。
  const live = new Set(bandItems(state).map((it) => it.id));
  const kept = was.filter((p) => live.has(p.id) && (!p.after || live.has(p.after)));
  kept.push({ id, after });
  state.bandPins = kept;
}
