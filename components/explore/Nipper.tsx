"use client";

import { NIPPER_PAINT as P, TICKET_DOMAIN_COLOR } from "@/lib/constants";
import type { ItemDomain } from "@/lib/types";

// 改札鋏。★CSS の 3D 変形は使わず、SVG で「描く」
//   （design.md 冒頭・Safari の描画崩れを5回踏んでいるため）。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。
// ★彩色は lib/constants.ts の NIPPER_PAINT（図形専用のパレット）から引く。
//
// ★★★**輪郭を画面座標で書かない**（第69巡5巡目）。
//   4巡目までは平面の輪郭に一定の厚みを足していた。幅方向に短縮が無いので
//   平面図がそのまま立面図として読まれ、「真横から見た薄い板」に見えていた
//   （ユーザー指摘「今手前に向いているのは側面です」）。
//   いまは**工具の3軸 (l, w, h) で組んでから投影する**。
//
//     l … 長さ（＋が頭）    → U（左上へ）
//     w … 幅（＋が右の腕）  → V（右へ、**やや下**）
//     h … 厚み（＋が奥）    → H（lean で横向きが変わる）
//
//   ★**V が U と直交していない**のが要。ここで幅が短縮され、天面が
//     **平行四辺形**として立ち上がる ― これだけで「上から見た絵」になる。
//
// ★★★形の正は**一体成型のステンレスの改札鋏**（実物の写真）。
//   柄は閉じず開いた V で、あいだを**環に巻いた針金のバネ**が渡る。
//   頭は2枚の板が重なり、**そのあいだの隙間（口）へ紙が入る**。
//   上の板の天面に**ダイの出っ張り**、下の板の天面に**受けのスリット**。
//
// ★★★描き方の正は **Sony Walkman のイラスト**。輪郭線を1本も引かず、
//   面の明暗だけで立体にする。影もぼかさない1枚の面。

/** 絵の枠。柄は枠の外へ抜けるので `overflow: visible`。 */
export const NIPPER_VB = { w: 620, h: 900 };
/** 工具の原点（＝鋲）。呼び出し側はここを画面のどこへ置くかで構図を決める。 */
export const NIPPER_ORIGIN = { x: 330, y: 300 };

// ---- 投影の3軸 ------------------------------------------------------
// ★2つの軸は「机を見下ろす投影 ×（机の中で工具を回した角）」から出している。
//   見下ろしの俯角で奥行きが 0.62 に縮み、工具は机の中で 22° 左へ振ってある。
//     U = (-sinθ, -0.62·cosθ)   V = (cosθ, -0.62·sinθ)   θ = 32°
//   ★V が U と直交しないのはこのため。ここで幅が短縮され、天面が
//     **平行四辺形**として立ち上がる ― これだけで「上から見た絵」になる。
/** 長さ方向。頭は左上へ向く（一人称で右手に持ち、見下ろしている）。 */
const U = { x: -0.37, y: -0.58 };
/** 幅方向。 */
const V = { x: 0.93, y: -0.23 };
/** 厚み1あたりの縦のずれ（見下ろしているので下へ）。 */
const DEPTH = 0.55;
/** 厚み1あたりの横のずれ。★一点透視。`lean` で符号が変わる。 */
const LEAN_X = 0.13;
/** 稜線の光の幅。★照明は動かないので `lean` に連動させない。 */
const LIT = { x: 5, y: 6 };
/** 地に落ちる影のずれ。★これも一定。 */
const CAST = { x: 22, y: 30 };
/** 角丸。★全部品でこの1つ。 */
const ROUND = 7;

// ---- 工具の寸法（l, w, h） -------------------------------------------
/** 腕の背骨。[l, w, 半幅]。ここから輪郭を起こす。 */
// ★2枚の板は**軸の左右に振り分ける**。重ねてしまうと「1枚の板」に見えて、
//   紙が入る隙間がどこにも読めない（実物は左右に並んでいる）。
const SPINE: number[][] = [
  [308, 28, 40],     // 先端の板
  [168, 22, 40],
  [132, 18, 27],     // 板 → 首の段
  [0, 0, 26],        // 鋲
  [-150, -50, 31],   // 柄（軸をまたいで反対側へ＝鋏の交差）
  [-340, -110, 34],
  [-436, -142, 27],
];
/** 頭の板だけの輪郭（口の闇を敷くのに使う）。 */
const HEAD: number[][] = [[313, -14], [313, 70], [162, 62], [162, -22]];
/** 上の板（手前の腕）。 */
const TOP_H = { h0: 0, h1: 20 };
/** 口（紙が入る隙間）。 */
const MOUTH_H = 64;
/** 下の板（奥の腕）。 */
const BOT_H = { h0: 64, h1: 88 };
/** ダイの出っ張り（上の板の天面に載る）。 */
const DIE: number[][] = [[290, -16], [290, 26], [232, 26], [232, -16]];
/** 受けのスリット（下の板の天面に開いた窓）。 */
const SLOT: number[][] = [[296, -12], [296, 30], [214, 30], [214, -12]];
/** 鋲。 */
const RIVET_R = 30;
/** バネの環と、柄への引き込み。 */
const RING = { l: -252, w: -6, r: 50, h: 50 };
const WIRE = 12;

// ---- 投影と作図 ------------------------------------------------------
type P2 = { x: number; y: number };

const proj = (l: number, w: number, h: number, hx: number): P2 => ({
  x: l * U.x + w * V.x + h * hx,
  y: l * U.y + w * V.y + h * DEPTH,
});

const path = (pts: P2[]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";

/** (l,w) の点列を、高さ h の面として投影する。 */
const face = (pts: number[][], h: number, hx: number) =>
  path(pts.map(([l, w]) => proj(l, w, h, hx)));

/** (l,w) 平面の中で鋲まわりに回す（鋲の軸は h 方向＝実物と同じ）。 */
function spin(pts: number[][], deg: number): number[][] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([l, w]) => [l * c - w * s, l * s + w * c]);
}

/** 背骨から腕の輪郭を起こす。左右は `sx` で幅の符号を反転させる。 */
function armOutline(sx: number): number[][] {
  const mid = SPINE.map(([l, w, r]) => [l, w * sx, r] as [number, number, number]);
  const left: number[][] = [];
  const right: number[][] = [];
  mid.forEach(([l, w, r], i) => {
    const a = mid[Math.max(0, i - 1)];
    const b = mid[Math.min(mid.length - 1, i + 1)];
    const dl = b[0] - a[0], dw = b[1] - a[1];
    const n = Math.hypot(dl, dw) || 1;
    // (l,w) 平面での法線
    const nl = -dw / n, nw = dl / n;
    left.push([l + nl * r, w + nw * r]);
    right.push([l - nl * r, w - nw * r]);
  });
  return [...left, ...right.reverse()];
}

const ARM_R = armOutline(1);    // 顎が +w（奥の腕）
const ARM_L = armOutline(-1);   // 顎が -w（手前の腕）

const EDGE = {
  strokeWidth: ROUND * 2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const,
};

/**
 * 柱。**輪郭線を1本も引かず**、3枚の重ねで立体にする。
 *   1枚目 … 底面(h1)を `side` で置く ＝ 側壁
 *   2枚目 … 天面(h0)を `lit` で置く   ＝ 稜線の光
 *   3枚目 … 天面を `LIT` だけずらして `face` で置く ＝ 天面
 * 3枚目が2枚目を覆い残すぶんが左上の三日月になり、面取りの光に見える。
 */
function Prism({ pts, h0, h1, hx, top = P.face }: {
  pts: number[][]; h0: number; h1: number; hx: number; top?: string;
}) {
  const t = face(pts, h0, hx);
  return (
    <>
      <path d={face(pts, h1, hx)} fill={P.side} stroke={P.side} {...EDGE} />
      <path d={t} fill={P.lit} stroke={P.lit} {...EDGE} />
      <path d={t} transform={`translate(${LIT.x} ${LIT.y})`} fill={top} stroke={top} {...EDGE} />
    </>
  );
}

/** (l,w) 平面の円（＝投影すると楕円）。 */
function ringPath(l0: number, w0: number, r: number, h: number, hx: number) {
  const pts: P2[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    pts.push(proj(l0 + Math.cos(a) * r, w0 + Math.sin(a) * r, h, hx));
  }
  return path(pts);
}

export function Nipper({ open = 1, closing = false, domain = "place", lean = 0, width = "100%" }: {
  /** 0=閉じ 1=開き。2本の腕が鋲まわりに開く。 */
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
  const a = 6 * open + (closing ? -1.5 : 0);
  const hx = -lean * LEAN_X;
  const armL = spin(ARM_L, -a);
  const armR = spin(ARM_R, a);
  const headL = spin(HEAD.map(([l, w]) => [l, -w]), -a);
  const dieL = spin(DIE, -a);
  const slotR = spin(SLOT, a);
  const frame = `translate(${NIPPER_ORIGIN.x} ${NIPPER_ORIGIN.y})`;

  return (
    <svg viewBox={`0 0 ${NIPPER_VB.w} ${NIPPER_VB.h}`} width={width} aria-hidden
      style={{ display: "block", overflow: "visible" }}>
      {/* 影。★ぼかさない。輪郭をまとめてずらした1枚の面。 */}
      <g transform={`translate(${CAST.x} ${CAST.y}) ${frame}`}>
        <path d={face(armR, BOT_H.h1, hx)} fill={P.cast} stroke={P.cast} {...EDGE} />
        <path d={face(armL, BOT_H.h1, hx)} fill={P.cast} stroke={P.cast} {...EDGE} />
      </g>

      <g transform={frame}>
        {/* 奥の腕（下の板）。天面に受けのスリットが開く。 */}
        <Prism pts={armR} h0={BOT_H.h0} h1={BOT_H.h1} hx={hx} />
        <path d={face(slotR, BOT_H.h0, hx)} fill={P.anvil} />

        {/* 針金のバネ。★環が実物のいちばん目立つ特徴。柄のあいだへ沈める。 */}
        <g fill="none" strokeWidth={WIRE} strokeLinecap="round">
          <path d={ringPath(RING.l, RING.w, RING.r, RING.h + 10, hx)} stroke={P.side} />
          <path d={ringPath(RING.l, RING.w, RING.r, RING.h, hx)} stroke={P.spring} />
          {/* 柄への引き込み。★短い突起にとどめる。長く引くと画面を横切る
              ただの線に見える。 */}
          {[-1, 1].map((k) => {
            const a = proj(RING.l + 6, RING.w + k * RING.r, RING.h, hx);
            const b = proj(RING.l + 34, RING.w + k * 86, RING.h, hx);
            return <path key={k} d={`M${a.x} ${a.y} L${b.x} ${b.y}`} stroke={P.spring} />;
          })}
        </g>

        {/* ★口（紙が入る隙間）。上の板の下に闇を敷いておくと、板の手前の面に
            暗い帯として現れる ― これが「口が開いている」ことの唯一の手掛かり。 */}
        <path d={face(headL, MOUTH_H, hx)} fill={P.anvil} stroke={P.anvil} {...EDGE} />

        {/* 手前の腕（上の板）。天面にダイの出っ張りが載る。 */}
        <Prism pts={armL} h0={TOP_H.h0} h1={TOP_H.h1} hx={hx} />
        <Prism pts={dieL} h0={-16} h1={TOP_H.h0} hx={hx} />
        <path d={face(dieL.map(([l, w]) => [l * 0.955, w * 0.42]), -16, hx)}
          fill={TICKET_DOMAIN_COLOR[domain]} />

        {/* 鋲。 */}
        <path d={ringPath(0, 0, RIVET_R, TOP_H.h1 + 6, hx)} fill={P.side} />
        <path d={ringPath(0, 0, RIVET_R, -8, hx)} fill={P.rivet} />
      </g>
    </svg>
  );
}
