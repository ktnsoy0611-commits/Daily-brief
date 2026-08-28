"use client";

import { TICKET_CUT, TICKET_SHADE } from "@/lib/constants";
import { barsOf, EDGE_ROTATION, notchContour, notchPath, PUNCH_BY_DOMAIN, type PunchShape, type TicketEdge } from "@/lib/ticket";
import type { ItemDomain } from "@/lib/types";

// 券に付く図形（切り欠き・印・バーコード）。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。

/**
 * 縁の切り欠き。台の色で塗って、紙が食い込まれたように見せる。
 * 器いっぱいに描くので、券の幅に対する比率で置ける。
 *
 * ★★第69巡に切り口の陰を直した。前は同じ形をずらして下に敷いていたので、
 *   陰が**切り欠きの外へはみ出し**、紙の上に黒い塊が乗って見えていた。
 *   いま陰は切り欠きの輪郭を太く縁取り、**その形で切り抜く**ので、
 *   内側の半分（＝紙の厚み）だけが残る。
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
  const clip = `notch-${shape}-${edge}`;
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden
      style={{ display: "block" }} preserveAspectRatio="none">
      <defs>
        <clipPath id={clip}>
          <path d={d} transform={`rotate(${rot} 50 50)`} />
        </clipPath>
        {/* 奥ほど暗い＝窪みに見える。口（＝券の縁）側は開いているので明るい。 */}
        <linearGradient id={`${clip}-g`} x1="0" y1="0" x2="0" y2="1"
          gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor={TICKET_SHADE} stopOpacity="0.35" />
          <stop offset="1" stopColor={TICKET_SHADE} stopOpacity="1" />
        </linearGradient>
      </defs>
      <g transform={`rotate(${rot} 50 50)`}>
        {/* 地。そのすぐ上に、券の縁が落とす影を重ねる。 */}
        <path d={d} fill={deck} />
        <path d={d} fill={`url(#${clip}-g)`} />
      </g>
      {/* 紙の厚み。★**口を除いた輪郭**だけを太らせ、切り欠きの形で切り抜く。
          こうすると陰は切り口の内側にだけ残り、券の縁には1本も乗らない。 */}
      <g clipPath={`url(#${clip})`}>
        <path d={notchContour(shape)} transform={`rotate(${rot} 50 50)`}
          fill="none" stroke={TICKET_SHADE} strokeWidth={16} strokeLinejoin="round" />
        <path d={notchContour(shape)} transform={`rotate(${rot} 50 50)`}
          fill="none" stroke={TICKET_CUT} strokeWidth={5} strokeLinejoin="round" />
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
