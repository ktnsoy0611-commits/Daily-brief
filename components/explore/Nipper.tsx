"use client";

import { NIPPER_PAINT as P } from "@/lib/constants";

// 改札鋏。★CSS の 3D 変形は使わず、SVG で「描く」
//   （design.md 冒頭・Safari の描画崩れを5回踏んでいるため）。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。
// ★彩色は lib/constants.ts の NIPPER_PAINT（図形専用のパレット）から引く。
//
// ★★★**券も鋏も同じ机の上にあり、それを真上から見ている**（第69巡7巡目に確定）。
//   だから見えるのは券の表面と**鋏の上面**だけで、
//   **真上から見た鋏はほとんど長方形**になる。
//   6巡目まではずっと「側面の絵に厚みを足したもの」を作っていた。
//
//   誤りは3つあった:
//   1. **平面に短縮をかけていた。** 真上から見れば机の面に短縮は無い。
//      天面は**回転しただけの長方形**でなければならない（`L`⊥`W`）。
//   2. **高さの投影が大きすぎた。** 真上からなら高さはほとんど潰れる。
//      高さは「消失点から外へ逃げる量」でしかない。
//   3. **ダイの窓を天面に開けていた。** ★穴を開ける部分は上から**絶対に
//      見えない**。それを見せようとしていたのが歪みを固定していた。
//
// ★★消失点は**画面の中心**。**高いところほど中心から外へ逃げる**ので、
//   右下に置いた鋏は天面が右下へずれ、その分だけ**左と奥の側面**が現れる。
//   その細い帯に、初めて参考写真の断面（上下の顎・鋲・バネ）が見える。
//
// ★有彩色は使わない。画面の有彩色は**券の紙だけ**（Vitsœ の規律）。

/** 絵の枠。柄は枠の外へ抜けるので `overflow: visible`。 */
export const NIPPER_VB = { w: 620, h: 760 };
/** 工具の原点（＝鋲）。呼び出し側はここを画面のどこへ置くかで構図を決める。 */
export const NIPPER_ORIGIN = { x: 250, y: 300 };
/** 先端の、原点からのずれ。呼び出し側が口を券の縁へ合わせるのに使う。 */
export const NIPPER_NOSE = { x: -179, y: -265 };

// ---- 投影 -----------------------------------------------------------
// ★`L` と `W` は**直交する単位ベクトル**。つまり机の面はただの回転で、
//   短縮しない。だから天面は**長方形のまま**出る。
const TH = (34 * Math.PI) / 180;   // 机の中で工具を左へ振った角
const L = { x: -Math.sin(TH), y: -Math.cos(TH) };
const W = { x: Math.cos(TH), y: -Math.sin(TH) };
/** 稜線を締める角丸。★全部品でこの1つ。 */
const ROUND = 5;
/** 地に落ちる影のずれ。★照明の向きなので位置によらず一定。 */
const CAST = { x: 20, y: 28 };

// ---- 工具の寸法 -----------------------------------------------------
// [l, z, 半分の厚み, 半分の幅]。`l–z` は参考写真の断面、`半分の幅` は平面の輪郭。
// ★真上から見ると側面はほとんど見えないので、**平面の輪郭だけが工具の顔**。
//   先端は四角く幅広（ホチキス）、首は細く、柄は太くごつい（ペンチ）。
// ★段は**同じ l に2点**置いて急に変える。なだらかに絞ると鍛造の工具ではなく
//   「骨」や「めん棒」に見える（7巡目に実際にそう見えた）。
const SPINE: number[][] = [
  [324, 27, 17, 47],    // 先端。四角く、幅は一定
  [214, 22, 17, 47],
  [210, 22, 18, 33],    // ★段（顎 → 首）
  [0, 0, 20, 31],       // 鋲。いちばん細い
  [-128, -20, 21, 33],
  [-134, -21, 21, 45],  // ★段（首 → 柄）
  [-370, -58, 22, 46],  // 柄。太くごつい
  [-440, -70, 18, 43],
  [-458, -73, 12, 30],  // 先だけ丸い
];
/** 鋲で分ける（顎＝先端側 / 柄＝手元側）。低い方から描くために要る。 */
const PIVOT_I = 3;
/** バネのコイル。`l–z` 面にあるので、真上からは**細い横線**にしかならない。 */
const RING = { l: -250, z: 0, r: 62 };
const WIRE = 7;
/** 鋲の頭。側面の帯に小さく出るだけ。 */
const RIVET_R = 11;

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
 * 背骨を水平な面として投影する。`s` は厚みの符号（+1=天面 / -1=底面）。
 * `k` と `shift` は天面に走る反射の帯を切り出すのに使う。
 */
const ribbon = (sp: number[][], s: number, a: Away, k = 1, shift = 0) => path([
  ...sp.map(([l, z, ht, hw]) => proj(l, shift * hw + hw * k, z + s * ht, a)),
  ...[...sp].reverse().map(([l, z, ht, hw]) => proj(l, shift * hw - hw * k, z + s * ht, a)),
]);

/** `l–z` 平面の中で鋲まわりに回す（鋲の軸は幅方向＝実物と同じ）。 */
function spin(sp: number[][], deg: number): number[][] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return sp.map(([l, z, ht, hw]) => [l * c - z * s, l * s + z * c, ht, hw]);
}

/** z を反転して、もう一方の腕にする。 */
const flip = (sp: number[][]) => sp.map(([l, z, ht, hw]) => [l, -z, ht, hw]);

const EDGE = {
  strokeWidth: ROUND * 2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const,
};

/**
 * 棒。**輪郭線を1本も引かず**、面の明暗だけで立体にする。
 *   1枚目 … 底面を `side` で置く。天面より消失点側へ出るので、そのはみ出しが**側壁**
 *   2枚目 … 天面を `face` で置く
 *   3枚目 … 天面に細い**反射の帯**（`shine` のときだけ）
 * ★真上から見ているので側壁は**細い帯**にしかならない。それが正しい。
 *   そのぶん天面が平板に見えないよう、鍛造バーの反射を1本だけ入れる。
 */
function Bar({ sp, away, top = P.face, shine = false }: {
  sp: number[][]; away: Away; top?: string; shine?: boolean;
}) {
  return (
    <>
      <path d={ribbon(sp, -1, away)} fill={P.side} stroke={P.side} {...EDGE} />
      <path d={ribbon(sp, 1, away)} fill={top} stroke={top} {...EDGE} />
      {shine && <path d={ribbon(sp, 1, away, 0.11, 0.42)} fill={P.lit} />}
    </>
  );
}

/** `l–z` 平面の円。真上から見るので細い横線になる。 */
function ringPath(a: Away) {
  const pts: P2[] = [];
  for (let i = 0; i < 32; i++) {
    const t = (i / 32) * Math.PI * 2;
    pts.push(proj(RING.l + Math.cos(t) * RING.r, 0, RING.z + Math.sin(t) * RING.r, a));
  }
  return path(pts);
}

export function Nipper({ open = 1, closing = false, away = { x: 0.15, y: 0.26 }, width = "100%" }: {
  /** 0=閉じ 1=開き。★上下に開く（真上からはほとんど分からない）。 */
  open?: number;
  /** 噛んだ瞬間だけ真に。 */
  closing?: boolean;
  /**
   * **(鋏の位置 − 画面の中心) ÷ カメラの高さ**。高さ1あたりの画面上のずれ。
   * ★消失点は画面の中心。右下に置くほど**左と奥の側面**が見える。
   */
  away?: Away;
  width?: number | string;
}) {
  const a = 5 * open + (closing ? -1.2 : 0);

  // 腕A＝上の顎（＋下の柄）。腕B＝下の顎（＋上の柄）。z の符号だけが違う。
  const A = spin(SPINE, a);
  const B = spin(flip(SPINE), -a);
  const jawA = A.slice(0, PIVOT_I + 1), gripA = A.slice(PIVOT_I);
  const jawB = B.slice(0, PIVOT_I + 1), gripB = B.slice(PIVOT_I);

  // ★口。上の顎の底面と下の顎の天面のあいだ。真上からなので**細い暗線**に
  //   しかならない ― それが正しい。角丸の輪郭は付けない（太らせない）。
  const lip = jawA.slice(0, 2), lipB = jawB.slice(0, 2);
  const mouth = path([
    ...lip.map(([l, z, ht, hw]) => proj(l, hw, z - ht, away)),
    ...[...lipB].reverse().map(([l, z, ht, hw]) => proj(l, hw, z + ht, away)),
    ...lipB.map(([l, z, ht, hw]) => proj(l, -hw, z + ht, away)),
    ...[...lip].reverse().map(([l, z, ht, hw]) => proj(l, -hw, z - ht, away)),
  ]);
  const pin = proj(0, SPINE[PIVOT_I][3], 0, away);

  return (
    <svg viewBox={`0 0 ${NIPPER_VB.w} ${NIPPER_VB.h}`} width={width} aria-hidden
      style={{ display: "block", overflow: "visible" }}>
      {/* 影。★ぼかさない。輪郭をまとめてずらした1枚の面。 */}
      <g transform={`translate(${NIPPER_ORIGIN.x + CAST.x} ${NIPPER_ORIGIN.y + CAST.y})`}>
        <path d={ribbon(A, -1, away)} fill={P.cast} stroke={P.cast} {...EDGE} />
        <path d={ribbon(B, -1, away)} fill={P.cast} stroke={P.cast} {...EDGE} />
      </g>

      <g transform={`translate(${NIPPER_ORIGIN.x} ${NIPPER_ORIGIN.y})`}>
        {/* ★低い方から描く。鋏は鋲で交差しているので、顎と柄で上下が入れ替わる。 */}
        {/* 下の顎。上の顎の陰に入るので天面を暗く。 */}
        <Bar sp={jawB} away={away} top={P.deep} />
        {/* 下の柄。 */}
        <Bar sp={gripA} away={away} />

        {/* バネのコイル。★真上からは細い線。柄のあいだの帯にだけ覗く。 */}
        <path d={ringPath(away)} fill="none" stroke={P.spring} strokeWidth={WIRE} />

        {/* 口。 */}
        <path d={mouth} fill={P.anvil} />

        {/* 上の顎と上の柄。天面に反射の帯が走る。 */}
        <Bar sp={jawA} away={away} shine />
        <Bar sp={gripB} away={away} shine />

        {/* 鋲。幅方向のピンなので、側面の帯に小さく出るだけ。 */}
        <circle cx={pin.x} cy={pin.y} r={RIVET_R} fill={P.rivet} />
      </g>
    </svg>
  );
}
