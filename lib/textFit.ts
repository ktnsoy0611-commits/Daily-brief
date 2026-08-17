import { FONT_FACES } from "./constants";
import type { FontFace } from "./constants";
import { clampSides, halfWidthAt } from "./solid";

// ★図形の上に載せる文字。
//
// ★書体は**タグごとに1つ**(2026-08-16にユーザー確定)。どの書体を使うかは
// lib/taskTags.ts が持ち、ここは「番号で渡された書体で組む」だけ。
// 以前は id から決めていた(faceIndexFor)が、同じタグのタスクが別々の書体に
// なって見分けが付かないため廃止した。
//
// 組み方は2種類:
//   fitText   … 箱いっぱいに**できるだけ大きく**。BOTTOM のタグ名が使う。
//   layoutInShape … **一定の大きさ**から始め、**形の輪郭に沿って**折り返し、
//                   入らなければ縮める。
//                FRONT のタイトルが使う(左下寄せ)。
//
// ★★文字は**グリフのアトラス**を経由して描く。canvas の fillText は、和文の
// Webフォント(unicode-range で数百の @font-face に分割されている)に対して
// 1回 10ms 級の照合+ラスタライズが走る(実測: 落下中の fillText 合計 2.4秒)。
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

/** 書体の番号を FONT_FACES の範囲へ丸める。 */
export const clampFace = (face: number): number =>
  Math.max(0, Math.min(FONT_FACES.length - 1, Math.round(face || 0)));

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

// ── 書体が届いたら焼き直す ──────────────────────────────────
//
// ★和文の Web フォントは unicode-range で数百の断片に分かれて配信される。
// 断片の取得が始まるのは**その文字を初めて描いた瞬間**なので、
// `document.fonts.ready` はとっくに解決したあとに届く。待ちの姿勢だと
// 「たまに前の書体のまま固まる」(2026-08-16に実機で報告された)。
//
// そこで**こちらから取りに行く**。焼く前に ensureGlyphs() を呼び、
// その (書体, 文字) が**まだ使えないとき**だけ、届いた時点で
// 焼いた絵を捨てて購読者へ知らせる。

const listeners = new Set<() => void>();
const notify = () => { readyCache.clear(); clearGlyphs(); for (const cb of listeners) cb(); };

/**
 * ★★**`document.fonts` には「先頭の family だけ」を渡すこと。**
 *
 * next/font は `--font-dela-gothic-one` を
 * `"Dela Gothic One", "Dela Gothic One Fallback"` に展開する。後ろの
 * *Fallback* は**端末にあるフォントに寸法だけ合わせた local()** なので、
 * **いつでも「読み込み済み」**。だからスタックごと渡すと
 *   - `load()`  … Fallback で即 resolve し、**本物の断片を取りに行かない**
 *   - `check()` … Fallback があるので常に false/true が当てにならない
 * となる。実測: スタックで load → 塗り率 17%(素のサンセリフ)のまま。
 * 先頭だけで load → 37.9%(本物の Dela)。
 *
 * つまりこれを間違えると、**和文のディスプレイ書体は一度も表示されない**
 * (2026-08-17に判明。それまでの「書体の違い」は太さと斜体の合成だけだった)。
 */
function primaryFamily(family: string): string {
  return resolveFamily(family).split(",")[0].trim();
}

const loadFont = (f: FontFace, size: number): string =>
  `${f.italic ? "italic " : ""}${f.weight} ${size}px ${primaryFamily(f.family)}`;

/** その書体が**その文字を本当に描けるか**(＝本物の断片が届いているか)。
 *  ★結果を覚える。plan を作るたびに check を呼ぶと積み上がる(実測で 45ms)。
 *  届いたときは notify() が忘れさせるので、古い false は残らない。 */
const readyCache = new Map<string, boolean>();
export function fontReady(face: number, text: string): boolean {
  if (typeof document === "undefined" || !document.fonts?.check) return true;
  const fi = clampFace(face);
  const key = `${fi}|${text}`;
  const hit = readyCache.get(key);
  if (hit !== undefined) return hit;
  let ok = true;
  try { ok = document.fonts.check(loadFont(FONT_FACES[fi], GLYPH_PX), text || "あ"); }
  catch { ok = true; }
  readyCache.set(key, ok);
  return ok;
}

/** その (書体, 文字) の組を取りに行く。**焼く直前に必ず呼ぶこと。** */
const asked = new Set<string>();
export function ensureGlyphs(face: number, text: string) {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const fi = clampFace(face);
  const need = [...new Set([...(text ?? "")])].filter((c) => {
    const k = `${fi}|${c}`;
    if (asked.has(k)) return false;
    asked.add(k);
    return true;
  }).join("");
  if (!need) return;
  // まだ使えないものだけ、届いた時点で焼き直しを知らせる
  // (使えるものまで捨てると描き直しが延々続く)。
  const had = fontReady(fi, need);
  try {
    // ★**先頭の family だけ**で頼む(上記の理由。スタックごと渡すと取りに行かない)。
    // load() の Promise は必ず握りつぶす(unhandled rejection で pageerror)。
    document.fonts.load(loadFont(FONT_FACES[fi], GLYPH_PX), need)
      .then(() => { if (!had && fontReady(fi, need)) notify(); })
      .catch(() => {});
  } catch { /* noop */ }
}

/** 書体が届いて焼き直しが要るときに呼ばれる。返り値で購読をやめる。 */
export function onFontsReady(cb: () => void): (() => void) | undefined {
  if (typeof document === "undefined" || !document.fonts) return;
  listeners.add(cb);
  document.fonts.ready?.then(() => cb()).catch(() => {});
  // 保険。こちらが取りに行っていない書体(他の画面のもの)が届いた場合も拾う。
  const on = () => { clearGlyphs(); cb(); };
  document.fonts.addEventListener?.("loadingdone", on);
  return () => {
    listeners.delete(cb);
    document.fonts.removeEventListener?.("loadingdone", on);
  };
}

export const cssFont = (f: FontFace, size: number): string =>
  `${f.italic ? "italic " : ""}${f.weight} ${size}px ${resolveFamily(f.family)}`;

// ── グリフのアトラス ────────────────────────────────────────

/** 送り幅を測る基準の大きさ。**幅の比率**を持つためだけの値で、
 *  実際にラスタライズする大きさ(バケツ)とは別。 */
export const GLYPH_PX = 128;

/**
 * ★ラスタライズする大きさの**バケツ**(2026-08-16)。
 * 以前は常に 128px で焼いて表示サイズ(13px 級)へ縮めていたため、
 * **9.5倍の縮小**になり canvas の drawImage が標本を落として文字が
 * ジャギーになっていた。「表示サイズ × dpr 以上でいちばん小さいバケツ」を
 * 選べば、縮小率は 1.5倍以内に収まる。
 */
// ★段を増やしすぎないこと。同じ文字が段の数だけ焼き直されるので、
// 7段にしたら落下中の fillText が 868ms まで増えた(実測)。3段なら
// 縮小率は最悪 1.94倍に収まり、焼く回数は 1/2 以下になる。
const BUCKETS = [32, 64, 96] as const;

export function bucketFor(px: number): number {
  for (const b of BUCKETS) if (b >= px) return b;
  return BUCKETS[BUCKETS.length - 1];
}

/** はみ出し(斜体・明朝のハネ)のための余白。バケツの大きさに比例させる。 */
const gpad = (bucket: number) => Math.round(bucket * 0.3);

interface Glyph { cv: HTMLCanvasElement; advance: number; bucket: number }

const glyphCache = new Map<string, Glyph>();
const advanceCache = new Map<string, number>();

let measureCtx: CanvasRenderingContext2D | null = null;
function ctxForMeasure(): CanvasRenderingContext2D | null {
  if (!measureCtx && typeof document !== "undefined") {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  return measureCtx;
}

/** 和文の全角(かな・漢字・全角記号)。送り幅は必ず 1em なので測らない。
 *  ★measureText は和文のWebフォントだと1回 5ms 級で、題の文字数ぶんが
 *  1フレームにまとまって走る(実測 合計666ms)。全角を弾くだけでその
 *  ほとんどが消える。 */
const FULL_WIDTH = /[\u3000-\u30FF\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFF60\uFFE0-\uFFE6]/;

/** その (書体, 文字) の送り幅(GLYPH_PX 基準)。一度測ったら二度と測らない。 */
export function advanceOf(faceIdx: number, ch: string): number {
  if (FULL_WIDTH.test(ch)) return GLYPH_PX;
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

/**
 * 送り幅をあらかじめ測っておく。budget 組まで測り、**測った組数**を返す。
 * ★欧文は全角の近道が効かないので1文字ずつ measureText が要る。タグの英字
 * (WORK/LIFE/…)は 5書体 × 十数文字あり、ビューを切り替えた瞬間にまとめて
 * 走ると 328ms 止まった(実測)。開いた直後の暇な時間に少しずつ潰しておく。
 */
export function primeAdvances(texts: string[], faces: number[], budget: number): number {
  let done = 0;
  for (const face of faces) {
    const fi = clampFace(face);
    for (const t of texts) {
      for (const ch of new Set([...t])) {
        if (done >= budget) return done;
        if (FULL_WIDTH.test(ch) || advanceCache.has(`${fi}|${ch}`)) continue;
        advanceOf(fi, ch);
        done++;
      }
    }
  }
  return done;
}

// ★★**書体が届くまで文字を焼かない**(2026-08-17に方針転換)。
// グリフは1フレームに1枚しか焼かない(落下のガクつき対策)ので、焼いている
// 途中で書体が届くと「前半は fallback・後半は本物」の絵になる。以前は
// キーに ready を混ぜて回避したが、キャッシュを捨てる順番に依存していて
// 実機では混ざり続けた。**そもそも fallback で焼かない**ことにすれば、
// 混ざった絵は存在し得ない(solidPaint の computeTextPlan が門番)。
const glyphKey = (faceIdx: number, ch: string, color: string, bucket: number) =>
  `${faceIdx}|${ch}|${color}|${bucket}`;

/** グリフを1枚描いてアトラスへ。**ここが唯一 fillText を呼ぶ場所**。 */
function bakeGlyph(faceIdx: number, ch: string, color: string, bucket: number): Glyph {
  const key = glyphKey(faceIdx, ch, color, bucket);
  const hit = glyphCache.get(key);
  if (hit) return hit;
  const pad = gpad(bucket);
  // 送り幅は GLYPH_PX 基準の比率で持っているので、バケツの大きさへ直す。
  const advance = (advanceOf(faceIdx, ch) / GLYPH_PX) * bucket;
  const cv = document.createElement("canvas");
  cv.width = Math.max(2, Math.ceil(advance + pad * 2));
  cv.height = bucket + pad * 2;
  const ctx = cv.getContext("2d");
  if (ctx) {
    ctx.font = cssFont(FONT_FACES[faceIdx], bucket);
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(ch, pad, cv.height / 2);
  }
  const g = { cv, advance, bucket };
  glyphCache.set(key, g);
  return g;
}

export const hasGlyph = (faceIdx: number, ch: string, color: string, bucket: number): boolean =>
  glyphCache.has(glyphKey(faceIdx, ch, color, bucket));

/** その文字列に足りないグリフの数。
 *  ★bucket は**描くときと同じ値**を渡すこと。ずれると「用意できている」と
 *  判断したのに描画時に焼き直しが走り、落下が一瞬止まる。 */
export function missingGlyphs(
  text: string, face: number, color: string, bucket: number,
): number {
  const fi = clampFace(face);
  const b = bucketFor(bucket);
  let n = 0;
  for (const ch of new Set([...(text ?? "")])) if (!hasGlyph(fi, ch, color, b)) n++;
  return n;
}

/**
 * 足りないグリフを budget 枚まで描く。**実際に描いた枚数**を返す。
 * ★1枚が実機で数ms〜10ms かかるので、呼び出し側はフレームに数枚ずつ配ること
 * (いっぺんに描くと落下がガクつく。実測で fillText 合計2.4秒)。
 */
export function warmGlyphs(
  text: string, face: number, color: string, bucket: number, budget: number,
): number {
  const fi = clampFace(face);
  const b = bucketFor(bucket);
  let left = budget;
  for (const ch of new Set([...(text ?? "")])) {
    if (left <= 0) break;
    if (hasGlyph(fi, ch, color, b)) continue;
    bakeGlyph(fi, ch, color, b);
    left--;
  }
  return budget - left;
}

/** 書体が揃い直したとき(onFontsReady)に呼ぶ。fallback で描いた絵を捨てる。 */
export function clearGlyphs() {
  glyphCache.clear();
  advanceCache.clear();
  readyCache.clear();
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
 * 箱 w×h に、その書体で組んだ文字列を**できるだけ大きく**収める。
 * 行数の候補をすべて試し、いちばん文字が大きくなる割り方を選ぶ。
 * ★BOTTOM のタグ名専用(「図形いっぱいに」というユーザー指定を守る)。
 * タイトルは layoutInShape を使うこと(形に沿って折り返す)。
 * 幅は advanceOf のキャッシュから出す(measureText は書体×文字につき1回だけ)。
 */
export function fitText(text: string, face: number, w: number, h: number, maxLines = 4): FitResult | null {
  const chars = [...(text ?? "").trim()];
  if (!chars.length || w <= 1 || h <= 1) return null;

  const fi = clampFace(face);
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

/**
 * ★**形に合わせて折り返す**版(2026-08-16にユーザー指摘で追加)。
 * 行ごとに使える幅を断面の輪郭から引くので、三角のように上が狭い形でも
 * 下の広いところを目一杯使える。
 *
 * 矩形1つ(innerBox)で収めていた頃は、三角が外接箱の 23% しか使えず
 * (四角は 79%)、同じ面積でも三角だけ文字が半分以下になっていた。
 *
 * @param sides 断面の形(1..4)
 * @param boxW  外接箱の幅(px) / @param boxH 外接箱の高さ(px)
 * @returns 収まった結果 ＋ ブロックの中心 y(図形の中心からの px)。
 *          minPx を割るほど縮めないと入らないなら null。
 */
export function layoutInShape(
  text: string, face: number, sides: number,
  boxW: number, boxH: number,
  basePx: number, maxLines = 3, minPx = 7,
): (FitResult & { cy: number }) | null {
  const chars = [...(text ?? "").trim()];
  if (!chars.length || boxW <= 1 || boxH <= 1) return null;
  const fi = clampFace(face);
  const widths = chars.map((c) => advanceOf(fi, c));
  // 輪郭へ文字が触れないための余白(幅の比・高さの比)。
  const INSET = 0.9;
  const PAD_Y = 0.05;
  // ★三角だけ**下寄せ**。頂点の側は幅が0に近く、中央に置くと入らない。
  const bottomUp = clampSides(sides) === 3;

  /** その行(中心 y・高さ lh)で使える幅(px)。**狭い方の端**で測る。 */
  const widthOfLine = (cy: number, lh: number): number => {
    const a = halfWidthAt(sides, (cy - lh / 2) / boxH);
    const b = halfWidthAt(sides, (cy + lh / 2) / boxH);
    return Math.min(a, b) * 2 * boxW * INSET;
  };

  let size = Math.min(basePx, boxH / LINE_H);
  for (let pass = 0; pass < 8; pass++) {
    if (size < minPx) return null;
    const lh = size * LINE_H;
    const limit = boxH * (1 - PAD_Y * 2);
    // 行数の候補を小さい方から試し、最初に収まったものを採る。
    // 収まらなかったときは、**いちばん惜しかったはみ出し具合**で縮める
    // (固定の倍率で刻むと、あと数%のところで打ち切って文字なしになる)。
    let best = Infinity;
    for (let k = 1; k <= maxLines; k++) {
      const block = k * lh;
      if (block > limit) break;
      const top = bottomUp ? boxH * (0.5 - PAD_Y) - block : -block / 2;
      const maxWs = Array.from({ length: k }, (_, i) => widthOfLine(top + lh * (i + 0.5), lh));
      if (maxWs.some((w) => w < size * 0.9)) continue; // その行に1文字も入らない
      const lines = wrapPerLine(chars, widths, maxWs.map((w) => (w * GLYPH_PX) / size), k);
      if (lines.length > k) continue;
      const over = Math.max(...lines.map((l, i) => (l.widthAtGlyph * size) / GLYPH_PX / maxWs[i]));
      if (over <= 1.001) return { size, lines, cy: top + block / 2 };
      best = Math.min(best, over);
    }
    // 行数を増やせば入る場合もあるので、縮め幅は控えめに見積もる。
    size /= Math.min(Math.max(Number.isFinite(best) ? best : 1.14, 1.04), 1.4);
  }
  return null;
}

/** 行ごとに違う幅(グリフ座標)で貪欲に折り返す。maxLines を超えた分は最後へ。 */
function wrapPerLine(chars: string[], widths: number[], maxW: number[], maxLines: number): FitLine[] {
  const out: FitLine[] = [];
  let text = "";
  let sum = 0;
  for (let i = 0; i < chars.length; i++) {
    const cap = maxW[Math.min(out.length, maxW.length - 1)];
    if (text && sum + widths[i] > cap && out.length < maxLines - 1) {
      out.push({ text, widthAtGlyph: sum });
      text = chars[i];
      sum = widths[i];
      continue;
    }
    text += chars[i];
    sum += widths[i];
  }
  if (text) out.push({ text, widthAtGlyph: sum });
  return out;
}

/**
 * アトラスのグリフで文字を描く。(cx, cy) がブロックの**中心**
 * (2026-08-16にユーザー確定で中央揃えに統一。左下寄せは廃止)。
 *
 * ★`bucket` は「その canvas の実解像度での表示サイズ」を渡すこと
 * (= 表示px × dpr)。焼く大きさが表示に近いほど縮小率が下がり、
 * ジャギーが出ない。
 */
export function drawFitted(
  ctx: CanvasRenderingContext2D,
  fit: FitResult,
  face: number,
  cx: number,
  cy: number,
  color: string,
  bucketPx = fit.size,
) {
  const { size, lines } = fit;
  const fi = clampFace(face);
  const bucket = bucketFor(bucketPx);
  const pad = gpad(bucket);
  // グリフは bucket px で焼いてあるので、表示サイズへ直す倍率。
  const scale = size / bucket;
  const lineH = size * LINE_H;
  const top = cy - (lines.length * lineH) / 2;
  ctx.imageSmoothingQuality = "high";
  lines.forEach((line, li) => {
    const y = top + lineH * (li + 0.5);
    // widthAtGlyph は GLYPH_PX 基準なので、表示サイズへ直す。
    let x = cx - (line.widthAtGlyph * size) / GLYPH_PX / 2;
    for (const ch of [...line.text]) {
      const g = bakeGlyph(fi, ch, color, bucket);
      ctx.drawImage(
        g.cv,
        x - pad * scale, y - (g.cv.height / 2) * scale,
        g.cv.width * scale, g.cv.height * scale,
      );
      x += g.advance * scale;
    }
  });
}

// ★以前ここにあった inkOn(下地の明度から白か黒を選ぶ)は削除した。
// 文字の色はカラースキームの組が決める(lib/taskTags.ts の tagInk)ので、
// 明度から機械的に選ぶと画像の組み合わせと食い違う(2026-08-16確定)。
