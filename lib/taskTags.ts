import { BLUE, GOLD, GREEN, PLUM, SLATE } from "./constants";
import type { TaskTag } from "./types";

// ★タスクのタグ。**固定の5つ**から選ぶ(2026-08-13にユーザー確定)。
// 立体の上下の面(cap)の色になり、BOTTOM VIEW ではこの色面と英字だけが見える。
// 表示は**英字のみ**(日本語は出さない)。
// 自由入力にすると似たタグが増えて色が似通い、山の中で見分けが付かなくなる。

export interface TagDef { id: TaskTag; label: string; color: string }

export const TASK_TAGS: TagDef[] = [
  { id: "work", label: "WORK", color: BLUE },
  { id: "life", label: "LIFE", color: GREEN },
  { id: "wellness", label: "WELLNESS", color: GOLD },
  { id: "social", label: "SOCIAL", color: PLUM },
  { id: "growth", label: "GROWTH", color: SLATE },
];

export const tagDef = (id: TaskTag | undefined): TagDef | undefined =>
  TASK_TAGS.find((t) => t.id === id);

// ★**タグを持たない図形は作らない**(2026-08-16にユーザー確定)。
// 以前は無色のグレーに "NO TAG" と書いていたが、色の無い塊が山に混ざると
// 何のタスクか読めないうえ、5色の家族から浮く。タグが決まっていないものは
// resolveTag() が必ず何か1つに割り当てる。
export const tagColor = (id: TaskTag | undefined): string => tagDef(id)?.color ?? TASK_TAGS[0].color;

export const tagLabel = (id: TaskTag | undefined): string => tagDef(id)?.label ?? TASK_TAGS[0].label;

/** タグを1つ進める(展開図のタグのマスはタップで循環する)。 */
export function nextTag(id: TaskTag | undefined): TaskTag {
  const i = TASK_TAGS.findIndex((t) => t.id === id);
  return TASK_TAGS[(i + 1) % TASK_TAGS.length].id;
}

// ★AIから来たデータにタグが無いとき、題と側面の言葉から自動で割り振る。
// Coworkの仕分けがタグを書いてくればそちらが優先。
// 本人は展開図でいつでも変えられるので、外しても実害は小さい。
//
// 語はすべて**部分一致**で見る。上から順に当て、最初に当たったものを採る
// (「歯医者に行く前に本を返す」のように複数当たる場合は、より切実な方=
// 上に置いた方が勝つ)。
const TAG_WORDS: { id: TaskTag; words: string[] }[] = [
  { id: "wellness", words: ["病院", "医者", "歯医", "診察", "健康診断", "検診", "薬", "処方", "運動", "ジム", "ラン", "走", "ストレッチ", "整体", "美容", "髪", "睡眠", "体調", "ワクチン"] },
  { id: "work", words: ["仕事", "会議", "打ち合", "ミーティング", "資料", "提出", "納品", "取引", "契約", "請求", "見積", "経費", "申告", "確定申告", "出社", "上司", "同僚", "案件", "プレゼン", "報告", "稟議", "面談"] },
  { id: "social", words: ["誕生日", "お祝い", "祝う", "結婚", "出産", "お礼", "手紙", "年賀", "挨拶", "連絡", "電話", "会う", "family", "家族", "母", "父", "祖母", "祖父", "友人", "友達", "先生", "見舞"] },
  { id: "growth", words: ["本", "読", "勉強", "学ぶ", "学習", "講座", "授業", "図書館", "資格", "試験", "練習", "英語", "調べ", "記事", "論文", "セミナー"] },
  // 買い物は LIFE へ吸収した(2026-08-13にユーザー確定)。
  { id: "life", words: ["買", "購入", "注文", "届", "受け取", "取り寄", "予約する", "店", "ネットスーパー", "通販", "返品", "交換", "掃除", "洗濯", "片付", "整理", "捨て", "ゴミ", "家賃", "振込", "支払", "料金", "更新", "手続", "役所", "銀行", "保険", "修理", "点検", "引越", "料理", "food", "旅行", "帰省", "車", "自転車", "電球", "クリーニング"] },
];

/** 題や側面の言葉からタグを見立てる。当たらなければ undefined(=色は中間のグレー)。 */
export function inferTag(...texts: (string | undefined)[]): TaskTag | undefined {
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  if (!hay.trim()) return undefined;
  for (const { id, words } of TAG_WORDS) {
    if (words.some((w) => hay.includes(w.toLowerCase()))) return id;
  }
  return undefined;
}

/**
 * ★図形に必ず1つタグを与える。**タグ無しの図形は存在させない**
 * (2026-08-16にユーザー確定)。
 *
 * 1. 本人が展開図で決めたタグ / Cowork が書いたタグ … そのまま。
 * 2. 題や側面の言葉から見立てる(inferTag)。
 * 3. それでも決まらなければ、**id から決定的に**5つのどれかへ割り当てる。
 *    乱数だと開くたびに色が変わってしまうので必ず hash から引く。連番の id
 *    でも偏らないよう黄金比の定数で桁を混ぜる。
 */
export function resolveTag(
  tag: TaskTag | undefined,
  seed: string,
  ...texts: (string | undefined)[]
): TaskTag {
  if (tagDef(tag)) return tag as TaskTag;
  const guessed = inferTag(...texts);
  if (guessed) return guessed;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return TASK_TAGS[(Math.imul(h >>> 0, 2654435761) >>> 0) % TASK_TAGS.length].id;
}

/** 旧6タグ → 新5タグ。移行(dataStore の migrate)と取り込みの両方で使う。 */
const LEGACY_TAG: Record<string, TaskTag> = {
  // 現行のidはそのまま通す。
  work: "work", life: "life", wellness: "wellness", social: "social", growth: "growth",
  // 旧6タグからの読み替え。
  shopping: "life", body: "wellness", people: "social", learn: "growth",
  // Coworkが英字大文字で書いてきた場合。
  WORK: "work", LIFE: "life", WELLNESS: "wellness", SOCIAL: "social", GROWTH: "growth",
};

export const normalizeTag = (raw: unknown): TaskTag | undefined =>
  typeof raw === "string" ? LEGACY_TAG[raw] : undefined;
