"use client";

import { NIPPER_PAINT as P, TICKET_DOMAIN_COLOR } from "@/lib/constants";
import type { ItemDomain } from "@/lib/types";

// 改札鋏。★CSS の 3D 変形は使わず、SVG で「描く」
//   （design.md 冒頭・Safari の描画崩れを5回踏んでいるため）。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。
// ★彩色は lib/constants.ts の NIPPER_PAINT（図形専用のパレット）から引く。
//
// ★★★**腕が開くのは鉛直方向**（第69巡6巡目）。
//   5巡目までは腕の開く向きを**地面と平行な軸**に置いていた。だから参考写真
//   （＝改札鋏の**左面**）をそのまま押し出す絵になり、**左面が上を向いた
//   「横倒しのホチキス」**が出来ていた。この向きでは紙を地面と平行に通せない。
//
//   紙を切る先端は**ホチキスと同じ**。口は水平に開き、紙は水平に入る。
//   腕は鉛直に開く（掌で下の柄、指で上の柄を挟んで握る）。鋲の軸は幅方向。
//
// ★★参考写真は `l–z` 断面（側面図）そのもの。1本の背骨の **z の符号を
//   反転させるだけ**で2本の腕になる ― 鋏は鋲で交差しているので、上の顎を
//   持つ腕の柄は下に出る。符号の反転がそれをそのまま表す。
//
// ★★★描き方の正は **Sony Walkman のイラスト**。輪郭線を1本も引かず、
//   面の明暗だけで立体にする。影もぼかさない1枚の面。

/** 絵の枠。柄は枠の外へ抜けるので `overflow: visible`。 */
export const NIPPER_VB = { w: 620, h: 760 };
/** 工具の原点（＝鋲）。呼び出し側はここを画面のどこへ置くかで構図を決める。 */
export const NIPPER_ORIGIN = { x: 300, y: 380 };

// ---- 投影の3軸 ------------------------------------------------------
/** 長さ。＋が頭（＝口の向き）。左上へ、俯瞰で短縮する。 */
const L = { x: -0.40, y: -0.56 };
/** 幅。＋が工具の右。右へ、手前がやや下。 */
const W = { x: 0.88, y: 0.30 };
/** 高さ。★ここが鉛直。腕はこの軸で開く。 */
const Z_Y = -0.80;
/** 高さ1あたりの横のずれ。★一点透視。`lean` で符号が変わる。 */
const LEAN_X = 0.10;
/** 稜線の光。★照明は動かないので `lean` に連動させない。 */
const LIT = { x: 5, y: 6 };
/** 地に落ちる影のずれ。★これも一定。 */
const CAST = { x: 26, y: 34 };
/** 角丸。★全部品でこの1つ。 */
const ROUND = 7;

// ---- 工具の寸法 -----------------------------------------------------
// 背骨は**参考写真の断面をそのまま写した l–z**。[l, z, 半分の厚み, 半分の幅]。
const SPINE: number[][] = [
  [300, 26, 17, 58],    // 先端の顎。四角く**幅が広い**（首よりはっきり太い）
  [196, 18, 17, 58],
  [156, 14, 19, 36],    // 顎 → 首（ここで段が付く）
  [0, 0, 21, 34],       // 鋲
  [-170, -26, 22, 38],  // 柄。無骨に太く、ゆるく細る
  [-330, -50, 23, 40],
  [-424, -66, 16, 30],
];
/** 鋲で分ける（顎＝先端側 / 柄＝手元側）。低い方から描くために要る。 */
const PIVOT_I = 3;
/** ダイの窓（上の顎の**天面**に開く）。[l, z, ―, 半分の幅] */
const DIE: number[][] = [[276, 43, 0, 28], [212, 38, 0, 28]];
/** バネのコイル。`l–z` 面にあるので、上から見るとほぼ真横＝細い楕円。 */
const RING = { l: -232, z: -36, r: 54 };
const WIRE = 11;
/** 鋲の見えている頭。 */
const RIVET_R = 20;

// ---- 投影と作図 ------------------------------------------------------
type P2 = { x: number; y: number };

const proj = (l: number, w: number, z: number, zx: number): P2 => ({
  x: l * L.x + w * W.x + z * zx,
  y: l * L.y + w * W.y + z * Z_Y,
});

const path = (pts: P2[]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";

/** 背骨を水平な面として投影する。`s` は厚みの符号（+1=天面 / -1=底面）。 */
const ribbon = (sp: number[][], s: number, zx: number) => path([
  ...sp.map(([l, z, ht, hw]) => proj(l, hw, z + s * ht, zx)),
  ...[...sp].reverse().map(([l, z, ht, hw]) => proj(l, -hw, z + s * ht, zx)),
]);

/** `l–z` 平面の中で鋲まわりに回す（鋲の軸は幅方向＝実物と同じ）。 */
function spin(sp: number[][], deg: number): number[][] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return sp.map(([l, z, ht, hw]) => [l * c - z * s, l * s + z * c, ht, hw]);
}

/** z を反転して、もう一方の腕にする。 */
const flip = (sp: number[][]) => sp.map(([l, z, ht, hw]) => [l, -z, ht, hw]);

const EDGE = {
  strokeWidth: ROUND * 2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const,
};

/**
 * 棒。**輪郭線を1本も引かず**、3枚の重ねで立体にする。
 *   1枚目 … 底面を `side` で置く ＝ 側壁
 *   2枚目 … 天面を `lit` で置く   ＝ 稜線の光
 *   3枚目 … 天面を `LIT` だけずらして `face` で置く ＝ 天面
 * 天面は底面より**上**に出るので、あいだに残る帯がそのまま側壁に見える。
 */
function Bar({ sp, zx, top = P.face }: { sp: number[][]; zx: number; top?: string }) {
  const t = ribbon(sp, 1, zx);
  return (
    <>
      <path d={ribbon(sp, -1, zx)} fill={P.side} stroke={P.side} {...EDGE} />
      <path d={t} fill={P.lit} stroke={P.lit} {...EDGE} />
      <path d={t} transform={`translate(${LIT.x} ${LIT.y})`} fill={top} stroke={top} {...EDGE} />
    </>
  );
}

/** `l–z` 平面の円（＝投影すると細い楕円）。 */
function ringPath(l0: number, z0: number, r: number, zx: number) {
  const pts: P2[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    pts.push(proj(l0 + Math.cos(a) * r, 0, z0 + Math.sin(a) * r, zx));
  }
  return path(pts);
}

export function Nipper({ open = 1, closing = false, domain = "place", lean = 0, width = "100%" }: {
  /** 0=閉じ 1=開き。★上下に開く。 */
  open?: number;
  /** 噛んだ瞬間だけ真に。 */
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
  const a = 5 * open + (closing ? -1.2 : 0);
  const zx = -lean * LEAN_X;

  // 腕A＝上の顎（＋下の柄）。腕B＝下の顎（＋上の柄）。z の符号だけが違う。
  const A = spin(SPINE, a);
  const B = spin(flip(SPINE), -a);
  const jawA = A.slice(0, PIVOT_I + 1), gripA = A.slice(PIVOT_I);
  const jawB = B.slice(0, PIVOT_I + 1), gripB = B.slice(PIVOT_I);
  const dieA = spin(DIE, a);

  // ★口。上の顎の底面と下の顎の天面のあいだ。紙が**水平に**入る隙間で、
  //   手前（先端）の面に暗い帯として出る。★角丸の輪郭を付けないこと ―
  //   太らせると帯ではなく黒い塊になる。
  const lip = jawA.slice(0, 2), lipB = jawB.slice(0, 2);
  const mouth = path([
    ...lip.map(([l, z, ht, hw]) => proj(l, hw, z - ht, zx)),
    ...[...lipB].reverse().map(([l, z, ht, hw]) => proj(l, hw, z + ht, zx)),
    ...lipB.map(([l, z, ht, hw]) => proj(l, -hw, z + ht, zx)),
    ...[...lip].reverse().map(([l, z, ht, hw]) => proj(l, -hw, z - ht, zx)),
  ]);
  const hw = jawA[0][3];

  return (
    <svg viewBox={`0 0 ${NIPPER_VB.w} ${NIPPER_VB.h}`} width={width} aria-hidden
      style={{ display: "block", overflow: "visible" }}>
      {/* 影。★ぼかさない。輪郭をまとめてずらした1枚の面。 */}
      <g transform={`translate(${NIPPER_ORIGIN.x + CAST.x} ${NIPPER_ORIGIN.y + CAST.y})`}>
        <path d={ribbon(A, -1, zx)} fill={P.cast} stroke={P.cast} {...EDGE} />
        <path d={ribbon(B, -1, zx)} fill={P.cast} stroke={P.cast} {...EDGE} />
      </g>

      <g transform={`translate(${NIPPER_ORIGIN.x} ${NIPPER_ORIGIN.y})`}>
        {/* ★低い方から描く。鋏は鋲で交差しているので、顎と柄で上下が入れ替わる。 */}
        {/* 下の顎。上の顎の陰に入るので天面を暗く。 */}
        <Bar sp={jawB} zx={zx} top={P.deep} />
        {/* 下の柄（＝腕A の手元側）。 */}
        <Bar sp={gripA} zx={zx} />

        {/* バネのコイル。★`l–z` 面なので上から見ると細い楕円。それが正しい。 */}
        <g fill="none" strokeWidth={WIRE} strokeLinecap="round">
          <path d={ringPath(RING.l, RING.z - 8, RING.r, zx)} stroke={P.side} />
          <path d={ringPath(RING.l, RING.z, RING.r, zx)} stroke={P.spring} />
        </g>

        {/* ★口。紙が水平に入る隙間。 */}
        <path d={mouth} fill={P.anvil} />

        {/* 上の顎。天面にダイの窓が開く。 */}
        <Bar sp={jawA} zx={zx} />
        <path d={ribbon(dieA, 1, zx)} fill={P.anvil} />
        <path d={ribbon(dieA.map(([l, z, ht, w]) => [l, z, ht, w * 0.5]), 1, zx)}
          fill={TICKET_DOMAIN_COLOR[domain]} />

        {/* 上の柄（＝腕B の手元側）。 */}
        <Bar sp={gripB} zx={zx} />

        {/* 鋲。幅方向のピンなので、側面に丸く出る。 */}
        <circle cx={proj(0, hw, 0, zx).x} cy={proj(0, hw, 0, zx).y} r={RIVET_R} fill={P.rivet} />
      </g>
    </svg>
  );
}
