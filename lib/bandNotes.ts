import { INK } from "./constants";
import type { BandItem } from "./homeBand";
import type { OfferPick } from "./offerPick";
import { pickTodayItems } from "./todayPick";
import type { AppState } from "./types";

// ★★★**帯に流す「文章」の中身はここ1つ**（2026-09-18・第121巡にユーザー指定、
//   **第122巡に作り直した**）。
//
// > 「**帯の文章はもっと一言だけというか、もっと自然な感じに、もっと短く、
// >   本当に一言より短いぐらいでまとめて出すもので。その仕組みがどういう仕組みで
// >   動いてるのかもよくわからないので、そこはちゃんとしてほしい。
// >   文章が出る頻度はもう本当に少なくしてください。ピルが5個ぐらい流れて
// >   1個文章がちょっと流れてくる、とかそういうぐらいの頻度に**」
//
// ★★★**仕組みは3行で言える**（＝これが「ちゃんとしてほしい」への答え）:
//   1. **候補を上から順に見て、最初に当てはまった1つだけを返す。**
//   2. その1つを**上の段の先頭に1回だけ置く**（`lib/homeBand.ts` の `bandItems`）。
//   3. 帯は輪なので、**1周に1回だけ流れてくる**。上の段のピルは最大
//      `BAND_LIMIT`(6) 件なので、**ピル6個につき文章1つ**＝指定の頻度そのもの。
//   ★★★**第121巡は3件まで出していた**（明日の案内・おすすめの理由・タスクの残りを
//     全部）ので、上の段が**ピル6個に文章3つ**＝半分が文章だった。**数で効かせる。**
//
// ★★★**候補は3つ。上から強い順**（下へ行くほど「無くても困らない」）:
//   | # | いつ出るか | なぜ出すか |
//   |---|---|---|
//   | ① 明日の案内 | 今日これから行ける場所が 0 件（＝夜） | **これが無いと嘘になる** ―― 明日の分を今日行けるものとして並べているため |
//   | ② おすすめの理由 | 山のおすすめに理由が付いている | なぜそれを差し出したかを一言で言う |
//   | ③ タスクの残り | 今日のタスクが在る | 数だけを言う |
//
// ★★★**AI を使わない** ―― `lib/todayPick.ts`・`lib/offerPick.ts` と同じ理由。
//   材料（時刻・願い・ゴール・好みの語・KEEP の履歴・タスク）は**全部いま手元に
//   在る**ので、モデルに聞く必要がない。**嘘をつかないほうが大事。**
//
// ★★★**理由の「判定」は `lib/offerPick.ts`、「言葉」はここ** ―― 2つを別の場所に
//   置いておくと、採点を触った人が文面を直し忘れる事故が起きない。
//
// ★★**文章は押せない**（`components/home/Band.tsx` が `note` を面も縁も無しで描く）。
//   `design.md` の「押せるものにだけ縁を付ける」に従う。

/**
 * ★★★**主語に使う語の上限**（2026-09-18・第122巡）。
 * ★★**題（カードのタイトル）はもう文に入れない** ―― 題は**ピルにも山の図形にも
 *   もう出ている**ので、文でもう一度言うと**同じことを二度言った上に長い**。
 *   文が言うのは「**なぜ**」だけ。★目盛りの外（文の長さ）。
 */
const WORD_MAX = 10;

const cut = (s: string, n: number): string =>
  (s ?? "").trim().length > n ? `${s.trim().slice(0, n)}…` : (s ?? "").trim();

/** 文章1件。★`face` は使わないが `BandItem` の形に合わせる（字の色は `Band` が決める）。 */
const note = (id: string, text: string): BandItem =>
  ({ id: `note-${id}`, kind: "note", text, face: INK });

/**
 * ★★**その理由を人の言葉で**。`lib/offerPick.ts` の `OfferReason` と1対1。
 * ★主語が空のとき（願いやゴールの題が消えている）は、その理由を**使わない**
 *   ―― 「「」に行きたいと書いていたので」のような文を出さない。
 * ★★★**どれも「〜。〜ので」を持たない**（第122巡）。**主語＋助詞で言い切る**ので
 *   最長でも 14 文字前後に収まり、流れていく字として読み切れる。
 */
function reasonText(p: OfferPick): string | null {
  const r = p.reason;
  if (!r) return null;
  const word = cut(r.word, WORD_MAX);
  switch (r.kind) {
    case "wish":    return word ? `${word}、見つけました` : null;
    case "goal":    return word ? `${word}のために` : null;
    case "interest": return word ? `${word}が好きなら` : null;
    case "history": return word ? `${word}をよく見ています` : null;
    case "fresh":   return "今日届きました";
    default:        return null;
  }
}

/**
 * ★★★**帯の上の段の先頭に流す文章**（呼ぶのは `components/tabs/HomeTab.tsx`）。
 * ★★★**返すのは 0 件か 1 件**（第122巡。上の「仕組み」の 1.）。
 * ★★**`lib/homeBand.ts` から呼ばない** ―― あちらの `unreadEntries` を
 *   `lib/offerPick.ts` が読んでいるので、輪になる。**渡してもらう。**
 */
export function bandNotes(
  state: AppState, picks: OfferPick[], now = new Date(),
): BandItem[] {
  // ① 明日の案内 … `pickTodayItems` が「明日なら行ける」しか返せなかったとき。
  //   ★★**これだけは「無いと嘘になる」ので、いちばん強い。**
  const today = pickTodayItems(state.items ?? [], now);
  if (today.length > 0 && today.every((t) => t.when === "tomorrow")) {
    return [note("tomorrow", "明日なら行けます")];
  }

  // ② おすすめの理由 … いちばん点の高い1件について。
  const top = picks[0];
  const why = top ? reasonText(top) : null;
  if (why) return [note(`why-${top.card.id}`, why)];

  // ③ タスクの残り … **今日のタスクが在る日だけ**（無い日に「0 件」と言わない）。
  //   ★★**式は山と同じ**（`HomeTab.pileTasks` の `dueDate <= 今日`）―― 過ぎて
  //     まだ終わっていないものも「今日のぶん」として山に居るので、数も揃える。
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    + `-${String(now.getDate()).padStart(2, "0")}`;
  const mine = (state.tasks ?? []).filter((t) => t.dueDate && t.dueDate <= day);
  if (mine.length > 0) {
    const left = mine.filter((t) => !t.done).length;
    return [note("tasks", left > 0 ? `タスクはあと${left}つ` : "タスクはおわり")];
  }

  return [];
}
