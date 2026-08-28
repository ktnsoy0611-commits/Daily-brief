// 券（Explore の共通部品）の語彙。設計の正は docs/explore-redesign.md。
//
// ★鋏痕（入鋏の痕）は**券の縁を切り欠く**形。実物の改札鋏の鋏こんと同じで、
//   紙の中に穴を開けるのではなく、端から食い込ませて切る。
// ★形は**4ドメイン**に1対1で対応する。10種類の kind は帯の中の漢字1文字が担う。
// ★この形は3か所で同じ意味を持つ:
//   1. 券の縁の切り欠き  2. マップ上のノードの形  3. ストックの絞り込みアイコン
//   どれか1つだけ形を変えると、文字を使わない分類の約束が壊れる。

import type { ItemDomain } from "./types";

export type PunchShape = "arch" | "trapezoid" | "square" | "fork";
export type TicketEdge = "top" | "right" | "bottom" | "left";

export const PUNCH_BY_DOMAIN: Record<ItemDomain, PunchShape> = {
  place: "arch",
  experience: "trapezoid",
  info: "square",
  thing: "fork",
};

/**
 * 切り欠きの輪郭。100×100 の枠に、**上の辺（y=0）を口にして**下へ食い込む形で描く。
 * 実際の辺へは `EDGE_ROTATION` で回して当てる。
 *
 * ★★形の正は**旧国鉄の鋏こん一覧**（2026-08-28 にユーザー指定）。46種すべてが
 *   「券の縁が形の上辺で、そこから下へ食い込む」形で、輪郭は**直線と単純な弧が
 *   2〜4本だけ**。この規律から外れた形は鋏こんに見えない。
 * ★4つは**輪郭の性格**が全部違うものを選んである ―
 *   弧（アーチ）／斜め（台形）／直角（角）／切れ込み（二又）。
 *   小さく描いても混ざらないのはこのため。形だけ差し替えないこと。
 * ★目盛りの外（図形の座標系）。
 */
export function notchPath(shape: PunchShape): string {
  switch (shape) {
    case "arch":
      // アーチ。一覧の #4 大井町・#6 蒲田。直線の肩から弧の底へ。
      return "M0 0 H100 V52 A50 46 0 0 1 0 52 Z";
    case "trapezoid":
      // 台形。一覧の #26 藤沢・#27 洋光台・横須賀。斜め2本と平らな底。
      return "M0 0 H100 L74 90 H26 Z";
    case "square":
      // 角。一覧の予備2・鶴見。直角だけでできている。
      return "M0 0 H100 V84 H0 Z";
    case "fork":
    default:
      // 二又。一覧の品川・#15 辻堂・#22 恵比寿。底に V を食い込ませて爪が2本。
      return "M0 0 H100 V92 L50 46 L0 92 Z";
  }
}

/**
 * 同じ形の**口を除いた輪郭**（＝実際に刃が入った線）。
 * ★紙の厚みの陰はこの線にだけ落とす。閉じた輪郭を縁取ると、
 *   **券の縁そのものにも線が乗って**しまい、切り欠きが「切れ目」ではなく
 *   「置かれた図形」に見える（第69巡2巡目に実際に起きた）。
 * ★目盛りの外（図形の座標系）。
 */
export function notchContour(shape: PunchShape): string {
  switch (shape) {
    case "arch":
      return "M100 0 V52 A50 46 0 0 1 0 52 V0";
    case "trapezoid":
      return "M100 0 L74 90 H26 L0 0";
    case "square":
      return "M100 0 V84 H0 V0";
    case "fork":
    default:
      return "M100 0 V92 L50 46 L0 92 V0";
  }
}

/**
 * 斜めに入鋏したとき、券の縁に**紙のヒゲを残さない**ための板。
 * 鋏こんの口（y=0）から**外側へ**伸ばしてあり、形と一緒に口の中点まわりに
 * 回す。傾ければ口はそのぶん広がり、券の縁は左右とも直線のまま残る
 * ＝実物の斜め入鋏と同じ。券の外へはみ出た分は券の `overflow: hidden` が切る。
 * ★これを伸ばさずに回すと、縁に三角のヒゲが残る。
 * ★目盛りの外（図形の座標系）。
 */
export const NOTCH_LIP = "M0 -140 H100 V2 H0 Z";

/** 入鋏の傾きの上限（度）。垂直に入らなくてよい ― 実物もそうなっている。 */
export const NOTCH_TILT_MAX = 20;

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
