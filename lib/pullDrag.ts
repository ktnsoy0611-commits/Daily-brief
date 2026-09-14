import type { RefObject } from "react";
import type { CardShape } from "./cardShape";
import type { BandItem } from "./homeBand";
import { D_SWING, K_SWING, rubber, spring, springTo, type Spring } from "./spring";

// ★★★**帯のピルを引き下ろす手つきの「算数」はここ1つ**（2026-09-14・第102巡）。
//
// ★★★**ユーザーの説明がそのまま仕様**（2026-09-14）――
//   「ピルを触ると**少し柔らかいような感触**がして、少し下に引っ張ると最初は
//   **少しゴムのような反発**する感触がして、そのまま引っ張っていくと**ピルの形から、
//   ホームに落ちてくる時の図形の形に変化しながら滑らかにアニメーションして
//   指に吸い付いて**くる」。
//
// ★★★**進みは「時間」ではなく「指が引いた距離」で決まる。** だから曲線4本
//   （`lib/motion.ts`）は使わない ―― あれは**時間**の語彙。ここは物理と同じ
//   「目盛りの外」で、`docs/project_knowledge.md` §3 の例外の側に居る。
//
// ★★**絵も物理もここでは持たない。** 絵は `components/home/pilePaint.ts`、
//   物理は `components/home/pileWorld.ts`。ここは**位置と大きさと変形の進み**だけ。

/** 引き下ろしの1つの「幽霊」（＝指に付いてくる、まだ物体でないもの）。 */
export interface Ghost {
  /** 何になるか。タスクは**ピルの積み**、提案は**札の形**へ変わる。 */
  kind: "task" | "offer";
  /** 帯のピルの id（`lib/homeBand.ts` の `BandItem.id` そのまま）。 */
  id: string;
  title: string;
  /** 器の座標での中心と寸法。 */
  cx: number; cy: number; w: number; h: number;
  /** 0〜1。0 ＝ ピルのまま／1 ＝ 山での形。 */
  t: number;
  /** タスクの段の数（`rowsOf`）。 */
  rows: number;
  /** 日付が無い＝輪郭だけ（帯の下の段と同じ見え方）。 */
  outlined: boolean;
  face: string;
  ink: string;
  /** 図形に載る文字の書体の番号（`SHAPE_FACE`）。 */
  faceIdx: number;
  /** 提案のときだけ。写真を切り抜く形。 */
  shape?: CardShape;
  photo?: string;
  glyph?: string;
  // ── ここから下は `stepGhost` が毎フレーム書く（指のイベントでは触らない） ──
  /**
   * ★★★**支点から絵の中心までのずれ**（`cx`/`cy` が**支点＝指**）。
   * `t` に連れて 0 → `h/2` へ育つ ―― **指が図形の上の縁を摘まんでいる**形になり、
   * 下がぶら下がる。★振れはこの支点まわりに回る。
   */
  ax: number; ay: number;
  /** ★実際に絵が描かれる中心（支点＋ずれを振れで回したもの）。★落とし所に使う。 */
  dx: number; dy: number;
  /** ★支点まわりの振れ（rad）。 */
  angle: number;
  /** ★伸び縮み（**積は常に 1**＝面積を保つ）。 */
  sx: number; sy: number;
  /** ★伸びる向き（rad。指の速さの向き）。**振れとは別の軸**。 */
  stretchDir: number;
  /** ★いまの速さ（px/フレーム）。**離した瞬間にそのまま物理へ渡す**（`Landing`）。 */
  vx: number; vy: number;
  /**
   * ★★★**いま描かれている段の数**（1〜`rows`）。**滑らかにくびれさせない**
   * （2026-09-14・第104巡にユーザー確定「**段が増える瞬間弾んだり**」）―― 第103巡の
   * `waist` の連続変形が「**普通すぎる**」の正体だった。**カクン、カクンと生える。**
   */
  shown: number;
  /** ★弾み（0 を中心に行き過ぎて戻る。描く側は `1 + pop` を全体に掛ける）。 */
  pop: number;
}

/**
 * ★★★**引き下ろして指を離した所**（2026-09-14・第103巡）。次に山を組むとき、
 * その1つだけ**上からではなくここから**落とす ―― **投げた勢いがそのまま乗る**ので、
 * 手を離した瞬間と落ち始めのあいだに継ぎ目が無い。
 * ★`components/tabs/HomeTab.tsx` が書き、`pileWorld.buildPieces` が**1度だけ**使う。
 */
export interface Landing extends LandingAt {
  /** 落とす相手の id（タスクなら**新しく作った `Task.id`**）。 */
  id: string;
}

/** 落とし所（id はまだ決まっていない ―― 新しいタスクの id は `HomeTab` が作る）。 */
export interface LandingAt {
  x: number; y: number;
  vx: number; vy: number;
  angle: number;
}

/** ★★帯と山をつなぐ**1本の線**。React の state を毎フレーム動かさない。 */
export interface PullBus {
  ghost: Ghost | null;
  /** 山の一括の倍率（solid 座標 → px）。`Pile` が `buildPieces` から書き込む。 */
  unit: number;
  /**
   * ★★★**弾みの注文**（2026-09-14・第104巡）。`Band` が「ばちん」や「段が増えた」の
   * 瞬間にここへ勢いを置き、**山のループが1度だけ受け取って 0 に戻す**。
   * ★★バネを回すのは山のループなので、**帯から直接バネを触らせない**。
   */
  pop: number;
  /** ★指を離した所（次の1回だけ使って捨てる）。 */
  landing: Landing | null;
}

/**
 * ★★★**線は1本だけ**（module のただ1つの入れ物）。
 * ホームは画面に1つしか無いので、ref を props で回すより素直で、
 * **毎フレームの書き込みが React の描画と関わらない**（`Band` が書き `Pile` が読む）。
 * ★★**画面が消えたら `ghost` を `null` に戻すこと**（掴んだまま列を替えられる）。
 */
export const pullBus: PullBus = { ghost: null, unit: 64, landing: null, pop: 0 };

// ★★★**手つきは「ゴム → ばちん → 段が弾む」**（2026-09-14・第104巡にユーザー確定）。
//
// > **段が増える瞬間弾んだり**、引っ張る時に**引っ張っている部分がゴムが引っ張られて
// > いるように伸びて、ばちんという感じで弾けて指に吸い付く**。
//
// ★★★**最初の抵抗が強すぎた**（同指摘）―― 第103巡は **56px を指の 42%** しか
//   動かさなかったので、**引き始めが死んでいた**。**24px を 75%** へ。

/** ここまではゴム。**ここを越えると弾ける**距離（px）。★目盛りの外（手ざわり）。 */
export const PULL_ARM = 24;
/** ゴムの間、指の何割だけ動くか。★目盛りの外（手ざわり）。 */
export const PULL_RESIST = 0.75;
/** 弾けてから、**段が全部生えるまで**に要る距離（px）。★目盛りの外（手ざわり）。 */
export const MORPH_SPAN = 90;
/** ゴムの伸びしろ（`PULL_ARM` の何倍まで）。★目盛りの外（手ざわり）。 */
export const PULL_GIVE = 1.6;
/** ★★帯のピルが縦に伸びてよい上限（1 ＋ これ 倍）。★目盛りの外（手ざわり）。 */
export const PULL_TAUT = 0.6;
/** ★★★**ばちん**の勢い（弾けた瞬間にバネへ入れる初速）。★目盛りの外（手ざわり）。 */
export const SNAP_POP = 0.10;
/** ★★段が1つ増えた瞬間の弾み。★同上（ばちんより小さい）。 */
export const STEP_POP = 0.055;

/** 0〜1 を滑らかに（両端で傾き 0）。★距離で送るので時間の曲線は使わない。 */
const smooth = (t: number): number => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};

export interface PullFrame {
  /** 変形の進み 0〜1。 */ t: number;
  /** 器の座標での中心。 */ cx: number; cy: number;
  /** いまの寸法。 */ w: number; h: number;
  /** ゴムを抜けて指に付いているか（＝離したら日付が付く段階か）。 */ armed: boolean;
}

/**
 * ★★★**指の位置から、幽霊の「いま」を出す**（純粋な関数）。
 *
 * @param fx,fy   いまの指（器の座標）
 * @param sx,sy   掴んだ瞬間の指（器の座標）
 * @param bx,by   掴んだピルの中心（器の座標）
 * @param w0,h0   掴んだピルの寸法
 * @param w1,h1   山での寸法（`specOf` × `unit`）
 *
 * ★★**ゴムの間は指の `PULL_RESIST` しか動かない**（反発の手ざわり）。
 *   越えると `t` が育ち、**中心が指そのものへ寄っていく**（＝吸い付く）。
 *   ★同じ `t` が**形の変形**も動かすので、「変わりながら吸い付く」が1つの数から出る。
 */
export function pullFrame(
  fx: number, fy: number, sx: number, sy: number,
  bx: number, by: number, w0: number, h0: number, w1: number, h1: number,
): PullFrame {
  const dy = fy - sy;
  // ★下へ引いたぶんだけを見る（上へ戻せば 0 に近づく）。
  const pulled = Math.max(0, dy);
  const t = smooth((pulled - PULL_ARM) / MORPH_SPAN);
  // ゴムの側 … 指の一部だけ動く。`rubber` が閾値で傾き 1 のまま頭打ちにする。
  const give = rubber(pulled / PULL_ARM, PULL_GIVE) * PULL_ARM * PULL_RESIST;
  const gx = bx + (fx - sx) * PULL_RESIST;
  const gy = by + give;
  const armed = pulled > PULL_ARM;
  return {
    t,
    // ★★★**弾けたら指そのもの**（2026-09-14・第104巡にユーザー確定
    //   「**ばちんという感じで弾けて指に吸い付く**」）。第103巡は `t` で
    //   じわじわ寄せていたので、**弾けた手ごたえが出なかった**。
    //   ★弾ける前は帯のピル自身が伸びるので、幽霊はまだ出さない（`Band`）。
    cx: armed ? fx : gx,
    cy: armed ? fy : gy,
    w: w0 + (w1 - w0) * t,
    h: h0 + (h1 - h0) * t,
    armed,
  };
}

/**
 * ★★★**帯のピルが縦にどれだけ伸びているか**（2026-09-14・第104巡）。
 * 「引っ張っている部分がゴムが引っ張られているように伸びて」＝**ピルそのものが
 * 伸びる**（ピルごと下へ動くのではない）。**上の縁を留めて下へ伸ばす。**
 * @param pulled 下へ引いた量（px）  @param h0 ピルの高さ（px）
 * @returns 縦の倍率（1 〜 1 + `PULL_TAUT`）。
 */
export const pullTaut = (pulled: number, h0: number): number =>
  1 + Math.min(PULL_TAUT, Math.max(0, pulled) * PULL_RESIST / Math.max(1, h0));

/** ★いま何段まで生えているか（1 〜 `rows`）。★**段は連続ではなく飛ぶ。** */
export const shownRows = (t: number, rows: number): number =>
  Math.max(1, Math.min(rows, 1 + Math.floor(t * rows)));

/** 右の縁から何 px で ASSIGN の帯が出るか。★目盛りの外（手ざわり）。 */
export const RAIL_NEAR = 72;

// ── ぶら下がりと伸び縮み（2026-09-14・第103巡にユーザー確定） ─────────────
//
// ★★★**ユーザーの指定は2つだけ** … 「**指にぶら下がって揺れる**」と
//   「**引く速さで伸び縮みする**」。★「糸を引いて千切れる」「着地で山が沈む」は
//   **採らない**と確定した。**勝手に足さないこと。**
//
// ★★★**バネは `Pile.tsx` のループが回す。指のイベントでは進めない**
//   ―― `pointermove` の間隔は端末任せ（実機で 8〜30ms にばらつく）なので、
//   そこで1歩ずつ進めると**同じ手つきでも日によって手ざわりが変わる**。
//   物理と同じ**固定の刻み**で回せば、`lib/spring.ts` の係数がそのまま効く。

/** 支点が中心から上の縁へ移りきる `t`。★目盛りの外（手ざわり）。 */
export const HANG_T = 0.6;
/** 振れの上限（rad ≒ 22°）。★目盛りの外（手ざわり）。 */
export const SWING_MAX = 0.38;
/** 振れが上限に届く指の速さ（px/フレーム）。★同上。 */
const SWING_V = 18;
/** 伸びの上限（1 ＋ これ が長いほうの倍率）。★目盛りの外（手ざわり）。 */
export const STRETCH_MAX = 0.22;
/** 伸びが上限に届く指の速さ（px/フレーム）。★同上。 */
const STRETCH_V = 34;

/** 幽霊のバネ（3本）。★`Pile.tsx` が1つだけ持ち、幽霊が消えたら捨てる。 */
export interface GhostMotion {
  /** 前のフレームの中心（速さを出すため）。 */
  px: number; py: number;
  had: boolean;
  swing: Spring;
  /** 伸びの量（0〜`STRETCH_MAX`）。 */
  pull: Spring;
  /** 伸びる向き（rad）。★**速さの向き**なので、バネではなく直に持つ。 */
  dir: number;
  /** ★★**弾み**（「ばちん」と「段が増えた」で勢いを入れ、0 へ戻る）。 */
  pop: Spring;
}

export const ghostMotion = (): GhostMotion => ({
  px: 0, py: 0, had: false, swing: spring(), pull: spring(), dir: Math.PI / 2,
  pop: spring(),
});

/** −1〜1 へ滑らかに丸める（頭打ちで角が立たない）。 */
const soft = (v: number, at: number): number => Math.tanh(v / Math.max(1e-6, at));

/** 投げの上限（px/フレーム）。★これを超えると壁を貫通する。★目盛りの外（物理の場）。 */
const THROW_MAX = 18;
const clampV = (v: number): number => Math.max(-THROW_MAX, Math.min(THROW_MAX, v));

/**
 * ★★★**幽霊を1フレームぶん動かす**（`g` を直接書き換える）。
 *
 * ・**ぶら下がり** … 支点は `t` に連れて**中心 → 上の縁**へ移る（`HANG_T` で移りきる）。
 *   振れの目標は**指の横の速さ**から。★`K_TRAVEL`/`D_TRAVEL` は**わずかに行き過ぎる**
 *   ので、指を止めると**揺り返して**から静かに戻る ＝ 重いものを摘まんでいる感触。
 * ・**伸び縮み** … 速さの**向き**へ伸びる。★**積を 1 に保つ**（`sx·sy = 1`）ので、
 *   伸びても**大きさは変わって見えない** ―― 変わると「育った」に見えてしまう。
 */
export function stepGhost(mo: GhostMotion, g: Ghost): void {
  const vx = mo.had ? g.cx - mo.px : 0;
  const vy = mo.had ? g.cy - mo.py : 0;
  mo.px = g.cx; mo.py = g.cy; mo.had = true;
  // ★離した瞬間に物理へ渡す（`Landing`）。**速さの単位は px/フレーム**で、
  //   matter.js の刻みも 1000/60 固定なので**そのまま同じ意味**になる。
  g.vx = clampV(vx); g.vy = clampV(vy);

  // ★★**支点は指そのもの。図形はその下へぶら下がる**（`t` が育つほど深く）。
  //   ★指が図形の**上の縁**を摘まんでいる形になるので、回る中心が上に在る
  //   ＝「ぶら下がっている」に見える。中心を指に置くと、ただ回るだけに見えた。
  const hang = Math.min(1, g.t / HANG_T);
  g.ax = 0;
  g.ay = (g.h / 2) * hang;
  // ★★★**振れは指の動きに「遅れる」**（符号が負）。指を右へ動かせば、ぶら下がった
  //   ものは**左へ残る** ―― 正のままだと先回りして、引きずられている感じが出ない。
  springTo(mo.swing, -soft(vx, SWING_V) * SWING_MAX * hang, K_SWING, D_SWING);
  g.angle = mo.swing.p;
  const ca = Math.cos(g.angle); const sa = Math.sin(g.angle);
  g.dx = g.cx + g.ax * ca - g.ay * sa;
  g.dy = g.cy + g.ax * sa + g.ay * ca;

  // ★伸び … 速さの大きさで量、速さの向きで軸。止まっている間は向きを変えない
  //   （0 に近い速さの向きは雑音なので、拾うと図形が小刻みに回る）。
  const sp = Math.hypot(vx, vy);
  if (sp > 0.5) mo.dir = Math.atan2(vy, vx);
  // ★★★**弾み**（第104巡）… `pullBus.pop` に置かれた勢いを**1度だけ**受け取って
  //   バネへ入れ、あとは 0 へ戻す。行き過ぎるバネなので**ばちんと弾けて戻る**。
  if (pullBus.pop !== 0) { mo.pop.v += pullBus.pop; pullBus.pop = 0; }
  springTo(mo.pop, 0, K_SWING, D_SWING);
  g.pop = mo.pop.p;

  springTo(mo.pull, soft(sp, STRETCH_V) * STRETCH_MAX, K_SWING, D_SWING);
  // ★★**縮みも許す**（ユーザー確定は「伸び**縮み**」）。バネが行き過ぎるので、
  //   止めた瞬間に**伸びたぶんの反対**へ一度潰れてから戻る ＝ 弾力のある物体。
  //   ★潰れは伸びの半分まで（潰れ過ぎると別の形に見える）。
  const e = Math.max(-STRETCH_MAX / 2, Math.min(STRETCH_MAX, mo.pull.p));
  g.sx = 1 + e;
  g.sy = 1 / (1 + e);
  // ★伸びの軸は**振れとは別**なので、描く側で `dir` ぶん回してから伸ばす。
  g.stretchDir = mo.dir;
}

/** そのピルが**山で持つ姿**（大きさと見え方）。`HomeTab` が作る。 */
export interface GhostSeed {
  kind: "task" | "offer";
  title: string;
  rows: number;
  outlined: boolean;
  face: string;
  ink: string;
  faceIdx: number;
  /** 山での寸法（px）。 */
  w: number; h: number;
  shape?: CardShape;
  photo?: string;
  glyph?: string;
}

/** 帯（と山）が引き下ろしのために外から貰うもの。★**画面は持たない**。 */
export interface PullHost {
  /** 器（帯と山の共通の座標系）。 */
  box: RefObject<HTMLDivElement | null>;
  /** そのピルが山で持つ姿。`null` なら引けない。 */
  seed: (item: BandItem) => GhostSeed | null;
  /**
   * 離した。`onRail` なら右端の ASSIGN の帯の上。
   * ★`at` ＝ **指を離した所と勢い**（`pullBus.landing` に使う）。ゴムの途中で
   *   離したときは `null`（何も起きないので落とし所も要らない）。
   */
  drop: (item: BandItem, onRail: boolean, at: LandingAt | null) => void;
  /** 右端の帯を出すか消すか。 */
  rail: (on: boolean) => void;
}
