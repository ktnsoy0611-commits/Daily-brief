// 券の「印刷の粒」のタイル(public/print-grain.webp)を作る。
//
// ★★★2026-08-31・第71巡にユーザー指定「印刷の粒(均一で細かい)」。
// それまで券はタスクの図形と同じクラフト紙の写真を multiply 0.42 で敷いていたが、
// 実機では**ムラ(雲のような濃淡)**として見えていた ―― 写真には照明とシワ由来の
// 低い刻みの起伏があり、券のように**広い面**へ等倍で1枚だけ敷くと、その起伏が
// そのまま雲として出る(図形は小さいので出なかった)。
//
// ★★だから作り方は「白色雑音から**低い刻みを引く**」。これで残るのは細かい粒だけ
// になり、どこを見ても同じ濃さ＝「均一で細かい」になる。
//   ★`tools/make-paper.py` の見出しには「ハイパスはほとんど何も取り除いていない」と
//     書いてあるが、あれは**写真**の話。写真の低い刻みは std 1.7〜2.6 しか無かった。
//     ここは**自分で作る白色雑音**で、低い刻みにも同じだけ力があるので、引くと効く。
//     同じ言葉でも相手が違えば結論が逆になる ―― 取り違えないこと。
//
// ★★**継ぎ目が出ないように、ぼかしを輪(wrap-around)で掛ける**。端をそのまま
//   ぼかすと縁だけ性質が変わり、並べたときに格子が見える。添字を剰余で回せば
//   タイルは**構造として**継ぎ目を持たない。
// ★★粒には低い刻みが無いので、**並べても模様に見えない**(模様は低い刻みが
//   そろって初めて見える)。だからタイルは 128 で足りる ―― クラフト紙のシートが
//   768 も要ったのは、写真が低い刻みを持っていたから。
//
// ★1画像画素 = 1**デバイス**画素で敷くこと(`lib/printGrain.ts`)。CSS px に
//   合わせると 3x の実機で粒が3倍に太り、「粒」ではなく「砂」に見える。
//
//   使い方: node tools/make-grain.mjs

import sharp from "sharp";

/** タイル1辺(デバイス画素)。 */
const N = 128;
/** ぼかしの半径。これより**大きい**うねりが引かれる。 */
const R = 3;
/** ぼかしを重ねる回数(箱ぼかしを重ねるとガウスに近づく)。 */
const PASSES = 2;
/**
 * ★★★タイルの**中央の明るさ**。255 からの差が、multiply で敷いたときの
 * **平均の暗さ**になる。128(＝諧調の真ん中)で作ると **地が半分の明るさまで沈む**
 * ―― クリームの紙が灰色に見えた(第71巡に実測 … PAPER #FAFAF9 が 222 まで落ちた)。
 * 紙の目は「わずかに沈む」だけなので、白のすぐ下に置く。
 */
const MEAN = 247;
/** 粒の深さ(標準偏差)。★上へはみ出したぶんは 255 で頭打ち＝紙の平らな面になる。 */
const SD = 12;
const OUT = "public/print-grain.webp";
/** 種。★固定 ―― 走らせ直しても同じタイルが出る。 */
let seed = 0x9e3779b9;

function rnd() {                       // xorshift32
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5;  seed >>>= 0;
  return seed / 0x100000000;
}
/** 正規乱数(Box–Muller)。 */
function gauss() {
  const u = Math.max(rnd(), 1e-9), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 輪で回る箱ぼかし(横→縦)。★剰余で添字を回すので端が特別扱いにならない。 */
function blurWrap(src) {
  const w = N, out = new Float64Array(N * N), tmp = new Float64Array(N * N);
  const k = 2 * R + 1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let d = -R; d <= R; d++) s += src[y * w + ((x + d + N) % N)];
      tmp[y * w + x] = s / k;
    }
  }
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      let s = 0;
      for (let d = -R; d <= R; d++) s += tmp[((y + d + N) % N) * w + x];
      out[y * w + x] = s / k;
    }
  }
  return out;
}

// 1. 白色雑音
const noise = new Float64Array(N * N);
for (let i = 0; i < noise.length; i++) noise[i] = gauss();

// 2. 低い刻みを引く(＝ムラを消す)
let low = noise;
for (let p = 0; p < PASSES; p++) low = blurWrap(low);
const hp = new Float64Array(N * N);
for (let i = 0; i < hp.length; i++) hp[i] = noise[i] - low[i];

// 3. 深さを揃えて、**白のすぐ下**(MEAN)のまわりへ置く
const mean = hp.reduce((a, v) => a + v, 0) / hp.length;
const sd = Math.sqrt(hp.reduce((a, v) => a + (v - mean) ** 2, 0) / hp.length);
const px = Buffer.alloc(N * N);
let clipped = 0;
for (let i = 0; i < px.length; i++) {
  const v = Math.round(MEAN + ((hp[i] - mean) / sd) * SD);
  if (v < 0 || v > 255) clipped++;
  px[i] = Math.min(255, Math.max(0, v));
}

// ★**可逆**で書く(粒は非可逆圧縮でいちばん先に消える成分なので、落とせない)。
//   同じ中身で png 21.8KB / webp 可逆 14.4KB だったので webp。
await sharp(px, { raw: { width: N, height: N, channels: 1 } })
  .webp({ lossless: true, effort: 6 })
  .toFile(OUT);

// ★継ぎ目が無いことを**数で**確かめる … 向かい合う縁どうしの差が、
//   タイルの中の隣どうしの差と同じ大きさなら、並べても境目は見えない。
const at = (x, y) => px[y * N + x];
const rms = (f, n) => { let s = 0; for (let i = 0; i < n; i++) s += f(i) ** 2; return Math.sqrt(s / n); };
const seamX = rms((i) => at(0, i) - at(N - 1, i), N);
const seamY = rms((i) => at(i, 0) - at(i, N - 1), N);
// 中の隣どうしは**タイル全体**で取る(縁は N 本しか無いが、中は N×(N−1) 本ある。
// 少ない標本どうしを比べると、ばらつきの差を継ぎ目と読み違える)。
let sx = 0, sy = 0, n = 0;
for (let y = 0; y < N; y++) for (let x = 0; x < N - 1; x++) {
  sx += (at(x + 1, y) - at(x, y)) ** 2; sy += (at(y, x + 1) - at(y, x)) ** 2; n++;
}
console.log(JSON.stringify({
  タイル: N, 中央: MEAN, 深さ: SD, 頭打ちの画素: clipped,
  "継ぎ目 左右": +seamX.toFixed(2), "中の隣どうし 左右": +Math.sqrt(sx / n).toFixed(2),
  "継ぎ目 上下": +seamY.toFixed(2), "中の隣どうし 上下": +Math.sqrt(sy / n).toFixed(2),
  "比べた本数": { 継ぎ目: N, 中: n },
}, null, 1));
