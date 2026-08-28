"use client";

import { PUNCH_BY_DOMAIN, punchPath, type PunchShape } from "@/lib/ticket";
import type { ItemDomain } from "@/lib/types";

// 鋏痕の形を描く2つの部品。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。

/** 券に開いた穴。台の色で塗り、少しずらした暗い形を下に敷いて切り口を作る。
 *  ★器の大きさいっぱいに描く（券の幅に対する比率で置きたいため）。 */
export function PunchHole({ domain, deck }: {
  domain: ItemDomain;
  /** 穴から透けて見える台の色。 */
  deck: string;
}) {
  const d = punchPath(PUNCH_BY_DOMAIN[domain], 50, 50, 46);
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden
      style={{ display: "block" }} preserveAspectRatio="xMidYMid meet">
      {/* 切り口の影。紙の厚みぶんだけ下へずらす。 */}
      <g transform="translate(1.6 2.6)">
        <path d={d} fill="rgba(60,50,30,0.45)" />
      </g>
      <path d={d} fill={deck} />
    </svg>
  );
}

/** 絞り込みなどに使う、塗りつぶしの印。 */
export function PunchGlyph({ domain, size, color }: {
  domain: ItemDomain | PunchShape;
  size: number;
  color: string;
}) {
  const shape = (domain in PUNCH_BY_DOMAIN
    ? PUNCH_BY_DOMAIN[domain as ItemDomain]
    : domain) as PunchShape;
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ display: "block" }}>
      <path d={punchPath(shape, r, r, r * 0.92)} fill={color} />
    </svg>
  );
}
