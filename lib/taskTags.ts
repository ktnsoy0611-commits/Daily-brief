import { BLUE, GOLD, GREEN, PLUM, RUST, SLATE } from "./constants";
import type { TaskTag } from "./types";

// ★タスクのタグ。**固定の6つ**から選ぶ(2026-08-12にユーザー確定)。
// 自由入力にすると似たタグが増えて色が似通い、山の中で見分けが付かなくなる。
// 色は既存のアクセント4色 + 同じ register の2色だけを使う。

export interface TagDef { id: TaskTag; label: string; color: string }

export const TASK_TAGS: TagDef[] = [
  { id: "work", label: "仕事", color: BLUE },
  { id: "shopping", label: "買い物", color: RUST },
  { id: "life", label: "暮らし", color: GREEN },
  { id: "body", label: "からだ", color: GOLD },
  { id: "people", label: "ひと", color: PLUM },
  { id: "learn", label: "まなび", color: SLATE },
];

export const tagDef = (id: TaskTag | undefined): TagDef | undefined =>
  TASK_TAGS.find((t) => t.id === id);

/** タグが無いものの色。地から浮くが主張しない中間のグレー。 */
export const NO_TAG_COLOR = "#9A9A94";

export const tagColor = (id: TaskTag | undefined): string => tagDef(id)?.color ?? NO_TAG_COLOR;

// ★AIから来たデータにタグが無いとき、題と5W1Hの言葉から自動で割り振る
// (2026-08-12にユーザー指定)。Coworkの仕分けがタグを書いてくればそちらが優先。
// 本人は展開図でいつでも変えられるので、外しても実害は小さい。
//
// 語はすべて**部分一致**で見る。上から順に当て、最初に当たったものを採る
// (「歯医者に行く前に本を返す」のように複数当たる場合は、より切実な方=
// 上に置いた方が勝つ)。
const TAG_WORDS: { id: TaskTag; words: string[] }[] = [
  { id: "body", words: ["病院", "医者", "歯医", "診察", "健康診断", "検診", "薬", "処方", "運動", "ジム", "ラン", "走", "ストレッチ", "整体", "美容", "髪", "睡眠", "体調", "ワクチン"] },
  { id: "work", words: ["仕事", "会議", "打ち合", "ミーティング", "資料", "提出", "納品", "取引", "契約", "請求", "見積", "経費", "申告", "確定申告", "出社", "上司", "同僚", "案件", "プレゼン", "報告", "稟議", "面談"] },
  { id: "people", words: ["誕生日", "お祝い", "祝う", "結婚", "出産", "お礼", "手紙", "年賀", "挨拶", "連絡", "電話", "会う", "family", "家族", "母", "父", "祖母", "祖父", "友人", "友達", "先生", "見舞"] },
  { id: "learn", words: ["本", "読", "勉強", "学ぶ", "学習", "講座", "授業", "図書館", "資格", "試験", "練習", "英語", "調べ", "記事", "論文", "セミナー"] },
  { id: "shopping", words: ["買", "購入", "注文", "届", "受け取", "取り寄", "予約する", "店", "ネットスーパー", "通販", "返品", "交換"] },
  { id: "life", words: ["掃除", "洗濯", "片付", "整理", "捨て", "ゴミ", "家賃", "振込", "支払", "料金", "更新", "手続", "役所", "銀行", "保険", "修理", "点検", "引越", "料理", "food", "旅行", "帰省", "車", "自転車", "電球", "クリーニング"] },
];

/** 題や5W1Hの言葉からタグを見立てる。当たらなければ undefined(=色は中間のグレー)。 */
export function inferTag(...texts: (string | undefined)[]): TaskTag | undefined {
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  if (!hay.trim()) return undefined;
  for (const { id, words } of TAG_WORDS) {
    if (words.some((w) => hay.includes(w.toLowerCase()))) return id;
  }
  return undefined;
}
