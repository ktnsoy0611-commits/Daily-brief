import { SCHEME } from "./constants";
import type { TaskTag } from "./types";

// ★タスクのタグ。**固定の5つ**から選ぶ(2026-08-13にユーザー確定)。
// 図形の全面の色になり、そこに載る文字(FRONT=題 / BOTTOM=タグの英字)の色も
// タグが決める。表示は**英字のみ**(日本語は出さない)。
// 自由入力にすると似たタグが増えて色が似通い、山の中で見分けが付かなくなる。
//
// ★色は**スキームの組をそのまま**当てる(2026-08-16にユーザー確定・参照画像)。
// 「図形の色」と「文字の色」は画像の組み合わせどおりで、タグと**一対一対応**。
// 明度から白黒を選ぶ(inkOn)のはやめた — 相方の色は画像が決めている。

// ★書体もタグと対応させる(2026-08-16にユーザー確定)。同じタグのタスクは
// 必ず同じ書体になり、色と書体の2つでタグが読める。番号は
// lib/constants.ts の FONT_FACES の並び。
// ★**明朝は使わない**(2026-08-16にユーザー確定)。ゴシック系だけで
// 骨格の違う5つ(太 / 丸ゴ / 極太 / ディスプレイ / 太斜体)を当てる。
// ★SOCIAL(赤)は 細いゴシック → Dela斜体 → Reggae One → **M PLUS 1 (800)**。
// 細いゴシックは赤地の上で線が消え、Dela の斜体は **iOS が和文の斜体を
// 合成しない**ため WELLNESS の Dela と同じに見えた。**斜体で見分けを
// 作らないこと**(2026-08-17確定)。
export interface TagDef { id: TaskTag; label: string; color: string; ink: string; face: number }

const tag = (id: TaskTag, label: string, p: { bg: string; ink: string }, face: number): TagDef =>
  ({ id, label, color: p.bg, ink: p.ink, face });

// ★★★第73巡に**ドメインと重ならない5色**へ振り直した。
//   それまでは sky / forest / yellow / red / orange で、そのうち3つ（sky・yellow・
//   orange）が Explore のドメインと同じ色だった。`SCHEME` の9組を
//   **ドメイン4 ＋ タグ5 で1対1**に使い切る形にすると、パレットを差し替えるとき
//   「9色を9つの役へ配るだけ」で済む。
//   ★TASK と EXPLORE は別のアプリなので色を借りても混同はしないが、
//     **同じ色が2つの意味を持つ状態**は、色を選び直すときに必ず詰まる。
export const TASK_TAGS: TagDef[] = [
  tag("work", "WORK", SCHEME.navy, 1),          // 濃紺 × 桃     / ゴシック700
  tag("life", "LIFE", SCHEME.forest, 3),        // 深緑 × 淡桃   / 丸ゴシック500
  tag("wellness", "WELLNESS", SCHEME.violet, 4),// 青紫 × 白     / Dela(極太)
  tag("social", "SOCIAL", SCHEME.red, 5),       // 赤 × 淡桃     / M PLUS 1 800
  tag("growth", "GROWTH", SCHEME.wine, 2),      // ワイン × 淡緑 / ゴシック700斜体
];

export const tagDef = (id: TaskTag | undefined): TagDef | undefined =>
  TASK_TAGS.find((t) => t.id === id);

// ★**タグを持たない図形は作らない**(2026-08-16にユーザー確定)。
// 以前は無色のグレーに "NO TAG" と書いていたが、色の無い塊が山に混ざると
// 何のタスクか読めないうえ、5色の家族から浮く。タグが決まっていないものは
// resolveTag() が必ず何か1つに割り当てる。
export const tagColor = (id: TaskTag | undefined): string => tagDef(id)?.color ?? TASK_TAGS[0].color;

/** その色面の上に載せる文字の色。**画像の組み合わせをそのまま使う。** */
export const tagInk = (id: TaskTag | undefined): string => tagDef(id)?.ink ?? TASK_TAGS[0].ink;

/** そのタグの書体(FONT_FACES の番号)。**同じタグなら必ず同じ書体**。 */
export const tagFace = (id: TaskTag | undefined): number => tagDef(id)?.face ?? TASK_TAGS[0].face;

export const tagLabel = (id: TaskTag | undefined): string => tagDef(id)?.label ?? TASK_TAGS[0].label;

// ★墨地(入力画面・日程のシート)の上で使う「そのタグの色」
// (2026-08-17にユーザー確定「アクセントはそのタスクのタグの色」)。
// ただし LIFE の深緑(#04624A)のように**墨の上で沈んで読めない**組がある。
// その場合だけ**相方の色**(ink)へ替える。新しい色は作らない — 使うのは
// 必ず SCHEME の対の中から。
/** sRGB の相対輝度(WCAG)。 */
function relLum(hex: string): number {
  const v = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
/** 2色のコントラスト比(1〜21)。 */
function contrast(a: string, b: string): number {
  const x = relLum(a), y = relLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** 大きめの文字が読める下限。これを割ったら相方へ替える。 */
const MIN_CONTRAST = 3;

/** 墨地の上で読めるタグの色。`ground` はその面の色。 */
export function tagAccent(id: TaskTag | undefined, ground: string): string {
  const d = tagDef(id) ?? TASK_TAGS[0];
  return contrast(d.color, ground) >= MIN_CONTRAST ? d.color : d.ink;
}

/** すべてのタグの英字と書体。送り幅の先読みに使う。 */
export const allTagLabels = (): string[] => TASK_TAGS.map((t) => t.label);
export const allTagFaces = (): number[] => TASK_TAGS.map((t) => t.face);

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
