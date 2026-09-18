import { INK } from "./constants";
import type { BandItem } from "./homeBand";
import type { OfferPick } from "./offerPick";
import { pickTodayItems } from "./todayPick";
import type { AppState } from "./types";

// ★★★**帯に流す「文章」の中身はここ1つ**（2026-09-18・第121巡にユーザー指定）。
//
// > 「**この流れるピルに、今日のおすすめはこれとか、そのピル以外に文章みたいなのも
// > 一緒に流して、ユーザーに何かを提案するとか、そういうのもしてみたいと思います**」
//
// ★★★**出すのは3つだけ**（2026-09-18 にユーザーが選んだ）…
//   ① **明日の案内** … 今日これから行ける場所が 0 件のとき（＝夜）。
//      ★これが無いと、明日の分を今日行けるものとして並べる＝**嘘になる**。
//   ② **おすすめの理由** … 山に落ちた3件のうち、**いちばん点の高い1件**について。
//   ③ **タスクの残り** … 今日のタスクがあと何件か。
//   ★★**「今日の状況の一言」と「ニュースの見出し」は選ばれなかった**
//     （ニュースは次の巡に段ごと足す）。**勝手に増やさない。**
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

/** ★題が長いと帯の1周が伸びるので、ここで切る。★目盛りの外（文の長さ）。 */
const TITLE_MAX = 14;
/** ★理由の主語（願いの題・好みの語）も同じだけで切る。★目盛りの外（文の長さ）。 */
const WORD_MAX = 12;

const cut = (s: string, n: number): string =>
  (s ?? "").trim().length > n ? `${s.trim().slice(0, n)}…` : (s ?? "").trim();

/** 文章1件。★`face` は使わないが `BandItem` の形に合わせる（字の色は `Band` が決める）。 */
const note = (id: string, text: string): BandItem =>
  ({ id: `note-${id}`, kind: "note", text, face: INK });

/**
 * ★★**その理由を人の言葉で**。`lib/offerPick.ts` の `OfferReason` と1対1。
 * ★主語が空のとき（願いやゴールの題が消えている）は、その理由を**使わない**
 *   ―― 「「」に行きたいと書いていたので」のような文を出さない。
 */
function reasonText(p: OfferPick): string | null {
  const r = p.reason;
  if (!r) return null;
  const title = cut(p.card.title, TITLE_MAX);
  const word = cut(r.word, WORD_MAX);
  if (!title) return null;
  switch (r.kind) {
    case "wish":
      return word ? `「${title}」はどうでしょう。${word}に行きたいと書いていたので` : null;
    case "goal":
      return word ? `「${title}」はどうでしょう。${word}のために` : null;
    case "interest":
      return word ? `「${title}」はどうでしょう。${word}が好きなので` : null;
    case "history":
      return word ? `「${title}」はどうでしょう。${word}をよく残しているので` : null;
    case "fresh":
      return `「${title}」はどうでしょう。今日届いたばかりです`;
    default:
      return null;
  }
}

/**
 * ★★★**帯の上の段の先頭に流す文章**（呼ぶのは `components/tabs/HomeTab.tsx`）。
 * ★★**`lib/homeBand.ts` から呼ばない** ―― あちらの `unreadEntries` を
 *   `lib/offerPick.ts` が読んでいるので、輪になる。**渡してもらう。**
 */
export function bandNotes(
  state: AppState, picks: OfferPick[], now = new Date(),
): BandItem[] {
  const out: BandItem[] = [];

  // ① 明日の案内 … `pickTodayItems` が「明日なら行ける」を返したときだけ。
  const today = pickTodayItems(state.items ?? [], now);
  if (today.length > 0 && today.every((t) => t.when === "tomorrow")) {
    out.push(note("tomorrow", "今日はもう閉まっています。明日ならここへ行けます"));
  }

  // ② おすすめの理由 … いちばん点の高い1件だけ（3件ぶん出すと帯が文章だらけになる）。
  const top = picks[0];
  const why = top ? reasonText(top) : null;
  if (why) out.push(note(`why-${top.card.id}`, why));

  // ③ タスクの残り … **今日のタスクが在る日だけ**（無い日に「0 件」と言わない）。
  //   ★★**式は山と同じ**（`HomeTab.pileTasks` の `dueDate <= 今日`）―― 過ぎて
  //     まだ終わっていないものも「今日のぶん」として山に居るので、数も揃える。
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    + `-${String(now.getDate()).padStart(2, "0")}`;
  const mine = (state.tasks ?? []).filter((t) => t.dueDate && t.dueDate <= day);
  if (mine.length > 0) {
    const left = mine.filter((t) => !t.done).length;
    out.push(note("tasks", left > 0
      ? `今日のタスクはあと${left}つ`
      : "今日のタスクは全部おわりました"));
  }

  return out;
}
