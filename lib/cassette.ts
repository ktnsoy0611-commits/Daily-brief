// ★★★**カセット（JOURNAL の顔）の寸法はここ1つ**（2026-09-13・第94巡）。
//
// ★★★**なぜ切り出したか。** 同じ形が**3か所**に出る ――
//   1. タブバーのアイコン（`components/TabIcons.tsx` の `cassette`。**SVG**）
//   2. ホームの山が落とす図形（`components/home/pilePaint.ts`。**canvas**）
//   3. 録音画面の「大きな円2つ＋その後ろの面」（`components/VoiceStudio.tsx`。**DOM**）
// **同じ数を3度書くと必ず食い違う**（`lib/wordPlate.ts` と `lib/dial.ts` で学んだ）。
//
// ★★★**録音画面はもともと「カセットを極端に寄って見た絵」だった**（第94巡に判明）。
//   アイコンのリールの比 `r ÷ リール間 = 2.9 / 7.2 = 0.403`、録音画面の円は
//   `0.65w / 1.60w = 0.406`。**実測でほぼ一致している。** 足りなかったのは
//   **本体の面**だけで、それを円の後ろに敷けばカセットになる（ユーザー指定）。
//
// ★★**塗り分けは「四角＝青／他＝黒」**（2026-09-13 ユーザー指定）。
//   ただし**タブバーの中だけは1色**（地が選択状態で変わるので色を決め打ちできない。
//   `TabIcons.tsx` の `PALE` の濃淡2段の作法をそのまま使う）。

/** 寸法を持つ座標系の一辺（＝タブアイコンの `viewBox` と同じ 24）。★目盛りの外（図形の座標系）。 */
export const CASSETTE_VIEW = 24;

/**
 * カセットの部品（24 の器の中の座標）。★目盛りの外（図形の座標系）。
 * ★**タブアイコンの元の数をそのまま写してある。**（第94巡より前は `TabIcons` が直書き）
 */
export const CASSETTE = {
  /** 本体の角丸の面。**ここだけが青**。 */
  body: { x: 2.4, y: 5, w: 19.2, h: 14, r: 2.6 },
  /** リールの丸2つ（本体の中に収まる）。 */
  reels: [{ x: 8.4, y: 11 }, { x: 15.6, y: 11 }],
  reelR: 2.9,
  /** 下の帯（本体の下の縁に接する）。 */
  bar: { x: 7.2, y: 16.2, w: 9.6, h: 2.8, r: 1.4 },
} as const;

/** 本体の縦横比（外接箱を作るときに使う）。 */
export const CASSETTE_ASPECT = CASSETTE.body.w / CASSETTE.body.h;

/** 本体の角丸を「高さに対する割合」で（大きく拡大するときに使う）。 */
export const CASSETTE_R_PER_H = CASSETTE.body.r / CASSETTE.body.h;

// ★★★**アイコンの余白の比は録音画面では使えない**（第94巡に実測して捨てた）。
//   アイコンの本体はリールに対して**とても大きい**（リールの直径 5.8 に対して、
//   上に 3.1・下に 5.1）。同じ比を録音画面の円（直径 507px）に当てると本体は
//   **1224px 高**になり、390×844 の画面が**全面青**になって縁が1本も見えない。
//   だから録音画面は**一定の余白1つ**（`VoiceStudio` の `PLATE_PAD`）で円を包む
//   ―― ユーザー確定「アイコンの図形を拡大しているような感じになっていれば良い」。
//   ★**比を復活させないこと。** 円を動かさない限り、比は成り立たない。

const roundRect = (
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
) => {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  else ctx.rect(x, y, w, h);
  ctx.closePath();
};

/**
 * canvas にカセットを描く（**原点は本体の中心**。`ctx` の変形は呼ぶ側の責任）。
 * `w`/`h` は**本体の外接箱**（比は `CASSETTE_ASPECT` を守って渡すこと）。
 * ★★**面は `face`（青）、リールと帯は `ink`（黒）** ―― タブアイコンの濃淡2段を
 *   2色へ置き換えたもの（canvas には「地が変わる」問題が無いので色で塗れる）。
 */
export function drawCassette(
  ctx: CanvasRenderingContext2D, w: number, h: number, face: string, ink: string,
): void {
  // 24 の器 → 実寸への倍率。★本体の外接箱が (w, h) になるように取る。
  const kx = w / CASSETTE.body.w;
  const ky = h / CASSETTE.body.h;
  // 24 の器の中の座標を、本体の中心が原点になるように移す。
  const cx = CASSETTE.body.x + CASSETTE.body.w / 2;
  const cy = CASSETTE.body.y + CASSETTE.body.h / 2;
  const px = (x: number) => (x - cx) * kx;
  const py = (y: number) => (y - cy) * ky;

  ctx.fillStyle = face;
  roundRect(ctx, -w / 2, -h / 2, w, h, CASSETTE.body.r * ky);
  ctx.fill();

  ctx.fillStyle = ink;
  for (const reel of CASSETTE.reels) {
    ctx.beginPath();
    // ★丸は**縦の倍率**で描く（横に潰れた楕円にしない。本体の比は守って渡す約束）。
    ctx.arc(px(reel.x), py(reel.y), CASSETTE.reelR * ky, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
  roundRect(
    ctx, px(CASSETTE.bar.x), py(CASSETTE.bar.y),
    CASSETTE.bar.w * kx, CASSETTE.bar.h * ky, CASSETTE.bar.r * ky,
  );
  ctx.fill();
}
