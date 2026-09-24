// ★★★**カセット（JOURNAL の顔）の寸法はここ1つ**（2026-09-13・第94巡）。
//
// ★★★**なぜ切り出したか。** 同じ形が**3か所**に出る ――
//   1. タブバーのアイコン（`components/TabIcons.tsx` の `cassette`。**SVG**）
//   2. ホームの山が落とす図形（`components/home/pilePaint.ts`。**canvas**）
//   3. 録音画面の「大きな円2つ＋その後ろの面」（`components/VoiceStudio.tsx`。**DOM**）
// **同じ数を3度書くと必ず食い違う**（`lib/wordPlate.ts` と `lib/reelHub.ts` で学んだ）。
//
// ★★★**録音画面はもともと「カセットを極端に寄って見た絵」だった**（第94巡に判明）。
//   アイコンのリールの比 `r ÷ リール間 = 2.9 / 7.2 = 0.403`、録音画面の円は
//   `0.65w / 1.60w = 0.406`。**実測でほぼ一致している。** 足りなかったのは
//   **本体の面**だけで、それを円の後ろに敷けばカセットになる（ユーザー指定）。
//
// ★★**塗り分けは「四角＝青／他＝黒」**（2026-09-13 ユーザー指定）。
//   ただし**タブバーの中だけは1色**（地が選択状態で変わるので色を決め打ちできない。
//   `TabIcons.tsx` の `PALE` の濃淡2段の作法をそのまま使う）。

import { traceHub } from "./reelHub";

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
/** 左上の突起（四角いボタン）の幅・高さ・隔。★段の `D` から導く。 */
const TAB_W = D;
const TAB_H = D / 2;
const TAB_GAP = D / 3;
/** 突起の組の左端。★**左のリールの真上に組の中心を合わせる**（7.6）。 */
const TAB_LEFT = 7.6 - (TAB_W * 2 + TAB_GAP) / 2;

/**
 * カセットの部品（24 の器の中の座標）。★目盛りの外（図形の座標系）。
 * ★**タブアイコン・ホームの山・録音画面の3つが、この1か所だけを読む。**
 */
export const CASSETTE = {
  /** 本体の面。**ここだけが青**。★★★角丸は 2.6（2026-09-13・第99巡にユーザー指定
   *  「**四角から角丸に戻して**」。第98巡に 0 にしたのを撤回した）。 */
  body: { x: 2.4, y: 5, w: 19.2, h: 14, r: 2.6 },
  // ★★★**左上の四角い突起2つ**（2026-09-13・第99巡にユーザー指定「**四角の左上に
  //   二つ、四角い突起（横から見た小さい少し厚みのあるボタン）**をつけて」）。
  //   ★**本体の上の縁から上へ出る** ―― 「突起」なので面の中に収めない。
  //   ★寸法も位置も**段の `D` と左のリール**から導く（新しい数を1つも置かない）。
  //   ★★角丸 2.6 の本体の**上辺は x 5.0〜19.0 にしか無い**。組は 5.5 から始まるので、
  //     突起の根元は必ず本体に乗る。
  /** 左上の突起2つ（**黒**。リール・段と同じ材料）。 */
  tabs: [
    { x: TAB_LEFT, y: 5 - TAB_H, w: TAB_W, h: TAB_H, r: D / 6 },
    { x: TAB_LEFT + TAB_W + TAB_GAP, y: 5 - TAB_H, w: TAB_W, h: TAB_H, r: D / 6 },
  ],
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

// ★★★**突起は本体の外にいる**（2026-09-13・第99巡）。だから**図形の外接箱は
//   本体より上へ伸びる**。録音画面の「高さの見張り」は本体ではなく**外接箱**を
//   見なければならない（そのままだと突起が題に掛かる）。

/** 左上の突起の高さ ÷ 本体の高さ（＝本体の上へ出る割合）。 */
export const CASSETTE_TAB_H_PER_H = CASSETTE.tabs[0].h / CASSETTE.body.h;
/** 突起を含めた図形の高さ ÷ 本体の高さ。 */
export const CASSETTE_BOX_H_PER_H = 1 + CASSETTE_TAB_H_PER_H;

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
// ★★★**録音の波形の帯もリールから導く**（2026-09-13・第100巡にユーザー指定
//   「**波形の位置がおかしい。以前のように円と円の間の上あたりに表示し、もっと
//   小さくして、ちゃんとベゼルもとって**」）。
//   ★★第99巡は `(plateTop + (cy − RD/2)) / 2` ＝**リールより上**へ置いていた。
//     第98巡までは `cy − 136` で**リールとリールのあいだ**に在った ―― 帯の幅は
//     「その高さでの円と円の隙間」なので、**リールの上寄り**でこそ広く取れる。
//   ★★**生の 136 を捨て、リールの直径に対する比で持つ**（リールの大きさが
//     変わっても「円と円の間の上あたり」が保たれる）。
/** 波形の帯の中心を、リールの中心から**どれだけ上へ**置くか ÷ リールの直径。
 *  ★0.44 は第98巡の 136 / 308.6（＝以前の位置そのまま）。 */
export const CASSETTE_WAVE_CY_PER_D = 0.44;
/** 波形の帯の高さ ÷ リールの直径。★第98巡は 58/308.6 = 0.188 → **もっと小さく**。 */
export const CASSETTE_WAVE_H_PER_D = 0.14;

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

// ★★★**突起は「上だけ角丸」**（2026-09-13・第100巡にユーザー指定
//   「**左上のボタンは、下は角丸にしないでください。四角からボタンが出っ張って
//   いることを示すデザインなので、下は角丸だとおかしい**」）。
//   ★★**3つの技術が同じ「上だけ丸める」を持つ必要がある** ―― SVG の `rx` も
//     canvas の単一半径も CSS の一括指定も**四隅**を丸めてしまう。だから
//     **上だけの形をここ1か所**に置き、タブアイコン（SVG の `d`）・ホームの山
//     （canvas の4値）・録音画面（CSS の4値）がそれぞれの語で読む。

/** 上の2隅だけ丸めた矩形（4値。canvas の `roundRect` と CSS の並びは同じ順）。 */
export const topRoundRadii = (r: number): [number, number, number, number] => [r, r, 0, 0];

/** 上の2隅だけ丸めた矩形の **SVG のパス**（`TabIcons` が読む）。 */
export function topRoundRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const k = Math.max(0, Math.min(r, w / 2, h));
  return [
    `M${x + k} ${y}`,
    `H${x + w - k}`,
    `A${k} ${k} 0 0 1 ${x + w} ${y + k}`,
    `V${y + h}`,
    `H${x}`,
    `V${y + k}`,
    `A${k} ${k} 0 0 1 ${x + k} ${y}`,
    "Z",
  ].join(" ");
}

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
  ctx: CanvasRenderingContext2D, w: number, h: number, face: string, ink: string, hub: string,
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
  // ★★★**リールの芯**（2026-09-13・第100巡）。録音画面の SVG と**同じ点の列**
  //   （`lib/reelHub.ts`）。★原点をリールの中心へ移して引く。
  ctx.fillStyle = hub;
  for (const reel of CASSETTE.reels) {
    ctx.save();
    ctx.translate(px(reel.x), py(reel.y));
    traceHub(ctx, CASSETTE.reelR * 2 * ky);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = ink;
  // ★左上の突起2つ。**本体の上の縁から上へ出る**（`ink`）。
  // ★★**丸めるのは上の2隅だけ**（第100巡）。`roundRect` が無い環境は素の矩形へ落ちる。
  for (const t of CASSETTE.tabs) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(px(t.x), py(t.y), t.w * kx, t.h * ky, topRoundRadii(t.r * ky));
    } else {
      ctx.rect(px(t.x), py(t.y), t.w * kx, t.h * ky);
    }
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
