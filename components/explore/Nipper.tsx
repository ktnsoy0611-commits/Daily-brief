"use client";

import { useId } from "react";

import { NIPPER_PAINT as P, TICKET_DOMAIN_COLOR, WHITE } from "@/lib/constants";
import type { ItemDomain } from "@/lib/types";

// 改札鋏。★CSS の 3D 変形は使わず、SVG で「描く」
//   （design.md 冒頭・Safari の描画崩れを5回踏んでいるため）。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。
// ★彩色は lib/constants.ts の NIPPER_PAINT（図形専用のパレット）から引く。
//
// ★★★形の正は**一体成型のステンレスの改札鋏**（実物の上面写真・2026-08-28）。
//   1. **柄は閉じない。** 開いた V に分かれた2本で、そのあいだを
//      **別体の針金のバネ**（途中で環に巻いている）が渡る。
//      3巡目は閉じた涙形のループにしていたが、実物にそんな形は無い。
//   2. 頭は**上面が主役** … 上の顎の平らな板に載った**ダイの出っ張り**と、
//      下の顎を貫いた**受けのスリット**。この3つだけ。段を増やさない。
//   3. 柄は**無骨**。太い鍛造の棒で、根元から先へゆるく細り、先端は丸い。
//
// ★★★描き方の正は **Sony Walkman のイラスト**（同日）。
//   輪郭線を1本も引かず、面の明暗だけで立体にする。詳しくは `Part`。
//
// ★★★視点は**一人称・見下ろし**（券に鋏を入れている手の写真が正）。
//   **上面が見えている**こと。そのうえで**一点透視** ―
//   消失点は画面の中央にあり、**右へ置けば左の側面、左へ置けば右の側面**が見える。
//   実装は押し出しの向きを `lean` から決めるだけで、輪郭は1つも書き直さない。

/** 絵の枠。柄は枠の外へ抜ける（＝画面の外へ続く）ので `overflow: visible`。 */
export const NIPPER_VB = { w: 560, h: 900 };
/** 工具の原点（＝鋲）。呼び出し側はここを画面のどこへ置くかで構図を決める。 */
export const NIPPER_ORIGIN = { x: 280, y: 300 };
/** 工具の長軸の傾き（垂直から。負＝反時計回り＝頭が左上を向く）。 */
const TILT = -26;
/** 顎の開き（片腕あたりの度数）。 */
const SWING = 7;
/** 角丸。★全部品でこの1つ。ばらつかせない（洗練の要）。 */
const ROUND = 6;
/** 押し出しの深さ（見下ろしているので常に下向き）。 */
const DEPTH = 21;
/** 一点透視の横の振れ幅。`lean` が ±1 のときこれだけ横へ押し出す。 */
const LEAN_X = 30;
/** 稜線の光の幅。★光は上左から。位置によらず一定（照明は動かない）。 */
const LIT = { x: 5, y: 6 };
/** 地に落ちる影のずれ。★照明の向きなので位置によらず一定。 */
const CAST = { x: 20, y: 28 };
/** 鋲の半径。 */
const RIVET_R = 20;

// ---- 部品の輪郭（外へ出る向きを + で書き、左右で符号を反転させる） ----
/** 顎＋柄。**1本の鍛造の棒**なので1つの輪郭で描く。 */
// ★実物の比 … 鋲より上の顎が全長の 1/3、柄が 2/3。柄は**太い**。
//   4巡目の1回目は柄が長く細すぎて「割り箸」に見えた。
const ARM: number[][] = [
  // 頭 … **長い平板**。実物はここが全長の 1/4 を占める長方形の板で、
  //      上顎の板にダイの出っ張り、下顎の板に受けの長いスリットが入る。
  //      4巡目の2回目は板を短い「帽子」にしてしまい、洗濯挟みに見えていた。
  [-14, -300], [76, -292], [80, -120],
  // 首 … 鋲のところでいったん締まる
  [86, -40], [84, 20],
  // 柄 … 外側 → 丸い先 → 内側。ゆるく開き、先だけ丸い
  [160, 300], [172, 380], [166, 424], [146, 448], [120, 454], [100, 442], [92, 412], [88, 372], [86, 300],
  // 内側を戻る
  // 板の内側へは**斜めに戻る**。水平の段を作ると首に矢印のような
  // 切れ込みが見えて汚い。
  [20, 24], [14, -60], [-14, -132],
];

/** ダイ（手前の腕の頭に載る出っ張り）。軸をまたぐので絶対座標で描く。 */
const DIE = "M-14 -302 H22 V-256 H-14 Z";
/** 受けのスリット（奥の腕の頭を貫いた窓）。 */
const SLOT = "M-18 -288 H16 V-196 H-18 Z";
/**
 * 針金のバネ。柄のあいだに渡り、途中で**環に巻いている**（実物のいちばん
 * 目立つ特徴）。腕の回転（±7°）では見た目がほとんど動かないので回さない。
 */
const SPRING_RING = { cx: 4, cy: 316, r: 50 };
const SPRING_LEADS = [
  "M-54 158 C-96 226 -84 288 -46 302",
  "M54 300 C88 282 94 250 98 224",
];
/** 針金の太さ。 */
const WIRE = 8;

const poly = (pts: number[][], sx: number) =>
  pts.map(([u, y], i) => `${i ? "L" : "M"}${(u * sx).toFixed(1)} ${y}`).join(" ") + " Z";

/**
 * 部品1つ。**輪郭線を1本も引かず**、3枚の重ねだけで立体にする。
 *
 *   1枚目 … 輪郭を `ext` だけずらして `side` で置く ＝ **押し出した側面**
 *   2枚目 … マスクの中を `lit` で埋める          ＝ **稜線の光**
 *   3枚目 … 輪郭を `LIT` だけずらして `face` で置く ＝ **上面**
 *
 * 3枚目が 2枚目を覆い残すぶんが左上の三日月になり、それが面取りの光に見える。
 * ★角丸は `ROUND` の輪郭ストロークで作る。全部品・全レイヤで同じ値なので、
 *   ずらしても形が食い違わない。マスクもストロークごと焼くので縁が揃う。
 */
function Part({ d, id, ext }: { d: string; id: string; ext: { x: number; y: number } }) {
  const edge = {
    strokeWidth: ROUND * 2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const,
  };
  return (
    <>
      <mask id={id}>
        {/* ★マスクの白は「色」ではなく「不透明」の意味（design.md §7）。 */}
        <path d={d} fill={WHITE} stroke={WHITE} {...edge} />
      </mask>
      <path d={d} transform={`translate(${ext.x} ${ext.y})`} fill={P.side} stroke={P.side} {...edge} />
      <g mask={`url(#${id})`}>
        <rect x={-NIPPER_VB.w} y={-NIPPER_VB.h} width={NIPPER_VB.w * 2} height={NIPPER_VB.h * 2} fill={P.lit} />
        <path d={d} transform={`translate(${LIT.x} ${LIT.y})`} fill={P.face} stroke={P.face} {...edge} />
      </g>
    </>
  );
}

export function Nipper({ open = 1, closing = false, domain = "place", lean = 0, width = "100%" }: {
  /** 0=閉じ 1=開き。2本の腕が鋲まわりに開く。 */
  open?: number;
  /** 噛んだ瞬間だけ真に。ほんの少し食い込ませる。 */
  closing?: boolean;
  /** ダイに入っている形（＝これから切る鋏痕）の色。 */
  domain?: ItemDomain;
  /**
   * 画面のどこに置いたか（-1=左端 / 0=中央 / +1=右端）。
   * ★一点透視。右へ置くほど**左の側面**が、左へ置くほど**右の側面**が見える。
   */
  lean?: number;
  width?: number | string;
}) {
  const a = SWING * open + (closing ? -1.5 : 0);
  const k = useId();
  const ext = { x: -lean * LEAN_X, y: DEPTH };
  const frame = `translate(${NIPPER_ORIGIN.x} ${NIPPER_ORIGIN.y}) rotate(${TILT})`;
  const armL = poly(ARM, -1);
  const armR = poly(ARM, 1);
  const flat = (
    <>
      <path d={armR} transform={`rotate(${a} 0 0)`} fill={P.cast} stroke={P.cast}
        strokeWidth={ROUND * 2} strokeLinejoin="round" strokeLinecap="round" />
      <path d={armL} transform={`rotate(${-a} 0 0)`} fill={P.cast} stroke={P.cast}
        strokeWidth={ROUND * 2} strokeLinejoin="round" strokeLinecap="round" />
    </>
  );
  return (
    <svg viewBox={`0 0 ${NIPPER_VB.w} ${NIPPER_VB.h}`} width={width} aria-hidden
      style={{ display: "block", overflow: "visible" }}>
      {/* 影。★ぼかさない。輪郭をまとめてずらした1枚の面。 */}
      <g transform={`translate(${CAST.x} ${CAST.y}) ${frame}`}>{flat}</g>

      <g transform={frame}>
        {/* 針金のバネ。★実物のいちばん目立つ特徴。柄のあいだで**環に巻いている**。
            腕より先に描いて、柄の下へ沈める。腕の回転（±7°）では動かない。 */}
        <g transform={`translate(${ext.x} ${ext.y})`} fill="none" stroke={P.side}
          strokeWidth={WIRE} strokeLinecap="round">
          <circle cx={SPRING_RING.cx} cy={SPRING_RING.cy} r={SPRING_RING.r} />
          {SPRING_LEADS.map((d) => <path key={d} d={d} />)}
        </g>
        <g fill="none" stroke={P.spring} strokeWidth={WIRE} strokeLinecap="round">
          <circle cx={SPRING_RING.cx} cy={SPRING_RING.cy} r={SPRING_RING.r} />
          {SPRING_LEADS.map((d) => <path key={d} d={d} />)}
        </g>

        {/* 奥の腕。頭に受けのスリットが開いている。 */}
        <g transform={`rotate(${a} 0 0)`}>
          <Part d={armR} id={`np-r-${k}`} ext={ext} />
          <path d={SLOT} fill={P.deep} transform={`translate(${ext.x / 2} ${ext.y / 2})`} />
          <path d={SLOT} fill={P.anvil} />
        </g>

        {/* 手前の腕。頭にダイが載る。 */}
        <g transform={`rotate(${-a} 0 0)`}>
          <Part d={armL} id={`np-l-${k}`} ext={ext} />
          <path d={DIE} fill={P.side} transform={`translate(${ext.x / 2} ${ext.y / 2})`} />
          <path d={DIE} fill={P.lit} />
          {/* ダイに入っている形＝これから切る鋏痕。唯一の有彩色。 */}
          <path d="M-6 -294 H14 V-266 H-6 Z" fill={TICKET_DOMAIN_COLOR[domain]} />
        </g>

        {/* 鋲。 */}
        <circle cx={ext.x / 2} cy={ext.y / 2} r={RIVET_R} fill={P.side} />
        <circle cx={0} cy={0} r={RIVET_R} fill={P.rivet} />
      </g>
    </svg>
  );
}
