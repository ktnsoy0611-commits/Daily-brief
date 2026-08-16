import {
  boundsOf, frontRect, innerBox, sectionOutline, slabRects,
  type Pt, type SolidSpec,
} from "./solid";
import { tagColor, tagFace, tagInk, tagLabel } from "./taskTags";
import { drawFitted, fitText, layoutText, missingGlyphs, requestFonts, warmGlyphs } from "./textFit";
import type { TaskTag } from "./types";

// ★タスクの図形を canvas に描く。**3D は一切持たない**(2026-08-13にユーザー
// 確定)。真横から見た立面を2枚、ベタ塗りで描くだけ。
//
//   FRONT  … 長方形。スラブの切れ目で割れる。**タスクのタイトル**を一定の
//            大きさで**左下**に(2026-08-16確定)。
//   BOTTOM … 断面の形(円/半円/三角/四角)。**形は正しいまま**、面積(=重要度)の
//            大きさで。**タグの英字**を図形いっぱいに。
//
// 色はどちらもタグの色を全面に。**文字の色も書体もタグが決める**
// (画像の組み合わせとの一対一対応・2026-08-16確定)。
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
}

/** 1単位を何pxで描くか。★2026-08-13にユーザー指定で 32 → 64(2倍)。
 *  実際に渡される unit は、山の混み具合に応じて GravityTab が縮めた値
 *  (UNIT_PX × scale)。 */
export const UNIT_PX = 64;

// ── LOD ────────────────────────────────────────────────────
// ★図形が小さくなったら描くものを減らす(2026-08-16にユーザー指定)。
// 判定は**実際に描かれる px** で行うので、一括スケールを縮めるだけで
// 自動的に効く。文字を描かない = グリフを焼かないので、数が増えるほど
// 1枚あたりのコストが下がる。
/** これ未満はタイトルを最大1行に切り詰める。 */
const LOD_ONE_LINE = 46;
/** これ未満は文字を描かない。 */
const LOD_NO_TEXT = 28;
/** これ未満はスラブの切れ目も描かない(ベタ塗り1枚)。 */
const LOD_NO_SLIT = 14;

/** タイトルの基準の大きさ(solid 座標)。UNIT=64 で約 19px。
 *  ★「できるだけ大きく」は廃止(2026-08-16)。まずこの大きさで組み、
 *  入らないときだけ折り返し、それでも駄目なら縮める。 */
const TITLE_EM = 0.30;
/** 文字を置く内側の余白(solid 座標)。 */
const TITLE_PAD = 0.10;

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
  // ★書体はタグが決める(同じタグ = 同じ書体)。
  const face = tagFace(p.tag);
  // 使う書体の読み込みを頼んでおく(まだなら fallback で描かれ、揃った時点で
  // 呼び出し側が絵を作り直す)。
  requestFonts(p.title + tagLabel(p.tag));

  if (p.view === "bottom") {
    // 断面の形を、**縦横比はそのまま**、面積(=重要度)の大きさで置く。
    const size = p.spec.section * unit;
    const outline = sectionOutline(p.spec.sides.length);
    ctx.fillStyle = fill;
    poly(ctx, outline.map((q) => ({ x: q.x * size, y: q.y * size })), 1);
    ctx.fill();

    // ★BOTTOM のタグ名は以前の指定どおり**図形いっぱい**のまま。
    if (size < LOD_NO_TEXT) return;
    const box = innerBox(p.spec.sides.length);
    const fit = fitText(tagLabel(p.tag), face, box.w * size, box.h * size, 2);
    if (fit) drawFitted(ctx, fit, face, (box.x + box.w / 2) * size, (box.y + box.h / 2) * size, ink);
    return;
  }

  // FRONT。スラブごとの長方形を塗り、その union にクリップしてから題を描く
  // (切れ目のところで文字がスパッと切れる)。
  const { w, h } = frontRect(p.spec);
  const hpx = h * unit;
  const x0 = (-w / 2) * unit;
  const y0 = (-h / 2) * unit;
  ctx.fillStyle = fill;
  if (hpx < LOD_NO_SLIT) {
    // 小さすぎる。切れ目を描いても潰れて見えないので1枚のベタ塗りにする。
    ctx.fillRect(x0, y0, w * unit, hpx);
    return;
  }
  const rects = slabRects(p.spec);
  for (const r of rects) ctx.fillRect(r.x0 * unit, y0, (r.x1 - r.x0) * unit, hpx);

  if (hpx < LOD_NO_TEXT) return;

  ctx.save();
  ctx.beginPath();
  for (const r of rects) ctx.rect(r.x0 * unit, y0, (r.x1 - r.x0) * unit, hpx);
  ctx.clip();
  // ★タイトルは一定の大きさで、図形の**左下**へ寄せる(2026-08-16確定)。
  const pad = TITLE_PAD * unit;
  const maxLines = hpx < LOD_ONE_LINE ? 1 : 3;
  const fit = layoutText(
    p.title, face,
    w * unit - pad * 2, hpx - pad * 2,
    TITLE_EM * unit, maxLines,
  );
  if (fit) drawFitted(ctx, fit, face, x0 + pad, y0 + hpx - pad, ink, "bottom-left");
  ctx.restore();
}

/** その図形が使う文字と色。グリフの用意に使う。 */
const textOf = (p: SolidPaint) => (p.view === "bottom" ? tagLabel(p.tag) : p.title);


/**
 * その図形を焼くのに足りないグリフを budget 枚まで用意し、**用意した枚数**を返す。
 * ★グリフ1枚の fillText は和文のWebフォントだと数ms〜10ms かかる。落下中に
 * 7個ぶんをまとめて焼くと数秒止まるので(実測 fillText 合計2.4秒)、
 * 呼び出し側はフレームごとに少しずつ配ること。
 */
export function warmShapeGlyphs(p: SolidPaint, budget: number): number {
  return warmGlyphs(textOf(p), tagFace(p.tag), tagInk(p.tag), budget);
}

/** その図形を今すぐ焼けるか(グリフが全部そろっているか)。 */
export const shapeGlyphsReady = (p: SolidPaint): boolean =>
  missingGlyphs(textOf(p), tagFace(p.tag), tagInk(p.tag)) === 0;

/** その絵が占める範囲(solid 座標)。ビットマップの大きさを決めるのに使う。 */
export function shapeBounds(p: SolidPaint) {
  if (p.view === "bottom") {
    const size = p.spec.section;
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
    p.spec.section.toFixed(3), p.spec.slabs, unit.toFixed(1), p.title].join("|");

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
