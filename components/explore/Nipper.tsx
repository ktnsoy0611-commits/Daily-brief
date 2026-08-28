"use client";

// 改札鋏。★CSS の 3D 変形は使わず、SVG で「描く」
//   （design.md 冒頭・Safari の描画崩れを5回踏んでいるため）。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。
// ★彩色は lib/constants.ts の NIPPER_PAINT（図形専用のパレット）から引く。
//
// ★★★形の正は**一体成型のステンレスの改札鋏**（2026-08-28 にユーザー指定）。
//   プライヤではない。長い**涙形のループの柄**（帯そのものがバネ）と、
//   その先の**小さな頭**。頭は全長の 2 割ほど。動くのは**上の顎だけ**で、
//   下の顎と黒い樹脂の受けはループと一体で動かない（実物の1穴パンチと同じ）。
//
// ★★★描き方の正は **Sony Walkman のイラスト**（同日ユーザー指定）。
//   1. **輪郭線を1本も引かない。** 面は明暗だけで分かれる。
//   2. 立体は**押し出し** … 同じ輪郭を右下へずらして `side` で置くと厚みになる。
//   3. 稜線の光は**左上の三日月** … 輪郭で切り抜いた中に `lit` を敷き、その上に
//      `face` を右下へ少しずらして重ねると、左上だけに光の帯が残る。
//   4. 影は**ぼかさない1枚の面**。輪郭をまとめて大きくずらすだけ。
//   5. 階調は**無彩色の3つ**＋黒い受け＋抜き型のドメイン色。増やさない。

import { useId } from "react";

import { NIPPER_PAINT as P, TICKET_DOMAIN_COLOR } from "@/lib/constants";
import type { ItemDomain } from "@/lib/types";

/** 絵の枠。柄は枠の外へ抜ける（＝画面の外へ続く）ので `overflow: visible`。 */
export const NIPPER_VB = { w: 560, h: 900 };
/** 工具の原点（＝頭と柄の継ぎ目）。呼び出し側はここを画面のどこへ置くかで構図を決める。 */
export const NIPPER_ORIGIN = { x: 300, y: 300 };
/** 工具の長軸の傾き（垂直から。負＝反時計回り＝頭が左上を向く）。 */
const TILT = -26;
/** 開いた状態の上の顎の持ち上がり（度）。 */
const SWING = 15;
/** 上の顎が回る点（工具の座標系）＝鋲。 */
const HINGE = { x: 48, y: -50 };
const RIVET_R = 22;
/** 厚み（押し出し）のずれ。右下へ。 */
const EXT = { x: 13, y: 15 };
/** 稜線の光の幅（面をこのぶん右下へずらすと、左上に光が残る）。 */
const LIT = { x: 6, y: 7 };
/** 地に落ちる影のずれ。 */
const CAST = { x: 18, y: 24 };

// ---- 部品の輪郭 ------------------------------------------------------
// ★頭は**大きく厚く**取る（第69巡3巡目）。小さくすると受け・抜き型・鋲が
//   1つの塊に潰れて、何の工具か分からなくなる。頭が全長の 4 割ほど。
//
/** 柄のループ。帯そのものがバネ。★静止（±12°では見た目が動かない）。 */
const LOOP = `M-104 36 C-120 150 -180 200 -180 300 C-180 410 -104 480 -10 480
  C84 480 160 410 160 300 C160 200 100 150 84 36
  L22 36 C38 150 90 206 90 300 C90 368 48 410 -10 410
  C-68 410 -110 368 -110 300 C-110 206 -58 150 -42 36 Z`;
/** 下の顎（＝首の板）。ループと一体で動かない。上面に受けが乗る。 */
const LOWER = `M-96 -88 L60 -88 C74 -88 84 -78 84 -64 L84 22
  C84 36 74 46 60 46 L-96 46 C-110 46 -120 36 -120 22 L-120 -64
  C-120 -78 -110 -88 -96 -88 Z`;
/** 受け（黒い樹脂）。ここに紙が当たる。 */
const ANVIL = `M-106 -88 L-38 -88 L-38 -132 C-38 -140 -44 -146 -52 -146
  L-92 -146 C-100 -146 -106 -140 -106 -132 Z`;
/** 上の顎。右を上がって頭で左へ折れ、先が受けの上へ垂れる。★これだけが回る。 */
const UPPER = `M20 -16 L84 -16 L84 -206 C84 -234 68 -250 42 -254
  L-84 -274 C-104 -277 -120 -264 -120 -244 L-120 -186 L-30 -186 L20 -224 Z`;
/** 抜き型。頭に載る唯一の有彩色。受けへ向かって垂れる。 */
const DIE = `M-106 -190 L-42 -190 L-42 -160 L-106 -160 Z`;

/** 部品1つ。厚み → 光 → 面 の3枚で、輪郭線を1本も引かずに立体にする。 */
function Part({ d, fill, id }: { d: string; fill: string; id: string }) {
  return (
    <>
      <path d={d} transform={`translate(${EXT.x} ${EXT.y})`} fill={P.side} />
      <clipPath id={id}><path d={d} /></clipPath>
      <g clipPath={`url(#${id})`}>
        <path d={d} fill={P.lit} />
        <path d={d} transform={`translate(${LIT.x} ${LIT.y})`} fill={fill} />
      </g>
    </>
  );
}

export function Nipper({ open = 1, closing = false, domain = "place", width = "100%" }: {
  /** 0=閉じ 1=開き。上の顎だけが持ち上がる。 */
  open?: number;
  /** 噛んだ瞬間だけ真に。ほんの少し食い込ませる。 */
  closing?: boolean;
  /** 抜き型に入っている形（＝これから切る鋏痕）の色。 */
  domain?: ItemDomain;
  width?: number | string;
}) {
  const a = -(SWING * open) + (closing ? 2 : 0);
  const k = useId();
  const frame = `translate(${NIPPER_ORIGIN.x} ${NIPPER_ORIGIN.y}) rotate(${TILT})`;
  const jaw = `rotate(${a} ${HINGE.x} ${HINGE.y})`;
  const flat = (extra?: string) => (
    <g transform={extra}>
      <path d={LOOP} fill={P.cast} />
      <path d={LOWER} fill={P.cast} />
      <path d={UPPER} fill={P.cast} />
    </g>
  );
  return (
    <svg viewBox={`0 0 ${NIPPER_VB.w} ${NIPPER_VB.h}`} width={width} aria-hidden
      style={{ display: "block", overflow: "visible" }}>
      {/* 影。★ぼかさない。輪郭をまとめてずらした1枚の面。 */}
      <g transform={`translate(${CAST.x} ${CAST.y}) ${frame}`}>{flat(jaw)}</g>

      <g transform={frame}>
        <Part d={LOOP} fill={P.face} id={`np-loop-${k}`} />

        {/* 上の顎。★首の板より**先に**描く。板が継ぎ目を隠すので、
            回しても柄との接ぎが割れて見えない。 */}
        <g transform={jaw}>
          <Part d={UPPER} fill={P.face} id={`np-up-${k}`} />
          <path d={DIE} transform={`translate(${EXT.x / 2} ${EXT.y / 2})`} fill={P.deep} />
          <path d={DIE} fill={TICKET_DOMAIN_COLOR[domain]} />
        </g>

        <Part d={LOWER} fill={P.face} id={`np-low-${k}`} />
        {/* 受け。黒い樹脂なので光は乗せず、厚みだけ付ける。 */}
        <path d={ANVIL} transform={`translate(${EXT.x} ${EXT.y})`} fill={P.deep} />
        <path d={ANVIL} fill={P.anvil} />

        {/* 鋲。 */}
        <circle cx={HINGE.x + EXT.x / 2} cy={HINGE.y + EXT.y / 2} r={RIVET_R} fill={P.side} />
        <circle cx={HINGE.x} cy={HINGE.y} r={RIVET_R} fill={P.rivet} />
      </g>
    </svg>
  );
}
