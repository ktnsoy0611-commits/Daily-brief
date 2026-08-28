"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NIPPER_PAINT as P } from "@/lib/constants";
import {
  spring, springTo, settled, K_TRAVEL, D_TRAVEL, K_SETTLE, D_SETTLE,
} from "@/lib/spring";
import {
  drawOrder, extrude, invert, proj, slab, toPath, tube,
  type Face, type P2, type Station, type V3,
} from "@/lib/nipperSolid";

// 改札鋏。★CSS の 3D 変形は使わず、SVG で「描く」
//   （design.md 冒頭・Safari の描画崩れを5回踏んでいるため）。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。
//
// ★★★10巡目に**機構ごと**作り直した。9巡目まではシザー（中央の鋲で腕が X に
//   交差する）だったが、参考の道具は**一つ穴パンチ型**で、
//   **支点は頭の中にあり、腕は下へほぼ平行に垂れる**。輪郭は細長い一本の柱。
//   ・手前（右）＝ **動く分厚い柄**（握って押すほう）… 明るい
//   ・奥（左）  ＝ **固定の薄い本体**（受け＝アンビルと**ダイのスリット**を持つ）
//                 … 手前の陰でひと段暗い
//   ・頭には**矩形の欠き**と**ダイのスリット**がある（この画角では見えるのが正しい）
//   立体の組み方と彩色は `lib/nipperSolid.ts`。ここは**寸法と群と動き**だけ。

/** 絵の枠。影は左へ長く伸びて枠を出るので `overflow: visible`。 */
export const NIPPER_VB = { w: 480, h: 900 };
/** 工具の原点（＝頭の支点）。呼び出し側はここを画面のどこへ置くかで構図を決める。 */
export const NIPPER_ORIGIN = { x: 330, y: 130 };
/** 口（＝ダイのスリット）の、原点からのずれ。券の縁へ合わせるのに使う。 */
export const NIPPER_NOSE = { x: -45, y: 114 };

// ---- 寸法 --------------------------------------------------------------
// 局所座標は **支点が原点／+y が上／+x が右／+z が手前**。全長 700・最大幅 167
// （＝縦横比 4.2 : 1）。参考画像を実測した比。★細さがこの道具の顔。
/** 腕の z のずらし。手前の柄と奥の梃子は**厚みの方向に重なる**（交差しない）。 */
const Z_NEAR = 20;
const Z_FAR = -16;
/**
 * 閉じ切る角（度）。★小さくてよい ― 参考画像の姿勢は**すでにほぼ閉じている**
 * （バネで少し開いているだけ）。大きくすると手前の柄が奥の本体を飲み込む。
 */
const THETA = 2.4;

/** 可動部の柄（手前・右）。`[y, 半幅, 半分の厚み, x の中心]`。★分厚い涙型。 */
const GRIP: Station[] = [
  // ★**左の縁はまっすぐ**（柄は −12、頭は −18）。ふくらむのは右だけ。両側に
  //   ふくらませると道具ではなく紡錘に見える。段は**右にだけ**付く。
  // ★★**厚い塊であること。** 薄くすると面が減って板に見える（11巡目に実際に
  //   そうなり「形が悪くなった」と指摘された）。参考の道具は角を落とした鍛造の塊。
  [-700, 16, 10, 12],    // 先。★幅を残したまま丸く終わる（尖らせない）
  [-682, 27, 14, 17],
  [-650, 35, 18, 23],
  [-560, 43, 22, 31],
  [-452, 51, 26, 39],    // 腹。いちばん太い（★全長の 6 割ほど下。中ほどだと紡錘に見える）
  [-380, 49, 25, 37],
  [-280, 47, 25, 35],
  [-222, 43, 24, 31],
  [-220, 40, 24, 22],    // ★頭。柄より細く、左へ少し張り出す
  [-26, 40, 24, 22],
  [-24, 32, 21, 14],     // ★右上の矩形の欠き。**浅い段**（塔にしない）
  [14, 32, 19, 14],      // 天。★奥の受けより高い（透視で手前ほど沈むため）
];
/**
 * 固定部の本体（奥・左）。★薄い平板だが**紙にはしない**。
 * ★左の縁はまっすぐ（−68）。★★右の縁は手前の柄の左の縁より**内側まで伸ばす**―
 *   幾何で突き合わせるだけだと、一点透視のずれ（`z·away`）で**隙間が口を開け**、
 *   2枚の板が離れて見える（11巡目に実測）。はみ出したぶんは手前の柄が隠す。
 * ★天は手前の頭より**44 低い**。同じ高さにすると、透視で手前が沈んで逆に見える。
 */
const LEVER: Station[] = [
  [-627, 22, 8, -46],
  [-600, 28, 10, -40],
  [-500, 32, 11, -36],
  [-400, 34, 12, -34],
  [-300, 34, 12, -34],
  [-222, 33, 13, -35],
  [-220, 31, 14, -37],   // ★頭（受けの塊）
  [-40, 31, 14, -37],
  [-30, 27, 12, -41],    // 天
];
/** ダイのスリット。★受けの面に開いた縦の溝。`invert` で凹みにする。 */
const SLOT = { x0: -58, x1: -40, y0: -178, y1: -60, z0: Z_FAR - 10, z1: Z_FAR + 15 };

/** バネ。針金のコイル（輪が2つ）＋2本の脚。★腕のあいだに覗く。 */
const COIL = { r: 4.5, ring: [{ x: -24, y: -427, r: 26 }, { x: -20, y: -529, r: 24 }], z: 2 };
/** 押し切ったときの縮み。輪の中心を支点に縦へ詰まる。 */
const SQUEEZE = 0.22;

/** 陰の手当て。★面ごとに手で塗らない ― **群にまとめて1度だけ**段を下げる。 */
const DIM_FAR = -1;    // 奥の本体は手前の柄の陰に入る（スリットは `P.gap` で塗る）

/** 落ち影。★立ち姿の複製ではなく、**床へ倒れ込ませる**。 */
const GROUND = 700;                  // 接地（手前の柄の先の高さ）
const SUN = { x: 0.82, y: 0.12 };     // 高さ1あたり、左へ／わずかに手前へ

// ---- 立体 --------------------------------------------------------------
/** コイル。1周を8つの直線で折る（曲線は持たない）。 */
function coilPath(): V3[] {
  const pts: V3[] = [{ x: -34, y: -330, z: COIL.z }];
  COIL.ring.forEach((c, k) => {
    for (let i = 0; i <= 8; i++) {
      const t = (i / 8) * Math.PI * 2 - Math.PI / 2;
      pts.push({ x: c.x + Math.cos(t) * c.r, y: c.y + Math.sin(t) * c.r, z: COIL.z + k * 3 });
    }
  });
  pts.push({ x: 14, y: -556, z: COIL.z + 12 });
  return pts;
}

/** ある高さでの、駅の表の左右の縁（範囲の外は `null`）。 */
function edgesAt(st: Station[], y: number): [number, number] | null {
  if (y < st[0][0] || y > st[st.length - 1][0]) return null;
  for (let i = 0; i + 1 < st.length; i++) {
    const [y0, hw0, , cx0] = st[i], [y1, hw1, , cx1] = st[i + 1];
    if (y > y1) continue;
    const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
    const hw = hw0 + (hw1 - hw0) * t, cx = cx0 + (cx1 - cx0) * t;
    return [cx - hw, cx + hw];
  }
  return null;
}

/** 2つの部品を**合併した輪郭**（影のため）。★道具は1つの塊として影を落とす。 */
function hull(a: P2): P2[] {
  const lo = Math.min(GRIP[0][0], LEVER[0][0]);
  const hi = Math.max(GRIP[GRIP.length - 1][0], LEVER[LEVER.length - 1][0]);
  const ys: number[] = [];
  for (let i = 0; i <= 24; i++) ys.push(lo + ((hi - lo) * i) / 24);
  const left: P2[] = [], right: P2[] = [];
  for (const y of ys) {
    const g = edgesAt(GRIP, y), l = edgesAt(LEVER, y);
    if (!g && !l) continue;
    const lo = Math.min(g ? g[0] : Infinity, l ? l[0] : Infinity);
    const hi = Math.max(g ? g[1] : -Infinity, l ? l[1] : -Infinity);
    left.push(proj({ x: lo, y, z: Z_FAR }, a));
    right.push(proj({ x: hi, y, z: Z_NEAR }, a));
  }
  return [...right, ...left.reverse()];
}

function Solid({ faces, away, dim = 0, flat }: {
  faces: Face[]; away: P2; dim?: number;
  /** ★凹み専用。光が届かないので面の向きで塗らず、1色で塗る。 */
  flat?: string;
}) {
  const tone = (t: number) => flat ?? P.ramp[Math.max(0, Math.min(P.ramp.length - 1, t + dim))];
  return (
    <>
      {drawOrder(faces, away).map((f, i) => (
        // ★面と面のあいだに地が透けないよう、同じ色で髪の毛ほど太らせる。
        <path key={i} d={f.d} fill={tone(f.tone)} stroke={tone(f.tone)} strokeWidth={0.6} />
      ))}
    </>
  );
}

/** 可動部の姿勢。★頭の支点（0,0）を軸に回すだけ。 */
const swing = (v: number) => `rotate(${(v * THETA).toFixed(3)} 0 0)`;
/** バネの縮み。輪の中心（`c`）を支点に縦へ詰める。 */
const squeeze = (v: number, c: P2) =>
  `translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`
  + ` scale(1 ${(1 - v * SQUEEZE).toFixed(4)})`
  + ` translate(${(-c.x).toFixed(1)} ${(-c.y).toFixed(1)})`;

export function Nipper({ open = 1, closing = false, away = { x: 0.28, y: 0.58 }, width = "100%" }: {
  /** 0=閉じ 1=開き。 */
  open?: number;
  /** 噛んだ瞬間だけ真に。 */
  closing?: boolean;
  /**
   * **(鋏の位置 − 画面の中心) ÷ カメラの高さ**。高さ1あたりの画面上のずれ。
   * ★消失点は画面の中心。掴んで動かすと、これが変わってパースが付いてくる。
   */
  away?: P2;
  width?: number | string;
}) {
  const [pressed, setPressed] = useState(false);
  const want = pressed || closing ? 1 : 1 - open;

  const solids = useMemo(() => ({
    grip: extrude(GRIP, Z_NEAR),
    lever: extrude(LEVER, Z_FAR),
    slot: invert(slab(SLOT.x0, SLOT.x1, SLOT.y0, SLOT.y1, SLOT.z0, SLOT.z1)),
    coil: tube(coilPath(), COIL.r),
  }), []);

  /** バネを縮める支点＝上の輪の中心。 */
  const hinge = { x: COIL.ring[0].x, y: -COIL.ring[0].y };
  const hingeRef = useRef(hinge);
  hingeRef.current = hinge;

  const leverRef = useRef<SVGGElement>(null);
  const coilRef = useRef<SVGGElement>(null);
  const s = useRef(spring(want));

  const paint = useCallback((v: number) => {
    leverRef.current?.setAttribute("transform", swing(v));
    coilRef.current?.setAttribute("transform", squeeze(v, hingeRef.current));
  }, []);

  // ★動きは `lib/spring.ts` の減衰振動（＝Framer Motion の `type: "spring"` と同じ物理）。
  //   閉じるときは `TRAVEL`（わずかに行き過ぎる＝ガチャンの衝撃）、戻るときは
  //   `SETTLE`（行き過ぎずに素早く復帰）。**係数は既存の4つだけ。増やさない。**
  //   ★★毎フレーム React を再レンダーせず、群の transform を直接書く。
  useEffect(() => {
    let id = 0;
    const tick = () => {
      const shut = want > s.current.p;
      springTo(s.current, want, shut ? K_TRAVEL : K_SETTLE, shut ? D_TRAVEL : D_SETTLE);
      if (settled(s.current, want)) { s.current.p = want; s.current.v = 0; paint(want); return; }
      paint(s.current.p);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [want, paint]);

  /**
   * 床へ倒した影。**高いところほど左へ遠く飛ぶ**。接地では足元に触れる。
   * ★部品ごとに落とすと**2本の帯に割れる**（高さが違うぶん横へずれる）。
   *   道具は1つの塊なので、**輪郭を合併してから**倒す。
   */
  const floor = toPath(hull(away).map((p) => {
    const h = GROUND - p.y;
    return { x: p.x - h * SUN.x, y: GROUND + h * SUN.y };
  }));

  return (
    <svg viewBox={`0 0 ${NIPPER_VB.w} ${NIPPER_VB.h}`} width={width} aria-hidden
      style={{ display: "block", overflow: "visible", touchAction: "none" }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}>
      <g transform={`translate(${NIPPER_ORIGIN.x} ${NIPPER_ORIGIN.y})`}>
        {/* 1. 影 … ★ぼかさない1枚の面。群に1度だけ透かす（重ねても濃くしない）。 */}
        <g id="shadow" opacity={P.castAlpha}>
          <path d={floor} fill={P.cast} />
        </g>

        {/* 2. 固定部 … 奥の薄い本体＋頭の受け。★手前の陰に入るのでひと段暗い。 */}
        <g id="frame">
          <Solid faces={solids.lever} away={away} dim={DIM_FAR} />
          {/* ダイのスリット。★別の群にして最後に描く（画家の順で頭に負けないため）。 */}
          <g id="die"><Solid faces={solids.slot} away={away} flat={P.gap} /></g>
        </g>

        {/* 3. バネ … 針金の輪が2つ。腕のあいだに覗く。 */}
        {/* ★針金は磨かれた鋼。本体の陰には入らないので段を下げない。 */}
        <g id="spring" ref={coilRef} transform={squeeze(s.current.p, hinge)}>
          <Solid faces={solids.coil} away={away} />
        </g>

        {/* 4. 可動部 … 手前の分厚い柄。握って押すほうで、ここが工具の主役。
            ★頭の支点（0,0）を軸に回る。下端が本体へ寄り、頭では突きがスリットへ沈む。 */}
        <g id="lever" ref={leverRef} transform={swing(s.current.p)}>
          <Solid faces={solids.grip} away={away} />
        </g>
      </g>
    </svg>
  );
}
