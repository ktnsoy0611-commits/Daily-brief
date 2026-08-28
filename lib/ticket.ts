// 券（Explore の共通部品）の語彙。設計の正は docs/explore-redesign.md。
//
// ★鋏痕(入鋏の痕)は**4ドメイン**に1対1で対応する。10種類の kind は帯の中の
//   漢字1文字が担う。鋏痕は小さく描かれるので、判別できる4つに絞ってある。
// ★この形は3か所で同じ意味を持つ:
//   1. 券に開いた穴  2. マップ上のノードの形  3. ストックの絞り込みアイコン
//   どれか1つだけ形を変えると、文字を使わない分類の約束が壊れる。

import type { ItemDomain } from "./types";

export type PunchShape = "semi" | "tri" | "circle" | "square";

export const PUNCH_BY_DOMAIN: Record<ItemDomain, PunchShape> = {
  place: "semi",
  experience: "tri",
  info: "circle",
  thing: "square",
};

/**
 * 鋏痕の輪郭。★目盛りの外（図形の座標系）。
 * `r` は外接円の半径。どの形も見かけの面積がおよそ揃うよう係数を当ててある
 * （三角と四角を同じ `r` で描くと、三角だけ小さく見える）。
 */
export function punchPath(shape: PunchShape, cx: number, cy: number, r: number): string {
  switch (shape) {
    case "semi":
      // 半円。弦を下にして、切り欠きらしく見せる。
      return `M${cx - r} ${cy + r * 0.5} A${r} ${r} 0 0 1 ${cx + r} ${cy + r * 0.5} Z`;
    case "tri":
      return `M${cx} ${cy - r * 1.05} L${cx + r} ${cy + r * 0.75} L${cx - r} ${cy + r * 0.75} Z`;
    case "square": {
      const h = r * 0.86;
      return `M${cx - h} ${cy - h} L${cx + h} ${cy - h} L${cx + h} ${cy + h} L${cx - h} ${cy + h} Z`;
    }
    case "circle":
    default: {
      // 円も path で書く（穴の描画を1つの型に揃えるため）。
      return `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
    }
  }
}

/** 通し番号。券らしさは4桁の連番だけで足りる。 */
export const serialOf = (n: number) => String(n % 10000).padStart(4, "0");
