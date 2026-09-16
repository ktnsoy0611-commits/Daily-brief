import { BAND_BEZEL, BD_GREY, DISPLAY, MUTED, SANS, mixHex } from "@/lib/constants";
import { img } from "@/lib/helpers";
import { CASSETTE_TAB_H_PER_H, drawCassette } from "@/lib/cassette";
import { traceCardShape } from "@/lib/cardShape";
import { clampRows, halfWidthAtStack, stackOutline } from "@/lib/solid";
import { rowsOf } from "@/lib/taskSize";
import { canvasFont, drawFitted, ensureGlyphs, layoutInRows } from "@/lib/textFit";
import { WEIGHT } from "@/lib/tokens";
import { drawWordPlate } from "@/lib/wordPlate";
import { WORD_WEIGHT } from "@/lib/solidPaint";
import { zigVerts, type Piece } from "./pileWorld";
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
export function clearPileBitmaps() { bakeCache.clear(); }

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
export function beginPileFrame(): void { bakeLeft = BAKE_PER_FRAME; bakeSkipped = false; }
/** ★このフレームで焼き切れなかったか（真なら次のフレームも塗り直す）。 */
export function bakeDeferred(): boolean { return bakeSkipped; }

/** タスク（角丸の四角）を1枚焼く。返る `w`/`h` は**余白を含む整数の箱**。 */
export function taskBitmap(p: Piece, dpr: number): Baked | undefined {
  if (!p.w || !p.h || p.face_ === undefined || !p.title) return undefined;
  const pw = Math.ceil(p.w); const ph = Math.ceil(p.h);
  const w = pw + BAKE_PAD * 2; const h = ph + BAKE_PAD * 2;
  const key = [p.id, w, h, p.face, p.ink, p.face_, p.title, dpr.toFixed(2), p.outlined ? "o" : "-"].join("|");
  const hit = bakeCache.get(key);
  if (hit) return hit;
  // ★★**1フレームの予算を使い切ったら、今回は代役で描く**（上の `BAKE_PER_FRAME`）。
  if (bakeLeft <= 0) { bakeSkipped = true; return undefined; }
  bakeLeft -= 1;
  const cv = document.createElement("canvas");
  cv.width = Math.max(2, Math.round(w * dpr));
  cv.height = Math.max(2, Math.round(h * dpr));
  const ctx = cv.getContext("2d");
  if (!ctx) return undefined;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = "high";
  // ★★★**形は `lib/solid.ts` の「ピルの積み」から引く**（2026-09-13・第99巡）。
  //   山だけ角丸の四角を別に描いていたのをやめた ―― **同じタスクが画面によって
  //   違う形**に見えていた（ユーザー確定で TASK アプリと山の両方を揃える）。
  ensureGlyphs(p.face_, p.title);
  // ★★★**段の数は題の文字数から**（`rowsOf`。第99巡）。TASK アプリと**同じ関数**。
  //   ★書体の到着で段数が変わらないよう、行数の実測ではなく純粋な関数から引く。
  const rows = clampRows(rowsOf(p.title));
  // ★★★**割り付けも TASK アプリと同じ `layoutInRows`**（2026-09-13・第100巡）。
  //   第99巡は `fitText(..., pw * 0.82, ph * 0.7, rows)` で組んでいた ―― 矩形に
  //   詰めるので**段の中心と行の中心が一致せず**、`0.7` のぶん山と TASK で
  //   **同じタスクの絵が違っていた**。段の profile（`halfWidthAtStack`）を渡す。
  const fit = layoutInRows(
    p.title, p.face_, rows, pw, ph,
    (t) => halfWidthAtStack(rows, pw / ph, t), ph / rows,
  );
  const outline = stackOutline(rows, pw / ph);
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
  // ★★★**左上の突起は本体の外へ出る**（第99巡）ので、焼き箱を**四方に広げる**。
  //   `BAKE_PAD`(1) のままだと突起の頭が切れる（実機の山で切れていた）。
  //   ★四方に同じだけ広げるので、**本体の中心は箱の中心のまま**＝貼る位置は変わらない。
  const pad = Math.ceil(ph * CASSETTE_TAB_H_PER_H) + BAKE_PAD;
  const w = pw + pad * 2; const h = ph + pad * 2;
  const key = ["cassette", w, h, p.face, p.ink, dpr.toFixed(2)].join("|");
  const hit = bakeCache.get(key);
  if (hit) return hit;
  // ★★**1フレームの予算を使い切ったら、今回は代役で描く**（上の `BAKE_PER_FRAME`）。
  if (bakeLeft <= 0) { bakeSkipped = true; return undefined; }
  bakeLeft -= 1;
  const cv = document.createElement("canvas");
  cv.width = Math.max(2, Math.round(w * dpr));
  cv.height = Math.max(2, Math.round(h * dpr));
  const ctx = cv.getContext("2d");
  if (!ctx) return undefined;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingQuality = "high";
  // ★原点を絵の中心へ（`drawCassette` は中心に描く）。
  ctx.translate(w / 2, h / 2);
  // ★★★**芯はグレー**（2026-09-13・第101巡にユーザー指定「円の中の線は白ではなく
  //   グレーにしてあまり目立たないように」）。★★**ここだけ `bodyInkOn` から外れる**
  //   ―― 芯は「面の上で読ませる文字」ではなく**控えめに在る部品**だから。
  //   墨の円の上で比 4.3（白は 11.25）。
  drawCassette(ctx, pw, ph, p.face, p.ink, MUTED);
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
    if (g.glyph) {
      ctx.fillStyle = g.ink;
      ctx.font = canvasFont(WEIGHT.bold, Math.min(w, h) * 0.5, SANS);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(g.glyph, 0, 0);
    }
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
  fitVal = layoutInRows(
    g.title, g.faceIdx, g.rows, g.w1, g.h1,
    (y) => halfWidthAtStack(g.rows, g.w1 / g.h1, y), g.h1 / g.rows,
  );
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
  // ★★カセットだけは**突起が本体の外へ出る**ので、焼き箱と同じだけ広げる。
  if (p.kind === "cassette" && p.h) r += p.h * CASSETTE_TAB_H_PER_H;
  r += PAINT_PAD;
  return { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
}

export const boxHits = (a: Box, b: Box): boolean =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * 山を1フレームぶん描く。★`ctx` は**呼ぶ側が `setTransform(dpr,…)` 済み**。
 * ★★`clip` を渡すと、**その矩形に掛からない図形は飛ばす**（第106巡）。
 */
export function drawPile(
  ctx: CanvasRenderingContext2D, pieces: Piece[], dpr: number, onPhoto: () => void,
  clip?: Box | null, skip?: string | null,
) {
  for (const p of pieces) {
    if (skip && p.id === skip) continue;
    if (clip && !boxHits(clip, drawBoxOf(p))) continue;
    const b = p.body;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
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
    } else if (p.kind === "cassette" && p.w && p.h) {
      // ★★**タブのアイコンと同じカセット**（`lib/cassette.ts`。タブの SVG と
      //   同じ数を読む）。★合成の絵なので**焼いてから貼る**。
      const bmp = cassetteBitmap(p, dpr);
      if (bmp) ctx.drawImage(bmp.canvas, -bmp.w / 2, -bmp.h / 2, bmp.w, bmp.h);
      else drawCassette(ctx, p.w, p.h, p.face, p.ink, MUTED);
    } else if (p.kind === "word") {
      // ★★文字の板は **GRAVITY と同じ焼いた絵**（`lib/wordPlate.ts`）。
      //   ★ここは既に translate/rotate 済みなので、原点に置くだけ。
      if (p.plate) drawWordPlate(ctx, p.plate, 0, 0, 0, dpr);
    } else if (p.kind === "offer" && p.r) {
      // ★★**写真の周りにベゼル**（2026-09-07 ユーザー指定）。面はその提案の色で、
      //   写真は**一回り小さい同じ形**に収まる ―― 色の輪が縁として残る。
      // ★★★**形はジャンルが決める**（2026-09-13・第96巡にユーザー指定
      //   「ホームに落とす図形も、このマスクの形にします」）。BRIEF の札と
      //   **同じ写真が同じ形**で出る。出どころは `lib/cardShape.ts` の1か所。
      //   ★★**外接箱は 2r × 2r の正方形**なので、札で起きた「横に潰れる」は
      //     ここでは原理的に起きない。
      const shape = p.shape;
      const trace = (size: number) => {
        if (shape) traceCardShape(ctx, shape, size);
        else { ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.closePath(); }
      };
      trace(p.r * 2);
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
        trace(inner * 2);
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
      // ★★大きな数字は `DISPLAY`（Anton。第100巡）。単一ウェイトなので 400 で頼む
      //   （900 を頼むと合成ボールドが掛かる）。
      ctx.font = canvasFont(WORD_WEIGHT, p.r * 0.9, DISPLAY);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(p.count ?? 0), 0, 0);
    }
    ctx.restore();
  }
}
