"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NIPPER_PAINT as P } from "@/lib/constants";
import {
  spring, springTo, settled, K_TRAVEL, D_TRAVEL, K_SETTLE, D_SETTLE,
} from "@/lib/spring";
import {
  drawOrder, extrude, invert, outline, slab, toPath, tube,
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
  // ★**幅より薄い**こと（半幅 51 に対し半厚 26）。断面を正方形に近づけると、
  //   一点透視のずれで左の側面が広く出て、白い帯が縦に走ってしまう（10巡目に実測）。
  [-692, 20, 12, 36],    // 先は幅を残したまま丸く終わる
  [-678, 30, 18, 37],
  [-655, 38, 22, 39],
  [-600, 45, 25, 41],
  [-500, 50, 26, 42],    // 腹。いちばん太い
  [-380, 51, 26, 42],
  [-280, 47, 25, 40],
  [-218, 42, 23, 32],
  [-216, 44, 26, 22],    // ★頭。ここで肩が左へ張り出す（柄との段）
  [-40, 44, 26, 22],     // 頭は平行な四角い塊
  [-38, 34, 22, 12],     // ★右上の矩形の欠き（参考画像2の段）
  [8, 34, 20, 12],       // 天
];
/**
 * 固定部の本体（奥・左）。★**手前の柄のおよそ半分の幅**しかない薄い平板で、
 * **手前の柄より高い位置で終わる**。太らせたり下まで伸ばしたりすると、
 * 1本の道具ではなく**2本の棒が並んで**見える（10巡目に実測）。スリットはここに開く。
 */
const LEVER: Station[] = [
  [-580, 16, 10, -26],
  [-556, 22, 13, -28],
  [-460, 25, 14, -30],
  [-360, 26, 14, -32],
  [-262, 27, 15, -34],
  [-218, 28, 16, -36],
  [-216, 34, 26, -38],   // ★頭。ここで急に厚くなる（受けの塊）
  [-19, 34, 26, -38],
  [0, 30, 22, -38],
];
/** ダイのスリット。★受けの面に開いた縦の溝。`invert` で凹みにする。 */
const SLOT = { x0: -58, x1: -38, y0: -182, y1: -45, z0: Z_FAR + 2, z1: Z_FAR + 27 };

/** バネ。針金のコイル（輪が2つ）＋2本の脚。★腕のあいだに覗く。 */
const COIL = { r: 4.5, ring: [{ x: -24, y: -427, r: 26 }, { x: -20, y: -529, r: 24 }], z: 2 };
/** 押し切ったときの縮み。輪の中心を支点に縦へ詰まる。 */
const SQUEEZE = 0.22;

/** 陰の手当て。★面ごとに手で塗らない ― **群にまとめて1度だけ**段を下げる。 */
const DIM_FAR = -2;    // 奥の本体は手前の柄の陰に入る（スリットは `P.gap` で塗る）

/** 落ち影。★立ち姿の複製ではなく、**床へ倒れ込ませる**。 */
const GROUND = 692;                  // 接地（柄の先の高さ）
const SUN = { x: 0.46, y: 0.16 };     // 高さ1あたり、左へ／わずかに手前へ

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

  /** 床へ倒した影。**高いところほど左へ遠く飛ぶ**。接地では足元に触れる。 */
  const floor = (pts: P2[]) => toPath(pts.map((p) => {
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
          <path d={floor(outline(GRIP, Z_NEAR, away))} fill={P.cast} />
          <path d={floor(outline(LEVER, Z_FAR, away))} fill={P.cast} />
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
