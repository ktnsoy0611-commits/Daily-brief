"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NIPPER_PAINT as P } from "@/lib/constants";
import {
  spring, springTo, settled, K_TRAVEL, D_TRAVEL, K_SETTLE, D_SETTLE,
} from "@/lib/spring";
import {
  drawOrder, extrudePoly, proj, toPath, tube,
  type Face, type P2, type V3,
} from "@/lib/nipperSolid";
import {
  NIPPER_COIL, NIPPER_EXTENT, NIPPER_LEFT, NIPPER_LEFT_TIPS, NIPPER_PIVOT,
  NIPPER_RIGHT, NIPPER_SLOT,
} from "@/lib/nipperShape";

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
export const NIPPER_VB = { w: 760, h: 1080 };
/** 工具の原点（＝継ぎ目 × 頭の天）。呼び出し側はここを画面のどこへ置くかで構図を決める。 */
export const NIPPER_ORIGIN = { x: 300, y: 100 };
/** 口（＝紙が入るスリット）の、原点からのずれ。券の縁へ合わせるのに使う。 */
export const NIPPER_NOSE = {
  x: (NIPPER_SLOT.x0 + NIPPER_SLOT.x1) / 2,
  y: -(NIPPER_SLOT.y0 + NIPPER_SLOT.y1) / 2,
};

// ---- 寸法 --------------------------------------------------------------
// 局所座標は **継ぎ目 × 頭の天が原点／+y が上／+x が右／+z が手前**。
// ★★★**形は `lib/nipperShape.ts` が正**（平面図を機械でトレースしたもの）。
//   16巡目まで、ここに駅の表（`Station[]`）を**目で読んで打ち込んで**いた。
//   何巡やってもプロポーションが合わなかった原因はそれ。**数値を打ち直さない。**
//   直したいときは図を描き直して `tools/trace-nipper.mjs` を走らせる。

/** 赤の部品（右＝箱と右の持ち手）の半分の厚み。**厚い**。 */
const Z_RED = 45;
/** 青の部品（左）の**持ち手**の半分の厚み。赤と同じ。 */
const Z_BLUE = 45;
/**
 * ★青の部品の、**持ち手より上**の半分の厚み。
 * 赤の部品の中へ**挟み込まれる**ので、赤より薄い（2026-08-29 にユーザーが確定）。
 */
const Z_BLUE_HEAD = 18;
/** 厚みが変わる高さ（＝肩）。ここから上が赤の中へ入る。 */
const STEP_Y = -400;

/** ★支点。2部品が重なっているところ ― 図から拾った値をそのまま使う。 */
const HINGE = NIPPER_PIVOT;
/**
 * 押し切ったときの角（度）。★負＝青の持ち手が**右へ寄る**（＝開きが閉じる）。
 * 参考の道具はバネで大きく開いているので、ここは小さくない。
 */
const THETA = -10;

/** バネ。★輪の場所と大きさも図から拾う。脚だけは図の細い線を読めないので手で置く。 */
const COIL = {
  wire: 7,
  /** ★輪はひとつ、**大きく**。2巻きにする。 */
  ring: [
    { x: NIPPER_COIL.cx, y: NIPPER_COIL.cy, r: NIPPER_COIL.r },
    { x: NIPPER_COIL.cx, y: NIPPER_COIL.cy + 3, r: NIPPER_COIL.r - 3 },
  ],
  z: 26,
  /** 脚。★青の部品の内側から長く降ろし、輪を経て赤の持ち手へ。 */
  legFar: [{ x: -20, y: -328, z: 24 }, { x: 120, y: -690, z: 26 }] as V3[],
  legNear: { x: 330, y: -640, z: 30 },
};
/** 押し切ったときのバネの縮み（横へ詰まる）。 */
const SQUEEZE = 0.34;

/** 落ち影。★立ち姿の複製ではなく、**床へ倒れ込ませる**。 */
const GROUND = -NIPPER_EXTENT.y0;   // 接地（持ち手の先の高さ）
const SUN = { x: 0.55, y: 0.12 };   // 高さ1あたり、左へ／わずかに手前へ

// ---- 立体 --------------------------------------------------------------
/** コイル。1周を10で折る（曲線は持たない）。 */
function coilPath(): V3[] {
  const N = 10;
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

/** 赤は上から下まで同じ厚み。 */
const redZ = (): [number, number] => [-Z_RED, Z_RED];
/** ★青は肩を境に段が付く ― 下は赤と同じ、上は薄くて赤の中へ入る。 */
const blueZ = (p: P2): [number, number] => {
  const h = p.y < STEP_Y ? Z_BLUE : Z_BLUE_HEAD;
  return [-h, h];
};

/** 多角形の、ある高さでの左右の縁（掛からなければ `null`）。 */
function spanAt(poly: P2[], y: number): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a.y <= y) === (b.y <= y)) continue;
    const x = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return lo <= hi ? [lo, hi] : null;
}

/** 2つの部品を**合併した輪郭**（影のため）。★道具は1つの塊として影を落とす。 */
function hull(a: P2): P2[] {
  const lo = NIPPER_EXTENT.y0, hi = NIPPER_EXTENT.y1;
  const left: P2[] = [], right: P2[] = [];
  for (let i = 0; i <= 24; i++) {
    const y = lo + ((hi - lo) * i) / 24;
    const f = spanAt(NIPPER_RIGHT, y), l = spanAt(NIPPER_LEFT, y);
    if (!f && !l) continue;
    left.push(proj({ x: Math.min(f ? f[0] : Infinity, l ? l[0] : Infinity), y, z: 0 }, a));
    right.push(proj({ x: Math.max(f ? f[1] : -Infinity, l ? l[1] : -Infinity), y, z: 0 }, a));
  }
  return [...right, ...left.reverse()];
}

/**
 * 立体そのもの。★**三面図（`NipperViews`）と同じものを見る**ため、ここに出してある。
 * 検証用の絵と本番の絵が別の立体だったら、突き合わせる意味がない。
 * ★紙が入るスリットは**輪郭そのものに切れ込みとして入っている**（トレースが拾う）。
 *   別の凹み（`invert(slab(…))`）はもう要らない ― 16巡目に廃止。
 */
export function nipperSolids() {
  return {
    frame: extrudePoly(NIPPER_RIGHT, redZ),
    lever: [
      ...extrudePoly(NIPPER_LEFT, blueZ),
      // ★青は赤に挟まれているので、正面では**頭の天に出る先だけ**が切れて見える。
      ...NIPPER_LEFT_TIPS.flatMap((t) => extrudePoly(t, blueZ)),
    ],
    coil: tube(coilPath(), COIL.wire),
  };
}
/**
 * 板を暗く落とす段（三面図でも同じ手当てをする）。
 * ★いまは 0 ― 板と箱は**前後ではなく左右に並ぶ**ので、群ごと暗くすると嘘になる。
 */
export const NIPPER_DIM_FAR = 0;

function Solid({ faces, away, dim = 0 }: { faces: Face[]; away: P2; dim?: number }) {
  const tone = (t: number) => P.ramp[Math.max(0, Math.min(P.ramp.length - 1, t + dim))];
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

        {/* 2. 青の部品 … 支点まわりに回る側。★赤に挟まれるのでひと段暗い。 */}
        <g id="lever" ref={leverRef} transform={swing(s.current.p)}>
          <Solid faces={solids.lever} away={away} dim={NIPPER_DIM_FAR} />
        </g>

        {/* 3. バネ … 腕の開きに収まる針金の輪。★磨かれた鋼なので段を下げない。 */}
        <g id="spring" ref={coilRef} transform={squeeze(s.current.p, anchor)}>
          <Solid faces={solids.coil} away={away} />
        </g>

        {/* 4. 赤の部品 … **頭の箱と右の持ち手が一体**。ここが工具の主役。 */}
        <g id="frame">
          <Solid faces={solids.frame} away={away} />
        </g>
      </g>
    </svg>
  );
}
