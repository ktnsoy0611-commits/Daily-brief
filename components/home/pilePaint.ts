import { BAND_BEZEL, BD_GREY, LATIN, SANS } from "@/lib/constants";
import { img } from "@/lib/helpers";
import { drawCassette } from "@/lib/cassette";
import { canvasFont, drawFitted, ensureGlyphs, fitText } from "@/lib/textFit";
import { RADIUS, WEIGHT } from "@/lib/tokens";
import { drawWordPlate } from "@/lib/wordPlate";
import { zigVerts, type Piece } from "./pileWorld";

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
export function clearPileBitmaps() { bakeCache.clear(); }

/** タスク（角丸の四角）を1枚焼く。返る `w`/`h` は**余白を含む整数の箱**。 */
export function taskBitmap(p: Piece, dpr: number): Baked | undefined {
  if (!p.w || !p.h || p.face_ === undefined || !p.title) return undefined;
  const pw = Math.ceil(p.w); const ph = Math.ceil(p.h);
  const w = pw + BAKE_PAD * 2; const h = ph + BAKE_PAD * 2;
  const key = [p.id, w, h, p.face, p.ink, p.face_, p.title, dpr.toFixed(2), p.outlined ? "o" : "-"].join("|");
  const hit = bakeCache.get(key);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = Math.max(2, Math.round(w * dpr));
  cv.height = Math.max(2, Math.round(h * dpr));
  const ctx = cv.getContext("2d");
  if (!ctx) return undefined;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = "high";
  const r = Math.min(RADIUS.lg, pw / 2, ph / 2);
  const path = () => {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(BAKE_PAD, BAKE_PAD, pw, ph, r);
    else ctx.rect(BAKE_PAD, BAKE_PAD, pw, ph);
    ctx.closePath();
  };
  // ★★★**日付あり＝塗り／日付なし＝輪郭**（2026-09-12）。GRAVITY の図形
  //   （`lib/solidPaint.ts` の `paintShape`）と**同じ規則**を通す。
  path();
  ctx.fillStyle = p.outlined ? BD_GREY : p.face;
  ctx.fill();
  if (p.outlined) {
    // ★★★**線は「内側に」引く**（CSS の `border` と同じ）。道を `EDGE/2` だけ
    //   内側へ寄せ、そこに `EDGE` の線を引く ―― 輪郭の真上だと外へ 0.5px
    //   はみ出して焼き箱の縁（`BAKE_PAD`）とぶつかる。★実測の太さは
    //   `lib/solidPaint.ts` の同じ箇所に書いた（実効 1.08 CSS 画素）。
    ctx.strokeStyle = p.face;
    ctx.lineWidth = EDGE;
    ctx.beginPath();
    const x0 = BAKE_PAD + EDGE / 2; const y0 = BAKE_PAD + EDGE / 2;
    const iw = pw - EDGE; const ih = ph - EDGE;
    if (typeof ctx.roundRect === "function") ctx.roundRect(x0, y0, iw, ih, Math.max(0, r - EDGE / 2));
    else ctx.rect(x0, y0, iw, ih);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.save();
  path();
  ctx.clip();
  ensureGlyphs(p.face_, p.title);
  const fit = fitText(p.title, p.face_, pw * 0.82, ph * 0.7, 3);
  if (fit) drawFitted(ctx, fit, p.face_, w / 2, h / 2, p.ink, fit.size * dpr);
  ctx.restore();
  const made = { canvas: cv, w, h };
  if (bakeCache.size > 80) bakeCache.clear();
  bakeCache.set(key, made);
  return made;
}

/**
 * カセットを1枚焼く（★合成の絵なので毎フレーム描かない。`taskBitmap` と同じ作法）。
 * 返る `w`/`h` は**余白を含む整数の箱**。
 */
export function cassetteBitmap(p: Piece, dpr: number): Baked | undefined {
  if (!p.w || !p.h) return undefined;
  const pw = Math.ceil(p.w); const ph = Math.ceil(p.h);
  const w = pw + BAKE_PAD * 2; const h = ph + BAKE_PAD * 2;
  const key = ["cassette", w, h, p.face, p.ink, dpr.toFixed(2)].join("|");
  const hit = bakeCache.get(key);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = Math.max(2, Math.round(w * dpr));
  cv.height = Math.max(2, Math.round(h * dpr));
  const ctx = cv.getContext("2d");
  if (!ctx) return undefined;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = "high";
  // ★原点を絵の中心へ（`drawCassette` は中心に描く）。
  ctx.translate(w / 2, h / 2);
  drawCassette(ctx, pw, ph, p.face, p.ink);
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
const photoPx = (r: number, dpr: number) =>
  Math.min(720, Math.max(120, Math.ceil((r * 2 * dpr) / 120) * 120));

function photoOf(url: string, r: number, dpr: number, onLoad: () => void): HTMLImageElement | undefined {
  const px = photoPx(r, dpr);
  const key = `${url}|${px}`;
  const hit = photoCache.get(key);
  if (hit) return hit.complete && hit.naturalWidth > 0 ? hit : undefined;
  const el = new Image();
  el.crossOrigin = "anonymous";
  el.onload = onLoad;
  el.src = img(url, px, px);
  photoCache.set(key, el);
  return undefined;
}

/** 山を1フレームぶん描く。★`ctx` は**呼ぶ側が `setTransform(dpr,…)` 済み**。 */
export function drawPile(
  ctx: CanvasRenderingContext2D, pieces: Piece[], dpr: number, onPhoto: () => void,
) {
  for (const p of pieces) {
    const b = p.body;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = p.face;

    if (p.kind === "task" && p.w && p.h) {
      const bmp = taskBitmap(p, dpr);
      if (bmp) ctx.drawImage(bmp.canvas, -bmp.w / 2, -bmp.h / 2, bmp.w, bmp.h);
      else {
        const r = Math.min(RADIUS.lg, p.w / 2, p.h / 2);
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, r);
        else ctx.rect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.closePath();
        ctx.fill();
      }
    } else if (p.kind === "cassette" && p.w && p.h) {
      // ★★**タブのアイコンと同じカセット**（`lib/cassette.ts`。タブの SVG と
      //   同じ数を読む）。★合成の絵なので**焼いてから貼る**。
      const bmp = cassetteBitmap(p, dpr);
      if (bmp) ctx.drawImage(bmp.canvas, -bmp.w / 2, -bmp.h / 2, bmp.w, bmp.h);
      else drawCassette(ctx, p.w, p.h, p.face, p.ink);
    } else if (p.kind === "word") {
      // ★★文字の板は **GRAVITY と同じ焼いた絵**（`lib/wordPlate.ts`）。
      //   ★ここは既に translate/rotate 済みなので、原点に置くだけ。
      if (p.plate) drawWordPlate(ctx, p.plate, 0, 0, 0, dpr);
    } else if (p.kind === "offer" && p.r) {
      // ★★**写真の周りにベゼル**（2026-09-07 ユーザー指定）。円はその提案の色で、
      //   写真は**一回り小さい円**に収まる ―― 色の輪が縁として残る。
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      const im = p.photo ? photoOf(p.photo, p.r, dpr, onPhoto) : undefined;
      if (!im && p.glyph) {
        // ★★★**写真が無い提案の顔は「字面」**（2026-09-08）。ブリーフの
        //   カードが写真の無いときにやっていることと**同じ規則**。
        ctx.rotate(-b.angle);          // ★読ませる字なので回さない
        ctx.fillStyle = p.ink;
        ctx.globalAlpha = 0.92;
        ctx.font = canvasFont(WEIGHT.bold, p.r * 1.15, SANS);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(p.glyph, 0, 0);
        ctx.globalAlpha = 1;
      }
      if (im) {
        const inner = Math.max(4, p.r - BAND_BEZEL);
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, inner, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        const s2 = Math.max((inner * 2) / im.naturalWidth, (inner * 2) / im.naturalHeight);
        const iw = im.naturalWidth * s2; const ih = im.naturalHeight * s2;
        ctx.drawImage(im, -iw / 2, -ih / 2, iw, ih);
        ctx.restore();
      }
    } else if (p.kind === "badge" && p.r) {
      // ★輪郭は物理と同じ `zigVerts`（絵と当たり判定を1つの出どころに）。
      ctx.beginPath();
      zigVerts(p.r).forEach((v, i) => { if (i === 0) ctx.moveTo(v.x, v.y); else ctx.lineTo(v.x, v.y); });
      ctx.closePath();
      ctx.fill();
      // ★★★**数字も一緒に回す**（2026-09-09 ユーザー指定「そのまま図形に
      //   焼き付けて落として」）。図形は転がるのに中身だけ据わっていると、
      //   **面に描いてあるのではなく上に浮いている**ように見える。
      ctx.fillStyle = p.ink;
      ctx.font = canvasFont(900, p.r * 0.9, LATIN);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(p.count ?? 0), 0, 0);
    }
    ctx.restore();
  }
}
