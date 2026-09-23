import type { AppState, BriefCard, ItemKind } from "./types";
import { categoryOfKind, genreOfKind } from "./deckStyle";
import { colorOfKind } from "./palette";
import { BAND_BEZEL, BAND_H, TASK_FACE } from "./constants";
import { LEAD, TYPE } from "./tokens";
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
// ★★★段は**3段**（2026-09-18・第122巡にニュースの段を足した）…
//   **上＝1・2**（提案。写真を持つものがまとまる）／**中＝3・4・5**（タスク系）／
//   **下＝ニュース**（`lib/newsFeed.ts`。**外の世界のもの**なので `AppState` に無い）。
//   **空の段は消す**（無いものを説明しない）。
//   ★★★**上の2段は「自分に関わるもの」、いちばん下だけが「世の中のもの」** ――
//     だから**上の2段だけが山へ引き下ろせる**。ニュースのピルを引くと、
//     **その場で角丸の四角に広がって詳細が出る**（第123巡）。
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
  /** ★写真が来なかった提案に組む**欧文のラベル**（「PLACE」）。 */
  label?: string;
  /**
   * ★1・2 だけが持つ。**ピルの2行目**に小さく出るジャンル（「展覧会」「場所」）。
   * ★★**ニュース（`news`）は出典をここへ入れる**（第122巡）―― どちらも
   *   「題に小さく添える語」なので、枠を2つ持たない。
   */
  genre?: string;
  /** 4 だけが持つ。どのタスクへのフォローアップか。 */
  parentId?: string;
  /** ★ニュースだけが持つ … 記事へのリンクと、届いた時刻（ISO）。 */
  link?: string;
  at?: string;
  /**
   * ★★**1・2 だけが持つ。`ItemKind`**（2026-09-17・第118巡）。
   * ★★★**提案（`offer`）にはまだ `Item` が無い**ので、`HomeTab.srcOf` から
   *   `kind` を引けない ―― 幽霊の**札の形**（`lib/cardShape.ts`）がそれで
   *   決まるので、**帯の側から持たせる**。
   */
  itemKind?: ItemKind;
}

/**
 * ★★★**`note` ＝ 文章**（2026-09-18・第121巡にユーザー指定「**この流れるピルに
 * 今日のおすすめはこれとか、そのピル以外に文章みたいなのも一緒に流して、ユーザーに
 * 何かを提案する**」）。
 * ★★**面も縁も持たない。地の上に字だけ**（`components/home/Band.tsx`）――
 *   押せないものに縁を付けない、が `design.md` の約束。
 * ★★**中身は `lib/bandNotes.ts` の1か所**。
 */
/**
 * ★★★**`news` ＝ ニュースの見出し**（2026-09-18・第122巡にユーザー指定
 * 「**上の帯にもう一列追加して、ニュースを取ってこれるようなものを探して組み込んで、
 * 私が確認するべきニュースみたいなものを表示するように。帯は今あるものの1個下に
 * 段を追加して**」）。
 * ★★**中身は `lib/newsFeed.ts`**（取ってくるのは `app/api/news/route.ts`）。
 * ★★★**第123巡に「字だけ」から「輪郭のピル」へ**（ユーザー指定）。
 *   **下へ引くと角丸の四角に広がって詳細が出る**（`components/home/NewsCard.tsx`）。
 */
export type BandKind =
  "offer" | "today" | "voice" | "followup" | "someday" | "note" | "news";

/** 段の番号（0=上＝提案 / 1=中＝タスク系 / 2=下＝ニュース）。 */
export type BandRowId = 0 | 1 | 2;

/** どの段に置くか。★**段の数の正はここ**（`BAND_ROWS`）。 */
export const BAND_ROW: Record<BandKind, BandRowId> = {
  offer: 0, today: 0, voice: 1, followup: 1, someday: 1, note: 0, news: 2,
};
/** 段の数。★`bandRows` の戻り値も `bandMotion` の `rows` もこれで揃える。 */
export const BAND_ROWS = 3;

/**
 * ★★★**ピルは全部「輪郭だけ・黒の字」**（2026-09-20・第125巡にユーザー指定
 * 「**ピルは全て塗り無しにします。枠線だけにして、文字は黒にします**」）。
 *
 * ★★★**だからこの関数は常に真を返す。** 消していないのは2つの理由 ――
 *   ① 呼び手（`Band` の `Pill` ／ `lib/pullDrag.ts` の写し取り ／
 *      `components/home/pillGhost.ts` の `inkMix`）が**全部ここ1か所を読む**ので、
 *      塗りに戻すときも**この1行**で戻る。
 *   ② `inkMix`（白抜き ⇄ 塗りの量）は**両端を決め打ちにしてはいけない**
 *      ―― 帯のピルが塗りかどうかを**ここから導いている**（第113巡）。
 * ★★★**第93〜124巡の「日付があるか／ないかで塗り分ける」は帯では終わり。**
 *   **山の図形では今までどおり**（`isDated`）―― 帯は「まだ自分の時間を割り当てて
 *   いないもの」なので**全部 輪郭**、山は割り当てたものが**塗り**、という
 *   **上と下の対比**に変わった。
 * ★★色は種類ごとに違う（`face`）が、**面には出ず 1px の線にだけ出る**。
 */
/**
 * ★★★**提案の段のピルは「必ず2段組」**（2026-09-24・第128巡に2段組、**第129巡に
 * 「必ず」**。ユーザー指定「**提案のところは、文字を2段にして、高さをピルに必ず
 * 合わせてください**」）。
 *
 * ★★★**行の切り方はここ1か所** ―― 帯のピル（**DOM**）と引き下ろしの幽霊
 *   （**canvas**。`components/home/pillGhost.ts`）が**同じ行の列**を読む。
 *   DOM の自動折り返しに任せると、canvas では同じ所で折れないので、
 *   **1px 下へ引いて写し取った瞬間に字の並びが変わる**。
 * ★★★**短い題も2段に割る**（第128巡は10字以下を1行のまま出していたので、
 *   ピルごとに字の塊の高さが違った ―― 実機の写真の「日本の新進写真家」）。
 * ★★**切れ目は「真ん中にいちばん近い、読める所」** ―― 空白・句読点・閉じ括弧・
 *   **助詞（の が を に と で へ は も）の直後**。遠すぎれば（題の長さの 1/4 超）
 *   字数で真ん中を割る。★1行は `BAND_LINE_CH` 字まで、2行目は入らなければ `…`。
 * ★★**提案の段以外は1行**（今までどおり）。★目盛りの外（文の長さ）。
 */
export const BAND_LINE_CH = 10;
/**
 * ★★★**帯の字の大きさ**（第128巡にユーザー指定「**帯は全体的にもっと小さく**」）。
 * ★**帯のピル（DOM）・写し取り（canvas）・戻すピルの見積もり・文章の4つが読む。**
 */
export const BAND_TEXT = TYPE.small;
/**
 * ★★★**提案の段の字は「2行の高さ ＝ 写真の丸の直径」から解く**（第129巡。ユーザー
 * 指定「**高さをピルに必ず合わせて**」）。丸の直径は `BAND_H.photo − BAND_BEZEL × 2`
 * （32px）なので、`32 ÷ (2 × LEAD.snug)` ＝ **12.3px**。これで**字の塊の上下が
 * 丸の上下と揃い、ピルの中で縁取り（`BAND_BEZEL`）が四方で同じになる**。
 * ★目盛りの外（部品の寸法から解いた値。段から選ぶと 11 では 3.4px 足りず、13 では溢れる）。
 */
export const BAND_OFFER_TEXT = (BAND_H.photo - BAND_BEZEL * 2) / (2 * LEAD.snug);
/**
 * ★★★**その行の高さは px で渡す**（丸の直径の半分 ＝ 16px）。★目盛りの外（同上）。
 * ★★**比（`LEAD.snug`）で渡すと WebKit が行の高さを整数へ丸める**ので、字の塊が
 *   Chromium 32px 対 WebKit 30px になった（実測）。px なら両方 32px。
 */
export const BAND_OFFER_LINE = (BAND_H.photo - BAND_BEZEL * 2) / 2;
const BREAK_AFTER = new Set([
  " ", "　", "、", "。", "・", "」", "』", "）", ")", "／", "—", "─", "―", "–", "：", ":",
  "の", "が", "を", "に", "と", "で", "へ", "は", "も",
]);
/** ★★**開き括弧の「前」でも折ってよい**（「スズキユウリ」／「Music As…」）。 */
const BREAK_BEFORE = new Set(["「", "『", "（", "(", "“", "【", "〈"]);
/** ★英数字（単語の途中で折らないために見る）。 */
const isWordChar = (c: string | undefined) => !!c && /[A-Za-z0-9]/.test(c);
export function bandLines(text: string, head: boolean): string[] {
  const t = (text ?? "").trim();
  const chars = [...t];
  const n = chars.length;
  if (!head || n < 2) return [t];
  const target = Math.min(Math.ceil(n / 2), BAND_LINE_CH);
  let cut = target;
  let best = Infinity;
  for (let i = 1; i <= Math.min(n - 1, BAND_LINE_CH); i++) {
    if (!BREAK_AFTER.has(chars[i - 1]) && !BREAK_BEFORE.has(chars[i])) continue;
    const d = Math.abs(i - target);
    if (d < best && d <= Math.max(1, n / 4)) { best = d; cut = i; }
  }
  // ★★**英単語の途中では折らない**（字数で割ったときだけ起きる。単語の頭まで戻す）。
  if (best === Infinity) {
    let k = cut;
    while (k > 1 && isWordChar(chars[k - 1]) && isWordChar(chars[k])) k--;
    if (k > 1) cut = k;
  }
  const a = chars.slice(0, cut).join("").trim();
  const r = chars.slice(cut);
  const b = (r.length <= BAND_LINE_CH ? r.join("") : `${r.slice(0, BAND_LINE_CH - 1).join("")}…`).trim();
  return b ? [a, b] : [a];
}

// ★★★**第128巡に「常に偽」へ**（ユーザー指定「**帯のピルも図形と同じような塗りに
//   戻してください**」）―― 帯のピルは全部**ベタ塗り＋太い墨の字**。
//   **山の図形と同じ見え方**なので、引き下ろしても**面の量は 1 のまま**
//   （`inkMix` の両端がどちらも塗り）。★関数を残す理由は上の①②のまま。
export const isOutlined = (kind: BandKind): boolean => { void kind; return false; };

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
 * ★ニュースの段の上限（2026-09-18・第122巡）。★目盛りの外（部品の数）。
 * ★★**取ってくる側（`app/api/news/route.ts` の `LIMIT`）と同じ数**にしてある ――
 *   向こうで切っているので、ここは**念のための蓋**。
 */
export const BAND_LIMIT_NEWS = 8;

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
export function bandItems(state: AppState, notes?: BandItem[]): BandItem[] {
  const out: BandItem[] = [];

  // ★★★**まだ読んでいない提案は、もう帯に流さない**（2026-09-17・第119巡に
  //   ユーザー指定「**提案の帯に流れるのは、すでにストックしてあるものの中で、
  //   その時の時間とかで行けるものとかおすすめのものにします**」）。
  //   → **未読のカードは「おすすめ3件」として山へ落ちる**（`lib/offerPick.ts`）。
  //   ★★**`BandKind` の `"offer"` は型としては残している** ―― 山の
  //     おすすめの図形を**帯へ運ぶと KEEP される**道（`HomeTab.put` の
  //     `offer-` の枝 ＋ `lib/keepCard.ts`）が同じ id の作り方を使うため。
  //     **`bandItems` がもう作らないだけ。**

  // 1 今日行くのがおすすめの提案。
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
  const picks = pickTodayItems(state.items ?? [], new Date(), kept);
  for (const { it } of picks) {
    out.push({
      id: `today-${it.id}`, kind: "today", text: it.title, itemKind: it.kind,
      // ★★焼き込まれた `it.color` は信じない（`cardFace` と同じ理由）。
      face: colorOfKind(it.kind), photo: it.images?.[0], label: categoryOfKind(it.kind),
      genre: genreOfKind(it.kind),
    });
  }
  // ★★★**文章は上の段の先頭へ**（2026-09-18・第121巡）。**中身は
  //   `lib/bandNotes.ts` の1か所**（ここは並べるだけ）。
  //   ★★**呼ぶ側から渡してもらう** ―― `bandNotes` は `lib/offerPick.ts` を読み、
  //     そちらは `unreadEntries`（このファイル）を読むので、**ここから呼ぶと輪になる**。
  out.unshift(...(notes ?? []));

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
export function bandRows(
  state: AppState, keepId?: string | null, notes?: BandItem[], news?: BandItem[],
): [BandItem[], BandItem[], BandItem[]] {
  const rows: [BandItem[], BandItem[], BandItem[]] = [[], [], []];
  for (const it of bandItems(state, notes)) rows[BAND_ROW[it.kind]].push(it);
  // ★★★**ニュースは `bandItems` を通さない**（2026-09-18・第122巡）――
  //   あちらは `AppState` だけから作る純粋な関数で、**ニュースは外の世界のもの**
  //   （非同期に届き、`AppState` に入れない。理由は `lib/newsFeed.ts` の頭）。
  //   ★★留め金も上限の例外も要らないので、**そのまま並べて切るだけ**。
  rows[2] = (news ?? []).slice(0, BAND_LIMIT_NEWS);
  // ★★★**留め金を当てる**（下の `pinBand`）。**段ごと**に当てるので、
  //   段をまたぐ留め金は自然に無効になる（相手が同じ段に居ない）。
  const pins = state.bandPins ?? [];
  rows[0] = applyPins(rows[0], pins);
  rows[1] = applyPins(rows[1], pins);
  const cut = (list: BandItem[], lim: number) => {
    const at = keepId ? list.findIndex((it) => it.id === keepId) : -1;
    return list.slice(0, at >= lim ? at + 1 : lim);
  };
  // ★★★**文章は上限の数に入れない**（2026-09-18・第121巡）―― 上限は「一周が
  //   長くなりすぎない」ためのもので、文章は高々3件・面も持たない。数に入れると
  //   **文章が出た日だけ提案が押し出されて消える**。
  const notesIn = rows[0].filter((it) => it.kind === "note");
  const rest = rows[0].filter((it) => it.kind !== "note");
  return [
    [...notesIn, ...cut(rest, BAND_LIMIT)],
    cut(rows[1], BAND_LIMIT_TASKS),
    rows[2],
  ];
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
