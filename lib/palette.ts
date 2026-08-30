import type { ItemDomain, ItemKind } from "./types";
import { INK, KIND_DOMAIN, PAPER, SCHEME } from "./constants";

// ★★★**有彩色の出どころはここ1つ**（2026-08-31・第73巡）。
//
// 棚卸しで、アプリ全体に**異なる色が 79**あり、しかも**分類の色が4系統に
// 散らばっていた**（タスクのタグ5／Explore のドメイン4／ブリーフの kind 10／
// バインダーの独自パレット22）。同じ「展覧会」が、券では橙・ブリーフでは紺・
// バインダーでは青緑になっていた ―― これが「統一されていない」の正体。
//
// ★★**分類に使う有彩色は9つだけ**にする:
//   ・**ドメイン 4**（バショ／タイケン／ジョウホウ／モノ）
//       → 券の紙・鋏痕・マップのノード・ストックの絞り込み・ブリーフのカード・
//         バインダー。**「何であるか」を表す色はこれしかない。**
//   ・**タグ 5**（WORK / LIFE / WELLNESS / SOCIAL / GROWTH）
//       → タスクの図形。ドメインとは**別の軸**（TASK と EXPLORE は別のアプリで、
//         同じ画面に並ばないので色は借りてよいが、意味は混ぜない）。
//   ・**状態 3**（危険／肯定／選ばれている）は、この9つから**借りる**。
//
// ★★★**色そのものは `SCHEME`（`lib/constants.ts`）が持つ。ここは「役 → 色」の
//   対応表だけ**。パレットを差し替えるときは `SCHEME` の中身を書き換えれば、
//   ここも呼び出し側も全部そのまま追従する。
//
// ★★**「メイン／サブ／本文」の3つを分けて出す**（第75巡）:
//   ・`DOMAIN_COLOR` … メイン。面の色。
//   ・`DOMAIN_SUB`   … サブ。その面に載る**大きな文字**（券の題・印・罫）の色。
//   ・`DOMAIN_INK`   … その面の**本文**（`body` 13）の色。**メインから導く**。
//   なぜ本文だけ別かは `lib/constants.ts` の `SCHEME` の見出しに書いた ――
//   サブは表示用の大きな字の色なので、本文に要る 4.5 に届かない組がある。

/**
 * ★**その面の本文の色を、面の色から導く**（`INK` か `PAPER` の読めるほう）。
 * ★★表に書かずに計算するのは、**`SCHEME` を書き換えただけで追従させる**ため。
 * 表に書くと、色を替えた人が片方だけ直して「明るい地に明るい字」を作る。
 */
const luminance = (hex: string): number => {
  const ch = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** 面の色 → その上の本文の色。★比の高いほうを採る（同点は `INK`）。 */
export const bodyInkOn = (main: string): string =>
  contrast(main, INK) >= contrast(main, PAPER) ? INK : PAPER;

/** ドメインの色（4）。★これが「何であるか」を表す唯一の色＝**メイン**。 */
export const DOMAIN_COLOR: Record<ItemDomain, string> = {
  place: SCHEME.amber.main,
  experience: SCHEME.terracotta.main,
  info: SCHEME.aqua.main,
  thing: SCHEME.lilac.main,
};

/** ★**サブ**。そのメインの上に載る**大きな文字**（券の題・印・罫）の色。 */
export const DOMAIN_SUB: Record<ItemDomain, string> = {
  place: SCHEME.amber.sub,
  experience: SCHEME.terracotta.sub,
  info: SCHEME.aqua.sub,
  thing: SCHEME.lilac.sub,
};

/** その面の**本文**の色。★メインから導くので、`SCHEME` を替えれば追従する。 */
export const DOMAIN_INK: Record<ItemDomain, string> = {
  place: bodyInkOn(DOMAIN_COLOR.place),
  experience: bodyInkOn(DOMAIN_COLOR.experience),
  info: bodyInkOn(DOMAIN_COLOR.info),
  thing: bodyInkOn(DOMAIN_COLOR.thing),
};

/** kind（10種）→ 色。★**ドメインを通す**ので、kind ごとの色は持たない。 */
export const colorOfKind = (kind: ItemKind): string => DOMAIN_COLOR[KIND_DOMAIN[kind]];
export const subOfKind = (kind: ItemKind): string => DOMAIN_SUB[KIND_DOMAIN[kind]];
export const inkOfKind = (kind: ItemKind): string => DOMAIN_INK[KIND_DOMAIN[kind]];

/**
 * ★**濃さの違いだけで散らす**（バインダーのように「同じ役のものを何十枚も
 * 並べる」場所で使う）。色相はドメインの1つに固定したまま、`shade` で明暗だけ
 * 変える。★第72巡までは 22 色の独自パレットを持っていて、ドメインと無関係だった。
 */
export const DOMAIN_STEPS = [0, -14, 12, -26, 24] as const;  // ★目盛りの外（明暗の段）
