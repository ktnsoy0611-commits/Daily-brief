import { D_OPEN, D_SWING, K_OPEN, K_SWING, spring, springTo, type Spring } from "@/lib/spring";
import { SPACE } from "@/lib/tokens";

// ★★★**帯の「物理っぽい動き」はここ1つ**（2026-09-15・第109巡にユーザー指定、
//   第113巡に**土台から作り直した**）。
//
// ユーザーの指定は4つ:
//   ④a **引き出してスクロールが止まるとき** … 慣性で少し行き過ぎてから戻って止まる。
//   ①  **完全に引き抜いた瞬間** … 空いた席が閉じ、**スクロールがまた始まる**。
//   ②  **図形を帯へ近づけているあいだ** … 挿し口が**指の指す所**に開いて待つ。
//   ⑤  **帯へ入れた瞬間** … 開いていた所へ**そのまま**ピルが収まる（跳ねない）。
//
// ★★★**第109〜112巡は「ずれ（`transform`）で隙間を作る」作りだった。
//   これは継ぎ目で原理的に破綻する。第113巡に捨てた。復活させない。**
//
//   帯は**同じ列を2周ぶん**並べて `translateX(-1周)` で送っている。つまり
//   **同じ id のピルが 1周ぶん離れて2つ居る**。ところが `transform` のずれは
//   **id で引く**ので、2つに別々の値を書けない。
//   ★挿し口より後ろを `+w` 押すと、**1周目の尻は `+w`・2周目の頭は 0** になり、
//     継ぎ目にもう1つ隙間が開く。受け渡し（本当に挿し込まれた瞬間）には
//     **2周目の全員がレイアウトで `+w` 動く**のに、ずれは `-w` しか戻せない。
//   ★★★**実測（第112巡の実装）… 離した瞬間に2周目の先頭が 152px 飛んだ**
//     （1周目は 3px）。ユーザー報告「**入れ込んだ時にピルのスクロールがおかしく
//     なって変な挙動をします**」「**ピルは離した瞬間に消えてしまいます**」の正体。
//   ★★★**両側 ±w/2（第110巡）も、片側 +w（第111巡）も、同じ理由で直らない。**
//
// ★★★**いまの作り ―― 隙間は「レイアウトそのもの」が持つ**。
//   ピルとピルのあいだに**幅を持つ器（`.band-pad`）**を1つずつ置き、その幅を
//   毎フレーム書く。**2周とも同じ列を描くので、隙間も穴も自動的に2周ぶん・
//   同じ index に生まれる**＝継ぎ目の辻褄が原理的に合う。
//   ★★★**本当に挿し込まれた瞬間、レイアウトが増える幅は「開けていた幅」と
//     厳密に同じ**（`pad(SPACE.sm) + ピルの幅` ＝ `w`）ので、**受け渡しの
//     計算がそもそも要らない**。バネを 0 に落とすだけで 1px も飛ばない。
//   ★★「1周の幅が変わるあいだは段を止める」だけ守ればよい（`Band.tsx` の `flow`）。
//
// ★★★**バネは2つの役に分ける**:
//   **帯ぜんたいの一発**（止まる慣性・再開の慣性）だけ `K_SWING`（行き過ぎる）、
//   **隙間と穴**は `K_OPEN`（**90% まで 117ms・行き過ぎ 0.0%**。第113巡に足した
//   5組目。表と理由は `lib/spring.ts`）。
//   ★★★**第111〜112巡の `K_SETTLE` は遅すぎた** ―― 静止から 90% まで **668ms**。
//     指を近づけてから離すまでが 120ms 前後なので、**実測で 150px の隙間が
//     15px しか開いていなかった**＝ユーザー報告「**近づけてもピルがどきません**」。
//   ★★「`K_CATCH` は瞬間移動になる（1フレームで 232px）」という第110巡の記録は
//     **バネではなく受け渡しの代入が飛ばしていた**もの。ただし `K_CATCH` は
//     **10.5% 行き過ぎる**ので、跳ね返りを禁じられた帯には使えない。
//   **新しい係数も曲線も作らない**（`lib/spring.ts` の4組のまま）。
// ★★★`lib/spring.ts` は「canvas の座標系の話」と書いてあるが、**帯の環境の動きは
//   すでに `linear` で曲線4本の対象外**（`Band.tsx` の頭）。同じ例外に揃える。

/** ★勢い（`v`）で入れた帯ぜんたいの揺れの上限（px）。★目盛りの外。 */
export const NUDGE_MAX = SPACE.xl;
/** ★ピルとピルのあいだの素の幅（px）。★**隙間はここから増える**。 */
export const BAND_PAD = SPACE.sm;
/**
 * ★帯が止まるときに入れる勢い（px/フレーム）。★目盛りの外（手ざわり）。
 * ★★**実際の流れの速さ（≒0.25px/フレーム）は使わない** ―― 帯は 26秒で画面1枚ぶん
 *   という遅さなので、そのぶんの慣性は**1px にも満たず目に見えない**。
 */
const STOP_KICK = 4;
/** ★引き抜いたとき帯ぜんたいに入れる勢い（px/フレーム）。＝スクロール再開の合図。 */
const BUMP_KICK = 7;
/** ★これ未満になったら「収まった」として捨てる（px と px/フレーム）。 */
const CALM = 0.05;
/** 1フレームの長さ（ms）。★山のループと同じ 60Hz 基準。 */
const STEP_MS = 1000 / 60;
/** ★貯金の頭打ち（フレーム）。タブを離れて戻ったときに一気に進めない。 */
const MAX_STEPS = 3;

/** 行き先を持つバネ1本。★`p` が px（穴だけ 0〜1 の比）、`v` が 1フレームぶん。 */
type Go = Spring & { to: number };
const go = (): Go => ({ ...spring(), to: 0 });

/**
 * ★★**1つの段の動き**。
 * ★★★**挿し口は2本持つ**（`open` ＝ いま指している所／`shut` ＝ さっきまで
 *   指していた所）―― 1本だと、指がピルの境目を跨いだ瞬間に**隙間が
 *   となりへ瞬間移動する**。2本あれば「こちらが閉じながら、あちらが開く」。
 */
type RowMotion = {
  /** 帯ぜんたいのずれ（止まる慣性・再開の一発）。行き先は常に 0。 */
  off: Go;
  /** いま開けている隙間（`at` ＝ そのピルの**前**。-1 ＝ 無し）。 */
  open: Go & { at: number };
  /** 閉じかけの隙間（指が境目を跨いだときの受け皿）。 */
  shut: Go & { at: number };
  /**
   * ★★★**指が指している器が「DOM の何枚目か」**（-1 ＝ 無し）。
   * ★★★**index だけでは足りない** ―― 同じ index の器は**2周ぶん居る**ので、
   *   「指のそばの1枚」を名指しできない。
   */
  pick: number;
  /**
   * ★★★**その1枚より前で開いたぶんの合計**（px。段の `paint` が毎フレーム書く）。
   * ★★★**帯ぜんたいをこれだけ左へ戻す** ―― 戻さないと、**1周目に開いた隙間が
   *   2周目を丸ごと押す**ので、**指のそばにあったはずの境目が画面の外へ逃げる**
   *   （実測 … 指が x=200 なのに隙間は 405〜563 に開いていた＝どちらの周の
   *   隙間も画面に出ていない。ユーザー報告「**近づけてもピルがどきません**」）。
   */
  lead: number;
  /** 引き抜かれたピルの席の畳み（0 ＝ そのまま／1 ＝ 完全に畳んだ）。 */
  hole: Go;
  /** 畳んでいるピルの id（`null` ＝ 無し）。 */
  holeId: string | null;
  /** ★★畳む前に測った席の幅（px）。**畳んでいる最中は測り直さない**
   *  （自分が縮めた値を読んでしまう）。 */
  holeW: number;
};

const motion = (): RowMotion => ({
  off: go(), open: { ...go(), at: -1 }, shut: { ...go(), at: -1 },
  pick: -1, lead: 0, hole: go(), holeId: null, holeW: 0,
});

/**
 * ★★帯と山をつなぐ**1本の線**（`lib/pullDrag.ts` の `pullBus` と同じ作法）。
 * React の state を毎フレーム動かさない ―― 毎フレームの値は module のただ1つの
 * 入れ物に置き、rAF のループだけが読み書きする。
 */
export const bandBus = {
  /** 段ごとの動き。 */
  rows: [motion(), motion()] as [RowMotion, RowMotion],
  /** ★動いているか（ループを回すかの判定）。 */
  live: false,
  /** ★★段の rAF を起こす口（`Band.tsx` が段ごとに登録する）。 */
  wakers: new Set<() => void>(),
  /**
   * ★★★**挿し口**。図形を帯へ近づけているあいだ、`Pile` が毎フレーム書く。
   *
   * ★★★**`x` は指の画面の座標**（2026-09-16・第112巡にユーザー確定
   *   「**どんな時でも、任意のピルとピルの間に戻せるように。順番がいくら
   *   入れ替わっても問題ない**」）。**入る場所を決めるのは指。並びのほうが
   *   指に合わせる**（`HomeTab.unassign` がタスクの並びを組み替える）。
   * ★`w` は挿し込まれるピルの幅（＋ピルとピルのあいだの素の幅）。
   */
  aim: null as { row: 0 | 1; x: number; w: number } | null,
  /**
   * ★★★**指がいま指している挿し口の index**（段の rAF が毎フレーム書く）。
   * ★★**ピルの居場所を知っているのは段だけ**（流れの `transform` が決めていて
   *   React 側は知らない）ので、**x → index の変換は段がやって、結果をここへ返す**。
   * ★離したときに `HomeTab` がこれを読んで、**その場所へ並べ替える**。
   * ★★**帯は輪なので index は 0〜n-1 で足りる**（「n 番目の後ろ」＝「0 番目の前」）。
   */
  slot: null as { row: 0 | 1; at: number; after: string } | null,
};

/** ★注文が入ったら**すぐ**段のループを起こす（間を置いて見に行かない）。 */
const wake = () => { bandBus.live = true; for (const w of bandBus.wakers) w(); };

/**
 * ★★★**④a 帯が止まる** … 流れていた向きへ少し行き過ぎてから戻る。
 * @param row 段（0 ＝ 左へ流れる／1 ＝ 右へ流れる）
 */
export function bandStop(row: 0 | 1): void {
  bandBus.rows[row].off.v += row === 0 ? -STOP_KICK : STOP_KICK;
  wake();
}

/**
 * ★★★**流れが再開する合図**（2026-09-15・第111巡にユーザー確定
 * 「**引き抜いたらスクロールが再開する／再開のときだけ軽い慣性**」）。
 *
 * ★★★**流れの速さでは再開が見えない** ―― 帯は 26秒で画面1枚＝**0.25px/フレーム**。
 *   1秒眺めても 15px しか進まないので、「また動き出した」ことは**速さでは
 *   絶対に分からない**。**見えるのは一発の慣性だけ**なので、それを必ず撃つ。
 */
export function bandResume(row: 0 | 1): void {
  bandBus.rows[row].off.v += row === 0 ? -BUMP_KICK : BUMP_KICK;
  wake();
}

/**
 * ★★★**② 挿し口を開ける**（段の rAF が毎フレーム呼ぶ）。
 * @param at   そのピルの**前**に開ける（0〜n-1）
 * @param w    挿し込まれるピルの幅（＋素の隙間）
 * @param pick 指のそばの器が DOM の何枚目か（`lead` を測る起点）
 */
export function bandGapAt(row: 0 | 1, at: number, w: number, pick: number): void {
  const m = bandBus.rows[row];
  m.pick = pick;
  if (m.open.at !== at) {
    // ★★**いま開いているぶんを「閉じる側」へ預けて、新しい所を 0 から開く**
    //   ―― 預けないと、指が境目を跨いだ瞬間に隙間がとなりへ瞬間移動する。
    //   ★★**勢いは渡さない** ―― 渡すと、閉じるはずの隙間が**行き先 0 と逆へ
    //     いったん育つ**（実測 … 130px で受け渡して 165px まで開いた）。
    if (m.open.at >= 0) { m.shut.at = m.open.at; m.shut.p = m.open.p; m.shut.v = 0; }
    m.shut.to = 0;
    m.open.at = at; m.open.p = 0; m.open.v = 0;
  }
  m.open.to = w;
  wake();
}

/** ★挿し口を閉じる（指が離れた・帯から出た）。**行き先を 0 にするだけ**。 */
export function bandGapClear(row: 0 | 1): void {
  bandBus.rows[row].open.to = 0;
  wake();
}

/**
 * ★★★**挿し口の受け渡し**（本当にピルが挿し込まれた瞬間）。
 * ★★★**レイアウトが増える幅は、開けていた幅と厳密に同じ**なので、
 *   **バネを 0 に落とすだけでよい**（第112巡までの `bandGapCommit` の
 *   px 合わせは要らなくなった）。★**`useLayoutEffect` から呼ぶこと。**
 */
export function bandGapDone(row: 0 | 1, at: number, id: string, pillW: number): void {
  const m = bandBus.rows[row];
  // ★★**幅 0 ＝「畳んでいた席の幅を使え」**（引き抜いたピルを入れ直したとき）。
  //   そのピルの DOM はいま幅 0 を書かれているので、測り直しては 0 になる。
  const full0 = pillW || m.holeW;
  // ★★★**開ききる前に離されることがある**（指は待ってくれない）。そのときは
  //   **開いていたぶんの大きさから新しいピルが生える**ように畳み替える ――
  //   `pad + ピル` を `part` 倍した幅は**開いていた幅そのもの**なので、
  //   レイアウトが増えたぶんと帳尻が合う（＝1px も飛ばない）。
  const full = m.open.to || BAND_PAD + full0;
  const part = Math.max(0, Math.min(1, m.open.p / full));
  m.holeId = id; m.holeW = full0;
  m.hole.p = 1 - part; m.hole.v = 0; m.hole.to = 0;
  // ★★閉じかけの器は、挿し込みで index が1つ後ろへずれる。
  if (m.shut.at >= at) m.shut.at += 1;
  m.open.at = -1; m.open.p = 0; m.open.v = 0; m.open.to = 0;
  m.pick = -1; m.lead = 0;
}

/**
 * ★★★**① 席を畳む**（2026-09-15・第110巡。ユーザー指定「**完全にピルを引き抜いた
 * 瞬間に、後ろのものが動き始めて、またスクロールが始まる**」）。
 *
 * ★★★**呼ぶのは「弾けた瞬間」** ―― まだ `items` には居るので**席は在る**。
 *   その席の幅を 0 へ畳めば、**後ろが詰める動きが本当に見える**。
 * ★★★**慣性の一発は `bandResume` が別に撃つ**（段の最後のピルを引き抜くと
 *   閉じる席はあっても後ろが居ない ―― 混ぜると再開ごと落ちる）。
 */
export function bandHole(row: 0 | 1, id: string, w: number): void {
  const m = bandBus.rows[row];
  if (m.holeId !== id) { m.holeId = id; m.hole.p = 0; m.hole.v = 0; }
  m.holeW = w;
  m.hole.to = 1;
  wake();
}

/** ★★席を戻す（引き戻した・入れ直した）。**行き先を 0 にするだけ**＝逆再生。 */
export function bandHoleRelease(row: 0 | 1): void {
  bandBus.rows[row].hole.to = 0;
  wake();
}

/**
 * ★★★**席の受け渡し**（`items` から本当に消えた瞬間）。
 * 畳みきった幅（`pad + ピル`）とレイアウトが失う幅は厳密に同じなので、
 * **掛け金を外すだけ**。★**`useLayoutEffect` から呼ぶこと。**
 */
export function bandHoleDone(row: 0 | 1): void {
  const m = bandBus.rows[row];
  m.holeId = null; m.holeW = 0; m.hole.p = 0; m.hole.v = 0; m.hole.to = 0;
}

/**
 * ★★★**挿し口を置く／外す**（`components/home/Pile.tsx` が毎フレーム呼ぶ）。
 * ★★★**素で `bandBus.aim` に代入しない** ―― 段の rAF は**止まっている**ことが
 *   あるので、**起こさないと誰も隙間を開けない**（第110巡に実測 … `--nudge` が
 *   1つも書かれず 0/5 件）。**注文には必ず `wake()` が要る。**
 */
export function bandAim(aim: { row: 0 | 1; x: number; w: number } | null): void {
  const was = bandBus.aim;
  bandBus.aim = aim;
  if (!aim) bandBus.slot = null;
  if (aim || was) wake();
}

let acc = 0;
let last = 0;

/**
 * 1フレームぶん進める。**全部収まったら `false`**（ループを止めてよい）。
 * ★★★**実時間を貯めて固定の刻みで進める**（2026-09-15・第110巡）。
 *   ① 段ごとの rAF が**2つとも**この1本を呼ぶので、**同じフレームの2度目は
 *      貯金が足りず 0 歩**になる（＝倍速の門）。
 *   ② 実機は 120Hz なので、rAF ごとに1歩だと**バネが2倍速**になる
 *      （山で第104巡・第106巡に2度踏んだのと同じ）。
 */
export function stepBandMotion(): boolean {
  const now = performance.now();
  // ★★★**間が空いたら仕切り直す**（タブを離れて戻った・ループが止まっていた）。
  //   ★★**「収まったから 0 に戻す」をしてはいけない** ―― 指が挿し口に居るあいだ
  //   段は回り続けるので、毎フレーム仕切り直すと**貯金が貯まらず、バネが
  //   永久に1歩も進まない**（隙間が動かない）。**時間の隙間だけで判断する。**
  if (last === 0 || now - last > STEP_MS * MAX_STEPS * 4) { last = now; acc = 0; }
  acc = Math.min(acc + (now - last), STEP_MS * MAX_STEPS);
  last = now;
  // ★★0歩のフレーム（＝同じフレームの2度目の呼び出し）は**前の判定を返す**
  //   ―― ここで偽を返すと、起こされた直後にループが止まる。
  while (acc >= STEP_MS) { bandBus.live = stepOnce(); acc -= STEP_MS; }
  return bandBus.live;
}

function stepOnce(): boolean {
  let live = false;
  for (const m of bandBus.rows) {
    // ★★★**帯ぜんたいのずれは「勢い」だけで動く**（止まる慣性・再開の一発）。
    //   行き先は常に 0 なので、**`K_SWING`（はっきり行き過ぎて戻る）** が合う。
    //   ★頭打ちはここだけ ―― 勢いは外から入るので、やりすぎを縛る必要がある。
    if (advance(m.off, K_SWING, D_SWING, NUDGE_MAX)) live = true;
    // ★★★**隙間と穴は `K_OPEN`**（90% まで 117ms・行き過ぎ 0.0%）。
    //   **速くないと「近づけてもどかない」**（第112巡の `K_SETTLE` は 467ms で、
    //   指が離れるまでに 150px のうち 15px しか開いていなかった）。
    if (advance(m.open, K_OPEN, D_OPEN, 0)) live = true;
    if (advance(m.shut, K_OPEN, D_OPEN, 0)) live = true;
    else if (m.shut.to === 0) m.shut.at = -1;
    if (advance(m.hole, K_OPEN, D_OPEN, 0)) live = true;
    // ★席が素の大きさへ戻りきったら掛け金を外す（幅を書き続けない）。
    else if (m.hole.to === 0) m.holeId = null;
  }
  return live;
}

/** 1つぶん進める。**行き先に着いていれば偽**（誰も動いていなければループが止まる）。 */
function advance(s: Go, k: number, d: number, lim: number): boolean {
  springTo(s, s.to, k, d);
  if (lim > 0) s.p = Math.max(-lim, Math.min(lim, s.p));
  if (Math.abs(s.p - s.to) > CALM || Math.abs(s.v) > CALM) return true;
  // ★★★**開いたまま静止している隙間では、ループを止めてよい**（絵はもう動かない）。
  //   ★次に動かすのは `wake()` を呼ぶ注文か、**指が居るあいだ段が自分で回し続ける**
  //   （`Band.tsx` の `stepBandMotion() || bandBus.aim`）。
  s.p = s.to; s.v = 0;
  return false;
}
