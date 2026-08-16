import { FONT_FACES } from "./constants";
import type { FontFace } from "./constants";

// ★図形の上に載せる文字。与えられた箱にできるだけ大きく収める。
//
// ★書体は**図形(タスク)ごとに1つ**。1文字ずつ変えるのは 2026-08-16 に
// ユーザーが明確に否定した(「フォントは一文字ずつとかではなく、タスクごと
// (図形ごと)に変えること」)。同じタスクの文字列は必ず同じ書体で組む。
//
// ★書体は「タスクの id」から決める。乱数を引くと再描画のたびに書体が
// 変わってちらつくため、**必ず決定的に**選ぶこと。
//
// ★★文字は**グリフのアトラス**を経由して描く。canvas の fillText は、和文の
// Webフォント(unicode-range で数百の @font-face に分割されている)に対して
// 1回 10ms 級の照合+ラスタライズが走り、1文字ごとに書体を替えるこの設計では
// 毎回それを支払うことになる(実測: 落下中の fillText 合計 2.4秒)。
// 同じ (書体, 文字, 色) は一度だけ描いて小さな canvas に取り、以後は
// drawImage(数十µs)で使い回す。

/** 文字列 → 0以上の整数。 */
export function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** その図形に割り当てる書体の番号。seed(タスクのid等)だけから決まる。
 *  ★連番の id("task-1","task-2"…)は hash も連番になり、剰余を取っても
 *  ほとんど動かず全部が同じ書体に寄る。黄金比の定数を掛けて桁を混ぜる。 */
export function faceIndexFor(seed: string): number {
  const h = Math.imul(hashOf(seed) ^ 0x9e3779b9, 2246822519) >>> 0;
  return h % FONT_FACES.length;
}

export const faceFor = (seed: string): FontFace => FONT_FACES[faceIndexFor(seed)];

// ★canvas の ctx.font は **CSS変数を解決できない**。`var(--font-…)` を含む
// 文字列を代入すると黙って失敗し、既定の 10px サンセリフのままになる
// (実際にそうなって文字が豆粒になった)。html に効いている計算値へ一度だけ
// 解決してキャッシュする。
const familyCache = new Map<string, string>();

function resolveFamily(family: string): string {
  const hit = familyCache.get(family);
  if (hit) return hit;
  let out = family;
  if (typeof document !== "undefined") {
    const style = getComputedStyle(document.documentElement);
    out = family.replace(/var\((--[^)]+)\)/g, (_, name: string) => {
      const v = style.getPropertyValue(name).trim();
      return v || "sans-serif";
    });
  }
  familyCache.set(family, out);
  return out;
}

/** 書体の読み込みを頼んでおく(非同期・ベストエフォート)。
 *  @font-face で定義しただけの書体は、canvas から使っても自動では
 *  ダウンロードされないことがあるため、実際に使う文字を添えて load する。 */
const requested = new Set<string>();
export function requestFonts(text: string) {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  for (const ch of new Set([...text])) {
    if (requested.has(ch)) continue;
    requested.add(ch);
    for (const f of FONT_FACES) {
      // ★load() は Promise を返し、失敗すると unhandled rejection になって
      // pageerror が飛ぶ。読めない書体は fallback で描くだけなので握りつぶす。
      try { document.fonts.load(cssFont(f, 16), ch).catch(() => {}); } catch { /* noop */ }
    }
  }
}

/** すべての書体が使える状態になったら一度だけ呼ぶ。絵の作り直しに使う。 */
export function onFontsReady(cb: () => void) {
  if (typeof document === "undefined" || !document.fonts?.ready) return;
  document.fonts.ready.then(() => cb()).catch(() => {});
}

export const cssFont = (f: FontFace, size: number): string =>
  `${f.italic ? "italic " : ""}${f.weight} ${size}px ${resolveFamily(f.family)}`;

// ── グリフのアトラス ────────────────────────────────────────

/** アトラスに描く1文字の大きさ(px)。表示はこれを拡縮して使う。 */
export const GLYPH_PX = 128;
/** はみ出し(斜体・明朝のハネ)のための余白。 */
const GPAD = Math.round(GLYPH_PX * 0.3);

interface Glyph { cv: HTMLCanvasElement; advance: number }

const glyphCache = new Map<string, Glyph>();
const advanceCache = new Map<string, number>();

let measureCtx: CanvasRenderingContext2D | null = null;
function ctxForMeasure(): CanvasRenderingContext2D | null {
  if (!measureCtx && typeof document !== "undefined") {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  return measureCtx;
}

/** その (書体, 文字) の送り幅(GLYPH_PX 基準)。一度測ったら二度と測らない。 */
export function advanceOf(faceIdx: number, ch: string): number {
  const key = `${faceIdx}|${ch}`;
  const hit = advanceCache.get(key);
  if (hit !== undefined) return hit;
  const ctx = ctxForMeasure();
  if (!ctx) return GLYPH_PX;
  ctx.font = cssFont(FONT_FACES[faceIdx], GLYPH_PX);
  const w = ctx.measureText(ch).width;
  advanceCache.set(key, w);
  return w;
}

const glyphKey = (faceIdx: number, ch: string, color: string) => `${faceIdx}|${ch}|${color}`;

/** グリフを1枚描いてアトラスへ。**ここが唯一 fillText を呼ぶ場所**。 */
function bakeGlyph(faceIdx: number, ch: string, color: string): Glyph {
  const key = glyphKey(faceIdx, ch, color);
  const hit = glyphCache.get(key);
  if (hit) return hit;
  const advance = advanceOf(faceIdx, ch);
  const cv = document.createElement("canvas");
  cv.width = Math.max(2, Math.ceil(advance + GPAD * 2));
  cv.height = GLYPH_PX + GPAD * 2;
  const ctx = cv.getContext("2d");
  if (ctx) {
    ctx.font = cssFont(FONT_FACES[faceIdx], GLYPH_PX);
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(ch, GPAD, cv.height / 2);
  }
  const g = { cv, advance };
  glyphCache.set(key, g);
  return g;
}

export const hasGlyph = (faceIdx: number, ch: string, color: string): boolean =>
  glyphCache.has(glyphKey(faceIdx, ch, color));

/** その文字列に足りないグリフの数。 */
export function missingGlyphs(text: string, seed: string, color: string): number {
  const fi = faceIndexFor(seed);
  let n = 0;
  for (const ch of new Set([...(text ?? "")])) if (!hasGlyph(fi, ch, color)) n++;
  return n;
}

/**
 * 足りないグリフを budget 枚まで描く。**実際に描いた枚数**を返す。
 * ★1枚が実機で数ms〜10ms かかるので、呼び出し側はフレームに数枚ずつ配ること
 * (いっぺんに描くと落下がガクつく。実測で fillText 合計2.4秒)。
 */
export function warmGlyphs(text: string, seed: string, color: string, budget: number): number {
  const fi = faceIndexFor(seed);
  let left = budget;
  for (const ch of new Set([...(text ?? "")])) {
    if (left <= 0) break;
    if (hasGlyph(fi, ch, color)) continue;
    bakeGlyph(fi, ch, color);
    left--;
  }
  return budget - left;
}

/** 書体が揃い直したとき(onFontsReady)に呼ぶ。fallback で描いた絵を捨てる。 */
export function clearGlyphs() {
  glyphCache.clear();
  advanceCache.clear();
}

// ── 箱に収める ──────────────────────────────────────────────

export interface FitLine { text: string; widthAtGlyph: number }
export interface FitResult {
  /** 1文字の高さ(px)。行の高さはこれ × LINE_H。 */
  size: number;
  lines: FitLine[];
}

/** 行の高さ。和文なので詰め気味にする。 */
export const LINE_H = 1.02;

/** その文字列を n 行に割る(文字数がなるべく揃うように)。 */
export function splitLines(text: string, n: number): string[] {
  const chars = [...text];
  if (n <= 1 || chars.length <= 1) return [chars.join("")];
  const per = Math.ceil(chars.length / n);
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += per) out.push(chars.slice(i, i + per).join(""));
  return out;
}

/**
 * 箱 w×h に、その図形の書体1つで組んだ文字列をできるだけ大きく収める。
 * 行数の候補をすべて試し、いちばん文字が大きくなる割り方を選ぶ。
 * 幅は advanceOf のキャッシュから出す(measureText は書体×文字につき1回だけ)。
 */
export function fitText(text: string, seed: string, w: number, h: number, maxLines = 4): FitResult | null {
  const chars = [...(text ?? "").trim()];
  if (!chars.length || w <= 1 || h <= 1) return null;

  const fi = faceIndexFor(seed);
  const widths = chars.map((c) => advanceOf(fi, c));

  let best: FitResult | null = null;
  for (let n = 1; n <= Math.min(maxLines, chars.length); n++) {
    const lines = splitLines(text.trim(), n);
    let at = 0;
    const measured: FitLine[] = lines.map((line) => {
      const count = [...line].length;
      let sum = 0;
      for (let k = 0; k < count; k++) sum += widths[at + k];
      at += count;
      return { text: line, widthAtGlyph: sum };
    });
    const widest = Math.max(...measured.map((m) => m.widthAtGlyph), 1);
    // 幅から決まる大きさと、高さから決まる大きさの小さい方。
    const byW = (w * GLYPH_PX) / widest;
    const byH = h / (lines.length * LINE_H);
    const size = Math.min(byW, byH);
    if (!best || size > best.size) best = { size, lines: measured };
  }
  return best;
}

/** 箱の中央に、fitText の結果をアトラスのグリフで描く。 */
export function drawFitted(
  ctx: CanvasRenderingContext2D,
  fit: FitResult,
  seed: string,
  cx: number,
  cy: number,
  color: string,
) {
  const { size, lines } = fit;
  const fi = faceIndexFor(seed);
  const scale = size / GLYPH_PX;
  const lineH = size * LINE_H;
  const top = cy - (lines.length * lineH) / 2;
  lines.forEach((line, li) => {
    const y = top + lineH * (li + 0.5);
    let x = cx - (line.widthAtGlyph * scale) / 2;
    for (const ch of [...line.text]) {
      const g = bakeGlyph(fi, ch, color);
      ctx.drawImage(
        g.cv,
        x - GPAD * scale, y - (g.cv.height / 2) * scale,
        g.cv.width * scale, g.cv.height * scale,
      );
      x += g.advance * scale;
    }
  });
}

/** 下地の色の明るさから、白と黒のどちらで書くかを決める。 */
export function inkOn(hex: string, light = "#FFFFFF", dark = "#111110"): string {
  const n = hex.replace("#", "");
  const v = parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
  const lum = (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
  return lum > 0.58 ? dark : light;
}
