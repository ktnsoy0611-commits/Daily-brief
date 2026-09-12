import {
  boundsOf, rectOf, sectionOutline, slabRects,
  type Pt, type SolidSpec,
} from "./solid";
import { BD_GREY, SHAPE_FACE, TASK_FACE } from "./constants";
import { bodyInkOn } from "./palette";
import { canvasFont, drawFitted, ensureGlyphs, fitText, layoutInShape, missingGlyphs, textDrawable, warmGlyphs } from "./textFit";

// ★タスクの図形を canvas に描く。**3D は一切持たない**(2026-08-13にユーザー
// 確定)。真横から見た立面を2枚、ベタ塗りで描くだけ。
//
// ★形はビューによらず**1つ**。切り替えても山は動かず、**載る文字だけ**が変わる。
//
// ★★★**塗り分けは「日付があるか／ないか」の1軸だけ**（2026-09-12・第93巡に
// ユーザー確定でタグを廃止）:
//   **日付あり** … メインカラーの**塗り**。字は面から導いた墨（比 5.64）。
//   **日付なし** … **輪郭線だけ**。中は**地と同じ色**（透けさせない）、
//                  縁と字はメインカラー（比 2.55 ＝ ★目盛りの外。ユーザー確定）。
// ★★**これはホームの帯のピルとまったく同じ見え方**（`components/home/Band.tsx`）。
//   帯から掴んで日付を割り当てた瞬間に塗りへ変わる、を全アプリで同じ言い方にした。
// ★★★**合図はすでに `spec` の中にある** ―― `lib/taskSize.ts` の `sidesOf()` は
//   埋まっている側面だけを返すので、**`sides.includes("due")` がそのまま
//   「日付がある」**。新しいフィールドを足していない。
// ★書体は**1つ**（`SHAPE_FACE`）。タグが選んでいたのをやめた。
//
// ★図形まるごとを1枚のビットマップに焼いてキャッシュする(性能の要)。
// matter.js の物体は画面内の2D回転しかしないので、キャッシュした絵を
// body.angle で回して drawImage するだけで厳密に正しい。

/** 図形に何の文字を載せるか。**形は変わらない**。
 *  ★`"none"` は**文字を載せない**(2026-08-26・第65巡)。ALIGN は右に題を大きく出すので、
 *  図形の中にも同じ題があると**二重**になる(ユーザー指摘)。
 *  ★グリフを焼かなくなるぶん、ALIGN の入りはむしろ軽くなる。 */
export type SolidView = "name" | "none";

export interface SolidPaint {
  spec: SolidSpec;
  view: SolidView;
  /** ネームビューに載せる文字(タスクの題)。 */
  title: string;
  /**
   * ★★**地の色**（輪郭のとき中を塗るのに使う）。省略すると画面の地（クリーム）。
   * ★★★**呼ぶ側が渡すこと** ―― 入力画面だけは地が**墨**（`LIFT`）なので、
   * ここで決め打ちにすると入力画面の下書きの中だけクリームになる。
   * ★`lib/` から `components/AppBackdrop` を import しない（依存の向きが逆になる）。
   */
  ground?: string;
}

/**
 * ★★★**日付があるか** ―― 塗りと輪郭を決める唯一の合図。
 * `lib/taskSize.ts` の `sidesOf()` が `"due"` を側面に入れるのは
 * `dueDate` が埋まっているときだけなので、これで足りる。
 */
export const isDated = (spec: SolidSpec): boolean => spec.sides.includes("due");

/** 輪郭線の太さ（CSS px）。★帯のピルの `1px solid` と同じ。★目盛りの外（絵の寸法）。 */
const EDGE = 1;

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
  // ★焼く前に、使う (書体, 文字) の組を取りに行く。まだ届いていなければ
  // fallback で描かれるが、届いた時点で ensureGlyphs が焼き直しを知らせる。
  ensureGlyphs(SHAPE_FACE, p.title);

  const dated = isDated(p.spec);
  const ground = p.ground ?? BD_GREY;
  const { w, h } = rectOf(p.spec);
  const n = p.spec.sides.length;
  const outline = sectionOutline(n);
  const wpx = w * unit;
  const hpx = h * unit;
  // LOD の判定はその形の**代表寸法**で行う(平たい帯だけ不利にならないように)。
  const s = Math.sqrt(p.spec.area) * unit;

  const path = () => poly(ctx, outline.map((q) => ({ x: q.x * wpx, y: q.y * hpx })), 1);
  const slit = s >= LOD_NO_SLIT && p.spec.slabs > 1;

  if (dated) {
    // ── 日付あり … メインカラーで塗る ──
    ctx.fillStyle = TASK_FACE;
    if (!slit) {
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
  } else {
    // ── 日付なし … 輪郭線だけ ──
    // ★中は**地と同じ色で不透明に**塗る（帯のピルと同じ理由 ―― 透けると
    //   後ろの図形がピルや図形の中を通って見える）。
    ctx.fillStyle = ground;
    path();
    ctx.fill();
    // ★★★**線は「内側に」引く**（CSS の `border` が内側に引かれるのと同じ）。
    //   輪郭の**真上**に `EDGE` の線を引くと外へ 0.5px はみ出し、焼き箱の縁
    //   （`solidBitmap` の `+1`）とぶつかる。**道を `EDGE/2` だけ内側へ寄せて
    //   `EDGE` の線を引けば**、はみ出さずに済む。
    //   ★クリップして2倍の太さで引く手も同じ太さになるが、層が1つ増えるだけ
    //   （実測 … どちらも実効 2.15 デバイス画素／倍率2 ＝ **1.08 CSS 画素**）。
    ctx.strokeStyle = TASK_FACE;
    ctx.lineWidth = EDGE;
    poly(ctx, outline.map((q) => ({ x: q.x * (wpx - EDGE), y: q.y * (hpx - EDGE) })), 1);
    ctx.stroke();
    if (slit) {
      ctx.save();
      path();
      ctx.clip();
      // ★切れ目は「塗らない帯」では出せない（中が地の色なので隙間が見えない）。
      //   **隙間の真ん中に縦の線**を引いて、残っている手順の数を同じように見せる。
      //   ★こちらは内側の線なので、クリップで押さえても痩せない。
      const rs = slabRects(p.spec);
      for (let i = 0; i < rs.length - 1; i++) {
        const x = ((rs[i].x1 + rs[i + 1].x0) / 2) * unit;
        ctx.beginPath();
        ctx.moveTo(x, -hpx / 2);
        ctx.lineTo(x, hpx / 2);
        ctx.stroke();
      }
      ctx.restore();
    }
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
  if (p.view === "none") return null;          // ★文字なし(ALIGN)
  const n = p.spec.sides.length;
  const s = Math.sqrt(p.spec.area) * unit;
  if (s < LOD_NO_TEXT) return null;
  const { w, h } = rectOf(p.spec);
  const face = SHAPE_FACE;
  // ★★**字の色は塗り方から決まる** … 塗りなら面から導いた墨、輪郭なら縁と同じ色
  //   （帯のピルの `ink = outline ? face : bodyInkOn(face)` と同じ）。
  const ink = isDated(p.spec) ? bodyInkOn(TASK_FACE) : TASK_FACE;
  const wpx = w * unit;
  const hpx = h * unit;
  // ★書体が届くまでは文字を描かない(fallback で焼くと、焼いている途中で
  // 本物が届いて1つの図形の中で書体が混ざる)。★ただし**待ちすぎたら描く** —
  // 待つだけにしていたら、届かない・判定が通らない・通知が飛ばないの
  // どれか1つで**文字が永久に出なかった**(2026-08-17に実機で報告)。
  // textDrawable が時間で門を開ける。
  if (!textDrawable(face, p.title)) return null;
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
    text: p.title, face, ink, fit,
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

/** 焼いた絵を全部捨てる(書体が揃ったとき・**紙のシートを読み終えたとき**に呼ぶ。
 *  次に描くとき作り直される)。 */
export function clearSolidBitmaps() {
  bmpCache.clear();
  planCache.clear();
}

// ★★★**紙の目は図形から外した**（2026-09-11・ユーザー指定「図形の紙の
//   テクスチャはなくしてください」）。`paperize` は**誰からも呼ばれない**
//   ―― `lib/paperTexture.ts` は消していないが、残っている使い道は
//   `lib/printGrain.ts`（券の面。CSS の `mix-blend-mode`）だけで、これは別物。
//   ★★**`PAPER_ALPHA` を 0 にして誤魔化さないこと。呼ばないのが正。**

// ★★★**鍵に「日付の有無」と「地の色」を入れること。** `sides` は**数**しか
//   見ていないので、`["title","due"]` と `["title","context"]` はどちらも 2 ――
//   **形は同じでも塗りが逆**になるので、入れないと焼いた絵が入れ替わる。
export const paintKey = (p: SolidPaint, unit: number): string =>
  [p.view, isDated(p.spec) ? "d" : "-", p.ground ?? "-",
    p.spec.sides.length, p.spec.area.toFixed(3),
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

/**
 * ★★**文字だけのブロック**(GRAVITY の日付・曜日、TIMELINE の「自由」)を焼く。
 * 2026-08-26・第63巡に `fillText` の直描きから移した。狙いは2つ:
 *   1. **紙の目を焼き込める**(図形と同じ扱い。回れば紙も一緒に回る)。
 *   2. 毎フレームの `fillText` が消えて、**文字が一段くっきりする**。
 * 箱は**塗りぴったり**(呼ぶ側が `inkBoxOf` で測った `bw`/`bh` と、原点からの
 * ずれ `dx`/`dy` を渡す)。絵の中心＝物体の中心になる。
 */
export function wordBitmap(
  word: string, fs: number, sx: number, ink: string, fam: string,
  bw: number, bh: number, dx: number, dy: number, dpr = 1, track = 0,
): SolidBitmap {
  const key = ["W", word, fs.toFixed(1), sx.toFixed(3), ink, fam, bw.toFixed(1), bh.toFixed(1), dpr.toFixed(2), track.toFixed(3)].join("|");
  const hit = bmpCache.get(key);
  if (hit) { bmpCache.delete(key); bmpCache.set(key, hit); return hit; }
  // ★はみ出し(斜体のハネ・丸め誤差)のぶんだけ箱を広げて焼く。描く側は中心を合わせる。
  const w = Math.ceil(bw + 4);
  const h = Math.ceil(bh + 4);
  const cv = document.createElement("canvas");
  cv.width = Math.max(2, Math.round(w * dpr));
  cv.height = Math.max(2, Math.round(h * dpr));
  const ctx = cv.getContext("2d");
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(w / 2, h / 2);
    ctx.font = canvasFont(WORD_WEIGHT, fs, fam);
    ctx.fillStyle = ink;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.translate(-dx, -dy);
    ctx.scale(sx, 1);
    // ★★★**字間を詰める**（2026-09-11 ユーザー指定「隙間を少なくしてブロックっぽく」）。
    //   ★`ctx.letterSpacing` は Safari の対応が新しいので**使わない** ―― 1文字ずつ
    //   送りを足しながら置く。測る側（`inkBoxOf`）も**同じ送り**で測るので、
    //   当たり判定は塗りのまま。★`track === 0` なら今までどおり1回で描く。
    if (!track) ctx.fillText(word, 0, 0);
    else drawTracked(ctx, word, track * fs);
  }
  const made = { canvas: cv, w, h, dpr };
  bmpCache.set(key, made);
  if (bmpCache.size > BMP_LIMIT) {
    const oldest = bmpCache.keys().next().value;
    if (oldest !== undefined) bmpCache.delete(oldest);
  }
  return made;
}

/** 文字ブロックの太さ。★可変フォントなのでこの重みがそのまま効く。 */
export const WORD_WEIGHT = 900;

/**
 * ★★**字間を詰めて組んだときの幅**（`ctx.font` は呼ぶ側が立ててあること）。
 * 送りの合計 ＋ `gap × (字数 − 1)`。`gap` は負なら詰まる。
 */
export function trackedWidth(ctx: CanvasRenderingContext2D, word: string, gap: number): number {
  const cs = [...word];
  if (!cs.length) return 0;
  let w = 0;
  for (const c of cs) w += ctx.measureText(c).width;
  return w + gap * (cs.length - 1);
}

/**
 * ★★**1文字ずつ置く**（`textAlign:"center"` / `textBaseline:"middle"` の原点から）。
 * 詰めた全体の幅の**中心**が原点に来るように、左端から順に送る。
 */
export function drawTracked(ctx: CanvasRenderingContext2D, word: string, gap: number): void {
  const cs = [...word];
  const total = trackedWidth(ctx, word, gap);
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  let x = -total / 2;
  for (const c of cs) {
    ctx.fillText(c, x, 0);
    x += ctx.measureText(c).width + gap;
  }
  ctx.textAlign = prev;
}
