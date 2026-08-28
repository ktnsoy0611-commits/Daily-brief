"use client";

// 改札鋏。★CSS の 3D 変形は使わず、SVG で立体的に「描く」
//   （design.md 冒頭・Safari の描画崩れを5回踏んでいるため）。
//   顎の開閉は支点まわりの2Dの回転だけで足りる。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。
// ★彩色は lib/constants.ts の NIPPER_PAINT（図形専用のパレット）から引く。
//
// 形は実物に寄せてある … 短く厚い顎（先に抜き型が付く）／すぐ後ろの支点／
// そこから長く伸びる2本の柄／柄のあいだのバネ／握りの被覆。

import { NIPPER_PAINT as P } from "@/lib/constants";

const PIVOT = { x: 104, y: 118 };
/** 開いた状態の顎の開き（片側の度数）。 */
const SWING = 9;

export function Nipper({ open = 1, closing = false, width = "100%" }: {
  /** 0=閉じ 1=開き。 */
  open?: number;
  /** 噛んだ瞬間だけ真に。ほんの少し食い込ませる。 */
  closing?: boolean;
  width?: number | string;
}) {
  const a = SWING * open + (closing ? -1.5 : 0);
  return (
    <svg viewBox="0 0 240 300" width={width} aria-hidden
      style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="npSteel" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={P.steel[0]} />
          <stop offset="0.14" stopColor={P.steel[1]} />
          <stop offset="0.38" stopColor={P.steel[2]} />
          <stop offset="0.55" stopColor={P.steel[3]} />
          <stop offset="0.78" stopColor={P.steel[4]} />
          <stop offset="1" stopColor={P.steel[5]} />
        </linearGradient>
        <linearGradient id="npSteelDark" x1="0.9" y1="0" x2="0.1" y2="1">
          <stop offset="0" stopColor={P.steelDark[0]} />
          <stop offset="0.3" stopColor={P.steelDark[1]} />
          <stop offset="0.6" stopColor={P.steelDark[2]} />
          <stop offset="0.82" stopColor={P.steelDark[3]} />
          <stop offset="1" stopColor={P.steelDark[4]} />
        </linearGradient>
        <linearGradient id="npGrip" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor={P.grip[0]} />
          <stop offset="0.3" stopColor={P.grip[1]} />
          <stop offset="0.68" stopColor={P.grip[2]} />
          <stop offset="1" stopColor={P.grip[3]} />
        </linearGradient>
        <radialGradient id="npRivet" cx="0.34" cy="0.28" r="0.85">
          <stop offset="0" stopColor={P.rivet[0]} />
          <stop offset="0.4" stopColor={P.rivet[1]} />
          <stop offset="1" stopColor={P.rivet[2]} />
        </radialGradient>
        <filter id="npShadow" x="-45%" y="-30%" width="200%" height="185%">
          <feDropShadow dx="5" dy="12" stdDeviation="10" floodColor={P.shade} floodOpacity="0.6" />
        </filter>
      </defs>

      <g filter="url(#npShadow)">
        {/* ================= 下の腕（奥） ================= */}
        <g transform={`rotate(${-a} ${PIVOT.x} ${PIVOT.y})`}>
          {/* 顎 */}
          <path d="M104 118 L46 76 Q34 68 28 78 L22 88 Q18 98 30 104 L96 132 Z"
            fill="url(#npSteelDark)" />
          {/* 受けの台（穴のあいた側） */}
          <rect x="14" y="70" width="34" height="24" rx="5"
            transform="rotate(-34 31 82)" fill="url(#npSteelDark)" />
          <ellipse cx="30" cy="83" rx="7.5" ry="5.6" transform="rotate(-34 30 83)" fill={P.hole} />
        </g>
        {/* 腕（支点から柄へ）。下側は大きく開いて別の方向へ伸ばす。 */}
        <path d="M92 132 L124 262 Q128 282 146 285 Q162 287 165 273 Q167 259 154 250 L114 130 Z"
          fill="url(#npSteelDark)" />
        <path d="M132 236 L154 250 Q167 259 165 273 Q162 287 146 285 Q128 282 124 262 Z"
          fill="url(#npGrip)" />

        {/* ================= 上の腕（手前） ================= */}
        {/* 腕 */}
        <path d="M118 118 L212 220 Q228 238 224 252 Q217 268 200 264 Q186 260 179 244 L100 126 Z"
          fill="url(#npSteel)" />
        <path d="M186 196 Q228 238 224 252 Q217 268 200 264 Q186 260 179 244 Q170 224 160 210 Z"
          fill="url(#npGrip)" />
        <path d="M124 126 L184 192" stroke={P.springLit} strokeOpacity="0.65" strokeWidth="2.8"
          strokeLinecap="round" fill="none" />

        {/* 顎（抜き型が付く側） */}
        <g transform={`rotate(${a} ${PIVOT.x} ${PIVOT.y})`}>
          <path d="M104 118 L54 58 Q44 46 34 52 L26 58 Q18 66 26 76 L94 130 Z"
            fill="url(#npSteel)" />
          {/* 抜き型の頭 */}
          <rect x="16" y="44" width="34" height="26" rx="5"
            transform="rotate(-40 33 57)" fill="url(#npSteel)" />
          <rect x="21" y="49" width="24" height="16" rx="3"
            transform="rotate(-40 33 57)" fill={P.die} />
          {/* 稜線と光 */}
          <path d="M98 124 L46 66" stroke={P.edge} strokeOpacity="0.75" strokeWidth="2.4"
            strokeLinecap="round" fill="none" />
          <path d="M92 132 L38 78" stroke={P.shade} strokeOpacity="0.4" strokeWidth="1.8" fill="none" />
        </g>

        {/* ================= バネ ================= */}
        <path d="M114 152 Q152 168 150 194 Q148 214 128 224"
          stroke={P.spring} strokeWidth="4.4" fill="none" strokeLinecap="round" opacity="0.92" />
        <path d="M114 152 Q152 168 150 194 Q148 214 128 224"
          stroke={P.springLit} strokeOpacity="0.5" strokeWidth="1.5" fill="none" strokeLinecap="round" />

        {/* ================= 支点 ================= */}
        <circle cx={PIVOT.x} cy={PIVOT.y} r="21" fill="url(#npSteel)" />
        <circle cx={PIVOT.x} cy={PIVOT.y} r="12" fill="url(#npRivet)" />
        <circle cx={PIVOT.x} cy={PIVOT.y} r="4.4" fill={P.shade} />
        <circle cx={PIVOT.x - 4.5} cy={PIVOT.y - 5.5} r="2.8" fill={P.glint} fillOpacity="0.8" />
      </g>
    </svg>
  );
}
