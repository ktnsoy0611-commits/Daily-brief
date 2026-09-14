import { SANS } from "@/lib/constants";
import { canvasFont } from "@/lib/textFit";
import { LEAD, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
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

/** 字間（`TRACK` は em の文字列）。★対応していない環境では素の字間で描く。 */
const track = (ctx: CanvasRenderingContext2D, v: string) => {
  if ("letterSpacing" in ctx) (ctx as { letterSpacing: string }).letterSpacing = v;
};

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
  tracePill(ctx, w, h, gx, give);
  ctx.fillStyle = L.outlined ? L.ground : L.face;
  ctx.fill();
  if (L.outlined) {
    // ★線は**内側に**引く（CSS の `border` と同じ。`pilePaint.ts` と同じ作法）。
    ctx.strokeStyle = L.face;
    ctx.lineWidth = PILL_EDGE;
    tracePill(ctx, w - PILL_EDGE, h - PILL_EDGE, gx, give);
    ctx.stroke();
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
  const gh = L.genre ? TYPE.nano * LEAD.flat : 0;
  const total = th + (L.genre ? SPACE.hair + gh : 0);
  const top = -total / 2;
  const room = w / 2 - L.padR - x;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const line = (s: string, cy: number, size: number, tr: string, alpha: number) => {
    const dy = bendAt(x, gx, reach, give, weightAt(cy, h));
    ctx.font = canvasFont(WEIGHT.bold, size, SANS);
    track(ctx, tr);
    ctx.fillStyle = L.ink;
    ctx.globalAlpha = alpha;
    // ★DOM は `text-overflow: ellipsis`。canvas には無いので同じ幅で切る。
    let t = s;
    if (room > 0) {
      while (t.length > 1 && ctx.measureText(t).width > room) t = t.slice(0, -1);
      if (t !== s) t = `${t.slice(0, -1)}…`;
    }
    ctx.fillText(t, x, cy + dy);
    ctx.globalAlpha = 1;
    track(ctx, "0");
  };
  line(L.text, top + th / 2, L.textSize, TRACK.normal, 1);
  // ★2行目（ジャンル）は控えめ。★DOM の `opacity: .62` と同じ。
  if (L.genre) line(L.genre, top + th + SPACE.hair + gh / 2, TYPE.nano, TRACK.wide, 0.62);
  ctx.restore();
  ctx.restore();
}
