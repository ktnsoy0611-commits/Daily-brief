import { BAND_BEZEL, BAND_H, BD_GREY, DISPLAY, mixHex } from "@/lib/constants";
import { img } from "@/lib/helpers";
import { traceHub } from "@/lib/reelHub";
import { cardShapeReach, traceCardShape } from "@/lib/cardShape";
import { halfWidthAtStack, stackOutline } from "@/lib/solid";
import { ROW_FILL, canvasFont, drawFitted, ensureGlyphs, layoutInRows, missingGlyphs, warmGlyphs } from "@/lib/textFit";
import { drawWordPlate } from "@/lib/wordPlate";
import { splitReadable } from "@/lib/lineBreak";
import { TASK_SLACK } from "@/lib/taskSize";
import { WORD_WEIGHT } from "@/lib/solidPaint";
import { type Piece } from "./pileWorld";
import { EASE_SETTLE, T_ITEM, easeAt, ms } from "@/lib/motion";
import { drawPillGhost, inkMix } from "./pillGhost";
import type { Ghost } from "@/lib/pullDrag";

// ★★★**山の焼き方と描き方**（2026-09-11・第92巡に `Pile.tsx` から分けた）。
//
// ★★★**タスクの図形は1枚に焼いてから貼る**（回して貼るだけなので、2Dの回転しか
// 起きず厳密に正しい）。焼き方は `lib/solidPaint.ts` の `solidBitmap` に**合わせて
// ある** ―― GRAVITY と作法が違うと、片方だけ粗くなる。合わせているのは3つ:
//   1. **回転のための余白**（`BAKE_PAD`）。余白が無いと、角丸の縁が絵の端に
//      接したまま回されて、**縁が透明と混ざって溶ける**。
//   2. **整数の箱**（`Math.ceil`）。焼く箱も貼る大きさも整数にする ―― 小数だと
//      「焼いた画素数」と「貼る画素数」が一致せず、回していなくても再標本化される。
//   3. **鍵と実際に使う値を同じにする**。以前は鍵だけ `Math.round(p.w)` で、
//      貼るのは生の `p.w` だった（＝わずかに違う大きさの絵を当てていた）。
//
// ★★★**紙の目（`paperize`）は外した**（2026-09-11 ユーザー指定「図形の紙の
// テクスチャはなくしてください」）。`lib/solidPaint.ts` の側も同時に外してある。
//
// ★★★**塗り分けは「日付があるか／ないか」の1軸だけ**（2026-09-12・第93巡）。
// タグ（と柄）は廃止した。日付なしは**輪郭線だけ**で、中は地と同じ色で塗る
// ―― 帯のピル（`components/home/Band.tsx`）とまったく同じ見え方。

/** 回転のための余白（CSS 画素）。★目盛りの外（絵の寸法。`solidBitmap` の `+1` と同じ）。 */
const BAKE_PAD = 1;
/** 輪郭線の太さ（CSS 画素）。★帯のピルの `1px solid` と同じ。★目盛りの外（絵の寸法）。 */
const EDGE = 1;

export interface Baked { canvas: HTMLCanvasElement; w: number; h: number }

const bakeCache = new Map<string, Baked>();
/** 焼いた絵を全部捨てる（★**書体が遅れて届いたとき**に呼ぶ。次の frame で戻る）。 */
export function clearPileBitmaps() { bakeCache.clear(); labelFs.clear(); fitMemo.clear(); }

/**
 * ★★★**1フレームに焼いてよい枚数**（2026-09-16・第115巡）。
 *
 * ★★★**第114巡までは、最初の1フレームで全部焼いていた** ―― 12体なら
 *   `layoutInRows` × 12 と、そこから呼ばれる `bakeGlyph`（1文字＝1枚の canvas）が
 *   **150枚ぶん**、ぜんぶ同じフレームに入る。実測 … **山のループの1回が 520ms**
 *   （CPU×4）。これが「**最初に図形が落ちてくる時だけ重い**」のいちばん大きな山で、
 *   **`GravityTab` が軽いのは、そこへ来る頃には焼き上がっているから**だった。
 * ★★**焼けていない figure には代役がある**（下の `drawPile` の `else` の枝＝
 *   1段のピル）ので、**数フレーム遅れても絵は途切れない**。
 * ★★**足りなければ呼んだ側が次のフレームを頼む**（`bakeDeferred()`）。
 */
const BAKE_PER_FRAME = 2;
let bakeLeft = BAKE_PER_FRAME;
let bakeSkipped = false;
/** ★1フレームの焼く予算を戻す（`drawPile` の直前に呼ぶ）。 */
export function beginPileFrame(): void {
  bakeLeft = BAKE_PER_FRAME; bakeSkipped = false;
  frameT0 = performance.now(); glyphsNow = 0;
}
/**
 * ★1フレームで字を焼いてよい時間（ms。`taskBitmap` の注釈）。★数ではなく時間で
 * 持つ ―― 1字の費用は端末と「その字の断片をもう読んだか」で 10 倍 変わる。
 * ★目盛りの外（フレームの予算。16.7ms の 1/4）。
 */
const GLYPH_MS = 4;
let frameT0 = 0;
let glyphsNow = 0;
const fitMemo = new Map<string, ReturnType<typeof layoutInRows>>();
/** ★このフレームで焼き切れなかったか（真なら次のフレームも塗り直す）。 */
export function bakeDeferred(): boolean { return bakeSkipped; }

/**
 * ★★★**描き方の決まった絵は、1度だけ焼いて貼る**（2026-09-23・第131巡）。
 *
 * ★★★**第130巡までは板・提案・未読の数を毎フレーム パスから描いていた** ――
 *   落ちているあいだは全員が毎フレーム塗り直しになるので、**割れたピルの縁と
 *   切り抜き・提案の輪郭（点 288）と写真の切り抜き・字の組み直し**が
 *   同じフレームに全部入っていた（実測 … CPU×4 で山のループの 4割）。
 *   焼いた絵なら**1枚の `drawImage`** で済む（タスクとカセットは前からそうしていた）。
 * ★`w`/`h` は**余白を含む箱**（CSS 画素）。`paint` は**箱の中心が原点**で描く。
 * ★予算（`BAKE_PER_FRAME`）を使い切ったら `undefined` ―― 呼ぶ側は直に描く。
 */
function spriteOf(
  key: string, w: number, h: number, dpr: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): Baked | undefined {
  const hit = bakeCache.get(key);
  if (hit) return hit;
  if (bakeLeft <= 0) { bakeSkipped = true; return undefined; }
  bakeLeft -= 1;
  const bw = Math.ceil(w); const bh = Math.ceil(h);
  const cv = document.createElement("canvas");
  cv.width = Math.max(2, Math.round(bw * dpr));
  cv.height = Math.max(2, Math.round(bh * dpr));
  const ctx = cv.getContext("2d");
  if (!ctx) return undefined;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = "high";
  ctx.translate(bw / 2, bh / 2);
  paint(ctx);
  const made = { canvas: cv, w: bw, h: bh };
  if (bakeCache.size > 80) bakeCache.clear();
  bakeCache.set(key, made);
  return made;
}

/**
 * ★★★**提案の写真のまわりの縁（半径に対する比）は、帯のピルと同じ比**（第132巡）。
 * 帯のピルは高さ `BAND_H.photo` の中に、縁 `BAND_BEZEL` を残して写真の丸を置く ――
 * 写真の径 ÷ 外の径 ＝ 1 − 2·縁 ÷ 高さ。山の図形も同じ比にすると、**引き下ろして形が
 * 変わっても、写真と黄色の縁の関係は変わらない**（同じ物だと分かる）。
 */
// ★★★**第133巡に半分へ**（ユーザー指定「**提案の図形のベゼルはもう少し細く**」）。帯のピルの縁の比
//   （`BAND_BEZEL` ÷ 高さ）を**1マス**に掛けた値 ＝ 日付の板の丸のまわりの縁と同じ幅（4件で 9.6px）。
//   提案の半径 ＝ 1マスなので、式は「半径 × 6/44」。★第132巡は直径に掛けていた（19.3px）。
const OFFER_BEZEL = BAND_BEZEL / BAND_H.photo;

const blit = (ctx: CanvasRenderingContext2D, b: Baked) =>
  ctx.drawImage(b.canvas, -b.w / 2, -b.h / 2, b.w, b.h);

/**
 * ★★★**タスクの字の割り付け**（2026-09-27・第133巡。山の絵と引き下ろしの幽霊が同じ1本を読む）。
 * ★★**行は必ず「箱の高さ ÷ 2」の刻みで組む** ―― 1行の題も2行の題も**同じ字の大きさ**で、
 *   1行なら上下の中央に置く。刻み 2 つぶんの高さに 1 行だと字が倍になるので、
 *   **組む箱の高さを「行の数 × 刻み」に絞り**、角丸の幅は**本当の高さで**測る。
 */
export function fitTask(title: string, face: number, lines: number, pw: number, ph: number) {
  const n = Math.max(1, Math.min(2, Math.round(lines)));
  const bh = (ph / 2) * n;
  // ★★2行は「読める切れ目」で割る（`lib/lineBreak.ts`。箱の幅を決めた `taskCellsOf` と同じ規則）。
  const parts = n === 2 ? splitReadable(title, TASK_SLACK) : undefined;
  return layoutInRows(
    title, face, n, pw, bh,
    (t) => halfWidthAtStack(1, pw / ph, (t * bh) / ph), (ph / 2) * ROW_FILL, undefined, parts,
  );
}

/** タスク（角丸の四角）を1枚焼く。返る `w`/`h` は**余白を含む整数の箱**。 */
export function taskBitmap(p: Piece, dpr: number): Baked | undefined {
  if (!p.w || !p.h || p.face_ === undefined || !p.title) return undefined;
  const pw = Math.ceil(p.w); const ph = Math.ceil(p.h);
  const w = pw + BAKE_PAD * 2; const h = ph + BAKE_PAD * 2;
  const key = [p.id, w, h, p.face, p.ink, p.face_, p.title, p.lines ?? 1, dpr.toFixed(2), p.outlined ? "o" : "-"].join("|");
  const hit = bakeCache.get(key);
  if (hit) return hit;
  // ★★**1フレームの予算を使い切ったら、今回は代役で描く**（上の `BAKE_PER_FRAME`）。
  if (bakeLeft <= 0) { bakeSkipped = true; return undefined; }
  // ★★★**形は `lib/solid.ts` の「ピルの積み」から引く**（2026-09-13・第99巡）。
  //   山だけ角丸の四角を別に描いていたのをやめた ―― **同じタスクが画面によって
  //   違う形**に見えていた（ユーザー確定で TASK アプリと山の両方を揃える）。
  ensureGlyphs(p.face_, p.title);
  // ★★★**行の数は格子の箱と同じ1本から**（`taskCellsOf` → `Piece.lines`。第133巡）。
  //   ★書体の到着で行の数が変わらないよう、実測ではなく純粋な関数から引く（第99巡）。
  // ★割り付けは覚える（字が焼き上がるまで数フレーム待つことがあるので）。
  let fit = fitMemo.get(key);
  if (fit === undefined) {
    fit = fitTask(p.title, p.face_, p.lines ?? 1, pw, ph);
    if (fitMemo.size > 80) fitMemo.clear();
    fitMemo.set(key, fit);
  }
  // ★★★**字は1フレームに `GLYPH_MS` まで焼く**（2026-09-23・第131巡）。
  //   字の絵（アトラス）は**1字＝1枚の canvas**で、ここがタスクを焼く費用のほぼ全部
  //   （実測 … CPU×4 で山の最初のフレーム 175ms の半分）。絵2枚の予算では、
  //   新しい字の多い2枚が同じフレームに当たると**そのフレームだけ飛び抜けて重い**。
  //   ★1字目の費用は**その字の断片を canvas が初めて読む**ぶんで、実測 CPU×4 で 1字
  //     18ms。6字の予算でも 110ms のフレームが出た。
  //   → 字が揃うまでは代役のまま待ち、揃った絵だけを組む（組むのは貼るだけで軽い）。
  if (fit) {
    const text = fit.lines.map((l) => l.text).join("");
    const need = missingGlyphs(text, p.face_, p.ink, fit.size * dpr);
    let left = need;
    // ★1字は必ず進める（時計だけで止めると、遅い端末では永久に焼けない）。
    while (left > 0 && (glyphsNow === 0 || performance.now() - frameT0 < GLYPH_MS)) {
      if (warmGlyphs(text, p.face_, p.ink, fit.size * dpr, 1) === 0) break;
      glyphsNow += 1; left -= 1;
    }
    if (left > 0) { bakeSkipped = true; return undefined; }
  }
  bakeLeft -= 1;
  const cv = document.createElement("canvas");
  cv.width = Math.max(2, Math.round(w * dpr));
  cv.height = Math.max(2, Math.round(h * dpr));
  const ctx = cv.getContext("2d");
  if (!ctx) return undefined;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = "high";
  const outline = stackOutline(1, pw / ph);
  const trace = (sw: number, sh: number) => {
    ctx.beginPath();
    outline.forEach((q, i) => {
      const x = BAKE_PAD + pw / 2 + q.x * sw;
      const y = BAKE_PAD + ph / 2 + q.y * sh;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };
  const path = () => trace(pw, ph);
  // ★★★**日付あり＝塗り／日付なし＝輪郭**（2026-09-12）。GRAVITY の図形
  //   （`lib/solidPaint.ts` の `paintShape`）と**同じ規則**を通す。
  path();
  // ★日付なしの中は**地と同じ色**（第127巡の半透明は第128巡に撤回）。
  ctx.fillStyle = p.outlined ? BD_GREY : p.face;
  ctx.fill();
  if (p.outlined) {
    // ★★★**線は「内側に」引く**（CSS の `border` と同じ）。道を `EDGE/2` だけ
    //   内側へ寄せ、そこに `EDGE` の線を引く ―― 輪郭の真上だと外へ 0.5px
    //   はみ出して焼き箱の縁（`BAKE_PAD`）とぶつかる。★実測の太さは
    //   `lib/solidPaint.ts` の同じ箇所に書いた（実効 1.08 CSS 画素）。
    ctx.strokeStyle = p.face;
    ctx.lineWidth = EDGE;
    trace(pw - EDGE, ph - EDGE);
    ctx.stroke();
  }
  ctx.save();
  path();
  ctx.clip();
  // ★★★**字はアトラス経由のまま**（第131巡に `fillText` で直に書くのを試して撤回 ――
  //   和文を1字ずつラスタ化するのでかえって 1.8倍 重かった。アトラスは同じ字・同じ
  //   大きさを**全部のタスクで使い回す**ので、山ではそちらが速い）。
  if (fit) drawFitted(ctx, fit, p.face_, w / 2, h / 2, p.ink, fit.size * dpr);
  ctx.restore();
  const made = { canvas: cv, w, h };
  if (bakeCache.size > 80) bakeCache.clear();
  bakeCache.set(key, made);
  return made;
}

/**
 * ★★★JOURNAL の円を1枚焼く（第133巡）。**墨の円に `MUTED` の芯**（録音画面の回る円と
 * 同じ ―― 芯の形は `lib/reelHub.ts` の1か所）。★芯の点の列を毎フレーム引かないよう焼く。
 * 返る `w`/`h` は**余白を含む整数の箱**。
 */
export function reelBitmap(p: Piece, dpr: number): Baked | undefined {
  if (!p.r) return undefined;
  const d = Math.ceil(p.r * 2) + BAKE_PAD * 2;
  const key = ["reel", d, p.face, p.ink, dpr.toFixed(2)].join("|");
  const hit = bakeCache.get(key);
  if (hit) return hit;
  // ★★**1フレームの予算を使い切ったら、今回は代役で描く**（上の `BAKE_PER_FRAME`）。
  if (bakeLeft <= 0) { bakeSkipped = true; return undefined; }
  bakeLeft -= 1;
  const cv = document.createElement("canvas");
  cv.width = Math.max(2, Math.round(d * dpr));
  cv.height = Math.max(2, Math.round(d * dpr));
  const ctx = cv.getContext("2d");
  if (!ctx) return undefined;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = "high";
  ctx.translate(d / 2, d / 2);
  ctx.fillStyle = p.face;
  ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
  // ★★★**芯はグレー**（第101巡にユーザー指定「白ではなくグレーにしてあまり目立たないように」）。
  ctx.fillStyle = p.ink;
  traceHub(ctx, p.r * 2);
  ctx.fill();
  const w = d; const h = d;
  const made = { canvas: cv, w, h };
  if (bakeCache.size > 80) bakeCache.clear();
  bakeCache.set(key, made);
  return made;
}

/**
 * 写真は1度だけ読み込んで使い回す。★読み終わるまでは色ベタの円。
 * ★★★**取りに行く大きさは画面の細かさで決める**（2026-09-11）。240 の決め打ちだと、
 * 実機（倍率 3）の円は 420 デバイス画素あるので**引き伸ばして**貼っていた。
 * ★大きさは 120 刻みへ丸める（倍率が揺れるたびに取り直さないため）。
 */
const photoCache = new Map<string, HTMLImageElement>();
/** ★★来なかった写真（もう頼まない。字面へ落とす）。 */
const photoBad = new Set<string>();
const photoPx = (r: number, dpr: number) =>
  Math.min(720, Math.max(120, Math.ceil((r * 2 * dpr) / 120) * 120));

/** ★その写真は「来ないと分かっている」か（呼ぶ側が字面へ落とすのに使う）。 */
export const photoFailed = (url: string, r: number, dpr: number): boolean =>
  photoBad.has(`${url}|${photoPx(r, dpr)}`);

function photoOf(url: string, r: number, dpr: number, onLoad: () => void): HTMLImageElement | undefined {
  const px = photoPx(r, dpr);
  const key = `${url}|${px}`;
  if (photoBad.has(key)) return undefined;
  const hit = photoCache.get(key);
  if (hit) return hit.complete && hit.naturalWidth > 0 ? hit : undefined;
  const el = new Image();
  // ★★★**`crossOrigin` を付けないこと**（2026-09-18・第122巡にユーザー報告
  //   「**山に落ちてきている提案の図形に写真がついてきていない**」の真因）。
  //   ★★★**提案の写真は他所のサイトの OGP 画像**で、その多くは
  //     `Access-Control-Allow-Origin` を返さない。`crossOrigin="anonymous"` を
  //     付けると**そういう画像は読み込みそのものが失敗する** ―― 帯のピルは
  //     素の `<img>` なので出るのに、**山（canvas）だけ出なかった**。
  //   ★★**付ける理由が1つも無い** ―― `crossOrigin` が要るのは canvas を
  //     **読み返す**とき（`getImageData`/`toDataURL`/`toBlob`）だけで、
  //     このアプリはどこでもやっていない（実測 … 0 件）。**汚染されても困らない。**
  //   ★★もし将来 canvas を読み返すなら、**そのときは代理（プロキシ）が要る**。
  //     ここへ `crossOrigin` を戻しても、写真が消えるだけで解決しない。
  el.onload = onLoad;
  // ★★★**来なかったら諦めて字面へ**（`onerror` が無いと、`complete` が真で
  //   `naturalWidth` が 0 のまま**永久に `undefined` を返し続け**、字面にも
  //   落ちないので**色ベタの図形**になる。第121巡までがその状態）。
  el.onerror = () => { photoBad.add(key); onLoad(); };
  el.src = img(url, px, px);
  photoCache.set(key, el);
  return undefined;
}

/** 字面の顔が版面として使える幅（直径に対する割合）。★目盛りの外（絵の寸法）。
 *  ★凹凸の内側に収める値 ―― 形は器いっぱいに広がるので、1 だと谷で字が欠ける。 */
const LABEL_W = 0.62;
/** 字面の顔の高さの上限（直径に対する割合）。★目盛りの外（絵の寸法）。 */
const LABEL_CAP = 0.30;

/**
 * ★★★**写真が無い提案の顔は「英語の1語」**（2026-09-19・第124巡にユーザー指定
 * 「**写真がないときのデザインがダサいので、せめて英語にしてしっかりとレイアウト
 * してください**」）。語の出どころは `lib/deckStyle.ts` の `categoryOfKind` の1か所
 * ―― 券の版面と同じ語彙（PLACE / EXHIBITION / …）。
 *
 * ★★**書体は `DISPLAY`（Anton）**（`lib/constants.ts` の「大きな欧文と数字だけ」）。
 *   ★`ensureWordFont(DISPLAY)` は板のために**もう頼んである**（山には必ず日付と曜日の
 *   板が居る）。`PLATE_CHARS` が大文字を含むので、この語も同じ断片で描ける。
 * ★★★**大きさは版面の幅に合わせて組む**（段から選ばない＝券の `FitLine` と同じ作法）
 *   ―― 語の長さが 4〜10 字とばらつくので、段から選ぶと短い語だけ間延びする。
 * ★★**字は回さない**（呼ぶ側が `-b.angle` を掛ける）。読ませる字なので。
 */
const labelFs = new Map<string, number>();
function drawOfferLabel(
  ctx: CanvasRenderingContext2D, label: string, d: number, ink: string,
): void {
  const room = d * LABEL_W;
  const cap = d * LABEL_CAP;
  // ★★字の大きさは覚える（第131巡。毎フレーム `measureText` していた）。
  const k = `${label}|${d.toFixed(2)}`;
  let fs = labelFs.get(k);
  if (fs === undefined) {
    ctx.font = canvasFont(WORD_WEIGHT, cap, DISPLAY);
    const w0 = ctx.measureText(label).width || 1;
    // 幅は字の大きさに比例するので、1回測れば解ける（二分探索は要らない）。
    fs = Math.max(6, Math.min(cap, (cap * room) / w0));
    if (labelFs.size > 40) labelFs.clear();
    labelFs.set(k, fs);
  }
  ctx.font = canvasFont(WORD_WEIGHT, fs, DISPLAY);
  ctx.fillStyle = ink;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, 0, 0);
}

/**
 * ★★★**引き下ろしの「幽霊」を1枚描く**（2026-09-14・第102巡）。
 *
 * ★★**焼かない**（毎フレーム寸法が変わるので、焼くとキャッシュを食い潰す）。
 *   文字はグリフのアトラス経由なので、直に描いても1図形ぶんで済む。
 * ★★★**山と同じ canvas・同じ座標系・同じ形の出どころ**に描く ―― だから
 *   指を離した瞬間に物体へ渡しても**継ぎ目が出ない**。
 * ★形は `stackOutline(rows, ar, waist)`（タスク）か `traceCardShape`（提案）。
 */
export function drawGhost(ctx: CanvasRenderingContext2D, g: Ghost, dpr: number): void {
  // ★★★**弾ける前は「帯のピルの写し取り」**（2026-09-14・第105巡）。絵の作り方が
  //   まるごと違う（版面をなぞる ／ 形を組む）ので、**ファイルごと分けてある**。
  // ★★★**姿は掛け金（`g.pill`）が決める。`t` で分岐しない**（2026-09-16・第108巡）
  //   ―― 変形のばねは 0 を挟んで行き過ぎるので、**生の比較だと必ず点滅する**
  //   （`lib/pullDrag.ts` の `Ghost.pill` に理由）。
  if (g.pill && g.look) {
    drawPillGhost(ctx, g);
    return;
  }
  const w = Math.max(8, g.w); const h = Math.max(8, g.h);
  ctx.save();
  // ★★★**支点まわりに振って、速さの向きへ伸ばす**（2026-09-14・第103巡にユーザー確定
  //   「指にぶら下がって揺れる」「引く速さで伸び縮みする」）。数は `lib/pullDrag.ts`
  //   の `stepGhost` が作る ―― **ここは順番を守るだけ**。
  //   ① 支点（＝指へ**バネで追いつく**点）へ行く → ② 振れで回す → ③ 絵の中心へ下りる
  //   → ④ 速さの向きへ回して伸ばし、戻す。
  //   ★★**伸びの軸と振れの軸は別**なので、④ は③のあと（＝中心まわり）で掛ける。
  //   ★★★**輪郭の作り方は1行も触らない**（`stackOutline` の `waist` の1本のまま）。
  ctx.translate(g.hx, g.hy);
  ctx.rotate(g.angle);
  ctx.translate(g.ax, g.ay);
  // ★★★**伸び縮みの層は第109巡に削除した**（ユーザー確定「**図形自体は柔らかく
  //   しなくて良い**」）。柔らかさは**変形の途中**（`waist`／箱の行き過ぎ）と
  //   **支点まわりの振れ**（`angle`）の2つだけが持つ。**復活させない。**
  // ★★★**弾みのバネは第107巡に削除した。復活させない。**
  //   ★変形そのものがばね（`stepGhost` の `mo.morph`）になったので、**上から
  //     もう1本 掛けると 1秒以上ぐらつく**（実測 … 面積が 1.2秒 揺れ続けた）。
  //   **一発 ＝ ばね1本。**
  if (g.kind === "offer") {
    // ★提案は**札の形**へ。器は正方形（`lib/cardShape.ts` の約束）。
    const d = Math.max(w, h);
    ctx.fillStyle = g.face;
    if (g.shape && g.t > 0.5) traceCardShape(ctx, g.shape, d);
    else { ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.closePath(); }
    ctx.fill();
    if (g.label) drawOfferLabel(ctx, g.label, Math.min(w, h), g.ink);
    ctx.restore();
    return;
  }
  // ★★★**くびれが一息に開く**（2026-09-16・第107巡にユーザー確定「**一発で・
  //   気持ちよく・スムーズに・ユニークに**」）。段の数は**最初から最後まで `g.rows`**
  //   で、変わるのは **`waist`（くびれの深さ）だけ** ―― 形の語彙は
  //   `stackOutline` の1本のまま。
  //   ★★★**第104〜106巡の「段が1つずつ生える」はやめた。復活させない。**
  ensureGlyphs(g.faceIdx, g.title);
  const rows = g.rows;
  const outline = stackOutline(rows, w / h, g.waist);
  const trace = (sw: number, sh: number) => {
    ctx.beginPath();
    outline.forEach((q, i) => {
      const x = q.x * sw; const y = q.y * sh;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };
  // ★★★**塗りは `inkMix` が決める**（2026-09-16・第113巡。式は `pillGhost.ts`）。
  //   ピルの版面を描く枝と**同じ量**を読むので、掛け金（`g.pill`）が跳ぶ
  //   フレームでも面の塗り方は 1% も飛ばない。
  const mix = inkMix(g);
  trace(w, h);
  ctx.fillStyle = BD_GREY;
  ctx.fill();
  if (mix > 0) {
    ctx.globalAlpha = mix;
    ctx.fillStyle = g.face;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (mix < 1) {
    ctx.globalAlpha = 1 - mix;
    ctx.strokeStyle = g.face;
    ctx.lineWidth = EDGE;
    trace(w - EDGE, h - EDGE);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // ★★★**字は「行き先の割り付け」1つを、箱の縮みに合わせて等倍で縮める**
  //   （2026-09-16・第107巡）。★★**毎フレーム割り付け直さない** ―― 幅が変わるたび
  //   行の折れ方が変わって**字が跳ねる**し、`layoutInRows` は重い。
  //   ★等倍（`min`）なので**字が潰れない**。箱に収まりきらないぶんは `clip` が切る。
  const fit = ghostFit(g);
  if (fit) {
    const k = Math.min(w / Math.max(1, g.w1), h / Math.max(1, g.h1));
    ctx.save();
    trace(w, h);
    ctx.clip();
    ctx.scale(k, k);
    // ★★字も面と同じ量で渡す（`pillGhost.ts` の `line()` と対）。
    const ink = mix >= 1 || !g.look ? g.ink : mixHex(g.look.ink, g.ink, mix);
    drawFitted(ctx, fit, g.faceIdx, 0, 0, ink, fit.size * dpr * k);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * ★★**幽霊の字の割り付けを憶える**（2026-09-16・第107巡）。
 * 行き先（`w1`/`h1`/`rows`/題）は**1ジェスチャのあいだ変わらない**ので、
 * 1つ憶えておけば毎フレームの組み直しが要らない。
 */
let fitKey = "";
let fitVal: ReturnType<typeof layoutInRows> = null;

function ghostFit(g: Ghost) {
  const key = [g.title, g.faceIdx, g.rows, Math.round(g.w1), Math.round(g.h1)].join("|");
  if (key === fitKey) return fitVal;
  fitKey = key;
  // ★★★**山の絵と同じ割り付け**（`fitTask`）。`g.rows` は**字の行の数**（`taskCellsOf` の `lines`）。
  fitVal = fitTask(g.title, g.faceIdx, g.rows, g.w1, g.h1);
  return fitVal;
}

/** 塗る矩形（器の座標）。★`null` は「全面」。 */
export interface Box { x0: number; y0: number; x1: number; y1: number }

/**
 * ★★★**その図形が塗りうる範囲**（2026-09-15・第106巡）。
 *
 * ★★**回るので、外接円で押さえる**（`hypot(w,h)/2`）―― 角度ごとに正しい箱を
 *   出そうとすると、**焼き箱の余白・カセットの突起・板のにじみ**を全部数える
 *   ことになり、**1つ数え落とすとそこだけ塗り残る**。円なら一発で安全。
 * ★`PAINT_PAD` は焼き箱の余白と線の太さのぶん。★目盛りの外（絵の寸法）。
 */
const PAINT_PAD = 4;

export function drawBoxOf(p: Piece): Box {
  const { x, y } = p.body.position;
  let r: number;
  if (p.r) r = p.r;
  else if (p.w && p.h) r = Math.hypot(p.w, p.h) / 2;
  else {
    const b = p.body.bounds;
    r = Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y) / 2;
  }
  // ★★★**提案は「円の半径」より外まで描かれる**（2026-09-18・第121巡）。
  //   絵は `traceCardShape(ctx, shape, p.r * 2)` ＝ **2r 四方の正方形いっぱい**
  //   なので、中心からいちばん遠い点は `p.r × reach`（実測 … 波打つ四角で **1.292**）。
  //   ★★★**これを忘れると四方 13px ぶん古い絵が残る** ―― ユーザー報告
  //     「**端っこの部分が一部ずれて表示される**」「**図形が歪んでいる**」の正体は
  //     歪んだ形ではなく**前のフレームの拭き残し**だった。
  //   ★倍率は `lib/cardShape.ts` の `cardShapeReach`（**点の列から導く**）。
  if (p.kind === "offer" && p.shape) r *= cardShapeReach(p.shape);
  // ★持ち上がっている図形は、大きくなったぶんと影のぶんだけ広く塗る（拭き残しを出さない）。
  if (look && look.id === p.id) r = r * Math.max(look.k0, look.k1, 1) + LIFT_BLUR + LIFT_DROP;
  r += PAINT_PAD;
  return { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
}

export const boxHits = (a: Box, b: Box): boolean =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * ★★★**一度きりの費用を「落ち始める前」に払う**（2026-09-23・第131巡にユーザー指摘
 * 「**落下し始める時に動作がまた重い**」）。
 *
 * ★★★**山の最初のフレームが 1 回だけ飛び抜けて重かった**（実測 CPU×4 … 166〜219ms）。
 *   中身は**その書体を canvas が初めて使う**費用 ―― 最初の1字（80〜100ms）・
 *   芯の点の列（`hubPoints` 15ms）・提案の字（Anton）・板の絵。どれも**分けられない**。
 * → 中身を作り直した直後（まだ何も画面に入っていない）に、**見えない 1×1 の canvas へ
 *   1度 描いて**払ってしまう。落ちているあいだのフレームには残らない。
 * ★焼く予算は外す（`bakeLeft`）。字だけは時間の予算のまま（1字は必ず進む）。
 */
let scratch: CanvasRenderingContext2D | null = null;
export function prewarmPile(pieces: Piece[], dpr: number): void {
  if (typeof document === "undefined") return;
  if (!scratch) {
    const cv = document.createElement("canvas");
    cv.width = 1; cv.height = 1;
    scratch = cv.getContext("2d");
  }
  if (!scratch) return;
  beginPileFrame();
  bakeLeft = Number.POSITIVE_INFINITY;
  drawPile(scratch, pieces, dpr, () => {});
  bakeLeft = BAKE_PER_FRAME;
}

/**
 * 山を1フレームぶん描く。★`ctx` は**呼ぶ側が `setTransform(dpr,…)` 済み**。
 * ★★`clip` を渡すと、**その矩形に掛からない図形は飛ばす**（第106巡）。
 */
/**
 * ★★★**押した・掴んだ図形の見え方**（2026-09-27・第133巡。ユーザー要望「**触っていて気持ちいい**」）。
 * ★押した瞬間に**沈む**（`PRESS_K`・即座）→ 掴めたら**持ち上がって影が落ちる**（`LIFT_K`・`T_ITEM`）→
 *   離したら**ゆっくり戻る**（`T_ITEM`）。★押下だけが非対称（即座に沈み、ゆっくり戻る。`design.md` §4）。
 * ★★1体だけなので module のただ1つの入れ物（`pullBus` と同じ作法）。★目盛りの外（絵の寸法）。
 */
const PRESS_K = 0.96;
const LIFT_K = 1.05;
/** 持ち上がったときの影（ぼかし・下へのずれ。図形の外にはみ出す量 ＝ 塗り直す箱の余白）。 */
const LIFT_BLUR = 18;
const LIFT_DROP = 8;
const LIFT_SHADOW = "rgba(26,26,24,0.28)";
type Look = { id: string; k0: number; k1: number; s0: number; s1: number; t0: number; dur: number };
let look: Look | null = null;
const lookAt = (l: Look, now: number) => {
  const p = l.dur <= 0 ? 1 : Math.min(1, (now - l.t0) / l.dur);
  const e = easeAt(EASE_SETTLE, p);
  return { k: l.k0 + (l.k1 - l.k0) * e, s: l.s0 + (l.s1 - l.s0) * e, done: p >= 1 };
};
/** ★見え方を切り替える（`"press"` 沈む／`"lift"` 持ち上がる／`"rest"` 戻る）。 */
export function setPileLook(id: string, to: "press" | "lift" | "rest"): void {
  const now = performance.now();
  const cur = look && look.id === id ? lookAt(look, now) : { k: 1, s: 0 };
  if (to === "rest" && (!look || look.id !== id)) return;
  const k1 = to === "press" ? PRESS_K : to === "lift" ? LIFT_K : 1;
  const s1 = to === "lift" ? 1 : 0;
  look = { id, k0: cur.k, k1, s0: cur.s, s1, t0: now, dur: to === "press" ? 0 : ms(T_ITEM) };
}
/** ★見え方が動いている最中か（ループはこのあいだ全面を描き直す）。戻り切ったら片づける。 */
export function pileLookBusy(): boolean {
  if (!look) return false;
  const v = lookAt(look, performance.now());
  if (v.done && look.k1 === 1) { look = null; return true; }   // ★戻り切った最後の1枚は描く
  return !v.done;
}

export function drawPile(
  ctx: CanvasRenderingContext2D, pieces: Piece[], dpr: number, onPhoto: () => void,
  clip?: Box | null, skip?: string | null,
) {
  const lk = look ? { id: look.id, ...lookAt(look, performance.now()) } : null;
  for (const p of pieces) {
    if (skip && p.id === skip) continue;
    if (clip && !boxHits(clip, drawBoxOf(p))) continue;
    const b = p.body;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    if (lk && lk.id === p.id) {
      if (lk.s > 0) {
        ctx.shadowColor = LIFT_SHADOW;
        ctx.shadowBlur = LIFT_BLUR * lk.s;
        ctx.shadowOffsetY = LIFT_DROP * lk.s;
      }
      ctx.scale(lk.k, lk.k);
    }
    ctx.rotate(b.angle);
    ctx.fillStyle = p.face;

    if (p.kind === "task" && p.w && p.h) {
      const bmp = taskBitmap(p, dpr);
      if (bmp) ctx.drawImage(bmp.canvas, -bmp.w / 2, -bmp.h / 2, bmp.w, bmp.h);
      else {
        // ★焼く前の代役。★**1段のピル**で描く（焼けたら段の数は文字が決める）。
        ctx.beginPath();
        const pw = p.w; const ph = p.h;
        stackOutline(1, pw / ph).forEach((q, i) => {
          const x = q.x * pw; const y = q.y * ph;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
      }
    } else if (p.kind === "reel" && p.r) {
      // ★★**録音画面の回る円そのもの**（第133巡）。★合成の絵なので**焼いてから貼る**。
      const bmp = reelBitmap(p, dpr);
      if (bmp) ctx.drawImage(bmp.canvas, -bmp.w / 2, -bmp.h / 2, bmp.w, bmp.h);
      else {
        // ★焼く前の代役は**墨の面だけ**（芯の点の列を毎フレーム引かない）。
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (p.kind === "word") {
      // ★★文字の板は **GRAVITY と同じ焼いた絵**（`lib/wordPlate.ts`）。
      //   ★ここは既に translate/rotate 済みなので、原点に置くだけ。
      const pl = p.plate;
      if (pl) {
        // ★★焼いて貼る（`spriteOf`）。★箱は面と字のどちらか大きいほう＋余白。
        const bw = Math.max(pl.bw, pl.w) + BAKE_PAD * 2;
        const bh = Math.max(pl.bh, pl.h) + BAKE_PAD * 2;
        const key = ["plate", pl.word, pl.badge?.ground ?? "",
          pl.bw.toFixed(2), pl.bh.toFixed(2), pl.fs.toFixed(2), pl.ink, pl.pill ?? "", dpr.toFixed(2)].join("|");
        const bmp = spriteOf(key, bw, bh, dpr, (c) => drawWordPlate(c, pl, 0, 0, 0, dpr));
        if (bmp) blit(ctx, bmp);
        else drawWordPlate(ctx, pl, 0, 0, 0, dpr);
      }
    } else if (p.kind === "offer" && p.r) {
      // ★★**写真の周りにベゼル**（2026-09-07 ユーザー指定）。面はその提案の色で、
      //   写真は**一回り小さい同じ形**に収まる ―― 色の輪が縁として残る。
      // ★★★**形はジャンルが決める**（2026-09-13・第96巡にユーザー指定
      //   「ホームに落とす図形も、このマスクの形にします」）。BRIEF の札と
      //   **同じ写真が同じ形**で出る。出どころは `lib/cardShape.ts` の1か所。
      //   ★★**外接箱は 2r × 2r の正方形**なので、札で起きた「横に潰れる」は
      //     ここでは原理的に起きない。
      const shape = p.shape;
      const r = p.r;
      const trace = (c: CanvasRenderingContext2D, size: number) => {
        if (shape) traceCardShape(c, shape, size);
        else { c.beginPath(); c.arc(0, 0, size / 2, 0, Math.PI * 2); c.closePath(); }
      };
      const im = p.photo ? photoOf(p.photo, r, dpr, onPhoto) : undefined;
      // ★★**写真の状態も鍵に入れる**（届いたら焼き直す。1枚ぶんだけ）。
      const key = ["offer", shape ?? "o", r.toFixed(2), p.face, im ? p.photo : "-", dpr.toFixed(2)].join("|");
      const box = r * 2 + BAKE_PAD * 2;
      const face = p.face;
      const paintOffer = (c: CanvasRenderingContext2D) => {
        c.fillStyle = face;
        trace(c, r * 2);
        c.fill();
        if (!im) return;
        // ★★★**ベゼルは「輪郭から内側へ一定の幅」**（2026-09-27・第133巡にユーザー指摘
        //   「**そのまま縮小して内側に写真があるせいで、細い部分と太い部分ができていて、
        //   ベゼルがオフセットになっていない**」）。
        //   ★★★**第130〜132巡は「同じ形を一回り小さく」**（`trace(c, inner * 2)`）だった ――
        //     拡大縮小は中心からの距離を一律に縮めるので、**縁までの距離が遠い出っ張りほど
        //     ベゼルが太く、中心に近いへこみほど細くなる**（四つ葉の谷・三つ葉の付け根）。
        //   → **写真は形いっぱいに切り抜き、同じ輪郭を `2 × 幅` の太さで引く**。線の半分は
        //     切り抜きの外へ出て消え、**内側の半分 ＝ 輪郭から一定の距離の帯**だけが残る
        //     （＝ 本当のオフセット。谷では線の角が丸く繋がる ―― `lineJoin: round`）。
        //   ★幅は今までの「半径の `OFFER_BEZEL`」（帯のピルと同じ比）のまま。
        const bez = r * OFFER_BEZEL;
        c.save();
        trace(c, r * 2);
        c.clip();
        const s2 = Math.max((r * 2) / im.naturalWidth, (r * 2) / im.naturalHeight);
        const iw = im.naturalWidth * s2; const ih = im.naturalHeight * s2;
        c.drawImage(im, -iw / 2, -ih / 2, iw, ih);
        c.lineWidth = bez * 2;
        c.lineJoin = "round";
        c.strokeStyle = face;
        trace(c, r * 2);
        c.stroke();
        c.restore();
      };
      // ★★★**焼くのは写真があるときだけ**（第131巡に測った）。写真は毎フレーム
      //   切り抜いて縮めることになるので焼く価値がある。面だけの形は**点の列を
      //   覚えてある**（`cardShapePoints`）ので直に塗るほうが軽い ―― 全部を焼くと
      //   焼く予算をタスクと奪い合い、CPU×4 で8回中3回 落ちてくるあいだ 20fps に
      //   張り付いた（焼かなければ 0 回）。
      const bmp = im ? spriteOf(key, box, box, dpr, paintOffer) : undefined;
      if (bmp) blit(ctx, bmp);
      else paintOffer(ctx);
      // ★★**写真が来ないと分かったら字面へ落ちる**（`label` は写真があっても持つ）。
      if (!im && p.label) {
        ctx.rotate(-b.angle);          // ★読ませる字なので回さない
        drawOfferLabel(ctx, p.label, r * 2, p.ink);
      }
    }
    ctx.restore();
  }
}
