import {
  boundsOf, frontRect, innerBox, sectionOutline, slabRects,
  type Pt, type SolidSpec,
} from "./solid";
import { tagColor, tagInk, tagLabel } from "./taskTags";
import { drawFitted, fitText, missingGlyphs, requestFonts, warmGlyphs } from "./textFit";
import type { TaskTag } from "./types";

// ★タスクの図形を canvas に描く。**3D は一切持たない**(2026-08-13にユーザー
// 確定)。真横から見た立面を2枚、ベタ塗りで描くだけ。
//
//   FRONT  … 長方形。スラブの切れ目で割れる。**タスクのタイトル**を図形いっぱいに。
//   BOTTOM … 断面の形(円/半円/三角/四角)。**形は正しいまま**、足あとの高さに
//            合わせて中央へ。**タグの英字**を図形いっぱいに。
//
// 色はどちらもタグの色を全面に。**文字の色もタグが決める**(画像の組み合わせ
// との一対一対応・2026-08-16確定)。書体は図形ごとに1つ(lib/textFit.ts)。
//
// ★図形まるごとを1枚のビットマップに焼いてキャッシュする(性能の要)。
// matter.js の物体は画面内の2D回転しかしないので、キャッシュした絵を
// body.angle で回して drawImage するだけで厳密に正しい。

export type SolidView = "front" | "bottom";

export interface SolidPaint {
  spec: SolidSpec;
  view: SolidView;
  tag?: TaskTag;
  /** FRONT に載せる文字(タスクの題)。BOTTOM はタグの英字を使う。 */
  title: string;
  /** 書体の割り当てを決める種。タスクの id。 */
  seed: string;
}

/** 1単位を何pxで描くか。★2026-08-13にユーザー指定で 32 → 64(2倍)。 */
export const UNIT_PX = 64;

type Canvas2D = HTMLCanvasElement;

const poly = (ctx: CanvasRenderingContext2D, pts: Pt[], unit: number, cx = 0, cy = 0) => {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = cx + p.x * unit;
    const y = cy + p.y * unit;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
};

/** 図形を、原点(0,0)を中心に ctx へ描く。単位は solid 座標 × unit(px)。 */
export function paintShape(ctx: CanvasRenderingContext2D, p: SolidPaint, unit = UNIT_PX) {
  const fill = tagColor(p.tag);
  const ink = tagInk(p.tag);
  // 使う書体の読み込みを頼んでおく(まだなら fallback で描かれ、揃った時点で
  // 呼び出し側が絵を作り直す)。
  requestFonts(p.title + tagLabel(p.tag));

  if (p.view === "bottom") {
    // 断面の形を、**縦横比はそのまま**、足あとの高さ(2r)に合わせて置く。
    const size = 2 * p.spec.radius * unit;
    const outline = sectionOutline(p.spec.sides.length);
    ctx.fillStyle = fill;
    poly(ctx, outline.map((q) => ({ x: q.x * size, y: q.y * size })), 1);
    ctx.fill();

    const box = innerBox(p.spec.sides.length);
    const fit = fitText(tagLabel(p.tag), `${p.seed}|tag`, box.w * size, box.h * size, 2);
    if (fit) drawFitted(ctx, fit, `${p.seed}|tag`, (box.x + box.w / 2) * size, (box.y + box.h / 2) * size, ink);
    return;
  }

  // FRONT。スラブごとの長方形を塗り、その union にクリップしてから題を描く
  // (切れ目のところで文字がスパッと切れる)。
  const { w, h } = frontRect(p.spec);
  const rects = slabRects(p.spec);
  ctx.fillStyle = fill;
  for (const r of rects) ctx.fillRect(r.x0 * unit, (-h / 2) * unit, (r.x1 - r.x0) * unit, h * unit);

  ctx.save();
  ctx.beginPath();
  for (const r of rects) ctx.rect(r.x0 * unit, (-h / 2) * unit, (r.x1 - r.x0) * unit, h * unit);
  ctx.clip();
  const pad = 0.06;
  const fit = fitText(p.title, p.seed, w * unit * (1 - pad * 2), h * unit * (1 - pad * 2), 4);
  if (fit) drawFitted(ctx, fit, p.seed, 0, 0, ink);
  ctx.restore();
}

/** その図形が使う文字と色。グリフの用意に使う。 */
const textOf = (p: SolidPaint) => (p.view === "bottom" ? tagLabel(p.tag) : p.title);
const seedOf = (p: SolidPaint) => (p.view === "bottom" ? `${p.seed}|tag` : p.seed);

/**
 * その図形を焼くのに足りないグリフを budget 枚まで用意し、**用意した枚数**を返す。
 * ★グリフ1枚の fillText は和文のWebフォントだと数ms〜10ms かかる。落下中に
 * 7個ぶんをまとめて焼くと数秒止まるので(実測 fillText 合計2.4秒)、
 * 呼び出し側はフレームごとに少しずつ配ること。
 */
export function warmShapeGlyphs(p: SolidPaint, budget: number): number {
  return warmGlyphs(textOf(p), seedOf(p), tagInk(p.tag), budget);
}

/** その図形を今すぐ焼けるか(グリフが全部そろっているか)。 */
export const shapeGlyphsReady = (p: SolidPaint): boolean =>
  missingGlyphs(textOf(p), seedOf(p), tagInk(p.tag)) === 0;

/** その絵が占める範囲(solid 座標)。ビットマップの大きさを決めるのに使う。 */
export function shapeBounds(p: SolidPaint) {
  if (p.view === "bottom") {
    const size = 2 * p.spec.radius;
    return boundsOf(sectionOutline(p.spec.sides.length).map((q) => ({ x: q.x * size, y: q.y * size })));
  }
  const { w, h } = frontRect(p.spec);
  return { minX: -w / 2, maxX: w / 2, minY: -h / 2, maxY: h / 2 };
}

// ── 図形まるごとのビットマップ ──────────────────────────────

export interface SolidBitmap {
  canvas: Canvas2D;
  /** CSSピクセルでの大きさ。中心が図形の中心(=物体の位置)。 */
  w: number;
  h: number;
  dpr: number;
}

const bmpCache = new Map<string, SolidBitmap>();
const BMP_LIMIT = 60;

/** 焼いた絵を全部捨てる(書体が揃ったときに呼ぶ。次に描くとき作り直される)。 */
export function clearSolidBitmaps() {
  bmpCache.clear();
}

export const paintKey = (p: SolidPaint, unit: number): string =>
  [p.view, p.tag ?? "-", p.spec.sides.length, p.spec.len.toFixed(3), p.spec.radius.toFixed(3),
    p.spec.slabs, unit.toFixed(1), p.seed, p.title].join("|");

/** 焼いてあるものだけ返す(まだなら undefined)。
 *  ★山に何個もいっぺんに落とすと、1フレームで全部を焼くことになって数百ms
 *  止まる。呼び出し側はこれで「焼けているものだけ描き、焼けていないものは
 *  今フレームの予算の範囲でだけ焼く」という配り方ができる。 */
export const peekSolidBitmap = (p: SolidPaint, unit = UNIT_PX, dpr = 1): SolidBitmap | undefined =>
  bmpCache.get(`${paintKey(p, unit)}|${dpr.toFixed(2)}`);

export function solidBitmap(p: SolidPaint, unit = UNIT_PX, dpr = 1): SolidBitmap {
  const key = `${paintKey(p, unit)}|${dpr.toFixed(2)}`;
  const hit = bmpCache.get(key);
  if (hit) {
    bmpCache.delete(key);
    bmpCache.set(key, hit);
    return hit;
  }
  const b = shapeBounds(p);
  // 物体の中心が絵の中心に来る箱(回転しても位置がずれないため)。
  const halfW = Math.max(b.maxX, -b.minX) * unit + 1;
  const halfH = Math.max(b.maxY, -b.minY) * unit + 1;
  const w = Math.ceil(halfW * 2);
  const h = Math.ceil(halfH * 2);
  const cv = document.createElement("canvas");
  cv.width = Math.max(2, Math.round(w * dpr));
  cv.height = Math.max(2, Math.round(h * dpr));
  const ctx = cv.getContext("2d");
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(w / 2, h / 2);
    paintShape(ctx, p, unit);
  }
  const made = { canvas: cv, w, h, dpr };
  bmpCache.set(key, made);
  if (bmpCache.size > BMP_LIMIT) {
    const oldest = bmpCache.keys().next().value;
    if (oldest !== undefined) bmpCache.delete(oldest);
  }
  return made;
}
