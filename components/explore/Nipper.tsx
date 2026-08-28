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
// ★★★13巡目に**ペンチの構造**へ作り直した（ユーザー指摘で確定）。
//   9〜12巡目は**頭を2つの塊として並べて**いたので「2本の棒」に見えていた。正しくは:
//   ・**先端は繋がっている** … 頭は**ひとつの太い箱**。2本の腕はその裾から出る。
//   ・箱には**スリット**が入っていて、**そこに紙が入る**（＝入鋏の口）。
//   ・**常時はバネで開いている**ので、腕は**大きな角度**でハの字に開く。
//     ★ここが最大の誤り ― 腕を平行に垂らすと道具に見えない。
//   ・手前（右）＝ 太い柄。頭と一体の固定部。／ 奥（左）＝ 細い梃子。押すと寄る。
//   立体の組み方と彩色は `lib/nipperSolid.ts`。ここは**寸法と群と動き**だけ。

/** 絵の枠。影は左へ長く伸びて枠を出るので `overflow: visible`。 */
export const NIPPER_VB = { w: 480, h: 900 };
/** 工具の原点（＝頭の天）。呼び出し側はここを画面のどこへ置くかで構図を決める。 */
export const NIPPER_ORIGIN = { x: 250, y: 120 };
/** 口（＝紙が入るスリット）の、原点からのずれ。券の縁へ合わせるのに使う。 */
export const NIPPER_NOSE = { x: -38, y: 122 };

// ---- 寸法 --------------------------------------------------------------
// 局所座標は **頭の天が原点／+y が上／+x が右／+z が手前**。
/** 腕の z のずらし。★頭は箱ひとつ（z=0）で、腕だけ前後にわずかにずれる。 */
const Z_NEAR = 6;
const Z_FAR = -12;
/** 梃子が回る支点（頭の中）。 */
const HINGE = { x: 0, y: -180 };
/**
 * 押し切ったときの角（度）。★負＝奥の梃子が**右へ寄る**（＝開きが閉じる）。
 * 開いた角がそのまま閉じる角。参考の道具はバネで**大きく開いて**いるので、
 * ここは小さくない。
 */
const THETA = -9;

/**
 * 固定部 ＝ **頭の箱 ＋ 手前（右）の太い柄**。`[y, 半幅, 半分の厚み, x の中心]`。
 * ★★頭は**ひとつの箱**。2つに割ると「2本の棒」に見える（13巡目にユーザー指摘）。
 * ★腕は箱の裾から**右下へ開く**（`cx` が下へ行くほど大きくなる）。
 */
const FRAME: Station[] = [
  // ★腕は**ほぼまっすぐ下**（写真でも太い柄は道具の軸に近い）。開くのは奥の梃子のほう。
  [-700, 18, 10, 66],    // 柄の先。★幅を残したまま丸く終わる
  [-676, 28, 15, 66],
  [-620, 36, 19, 63],
  [-530, 43, 22, 57],
  [-430, 46, 24, 46],    // 腹
  [-330, 47, 24, 30],
  [-240, 50, 27, 16],
  [-192, 58, 31, 6],     // 頭の裾（肩）
  [-190, 68, 34, 0],     // ★ここから上は頭の箱
  [-20, 68, 34, 0],
  [0, 62, 30, -2],       // 天の面取り
  [36, 58, 28, -4],
  [38, 26, 16, -30],     // ★天の小さな段（写真の出っぱり）
  [58, 24, 14, -30],
];
/**
 * 可動部 ＝ **奥（左）の細い梃子**。頭の中に隠れる根元から、**大きく左下へ開く**。
 * ★手前の柄よりはっきり細く薄い（実物も、押す側は平たい板）。
 * ★★開く角はここで作る ― 平行に垂らすと「2本の棒」に見える（13巡目にユーザー指摘）。
 */
const LEVER: Station[] = [
  [-660, 12, 6, -150],   // 先
  [-635, 19, 9, -146],
  [-560, 23, 11, -132],
  [-460, 25, 12, -112],
  [-360, 27, 13, -88],
  [-260, 29, 14, -60],
  [-190, 31, 15, -40],
  [-120, 32, 15, -30],   // ここから上は頭の箱に隠れる
];

/**
 * 紙が入るスリット。★頭の箱に開いた**縦の溝**（道具の長手に平行なので、
 * 立てるとこの向きになる）。`invert` で凹みにし、`P.gap` で1色に塗る。
 */
const SLOT = { x0: -46, x1: -28, y0: -190, y1: -56, z0: -6, z1: 36 };

/** バネ。★腕のあいだの開きに収まる針金のコイル（輪が2つ）。 */
const COIL = {
  wire: 6,
  /** ★輪はひとつ、**大きく**（写真でも腕の開きを埋めるほど大きい）。2巻きにする。 */
  ring: [{ x: -46, y: -540, r: 42 }, { x: -46, y: -538, r: 40 }],
  z: 4,
  /**
   * 脚。★**奥の梃子に沿わせて**降ろす（写真でも針金は梃子に寄り添う）。
   * まっすぐ下ろすと開きの真ん中に棒が1本立って見える。
   */
  legFar: [{ x: -46, y: -232, z: 0 }, { x: -74, y: -400, z: 2 }] as V3[],
  legNear: { x: 22, y: -604, z: 16 },
};
/** 押し切ったときのバネの縮み（横へ詰まる）。 */
const SQUEEZE = 0.34;

/** 陰の手当て。★面ごとに手で塗らない ― **群にまとめて1度だけ**段を下げる。 */


/** 落ち影。★立ち姿の複製ではなく、**床へ倒れ込ませる**。 */
const GROUND = 700;                  // 接地（手前の柄の先の高さ）
const SUN = { x: 0.82, y: 0.12 };    // 高さ1あたり、左へ／わずかに手前へ

// ---- 立体 --------------------------------------------------------------
/** コイル。1周を8つの直線で折る（曲線は持たない）。 */
function coilPath(): V3[] {
  const N = 10;   // 1周の折れ数。★輪に見える最小限（曲線は持たない）
  const pts: V3[] = [...COIL.legFar];
  COIL.ring.forEach((c, k) => {
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2 - Math.PI * 0.75;
      pts.push({ x: c.x + Math.cos(t) * c.r, y: c.y + Math.sin(t) * c.r, z: COIL.z + k * 4 });
    }
  });
  pts.push(COIL.legNear);
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
  const lo = Math.min(FRAME[0][0], LEVER[0][0]);
  const hi = Math.max(FRAME[FRAME.length - 1][0], LEVER[LEVER.length - 1][0]);
  const left: P2[] = [], right: P2[] = [];
  for (let i = 0; i <= 24; i++) {
    const y = lo + ((hi - lo) * i) / 24;
    const f = edgesAt(FRAME, y), l = edgesAt(LEVER, y);
    if (!f && !l) continue;
    left.push(proj({ x: Math.min(f ? f[0] : Infinity, l ? l[0] : Infinity), y, z: Z_FAR }, a));
    right.push(proj({ x: Math.max(f ? f[1] : -Infinity, l ? l[1] : -Infinity), y, z: Z_NEAR }, a));
  }
  return [...right, ...left.reverse()];
}

/**
 * 立体そのもの。★**三面図（`NipperViews`）と同じものを見る**ため、ここに出してある。
 * 検証用の絵と本番の絵が別の立体だったら、突き合わせる意味がない。
 */
export function nipperSolids() {
  return {
    frame: extrude(FRAME, Z_NEAR),
    lever: extrude(LEVER, Z_FAR),
    slot: invert(slab(SLOT.x0, SLOT.x1, SLOT.y0, SLOT.y1, SLOT.z0, SLOT.z1)),
    coil: tube(coilPath(), COIL.wire),
  };
}
/** 奥の梃子を暗く落とす段（三面図でも同じ手当てをする）。 */
export const NIPPER_DIM_FAR = -1;

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

/** 可動部の姿勢。★頭の中の支点まわりに回すだけ。 */
const swing = (v: number) =>
  `rotate(${(v * THETA).toFixed(3)} ${HINGE.x} ${-HINGE.y})`;
/** バネの縮み。手前の柄に付く側（`a`）を支点に、横へ詰める。 */
const squeeze = (v: number, a: P2) =>
  `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)})`
  + ` scale(${(1 - v * SQUEEZE).toFixed(4)} 1)`
  + ` translate(${(-a.x).toFixed(1)} ${(-a.y).toFixed(1)})`;

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

  const solids = useMemo(() => nipperSolids(), []);

  /** バネを縮める支点＝手前の柄に付く脚。 */
  const anchor = proj(COIL.legNear, away);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;

  const leverRef = useRef<SVGGElement>(null);
  const coilRef = useRef<SVGGElement>(null);
  const s = useRef(spring(want));

  const paint = useCallback((v: number) => {
    leverRef.current?.setAttribute("transform", swing(v));
    coilRef.current?.setAttribute("transform", squeeze(v, anchorRef.current));
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
   * ★部品ごとに落とすと**2本の帯に割れる**ので、**輪郭を合併してから**倒す。
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
        <g id="shadow" opacity={P.castAlpha}><path d={floor} fill={P.cast} /></g>

        {/* 2. 可動部 … 奥の細い梃子。★手前の陰に入るのでひと段暗い。 */}
        <g id="lever" ref={leverRef} transform={swing(s.current.p)}>
          <Solid faces={solids.lever} away={away} dim={NIPPER_DIM_FAR} />
        </g>

        {/* 3. バネ … 腕の開きに収まる針金の輪。★磨かれた鋼なので段を下げない。 */}
        <g id="spring" ref={coilRef} transform={squeeze(s.current.p, anchor)}>
          <Solid faces={solids.coil} away={away} />
        </g>

        {/* 4. 固定部 … **頭の箱ひとつ**＋手前の太い柄。ここが工具の主役。 */}
        <g id="frame">
          <Solid faces={solids.frame} away={away} />
          {/* 紙が入るスリット。★別の群にして最後に描く（画家の順で頭に負けないため）。 */}
          <g id="die"><Solid faces={solids.slot} away={away} flat={P.gap} /></g>
        </g>
      </g>
    </svg>
  );
}
