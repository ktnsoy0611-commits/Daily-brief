// ★★★クラフト紙の目を作る**唯一の場所**(2026-08-26・第63巡にユーザー指定
// 「物理演算が効く、図形やテキストの部分だけ、紙(クラフト紙)のようなテクスチャを
// 薄っすら重ねて」)。第62巡の画面全体のグレイン(`body::after`)は**撤去した**。
//
// ★★第64巡に**本物の写真**へ差し替えた(ユーザーがクラフト紙の写真を添付)。
// 第63巡はその場で作ったバリューノイズだったが、本物の紙は「均一な雑音」ではなく
// **繊維の筋・木片の斑点・細かいシワ**が不揃いに散っているもので、作り物では出ない。
// 元画像は 5705×8000 の JPEG 20.8MB なので、**そのまま持ち込まない** ―
// `scratchpad/make-paper.py` で 4か所を切り出し、大きなぼかしを引いて
// (＝照明・色ムラ・大きなシワを捨てて繊維だけ残し)、継ぎ目を混ぜて、
// **320px 角 × 4枚のシート**(`public/paper-kraft.webp` / 121KB)にしてある。
//
// ★★**焼き込む**(ユーザー確定「図形と一緒に回る」)。`lib/solidPaint.ts` が絵を
// 焼くときに1度だけ重ねるので、**毎フレームの負荷はゼロ**で、図形が回れば紙の目も
// 一緒に回る ―「紙に刷ったカードそのもの」になる。
//
// ★強さは `PAPER_ALPHA` の**1つだけ**。濃くしたければここを上げる。

/** 紙の濃さ。★ユーザー確定「見てわかる程度」(2026-08-26)。 */
export const PAPER_ALPHA = 0.12;

/** シート(`public/paper-kraft.webp`)の作り。★`scratchpad/make-paper.py` と対。 */
const SHEET_SRC = "/paper-kraft.webp";
const PATCH = 320;
const COLS = 2;
const PATCHES = 4;
/** 明るさのばらつき(標準偏差 ≒ 22/255)を、見える濃さへ持ち上げる係数。
 *  3σ で 1.0 に届くので、飛び抜けた斑点だけが真っ黒/真っ白になる。 */
const PAPER_GAIN = 5.0;

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

/** 焼き直したタイル(4枚 × 90度4向き ＝ 16通り)。要求されたときだけ作る。 */
const tiles = new Map<number, HTMLCanvasElement>();

/**
 * シートの1枚を `rot`(0..3 ＝ 90度きざみ)回して、**濃さと色**へ焼き直す。
 * 明るさの中央(128)からの隔たりが濃さになり、暗い側は茶(繊維の影)、
 * 明るい側は麦わら色(毛羽)。クラフト紙の色味はここで付ける
 * (シートはグレースケール ― 色を持たないぶん軽い)。
 */
function tileFor(idx: number, rot: number): HTMLCanvasElement | null {
  const key = idx * 4 + rot;
  const had = tiles.get(key);
  if (had) return had;
  if (!sheet) return null;
  const cv = document.createElement("canvas");
  cv.width = PATCH; cv.height = PATCH;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.save();
  ctx.translate(PATCH / 2, PATCH / 2);
  ctx.rotate((rot * Math.PI) / 2);
  ctx.drawImage(
    sheet, (idx % COLS) * PATCH, Math.floor(idx / COLS) * PATCH, PATCH, PATCH,
    -PATCH / 2, -PATCH / 2, PATCH, PATCH,
  );
  ctx.restore();
  const img = ctx.getImageData(0, 0, PATCH, PATCH);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] / 255 - 0.5;
    const a = Math.min(1, Math.abs(v) * PAPER_GAIN);
    if (v < 0) { d[i] = 74; d[i + 1] = 58; d[i + 2] = 40; }        // 繊維の影(茶)
    else { d[i] = 242; d[i + 1] = 230; d[i + 2] = 207; }           // 毛羽(麦わら)
    d[i + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  tiles.set(key, cv);
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
 * **4枚のどれか × 4向き × ずらし量**を決めるので、隣り合った図形が同じ紙の
 * 同じ場所になることがない ―「同じテクスチャの繰り返しに見えない」
 * (第64巡のユーザー指定)。同じ絵はいつも同じ紙になる。
 */
export function paperize(
  ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, seed: string,
): void {
  ensureSheet();
  if (!sheet || w <= 0 || h <= 0) return;
  const n = hash32(seed);
  const tile = tileFor(n % PATCHES, (n >>> 4) % 4);
  if (!tile) return;
  const ox = (n >>> 8) % PATCH;
  const oy = (n >>> 18) % PATCH;
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
