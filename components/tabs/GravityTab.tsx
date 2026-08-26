"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Body, Engine, World } from "matter-js";
import { DemoSeedButton } from "@/components/tasks/TaskAddButton";
import { aimTargets, DropTargets, fireTarget, targetAt, type DropTarget } from "@/components/tasks/DropTargets";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { ymd } from "@/components/tasks/WhenSheet";
import { haptic } from "@/lib/helpers";
import { rectOf, sectionOutline, type SolidSpec } from "@/lib/solid";
import { clearSolidBitmaps, peekSolidBitmap, shapeBounds, shapeGlyphsReady, solidBitmap, warmShapeGlyphs, wordBitmap, WORD_WEIGHT, type SolidPaint, type SolidView } from "@/lib/solidPaint";
import { canvasFont, onFontsReady, primeAdvances } from "@/lib/textFit";
import { allTagFaces, allTagLabels, resolveTag, tagColor, tagInk } from "@/lib/taskTags";
import { demoTasks } from "@/lib/taskDemo";
import { areaOf, daysUntil, dropOrder, massOf, specOf } from "@/lib/taskSize";
import { INK, LATIN, MUTED, NAV_H, navHeightPx, RUST, SANS, SWISS_XL, SECOND } from "@/lib/constants";
import { ms, T_IN, T_ITEM, T_OUT } from "@/lib/motion";
import { flick, flickStep, flickThrow, type Flick } from "@/lib/scroll";
import { D_SETTLE, K_SETTLE, K_TRAVEL, settled, spring, springTo, type Spring } from "@/lib/spring";
import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import type { AppState, TabProps, Task } from "@/lib/types";

// ★タスクタブ(GRAVITY)。**タスク図形は常にこの空間にだけ在る**(第52巡)。
//   ・pile     … 既定。重力で落ちて積まれる。**長押しで掴んで運べる**。
//   ・align    … 左端→右で、左に円弧・右に円弧へ沿う文字。
//   ・timeline … 下→上で、地面から曜日が伸び、**本物の重力で**各曜日の列へ落ちる。
//
// ★★★第55巡の作り直し(実機で「モーションがチープ」)。
//  1. **動きの土台をバネへ**(`lib/spring.ts`)。「経過時間÷持ち時間」を三次カーブに
//     通す作りは、**全部が同時に始まって同時に止まる**ので安っぽい。バネは位置と
//     速度を持つので、粘り・慣性・収束が勝手に出る。
//  2. **TIMELINE はアニメーションをやめ、本物の落下**にした。指は**合図**だけ
//     (曜日が伸びる)で、あとは matter.js の重力。床が抜け→山が落ち→下から出た
//     図形をその日の列の真上へ引き上げて離す→レーンの床と壁に**積み上がる**。
//  3. **掴みは velocity 駆動**。`setStatic`＋瞬間移動だと他の図形をすり抜ける。

/** 図形の1単位を何pxで描くか。 */
const UNIT = 64;
const MASS_K = 1.6;
/** ★★第62巡に**山全体をもう一段小さく**(「日付と曜日の板が入って窮屈」)。
 *  ★★★下げるのは **`SCALE_MAX` と `FIT_*`**(＝1つの図形の大きさの上限)であって、
 *  **`FILL` ではない**。`FILL` は「何個ぶんの面積を置けるか」なので、下げると
 *  `pileOf` が `SCALE_MIN` に当たって**タスクを間引いてしまう** ―
 *  小さくなるのではなく**減る**(第62巡に踏んだ。0.58→0.46 で7個が3個になった)。
 *  間引きを増やさずに小さくするには `SCALE_MIN` も一緒に下げること。 */
const FILL = 0.52;
const SCALE_MIN = 0.50;
const MASTHEAD_H = 124;
/** ★★★場の**上下の端だけ**を地色へ溶かす幅(2026-08-26・第67巡)。
 *  第66巡までは矩形で切っていたので、切り口が**題字の下・タブバーの上の
 *  何も無い地色の上**に出て、線として見えていた(実測: 下の切り口 y=684 に対し
 *  タブバーの上端は 716 ―「開けた場所」で切っていた)。
 *  ★これは第65巡に撤去した「霧」とは別物 ― あちらは**焦点からの距離**で薄くして
 *  読みたい行を隠していた。これは**画面の端**でだけ薄くするので、消えるのは
 *  「もう画面の外」の行だけ。
 *  ★★DOM(`.mode-panel` のマスク)と canvas(`destination-out`)の**両方**がこの値を
 *  読む ― 出どころを2つにすると図形と文字の消え方が食い違う。 */
const EDGE_FADE = SPACE.xl;
const FIT_W = 0.78;
const FIT_H = 0.56;
const SCALE_MAX = 1.15;
/** ★★★山が使える左右の内寸(2026-08-25・第62巡にユーザー指定
 *  「箱の左右の幅を狭めて、タブバーや他のレイアウトと統一して」)。
 *  ★★第67巡に **32 → 16** へ戻した(ユーザー指定「タイトルの左端に合うくらいまで
 *  幅を広く戻してください」)。第62巡の注記「canvas は full-bleed で左右 16px ずつ
 *  広いので canvas 座標では 32px」は**誤り**だった ― `.full-bleed` は親の 16px の
 *  パディングを打ち消すだけなので、**canvas は 0..390 ＝ 画面そのもの**。
 *  実測: 山の塗りが 33..357 に対し、題字の左端は 16 だった。
 *  ★**左右の出どころはここだけ** — 壁も、湧く x も、`pileOf` に渡す幅も全部これを通す。 */
const PILE_INSET = SPACE.lg;
/** 山が使える幅(canvas の幅から左右の内寸を引いたもの)。 */
const pileWOf = (w: number) => Math.max(80, w - PILE_INSET * 2);
const SCALE_EPS = 0.02;
const PHYS_VERTS = 12;
/** ★当たり判定を見た目より外側へ出す量(px)。図形どうしのあいだに髪の毛ほどの
 *  地色を残すため(第63巡にユーザー指定「ほんの 0.1 ミリくらい外側に」)。 */
const HAIR = 1.5;
const BAKE_BUDGET = 1;
const GLYPH_BUDGET = 4;
const CULL_PX = 30;
/** ★地面をタブバーの上端からどれだけ浮かせるか(2026-08-25・第57巡にユーザー確定
 *  「地面が低すぎる」)。★**床の位置の出どころはここだけ** — `fieldOf` も
 *  `rebuildWalls` もこれを通す(数字を二重に持たない)。 */
const GROUND_LIFT = SPACE.xxl;
const floorYOf = (h: number) => h - navHeightPx() - GROUND_LIFT;
/** ★曜日の帯(DOM)の下端。**物理の床と同じだけ**上げないと、図形が帯から浮いて
 *  積まれる(第57巡に地面を上げたとき踏んだ)。`bandTopY()` と対。 */
const BAND_BOTTOM = `calc(${NAV_H} + ${SPACE.xl + GROUND_LIFT}px)`;

type Mode = "pile" | "align" | "timeline";
/** 段取りの局面。null = 物理／落ち着いている。 */
type Phase = "align-in" | "align-out" | "tl-out" | null;

const EDGE_PX = 30;
const SWIPE_PX = 44;
const TAP_MOVE = 8;
const AXIS_PX = 8;
const HOLD_MS = 150;
/** ★掴んだ図形を指へ運ぶ強さ(velocity 駆動)と速さの上限。 */
const GRAB_K = 0.34;
const GRAB_MAX = 34;
/** 山とタイムラインの重力。★掴んでいる間だけ 0 にする(第58巡)。 */
const GRAVITY_Y = 1.4;

// ALIGN … 左の円弧
/** ★★焦点の図形の最大寸法(焦点以外はここから縮む)。
 *  ★★★**高さは行の間隔より小さくすること。** 非焦点は `PITCH_TIGHT`(88) の間隔に
 *  0.75 倍で並ぶので、`H × 0.75` が 88 を超えると**図形どうしが重なる**
 *  (第65巡の1回目は H=176・間隔 64 で派手に重なっていた)。104 × 0.75 = 78 < 88。
 *  ★幅は**右の文字の場所を決める**(下の `ARC_APEX_X` / `TEXT_GAP`)。小さくするほど
 *  題が長く入る。ユーザー指定「図形を少し小さくして、左に寄せて、右に文字の場所を作る」。 */
const ALIGN_MAX_H = 104;
const ALIGN_MAX_W = 116;
/** ★★非焦点の倍率は `1/(1+BOOST)`。0.33 ＝ **0.75倍**(第65巡にユーザー確定
 *  「差を小さくして全体を大きく」)。第64巡は 1.25 ＝ 0.444倍で、左半分がスカスカだった。
 *  ★霧を消したので、遠近の手がかりは**この大きさの差だけ**になる。小さくしすぎないこと。 */
const FOCUS_BOOST = 0.33;
/** ★★図形と文字のあいだ。**当て推量をやめて、図形の半分＋余白から出す**(第65巡)。
 *  焦点では文字の左端が `ARC_APEX_X + TEXT_GAP` に来るので、これが図形の半幅より
 *  小さいと**文字が図形に重なる**(第65巡の1回目で実際に重なった)。 */
const TEXT_GAP = ALIGN_MAX_W / 2 + SPACE.lg;
/** ★円弧の焦点の x。**画面の左端から `SPACE.lg` を空ける**(図形の半分ぶん右)。 */
const ARC_APEX_X = SPACE.lg + ALIGN_MAX_W / 2;
/** ★円弧を**ほとんど見せない**ための、場の上端での x のずれ(px)。
 *  ここから半径が決まる(`arcGeom`)。大きくすると弧が目立ち、小さくすると直線に近づく。
 *  ★ユーザー指定「円弧の部分はほとんど見えなくても良い」(第65巡の2回目)。 */
const ARC_SWING = SPACE.xxl;
/** ★★焦点を場のどの高さに置くか。**固定値**であること。
 *  ★★★第65巡の1回目はここをスクロール位置の関数にして**スクロールを壊した**
 *  (`arcGeom` の注を見ること)。レイアウトの原点を中身から決めてはいけない。
 *  ★★第67巡にユーザー指定「フォーカスされる中央のタスクの位置が上すぎます。
 *  画面の真ん中あたりにくるように下げてください」→ 0.32 から **0.5**（場の中央）へ。
 *  先頭に居るときは上に行が無いので上半分が空くが、それは「いま先頭に居る」という
 *  正しい情報であり、焦点が画面の中央に据わることの方が優先される。 */
const ARC_MID = 0.5;
/** DOM の行の**箱の高さ**(中身を上下中央に置くための器)。
 *  ★間隔の役目は持たない(下の PITCH_* が持つ)。2行のタイトル＋その下の一段が入る。 */
const ROW_H = SPACE.xxl * 3;
/** ★★行の間隔。**詰めたうえで、中央の上下だけ空ける**(第56巡にユーザー指定)。
 *  円弧に沿った長さを `L(d) = TIGHT·d + SPREAD·d/√(1+d²)` で置く。
 *  `d/√(1+d²)` は原点で傾きが最大なので、隣り合う間隔が**中央でだけ広くなる**:
 *    中央↔隣 142 / 隣↔2つ隣 77 / 2↔3 61 / それ以遠 54。
 *  `d` は連続値なので、指で回している間もこの式のまま滑らかに動く。 */
/** ★★行の間隔。焦点↔隣は **116px**、遠くの行は **88px**(第65巡の2回目)。
 *  ★1回目は 81/64 まで詰めて**詰めすぎ**だった(ユーザー指摘「中心のタスクとその上下は
 *  もう少し空けて / 全体的に詰めすぎ」)。**図形が重ならない下限**でもある(上の注)。
 *  ★★★`PITCH_TIGHT` は**行の高さ(題＋帯 ≒ 50px)より大きく**すること。 */
const PITCH_TIGHT = 88;
const PITCH_SPREAD = 40;
const arcLen = (d: number) => PITCH_TIGHT * d + PITCH_SPREAD * (d / Math.sqrt(1 + d * d));
/** ★★★スクロールの「1つぶんの距離」。**`arcLen` の焦点での傾き**であって
 *  `PITCH_TIGHT` ではない(2026-08-26・第63巡)。
 *  `arcLen'(d) = PITCH_TIGHT + PITCH_SPREAD·(1+d²)^(-3/2)` なので、焦点(d=0)では
 *  `PITCH_TIGHT + PITCH_SPREAD`。第62巡までは `PITCH_TIGHT` を渡していたので、
 *  **画面はその 3 倍動いていた**(遠い行ほど `PITCH_TIGHT` に近づくため、体感では
 *  「指の 1.2 倍くらい」に見えた ― ユーザー指摘)。ここを通せば**焦点の行が指と
 *  1:1** で動く。 */
const ARC_RATE = PITCH_TIGHT + PITCH_SPREAD;
/** `arcLen` の傾き(番号 `d` の所での1つぶんの距離)。 */
const arcRate = (d: number) => PITCH_TIGHT + PITCH_SPREAD * Math.pow(1 + d * d, -1.5);
/**
 * ★★★**道のり(px) → 番号**。`arcLen` は単調なのでニュートン法で戻せる。
 *
 * これが要るのは、**円弧の間隔が場所によって違う**から。焦点のそばは広く
 * (`PITCH_TIGHT + PITCH_SPREAD`)、離れると狭い(`PITCH_TIGHT`)。だから
 * 「1つぶん＝一定の px」として指の動きを番号へ換算すると、**長く払うほどズレる** —
 * 第62巡は `PITCH_TIGHT`(54) で換算していたので**画面が指の 1.2 倍動き**
 * (ユーザー指摘)、焦点の傾きに直すと今度は 0.78 倍しか動かなかった。
 *
 * ★**指の累積の道のりをそのまま番号へ戻す**のが唯一の正解で、こうすると
 * **図形は払った距離ぶんきっかり動く**(文字は円弧の外側に居るぶんだけ多く動く ―
 * これは円弧という形そのものの帰結で、直せるものではない)。
 */
function arcInv(s: number): number {
  if (s === 0) return 0;
  const sign = s < 0 ? -1 : 1;
  const a = Math.abs(s);
  let d = a / ARC_RATE;                       // 焦点の傾きを初期値に
  for (let k = 0; k < 5; k += 1) d -= (arcLen(d) - a) / arcRate(d);
  return sign * Math.max(0, d);
}
/** ★★連鎖の減衰。焦点からの距離ぶんだけ**やわらかく**なるので、中央の間隔がまず
 *  縮み、それに次が追い、さらに次が追う ― という伝わり方になる(第58巡にユーザー指定)。
 *  ★★★第61・62巡に**続けて控えめへ**(「間隔が遅れて追従するモーションも控えめに」)。
 *  0.72^6 = 0.14 だと外の行が柔らかすぎて、払うたびに全部が寄り集まって見えた。
 *  0.93^3 = 0.80 なら、伝わる順番は残ったまま、詰まりはほとんど目に立たない。 */
/** ★★焦点の行の硬さ。指に**1:1**で付いてくる強さ(数フレームで着く)。 */
const CHAIN_K = 0.34;
/** 1つ離れるごとにこの割合だけやわらかくなる。3つ離れると `K_TRAVEL` まで落ちる。 */
const CHAIN = 0.36;
/** ★第67巡に 3 → 2。3 だと遠い行の硬さが焦点の 1/21 になり、
 *  吸着のあと**行が一斉に着かず**「ガクガク」に見えていた。 */
const CHAIN_MAX = 2;
/** 減衰は臨界(`2√k`)のこの割合。1 未満なので**わずかに行き過ぎて**慣性が出る。 */
const D_CHAIN = 0.86;
/** 硬い側で減衰が効きすぎて重くならないよう頭打ちにする。 */
const D_CHAIN_MAX = 0.9;
/** ★★★連なりの間隔は**等間隔**(2026-08-26・第64巡)。第63巡までは
 *  `LEAD_GAP · GAP_DECAY^i` の**等比級数**で、150 / 258 / 336 / 392 / 432 / 461 /
 *  482 / 497 … と 536 へ収束していた ― **7番目以降は数ミリ秒差でしか出発しない**。
 *  そこへ下の `streamQ` の頭打ちが重なって、後ろの図形は**出発時刻も道も緩急も同一**に
 *  なり、**右上で重なってぐちゃぐちゃ**になっていた(ユーザー指摘)。
 *  等間隔にすれば、下の `flow`(加速しっぱなし)と組んで**進むほど間隔が開く**。 */
const STREAM_STEP = 64;
/** ★★出ていく**1本の道**(第57巡)。第55巡は図形ごとに別々のベジエを引いて蛇行させて
 *  いたので、**一筋にまとまる瞬間が構造的に無かった**(ユーザー指摘「結局バラバラに
 *  画面外にいってしまう」)。全部が同じ道を通り、道の上の間隔が揃っていく。 */
const STREAM_MS = ms(T_IN);
/** ★閉じは**入りよりさらに素早く**(第64巡にユーザー指定「もう少し早くして」)。
 *  語彙の時間から引く(第63巡の `ms(T_OUT)`=600 → `ms(T_ITEM)`=420)。 */
const OUT_MS = ms(T_ITEM);
/** ★閉じの連なりの遅れは、入りの半分の詰まり具合で。 */
const OUT_LEAD = 0.5;
/** ★★閉じで**山が落ち始める**進み(第64巡にユーザー指定「落ち始めるのも早めて」)。
 *  ここまで来れば図形は `homeAt(0.55)` ＝ x ≒ 12 - 0.507·w で**画面の左の外**に
 *  居るので、落ちてくる山と二重に見えることはない。 */
const OUT_DROP = 0.55;
/** 円弧の入口で番号を頭打ちにする所(同じ点から一斉に上がると団子になるが、
 *  番号をそのまま使うと後ろほど**はるか下**から入って大きく回り込む)。 */
const ENTRY_Q_MAX = 4;
/** ★スクアッシュ＆ストレッチ。この速さ(px/フレーム)で伸びが最大 `SQUASH_MAX` になる。
 *  ★★第59巡に**0.2 倍**へ(「強調しすぎ」)、第60巡に**もう一段弱く**
 *  (「入る時もスクロールの時ももう少し弱めて」)。**速いときにだけ、ほのかに** —
 *  止まっている図形に何も起きないことが上品さの条件。 */
const SQUASH_REF = 48;
/** ★第64巡に 0.05 → 0.09(ユーザー指定「スクイーズも後半だけ少し強めに」)。
 *  ★**後半だけ**は数字ではなく `flow` が作る ― 加速しっぱなしの曲線では
 *  速さの山が終盤に来るので、速さ由来のこの伸びは勝手に後半へ寄る。 */
const SQUASH_MAX = 0.09;
/** スミアー(残像)。この速さを超えたら後ろへ `SMEAR_N` 枚、`SMEAR_LEN` の間隔で薄く。 */
const SMEAR_MIN = 22;
const SMEAR_N = 2;
const SMEAR_LEN = 0.40;
const SMEAR_A = 0.05;
/** 入りのバネの減衰。★`D_TRAVEL` より弱いので**一度行き過ぎてから**戻る。 */
const D_IN = 0.12;
/** 入りの待ち行列。円弧の**下に並んで**から順に上がる(px。同じ点から一斉に
 *  上がると入口で団子になる)。 */
const ENTRY_QUEUE = 74;
/** ★★★2段目(円弧へ上がる)へ渡す所。**進みで決める**(2026-08-26・第64巡)。
 *  第63巡までは**時刻**(`STREAM_MS · 0.72`)で切っていて、これは第60巡の `cine` の
 *  形(`cine(0.72)` ≒ 0.94 ＝ ほぼ画面外)を前提にした数字だった。第63巡に緩急を
 *  `t²` 寄りへ変えたとたん、同じ時刻の進みが **0.52 ＝ まだ画面の真ん中**になり、
 *  「**図形が画面から出る前に消える**」(ユーザー指摘)になった。
 *  進みで決めれば、曲線をどう変えても**必ず道の終点＝画面の外**で渡る。 */
const HANDOFF_N = 0.96;
/** 自分の居た場所から**筋へ合流**しきる進み。 */
const MERGE = 0.45;

// TIMELINE
const LANES_VISIBLE = 3;
const HORIZON = 14;
const LANE_HEAD_H = 92;
/** 指で引き上げ切るまでの距離(px)と、床が抜ける合図の位置。 */
const TL_SPAN = 240;
const TL_TRIGGER = 0.45;
const TL_FLAT = 0.04;
/** ★★1 を超えて**引っ張れる**(第56巡にユーザー指定)。超えたぶんは重くなり、
 *  `TL_STRETCH` へ漸近する。離すとバネで規定(1)へ戻る。 */
const TL_STRETCH = 1.9;
/** 曜日の幅の軸(Archivo)。★細くすると**同じレーン幅でより大きく**でき、
 *  変形せずに「少し縦長」になる(第56巡にユーザー確定。★第59巡に 75 → 58)。 */
const WD_WDTH = 58;
/** 上の幅での1文字あたりの送り(em)。`laneFs` を決めるのに使う。 */
const WD_ADV = 0.54;
/** レーン幅に対する図形の大きさ。★第55巡に大きく(0.86→0.94)。 */
const TL_FILL = 0.94;
/** レーンの壁の厚み。★境目の**上に**置くので、レーンの内寸は `laneW - WALL_T`。
 *  図形をこれより大きくすると壁に挟まって宙に浮く(第56巡)。 */
const WALL_T = 16;
/** レーンの内寸(図形が実際に入れる幅)。 */
const laneInner = (laneW: number) => Math.max(24, laneW - WALL_T);
/** 下へ出た図形を引き上げる高さ。 */
const RECYCLE_Y = 150;
/** ★当たり判定の層。**落ちていく途中の図形はレーンの器をすり抜ける**。
 *  そうしないと、床を抜いた瞬間に山がその場でレーンの床に受け止められてしまい、
 *  「落ちながら、上から曜日ごとに振り分けられる」が起きない(第55巡)。 */
const CAT_WALL = 0x0001;   // 画面の左右の壁と山の床
const CAT_FALL = 0x0002;   // まだ振り分けられていない、落下中の図形
const CAT_LANE = 0x0004;   // レーンの床と仕切り
const CAT_HELD = 0x0008;   // レーンに収まった図形
const FILTER_FALL = { category: CAT_FALL, mask: CAT_WALL | CAT_FALL };
const FILTER_LANE = { category: CAT_LANE, mask: CAT_HELD };
/** ★「自由」の板も**これ**(＝図形とまったく同じ普通の物体)。第61巡は板だけ
 *  「仕切りをすり抜けて床とだけ当たる」層に逃がして大きさを取ったが、
 *  **隣の板とも仕切りとも当たらなくなり、境界を越えて転がった**(第62巡の写真)。
 *  大きさは `freeGeom` が**対角から**決めるので、噛むことはもう無い。 */
const FILTER_HELD = { category: CAT_HELD, mask: CAT_LANE | CAT_HELD };
/** 山に居るときの層(既定に戻す)。 */
const FILTER_PILE = { category: CAT_WALL, mask: 0xFFFFFFFF };
/** ★層を変える。**`parts` にも入れる** — `Bodies.fromVertices` が作る複合の body は
 *  当たり判定を各 part の `collisionFilter` で見るので、親だけ書いても効かない。 */
function setFilter(b: Body, f: { category: number; mask: number }) {
  for (const part of b.parts) part.collisionFilter = { ...part.collisionFilter, ...f };
  b.collisionFilter = { ...b.collisionFilter, ...f };
}
/** 横の投げをどれだけ先まで伸ばしてからレーンを決めるか。 */
const WORLD_FLING = 9;
/** 曜日を開いたときの隙間(詳細の文字が入る)と、左端の余白。 */
const GAP_W = 232;
/** 詳細のパネルの幅(隙間から左右の余白を引いたもの)。★出どころはここだけ。 */
const DETAIL_W = GAP_W - SPACE.lg * 2;
/** 日の見出し(日付＋件数＋罫)の高さ。行はここへ重ねない。 */
const DETAIL_HEAD_H = SPACE.xxl;
const PAD_L = 20;

/** ★★縦のスワイプ ―**向きで行き先が決まる**(第61巡にユーザー確定)。
 *    上 … TIMELINE(地面から曜日が指に連れて伸びる。**どこから払っても**同じ)。
 *    下 … **DRIFT へ移る**(候補の層は山の**上**に在るので、指で世界を下へ送ると
 *          そこへ上がる)。
 *  ★第60巡は上を「地面際=TIMELINE / それ以外=DRIFT」と割ったが、向き自体が
 *  逆だった(ユーザー指摘)。切り分けは要らない。
 *  ★★★第62巡に**吹き飛ばしをやめた**。DRIFT へ移るのは**カメラのパン**
 *  (`components/tasks/TaskSpace.tsx`)で、**物の側は動かない** ― 図形は地上に
 *  置いたまま、カメラが上空へ上がる。効果線もそちらが持つ。
 *  ユーザー指摘「画面がパンせずにそのまま切り替わってしまっている」の正体は、
 *  **図形しか動いていなかった**こと。第60〜61巡の `WARP_*` は全部撤去した。 */

const WD3 = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
/** ★GRAVITY の山へ落とす曜日は**綴りのまま**(第60巡にユーザー指定「曜日の英語」)。
 *  TIMELINE の3文字は列の見出しで、こちらは山に転がる一枚の板 ― 役が違う。 */
const WD_FULL = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
/** 山の文字ブロックの**字を組む幅**(山の内寸に対する割合)。高さは塗りから決まる。 */
const PILE_WORD_W = 0.66;
/** ★山の板の遊びは**「自由」より小さく**(第63巡にユーザー指摘「日付の図形の
 *  当たり判定が文字に対して少しだけ大きい」)。`8/26` のような短い語では、
 *  `FREE_PAD`(8)/`FREE_PAD_Y`(4) だと塗りに対して箱が目に見えて大きい。 */
const PILE_WORD_PAD = 4;
const PILE_WORD_PAD_Y = 2;

/** ★★タスクが無い日に落とす「自由」のブロック(2026-08-25・第56巡にユーザー確定)。
 *  タスクの図形が「色の面＋載った文字」なのに対して、これは**文字そのものが図形**。
 *  日付から選ぶので**同じ日はいつも同じ語**になる。 */
const FREE_WORDS = ["FREE", "自由", "LIBRE", "FREI", "LIBERO", "LIVRE", "VRIJ", "FRI", "VAPAA", "VOLNY"] as const;
const freeWordOf = (dateKey: string) => FREE_WORDS[Math.floor(frac(dateKey + "free") * FREE_WORDS.length) % FREE_WORDS.length];
/** ★★★「自由」の板がレーンに収まるための余白(第62巡)。
 *  板は**回る**ので、条件は「**対角**がレーンの内寸に収まる」。字面はここから
 *  逆算するので、幅の割合(`FREE_FILL`)という持ち方は**やめた**。
 *  第61巡は仕切りをすり抜けさせて大きさを取ったが、隣の板とも当たらなくなり、
 *  **境界を越えて転がった**(ユーザーの写真)。ユーザー確定で
 *  「**小さくしてでも必ず収める**」＝ 物理は図形とまったく同じに戻す。 */
const FREE_MARGIN = 8;
/** 横に詰めてよい下限(これ以上は潰さない)。 */
const FREE_SQUEEZE = 0.50;
/** 板の遊び。★**縦は横の半分**(第62巡) — 板を平たくするほど「寝る」のが
 *  安定な姿勢になり、短い辺で立ったまま止まりにくい。字はもともと横長なので、
 *  縦の遊びを削っても窮屈には見えない。 */
const FREE_PAD = 8;
const FREE_PAD_Y = 4;

interface Shard { x: number; y: number; vx: number; vy: number; r: number; life: number; fill: string }
const SHARD_MS = 620;

interface Piece {
  id: string; body: Body; spec: SolidSpec; paint: SolidPaint;
  girth: number; ox: number; oy: number; unit: number;
  /** TIMELINE でどの日の列に属するか(-1 = 無し)。 */
  lane: number;
  /** ★「自由」のブロック … タスクではなく**文字そのものが図形**。
   *  これを持つ図形は色の面を敷かず、たたいても入力画面を開かない。 */
  word?: string;
  /** `word` を描く字の大きさ(px)と、板の幅へ収める横の詰めと、字の色。 */
  wordFs?: number;
  wordSx?: number;
  wordInk?: string;
  /** ★塗りの中心が原点からどれだけずれているか(描くときに引く)。 */
  wordDx?: number;
  wordDy?: number;
  /** ★書体 … 日付・曜日は `LATIN`、「自由」は `SANS`(`自由` は Archivo にグリフが無い)。 */
  wordFam?: string;
  /** 塗りの箱(焼く絵の大きさ)。 */
  wordW?: number;
  wordH?: number;
}
interface Item { id: string; task: Task; paint: SolidPaint; spec: SolidSpec; tag: string }
/** ★★ALIGN で**図形と一緒に飛んでいくだけ**の文字ブロック(第61巡)。
 *  日付・曜日の板は円弧のスロットを持たない(タスクではない)ので、道を走り切ったら
 *  そこで描くのをやめる。第60巡はモードが変わった瞬間に消えていた(ユーザー指摘)。 */
interface Fly {
  word: string; fs: number; sx: number; dx: number; dy: number; fam: string; ink: string;
  bw: number; bh: number;
  from: { x: number; y: number; a: number };
}
/** ALIGN で絵を置く場所。x/y は**絵の中心**。 */
interface Slot { x: number; y: number; s: number; a: number; o: number }

const paintOf = (t: Task, view: SolidView): SolidPaint => ({
  spec: specOf(t), view, title: t.title,
  tag: resolveTag(t.tag, t.id, t.title, t.context, t.belongings, t.note),
});

const sameShape = (a: SolidSpec, b: SolidSpec) =>
  a.sides.length === b.sides.length
  && Math.abs(a.w - b.w) < 1e-6 && Math.abs(a.h - b.h) < 1e-6;

function daysLabel(dueDate: string | undefined, today: Date): { text: string; sub: string; kind: "num" | "word" } {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { text: "SOMEDAY", sub: "", kind: "word" };
  const d = daysUntil(dueDate, today);
  if (d < 0) return { text: "OVER", sub: "", kind: "word" };
  if (d === 0) return { text: "0", sub: "TODAY", kind: "num" };
  return { text: String(d), sub: d === 1 ? "DAY" : "DAYS", kind: "num" };
}
/** 土日か(縦線の地色に使う)。 */
function isWeekend(dateKey: string): boolean {
  const [y, m, d] = dateKey.split("-").map(Number);
  const w = new Date(y, m - 1, d).getDay();
  return w === 0 || w === 6;
}
function weekdayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return WD3[new Date(y, m - 1, d).getDay()];
}
const monthDayOf = (dateKey: string) => {
  const [, m, d] = dateKey.split("-").map(Number);
  return `${m}/${d}`;
};

/** ★指の引き上げ。1 までは素直に、**1 を超えたぶんは重く**なって `TL_STRETCH` で
 *  頭打ち(ゴムを引く手ざわり)。 */
function rubberRise(raw: number): number {
  if (raw <= 1) return Math.max(0, raw);
  const over = raw - 1;
  const room = TL_STRETCH - 1;
  // 1 の所で傾き 1(＝継ぎ目が無い)、引くほど重くなって TL_STRETCH へ漸近する。
  return 1 + (room * over) / (over + room);
}

/**
 * ★★★出ていく緩急は**加速しっぱなし**(2026-08-26・第64巡にユーザー指定
 * 「最初はゆっくりで、だんだん加速しながら」)。
 *
 * 第57〜63巡は `cine(t) = t³/(t³+(1-t)³)`(遅→速→遅)だった。両端で傾きが 0 になる
 * この形は**先頭の1つ**には気持ちよく決まるが、**全員が出口で減速する**ので、
 * 後ろの図形が右上に溜まって重なった(ユーザー指摘)。第63巡は「後ろほど `t²` を
 * 混ぜる」で誤魔化したが、混ぜ具合が図形ごとに違うぶん**進みと時刻の対応が
 * 図形ごとにずれ**、引き渡しの時刻(当時 `A_HANDOFF`)が合わなくなって
 * 「画面から出る前に消える」を生んだ ― 対症療法の典型。
 *
 * ★★**全員が同じ、加速しかしない曲線**なら:
 *   ・出口で減速しないので**溜まらない**。
 *   ・等間隔(`STREAM_STEP`)に出発した図形は、傾きが増えるぶん**進むほど間隔が開く**
 *     ので、重なりが**構造として起きない**(揃えるための `span`/`conv` が要らない)。
 *   ・速さの山が終盤に来るので、速さ由来のスクイーズが**勝手に後半だけ強くなる**。
 * ★これは **canvas の図形の座標系だけ**の道具で、バネと同じ扱い
 * (`lib/tokens.ts` の例外)。CSS の transition には持ち込まない。
 */
const FLOW_POW = 2.4;
function flow(t: number): number {
  return Math.pow(Math.max(0, Math.min(1, t)), FLOW_POW);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** ★連なりの遅れ。**等間隔**(第64巡)。理由は `STREAM_STEP` の注を見ること。 */
const startAt = (i: number) => STREAM_STEP * i;
/** 3次ベジエと、その接線。 */
const bez = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

export function GravityTab({ appState, persist, showToast, goTab, appActive, active = true, dragged }: TabProps & {
  appActive?: boolean;
  active?: boolean;
  dragged?: React.MutableRefObject<boolean>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pendingBakeRef = useRef(false);
  const wakeRef = useRef<() => void>(() => {});
  /** ★`draw` は `offField` より先に定義されるので ref 越しに呼ぶ(既存の作法と同じ)。 */
  const offFieldRef = useRef<(c: { x: number; y: number; s: number }) => boolean>(() => false);
  /** ★`alignMid` は `arcGeom` より先に定義されるので ref 越しに呼ぶ。 */
  const arcGeomRef = useRef<() => { mid: number; reach: number }>(
    () => ({ mid: 0, reach: 1 }));
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const matterRef = useRef<typeof import("matter-js") | null>(null);
  const piecesRef = useRef<Piece[]>([]);
  const shardsRef = useRef<Shard[]>([]);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const activeRef = useRef(!!appActive);
  const sizeRef = useRef({ w: 0, h: 0 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** ★その回の落とし方の種。落とし直すたびに引き直す(第60巡)。 */
  const seedRef = useRef("0");
  /** ★ALIGN の入りで、図形と一緒に飛んでいく文字ブロック。 */
  const flyRef = useRef<Fly[]>([]);
  /** 上と対の、いまの位置(毎フレーム `advance` が書き、`draw` が読む)。 */
  const flyCurRef = useRef<Slot[]>([]);
  const goTabRef = useRef(goTab);
  goTabRef.current = goTab;
  // ★★NAME / TAG の切り替えは**廃止**(第60巡にユーザー指定「不要」)。図形の顔は
  //   常に `name`(タスク名)。`SolidPaint` の語彙としてだけ残る。
  const viewRef = useRef<SolidView>("name");

  const [mode, setMode] = useState<Mode>("pile");
  const modeRef = useRef<Mode>("pile");
  const phaseRef = useRef<Phase>(null);
  const t0Ref = useRef(0);

  // ALIGN
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const slotRef = useRef<Map<string, Slot>>(new Map());
  const curRef = useRef<Map<string, Slot>>(new Map());
  /** 前フレームの描画位置(スクアッシュ＆ストレッチとスミアーの速度を出すため)。 */
  const prevRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const fromRef = useRef<Map<string, Slot>>(new Map());
  const outSRef = useRef<Map<string, Spring>>(new Map());
  /** ★閉じで山を落とし直したか(1度だけ)。`OUT_DROP` を見て前倒しで呼ぶため。 */
  const outDroppedRef = useRef(false);
  const inSRef = useRef<Map<string, Spring>>(new Map());
  const bakeUnitRef = useRef(UNIT);
  /** ★スクロールは `lib/scroll.ts`(指1:1＋投げ＋減衰＋吸着)。強さはあちらの
   *  `SCROLL_GAIN`/`FLICK_K` の2つだけで決まる。 */
  const scrollRef = useRef<Flick>(flick(0));
  /** ★★行ごとの**弧長のバネ**。焦点に近いほど硬いので、中央から外へ**連鎖**する。 */
  const posSRef = useRef<Map<string, Spring>>(new Map());
  const [focusIdx, setFocusIdx] = useState(0);
  const focusRef = useRef(0);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // TIMELINE
  const daysRef = useRef<string[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const bandRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const dayRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** 横に送っている間だけ出る日付の目盛り。 */
  const rulesRef = useRef<HTMLDivElement | null>(null);
  /** 縦線を消すまでの待ち(離してもしばらく残す)。 */
  const panTRef = useRef(0);
  const ruleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  /** ★閉じている途中の日(`ms(T_OUT)` のあいだだけ残して拭き取りを逆再生する)。
   *  これが無いと詳細の DOM が**即座に消えて**「閉じるアニメーションが無い」に
   *  見える(第62巡のユーザー指摘)。隙間(`gapRef`)の方はバネで閉じていた。 */
  const [closingDay, setClosingDay] = useState<number | null>(null);
  /** ★閉じている最中かを**描画ループから**見るための控え(state は毎フレーム読めない)。 */
  const closingRef = useRef<number | null>(null);
  /** ★詳細の各行の器。**図形の高さに合わせて**毎フレーム置く(`syncDetail`)。 */
  const detailRowRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** ★描画ループから読む用の控え(state は毎フレーム読めない)。 */
  const expandedTasksRef = useRef<Task[]>([]);
  /** ★曜日を開く**前**の横スクロール位置。閉じたらここへ戻す。 */
  const panBeforeRef = useRef<number | null>(null);
  const closeTRef = useRef(0);
  const expandedRef = useRef<number | null>(null);
  /** 曜日の伸び。**指が動かす**(0..TL_STRETCH)。 */
  const riseRef = useRef(0);
  /** 指を離したあとの戻り。★`--tl` はドラッグ中は `riseRef`、離したらこのバネが書く。 */
  const riseSRef = useRef<Spring>(spring(0));
  const riseDragRef = useRef(false);
  /** 伸びの速さ(1ステップぶん)と、それを測った時刻。 */
  const riseVRef = useRef(0);
  const riseTRef = useRef(0);
  const tlDragRef = useRef(false);
  /** 床が抜けたか(＝物理が始まったか)。 */
  const openedRef = useRef(false);
  /** 横スクロールと隙間。どちらもバネで運ぶ。 */
  const worldRef = useRef<Spring>(spring(0));
  const worldTargetRef = useRef(0);
  const gapRef = useRef<Spring>(spring(0));
  const laneBodiesRef = useRef<Body[]>([]);
  const laneXPrevRef = useRef<number[]>([]);
  const wDragRef = useRef(false);
  /** 横の投げ(1ステップぶんの速さ)と、それを測った時刻。 */
  const wVRef = useRef(0);
  const wTRef = useRef(0);
  const tlUnitRef = useRef(UNIT);

  // 掴む
  const grabRef = useRef<{
    piece: Piece; dx: number; dy: number; held: boolean; holdT: number;
    vx: number; vy: number; lastX: number; lastY: number;
  } | null>(null);
  const [holding, setHolding] = useState(false);
  const [hover, setHover] = useState<DropTarget>(null);
  const mouthRef = useRef<HTMLDivElement | null>(null);
  const trashRef = useRef<HTMLDivElement | null>(null);

  const dropAllRef = useRef<() => void>(() => {});
  /** 閉じる途中で**山へ戻し終えた**図形。全部そろったら床を戻す。 */
  const backRef = useRef<Set<string>>(new Set());
  const scaleRef = useRef(1);

  const tasks = useMemo(() => (appState.tasks ?? []).filter((t) => !t.done), [appState.tasks]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const open = (appState.tasks ?? []).find((t) => t.id === openId) ?? null;

  const fieldOf = useCallback(() => {
    const { h } = sizeRef.current;
    return { top: MASTHEAD_H, floor: floorYOf(h) };
  }, []);
  /** ★ALIGN で焦点を置く高さ。**`arcGeom` が唯一の出どころ**(下の注を見ること)。 */
  const alignMid = useCallback(() => arcGeomRef.current().mid, []);
  /**
   * ★★★円弧は**出口から逆算する**(2026-08-26・第65巡)。
   *
   * 第64巡までは `ARC_R = 700` の当て推量で、上へ送っても行はほとんど左へ動かず、
   * **タイトルに被る手前で薄くなって消える**しかなかった(＝あの「霧」)。
   * ユーザー指定は「マスクを使わなくてもタイトルにかからず、**タイトルの下あたりで
   * 左側にフレームアウト**する」。これは半径を**決める**話ではなく、
   * **通ってほしい2点から半径が決まる**話だった:
   *   ・焦点   … `(ARC_APEX_X, mid)`
   *   ・出口   … `(0, MASTHEAD_H)` ＝ **場の上端で、図形の中心が画面の左端**
   * ★★出口に「完全に画面の外(x < -88)」を求めると、上へ動ける距離が短いぶん
   *   **90度近く回る＝輪に見える**(第56巡に一度捨てた姿)。中心が左端に達すれば
   *   図形はほぼ隠れ、残りは場の上端の**箱**で切れるので、これで「左にフレームアウト」
   *   は成立する。この条件だと 390×797 で R≒329・47度の**緩い弧**になる。
   * 円の中心は左の水平線上(`y = mid`)にあるので、この2点を通る半径は**一意に決まる**。
   *   `Hx = apexX - exitX` / `Vy = mid - exitY` として `θ = 2·atan(Hx/Vy)`、`R = Vy/sin θ`。
   *
   * ★**画面ごとに半径が変わる**のが要点 — どの端末でも約束が守られる
   *   (390×797 なら R≒321・71°、大きい画面ほど緩い弧になる)。
   * ★★`ARC_R` の定数は**撤去した**。円弧の寸法はここが唯一の出どころ。
   */
  /**
   * ★★★行の道。**縦はまっすぐ、横だけほんのり弓なり**(2026-08-26・第65巡の2回目)。
   *
   * ユーザー指定は「**円弧の部分はほとんど見えなくても良い**ので、図形を左に寄せて
   * 右側に文字の場所を作る」。そこで**本物の円をやめた**。円だと:
   *   ・端へ行くほど縦が詰まる（`dy/dL = cos θ`）ので**行が重なる**
   *   ・遠い行ほど横に大きく流れて**画面の外へ逃げる**
   * のふたつが必ず起きる。いまは
   *   `y = mid + L`（**縦は道のりそのもの**＝間隔が常に一定・指と 1:1）
   *   `x = ARC_APEX_X - ARC_SWING · (L / reach)²`（**放物線**。場の端で `ARC_SWING` だけ左）
   * 浅い放物線は浅い円弧と見分けがつかないので、狙いの「気配」はそのまま残る。
   *
   * ★★★`mid` は**画面と目盛りだけで決まる固定値**。第65巡の1回目はここを
   * `scrollRef.current.p` の関数にしていて、指を動かす → 原点が動く → **場ぜんぶが
   * 動く** → その動く的をバネが追いかける、という輪でスクロールが壊れた。
   * **レイアウトの原点を、レイアウトの中身から決めてはいけない。**
   */
  const arcGeom = useCallback(() => {
    const { top, floor } = fieldOf();
    const mid = top + (floor - top) * ARC_MID;
    // ★弓の基準は**場の半分**。焦点の高さ(`mid`)を基準にすると、上下で基準が食い違い、
    //   遠い行ほど二次関数で**際限なく左へ逃げる**(第65巡の2回目で実際に逃げた)。
    return { mid, reach: Math.max(1, (floor - top) / 2) };
  }, [fieldOf]);
  arcGeomRef.current = arcGeom;

  /** 道のり `L`(px) の所の**絵の中心**。`L` は焦点からの符号つきの距離。 */
  const arcAt = useCallback((len: number) => {
    const { mid, reach } = arcGeomRef.current();
    // ★★`k` を ±1 で頭打ちにする ― 弓の膨らみは **`ARC_SWING` を超えない**。
    //   二次関数は外側で暴れるので、必ず止めること。
    const k = Math.max(-1, Math.min(1, len / reach));
    return { x: ARC_APEX_X - ARC_SWING * k * k, y: mid + len };
  }, []);
  /** 曜日の帯の上端(＝レーンの床)。 */
  const bandTopY = useCallback(() => fieldOf().floor - LANE_HEAD_H - SPACE.xl, [fieldOf]);
  const laneWOf = useCallback(() => sizeRef.current.w / LANES_VISIBLE, []);
  /** レーン i の左端(いまの横スクロールと隙間を反映)。 */
  const laneLeft = useCallback((i: number) => {
    const sel = expandedRef.current;
    return laneWOf() * i + (sel !== null && i > sel ? gapRef.current.p : 0) - worldRef.current.p;
  }, [laneWOf]);

  // ── 描く ───────────────────────────────────────────────────
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    const { w, h } = sizeRef.current;
    if (!cv || !w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // ★★★焼くのも**画面と同じ倍率**(第62巡)。第61巡までは 1.5 倍で焼いて 2 倍で
    //   描いていたので、**必ず 1.33 倍に引き伸ばされて**いた ― 実機で「図形の中の
    //   文字が滲む」と言われたのはこれ。DRIFT は最初から等倍で焼いているので
    //   滲まない＝**GRAVITY だけの症状**だったのが手がかりだった。
    //   焼くピクセルは 1.78 倍になるが、1フレームの焼き予算(`BAKE_BUDGET` /
    //   `GLYPH_BUDGET`)で散らしているので、落下中でも詰まらない(実測で確認)。
    const bakeDpr = dpr;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, w, h);

    let budget = BAKE_BUDGET;
    let glyphBudget = GLYPH_BUDGET;
    const want = (paint: SolidPaint, unit: number) => {
      let bmp = peekSolidBitmap(paint, unit, bakeDpr);
      if (!bmp) {
        if (glyphBudget > 0) glyphBudget -= warmShapeGlyphs(paint, glyphBudget, unit, bakeDpr);
        if (budget > 0 && shapeGlyphsReady(paint, unit, bakeDpr)) { bmp = solidBitmap(paint, unit, bakeDpr); budget--; }
      }
      return bmp;
    };

    // ★★閉じで山を**前倒しに**落とすので(`OUT_DROP`)、そのあいだは山と
    //   出ていく図形の**両方**を描く(第64巡)。山を先に描いて、抜けていく図形を上に。
    //   ★モードは `done` まで "align" のまま ― 右の文字(`mode === "align"` で出す
    //   DOM)を先に消すと、まだ薄まりきっていない文字がぱっと消えてしまう。
    const inAlign = modeRef.current === "align";
    let pendingPile = false;
    let pendingAlign = false;

    if (!inAlign || outDroppedRef.current) {
      // 山・タイムライン … **物理の body そのもの**を描く。
      for (const p of piecesRef.current) {
        if (p.word) {
          // ★「自由」や日付・曜日 … 色の面を敷かず、**文字そのもの**を置く。
          //   ★第63巡から**焼いた絵**を貼る(紙の目が入り、文字もくっきりする)。
          const wb = wordBitmap(p.word, p.wordFs ?? 32, p.wordSx ?? 1,
            p.wordInk ?? MUTED, p.wordFam ?? SANS,
            p.wordW ?? 40, p.wordH ?? 20, p.wordDx ?? 0, p.wordDy ?? 0, bakeDpr);
          ctx.save();
          ctx.translate(p.body.position.x, p.body.position.y);
          ctx.rotate(p.body.angle);
          ctx.drawImage(wb.canvas, -wb.w / 2, -wb.h / 2, wb.w, wb.h);
          ctx.restore();
          continue;
        }
        const bmp = want(p.paint, p.unit);
        ctx.save();
        ctx.translate(p.body.position.x, p.body.position.y);
        ctx.rotate(p.body.angle);
        if (bmp) ctx.drawImage(bmp.canvas, p.ox - bmp.w / 2, p.oy - bmp.h / 2, bmp.w, bmp.h);
        else {
          ctx.rotate(-p.body.angle);
          ctx.translate(-p.body.position.x, -p.body.position.y);
          ctx.fillStyle = tagColor(p.paint.tag);
          ctx.beginPath();
          p.body.vertices.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)));
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      pendingPile = budget === 0 || glyphBudget === 0
        || piecesRef.current.some((p) => !p.word && !peekSolidBitmap(p.paint, p.unit, bakeDpr));
    }

    if (inAlign) {
      // ★★**場の箱で切る**(2026-08-26・第65巡)。霧をやめたので、円弧の端の行が
      //   タイトルの帯や浮いたタブバーの裏へ入らないよう、**矩形で**切る
      //   (ユーザー指定「マスクを使わなくても」に反しない ― これはフェードではない)。
      const fld = fieldOf();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, fld.top, w, Math.max(0, fld.floor - fld.top));
      ctx.clip();
      // ★スロットへ**絵の中心**を置く(第53巡)。
      const bakeUnit = bakeUnitRef.current;
      const pileUnit = UNIT * scaleRef.current;
      const prev = prevRef.current;
      for (const it of itemsRef.current) {
        const cu = curRef.current.get(it.id);
        // ★場の外に出た行は描かない(第65巡。霧を消したので**幾何で**切る)。
        if (!cu || cu.o <= 0.01 || offFieldRef.current(cu)) { prev.delete(it.id); continue; }
        let bmp = want(it.paint, bakeUnit);
        let s = cu.s;
        if (!bmp) {
          // ★★ALIGN 用がまだ焼けていない間は**山の絵で代用**する。山は
          //   `viewRef.current`(題つき)で焼いてあるので、`it.paint`(＝文字なし)の
          //   ままでは当たらない ― ビューを山のものに差し替えて引くこと。
          //   これを忘れると、ALIGN に入った直後の数フレーム図形が消える。
          const pb = peekSolidBitmap({ ...it.paint, view: viewRef.current }, pileUnit, bakeDpr);
          if (pb) { bmp = pb; s = (cu.s * bakeUnit) / pileUnit; }
        }
        if (!bmp) continue;
        // ★★スクアッシュ＆ストレッチ／スミアー(第58巡)。前フレームからの動きで
        //   **進む向きへ伸び、直交へ縮む**。速いときだけ後ろへ残像を重ねる。
        //   ★canvas の図形の座標系だけの話(バネ・`cine` と同じ例外)。
        const pv = prev.get(it.id);
        const vx = pv ? cu.x - pv.x : 0;
        const vy = pv ? cu.y - pv.y : 0;
        prev.set(it.id, { x: cu.x, y: cu.y });
        const sp = Math.hypot(vx, vy);
        const k = Math.min(SQUASH_MAX, sp / SQUASH_REF);
        const ang = sp > 0.01 ? Math.atan2(vy, vx) : 0;
        const put = (dx: number, dy: number, alpha: number) => {
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(cu.x + dx, cu.y + dy);
          if (k > 0.001) { ctx.rotate(ang); ctx.scale(1 + k, 1 / (1 + k)); ctx.rotate(-ang); }
          ctx.rotate(cu.a);
          ctx.scale(s, s);
          ctx.drawImage(bmp.canvas, -bmp.w / 2, -bmp.h / 2, bmp.w, bmp.h);
          ctx.restore();
        };
        if (sp > SMEAR_MIN) {
          for (let j = SMEAR_N; j >= 1; j -= 1) {
            const f = j / (SMEAR_N + 1);
            put(-vx * f * SMEAR_LEN, -vy * f * SMEAR_LEN, cu.o * SMEAR_A * (1 - f));
          }
        }
        put(0, 0, cu.o);
      }
      // ★★図形と一緒に飛んでいく日付・曜日の板(第61巡)。図形と同じ道・同じ緩急。
      for (let k = 0; k < flyRef.current.length; k += 1) {
        const f = flyRef.current[k]; const cu = flyCurRef.current[k];
        if (!cu || cu.o <= 0.01) continue;
        const wb = wordBitmap(f.word, f.fs, f.sx, f.ink, f.fam, f.bw, f.bh, f.dx, f.dy, bakeDpr);
        ctx.save();
        ctx.globalAlpha = cu.o;
        ctx.translate(cu.x, cu.y);
        ctx.rotate(cu.a);
        ctx.scale(cu.s, cu.s);
        ctx.drawImage(wb.canvas, -wb.w / 2, -wb.h / 2, wb.w, wb.h);
        ctx.restore();
      }
      ctx.restore();
      // ★★端だけ地色へ溶かす。`destination-out` なので**すでに描いた絵を削る**。
      //   DOM 側の `.mode-panel` のマスクと同じ `EDGE_FADE` を使うこと。
      {
        const fade = (y0: number, y1: number) => {
          const g = ctx.createLinearGradient(0, y0, 0, y1);
          g.addColorStop(0, "rgba(0,0,0,1)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          ctx.fillStyle = g;
          ctx.fillRect(0, Math.min(y0, y1), w, Math.abs(y1 - y0));
          ctx.restore();
        };
        fade(fld.top, fld.top + EDGE_FADE);
        fade(fld.floor, fld.floor - EDGE_FADE);
      }
      pendingAlign = budget === 0 || glyphBudget === 0
        || itemsRef.current.some((it) => !peekSolidBitmap(it.paint, bakeUnit, bakeDpr));
    }
    pendingBakeRef.current = pendingPile || pendingAlign;
    if (pendingBakeRef.current) wakeRef.current();

    for (const s of shardsRef.current) {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.fill;
      ctx.fillRect(s.x - s.r / 2, s.y - s.r / 2, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }, [fieldOf]);

  const drawRef = useRef(draw);
  drawRef.current = draw;
  const loopRef = useRef<() => void>(() => {});

  const wake = useCallback(() => {
    if (runningRef.current || !activeRef.current) return;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(() => loopRef.current());
  }, []);
  wakeRef.current = wake;

  // ── ALIGN のレイアウト ────────────────────────────────────
  const layoutAlign = useCallback(() => {
    const list = itemsRef.current;
    if (!list.length) return;
    // ★道は `arcAt`(縦はまっすぐ・横だけ弓なり)。
    const slots = slotRef.current;
    const springs = posSRef.current;
    const focus = scrollRef.current.p;
    for (let i = 0; i < list.length; i += 1) {
      const d = i - focus;
      // ★★弧長そのものをバネで追う。硬さは**焦点からの距離ぶんやわらかく**なるので、
      //   中央と隣の間隔がまず縮み、それに次が追い、さらに次が追う(連鎖)。
      const want = arcLen(d);
      let sp = springs.get(list[i].id);
      if (!sp) { sp = spring(want); springs.set(list[i].id, sp); }
      // ★★★**焦点は指に 1:1、遠い行ほど遅れて追う**(2026-08-26・第65巡の2回目)。
      //   第64巡までは全部の行が `K_TRAVEL`(0.016) の**同じやわらかさ**で、
      //   焦点の行ですら指の 3 割しか付いてこなかった(実測 120px 払って 36px)。
      //   「連鎖」は遠い行が遅れることで出るのだから、**触っている行まで
      //   遅らせる必要は無い**。硬さを距離で落として、両方を成立させる。
      //   ★減衰は硬さに合わせて臨界の手前に置く(`2√k` が臨界。行き過ぎが慣性に見える)。
      const k = Math.max(K_TRAVEL, CHAIN_K * Math.pow(CHAIN, Math.min(CHAIN_MAX, Math.abs(d))));
      springTo(sp, want, k, Math.min(D_CHAIN_MAX, 2 * Math.sqrt(k) * D_CHAIN));
      const pt = arcAt(sp.p);
      // 大きさ・濃さは**バネの位置**で決める(遅れた行は遅れて大きくなる)。
      const dd = sp.p / PITCH_TIGHT;
      const f = Math.max(0, 1 - Math.abs(dd) * (PITCH_TIGHT / (PITCH_TIGHT + PITCH_SPREAD)));
      slots.set(list[i].id, {
        x: pt.x, y: pt.y,
        s: (1 + FOCUS_BOOST * f) / (1 + FOCUS_BOOST),
        a: 0,                                     // 図形は回さない(平行を保つ)
        // ★★★**薄くしない**(2026-08-26・第65巡にユーザー指定「マスク的なものは削除」)。
        //   第64巡までは `clamp01(1.5 - |d|/2.2)` で焦点から離れた行を消していた ―
        //   指定していない「霧」がかかって見え、しかも消える手前でタイトルに被るという
        //   中途半端な状態だった。いまは**円弧そのものが行を画面の外へ運ぶ**ので、
        //   濃さで隠す必要が無い(`arcGeom` の注を見ること)。
        o: 1,
      });
    }
  }, [arcAt]);

  /** ★円弧の下の入り口の角度。**半径から決まる**ので定数にできない
   *  (第56巡に半径を 290→1400 にしたら、固定値 1.45rad は画面のはるか外を指した)。 */
  /** ★円弧の下の入り口の**道のり**(焦点からの距離)。場の床のさらに下から上がってくる。
   *  ★第65巡に角度から道のりへ(道が円でなくなったため)。 */
  const arcEnterLen = useCallback(() => {
    const { floor } = fieldOf();
    const { mid } = arcGeomRef.current();
    return floor + SPACE.xxl * 4 - mid;
  }, [fieldOf])

  const syncFocus = useCallback(() => {
    const n = Math.max(0, Math.min(itemsRef.current.length - 1, Math.round(scrollRef.current.p)));
    if (n !== focusRef.current) { focusRef.current = n; setFocusIdx(n); }
  }, []);

  /** ★★**みんなが通る1本の道**。集合点(画面の左下寄り)から右上の外へ抜ける。
   *  引数は道の上の位置(0..1)。 */
  const streamAt = useCallback((t01: number) => {
    const { w, h } = sizeRef.current;
    const t = clamp01(t01);
    const p0x = w * 0.16, p0y = h * 0.72;         // 集合点(山のあたり)
    const p1x = w * 0.20, p1y = h * 0.30;         // まず持ち上がる
    const p2x = w * 0.72, p2y = h * 0.14;         // それから右上へ
    const p3x = w + 240, p3y = -220;              // 画面の外
    return {
      x: bez(p0x, p1x, p2x, p3x, t),
      y: bez(p0y, p1y, p2y, p3y, t),
      // 出口へ向かうほど小さく(遠ざかる)。
      k: lerp(1, 0.62, t),
    };
  }, []);

  /** ★★閉じるときの**1本の道**(第60巡)。入りの `streamAt` の相方。
   *  第59巡までの閉じは「x を -260 へバネで寄せるだけ」で、進む距離が短く減衰も
   *  強かったので**速さがまったく出ず**、スクアッシュもスミアーも出る条件
   *  (`SMEAR_MIN`)に届いていなかった ― これが「閉じる時のストレッチが無さすぎて
   *  不自然」(第60巡のユーザー指摘)の正体。入りと**同じ長さの道を同じ `cine` の
   *  緩急で走らせる**と、伸びも残像も同じ量だけ勝手に出る。
   *  円弧のあたり(左)から左下へ、画面のはるか外まで抜ける。 */
  const homeAt = useCallback((t01: number) => {
    const { w, h } = sizeRef.current;
    const mid = alignMid();
    const t = clamp01(t01);
    const p0x = ARC_APEX_X + 40, p0y = mid;            // 集合点(円弧のあたり)
    const p1x = -w * 0.05, p1y = mid + h * 0.12;       // まず左へ滑り出す
    const p2x = -w * 0.55, p2y = h * 0.80;             // それから左下へ
    const p3x = -w * 1.60, p3y = h * 1.15;             // 画面の外
    return {
      x: bez(p0x, p1x, p2x, p3x, t),
      y: bez(p0y, p1y, p2y, p3y, t),
      k: lerp(1, 0.62, t),
    };
  }, [alignMid]);

  // ── TIMELINE の器(レーンの床と壁) ──────────────────────────
  const buildLanes = useCallback(() => {
    const M = matterRef.current; const engine = engineRef.current;
    if (!M || !engine) return;
    M.Composite.remove(engine.world, laneBodiesRef.current);
    const n = daysRef.current.length;
    const laneW = laneWOf();
    const top = bandTopY();
    const bodies: Body[] = [];
    const o = { isStatic: true, friction: 0.6, restitution: 0.02, collisionFilter: FILTER_LANE };
    for (let i = 0; i < n; i += 1) {
      const left = laneLeft(i);
      // 床
      bodies.push(M.Bodies.rectangle(left + laneW / 2, top + WALL_T / 2, laneW, WALL_T, o));
      // 左の壁(いちばん右のレーンだけ右の壁も足す)
      bodies.push(M.Bodies.rectangle(left, top - 400, WALL_T, 900, o));
      if (i === n - 1) bodies.push(M.Bodies.rectangle(left + laneW, top - 400, WALL_T, 900, o));
    }
    M.Composite.add(engine.world, bodies);
    laneBodiesRef.current = bodies;
    laneXPrevRef.current = Array.from({ length: n }, (_, i) => laneLeft(i));
  }, [laneLeft, laneWOf, bandTopY]);

  const clearLanes = useCallback(() => {
    const M = matterRef.current; const engine = engineRef.current;
    if (M && engine && laneBodiesRef.current.length) M.Composite.remove(engine.world, laneBodiesRef.current);
    laneBodiesRef.current = [];
  }, []);

  /** レーンが横へ動いたぶん、器と**乗っている図形**を一緒に運ぶ。 */
  const syncLanes = useCallback(() => {
    const M = matterRef.current;
    if (!M || !laneBodiesRef.current.length) return;
    const n = daysRef.current.length;
    const laneW = laneWOf();
    const top = bandTopY();
    const prev = laneXPrevRef.current;
    let bi = 0;
    for (let i = 0; i < n; i += 1) {
      const left = laneLeft(i);
      const d = left - (prev[i] ?? left);
      M.Body.setPosition(laneBodiesRef.current[bi], { x: left + laneW / 2, y: top + WALL_T / 2 }); bi += 1;
      M.Body.setPosition(laneBodiesRef.current[bi], { x: left, y: top - 400 }); bi += 1;
      if (i === n - 1) { M.Body.setPosition(laneBodiesRef.current[bi], { x: left + laneW, y: top - 400 }); bi += 1; }
      if (Math.abs(d) > 0.01) {
        for (const p of piecesRef.current) {
          if (p.lane === i && !p.body.isStatic) M.Body.translate(p.body, { x: d, y: 0 });
        }
      }
      prev[i] = left;
    }
  }, [laneLeft, laneWOf, bandTopY]);

  /** ★下へ出た図形を、その日の列の真上へ引き上げて離す(＝落ちてくる)。 */
  const recycle = useCallback(() => {
    const M = matterRef.current;
    if (!M) return;
    const engine = engineRef.current;
    if (!engine) return;
    const { h } = sizeRef.current;
    const laneW = laneWOf();
    // ★日付の無い図形は列を持たない。落ちて画面の外へ出たら、そこで畳む
    //   (見えない所で消えるので「急に消えた」に見えない)。
    const drop = piecesRef.current.filter((p) => p.lane < 0 && p.body.position.y >= h + 120);
    if (drop.length) {
      M.Composite.remove(engine.world, drop.map((p) => p.body));
      const gone = new Set(drop.map((p) => p.body));
      piecesRef.current = piecesRef.current.filter((p) => !gone.has(p.body));
    }
    for (const p of piecesRef.current) {
      if (p.body.position.y < h + 120) continue;
      if (p.lane < 0) continue;
      // 大きさをレーン用へ入れ替える(画面の外なので継ぎ目は見えない)。
      // ★「自由」の板は入れ替えない ― `swapUnit` は `paint` から**図形の**body を
      //   作り直すので、板が図形に化けてしまう。
      if (!p.word && Math.abs(p.unit - tlUnitRef.current) > 0.5) swapUnit(M, engine.world, p, tlUnitRef.current);
      const cx = laneLeft(p.lane) + laneW / 2;
      // ★★投入を**ばらす**(第57巡)。全部が同じ高さ・速度0・角度0で入ると、隣同士が
      //   寸分違わず同じ速さで落ちて**アニメーションに見える**(ユーザー指摘)。
      //   id から高さ・初速・回り方を散らすと、同じ列でも一つずつ違う落ち方になる。
      const r1 = frac(p.id); const r2 = frac(p.id + "y"); const r3 = frac(p.id + "w");
      M.Body.setPosition(p.body, {
        x: cx + (r1 - 0.5) * laneW * 0.30,
        y: -RECYCLE_Y * (0.7 + r2 * 1.6),
      });
      M.Body.setVelocity(p.body, { x: (r1 - 0.5) * 1.6, y: r2 * 2.2 });
      M.Body.setAngle(p.body, (r3 - 0.5) * 0.9);
      M.Body.setAngularVelocity(p.body, (r3 - 0.5) * 0.16);
      // ★ここからはレーンの器と噛み合う層へ移す(＝振り分け済み)。
      //   ★回転は**止めない** — 落ちる・転がる・傾いたまま積まれるまで、山とまったく
      //   同じ物理にする(第57巡にユーザー確定)。
      setFilter(p.body, FILTER_HELD);
      M.Sleeping.set(p.body, false);
    }
  }, [laneLeft, laneWOf]);

  /** ★閉じる途中 … 画面の下へ出た図形を**山の上**へ引き上げて離す。
   *  大きさも山の単位へ戻す。全部が戻ったら床を張って終わり。 */
  const recycleToPile = useCallback((): boolean => {
    const M = matterRef.current; const engine = engineRef.current;
    if (!M || !engine) return true;
    const { w, h } = sizeRef.current;
    const unit = UNIT * scaleRef.current;
    // ★「自由」の板は**タスクではない**ので、下へ出たところで畳む(山へは戻さない)。
    const drop = piecesRef.current.filter((p) => p.word && p.body.position.y >= h + 120);
    if (drop.length) {
      M.Composite.remove(engine.world, drop.map((p) => p.body));
      const gone = new Set(drop.map((p) => p.id));
      piecesRef.current = piecesRef.current.filter((p) => !gone.has(p.id));
    }
    for (const p of piecesRef.current) {
      if (backRef.current.has(p.id)) continue;
      if (p.body.position.y < h + 120) continue;
      if (Math.abs(p.unit - unit) > 0.5) swapUnit(M, engine.world, p, unit);
      const r1 = frac(p.id + "p"); const r2 = frac(p.id + "q");
      M.Body.setPosition(p.body, { x: PILE_INSET + pileWOf(w) * (0.08 + 0.84 * r1), y: -RECYCLE_Y * (0.6 + r2 * 1.8) });
      M.Body.setVelocity(p.body, { x: (r1 - 0.5) * 1.4, y: r2 * 2 });
      M.Body.setAngle(p.body, (r2 - 0.5) * 1.1);
      M.Body.setAngularVelocity(p.body, (r1 - 0.5) * 0.18);
      setFilter(p.body, FILTER_PILE);
      M.Sleeping.set(p.body, false);
      backRef.current.add(p.id);
    }
    if (backRef.current.size < piecesRef.current.length) return false;
    // ★全部そろった ― **timeline に居なかったタスク**(日付なし・間引かれたぶん)を
    //   ここで山へ足し、居なくなったものを外す。そのうえで床を戻す。
    const { keep } = pileOf(tasksRef.current, new Date(), pileWOf(w), h - navHeightPx() - MASTHEAD_H);
    const alive = new Map(keep.map((t) => [t.id, t]));
    const gone = piecesRef.current.filter((p) => !p.word && !alive.has(p.id));
    if (gone.length) {
      M.Composite.remove(engine.world, gone.map((p) => p.body));
      piecesRef.current = piecesRef.current.filter((p) => p.word || alive.has(p.id));
    }
    const have = new Set(piecesRef.current.map((p) => p.id));
    const add: Piece[] = keep.filter((t) => !have.has(t.id))
      .map((t, i) => makePiece(M, t, viewRef.current, w, i, unit, seedRef.current));
    // ★日付・曜日の板は TIMELINE を開いた時に一緒に落ちて畳まれているので、
    //   山へ戻るここで作り直す(第60巡)。
    add.push(...pileWordPieces(M, w, seedRef.current));
    if (add.length) {
      M.Composite.add(engine.world, add.map((p) => p.body));
      piecesRef.current = [...piecesRef.current, ...add];
    }
    rebuildWalls(M, engine, w, h, true);
    return true;
  }, []);

  // ── 毎フレーム ─────────────────────────────────────────────
  const advance = useCallback((): boolean => {
    const m = modeRef.current;
    const ph = phaseRef.current;
    let moving = false;
    const now = performance.now();
    const t = now - t0Ref.current;
    const { w } = sizeRef.current;
    const mid = alignMid();
    const list = itemsRef.current;

    if (m === "timeline") {
      // ★物理だけ。器を運び、下へ出たものを引き上げる。
      const wt = worldTargetRef.current;
      if (!wDragRef.current) {
        springTo(worldRef.current, wt, K_SETTLE, D_SETTLE);
        if (!settled(worldRef.current, wt, 0.05)) moving = true;
      }
      // ★★閉じている最中も隙間を**開けたまま**にする(2026-08-26・第67巡)。
      //   第66巡までは `expandedRef` が null になった瞬間に隙間が閉じ始めるので、
      //   詳細のパネル(`.tl-detail.out` が拭き取りを逆再生している)が**隣の列に
      //   覆われて**、ユーザーからは「一瞬で閉じた」と見えていた。
      const gt = expandedRef.current === null && closingRef.current === null ? 0 : GAP_W;
      springTo(gapRef.current, gt, K_SETTLE, D_SETTLE);
      if (!settled(gapRef.current, gt, 0.05)) moving = true;
      // ★★閉じている途中(`tl-out`)は、器を運ぶのではなく**山へ戻す**。
      //   `mode` は timeline のままなので、帯も縦線もその場で潰れ続ける。
      const out = ph === "tl-out";
      if (out) {
        if (recycleToPile()) {
          phaseRef.current = null; backRef.current = new Set();
          modeRef.current = "pile"; setMode("pile");
        }
        moving = true;
      } else if (openedRef.current) { syncLanes(); recycle(); }
      const band = bandRef.current;
      const strip = stripRef.current;
      // ★指を離したら規定へバネで戻る。引いている間は指の値をそのまま。
      //   閉じている途中の行き先は **0**(＝地面まで潰れる)。
      let rise = riseRef.current;
      if (!riseDragRef.current) {
        const rs = riseSRef.current;
        const to = out ? 0 : 1;
        springTo(rs, to, K_SETTLE, D_SETTLE);
        if (!settled(rs, to, 0.002)) moving = true;
        rise = rs.p;
      }
      if (band) band.style.setProperty("--tl", String(TL_FLAT + (1 - TL_FLAT) * rise));
      if (strip) strip.style.transform = `translateX(${(-worldRef.current.p).toFixed(1)}px)`;
      // ★曜日の札は**レーンの器と同じ式**で置く(`laneLeft` は世界のスクロールを
      //   含むので、strip がすでに引いたぶんを足し戻す)。
      const off = worldRef.current.p;
      for (let i = 0; i < daysRef.current.length; i += 1) {
        const el = dayRefs.current[i];
        if (!el) continue;
        const left = laneLeft(i);
        el.style.transform = `translateX(${(left + off).toFixed(1)}px)`;
        // ★濃さは**画面での位置**で決める(左ほど濃い)。絶対の日付番号で決めると、
        //   横へ送ったとたん全部が薄墨になって読めなくなる(第55巡)。
        el.style.setProperty("--wd", i === 0 ? RUST : INK);
      }
      // 日付の目盛りも**同じ出どころ**(`laneLeft`)で置く。
      for (let i = 0; i < daysRef.current.length; i += 1) {
        const el = ruleRefs.current[i];
        if (el) el.style.transform = `translateX(${laneLeft(i).toFixed(1)}px)`;
      }
      const sel = expandedRef.current ?? closingRef.current;
      const det = detailRef.current;
      if (det && sel !== null) det.style.transform = `translateX(${(laneLeft(sel) + laneWOf() + SPACE.lg).toFixed(1)}px)`;
      // ★★★詳細の各行を**その図形の高さ**へ置く(2026-08-26・第67巡にユーザー指定)。
      //   行の縦の中心を図形の中心に合わせ、近くて重なるときは**下から順に押しのける**。
      //   ★毎フレームここで置くのは、図形が物理で動き続けるから ― CSS の
      //   transition で別に動かすと器とズレる(曜日の札と同じ理由)。
      if (det && sel !== null) {
        const rect = det.getBoundingClientRect();
        const rows = detailRowRefs.current;
        // (図形の中心 y, 行の高さ, 器) を集めて、上から順に重なりを解く
        const items: { y: number; h: number; el: HTMLDivElement }[] = [];
        for (let i = 0; i < rows.length; i += 1) {
          const el = rows[i]; if (!el) continue;
          const task = expandedTasksRef.current[i]; if (!task) continue;
          const piece = piecesRef.current.find((p) => p.id === task.id);
          const rh = el.offsetHeight;
          const cy = piece ? piece.body.position.y : rect.top + rect.height - rh / 2;
          items.push({ y: cy, h: rh, el });
        }
        items.sort((a, b) => a.y - b.y);
        const top = rect.top;
        // ★日の見出し(帯のすぐ上)のぶんを空けておく ― ここへ重ねない。
        const bot = rect.top + rect.height - DETAIL_HEAD_H;
        // ★★重なりは**二段階**で解く。前へ詰めるだけだと、入り切らないときに
        //   最後の行が下端で潰れ合う(実測で2行が同じ位置に重なった)。
        //   ① 上から順に「上の行を追い越さない」
        const ys: number[] = [];
        let cursor = top;
        for (const it of items) {
          const y = Math.max(cursor, it.y - it.h / 2);
          ys.push(y); cursor = y + it.h + SPACE.md;
        }
        //   ② 下から順に「下端と次の行を越えない」ように押し戻す
        let limit = bot;
        for (let i = items.length - 1; i >= 0; i -= 1) {
          ys[i] = Math.min(ys[i], limit - items[i].h);
          ys[i] = Math.max(ys[i], top);
          limit = ys[i] - SPACE.md;
        }
        for (let i = 0; i < items.length; i += 1) {
          // 器の bottom:0 からの相対へ直す
          items[i].el.style.transform =
            `translateY(${(ys[i] - (rect.top + rect.height - items[i].h)).toFixed(1)}px)`;
        }
      }
      return moving;
    }

    if (m === "pile" && !ph) return false;

    // ── ALIGN ──
    if (m === "align" && !ph) {
      // ★投げ→減衰→最寄りへ吸着は `lib/scroll.ts` が持つ。連鎖(行ごとのバネ)は別。
      const last = Math.max(0, list.length - 1);
      if (flickStep(scrollRef.current, -0.4, last + 0.4)) moving = true;
      syncFocus();
    }
    layoutAlign();

    const cur = curRef.current; const from = fromRef.current; const slots = slotRef.current;
    // ★道は `arcAt`。

    if (ph === "align-in") {
      const enterLen = arcEnterLen();
      let done = true;
      for (let i = 0; i < list.length; i += 1) {
        const it = list[i];
        const sl = slots.get(it.id); const fr = from.get(it.id);
        if (!sl || !fr) continue;
        const inS = inSRef.current.get(it.id) ?? spring(0);
        inSRef.current.set(it.id, inS);
        const d0 = startAt(i);
        // 入りの硬さを**1つずつ散らす**。減衰を弱めて**行き過ぎてから戻る**。
        const jit = 1 + (frac(it.id + "in") - 0.5) * 0.3;
        const n = flow((t - d0) / STREAM_MS);
        // ★★引き渡しは**進みで**(第64巡)。時刻で切ると、緩急を変えたとたんに
        //   画面の真ん中で消える(`HANDOFF_N` の注)。
        if (n >= HANDOFF_N) springTo(inS, 1, K_TRAVEL * jit, D_IN);
        if (inS.p <= 0.002) {
          // ★★★出は**1本の道**。全員が同じ `flow`(加速しっぱなし)で走るので、
          //   等間隔に出発した図形は**進むほど間隔が開く** ― 揃えるための仕掛け
          //   (第63巡の `span`/`conv`/`line`)は要らない。
          // ★★位置は「**筋の形をそのまま持ち、自分のズレだけを減衰させる**」。
          //   動く点へ直線で寄せる(第63巡の `lerp(fr, p, join)`)と、筋の曲がりが
          //   打ち消されて**まっすぐ吸い込まれる**ように見えていた。こうすると
          //   「あった場所からそのまま曲線を描いて、筋に合流」(ユーザー指定)になる。
          const p = streamAt(n);
          const s0 = streamAt(0);
          const keep = (1 - clamp01(n / MERGE)) ** 2;     // 自分のズレが残る割合
          cur.set(it.id, {
            x: p.x + (fr.x - s0.x) * keep,
            y: p.y + (fr.y - s0.y) * keep,
            s: fr.s * lerp(p.k, 1, keep), a: fr.a * keep, o: 1,
          });
          done = false;
        } else {
          // ★**クランプしない** — バネが 1 を超えたぶんだけ**行き過ぎてから戻る**。
          const u = inS.p;
          const uo = clamp01(u);
          const lenEnd = sl.y - mid;                    // スロットの道のり
          // ★入口は**番号ぶん円弧の下**。同じ点から一斉に上がると団子になる。
          // ★★入口の番号も**道と同じ上限**にする(第63巡)。素の `i` だと後ろの図形ほど
          //   円弧のはるか下から入るので、**大きく回り込んで**見える
          //   (ユーザー指摘「一回くるっと回ってから抜けていく」の半分はこれ)。
          const len = lerp(enterLen + ENTRY_QUEUE * Math.min(i, ENTRY_Q_MAX), lenEnd, u);
          const pt = arcAt(len);
          cur.set(it.id, {
            x: pt.x, y: pt.y,
            s: lerp(sl.s * 0.68, sl.s, uo), a: 0, o: lerp(0.15, sl.o, uo),
          });
          if (!settled(inS, 1, 0.004)) done = false;
        }
      }
      moving = true;
      // ★★終わりは基本 `done`(全部のバネが収まったか)で見る。ここは**念のための下限**
      //   なので短く ― 長くすると、絵はもう着いているのに**指が効かない時間**になる
      //   (第60巡。第59巡は `+ ms(T_IN) + ms(T_ITEM)` で 0.7 秒ぶん余計だった)。
      //   ★引き渡しが進みで決まるので、いちばん後ろの図形が `HANDOFF_N` に達する
      //   時刻(`flow` の逆関数)を使う。
      const handMs = STREAM_MS * Math.pow(HANDOFF_N, 1 / FLOW_POW);
      const txtEnd = startAt(list.length - 1) + handMs + ms(T_ITEM);
      // ★★日付・曜日の板も**同じ道を、図形の後ろに続いて**飛ぶ(第61巡)。
      //   円弧のスロットは持たないので、道を走り切ったらそこで消える。
      for (let k = 0; k < flyRef.current.length; k += 1) {
        const f = flyRef.current[k];
        const i = list.length + k;                    // 図形の後ろに続く番号
        const n = flow((t - startAt(i)) / STREAM_MS);
        const pt = streamAt(n);
        const s0 = streamAt(0);
        const keep = (1 - clamp01(n / MERGE)) ** 2;
        flyCurRef.current[k] = {
          x: pt.x + (f.from.x - s0.x) * keep,
          y: pt.y + (f.from.y - s0.y) * keep,
          s: lerp(pt.k, 1, keep), a: f.from.a * keep,
          // ★板は円弧のスロットを持たないので、道を走り切ったらそこで消える。
          //   ★消え際は**画面の外に出てから**(第64巡。0.86 では中に居た)。
          o: 1 - clamp01((n - 0.92) / 0.08),
        };
        if (n < 1) done = false;
      }
      if (done && t > txtEnd) { phaseRef.current = null; flyRef.current = []; flyCurRef.current = []; }
    } else if (ph === "align-out") {
      // ★★閉じも**入りと同じ作り**(第60巡)。1本の道(`homeAt`)へ順に乗り、
      //   `flow` の緩急(加速しっぱなし)で画面の外へ抜ける。
      //   `outSRef` は**進み(0..1)を入れておく器**として使う(右の文字がこれを読む)。
      let done = true;
      let last = 0;
      for (let i = 0; i < list.length; i += 1) {
        const it = list[i];
        const fr = from.get(it.id);
        if (!fr) continue;
        const s = outSRef.current.get(it.id) ?? spring(0);
        outSRef.current.set(it.id, s);
        // ★閉じは**入りよりさらに素早く**(第64巡)。遅れも詰め、長さも `OUT_MS` へ。
        const d0 = startAt(i) * OUT_LEAD;
        const n = flow((t - d0) / OUT_MS);
        // ★位置の作りは入りと**同じ**(筋の形を持ち、自分のズレだけ減衰させる)。
        const p = homeAt(n);
        const s0 = homeAt(0);
        const keep = (1 - clamp01(n / MERGE)) ** 2;
        s.p = n;                                        // 右の文字が読む進み
        cur.set(it.id, {
          x: p.x + (fr.x - s0.x) * keep,
          y: p.y + (fr.y - s0.y) * keep,
          s: fr.s * lerp(p.k, 1, keep), a: 0, o: 1,
        });
        last = Math.max(last, n);
        if (n < 1) done = false;
      }
      moving = true;
      // ★★**落ち始めを早める**(第64巡にユーザー指定)。第63巡までは全員が抜け切って
      //   から山を作り直していたので、落下が始まるのがいちばん最後だった。
      //   ★モードは変えない ― 変えると右の文字(`mode === "align"` で出す DOM)が
      //   薄まりきる前に消える。代わりに `draw` が `outDroppedRef` を見て、
      //   このあいだだけ**山と出ていく図形の両方**を描く。
      if (!outDroppedRef.current && last >= OUT_DROP) {
        outDroppedRef.current = true;
        dropAllRef.current();
      }
      if (done) {
        phaseRef.current = null;
        if (!outDroppedRef.current) dropAllRef.current();
        outDroppedRef.current = false;   // ★次に ALIGN へ入るときは山を描かない
        modeRef.current = "pile"; setMode("pile");
        itemsRef.current = []; setItems([]);
        flyRef.current = []; flyCurRef.current = [];
      }
    } else if (m === "align") {
      for (const it of list) { const sl = slots.get(it.id); if (sl) cur.set(it.id, sl); }
      // ★連鎖が伝わりきるまで回し続ける(外側の行はいちばん遅れて着く)。
      for (let i = 0; i < list.length; i += 1) {
        const sp = posSRef.current.get(list[i].id);
        if (sp && !settled(sp, arcLen(i - scrollRef.current.p), 0.05)) { moving = true; break; }
      }
    }

    // 文字(円弧に沿う)。位置は ref 越しに毎フレーム書く。
    if (m === "align") {
      const rows = rowRefs.current;
      for (let i = 0; i < list.length; i += 1) {
        const el = rows[i];
        if (!el) continue;
        const d = i - scrollRef.current.p;
        // ★図形と**同じバネ**の位置を使う(文字だけ先に着くと連鎖が壊れる)。
        const sp = posSRef.current.get(list[i].id);
        const pt = arcAt(sp ? sp.p : arcLen(d));
        // ★★★文字は図形と**同じ高さ**に置く(2026-08-26・第65巡)。
        //   第64巡までは半径 `ARC + TEXT_GAP` の**同心円**に乗せていたので、
        //   同じ角度でも文字のほうが下に来て、焦点から離れるほど
        //   **図形と題が縦にずれて**いった(端では 76px も離れる)。
        //   横だけ `TEXT_GAP` ずらせば、どの行でも図形と題が必ず横並びになるし、
        //   行の間隔も図形の間隔とぴったり同じになる。
        const ax = pt.x + TEXT_GAP;
        const ay = pt.y;
        // ★★**薄くしない**(第65巡)。図形側と同じく、円弧が行を画面の外へ運ぶ。
        //   出入りのアニメーションのぶんだけ `op` が動く。
        let slide = 0; let op = 1;
        if (ph === "align-in") {
          const s = inSRef.current.get(list[i].id);
          const u = clamp01(((s?.p ?? 0) - 0.55) / 0.45);
          slide = (1 - u) * (w * 0.9); op *= u;
        } else if (ph === "align-out") {
          const s = outSRef.current.get(list[i].id);
          const u = clamp01(s?.p ?? 0);
          slide = u * (w * 0.9); op *= 1 - u;
        }
        // ★★**回さない**(第56巡にユーザー指定)。文字は地面と平行のまま、
        //   左端だけが図形と同じ弧の外側を平行移動する。
        el.style.transform = `translate(${(ax + slide).toFixed(1)}px, ${(ay - ROW_H / 2).toFixed(1)}px)`;
        el.style.opacity = String(op);
        // ★場の外へ出た行は**器ごと外す**(薄くして隠すのはやめたので、こちらで消す)。
        //   ★上下だけでなく**左へ抜けた**ぶんも見る ― 円弧は行を左へも運ぶ。
        // ★上下は**帯のクリップ**に任せる(図形と同じ切れ方になる)。ここでは
        //   左へ抜けた行だけを外す ― 弓で左へ流れた行は文字が読めないため。
        el.style.visibility = ax < ARC_APEX_X - TEXT_GAP ? "hidden" : "visible";
      }
    }
    return moving;
  }, [alignMid, syncFocus, layoutAlign, streamAt, homeAt, syncLanes, recycle, recycleToPile, laneLeft, laneWOf, arcEnterLen, arcAt]);

  useEffect(() => {
    loopRef.current = () => {
      const M = matterRef.current; const engine = engineRef.current;
      if (!M || !engine) { runningRef.current = false; return; }
      const physics = modeRef.current !== "align";
      if (physics) M.Engine.update(engine, 1000 / 60);
      const moving = advance();
      shardsRef.current = shardsRef.current
        .map((s) => ({ ...s, x: s.x + s.vx, y: s.y + s.vy, vy: s.vy + 0.6, life: s.life - 1000 / 60 / SHARD_MS }))
        .filter((s) => s.life > 0);
      drawRef.current();
      if (physics && !phaseRef.current) {
        const awake = piecesRef.current.some((p) => !p.body.isSleeping);
        if (!awake && !moving && shardsRef.current.length === 0 && !pendingBakeRef.current && !grabRef.current) { runningRef.current = false; return; }
      } else if (!moving && shardsRef.current.length === 0 && !pendingBakeRef.current) { runningRef.current = false; return; }
      rafRef.current = requestAnimationFrame(() => loopRef.current());
    };
  }, [advance]);

  useEffect(() => onFontsReady(() => {
    clearSolidBitmaps(); primeTagMetrics(); wake(); drawRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  useEffect(() => { primeTagMetrics(); }, []);

  const visibleRef = useRef(active);
  useEffect(() => {
    const on = !!appActive && active && !openId;
    visibleRef.current = !!appActive && active;
    activeRef.current = on;
    if (on) wake();
    else { cancelAnimationFrame(rafRef.current); runningRef.current = false; }
  }, [appActive, active, openId, wake]);

  /** 曜日の詳細を閉じる。★DOM は `ms(T_OUT)` だけ残して `.out` で拭き取りを逆再生。 */
  const collapseDay = useCallback(() => {
    const from = expandedRef.current;
    expandedRef.current = null; setExpanded(null);
    if (from === null) return;
    closingRef.current = from; setClosingDay(from);
    // ★★開く前の位置へ戻す(2026-08-26・第67巡にユーザー指定「閉じると元の位置に
    //   戻らない」)。開くとき `worldTargetRef` を「たたいた曜日が左端」へ動かして
    //   いたのに、閉じるときは `Math.max(0, いまの値)` ＝**動かしたまま**だった。
    if (panBeforeRef.current !== null) {
      worldTargetRef.current = panBeforeRef.current;
      panBeforeRef.current = null;
    }
    window.clearTimeout(closeTRef.current);
    closeTRef.current = window.setTimeout(() => {
      closingRef.current = null; setClosingDay(null); wakeRef.current();
    }, ms(T_OUT));
    wakeRef.current();
  }, []);

  const planPile = useCallback((list: Task[]) => {
    const { w, h } = sizeRef.current;
    return pileOf(list, new Date(), pileWOf(w), h - navHeightPx() - MASTHEAD_H);
  }, []);

  const dropAll = useCallback(() => {
    const M = matterRef.current; const engine = engineRef.current;
    const { w, h } = sizeRef.current;
    if (!M || !engine || !w) return;
    clearLanes();
    M.Composite.remove(engine.world, piecesRef.current.map((p) => p.body));
    shardsRef.current = [];
    // ★種を引き直す ―**落とし直すたびに違う山**になる(第60巡)。
    const seed = String(Date.now() % 100000);
    seedRef.current = seed;
    const { keep, scale } = planPile(tasksRef.current);
    scaleRef.current = scale;
    const unit = UNIT * scale;
    const added = [
      ...dropOrder(keep, new Date()).map((t, i) => makePiece(M, t, viewRef.current, w, i, unit, seed)),
      ...pileWordPieces(M, w, seed),
    ];
    M.Composite.add(engine.world, added.map((p) => p.body));
    piecesRef.current = added;
    rebuildWalls(M, engine, w, h, true);
    engine.gravity.y = GRAVITY_Y;
    engine.enableSleeping = true;
    openedRef.current = false;
    wake(); drawRef.current();
  }, [wake, planPile, clearLanes]);
  dropAllRef.current = dropAll;


  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let disposed = false;
    const setup = async () => {
      const M = await import("matter-js");
      if (disposed) return;
      matterRef.current = M;
      sizeRef.current = { w: el.offsetWidth, h: el.offsetHeight };
      const engine = M.Engine.create({ enableSleeping: true });
      engine.gravity.y = GRAVITY_Y;
      engineRef.current = engine;
      rebuildWalls(M, engine, sizeRef.current.w, sizeRef.current.h);
      draw(); setReady(true);
    };
    setup();
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth; const h = el.offsetHeight;
      if (Math.abs(w - sizeRef.current.w) < 0.5 && Math.abs(h - sizeRef.current.h) < 0.5) return;
      sizeRef.current = { w, h };
      const M = matterRef.current; const engine = engineRef.current;
      if (M && engine) { rebuildWalls(M, engine, w, h, !openedRef.current, laneBodiesRef.current); wake(); }
    });
    ro.observe(el);
    return () => { disposed = true; ro.disconnect(); cancelAnimationFrame(rafRef.current); runningRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ★★GRAVITY が**表に出るたびに落とし直す**(第60巡にユーザー指定「開いたりする
  //   たびに毎回ランダムに図形が落ちるように」)。DRIFT から戻ったとき・アプリを
  //   切り替えて戻ったときが「開いた」にあたる。山の途中(ALIGN/TIMELINE)では黙る。
  const shownRef = useRef(false);
  useEffect(() => {
    const on = !!appActive && active;
    if (on && !shownRef.current && ready) {
      // ★ALIGN / TIMELINE を開いたまま離れていても、**戻ってきたら山からやり直す**。
      //   開いたままの層に戻されると「開いたら図形が落ちる」が起きないうえ、
      //   前に見ていた状態が置き去りになっていることに気づけない。
      if (modeRef.current !== "pile") { modeRef.current = "pile"; setMode("pile"); }
      phaseRef.current = null;
      itemsRef.current = []; setItems([]);
      expandedRef.current = null; setExpanded(null);
      window.clearTimeout(closeTRef.current); setClosingDay(null);
      backRef.current = new Set();
      riseRef.current = 0; riseDragRef.current = true; riseSRef.current = spring(0);
      dropAll();
    }
    shownRef.current = on;
  }, [appActive, active, ready, dropAll]);

  useEffect(() => {
    if (modeRef.current !== "pile" || phaseRef.current) return;
    const M = matterRef.current; const engine = engineRef.current;
    const { w } = sizeRef.current;
    if (!M || !engine || !w) return;
    const { keep, scale } = planPile(tasks);
    const keepIds = new Set(keep.map((t) => t.id));
    const shownIds = new Set(piecesRef.current.map((p) => p.id));
    const aliveIds = new Set(tasks.map((t) => t.id));
    const pushedOut = [...shownIds].some((id) => !keepIds.has(id) && aliveIds.has(id));
    if (piecesRef.current.length && pushedOut) { dropAll(); return; }
    const rescale = piecesRef.current.length > 0 && Math.abs(scale - scaleRef.current) > SCALE_EPS;
    scaleRef.current = scale;
    const unit = UNIT * scale;
    const alive = new Map(keep.map((t) => [t.id, t]));
    // ★日付・曜日の板(`p.word`)は**タスクの増減と無関係**にそのまま残す(第60巡)。
    for (const p of piecesRef.current) if (!p.word && !alive.has(p.id)) M.Composite.remove(engine.world, p.body);
    piecesRef.current = piecesRef.current.filter((p) => p.word || alive.has(p.id)).map((p) => {
      if (p.word) return p;
      const t = alive.get(p.id) as Task;
      const paint = paintOf(t, viewRef.current);
      if (rescale || !sameShape(p.spec, paint.spec)) {
        const { body, ox, oy } = makeBody(M, paint, p.body.position.x, p.body.position.y, unit);
        M.Body.setAngle(body, p.body.angle); M.Body.setVelocity(body, p.body.velocity);
        M.Composite.remove(engine.world, p.body); M.Composite.add(engine.world, body);
        return { ...p, body, spec: paint.spec, paint, girth: girthOf(paint, unit), ox, oy, unit };
      }
      return { ...p, paint };
    });
    const have = new Set(piecesRef.current.map((p) => p.id));
    const added: Piece[] = dropOrder(keep, new Date()).filter((t) => !have.has(t.id))
      .map((t, i) => makePiece(M, t, viewRef.current, w, i, unit, seedRef.current));
    // 板がまだ無ければ(初回の組み立て)ここで落とす。
    if (!piecesRef.current.some((p) => p.word)) added.push(...pileWordPieces(M, w, seedRef.current));
    if (added.length) {
      M.Composite.add(engine.world, added.map((p) => p.body));
      piecesRef.current = [...piecesRef.current, ...added];
    }
    wake();
  }, [tasks, wake, ready, planPile, dropAll]);

  // ── モードの出入り ─────────────────────────────────────────
  const buildItems = useCallback((): Item[] => {
    const today = new Date();
    return [...tasksRef.current].sort((a, b) => areaOf(b, today) - areaOf(a, today)).map((t) => {
      // ★★ALIGN の図形は**文字を持たない**(第65巡)。題は右の行に大きく出るので、
      //   図形の中にも同じ題があると二重になる(ユーザー指摘)。
      const paint = paintOf(t, "none");
      return { id: t.id, task: t, paint, spec: paint.spec, tag: paint.tag ?? "" };
    });
  }, []);

  const snapshot = useCallback((list: Item[]) => {
    const { w, h } = sizeRef.current;
    const pileUnit = UNIT * scaleRef.current;
    const from = new Map<string, Slot>();
    const byId = new Map(piecesRef.current.map((p) => [p.id, p]));
    for (const it of list) {
      const p = byId.get(it.id);
      // ★★★控えるのは**見た目の中心**(第63巡)。山は
      //   `translate(位置) → rotate(角) → drawImage(ox - w/2, oy - h/2)` で描くので、
      //   絵の中心は `位置 + rotate(ox, oy, 角)`。`ox/oy` を足さないと、ALIGN の判定が
      //   入った瞬間にそのぶんだけ**figure が飛ぶ**(ユーザー指摘)。
      if (p) {
        const ca = Math.cos(p.body.angle); const sa = Math.sin(p.body.angle);
        from.set(it.id, {
          x: p.body.position.x + p.ox * ca - p.oy * sa,
          y: p.body.position.y + p.ox * sa + p.oy * ca,
          s: pileUnit / bakeUnitRef.current, a: p.body.angle, o: 1,
        });
      }
      else from.set(it.id, { x: w * (0.2 + 0.6 * frac(it.id)), y: h + 140, s: pileUnit / bakeUnitRef.current, a: 0, o: 1 });
    }
    fromRef.current = from;
    curRef.current = new Map(from);
    outSRef.current = new Map(); inSRef.current = new Map();
  }, []);

  const bakeUnitFor = useCallback((list: Item[], maxH: number, maxW: number) => {
    let mh = 1; let mw = 1;
    for (const it of list) {
      const b = shapeBounds(it.paint);
      mh = Math.max(mh, b.maxY - b.minY); mw = Math.max(mw, b.maxX - b.minX);
    }
    return Math.min(maxH / mh, maxW / mw);
  }, []);

  const enterAlign = useCallback(() => {
    const list = buildItems();
    if (!list.length) return;
    bakeUnitRef.current = bakeUnitFor(list, ALIGN_MAX_H, ALIGN_MAX_W);
    itemsRef.current = list; setItems(list);
    scrollRef.current = flick(0); posSRef.current = new Map();
    focusRef.current = 0; setFocusIdx(0);
    slotRef.current = new Map();
    snapshot(list); layoutAlign();
    // ★★日付・曜日の板も**一緒に飛ばす**(第61巡にユーザー指定「消えずに、一緒に
    //   飛んでいくように」)。円弧には入らないので、いまの位置だけ控えて道を走らせる。
    flyRef.current = piecesRef.current.filter((p) => p.word).map((p) => ({
      word: p.word as string, fs: p.wordFs ?? 32, sx: p.wordSx ?? 1,
      dx: p.wordDx ?? 0, dy: p.wordDy ?? 0, fam: p.wordFam ?? SANS, ink: p.wordInk ?? MUTED,
      bw: p.wordW ?? 40, bh: p.wordH ?? 20,
      from: { x: p.body.position.x, y: p.body.position.y, a: p.body.angle },
    }));
    flyCurRef.current = flyRef.current.map((f) => ({ x: f.from.x, y: f.from.y, s: 1, a: f.from.a, o: 1 }));
    modeRef.current = "align"; setMode("align");
    outDroppedRef.current = false;   // ★念のため(入りのあいだ山を描かない)
    phaseRef.current = "align-in"; t0Ref.current = performance.now();
    const engine = engineRef.current;
    if (engine) engine.gravity.y = 0;
    haptic(10); wake();
  }, [buildItems, bakeUnitFor, snapshot, layoutAlign, wake]);

  /** ★★TIMELINE を開く … 床を抜いて、あとは物理に任せる。 */
  const openTimeline = useCallback(() => {
    const M = matterRef.current; const engine = engineRef.current;
    const { w, h } = sizeRef.current;
    if (!M || !engine) return;
    const today = new Date();
    const ds: string[] = [];
    for (let i = 0; i < HORIZON; i += 1) { const d = new Date(today); d.setDate(today.getDate() + i); ds.push(ymd(d)); }
    daysRef.current = ds; setDays(ds);
    // ★日付のあるタスクだけを列へ振り分ける(第55巡にユーザー指定)。
    //   ★★日付の無いものは**その場で消さず、一緒に落として**画面の下で消える
    //   (第56巡のユーザー指摘。world から remove すると瞬間で消えて事故に見える)。
    const dated = tasksRef.current.filter((t) => t.dueDate && ds.includes(t.dueDate));
    const laneW = w / LANES_VISIBLE;
    let mw = 1; let mh = 1;
    for (const t of dated) {
      const b = shapeBounds(paintOf(t, viewRef.current));
      mw = Math.max(mw, b.maxX - b.minX); mh = Math.max(mh, b.maxY - b.minY);
    }
    tlUnitRef.current = Math.min((laneInner(laneW) * TL_FILL) / mw, (LANE_HEAD_H * 2.0) / mh);
    // いま山に居るものはその位置のまま落とし、居ないものは上から入れる。
    const byId = new Map(piecesRef.current.map((p) => [p.id, p]));
    const keepIds = new Set(dated.map((t) => t.id));
    const next: Piece[] = [];
    // 日付の無いものは `lane = -1` のまま落ちるに任せる(下へ出たら `recycle` が畳む)。
    for (const p of piecesRef.current) {
      if (keepIds.has(p.id)) continue;
      setFilter(p.body, FILTER_FALL);
      M.Sleeping.set(p.body, false);
      next.push({ ...p, lane: -1 });
    }
    dated.forEach((t, i) => {
      const lane = ds.indexOf(t.dueDate as string);
      const had = byId.get(t.id);
      if (had) {
        // ★山に居たものは**その場から落ちる**。落ちきるまではレーンの器をすり抜ける。
        setFilter(had.body, FILTER_FALL);
        M.Sleeping.set(had.body, false);
        next.push({ ...had, lane });
        return;
      }
      // 山に居なかったものは、はじめから自分の列の真上へ置いて落とす。
      const p = makePiece(M, t, viewRef.current, w, i, tlUnitRef.current);
      setFilter(p.body, FILTER_HELD);
      const r1 = frac(t.id); const r2 = frac(t.id + "y"); const r3 = frac(t.id + "w");
      // ★★湧く高さは**画面の上(負のy)**(第60巡)。第59巡までは `bandTop` から数えて
      //   いたので、実際には画面の**真ん中あたり**に現れて「途中から急に出てくる」
      //   ように見えていた(ユーザー指摘)。`recycle` と同じ ―「上から降ってくる」。
      M.Body.setPosition(p.body, {
        x: laneW * lane + laneW / 2 + (r1 - 0.5) * laneW * 0.30,
        y: -RECYCLE_Y * (0.7 + r2 * 1.6) - i * 30,
      });
      M.Body.setVelocity(p.body, { x: (r1 - 0.5) * 1.6, y: r2 * 2.2 });
      M.Body.setAngle(p.body, (r3 - 0.5) * 0.9);
      M.Body.setAngularVelocity(p.body, (r3 - 0.5) * 0.16);
      M.Composite.add(engine.world, p.body);
      next.push({ ...p, lane });
    });
    // ★★タスクが無い日には「自由」のブロックを落とす(第56巡にユーザー指定)。
    //   空白のままだと、俯瞰したときに**空いている理由**が読めない。
    const busy = new Set(dated.map((t) => t.dueDate as string));
    const free = freeGeom(laneW);                 // ★字面も詰める先も語によらず1つ
    ds.forEach((key, lane) => {
      if (busy.has(key)) return;
      const r = frac(key + "free");
      // ★★こちらも**画面の上から**落とす(第60巡)。
      const wp = makeWordPiece(M, freeWordOf(key), `free:${key}`, free.room, free.fs,
        laneW * lane + laneW / 2 + (r - 0.5) * laneW * 0.2,
        -RECYCLE_Y * (0.7 + r * 1.8) - lane * 24, MUTED, SANS);
      if (!wp) return;
      setFilter(wp.body, FILTER_HELD);
      // ★図形と同じく**回りながら**落ちる(第61巡。回転を止めていたのが
      //   「角度が変わらずゆっくり降りてくる」の正体)。
      // ★初速と回りは**控えめに**。平たい板は寝るのが安定なので、強く回すと
      //   短い辺で立ったり逆さまになったりして読めない。物理は図形と同じまま、
      //   入りだけ穏やかにして「読める側」へ寄せる(第62巡にもう一段)。
      M.Body.setVelocity(wp.body, { x: (r - 0.5) * 0.8, y: r * 2.2 });
      M.Body.setAngle(wp.body, (r - 0.5) * 0.25);
      M.Body.setAngularVelocity(wp.body, (r - 0.5) * 0.03);
      M.Composite.add(engine.world, wp.body);
      next.push({ ...wp, lane });
    });
    piecesRef.current = next;
    expandedRef.current = null; setExpanded(null);
    worldRef.current = spring(0); worldTargetRef.current = 0; gapRef.current = spring(0);
    panBeforeRef.current = null; closingRef.current = null;
    rebuildWalls(M, engine, w, h, false, laneBodiesRef.current);   // ★床を抜く
    buildLanes();
    engine.gravity.y = GRAVITY_Y;
    engine.enableSleeping = true;
    openedRef.current = true;
    for (const p of piecesRef.current) M.Sleeping.set(p.body, false);
    haptic(12); wake();
  }, [buildLanes, wake]);

  /** ★★TIMELINE を閉じる … **開くときの鏡**(第58巡にユーザー指定)。
   *  `dropAll()` で作り直すと図形が入れ替わって繋がらない。**同じ物体を落とし続け**、
   *  画面の下へ出たものから山の上へ引き上げて降らせる。 */
  const closeTimeline = useCallback(() => {
    const M = matterRef.current; const engine = engineRef.current;
    const { w, h } = sizeRef.current;
    if (!M || !engine) return;
    if (phaseRef.current === "tl-out") return;
    expandedRef.current = null; setExpanded(null);
    openedRef.current = false;
    // レーンの器を外し、床は**抜いたまま**。全部が落下の層へ戻って落ちる。
    clearLanes();
    // ★★★**画面の外の列に居るものを、壁を張る前に片づける**(2026-08-26・第67巡)。
    //   横スクロールは `syncLanes` が **物体そのものを動かして**いるので、画面外の
    //   列の物体は物理座標で `0..w` の**外**に居る。そこへ側壁を張り直すと、
    //   matter が「壁にめり込んでいる」と解いて**画面の中へ押し戻す** ―
    //   これがユーザー報告「隣の列がある画面内の端の列に自由が増える／
    //   ワープしてくる」の正体（落下が途中で止まって見えるのも同じ壁）。
    //   → 「自由」は飾りなので**その場で消す**（もともと画面の外で見えていない）。
    //     タスクは消せないので、**画面の下**へ移してやり、`recycleToPile` の
    //     いつもの道（下へ出たものを山の上へ引き上げる）に乗せる。
    {
      const outside = piecesRef.current.filter(
        (p) => p.body.position.x < 0 || p.body.position.x > w,
      );
      const gone = new Set(outside.filter((p) => p.word).map((p) => p.id));
      if (gone.size) {
        M.Composite.remove(engine.world,
          outside.filter((p) => gone.has(p.id)).map((p) => p.body));
        piecesRef.current = piecesRef.current.filter((p) => !gone.has(p.id));
      }
      for (const p of outside) {
        if (gone.has(p.id)) continue;
        M.Body.setPosition(p.body, {
          x: PILE_INSET + pileWOf(w) * (0.1 + 0.8 * frac(p.id + "out")),
          y: h + RECYCLE_Y,
        });
        M.Body.setVelocity(p.body, { x: 0, y: 0 });
        M.Body.setAngularVelocity(p.body, 0);
      }
    }
    rebuildWalls(M, engine, w, h, false);
    const { scale } = pileOf(tasksRef.current, new Date(), pileWOf(w), h - navHeightPx() - MASTHEAD_H);
    scaleRef.current = scale;
    // ★★「自由」の板も**一緒に落とす**(第59巡)。ここで world から外すと、下へ払った
    //   瞬間に消えてしまう ―「閉じるアニメーションが無い」の正体のひとつ。
    //   画面の下へ出たところで `recycleToPile` が畳む。
    for (const p of piecesRef.current) {
      setFilter(p.body, FILTER_FALL);
      M.Sleeping.set(p.body, false);
    }
    backRef.current = new Set();
    // ★★`mode` は **timeline のまま**。ここで `pile` にすると帯も縦線も即座に
    //   消える(第59巡のユーザー指摘)。潰れ切って全部が山へ戻ってから切り替える。
    phaseRef.current = "tl-out";
    engine.gravity.y = GRAVITY_Y;
    haptic(8); wake();
  }, [clearLanes, wake]);

  const enterPileFromTimeline = useCallback(() => {
    riseDragRef.current = false;      // 潰れはバネが 0 へ運ぶ
    closeTimeline();
  }, [closeTimeline]);

  /** ★★下へ払って **DRIFT へ移る**。★第62巡から、ここは**タブを変えるだけ**。
   *  カメラのパンと効果線は `components/tasks/TaskSpace.tsx` が持つ。 */
  const enterDrift = useCallback(() => {
    if (phaseRef.current) return;
    haptic(12);
    goTabRef.current("tasks-drift");
  }, []);

  const leaveAlign = useCallback(() => {
    // ★★**入りの途中でも閉じられる**(第60巡)。入りは図形の数だけ長くなるので、
    //   終わるまで待たせると「払っても何も起きない」時間が生まれる。
    //   いまの位置(`curRef`)から折り返すので、途中で切っても継ぎ目が出ない。
    fromRef.current = new Map(curRef.current);
    inSRef.current = new Map();
    outSRef.current = new Map();
    outDroppedRef.current = false;
    phaseRef.current = "align-out"; t0Ref.current = performance.now();
    haptic(8); wake();
  }, [wake]);

  const patch = (id: string, p: Partial<ComposerData>) => {
    const next: AppState = structuredClone(appState);
    const t = next.tasks.find((x) => x.id === id);
    if (t) Object.assign(t, p);
    persist(next);
  };

  const burst = useCallback((id: string) => {
    const piece = piecesRef.current.find((p) => p.id === id);
    if (!piece) return;
    const { x, y } = piece.body.position;
    const fill = tagColor(piece.paint.tag);
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
      const sp = 2 + Math.random() * 4;
      shardsRef.current.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, r: piece.girth * (0.1 + Math.random() * 0.12), life: 1, fill });
    }
    const M = matterRef.current;
    if (M) for (const p of piecesRef.current) M.Sleeping.set(p.body, false);
  }, []);

  const complete = (t: Task, final: ComposerData) => {
    haptic(18);
    if (modeRef.current !== "align") { burst(t.id); wake(); }
    const next: AppState = structuredClone(appState);
    const task = next.tasks.find((x) => x.id === t.id);
    if (task) { Object.assign(task, final); task.done = true; task.doneAt = new Date().toISOString(); }
    persist(next); setOpenId(null); showToast("完了しました");
  };
  const completeById = useCallback((id: string) => {
    haptic(20); burst(id);
    const next: AppState = structuredClone(appState);
    const task = next.tasks.find((x) => x.id === id);
    if (task) { task.done = true; task.doneAt = new Date().toISOString(); }
    persist(next); showToast("完了しました"); wake();
  }, [appState, persist, showToast, burst, wake]);

  const remove = (id: string) => {
    setOpenId(null);
    const next: AppState = structuredClone(appState);
    next.tasks = next.tasks.filter((x) => x.id !== id);
    persist(next);
  };
  const removeRef = useRef(remove);
  removeRef.current = remove;

  const seedDemo = () => {
    const next: AppState = structuredClone(appState);
    next.tasks = [...demoTasks(), ...(next.tasks ?? [])];
    persist(next); showToast("デモのタスクを入れました");
  };

  const pieceAt = useCallback((px: number, py: number): Piece | null => {
    const M = matterRef.current;
    if (!M) return null;
    const hits = M.Query.point(piecesRef.current.map((p) => p.body), { x: px, y: py });
    if (!hits.length) return null;
    return piecesRef.current.find((p) => p.body === hits[hits.length - 1]) ?? null;
  }, []);

  /** ★★★スロットが**場の外へ出た**か(2026-08-26・第65巡)。
   *  第64巡までは「濃さが薄いか」(`o < 0.2`)で描画も当たり判定も切っていた ―
   *  つまり**霧が3つの仕事を兼ねて**いた。霧をやめたので、**幾何で判る**ようにする。
   *  円弧が行を左と下へ運び去るので、画面の外に出たものは描かないし、触れない。 */
  const offField = useCallback((c: { x: number; y: number; s: number }) => {
    const { w } = sizeRef.current;
    const { top, floor } = fieldOf();
    const half = (ALIGN_MAX_W * Math.max(0.2, c.s)) / 2;
    return c.x + half < 0 || c.x - half > w || c.y < top - ALIGN_MAX_H || c.y > floor + ALIGN_MAX_H;
  }, [fieldOf]);
  offFieldRef.current = offField;

  const itemAt = useCallback((px: number, py: number): Item | null => {
    const bakeUnit = bakeUnitRef.current;
    for (let i = itemsRef.current.length - 1; i >= 0; i -= 1) {
      const it = itemsRef.current[i];
      const c = curRef.current.get(it.id);
      // ★描くのと**同じ判定**で触れるかを決める(出どころを1つに)。
      if (!c || c.o <= 0.01 || offField(c)) continue;
      const b = shapeBounds(it.paint);
      const hw = ((b.maxX - b.minX) * bakeUnit * c.s) / 2;
      const hh = ((b.maxY - b.minY) * bakeUnit * c.s) / 2;
      if (px >= c.x - hw && px <= c.x + hw && py >= c.y - hh && py <= c.y + hh) return it;
    }
    return null;
  }, [offField]);

  const tapAt = (clientX: number, clientY: number) => {
    if (dragged?.current) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const px = clientX - r.left; const py = clientY - r.top;
    if (modeRef.current === "timeline") {
      const band = bandRef.current?.getBoundingClientRect();
      if (band && clientY >= band.top && clientY <= band.bottom) {
        const laneW = laneWOf();
        const sel = expandedRef.current;
        // どのレーンをたたいたか(いまの隙間を戻して数える)。
        let li = -1;
        for (let i = 0; i < daysRef.current.length; i += 1) {
          const l = laneLeft(i);
          if (px >= l && px < l + laneW) { li = i; break; }
        }
        if (li >= 0) {
          const nextSel = sel === li ? null : li;
          if (nextSel === null) collapseDay();   // ★位置を戻すのは `collapseDay`
          else {
            window.clearTimeout(closeTRef.current);
            closingRef.current = null; setClosingDay(null);
            // ★開く**前**の位置を控える(まだ開いていないときだけ)。
            if (panBeforeRef.current === null) panBeforeRef.current = worldTargetRef.current;
            expandedRef.current = nextSel; setExpanded(nextSel);
            // ★たたいた曜日は**画面の左端(余白ぶん内側)**へ。
            worldTargetRef.current = laneW * nextSel - PAD_L;
          }
          haptic(8); wake();
        }
        return;
      }
      if (expandedRef.current !== null) { collapseDay(); wake(); return; }
    }
    if (modeRef.current !== "align") {
      const piece = pieceAt(px, py);
      // ★「自由」のブロックはタスクではないので開かない。
      if (piece && !piece.word) { haptic(8); setOpenId(piece.id); }
      return;
    }
    const it = itemAt(px, py);
    if (it) { haptic(8); setOpenId(it.id); }
  };

  // ── ジェスチャー ───────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current; const root = rootRef.current;
    if (!wrap || !root) return;
    let g: {
      id: number; x: number; y: number; edge: boolean; axis: "" | "x" | "y";
      moved: boolean; lastX: number; lastY: number; vy: number;
      /** ALIGN の縦送り … 払い始めの位置と、指の累積(px)。 */
      p0: number; accum: number;
    } | null = null;

    /** ★曜日の伸びを**指のフレームで直接** `--tl` へ書く。rAF を待つと1フレーム
     *  遅れ、速い払いでは置いていかれる(第57巡にユーザー指摘)。伸びの速さも控えて、
     *  離したときのバネの初速に渡す。 */
    const pullTo = (v: number, tms: number) => {
      riseDragRef.current = true;
      const dt = Math.max(8, tms - riseTRef.current);
      riseVRef.current = ((v - riseRef.current) / dt) * (1000 / 60);
      riseTRef.current = tms;
      riseRef.current = v;
      const band = bandRef.current;
      if (band) band.style.setProperty("--tl", String(TL_FLAT + (1 - TL_FLAT) * v));
    };

    const beginHold = () => {
      const gr = grabRef.current; const M = matterRef.current; const engine = engineRef.current;
      if (!gr || !M || !engine) return;
      if (g?.moved) { grabRef.current = null; return; }
      gr.held = true;
      // ★★掴んでいる間は**眠らせない**。眠っている物体は当たり判定が起きず、
      //   掴んだ図形がすり抜けて見える(第55巡に実機で発覚)。
      engine.enableSleeping = false;
      // ★★掴んでいる間は**無重力**(第58巡にユーザー指定)。重力があると、運んでいる
      //   図形が下へ引かれ続けて口やブラックホールへ寄せにくい。離したら戻す。
      engine.gravity.y = 0;
      for (const p of piecesRef.current) M.Sleeping.set(p.body, false);
      haptic(10); setHolding(true); wake();
    };

    const down = (e: PointerEvent) => {
      if (g) return;
      if (!visibleRef.current) return;
      if (document.documentElement.hasAttribute("data-overlay")) return;
      if ((e.target as HTMLElement | null)?.closest("button")) return;
      if (dragged) dragged.current = false;
      const r = wrap.getBoundingClientRect();
      const edge = e.clientX - r.left < EDGE_PX;
      if (modeRef.current !== "align" && !phaseRef.current && !edge) {
        const p = pieceAt(e.clientX - r.left, e.clientY - r.top);
        // ★「自由」のブロックは掴まない(完了も削除もできないため)。
        if (p && !p.word) {
          grabRef.current = {
            piece: p, dx: p.body.position.x - (e.clientX - r.left), dy: p.body.position.y - (e.clientY - r.top),
            held: false, holdT: window.setTimeout(beginHold, HOLD_MS),
            vx: 0, vy: 0, lastX: e.clientX, lastY: e.clientY,
          };
        }
      }
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, edge, axis: "", moved: false, lastX: e.clientX, lastY: e.clientY, vy: 0, p0: scrollRef.current.p, accum: 0 };
      // ★指を置いたら投げは終わり(吸着を止める)。ここで止めないと指の下で戻る。
      if (modeRef.current === "align") { scrollRef.current.v = 0; scrollRef.current.armed = false; }
      if (modeRef.current === "timeline") wDragRef.current = false;
    };

    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x; const dy = e.clientY - g.y;
      if (!g.axis) {
        if (Math.abs(dx) < AXIS_PX && Math.abs(dy) < AXIS_PX) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (Math.hypot(dx, dy) > TAP_MOVE) { g.moved = true; if (dragged) dragged.current = true; }

      const gr = grabRef.current;
      if (gr) {
        if (!gr.held && g.moved) { window.clearTimeout(gr.holdT); grabRef.current = null; }
        else if (gr.held) {
          // ★★velocity で運ぶ。動く物体のままなので、他の図形を**押しのける**。
          const M = matterRef.current;
          const r = wrap.getBoundingClientRect();
          if (M) {
            const tx = e.clientX - r.left + gr.dx; const ty = e.clientY - r.top + gr.dy;
            const b = gr.piece.body;
            let vx = (tx - b.position.x) * GRAB_K; let vy = (ty - b.position.y) * GRAB_K;
            const sp = Math.hypot(vx, vy);
            if (sp > GRAB_MAX) { vx = (vx / sp) * GRAB_MAX; vy = (vy / sp) * GRAB_MAX; }
            M.Body.setVelocity(b, { x: vx, y: vy });
            M.Body.setAngularVelocity(b, 0);
            M.Sleeping.set(b, false);
          }
          gr.vx = e.clientX - gr.lastX; gr.vy = e.clientY - gr.lastY;
          gr.lastX = e.clientX; gr.lastY = e.clientY;
          // ★近さも一緒に的へ書く(口が開いて寄る／ブラックホールが速く回る)。
          const t = aimTargets(mouthRef.current, trashRef.current, e.clientX, e.clientY);
          setHover((cur) => (cur === t ? cur : t));
          wake(); g.lastX = e.clientX; g.lastY = e.clientY;
          return;
        }
      }

      const m = modeRef.current;
      if (m === "pile" && !phaseRef.current && g.axis === "y" && dy > 0) {
        // ★★下へ払うと **DRIFT へ移る**(第61巡にユーザー確定)。候補の層は山の**上**に
        //   在るので、世界を下へ送るとそこへ上がる ― 図形は下へ吹き飛ぶ。
        if (dy > SWIPE_PX) enterDrift();
      } else if (m === "pile" && !phaseRef.current && g.axis === "y" && dy < 0) {
        // ★曜日が指に追従して伸びる。伸び切る手前で**床が抜ける**(＝合図)。
        if (!tlDragRef.current) {
          tlDragRef.current = true;
          modeRef.current = "timeline"; setMode("timeline");
        }
        pullTo(rubberRise(-dy / TL_SPAN), e.timeStamp);
        if (!openedRef.current && riseRef.current >= TL_TRIGGER) openTimeline();
        wake();
      } else if (m === "timeline" && openedRef.current && !tlDragRef.current
                 && phaseRef.current !== "tl-out" && g.axis === "y" && dy > 0) {
        // ★★閉じるのも**指に追従して潰れる**(開くときの鏡。第59巡)。
        //   潰れが合図を切ったら床が抜けて、そのまま落ちる。
        pullTo(Math.max(0, 1 - dy / TL_SPAN), e.timeStamp);
        if (riseRef.current <= 1 - TL_TRIGGER) { riseDragRef.current = false; closeTimeline(); }
        wake();
      } else if (m === "timeline" && tlDragRef.current && g.axis === "y") {
        pullTo(rubberRise(-dy / TL_SPAN), e.timeStamp);
        if (!openedRef.current && riseRef.current >= TL_TRIGGER) openTimeline();
        wake();
      } else if (m === "align" && !phaseRef.current && g.axis === "y") {
        const d = e.clientY - g.lastY;
        const last = Math.max(0, itemsRef.current.length - 1);
        // ★★**指の累積の道のり**を番号へ戻す(`arcInv`)。1イベントずつ換算すると、
        //   間隔が場所で違うぶんだけ**払うほどズレていく**(上の `arcInv` を見よ)。
        g.accum += d;
        scrollRef.current.v = 0; scrollRef.current.armed = false;
        scrollRef.current.p = Math.max(-0.4, Math.min(last + 0.4, g.p0 + arcInv(-g.accum)));
        syncFocus(); g.vy = d; wake();
      } else if (m === "timeline" && !tlDragRef.current && g.axis === "x" && expandedRef.current === null) {
        const laneW = laneWOf();
        const max = Math.max(0, laneW * (daysRef.current.length - LANES_VISIBLE));
        wDragRef.current = true;
        window.clearTimeout(panTRef.current);
        rulesRef.current?.style.setProperty("--pan", "1");
        const nx = Math.max(0, Math.min(max, worldRef.current.p - (e.clientX - g.lastX)));
        // ★速さは**時間で割って1ステップぶんへ**そろえる(120Hz で半分にならない／
        //   離す直前に指が止まっても直近の値が残る)。DRIFT の投げと同じ作法。
        const dt = Math.max(8, e.timeStamp - wTRef.current);
        const nv = ((nx - worldRef.current.p) / dt) * (1000 / 60);
        if (Math.abs(nv) > 0.3) wVRef.current = nv;
        wTRef.current = e.timeStamp;
        worldRef.current.v = nv;
        worldRef.current.p = nx;
        worldTargetRef.current = nx;
        wake();
      }
      g.lastX = e.clientX; g.lastY = e.clientY;
    };

    const up = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const d = g; g = null;
      const dx = e.clientX - d.x; const dy = e.clientY - d.y;
      const m = modeRef.current;

      const gr = grabRef.current;
      if (gr) {
        const M = matterRef.current; const engine = engineRef.current;
        window.clearTimeout(gr.holdT);
        if (gr.held && M) {
          const t = targetAt(mouthRef.current, trashRef.current, e.clientX, e.clientY);
          grabRef.current = null; setHolding(false); setHover(null);
          if (engine) { engine.enableSleeping = true; engine.gravity.y = GRAVITY_Y; }
          if (t) {
            fireTarget(t === "mouth" ? mouthRef.current : trashRef.current);
            if (t === "mouth") completeById(gr.piece.id);
            else { haptic(14); burst(gr.piece.id); removeRef.current(gr.piece.id); }
          } else M.Sleeping.set(gr.piece.body, false);   // 速度は残っているのでそのまま飛ぶ
          wake(); return;
        }
        grabRef.current = null; setHolding(false); setHover(null);
        const en = engineRef.current;
        if (en) { en.enableSleeping = true; en.gravity.y = GRAVITY_Y; }
      }

      if (tlDragRef.current) {
        tlDragRef.current = false;
        if (openedRef.current) {
          // ★瞬間で 1 に飛ばさず、**いま伸びている所から・いまの速さのまま**
          //   バネへ引き渡す。速く払って離すと少し行き過ぎてから規定へ収まる。
          riseSRef.current = spring(riseRef.current, riseVRef.current);
          riseDragRef.current = false;
          haptic(10);
        } else { modeRef.current = "pile"; setMode("pile"); riseRef.current = 0; riseDragRef.current = true; }
        wake(); return;
      }
      if (!d.moved) { tapAt(e.clientX, e.clientY); return; }

      if (m === "pile") {
        if (d.edge && d.axis === "x" && dx > SWIPE_PX && !phaseRef.current) enterAlign();
      } else if (m === "align" && phaseRef.current === "align-in") {
        // ★入っている最中でも、左へ払えば折り返して閉じる。
        if (d.axis === "x" && dx < -SWIPE_PX) leaveAlign();
      } else if (m === "align" && !phaseRef.current) {
        if (d.axis === "x" && dx < -SWIPE_PX) leaveAlign();
        // 投げ。減衰しきったところで最寄りの整数へ。連鎖ばねが遅れて追う。
        else if (d.axis === "y") { flickThrow(scrollRef.current, d.vy, ARC_RATE); wake(); }
      } else if (m === "timeline") {
        if (d.axis === "y" && dy > SWIPE_PX) {
          if (expandedRef.current !== null) { collapseDay(); wake(); }
          else enterPileFromTimeline();
        } else if (d.axis === "x") {
          wDragRef.current = false;
          // ★離してすぐには消さない ― 送り終わった位置を読む間だけ残す(第59巡)。
          window.clearTimeout(panTRef.current);
          panTRef.current = window.setTimeout(() => {
            rulesRef.current?.style.setProperty("--pan", "0");
          }, ms(T_OUT));
          const laneW = laneWOf();
          const max = Math.max(0, laneW * (daysRef.current.length - LANES_VISIBLE));
          // ★★**投げを先に伸ばしてから**レーンを決める(第57巡)。いきなり最寄りへ
          //   丸めると、半レーンぶんの払いは**必ず元へ戻る**(ユーザー指摘の「引き
          //   戻される」)。速い払いは切り上げ／切り捨てで**最低1レーンは送る**。
          const v = wVRef.current;
          const proj = worldRef.current.p + v * WORLD_FLING;
          const idx = Math.abs(v) > 2
            ? (v > 0 ? Math.ceil(proj / laneW) : Math.floor(proj / laneW))
            : Math.round(proj / laneW);
          wVRef.current = 0;
          worldTargetRef.current = Math.max(0, Math.min(max, idx * laneW));
          wake();
        }
      }
    };

    root.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      root.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enterAlign, openTimeline, enterPileFromTimeline, closeTimeline, leaveAlign, enterDrift, collapseDay, syncFocus, wake, pieceAt, completeById, burst, laneWOf, laneLeft]);

  const today = new Date();
  const { w: sw } = sizeRef.current;
  const laneW = (sw || 390) / LANES_VISIBLE;
  // ★幅の軸を細く(`WD_WDTH`)したぶん、**同じレーン幅でより大きく**できる
  //   … 変形せずに「少し縦長」になる(第56巡にユーザー確定)。
  const laneFs = Math.min(SWISS_XL, Math.floor((laneW * 0.92) / (3 * WD_ADV)));
  // ★閉じている途中も**同じ日を出したまま**にして、拭き取りを逆再生する。
  const shownIdx = expanded ?? closingDay;
  const expandedDay = shownIdx !== null ? days[shownIdx] : null;
  const expandedTasks = useMemo(
    () => (expandedDay ? tasks.filter((t) => t.dueDate === expandedDay) : []),
    [expandedDay, tasks],
  );
  // ★描画ループは state を読めないので控えを置く(行を図形の高さへ置くのに使う)。
  expandedTasksRef.current = expandedTasks;

  return (
    <div ref={rootRef} style={{ position: "absolute", inset: 0 }}>
      <div ref={wrapRef} style={{ position: "absolute", inset: 0, touchAction: "none" }}>
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", willChange: "transform" }} />
      </div>

      {/* ★★文字の行も**図形と同じ帯**で切る(第65巡)。器そのものを縮めると行の
          座標系までずれるので、器はそのままにして**マスク**で切る。
          ★第67巡に矩形の `clip-path` からグラデーションのマスクへ ― 端の
          `EDGE_FADE` だけを地色へ溶かして、切り口の線を消す。canvas 側は
          `draw` が同じ `EDGE_FADE` で `destination-out` をかける。 */}
      {mode === "align" && (
        <div className="mode-panel" style={{
          position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden",
          maskImage: `linear-gradient(to bottom, transparent ${MASTHEAD_H}px, #000 ${MASTHEAD_H + EDGE_FADE}px, #000 calc(100% - ${NAV_H} - ${GROUND_LIFT}px - ${EDGE_FADE}px), transparent calc(100% - ${NAV_H} - ${GROUND_LIFT}px))`,  // ★目盛りの外（マスクの #000 は「色」でなく「不透明」）
          WebkitMaskImage: `linear-gradient(to bottom, transparent ${MASTHEAD_H}px, #000 ${MASTHEAD_H + EDGE_FADE}px, #000 calc(100% - ${NAV_H} - ${GROUND_LIFT}px - ${EDGE_FADE}px), transparent calc(100% - ${NAV_H} - ${GROUND_LIFT}px))`,  // ★目盛りの外（マスクの #000 は「色」でなく「不透明」）
        }}>
          {items.map((it, i) => {
            const dl = daysLabel(it.task.dueDate, today);
            const focus = i === focusIdx;
            return (
              <div key={it.id} ref={(el) => { rowRefs.current[i] = el; }} className="mode-row" data-id={it.id}
                style={{
                  position: "absolute", top: 0, left: 0, width: `calc(100% - ${ARC_APEX_X + TEXT_GAP}px)`, height: ROW_H,
                  transformOrigin: "0 50%", display: "flex", flexDirection: "column", justifyContent: "center",
                  // ★右端の余白も画面端から `SPACE.lg` ―**左右で揃う**。
                  willChange: "transform", paddingRight: SPACE.lg,
                }}>
                {/* ★★★主役は**題**(2026-08-26・第65巡にユーザー指定
                    「真ん中にタイトルを大きな強調された文字で埋め(適宜2行)」)。
                    第64巡までは残り日数を `SWISS_XL`(72px) で組んでいて、画面で
                    いちばん大きな声が「0」だった ― 主従が逆だった。 */}
                <div style={{
                  fontFamily: SANS, fontWeight: WEIGHT.bold, color: INK,
                  // ★第67巡にユーザー指定「選択中の中央の文字は少し大きく、
                  //   それ以外を少し小さくして、差がわかるように」。
                  //   `TYPE` は `display`(26) が最上段なので、**下を下げて**差を広げた
                  //   （26/20＝1.3倍 → 26/16＝1.63倍）。
                  fontSize: focus ? TYPE.display : TYPE.lead,
                  lineHeight: LEAD.snug, overflow: "hidden",
                  // ★焦点だけ2行まで折り返す。左に大きな図形が居るぶん文字の幅が狭いので、
                  //   1行で切ると題がほとんど読めない。
                  ...(focus
                    ? { display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 2 }
                    : { whiteSpace: "nowrap" as const, textOverflow: "ellipsis" }),
                }}>{it.task.title || "無題"}</div>
                {/* ★その下に、**同じ大きさ**の脇役を2つ。残り日数はグレー、タグは
                    タスク入力画面と同じ**ピル**(画面で唯一の色＝アクセント)。 */}
                {/* ★★★横のラインを揃える(2026-08-26・第67巡にユーザー指定
                    「中身の文字でなく、日数の上下のヘッドラインと、ピルの形状の
                    上端と下端が合うように」)。
                    第66巡までは**両方を高さ 24 の箱**に入れて中で上下中央に置いていた。
                    箱どうしは揃うが、日数のインクは 8px しかないのに**ピルは塗られた
                    形が 24px** ―「文字の横に、3倍の高さの色面が立っている」状態だった。
                    → 両方とも `LEAD.flat`(行の箱＝文字の大きさそのもの)にして
                    **ベースラインで**並べる。2つの箱がぴたりと重なり、ピルの上端と
                    下端が日数の字面の上下と一致する。 */}
                <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.sm, marginTop: SPACE.hair }}>
                  <span style={{
                    fontFamily: LATIN, fontWeight: WEIGHT.bold, fontSize: TYPE.small,
                    lineHeight: LEAD.flat, letterSpacing: TRACK.caps, color: MUTED, whiteSpace: "nowrap",
                  }}>{dl.sub ? `${dl.text} ${dl.sub}` : dl.text}</span>
                  <span style={{
                    display: "inline-block", padding: `0 ${SPACE.sm}px`, borderRadius: RADIUS.pill,
                    background: tagColor(it.paint.tag), color: tagInk(it.paint.tag),
                    fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.small,
                    lineHeight: LEAD.flat, letterSpacing: TRACK.wide, whiteSpace: "nowrap",
                  }}>
                    {/* ★字間は最後の字の右にも付くので、そのぶんピルの中で文字が
                        左に寄って見える。同じ量の負の右マージンで打ち消す。 */}
                    <span style={{ marginRight: `-${TRACK.wide}` }}>{it.tag.toUpperCase()}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === "timeline" && (
        <>
          {/* ★横に送っている間だけ出る日付の目盛り(第58巡にユーザー指定)。
              レーンの境目に細線、上端に M/D。位置は `laneLeft` から毎フレーム。 */}
          <div ref={rulesRef} className="tl-rules" style={{
            position: "absolute", left: 0, right: 0, top: MASTHEAD_H,
            bottom: BAND_BOTTOM, pointerEvents: "none", zIndex: 2, overflow: "hidden",
          }}>
            {days.map((d, i) => {
              const wk = isWeekend(d);
              return (
                <div key={d} ref={(el) => { ruleRefs.current[i] = el; }} style={{
                  position: "absolute", left: 0, top: 0, bottom: 0, width: 1, willChange: "transform",
                }}>
                  {/* ★線そのものは別の器にする ― 親は毎フレーム `translateX` を
                      書き替えるので、そこへ入りのアニメーションを重ねられない。 */}
                  <div className="tl-line" style={{
                    position: "absolute", left: 0, top: 0, bottom: 0, width: 1,
                    background: `color-mix(in srgb, ${INK} 16%, transparent)`,
                    transformOrigin: "bottom center",
                    animationDelay: `calc(var(--t-step) * ${Math.min(i, 6)})`,
                  }} />
                  {/* ★土日はレーンいっぱいに淡い地色(第59巡にユーザー指定)。 */}
                  {wk && (
                    <div style={{
                      position: "absolute", left: 0, top: 0, bottom: 0, width: laneW,
                      background: `color-mix(in srgb, ${INK} 5%, transparent)`,
                    }} />
                  )}
                  <span className="tl-date" style={{
                    position: "absolute", left: SPACE.sm, top: 0, whiteSpace: "nowrap",
                    fontFamily: LATIN, fontWeight: WEIGHT.heavy, fontSize: TYPE.head,
                    letterSpacing: TRACK.tight, lineHeight: LEAD.flat,
                    color: wk ? INK : MUTED,
                    animationDelay: `calc(var(--t-step) * ${Math.min(i, 6)})`,
                  }}>{monthDayOf(d)}</span>
                </div>
              );
            })}
          </div>

          <div ref={bandRef} className="tl-band"
            style={{
              position: "absolute", left: 0, right: 0, bottom: BAND_BOTTOM,
              // ★`overflow: visible` … 引っ張ると文字が規定より上へ伸びるので、
              //   ここで切ると伸びが見えない。画面外へは外側の `main.full-bleed`
              //   (`overflow: clip`)が抑える。
              height: LANE_HEAD_H, overflow: "visible", pointerEvents: "none", zIndex: 3,
            }}>
            <div ref={stripRef} style={{ position: "absolute", left: 0, bottom: 0, willChange: "transform" }}>
              {days.map((d, i) => (
                <div key={d} ref={(el) => { dayRefs.current[i] = el; }} style={{
                  position: "absolute", left: 0, bottom: 0, width: laneW,
                  display: "flex", alignItems: "flex-end", justifyContent: "center",
                  // ★横の位置は**物理と同じ `gapRef`／`worldRef`** から毎フレーム入れる
                  //   (CSS の transition で別に動かすと器とズレる)。
                  willChange: "transform",
                }}>
                  <span style={{
                    fontFamily: LATIN, fontWeight: WEIGHT.heavy, fontSize: laneFs, lineHeight: 0.86,  // ★目盛りの外（表示専用の巨大欧文。行間で字面を詰める）
                    fontVariationSettings: `"wdth" ${WD_WDTH}`,
                    letterSpacing: TRACK.tight, whiteSpace: "nowrap", paddingBottom: SPACE.xs,
                    // ★曜日は**黒**(第57巡にユーザー指定)。今日だけ RUST。
                    //   薄墨の階調はやめた(横へ送ると全部が読めなくなっていた)。
                    color: `var(--wd, ${i === 0 ? RUST : INK})`,
                    opacity: expanded !== null && expanded !== i ? 0.28 : 1,
                    transition: "opacity var(--t-item) var(--ease-settle)",
                  }}>{weekdayOf(d)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ★★★曜日の隙間に出るその日の詳細(2026-08-26・第67巡に組み直し)。
              情報の順は **日 → 題 → 時刻とタグ → 手順 → 持ちもの** の4段。
              大きさは `head / lead / small / body / micro` の5段に収め、色は
              `INK` / `SECOND` / `MUTED` の3段だけ ― **画面で唯一の色はタグのピル**。
              ★★行は**図形の高さに合わせて**置く(位置は毎フレーム `syncDetail` が
              入れる)。近い図形どうしで行が重なるときは下へ押しのける。 */}
          {expandedDay && (
            <div ref={detailRef} className={`tl-detail${expanded === null ? " out" : ""}`} style={{
              position: "absolute", left: 0, width: DETAIL_W,
              top: MASTHEAD_H, bottom: BAND_BOTTOM, zIndex: 3, pointerEvents: "none",
            }}>
              {/* 日の見出し … 帯のすぐ上に固定。ベースラインで並べる。 */}
              <div style={{
                position: "absolute", left: 0, right: 0, bottom: 0,
                display: "flex", alignItems: "baseline", gap: SPACE.sm,
                borderBottom: `1.5px solid ${INK}`, paddingBottom: SPACE.xs,
              }}>
                <span style={{
                  fontFamily: LATIN, fontWeight: WEIGHT.heavy, fontSize: TYPE.head,
                  lineHeight: LEAD.flat, letterSpacing: TRACK.tight,
                  color: expanded === 0 ? RUST : INK,
                }}>{monthDayOf(expandedDay)}</span>
                <span style={{
                  fontFamily: LATIN, fontWeight: WEIGHT.bold, fontSize: TYPE.micro,
                  lineHeight: LEAD.flat, letterSpacing: TRACK.caps, color: MUTED,
                  marginLeft: "auto", marginRight: `-${TRACK.caps}`,
                }}>{expandedTasks.length ? `${expandedTasks.length} TASKS` : "FREE"}</span>
              </div>

              {expandedTasks.map((t, i) => {
                const tag = resolveTag(t.tag, t.id, t.title, t.context, t.belongings, t.note);
                const steps = (t.subtasks ?? []).filter((x) => x.title.trim());
                const when = [t.dueTime, t.endTime].filter(Boolean).join("–");
                return (
                  <div key={t.id} ref={(el) => { detailRowRefs.current[i] = el; }} style={{
                    position: "absolute", left: 0, right: 0, bottom: 0, willChange: "transform",
                  }}>
                    <div style={{
                      fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.lead, color: INK,
                      lineHeight: LEAD.snug, display: "-webkit-box", WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 2, overflow: "hidden", wordBreak: "auto-phrase",
                    }}>{t.title || "無題"}</div>
                    {/* 時刻とタグ … ALIGN と同じ作法(字面の箱を揃えてベースラインで並べる)。 */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.sm, marginTop: SPACE.hair }}>
                      {when && (
                        <span style={{
                          fontFamily: LATIN, fontWeight: WEIGHT.bold, fontSize: TYPE.small,
                          lineHeight: LEAD.flat, letterSpacing: TRACK.caps, color: MUTED, whiteSpace: "nowrap",
                        }}>{when}</span>
                      )}
                      <span style={{
                        display: "inline-block", padding: `0 ${SPACE.sm}px`, borderRadius: RADIUS.pill,
                        background: tagColor(tag), color: tagInk(tag),
                        fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.small,
                        lineHeight: LEAD.flat, letterSpacing: TRACK.wide, whiteSpace: "nowrap",
                      }}><span style={{ marginRight: `-${TRACK.wide}` }}>{tag.toUpperCase()}</span></span>
                    </div>
                    {steps.length > 0 && (
                      <div style={{
                        fontFamily: SANS, fontWeight: WEIGHT.text, fontSize: TYPE.body, color: SECOND,
                        lineHeight: LEAD.snug, marginTop: SPACE.xs,
                        display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden",
                      }}>{steps.map((x) => x.title).join(" ・ ")}</div>
                    )}
                    {(t.belongings || t.context) && (
                      <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.sm, marginTop: SPACE.xs }}>
                        <span style={{
                          fontFamily: LATIN, fontWeight: WEIGHT.bold, fontSize: TYPE.micro,
                          lineHeight: LEAD.flat, letterSpacing: TRACK.caps, color: MUTED,
                          whiteSpace: "nowrap", flexShrink: 0,
                        }}>{t.belongings ? "TAKE" : "WHERE"}</span>
                        <span style={{
                          fontFamily: SANS, fontWeight: WEIGHT.text, fontSize: TYPE.body, color: SECOND,
                          lineHeight: LEAD.snug, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{t.belongings || t.context}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {expandedTasks.length === 0 && (
                <div style={{
                  position: "absolute", left: 0, right: 0, bottom: SPACE.xxl,
                  fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.text,
                  lineHeight: LEAD.snug, color: MUTED,
                }}>この日には何も入っていない。</div>
              )}
            </div>
          )}
        </>
      )}

      <DropTargets show={holding} hover={hover} mouthRef={mouthRef} trashRef={trashRef} />

      {mode === "pile" && !phaseRef.current && tasks.length === 0 && (
        <DemoSeedButton label="デモのタスクを入れる" onSeed={seedDemo} lifted />
      )}

      {open && (
        <TaskComposer key={open.id} data={open} mode="task"
          onCommit={(d) => patch(open.id, d)} onConfirm={(d) => complete(open, d)}
          onDelete={() => remove(open.id)} onClose={(d) => { patch(open.id, d); setOpenId(null); }} />
      )}
    </div>
  );
}

function primeTagMetrics() {
  if (typeof window === "undefined") return;
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 32));
  const step = () => { if (primeAdvances(allTagLabels(), allTagFaces(), 4) > 0) idle(step as never); };
  idle(step as never);
}

/** 大きさだけ入れ替える(位置は引き継ぐ。速度は捨てる — 呼ぶのは画面の外だけ)。 */
function swapUnit(M: typeof import("matter-js"), world: World, p: Piece, unit: number) {
  const { body, ox, oy } = makeBody(M, p.paint, p.body.position.x, p.body.position.y, unit);
  p.ox = ox; p.oy = oy; p.unit = unit; p.girth = girthOf(p.paint, unit);
  const old = p.body;
  p.body = body;
  M.Composite.remove(world, old);
  M.Composite.add(world, body);
}

/** ★★「自由」の字の大きさを**語によらず1つ**に決める(第57巡にユーザー指定
 *  「各言語で大きさを合わせて」)。語ごとに幅から出すと `FRI` だけ巨大になる。
 *  **いちばん幅を食う語**がレーンの内寸に収まる大きさを全部で使う。
 *  ★書体は `SANS`(Archivo ＋ Noto Sans JP) — `自由` は Archivo にグリフが無い。 */
/** 測る用の canvas(使い回す)。 */
let wordProbe: CanvasRenderingContext2D | null = null;
const probeCtx = () => (wordProbe ??= document.createElement("canvas").getContext("2d"));

/** ★★★**塗りの矩形**を測る(2026-08-25・第61巡)。
 *  `textAlign:"center"` / `textBaseline:"middle"` で置いたときの原点から見た、
 *  実際にインクが乗る範囲と、その**中心のずれ**を返す。
 *  ★大文字や数字は em の中で上に寄るので、`middle` の原点と塗りの中心は**一致しない**。
 *  ここを補正しないと、物体の中心と字の中心がずれる。 */
function inkBoxOf(word: string, fs: number, sx: number, fam: string): { w: number; h: number; dx: number; dy: number } {
  const probe = probeCtx();
  if (!probe) return { w: fs * word.length * 0.6, h: fs * 0.72, dx: 0, dy: 0 };
  probe.font = canvasFont(WORD_WEIGHT, fs, fam);
  probe.textAlign = "center"; probe.textBaseline = "middle";
  const m = probe.measureText(word);
  const l = m.actualBoundingBoxLeft ?? m.width / 2;
  const r = m.actualBoundingBoxRight ?? m.width / 2;
  const a = m.actualBoundingBoxAscent ?? fs * 0.36;
  const d = m.actualBoundingBoxDescent ?? fs * 0.12;
  return {
    w: (l + r) * sx, h: a + d,
    dx: ((r - l) / 2) * sx,          // 塗りの中心が原点からどれだけ右か
    dy: (d - a) / 2,                 // 同じく下か(大文字は負＝上に寄る)
  };
}

/** ★字の大きさは「**塗りの幅**が `room` に収まる」で決める(第61巡)。
 *  箱の高さで縛らない ― 高さは塗りから決まるようになったので。 */
function wordFontSize(words: readonly string[], room: number, fam: string): number {
  const probe = probeCtx();
  if (!probe) return 24;
  const base = 64;
  probe.font = canvasFont(WORD_WEIGHT, base, fam);
  let widest = 1;
  for (const w of words) widest = Math.max(widest, probe.measureText(w).width);
  // ★横は `FREE_SQUEEZE` まで詰めてよい ― 曜日を `wdth 58` で細く大きく組んで
  //   いるのと同じ考え方(コンデンス体として読ませる)。
  return Math.max(14, Math.min(SWISS_XL, Math.round((base * room) / widest / FREE_SQUEEZE)));
}
/**
 * ★★★「自由」の**字面と、字を詰める先の幅**(2026-08-25・第62巡)。
 * 板は回るので、条件は「**対角**がレーンの内寸に収まる」。
 *
 * ★★ここで間違えやすいのは、**詰める先を「対角の予算」そのものにしないこと**。
 * 板の幅は `詰めた塗り + FREE_PAD*2` なので、塗りを予算いっぱいまで許すと
 * **幅だけで予算を超える**(＝どんなに小さくしても収まらず、字がどんどん縮む。
 * 最初の実装で 24px まで落ちた)。正しくは高さから**幅の予算を逆算**する:
 * `幅の上限 = √(予算² − 高さ²)`。
 *
 * ★★**`FREE_WORDS` の全部**で確かめること。第61巡までは横幅だけを見ていたが、
 * それだと `自由` が必ずはみ出す ― CJK は塗りが**ほぼ正方形**(高さ ≒ 1em。
 * Latin の大文字は 0.72em)なので、**いちばん対角が長いのは `自由`** だから。
 * ユーザーが「なぜか日本語の自由だけ当たり判定が無いように見える」と言ったのは、
 * 実際には**自由がいちばん先にはみ出していた**ということだった。
 */
function freeGeom(laneW: number): { fs: number; room: number } {
  const budget = laneInner(laneW) - FREE_MARGIN;      // 対角がここに収まればよい
  // 上限から下げていく(段は2px。語が10個なので走る回数は高々30回、開くとき1度きり)。
  for (let fs = SWISS_XL; fs > 14; fs -= 2) {
    let room = Infinity;
    let ok = true;
    for (const w of FREE_WORDS) {
      const nat = inkBoxOf(w, fs, 1, SANS);           // 詰める前の塗り
      const bh = nat.h + FREE_PAD_Y * 2;
      if (bh >= budget) { ok = false; break; }
      const inkMax = Math.sqrt(budget * budget - bh * bh) - FREE_PAD * 2;
      // ★`FREE_SQUEEZE` より潰さないので、そこまで詰めても入らなければこの `fs` は無理。
      if (nat.w * FREE_SQUEEZE > inkMax) { ok = false; break; }
      room = Math.min(room, inkMax);
    }
    if (ok) return { fs, room };
  }
  return { fs: 14, room: 40 };
}

/** その語を決めた幅へ収めるための横の詰め(1 = 詰めない)。 */
function wordSqueeze(word: string, fs: number, room: number, fam: string): number {
  const probe = probeCtx();
  if (!probe) return 1;
  probe.font = canvasFont(WORD_WEIGHT, fs, fam);
  const w = probe.measureText(word).width || 1;
  return Math.max(FREE_SQUEEZE, Math.min(1, room / w));
}

/** ★★文字のブロックを作る。**物体は「文字の塗り」そのもの**(第61巡)。
 *  第60巡までは「画面幅の 46% × その 40%」という決め打ちの矩形だったので、
 *  `8/25` のような短い語では**箱が塗りよりずっと大きく**、掴めない所で当たっていた
 *  (ユーザー指摘「当たり判定が文字の塗りから離れすぎ」)。塗りを実測して、
 *  それに `FREE_PAD` だけ遊びを足したものを物体にする。
 *  ★塗りの中心が物体の中心に来るよう、描くときに `wordDx/wordDy` を引く。
 *  TIMELINE の「自由」(灰)と、GRAVITY の日付・曜日(黒)の**両方**がこれを使う。 */
function makeWordPiece(
  M: typeof import("matter-js"), word: string, id: string,
  room: number, fs: number, x: number, y: number, ink: string, fam: string,
  pad = FREE_PAD, padY = FREE_PAD_Y,
): Piece | null {
  const sx = wordSqueeze(word, fs, room, fam);
  const ink0 = inkBoxOf(word, fs, sx, fam);
  const bw = Math.max(8, ink0.w + pad * 2);
  const bh = Math.max(8, ink0.h + padY * 2);
  const body = M.Bodies.rectangle(x, y, bw, bh, {
    restitution: 0.04, friction: 0.55, frictionStatic: 0.9, frictionAir: 0.012,
  });
  // ★★★**回る**(第61巡に第59巡の対症療法を撤回)。回転を止めていたので
  //   「角度が変わらずゆっくり降りてくる」＝物体に見えなかった(ユーザー指摘)。
  //   ★ただし**回り慣性を重くする**(第62巡)。板は薄いので、横送りでレーンの壁が
  //   動くたびに小突かれて短い辺で立ってしまう。質量が両端に寄った板だと思えば
  //   物理的にも素直で、落ちるあいだは変わらず回る(空中では小突かれない)。
  M.Body.setInertia(body, body.inertia * 5);
  //   噛まない条件は「**回っても内寸に収まる**」＝ 対角 ≤ レーンの内寸。
  //   大きさは `freeGeom` が**全語の対角**から決めるので収まる。
  const spec = specOf({ id, title: word });
  return {
    id, body, spec,
    paint: { spec, view: "name", title: word },
    girth: Math.min(bw, bh), ox: 0, oy: 0, unit: fs, lane: -1, word, wordFs: fs,
    wordSx: sx, wordInk: ink, wordDx: ink0.dx, wordDy: ink0.dy, wordFam: fam,
    wordW: ink0.w, wordH: ink0.h,
  };
}

function makePiece(
  M: typeof import("matter-js"), t: Task, view: SolidView, w: number, i: number, unit: number,
  seed = "",
): Piece {
  const paint = paintOf(t, view);
  const b = shapeBounds(paint);
  const hw = ((b.maxX - b.minX) * unit) / 2;
  // ★★落ち方は**その回の種**でばらす(第60巡にユーザー指定「開くたびに毎回ランダムに
  //   落ちるように」)。`frac(t.id)` だけだと**同じタスクは毎回まったく同じ所へ落ち**、
  //   山の形が寸分違わず再現されていた。種を混ぜると、同じ顔ぶれでも毎回違う山になる。
  const r1 = frac(t.id + seed); const r2 = frac(t.id + seed + "y"); const r3 = frac(t.id + seed + "a");
  // ★湧く場所も**内寸の中**(第62巡)。壁と出どころを揃えないと、壁際で押し合う。
  const lo = PILE_INSET + hw + 4; const hi = Math.max(lo, w - PILE_INSET - hw - 4);
  const x = Math.min(hi, Math.max(lo, PILE_INSET + pileWOf(w) * (0.08 + r1 * 0.84)));
  const y = -((b.maxY - b.minY) * unit) - i * (110 + 100 * unit / UNIT) - r2 * 90;
  const { body, ox, oy } = makeBody(M, paint, x, y, unit);
  // ★傾きと回りは**控えめに**。強くすると転げて逆さまに積まれ、名前が読めなくなる
  //   ― ばらつきは主に「どこへ・どの高さから落ちるか」で作る。
  M.Body.setAngle(body, (r3 - 0.5) * 0.5);
  M.Body.setAngularVelocity(body, (r3 - 0.5) * 0.05);
  M.Body.setVelocity(body, { x: (r1 - 0.5) * 1.2, y: 0 });
  return { id: t.id, body, spec: paint.spec, paint, girth: girthOf(paint, unit), ox, oy, unit, lane: -1 };
}

/** ★★山へ一緒に落とす**その日の日付と曜日**(第60巡にユーザー指定)。
 *  「自由」と同じ**枠の無い文字だけの板**で、色は黒。タスクではないので掴めず、
 *  たたいても入力画面を開かない(`p.word` を持つ図形は `down`/`tapAt` が避ける)。 */
function pileWordPieces(
  M: typeof import("matter-js"), w: number, seed: string,
): Piece[] {
  const d = new Date();
  const words = [`${d.getMonth() + 1}/${d.getDate()}`, WD_FULL[d.getDay()]];
  // ★幅は**山の内寸**に対する割合(第62巡。画面幅ではない ― 出どころを揃える)。
  const inner = pileWOf(w);
  const out: Piece[] = [];
  words.forEach((word, i) => {
    const id = `pw:${i}`;
    // ★★★字面は**2枚で1つ**(2026-08-26・第67巡にユーザー指定「落ちてくる曜日と
    //   日付の、上端と下端のヘッドラインがあっていないので合わせてください」)。
    //   第63巡は「曜日をもう少し大きく」の指定で日付と別々に決めていたが、
    //   別々にすると**字面の高さが揃わない** ― 2枚並んで落ちたとき、
    //   キャップラインもベースラインも食い違って見える。
    //   → **長いほう(曜日)で決めた1つの大きさ**を両方に使う。日付は短いので、
    //   同じ大きさのまま箱が狭くなるだけで収まる。
    const room = inner * PILE_WORD_W;
    const fs = wordFontSize(words as string[], room, LATIN);
    const r1 = frac(id + seed); const r2 = frac(id + seed + "y");
    const p = makeWordPiece(M, word, id, room, fs,
      w * 0.5, -200 - i * 170 - r2 * 120, INK, LATIN, PILE_WORD_PAD, PILE_WORD_PAD_Y);
    if (!p) return;
    // ★横は**箱が決まってから**画面の中へ収める(塗りぴったりなので幅は語ごとに違う)。
    const half = (p.body.bounds.max.x - p.body.bounds.min.x) / 2;
    const lo = PILE_INSET + half + 4; const hi = Math.max(lo, w - PILE_INSET - half - 4);
    M.Body.setPosition(p.body, {
      x: Math.min(hi, Math.max(lo, PILE_INSET + inner * (0.08 + r1 * 0.84))),
      y: p.body.position.y,
    });
    M.Body.setVelocity(p.body, { x: (r1 - 0.5) * 1.2, y: 0 });
    M.Body.setAngle(p.body, (frac(id + seed + "a") - 0.5) * 0.5);
    M.Body.setAngularVelocity(p.body, (frac(id + seed + "a") - 0.5) * 0.05);
    out.push(p);
  });
  return out;
}

function makeBody(
  M: typeof import("matter-js"), paint: SolidPaint, x: number, y: number, unit: number,
): { body: Body; ox: number; oy: number } {
  const opts = { restitution: 0.04, friction: 0.55, frictionStatic: 0.9, frictionAir: 0.012 };
  const n = paint.spec.sides.length;
  const { w, h } = rectOf(paint.spec);
  const pw = w * unit; const ph = h * unit;
  let body: Body; let ox = 0; let oy = 0;
  // ★★★当たり判定だけ**見た目より `HAIR` px 外側**にする(2026-08-26・第63巡に
  //   ユーザー指定)。図形どうしが隣り合って止まったとき、色面が直に接していると
  //   境目が潰れて見える ― 髪の毛ほどの地色が挟まると、面の連なりが読める。
  //   ★絵は変えない(焼いた絵はそのまま)。ずらすのは物体だけ。
  if (n === 1) body = M.Bodies.circle(x, y, pw / 2 + HAIR, opts);
  else {
    const src = sectionOutline(n);
    const step = Math.max(1, Math.ceil(src.length / PHYS_VERTS));
    const verts = src.filter((_, k) => k % step === 0).map((q) => ({ x: q.x * pw, y: q.y * ph }));
    body = M.Bodies.fromVertices(x, y, [verts], opts);
    const c = M.Vertices.centre(verts);
    ox = -c.x; oy = -c.y;
    // ★`Body.scale` は**重心まわり**に拡大するので、`ox/oy`(重心と絵の中心の差)は
    //   そのまま使える。★質量は拡大で書き換わるので、`setMass` はこの**後**。
    if (pw > 1 && ph > 1) M.Body.scale(body, 1 + (HAIR * 2) / pw, 1 + (HAIR * 2) / ph);
  }
  M.Body.setMass(body, massOf(paint.spec) * MASS_K);
  return { body, ox, oy };
}

function girthOf(paint: SolidPaint, unit: number): number {
  const b = shapeBounds(paint);
  return Math.min(b.maxX - b.minX, b.maxY - b.minY) * unit;
}

export function pileOf(
  tasks: Task[], today: Date, w: number, usableH: number,
): { keep: Task[]; scale: number } {
  if (!tasks.length || w <= 0 || usableH <= 0) return { keep: tasks, scale: 1 };
  const sorted = [...tasks].map((t) => ({ t, area: areaOf(t, today) })).sort((a, b) => b.area - a.area);
  const budget = ((w * usableH) / (UNIT * UNIT)) * FILL;
  const scaleFor = (total: number) => Math.min(SCALE_MAX, Math.sqrt(budget / total));
  let total = 0; let n = 0;
  for (const row of sorted) {
    const next = total + row.area;
    const scale = scaleFor(next);
    if (n > 0 && (scale < SCALE_MIN || Math.sqrt(row.area) * UNIT * scale < CULL_PX)) break;
    total = next; n++;
  }
  const keep = sorted.slice(0, n).map((r) => r.t);
  let scale = Math.max(SCALE_MIN, scaleFor(total));
  for (const t of keep) {
    const { w: bw, h: bh } = rectOf(specOf(t, today));
    scale = Math.min(scale, (w * FIT_W) / (bw * UNIT), (usableH * FIT_H) / (bh * UNIT));
  }
  return { keep, scale: Math.max(0.12, scale) };
}

/** 壁と床を作り直す。★`keep` に渡した静的な物体(＝レーンの器)は消さない。 */
function rebuildWalls(
  M: typeof import("matter-js"), engine: Engine, w: number, h: number, withFloor = true, keep: Body[] = [],
) {
  const alive = new Set<Body>(keep);
  const old = M.Composite.allBodies(engine.world).filter((b) => b.isStatic && !alive.has(b));
  M.Composite.remove(engine.world, old);
  const T = 200;
  const floorY = floorYOf(h);
  // ★★画面の左右の壁は**列に収まった図形を通す**(第56巡)。TIMELINE のレーンは
  //   画面の外まで続いていて、3日目より先の列は右の壁の**中**に居る。壁が効くと
  //   そこへ落ちた図形が押し戻され、隣のレーンへ紛れ込む(実機の写真で発覚)。
  //   山(既定の分類)と落下中(CAT_FALL)にだけ効かせる。
  const f = { category: CAT_WALL, mask: CAT_WALL | CAT_FALL };
  // ★左右は `PILE_INSET` ぶん内側(＝画面の端から 16px。タブバーと同じ)。
  const l = PILE_INSET; const r = w - PILE_INSET;
  M.Composite.add(engine.world, [
    ...(withFloor ? [M.Bodies.rectangle(w / 2, floorY + T / 2, w + T * 2, T, { isStatic: true, friction: 0.6, collisionFilter: f })] : []),
    M.Bodies.rectangle(l - T / 2, h / 2, T, h * 3, { isStatic: true, friction: 0.4, collisionFilter: f }),
    M.Bodies.rectangle(r + T / 2, h / 2, T, h * 3, { isStatic: true, friction: 0.4, collisionFilter: f }),
  ]);
}

function frac(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (Math.imul(h, 2654435761) >>> 0) / 4294967296;
}
