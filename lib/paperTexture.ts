// ★★★クラフト紙の目を作る**唯一の場所**(2026-08-26・第63巡にユーザー指定
// 「物理演算が効く、図形やテキストの部分だけ、紙(クラフト紙)のようなテクスチャを
// 薄っすら重ねて」)。第62巡の画面全体のグレイン(`body::after`)は**撤去した** —
// 「よくわからない」＝薄すぎて判別がつかなかったため。
//
// ★★**焼き込む**(ユーザー確定「図形と一緒に回る」)。`lib/solidPaint.ts` が絵を
// 焼くときに1度だけ重ねるので、**毎フレームの負荷はゼロ**で、図形が回れば紙の目も
// 一緒に回る ―「紙に刷ったカードそのもの」になる。
//
// ★強さは `PAPER_ALPHA` の**1つだけ**。濃くしたければここを上げる。

/** 紙の濃さ。★ユーザー確定「見てわかる程度」(2026-08-26)。 */
export const PAPER_ALPHA = 0.12;

/** タイル1辺(CSS px)。大きすぎると焼くのが重く、小さすぎると繰り返しが見える。 */
const TILE = 256;

/** 種を固定した擬似乱数。**毎回同じ紙**にする(見るたびに目が変わるのは紙ではない)。 */
function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const tiles = new Map<string, HTMLCanvasElement>();

/**
 * 格子の値をなめらかに補間した雑音(バリューノイズ)。**継ぎ目が出ないよう格子は巻く**。
 * 一辺 `n` の器に、`cell` px ごとの格子を敷いて双三次ではなく余弦で補間する。
 */
function valueNoise(n: number, cell: number, r: () => number): Float32Array {
  const g = Math.max(1, Math.round(n / cell));
  const lat = new Float32Array(g * g);
  for (let i = 0; i < lat.length; i += 1) lat[i] = r() * 2 - 1;
  const out = new Float32Array(n * n);
  const sm = (t: number) => (1 - Math.cos(t * Math.PI)) / 2;   // 余弦で滑らかに
  for (let y = 0; y < n; y += 1) {
    const fy = (y / n) * g; const y0 = Math.floor(fy); const ty = sm(fy - y0);
    const ya = (y0 % g + g) % g; const yb = (ya + 1) % g;
    for (let x = 0; x < n; x += 1) {
      const fx = (x / n) * g; const x0 = Math.floor(fx); const tx = sm(fx - x0);
      const xa = (x0 % g + g) % g; const xb = (xa + 1) % g;
      const a = lat[ya * g + xa] + (lat[ya * g + xb] - lat[ya * g + xa]) * tx;
      const b = lat[yb * g + xa] + (lat[yb * g + xb] - lat[yb * g + xa]) * tx;
      out[y * n + x] = a + (b - a) * ty;
    }
  }
  return out;
}

/**
 * クラフト紙のタイルを作る(dpr ごとに一度だけ)。
 *
 * ★★**画素の細かさで作る**(第63巡)。最初は半径 1px 級の丸を撒いたが、拡大すると
 * 「柔らかいシミ」にしか見えなかった ― 紙は**画素の細かさのざらつき**と、
 * その上に乗る**低い周波数のムラ**と、**繊維の筋**の三層でできている。
 *   ・細かいざらつき … 1 画素ごとの雑音。手ざわり。
 *   ・ムラ … 大きな格子の雑音。漉きムラ。
 *   ・繊維 … 1 画素幅の短い線。クラフト紙の「目」。
 * 暗い側は茶色、明るい側は麦わら色にして、クラフト紙の色味を出す。
 */
function tileFor(dpr: number): HTMLCanvasElement | null {
  const key = dpr.toFixed(2);
  const had = tiles.get(key);
  if (had) return had;
  if (typeof document === "undefined") return null;
  const n = Math.max(8, Math.round(TILE * dpr));      // 器は**デバイス画素**で持つ
  const cv = document.createElement("canvas");
  cv.width = n; cv.height = n;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const r = rnd(0x9e3779b9);

  // ── ざらつき＋ムラ ──
  const fine = valueNoise(n, Math.max(1, Math.round(1.4 * dpr)), r);
  const mid = valueNoise(n, Math.max(2, Math.round(7 * dpr)), r);
  const low = valueNoise(n, Math.max(4, Math.round(34 * dpr)), r);
  const img = ctx.createImageData(n, n);
  const d = img.data;
  for (let i = 0; i < n * n; i += 1) {
    const v = fine[i] * 0.52 + mid[i] * 0.32 + low[i] * 0.16;
    const a = Math.min(1, Math.abs(v) * 1.25);
    const j = i * 4;
    if (v < 0) { d[j] = 74; d[j + 1] = 58; d[j + 2] = 40; }        // 繊維の影(茶)
    else { d[j] = 242; d[j + 1] = 230; d[j + 2] = 207; }           // 毛羽(麦わら)
    d[j + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);

  // ── 繊維の筋 ── 1 画素幅の短い線を四方へ。方向感を出さないよう角度は散らす。
  ctx.lineCap = "round";
  for (let i = 0; i < Math.round(260 * dpr); i += 1) {
    const x = r() * n; const y = r() * n;
    const a = r() * Math.PI * 2;
    const len = (5 + r() * 22) * dpr;
    const dark = r() < 0.55;
    ctx.globalAlpha = 0.22 + r() * 0.3;
    ctx.strokeStyle = dark ? "#3E3020" : "#F8F1E2";
    ctx.lineWidth = Math.max(1, Math.round(dpr * (r() < 0.7 ? 1 : 1.6)));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
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
 * `ox`/`oy` は、タイルの継ぎ目が図形ごとに揃わないようにずらす量。
 */
export function paperize(
  ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, ox = 0, oy = 0,
): void {
  const tile = tileFor(dpr);
  if (!tile || w <= 0 || h <= 0) return;
  const pat = ctx.createPattern(tile, "repeat");
  if (!pat) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = PAPER_ALPHA;
  // ★タイルは**デバイス画素**で作ってあるので、変形を素へ戻してから貼る
  //   (CSS px の座標系で貼ると紙の目まで拡大されて、ただのシミになる)。
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(-ox * dpr, -oy * dpr);
  ctx.fillStyle = pat;
  ctx.fillRect(ox * dpr, oy * dpr, w * dpr, h * dpr);
  ctx.restore();
}
