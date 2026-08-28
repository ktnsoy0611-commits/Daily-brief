"use client";

import { useId } from "react";

import { NIPPER_PAINT as P, WHITE } from "@/lib/constants";

// 改札鋏。★CSS の 3D 変形は使わず、SVG で「描く」
//   （design.md 冒頭・Safari の描画崩れを5回踏んでいるため）。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。
// ★彩色は lib/constants.ts の NIPPER_PAINT（図形専用のパレット）から引く。
//
// ★★★投影の仕組み（7巡目）は**残す**。鋏は掴んで画面内を自由に動かすので、
//   位置に応じてパースが変わらないとおかしくなる。
//
//     base(l, w) = l·L + w·W       L ⊥ W の単位ベクトル（机の面は短縮しない）
//     proj(l, w, z) = base(l, w) + z · away
//     away = (鋏の位置 − 画面の中心) ÷ カメラの高さ
//
//   消失点は画面の中心。**高いところほど中心から外へ逃げる**。
//
// ★★★8巡目に直したのは**形と彩色**（投影ではなかった）。
//   目標画像と比べた差は3つ:
//   1. 手前の腕が**断面の丸い太い鍛造の塊**。平らな板ではない。
//      → **幅方向を帯に割り、階調を段々に変える**（フラットベクターの定石）。
//   2. 奥の腕は**左に細い帯**として覗くだけ。手前と同じ太さで並べない。
//   3. 頭は**段と矩形の欠き**を持つ。のっぺりした箱ではない。

/** 絵の枠。柄は枠の外へ抜けるので `overflow: visible`。 */
export const NIPPER_VB = { w: 480, h: 900 };
/** 工具の原点（＝鋲）。呼び出し側はここを画面のどこへ置くかで構図を決める。 */
export const NIPPER_ORIGIN = { x: 240, y: 320 };
/** 先端の、原点からのずれ。呼び出し側が口を券の縁へ合わせるのに使う。 */
export const NIPPER_NOSE = { x: -42, y: -297 };

// ---- 投影（7巡目のまま） ---------------------------------------------
/** 机の中で工具を左へ振った角。★目標画像に合わせてほぼ垂直に立てる。 */
const TH = (8 * Math.PI) / 180;
const L = { x: -Math.sin(TH), y: -Math.cos(TH) };
const W = { x: Math.cos(TH), y: -Math.sin(TH) };
/** 稜線を締める角丸。★全部品でこの1つ。 */
const ROUND = 5;
/** 地に落ちる影のずれ。★照明の向きなので位置によらず一定。 */
const CAST = { x: 18, y: 26 };

// ---- 形 --------------------------------------------------------------
// [l, z, 半分の厚み, 半分の幅, 幅の中心のずれ]。
// ★`幅の中心のずれ` は**片側だけ**輪郭を刻むために要る（頭の右の縁の欠き）。
// ★幅は**長さの 1/4.5**（目標画像を測った比）。細くすると「ペン」に見える。
const SPINE: number[][] = [
  // ★頭は**平行な四角い塊**。幅を変えない。
  //   段を背骨に刻むと、帯が1本ずつ食い違って**階段状に崩れる**（8巡目に実測）。
  //   段は下の `NOTCH` として天面に置く。
  [300, 30, 17, 83, 0],
  [190, 24, 18, 83, 0],
  [174, 23, 18, 60, 0],     // ★肩。ここで急に絞る（頭を塊として立たせる）
  [118, 18, 19, 53, 0],
  [0, 0, 21, 51, 0],        // 鋲。いちばん細いくびれ
  [-120, -14, 22, 67, 0],
  [-262, -30, 23, 86, 0],   // 柄がゆるくふくらむ
  [-364, -40, 23, 83, 0],
  [-432, -48, 20, 65, 0],
  [-464, -52, 14, 36, 0],   // 先は丸く終わる
  [-474, -54, 8, 14, 0],
];
/**
 * 奥の腕。★手前より**細く**、**段を持たない**。
 * 段まで写すと2つの頭の刻みが重なって、頭が潰れて読めなくなる（8巡目に実測）。
 * `z` は反転してある（手前の腕と逆側へ開く）。
 */
const FAR_SPINE: number[][] = [
  [300, -30, 17, 60, 0],
  [190, -24, 18, 60, 0],
  [176, -23, 18, 44, 0],
  [0, 0, 21, 38, 0],
  [-262, 30, 23, 62, 0],
  [-400, 44, 22, 56, 0],
  [-462, 52, 14, 26, 0],
  [-472, 54, 8, 10, 0],
];
/** 頭の右の縁の刻み。★天面に置く（輪郭に刻むと帯が階段状に崩れる）。 */
const NOTCH: number[][] = [[264, 28, 17, 21, 57], [216, 26, 17, 21, 57]];
/** バネの輪。`l–z` 面にあるので、この画角では細い楕円になって腕のあいだに覗く。 */
const RING = { l: -190, z: 0, r: 58 };
const WIRE = 8;

/** 天面を割る帯。★丸い断面をフラットベクターで表す定石。境界は硬いまま。 */
const BANDS: { a: number; b: number; tone: string }[] = [
  { a: 0, b: 0.10, tone: P.side },
  { a: 0.10, b: 0.22, tone: P.lit },
  { a: 0.22, b: 0.62, tone: P.face },
  { a: 0.62, b: 0.88, tone: P.side },
  { a: 0.88, b: 1, tone: P.deep },
];

// ---- 作図 ------------------------------------------------------------
type P2 = { x: number; y: number };
type Away = { x: number; y: number };

const proj = (l: number, w: number, z: number, a: Away): P2 => ({
  x: l * L.x + w * W.x + z * a.x,
  y: l * L.y + w * W.y + z * a.y,
});

const path = (pts: P2[]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";

/**
 * 背骨を水平な面として投影する。
 * `s` は厚みの符号（+1=天面 / -1=底面）。`a0`〜`a1` は幅のどこを切り出すか（0〜1）。
 */
const ribbon = (sp: number[][], s: number, aw: Away, a0 = 0, a1 = 1) => {
  const at = (f: number) => ([l, z, ht, hw, wc]: number[]) =>
    proj(l, wc - hw + 2 * hw * f, z + s * ht, aw);
  return path([...sp.map(at(a1)), ...[...sp].reverse().map(at(a0))]);
};

/** `z` の profile をまとめて拡げ縮めする（＝貝のように開閉する）。 */
const openBy = (sp: number[][], k: number) =>
  sp.map(([l, z, ht, hw, wc]) => [l, z * k, ht, hw, wc]);

const EDGE = {
  strokeWidth: ROUND * 2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const,
};

/**
 * 腕。**輪郭線を1本も引かず**、面の明暗だけで立体にする。
 *   1枚目 … 底面を `side` で置く。天面より消失点側へ出るので、はみ出しが**側壁**
 *   2枚目 … 天面を**帯に割って**置く ＝ 丸い断面
 * ★帯は天面にだけ敷く（側壁は一色でよい）。マスクで切り抜くので、
 *   角丸の縁まで帯がきれいに届く。
 */
function Arm({ sp, away, id, dim = false }: {
  sp: number[][]; away: Away; id: string; dim?: boolean;
}) {
  const top = ribbon(sp, 1, away);
  return (
    <>
      <path d={ribbon(sp, -1, away)} fill={P.side} stroke={P.side} {...EDGE} />
      <mask id={id}>
        {/* ★マスクの白は「色」ではなく「不透明」の意味（design.md §7）。 */}
        <path d={top} fill={WHITE} stroke={WHITE} {...EDGE} />
      </mask>
      <g mask={`url(#${id})`} opacity={dim ? 0.72 : 1}>
        {BANDS.map((b) => (
          <path key={b.a} d={ribbon(sp, 1, away, b.a, b.b)} fill={b.tone} />
        ))}
      </g>
    </>
  );
}

/** `l–z` 平面の円。この画角では細い楕円になる。 */
function ringPath(a: Away) {
  const pts: P2[] = [];
  for (let i = 0; i < 36; i++) {
    const t = (i / 36) * Math.PI * 2;
    pts.push(proj(RING.l + Math.cos(t) * RING.r, 0, RING.z + Math.sin(t) * RING.r, a));
  }
  return path(pts);
}

export function Nipper({ open = 1, closing = false, away = { x: 0.28, y: 0.58 }, width = "100%" }: {
  /** 0=閉じ 1=開き。★貝のように開く（この画角では数 px の差）。 */
  open?: number;
  /** 噛んだ瞬間だけ真に。 */
  closing?: boolean;
  /**
   * **(鋏の位置 − 画面の中心) ÷ カメラの高さ**。高さ1あたりの画面上のずれ。
   * ★消失点は画面の中心。掴んで動かすと、これが変わってパースが付いてくる。
   */
  away?: Away;
  width?: number | string;
}) {
  const k = 0.35 + 0.65 * open - (closing ? 0.12 : 0);
  const id = useId();
  const near = openBy(SPINE, k);
  const far = openBy(FAR_SPINE, k);

  return (
    <svg viewBox={`0 0 ${NIPPER_VB.w} ${NIPPER_VB.h}`} width={width} aria-hidden
      style={{ display: "block", overflow: "visible" }}>
      {/* 影。★ぼかさない。輪郭をまとめてずらした1枚の面。 */}
      <g transform={`translate(${NIPPER_ORIGIN.x + CAST.x} ${NIPPER_ORIGIN.y + CAST.y})`}>
        <path d={ribbon(near, -1, away)} fill={P.cast} stroke={P.cast} {...EDGE} />
        <path d={ribbon(far, -1, away)} fill={P.cast} stroke={P.cast} {...EDGE} />
      </g>

      <g transform={`translate(${NIPPER_ORIGIN.x} ${NIPPER_ORIGIN.y})`}>
        {/* 奥の腕。手前の陰に入るので一段暗い。 */}
        <Arm sp={far} away={away} id={`np-far-${id}`} dim />

        {/* バネの輪。腕のあいだに覗く。 */}
        <path d={ringPath(away)} fill="none" stroke={P.spring} strokeWidth={WIRE} />

        {/* 手前の腕。ここが工具の主役。 */}
        <Arm sp={near} away={away} id={`np-near-${id}`} />
        {/* 頭の刻み。 */}
        <path d={ribbon(openBy(NOTCH, k), 1, away)} fill={P.deep} />
      </g>
    </svg>
  );
}
