import type { Body } from "matter-js";
import { canvasFont } from "./textFit";
import { WORD_WEIGHT, trackedWidth, wordBitmap } from "./solidPaint";

// ★★★**「文字そのものが図形」の板 ―― 作り方はここ1つ**（2026-09-10・第89巡）。
//
// ★★★**なぜ切り出したか。** GRAVITY（`components/tabs/GravityTab.tsx`）とホームの山
// （`components/home/Pile.tsx`）が**同じ物を2度書いていた**。GRAVITY は canvas に
// 焼いて貼り、当たり判定は**塗りの実測**（`inkBoxOf`）。ホームは DOM の `<div>` に
// 可変フォントの `wdth` で組み、当たり判定は近似だった。**板だけが物理とは別の
// 座標系に居た**ので、板まわりだけ挙動が違い、直すたびに新しい破綻が出た
// （宙で固まる／壁に噛む／当たり判定が字から離れる）。
// ★★★**ここを直したら両方が直る。二度と食い違えない。**
//
// ★中身は GRAVITY から**そのまま**移してある（第61〜63巡の判断を含む）。
//   使うのは2か所 … GRAVITY の日付・曜日＋TIMELINE の「自由」／ホームの山の日付・曜日。

/** 横に詰めてよい下限（これ以上は潰さない）。★`GravityTab` の `FREE_SQUEEZE`。 */
export const SQUEEZE_MIN = 0.50;

/** ★板の遊び。★★**縦は横の半分**（第62巡）― 板を平たくするほど「寝る」のが
 *  安定な姿勢になり、短い辺で立ったまま止まりにくい。字はもともと横長なので、
 *  縦の遊びを削っても窮屈には見えない。
 *  ★★山の板は**「自由」より小さく**（第63巡にユーザー指摘「日付の図形の当たり判定が
 *  文字に対して少しだけ大きい」）。`8/26` のような短い語では 8/4 だと箱が目に見えて大きい。 */
export const PLATE_PAD = 4;
export const PLATE_PAD_Y = 2;
/** 「自由」の板の遊び（TIMELINE 専用。★山より大きい）。 */
export const FREE_PAD = 8;
export const FREE_PAD_Y = 4;

/**
 * ★★★**字間を詰めて「塊」に見せる**（2026-09-11 ユーザー指定「文字の隙間を
 * 少なくしてブロックっぽく／面っぽく」）。`TRACK.tight` を em で取り、
 * **測るときも描くときも同じ値**を通す（当たり判定は塗りのまま）。
 * ★大きな欧文の規則どおり（`design.md` §1）。★★**ホームと TASK の両方**が
 * この部品を読むので、両方が同じだけ詰まる（ユーザー確定 2026-09-10）。
 */
export const PLATE_TRACK = -0.06;   // ★目盛りの外（表示専用の巨大欧文。`TRACK` の
//   いちばん狭い `tight`(-0.02em) では塊にならない ―― `SWISS_XL` とその行間 0.86 が
//   段の外にあるのと同じ理由で、**この板だけ**の値。`design.md` §7 に併記する。

/** ★山へ落とす曜日は**綴りのまま**（第60巡にユーザー指定「曜日の英語」）。 */
export const WD_FULL = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;

/** 測る用の canvas(使い回す)。 */
let wordProbe: CanvasRenderingContext2D | null = null;
const probeCtx = () => (wordProbe ??= document.createElement("canvas").getContext("2d"));

/** ★★★**塗りの矩形**を測る(2026-08-25・第61巡)。
 *  `textAlign:"center"` / `textBaseline:"middle"` で置いたときの原点から見た、
 *  実際にインクが乗る範囲と、その**中心のずれ**を返す。
 *  ★大文字や数字は em の中で上に寄るので、`middle` の原点と塗りの中心は**一致しない**。
 *  ここを補正しないと、物体の中心と字の中心がずれる。 */
export function inkBoxOf(word: string, fs: number, sx: number, fam: string): { w: number; h: number; dx: number; dy: number } {
  const probe = probeCtx();
  if (!probe) return { w: fs * word.length * 0.6, h: fs * 0.72, dx: 0, dy: 0 };
  probe.font = canvasFont(WORD_WEIGHT, fs, fam);
  probe.textAlign = "center"; probe.textBaseline = "middle";
  const m = probe.measureText(word);
  const a = m.actualBoundingBoxAscent ?? fs * 0.36;
  const d = m.actualBoundingBoxDescent ?? fs * 0.12;
  // ★★**横は「詰めて組んだ幅」で測る**（描くときと同じ送り）。縦は塗りのまま。
  //   ★`drawTracked` は詰めた全体の**中心**を原点に置くので、横のずれ `dx` は 0。
  const w = trackedWidth(probe, word, PLATE_TRACK * fs) * sx;
  return {
    w, h: a + d,
    dx: 0,                           // 詰めて組むと塗りの中心＝原点
    dy: (d - a) / 2,                 // 縦は原点とずれる(大文字は負＝上に寄る)
  };
}

/** ★字の大きさは「**塗りの幅**が `room` に収まる」で決める(第61巡)。
 *  箱の高さで縛らない ― 高さは塗りから決まるようになったので。
 *  ★★**いちばん幅を食う語**が `room` に収まる大きさを全部で使う（第67巡）――
 *  語ごとに幅から出すと `FRI` だけ巨大になり、並んだ2枚の字面が揃わない。 */
export function wordFontSize(words: readonly string[], room: number, fam: string, max: number): number {
  const probe = probeCtx();
  if (!probe) return 24;
  const base = 64;
  probe.font = canvasFont(WORD_WEIGHT, base, fam);
  let widest = 1;
  for (const w of words) widest = Math.max(widest, trackedWidth(probe, w, PLATE_TRACK * base));
  // ★横は `SQUEEZE_MIN` まで詰めてよい ― コンデンス体として読ませる。
  return Math.max(14, Math.min(max, Math.round((base * room) / widest / SQUEEZE_MIN)));
}

/** その語を決めた幅へ収めるための横の詰め(1 = 詰めない)。 */
export function wordSqueeze(word: string, fs: number, room: number, fam: string): number {
  const probe = probeCtx();
  if (!probe) return 1;
  probe.font = canvasFont(WORD_WEIGHT, fs, fam);
  const w = trackedWidth(probe, word, PLATE_TRACK * fs) || 1;
  return Math.max(SQUEEZE_MIN, Math.min(1, room / w));
}

/** 板1枚ぶんの寸法と描き方。★**物体の箱は「塗り＋遊び」**。 */
export interface WordPlate {
  word: string;
  /** 字の大きさ(px)と、板の幅へ収める横の詰めと、字の色と書体。 */
  fs: number; sx: number; ink: string; fam: string;
  /** ★塗りの中心が原点からどれだけずれているか(描くときに引く)。 */
  dx: number; dy: number;
  /** 塗りの箱(焼く絵の大きさ)。 */
  w: number; h: number;
  /** 物体の箱(塗り＋遊び)。 */
  bw: number; bh: number;
}

/** 語 → 板の寸法。★`GravityTab.makeWordPiece` の前半そのまま。 */
export function measureWordPlate(
  word: string, fs: number, room: number, ink: string, fam: string,
  pad = PLATE_PAD, padY = PLATE_PAD_Y,
): WordPlate {
  const sx = wordSqueeze(word, fs, room, fam);
  const ink0 = inkBoxOf(word, fs, sx, fam);
  return {
    word, fs, sx, ink, fam,
    dx: ink0.dx, dy: ink0.dy,
    w: ink0.w, h: ink0.h,
    bw: Math.max(8, ink0.w + pad * 2),
    bh: Math.max(8, ink0.h + padY * 2),
  };
}

/** 板 → matter の物体。★`GravityTab.makeWordPiece` の後半そのまま。 */
export function makeWordBody(
  M: typeof import("matter-js"), plate: WordPlate, x: number, y: number,
): Body {
  const body = M.Bodies.rectangle(x, y, plate.bw, plate.bh, {
    restitution: 0.04, friction: 0.55, frictionStatic: 0.9, frictionAir: 0.012,
  });
  // ★★★**回る**(第61巡に第59巡の対症療法を撤回)。回転を止めていたので
  //   「角度が変わらずゆっくり降りてくる」＝物体に見えなかった(ユーザー指摘)。
  //   ★ただし**回り慣性を重くする**(第62巡)。板は薄いので、横送りでレーンの壁が
  //   動くたびに小突かれて短い辺で立ってしまう。質量が両端に寄った板だと思えば
  //   物理的にも素直で、落ちるあいだは変わらず回る(空中では小突かれない)。
  M.Body.setInertia(body, body.inertia * 5);
  return body;
}

/** 板を canvas へ置く。★**焼いた絵を貼る**（紙の目が入り、文字もくっきりする。第63巡）。 */
export function drawWordPlate(
  ctx: CanvasRenderingContext2D, plate: WordPlate,
  x: number, y: number, angle: number, dpr: number,
): void {
  const wb = wordBitmap(plate.word, plate.fs, plate.sx, plate.ink, plate.fam,
    plate.w, plate.h, plate.dx, plate.dy, dpr, PLATE_TRACK);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(wb.canvas, -wb.w / 2, -wb.h / 2, wb.w, wb.h);
  ctx.restore();
}
