"use client";

import { useId } from "react";

// ★幾何アルファベット(2026-08-03)。ユーザー提供の見本(FullSizeRender.jpeg)の
// 作りに倣って、長方形・円・半円・四半円・45度の面だけで組んだ書体。
// 見出し(各タブの名前)とタグに使う。本文は従来どおり Zen Kaku Gothic New。
//
// ■ 組み方
// 1文字は**高さ3ユニット**の箱に収める。幅は文字ごとに違う(I は細く、O は広い)。
// 縦棒の太さ S=0.75 は全文字で共通。曲線の半径は 0.3 / 0.45 / 0.9 / 1.05 / 1.2 の
// いずれかで、すべて S の倍数か半径差が S になるよう取ってある(線の太さが
// どこでも S に揃う)。
//
// ■ 穴(カウンター)は mask で抜く
// A・B・D・O・P・R などの内側の穴は、塗り足し(add)と塗り抜き(sub)を
// **順番に**重ねる mask で作る。1本のパスに畳んで fill-rule で抜く手もあるが、
// E のように塗り足し同士が重なる文字があるため、evenodd では重なりが穴に
// なってしまう。nonzero + 巻き方向の制御は間違えやすいので mask を選んだ。
// 文字数はたかが知れているので描画の負担は問題にならない。

const H = 3;      // 文字の高さ(ユニット)
const S = 0.75;   // 線の太さ
const GAP = 0.34; // 字間
// ★継ぎ目消しの重ね量。maskの中で曲線と直線がちょうど接すると、
// アンチエイリアスで髪の毛のような線が残る。ほんの少し重ねて消す。
const BL = 0.02;

type Op = { d: string; on: boolean };

const on = (d: string): Op => ({ d, on: true });
const off = (d: string): Op => ({ d, on: false });

const n = (v: number) => Math.round(v * 1000) / 1000;
// 長方形
const R = (x: number, y: number, w: number, h: number) =>
  `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;
// 円
const C = (cx: number, cy: number, r: number) =>
  `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 1 ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 1 ${n(cx - r)} ${n(cy)}Z`;
// 半円。上へふくらむ(下辺が直線): 左端(x,y)から右へ 2r
const HU = (x: number, y: number, r: number) =>
  `M${n(x)} ${n(y)}A${n(r)} ${n(r)} 0 0 1 ${n(x + 2 * r)} ${n(y)}Z`;
// 半円。下へふくらむ
const HD = (x: number, y: number, r: number) =>
  `M${n(x)} ${n(y)}A${n(r)} ${n(r)} 0 0 0 ${n(x + 2 * r)} ${n(y)}Z`;
// 半円。右へふくらむ(左辺が直線): 上端(x,y)から下へ 2r
const HR = (x: number, y: number, r: number) =>
  `M${n(x)} ${n(y)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + 2 * r)}Z`;
// 四半円。角(cx,cy)を中心に、dx/dy(±1)の向きの象限を埋める
const Q = (cx: number, cy: number, r: number, dx: 1 | -1, dy: 1 | -1) =>
  `M${n(cx)} ${n(cy)}L${n(cx + dx * r)} ${n(cy)}A${n(r)} ${n(r)} 0 0 ${dx * dy > 0 ? 1 : 0} ${n(cx)} ${n(cy + dy * r)}Z`;
// 45度の面(多角形)
const P = (pts: [number, number][]) =>
  `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}Z`;

interface Glyph { w: number; ops: Op[] }

// 丸い文字(O/C/G/Q)に共通の外形: 上下が半円、中が直線の「丸ゴシックのO」。
// 真円にすると幅が高さと同じ3になり、他の文字と並べたとき広すぎるため。
const OUTER = (w: number): Op[] => {
  const r = w / 2;
  return [
    on(R(0, r - BL, w, H - 2 * r + 2 * BL)), on(HU(0, r, r)), on(HD(0, H - r, r)),
    off(R(S, r - BL, w - 2 * S, H - 2 * r + 2 * BL)), off(HU(S, r, r - S)), off(HD(S, H - r, r - S)),
  ];
};

const GLYPHS: Record<string, Glyph> = {
  " ": { w: 1.0, ops: [] },

  // 上がアーチ、下が2本の脚。中の穴とアーチの内側は繋がっている。
  A: { w: 2.4, ops: [
    on(R(0, 1.2, 2.4, 1.8)), on(HU(0, 1.2, 1.2)),
    off(HU(S, 1.2, 1.2 - S)), off(R(S, 1.2, 2.4 - 2 * S, 0.55)),
    off(R(S, 2.25, 2.4 - 2 * S, 0.75)),
  ] },
  // 縦棒＋右向きの半円が2つ。それぞれに丸い穴。
  B: { w: 1.5, ops: [
    on(R(0, 0, S, H)), on(HR(S - BL, 0, 0.75)), on(HR(S - BL, 1.5, 0.75)),
    off(C(S + 0.34, 0.75, 0.3)), off(C(S + 0.34, 2.25, 0.3)),
  ] },
  C: { w: 2.4, ops: [...OUTER(2.4), off(R(1.15, 0.98, 1.4, 1.04))] },
  // 縦棒＋全高の右向き半円。
  D: { w: 2.25, ops: [
    on(R(0, 0, S, H)), on(HR(S - BL, 0, 1.5)), off(HR(S, S, 1.5 - S)),
  ] },
  E: { w: 2.1, ops: [
    on(R(0, 0, S, H)), on(R(0, 0, 2.1, S)), on(R(0, 1.125, 1.7, S)), on(R(0, H - S, 2.1, S)),
  ] },
  F: { w: 2.1, ops: [
    on(R(0, 0, S, H)), on(R(0, 0, 2.1, S)), on(R(0, 1.125, 1.7, S)),
  ] },
  G: { w: 2.4, ops: [...OUTER(2.4), off(R(1.15, 0.98, 1.4, 1.04)), on(R(1.35, 1.5, 1.05, S * 0.6))] },
  H: { w: 2.4, ops: [
    on(R(0, 0, S, H)), on(R(2.4 - S, 0, S, H)), on(R(0, 1.125, 2.4, S)),
  ] },
  I: { w: S, ops: [on(R(0, 0, S, H))] },
  // 縦棒＋左下へ回り込む四半円。
  J: { w: 2.1, ops: [
    on(R(2.1 - S, 0, S, 1.95 + BL)), on(HD(0, 1.95, 1.05)), off(HD(S, 1.95, 1.05 - S)),
  ] },
  // 縦棒に、上下から弧が寄り添う。
  K: { w: 2.2, ops: [
    on(R(0, 0, S, H)),
    on(P([[S, 1.06], [1.3, 0], [2.2, 0], [S, 1.94]])),
    on(P([[S, 1.94], [1.3, H], [2.2, H], [S, 1.06]])),
  ] },
  L: { w: 1.8, ops: [on(R(0, 0, S, 1.95 + BL)), on(Q(S - BL, H, 1.05, 1, -1))] },
  // 2本の縦棒＋中央の上向きアーチ。
  M: { w: 3.3, ops: [
    on(R(0, 0, S, H)), on(R(3.3 - S, 0, S, H)),
    on(P([[S, 0], [S + 0.8, 0], [1.85, 1.95], [1.45, 1.95]])),
    on(P([[3.3 - S - 0.8, 0], [3.3 - S, 0], [1.85, 1.95], [1.45, 1.95]])),
  ] },
  N: { w: 2.7, ops: [
    on(R(0, 0, S, H)), on(R(2.7 - S, 0, S, H)),
    on(P([[S - BL, 0], [S + 0.6, 0], [2.7 - S + BL, H], [2.7 - S - 0.6, H]])),
  ] },
  O: { w: 2.4, ops: OUTER(2.4) },
  // 縦棒＋上半分の右向き半円。
  P: { w: 1.8, ops: [
    on(R(0, 0, S, H)), on(HR(S - BL, 0, 1.05)), off(HR(S, S, 1.05 - S)),
  ] },
  Q: { w: 2.4, ops: [...OUTER(2.4), on(R(1.65, 2.1, 0.75, 0.9))] },
  // P に右下へ伸びる45度の脚。
  R: { w: 2.0, ops: [
    on(R(0, 0, S, H)), on(HR(S - BL, 0, 1.05)), off(HR(S, S, 1.05 - S)),
    on(P([[S, 1.8], [S + 0.6, 1.8], [2.0, H], [1.4, H]])),
  ] },
  // 3本の横棒を、上は左・下は右の縦棒で繋ぐ。
  S: { w: 2.1, ops: [
    on(R(0, 0, 2.1, S)), on(R(0, 1.125, 2.1, S)), on(R(0, H - S, 2.1, S)),
    on(R(0, 0, S, 1.125 + S)), on(R(2.1 - S, 1.125, S, 1.125 + S)),
  ] },
  T: { w: 2.4, ops: [on(R(0, 0, 2.4, S)), on(R(1.2 - S / 2, 0, S, H))] },
  U: { w: 2.1, ops: [
    on(R(0, 0, S, 1.95 + BL)), on(R(2.1 - S, 0, S, 1.95 + BL)),
    on(HD(0, 1.95, 1.05)), off(HD(S, 1.95, 1.05 - S)),
  ] },
  V: { w: 2.4, ops: [on(P([[0, 0], [0.85, 0], [1.2, 1.95], [1.55, 0], [2.4, 0], [1.5, H], [0.9, H]]))] },
  // U を2つ並べた形(見本と同じ)。
  W: { w: 3.15, ops: [
    on(R(0, 0, S, 1.95 + BL)), on(R(1.2, 0, S, 1.95 + BL)), on(R(2.4, 0, S, 1.95 + BL)),
    on(HD(0, 1.95, 0.975)), off(HD(S, 1.95, 0.975 - S)),
    on(HD(1.2, 1.95, 0.975)), off(HD(1.95, 1.95, 0.975 - S)),
  ] },
  X: { w: 2.4, ops: [
    on(P([[0, 0], [0.8, 0], [2.4, H], [1.6, H]])),
    on(P([[1.6, 0], [2.4, 0], [0.8, H], [0, H]])),
  ] },
  Y: { w: 2.4, ops: [
    on(P([[0, 0], [0.85, 0], [1.2, 1.2], [1.55, 0], [2.4, 0], [1.5, 1.8], [0.9, 1.8]])),
    on(R(1.2 - S / 2, 1.5, S, 1.5)),
  ] },
  Z: { w: 2.4, ops: [
    on(R(0, 0, 2.4, S)), on(R(0, H - S, 2.4, S)),
    on(P([[1.55, S], [2.4, S], [0.85, H - S], [0, H - S]])),
  ] },

  "0": { w: 2.4, ops: OUTER(2.4) },
  "1": { w: 1.5, ops: [on(R(0.75, 0, S, H)), on(Q(0.75, 0, 0.75, -1, 1))] },
  "2": { w: 2.1, ops: [
    on(HU(0, 1.05, 1.05)), off(HU(S, 1.05, 1.05 - S)), off(R(0, 1.05, 1.05, 0.6)),
    on(R(0, H - S, 2.1, S)), on(P([[1.35, 1.05], [2.1, 1.05], [0.85, H - S], [0, H - S]])),
  ] },
  "3": { w: 2.1, ops: [
    on(R(0, 0, 2.1, S)), on(R(0.6, 1.125, 1.5, S)), on(R(0, H - S, 2.1, S)),
    on(R(2.1 - S, 0, S, H)),
  ] },
  "4": { w: 2.4, ops: [on(R(0, 0, S, 1.8)), on(R(0, 1.8, 2.4, S)), on(R(2.4 - S, 0, S, H))] },
  "5": { w: 2.1, ops: [
    on(R(0, 0, 2.1, S)), on(R(0, 0, S, 1.125 + S)), on(R(0, 1.125, 2.1, S)),
    on(R(2.1 - S, 1.125, S, 1.125 + S)), on(R(0, H - S, 2.1, S)),
  ] },
  "6": { w: 2.1, ops: [...OUTER(2.1), off(R(2.1 - S, 0, S, 1.125))] },
  "7": { w: 2.4, ops: [on(R(0, 0, 2.4, S)), on(P([[1.55, S], [2.4, S], [1.5, H], [0.65, H]]))] },
  "8": { w: 2.1, ops: [...OUTER(2.1), on(R(0, 1.125, 2.1, S))] },
  "9": { w: 2.1, ops: [...OUTER(2.1), off(R(0, 1.125 + S, S, H - 1.125 - S))] },
};

export function geoTextWidth(text: string): number {
  const chars = [...text.toUpperCase()].filter((ch) => GLYPHS[ch]);
  if (chars.length === 0) return 0;
  return chars.reduce((a, ch) => a + GLYPHS[ch].w, 0) + GAP * (chars.length - 1);
}

/**
 * 幾何アルファベットで文字列を描く。
 * @param size 文字の高さ(px)。3ユニット＝この高さになる。
 */
export function GeoText({ text, size = 20, color, tracking = GAP, style }: {
  text: string;
  size?: number;
  color: string;
  /** 字間(ユニット)。既定 0.34。 */
  tracking?: number;
  style?: React.CSSProperties;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const chars = [...text.toUpperCase()].filter((ch) => GLYPHS[ch]);
  if (chars.length === 0) return null;
  const total = chars.reduce((a, ch) => a + GLYPHS[ch].w, 0) + tracking * (chars.length - 1);
  let x = 0;
  const placed = chars.map((ch, i) => {
    const g = GLYPHS[ch];
    const at = x;
    x += g.w + tracking;
    return { g, at, i };
  });
  return (
    <svg
      viewBox={`0 0 ${n(total)} ${H}`}
      height={size}
      width={(size * total) / H}
      role="img"
      aria-label={text}
      style={{ display: "block", overflow: "visible", ...style }}
    >
      <defs>
        {placed.map(({ g, i }) => (
          // 塗り足し(白)と塗り抜き(黒)を順番に重ねる。あとから描いたものが勝つ。
          <mask key={i} id={`${uid}-${i}`} maskUnits="userSpaceOnUse" x={0} y={0} width={g.w} height={H}>
            {g.ops.map((op, k) => (
              <path key={k} d={op.d} fill={op.on ? "#fff" : "#000"} />
            ))}
          </mask>
        ))}
      </defs>
      {placed.map(({ g, at, i }) => (
        <g key={i} transform={`translate(${n(at)} 0)`}>
          <rect x={0} y={0} width={g.w} height={H} fill={color} mask={`url(#${uid}-${i})`} />
        </g>
      ))}
    </svg>
  );
}
