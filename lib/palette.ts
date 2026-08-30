import type { ItemDomain, ItemKind } from "./types";
import { KIND_DOMAIN, SCHEME } from "./constants";

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

/** ドメインの色（4）。★これが「何であるか」を表す唯一の色。 */
export const DOMAIN_COLOR: Record<ItemDomain, string> = {
  place: SCHEME.yellow.bg,
  experience: SCHEME.orange.bg,
  info: SCHEME.sky.bg,
  thing: SCHEME.pink.bg,
};

/** その色の上に載せる文字・図形の色。★必ず同じ組から取る（明るい地に明るい字を防ぐ）。 */
export const DOMAIN_INK: Record<ItemDomain, string> = {
  place: SCHEME.yellow.ink,
  experience: SCHEME.orange.ink,
  info: SCHEME.sky.ink,
  thing: SCHEME.pink.ink,
};

/** kind（10種）→ 色。★**ドメインを通す**ので、kind ごとの色は持たない。 */
export const colorOfKind = (kind: ItemKind): string => DOMAIN_COLOR[KIND_DOMAIN[kind]];
export const inkOfKind = (kind: ItemKind): string => DOMAIN_INK[KIND_DOMAIN[kind]];

/**
 * ★**濃さの違いだけで散らす**（バインダーのように「同じ役のものを何十枚も
 * 並べる」場所で使う）。色相はドメインの1つに固定したまま、`shade` で明暗だけ
 * 変える。★第72巡までは 22 色の独自パレットを持っていて、ドメインと無関係だった。
 */
export const DOMAIN_STEPS = [0, -14, 12, -26, 24] as const;  // ★目盛りの外（明暗の段）
