import { INK, PAPER, SANS } from "./constants";
import { shade } from "./helpers";
import {
  areaCentroid, boundsOf, capOutline, facetsOf, silhouette,
  type Facet, type Pt, type SolidSpec,
} from "./solid";
import { tagColor, tagLabel } from "./taskTags";
import { SIDE_LABEL } from "./types";
import type { SideKey, TaskTag } from "./types";

// ★立体を canvas に描く。**平行投影**なので、面の (u,v) の矩形 → 画面の
// 四辺形は常にアフィン変換であり、文字を短冊で貼れる(CSS の 3D 変形は
// 一切使わない。§5・§7.9・§7.14・§7.32・§7.35 で Safari の描画崩れを5回踏んでいる)。
//
// 文字は**軸(横)方向に流れる**。だからタイトルが長いほど立体が横に伸びる、
// という寸法の対応(lib/taskSize.ts の lenOf)がそのまま「文字が収まる長さ」に
// なる。曲面(円柱の胴・半円柱の弧)では同じ文字列を周方向に何度か繰り返して
// 貼るので、どちらへ転がっていても読める(=曲面に沿ってループする)。
//
// ★立体まるごとを1枚のビットマップにキャッシュする(性能の要)。matter.js の
// 物体は画面内の2D回転しかしないので、キャッシュした絵を body.angle で回して
// drawImage するだけで厳密に正しい。毎フレームのコストは物体ごとに drawImage 1回。

export type SolidView = "front" | "bottom";

export interface SolidPaint {
  spec: SolidSpec;
  view: SolidView;
  tag?: TaskTag;
  /** 面ごとの中身。title は本文(タスクの題)。 */
  texts: Partial<Record<SideKey, string>>;
}

/** 面の明るさ(0〜1)→ 塗りの色。いちばん明るい面がちょうど base になる。 */
export const faceFill = (light: number, base = PAPER) => shade(base, (light - 0.9) * 62);

/** 1単位を何pxで描くか。 */
export const UNIT_PX = 46;

// ── 面のテクスチャ ──────────────────────────────────────────

type Canvas2D = HTMLCanvasElement;

const texCache = new Map<string, Canvas2D>();
const TEX_LIMIT = 120;

function remember<T>(cache: Map<string, T>, limit: number, key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) {
    // 使ったものを末尾へ回す(古いものから捨てるため)。
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const made = make();
  cache.set(key, made);
  if (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return made;
}

/** 面1枚ぶんの絵(透明な下地に文字だけ)。下地の色は塗る側が持つ。
 *  `wrap` は「その面が断面を一周している」ことを表す(円柱の胴)。 */
function faceTexture(key: SideKey, text: string, wPx: number, hPx: number, repeats: number, wrap: boolean): Canvas2D {
  const cv = document.createElement("canvas");
  cv.width = Math.max(8, Math.round(wPx));
  cv.height = Math.max(8, Math.round(hPx));
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;

  const band = cv.height / repeats;
  const pad = Math.max(4, cv.width * 0.035);
  const avail = cv.width - pad * 2;
  const label = SIDE_LABEL[key];
  let value = (text ?? "").trim();

  // 太字のタイポグラフィだけ。枠も下線も影も使わない(§38 のデザイン言語)。
  // ★ラベルは値の**上の段**に置く(横に並べない)。面は「軸の長さ × 周の長さ」で、
  // 制約になるのは軸の長さの方だから、縦は余っている。横に並べるとラベルのぶん
  // 値が縮んで読めなくなる(実際にそうなった)。
  const labelSize = Math.max(5, band * 0.15);
  // 幅にちょうど収まる大きさを1回の実測から求める(何度も縮めて当てない)。
  const MAX_SIZE = band * 0.34;
  const MIN_SIZE = band * 0.16;
  let valueSize = MAX_SIZE;
  if (value) {
    const w100 = measure(ctx, `700 100px ${SANS}`, value);
    valueSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, (avail * 100) / Math.max(w100, 1)));
    // それでも入り切らないものは、縮め続けて潰すより末尾を落とす。
    if (measure(ctx, `700 ${valueSize}px ${SANS}`, value) > avail) {
      while (value.length > 1 && measure(ctx, `700 ${valueSize}px ${SANS}`, `${value}…`) > avail) {
        value = value.slice(0, -1);
      }
      value += "…";
    }
  }

  // ★巻きついている面(円柱の胴)は、帯の中心を継ぎ目(y=0 と y=H)にも置く。
  // affineOf の w = 1 − u により、この継ぎ目はちょうど**正面**に来る。
  // 上端と下端で半分ずつ切れるが、3Dでは同じ1本の線なので、実際の立体の上では
  // 正面に**まるごと1つ**のコピーが復元される(いちばん歪みの少ない位置)。
  // 平らな面は従来どおり帯の真ん中へ。
  const centres = wrap
    ? Array.from({ length: repeats + 1 }, (_, r) => band * r)
    : Array.from({ length: repeats }, (_, r) => band * (r + 0.5));

  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  for (const cy of centres) {
    if (value) {
      ctx.globalAlpha = 0.4;
      ctx.font = `700 ${labelSize}px ${SANS}`;
      ctx.fillText(label, pad, cy - valueSize * 0.62);
      ctx.globalAlpha = 1;
      ctx.font = `700 ${valueSize}px ${SANS}`;
      ctx.fillText(value, pad, cy + valueSize * 0.34);
    } else {
      // 未入力の面はラベルだけを薄く置く(そこに何が入るかは読める)。
      ctx.globalAlpha = 0.28;
      ctx.font = `700 ${labelSize}px ${SANS}`;
      ctx.fillText(label, pad, cy);
      ctx.globalAlpha = 1;
    }
  }
  return cv;
}

function measure(ctx: CanvasRenderingContext2D, font: string, s: string): number {
  const prev = ctx.font;
  ctx.font = font;
  const w = ctx.measureText(s).width;
  ctx.font = prev;
  return w;
}

// ── 立体を描く ──────────────────────────────────────────────

const poly = (ctx: CanvasRenderingContext2D, pts: Pt[], unit: number) => {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * unit, p.y * unit) : ctx.lineTo(p.x * unit, p.y * unit)));
  ctx.closePath();
};

/**
 * 小片の (v, w) 矩形 → 画面のアフィン変換。平行投影なので厳密に平行四辺形。
 *
 * ★テクスチャの y は下向きに増えるが、面の周方向 `u` は画面では**上向き**に
 * 増える(断面を反時計回りに取っているため)。そのまま貼ると文字が上下反転する
 * (実際に反転した)。**w = 1 − u** を縦軸に取ることで向きを揃える。
 */
function affineOf(f: Facet, texW: number, texH: number, unit: number) {
  const w0 = 1 - f.u1;
  const w1 = 1 - f.u0;
  const P0 = f.points[3]; // (v0, w0)  = (v0, u1)
  const Pv = f.points[2]; // (v1, w0)  = (v1, u1)
  const Pw = f.points[0]; // (v0, w1)  = (v0, u0)
  const dv = (f.v1 - f.v0) * texW;
  const dw = (w1 - w0) * texH;
  const a = ((Pv.x - P0.x) * unit) / dv;
  const b = ((Pv.y - P0.y) * unit) / dv;
  const c = ((Pw.x - P0.x) * unit) / dw;
  const d = ((Pw.y - P0.y) * unit) / dw;
  return [a, b, c, d,
    P0.x * unit - a * f.v0 * texW - c * w0 * texH,
    P0.y * unit - b * f.v0 * texW - d * w0 * texH] as const;
}

/** 断面の周のうち、その面が占める長さ(テクスチャの高さを決める)。 */
function faceSpans(spec: SolidSpec): Map<SideKey, number> {
  const out = new Map<SideKey, number>();
  const facets = facetsOf({ ...spec, slabs: 1 }).filter((f) => f.kind === "side");
  for (const f of facets) {
    if (!f.key) continue;
    const p0 = f.points[0], p3 = f.points[3];
    const len = Math.hypot(p3.x - p0.x, p3.y - p0.y) / Math.max(f.u1 - f.u0, 1e-6);
    if (!out.has(f.key)) out.set(f.key, len);
  }
  return out;
}

/** 曲面に文字を何回繰り返して貼るか(周方向)。転がっても読めるようにする。 */
const repeatsFor = (span: number, radius: number) =>
  Math.max(1, Math.min(4, Math.round(span / (2.2 * radius))));

/** 立体を、原点(0,0)を中心に ctx へ描く。単位は solid 座標 × unit(px)。 */
export function paintSolid(ctx: CanvasRenderingContext2D, p: SolidPaint, unit = UNIT_PX) {
  if (p.view === "bottom") { paintBottom(ctx, p, unit); return; }

  const spans = faceSpans(p.spec);
  const cap = tagColor(p.tag);
  const facets = facetsOf(p.spec);

  // 断面を一周している面(円柱の胴)は、文字の継ぎ目が正面に来るよう別扱いにする。
  const wrapKey = p.spec.sides.length === 1 ? p.spec.sides[0] : null;

  for (const f of facets) {
    ctx.save();
    poly(ctx, f.points, unit);
    // ★上下の面はタグの色そのものに近く保つ。BOTTOM VIEW では素のタグ色で
    // 塗るので、陰影を強く付けると同じタグが別の色に見えてしまう。
    const fill = f.kind === "cap" ? shade(cap, (f.light - 0.82) * 24) : faceFill(f.light);
    // ★塗りと同じ色で縁取りもする。曲面は小片に割って描くので、隣り合う小片の
    // 継ぎ目にアンチエイリアスの隙間(細い筋)が出る。同色の細い線で縁を太らせると、
    // 形を変えずにその筋だけが消える(§52 で SVG 版に入れていたのと同じ手)。
    ctx.fillStyle = fill;
    ctx.strokeStyle = fill;
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.fill();
    ctx.stroke();
    ctx.clip();

    if (f.kind === "side" && f.key) {
      const span = spans.get(f.key) ?? 2 * p.spec.radius;
      const repeats = repeatsFor(span, p.spec.radius);
      const wrap = f.key === wrapKey;
      const texW = Math.round(p.spec.len * unit);
      const texH = Math.round(span * unit);
      const tex = remember(texCache, TEX_LIMIT,
        `${f.key}|${p.texts[f.key] ?? ""}|${texW}x${texH}|${repeats}|${wrap ? "w" : "f"}`,
        () => faceTexture(f.key as SideKey, p.texts[f.key as SideKey] ?? "", texW, texH, repeats, wrap));
      const [a, b, c, d, e, g] = affineOf(f, tex.width, tex.height, unit);
      // 暗い面の文字は一緒に沈める(面だけ暗くて文字が浮くのを避ける)。
      ctx.globalAlpha = 0.32 + 0.68 * f.light;
      ctx.transform(a, b, c, d, e, g);
      ctx.drawImage(tex, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

/** BOTTOM VIEW。真下から見た平らな色面。断面の形を足あと(シルエット)いっぱいに
 *  引き伸ばして塗り、タグの英字だけを置く。側面の情報は見えない。 */
function paintBottom(ctx: CanvasRenderingContext2D, p: SolidPaint, unit: number) {
  const box = boundsOf(silhouette(p.spec));
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const outline = capOutline(p.spec.sides.length).map((q) => ({
    x: box.minX + (q.x + 0.5) * w,
    y: box.minY + (q.y + 0.5) * h,
  }));
  const fill = tagColor(p.tag);
  ctx.save();
  poly(ctx, outline, unit);
  ctx.clip();
  ctx.fillStyle = fill;
  ctx.fill();
  // タグの英字。色面の上で読める側(明るい色なら INK、濃い色なら PAPER)。
  const size = Math.min(h * unit * 0.3, (w * unit) / Math.max(4, tagLabel(p.tag).length) * 1.5);
  if (size >= 5) {
    ctx.fillStyle = luminance(fill) > 0.62 ? INK : PAPER;
    ctx.font = `700 ${size}px ${SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.86;
    ctx.fillText(tagLabel(p.tag), (box.minX + w / 2) * unit, (box.minY + h / 2) * unit);
    ctx.globalAlpha = 1;
    ctx.textAlign = "start";
  }
  ctx.restore();
}

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const v = parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
  return (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
}

// ── 立体まるごとのビットマップ ──────────────────────────────

export interface SolidBitmap {
  canvas: Canvas2D;
  /** CSSピクセルでの大きさ。 */
  w: number;
  h: number;
  /** 物理の中心(シルエットの面積の重心)が、ビットマップの中央にある。 */
  dpr: number;
}

const bmpCache = new Map<string, SolidBitmap>();
const BMP_LIMIT = 60;

export const paintKey = (p: SolidPaint, unit: number): string =>
  [p.view, p.tag ?? "-", p.spec.sides.join("+"), p.spec.len.toFixed(3), p.spec.radius.toFixed(3),
    p.spec.slabs, unit.toFixed(1),
    ...p.spec.sides.map((k) => `${k}=${p.texts[k] ?? ""}`)].join("|");

/**
 * 立体を1枚のビットマップに焼く。**シルエットの面積の重心がビットマップの
 * 中央**に来るようにしてあるので、matter.js の body.position へそのまま
 * 中央合わせで描けば、絵と当たり判定がぴったり重なる。
 */
/** 焼いてあるものだけ返す(まだなら undefined)。
 *  ★山に7個いっぺんに落とすと、1フレームで7枚を焼くことになって数百ms止まる。
 *  呼び出し側はこれで「焼けているものだけ描き、焼けていないものは今フレームの
 *  予算の範囲でだけ焼く」という配り方ができる。 */
export const peekSolidBitmap = (p: SolidPaint, unit = UNIT_PX, dpr = 1): SolidBitmap | undefined =>
  bmpCache.get(`${paintKey(p, unit)}|${dpr.toFixed(2)}`);

export function solidBitmap(p: SolidPaint, unit = UNIT_PX, dpr = 1): SolidBitmap {
  return remember(bmpCache, BMP_LIMIT, `${paintKey(p, unit)}|${dpr.toFixed(2)}`, () => {
    const hull = silhouette(p.spec);
    const c = areaCentroid(hull);
    const box = boundsOf(hull);
    // 重心を中央に置ける最小の箱。
    const halfW = Math.max(box.maxX - c.x, c.x - box.minX) * unit + 2;
    const halfH = Math.max(box.maxY - c.y, c.y - box.minY) * unit + 2;
    const w = Math.ceil(halfW * 2);
    const h = Math.ceil(halfH * 2);
    const cv = document.createElement("canvas");
    cv.width = Math.max(2, Math.round(w * dpr));
    cv.height = Math.max(2, Math.round(h * dpr));
    const ctx = cv.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(halfW - c.x * unit, halfH - c.y * unit);
      paintSolid(ctx, p, unit);
    }
    return { canvas: cv, w, h, dpr };
  });
}

/** 中身が変わった立体の絵を捨てる(次に描くとき作り直す)。 */
export function forgetSolid(p: SolidPaint, unit = UNIT_PX) {
  const head = paintKey(p, unit);
  for (const k of [...bmpCache.keys()]) if (k.startsWith(head)) bmpCache.delete(k);
}
