// 網点のタイル(public/halftone.webp)を作る。
//
// ★★★2026-08-31・第76巡にユーザー指定「両方とも網点」。券も図形も、この1枚を敷く。
// 元はユーザーが持ってきた網点のスキャン(500×707)。★**元画像はリポジトリに無い**
// （`tools/make-paper.py` と同じ作法）。走らせ直すときは元画像の場所を引数で渡す。
//
//   使い方: node tools/make-halftone.mjs <元画像のパス>
//
// ★★★**継ぎ目を「消す」のではなく、最初から作らない**。
//   この網点は**周期 9px 角**の規則的な格子（自己相関 0.94 で実測）。だから
//   **整数個の周期でちょうど切れば、並べても格子はずれない**。
//   14周期 = **126px**。第71巡の粒は自分で作った雑音だったので輪のぼかしで
//   継ぎ目を消したが、こちらは**元が格子なので切る位置だけの問題**。
//   ★どの切り出しでもよいわけではない（スキャンのわずかな傾きで格子が流れる）。
//   候補をすべて試し、**向かい合う縁どうしの差がいちばん小さい**ものを選ぶ。
//
// ★★★**平均を 128 にする**。ここが第76巡の肝。
//   それまでのテクスチャは `multiply`（券・平均245）と「白黒の斑点を source-atop」
//   （図形）で、どちらも**地の色を動かしていた** ―― 券は一律 ×0.96 で暗くなり、
//   図形は白が混ざって**彩度が落ちていた**（実測 深緑 −4.6%）。これが
//   ユーザーの言う「濁った色」。
//   平均 128 の無彩色を **soft-light** で乗せれば、128 は恒等なので
//   **地の色は原理的に動かない**。テクスチャは明暗だけを足す。
//
// ★深さ(標準偏差)は `SD` の1つだけ。強さは使う側の不透明度で決める。

import sharp from "sharp";

/** 網点の周期(px)。★元画像の自己相関から実測(横 9 / 縦 9、相関 0.94)。 */
const PERIOD = 9;
/** タイルに入れる周期の数。★14 × 9 = 126px。 */
const CYCLES = 14;
const N = PERIOD * CYCLES;
/** タイルの平均。★**128 = soft-light の恒等点**。ここを動かすと地の色が動く。 */
const MEAN = 128;
/** 深さ(標準偏差)。★元の網点は 54.7 と深すぎるので、扱いやすい所へ落とす。 */
const SD = 40;
const OUT = "public/halftone.webp";

const src = process.argv[2];
if (!src) {
  console.error("使い方: node tools/make-halftone.mjs <元画像のパス>");
  process.exit(1);
}

const { data, info } = await sharp(src).greyscale().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const at = (x, y) => data[y * W + x];

/** 切り出しの継ぎ目の大きさ ―― 向かい合う縁どうしの差の二乗平均。 */
function seam(x0, y0) {
  let sx = 0, sy = 0;
  for (let i = 0; i < N; i++) {
    sx += (at(x0, y0 + i) - at(x0 + N - 1, y0 + i)) ** 2;
    sy += (at(x0 + i, y0) - at(x0 + i, y0 + N - 1)) ** 2;
  }
  return Math.sqrt((sx + sy) / (2 * N));
}

// ★候補をすべて試す。1周期ぶん動かせば格子の位相は一巡するので、探すのは
//   その範囲だけでよい ―― ただしスキャンの傾きで場所によって差が出るので、
//   画像全体を粗く走って**いちばん継ぎ目の小さい所**を採る。
let best = null;
for (let y0 = 0; y0 + N < H; y0 += 3) {
  for (let x0 = 0; x0 + N < W; x0 += 3) {
    const s = seam(x0, y0);
    if (!best || s < best.s) best = { x0, y0, s };
  }
}

// 切り出して、平均 128・深さ SD へ揃える
const cut = new Float64Array(N * N);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) cut[y * N + x] = at(best.x0 + x, best.y0 + y);
const mean = cut.reduce((a, v) => a + v, 0) / cut.length;
const sd = Math.sqrt(cut.reduce((a, v) => a + (v - mean) ** 2, 0) / cut.length);
const px = Buffer.alloc(N * N);
let clipped = 0;
// ★★**頭打ちのぶんだけ平均がずれる**ので、書いたあとに測って戻す。
//   網点は濃い側が 0 に張り付くので、素直に伸ばすと平均が上へ逃げる
//   （初回の実測 … 狙い 128 に対して 129.52）。**恒等点からのずれは
//   そのまま地の色のずれ**になるので、ここは合わせ込む。
let shift = 0;
for (let pass = 0; pass < 24; pass++) {
  clipped = 0;
  for (let i = 0; i < px.length; i++) {
    const v = Math.round(MEAN + shift + ((cut[i] - mean) / sd) * SD);
    if (v < 0 || v > 255) clipped++;
    px[i] = Math.min(255, Math.max(0, v));
  }
  const got = px.reduce((a, v) => a + v, 0) / px.length;
  if (Math.abs(got - MEAN) < 0.02) break;
  shift += (MEAN - got) * 0.9;
}

// ★**可逆**で書く(網点は非可逆圧縮でいちばん先に潰れる)。
await sharp(px, { raw: { width: N, height: N, channels: 1 } })
  .webp({ lossless: true, effort: 6 })
  .toFile(OUT);

// ★継ぎ目が無いことを**数で**確かめる … 向かい合う縁どうしの差が、タイルの中の
//   隣どうしの差と同じ大きさなら、並べても境目は見えない。**本数も出す**。
const q = (x, y) => px[y * N + x];
const rms = (f, n) => { let s = 0; for (let i = 0; i < n; i++) s += f(i) ** 2; return Math.sqrt(s / n); };
const seamX = rms((i) => q(0, i) - q(N - 1, i), N);
const seamY = rms((i) => q(i, 0) - q(i, N - 1), N);
let sx = 0, sy = 0, n = 0;
for (let y = 0; y < N; y++) for (let x = 0; x < N - 1; x++) {
  sx += (q(x + 1, y) - q(x, y)) ** 2; sy += (q(y, x + 1) - q(y, x)) ** 2; n++;
}
const out = await sharp(OUT).greyscale().stats();
console.log(JSON.stringify({
  元: [W, H], 周期: PERIOD, タイル: N, 切り出し: [best.x0, best.y0],
  "元の平均/深さ": [+mean.toFixed(1), +sd.toFixed(1)],
  "書いた平均/深さ": [+out.channels[0].mean.toFixed(2), +out.channels[0].stdev.toFixed(2)],
  頭打ちの画素: clipped,
  "継ぎ目 左右": +seamX.toFixed(2), "中の隣どうし 左右": +Math.sqrt(sx / n).toFixed(2),
  "継ぎ目 上下": +seamY.toFixed(2), "中の隣どうし 上下": +Math.sqrt(sy / n).toFixed(2),
  "比べた本数": { 継ぎ目: N, 中: n },
}, null, 1));
