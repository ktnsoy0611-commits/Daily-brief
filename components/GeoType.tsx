"use client";

// ★幾何アルファベット(2026-08-03・作り直し)。ユーザー提供の見本
// (FullSizeRender.jpeg)を**画像解析して1文字ずつ転写**したもの。
// 見出し(各タブの名前)とタグに使う。本文は従来どおり Zen Kaku Gothic New。
//
// ■ 見本の組み方(実測して分かったこと)
// 1文字は**正方形を2x2に割ったグリッド**。実寸はセル78px・溝6px・全体162px。
// 4つのセルそれぞれに、たった3種類の形のどれかが入るだけ:
//   full  … 正方形をそのまま塗る
//   q◇   … 正方形の指定した角を、セルの一辺を半径にして丸く落とす(四半円)
//   rr◇  … 帯の指定した側の端を、セルの半分を半径にして丸くする
//   empty … 空
// そして**セルとセルの間の溝(4本)は、繋がっている所だけ塗る**。
// たとえば A は「上段の2セル(左上を丸く/右上を丸く)＋縦の溝を塗る」でアーチに
// なり、下段は正方形2つのまま=溝を塗らないので脚の間の隙間になる。
// O は4隅を丸めた4セルだが縦の溝を塗らないので、円の真ん中に縦線が入る。
//
// この作りなので**塗り足しだけで済み、穴(カウンター)も mask も要らない**。
// 1文字＝図形の和を1本のパスにまとめて塗るだけ。
//
// ■ 等幅
// 見本は全文字が同じ162x162の正方形。字送りも溝1本ぶん(6px)。等幅で組む。
//
// ■ ★検証の要点
// scratchpad/analyze.py で、見本の各セルを15種類のテンプレートと突き合わせて
// IoUで分類した(全104セルが 0.97〜1.00 で一致)。**目視で写すと必ず取り違える**
// (最初の版では C の右上を丸いと誤読していたし、そもそも「2x2のセル」という
// 組み方自体に気づかず、ただの幾何サンセリフを自作してしまっていた)。

const CELL = 1;              // セル1辺
const GUT = 6 / 78;          // 溝(見本の実寸比)
const BOX = CELL * 2 + GUT;  // 1文字の外形(正方形)
// 溝を塗るとき、両隣のセルへほんの少し食い込ませる。ちょうど接するだけだと
// アンチエイリアスで髪の毛のような継ぎ目が残る。
const BLEED = 0.012;

const n = (v: number) => Math.round(v * 10000) / 10000;
const rect = (x: number, y: number, w: number, h: number) =>
  `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;

type Cell = "full" | "empty" | "qTL" | "qTR" | "qBL" | "qBR" | "rrL" | "rrR" | "rrU" | "rrD";

// セル(x,y,s)の中身を1つのパスにする。
function cellPath(kind: Cell, x: number, y: number, s: number): string {
  // ★部分パスはすべて**時計回り**で書くこと。rect と逆向きの部分があると、
  // 溝と重ねた所の巻き数が 0 になり、nonzero塗りで髪の毛のような穴が開く。
  const r = n(s), h = n(s / 2);
  switch (kind) {
    case "empty": return "";
    case "full": return rect(x, y, s, s);
    // 指定の角をセルの一辺を半径にして丸く落とす(=反対の角を中心とする四半円)。
    case "qTL": return `M${n(x + s)} ${n(y)}V${n(y + s)}H${n(x)}A${r} ${r} 0 0 1 ${n(x + s)} ${n(y)}Z`;
    case "qTR": return `M${n(x)} ${n(y)}A${r} ${r} 0 0 1 ${n(x + s)} ${n(y + s)}H${n(x)}Z`;
    case "qBL": return `M${n(x)} ${n(y)}H${n(x + s)}V${n(y + s)}A${r} ${r} 0 0 0 ${n(x)} ${n(y)}Z`;
    case "qBR": return `M${n(x)} ${n(y)}H${n(x + s)}A${r} ${r} 0 0 1 ${n(x)} ${n(y + s)}Z`;
    // 帯の片端をセルの半分を半径にして丸くする。
    case "rrR": return `M${n(x)} ${n(y)}H${n(x + s / 2)}A${h} ${h} 0 0 1 ${n(x + s / 2)} ${n(y + s)}H${n(x)}Z`;
    case "rrL": return `M${n(x + s)} ${n(y + s)}H${n(x + s / 2)}A${h} ${h} 0 0 1 ${n(x + s / 2)} ${n(y)}H${n(x + s)}Z`;
    case "rrU": return `M${n(x)} ${n(y + s)}V${n(y + s / 2)}A${h} ${h} 0 0 1 ${n(x + s)} ${n(y + s / 2)}V${n(y + s)}Z`;
    case "rrD": return `M${n(x + s)} ${n(y)}V${n(y + s / 2)}A${h} ${h} 0 0 1 ${n(x)} ${n(y + s / 2)}V${n(y)}Z`;
  }
}

/** 4セル(左上・右上・左下・右下)と、4本の溝を塗るかどうか。
 *  溝の順は [縦(上段) 縦(下段) 横(左列) 横(右列)]。 */
type Glyph = [Cell, Cell, Cell, Cell, string];

// ★見本からの転写(scratchpad/analyze.py の出力そのまま)。
const GLYPHS: Record<string, Glyph> = {
  A: ["qTL", "qTR", "full", "full", "1011"],
  B: ["full", "rrR", "full", "rrR", "0010"],
  C: ["qTL", "full", "qBL", "qBR", "1110"],
  D: ["full", "qTR", "full", "qBR", "0011"],
  E: ["rrL", "full", "rrL", "full", "1100"],
  F: ["qBL", "full", "full", "empty", "1000"],
  G: ["qTL", "full", "qBL", "rrU", "1010"],
  H: ["full", "full", "full", "full", "0011"],
  I: ["full", "full", "full", "full", "1100"],
  J: ["empty", "full", "qTR", "qBR", "0001"],
  K: ["full", "qBR", "full", "qTR", "0010"],
  L: ["full", "empty", "full", "qTL", "0010"],
  M: ["rrU", "rrU", "full", "full", "0011"],
  N: ["qTR", "full", "full", "qBL", "0011"],
  O: ["qTL", "qTR", "qBL", "qBR", "0011"],
  P: ["full", "rrR", "full", "empty", "0010"],
  Q: ["qTL", "qTR", "qBL", "rrL", "1010"],
  R: ["full", "rrR", "full", "qTR", "0010"],
  S: ["rrL", "full", "full", "rrR", "1100"],
  T: ["full", "full", "qTL", "qTR", "1100"],
  U: ["full", "full", "qBL", "qBR", "0111"],
  V: ["full", "full", "qBL", "qBR", "0011"],
  W: ["full", "full", "rrD", "rrD", "0011"],
  X: ["qBL", "qBR", "qTL", "qTR", "0000"],
  Y: ["qBL", "full", "full", "qBR", "0101"],
  Z: ["full", "qBR", "qTL", "full", "1100"],

  // ★数字は見本に無いので、同じ規則(2x2のセル＋溝)で足したもの。
  "0": ["qTL", "qTR", "qBL", "qBR", "1111"],
  "1": ["empty", "full", "empty", "full", "0001"],
  "2": ["qTL", "qTR", "full", "full", "1101"],
  "3": ["full", "full", "full", "full", "1101"],
  "4": ["full", "full", "empty", "full", "0101"],
  "5": ["full", "full", "full", "rrR", "1100"],
  "6": ["qTL", "full", "qBL", "qBR", "1011"],
  "7": ["full", "full", "empty", "full", "1001"],
  "8": ["qTL", "qTR", "qBL", "qBR", "1111"],
  "9": ["qTL", "qTR", "qBL", "full", "1101"],
  " ": ["empty", "empty", "empty", "empty", "0000"],
};

function glyphPath(g: Glyph): string {
  const [tl, tr, bl, br, gut] = g;
  const o = CELL + GUT; // 2列目・2行目の原点
  let d = "";
  d += cellPath(tl, 0, 0, CELL);
  d += cellPath(tr, o, 0, CELL);
  d += cellPath(bl, 0, o, CELL);
  d += cellPath(br, o, o, CELL);
  // 溝。塗る所だけ、両隣へわずかに食い込ませて継ぎ目を消す。
  if (gut[0] === "1") d += rect(CELL - BLEED, 0, GUT + BLEED * 2, CELL);
  if (gut[1] === "1") d += rect(CELL - BLEED, o, GUT + BLEED * 2, CELL);
  if (gut[2] === "1") d += rect(0, CELL - BLEED, CELL, GUT + BLEED * 2);
  if (gut[3] === "1") d += rect(o, CELL - BLEED, CELL, GUT + BLEED * 2);
  return d;
}

// 字送り。見本の文字ピッチ(168px)−文字幅(162px)=6px=溝1本ぶん。
const TRACK = GUT;

export function geoTextWidth(text: string): number {
  const chars = [...text.toUpperCase()].filter((ch) => GLYPHS[ch]);
  if (chars.length === 0) return 0;
  return chars.length * BOX + TRACK * (chars.length - 1);
}

/**
 * 幾何アルファベットで文字列を描く。等幅。
 * @param size 文字の高さ(px)。1文字の正方形の一辺がこの高さになる。
 */
export function GeoText({ text, size = 20, color, tracking = TRACK, style }: {
  text: string;
  size?: number;
  color: string;
  /** 字送りの隙間(セル基準)。既定は溝1本ぶん。 */
  tracking?: number;
  style?: React.CSSProperties;
}) {
  const chars = [...text.toUpperCase()].filter((ch) => GLYPHS[ch]);
  if (chars.length === 0) return null;
  const total = chars.length * BOX + tracking * (chars.length - 1);
  return (
    <svg
      viewBox={`0 0 ${n(total)} ${n(BOX)}`}
      height={size}
      width={(size * total) / BOX}
      role="img"
      aria-label={text}
      style={{ display: "block", ...style }}
    >
      {chars.map((ch, i) => (
        <path key={i} d={glyphPath(GLYPHS[ch])} fill={color} transform={`translate(${n(i * (BOX + tracking))} 0)`} />
      ))}
    </svg>
  );
}
