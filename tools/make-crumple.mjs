// しわ紙のシート(public/crumple.webp)を作る。
//
// ★★★2026-08-31・第77巡にユーザー指定「テクスチャはもう一方の方を試してみて」。
// 券も図形もこの1枚を敷く（第76巡の網点 `halftone.webp` と入れ替え。網点のほうは
// 戻せるように**消していない**）。
//
//   使い方: node tools/make-crumple.mjs <元画像のパス>
//   ★元画像はリポジトリに無い（`tools/make-paper.py` / `make-halftone.mjs` と同じ作法）。
//
// ★★★**しわは低い刻みなので、拡大縮小してよい。網点は高い刻みなので、いけない。**
//   第76巡に立てた「1画像画素 = 1デバイス画素」は**網点の規則**であって、しわには
//   当てない。実測でこの写真は**ばらつきの 73% が低い刻み**（全体 sd 9.54 に対し、
//   8px でぼかしても 7.00 残る）。だから伸ばしても「粒が太る」ことが起きない。
//   ★★その結果**繰り返さなくてよい** ―― 面いっぱいに1枚を伸ばすので、
//   **継ぎ目もタイルの周期も存在しない**（網点は整数周期で切って消していた）。
//
// ★★**照明のかたよりだけを抜く。しわは残す。** 写真には撮影時の明暗の傾きがあり
//   （実測 … 四隅 220〜235）、そのまま敷くと図形の片側が必ず暗くなる。
//   **大きく（半径 96）ぼかしたものを引く**と、その傾きだけが消えてしわは残る
//   （96px でのうねりは sd 2.35 しかなく、しわ本体の 8〜4 には触らない）。
//   ★★★第64巡の教訓（`tools/make-paper.py`）は「**写真を加工するな**」だが、
//     あれは**粒を増幅し低い刻みを削った**話。ここで抜くのは**照明**で、
//     質感そのものではない。同じ「ハイパス」でも、半径が2桁ちがえば別の操作になる。
//
// ★★★**平均を 128 にする**。128 は `soft-light` の恒等点なので、地の色が
//   原理的に動かない（第76巡に立てた規則。`design.md` §3-b）。

import sharp from "sharp";

/** 照明を抜くぼかしの半径。★これより**大きい**うねりだけが引かれる。 */
const FLATTEN = 96;
/** 書き出す1辺。★正方形にするのは、使う側が90度4向きに回すため。 */
const N = 512;
/** 平均。★**128 = soft-light の恒等点**。ここを動かすと地の色が動く。 */
const MEAN = 128;
/** 深さ(標準偏差)。★強さは使う側の不透明度で決めるので、ここは扱いやすい値に。 */
const SD = 26;
const OUT = "public/crumple.webp";

const src = process.argv[2];
if (!src) {
  console.error("使い方: node tools/make-crumple.mjs <元画像のパス>");
  process.exit(1);
}

const base = sharp(src).greyscale();
const { width: W0, height: H0 } = await base.metadata();
// いちばん大きい中央の正方形を切り、N へ揃える（しわは伸ばしてよい）。
const side = Math.min(W0, H0);
const box = { left: Math.floor((W0 - side) / 2), top: Math.floor((H0 - side) / 2), width: side, height: side };

const sq = sharp(src).greyscale().extract(box).resize(N, N, { fit: "fill" });
const flat = sharp(await sq.clone().toBuffer()).blur(FLATTEN);
const [hi, lo] = await Promise.all([
  sq.clone().raw().toBuffer(),
  flat.raw().toBuffer(),
]);

// 照明（lo）を引いて、しわ（hi − lo）だけ残す
const diff = new Float64Array(N * N);
for (let i = 0; i < diff.length; i++) diff[i] = hi[i] - lo[i];
const mean = diff.reduce((a, v) => a + v, 0) / diff.length;
const sd = Math.sqrt(diff.reduce((a, v) => a + (v - mean) ** 2, 0) / diff.length);

// 平均 128・深さ SD へ。★頭打ちのぶん平均が逃げるので、書いてから測って戻す。
const px = Buffer.alloc(N * N);
let clipped = 0, shift = 0;
for (let pass = 0; pass < 24; pass++) {
  clipped = 0;
  for (let i = 0; i < px.length; i++) {
    const v = Math.round(MEAN + shift + ((diff[i] - mean) / sd) * SD);
    if (v < 0 || v > 255) clipped++;
    px[i] = Math.min(255, Math.max(0, v));
  }
  const got = px.reduce((a, v) => a + v, 0) / px.length;
  if (Math.abs(got - MEAN) < 0.02) break;
  shift += (MEAN - got) * 0.9;
}

// ★**可逆**で書く（質感は非可逆圧縮でいちばん先に平らになる）。
await sharp(px, { raw: { width: N, height: N, channels: 1 } })
  .webp({ lossless: true, effort: 6 })
  .toFile(OUT);

const out = await sharp(OUT).greyscale().stats();
// ★照明が本当に抜けたかを**四隅と中央の明るさ**で確かめる（差が小さいほど平ら）。
const at = (x, y) => px[y * N + x];
const patch = (x, y) => {
  let s = 0;
  for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) s += at(x + i, y + j);
  return +(s / 1600).toFixed(1);
};
const corners = [patch(8, 8), patch(N - 48, 8), patch(N / 2, N / 2), patch(8, N - 48), patch(N - 48, N - 48)];
console.log(JSON.stringify({
  元: [W0, H0], 切り出し: side, 書き出し: N,
  "元の平均/深さ": [+(hi.reduce((a, v) => a + v, 0) / hi.length).toFixed(1),
                   +Math.sqrt(hi.reduce((a, v) => a + (v - hi.reduce((x, y) => x + y, 0) / hi.length) ** 2, 0) / hi.length).toFixed(2)],
  "書いた平均/深さ": [+out.channels[0].mean.toFixed(2), +out.channels[0].stdev.toFixed(2)],
  頭打ちの画素: clipped,
  "四隅と中央（照明が抜けたか）": corners,
  "四隅の開き": +(Math.max(...corners) - Math.min(...corners)).toFixed(1),
}, null, 1));
