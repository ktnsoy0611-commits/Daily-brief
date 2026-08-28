"use client";

// 改札鋏。★CSS の 3D 変形は使わず、SVG で「描く」
//   （design.md 冒頭・Safari の描画崩れを5回踏んでいるため）。
//   顎の開閉は支点まわりの2Dの回転だけで足りる。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。
// ★彩色は lib/constants.ts の NIPPER_PAINT（図形専用のパレット）から引く。
//
// ★★★第69巡に描き直した。前の版は「上から見たはさみ」で、
//   **一人称で握って紙を切れる角度**になっていなかった。直したのは3つ。
//   1. 構図 … 柄は画面の下端へ抜け（そこに手がある）、顎は上を向く。
//      工具の長軸は垂直から -26°。券の右下に置き、掴んで券へ寄せる。
//   2. 太さ … 顎は支点側で 44、頭は 98 の**塊**。頭は全長の 1/4（実物の比）。
//   3. テイスト … **グラデーションを全部やめた**。6停止の linearGradient で
//      金属を写実に寄せたものは「写実の失敗作」にしか見えない。いまは
//      面ごとに1色（lit/face/side の3面）を置き、均一な太さの輪郭で締める。
//      影もぼかさず、ずらした同形の面を1枚敷くだけ（ハードシャドウ）。

import { NIPPER_PAINT as P } from "@/lib/constants";
import { notchPath, PUNCH_BY_DOMAIN } from "@/lib/ticket";
import type { ItemDomain } from "@/lib/types";

/** 絵の枠。柄はこの枠の外へ抜ける（＝画面の外へ続く）ので `overflow: visible`。 */
const VB = { w: 520, h: 760 };
/** 支点。ここを中心に顎と柄が回る。 */
const PIVOT = { x: 300, y: 300 };
/** 工具の長軸の傾き（垂直から。負＝反時計回り＝顎が左上を向く）。
 *  ★-38°まで倒すと、柄が画面の**右へ**すぐ抜けてしまい握りが1つも見えない。
 *  -26°なら柄は**下へ**伸びるので、握りが画面の下端に残る（＝手の位置）。 */
const TILT = -26;
/** 開いた状態の顎の開き（片側の度数）。★抜き型は大きく開かない。 */
const SWING = 8;
/** 輪郭の太さ。全部品で一定。 */
const LINE = 3;
/** 影のずれ。 */
const CAST = { x: 8, y: 11 };

// ---- 腕の輪郭（外へ出る向きを + で書き、左右で符号を反転させる） --------
// ★★頭は**短くて厚い塊**。外へは広げず、**軸をまたぐ側にだけ**張り出す。
//   前の版は外へも広げた台形にしたので、開いたときに大きな V ができて
//   「レンチ」に見えていた。実物の改札鋏は plier に近く、頭は全長の 1/4 ほど。
//
// 顎（支点 y=40 → 先 y=-196）。
// ★★★**頭は軸をまたがない**（第69巡）。2つの頭は軸の左右に分かれて向かい合い、
//   そのあいだの隙間＝**喉**が先で口を開く。ここへ券の縁を差し込む。
//   前は両方の頭が軸をまたいでいたので互いに重なり、紙の入る隙間が
//   どこにも無かった（＝工具に見えない最大の原因）。
// ★胴は細く、先で**段を付けて**厚い頭の塊になる。段が無いと「ヘラ」に見える。
const JAW = [
  [4, -196], [66, -196], [66, -146], [54, -138], [54, 40],
  [6, 40], [8, -138], [4, -146],
];
// 外側の縁に当たる光。★細い帯にとどめる（広いと全体が白い塊になる）。
const JAW_LIT = [
  [50, -190], [62, -190], [62, -146], [50, -140], [50, 36],
  [40, 36], [40, -142], [48, -148],
];
// 喉に面した側に落ちる影。
const JAW_SHADE = [
  [6, 40], [8, -138], [4, -146], [4, -196], [17, -196], [17, -148], [21, -136], [19, 40],
];
// 柄（支点 → 端）。外へふくらむ弓なりで、枠の外へ抜ける。
const ARM = [
  [54, 40], [96, 190], [102, 330], [80, 452], [36, 462], [26, 332], [46, 188], [6, 44],
];
const ARM_LIT = [
  [58, 46], [88, 192], [94, 328], [74, 440], [62, 438], [82, 328], [72, 194], [46, 50],
];
// 握りの被覆。★早めに始めて、画面の下端に**赤が残る**ようにする。
const GRIP = [
  [93, 178], [102, 330], [80, 452], [36, 462], [26, 332], [37, 178],
];
const GRIP_LIT = [
  [88, 184], [96, 328], [76, 440], [64, 438], [80, 328], [74, 184],
];
// 抜き型（手前の腕）と、それを受ける窓（奥の腕）。喉をまたいで向かい合い、
// 閉じると型が窓へ入る。★ここが工具の顔なので大きく取る。
const DIE = { u0: 4, u1: -34, y0: -186, y1: -156 };
const SLOT = { u0: -4, u1: 36, y0: -190, y1: -152 };

const poly = (pts: number[][], sx: number) =>
  pts.map(([u, y], i) => `${i ? "L" : "M"}${(u * sx).toFixed(1)} ${y}`).join(" ") + " Z";
const rect = (r: { u0: number; u1: number; y0: number; y1: number }, sx: number) =>
  `M${r.u0 * sx} ${r.y0} L${r.u1 * sx} ${r.y0} L${r.u1 * sx} ${r.y1} L${r.u0 * sx} ${r.y1} Z`;

/**
 * 片腕（顎＋柄）。`sx` が -1 で顎が左、+1 で顎が右。
 *
 * ★★★**柄は顎と反対側に付く**（第69巡）。支点を挟んで1本の梃子なので、
 *   左の顎を持つ腕の柄は**右**に出る（実物の鋏・プライヤと同じ）。
 *   ここを同じ側にしていたせいで、開くと柄どうしが**交差**して
 *   1つの白い塊になり、工具に見えなかった。柄が反対側なら、開いたときに
 *   柄のあいだへ**三角の空き**ができる ― これが工具に見えるための最大の手掛かり。
 */
function Arm({ sx, angle, flat }: { sx: number; angle: number; flat?: string }) {
  const line = flat ? "none" : P.outline;
  const steel = flat ?? P.steel.face;
  const hx = -sx;   // 柄の側
  return (
    <g transform={`rotate(${angle} 0 0)`}>
      <path d={poly(ARM, hx)} fill={steel} stroke={line} strokeWidth={LINE} strokeLinejoin="round" />
      <path d={poly(JAW, sx)} fill={steel} stroke={line} strokeWidth={LINE} strokeLinejoin="round" />
      {!flat && (
        <>
          <path d={poly(ARM_LIT, hx)} fill={P.steel.lit} />
          <path d={poly(JAW_LIT, sx)} fill={P.steel.lit} />
          <path d={poly(JAW_SHADE, sx)} fill={P.steel.side} />
        </>
      )}
      <path d={poly(GRIP, hx)} fill={flat ?? P.grip.face} stroke={line} strokeWidth={LINE} strokeLinejoin="round" />
      {!flat && <path d={poly(GRIP_LIT, hx)} fill={P.grip.lit} />}
    </g>
  );
}

export function Nipper({ open = 1, closing = false, domain = "place", width = "100%" }: {
  /** 0=閉じ 1=開き。 */
  open?: number;
  /** 噛んだ瞬間だけ真に。ほんの少し食い込ませる。 */
  closing?: boolean;
  /** 抜き型に入っている形（＝これから切る鋏痕）。 */
  domain?: ItemDomain;
  width?: number | string;
}) {
  const a = SWING * open + (closing ? -2 : 0);
  const frame = `translate(${PIVOT.x} ${PIVOT.y}) rotate(${TILT})`;
  return (
    <svg viewBox={`0 0 ${VB.w} ${VB.h}`} width={width} aria-hidden style={{ display: "block", overflow: "visible" }}>
      {/* 影。★ぼかさない。同じ形をずらして1枚だけ敷く。 */}
      <g transform={`translate(${CAST.x} ${CAST.y}) ${frame}`}>
        <Arm sx={1} angle={a} flat={P.cast} />
        <Arm sx={-1} angle={-a} flat={P.cast} />
        <circle cx={0} cy={0} r={30} fill={P.cast} />
      </g>

      <g transform={frame}>
        {/* バネ。★腕**より先に**描いて、柄のあいだへ沈める（浮かせない）。
            腕の回転（±11°）では見た目がほとんど動かないので、回さない。 */}
        <path
          d="M-62 84 C -24 152, 24 152, 62 84 M-52 78 C -20 138, 20 138, 52 78"
          fill="none" stroke={P.spring} strokeWidth={LINE * 2} strokeLinecap="round"
        />

        {/* 奥の腕（右）。受けの窓を持つ。 */}
        <g transform={`rotate(${a} 0 0)`}>
          <path d={rect(SLOT, 1)} fill={P.die} />
        </g>
        <Arm sx={1} angle={a} />

        {/* 手前の腕（左）。抜き型が軸をまたいで受けの窓へ入る。 */}
        <Arm sx={-1} angle={-a} />
        <g transform={`rotate(${-a} 0 0)`}>
          <path d={rect(DIE, -1)} fill={P.steel.side} stroke={P.outline} strokeWidth={LINE} strokeLinejoin="round" />
          {/* 抜き型に入っている形＝これから切る鋏痕。100角の形をここへ縮める。 */}
          <g transform={`translate(${-DIE.u1 - 34} ${DIE.y0 + 4}) scale(0.26)`}>
            <path d={notchPath(PUNCH_BY_DOMAIN[domain])} fill={P.die} />
          </g>
        </g>

        {/* 鋲。硬い三日月のハイライトだけを乗せる。 */}
        <circle cx={0} cy={0} r={30} fill={P.rivet.face} stroke={P.outline} strokeWidth={LINE} />
        <path d="M-22 -8 a22 22 0 0 1 28 -12 a17 17 0 0 0 -22 19 Z" fill={P.rivet.lit} />
        <circle cx={0} cy={0} r={9} fill={P.rivet.shade} />
      </g>
    </svg>
  );
}
