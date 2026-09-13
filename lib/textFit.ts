import { FONT_FACES } from "./constants";
import type { FontFace } from "./constants";


// ★図形の上に載せる文字。
//
// ★書体は**1つだけ**(2026-09-12・第93巡にタグを廃止)。番号は
// `lib/constants.ts` の `SHAPE_FACE` が持ち、ここは「番号で渡された書体で
// 組む」だけ。★書体で分類を作らないこと（分類は塗り／輪郭が言う）。
//
// ★★★組み方は**1つだけ**(2026-09-13・第100巡)。
//   layoutInRows … **段（ピルの1段）の刻みが先に決まっていて、そこへ1行ずつ**
//                  置く。字は `pitch × ROW_FILL` で始め、入らなければ縮める。
//                  四方のベゼルは段の余りから出る（数を置かない）。
//   ★`fitText`（矩形いっぱい）と `layoutInShape`（形に沿って折り返す）は消した。
//     理由はこのファイル下部の「第100巡に3つ消した」を読むこと。
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

// ★★**断片が届くたびにアトラスを捨ててはいけない**(2026-08-17に実機で
// 「文字が表示されない・アプリ全体が不安定」として報告された)。
//
// 和文は unicode-range で **100 以上の断片**に分かれて配信され、こちらが
// 文字ごとに load() を呼ぶので `loadingdone` は何十回も飛ぶ。以前はその
// たびに glyphCache と bitmap を**全消し**していた。グリフは1フレームに
// 数枚しか焼かないので、焼き切る前に次の断片が届いて振り出しに戻り、
// **どの図形も「文字が揃った」状態にならないまま絵だけが焼かれ続けた**。
// 落下の rAF も「まだ焼けていない絵がある」で止まらなくなる。
//
// なので (1) **まとめて1回**にし、(2) **届いた面のぶんだけ**捨てる。
/** 捨てるのをまとめる時間(ms)。 */
const FLUSH_MS = 400;
let flushTimer = 0;
let flushAll = false;
const flushFaces = new Set<number>();

function scheduleFlush(face?: number) {
  if (face === undefined) flushAll = true;
  else flushFaces.add(face);
  if (flushTimer || typeof window === "undefined") return;
  flushTimer = window.setTimeout(() => {
    flushTimer = 0;
    if (flushAll) {
      flushAll = false;
      flushFaces.clear();
      clearGlyphs();
    } else {
      for (const f of flushFaces) dropFace(f);
      flushFaces.clear();
      readyCache.clear();
    }
    for (const cb of listeners) cb();
  }, FLUSH_MS);
}

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

/** ★**キャッシュを通さない**生の判定。`document.fonts.check` を直接読む。
 *  取りに行く前後の比較にはこちらを使うこと — `fontReady` を使うと、
 *  「取りに行く前の false」がキャッシュに焼き付いて、届いたあとも false を
 *  読み続け、**焼き直しの通知が一度も飛ばなくなる**(2026-08-17に判明。
 *  これが「文字が永久に出ない」もう1つの原因)。 */
function checkFace(fi: number, text: string): boolean {
  if (typeof document === "undefined" || !document.fonts?.check) return true;
  try { return document.fonts.check(loadFont(FONT_FACES[fi], GLYPH_PX), text || "あ"); }
  catch { return true; }
}

/** その書体が**その文字を本当に描けるか**(＝本物の断片が届いているか)。
 *  ★結果を覚える。plan を作るたびに check を呼ぶと積み上がる(実測で 45ms)。
 *  届いたときは scheduleFlush が忘れさせるので、古い false は残らない。 */
const readyCache = new Map<string, boolean>();
export function fontReady(face: number, text: string): boolean {
  const fi = clampFace(face);
  const key = `${fi}|${text}`;
  const hit = readyCache.get(key);
  if (hit !== undefined) return hit;
  const ok = checkFace(fi, text);
  readyCache.set(key, ok);
  return ok;
}

// ★★**門は時間で必ず開ける**(2026-08-17)。
// 「書体が届くまで文字を描かない」だけだと、届かない・判定が通らない・
// 通知が飛ばないのどれか1つで**文字が永久に出ない**。実機でそうなった。
// 頼んでから GATE_MS 過ぎたら、届いていなくても描く。混ざりは
// 「届いた面を捨てて焼き直す」が引き受ける。
// **「何も出ない」より「一度 fallback で出てから本物に差し替わる」**。
/** 書体を待つ上限(ms)。 */
const GATE_MS = 600;
/** その面を最初に頼んだ時刻。 */
const askedAt = new Map<number, number>();

/** 描いてよいか。届いている、または待ちすぎたら真。 */
export function textDrawable(face: number, text: string): boolean {
  const fi = clampFace(face);
  if (fontReady(fi, text)) return true;
  const t0 = askedAt.get(fi);
  return t0 !== undefined && Date.now() - t0 > GATE_MS;
}

/** 門が開く時刻に1度だけ知らせる(割り付けのキャッシュを捨ててもらうため)。 */
function armGate(fi: number) {
  if (askedAt.has(fi) || typeof window === "undefined") return;
  askedAt.set(fi, Date.now());
  window.setTimeout(() => {
    readyCache.clear();
    for (const cb of listeners) cb();
  }, GATE_MS + 40);
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
  armGate(fi);
  // まだ使えないものだけ、届いた時点で焼き直しを知らせる
  // (使えるものまで捨てると描き直しが延々続く)。
  const had = checkFace(fi, need);
  try {
    // ★**先頭の family だけ**で頼む(上記の理由。スタックごと渡すと取りに行かない)。
    // load() の Promise は必ず握りつぶす(unhandled rejection で pageerror)。
    document.fonts.load(loadFont(FONT_FACES[fi], GLYPH_PX), need)
      .then(() => { if (!had && checkFace(fi, need)) scheduleFlush(fi); })
      .catch(() => {});
  } catch { /* noop */ }
}

/** いま「使える」と判定できる面の並び。変わっていないなら捨てる必要は無い。 */
let readySig: string | null = null;
const faceSig = () => FONT_FACES.map((_, i) => (checkFace(i, "") ? "1" : "0")).join("");

/** 書体が届いて焼き直しが要るときに呼ばれる。返り値で購読をやめる。 */
export function onFontsReady(cb: () => void): (() => void) | undefined {
  if (typeof document === "undefined" || !document.fonts) return;
  listeners.add(cb);
  if (readySig === null) readySig = faceSig();
  // ★★**購読しただけで呼び返さないこと**(2026-08-18・第17巡)。
  // 以前は `document.fonts.ready.then(cb)` を置いていた。これは**もう揃って
  // いれば即座に解決する**ので、`SolidCanvas` が1枚マウントされるたびに
  // コールバックが走っていた。そのコールバックは `clearSolidBitmaps()` ＝
  // **みんなで使っている焼き上がりの全消し**なので、入力画面を開くだけで
  // 山の絵が全部消え、閉じたあとに焼き直されて**文字が点滅**していた
  // (実機で報告。Chromium でも閉じた 350ms 後に色数 241→51 と再現)。
  // 揃っていない面は `requestGlyphs` の `load().then` が拾うので、これは要らない。
  //
  // ★安全網。こちらが取りに行っていない書体(他の画面のもの)が届いた場合も拾う。
  // ただし**読み込みが落ち着いたとき**かつ**面の顔ぶれが実際に変わったとき**
  // だけ動かす。断片が届くたびに動かすと、1フレームに数枚しか焼けない
  // アトラスを捨て続けて永久に焼き終わらない(2026-08-17に実機で報告)。
  const on = () => {
    if (document.fonts.status !== "loaded") return;
    const sig = faceSig();
    if (sig === readySig) return;
    readySig = sig;
    scheduleFlush();
  };
  document.fonts.addEventListener?.("loadingdone", on);
  return () => {
    listeners.delete(cb);
    document.fonts.removeEventListener?.("loadingdone", on);
  };
}

export const cssFont = (f: FontFace, size: number): string =>
  `${f.italic ? "italic " : ""}${f.weight} ${size}px ${resolveFamily(f.family)}`;

/** ★`lib/constants.ts` の `LATIN` / `SANS` のように **`var(--font-…)` を含む**
 *  書体指定を、canvas の `ctx.font` で使える形へ直す。★直接代入すると黙って失敗し、
 *  10px サンセリフのままになる(第56巡に「自由」のブロックが豆粒になった)。 */
export const canvasFont = (weight: number, px: number, family: string): string =>
  `${weight} ${px}px ${resolveFamily(family)}`;

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
// 7段にしたら落下中の fillText が 868ms まで増えた(実測)。
// ★★第62巡に **144 の段を足して4段**にした。山の題は 40px 級で、画面の倍率
// (2)を掛けると 80px を超える ― 96 で頭打ちだったので、いちばん大きい文字だけ
// **拡大されて**いた(「文字が滲む」の残り半分)。4段までなら焼き直しは許容範囲。
// ★★★第92巡に **192 の段を足して5段**にした。**同じ理由・同じ場所**の再発 ――
// ホームの山は画面の倍率をそのまま(実機 3)使うようにしたので、題が
// 57 × 3 = 171px になり、144 で頭打ちだと**いちばん大きい字だけ拡大されて滲む**。
// ★TASK 側は倍率 2 のままで 144 を超えないので、焼き直しは増えない。
const BUCKETS = [32, 64, 96, 144, 192] as const;

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

/**
 * ★**その面のぶんだけ**捨てる(2026-08-17)。届いたのは1つの書体なのに
 * 全部捨てていたため、他の面まで焼き直しになって焼き終わらなかった。
 * キーはどちらも `face|…` で始まるので、前方一致で選べる。
 */
function dropFace(face: number) {
  const head = `${face}|`;
  for (const k of [...glyphCache.keys()]) if (k.startsWith(head)) glyphCache.delete(k);
  for (const k of [...advanceCache.keys()]) if (k.startsWith(head)) advanceCache.delete(k);
  for (const k of [...readyCache.keys()]) if (k.startsWith(head)) readyCache.delete(k);
}

// ── 箱に収める ──────────────────────────────────────────────

export interface FitLine { text: string; widthAtGlyph: number }
export interface FitResult {
  /** 1文字の高さ(px)。行の高さはこれ × LINE_H。 */
  size: number;
  lines: FitLine[];
  /** ★★★**行ごとの中心 y**（図形の中心からの px）。`layoutInRows` だけが入れる。
   *  入っていれば `drawFitted` は**等間隔に積むのをやめて、この位置に置く**。 */
  ys?: number[];
}

/** 行の高さ。和文なので詰め気味にする。 */
export const LINE_H = 1.02;

/**
 * ★★★**ピルの段の中に置く字の em ÷ 段の刻み**（2026-09-13・第100巡にユーザー指定
 * 「**一つのピルの段に対して一行の文字**が来るように、**一行の文字がピルの段の中心**に
 * 来るように。その時**文字とピルの輪郭の間のスペーシング**をちゃんと適切に」）。
 *
 * ★★これが「文字とピルの輪郭の間のスペーシング」の**唯一の出どころ** ――
 *   段の刻み `pitch` に対して字は `pitch × ROW_FILL`、残りの
 *   `pitch × (1 − LINE_H × ROW_FILL)` が上下の余りで、**その半分を左右にも使う**
 *   （上下左右が同じ px になるので、ピルの中で字が浮いて見えない）。
 * ★★`lib/taskSize.ts` の `rowAspect`（箱の比）も**この同じ数から**出る。
 *   箱を決める側と字を詰める側が別の数を持つと、箱が字に足りない。
 * ★目盛りの外（**部品の内部の比**。`TYPE` の段ではない）。
 */
export const ROW_FILL = 0.62;

/** その文字列を n 行に割る(文字数がなるべく揃うように)。 */
export function splitLines(text: string, n: number): string[] {
  const chars = [...text];
  if (n <= 1 || chars.length <= 1) return [chars.join("")];
  const per = Math.ceil(chars.length / n);
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += per) out.push(chars.slice(i, i + per).join(""));
  return out;
}

// ★★★**第100巡に3つ消した。復活させない。**
//   `fitText`（矩形いっぱいに収める。廃止したタグ名専用だった）／
//   `layoutInShape`（**行の高さ `size × LINE_H` の塊を箱の中心に置く**）／
//   `wrapPerLine`（その貪欲な折り返し）。
//   ★★**`layoutInShape` は段の刻み `boxH / rows` を知らない**ので、ピルの積みと
//   原理的に噛み合わない（ユーザー指摘「文字の行と段がうまく噛み合っていません」）。
//   いま文字を組むのは **`layoutInRows` だけ**。割り付けを2つ持つと、また
//   片方だけが段を知らないまま残る。

/**
 * ★★★**段の中に1行ずつ置く**（2026-09-13・第100巡）。
 *
 * `layoutInShape` は「**行の高さ `size × LINE_H` で塊を作り、それを箱の中心に置く**」。
 * ピルの段の中心は「**刻み `boxH / rows`**」。**2つは別の刻み**なので、
 * 一致するのは `size × LINE_H === boxH / rows` かつ 行数 === 段数 のときだけで、
 * どちらも強制されていなかった ―― これが「文字の行と段が噛み合っていない」の正体。
 *
 * ★★★だから**段を先に決め、そこへ1行ずつ入れる**。段数は
 * `lib/taskSize.ts` の `rowsOf`（**題の純関数**）が決めているので、
 * **形・箱の比・行数が同じ1つの数から出る**。
 *
 * @param rows      段の数（1..）。**行数はこれに合わせる**（`splitLines`）。
 * @param halfWidth その高さ(-0.5〜0.5)での半幅(0〜0.5)。`halfWidthAtStack` を渡す。
 * @returns `ys` に**段の中心**が入った割り付け。入らないなら null。
 */
export function layoutInRows(
  text: string, face: number, rows: number,
  boxW: number, boxH: number, halfWidth: (t: number) => number,
  basePx: number, minPx = 7,
): (FitResult & { ys: number[] }) | null {
  const chars = [...(text ?? "").trim()];
  if (!chars.length || boxW <= 1 || boxH <= 1) return null;
  const n = Math.max(1, Math.round(rows || 1));
  const fi = clampFace(face);
  const pitch = boxH / n;
  // ★行は**必ず段の数だけ**に割る（文字数がなるべく揃うように）。
  //   ★文字が段より少ないときは行が足りないので、**使う段を上下の中央へ寄せる**。
  const parts = splitLines(text.trim(), n);
  const k = parts.length;
  const off = (n - k) / 2;
  const ys = parts.map((_, i) => -boxH / 2 + pitch * (i + off + 0.5));
  const widths = parts.map((s) => [...s].reduce((a, c) => a + advanceOf(fi, c), 0));

  // ★出発点は「段の刻みの ROW_FILL」。ここから入るまで縮める。
  let size = Math.min(basePx, pitch * ROW_FILL);
  for (let pass = 0; pass < 8; pass++) {
    if (size < minPx) return null;
    const lh = size * LINE_H;
    // ★★上下の余りの半分を**左右のベゼルにも使う**（四方が同じ px）。
    const bezel = (pitch - lh) / 2;
    if (bezel <= 0) { size /= 1.06; continue; }
    // ★段で使える幅は**字の上端と下端の高さ**で測る（段の中心で測ると角丸に食い込む）。
    const maxWs = ys.map((cy) => {
      const a = halfWidth((cy - lh / 2) / boxH);
      const b = halfWidth((cy + lh / 2) / boxH);
      return Math.max(1, Math.min(a, b) * 2 * boxW - bezel * 2);
    });
    let over = 1;
    for (let i = 0; i < k; i++) {
      over = Math.max(over, (widths[i] * size) / GLYPH_PX / maxWs[i]);
    }
    if (over <= 1.001) {
      return { size, lines: parts.map((t, i) => ({ text: t, widthAtGlyph: widths[i] })), ys };
    }
    size /= Math.min(over, 1.4);
  }
  return null;
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
    // ★★`ys` があれば**段の中心**に置く（`layoutInRows`）。無ければ等間隔に積む。
    const y = fit.ys ? cy + fit.ys[li] : top + lineH * (li + 0.5);
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
// 文字の色は面から導く(`lib/palette.ts` の `bodyInkOn`)ので、
// 明度から機械的に選ぶと画像の組み合わせと食い違う(2026-08-16確定)。
