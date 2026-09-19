"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/helpers";
import { GATE_MS, onFontsReady } from "@/lib/textFit";
import { ensureWordFont, wordFontReady } from "@/lib/wordPlate";
import { DISPLAY } from "@/lib/constants";
import { clearSolidBitmaps } from "@/lib/solidPaint";
import {
  GRAVITY_Y, MASS_K, UNIT, buildPieces, clearOverlap, ghostBodyOf, isLost, makeWalls,
  refitPile, respawn, sink, type Piece,
} from "./pileWorld";
import { floorYOf } from "@/lib/pileBox";
import { SPACE } from "@/lib/tokens";
import { bandAim, bandBus } from "./bandMotion";
import { inCardShape } from "@/lib/cardShape";
import type { BandRowId } from "@/lib/homeBand";
import { clampRows, halfWidthAtStack } from "@/lib/solid";
import { rowsOf } from "@/lib/taskSize";
import { ensureGlyphs } from "@/lib/textFit";
import { SHAPE_FACE } from "@/lib/constants";
import {
  bakeDeferred, beginPileFrame, clearPileBitmaps, drawBoxOf, drawGhost, drawPile,
} from "./pilePaint";
import {
  BAND_CATCH, BAND_NEAR, PILL_HINT, RAIL_HYST, RAIL_NEAR, THROW_MAX, armOffset, ghostKey,
  ghostMotion, pullBus,
  stepGhost, type Ghost, type PillLook,
} from "@/lib/pullDrag";

import type { Body, Engine } from "matter-js";
import type { BriefCard, Item, TabId, Task } from "@/lib/types";

// ★★★**山**（2026-09-07）。**今日やると決めたもの**が積もる場所。
// 物理と図形の作り方は `./pileWorld.ts`、焼き方と描き方は `./pilePaint.ts`。
// **ここに居るのは「器・世界の寿命・指」だけ。**
//
// ★★★**2026-09-11（第92巡）に土台から組み直した。** それまでの作りには、
// 「少し直すたびにホームだけ不安定になる」原因が3つ**構造として**入っていた:
//
//  1. ★★★**canvas の実解像度が最初の1回しか合っていなかった**（＝ぼやけの正体）。
//     **同じ器に ResizeObserver を2つ**付けていて、①が先に `sizeRef` を新しい値へ
//     書き換え、②（実解像度と壁を直す唯一の場所）は「差 0」を見て毎回 return して
//     いた。仕様上 observer は**作った順**に呼ばれるので、これは必ず起きる。
//     結果、CSS の箱だけが器を追い、**古い実解像度の絵をブラウザが引き伸ばす**。
//     iOS は起動直後に器の高さが必ず動くので、実機では山まるごとがぼやけていた。
//     → **器を見る observer は1つ**にし、さらに **`draw()` の頭で毎フレーム
//       照合する**（`GravityTab` と同じ）。取りこぼしても次のフレームで直る。
//
//  2. ★★★**中身が1文字変わるたび matter.js の世界ごと作り直していた**。
//     約370行が1本の async effect で、deps は中身の署名。タスクの題・未読の枚数・
//     声を録ったか、どれが動いても **import → 書体待ち → engine → 壁 → 予算 →
//     全図形 → rAF** を丸ごとやり直していた。しかも `stop` の確認が1か所しか
//     無かったので、**前の走行が後の走行の ref を上書きする**ことがあった
//     （＝当たり判定と絵が別の世界を見る）。
//     → **effect を2本に割った**。世界（engine・壁・ループ）は `[measured]` で
//       1度だけ。中身は `[sig, worldGen]` で**図形だけ**を差し替える。
//       中身の側に `await` が無いので、**競合しようがない**。
//
//  3. **画面の細かさ**を `Math.min(2, dpr)` から 3 へ上げた。
//     ★★★**これは第107巡に取り消した。** 実機（dpr 3）で **2.77M画素**を毎フレーム
//       塗ることになり、**GRAVITY（dpr 2 で 1.09M）の 2.5倍**の費用になっていた
//       ―― ユーザーが何度も言っていた「**GRAVITY では落ちない**」の答えがこれ。
//       **`DPR_MAX` は 2。GRAVITY と揃える**（下の `DPR_MAX` の説明を読むこと）。
//
// ★★書体が遅れて届いたら**焼き直す**（`onFontsReady`）。和文の Web フォントは
//   unicode-range で 100 以上に分かれて届くので、`document.fonts.ready` の
//   あとに本物が来る ―― 購読していなかったので、代替書体のまま固まり得た。

/** 掴むまでの長押し。★`GravityTab` と同じ（動かすとスワイプ扱い）。 */
const HOLD_MS = 150;
const TAP_MOVE = 8;
/** ★指の太さぶんの余裕（当たり判定を外へ広げる）。★目盛りの外（触りごこち）。 */
const TOUCH_SLOP = 10;
/** 掴んだ図形が指へ寄る強さと、離れてよい上限。★同上。 */
const GRAB_K = 0.34;
const GRAB_MAX = 34;
/**
 * ★★★**画面の細かさの上限 ＝ 2。`GravityTab` と同じ**（2026-09-16・第107巡）。
 *
 * ★★★**ユーザーの手がかり「GRAVITY ではフレームが落ちない」の答えがこれだった。**
 *   `components/tabs/GravityTab.tsx` と `components/tasks/SolidCanvas.tsx` は
 *   ずっと `Math.min(devicePixelRatio, 2)` で、**ホームの山だけが 3** だった。
 *   実機（dpr 3）の実画素 … GRAVITY **1.09M** 対 ホーム **2.77M ＝ 2.5倍**。
 *   落下中は毎フレーム塗るので、**そのまま 2.5倍の費用**になる。
 *
 * ★★★**「2 で止めると 1.5倍に引き伸ばされる」は当時の実装のバグの記録**であって、
 *   2 が悪いのではない ―― **1.5 は 3 ÷ 2 そのもの**で、**実解像度を 2 で作りながら
 *   `setTransform` には 3 を渡していた**ことの動かぬ証拠。いまの `sync()` は
 *   **同じ値を返して同じ値を使う**ので、この道は塞がっている。
 *   ★★**同じ値を2か所から取らないこと。** それが唯一の再発の道。
 */
const DPR_MAX = 2;
/**
 * ★★★**床が動いていないか見に行く間隔**（2026-09-14・第103巡）。★目盛りの外（物理の場）。
 *
 * ★★★**床は器の寸法が変わらなくても動く。** `floorYOf` は `navHeightPx()` に
 *   依存し、`NAV_H = calc(77px + NAV_BOTTOM_GAP)` の `NAV_BOTTOM_GAP` は
 *   `env(safe-area-inset-bottom)` から出る ―― 実機では遅れて 0 → 34 になる。
 *   このとき列の `paddingBottom: var(--nav-h)` と `.bleed-x-b` の
 *   `margin-bottom: -nav-h` が**打ち消し合うので器の高さは 1px も動かず**、
 *   `ResizeObserver` は撃たれない。**壁だけが古い床のまま取り残される。**
 * ★`navHeightPx()` は probe の div を作って測るので毎フレームは重い。
 *   **2秒に1度で十分**（床が動くのは向きを変えたときと起動直後だけ）。
 */
const FLOOR_CHECK_MS = 2000;
/** ★これ未満の動きは**塗り直さない**（px）。★実機の倍率 3 で 1デバイス画素より細かい。 */
const REST_EPS = 0.25;
/** ★角度を px へ直す目安（この長さの腕の先がどれだけ動くか）。★目盛りの外（絵の寸法）。 */
const REST_ANG = 120;
/**
 * ★★★**物理の1歩（ms）と、1フレームに進めてよい上限の歩数**（2026-09-14・第104巡）。
 * ★目盛りの外（物理の場）。**`GravityTab` と同じ 1000/60。**
 * ★★歩数を実時間から決めるので、**60Hz でも 120Hz でも同じ速さで落ちる**。
 */
const STEP_MS = 1000 / 60;
const MAX_STEPS = 2;

/** ★帯のピルどうしの隙間（`components/home/Band.tsx` の `gap: SPACE.sm`）。 */
const BAND_GAP = SPACE.sm;

/** ★幽霊の箱の余白（振れ・伸び・弾みのぶん）。★目盛りの外（絵の寸法）。 */
const GHOST_PAD = 24;
/**
 * ★★★**切り抜きに入れてよい矩形の数**（2026-09-16・第115巡）。これを超えたら
 * **全面を1回消して描き直す**。★目盛りの外（絵の作り方）。
 * ★★★**多角形の切り抜きは塗る画素より高くつく** ―― `ctx.clip()` に矩形を2つ以上
 *   入れると、Skia は**矩形の切り抜きではなくマスクの層**を組む。落下中は全部の
 *   図形が動くので、**毎フレーム最大 2n 個の矩形**で層を作り直していた。
 * ★2 にすると「落ち着いた山で1つだけ転がる」場合の得（第106巡の狙い）は残り、
 *   落下中の損だけが消える。
 */
const PAINT_BOXES = 2;
/** ★畳んだ箱がこの割合を超えたら全面（どうせ大半を塗り直す）。★目盛りの外。 */
const PAINT_FULL = 0.5;

/**
 * ★★★**代理の体を手放すまでの締切**（ms。2026-09-15・第110巡）。
 * 指を離してから本番の体が world へ入るまでの窓（`drop` → `put` → `persist` →
 * React の1コミット → `buildPieces` → 次の rAF）を跨ぐだけの長さ。
 * ★★**これが無いと片づかない道がある** … カレンダー経由（`put` は次の画面へ回る）、
 *   `put` の早期 return、閾値に届かずに離した ―― どれも**着地が来ない**。
 * ★目盛りの外（物理の場の後始末）。
 */
const HANDOFF_MS = 300;

/**
 * ★`ghostKey` の中で**無次元の値**（角度・倍率・進み）が並ぶ位置。
 * 比べるときだけ `REST_ANG` を掛けて px に直す。★目盛りの外（絵の寸法）。
 * ★★**`lib/pullDrag.ts` の `ghostKey` の並びと対**。片方を直したら両方。
 */
const GHOST_UNITLESS = new Set([4, 7, 8, 9, 10, 11, 16]);

/**
 * ★★★**帯へ戻すときの幽霊を作る**（2026-09-15・第106巡）。
 *
 * ★★★**引き出しの幽霊とまったく同じ形**で、`t` の向きだけが逆
 *   （引き出し … 0 → 1 ／ 戻す … 1 → 0）。**語彙を1つも増やさない。**
 * ★`w0/h0` ＝ 帯でのピル、`w1/h1` ＝ 山での図形。`t` が2つを混ぜる。
 */
function homeGhost(p: Piece, look: PillLook, owner: number): Ghost {
  const x = p.body.position.x; const y = p.body.position.y;
  const d = p.r ? p.r * 2 : 0;
  return {
    home: true, owner, kind: p.kind === "offer" ? "offer" : "task",
    id: p.id, title: p.title ?? "",
    cx: x, cy: y, hx: x, hy: y, w: p.w ?? d, h: p.h ?? d,
    t: 1, tTo: 0,
    w0: look.w, h0: look.h, w1: p.w ?? d, h1: p.h ?? d,
    bend: 0, gx: 0, look,
    rows: clampRows(rowsOf(p.title ?? "")), outlined: !!p.outlined,
    // ★戻す幽霊は**山に居る本物**なので、重さはその体からそのまま引く。
    area: p.body.mass / MASS_K,
    face: p.face, ink: p.ink, faceIdx: p.face_ ?? 0,
    shape: p.shape, photo: p.photo, label: p.label,
    ax: 0, ay: 0, dx: x, dy: y, angle: p.body.angle,
    sx: 1, sy: 1, stretchDir: Math.PI / 2, vx: 0, vy: 0,
    waist: 1,
    // ★山から始めるので、出だしは**図形の姿**。畳み終えたら `stepGhost` が倒す。
    pill: false,
  };
}

/**
 * ★★★**書体を頼んでから、締切つきで待つ**（2026-09-13・第101巡）。
 *
 * 第100巡までは `await document.fonts?.ready` だった。これは2つとも間違い ――
 * ① **頼んでいないものは待たない** … canvas は読み込みを頼まないので、
 *    Anton を頼まないまま「もう揃った」と返る（板が代替の書体で測られる）。
 * ② **締切が無い** … 3つの列が絶えず `document.fonts.load()` を投げていて、
 *    この Promise は**読み込み中になるたび差し替わる**。1つ止まれば永久に返らない。
 *    その先に `setWorldGen`（＝山に中身を入れる唯一の引き金）しか無いので、
 *    **山が永久に空**になる。
 * → **頼む（`ensureWordFont`）＋ `GATE_MS` で必ず開ける**（`lib/textFit.ts` と同じ数）。
 */
const waitFonts = () => Promise.race([
  ensureWordFont(DISPLAY),
  new Promise((r) => setTimeout(r, GATE_MS)),
]);

export function Pile({
  tasks, offers, picks, unread, today, journal, onOpen, above, onRail, onAssign,
  bandBottom, pillOf, onUnassign, rowCenter,
}: {
  tasks: Task[];
  offers: Item[];
  /** ★★その日の「好みそうな」提案（`lib/offerPick.ts`）。**押すと Explore へ飛ぶ**。 */
  picks: { ed: string; card: BriefCard }[];
  unread: number;
  today: Date;
  /** ★その日まだ声を録っていないか（真なら録音のダイヤルの円を落とす）。 */
  journal: boolean;
  /** ★図形を**軽く押した**ときの行き先。長押しは掴むほうなので走らない。 */
  /** ★`card` ＝ 飛んだ先で**開いておきたいカードの id**（おすすめの図形だけが持つ）。 */
  onOpen: (tab: TabId, card?: string) => void;
  /**
   * ★★**帯の上へ上げるか**（2026-09-14・第105巡）。引き下ろしの写し取ったピルは
   * この canvas に描かれるので、引いているあいだだけ帯より前へ出す。
   */
  above?: boolean;
  /** ★右端の ASSIGN の帯を出すか消すか。 */
  onRail?: (on: boolean) => void;
  /** ★掴んだ図形を右端の ASSIGN の帯で離したとき（日付を付け直す）。 */
  onAssign?: (piece: Piece) => void;
  /**
   * ★★★**帯の下端**（器の座標）。ここより上へ運べば「帯へ戻す」（2026-09-15・第106巡）。
   * ★帯そのものの高さは `components/tabs/HomeTab.tsx` が測る（山は帯を知らない）。
   */
  bandBottom?: () => number;
  /** ★その図形が帯へ戻ったときのピルの顔（`HomeTab` が帯の規則から組み立てる）。 */
  pillOf?: (piece: Piece) => PillLook | null;
  /**
   * ★掴んだ図形を帯の上で離したとき（**日付を消して帯へ戻す**）。
   * @param at ★★★**指が指していた挿し口の index**（2026-09-16・第112巡）。
   *   `null` なら挿し口が出ていなかった＝並べ替えない。
   */
  onUnassign?: (piece: Piece, after: string | null) => void;
  /**
   * ★★★**その図形が戻る段と、その段の中心**（器の座標。2026-09-15・第110巡）。
   * ★**空の段は描かれない**ので「上が row0・下が row1」と決め打ちできない ――
   *   `HomeTab` が `.band-row` を実測して返す。
   */
  rowCenter?: (row: BandRowId) => number | null;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const piecesRef = useRef<Piece[]>([]);
  const matterRef = useRef<typeof import("matter-js") | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef(0);
  /** ★★★器の寸法は**ref で持つ**（state ではない）。state にすると、iOS で器が
   *  1px 揺れるたびに React が作り直し、**山が落ち直して震え続ける**。 */
  const sizeRef = useRef({ w: 0, h: 0 });
  /** ★★★**器の伸び縮みに応えるのはこの1本だけ。** 世界の effect がここへ
   *  「canvas と壁を直す」を置き、器を見る observer がそれを呼ぶ。
   *  **observer を2つ付けない**（付けると先に走ったほうが番人を黙らせる）。 */
  const onResizeRef = useRef<((w: number, h: number) => void) | null>(null);
  /** 落とし始めの時刻と、もう世界へ入れた図形。★中身を差し替えるたびに作り直す。 */
  const releaseRef = useRef<{ at: number; done: Set<string> }>(
    { at: 0, done: new Set() },
  );
  /** 最初に測れたら1度だけ真になる（世界を組む合図）。以後は動かさない。 */
  const [measured, setMeasured] = useState(false);
  /** ★世界ができた合図（中身の effect はこれを待つ）。 */
  const [worldGen, setWorldGen] = useState(0);
  /** ★★**山が空のまま取り残されたときに入れ直す合図**（第101巡）。 */
  const [seedGen, setSeedGen] = useState(0);
  /** ★板を組んだ時点で、板の書体が本当に届いていたか（第101巡）。 */
  const plateFontRef = useRef(false);
  /** ★★中身を組んだときの床（＝そのとき図形の大きさを決めた高さ）。第103巡。 */
  const builtFloorRef = useRef(0);
  /**
   * ★★★**次のフレームで必ず描き直す**（2026-09-14・第105巡）。
   * 山は**絵が変わらないフレームでは canvas に触らない**ので、**絵は同じでも
   * 中身が変わったとき**（焼き直し・写真の到着・器の作り直し）はここで頼む。
   */
  const dirtyRef = useRef(true);
  /** ★山の一括の倍率（solid 座標 → px）。引き下ろしの行き先の大きさに要る。 */
  const unitRef = useRef(UNIT);
  /** ★倍率を決め直してよい世代（`worldGen:seedGen`）。同じ世代なら据え置く。 */
  const holdGenRef = useRef("");
  /**
   * ★★★**引き下ろしている図形の「代理の体」**（2026-09-15・第110巡）。
   * 設計は `components/home/pileWorld.ts` の `ghostBodyOf` と、下の `syncProxy`。
   * ★★★**`piecesRef` には混ぜない** ―― ループの走査・`drawnBox` の添字・
   *   全面塗りの判定（`length * 4`）・停止条件（`every(isSleeping)`）・
   *   番人（`sink`/`isLost`）が**全部「長さと順番が安定している」前提**で、
   *   代理は眠らないので混ぜると**ループが二度と止まらない**し、
   *   `isLost` が**掴んでいる図形を画面の上へ飛ばす**。
   */
  const proxyRef = useRef<{
    body: Body; id: string; owner: number; inertia: number;
    /** `"held"` ＝ 指が持っている／`"handoff"` ＝ 離したが本番がまだ来ていない。 */
    state: "held" | "handoff"; since: number;
  } | null>(null);
  /** ★★本番が落ちてきたときに代理を消すための、着地する相手の id。 */
  const landedRef = useRef<string | null>(null);
  /** ★指が右の縁の近くに居るか（毎フレームの state を避けて ref で持つ）。 */
  const railRef = useRef(false);
  const [holding, setHolding] = useState(false);
  /** ★`angle` ＝ **掴んだときの角度**（運んでいるあいだ固定する。第112巡）。 */
  /**
   * ★`place` … **帯へ戻す／右端で日付を付け直す**が効く相手か（＝`pillOf` が
   * 版面を返す相手か）。★★★**日付と曜日の板は運べるが、行き先は無い**
   * （2026-09-18・第120巡。ユーザー「**日付もつかめるように**」）。
   */
  const dragRef = useRef<
    { piece: Piece; x: number; y: number; angle: number; place: boolean } | null>(null);
  /**
   * ★★★**ループが回っているか／回す本体**（2026-09-16・第107巡。`GravityTab` と
   * 同じ名前・同じ形）。**読む人が1つの作りだけ覚えればよい**ようにしてある。
   */
  const runningRef = useRef(false);
  const loopRef = useRef<() => void>(() => {});
  /** ★★**絵が変わり得るときは必ずこれを呼ぶ**（止まっていたら回し直す）。 */
  const wake = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(() => loopRef.current());
  }, []);
  /** ★いま帯の上に居るか（出入りの瞬間だけ動く）。 */
  const homeRef = useRef(false);

  /**
   * ★★★**代理の体を world から外す**（2026-09-15・第110巡）。
   * ★**片づけの口は1つ**（照合・着地・世界の後始末が同じ1本を読む）。
   */
  const dropProxy = useCallback((M: typeof import("matter-js"), engine: Engine) => {
    const px = proxyRef.current;
    if (!px) return;
    proxyRef.current = null;
    M.Composite.remove(engine.world, px.body);
    // ★★寄りかかっていた隣を起こす（支えが消えたことを matter は自分で気づかない）。
    for (const q of piecesRef.current) M.Sleeping.set(q.body, false);
  }, []);

  /**
   * ★★★**代理の体を「条件」で毎フレーム照合する**（2026-09-15・第110巡にユーザー
   * 指定「**引き出して掴んでいる図形に当たり判定がない。付けてください**」）。
   *
   * > 代理が在るべき ⟺ 幽霊が在る **かつ** 帯へ戻す最中ではない **かつ** ピルの姿でない
   *
   * ★★★**出来事（`armed`）を掛け金にしない** ―― `armed` には遊びが無いので、
   *   指が閾値の上で止まると**毎 pointermove で体が生まれては消える**。
   *   `g.pill` は第108〜109巡に入れた遊びを**既に持っている**うえ、
   *   **`drawGhost` が分岐しているのと同じ掛け金**なので、**体の有無と絵の姿が
   *   同じフレームで変わる**（ピルの写しに山の体が付く瞬間が原理的に無い）。
   * ★★★**鍵は `(id, owner)`** ―― `Band.onMove` は pointermove ごとに幽霊の
   *   オブジェクトを作り直すので、**同一性では見ない**。
   * ★★**取り消しの道は数えなくてよい** ―― `pointercancel`・捕捉外れ・unmount・
   *   窓の `pointerup`・タブ切り替えは**全部 `pullBus.ghost = null` に落ちる**ので、
   *   次のフレームで自然に消える。**明示するのは受け渡しと締切だけ。**
   */
  const syncProxy = useCallback((
    M: typeof import("matter-js"), engine: Engine, g: Ghost | null, now: number,
  ): Body | null => {
    const px = proxyRef.current;
    const want = g && !g.home && !g.pill;
    if (px) {
      // ★★★**離したあとも、本番が来るまでは残す**（受け渡し）。消すと、
      //   寄りかかっていた隣が1〜2フレーム崩れ、そのあと本番が `clearOverlap` で
      //   持ち上げられて**ぽんと跳ねる**。★穴を正しい大きさで開けたまま待つ。
      if (!want || px.id !== (g?.id ?? "") || px.owner !== (g?.owner ?? -1)) {
        if (px.state === "held") {
          px.state = "handoff"; px.since = now;
          // ★サーボを止めるので、慣性は本物へ戻す（以後はただの図形として落ちる）。
          M.Body.setInertia(px.body, px.inertia);
        }
        // ★★★**締切は必須**（任意ではない）―― カレンダー経由・`put` の早期 return・
        //   閾値未満での離上は**着地が来ない**ので、これだけが片づける。
        if (now - px.since > HANDOFF_MS) dropProxy(M, engine);
        return null;
      }
      return px.body;
    }
    if (!want || !g) return null;
    // ★★★**形と大きさは変形の行き先から1度だけ**（`g.w/g.h` は 37% 行き過ぎる
    //   ばねで動き続けるので、追いかけると体が脈打って山を押し広げては戻す）。
    let made: { body: Body; inertia: number };
    try {
      made = ghostBodyOf(M, g, g.w1, g.h1);
    } catch { return null; }              // ★作れなければ黙って今までどおり（絵だけ）
    const body = made.body;
    M.Body.setPosition(body, { x: g.dx, y: g.dy });
    M.Body.setAngle(body, g.angle);
    M.Body.setVelocity(body, { x: 0, y: 0 });
    M.Body.setAngularVelocity(body, 0);
    M.Sleeping.set(body, false);
    // ★★★**作るときに `clearOverlap` を掛けない** ―― 真上へ持ち上げるので、
    //   「ばちん」の瞬間に**指から figure が飛び上がる**。重なりはサーボが次の歩で解く。
    M.Composite.add(engine.world, body);
    for (const q of piecesRef.current) M.Sleeping.set(q.body, false);
    proxyRef.current = {
      body, id: g.id, owner: g.owner, inertia: made.inertia, state: "held", since: now,
    };
    return body;
  }, [dropProxy]);

  // ── 器を測る（★observer はこの1つだけ） ──────────────────────
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const read = () => {
      const w = box.clientWidth; const h = box.clientHeight;
      // ★★★**0 は書き込まない**（2026-09-13・第101巡）。**ユーザー報告
      //   「何度か開いたら図形が出なくなりました」の直接の原因のひとつ。**
      //   `kickViewport` は画面を開くたびに器を作り直すので、`clientHeight` が
      //   一瞬 0 になる。0 のまま `makeWalls` が走ると ――
      //   ① 左右の壁が `bh * 3 = 0` ＝ **面積 0 → 重心が NaN**（当たらない壁）
      //   ② `floorYOf(0)` は**画面の上**（≒ -130）
      //   図形は横へ逃げて二度と戻らない（中身を入れ直す道が無い）。
      if (w <= 0 || h <= 0) return;
      // ★0.5px 未満のゆらぎは無視（`GravityTab` と同じ番人）。
      const same = Math.abs(w - sizeRef.current.w) < 0.5 && Math.abs(h - sizeRef.current.h) < 0.5;
      sizeRef.current = { w, h };
      setMeasured(true);
      if (!same) onResizeRef.current?.(w, h);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // ── 世界（engine・壁・ループ）。★`measured` で1度だけ ────────────
  useEffect(() => {
    const cv = cvRef.current;
    if (!measured || !cv) return;
    let stop = false;

    (async () => {
      const M = (await import("matter-js")).default ?? (await import("matter-js"));
      if (stop) return;
      // ★★★**書体が届くまで待つ**（2026-09-09）。日付の板は**実際に組んだ字を
      //   測って**大きさを決めるので、届く前に測ると**代替の書体の幅**で
      //   決まってしまい、板が小さいまま出る（実測 155px／狙いは 236px）。
      // ★★★**ただし門は時間で必ず開ける**（2026-09-13・第101巡）。
      //   `document.fonts.ready` は**文書が読み込み中になるたび新しいものに
      //   差し替わる**うえ、このアプリは3列から絶えず `document.fonts.load()` を
      //   投げている。1つでも止まれば**この await は永久に返らない** ――
      //   その先には `setWorldGen`（＝**山に中身を入れる唯一の引き金**）しか
      //   無いので、**山が永久に空**になる。ユーザー報告「何度か開いたら図形が
      //   出なくなりました」の直接の原因。
      //   ★★これは `lib/textFit.ts` が `GATE_MS` で一度解決した罠。**同じ数を読む。**
      await waitFonts();
      if (stop) return;
      matterRef.current = M;

      // ★★★**最初から眠りを許す。`GravityTab` とまったく同じ**（2026-09-16・第108巡）。
      //
      // ★★★**5巡ぶん直らなかった「ガクガクブルブル震えて止まらない」の根本原因は
      //   ここだった。** matter.js で詰まった山の微振動を殺しているのは
      //   `enableSleeping` ただ1つ ―― 眠った体は**ソルバの反復から外れる**ので、
      //   **揺れ得る自由度そのものが消える**。GRAVITY はフレーム1から眠りが有効で、
      //   各体が `sleepThreshold`（60歩＝1秒）静かなら**個別に**凍る。
      // ★★★**ホームだけ眠りを切って始め、「大域の門」が開くまで許していなかった**
      //   （`settleAt` 2500ms ＋ `STILL_FRAMES` 30 ／ or 全員が `CALM_V` 未満）。
      //   門は**全体の最大値**で測るので、**1つでもゆっくり転がっていれば開かない**。
      //   詰まった山の微振動の `speed` はちょうど 0.3〜0.5 に居座るため、
      //   **門が永久に開かない＝誰も凍らない＝永久に震える**ことがあった。
      //   ★実測（Chromium・CPU 6倍遅）… 門つきで**全員が眠るまで 11.2 秒**。
      //     GRAVITY は `enableSleeping: true`／`positionIterations: 6`（実測）。
      // ★★★**門を切った当時の心配（落下中に眠って宙に浮く）は別の1行で消える**
      //   ―― 落下中に世界が変わるのは**新しい体が入ってくる瞬間だけ**なので、
      //   **入れたフレームで全員を起こす**（下の `Composite.add` の所）。
      // ★★★**`SETTLE_MS`/`CALM_V`/`CALM_W`/`STILL_FRAMES`/`SLEEP_EPS`/`settleAt`/
      //   `still`/`prev` は第108巡に削除した。復活させない。**
      const engine = M.Engine.create({ enableSleeping: true });
      engine.gravity.y = GRAVITY_Y;
      // ★★★**`positionIterations` は既定の 6 のまま**（2026-09-16・第108巡）。
      //   ★★★**第106巡に 10 へ上げたのは逆効果だった。戻さない。**
      //     matter は `positionDamping = clamp(20 / positionIterations, 0, 1)` なので、
      //     **6 でも 10 でも減衰は 1 にクランプされる** ―― 柔らかくはならず、
      //     `_positionDampen`(0.9) の**全力の緩和を4回余計に回すだけ**。しかも
      //     `_positionWarming`(0.8) で前フレームの押し戻しが持ち越されるので、
      //     過補正が**振動として持続する**。**GRAVITY は 6 で震えていない。**
      engineRef.current = engine;

      let walls: Body[] = [];
      /** ★★いま壁が置かれている床の y（**番人も毎フレームこれを読む**）。 */
      let floorY = floorYOf(sizeRef.current.h);
      const buildWalls = (bw: number, bh: number) => {
        if (walls.length) M.Composite.remove(engine.world, walls);
        walls = makeWalls(M, bw, bh);
        M.Composite.add(engine.world, walls);
        // ★★★**床が動いたぶんだけ山ごと動かす**（2026-09-14・第103巡）。
        //   床の板は `WALL_T`(200px) と厚いので、床が上がった瞬間に図形は
        //   **板の中**に入り、**いちばん浅い軸＝下へ**押し出されて抜ける
        //   （ユーザー報告「図形が地面の下に落ちてしまう」）。横画面では床が
        //   444px も上がるので、山は丸ごと板の下へ取り残されて**永遠に落ちる**
        //   （同「横画面にして戻すと図形が消える」）。
        //   ★**一緒に動かせば相対の位置が変わらない**＝積み上がった形も崩れない。
        const next = floorYOf(bh);
        refitPile(M, piecesRef.current.map((p) => p.body), bw, next - floorY);
        floorY = next;
        // ★★★**器が大きく変わったら、大きさを決め直す**（2026-09-14・第103巡）。
        //   図形の大きさは**組んだときの床までの高さ**から決まる（`buildPieces` の
        //   面積の予算）。横画面のように器が半分になると、山は**入り切らずに
        //   押し合い、下の図形が床の板へめり込む**（実測 … 486px の器で 23px 沈んだ）。
        //   ★★**落ち直しは起きない** ―― 組み直しは `prev` で**居場所を引き継ぐ**
        //   ので、変わるのは大きさだけ。★小さな揺れでは撃たない（15% の閾値）。
        const built = builtFloorRef.current;
        if (built > 0 && Math.abs(next - built) > built * 0.15) setSeedGen((n) => n + 1);
        dirtyRef.current = true;
        wake();
      };
      buildWalls(sizeRef.current.w, sizeRef.current.h);

      // ★★**器が伸び縮みしたら、壁だけ作り直す**（山は落とし直さない）。
      //   iOS はツールバーや安全域で器の高さが常に少し動くので、そのたびに
      //   山を組み直すと**震え続ける**。
      onResizeRef.current = (nw, nh) => {
        buildWalls(nw, nh);
        for (const p of piecesRef.current) M.Sleeping.set(p.body, false);
        // ★★★**空だったら入れ直す**（2026-09-13・第101巡）。中身を入れるのは
        //   `[sig, worldGen]` の effect だけで、`sig` は中身の署名なので
        //   **一度入れ損なうと二度と入らない**（壁だけ作り直しても山は空のまま）。
        //   ★**空のときにしか撃たない**ので、iOS が器の高さを絶えず動かしても
        //   山は落ち直さない（第92巡の「震え続ける」を壊さない）。
        if (piecesRef.current.length === 0) setSeedGen((n) => n + 1);
      };

      // ★★★**`getContext` が返さなくても行き止まりにしない**（第101巡）。
      //   ここで `return` すると `setWorldGen` に届かず**山が永久に空**になる
      //   （iOS で canvas の総量が尽きたときに起こり得る）。毎フレーム取り直す。
      let ctx = cv.getContext("2d");
      /** ★次に床を見に行く時刻（`FLOOR_CHECK_MS` ごと）。 */
      let floorAt = performance.now() + FLOOR_CHECK_MS;
      /** ★最後に描いた図形の箱（4つ×n）。**消し残しを防ぐために前の箱も消す**。 */
      let drawnBox: number[] = [];
      /** ★最後に描いた幽霊の箱。居なくなった1フレームだけ消しに使う。 */
      let ghostBox: [number, number, number, number] | null = null;
      /** ★最後に描いた幽霊の姿（dx, dy, angle, w, sx, pop）。塗り直すかの判定に使う。 */
      let gDrawn: number[] | null = null;
      /** ★写真が届いたときの合図。**毎フレーム作らない**（第106巡）。 */
      const onPhoto = () => { dirtyRef.current = true; wake(); };
      /** ★引き下ろしの幽霊のバネ（幽霊が消えたら捨てる）。 */
      let motion = ghostMotion();
      /** ★物理へまだ渡していない実時間（`STEP_MS` 単位で消費する）。 */
      let acc = 0;
      let last = performance.now();
      /** ★**最後に描いたときの**位置と角度（x, y, angle の並び）。 */
      const drawn: number[] = [];


      /** ★★★**実解像度は毎フレーム照合する**（`GravityTab` と同じ2行）。
       *  倍率も毎回読む ―― 端末の表示設定やウィンドウの移動で変わり得る。 */
      const sync = () => {
        const { w, h } = sizeRef.current;
        const dpr = Math.min(DPR_MAX, window.devicePixelRatio || 1);
        const cw = Math.round(w * dpr); const ch = Math.round(h * dpr);
        if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
        return { w, h, dpr };
      };

      const loop = () => {
        if (stop) return;
        const now = performance.now();
        const rel = releaseRef.current;
        // ★★★**世界へは1つずつ入れる**（2026-09-09）。まとめて入れると全部が同時に
        //   落ち始めるので、順番を作るために出どころを空の彼方まで持ち上げる羽目に
        //   なる。**入れる時刻をずらせば、出どころは器のすぐ上でよい。**
        for (const p of piecesRef.current) {
          if (rel.done.has(p.id)) continue;
          const at = (p.body.plugin as { releaseAt?: number } | undefined)?.releaseAt ?? 0;
          if (now - rel.at < at) continue;
          rel.done.add(p.id);
          // ★★★**着地する1枚の直前に、代理の体を消す**（2026-09-15・第110巡）。
          //   ★★★**`clearOverlap` は world の全部を見る** ―― 本番は `landing` の
          //     位置（＝代理とほぼ完全に重なる所）に生まれるので、代理が居ると
          //     **1体ぶん真上へ持ち上げられて落ちる**。`landing` が消したはずの
          //     跳ねが、そのまま戻る。**この2行の順番が仕様。**
          //   ★あいだに `Engine.update` は走らないので、隣は穴を1フレームも見ない。
          if (landedRef.current === p.id) {
            landedRef.current = null;
            dropProxy(M, engine);
          }
          // ★★★**入れる直前に、すでに居る体との重なりを解く**（2026-09-15・第109巡）。
          //   ★★★**「順番を時間で作る」だけでは位置を分けていなかった** ――
          //     `DROP_EVERY_MS`(60ms) で落ちる距離は **2.5px**、散らばりの幅は
          //     **200px**（79倍）。実測で **16組が最大 82px めり込んだ状態**で
          //     world に入っていた（`GravityTab` の幾何のはしごなら 0 組）。
          //     めり込んだ体は位置ソルバに叩き出されて弾け、隣を押す ――
          //     ユーザー報告「**落ちてきてぶつかった時にめり込んで震える**」の正体。
          //   ★理由と式は `components/home/pileWorld.ts` の `clearOverlap`。
          // ★★★**掛けてよいのは「新しく湧いた体」だけ**（2026-09-15・第111巡）。
          //   `clearOverlap` は **AABB で見て真上へ持ち上げる**ので、落ち着いた山
          //   （傾いた図形どうしの AABB は必ず重なる）に掛けると**縦の塔へ積み直す**。
          //   ★**着地の1枚にも掛けない** ―― 指を離した所がそのまま正しい。
          if (p.fresh) clearOverlap(M, p.body, M.Composite.allBodies(engine.world));
          M.Composite.add(engine.world, p.body);
          // ★★★**入れたフレームで全員を起こす**（2026-09-16・第108巡）。
          //   ★★matter は「支えていた物体が転がって居なくなった」では眠った体を
          //     起こさない（起きるのは**新しい衝突**のときだけ）。落下中に世界が
          //     変わるのは**ここだけ**なので、**この1行が大域の門の代わり**になる。
          //   ★体は多くても14個・入れる瞬間だけなので、費用は無い。
          for (const q of piecesRef.current) M.Sleeping.set(q.body, false);
        }
        // ★★★**刻みは固定。ただし歩数は実時間で決める**（2026-09-14・第104巡）。
        //
        //   ★刻みを固定にするのは正しい（2026-09-07）―― 実時間の差分をそのまま
        //     渡すと、フレームが落ちた瞬間に刻みが伸びて**貫通・弾け・震え**が起きる。
        //   ★★★**ところが「1フレームに1歩」は間違いだった。** 実機（iPhone の
        //     ProMotion）は **120fps** なので、`requestAnimationFrame` ごとに1歩
        //     進めると**1秒に 120 歩＝物理が2倍速で走る**。落ちる速さも衝突の
        //     速さも2倍になり、**めり込みの深さもおよそ2倍**になる ―― 重い板が
        //     軽い図形を床の板（`WALL_T` 200px）の中心線より下まで押し込み、
        //     **下から吐き出されて落ちていく**。ユーザー報告「図形が何度も
        //     すり抜けて落ちてしまいます」の**いちばん大きな原因**。
        //   ★★★**Chromium も Playwright の WebKit も 60fps なので、この環境では
        //     絶対に再現しない。** 「実機でだけ起きる」の正体がこれ。
        //   → **実時間を貯めて、`STEP_MS` の整数歩だけ進める。**
        //     ★1フレームの上限は `MAX_STEPS`（画面を離れて戻ったときに、貯まった
        //     何百歩ぶんを一気に走らせない ―― 走らせると山が吹き飛ぶ）。
        acc = Math.min(acc + (now - last), STEP_MS * MAX_STEPS);
        last = now;
        // ★★★**幽霊のバネと変形も、物理とまったく同じ固定の刻みで進める**
        //   （2026-09-15・第106巡）。★★第105巡までは**1フレームに1回**呼んで
        //   いたので、**120Hz の実機ではバネも変形も2倍速**だった（同じ手つきでも
        //   端末によって手ざわりが違う）。ここへ入れれば、60Hz でも 120Hz でも同じ。
        const gh = pullBus.ghost;
        // ★★★**代理の体を照合する**（2026-09-15・第110巡。作る／消す／受け渡す）。
        const px = syncProxy(M, engine, gh, now);
        // ★★**帯へ戻す幽霊は、掴んでいる体そのものに付いて動く**（指のバネは
        //   体がすでに持っているので、二重に掛けない）。
        if (gh?.home) {
          const b = dragRef.current?.piece.body;
          if (b) { gh.cx = b.position.x; gh.cy = b.position.y; gh.angle = b.angle; }
        }
        while (acc >= STEP_MS) {
          // ★★★**サーボは「歩」の中**（2026-09-15・第110巡）。rAF ごとにすると
          //   120Hz の実機で2倍速になる（第104巡・第106巡で2度踏んだ）。
          if (px && gh) {
            // ★★★**`setVelocity` は眠った体を起こさない**（第106巡）。
            //   1秒静止してから動かすと付いてこなくなるので、**毎歩**起こす。
            M.Sleeping.set(px, false);
            // ★★**角度の持ち主は振れのばね1つ**（慣性は無限なので接触では回らない）。
            M.Body.setAngle(px, gh.angle);
            M.Body.setAngularVelocity(px, 0);
            // ★★★**利得は 1**（＝「衝突を尊重する瞬間移動」）。何にも当たって
            //   いなければ体は望んだ所へ丸ごと動き、当たっていればソルバが削る。
            //   ★★**`GRAB_K`/`GRAB_MAX` を使わない** ―― あれは柔らかいサーボで、
            //     追いつきのばねに重ねると**2極のフィルタ**になる（＝「硬い」）。
            //   ★頭打ちは `THROW_MAX`（「これを超えると壁を貫通する」の1つの数）。
            const arm = armOffset(gh.ax, gh.ay, gh.angle);
            const dx = motion.catchX.p + arm.x - px.position.x;
            const dy = motion.catchY.p + arm.y - px.position.y;
            const k = Math.min(1, THROW_MAX / (Math.hypot(dx, dy) || 1));
            M.Body.setVelocity(px, { x: dx * k, y: dy * k });
          }
          // ★★★**掴んでいる figure は回さない**（2026-09-16・第112巡にユーザー指摘
          //   「**戻す時、図形が何回転もする。暴れないように**」）。
          //   ★★★**`setVelocity` で引きずると、山や壁との接触が毎歩 回りを注ぎ込む**
          //     ―― 回りには誰も蓋をしていなかったので、そのまま加速して何回転もした。
          //     しかも絵は `gh.angle = b.angle` で体の角度をそのまま写すので、
          //     **帯へ向かっているあいだじゅう回り続けて見えた**。
          //   ★★**代理の体（引き下ろし）は最初から 0 にしてある**（上の `setAngularVelocity`）。
          //     **掴んで運ぶ側だけが抜けていた**ので、同じ扱いに揃える。
          //   ★★**毎歩 消す**（rAF ごとだと、1フレームに2歩進む実機で1歩ぶん残る）。
          // ★★★**角度も掴んだときのまま留める** ―― 角速度を毎歩 0 にしても、
          //   `Engine.update` が接触のたびに入れ直すので**残りが積もって漂う**
          //   （実測 0.0234 rad/歩 ＝ 約 80°/秒。3秒運べば 240° 回る）。
          //   **掴んでいるあいだは角度そのものを固定する**のがいちばん静か。
          //   ★帯へ吸い込まれるときは `stepGhost` の `g.angle *= g.waist` が
          //     **絵のほうを立て直す**ので、ここで回す必要はない。
          const dr = dragRef.current;
          if (dr) {
            M.Body.setAngularVelocity(dr.piece.body, 0);
            M.Body.setAngle(dr.piece.body, dr.angle);
          }
          M.Engine.update(engine, STEP_MS);
          // ★★★**絵は体そのもの**（`pin`）。渡さないと「壁で止まる」が絵に出ない。
          if (gh) {
            stepGhost(motion, gh, px && !gh.home
              ? { x: px.position.x, y: px.position.y, vx: px.velocity.x, vy: px.velocity.y }
              : null);
          }
          acc -= STEP_MS;
        }
        // ★★★**床が動いていないか、ときどき見に行く**（第103巡。上の `FLOOR_CHECK_MS`）。
        //   器の寸法が変わらなくても床は動くので、`ResizeObserver` だけでは足りない。
        if (now > floorAt) {
          floorAt = now + FLOOR_CHECK_MS;
          if (Math.abs(floorYOf(sizeRef.current.h) - floorY) > 0.5) {
            buildWalls(sizeRef.current.w, sizeRef.current.h);
          }
        }
        // ★★★**床の番人は2段**（2026-09-14・第104巡）。
        //   ★★**① 沈んだだけ → その場で床の上へ静かに戻す**（`sink`）。
        //     第103巡は 80px 沈んだら**上から落とし直して**いたので、沈む原因が
        //     残っているかぎり **沈む → 降る → また沈む**を繰り返し、ユーザーには
        //     「**何度も上から降ってくる**」と見えた。**見えない直し方が正しい。**
        //     ★こちらは**全部**に掛ける（1つずつだと、まとめて沈んだとき追いつかない）。
        //   ★★**② 本当に器の外 → 上から落とし直す**（`respawn`）。こちらは実際に
        //     もう戻れないので上から落とすのが正しい。★**1フレームに1つだけ**
        //     （まとめて戻すと山が一斉に跳ね上がって見える）。
        //   ★掴んでいるものは放っておく。
        const held = dragRef.current?.piece.body;
        for (const p of piecesRef.current) {
          if (p.body === held) continue;
          sink(M, p.body, floorY);
        }
        for (const p of piecesRef.current) {
          if (p.body === held) continue;
          if (!isLost(p.body, sizeRef.current.w, floorY)) continue;
          respawn(M, p.body, sizeRef.current.w, p.id);
          break;
        }
        // 掴んでいる図形は、指の方へバネで寄せる（`GravityTab` と同じ作法）。
        const d = dragRef.current;
        if (d) {
          const b = d.piece.body;
          const dx = d.x - b.position.x; const dy = d.y - b.position.y;
          const k = Math.min(1, GRAB_MAX / (Math.hypot(dx, dy) || 1));
          M.Body.setVelocity(b, { x: dx * GRAB_K * k, y: dy * GRAB_K * k });
        }
        if (!ctx) ctx = cv.getContext("2d");
        if (!ctx) { rafRef.current = requestAnimationFrame(loop); return; }
        // ★★★**絵が変わらないなら canvas に触らない**（2026-09-14・第105巡）。
        //
        // ★★★**ユーザー報告「図形が地面にぶつかった時フレームレートが急に低下する」の
        //   正体はこれ。** 山は**落ち着いたあとも毎フレーム全面を消して描き直して**
        //   いた ―― 器は 390×844、実機の倍率は 3 なので **1170×2532 ＝ 約300万画素**を
        //   毎フレーム塗り直して GPU へ送っていた。**落ち切って全部の図形が画面に
        //   載った時点でその負荷が最大になり、以後ずっと続く**（＝着地で落ちて戻らない）。
        // ★★★**実測（Chromium・CPU 6倍遅・dpr 3）** … 落下中 p50 113ms ／
        //   落ち着いたあと p50 120ms ―― **動いていないほうが重い**。
        //   CPU の profile でも **94.9% が `(program)`（＝ラスタライズと GPU 送り）**で、
        //   物理も描画の JS も合わせて 5% 未満。**軽くすべきは計算ではなく「塗る回数」。**
        // → **図形の位置・角度・幽霊の有無で署名を作り、変わったときだけ描く。**
        //   ★消さなければ canvas は**前の絵を保ったまま**なので、見た目は 1px も変わらない。
        //   ★★**器の作り直し・焼き直し・写真の到着では必ず描く**（`dirty`）。
        // ★★★**「前のフレーム」ではなく「最後に描いた絵」と比べる**（第105巡）。
        //   ★★matter の山は**落ち着いても永久に微振動する**（詰まった物体が押し合う）。
        //     前のフレームと比べると**毎フレーム違う**ので、いつまでも塗り直してしまう
        //     ―― 実測で 18秒後と 22秒後の絵は画素まで同一なのに、12秒で 145回 塗っていた。
        //   ★**最後に描いた絵と比べれば**、±0.2px の揺れは `REST_EPS` の中に収まって
        //     **一度も塗らない**。ゆっくり流れているものは差が積もるので**ちゃんと塗る**。
        const now2 = piecesRef.current;
        let drift = now2.length * 3 === drawn.length ? 0 : Infinity;
        for (let i = 0; i < now2.length && drift < Infinity; i++) {
          const b = now2[i].body;
          drift = Math.max(drift,
            Math.abs(b.position.x - drawn[i * 3]),
            Math.abs(b.position.y - drawn[i * 3 + 1]),
            Math.abs(b.angle - drawn[i * 3 + 2]) * REST_ANG);
        }
        const g = gh;
        // ★★★**幽霊が「動いたとき」だけ塗る**（2026-09-15・第106巡）。
        //   ★★第105巡までは「幽霊が居れば毎フレーム全面」だったので、引いている
        //     あいだじゅう 120Hz で約300万画素を塗っていた。**刻みが進まなかった
        //     フレームは絵も変わらない**ので、塗る必要が無い。
        // ★掴み直しは静止から始める（前の手つきのバネを持ち越さない）。
        if (!g && motion.caught) motion = ghostMotion();
        // ★★★**比べるのは `ghostKey` が返す「絵に効く値」全部**（第107巡）。
        //   ★★★第106巡はここに手で6つ並べていて、**`bend` を入れ忘れた** ――
        //     弾ける前は他の5つが全部動かないので、**ゴムが1フレーム目で固まった**。
        //     **並べるのをやめて、描く側と同じ1か所から取る。**
        //   ★角度と倍率は px に直して比べる（`REST_ANG` の腕の先の動き）。
        let gMoved = false;
        if (g) {
          const k = ghostKey(g);
          if (!gDrawn || gDrawn.length !== k.length) gMoved = true;
          else {
            for (let i = 0; i < k.length; i++) {
              // ★0〜1 の無次元の値（倍率・角度・進み）は腕の長さを掛けて px にする。
              const px = GHOST_UNITLESS.has(i) ? REST_ANG : 1;
              if (Math.abs(k[i] - gDrawn[i]) * px >= REST_EPS) { gMoved = true; break; }
            }
          }
        } else if (gDrawn) gMoved = true;
        // ★★★**「止まったか」は matter に任せる**（2026-09-16・第108巡）。
        //   第105〜107巡はここで**前のフレームとの差を自分で測って**眠りの門に
        //   使っていたが、門ごと削除したので**この走査も要らない**（毎フレームの
        //   O(n) がもう1本減る）。眠りは matter が体ごとに判定する。
        if (dirtyRef.current || gMoved || drift >= REST_EPS) {
          // ★★★**塗るのは「変わった矩形」だけ**（2026-09-15・第106巡）。
          //   ★★これまでは**1つでも動けば約300万画素を全部**消して描き直していた
          //     ―― 実測で、落下の3秒は**毎回きっかり画面の 100%**、3秒で 35M画素。
          //     落ち着いたあとに1つだけ転がっているときも全面だった。
          //   ★★**「いま居る所」と「最後に描いた所」の両方**を足す ―― 片方だけだと
          //     動いたあとに**前の絵が消え残る**。
          //   ★`dirtyRef`（器の作り直し・焼き直し・写真の到着）と**数が変わったとき**
          //     だけ全面。★幽霊が居るあいだも、幽霊の箱を足すだけで済む。
          const full = dirtyRef.current || now2.length * 4 !== drawnBox.length;
          let bx0 = Infinity; let by0 = Infinity; let bx1 = -Infinity; let by1 = -Infinity;
          // ★★★**箱は1つにまとめず、1つずつ持つ**（2026-09-15・第106巡）。
          //   落下中は**画面じゅうに散らばって全部が動く**ので、外接箱を1つに
          //   まとめると結局ほぼ全面になる。**散らばった小さい箱の合計**なら、
          //   同じ動きでも塗る画素はずっと少ない。★まとめた箱は「どの図形を
          //   描くか」の粗い判定にだけ使う。
          const boxes: number[] = [];
          const add = (x0: number, y0: number, x1: number, y1: number) => {
            if (x0 < bx0) bx0 = x0; if (y0 < by0) by0 = y0;
            if (x1 > bx1) bx1 = x1; if (y1 > by1) by1 = y1;
            boxes.push(x0, y0, x1, y1);
          };
          const nextBox: number[] = [];
          for (let i = 0; i < now2.length; i++) {
            const p = now2[i];
            const nb = drawBoxOf(p);
            nextBox.push(nb.x0, nb.y0, nb.x1, nb.y1);
            if (full) continue;
            const b = p.body;
            const moved = Math.abs(b.position.x - drawn[i * 3]) >= REST_EPS
              || Math.abs(b.position.y - drawn[i * 3 + 1]) >= REST_EPS
              || Math.abs(b.angle - drawn[i * 3 + 2]) * REST_ANG >= REST_EPS;
            if (!moved) continue;
            const ox0 = drawnBox[i * 4]; const oy0 = drawnBox[i * 4 + 1];
            const ox1 = drawnBox[i * 4 + 2]; const oy1 = drawnBox[i * 4 + 3];
            // ★★**前の箱と重なっていれば1つに畳む**（ゆっくり動くものは毎フレーム
            //   ほとんど重なるので、畳まないと同じ画素を2度消すことになる）。
            if (ox0 < nb.x1 && ox1 > nb.x0 && oy0 < nb.y1 && oy1 > nb.y0) {
              add(Math.min(nb.x0, ox0), Math.min(nb.y0, oy0),
                Math.max(nb.x1, ox1), Math.max(nb.y1, oy1));
            } else {
              add(nb.x0, nb.y0, nb.x1, nb.y1);
              add(ox0, oy0, ox1, oy1);
            }
          }
          // ★★幽霊は振れも伸びも弾みもするので、**中心から外接円で広めに**取る
          //   （数え落とすと軌跡が残る）。★前のフレームの箱も足す。
          if (g) {
            const gr = Math.hypot(Math.max(g.w, g.h), Math.max(g.w, g.h)) * 0.9 + GHOST_PAD;
            add(g.dx - gr, g.dy - gr, g.dx + gr, g.dy + gr);
            if (ghostBox) add(ghostBox[0], ghostBox[1], ghostBox[2], ghostBox[3]);
            ghostBox = [g.dx - gr, g.dy - gr, g.dx + gr, g.dy + gr];
            gDrawn = ghostKey(g);
          } else if (ghostBox) {
            add(ghostBox[0], ghostBox[1], ghostBox[2], ghostBox[3]);
            ghostBox = null;
            gDrawn = null;
          }
          drawn.length = now2.length * 3;
          for (let i = 0; i < now2.length; i++) {
            const b = now2[i].body;
            drawn[i * 3] = b.position.x; drawn[i * 3 + 1] = b.position.y; drawn[i * 3 + 2] = b.angle;
          }
          drawnBox = nextBox;
          dirtyRef.current = false;
          beginPileFrame();               // ★このフレームの「焼く予算」を戻す
          const { w, h, dpr } = sync();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          // ★★回した絵を貼るので、再標本化の質を上げる（`GravityTab` と同じ）。
          ctx.imageSmoothingQuality = "high";
          const hide = g?.home ? g.id : null;   // ★逆再生の間は本体を描かない
          // ★★★**散らばった箱の「数」には上限を置く**（2026-09-16・第115巡）。
          //   ★★★**多角形の切り抜きは、塗る画素より高くつく** ―― `ctx.clip()` に
          //     矩形を2つ以上入れると Skia は**矩形の切り抜きではなくマスクの層**を
          //     作る。落下中は12体が全部動くので**毎フレーム最大24個の矩形**で
          //     層を組み直していた。これが「最初に落ちてくる時だけ重い」の正体で、
          //     `GravityTab`（全面を1回消して描くだけ）との差でもあった。
          //   ★★**畳んだ箱が画面の半分を超えるときも全面**（どうせ大半を塗り直す）。
          //   ★実測（CPU×4・12体）… 4秒で 76 → 138 フレーム。
          const wide = (bx1 - bx0) * (by1 - by0) >= w * h * PAINT_FULL;
          if (full || bx1 <= bx0 || by1 <= by0 || wide || boxes.length > PAINT_BOXES * 4) {
            ctx.clearRect(0, 0, w, h);
            drawPile(ctx, now2, dpr, onPhoto, null, hide);
            if (g) drawGhost(ctx, g, dpr);
          } else {
            const box = {
              x0: Math.max(0, Math.floor(bx0)), y0: Math.max(0, Math.floor(by0)),
              x1: Math.min(w, Math.ceil(bx1)), y1: Math.min(h, Math.ceil(by1)),
            };
            ctx.save();
            ctx.beginPath();
            for (let i = 0; i < boxes.length; i += 4) {
              const x0 = Math.max(0, Math.floor(boxes[i]));
              const y0 = Math.max(0, Math.floor(boxes[i + 1]));
              const x1 = Math.min(w, Math.ceil(boxes[i + 2]));
              const y1 = Math.min(h, Math.ceil(boxes[i + 3]));
              if (x1 <= x0 || y1 <= y0) continue;
              ctx.rect(x0, y0, x1 - x0, y1 - y0);
            }
            ctx.clip();
            for (let i = 0; i < boxes.length; i += 4) {
              const x0 = Math.max(0, Math.floor(boxes[i]));
              const y0 = Math.max(0, Math.floor(boxes[i + 1]));
              const x1 = Math.min(w, Math.ceil(boxes[i + 2]));
              const y1 = Math.min(h, Math.ceil(boxes[i + 3]));
              if (x1 <= x0 || y1 <= y0) continue;
              ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
            }
            drawPile(ctx, now2, dpr, onPhoto, box, hide);
            // ★★引き下ろしの幽霊は**山の上**に描く（掴んでいる間だけ在る）。
            if (g) drawGhost(ctx, g, dpr);
            ctx.restore();
          }
          // ★★焼き切れなかったぶんは次のフレームで焼く（代役のまま残さない）。
          if (bakeDeferred()) { dirtyRef.current = true; wake(); }
        } else {
          // ★絵は描かないが、器が伸び縮みしていたら実解像度だけは合わせておく
          //   （`sync` は寸法が変わると canvas を作り直す＝中身が消えるので `dirty`）。
          const before = cv.width;
          sync();
          if (cv.width !== before) dirtyRef.current = true;
        }
        // ★★★**動きが無ければループを止める**（2026-09-16・第107巡。`GravityTab` と
        //   同じ作り）。★★第106巡までは**無条件で次のフレームを頼んでいた**ので、
        //   ホームに居るあいだ**ずっと毎秒120回**メインスレッドが起き、落ち着いた
        //   山の上で 4本の O(n) の走査・`devicePixelRatio` の読み出し・
        //   `Engine.update` を回し続けていた。**落ち着いていてもタダではない。**
        //   ★起こすのは `wake()`（山の組み直し・器の変化・焼き直し・写真の到着・
        //     指が触れた・幽霊が出た）。**1つでも取りこぼすと絵が止まる**ので、
        //     **`dirtyRef` を立てる所は必ず `wake()` も呼ぶ**。
        // ★★★**代理の体が居るあいだは止めない**（2026-09-15・第110巡）。
        //   受け渡しの窓では幽霊も `dragRef` も無く、山は眠っている ―― ここで
        //   止めると**代理を消せる唯一のコードも止まる**＝山の中に**見えない体が
        //   永久に刺さる**。
        if (!g && !dragRef.current && !dirtyRef.current && !proxyRef.current
          && now2.length > 0 && now2.every((p) => p.body.isSleeping)) {
          runningRef.current = false;
          return;
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      loopRef.current = loop;
      runningRef.current = true;
      rafRef.current = requestAnimationFrame(loop);
      if (!stop) setWorldGen((n) => n + 1);
    })();

    return () => {
      stop = true;
      cancelAnimationFrame(rafRef.current);
      onResizeRef.current = null;
      piecesRef.current = [];
      // ★★代理の体も手放す（世界ごと捨てるので除くまでもないが、**残っていると
      //   次の世界が「もう持っている」と思い込む**）。
      proxyRef.current = null;
      landedRef.current = null;
      engineRef.current = null;
      matterRef.current = null;
    };
  }, [measured, wake, syncProxy, dropProxy]);   // ★後ろ2つは `useCallback([])` で不変

  // ── 中身（図形）。★世界はそのまま、図形だけ差し替える ─────────────
  // ★★★**組み直す合図は「中身」だけ**（2026-09-10）。配列の同一性で見ていた
  //   ので、保存や同期のたびに `appState` が作り直されると**山ごと落ち直して
  //   いた**。中身が同じなら文字列も同じになるので、組み直しは起こらない。
  const sig = [
    tasks.map((t) => `${t.id}:${t.weight ?? 2}:${t.dueDate ?? ""}:${t.title}`).join("|"),
    offers.map((o) => `${o.id}:${o.kind}`).join("|"),
    unread, journal ? "rec" : "", today.toDateString(),
  ].join("#");

  useEffect(() => {
    const M = matterRef.current;
    const engine = engineRef.current;
    const { w, h } = sizeRef.current;
    if (!M || !engine || w <= 0 || h <= 0) return;
    // ★★★**前の山の居場所を控えてから捨てる**（2026-09-14・第103巡にユーザー確定
    //   「いつでも落ち直さない」）。**同じ id は落とし直さず、位置・角度・速度を
    //   引き継ぐ** ―― 日付を1つ付けただけで山が丸ごと落ち直していた（第102巡の
    //   未解決）。★体そのものは作り直すしかない（一括の倍率 `unit` は**全体の
    //   面積の予算**から出るので、1つ増えれば全部の大きさが変わる）。
    const prev = new Map(piecesRef.current.map((p) => [p.id, p]));
    // ★★板を組む前に「板の書体が届いていたか」を控える（届いていなければ
    //   `onFontsReady` が測り直しを撃つ）。
    plateFontRef.current = wordFontReady(DISPLAY);
    // ★★**引き下ろして指を離した所は1度だけ使って捨てる**（`lib/pullDrag.ts`）。
    const landing = pullBus.landing;
    pullBus.landing = null;
    // ★★**着地する相手の id を控える**（代理の体を消すのはこの1枚が入る直前）。
    //   ★★★**幽霊の id とは違う** ―― `HomeTab.put` は候補やフォローアップから
    //     **新しい `task-${Date.now()}` を発行する**ので、`g.id` では当たらない。
    if (landing) landedRef.current = landing.id;
    // ★★★**中身が変わっただけなら倍率は据え置く**（2026-09-15・第110巡）。
    //   理由は `pileWorld.ts` の `buildPieces` の `hold` に書いた（1枚増えると
    //   全員が別の大きさで作り直され、山が丸ごと浮く＝「画面が一気に変わる」）。
    //   ★決め直すのは**世界を作り直したとき**（`worldGen`）と**器が 15% 以上
    //   変わったとき**（`seedGen`）だけ ―― どちらもこの鍵が変わる。
    const gen = `${worldGen}:${seedGen}`;
    const hold = holdGenRef.current === gen ? unitRef.current : 0;
    holdGenRef.current = gen;
    // ★★★**書体は「落ちる前」に頼む**（2026-09-16・第115巡）。
    //   ★★★**第114巡までは `taskBitmap` の中（＝塗っている最中）で頼んでいた** ――
    //     和文は**文字ごとに別の unicode-range の断片**なので、`document.fonts.load`
    //     は題に出てくる文字の数だけ断片を取りに行き、**届くたびに全文書の
    //     レイアウトと山の焼き直し**が走る。それが**図形が落ちている最中**に
    //     重なっていた（実測 … 塗りの1回が 290ms、その 577ms が焼き）。
    //   ★ここで先に頼んでおけば、**落ちているあいだには届き終わっている**か、
    //     少なくとも**代役で描いて1度だけ焼き直す**で済む。
    ensureGlyphs(SHAPE_FACE, tasks.map((t) => t.title ?? "").join(""));
    // ★★★**帯が覆っている高さを渡す**（2026-09-17・第118巡）。帯は山の器へ
    //   重ねてあるので、そのぶんを「図形が居られる高さ」から引かないと、
    //   **山が帯の裏へ伸びて指で触れなくなる**（`pileWorld` の `usableH` の注釈）。
    //   ★ここは中身の effect（1度きり）なので、DOM を測ってよい ―― ループの
    //     中から `bandBottom()` を呼ばないこと（レイアウトを強制する）。
    const { pieces, unit } = buildPieces(
      M, { tasks, offers, picks, unread, today, journal }, w, h, prev, landing, hold,
      bandBottom?.() ?? 0);
    // ★★★**使い回した体は world から出さない**（2026-09-15・第111巡）。
    //   ★★★**出して入れ直すと、接触も眠りも切れて山が落ち直す** ―― しかも
    //     入れ直しの `clearOverlap` が**落ち着いた山を縦の塔へ積み直す**
    //     （`pileWorld.ts` の `Piece.fresh` の注釈）。ユーザー報告
    //     「**離すとリセットが入って落とし直しが発生する**」の正体。
    //   ★**外すのは「もう居ない体」だけ**（体の同一性で見る ―― `unit` が
    //     決め直されたときは同じ id でも別の体になっているので、正しく外れる）。
    const stay = new Set(pieces.map((p) => p.body));
    for (const p of piecesRef.current) {
      if (!stay.has(p.body)) M.Composite.remove(engine.world, p.body);
    }
    // ★★**すでに world に居る体は、投入の列に並ばせない**（二重に入れない）。
    const held = new Set<string>();
    for (const p of pieces) if (prev.get(p.id)?.body === p.body) held.add(p.id);
    piecesRef.current = pieces;
    // ★大きさを決めた高さを控える（器が大きく変わったら決め直すため）。
    builtFloorRef.current = floorYOf(h);
    // ★★引き下ろしの行き先の大きさに要る（`lib/pullDrag.ts`）。
    unitRef.current = unit;
    pullBus.unit = unit;
    dragRef.current = null;
    dirtyRef.current = true;
    wake();                              // ★中身が入れ替わったので必ず回す
    // ★★★**眠りは切らない**（2026-09-16・第108巡）。落ちてくるものは
    //   `respawn` が `Sleeping.set(false)` で起こし、世界へ入るフレームで
    //   **山の全員も起きる**（上の `Composite.add` の所）。**猶予は要らない。**
    // ★据え置きは `releaseAt: 0` なので、次のフレームで全部が世界へ入る。
    // ★★`done` は作り直す（体そのものは別のものになっている）。
    releaseRef.current = { at: performance.now(), done: held };
    // ★deps は**署名と世界の世代と入れ直しの合図**だけ。配列の同一性では見ない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, worldGen, seedGen]);

  // ★★★**帯からピルを引き始めたら回し始める**（2026-09-16・第107巡）。
  //   ★★山が眠って**ループが止まっている**あいだに帯を触られると、`pullBus.ghost`
  //     が出ても**誰も塗らない**。`above`（＝`HomeTab` の `lift`）は
  //     **1ジェスチャに1回だけ**変わるので、これを合図にする。
  useEffect(() => { if (above) wake(); }, [above, wake]);

  // ★★書体が遅れて届いたら焼き直す（購読していなかったので、和文が代替書体の
  //   まま固まり得た）。★板は `lib/solidPaint.ts` の側のキャッシュに居る。
  useEffect(() => onFontsReady(() => {
    clearPileBitmaps(); clearSolidBitmaps();
    dirtyRef.current = true; wake();   // ★焼き直したので、絵が同じでも描き直す
    // ★★★**板の書体だけは「焼き直し」では足りない。測り直す**（第101巡）。
    //   板の大きさは**実際に組んだ字を測って**決まるので、代替の書体で測った
    //   板に本物を焼くと**箱から溢れる**（Anton は em に対して背が高い）。
    //   ★**間に合わなかったときに1度だけ**撃つ（毎回だと山が落ち直して目に付く）。
    if (!plateFontRef.current && wordFontReady(DISPLAY)) setSeedGen((n) => n + 1);
  }), [wake]);

  // ── 掴む ──────────────────────────────────────────────────
  /**
   * ★★★**その1点に、その図形が描かれているか**（回りを戻して、絵と同じ式で見る）。
   * @param slop 指の太さぶんの遊び（px）。0 なら**描かれているところだけ**。
   */
  const hitPiece = (p: Piece, px: number, py: number, slop: number): boolean => {
    const b = p.body;
    const dx = px - b.position.x; const dy = py - b.position.y;
    // ★回っている図形は、**体の向きへ座標を戻してから**見る。
    const ca = Math.cos(-b.angle); const sa = Math.sin(-b.angle);
    const lx = dx * ca - dy * sa; const ly = dx * sa + dy * ca;
    // ★★★**円で描くものは半径で見る**（忘れると押しても飛ばない）。
    //   ★★カセット（`cassette`）は**四角**なので下の枝（箱で見る）へ入る。
    if (p.kind === "offer" && p.r && p.shape) {
      // ★★★**提案は「絵と同じ形」で見る**（2026-09-18・第121巡）。絵は
      //   `traceCardShape(…, p.r * 2)` ＝ **2r 四方いっぱい**なので、`p.r` の円で
      //   見ると**出っ張りを押しても掴めず、へこみの何も無い所で掴めた**。
      // ★★**遊びは「形を太らせる」ことで入れる** ―― 器を `2r + 2·slop` と
      //   見なして正規化すれば、どの向きにもおよそ `slop` ぶん広がる。
      const k = p.r * 2 + slop * 2;
      return inCardShape(p.shape, lx / k, ly / k);
    }
    if ((p.kind === "offer" || p.kind === "badge") && p.r) {
      return Math.hypot(dx, dy) <= p.r + slop;
    }
    const pw = p.w ?? 0; const ph = p.h ?? 0;
    if (Math.abs(ly) > ph / 2 + slop) return false;
    // ★★★**タスクは「絵と同じ輪郭」で見る**（2026-09-14・第104巡）。
    //   ★★**式は `halfWidthAtStack`**（絵と物理と同じ1か所。`lib/solid.ts`）。
    if (p.kind === "task" && pw > 0 && ph > 0) {
      const hw = halfWidthAtStack(clampRows(rowsOf(p.title ?? "")), pw / ph, ly / ph);
      return Math.abs(lx) <= hw * pw + slop;
    }
    // ★★★**板も「絵と同じ形」で見る**（2026-09-18・第122巡）。板は**角丸が
    //   高さの半分のピル**（`lib/wordPlate.ts` の `roundRect`）なので、外接箱で
    //   当てると**四隅の外の何も描かれていない所が触れる**（箱の 4.9%）。
    if (p.kind === "word" && p.plate?.pill && pw > 0 && ph > 0) {
      const rad = ph / 2;
      const qx = Math.max(0, Math.abs(lx) - (pw / 2 - rad));
      const qy = Math.max(0, Math.abs(ly) - (ph / 2 - rad));
      return Math.abs(lx) <= pw / 2 + slop && Math.hypot(qx, qy) <= rad + slop;
    }
    return Math.abs(lx) <= pw / 2 + slop;
  };

  /**
   * ★★★**当たり判定 ―― 「画面でいちばん上に描かれているもの」を掴む**
   * （2026-09-19・第123巡にユーザー指摘「**やはりまだ当たり判定がおかしいようです**」）。
   *
   * ★★★**真因は「いちばん近い中心」を採っていたこと** ―― 重なった2つのどちらを
   *   掴むかは、**画面でどちらが上に見えているか**でしか説明できない。中心の
   *   近さで選ぶと、**大きな図形の上に小さな図形が乗っているとき、下の大きい
   *   ほうが掴めてしまう**（中心が近いのは大きいほうだから）。
   * ★★★**そのうえ第120〜122巡は「板が必ず勝つ」という規則を足していた** ――
   *   根拠は「**板はいちばん最後に塗られる**」だったが、**事実は逆**で、
   *   `buildPieces` は **板 → タスク → カセット → 提案 → 未読の数**の順に積む＝
   *   **板はいちばん下**。つまり**画面でいちばん下のものが必ず勝っていた**。
   *   ★★**`plate ?? best` の枝は削除した。復活させない。**
   * ★★★**塗る順と拾う順は同じ配列（`piecesRef`）から引く** ―― 2つの順番を
   *   別々に持つと、また食い違う。**後ろにあるものほど上**なので、**末尾から探す**。
   *
   * ★★★**遊び（`TOUCH_SLOP`）は2周目でだけ効かせる**（第123巡）。
   *   1周目は**遊びなし＝描かれているところだけ**で上から探し、**何にも当たら
   *   なかったときだけ**遊びを付けてもう一度。★こうすると
   *   **「何かの上を押したら、必ずその見えているもの」**が保証され、遊びは
   *   「隙間を押したときの助け」だけに縮む（＝上の図形が隣の絵を盗まない）。
   */
  const pickAt = (cx: number, cy: number): Piece | null => {
    const box = boxRef.current;
    if (!box) return null;
    const r = box.getBoundingClientRect();
    const px = cx - r.left; const py = cy - r.top;
    const list = piecesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      if (hitPiece(list[i], px, py, 0)) return list[i];
    }
    for (let i = list.length - 1; i >= 0; i--) {
      if (hitPiece(list[i], px, py, TOUCH_SLOP)) return list[i];
    }
    return null;
  };

  const press = useRef<{ id: number; x: number; y: number; timer: number } | null>(null);
  // ★長押しの途中で外れたら、タイマーを必ず落とす（消えた画面へ触りに行かない）。
  useEffect(() => () => { if (press.current) window.clearTimeout(press.current.timer); }, []);

  const onDown = (e: React.PointerEvent) => {
    if (press.current) return;
    const timer = window.setTimeout(() => {
      const p = pickAt(e.clientX, e.clientY);
      if (!p) return;
      const box = boxRef.current;
      if (!box) return;
      const r = box.getBoundingClientRect();
      // ★掴む位置は `press.current` から取る（`e` は 150ms 前の合成イベント）。
      //   ★掴む前に `TAP_MOVE`(8px) を超えたら press は消えるので、ずれは高々 8px。
      const pr = press.current;
      const cx = pr?.x ?? e.clientX; const cy = pr?.y ?? e.clientY;
      // ★★★**行き先が在るかは `pillOf` に聞く**（版面を作れる ＝ 帯へ戻せる）。
      //   **掴んだ1回だけ**決める ―― 毎フレーム聞くと規則が2か所に分かれる。
      dragRef.current = {
        piece: p, x: cx - r.left, y: cy - r.top, angle: p.body.angle,
        place: !!pillOf?.(p),
      };
      // ★★★**眠っている体を起こす**（2026-09-14・第102巡。ユーザー指摘
      //   「**ホームの図形も触れれるように**」の正体）。山は落ち着くと
      //   `engine.enableSleeping = true` になるが（下の落ち着きの判定）、
      //   **`Body.setVelocity` は眠った体を起こさない** ―― だから
      //   **落ち着いた山の図形は長押ししても1px も動かなかった**。
      //   ★GRAVITY は掴んだときに起こしている（`GravityTab` の move）。
      const M = matterRef.current;
      if (M) M.Sleeping.set(p.body, false);
      // ★★★**掴んだら必ず起こす**（2026-09-16・第108巡）。
      //   ★★★**`onDown` の `wake()` では足りない** ―― 長押しは `HOLD_MS`(150ms)
      //     後に**タイマーの中で**掴むので、そのあいだに山が全部眠ると
      //     **ループは自分で止まる**（第107巡に入れた停止条件）。止まったあとに
      //     `dragRef` を立てても**誰も見に来ない＝図形が1px も動かない**。
      //   ★★第108巡に眠りが速くなった（門を消した）ので、**ここを忘れると
      //     「落ち着いた山は掴めない」**になる。実測でそうなった。
      wake();
      setHolding(true);
    }, HOLD_MS);
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, timer };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    wake();                              // ★掴むかもしれないので回し始める
  };

  const onMove = (e: React.PointerEvent) => {
    const pr = press.current;
    if (!pr) return;
    if (!dragRef.current) {
      // ★掴む前に動いたら、それはスワイプ（ホームは横スワイプで隣のアプリへ）。
      if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > TAP_MOVE) {
        window.clearTimeout(pr.timer);
        press.current = null;
      }
      return;
    }
    // ★★掴んでいる間も**眠らせない**（支えが転がって消えても止まらないように）。
    const M = matterRef.current;
    if (M) M.Sleeping.set(dragRef.current.piece.body, false);
    // ★★★**右の縁に近づいたら ASSIGN の帯**（帯のピルとまったく同じ手つき）。
    //   ★当たり判定は**指の x だけ**で取る（面は `transform` の途中で嘘をつく）。
    // ★★★**境目には遊びを持たせる**（2026-09-16・第108巡。`RAIL_HYST`）
    //   ―― 1本の線だと、指がその上に居るあいだ毎フレーム反転する。
    // ★★★**行き先の無いもの（日付・曜日の板）では出さない**（第120巡）。
    const near = dragRef.current.place && e.clientX > window.innerWidth - RAIL_NEAR
      - (railRef.current ? RAIL_HYST : 0);
    if (near !== railRef.current) { railRef.current = near; onRail?.(near); }
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    dragRef.current.x = e.clientX - r.left;
    dragRef.current.y = e.clientY - r.top;
    // ★★★**帯まで運んだら、引き出しの逆再生が始まる**（2026-09-15・第106巡に
    //   ユーザー指定「**間違えて落としたピルをもう一度掴んで上の段に入れると戻る**」）。
    //   ★★**`tTo` を 0 にするだけ** ―― 段が 3→2→1 と畳まれ、寸法がピルへ縮む。
    //     帯から出せば `tTo` が 1 へ戻り、また膨らむ（**往復できる**）。
    //   ★1ジェスチャの中で何度でも出入りするので、**幽霊は作り直さず行き先だけ**変える。
    //   ★★★**届く範囲は `BAND_NEAR`**（2026-09-18・第120巡に `RAIL_NEAR` から
    //     独立させた。理由は `lib/pullDrag.ts` ―― 右端は寄せにいく／帯は通り道）。
    //   ★★★**ここも境目に遊びを持たせる**（2026-09-16・第108巡。`RAIL_HYST`）
    //     ―― 入るのは `BAND_NEAR`、出るのは `BAND_NEAR + RAIL_HYST`。1本の線だと
    //     指がその上に居るあいだ `tTo` が 1 と 0 を往復し、**形がぶるぶる震える**
    //     （ユーザー報告「動作がやっぱり不安定」）。
    //   ★★★**行き先の無いもの（日付・曜日の板）では入らない**（第120巡）。
    const bandY = bandBottom?.() ?? 0;
    const inBand = dragRef.current.place && bandY > 0 && dragRef.current.y
      < bandY + BAND_NEAR + (homeRef.current ? RAIL_HYST : 0);
    if (inBand !== homeRef.current) {
      homeRef.current = inBand;
      if (inBand) {
        const look = pillOf?.(dragRef.current.piece);
        if (look) pullBus.ghost = homeGhost(dragRef.current.piece, look, e.pointerId);
      }
    }
    // ★★★**位置は最後まで指**（2026-09-17・第118巡にユーザー撤回）。
    //   ここで決めるのは**「帯を狙っているか」だけ** ―― 絵の座標は一切動かさない。
    //   ★★第109〜117巡は `PULL_ARM`(44px) 内で帯の段の中心へ吸い付けていたが、
    //     ユーザー「**指を離していないのに横にしか動かなくなる**」で撤回した。
    //   ★境目の遊びは `RAIL_HYST`（第108巡。1本の線だと毎フレーム反転する）。
    const gh0 = pullBus.ghost;
    if (gh0 && gh0.home) {
      const caught = bandY > 0 && dragRef.current.y
        < bandY + BAND_CATCH + (gh0.aim ? RAIL_HYST : 0);
      // ★★★**着地点はその図形が入る段の中心・指の x**（2026-09-15・第110巡）。
      //   ★★**「下の段」と決め打ちしない** ―― 空の段は描かれないので、
      //     提案しか無い日は下の段そのものが存在しない（`bandRowAt` が実測して返す）。
      const row: 0 | 1 = dragRef.current.piece.kind === "offer" ? 0 : 1;
      const cy = rowCenter?.(row) ?? null;
      // ★★★**`aim` は合図だけ。座標は渡さない**（2026-09-17・第118巡）。
      //   位置は最後まで指 ―― 理由は `lib/pullDrag.ts` の `Ghost.aim` の注釈。
      gh0.aim = caught;
      // ★★**狙っているあいだは「少しだけピルへ寄る」**（`PILL_HINT`）。
      //   0 まで畳むのは**離したとき**（`HomeTab.unassign` の先）。
      gh0.tTo = caught ? PILL_HINT : 1;
      // ★★★**挿し口は「指が指している所」**（2026-09-16・第112巡にユーザー確定
      //   「**どんな時でも、任意のピルとピルの間に戻せるように**」）。
      //   ★★★**第111巡は入る場所を1つに決めて渡していた**ので、**そこ以外へ
      //     近づけても何も起きなかった**。**指を正にして、並びをあとから合わせる。**
      //   ★★**渡すのは画面の x だけ** ―― index へ直せるのは段だけ（ピルの居場所は
      //     流れの `transform` が決めていて React 側は知らない）。答えは `bandBus.slot`。
      //   ★`w` は**戻ったときのピルの幅そのもの**（`pillOf` が `pillWidth()` で出す）。
      bandAim(caught && cy !== null
        ? { row, x: e.clientX, w: (gh0.look?.w ?? gh0.w1) + BAND_GAP } : null);
    }
  };

  // ★★★**口とブラックホールは置かない**（2026-09-09 ユーザー指定で削除）。
  //   山で掴めるのは**運ぶこと**だけで、完了も削除もここでは起こらない
  //   ―― `components/tasks/DropTargets.tsx` は TASK 側がそのまま使っている。
  // ★★**軽く押したら開く**（2026-09-09）。長押し（`HOLD_MS`）を過ぎる前に、
  //   `TAP_MOVE` より動かさずに離したときだけ。**掴んだあとは走らない**
  //   ―― 運んで戻しただけで画面が飛ぶのは事故になる。
  const onUp = (e: React.PointerEvent) => {
    // ★★★**指が指していた挿し口は、消す前に控える**（2026-09-16・第112巡）。
    //   `bandAim(null)` は `bandBus.slot` も一緒に落とすので、**先に読む**。
    //   ★★**このジェスチャで実際に挿し口が出ていたときだけ**（前の巡の残りを拾わない）。
    //   ★★★**index ではなく「左どなりのピルの id」**（第114巡）―― 離した瞬間に
    //     `items` は組み替わるので、index は指した場所を指し続けない。
    const slotAt = bandBus.aim ? bandBus.slot?.after ?? "" : null;
    // ★★★**挿し口は指が離れたら必ず消す**（第110巡）。消し忘れると帯が
    //   **隙間を開けたまま毎フレーム回り続ける**（幽霊の寿命と同じ轍）。
    bandAim(null);
    const pr = press.current;
    if (pr) window.clearTimeout(pr.timer);
    press.current = null;
    const dragged = dragRef.current;
    dragRef.current = null;
    setHolding(false);
    wake();                              // ★離したあとの落ち着きも見せる
    // ★★**帯へ戻す幽霊は、指を離したら必ず消える**（`Band` と同じ約束）。
    if (pullBus.ghost?.home) pullBus.ghost = null;
    // ★★★**帯の上で離した＝日付を消して帯へ戻す**（2026-09-15・第106巡）。
    //   ★幽霊はここで消す ―― 次のフレームには帯に本物のピルが並ぶ。
    const wasHome = homeRef.current;
    homeRef.current = false;
    if (wasHome) {
      pullBus.ghost = null;
      if (dragged) {
        haptic(10);
        // ★★★**弾きは「隙間を閉じる」に畳んだ**（2026-09-15・第110巡）。
        //   第109巡の `bandKnockAt` は**塗ったあとに跳ねるだけ**で、
        //   ユーザー報告「**ホバリングしている状態では何も起きない**」の原因だった。
        //   いまは近づけている最中に左右が `±w/2` 開いて待っているので、
        //   **挿し口を外せば行き先 0 へ向かって行き過ぎつつ閉じる**＝バウンド。
        //   ★★閉じるのは段の rAF（`bandBus.aim` が消えたフレーム）。
        // ★★★**離した所の index を渡す**（第112巡。並びのほうが指に合わせる）。
        onUnassign?.(dragged.piece, slotAt);
        return;
      }
    }
    if (railRef.current) {
      railRef.current = false;
      onRail?.(false);
      // ★★掴んだものを右端で離した＝**日付を付け直す**（ユーザー確定）。
      if (dragged) { haptic(10); onAssign?.(dragged.piece); return; }
    }
    if (dragged || !pr) return;
    if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > TAP_MOVE) return;
    const p = pickAt(e.clientX, e.clientY);
    if (p?.nav) { haptic(6); onOpen(p.nav, p.card); }
  };

  return (
    <div
      ref={boxRef}
      data-pile
      style={{
        position: "absolute", inset: 0, touchAction: holding ? "none" : "pan-x",
        // ★★★**引いているあいだだけ帯の上へ**（2026-09-14・第105巡）。写し取った
        //   ピルはこの canvas に描かれるので、上げないと**下の段のピルの後ろへ潜る**。
        // ★★★**山の図形を掴んでいる間も上げる**（2026-09-16・第114巡）――
        //   帯へ戻そうと近づけると、幽霊は**帯の裏へ回って消えて見えた**
        //   （実測 … canvas には描かれているのに、画面には出ていない）。
        //   ユーザー報告「**どこかに消えてしまう**」の、目に見える半分がこれ。
        zIndex: above || holding ? 1 : undefined,
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {/* ★★**CSS の大きさは器そのもの**（`width/height: 100%`）。canvas は
          置換要素なので、`inset: 0` だけだと**内在の 300×150 のまま**になり得る
          ―― 実解像度（`width`/`height` 属性）と食い違うと絵が伸びる。 */}
      <canvas ref={cvRef} style={{
        position: "absolute", inset: 0, width: "100%", height: "100%", display: "block",
      }} />
    </div>
  );
}
