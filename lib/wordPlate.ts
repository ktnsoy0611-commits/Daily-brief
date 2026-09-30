import type { Body } from "matter-js";
import { canvasFont, primaryFamily } from "./textFit";
import { BAND_BEZEL, BAND_H, SANS } from "./constants";
import { SPACE, WEIGHT } from "./tokens";
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

// ★★★**偽コンデンスをやめた**（2026-09-13・第100巡にユーザー指定
//   「アプリで共通で使っている英語のフォントがダサい。**大きい文字と数字が変**」）。
//   ★★**「変」の正体は書体ではなく潰し方だった** ―― 第99巡までは
//     `SQUEEZE_MIN = 0.50` で大きさを2倍に取り、**横を 50% に潰して**
//     コンデンス体に見せていた（Archivo の `wdth` の軸は canvas に届かないので、
//     縦長は `ctx.scale` で作るしか無かった）。太さ 900 との合わせ技で
//     「太くて不自然に細長い」字になっていた。
//   → **大きな欧文は `DISPLAY`（Anton。もともと縦長）**になったので、
//     **潰す細工が要らない**。`app/layout.tsx` のコメントも読むこと。

/** ★★**狙う詰め**（`wordFontSize` が割る値）。**1 ＝ 意図的に潰さない**。 */
export const SQUEEZE_AIM = 1;
/** 横に詰めてよい下限（これ以上は潰さない）。★**安全網だけ**（第100巡に 0.50 → 0.88）。
 *  ★`GravityTab` の `FREE_SQUEEZE`（和文の「自由」）もこれを読む ―― 和文に欧文の
 *  詰めを当てないという `design.md` §1 の決まりに、値のほうが寄った。 */
export const SQUEEZE_MIN = 0.88;

/** ★板の遊び。★★**縦は横の半分**（第62巡）― 板を平たくするほど「寝る」のが
 *  安定な姿勢になり、短い辺で立ったまま止まりにくい。字はもともと横長なので、
 *  縦の遊びを削っても窮屈には見えない。
 *  ★★山の板は**「自由」より小さく**（第63巡にユーザー指摘「日付の図形の当たり判定が
 *  文字に対して少しだけ大きい」）。`8/26` のような短い語では 8/4 だと箱が目に見えて大きい。
 *  ★★★**第101巡に 4/2 → 1/1**（ユーザー指定「**文字はしっかり文字が表示されている
 *  部分に当たり判定があるように**。その当たり判定は**1ピクセルだけ外側にオフセット**」）。
 *  ★★**`lib/solid.ts` の `PHYS_GAP`(1) と同じ役**（図形も板も、絵より 1px だけ外側）。
 *  ★焼く箱はもう `PLATE_BLEED` から出るので、**遊びを削っても絵は切れない**。 */
export const PLATE_PAD = 1;
export const PLATE_PAD_Y = 1;
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
export const PLATE_TRACK = -0.02;   // ＝ `TRACK.tight`（em）
// ★★★**第101巡に -0.06 → -0.02**（ユーザー指定「落ちてくる曜日と日付の文字が
//   **詰まりすぎている**のでもう少しだけ緩めて」）。書体が `DISPLAY`（Anton）に
//   なり、**もともと詰まった書体**になったので、-0.06 は**二重に詰めていた**。
// ★★これで `TRACK` の段（`tight` = -0.02em）に乗ったので、**もう目盛りの外ではない**。

/** ★山へ落とす曜日は**綴りのまま**（第60巡にユーザー指定「曜日の英語」）。 */
export const WD_FULL = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
/**
 * ★★★**3文字の曜日**（2026-09-16・第114巡にユーザー指定「**曜日は WED や TUE の
 * ような感じに**」）。★いまホームの山だけが読む（TASK は `WD_FULL` のまま）。
 */
export const WD_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

/**
 * ★★★**黒いピルの板の遊び**（2026-09-16・第114巡にユーザー指定「**どちらも
 * 黒いピルに白の文字／ピルのサイズに対してそれぞれの文字が大きく入っている感じ**」）。
 * ★★**字の高さに対する比で持つ**（生の px を置かない）―― 字の大きさが日によって
 *   変わっても、ピルと字の関係が動かない。★目盛りの外（図形の寸法）。
 */
export const PILL_PAD = 0.46;
export const PILL_PAD_Y = 0.24;

/**
 * ★★★**板の書体を明示的に頼む**（2026-09-13・第101巡）。
 *
 * ★★★**canvas の `ctx.font` への代入は、書体の読み込みを頼まない。**
 *   `next/font` は `preload: false` なので、**誰も `load()` しなければ Anton は
 *   永久に来ない**。しかも `document.fonts.ready` は「**いま頼まれているもの**」
 *   しか待たないので、頼んでいない状態では**即座に解決してしまう**。
 *   → 代替の書体で板を測り、あとから本物が届いて**焼き直すと箱から溢れる**
 *   （ユーザー報告「日付と曜日の文字の上下が見切れてしまっています」）。
 *
 * ★★**先頭の family だけを渡す**（`lib/textFit.ts` の `primaryFamily` の理由）。
 *   スタックごと渡すと *Fallback* で即 resolve して本物を取りに行かない。
 * ★頼む文字は**板に出る字だけ**（数字・スラッシュ・大文字）。
 */
const PLATE_CHARS = "0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** ★★届いたと分かった書体（一度 真 になったら二度と `check` しない）。 */
const wordLoaded = new Set<string>();
export function ensureWordFont(fam: string): Promise<unknown> {
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve();
  try {
    return document.fonts.load(`${WORD_WEIGHT} 64px ${primaryFamily(fam)}`, PLATE_CHARS)
      .then((faces) => { if (faces.length > 0) wordLoaded.add(fam); })
      .catch(() => undefined);
  } catch { return Promise.resolve(); }
}

/** ★その書体で**板の字が本当に描けるか**（＝本物の断片が届いているか）。
 *  ★★遅れて届いたときに**測り直す**ための判定。`lib/textFit.ts` の
 *  `checkFace` と同じ作法で、**先頭の family だけ**を見る。 */
export function wordFontReady(fam: string): boolean {
  // ★★★**覚える**（第131巡）。`document.fonts.check` は和文の断片（数百の
  //   `@font-face`）まで舐めるので重い（実測 … CPU×4 で1回 47ms。山を組む
  //   effect の中で毎回呼んでいた）。届いたものは二度と外れない。
  if (wordLoaded.has(fam)) return true;
  if (typeof document === "undefined" || !document.fonts?.check) return true;
  try {
    const ok = document.fonts.check(`${WORD_WEIGHT} 64px ${primaryFamily(fam)}`, PLATE_CHARS);
    if (ok) wordLoaded.add(fam);
    return ok;
  } catch { return true; }
}

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
  // ★★**`SQUEEZE_AIM`(1) で割る ＝ 潰さない前提で大きさを決める**（第100巡）。
  return Math.max(14, Math.min(max, Math.round((base * room) / widest / SQUEEZE_AIM)));
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
  /**
   * ★★★**黒いピルの面の色**（2026-09-16・第114巡。`undefined` ＝ 面を持たない
   * 「文字そのものが図形」のまま）。★ホームの山だけが渡す（TASK は今までどおり）。
   */
  pill?: string;
  /**
   * ★★★**ホームの日付の板 ＝「帯のピルと同じ作り」**（2026-09-27・第133巡にユーザー承認「**B**」）。
   * 左に墨の円（日にち）、右に2行（曜日／月）、地の面に墨の細い線。`bw`/`bh` は格子の 2×1 マス。
   * ★第130〜133巡の「割れたピル」（`split`・`joinSplitPlate`・`fitSplitPlate`・`SPLIT_EDGE`・
   *   `SPLIT_PAD`）は削除した。復活させない。
   */
  badge?: { num: string; top: string; bottom: string; ground: string };
  /**
   * ★★★**TASK の「自由」のピル**（第135巡にユーザー指定「**自由の文字…もピルにして、図形として落として**」）。
   * 日付の板と同じ作り（地の面・墨の細い線）で、中は語が1つ。字の大きさは日付の板の右の2行と同じ。
   */
  label?: { ground: string };
}

/** ★月の略号（`WD_SHORT` と同じ3文字の語彙）。 */
export const MON_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

/**
 * ★★★**日付の板（B 案）の寸法の比**。**帯のピルの比をそのまま使う**（高さ `BAND_H.photo` 44 の中に
 * 縁 `BAND_BEZEL` 6 を残して丸、丸と字の間 `SPACE.sm`、線 1px）―― だから板の高さが変わっても
 * 帯のピルと同じ形の拡大になる。★字の大きさだけは承認した見本の値（丸に対する比）。
 * ★目盛りの外（絵の寸法）。
 */
const BADGE_BEZEL = BAND_BEZEL / BAND_H.photo;
const BADGE_GAP = SPACE.sm / BAND_H.photo;
const BADGE_EDGE = 1 / BAND_H.photo;
/** ★右の余白 ＝ 帯のピルの右の余白（`SPACE.lg`）の比。第133巡に板を 2×1 へ詰めたときに、半径ぶん空けていたのを改めた。 */
const BADGE_PAD_R = SPACE.lg / BAND_H.photo;
/** 右の2行 … 行の中心は丸の上下の ±1/4、字の高さ（大文字）は 1行ぶん（丸の半分）の 0.74。 */
const BADGE_CAP = 0.74;
/** 丸の中の日にち … 字の高さは丸の 0.46、幅は丸の 0.62 まで。 */
const BADGE_NUM_H = 0.46;
const BADGE_NUM_W = 0.62;

/** ★★ホームの日付の板（`bw`×`bh` ＝ 格子の 2×1 マス）。字は描くときに箱へ合わせて組む。 */
export function badgePlate(
  date: Date, W: number, H: number, ground: string, ink: string,
): WordPlate {
  const num = String(date.getDate());
  const top = WD_SHORT[date.getDay()];
  const bottom = MON_SHORT[date.getMonth()];
  return {
    word: `${top} ${bottom} ${num}`, fs: 0, sx: 1, ink, fam: SANS,
    dx: 0, dy: 0, w: W, h: H, bw: W, bh: H,
    // ★`pill` は「角丸 ＝ 高さの半分のピル」の印（指の当たり判定が読む）。色は線の墨。
    pill: ink, badge: { num, top, bottom, ground },
  };
}

/** ★★TASK の「自由」のピル（`bw`×`bh` ＝ 格子のマス）。字は描くときに箱へ合わせて組む。 */
export function labelPlate(word: string, W: number, H: number, ground: string, ink: string): WordPlate {
  return {
    word, fs: 0, sx: 1, ink, fam: SANS,
    dx: 0, dy: 0, w: W, h: H, bw: W, bh: H,
    pill: ink, label: { ground },
  };
}

/** ★「自由」のピルに要る横のマスの数（語の幅 ＋ 両端の余白。`cells` 個のうち最小）。 */
export function labelCells(word: string, unit: number, cells: readonly number[]): number {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return cells[cells.length - 1];
  const H = unit;
  const cap = ((H - H * BADGE_BEZEL * 2) / 2) * BADGE_CAP;
  const m = fitCap(probe, word, 1e6, cap, LABEL_REF);
  const need = m.width + H * BADGE_PAD_R * 2;
  return cells.find((c) => c * unit >= need) ?? cells[cells.length - 1];
}

/** 語 → 板の寸法。★`GravityTab.makeWordPiece` の前半そのまま。 */
export function measureWordPlate(
  word: string, fs: number, room: number, ink: string, fam: string,
  pad = PLATE_PAD, padY = PLATE_PAD_Y, pill?: string,
): WordPlate {
  const sx = wordSqueeze(word, fs, room, fam);
  const ink0 = inkBoxOf(word, fs, sx, fam);
  // ★★**ピルのときは遊びを「字の高さの比」から出す**（上の `PILL_PAD`）。
  const px = pill ? ink0.h * PILL_PAD : pad;
  const py = pill ? ink0.h * PILL_PAD_Y : padY;
  return {
    word, fs, sx, ink, fam, pill,
    dx: ink0.dx, dy: ink0.dy,
    w: ink0.w, h: ink0.h,
    bw: Math.max(8, ink0.w + px * 2),
    bh: Math.max(8, ink0.h + py * 2),
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
  if (plate.badge) { drawBadgePlate(ctx, plate, x, y, angle); return; }
  if (plate.label) { drawLabelPlate(ctx, plate, x, y, angle); return; }
  const wb = wordBitmap(plate.word, plate.fs, plate.sx, plate.ink, plate.fam,
    plate.w, plate.h, plate.dx, plate.dy, dpr, PLATE_TRACK);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // ★★★**黒いピルの面**（2026-09-16・第114巡）。**角丸は高さの半分**＝
  //   帯のピルとまったく同じ形なので、**同じものが同じ形で居続ける**。
  if (plate.pill) {
    ctx.beginPath();
    ctx.roundRect(-plate.bw / 2, -plate.bh / 2, plate.bw, plate.bh, plate.bh / 2);
    ctx.fillStyle = plate.pill;
    ctx.fill();
  }
  ctx.drawImage(wb.canvas, -wb.w / 2, -wb.h / 2, wb.w, wb.h);
  ctx.restore();
}

/** 字を箱（幅・大文字の高さ）へ収まるいちばん大きな大きさにして返す。 */
/**
 * ★★★**基準の大きさで1回だけ測り、比例で解く**（第135巡）。第134巡までは大きさを変えながら最大5回測って
 * いたが、**和文（「自由」など）は大きさが変わるたびに代わりの書体の準備がやり直しになる**（実測 CPU×4 で
 * 1回 約 100ms。TASK を初めて開いたとき 0.9〜1.0 秒 詰まった）。字の幅と高さは大きさに比例するので、
 * 基準（`CAP_REF`）で測った値を掛けるだけで同じ答えになる。★戻り値は測った値を比例させたもの。
 */
const CAP_REF = 100;
/** ★「自由」の語の大きさを決める代表（ラテンの大文字の高さ）。 */
const LABEL_REF = "FREE";
const refMemo = new Map<string, { w: number; a: number; d: number }>();
const refOf = (ctx: CanvasRenderingContext2D, text: string) => {
  let r = refMemo.get(text);
  if (!r) {
    ctx.font = canvasFont(WEIGHT.heavy, CAP_REF, SANS);
    const m = ctx.measureText(text);
    r = { w: m.width, a: m.actualBoundingBoxAscent, d: m.actualBoundingBoxDescent };
    if (refMemo.size > 400) refMemo.clear();
    refMemo.set(text, r);
  }
  return r;
};
/**
 * @param ref ★★大きさを決める**代表の文字列**（第135巡）。渡すと、大きさは `ref` で決まり、`text` はその大きさで
 *   組む ―― 板ごと・語ごとに大きさが少しずつ違うと、**そのたびに書体の準備が走る**（和文の代わりの書体は
 *   特に重い）。同じ役の字は同じ大きさ（例 … 日にちは "00"、曜日と月は "WED"、「自由」の語は "FREE"）。
 */
function fitCap(ctx: CanvasRenderingContext2D, text: string, maxW: number, capH: number, ref?: string): Pick<TextMetrics, "width" | "actualBoundingBoxAscent" | "actualBoundingBoxDescent"> {
  const base = refOf(ctx, ref ?? text);
  const k = Math.min(maxW / Math.max(0.01, base.w), capH / Math.max(0.01, base.a + base.d));
  // ★★大きさは 0.25px に丸める（描くたびに違う大きさ ＝ 違う書体の準備、にしない）。
  const fs = Math.max(1, Math.round(CAP_REF * k * 4) / 4);
  const q = fs / CAP_REF;
  const r = ref ? refOf(ctx, text) : base;
  ctx.font = canvasFont(WEIGHT.heavy, fs, SANS);
  return { width: r.w * q, actualBoundingBoxAscent: r.a * q, actualBoundingBoxDescent: r.d * q };
}
/** ★書体が遅れて届いたら捨てる（代わりの書体で測った大きさが残らないように）。 */
export function clearWordFits() { refMemo.clear(); }

/** ★★「自由」のピルを描く（日付の板と同じ地・線、字は右の2行と同じ大きさで真ん中に1語）。 */
function drawLabelPlate(
  ctx: CanvasRenderingContext2D, plate: WordPlate, x: number, y: number, angle: number,
): void {
  const l = plate.label;
  if (!l) return;
  const W = plate.bw; const H = plate.bh;
  const e = H * BADGE_EDGE;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.roundRect(-W / 2, -H / 2, W, H, H / 2);
  ctx.fillStyle = l.ground;
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-W / 2 + e / 2, -H / 2 + e / 2, W - e, H - e, (H - e) / 2);
  ctx.lineWidth = e;
  ctx.strokeStyle = plate.ink;
  ctx.stroke();
  const cap = ((H - H * BADGE_BEZEL * 2) / 2) * BADGE_CAP;
  const m = fitCap(ctx, plate.word, 1e6, cap, LABEL_REF);
  ctx.fillStyle = plate.ink;
  ctx.fillText(plate.word, -m.width / 2, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  ctx.restore();
}

/**
 * ★★★**日付の板（B 案）を描く**。帯のピルと同じ版面 ―― 地の面・墨の細い線・左に墨の丸・
 * 右に2行。★丸の中の日にちは紙の字、右の2行は墨の字（どちらも `SANS` の `WEIGHT.heavy`）。
 */
function drawBadgePlate(
  ctx: CanvasRenderingContext2D, plate: WordPlate, x: number, y: number, angle: number,
): void {
  const b = plate.badge;
  if (!b) return;
  const W = plate.bw; const H = plate.bh;
  const e = H * BADGE_EDGE;
  const bezel = H * BADGE_BEZEL;
  const D = H - bezel * 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.roundRect(-W / 2, -H / 2, W, H, H / 2);
  ctx.fillStyle = b.ground;
  ctx.fill();
  // ★線は内側に引く（`EDGE` と同じ作法）。
  ctx.beginPath();
  ctx.roundRect(-W / 2 + e / 2, -H / 2 + e / 2, W - e, H - e, (H - e) / 2);
  ctx.lineWidth = e;
  ctx.strokeStyle = plate.ink;
  ctx.stroke();
  const cx = -W / 2 + bezel + D / 2;
  ctx.beginPath();
  ctx.arc(cx, 0, D / 2, 0, Math.PI * 2);
  ctx.fillStyle = plate.ink;
  ctx.fill();
  const mid = (m: { actualBoundingBoxAscent: number; actualBoundingBoxDescent: number }) => (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  ctx.fillStyle = b.ground;
  const mn = fitCap(ctx, b.num, D * BADGE_NUM_W, D * BADGE_NUM_H, "00");
  ctx.fillText(b.num, cx - mn.width / 2, mid(mn));
  ctx.fillStyle = plate.ink;
  const x0 = cx + D / 2 + H * BADGE_GAP;
  const room = W / 2 - H * BADGE_PAD_R - x0;
  // ★2行は同じ大きさ（長いほうで測る）。
  const longer = b.top.length >= b.bottom.length ? b.top : b.bottom;
  const m = fitCap(ctx, longer, room, (D / 2) * BADGE_CAP, "WED");
  ctx.fillText(b.top, x0, -D / 4 + mid(m));
  ctx.fillText(b.bottom, x0, D / 4 + mid(m));
  ctx.restore();
}
