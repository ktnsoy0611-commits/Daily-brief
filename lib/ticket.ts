// 券（Explore の共通部品）の語彙。設計の正は docs/explore-redesign.md。
//
// ★鋏痕（入鋏の痕）は**券の縁を切り欠く**形。実物の改札鋏の鋏こんと同じで、
//   紙の中に穴を開けるのではなく、端から食い込ませて切る。
// ★形は**4ドメイン**に1対1で対応する。10種類の kind は帯の中の漢字1文字が担う。
// ★この形は3か所で同じ意味を持つ:
//   1. 券の縁の切り欠き  2. マップ上のノードの形  3. ストックの絞り込みアイコン
//   どれか1つだけ形を変えると、文字を使わない分類の約束が壊れる。

import type { ItemDomain } from "./types";

export type PunchShape = "semi" | "tri" | "square" | "w";
export type TicketEdge = "top" | "right" | "bottom" | "left";

export const PUNCH_BY_DOMAIN: Record<ItemDomain, PunchShape> = {
  place: "semi",
  experience: "tri",
  info: "square",
  thing: "w",
};

/**
 * 切り欠きの輪郭。100×100 の枠に、**上の辺を口にして**下へ食い込む形で描く。
 * 実際の辺へは `EDGE_ROTATION` で回して当てる。
 * ★目盛りの外（図形の座標系）。
 */
export function notchPath(shape: PunchShape): string {
  switch (shape) {
    case "semi":
      // 半円。口の直径がそのまま辺に乗る。
      return "M0 0 H100 A50 50 0 0 1 0 0 Z";
    case "tri":
      // V字。実物の「山型」を裏返した形。
      return "M0 0 H100 L50 96 Z";
    case "square":
      // 角型。いちばん judgement が要らない形なので、数の多いジョウホウに当てる。
      return "M0 0 H100 V72 H0 Z";
    case "w":
    default:
      // 二山。実物にもある形で、遠目でも三角と混ざらない。
      return "M0 0 H100 L78 88 L50 26 L22 88 Z";
  }
}

/**
 * 同じ形の**口を除いた輪郭**（＝実際に刃が入った線）。
 * ★紙の厚みの陰はこの線にだけ落とす。閉じた輪郭を縁取ると、
 *   **券の縁そのものにも線が乗って**しまい、切り欠きが「切れ目」ではなく
 *   「置かれた図形」に見える（第69巡に実際に起きた）。
 * ★目盛りの外（図形の座標系）。
 */
export function notchContour(shape: PunchShape): string {
  switch (shape) {
    case "semi":
      return "M100 0 A50 50 0 0 1 0 0";
    case "tri":
      return "M100 0 L50 96 L0 0";
    case "square":
      return "M100 0 V72 H0 V0";
    case "w":
    default:
      return "M100 0 L78 88 L50 26 L22 88 L0 0";
  }
}

/** 上の辺で描いた形を、実際の辺へ向けるための回転角。 */
export const EDGE_ROTATION: Record<TicketEdge, number> = {
  top: 0,
  left: -90,
  bottom: 180,
  right: 90,
};

/** 通し番号。券らしさは4桁の連番だけで足りる。 */
export const serialOf = (n: number) => String(n % 10000).padStart(4, "0");

/**
 * 通し番号から決まるバーコードの棒の並び（幅の列）。
 * 同じ券は必ず同じ縞になる（毎回変わると紙に見えない）。
 * ★目盛りの外（図形）。
 */
export function barsOf(serial: number, count = 34): number[] {
  let s = (serial * 9301 + 49297) % 233280;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280;
    out.push(1 + Math.floor((s / 233280) * 3));
  }
  return out;
}
