"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NIPPER_PAINT as P } from "@/lib/constants";
import {
  spring, springTo, settled, K_TRAVEL, D_TRAVEL, K_SETTLE, D_SETTLE,
} from "@/lib/spring";
import {
  bossZ, drawOrder, extrude, outline, proj,
  type Face, type P2, type Station,
} from "@/lib/nipperSolid";

// 改札鋏。★CSS の 3D 変形は使わず、SVG で「描く」
//   （design.md 冒頭・Safari の描画崩れを5回踏んでいるため）。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。
//
// ★★★9巡目に**ローポリ＋フラットシェーディング**へ作り替えた。立体の組み方と
//   彩色は `lib/nipperSolid.ts`。ここは**寸法と群と動き**だけ。
//   投影（`away` の一点透視）は7巡目のまま ― 鋏は掴んで画面内を動かすので、
//   位置に応じてパースが変わらないとおかしくなる。

/** 絵の枠。柄は画面の外へ抜けるので `overflow: visible`。 */
export const NIPPER_VB = { w: 480, h: 900 };
/** 工具の原点（＝鋲）。呼び出し側はここを画面のどこへ置くかで構図を決める。 */
export const NIPPER_ORIGIN = { x: 240, y: 340 };
/** 口（刃が噛み合う点）の、原点からのずれ。券の縁へ合わせるのに使う。 */
export const NIPPER_NOSE = { x: 16, y: -258 };

// ---- 寸法 --------------------------------------------------------------
/** 腕の z のずらし。★2枚の刃は**厚みの方向に並ぶ**（だから交差できる）。 */
const Z_ARM = 13;
/**
 * 刃の開き。**内側の縁は鋲を通る直線**（`x = JAW · y`）。
 * ★この直線でないと、回しても刃が全長で噛み合わない（先だけ当たる）。
 */
const JAW = 0.062;
/** 閉じ切る角（度）。`2·atan(JAW)`。★開きの角度がそのまま閉じる角になる。 */
const THETA = (2 * Math.atan(JAW) * 180) / Math.PI;

/** 左の腕（固定部）。`[y, 半幅, 半分の厚み, x の中心]`。上が刃、下が柄。 */
const LEFT_ARM: Station[] = [
  [-390, 14, 13, -86],   // 柄の先。面取りで閉じる（丸めない）
  [-368, 26, 21, -84],
  [-330, 34, 26, -80],
  [-260, 40, 29, -70],   // 柄の腹。ペンチのように太い
  [-180, 40, 29, -55],
  [-100, 36, 28, -33],
  [-50, 32, 30, -17],
  [-18, 30, 32, -5],
  [0, 29, 34, 0],        // 鋲。ここで腕が交差する
  [35, 28, 31, 16],
  [80, 27, 27, 32],      // ここから上は内側の縁が JAW の直線に乗る
  [140, 25, 24, 33.7],
  [195, 21, 21, 33.1],
  [235, 15, 16, 29.6],
  [258, 4.5, 7, 20.5],   // 刃先。★薄く終える（丸めない）
];
/** 右の腕（可動部）。左の鏡像。 */
const RIGHT_ARM: Station[] = LEFT_ARM.map(([y, hw, hd, cx]) => [y, hw, hd, -cx]);

/** 鋲。z 軸まわりの短い多角柱。台は固定部、頭は可動部に乗る。 */
const RIVET = { r: 34, back: -72, seam: -47, front: 47, cap: 72 };

/** バネ。柄のあいだで**横に**縮む（左の柄が固定・右の柄が寄ってくる）。 */
const COIL = { y: -250, span: 42, amp: 30, wire: 11, turns: 4, front: 44, back: 24 };
/** 閉じ切ったときの縮み。★右の柄が寄る量（`2·span·sin θ / 2·span`）から出した。 */
const SQUEEZE = 0.37;

/** 落ち影。★左下へ長く鋭く。ぼかさず、同じ輪郭を6枚ずらして掃く。 */
const SUN = { x: -0.92, y: 0.62 };
const CAST_LEN = 72;
const CAST_STEPS = 14;

/** 可動部の姿勢。★鋲（0,0）を軸に回すだけ。 */
const swing = (v: number) => `rotate(${(v * THETA).toFixed(3)} 0 0)`;
/** バネの縮み。左の柄に付く側（`a`）を支点に、横へ縮める。 */
const squeeze = (v: number, a: P2) =>
  `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)})`
  + ` scale(${(1 - v * SQUEEZE).toFixed(4)} 1)`
  + ` translate(${(-a.x).toFixed(1)} ${(-a.y).toFixed(1)})`;

// ---- 立体 --------------------------------------------------------------
function coilFaces(): Face[] {
  const { y, span, amp, wire, turns, front, back } = COIL;
  const nodeX = (i: number) => -span + (2 * span * i) / turns;
  const nodeY = (i: number) => y + (i % 2 ? amp : -amp);
  const out: Face[] = [];
  for (let i = 0; i < turns; i++) {
    const st: Station[] = nodeY(i) < nodeY(i + 1)
      ? [[nodeY(i), wire, wire, nodeX(i)], [nodeY(i + 1), wire, wire, nodeX(i + 1)]]
      : [[nodeY(i + 1), wire, wire, nodeX(i + 1)], [nodeY(i), wire, wire, nodeX(i)]];
    out.push(...extrude(st, i % 2 ? back : front));
  }
  return out;
}

function Solid({ faces, away }: { faces: Face[]; away: P2 }) {
  return (
    <>
      {drawOrder(faces, away).map((f, i) => (
        // ★面と面のあいだに地が透けないよう、同じ色で髪の毛ほど太らせる。
        //   `crispEdges` で塞ぐとギザギザになるので、こちらで塞ぐ。
        <path key={i} d={f.d} fill={P.ramp[f.tone]} stroke={P.ramp[f.tone]} strokeWidth={0.6} />
      ))}
    </>
  );
}

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
    left: [...extrude(LEFT_ARM, -Z_ARM), ...bossZ(RIVET.r, RIVET.back, RIVET.seam)],
    right: [...extrude(RIGHT_ARM, Z_ARM), ...bossZ(RIVET.r * 0.76, RIVET.front, RIVET.cap)],
    coil: coilFaces(),
  }), []);
  /** バネの縮みの支点＝左の柄に付く側。 */
  const anchor = proj({ x: -COIL.span, y: COIL.y, z: COIL.front }, away);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;

  const rightRef = useRef<SVGGElement>(null);
  const coilRef = useRef<SVGGElement>(null);
  const s = useRef(spring(want));

  const paint = useCallback((v: number) => {
    const a = anchorRef.current;
    rightRef.current?.setAttribute("transform", swing(v));
    coilRef.current?.setAttribute("transform", squeeze(v, a));
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

  const shade = (st: Station[], zc: number) => outline(st, zc, away);

  return (
    <svg viewBox={`0 0 ${NIPPER_VB.w} ${NIPPER_VB.h}`} width={width} aria-hidden
      style={{ display: "block", overflow: "visible", touchAction: "none" }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}>
      <g transform={`translate(${NIPPER_ORIGIN.x} ${NIPPER_ORIGIN.y})`}>
        {/* 1. 影 … ★重ね塗りで濃淡が出ないよう、**群に1度だけ**透かす。 */}
        <g id="shadow" opacity={P.castAlpha}>
          {Array.from({ length: CAST_STEPS }, (_, i) => {
            const t = (0.14 + (0.86 * i) / (CAST_STEPS - 1)) * CAST_LEN;
            return (
              <g key={i} transform={`translate(${(t * SUN.x).toFixed(1)} ${(t * SUN.y).toFixed(1)})`}>
                <path d={shade(LEFT_ARM, -Z_ARM)} fill={P.cast} />
                <path d={shade(RIGHT_ARM, Z_ARM)} fill={P.cast} />
              </g>
            );
          })}
        </g>

        {/* 2. 固定部 … 左の柄・左の刃・鋲の台。 */}
        <g id="left_part"><Solid faces={solids.left} away={away} /></g>

        {/* 3. 可動部 … 右の柄・右の刃・鋲の頭。★鋲（0,0）を軸に回す。 */}
        {/* ★JSX 側は**いまのバネの値**で書く。`want` で書くと、押した瞬間の
            再レンダーで**終わりの姿勢へ一度飛んでから**動き出す。 */}
        <g id="right_part" ref={rightRef} transform={swing(s.current.p)}>
          <Solid faces={solids.right} away={away} />
        </g>

        {/* 4. バネ … 柄のあいだ。左の柄に付く側を支点に、横へ縮む。 */}
        <g id="spring" ref={coilRef} transform={squeeze(s.current.p, anchor)}>
          <Solid faces={solids.coil} away={away} />
        </g>
      </g>
    </svg>
  );
}
