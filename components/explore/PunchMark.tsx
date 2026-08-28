"use client";

import { useId } from "react";

import { TICKET_CUT } from "@/lib/constants";
import { barsOf, EDGE_ROTATION, notchContour, notchPath, PUNCH_BY_DOMAIN, type PunchShape, type TicketEdge } from "@/lib/ticket";
import type { ItemDomain } from "@/lib/types";

// 券に付く図形（切り欠き・印・バーコード）。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。

/**
 * 縁の切り欠き。台の色で塗って、紙が食い込まれたように見せる。
 * 器いっぱいに描くので、券の幅に対する比率で置ける。
 *
 * ★★券が**彩度の高い紙**になった（第69巡3巡目）ので、切り欠きは地との差で
 *   はっきり読む。前巡の「奥ほど暗い影」の細工は要らなくなった ―
 *   いまは地を塗り、**口を除いた輪郭**を細く縁取るだけ。
 * ★閉じた輪郭を縁取ると**券の縁そのものにも線が乗り**、切れ目ではなく
 *   「置かれた図形」に見える（第69巡2巡目に実際にそうなった）。
 */
export function PunchNotch({ domain, edge, deck }: {
  domain: ItemDomain;
  edge: TicketEdge;
  /** 切り欠きから見える台の色。 */
  deck: string;
}) {
  const shape = PUNCH_BY_DOMAIN[domain];
  const d = notchPath(shape);
  const rot = EDGE_ROTATION[edge];
  const clip = useId();
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden
      style={{ display: "block" }} preserveAspectRatio="none">
      <defs>
        <clipPath id={clip}>
          <path d={d} transform={`rotate(${rot} 50 50)`} />
        </clipPath>
      </defs>
      <g transform={`rotate(${rot} 50 50)`}>
        <path d={d} fill={deck} />
      </g>
      {/* 紙の厚み。★口を除いた輪郭だけを太らせ、切り欠きの形で切り抜く。 */}
      <g clipPath={`url(#${clip})`}>
        <path d={notchContour(shape)} transform={`rotate(${rot} 50 50)`}
          fill="none" stroke={TICKET_CUT} strokeWidth={6} strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** 絞り込みなどに使う、切り欠きの形の印。 */
export function PunchGlyph({ shape, domain, size, color }: {
  shape?: PunchShape;
  domain?: ItemDomain;
  size: number;
  color: string;
}) {
  const s = shape ?? (domain ? PUNCH_BY_DOMAIN[domain] : "semi");
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block" }}>
      <path d={notchPath(s)} fill={color} />
    </svg>
  );
}

/** 券の端に刷るバーコード。棒の並びは通し番号から決まる（毎回同じ）。 */
export function Barcode({ serial, ink, vertical = true }: {
  serial: number;
  ink: string;
  /** 縦帯に刷る（棒が横に寝る）。 */
  vertical?: boolean;
}) {
  const bars = barsOf(serial);
  // 位置は先に畳んで出す（描画中に値を書き換えない）。
  const placed = bars.reduce<{ at: number; list: { x: number; w: number }[] }>(
    (acc, w) => ({ at: acc.at + w + 1, list: [...acc.list, { x: acc.at, w }] }),
    { at: 0, list: [] },
  );
  const total = placed.at;
  const rects = placed.list.map((b, i) => (
    vertical
      ? <rect key={i} x={0} y={b.x} width={100} height={b.w} fill={ink} />
      : <rect key={i} x={b.x} y={0} width={b.w} height={100} fill={ink} />
  ));
  return (
    <svg width="100%" height="100%" aria-hidden preserveAspectRatio="none"
      viewBox={vertical ? `0 0 100 ${total}` : `0 0 ${total} 100`} style={{ display: "block" }}>
      {rects}
    </svg>
  );
}
