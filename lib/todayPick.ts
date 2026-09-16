import { KIND_DOMAIN } from "./constants";
import { hasPlace, isExpiredItem } from "./helpers";
import type { Item, ItemKind } from "./types";

// ★★★**「今日行くのがおすすめ」の選び方はここ1つ**（2026-09-13・第99巡）。
//
// ★★★**ユーザー指定** ―― 「その日の分を読み終わっても、**ストックしてあって
//   今日行くのがおすすめのもの**を出しておいて。例えば**夜に美術館に行くのは
//   現実的ではない**ので、そういうのを考慮した提案が出るようにして」。
//
// ★★★**なぜ AI を使わないか。** 調べたら、**時刻の手がかりがアプリのどこにも
//   無かった** ―― `Item` に営業時間も `start` も `venue` も1つも無く
//   （`lib/types.ts`）、時間に関わるのは `expiresAt`（会期末の**日付**）だけ。
//   `start`/`venue` は `CandidateRecord` → `GeneratedCard` の所で捨てられている。
//   つまり**モデルに聞いても答える材料が無い**し、聞いたところで効くのは
//   これから生成される分だけで、**いま溜まっているストックには届かない**。
//   → **`kind` ごとの時間帯**なら、いま在るストックに今日から効く。
//   ★★これは**近似**である。営業時間そのものではない。個別の休館日も定休日も
//     知らない。**知らないことを知っているふりをしない**ために、表はここ1つに
//     まとめ、根拠（その種類が一般にいつ開いているか）だけで作る。
//   ★将来 `Item` に本物の営業時間が入ったら、この表は**その既定値**に格下げする。

/** 時間帯（24時制の「時」。`from` 以上 `to` 未満）。 */
export interface Slot { from: number; to: number }

/**
 * `kind` ごとの「行ける時間帯」。★**10種すべてを覆う**（`ITEM_KINDS` と同じ）。
 * ★空の配列 ＝ **行き先ではない**（本・音楽・記事・モノ）ので出さない。
 */
export const KIND_HOURS: Record<ItemKind, Slot[]> = {
  // ★ユーザーの例。夜は閉まっているので出さない。
  exhibition: [{ from: 10, to: 17 }],
  place: [{ from: 9, to: 18 }],
  activity: [{ from: 10, to: 18 }],
  // ★食は**昼と夜の2つ**。あいだの時間は出さない。
  food: [{ from: 11, to: 14 }, { from: 17, to: 21 }],
  live: [{ from: 18, to: 22 }],
  movie: [{ from: 12, to: 21 }],
  // ★以下は「行く先」ではないので帯のこの段には出さない。
  book: [],
  album: [],
  info: [],
  thing: [],
};

/** いま開いているか。 */
const openNow = (slots: Slot[], hour: number): boolean =>
  slots.some((s) => hour >= s.from && hour < s.to);
/** 今日このあと開くか。 */
const openLater = (slots: Slot[], hour: number): boolean =>
  slots.some((s) => hour < s.from);

/**
 * ★行き先であるか。**場所があるか、ドメインが場所／体験**なら「行く」もの。
 * （`hasPlace` は座標かエリア名。生成の途中で座標が取れていない候補もあるので、
 *  ドメインでも拾う。）
 */
const isGoable = (it: Item): boolean =>
  hasPlace(it) || KIND_DOMAIN[it.kind] === "place" || KIND_DOMAIN[it.kind] === "experience";

/** 会期末までの日数（無ければ大きな数）。近いほど前に出す。 */
const daysLeft = (it: Item): number => {
  if (!it.expiresAt) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(it.expiresAt);
  if (Number.isNaN(t)) return Number.MAX_SAFE_INTEGER;
  return (t - Date.now()) / (24 * 3600 * 1000);
};

/**
 * ★★★**ストックの中から「今日これから行けるもの」を、良い順に返す**。
 *
 * 1. **いま開いている**ものが先、**今日このあと開く**ものが次
 *    （★**今日もう閉まったものは出さない**。23時なら 0 件 ―― 嘘を出さない）
 * 2. 同点なら**会期末が近い順**
 * 3. さらに同点なら **`addedAt` の新しい順**（ストックの並びと同じ）
 */
export function pickTodayItems(
  items: Item[], now = new Date(), force?: ReadonlySet<string>,
): Item[] {
  const hour = now.getHours();
  const scored: { it: Item; rank: number }[] = [];
  for (const it of items) {
    if (it.status !== "candidate") continue;
    // ★★★**もう予定に入れたものは出さない**（2026-09-15・第110巡）。
    //   帯からピルを引き下ろすと `HomeTab.put` が `plannedFor` を書くが、
    //   ここが見ていなかったので**引き下ろしても帯に残り続けていた**
    //   （ユーザー報告「上の段のピルが消えない」）。
    if (it.plannedFor) continue;
    if (isExpiredItem(it)) continue;
    // ★★★**自分で帯へ置いたものは、時間帯で落とさない**（2026-09-16・第114巡）。
    //   ★★山の図形を帯へ戻すと `plannedFor` が消えてストックへ返るが、その
    //     `kind` が行き先でない（本・モノ）／もう閉まっている時間だと、
    //     **ここで落とされて帯に現れない** ―― それでも画面には「帯へ戻しました」
    //     と出ていた（ユーザー報告「**メッセージだけ出てどこかに消える**」）。
    //   ★**指で置いたものを勝手に隠さない。** 表は「おすすめの並べ方」であって、
    //     ユーザーの意思を却下する門ではない。
    if (force?.has(it.id)) { scored.push({ it, rank: 0 }); continue; }
    if (!isGoable(it)) continue;
    const slots = KIND_HOURS[it.kind] ?? [];
    if (!slots.length) continue;
    // ★0 ＝ いま開いている／1 ＝ 今日このあと開く／それ以外は落とす。
    const rank = openNow(slots, hour) ? 0 : openLater(slots, hour) ? 1 : -1;
    if (rank < 0) continue;
    scored.push({ it, rank });
  }
  return scored
    .sort((a, b) =>
      a.rank - b.rank
      || daysLeft(a.it) - daysLeft(b.it)
      || Date.parse(b.it.addedAt) - Date.parse(a.it.addedAt))
    .map((s) => s.it);
}
