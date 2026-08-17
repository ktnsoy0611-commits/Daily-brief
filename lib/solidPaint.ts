import {
  boundsOf, innerBox, rectOf, sectionOutline, slabRects,
  type Pt, type SolidSpec,
} from "./solid";
import { tagColor, tagFace, tagInk, tagLabel } from "./taskTags";
import { drawFitted, ensureGlyphs, fitText, fontReady, layoutInShape, missingGlyphs, warmGlyphs } from "./textFit";
import type { TaskTag } from "./types";

// ★タスクの図形を canvas に描く。**3D は一切持たない**(2026-08-13にユーザー
// 確定)。真横から見た立面を2枚、ベタ塗りで描くだけ。
//
// ★形はビューによらず**1つ**。切り替えても山は動かず、**載る文字だけ**が
// 変わる(2026-08-16にユーザー確定):
//   ネームビュー … **タスクの題**を中央に(一定の下限＋面積に比例)
//   タグビュー   … **タグの英字**を図形いっぱいに
//
// 色はどちらもタグの色を全面に。**文字の色も書体もタグが決める**
// (画像の組み合わせとの一対一対応・2026-08-16確定)。
//
// ★図形まるごとを1枚のビットマップに焼いてキャッシュする(性能の要)。
// matter.js の物体は画面内の2D回転しかしないので、キャッシュした絵を
// body.angle で回して drawImage するだけで厳密に正しい。

/** 図形に何の文字を載せるか。**形は変わらない**。 */
export type SolidView = "name" | "tag";

export interface SolidPaint {
  spec: SolidSpec;
  view: SolidView;
  tag?: TaskTag;
  /** ネームビューに載せる文字(タスクの題)。タグビューはタグの英字を使う。 */
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
// 判定に使うのは、その形の**代表寸法** s = √(塗られる面積) × unit。
/** これ未満はタイトルを最大1行に切り詰める。 */
const LOD_ONE_LINE = 48;
/** これ未満は文字を描かない。 */
const LOD_NO_TEXT = 30;
/** これ未満はスラブの切れ目も描かない(ベタ塗り1枚)。 */
const LOD_NO_SLIT = 16;

// ── タイトルの大きさ ────────────────────────────────────────
// ★「最低限を決めて、図形が大きいときは比例して大きくなる」(2026-08-16に
// ユーザー確定)。代表寸法 s に比例させるので、**縦横比に左右されない** —
// 高さを基準にすると、同じ重要度でも平たい帯だけ文字が小さくなってしまう。
/** どんなに小さい図形でもこれ以上は小さくしない(px)。 */
const TITLE_MIN = 16;
/** 暴走止めの上限(px)。 */
const TITLE_MAX = 64;
/** 代表寸法に対する比。s=85px(重要度中)で約29px、s=160px(大)で約54px。 */
const TITLE_K = 0.34;

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

/** 図形を、原点(0,0)を中心に ctx へ描く。単位は solid 座標 × unit(px)。
 *  dpr は「この ctx が実際に何倍の解像度を持っているか」。グリフを焼く
 *  大きさをそれに合わせるために要る(ジャギー対策)。 */
export function paintShape(
  ctx: CanvasRenderingContext2D, p: SolidPaint, unit = UNIT_PX, dpr = 1,
) {
  const fill = tagColor(p.tag);
  // ★焼く前に、使う (書体, 文字) の組を取りに行く。まだ届いていなければ
  // fallback で描かれるが、届いた時点で ensureGlyphs が焼き直しを知らせる。
  ensureGlyphs(tagFace(p.tag), p.title + tagLabel(p.tag));

  // ★形はビューによらず1つ。違うのは載せる文字だけ。
  const tagView = p.view === "tag";
  const { w, h } = rectOf(p.spec);
  const n = p.spec.sides.length;
  const outline = sectionOutline(n);
  const wpx = w * unit;
  const hpx = h * unit;
  // LOD の判定はその形の**代表寸法**で行う(平たい帯だけ不利にならないように)。
  const s = Math.sqrt(p.spec.area) * unit;

  ctx.fillStyle = fill;
  const path = () => poly(ctx, outline.map((q) => ({ x: q.x * wpx, y: q.y * hpx })), 1);

  if (tagView || s < LOD_NO_SLIT || p.spec.slabs <= 1) {
    // 切れ目なし。輪郭をそのまま塗る。
    path();
    ctx.fill();
  } else {
    // ★スラブの切れ目。輪郭でクリップしてから、スラブの帯だけを塗る。
    // 縦の切れ目が形を横切り、残っている手順の数がそこで読める。
    ctx.save();
    path();
    ctx.clip();
    for (const r of slabRects(p.spec)) {
      ctx.fillRect(r.x0 * unit, -hpx / 2, (r.x1 - r.x0) * unit, hpx);
    }
    ctx.restore();
  }

  const plan = textPlanOf(p, unit);
  if (!plan) return;

  ctx.save();
  path();
  ctx.clip();
  drawFitted(ctx, plan.fit, plan.face, plan.cx * wpx, plan.cy * hpx, plan.ink, plan.size * dpr);
  ctx.restore();
}

/**
 * その図形に載る文字の割り付け。**描くときと、グリフを先に用意するときで
 * 必ず同じ結果**になるよう、計算をここ1つにまとめてある。
 * (ずれると「用意できている」と判断したのに描画時に焼き直しが走り、
 *  落下が一瞬止まる。)
 */
interface TextPlan {
  text: string; face: number; ink: string;
  fit: NonNullable<ReturnType<typeof fitText>>;
  /** innerBox の中心(正規化座標)。 */
  cx: number; cy: number;
  /** 実際に描かれる文字の高さ(CSS px)。 */
  size: number;
}

// ★割り付けの結果をキャッシュする。draw は1フレームにつき、焼けていない
// 図形ごとに warmShapeGlyphs と shapeGlyphsReady と paintShape から
// 最大3回ここを通る。layoutText は最大6回の折り返し計算をするので、
// 素通しだと落下中のCPUを無駄に食う。
const planCache = new Map<string, TextPlan | null>();
const PLAN_LIMIT = 200;

function textPlanOf(p: SolidPaint, unit: number): TextPlan | null {
  const key = paintKey(p, unit);
  if (planCache.has(key)) return planCache.get(key) ?? null;
  const made = computeTextPlan(p, unit);
  if (planCache.size > PLAN_LIMIT) planCache.clear();
  planCache.set(key, made);
  return made;
}

function computeTextPlan(p: SolidPaint, unit: number): TextPlan | null {
  const n = p.spec.sides.length;
  const s = Math.sqrt(p.spec.area) * unit;
  if (s < LOD_NO_TEXT) return null;
  const tagView = p.view === "tag";
  const { w, h } = rectOf(p.spec);
  const face = tagFace(p.tag);
  const wpx = w * unit;
  const hpx = h * unit;
  // ★★**書体が届くまで文字を描かない**(2026-08-17)。fallback で焼くと、
  // グリフを1フレームに1枚ずつ焼いている途中で本物が届き、1つの図形の中で
  // 書体が混ざる。図形だけ先に出して、届いた瞬間に**全文字まとめて**出す
  // (ensureGlyphs が焼き直しを知らせる)。
  const text = tagView ? tagLabel(p.tag) : p.title;
  if (!fontReady(face, text)) return null;
  if (tagView) {
    // タグの英字は**図形いっぱい**。矩形1つ(innerBox)で十分な短さ。
    const box = innerBox(n);
    const fit = fitText(tagLabel(p.tag), face, box.w * wpx, box.h * hpx, 2);
    if (!fit) return null;
    return {
      text: tagLabel(p.tag), face, ink: tagInk(p.tag), fit,
      cx: box.x + box.w / 2, cy: box.y + box.h / 2, size: fit.size,
    };
  }
  // ★タイトルは「最低 TITLE_MIN、図形が大きければ面積に比例して大きく」。
  // ★**形に合わせて折り返す**(2026-08-16にユーザー指摘)。矩形1つだと
  // 三角だけ極端に小さくなる。
  const fit = layoutInShape(
    p.title, face, n, wpx, hpx,
    Math.min(TITLE_MAX, Math.max(TITLE_MIN, TITLE_K * s)),
    s < LOD_ONE_LINE ? 1 : 3,
  );
  if (!fit) return null;
  return {
    text: p.title, face, ink: tagInk(p.tag), fit,
    cx: 0, cy: fit.cy / hpx, size: fit.size,
  };
}

/**
 * その図形を焼くのに足りないグリフを budget 枚まで用意し、**用意した枚数**を返す。
 * ★グリフ1枚の fillText は和文のWebフォントだと数ms〜10ms かかる。落下中に
 * 7個ぶんをまとめて焼くと数秒止まるので(実測 fillText 合計2.4秒)、
 * 呼び出し側はフレームごとに少しずつ配ること。
 */
export function warmShapeGlyphs(p: SolidPaint, budget: number, unit: number, dpr: number): number {
  const plan = textPlanOf(p, unit);
  if (!plan) return 0;
  return warmGlyphs(plan.text, plan.face, plan.ink, plan.size * dpr, budget);
}

/** その図形を今すぐ焼けるか(グリフが全部そろっているか)。 */
export function shapeGlyphsReady(p: SolidPaint, unit: number, dpr: number): boolean {
  const plan = textPlanOf(p, unit);
  return !plan || missingGlyphs(plan.text, plan.face, plan.ink, plan.size * dpr) === 0;
}

/** その絵が占める範囲(solid 座標)。ビットマップの大きさを決めるのに使う。
 *  ★ビューによらず同じ(形が変わらないので)。 */
export function shapeBounds(p: SolidPaint) {
  const { w, h } = rectOf(p.spec);
  return boundsOf(sectionOutline(p.spec.sides.length).map((q) => ({ x: q.x * w, y: q.y * h })));
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
  planCache.clear();
}

export const paintKey = (p: SolidPaint, unit: number): string =>
  [p.view, p.tag ?? "-", p.spec.sides.length, p.spec.area.toFixed(3),
    p.spec.w.toFixed(3), p.spec.h.toFixed(3),
    p.spec.slabs, unit.toFixed(1), p.title].join("|");

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
    paintShape(ctx, p, unit, dpr);
  }
  const made = { canvas: cv, w, h, dpr };
  bmpCache.set(key, made);
  if (bmpCache.size > BMP_LIMIT) {
    const oldest = bmpCache.keys().next().value;
    if (oldest !== undefined) bmpCache.delete(oldest);
  }
  return made;
}
