import type { TagPattern } from "./types";

// ★★★**タグを見分けるのは「柄」**（2026-09-11・第91巡にユーザー指定）。
//
// ★★★**なぜ色をやめたか。** 第87巡でアプリごとのアクセント配色へ替えた結果、
// TASK の図形は**オレンジの濃淡**になり、タグの区別が事実上消えた。
// 色相は**アプリの識別**に使い切っているので、**アプリの中では増やせない**。
// そこで見分けを**色から柄へ**移した ―― 柄なら色相を1つも使わない。
//
// ★★★**これは「質感」ではない。** `design.md` §3-b の「テクスチャは明暗だけを
// 足すもので、色を動かすな」は**当てはまらない** ―― デュオトーンと同じで、
// **色を動かすことが目的**だから（どちらの規則を当てるかは「色を動かすつもりが
// あるか」で決まる、と `design.md` §3-b が書いている）。
//
// ★★★ただし**網点の機械の規則は守る** ―― 「網点は高い刻みなので拡大縮小しない。
// 1画像画素 ＝ 1デバイス画素で敷く」（`design.md` §3-b）。だから
// ①タイルは**デバイス画素で**作り ②`pattern.setTransform(1/dpr)` で
// ctx の dpr を打ち消す。**画像は足さない**（手続きで描く）。

/**
 * ★網点の刻み（デバイス画素）。★目盛りの外（柄の寸法）。
 * ★★**粗めにする** ―― 図形は**回る**ので、細かいと回転の再標本化でモアレが出る
 * （回転は `design.md` §3-b の想定外）。点の直径は刻みの 0.5 前後。
 */
const DOT_PITCH = 7;
const DOT_R = 1.85;

const tileCache = new Map<string, CanvasPattern | null>();

/** 網点のタイルを1枚作る（**デバイス画素**で描く）。 */
function halftoneTile(color: string, dpr: number): HTMLCanvasElement | null {
  const n = Math.max(2, Math.round(DOT_PITCH * dpr));
  const cv = document.createElement("canvas");
  cv.width = n; cv.height = n;
  const c = cv.getContext("2d");
  if (!c) return null;
  c.fillStyle = color;
  // ★2つ置いて**市松**にする（1つだけだと縦横の筋が立って見える）。
  const r = DOT_R * dpr;
  for (const [x, y] of [[n * 0.25, n * 0.25], [n * 0.75, n * 0.75]]) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.closePath();
    c.fill();
  }
  return cv;
}

/**
 * ★★**その柄の塗り**を返す（`ctx.fillStyle` にそのまま入れる）。
 * `ctx` には `setTransform(dpr, …)` が掛かっている前提 ―― 網点は
 * **`setTransform(1/dpr)` で打ち消して 1タイル画素＝1デバイス画素**にする。
 */
export function tagFill(
  ctx: CanvasRenderingContext2D, pattern: TagPattern, color: string, dpr: number,
): string | CanvasPattern {
  if (pattern === "solid") return color;
  const key = `${color}|${dpr.toFixed(2)}`;
  let pat = tileCache.get(key);
  if (pat === undefined) {
    const tile = halftoneTile(color, dpr);
    pat = tile ? ctx.createPattern(tile, "repeat") : null;
    if (tileCache.size > 24) tileCache.clear();
    tileCache.set(key, pat);
  }
  if (!pat) return color;                   // 作れない環境では**べた塗りへ戻る**
  pat.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0]));
  return pat;
}

/**
 * ★★DOM 側の柄（入力画面のタグの見本など）。**画像を足さない** ―― 繰り返しの
 * グラデーションで同じ市松を作る。★canvas 側と刻みを揃える。
 */
export function tagPatternCss(pattern: TagPattern, color: string): React.CSSProperties {
  if (pattern === "solid") return { background: color };
  const dot = `radial-gradient(circle at 25% 25%, ${color} ${DOT_R}px, transparent ${DOT_R + 0.5}px)`;
  const dot2 = `radial-gradient(circle at 75% 75%, ${color} ${DOT_R}px, transparent ${DOT_R + 0.5}px)`;
  return {
    backgroundImage: `${dot}, ${dot2}`,
    backgroundSize: `${DOT_PITCH}px ${DOT_PITCH}px`,
    backgroundRepeat: "repeat",
  };
}
