// ★★★**録音機（JOURNAL の顔）の寸法はここ1つ**（2026-09-27・第133巡）。
//
// ★★★**形は「縦長の角丸の四角に、回る円が1つ」**（ユーザー指定「**今ある二つの円を
//   一つにして、その分横幅を狭めて、Explore のカードとデザインを統一し、縦長の角丸の
//   四角に、回転する円が付いているデバイス**」）。第94〜132巡のカセット（横長の本体・
//   リール2つ・突起2つ ＝ `lib/cassette.ts`）は**削除した。復活させない。**
//
// ★★★**Explore の札と同じ比・同じベゼル・同じ角丸**（`BRIEF_CARD_ASPECT` ＝ 2:3・
//   `SPACE.xl`・`CARD_RADIUS`）。札の**写真の正方形**がちょうど入る場所に、録音機では
//   **回る円**が入る（第133巡の割り付けで円は写真より小さい 282。下の `V_BEZEL` の注釈）。
// ★★写真の下の「題・本文・下の1列の円」の場所に、録音機では「数字・波形・キーの段」。
//
// ★★同じ形が**2つの技術**に出る … タブのアイコン（**SVG**）／録音画面（**DOM**）。
//   ★ホームの山は**円だけ**を落とす（ユーザー指定「**図形の方は、黒い円を出して**」）。
//
// ★比は**本体の幅 ＝ 1** に対して持つ（札の幅が画面で決まるので、幅が物差し）。

import { BRIEF_CARD_ASPECT, CARD_RADIUS } from "./constants";
import { SPACE } from "./tokens";

/** ★比を測った札の幅（タブの列の内寸 ＝ 390 − `SPACE.lg`×2）。★目盛りの外（比の分母）。 */
const REF_W = 358;

/** 本体の幅 ÷ 高さ（札と同じ1つの割り算）。 */
export const RECORDER_AR = (() => {
  const [a, b] = BRIEF_CARD_ASPECT.split("/").map((n) => Number(n.trim()));
  return a / b;
})();
/** ベゼル（札の `SPACE.xl`）と角丸（札の `CARD_RADIUS`）を幅に対する比で。★画面の録音機は px の `CARD_RADIUS` そのもの（アイコンだけが比を読む）。 */
export const RECORDER_BEZEL_PER_W = SPACE.xl / REF_W;
export const RECORDER_R_PER_W = CARD_RADIUS / REF_W;
/**
 * ★★★**縦の割り付け**（第133巡にユーザー指定「**円の上下は少し広めのスペーシング、窓とボタン同士はそれより
 * 小さいスペーシングでグループに見えるように、上下のベゼルの大きさを合わせる**」）。上から …
 *   上のベゼル `V_BEZEL`(32) ／ 円 ／ 円の下 `REEL_GAP`(32) ／ 窓 ／ 窓の下 `GROUP_GAP`(16。キーのラベルが入る) ／
 *   キーの段 ／ 下のベゼル `V_BEZEL`(32)。★左右のベゼルは札と同じ `SPACE.xl`(24)。
 * ★★**円は札の写真と同じ大きさではなくなった**（358 幅で 310 → 282）。高さ（札と同じ 2:3）が決まっているので、
 *   上下の余白を広げたぶんは円が譲る。★窓の高さ ＝ 段の高さ（同じ厚みの2本 ＝ ひとまとまり）。
 */
const V_BEZEL = SPACE.xxl / REF_W;
const REEL_GAP = SPACE.xxl / REF_W;
const GROUP_GAP = SPACE.lg / REF_W;
/**
 * ★★キーの段（左の円 ＝ REC の穴／右のバー ＝ 残り3つの穴）の高さ。
 * ★目盛りの外（部品の比。358 幅で 72px ＝ 第98巡のキーの径 56 が入る厚み）。
 */
export const RECORDER_DECK_H_PER_W = 0.2;
/** 窓と段の幅（左右のベゼルの内側）。 */
export const RECORDER_INNER_W_PER_W = 1 - RECORDER_BEZEL_PER_W * 2;
/** 段の円とバーの隔（段の高さに対する比）。 */
export const RECORDER_DECK_GAP_PER_H = 1 / 4;
/** 段の上端（本体の上の縁から）。 */
export const RECORDER_DECK_Y_PER_W = 1 / RECORDER_AR - V_BEZEL - RECORDER_DECK_H_PER_W;
/** 窓の高さ（＝ 段の高さ）と上端。 */
export const RECORDER_SCREEN_H_PER_W = RECORDER_DECK_H_PER_W;
export const RECORDER_SCREEN_Y_PER_W = RECORDER_DECK_Y_PER_W - GROUP_GAP - RECORDER_SCREEN_H_PER_W;
/** 回る円の直径と中心の高さ。 */
export const RECORDER_REEL_D_PER_W = RECORDER_SCREEN_Y_PER_W - REEL_GAP - V_BEZEL;
export const RECORDER_REEL_CY_PER_W = V_BEZEL + RECORDER_REEL_D_PER_W / 2;
/** ★★キーが段の中に空ける黒い縁（段の高さの 1/8 ―― 第98巡から変えていない）。 */
export const RECORDER_KEY_LIP_PER_H = 1 / 8;

/**
 * ★★タブのアイコン（`viewBox` 24）の寸法。上の比をそのまま 24 の箱へ置く。
 * ★高さを 21 に取る（箱いっぱいだと他のアイコンより大きく見える）。
 */
const ICON_H = 21;
const ICON_W = ICON_H * RECORDER_AR;
const IX = (24 - ICON_W) / 2;
const IY = (24 - ICON_H) / 2;
const deckH = ICON_W * RECORDER_DECK_H_PER_W;
const deckY = IY + ICON_W * RECORDER_DECK_Y_PER_W;
const deckX = IX + ICON_W * RECORDER_BEZEL_PER_W;
const reelD = ICON_W * RECORDER_REEL_D_PER_W;
const innerW = ICON_W * RECORDER_INNER_W_PER_W;
const gap = deckH * RECORDER_DECK_GAP_PER_H;
export const RECORDER_ICON = {
  body: { x: IX, y: IY, w: ICON_W, h: ICON_H, r: ICON_W * RECORDER_R_PER_W },
  reel: { x: 12, y: IY + ICON_W * RECORDER_REEL_CY_PER_W, r: reelD / 2 },
  knob: { x: deckX + deckH / 2, y: deckY + deckH / 2, r: deckH / 2 },
  bar: { x: deckX + deckH + gap, y: deckY, w: innerW - deckH - gap, h: deckH, r: deckH / 2 },
} as const;
