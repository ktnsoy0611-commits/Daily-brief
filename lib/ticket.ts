// 券（Explore の共通部品）の語彙の残り ―― ドメイン → 鋏痕の形の対応だけ（第135巡に券と鋏の見本ごと削除）。
//
// ★鋏痕（入鋏の痕）は**券の縁を切り欠く**形。実物の改札鋏の鋏こんと同じで、
//   紙の中に穴を開けるのではなく、端から食い込ませて切る。
// ★形は**4ドメイン**に1対1で対応する。10種類の kind は帯の中の漢字1文字が担う。
// ★この形は**4か所**で同じ意味を持つ:
//   1. 券の縁の切り欠き  2. マップ上のノードの形  3. ストックの絞り込みアイコン
//   4. **BRIEF の札の写真の外形**（`lib/cardShape.ts`。第94巡に足した）
//   どれか1つだけ形を変えると、文字を使わない分類の約束が壊れる。
// ★★★**新しい場所で形を足すときは `PUNCH_BY_DOMAIN` から導くこと**（`cardShape.ts`
//   は `SHAPE_BY_PUNCH` で写している）。**手で対応表を2つ持つと必ず食い違う。**

import type { ItemDomain } from "./types";

export type PunchShape = "arch" | "trapezoid" | "square" | "fork";

export const PUNCH_BY_DOMAIN: Record<ItemDomain, PunchShape> = {
  place: "arch",
  experience: "trapezoid",
  info: "square",
  thing: "fork",
};
