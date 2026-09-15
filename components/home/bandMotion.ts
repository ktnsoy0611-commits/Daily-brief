import { D_SWING, K_SWING, spring, springTo, type Spring } from "@/lib/spring";
import { SPACE } from "@/lib/tokens";

// ★★★**帯の「物理っぽい動き」はここ1つ**（2026-09-15・第109巡にユーザー指定、
//   第110巡に**行き先を持たせて**作り直した）。
//
// ユーザーの指定は4つ:
//   ④a **引き出してスクロールが止まるとき** … 慣性で少し行き過ぎてから戻って止まる。
//   ①  **完全に引き抜いた瞬間** … 空いた穴へ後ろのピルが**追突して詰め**、
//       その勢いで**スクロールがまた始まる**。
//   ②  **図形を帯へ近づけているあいだ** … 挿し口が**指に付いてきて**、
//       左右のピルが**隙間を開けて待つ**。
//   ⑤  **帯へ入れた瞬間** … 開いていた左右が**行き過ぎつつ閉じる**＝バウンド。
//
// ★★★**第109巡の実装には、測って分かった欠陥が3つあった**（第110巡に直した）:
//   1. **行き先が `0` に焼き付いていた** ―― `springTo(s, 0, …)` を直書きしていたので
//      「**開いたまま静止する隙間**」が原理的に書けなかった。しかも上限 24px に対し
//      **ピル1枚は 120〜250px**。追突は最大 24px しか動いていなかった。
//   2. **`bandBump` はレイアウトが詰んだ「あと」に走っていた** ―― `items` から
//      消えた時点で後続は**瞬間移動を終えている**。穴を閉じる動きはどこにも無く、
//      **あとから跳ねるだけ**だった。→ **弾けた瞬間（まだ席が在るうち）に仕込む。**
//   3. **1フレームに2回進んでいた** ―― 段ごとの rAF が**同じ大域の step** を呼ぶ。
//      → **実時間を貯めて固定の刻みで進める**（山のループと同じ作法）。貯金が
//      足りないフレームは 0 歩なので、**2度目の呼び出しは自然に空振りする**。
//
// ★★★**動かすのは `transform` だけ**（レイアウトは 1px も動かさない）。
//   帯の継ぎ目の無さは「2周の幅が厳密に等しい」ことだけで成り立っているので、
//   幅に効く変更を入れると**そこで継ぎ目が生まれる**。
// ★★★**ピルは2周ぶん DOM に居る**ので、ずれは **id で引く**（`taken` と同じ作法）。
//   周ごとに別の値にすると、2周目が入ってきた瞬間に見えてしまう。
// ★★★**ずれを書く先は `.band-slot`（ピルの外の包み）**（第110巡）―― ピル自身の
//   `transform` には**押下の縮みと 420ms の transition** が同居しているので、
//   毎フレームの書き込みと CSS の補間が二重に効く。包みは幅を持たないので
//   **1周の幅は 1px も動かない**。
// ★★**バネは `lib/spring.ts` の `K_SWING`/`D_SWING` 1組だけ**（周期30フレーム・
//   減衰比 0.3 ＝ はっきり行き過ぎて戻る）。**新しい係数も曲線も作らない。**
//   ★`lib/spring.ts` は「canvas の座標系の話」と書いてあるが、**帯の環境の動きは
//   すでに `linear` で曲線4本の対象外**（`Band.tsx` の頭）。同じ例外に揃える。

/** ★勢い（`v`）で入れた揺れの上限（px）。**やりすぎない**ための頭打ち。★目盛りの外。 */
export const NUDGE_MAX = SPACE.xl;
/**
 * ★帯が止まるときに入れる勢い（px/フレーム）。★目盛りの外（手ざわり）。
 * ★★**実際の流れの速さ（≒0.25px/フレーム）は使わない** ―― 帯は 26秒で画面1枚ぶん
 *   という遅さなので、そのぶんの慣性は**1px にも満たず目に見えない**。
 *   「慣性が働いているように見える」ことが指定なので、**見える量を設計して置く**。
 * ★`K_SWING` では行き過ぎの頂点 ≒ `v0 × 3`。**4 ＝ 約 12px**（`SPACE.md` ぶん）。
 */
const STOP_KICK = 4;
/** ★追突のとき帯ぜんたいに入れる勢い（px/フレーム）。＝スクロール再開の合図。 */
const BUMP_KICK = 7;
/** ★これ未満になったら「収まった」として捨てる（px と px/フレーム）。 */
const CALM = 0.05;
/**
 * ★★★**追突の「ずれ」**（フレーム）。**近いピルから順に動き出す**ので、
 * 後ろのピルが**前のピルを追いかけて詰まる**＝ユーザー指定の「追突」。
 * ★総遅れは `STAGGER × STAGGER_MAX` ＝ 8フレーム（≒133ms）で頭打ち。
 * ★目盛りの外（手ざわり。時間の4分割は CSS の遷移のためのもの）。
 */
const STAGGER = 2;
const STAGGER_MAX = 4;
/** 1フレームの長さ（ms）。★山のループと同じ 60Hz 基準。 */
const STEP_MS = 1000 / 60;
/** ★貯金の頭打ち（フレーム）。タブを離れて戻ったときに一気に進めない。 */
const MAX_STEPS = 3;

/**
 * 1つのずれ。★`p` が px、`v` が px/フレーム。
 * ★★★**行き先は2つの足し算**（第110巡）… `hole`（穴を閉じる・ずっと効く）と
 *   `gap`（隙間を開ける・指が居るあいだだけ毎フレーム書き換わる）。
 *   **1つの数にまとめない** ―― 片方を書くともう片方が消える。
 */
export type Off = Spring & { hole: number; gap: number; wait: number };

/**
 * ★★帯と山をつなぐ**1本の線**（`lib/pullDrag.ts` の `pullBus` と同じ作法）。
 * React の state を毎フレーム動かさない ―― 毎フレームの値は module のただ1つの
 * 入れ物に置き、rAF のループだけが読み書きする。
 */
export const bandBus = {
  /** 段ごとの「帯ぜんたいのずれ」（止まる慣性・追突の一発）。★行き先は常に 0。 */
  off: [off(), off()] as [Off, Off],
  /** ピルごとの横のずれ。**id で引く**。 */
  nudge: new Map<string, Off>(),
  /** ★動いているか（ループを回すかの判定）。 */
  live: false,
  /** ★★段の rAF を起こす口（`Band.tsx` が段ごとに登録する）。 */
  wakers: new Set<() => void>(),
  /**
   * ★★★**挿し口**（第110巡）。図形を帯へ近づけているあいだ、`Pile` が毎フレーム
   * 書く。**`x` は画面の座標**（帯のピルの矩形と同じ土俵。器の座標と混ぜない）。
   * `w` は挿し込まれるピルの幅。段の rAF がこれを読んで左右へ押し開ける。
   */
  aim: null as { row: 0 | 1; x: number; w: number } | null,
};

function off(): Off {
  return { ...spring(), hole: 0, gap: 0, wait: 0 };
}

/** ★注文が入ったら**すぐ**段のループを起こす（間を置いて見に行かない）。 */
const wake = () => { bandBus.live = true; for (const w of bandBus.wakers) w(); };
const kick = (s: Off, v: number) => { s.v += v; wake(); };
function nudgeOf(id: string): Off {
  let s = bandBus.nudge.get(id);
  if (!s) { s = off(); bandBus.nudge.set(id, s); }
  return s;
}

/**
 * ★★★**④a 帯が止まる** … 流れていた向きへ少し行き過ぎてから戻る。
 * @param row 段（0 ＝ 左へ流れる／1 ＝ 右へ流れる）
 */
export function bandStop(row: 0 | 1): void {
  kick(bandBus.off[row], row === 0 ? -STOP_KICK : STOP_KICK);
}

/**
 * ★★★**① 穴を閉じる**（2026-09-15・第110巡。ユーザー指定「**完全にピルを引き抜いた
 * 瞬間に、後ろのものが動き始めて、先にあるピルに追突して、またスクロールが始まる**」）。
 *
 * ★★★**呼ぶのは「弾けた瞬間」** ―― まだ `items` には居るので**席は空いたまま**で、
 *   そこへ後ろが詰める動きが**本当に見える**。`items` から消えたあとに呼ぶと、
 *   レイアウトはもう詰み終わっている（第109巡の `bandBump` の誤り）。
 * @param ids 空いた所より**後ろ**のピルの id（近い順）
 * @param gap 空いた幅（＝抜けたピルの幅 ＋ 隙間）
 */
export function bandHole(row: 0 | 1, ids: string[], gap: number): void {
  // ★★帯ぜんたいに一発（＝流れが再開する合図。段の側で `flow(true)` も撃つ）。
  kick(bandBus.off[row], row === 0 ? -BUMP_KICK : BUMP_KICK);
  ids.forEach((id, i) => {
    const s = nudgeOf(id);
    s.hole = -gap;                    // ★★**全員が同じだけ左へ詰める**（減衰させない）
    s.wait = Math.min(i, STAGGER_MAX) * STAGGER;   // ★近いピルから動き出す＝追突
  });
  wake();
}

/** ★★穴を戻す（引き戻された・入れ直した）。**行き先を 0 にするだけ**＝逆再生。 */
export function bandHoleRelease(ids: string[]): void {
  for (const id of ids) {
    const s = bandBus.nudge.get(id);
    if (!s) continue;
    s.hole = 0; s.wait = 0;
  }
  wake();
}

/**
 * ★★★**穴の受け渡し**（`items` から本当に消えた瞬間）。
 * レイアウトが `gap` ぶん左へ詰むので、**同じだけ右へ置き直して行き先を 0 に**する
 * ―― 画面上の位置は 1px も動かないまま、バネの続きだけが残る。
 * ★★**`useLayoutEffect` から呼ぶこと**（塗ったあとだと1フレーム飛ぶ）。
 */
export function bandHoleCommit(ids: string[], gap: number): void {
  for (const id of ids) {
    const s = bandBus.nudge.get(id);
    if (!s) continue;
    s.p += gap; s.hole = 0; s.wait = 0;
  }
  wake();
}

/**
 * ★★★**② 隙間を開ける**（2026-09-15・第110巡。ユーザー確定「**挿し口が指に
 * 付いてくる**」）。段の rAF が毎フレーム呼ぶ。
 *
 * @param mid  挿し口の**画面の x**
 * @param w    挿し込まれるピルの幅
 * @param at   id → そのピルの**画面の中心 x**
 * @returns    隙間を当てた id（次のフレームに消すため段が控える）
 */
export function bandGap(at: Map<string, number>, mid: number, w: number): void {
  const half = w / 2;
  for (const [id, cx] of at) nudgeOf(id).gap = cx < mid ? -half : half;
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
  if (aim || was) wake();
}

/** ★隙間を閉じる（指が離れた・帯から出た）。**行き先を 0 にするだけ**＝バウンド。 */
export function bandGapClear(ids: Iterable<string>): void {
  for (const id of ids) {
    const s = bandBus.nudge.get(id);
    if (s) s.gap = 0;
  }
  wake();
}

/**
 * ★★★**隙間の受け渡し**（ピルが本当に挿し込まれた瞬間）。
 *
 * レイアウトは挿し口より**後ろを `w` ぶん右へ**押し出すので、**同じだけ左へ
 * 置き直す** ―― 画面上の位置は 1px も動かないまま、行き先 0 へ向かうバネだけが残る。
 * ★★これで**左右が外へ開いていた所から、行き過ぎつつ閉じる＝バウンド**になり、
 *   **一瞬で画面が入れ替わらない**（第110巡の実測 … 1フレームの飛び 79.7px → 下記）。
 * ★★**`useLayoutEffect` から呼ぶこと**（塗ったあとだと1フレーム飛ぶ）。
 */
export function bandGapCommit(ids: string[], w: number): void {
  for (const id of ids) nudgeOf(id).p -= w;
  wake();
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
  // ★★★**帯ぜんたいのずれは「勢い」だけで動く**（止まる慣性・追突の一発）。
  //   行き先は常に 0 なので、**`K_SWING`（はっきり行き過ぎて戻る）** が合う。
  //   ★頭打ちはここだけ ―― 勢いは外から入るので、やりすぎを縛る必要がある。
  for (const s of bandBus.off) {
    if (advance(s, K_SWING, D_SWING, NUDGE_MAX)) live = true;
  }
  // ★★★**ピルごとのずれも `K_SWING`**（穴・隙間・受け渡し）。
  //   ★★★**頭打ちを掛けてはいけない**（2026-09-15・第110巡に実測で判明）――
  //     受け渡しは `p` を**ピル1枚ぶん**（実測 201px）動かすのに、`NUDGE_MAX`(24)
  //     で切っていたので**8割が消えていた**（穴の「最大 134px」も、バネの
  //     行き過ぎではなく**頭打ちの値そのもの**だった）。バネは必ず行き先へ
  //     収束するので、**縛る必要がそもそも無い。**
  //   ★★★**`K_CATCH` にしてはいけない**（同じく実測）―― 4フレームで着くので、
  //     200px の移動が**66ms の瞬間移動**になる（実測 … 1フレームで 232px 飛ぶ）。
  //     `K_SWING` は周期30フレームなので、**同じ 200px が「詰めて弾む」動きに見える**。
  for (const [id, s] of bandBus.nudge) {
    if (advance(s, K_SWING, D_SWING, 0)) live = true;
    // ★★**捨ててよいのは行き先が 0 のときだけ**（開いたまま静止する隙間を消さない）。
    else if (s.hole === 0 && s.gap === 0) bandBus.nudge.delete(id);
  }
  return live;
}

/** 1つぶん進める。**行き先に着いていれば偽**（誰も動いていなければループが止まる）。 */
function advance(s: Off, k: number, d: number, lim: number): boolean {
  const to = s.hole + s.gap;
  if (s.wait > 0) { s.wait -= 1; return true; }   // ★出発待ち（追突のずれ）
  springTo(s, to, k, d);
  if (lim > 0) s.p = Math.max(-lim, Math.min(lim, s.p));
  if (Math.abs(s.p - to) > CALM || Math.abs(s.v) > CALM) return true;
  s.p = to; s.v = 0;
  // ★★★**開いたまま静止している隙間では、ループを止めてよい**（絵はもう動かない）。
  //   ★次に動かすのは `wake()` を呼ぶ注文（`bandHole*`）か、**指が居るあいだ段が
  //   自分で回し続ける**（`Band.tsx` の `stepBandMotion() || bandBus.aim`）。
  return false;
}
