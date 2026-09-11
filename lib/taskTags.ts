import { SCHEME } from "./constants";
import { ACCENT_TEST, accentOf } from "./appAccent";
import { bodyInkOn } from "./palette";
import type { TagPattern, TaskTag } from "./types";

// ★★★**タグは2つ。見分けるのは「柄」**（2026-09-11 にユーザー確定）。
//
// ★★★**なぜ2つか。** それまでの五つ（WORK / LIFE / WELLNESS / SOCIAL / GROWTH）は
//   **生活の場面**で割っていたので、必ず重なるものが出た ―― 「仕事のために英語を
//   学ぶ」は仕事か学びか。**動機**で割れば、この世のどんなタスクも
//   「やらないと困る（MUST）」か「やりたい（WANT）」の**どちらかに必ず入る**。
//   ★このアプリが「仕事も週末も余暇も**同じ種類の提案**として扱う」という考えとも
//   噛み合う ―― 場面で分けないほうが、むしろこのアプリらしい。
//
// ★★★**なぜ色をやめたか。** 第87巡でアプリごとのアクセント配色へ替えた結果、
//   タグ5色は**オレンジの濃淡5段**になり、区別が事実上消えた（ユーザー指摘）。
//   色相は**アプリの識別**に使い切っているので、アプリの中では増やせない。
//   → 見分けを**柄**（べた塗り／網点）へ移した。`lib/tagPattern.ts` が持つ。
//   ★★**色は2つとも同じ**（TASK のメイン1色）。柄だけが違う。
//
// ★書体もタグと対応させる（2026-08-16にユーザー確定）。同じタグのタスクは
//   必ず同じ書体になる。番号は `lib/constants.ts` の `FONT_FACES` の並び。
//   ★**明朝は使わない**（2026-08-16にユーザー確定）。

export interface TagDef {
  id: TaskTag;
  label: string;
  color: string;
  ink: string;
  face: number;
  /** ★★**見分けの本体**。色ではなくこれで読む。 */
  pattern: TagPattern;
}

/**
 * ★★★**色は2つとも TASK のメイン1色**。柄だけが違う。
 *   `ACCENT_TEST` を切ったときは、旧パレットの2色（Azul / Terracota）へ戻る
 *   ―― あちらは色数に余裕があるので、色と柄の両方で読める。
 */
const FACE_COLOR = ACCENT_TEST ? accentOf("tasks").main : SCHEME.work;
const WANT_COLOR = ACCENT_TEST ? accentOf("tasks").main : SCHEME.growth;

export const TASK_TAGS: TagDef[] = [
  // ★**やねば** … 義務・締切・責任。**べた塗り**（重い・逃げられない）。
  { id: "must", label: "MUST", color: FACE_COLOR, ink: bodyInkOn(FACE_COLOR), face: 1, pattern: "solid" },
  // ★**やりたい** … 欲求・楽しみ。**網点**（軽い・抜けがある）。
  { id: "want", label: "WANT", color: WANT_COLOR, ink: bodyInkOn(WANT_COLOR), face: 5, pattern: "halftone" },
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

/** ★★そのタグの**柄**。見分けの本体（色ではなくこれで読む）。 */
export const tagPatternOf = (id: TaskTag | undefined): TagPattern =>
  tagDef(id)?.pattern ?? TASK_TAGS[0].pattern;

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
  // ★★**やねば** … 外から来た締切・義務・責任。**相手が居る**か**期限がある**もの。
  //   ★先に当てる ―― 「英語の勉強を提出する」のように両方当たるときは、
  //   **切実なほう（締切があるほう）が勝つ**のが直感に合う。
  { id: "must", words: [
    "締切", "期限", "提出", "納品", "申告", "確定申告", "請求", "見積", "経費", "支払", "振込", "家賃", "料金",
    "更新", "手続", "役所", "銀行", "保険", "契約", "返信", "返事", "連絡", "電話する", "予約", "申込", "申し込",
    "会議", "打ち合", "ミーティング", "報告", "稟議", "面談", "出社", "資料", "取引", "上司", "案件",
    "病院", "医者", "歯医", "診察", "健康診断", "検診", "薬", "処方", "ワクチン", "通院",
    "掃除", "洗濯", "片付", "捨て", "ゴミ", "返品", "修理", "点検", "車検", "クリーニング", "受け取",
  ] },
  // ★★**やりたい** … 自分から始めること。**やらなくても誰も困らない**もの。
  { id: "want", words: [
    "行く", "会う", "観る", "見に", "食べ", "飲み", "旅行", "帰省", "散歩", "遊", "誘",
    "作る", "描", "撮", "書く", "始め", "試し", "挑戦", "企画",
    "本", "読", "勉強", "学ぶ", "学習", "講座", "授業", "図書館", "資格", "試験", "練習", "英語", "調べ", "セミナー",
    "運動", "ジム", "ラン", "走", "ストレッチ", "整体", "美容", "髪",
    "誕生日", "お祝い", "祝う", "お礼", "手紙", "年賀", "見舞",
    "欲しい", "買いたい", "見たい", "やりたい",
  ] },
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

/**
 * ★**旧タグ → 新2タグ**（2026-09-11 にユーザー確定「旧タグを機械的に読み替える」）。
 * 移行（`dataStore` の migrate）と取り込みの両方で使う。
 * ★★場面で割っていたものを**動機へ写す**ので、中身と合わないものは残る
 *   ―― 本人が展開図でいつでも変えられるので実害は小さい。
 */
const LEGACY_TAG: Record<string, TaskTag> = {
  // 現行の id はそのまま通す。
  must: "must", want: "want", MUST: "must", WANT: "want",
  // ★旧5タグ … 仕事・暮らし・からだは**やねば**、人・学びは**やりたい**へ。
  work: "must", life: "must", wellness: "must", social: "want", growth: "want",
  WORK: "must", LIFE: "must", WELLNESS: "must", SOCIAL: "want", GROWTH: "want",
  // ★さらに旧い6タグからの読み替え。
  shopping: "must", body: "must", people: "want", learn: "want",
};

export const normalizeTag = (raw: unknown): TaskTag | undefined =>
  typeof raw === "string" ? LEGACY_TAG[raw] : undefined;
