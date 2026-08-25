"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Body, Engine, World } from "matter-js";
import { LayerName } from "@/components/tasks/LayerName";
import { DemoSeedButton } from "@/components/tasks/TaskAddButton";
import { aimTargets, DropTargets, fireTarget, targetAt, type DropTarget } from "@/components/tasks/DropTargets";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { ymd } from "@/components/tasks/WhenSheet";
import { haptic } from "@/lib/helpers";
import { rectOf, sectionOutline, type SolidSpec } from "@/lib/solid";
import { clearSolidBitmaps, peekSolidBitmap, shapeBounds, shapeGlyphsReady, solidBitmap, warmShapeGlyphs, type SolidPaint, type SolidView } from "@/lib/solidPaint";
import { canvasFont, onFontsReady, primeAdvances } from "@/lib/textFit";
import { allTagFaces, allTagLabels, resolveTag, tagColor } from "@/lib/taskTags";
import { demoTasks } from "@/lib/taskDemo";
import { areaOf, daysUntil, dropOrder, massOf, specOf } from "@/lib/taskSize";
import { INK, LATIN, MUTED, NAV_H, navHeightPx, RUST, SANS, SWISS_MD, SWISS_XL } from "@/lib/constants";
import { ms, T_IN, T_ITEM, T_OUT } from "@/lib/motion";
import { flick, flickBy, flickStep, flickThrow, type Flick } from "@/lib/scroll";
import { D_SETTLE, D_TRAVEL, K_SETTLE, K_TRAVEL, settled, spring, springTo, type Spring } from "@/lib/spring";
import { SPACE, TYPE } from "@/lib/tokens";
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
const FILL = 0.58;
const SCALE_MIN = 0.70;
const MASTHEAD_H = 124;
const FIT_W = 0.86;
const FIT_H = 0.62;
const SCALE_MAX = 1.6;
const SCALE_EPS = 0.02;
const PHYS_VERTS = 12;
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
type Phase = "align-in" | "align-out" | "tl-out" | "warp" | null;

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
/** ★第56巡に**ほぼ縦の列**へ(290→1400)。可視域 ±280px で x の振れは約 28px …
 *  「縦列だけどちょっとカーブしている」。輪に見えていたのを列に戻す。 */
const ARC_R = 700;
const ARC_APEX_X = 96;
/** DOM の行の**箱の高さ**(中身を上下中央に置くための器)。
 *  ★間隔の役目は持たない(下の PITCH_* が持つ)。 */
const ROW_H = 128;
/** ★焦点の図形の最大寸法(焦点以外はここから縮む)。 */
const ALIGN_MAX_H = 132;
const ALIGN_MAX_W = 176;
const FOCUS_BOOST = 1.25;
const TEXT_GAP = 100;
/** ★★行の間隔。**詰めたうえで、中央の上下だけ空ける**(第56巡にユーザー指定)。
 *  円弧に沿った長さを `L(d) = TIGHT·d + SPREAD·d/√(1+d²)` で置く。
 *  `d/√(1+d²)` は原点で傾きが最大なので、隣り合う間隔が**中央でだけ広くなる**:
 *    中央↔隣 142 / 隣↔2つ隣 77 / 2↔3 61 / それ以遠 54。
 *  `d` は連続値なので、指で回している間もこの式のまま滑らかに動く。 */
const PITCH_TIGHT = 54;
const PITCH_SPREAD = 124;
const arcLen = (d: number) => PITCH_TIGHT * d + PITCH_SPREAD * (d / Math.sqrt(1 + d * d));
/** ★★連鎖の減衰。焦点からの距離ぶんだけ**やわらかく**なるので、中央の間隔がまず
 *  縮み、それに次が追い、さらに次が追う ― という伝わり方になる(第58巡にユーザー指定)。 */
const CHAIN = 0.72;
const CHAIN_MAX = 6;
/** ★★連なりの間隔。**減衰する**ので「最初の1つがぽつんと動き、そのあと次々と
 *  流れ出す」。一定間隔だと行進になってしまう。 */
const LEAD_GAP = 210;
const GAP_DECAY = 0.72;
/** ★★出ていく**1本の道**(第57巡)。第55巡は図形ごとに別々のベジエを引いて蛇行させて
 *  いたので、**一筋にまとまる瞬間が構造的に無かった**(ユーザー指摘「結局バラバラに
 *  画面外にいってしまう」)。全部が同じ道を通り、道の上の間隔が揃っていく。 */
const STREAM_MS = ms(T_IN) + ms(T_ITEM);
/** 揃ったときの1つぶんの間隔(道の長さに対する比)。 */
const STREAM_GAP = 0.115;
/** ★★間隔を数える番号の**上限**(第60巡)。道の長さは `1 + STREAM_GAP·i` で伸びるので、
 *  番号をそのまま使うと**タスクが増えるほど出入りが長くなる**(16個で約4秒、30個なら
 *  8秒)。その間ジェスチャーが効かないので、実質フリーズに見える。先頭のいくつかが
 *  一筋に揃えば「一列になった」は読み取れるので、そこで頭打ちにする
 *  (連なりの遅れ `startAt` が `CHAIN_MAX` あたりで収束するのと同じ考え方)。 */
const STREAM_Q_MAX = 6;
const streamQ = (i: number) => Math.min(i, STREAM_Q_MAX);
/** ★スクアッシュ＆ストレッチ。この速さ(px/フレーム)で伸びが最大 `SQUASH_MAX` になる。
 *  ★★第59巡に**0.2 倍**へ(「強調しすぎ」)、第60巡に**もう一段弱く**
 *  (「入る時もスクロールの時ももう少し弱めて」)。**速いときにだけ、ほのかに** —
 *  止まっている図形に何も起きないことが上品さの条件。 */
const SQUASH_REF = 48;
const SQUASH_MAX = 0.07;
/** スミアー(残像)。この速さを超えたら後ろへ `SMEAR_N` 枚、`SMEAR_LEN` の間隔で薄く。 */
const SMEAR_MIN = 22;
const SMEAR_N = 2;
const SMEAR_LEN = 0.40;
const SMEAR_A = 0.065;
/** 入りのバネの減衰。★`D_TRAVEL` より弱いので**一度行き過ぎてから**戻る。 */
const D_IN = 0.12;
/** 入りの待ち行列。円弧の**下に並んで**から順に上がる(px。同じ点から一斉に
 *  上がると入口で団子になる)。 */
const ENTRY_QUEUE = 74;
/** ★2段目(円弧へ上がる)を始める所。ここまでに図形は**完全に画面の外**に居る
 *  (`cine(0.72)` ≒ 0.94)。早すぎると出が途中で消える。 */
const A_HANDOFF = 0.72;

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
const PAD_L = 20;

/** ★★上へのスワイプの**出どころで行き先が変わる**(第60巡)。
 *  ・地面際(下から `TL_GRAB_H` px)から上へ … TIMELINE(**地面を掴んで引き上げる**。
 *    曜日が指に連れて地面から伸びてくるので、掴む所は地面でなければ嘘になる)。
 *  ・それより上から上へ … **DRIFT へ移る**(ユーザー指定)。図形が上へ吹き飛び、
 *    効果線が走り抜けたところでタブが変わる。
 *  この切り分けは ALIGN が「左端から右へ」で開くのと同じ作法 ―
 *  **端から引くと空間が変わり、真ん中から払うと場所が変わる**。 */
const TL_GRAB_H = 132;
/** 効果線を伴って吹き飛ぶ時間と、そのとき上向きにかける重力の倍率・本数。
 *  ★★係数は「`WARP_MS` のあいだに画面の高さぶんだけ上がる」で決めてある。
 *  強くしすぎると**数フレームで消えて**効果線しか見えない(第60巡に実測)。 */
const WARP_MS = ms(T_OUT);
const WARP_G = 2;
const WARP_LINES = 26;

const WD3 = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
/** ★GRAVITY の山へ落とす曜日は**綴りのまま**(第60巡にユーザー指定「曜日の英語」)。
 *  TIMELINE の3文字は列の見出しで、こちらは山に転がる一枚の板 ― 役が違う。 */
const WD_FULL = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
/** 板の寸法 … 幅は画面幅に対して、高さはその幅に対して。 */
const PILE_WORD_W = 0.46;
const PILE_WORD_H = 0.40;

/** ★★タスクが無い日に落とす「自由」のブロック(2026-08-25・第56巡にユーザー確定)。
 *  タスクの図形が「色の面＋載った文字」なのに対して、これは**文字そのものが図形**。
 *  日付から選ぶので**同じ日はいつも同じ語**になる。 */
const FREE_WORDS = ["FREE", "自由", "LIBRE", "FREI", "LIBERO", "LIVRE", "VRIJ", "FRI", "VAPAA", "VOLNY"] as const;
const freeWordOf = (dateKey: string) => FREE_WORDS[Math.floor(frac(dateKey + "free") * FREE_WORDS.length) % FREE_WORDS.length];
/** 「自由」の板 …**図形と同じ寸法**(第58巡にユーザー指定。★第60巡に「もう少し
 *  大きく」でもう一段)。幅はレーンの内寸の `FREE_FILL`、高さはその `FREE_H` 倍。
 *  ★板は回さない(`setInertia(Infinity)`)ので、**幅だけ**内寸に収まればよい ―
 *  対角がはみ出しても噛まない(第59巡)。 */
const FREE_FILL = 0.94;
const FREE_H = 0.92;
/** 横に詰めてよい下限(これ以上は潰さない)。 */
const FREE_SQUEEZE = 0.50;
const FREE_PAD = 8;

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
}
interface Item { id: string; task: Task; paint: SolidPaint; spec: SolidSpec; tag: string }
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

/** ★★**極端でシネマティックな緩急**(第57巡にユーザー指定「最初は遅く加速して、
 *  最後がまた遅くなる」)。`t³/(t³+(1-t)³)` は 0 と 1 の両端で傾きがほぼ 0、
 *  中ほどで一気に伸びる。★これは **canvas の図形の座標系だけ**の道具で、
 *  バネと同じ扱い(`lib/tokens.ts` の例外)。CSS の transition には持ち込まない。 */
function cine(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  const a = u * u * u; const b = (1 - u) * (1 - u) * (1 - u);
  return a / (a + b);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** ★連なりの遅れ。間隔が**減衰**していく(最初だけ間があき、あとは次々)。 */
function startAt(i: number): number {
  let t = 0;
  for (let k = 0; k < i; k += 1) t += LEAD_GAP * Math.pow(GAP_DECAY, k);
  return t;
}
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
  /** ★DRIFT へ吹き飛ぶ進み(0..1)。描くときの効果線の濃さと長さがこれを読む。 */
  const warpRef = useRef(0);
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
  /** ★ALIGN で焦点を置く高さ。器のど真ん中に置くと、先頭に居るとき**上半分が
   *  丸ごと空く**(上に行が無いため)。少し上へ寄せて、下の行をもう1〜2件見せる。 */
  const alignMid = useCallback(() => {
    const { top, floor } = fieldOf();
    return top + (floor - top) * 0.34;
  }, [fieldOf]);
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
    const bakeDpr = Math.min(dpr, 1.5);
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

    if (modeRef.current === "align") {
      // ★スロットへ**絵の中心**を置く(第53巡)。
      const bakeUnit = bakeUnitRef.current;
      const pileUnit = UNIT * scaleRef.current;
      const prev = prevRef.current;
      for (const it of itemsRef.current) {
        const cu = curRef.current.get(it.id);
        if (!cu || cu.o <= 0.01) { prev.delete(it.id); continue; }
        let bmp = want(it.paint, bakeUnit);
        let s = cu.s;
        if (!bmp) {
          const pb = peekSolidBitmap(it.paint, pileUnit, bakeDpr);
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
      pendingBakeRef.current = budget === 0 || glyphBudget === 0
        || itemsRef.current.some((it) => !peekSolidBitmap(it.paint, bakeUnit, bakeDpr));
    } else {
      // ★★効果線(第60巡)。DRIFT へ吹き飛ぶ間だけ、下から上へ線が走り抜ける。
      //   図形の**後ろ**に引く ― 前に出すと図形が読めなくなる。
      //   `warpRef` は `advance` が書く進み(0..1)。出て、消える。
      const wu = warpRef.current;
      if (wu > 0) {
        const env = Math.sin(clamp01(wu) * Math.PI);
        ctx.save();
        ctx.strokeStyle = INK;
        ctx.lineCap = "round";
        for (let i = 0; i < WARP_LINES; i += 1) {
          const r1 = frac(`warp${i}`); const r2 = frac(`warp${i}b`); const r3 = frac(`warp${i}c`);
          const len = h * (0.10 + r2 * 0.42) * env;
          // 下から上へ。速い線ほど先に抜ける。
          const y = h * 1.2 - h * 1.9 * clamp01(wu) * (0.7 + r3 * 0.9);
          ctx.globalAlpha = env * (0.07 + r3 * 0.15);
          ctx.lineWidth = 1 + r2 * 2.4;
          ctx.beginPath();
          ctx.moveTo(w * r1, y);
          ctx.lineTo(w * r1, y - len);
          ctx.stroke();
        }
        ctx.restore();
      }
      // 山・タイムライン … **物理の body そのもの**を描く。
      for (const p of piecesRef.current) {
        if (p.word) {
          // ★「自由」のブロック … 色の面を敷かず、**文字そのもの**を置く。
          ctx.save();
          ctx.translate(p.body.position.x, p.body.position.y);
          ctx.rotate(p.body.angle);
          ctx.font = canvasFont(800, p.wordFs ?? 32, SANS);
          ctx.fillStyle = p.wordInk ?? MUTED;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.scale(p.wordSx ?? 1, 1);          // 板の幅へ詰める(コンデンス体として)
          ctx.fillText(p.word, 0, 0);
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
      pendingBakeRef.current = budget === 0 || glyphBudget === 0
        || piecesRef.current.some((p) => !p.word && !peekSolidBitmap(p.paint, p.unit, bakeDpr));
    }
    if (pendingBakeRef.current) wakeRef.current();

    for (const s of shardsRef.current) {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.fill;
      ctx.fillRect(s.x - s.r / 2, s.y - s.r / 2, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }, []);

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
    const mid = alignMid();
    const cx = ARC_APEX_X - ARC_R;
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
      const k = K_TRAVEL * Math.pow(CHAIN, Math.min(CHAIN_MAX, Math.abs(d)));
      springTo(sp, want, k, D_TRAVEL);
      const th = sp.p / ARC_R;
      // 大きさ・濃さは**バネの位置**で決める(遅れた行は遅れて大きくなる)。
      const dd = sp.p / PITCH_TIGHT;
      const f = Math.max(0, 1 - Math.abs(dd) * (PITCH_TIGHT / (PITCH_TIGHT + PITCH_SPREAD)));
      slots.set(list[i].id, {
        x: cx + ARC_R * Math.cos(th), y: mid + ARC_R * Math.sin(th),
        s: (1 + FOCUS_BOOST * f) / (1 + FOCUS_BOOST),
        a: 0,                                     // 図形は回さない(平行を保つ)
        o: clamp01(1.5 - Math.abs(d) / 2.2),
      });
    }
  }, [alignMid]);

  /** ★円弧の下の入り口の角度。**半径から決まる**ので定数にできない
   *  (第56巡に半径を 290→1400 にしたら、固定値 1.45rad は画面のはるか外を指した)。 */
  const arcEnterTh = useCallback(() => {
    const { floor } = fieldOf();
    return Math.asin(Math.max(-1, Math.min(1, (floor + 140 - alignMid()) / ARC_R)));
  }, [fieldOf, alignMid]);

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
      if (Math.abs(p.unit - tlUnitRef.current) > 0.5) swapUnit(M, engine.world, p, tlUnitRef.current);
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
      M.Body.setPosition(p.body, { x: w * (0.14 + 0.72 * r1), y: -RECYCLE_Y * (0.6 + r2 * 1.8) });
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
    const { keep } = pileOf(tasksRef.current, new Date(), w, h - navHeightPx() - MASTHEAD_H);
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

    // ★★DRIFT へ吹き飛んでいる間 … 物理はそのまま(ループが `Engine.update` を
    //   回している)。ここは**進みを数えて効果線に渡し、抜け切ったらタブを変える**だけ。
    if (ph === "warp") {
      warpRef.current = clamp01(t / WARP_MS);
      if (warpRef.current >= 1) { phaseRef.current = null; warpRef.current = 0; goTabRef.current("tasks-drift"); }
      return true;
    }

    if (m === "timeline") {
      // ★物理だけ。器を運び、下へ出たものを引き上げる。
      const wt = worldTargetRef.current;
      if (!wDragRef.current) {
        springTo(worldRef.current, wt, K_SETTLE, D_SETTLE);
        if (!settled(worldRef.current, wt, 0.05)) moving = true;
      }
      const gt = expandedRef.current === null ? 0 : GAP_W;
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
      const sel = expandedRef.current;
      const det = detailRef.current;
      if (det && sel !== null) det.style.transform = `translateX(${(laneLeft(sel) + laneWOf() + SPACE.lg).toFixed(1)}px)`;
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
    const cx = ARC_APEX_X - ARC_R;

    if (ph === "align-in") {
      const enterTh = arcEnterTh();
      let done = true;
      for (let i = 0; i < list.length; i += 1) {
        const it = list[i];
        const sl = slots.get(it.id); const fr = from.get(it.id);
        if (!sl || !fr) continue;
        const inS = inSRef.current.get(it.id) ?? spring(0);
        inSRef.current.set(it.id, inS);
        const d0 = startAt(i);
        // ★★引き渡しは**1つずつ**(第58巡)。後ろの図形は道の手前へ引き戻されるので、
        //   全員一律の時刻で切ると**まだ画面の中に居るのに消える**(ユーザー指摘)。
        //   自分が道を抜け切る時刻＝自分のぶんの遅れを足した時刻で渡す。
        // ★★★1つずつ**自分の道の長さ**を持つ(第59巡)。道の上の位置は
        //   `line = u - STREAM_GAP·i·conv` と**後ろへ引き戻している**のに、進み `u` を
        //   1 で頭打ちにしていたため、i 番目は `1 - 0.115·i` で**止まったまま**に
        //   なっていた(i=8 なら 0.08 ＝ 道のほぼ出発点)。そこへ引き渡しの時刻が来て
        //   円弧の入口へ飛ぶので「途中で止まって消える」(第59巡のユーザー指摘)。
        //   引き戻すぶんだけ進む距離も伸ばせば、**どれも終点まで進んでから**渡る。
        const q = streamQ(i);
        const span = 1 + STREAM_GAP * q;
        const hand = d0 + STREAM_MS * span * A_HANDOFF;
        // 入りの硬さを**1つずつ散らす**。減衰を弱めて**行き過ぎてから戻る**。
        const jit = 1 + (frac(it.id + "in") - 0.5) * 0.3;
        if (t >= hand) springTo(inS, 1, K_TRAVEL * jit, D_IN);
        if (inS.p <= 0.002) {
          // ★★出は**1本の道**。`cine` の極端な緩急で進み(遅→速→遅)、
          //   走りながら道へ吸い寄せられ(`join`)、道の上の間隔が
          //   てんでばらばらから**等間隔の一列**へ揃っていく(`conv`)。
          const u = cine(clamp01((t - d0) / (STREAM_MS * span))) * span;
          const n = u / span;                             // 0..1 に正規化した進み
          const join = clamp01(n / 0.42);                 // 前半で道に乗る
          const conv = clamp01((n - 0.15) / 0.6);         // 少し遅れて間隔が揃う
          const own = u * 0.9;                            // その図形の進み
          const line = u - STREAM_GAP * q * conv;         // 一列に揃ったときの位置
          const p = streamAt(lerp(own, line, conv));
          cur.set(it.id, {
            x: lerp(fr.x, p.x, join), y: lerp(fr.y, p.y, join),
            s: fr.s * lerp(1, p.k, join), a: fr.a * (1 - join), o: 1,
          });
          done = false;
        } else {
          // ★**クランプしない** — バネが 1 を超えたぶんだけ**行き過ぎてから戻る**。
          const u = inS.p;
          const uo = clamp01(u);
          const thEnd = Math.atan2(sl.y - mid, sl.x - cx);
          // ★入口は**番号ぶん円弧の下**。同じ点から一斉に上がると団子になる。
          const th = lerp(enterTh + (ENTRY_QUEUE * i) / ARC_R, thEnd, u);
          cur.set(it.id, {
            x: cx + ARC_R * Math.cos(th), y: mid + ARC_R * Math.sin(th),
            s: lerp(sl.s * 0.68, sl.s, uo), a: 0, o: lerp(0.15, sl.o, uo),
          });
          if (!settled(inS, 1, 0.004)) done = false;
        }
      }
      moving = true;
      // ★いちばん後ろの図形の引き渡し時刻(自分の道の長さぶん伸びている)を基準に。
      const lastSpan = 1 + STREAM_GAP * streamQ(Math.max(0, list.length - 1));
      // ★★終わりは基本 `done`(全部のバネが収まったか)で見る。ここは**念のための下限**
      //   なので短く ― 長くすると、絵はもう着いているのに**指が効かない時間**になる
      //   (第60巡。第59巡は `+ ms(T_IN) + ms(T_ITEM)` で 0.7 秒ぶん余計だった)。
      const txtEnd = startAt(list.length - 1) + STREAM_MS * lastSpan * A_HANDOFF + ms(T_ITEM);
      if (done && t > txtEnd) phaseRef.current = null;
    } else if (ph === "align-out") {
      // ★★閉じも**入りと同じ作り**(第60巡)。1本の道(`homeAt`)へ順に乗り、
      //   道の上の間隔が揃いながら(`conv`)、`cine` の緩急で画面の外へ抜ける。
      //   `outSRef` は**進み(0..1)を入れておく器**として使う(右の文字がこれを読む)。
      let done = true;
      for (let i = 0; i < list.length; i += 1) {
        const it = list[i];
        const fr = from.get(it.id);
        if (!fr) continue;
        const s = outSRef.current.get(it.id) ?? spring(0);
        outSRef.current.set(it.id, s);
        const d0 = startAt(i);
        // ★入りと同じく**自分の道の長さ**を持つ(引き戻すぶん進む距離も伸ばす)。
        const q = streamQ(i);
        const span = 1 + STREAM_GAP * q;
        const u = cine(clamp01((t - d0) / (STREAM_MS * span))) * span;
        const n = u / span;
        const join = clamp01(n / 0.42);                 // 前半で道に乗る
        const conv = clamp01((n - 0.15) / 0.6);         // 少し遅れて間隔が揃う
        const own = u * 0.9;
        const line = u - STREAM_GAP * q * conv;
        const p = homeAt(lerp(own, line, conv));
        s.p = n;                                        // 右の文字が読む進み
        cur.set(it.id, {
          x: lerp(fr.x, p.x, join), y: lerp(fr.y, p.y, join),
          s: fr.s * lerp(1, p.k, join), a: 0, o: 1,
        });
        if (n < 1) done = false;
      }
      moving = true;
      if (done) { phaseRef.current = null; dropAllRef.current(); modeRef.current = "pile"; setMode("pile"); itemsRef.current = []; setItems([]); }
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
        const th = (sp ? sp.p : arcLen(d)) / ARC_R;
        const ax = cx + (ARC_R + TEXT_GAP) * Math.cos(th);
        const ay = mid + (ARC_R + TEXT_GAP) * Math.sin(th);
        let slide = 0; let op = clamp01(1.5 - Math.abs(d) / 2.2);   // ★図形と同じ消え方
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
      }
    }
    return moving;
  }, [alignMid, syncFocus, layoutAlign, streamAt, homeAt, syncLanes, recycle, recycleToPile, laneLeft, laneWOf, arcEnterTh]);

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

  const planPile = useCallback((list: Task[]) => {
    const { w, h } = sizeRef.current;
    return pileOf(list, new Date(), w, h - navHeightPx() - MASTHEAD_H);
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
      backRef.current = new Set();
      riseRef.current = 0; riseDragRef.current = true; riseSRef.current = spring(0);
      warpRef.current = 0;
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
      const paint = paintOf(t, viewRef.current);
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
      if (p) from.set(it.id, { x: p.body.position.x, y: p.body.position.y, s: pileUnit / bakeUnitRef.current, a: p.body.angle, o: 1 });
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
    modeRef.current = "align"; setMode("align");
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
    const freeFs = freeFontSize(laneW);            // ★語によらず1つ
    ds.forEach((key, lane) => {
      if (busy.has(key)) return;
      const r = frac(key + "free");
      // ★★こちらも**画面の上から**落とす(第60巡)。
      const freeW = laneInner(laneW) * FREE_FILL;
      const wp = makeWordPiece(M, freeWordOf(key), `free:${key}`, freeW, freeW * FREE_H, freeFs,
        laneW * lane + laneW / 2 + (r - 0.5) * laneW * 0.2,
        -RECYCLE_Y * (0.7 + r * 1.8) - lane * 24, MUTED);
      if (!wp) return;
      setFilter(wp.body, FILTER_HELD);
      M.Body.setVelocity(wp.body, { x: 0, y: r * 2.2 });
      M.Composite.add(engine.world, wp.body);
      next.push({ ...wp, lane });
    });
    piecesRef.current = next;
    expandedRef.current = null; setExpanded(null);
    worldRef.current = spring(0); worldTargetRef.current = 0; gapRef.current = spring(0);
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
    rebuildWalls(M, engine, w, h, false);
    const { scale } = pileOf(tasksRef.current, new Date(), w, h - navHeightPx() - MASTHEAD_H);
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

  /** ★★上へ払って **DRIFT へ移る**(第60巡にユーザー指定)。
   *  画面の切り替えではなく**物理で吹き飛ばす** ― 床を抜き、重力を上向きに
   *  裏返して、全部の図形に上向きの初速を与える。効果線は `draw` が引く。
   *  抜け切ったら(`WARP_MS`)タブが変わり、戻ってきたときは `dropAll` が
   *  新しい種で落とし直す(＝毎回ちがう山)。 */
  const enterDrift = useCallback(() => {
    const M = matterRef.current; const engine = engineRef.current;
    const { w, h } = sizeRef.current;
    if (!M || !engine || phaseRef.current) return;
    phaseRef.current = "warp"; t0Ref.current = performance.now();
    warpRef.current = 0.0001;
    engine.enableSleeping = false;
    engine.gravity.y = -GRAVITY_Y * WARP_G;
    rebuildWalls(M, engine, w, h, false);        // 床を抜く(左右の壁は残す)
    for (const p of piecesRef.current) {
      M.Sleeping.set(p.body, false);
      setFilter(p.body, FILTER_PILE);
      M.Body.setVelocity(p.body, {
        x: (frac(p.id + "wx") - 0.5) * 3,
        y: -(6 + frac(p.id + "wy") * 5),
      });
      // ★文字の板は回さない(慣性が Infinity なので、一度回すと**止まらない**)。
      if (!p.word) M.Body.setAngularVelocity(p.body, (frac(p.id + "wr") - 0.5) * 0.22);
    }
    haptic(12); wake();
  }, [wake]);

  const leaveAlign = useCallback(() => {
    // ★★**入りの途中でも閉じられる**(第60巡)。入りは図形の数だけ長くなるので、
    //   終わるまで待たせると「払っても何も起きない」時間が生まれる。
    //   いまの位置(`curRef`)から折り返すので、途中で切っても継ぎ目が出ない。
    fromRef.current = new Map(curRef.current);
    inSRef.current = new Map();
    outSRef.current = new Map();
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

  const itemAt = useCallback((px: number, py: number): Item | null => {
    const bakeUnit = bakeUnitRef.current;
    for (let i = itemsRef.current.length - 1; i >= 0; i -= 1) {
      const it = itemsRef.current[i];
      const c = curRef.current.get(it.id);
      if (!c || c.o < 0.2) continue;
      const b = shapeBounds(it.paint);
      const hw = ((b.maxX - b.minX) * bakeUnit * c.s) / 2;
      const hh = ((b.maxY - b.minY) * bakeUnit * c.s) / 2;
      if (px >= c.x - hw && px <= c.x + hw && py >= c.y - hh && py <= c.y + hh) return it;
    }
    return null;
  }, []);

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
          expandedRef.current = nextSel; setExpanded(nextSel);
          // ★たたいた曜日は**画面の左端(余白ぶん内側)**へ。
          worldTargetRef.current = nextSel === null ? Math.max(0, worldTargetRef.current) : laneW * nextSel - PAD_L;
          haptic(8); wake();
        }
        return;
      }
      if (expandedRef.current !== null) { expandedRef.current = null; setExpanded(null); wake(); return; }
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
      id: number; x: number; y: number; edge: boolean; low: boolean; axis: "" | "x" | "y";
      moved: boolean; lastX: number; lastY: number; vy: number;
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
      // ★★地面際か(＝地面を掴んで引き上げられる所か)。ここから上へ払えば TIMELINE、
      //   それより上から払えば DRIFT へ移る(第60巡)。
      const low = e.clientY - r.top > floorYOf(r.height) - TL_GRAB_H;
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
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, edge, low, axis: "", moved: false, lastX: e.clientX, lastY: e.clientY, vy: 0 };
      if (modeRef.current === "align") scrollRef.current.v = 0;
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
      if (m === "pile" && !phaseRef.current && g.axis === "y" && dy < 0 && !g.low) {
        // ★★地面から離れた所からの上払いは **DRIFT へ移る**(第60巡)。
        if (-dy > SWIPE_PX) enterDrift();
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
        flickBy(scrollRef.current, d, PITCH_TIGHT, -0.4, last + 0.4);
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
        else if (d.axis === "y") { flickThrow(scrollRef.current, d.vy, PITCH_TIGHT); wake(); }
      } else if (m === "timeline") {
        if (d.axis === "y" && dy > SWIPE_PX) {
          if (expandedRef.current !== null) { expandedRef.current = null; setExpanded(null); wake(); }
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
  }, [enterAlign, openTimeline, enterPileFromTimeline, closeTimeline, leaveAlign, enterDrift, syncFocus, wake, pieceAt, completeById, burst, laneWOf, laneLeft]);

  const today = new Date();
  const { w: sw } = sizeRef.current;
  const laneW = (sw || 390) / LANES_VISIBLE;
  // ★幅の軸を細く(`WD_WDTH`)したぶん、**同じレーン幅でより大きく**できる
  //   … 変形せずに「少し縦長」になる(第56巡にユーザー確定)。
  const laneFs = Math.min(SWISS_XL, Math.floor((laneW * 0.92) / (3 * WD_ADV)));
  const layerName = mode === "align" ? "ALIGN" : mode === "timeline" ? "TIMELINE" : "GRAVITY";
  const expandedDay = expanded !== null ? days[expanded] : null;
  const expandedTasks = expandedDay ? tasks.filter((t) => t.dueDate === expandedDay) : [];

  return (
    <div ref={rootRef} style={{ position: "absolute", inset: 0 }}>
      <div ref={wrapRef} style={{ position: "absolute", inset: 0, touchAction: "none" }}>
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", willChange: "transform" }} />
      </div>

      <LayerName text={layerName} />

      {mode === "align" && (
        <div className="mode-panel" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
          {items.map((it, i) => {
            const dl = daysLabel(it.task.dueDate, today);
            const focus = i === focusIdx;
            return (
              <div key={it.id} ref={(el) => { rowRefs.current[i] = el; }} className="mode-row" data-id={it.id}
                style={{
                  position: "absolute", top: 0, left: 0, width: `calc(100% - ${ARC_APEX_X + TEXT_GAP}px)`, height: ROW_H,
                  transformOrigin: "0 50%", display: "flex", flexDirection: "column", justifyContent: "center",
                  willChange: "transform", paddingRight: SPACE.lg,
                }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.sm }}>
                  <span style={{
                    fontFamily: LATIN, fontWeight: 800, letterSpacing: "-0.03em", color: INK,
                    // ★焦点だけ一段跳ばして大きく(第56巡)。目盛りの外の数字は足さず、
                    //   display の例外 SWISS_XL / LG / MD の3つで組む。
                    fontSize: dl.kind === "num" ? (focus ? SWISS_XL : SWISS_MD) : (focus ? SWISS_MD : TYPE.head),
                    lineHeight: 0.86, opacity: dl.kind === "num" ? 1 : 0.55,
                  }}>{dl.text}</span>
                  {dl.sub && <span style={{ fontFamily: LATIN, fontWeight: 700, fontSize: TYPE.micro, letterSpacing: "0.18em", color: MUTED }}>{dl.sub}</span>}
                </div>
                <div style={{
                  fontFamily: SANS, fontWeight: focus ? 700 : 600, color: INK, marginTop: SPACE.xs,
                  fontSize: focus ? SWISS_MD : TYPE.lead, lineHeight: focus ? 1.12 : 1.2, overflow: "hidden",
                  // ★焦点だけ2行まで折り返す。左に大きな図形が居るぶん文字の幅が狭いので、
                  //   1行で切ると題がほとんど読めない。
                  ...(focus
                    ? { display: "-webkit-box", WebkitBoxOrient: "vertical" as const, WebkitLineClamp: 2 }
                    : { whiteSpace: "nowrap" as const, textOverflow: "ellipsis" }),
                }}>{it.task.title || "無題"}</div>
                <div style={{ fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: 700, letterSpacing: "0.14em", color: tagColor(it.paint.tag), marginTop: SPACE.hair }}>
                  #{it.tag.toUpperCase()}
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
                  position: "absolute", left: 0, top: 0, bottom: 0, width: 1,
                  background: `color-mix(in srgb, ${INK} 16%, transparent)`, willChange: "transform",
                }}>
                  {/* ★土日はレーンいっぱいに淡い地色(第59巡にユーザー指定)。 */}
                  {wk && (
                    <div style={{
                      position: "absolute", left: 0, top: 0, bottom: 0, width: laneW,
                      background: `color-mix(in srgb, ${INK} 5%, transparent)`,
                    }} />
                  )}
                  <span style={{
                    position: "absolute", left: SPACE.sm, top: 0, whiteSpace: "nowrap",
                    fontFamily: LATIN, fontWeight: 800, fontSize: TYPE.head,
                    letterSpacing: "-0.02em", lineHeight: 1,
                    color: wk ? INK : MUTED,
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
                    fontFamily: LATIN, fontWeight: 800, fontSize: laneFs, lineHeight: 0.86,
                    fontVariationSettings: `"wdth" ${WD_WDTH}`,
                    letterSpacing: "-0.04em", whiteSpace: "nowrap", paddingBottom: SPACE.xs,
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

          {/* ★曜日の隙間に出るその日の詳細。 */}
          {expandedDay && (
            <div ref={detailRef} className="tl-detail" style={{
              position: "absolute", left: 0, width: GAP_W - SPACE.lg * 2,
              bottom: BAND_BOTTOM, zIndex: 3, pointerEvents: "none", willChange: "transform",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.sm, marginBottom: SPACE.md }}>
                <span style={{ fontFamily: LATIN, fontWeight: 800, fontSize: TYPE.head, letterSpacing: "-0.02em", color: expanded === 0 ? RUST : INK }}>
                  {monthDayOf(expandedDay)}
                </span>
                <span style={{ fontFamily: LATIN, fontWeight: 700, fontSize: TYPE.micro, letterSpacing: "0.18em", color: MUTED }}>
                  {expandedTasks.length} TASKS
                </span>
              </div>
              {expandedTasks.length === 0 && (
                <div style={{ fontFamily: SANS, fontSize: TYPE.body, color: MUTED }}>この日には何も入っていない。</div>
              )}
              {expandedTasks.map((t) => (
                <div key={t.id} style={{ marginBottom: SPACE.md }}>
                  <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: TYPE.lead, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t.title || "無題"}
                  </div>
                  <div style={{ fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: 700, letterSpacing: "0.14em", color: tagColor(resolveTag(t.tag, t.id, t.title, t.context, t.belongings, t.note)), marginTop: SPACE.hair }}>
                    #{resolveTag(t.tag, t.id, t.title, t.context, t.belongings, t.note).toUpperCase()}
                  </div>
                </div>
              ))}
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
function wordFontSize(words: readonly string[], bw: number, bh: number): number {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return 24;
  const room = bw - FREE_PAD * 2;
  const base = 64;
  probe.font = canvasFont(800, base, SANS);
  let widest = 1;
  for (const w of words) widest = Math.max(widest, probe.measureText(w).width);
  // ★★**板いっぱいに組む**(第58巡「図形と同じサイズに」)。高さを基準に取り、
  //   横は `FREE_SQUEEZE` まで詰めてよいことにする ― 曜日を `wdth 58` で
  //   細く大きく組んでいるのと同じ考え方(コンデンス体として読ませる)。
  const byW = (base * room) / widest / FREE_SQUEEZE;
  const byH = (bh - FREE_PAD) / 0.78;
  return Math.max(14, Math.min(SWISS_XL, Math.round(Math.min(byW, byH))));
}
const freeFontSize = (laneW: number) => {
  const bw = laneInner(laneW) * FREE_FILL;
  return wordFontSize(FREE_WORDS, bw, bw * FREE_H);
};

/** その語を板の幅へ収めるための横の詰め(1 = 詰めない)。 */
function wordSqueeze(word: string, fs: number, bw: number): number {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return 1;
  probe.font = canvasFont(800, fs, SANS);
  const room = bw - FREE_PAD * 2;
  const w = probe.measureText(word).width || 1;
  return Math.max(FREE_SQUEEZE, Math.min(1, room / w));
}

/** ★文字のブロックを作る。文字の箱を測って、その大きさの物体にする。
 *  書体が届く前に測ると箱がずれるので、**落とすたびに測り直す**。
 *  TIMELINE の「自由」(灰)と、GRAVITY の日付・曜日(黒)の**両方**がこれを使う。 */
function makeWordPiece(
  M: typeof import("matter-js"), word: string, id: string,
  bw: number, bh: number, fs: number, x: number, y: number, ink: string,
): Piece | null {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  const body = M.Bodies.rectangle(x, y, bw, bh, {
    restitution: 0.02, friction: 0.55, frictionStatic: 0.9, frictionAir: 0.012,
  });
  // ★★板は**回さない**(第59巡)。幅 bw・高さ bh の板は**対角**がレーンの内寸を
  //   超えるので、回れると壁に噛んで途中で止まる(「下まで落ちてこない」の正体)。
  //   文字は水平のほうが読めるので、回さないほうが正しい。
  M.Body.setInertia(body, Infinity);
  const spec = specOf({ id, title: word });
  return {
    id, body, spec,
    paint: { spec, view: "name", title: word },
    girth: Math.min(bw, bh), ox: 0, oy: 0, unit: fs, lane: -1, word, wordFs: fs,
    wordSx: wordSqueeze(word, fs, bw), wordInk: ink,
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
  const x = Math.max(hw + 6, Math.min(Math.max(w - hw - 6, hw + 6), w * 0.14 + r1 * w * 0.72));
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
  const bw = w * PILE_WORD_W;
  const bh = bw * PILE_WORD_H;
  // ★大きさは**2枚で1つ**(語の長さで字面が変わらない)。
  const fs = wordFontSize(words, bw, bh);
  const out: Piece[] = [];
  words.forEach((word, i) => {
    const id = `pw:${i}`;
    const r1 = frac(id + seed); const r2 = frac(id + seed + "y");
    const p = makeWordPiece(M, word, id, bw, bh, fs,
      Math.max(bw / 2 + 6, Math.min(w - bw / 2 - 6, w * 0.16 + r1 * w * 0.68)),
      -bh - i * 150 - r2 * 120, INK);
    if (!p) return;
    M.Body.setVelocity(p.body, { x: (r1 - 0.5) * 1.2, y: 0 });
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
  let body: Body; let ox = 0; let oy = 0;
  if (n === 1) body = M.Bodies.circle(x, y, (w * unit) / 2, opts);
  else {
    const src = sectionOutline(n);
    const step = Math.max(1, Math.ceil(src.length / PHYS_VERTS));
    const verts = src.filter((_, k) => k % step === 0).map((q) => ({ x: q.x * w * unit, y: q.y * h * unit }));
    body = M.Bodies.fromVertices(x, y, [verts], opts);
    const c = M.Vertices.centre(verts);
    ox = -c.x; oy = -c.y;
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
  M.Composite.add(engine.world, [
    ...(withFloor ? [M.Bodies.rectangle(w / 2, floorY + T / 2, w + T * 2, T, { isStatic: true, friction: 0.6, collisionFilter: f })] : []),
    M.Bodies.rectangle(-T / 2, h / 2, T, h * 3, { isStatic: true, friction: 0.4, collisionFilter: f }),
    M.Bodies.rectangle(w + T / 2, h / 2, T, h * 3, { isStatic: true, friction: 0.4, collisionFilter: f }),
  ]);
}

function frac(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (Math.imul(h, 2654435761) >>> 0) / 4294967296;
}
