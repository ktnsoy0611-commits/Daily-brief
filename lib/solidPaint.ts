import {
  boundsOf, clampRows, halfWidthAtStack, rectOf, slabRects, stackOutline,
  type Pt, type SolidSpec,
} from "./solid";
import { rowsOf } from "./taskSize";
import { BD_GREY, SHAPE_FACE, TASK_FACE } from "./constants";
import { bodyInkOn } from "./palette";
import { canvasFont, drawFitted, ensureGlyphs, layoutInRows, missingGlyphs, textDrawable, warmGlyphs, type FitResult } from "./textFit";

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
// ★★★**`LOD_ONE_LINE`（48px 未満は1行に切り詰める）は第100巡に削除した。**
//   **復活させない** ―― 段が3つあるピルに1行だけ置くと、行が**段ではなく箱の
//   中心**に来る（2段なら**くびれの上**）。「段に1行」という決まりが小さい図形
//   だけで破れるのは、ユーザーが第100巡に直させたのと同じ壊れ方。
//   ★小さい図形で字が消える心配は要らない ―― `layoutInRows` は段の刻みに対して
//   `ROW_FILL` で字を取るので、小さければ自動的に小さくなり、`minPx`(7) を
//   割れば `null`（＝文字なし）になる。下の `LOD_NO_TEXT` と地続き。
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
  const wpx = w * unit;
  const hpx = h * unit;
  // ★★★**段の数は題の文字数から**（第99巡。`shapeRows`）。ビューにも書体にもよらない。
  const outline = stackOutline(shapeRowsOf(p), wpx / hpx);
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
    // ★中は**地と同じ色で不透明に**塗る（透けると後ろの図形が図形の中を通って
    //   見える）。★第127巡の半透明は第128巡に撤回した。
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
  fit: FitResult;
  /** 文字の塊の中心(正規化座標)。 */
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
  const s = Math.sqrt(p.spec.area) * unit;
  if (s < LOD_NO_TEXT) return null;
  const { w, h } = rectOf(p.spec);
  const face = SHAPE_FACE;
  // ★★★**字は塗りでも輪郭でも黒**（2026-09-17・第117巡にユーザー指定
  //   「タスクに関する図形はグレーを主に使って文字は黒」）。無彩色になったので
  //   縁と同じ色の字は地の上で **3.2** しか出ない。**帯のピルと同じ規則。**
  const ink = bodyInkOn(TASK_FACE);
  const wpx = w * unit;
  const hpx = h * unit;
  // ★書体が届くまでは文字を描かない(fallback で焼くと、焼いている途中で
  // 本物が届いて1つの図形の中で書体が混ざる)。★ただし**待ちすぎたら描く** —
  // 待つだけにしていたら、届かない・判定が通らない・通知が飛ばないの
  // どれか1つで**文字が永久に出なかった**(2026-08-17に実機で報告)。
  // textDrawable が時間で門を開ける。
  if (!textDrawable(face, p.title)) return null;
  // ★タイトルは「最低 TITLE_MIN、図形が大きければ面積に比例して大きく」。
  const base = Math.min(TITLE_MAX, Math.max(TITLE_MIN, TITLE_K * s));
  // ★★★**段の数は `rowsOf(title)`（純粋な関数）から引く**（2026-09-13・第99巡）。
  //   ★★★**書体の到着やビューや `unit` に依存させないこと** ―― 依存させると
  //   ① ALIGN（`view: "none"`）と山で**同じタスクの形が変わる**
  //   ② 書体が遅れて届いた瞬間に**絵だけ段数が変わり、物理の当たり判定とずれる**
  //     （物体は1度しか作らない）。
  //   `rowsOf` は文字数のはしごで、**箱の比（`ratioOf` ＝ 1段の比 ÷ 段の数）も
  //   同じ関数から出ている**ので、行数と段数は必ず噛み合う。
  //   ★★★**段の中に1行ずつ**（第100巡。`layoutInRows`）―― 行の高さ `size × LINE_H` で
  //     塊を作って中心に置く `layoutInShape` では、段の刻み `hpx / rows` と噛み合わない。
  const rows = shapeRowsOf(p);
  const ar = wpx / hpx;
  const fit = layoutInRows(
    p.title, face, rows, wpx, hpx, (t) => halfWidthAtStack(rows, ar, t), base,
  );
  if (!fit) return null;
  // ★★**段の位置は `fit.ys` が持つ**ので、塊の中心はいつも図形の中心（0）。
  return {
    text: p.title, face, ink, fit,
    cx: 0, cy: 0, size: fit.size,
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
 *  ★ビューによらず同じ(形が変わらないので)。
 *  ★★**段の数によらない** ―― `stackOutline` は常に ±0.5 に正規化されている。 */
export function shapeBounds(p: SolidPaint) {
  const { w, h } = rectOf(p.spec);
  return boundsOf(stackOutline(1, w / h).map((q) => ({ x: q.x * w, y: q.y * h })));
}

/**
 * ★★★**その図形が何段になるか**（1..3）。**題の文字数が決める**（`rowsOf`）。
 * 物理の頂点を作る側（GRAVITY / DRIFT）も**ここから引く** ―― 絵と当たり判定で
 * 形を2度決めない。
 * ★★**ビュー・書体・`unit` によらない**（理由は `computeTextPlan` のコメント）。
 */
export function shapeRowsOf(p: SolidPaint): number {
  return clampRows(rowsOf(p.title));
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

/** ★板を焼く箱の余り（字の大きさに対する割合。上下左右それぞれ半分ずつ）。
 *  ★目盛りの外（画素の刻み）。★**生の px で持たないこと** ―― 大きい字ほど
 *  効かなくなり、書体を替えた巡に必ず切れる。 */
export const PLATE_BLEED = 0.16;

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
  // ★★**鍵に `dx`/`dy` も入れる**（2026-09-13・第101巡）―― 入れないと、寸法が
  //   同じで中心のずれだけ違う板が**ずれた絵を使い回す**。
  const key = ["W", word, fs.toFixed(1), sx.toFixed(3), ink, fam, bw.toFixed(1), bh.toFixed(1),
    dx.toFixed(2), dy.toFixed(2), dpr.toFixed(2), track.toFixed(3)].join("|");
  const hit = bmpCache.get(key);
  if (hit) { bmpCache.delete(key); bmpCache.set(key, hit); return hit; }
  // ★★★**はみ出しの余りは「字の大きさに比例」させる**（2026-09-13・第101巡）。
  //   第100巡までは**生の +4**（上下左右に 2px ずつ）だった。これは
  //   **大きいほど効かなくなる** ―― fs 20 なら 10% だが fs 49 では 4% しかない。
  //   ★★★**そこへ Anton が来て上下が切れた**（ユーザー報告「日付と曜日の文字の
  //   上下が見切れてしまっています」）。呼ぶ側が渡す `bh` は**測ったときの書体**の
  //   塗りの箱なので、**焼くときの書体のほうが背が高いと、その差ぶん溢れる**
  //   （代替の書体 → Anton で em に対し最大 +27%）。
  //   → `PLATE_BLEED`(0.16) ＝ 上下左右それぞれ `fs × 0.08`。
  //   ★余りは透明なので、**貼る位置（中心）も見た目も変わらない**。
  const bleed = Math.ceil(fs * PLATE_BLEED);
  const w = Math.ceil(bw + bleed * 2);
  const h = Math.ceil(bh + bleed * 2);
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

/**
 * 文字ブロックの太さ。
 * ★★★**第100巡に 900 → 400**。大きな欧文が `DISPLAY`（Anton）になり、Anton は
 *   **単一ウェイト（400）しか持たない** ―― 900 を頼むとブラウザが**合成ボールド**
 *   （輪郭を太らせるだけの偽の太字）を掛け、また「変」な字になる。
 * ★読み手は `lib/wordPlate.ts`（測る・詰める）とすぐ上の `wordBitmap`（焼く）の
 *   **板だけ**。図形の題（`FONT_FACES` / `SHAPE_FACE`）には効かない。
 */
export const WORD_WEIGHT = 400;

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
