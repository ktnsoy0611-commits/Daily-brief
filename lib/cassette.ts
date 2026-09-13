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
// ★★★**寸法は「段（下のバー）」から全部出る**（2026-09-13・第98巡）。
//   ユーザー指定 ―― 「**バーは図形の端に余白をとって**」「**円は中心よりも少し上**」
//   「**角丸でなくて四角に**」「**バーとボタンの間隔を詰める**」。
//
//   ★★★**バーの幅はキーの数から出る** … 録音画面では、下の段がそのまま
//   「キーの穴」になる。キー3つが**縁も隔も `lip` で詰まる**幅は
//     `barW = 3(D − 2·lip) + 4·lip`。`lip = D/8` なら **`barW = 2.75 D`**。
//   第97巡は `barW = 4.0 D` で、実測の隔が 33.6px（キーの径 51.1 の 66%）だった。
//
//   ★★★**段は下の縁から段の高さぶん浮かす**（＝ 1.8）。第97巡までは
//   `bar.y + h = body.y + h` で**縁にぴったり接していた**。
//
//   ★★★**リールは本体の上の縁と段の上の縁のちょうど中間**（y = 10.2）。
//   これで**本体の中心 12 より 1.8 上**になり、ユーザー指定の「少し上」が
//   **式から出る**（目で振っていない）。
//
//   検算 … **隙間はどれも 1.6**（左の縁・リール間・右の縁・上・段まで ＝ 5件）、
//   段の下だけ 1.8。

/** 下の段（バー・つまみ）の高さ。★ここから幅も余白も導く。 */
const D = 1.8;
/** 段の総幅（つまみ D ＋ 隔 D/3 ＋ バー 2.75D）。 */
const DECK_W = D + D / 3 + D * 2.75;
/** 段の上端（本体の下の縁から D 浮かせる）。 */
const DECK_TOP = 5 + 14 - D - D;
/** 段の左端（本体の中で左右の中央）。 */
const DECK_LEFT = 2.4 + 19.2 / 2 - DECK_W / 2;

/**
 * カセットの部品（24 の器の中の座標）。★目盛りの外（図形の座標系）。
 * ★**タブアイコン・ホームの山・録音画面の3つが、この1か所だけを読む。**
 */
export const CASSETTE = {
  /** 本体の面。**ここだけが青**。★★★角丸は 0（2026-09-13 ユーザー指定「四角に」）。 */
  body: { x: 2.4, y: 5, w: 19.2, h: 14, r: 0 },
  /** リールの丸2つ（**本体の上の縁と段の上の縁の中間**＝本体の中心より 1.8 上）。 */
  reels: [{ x: 7.6, y: (5 + DECK_TOP) / 2 }, { x: 16.4, y: (5 + DECK_TOP) / 2 }],
  reelR: 3.6,
  /** 下の段の左の円（録音画面では REC のキーの穴）。 */
  knob: { x: DECK_LEFT + D / 2, y: DECK_TOP + D / 2, r: D / 2 },
  /** 下の段の右のバー（録音画面では残り3キーの穴）。★幅はキー3つが詰まる 2.75D。 */
  bar: { x: DECK_LEFT + D + D / 3, y: DECK_TOP, w: D * 2.75, h: D, r: D / 2 },
} as const;

/** 下の段の総幅（円の左端からバーの右端まで）。★アイコンと録音画面が同じ比を読む。 */
export const CASSETTE_DECK_W =
  CASSETTE.bar.x + CASSETTE.bar.w - (CASSETTE.knob.x - CASSETTE.knob.r);
/** 下の段の高さ（＝バーの高さ＝円の直径）。 */
export const CASSETTE_DECK_H = CASSETTE.bar.h;
/** 下の段の左端（本体の左の縁からの距離）。 */
export const CASSETTE_DECK_X = CASSETTE.knob.x - CASSETTE.knob.r - CASSETTE.body.x;
/** 下の段の上端（本体の上の縁からの距離）。 */
export const CASSETTE_DECK_Y = CASSETTE.bar.y - CASSETTE.body.y;

/** 本体の縦横比（外接箱を作るときに使う）。 */
export const CASSETTE_ASPECT = CASSETTE.body.w / CASSETTE.body.h;

/** 本体の角丸を「高さに対する割合」で（大きく拡大するときに使う）。 */
export const CASSETTE_R_PER_H = CASSETTE.body.r / CASSETTE.body.h;

// ★★★**録音画面は「アイコンを拡大して画面に嵌めた絵」**（2026-09-13・第96巡）。
//   ユーザー指摘「**円と四角は大きさや位置関係が、アイコンの図形と違いすぎる**」。
//   実測 … アイコンの `リールの直径 ÷ 本体の高さ = 0.457` に対し、第95巡の
//   録音画面は `390/500 = 0.78` で**リールが 2倍近く大きかった**。
//   → **録音画面が読む比をここから出す。向こうで数を持たない。**

/** リールの直径 ÷ 本体の高さ。 */
export const CASSETTE_REEL_D_PER_H = (CASSETTE.reelR * 2) / CASSETTE.body.h;
/** リールの中心間 ÷ 本体の幅。 */
export const CASSETTE_REEL_GAP_PER_W =
  (CASSETTE.reels[1].x - CASSETTE.reels[0].x) / CASSETTE.body.w;
/** リールの中心 y（本体の上の縁からの割合）。★いまは 0.371 ＝ **中心より少し上**。 */
export const CASSETTE_REEL_CY_PER_H =
  (CASSETTE.reels[0].y - CASSETTE.body.y) / CASSETTE.body.h;
/** 下の段の上端（本体の上の縁からの割合）。★段は本体の下の縁に接していない。 */
export const CASSETTE_DECK_Y_PER_H = CASSETTE_DECK_Y / CASSETTE.body.h;
/** 下の段の幅 ÷ 本体の幅。★0.383（第97巡は 0.5 ＝ 半分あった）。 */
export const CASSETTE_DECK_W_PER_W = CASSETTE_DECK_W / CASSETTE.body.w;

// ★★★**キーの寸法は段から出る**（2026-09-13・第98巡）。
//   段の中でキーが空ける黒い縁 `lip` を**段の高さの 1/8** と決めると、
//   キーの径は `D − 2·lip = 0.75 D`、キー3つが縁も隔も `lip` で詰まる幅は
//   `3(D − 2·lip) + 4·lip = 2.75 D`。**バーの幅はこの式で決めてある。**
//   ★だから録音画面は「端の丸と同心に置く」だけで**隔がちょうど `lip`** になる。

/** 段の中でキーが空ける縁 ÷ 段の高さ。 */
export const CASSETTE_KEY_LIP_PER_H = 1 / 8;
/** バーの幅 ÷ 段の高さ（＝キー3つが詰まる幅）。 */
export const CASSETTE_BAR_W_PER_H = CASSETTE.bar.w / CASSETTE.bar.h;

// ★★★**アイコンの縦の比をそのまま録音画面へ当ててはいけない**（第94巡に実測）。
//   アイコンの本体はリールに対してとても大きく（リールの直径 5.8 に対して上 3.1・
//   下 5.1）、同じ比を大きな円へ当てると本体が画面の何倍にもなって縁が見えない。
//   ★★**録音画面は「上の余白・リール・下の段」を自分で積む**（`VoiceStudio` の
//   `PLATE_PAD` と `deckH`）。**横の比（`CASSETTE_ASPECT`）だけをアイコンから借りる。**

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
  // ★下の段 … 左の円（REC）と右のバー。**バーと同じ材料（`ink`）**で塗る。
  ctx.beginPath();
  ctx.arc(px(CASSETTE.knob.x), py(CASSETTE.knob.y), CASSETTE.knob.r * ky, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  roundRect(
    ctx, px(CASSETTE.bar.x), py(CASSETTE.bar.y),
    CASSETTE.bar.w * kx, CASSETTE.bar.h * ky, CASSETTE.bar.r * ky,
  );
  ctx.fill();
}
