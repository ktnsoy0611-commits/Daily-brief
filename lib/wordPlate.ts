import type { Body } from "matter-js";
import { canvasFont, primaryFamily } from "./textFit";
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
   * ★★★**「割れたピル」**（2026-09-24・第130巡にユーザー承認「**日付と曜日は C 案**」）。
   * 左 ＝ 墨の面に紙の字（曜日）／右 ＝ 紙の面に墨の字（日付）が**1本のピル**に繋がり、
   * 外周を墨の縁 `SPLIT_EDGE` が巡る。★2枚の板を**1つの物体**にする（第114〜129巡は
   * 別々の2体だった）。★`bw`/`bh` は2つの和と大きいほう、`pill` は外周の墨。
   */
  split?: { left: WordPlate; right: WordPlate };
}

/**
 * ★割れたピルの外周の縁の太さ（**板の高さに対する比**）。★目盛りの外（絵の寸法）。
 * ★承認した見本（高さ 72px に縁 4px）と同じ比。生の px にしないのは、混んだ日に
 *   板ごと縮めても（`pileWorld.platesAt`）縁と字の関係が動かないため。
 */
export const SPLIT_EDGE = 0.055;

/** ★★2枚の板 → 割れたピル1枚（`measureWordPlate` で測った2枚を渡す）。 */
export function joinSplitPlate(left: WordPlate, right: WordPlate): WordPlate {
  const bh = Math.max(left.bh, right.bh);
  return {
    word: `${left.word} ${right.word}`, fs: left.fs, sx: 1, ink: left.ink, fam: left.fam,
    dx: 0, dy: 0, w: left.bw + right.bw, h: bh,
    bw: left.bw + right.bw, bh,
    pill: left.pill ?? right.pill, split: { left, right },
  };
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
  if (plate.split) { drawSplitPlate(ctx, plate, x, y, angle, dpr); return; }
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

/**
 * ★★★**割れたピルを描く**（第130巡）。外周を墨で塗り、縁のぶん内側へ寄せたピルで
 * 切り抜いて**右の半分だけ紙**を敷く ―― 縁が左右で1本に繋がる（2枚を並べて描くと
 * 継ぎ目に縁が二重に出る）。字は**それぞれの半分の中心**へ置く。
 */
function drawSplitPlate(
  ctx: CanvasRenderingContext2D, plate: WordPlate,
  x: number, y: number, angle: number, dpr: number,
): void {
  const sp = plate.split;
  if (!sp) return;
  const { bw, bh } = plate;
  const e = bh * SPLIT_EDGE;
  const x0 = -bw / 2;
  const mid = x0 + sp.left.bw;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
  ctx.fillStyle = plate.pill ?? sp.right.ink;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-bw / 2 + e, -bh / 2 + e, bw - e * 2, bh - e * 2, bh / 2 - e);
  ctx.clip();
  ctx.fillStyle = sp.left.ink;           // ★右の面 ＝ 左の字の色（紙）
  ctx.fillRect(mid, -bh / 2, bw / 2 - mid + e, bh);
  ctx.restore();
  for (const [pl, cx] of [[sp.left, x0 + sp.left.bw / 2], [sp.right, mid + sp.right.bw / 2]] as const) {
    const wb = wordBitmap(pl.word, pl.fs, pl.sx, pl.ink, pl.fam,
      pl.w, pl.h, pl.dx, pl.dy, dpr, PLATE_TRACK);
    ctx.drawImage(wb.canvas, cx - wb.w / 2, -wb.h / 2, wb.w, wb.h);
  }
  ctx.restore();
}
