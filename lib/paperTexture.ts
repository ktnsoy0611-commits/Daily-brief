// ★★★図形と文字の面に**質感**を焼き込む**唯一の場所**。
//
// ★★★2026-08-31・第76巡に**網点へ差し替え、乗せ方を根治した**。
//   ユーザー報告「カラーパレットの色を反映させているはずなのに、すごく濁った色に
//   見えてしまいます。おそらくテクスチャののせ方のせいだと思うので、綺麗に質感だけ
//   のせて、色は濁らせないでください」。**そのとおりで、原因は2つあった**:
//
//   ①**チャンネルの取り違え**。`d[i]`（＝**赤**）を読みながら、`PAPER_MID`
//     （＝**輝度**の中央値 161/255）と比べていた。クラフト紙の写真は赤の平均が
//     **175** なので、ほとんどの画素が「明るい側」＝**白**へ倒れた。実測で
//     **白側 α 0.287 ／ 黒側 α 0.012 ＝ 96% が白**。凹凸ではなく**白の薄塗り**。
//   ②**白黒の斑点**。`PAPER_GAIN = 5.0` で多くの画素が α 1.0 に飽和し、
//     **純白／純黒の点**になっていた。点の1つ1つは彩度ゼロなので、
//     平均を直すだけでは足りない ―― 局所的に色が抜ける。
//
//   白が混ざると**明るくなりながら彩度が落ちる**（実測 深緑 −4.6%／小麦 −3.6%）。
//   これが「濁った」の正体。**色相は動いていなかったので気づきにくかった。**
//
// ★★★直し方 ―― **平均 128 の無彩色を `soft-light` で乗せる**。
//   `soft-light` は **128 が恒等**なので、テクスチャは**明暗だけ**を足し、
//   地の色を原理的に動かさない。タイル（`tools/make-halftone.mjs` の生成物）は
//   平均をきっちり 128 に合わせてある。
//   ★★キャンバスのブレンドは Porter-Duff の `source-over` で合成されるので、
//     **透明な地にも乗ってしまう**。焼く前の絵を控えておき、`soft-light` のあと
//     `destination-in` で**元の α に切り抜く**。焼き込みは1回だけなので負荷は無い。
//
// ★★**焼き込む**（ユーザー確定「図形と一緒に回る」）。`lib/solidPaint.ts` が絵を
// 焼くときに1度だけ重ねるので、**毎フレームの負荷はゼロ**で、図形が回れば質感も
// 一緒に回る ―「紙に刷ったカードそのもの」になる。
//
// ★強さは `PAPER_ALPHA` の**1つだけ**。濃くしたければここを上げる。
// ★★**タイルには二度と手を入れないこと。** 薄く感じたら `PAPER_ALPHA` を上げる。
//
// ★★★**券（`lib/printGrain.ts`）と同じ 1 枚を敷く**（第76巡にユーザー指定
//   「両方とも網点」）。第75巡までの「券は板紙・図形は切った紙。混ぜない」は
//   **この巡で撤回された**。強さだけが別（こちらは焼き込み、あちらは CSS）。

/** 質感の濃さ。★ユーザー確定「見てわかる程度」(2026-08-26)。★**強さの目盛りはこれ1つ**。
 *  ★★第76巡に 0.12 → 0.5。`soft-light` は `source-atop` の直塗りよりずっと穏やかで、
 *  0.12 では何も見えなかった。**数字が増えたのは強くしたからではなく、
 *  乗せ方が変わったから**。 */
export const PAPER_ALPHA = 0.5;

/** タイル（`tools/make-halftone.mjs` の生成物）。★**券と同じ 1 枚**。 */
const SHEET_SRC = "/halftone.webp";
/** タイル1辺（**デバイス**画素）。★網点の周期 9px × 14 ＝ 126。
 *  整数周期で切ってあるので、並べても格子はずれない。 */
const TILE = 126;

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

/** 90度4向きに回したタイル。要求されたときだけ作る。 */
const tiles = new Map<number, HTMLCanvasElement>();

/**
 * タイルを `rot`(0..3 ＝ 90度きざみ)回す。
 * ★★★**画素はいじらない。** タイルはすでに「平均 128 の無彩色」で、
 * それが `soft-light` の恒等点。ここで明るさを触ると地の色が動く
 * ―― 第76巡まで、まさにそれをやっていて色が濁っていた。
 */
function tileFor(rot: number): HTMLCanvasElement | null {
  const had = tiles.get(rot);
  if (had) return had;
  if (!sheet) return null;
  const cv = document.createElement("canvas");
  cv.width = TILE; cv.height = TILE;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.translate(TILE / 2, TILE / 2);
  ctx.rotate((rot * Math.PI) / 2);
  ctx.drawImage(sheet, -TILE / 2, -TILE / 2, TILE, TILE);
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
  const pat = ctx.createPattern(tile, "repeat");
  if (!pat) return;
  const cv = ctx.canvas;

  // ★★焼く前の絵を控える。`soft-light` は**透明な地にもテクスチャを置いてしまう**
  //   ので、あとでこの α に切り抜く。焼き込みは1回だけなので、この1枚は安い。
  const keep = document.createElement("canvas");
  keep.width = cv.width; keep.height = cv.height;
  const kctx = keep.getContext("2d");
  if (!kctx) return;
  kctx.drawImage(cv, 0, 0);

  const ox = (n >>> 4) % TILE;
  const oy = (n >>> 14) % TILE;
  ctx.save();
  // ★タイルは**デバイス画素**で持っているので、変形を素へ戻してから貼る
  //   (CSS px の座標系で貼ると網点まで拡大されて、ただのシミになる)。
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "soft-light";
  ctx.globalAlpha = PAPER_ALPHA;
  ctx.translate(-ox, -oy);
  ctx.fillStyle = pat;
  ctx.fillRect(ox, oy, w * dpr, h * dpr);
  ctx.restore();

  // ★元の α へ戻す（はみ出したぶんを落とす）。
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.globalAlpha = 1;
  ctx.drawImage(keep, 0, 0);
  ctx.restore();
}
