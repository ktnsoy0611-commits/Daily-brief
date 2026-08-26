// ★★★クラフト紙の目を作る**唯一の場所**(2026-08-26・第63巡にユーザー指定
// 「物理演算が効く、図形やテキストの部分だけ、紙(クラフト紙)のようなテクスチャを
// 薄っすら重ねて」)。第62巡の画面全体のグレイン(`body::after`)は**撤去した**。
//
// ★★第64巡に**本物の写真**へ差し替え、第65巡に**加工をやめた**。
// 第64巡は写真を使ったつもりで3つ手を加えていた ―(1)色を捨ててグレースケール化、
// (2)粒を std 11 → 21.6 へ**2倍に増幅**、(3)ハイパスで低周波を除去。
// 測ってみると写真の低周波は std 1.7〜2.6 しか無く、**(3)はほとんど何も
// 取り除いていない**のに、そのために色と諧調を捨てていた。増幅のせいで圧縮も効かず
// 重くなっていた(121KB)。**手数が多いほど元から遠ざかる**という失敗。
// いまは `tools/make-paper.py` が**等倍で切って縮めるだけ**(768px角・83KB)。
//
// ★★★**紙の凹凸だけを写す**(2026-08-26・第65巡にユーザー確定)。
// 写真の**明るさの起伏だけ**を無彩色(黒/白)で乗せるので、図形の色相は一切動かない。
// 第64巡の「暗い側＝茶／明るい側＝麦わら」という色付けはやめた ― あれは
// 「紙の色を薄く混ぜる」であって「凹凸を写す」ではなかった。
//
// ★★**焼き込む**(ユーザー確定「図形と一緒に回る」)。`lib/solidPaint.ts` が絵を
// 焼くときに1度だけ重ねるので、**毎フレームの負荷はゼロ**で、図形が回れば紙の目も
// 一緒に回る ―「紙に刷ったカードそのもの」になる。
//
// ★強さは `PAPER_ALPHA` の**1つだけ**。濃くしたければここを上げる。
// ★★**写真には二度と手を入れないこと。** 薄く感じたら `PAPER_ALPHA` を上げる。

/** 紙の濃さ。★ユーザー確定「見てわかる程度」(2026-08-26)。 */
export const PAPER_ALPHA = 0.12;

/** シート(`public/paper-kraft.webp`)の作り。★`tools/make-paper.py` と対。
 *  ★**1枚**(第65巡。第64巡は 320px角×4枚だった)。768 あれば図形1つ
 *  (いちばん大きくても 400 デバイス px)は**繰り返しに当たらない**ので、
 *  継ぎ目を消す細工ごと要らなくなった。散らすのは向きとずらしで足りる。 */
const SHEET_SRC = "/paper-kraft.webp";
const SHEET = 768;
/** 明るさのばらつきを、見える濃さへ持ち上げる係数。★据え置き(第64巡と同じ 5.0)。
 *  ★★**写真を増幅しない**ので、結果として第64巡の**約半分の強さ**になる
 *  ― それが「写真そのままの強さ」(ユーザー確定)。 */
const PAPER_GAIN = 5.0;
/** 写真の明るさの中央値(実測 161/255)。ここからの隔たりが凹凸の深さになる。 */
const PAPER_MID = 161 / 255;

let sheet: HTMLImageElement | null = null;
let loading = false;
let onReady: (() => void) | null = null;

/** シートを読み終えたときに呼ぶ先(＝焼いた絵を捨てさせる)。`lib/solidPaint.ts` が入れる。
 *  ★import の輪を作らないよう、こちら側は**相手を知らない**。 */
export function setPaperReadyHandler(fn: () => void): void { onReady = fn; }

function ensureSheet(): void {
  if (sheet || loading || typeof document === "undefined") return;
  loading = true;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    sheet = img;
    // ★読み込みより先に焼かれた絵には紙が乗っていない。捨てて焼き直させる
    //   (次のフレームで戻る)。読めなかったときは**何も乗せない**だけ。
    onReady?.();
  };
  img.onerror = () => { loading = false; };
  img.src = SHEET_SRC;
}

/** 種の文字列 → 32bit。**同じ図形はいつも同じ紙**(見るたび変わるのは紙ではない)。 */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 焼き直したタイル(90度4向き)。要求されたときだけ作る。 */
const tiles = new Map<number, HTMLCanvasElement>();

/**
 * シートを `rot`(0..3 ＝ 90度きざみ)回して、**凹凸の濃さ**へ焼き直す。
 * 明るさの中央値からの隔たりが濃さになり、**暗い側は黒・明るい側は白**。
 * ★色を持たないので、下の図形の色相は一切動かない ―「凹凸だけを写す」。
 */
function tileFor(rot: number): HTMLCanvasElement | null {
  const had = tiles.get(rot);
  if (had) return had;
  if (!sheet) return null;
  const cv = document.createElement("canvas");
  cv.width = SHEET; cv.height = SHEET;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.save();
  ctx.translate(SHEET / 2, SHEET / 2);
  ctx.rotate((rot * Math.PI) / 2);
  ctx.drawImage(sheet, -SHEET / 2, -SHEET / 2, SHEET, SHEET);
  ctx.restore();
  const img = ctx.getImageData(0, 0, SHEET, SHEET);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] / 255 - PAPER_MID;
    const a = Math.min(1, Math.abs(v) * PAPER_GAIN);
    const lit = v < 0 ? 0 : 255;      // 暗い側＝黒(凹) / 明るい側＝白(凸)
    d[i] = lit; d[i + 1] = lit; d[i + 2] = lit;
    d[i + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  tiles.set(rot, cv);
  return cv;
}

/**
 * ★**すでに描かれている所にだけ**紙を重ねる。
 *
 * `source-atop` は「元の絵が不透明な所にだけ乗せる」合成なので、透明な地には
 * 何も乗らない ― だから**図形と文字の面だけ**が紙になる。呼ぶのは
 * `lib/solidPaint.ts` が絵を焼き終えた直後の**オフスクリーン**に対してだけ。
 * ★画面の canvas に対して毎フレーム呼ばないこと(全面の合成が1枚増える)。
 *
 * ★★`seed` は**その絵の名前**(図形なら `paintKey`、文字なら語のキー)。ここから
 * **4向き × ずらし量**を決めるので、隣り合った図形が同じ紙の
 * 同じ場所になることがない ―「同じテクスチャの繰り返しに見えない」
 * (第64巡のユーザー指定)。同じ絵はいつも同じ紙になる。
 */
export function paperize(
  ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, seed: string,
): void {
  ensureSheet();
  if (!sheet || w <= 0 || h <= 0) return;
  const n = hash32(seed);
  const tile = tileFor(n % 4);
  if (!tile) return;
  const ox = (n >>> 4) % SHEET;
  const oy = (n >>> 14) % SHEET;
  const pat = ctx.createPattern(tile, "repeat");
  if (!pat) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = PAPER_ALPHA;
  // ★タイルは**デバイス画素**で持っているので、変形を素へ戻してから貼る
  //   (CSS px の座標系で貼ると紙の目まで拡大されて、ただのシミになる)。
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(-ox, -oy);
  ctx.fillStyle = pat;
  ctx.fillRect(ox, oy, w * dpr, h * dpr);
  ctx.restore();
}
