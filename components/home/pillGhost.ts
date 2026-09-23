import { SANS, mixHex } from "@/lib/constants";
import { canvasFont } from "@/lib/textFit";
import { LEAD, TRACK, WEIGHT } from "@/lib/tokens";
import { BEND_TOP, PILL_EDGE, bendAt, type Ghost, type PillLook } from "@/lib/pullDrag";

// ★★★**帯のピルを canvas へ写し取って、掴んだ一点だけを垂らす**
// （2026-09-14・第105巡にユーザー確定「**触った瞬間に canvas へ写し取る**」
// 「**両端は帯に残る**」＝**輪ゴムを引っ張る**）。
//
// ★★★**なぜ写し取るのか** … `.band-row` は `overflow: hidden` なので、DOM のままでは
//   **帯の外へ垂れられない**。1px でも下へ引いた瞬間に DOM のピルを消し、
//   **まったく同じ見た目**を山の canvas に描き替える。以後その絵が
//   **曲がり → 弾け → 図形になり → 山へ落ちる**まで、**一本の続き**になる。
//
// ★★**寸法は `Band` が実測した矩形（`PillLook`）。書体・余白・色は DOM と同じ
//   トークンを読む** ―― 数を二重に持たないので、片方だけ動くことがない。
//
// ★★★**曲げ方は `bendAt` の1本だけ**（`lib/pullDrag.ts`）。輪郭も題も写真の丸も
//   **同じ式**で沈むので、**中身が形の外へはみ出すことが原理的に起こらない**。

/** 字間（`TRACK` は em の文字列）。★対応していない環境では素の字間で描く。 */
const track = (ctx: CanvasRenderingContext2D, v: string) => {
  if ("letterSpacing" in ctx) (ctx as { letterSpacing: string }).letterSpacing = v;
};

/** 端の丸を何本の線分で描くか。★目盛りの外（絵の刻み）。 */
const CAP_STEPS = 16;
/** 上下の直線を何本の線分で割るか。★曲げるので直線のままでは折れない。 */
const EDGE_STEPS = 24;

/**
 * ★★**上下の重み**（下の縁 1 ／上の縁 `BEND_TOP`）を、y から連続で出す。
 * ★端の丸まで滑らかに繋がるので、**上下で別々に描いて継ぎ目を作らない**。
 */
const weightAt = (y: number, h: number): number =>
  BEND_TOP + (1 - BEND_TOP) * (y / h + 0.5);

/**
 * ★★★**帯に無いピルの幅を出す**（2026-09-15・第106巡）。
 * 山の図形を**帯へ戻す**ときは、写し取る元の DOM がまだ無いので**組み立てる**。
 * ★★**内訳は `drawPillGhost` が描くのとまったく同じ順**（余白・丸・隙間・題）
 *   ―― ここを別に書くと、戻ったピルだけ幅が合わない。
 * ★上限は帯のピルと同じ `84vw`（`components/home/Band.tsx` の `maxWidth`）。
 */
export function pillWidth(L: Omit<PillLook, "w">, screenW: number): number {
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d");
  let text = 0;
  if (ctx) {
    ctx.font = canvasFont(WEIGHT.heavy, L.textSize, SANS);
    track(ctx, TRACK.normal);
    // ★★行は `bandLines()` が切った列（第128巡）。いちばん長い行が幅を決める。
    for (const ln of L.lines) text = Math.max(text, ctx.measureText(ln).width);
  }
  // ★★**第127巡に `PILL_KNOCK`（字の後ろの抜き）が消えたので、幅からも外した**
  //   ―― DOM 側も同じ抜きを外している。**片方だけ直すとピルの幅が食い違う。**
  const w = L.padL + (L.photo ? L.dia + L.gap : 0) + Math.ceil(text) + L.padR;
  return Math.min(w, screenW * PILL_MAX_VW);
}

/** ★帯のピルの幅の上限（`Band` の `maxWidth: "84vw"` と同じ数）。★目盛りの外（絵の寸法）。 */
const PILL_MAX_VW = 0.84;

/** ピルの輪郭を、垂れたぶんだけ下げながらなぞる（原点＝ピルの中心）。 */
function tracePill(
  ctx: CanvasRenderingContext2D, w: number, h: number, gx: number, give: number,
): void {
  // ★角丸は `RADIUS.pill`(999) ＝ 実際には**高さの半分**（CSS が頭打ちにする）。
  const r = Math.min(h, w) / 2;
  const reach = w / 2;
  const sx = w / 2 - r;                 // 直線部分の端
  const pts: { x: number; y: number }[] = [];
  const put = (x: number, y: number) => {
    pts.push({ x, y: y + bendAt(x, gx, reach, give, weightAt(y, h)) });
  };
  // 上の直線（左 → 右）
  for (let i = 0; i <= EDGE_STEPS; i++) put(-sx + (sx * 2 * i) / EDGE_STEPS, -h / 2);
  // 右の丸（上 → 下）
  for (let i = 1; i < CAP_STEPS; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / CAP_STEPS;
    put(sx + Math.cos(a) * r, Math.sin(a) * r);
  }
  // 下の直線（右 → 左）
  for (let i = 0; i <= EDGE_STEPS; i++) put(sx - (sx * 2 * i) / EDGE_STEPS, h / 2);
  // 左の丸（下 → 上）
  for (let i = 1; i < CAP_STEPS; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / CAP_STEPS;
    put(-sx + Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.beginPath();
  pts.forEach((q, i) => { if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); });
  ctx.closePath();
}

/**
 * ★★★**写し取ったピルを1枚描く**（`ctx` は呼ぶ側が `setTransform(dpr,…)` 済み）。
 *
 * ★★**押下の縮みを掛ける** ―― DOM は `transform: scale(PILL_PRESS)` で沈んでいるので、
 *   掛けないと**写し取った瞬間に 3% の段差**が見える。★倍率は**写し取った瞬間に
 *   実測したもの**（`look.press`）―― 沈んでいる途中でも版面が一致する。
 * ★★★**題と写真の丸は「自分の x」で測った値だけ沈む**。「掴んだ x での値」で
 *   一律に沈めると、**掴んだ所から遠い字が形の外へ出て切れる** ―― 形と同じ式を
 *   自分の位置で読めば、はみ出しは起こらない。
 */
/**
 * ★★★**「白抜き ⇄ 塗り」の途中のどこに居るか**（0 ＝ 輪郭だけ／1 ＝ 塗りだけ。
 * 2026-09-16・第113巡にユーザー指定「**帯のピルは白抜きで、図形は塗りですが、
 * これもアニメーションなく切り替わってしまいます**」）。
 *
 * ★★★**掛け金（`g.pill`）で切り替わっていた** ―― `t` が `PILL_EXIT`(0.2) を
 *   跨いだ1フレームで、**輪郭の版面から塗りの図形へ絵ごと入れ替わる**。形は
 *   `waist` で連続に変わっているのに、**面の塗り方だけが段差**になっていた。
 * ★★★**両端は「帯のピルがどうか」と「山の図形がどうか」から導く** ――
 *   決め打ちにすると、**日付の無い図形（山でも輪郭）を戻すときに勝手に塗られる**。
 * ★★**同じ式を2つの絵が読む**（ピルの版面 `drawPillGhost` と図形 `drawGhost`）ので、
 *   掛け金が跳ぶフレームでも**塗りの量は 1% も飛ばない**。
 */
export function inkMix(g: Ghost): number {
  const from = g.look && !g.look.outlined ? 1 : 0;   // 帯のピルの側
  const to = g.outlined ? 0 : 1;                     // 山の図形の側
  const t = Math.max(0, Math.min(1, g.t));
  return from + (to - from) * t;
}

export function drawPillGhost(ctx: CanvasRenderingContext2D, g: Ghost): void {
  const L: PillLook | undefined = g.look;
  if (!L) return;
  const w = L.w; const h = L.h;
  const give = g.bend; const gx = g.gx;
  const reach = w / 2;
  ctx.save();
  ctx.translate(g.hx, g.hy);
  ctx.scale(L.press, L.press);
  // ── 面（塗り／輪郭＋地の色の中身）。★`components/home/Band.tsx` と同じ規則。
  // ★★★**塗りは `inkMix` が決める**（上のコメント）。地を敷いてから面を重ね、
  //   輪郭は残りぶんだけ引く ―― **どちらも「量」なので段差が出ない**。
  const mix = inkMix(g);
  tracePill(ctx, w, h, gx, give);
  // ★★地を敷いてから面を `mix` の量だけ重ねる（第113巡の作法）。
  //   ★第128巡から帯のピルはベタ塗りなので、両端とも塗り＝`mix` は 1 のまま。
  ctx.fillStyle = L.ground;
  ctx.fill();
  if (mix > 0) {
    ctx.globalAlpha = mix;
    ctx.fillStyle = L.face;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (mix < 1) {
    // ★線は**内側に**引く（CSS の `border` と同じ。`pilePaint.ts` と同じ作法）。
    ctx.globalAlpha = 1 - mix;
    ctx.strokeStyle = L.face;
    ctx.lineWidth = PILL_EDGE;
    tracePill(ctx, w - PILL_EDGE, h - PILL_EDGE, gx, give);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.save();
  tracePill(ctx, w, h, gx, give);
  ctx.clip();
  // ── 中身。★DOM は `flex` の横並び（写真の丸 → `gap` → 文字の列）。
  let x = -w / 2 + L.padL;
  if (L.photo) {
    const cx = x + L.dia / 2;
    const dy = bendAt(cx, gx, reach, give, weightAt(0, h));
    const im = L.photo;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, dy, L.dia / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    // ★`objectFit: "cover"` と同じ（短いほうを合わせて中央で切る）。
    const s = Math.max(L.dia / im.naturalWidth, L.dia / im.naturalHeight);
    const iw = im.naturalWidth * s; const ih = im.naturalHeight * s;
    ctx.drawImage(im, cx - iw / 2, dy - ih / 2, iw, ih);
    ctx.restore();
    x += L.dia + L.gap;
  }
  // ★文字の列は**縦に中央**（DOM の `align-items: center`）。
  //   行の高さは `fontSize × lineHeight` そのもの。
  const th = L.textSize * LEAD.snug;
  const total = th * L.lines.length;
  const top = -total / 2;
  // ★★★**第126巡の「字の後ろの抜き」は削除した**（面が平らになったので、
  //   字が点と噛み合う心配が無い）。**復活させない。**
  const room = w / 2 - L.padR - x;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const line = (s: string, cy: number, size: number, tr: string, alpha: number) => {
    ctx.font = canvasFont(WEIGHT.heavy, size, SANS);
    track(ctx, tr);
    // ★★字の色も**面と同じ量で渡る**（輪郭のピルは面の色／塗りの面は
    //   `bodyInkOn()` が導いた色。切り替えると面だけ渡って字が飛ぶ）。
    ctx.fillStyle = mix <= 0 ? L.ink : mixHex(L.ink, g.ink, mix);
    ctx.globalAlpha = alpha;
    // ★DOM は `text-overflow: ellipsis`。canvas には無いので同じ幅で切る。
    let t = s;
    if (room > 0) {
      while (t.length > 1 && ctx.measureText(t).width > room) t = t.slice(0, -1);
      if (t !== s) t = `${t.slice(0, -1)}…`;
    }
    // ★★★**字も輪郭と同じ曲線に乗せる**（2026-09-15・第111巡にユーザー指摘
    //   「**図形が曲がるのに文字がそのままなのが気になる**」）。
    //   ★★★**第110巡までは「文字列の左端 1点」で測った垂れを行ごとに1回だけ
    //     足していた** ―― だから**字は平行に下がるだけで、1px も曲がらなかった**。
    //   ★★**1文字ずつ、自分の x で `bendAt` を読む**（`lib/wordPlate.ts` が
    //     字間を1文字ずつ送るのと同じ作法）。**輪郭と同じ式・同じ重みを読む**ので、
    //     字は面の中で**ぴったり同じだけ**垂れる。
    //   ★★**送りは `measureText` の積み上げ**（`track()` の字間もそこに入っている）。
    const wt = weightAt(cy, h);
    let cx = x;
    for (const ch of t) {
      ctx.fillText(ch, cx, cy + bendAt(cx, gx, reach, give, wt));
      cx += ctx.measureText(ch).width;
    }
    ctx.globalAlpha = 1;
    track(ctx, "0");
  };
  // ★★行ごとに描く（DOM は `flex-direction: column` に行を積んでいる）。
  L.lines.forEach((ln, i) => line(ln, top + th * i + th / 2, L.textSize, TRACK.normal, 1));
  ctx.restore();
  ctx.restore();
}
