"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Body, Engine, World } from "matter-js";
import { LayerName } from "@/components/tasks/LayerName";
import { DemoSeedButton } from "@/components/tasks/TaskAddButton";
import { DropTargets, fireTarget, targetAt, type DropTarget } from "@/components/tasks/DropTargets";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { ViewToggle } from "@/components/tasks/ViewToggle";
import { ymd } from "@/components/tasks/WhenSheet";
import { haptic } from "@/lib/helpers";
import { rectOf, sectionOutline, type SolidSpec } from "@/lib/solid";
import { clearSolidBitmaps, peekSolidBitmap, shapeBounds, shapeGlyphsReady, solidBitmap, warmShapeGlyphs, type SolidPaint, type SolidView } from "@/lib/solidPaint";
import { onFontsReady, primeAdvances } from "@/lib/textFit";
import { allTagFaces, allTagLabels, resolveTag, tagColor } from "@/lib/taskTags";
import { demoTasks } from "@/lib/taskDemo";
import { areaOf, daysUntil, dropOrder, massOf, specOf } from "@/lib/taskSize";
import { INK, LATIN, MUTED, NAV_H, navHeightPx, PAPER, RUST, SANS, SWISS_LG, SWISS_MD, SWISS_XL } from "@/lib/constants";
import { ms, T_IN, T_ITEM, T_OUT } from "@/lib/motion";
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

type Mode = "pile" | "align" | "timeline";
/** 段取りの局面。null = 物理／落ち着いている。 */
type Phase = "align-in" | "align-out" | null;

const EDGE_PX = 30;
const SWIPE_PX = 44;
const TAP_MOVE = 8;
const AXIS_PX = 8;
const HOLD_MS = 150;
/** ★掴んだ図形を指へ運ぶ強さ(velocity 駆動)と速さの上限。 */
const GRAB_K = 0.34;
const GRAB_MAX = 34;

// ALIGN … 左の円弧
const ARC_R = 290;
const ARC_APEX_X = 88;
const ROW_H = 112;
const ALIGN_MAX_H = 104;
const ALIGN_MAX_W = 148;
const FOCUS_BOOST = 0.72;
const TEXT_GAP = 96;
const SCROLL_DECAY = 0.92;
const SNAP_K = 0.18;
const FLICK_K = 0.9;
/** 円弧の下の入り口。 */
const ARC_ENTER_TH = 1.45;
/** ★★連なりの間隔。**減衰する**ので「最初の1つがぽつんと動き、そのあと次々と
 *  流れ出す」。一定間隔だと行進になってしまう。 */
const LEAD_GAP = 210;
const GAP_DECAY = 0.72;
/** 出ていく道の蛇行(振れ幅と波の数)。中ほどで振れ、出口で消えて一列に揃う。 */
const MEANDER = 46;
const WAVES = 1.35;
/** 二段目(円弧へ上がる)を始めるまで。抜け切る前に繋いで間を空けない。 */
const A_T0 = Math.round(ms(T_OUT) * 0.5);

// TIMELINE
const LANES_VISIBLE = 3;
const HORIZON = 14;
const LANE_HEAD_H = 92;
/** 指で引き上げ切るまでの距離(px)と、床が抜ける合図の位置。 */
const TL_SPAN = 240;
const TL_TRIGGER = 0.45;
const TL_FLAT = 0.04;
/** レーン幅に対する図形の大きさ。★第55巡に大きく(0.86→0.94)。 */
const TL_FILL = 0.94;
/** レーンの壁の厚み。 */
const WALL_T = 24;
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
const FILTER_HELD = { category: CAT_HELD, mask: CAT_WALL | CAT_LANE | CAT_HELD };
/** ★層を変える。**`parts` にも入れる** — `Bodies.fromVertices` が作る複合の body は
 *  当たり判定を各 part の `collisionFilter` で見るので、親だけ書いても効かない。 */
function setFilter(b: Body, f: { category: number; mask: number }) {
  for (const part of b.parts) part.collisionFilter = { ...part.collisionFilter, ...f };
  b.collisionFilter = { ...b.collisionFilter, ...f };
}
/** 曜日を開いたときの隙間(詳細の文字が入る)と、左端の余白。 */
const GAP_W = 232;
const PAD_L = 20;

const WD3 = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

interface Shard { x: number; y: number; vx: number; vy: number; r: number; life: number; fill: string }
const SHARD_MS = 620;

interface Piece {
  id: string; body: Body; spec: SolidSpec; paint: SolidPaint;
  girth: number; ox: number; oy: number; unit: number;
  /** TIMELINE でどの日の列に属するか(-1 = 無し)。 */
  lane: number;
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
function weekdayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return WD3[new Date(y, m - 1, d).getDay()];
}
const monthDayOf = (dateKey: string) => {
  const [, m, d] = dateKey.split("-").map(Number);
  return `${m}/${d}`;
};

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
const bezD = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c);
};

export function GravityTab({ appState, persist, showToast, appActive, active = true, dragged }: TabProps & {
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
  const [view, setView] = useState<SolidView>("name");
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
  const fromRef = useRef<Map<string, Slot>>(new Map());
  const outSRef = useRef<Map<string, Spring>>(new Map());
  const inSRef = useRef<Map<string, Spring>>(new Map());
  const bakeUnitRef = useRef(UNIT);
  const scrollRef = useRef(0);
  const scrollVRef = useRef(0);
  const aDragRef = useRef(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const focusRef = useRef(0);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // TIMELINE
  const daysRef = useRef<string[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const bandRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const dayRefs = useRef<(HTMLDivElement | null)[]>([]);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const expandedRef = useRef<number | null>(null);
  /** 曜日の伸び(指が動かす 0..1)。 */
  const riseRef = useRef(0);
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
  const scaleRef = useRef(1);

  const tasks = useMemo(() => (appState.tasks ?? []).filter((t) => !t.done), [appState.tasks]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const open = (appState.tasks ?? []).find((t) => t.id === openId) ?? null;

  const fieldOf = useCallback(() => {
    const { h } = sizeRef.current;
    const floor = h - navHeightPx();
    return { top: MASTHEAD_H, floor, mid: (MASTHEAD_H + floor) / 2 };
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
      for (const it of itemsRef.current) {
        const cu = curRef.current.get(it.id);
        if (!cu || cu.o <= 0.01) continue;
        let bmp = want(it.paint, bakeUnit);
        let s = cu.s;
        if (!bmp) {
          const pb = peekSolidBitmap(it.paint, pileUnit, bakeDpr);
          if (pb) { bmp = pb; s = (cu.s * bakeUnit) / pileUnit; }
        }
        if (!bmp) continue;
        ctx.save();
        ctx.globalAlpha = cu.o;
        ctx.translate(cu.x, cu.y);
        ctx.rotate(cu.a);
        ctx.scale(s, s);
        ctx.drawImage(bmp.canvas, -bmp.w / 2, -bmp.h / 2, bmp.w, bmp.h);
        ctx.restore();
      }
      pendingBakeRef.current = budget === 0 || glyphBudget === 0
        || itemsRef.current.some((it) => !peekSolidBitmap(it.paint, bakeUnit, bakeDpr));
    } else {
      // 山・タイムライン … **物理の body そのもの**を描く。
      for (const p of piecesRef.current) {
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
        || piecesRef.current.some((p) => !peekSolidBitmap(p.paint, p.unit, bakeDpr));
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
    const { mid } = fieldOf();
    const cx = ARC_APEX_X - ARC_R;
    const step = ROW_H / ARC_R;
    const slots = slotRef.current;
    for (let i = 0; i < list.length; i += 1) {
      const d = i - scrollRef.current;
      const th = d * step;
      const f = Math.max(0, 1 - Math.abs(d));
      slots.set(list[i].id, {
        x: cx + ARC_R * Math.cos(th), y: mid + ARC_R * Math.sin(th),
        s: (1 + FOCUS_BOOST * f) / (1 + FOCUS_BOOST),
        a: 0,                                     // 図形は回さない(平行を保つ)
        o: clamp01(1.5 - Math.abs(d) / 2.2),
      });
    }
  }, [fieldOf]);

  const syncFocus = useCallback(() => {
    const n = Math.max(0, Math.min(itemsRef.current.length - 1, Math.round(scrollRef.current)));
    if (n !== focusRef.current) { focusRef.current = n; setFocusIdx(n); }
  }, []);

  /** ★山から右上へ抜ける道。S字＋蛇行で「一連の流れ」に見せる。 */
  const flyPath = useCallback((fr: Slot, u: number, phase: number) => {
    const { w } = sizeRef.current;
    const p0x = fr.x, p0y = fr.y;
    const p3x = w + 200, p3y = -200;
    const p1x = fr.x + 40, p1y = fr.y - 240;      // まず持ち上がり
    const p2x = w * 0.55, p2y = -30;              // それから右上へ抜ける
    const t = clamp01(u);
    let x = bez(p0x, p1x, p2x, p3x, t);
    let y = bez(p0y, p1y, p2y, p3y, t);
    // 接線に直交する向きへ振る。振れは中ほどで最大、出口で 0(＝一列に揃う)。
    const dx = bezD(p0x, p1x, p2x, p3x, t);
    const dy = bezD(p0y, p1y, p2y, p3y, t);
    const len = Math.hypot(dx, dy) || 1;
    const amp = MEANDER * 4 * t * (1 - t);
    const s = Math.sin(t * Math.PI * 2 * WAVES + phase) * amp;
    x += (-dy / len) * s;
    y += (dx / len) * s;
    return { x, y };
  }, []);

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
    for (const p of piecesRef.current) {
      if (p.body.position.y < h + 120) continue;
      if (p.lane < 0) continue;
      // 大きさをレーン用へ入れ替える(画面の外なので継ぎ目は見えない)。
      if (Math.abs(p.unit - tlUnitRef.current) > 0.5) swapUnit(M, engine.world, p, tlUnitRef.current);
      const cx = laneLeft(p.lane) + laneW / 2;
      M.Body.setPosition(p.body, { x: cx + (frac(p.id) - 0.5) * laneW * 0.22, y: -RECYCLE_Y });
      M.Body.setVelocity(p.body, { x: 0, y: 0 });
      M.Body.setAngularVelocity(p.body, 0);
      M.Body.setAngle(p.body, 0);
      // ★列に入ったら**回らない**(慣性を無限に)。落ちる・積む・押し合うは物理のまま
      //   だが、傾いて着地すると曜日の列が読めなくなる。
      M.Body.setInertia(p.body, Infinity);
      // ★ここからはレーンの器と噛み合う層へ移す(＝振り分け済み)。
      setFilter(p.body, FILTER_HELD);
      M.Sleeping.set(p.body, false);
    }
  }, [laneLeft, laneWOf]);

  // ── 毎フレーム ─────────────────────────────────────────────
  const advance = useCallback((): boolean => {
    const m = modeRef.current;
    const ph = phaseRef.current;
    let moving = false;
    const now = performance.now();
    const t = now - t0Ref.current;
    const { w } = sizeRef.current;
    const { mid } = fieldOf();
    const list = itemsRef.current;

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
      if (openedRef.current) { syncLanes(); recycle(); }
      const band = bandRef.current;
      const strip = stripRef.current;
      if (band) band.style.setProperty("--tl", String(TL_FLAT + (1 - TL_FLAT) * riseRef.current));
      if (strip) strip.style.transform = `translateX(${(-worldRef.current.p).toFixed(1)}px)`;
      // ★曜日の札は**レーンの器と同じ式**で置く(`laneLeft` は世界のスクロールを
      //   含むので、strip がすでに引いたぶんを足し戻す)。
      const off = worldRef.current.p;
      const laneW0 = laneWOf();
      const sel0 = expandedRef.current;
      for (let i = 0; i < daysRef.current.length; i += 1) {
        const el = dayRefs.current[i];
        if (!el) continue;
        const left = laneLeft(i);
        el.style.transform = `translateX(${(left + off).toFixed(1)}px)`;
        // ★濃さは**画面での位置**で決める(左ほど濃い)。絶対の日付番号で決めると、
        //   横へ送ったとたん全部が薄墨になって読めなくなる(第55巡)。
        const k = Math.max(0, Math.round(left / laneW0));
        el.style.setProperty("--wd", i === 0 ? RUST : (sel0 === i ? INK : gradeInk(k)));
      }
      const sel = expandedRef.current;
      const det = detailRef.current;
      if (det && sel !== null) det.style.transform = `translateX(${(laneLeft(sel) + laneWOf() + SPACE.lg).toFixed(1)}px)`;
      return moving;
    }

    if (m === "pile" && !ph) return false;

    // ── ALIGN ──
    if (m === "align" && !ph && !aDragRef.current) {
      const last = list.length - 1;
      if (Math.abs(scrollVRef.current) > 0.0015) {
        scrollRef.current += scrollVRef.current; scrollVRef.current *= SCROLL_DECAY; moving = true;
      } else {
        scrollVRef.current = 0;
        const n = Math.max(0, Math.min(last, Math.round(scrollRef.current)));
        const d = n - scrollRef.current;
        if (Math.abs(d) > 0.002) { scrollRef.current += d * SNAP_K; moving = true; } else scrollRef.current = n;
      }
      scrollRef.current = Math.max(-0.4, Math.min(last + 0.4, scrollRef.current));
      syncFocus();
    }
    layoutAlign();

    const cur = curRef.current; const from = fromRef.current; const slots = slotRef.current;
    const cx = ARC_APEX_X - ARC_R;

    if (ph === "align-in") {
      let done = true;
      for (let i = 0; i < list.length; i += 1) {
        const it = list[i];
        const sl = slots.get(it.id); const fr = from.get(it.id);
        if (!sl || !fr) continue;
        const outS = outSRef.current.get(it.id) ?? spring(0);
        const inS = inSRef.current.get(it.id) ?? spring(0);
        outSRef.current.set(it.id, outS); inSRef.current.set(it.id, inS);
        const d0 = startAt(i);
        if (t >= d0) springTo(outS, 1, K_TRAVEL, D_TRAVEL);
        if (t >= A_T0 + d0) springTo(inS, 1, K_TRAVEL, D_TRAVEL);
        if (inS.p <= 0.002) {
          const p = flyPath(fr, outS.p, frac(it.id) * Math.PI * 2);
          cur.set(it.id, { x: p.x, y: p.y, s: fr.s, a: fr.a * (1 - clamp01(outS.p)), o: 1 });
          done = false;
        } else {
          const u = clamp01(inS.p);
          const thEnd = Math.atan2(sl.y - mid, sl.x - cx);
          const th = lerp(ARC_ENTER_TH, thEnd, u);
          cur.set(it.id, {
            x: cx + ARC_R * Math.cos(th), y: mid + ARC_R * Math.sin(th),
            s: lerp(sl.s * 0.68, sl.s, u), a: 0, o: lerp(0.15, sl.o, u),
          });
          if (!settled(inS, 1, 0.004)) done = false;
        }
      }
      moving = true;
      const txtEnd = A_T0 + startAt(list.length - 1) + ms(T_IN) + ms(T_ITEM);
      if (done && t > txtEnd) phaseRef.current = null;
    } else if (ph === "align-out") {
      let done = true;
      for (let i = 0; i < list.length; i += 1) {
        const it = list[i];
        const fr = from.get(it.id);
        if (!fr) continue;
        const s = outSRef.current.get(it.id) ?? spring(0);
        outSRef.current.set(it.id, s);
        if (t >= startAt(i) * 0.5) springTo(s, 1, K_TRAVEL, D_TRAVEL);
        const u = clamp01(s.p);
        cur.set(it.id, { x: lerp(fr.x, -260, u), y: fr.y + Math.sin(u * Math.PI) * 26, s: fr.s, a: 0, o: 1 - u * 0.4 });
        if (!settled(s, 1, 0.006)) done = false;
      }
      moving = true;
      if (done) { phaseRef.current = null; dropAllRef.current(); modeRef.current = "pile"; setMode("pile"); itemsRef.current = []; setItems([]); }
    } else if (m === "align") {
      for (const it of list) { const sl = slots.get(it.id); if (sl) cur.set(it.id, sl); }
    }

    // 文字(円弧に沿う)。位置は ref 越しに毎フレーム書く。
    if (m === "align") {
      const rows = rowRefs.current;
      for (let i = 0; i < list.length; i += 1) {
        const el = rows[i];
        if (!el) continue;
        const d = i - scrollRef.current;
        const th = d * (ROW_H / ARC_R);
        const ax = cx + (ARC_R + TEXT_GAP) * Math.cos(th);
        const ay = mid + (ARC_R + TEXT_GAP) * Math.sin(th);
        let slide = 0; let op = clamp01(1.35 - Math.abs(d) / 1.6);
        if (ph === "align-in") {
          const s = inSRef.current.get(list[i].id);
          const u = clamp01(((s?.p ?? 0) - 0.55) / 0.45);
          slide = (1 - u) * (w * 0.9); op *= u;
        } else if (ph === "align-out") {
          const s = outSRef.current.get(list[i].id);
          const u = clamp01(s?.p ?? 0);
          slide = u * (w * 0.9); op *= 1 - u;
        }
        el.style.transform = `translate(${(ax + slide).toFixed(1)}px, ${(ay - ROW_H / 2).toFixed(1)}px) rotate(${th.toFixed(3)}rad)`;
        el.style.opacity = String(op);
      }
    }
    return moving;
  }, [fieldOf, syncFocus, layoutAlign, flyPath, syncLanes, recycle, laneLeft, laneWOf]);

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
    const { keep, scale } = planPile(tasksRef.current);
    scaleRef.current = scale;
    const unit = UNIT * scale;
    const added = dropOrder(keep, new Date()).map((t, i) => makePiece(M, t, viewRef.current, w, i, unit));
    M.Composite.add(engine.world, added.map((p) => p.body));
    piecesRef.current = added;
    rebuildWalls(M, engine, w, h, true);
    engine.gravity.y = 1.4;
    engine.enableSleeping = true;
    openedRef.current = false;
    wake(); drawRef.current();
  }, [wake, planPile, clearLanes]);
  dropAllRef.current = dropAll;

  useEffect(() => {
    viewRef.current = view;
    piecesRef.current = piecesRef.current.map((p) => ({ ...p, paint: { ...p.paint, view } }));
    wake(); drawRef.current();
  }, [view, wake]);

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
      engine.gravity.y = 1.4;
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
    for (const p of piecesRef.current) if (!alive.has(p.id)) M.Composite.remove(engine.world, p.body);
    piecesRef.current = piecesRef.current.filter((p) => alive.has(p.id)).map((p) => {
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
    const added = dropOrder(keep, new Date()).filter((t) => !have.has(t.id))
      .map((t, i) => makePiece(M, t, viewRef.current, w, i, unit));
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
    scrollRef.current = 0; scrollVRef.current = 0;
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
    // ★日付のあるタスクだけ。無いものは**出さない**(第55巡にユーザー指定)。
    const dated = tasksRef.current.filter((t) => t.dueDate && ds.includes(t.dueDate));
    const laneW = w / LANES_VISIBLE;
    let mw = 1; let mh = 1;
    for (const t of dated) {
      const b = shapeBounds(paintOf(t, viewRef.current));
      mw = Math.max(mw, b.maxX - b.minX); mh = Math.max(mh, b.maxY - b.minY);
    }
    tlUnitRef.current = Math.min((laneW * TL_FILL) / mw, (LANE_HEAD_H * 2.0) / mh);
    // いま山に居るものはその位置のまま落とし、居ないものは上から入れる。
    const byId = new Map(piecesRef.current.map((p) => [p.id, p]));
    const keepIds = new Set(dated.map((t) => t.id));
    for (const p of piecesRef.current) if (!keepIds.has(p.id)) M.Composite.remove(engine.world, p.body);
    const next: Piece[] = [];
    const bandTop = bandTopY();
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
      M.Body.setInertia(p.body, Infinity);
      M.Body.setPosition(p.body, {
        x: laneW * lane + laneW / 2 + (frac(t.id) - 0.5) * laneW * 0.22,
        y: bandTop - RECYCLE_Y - i * 40,
      });
      M.Body.setVelocity(p.body, { x: 0, y: 0 });
      M.Composite.add(engine.world, p.body);
      next.push({ ...p, lane });
    });
    piecesRef.current = next;
    expandedRef.current = null; setExpanded(null);
    worldRef.current = spring(0); worldTargetRef.current = 0; gapRef.current = spring(0);
    rebuildWalls(M, engine, w, h, false, laneBodiesRef.current);   // ★床を抜く
    buildLanes();
    engine.gravity.y = 1.4;
    engine.enableSleeping = true;
    openedRef.current = true;
    for (const p of piecesRef.current) M.Sleeping.set(p.body, false);
    haptic(12); wake();
  }, [buildLanes, bandTopY, wake]);

  const enterPileFromTimeline = useCallback(() => {
    riseRef.current = 0; openedRef.current = false;
    expandedRef.current = null; setExpanded(null);
    modeRef.current = "pile"; setMode("pile");
    dropAllRef.current();
    haptic(8);
  }, []);

  const leaveAlign = useCallback(() => {
    fromRef.current = new Map(curRef.current);
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
      if (piece) { haptic(8); setOpenId(piece.id); }
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
    } | null = null;

    const beginHold = () => {
      const gr = grabRef.current; const M = matterRef.current; const engine = engineRef.current;
      if (!gr || !M || !engine) return;
      if (g?.moved) { grabRef.current = null; return; }
      gr.held = true;
      // ★★掴んでいる間は**眠らせない**。眠っている物体は当たり判定が起きず、
      //   掴んだ図形がすり抜けて見える(第55巡に実機で発覚)。
      engine.enableSleeping = false;
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
        if (p) {
          grabRef.current = {
            piece: p, dx: p.body.position.x - (e.clientX - r.left), dy: p.body.position.y - (e.clientY - r.top),
            held: false, holdT: window.setTimeout(beginHold, HOLD_MS),
            vx: 0, vy: 0, lastX: e.clientX, lastY: e.clientY,
          };
        }
      }
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, edge, axis: "", moved: false, lastX: e.clientX, lastY: e.clientY, vy: 0 };
      if (modeRef.current === "align") { aDragRef.current = true; scrollVRef.current = 0; }
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
          const t = targetAt(mouthRef.current, trashRef.current, e.clientX, e.clientY);
          setHover((cur) => (cur === t ? cur : t));
          wake(); g.lastX = e.clientX; g.lastY = e.clientY;
          return;
        }
      }

      const m = modeRef.current;
      if (m === "pile" && !phaseRef.current && g.axis === "y" && dy < 0) {
        // ★曜日が指に追従して伸びる。伸び切る手前で**床が抜ける**(＝合図)。
        if (!tlDragRef.current) {
          tlDragRef.current = true;
          modeRef.current = "timeline"; setMode("timeline");
        }
        riseRef.current = clamp01(-dy / TL_SPAN);
        if (!openedRef.current && riseRef.current >= TL_TRIGGER) openTimeline();
        wake();
      } else if (m === "timeline" && tlDragRef.current && g.axis === "y") {
        riseRef.current = clamp01(-dy / TL_SPAN);
        if (!openedRef.current && riseRef.current >= TL_TRIGGER) openTimeline();
        wake();
      } else if (m === "align" && !phaseRef.current && g.axis === "y") {
        const d = e.clientY - g.lastY;
        scrollRef.current -= d / ROW_H; g.vy = d; syncFocus(); wake();
      } else if (m === "timeline" && !tlDragRef.current && g.axis === "x" && expandedRef.current === null) {
        const laneW = laneWOf();
        const max = Math.max(0, laneW * (daysRef.current.length - LANES_VISIBLE));
        wDragRef.current = true;
        const nx = Math.max(0, Math.min(max, worldRef.current.p - (e.clientX - g.lastX)));
        worldRef.current.v = nx - worldRef.current.p;
        worldRef.current.p = nx;
        worldTargetRef.current = nx;
        wake();
      }
      g.lastX = e.clientX; g.lastY = e.clientY;
    };

    const up = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const d = g; g = null;
      aDragRef.current = false;
      const dx = e.clientX - d.x; const dy = e.clientY - d.y;
      const m = modeRef.current;

      const gr = grabRef.current;
      if (gr) {
        const M = matterRef.current; const engine = engineRef.current;
        window.clearTimeout(gr.holdT);
        if (gr.held && M) {
          const t = targetAt(mouthRef.current, trashRef.current, e.clientX, e.clientY);
          grabRef.current = null; setHolding(false); setHover(null);
          if (engine) engine.enableSleeping = true;
          if (t) {
            fireTarget(t === "mouth" ? mouthRef.current : trashRef.current);
            if (t === "mouth") completeById(gr.piece.id);
            else { haptic(14); burst(gr.piece.id); removeRef.current(gr.piece.id); }
          } else M.Sleeping.set(gr.piece.body, false);   // 速度は残っているのでそのまま飛ぶ
          wake(); return;
        }
        grabRef.current = null; setHolding(false); setHover(null);
      }

      if (tlDragRef.current) {
        tlDragRef.current = false;
        if (openedRef.current) { riseRef.current = 1; haptic(10); }
        else { modeRef.current = "pile"; setMode("pile"); riseRef.current = 0; }
        wake(); return;
      }
      if (!d.moved) { tapAt(e.clientX, e.clientY); return; }

      if (m === "pile") {
        if (d.edge && d.axis === "x" && dx > SWIPE_PX && !phaseRef.current) enterAlign();
      } else if (m === "align" && !phaseRef.current) {
        if (d.axis === "x" && dx < -SWIPE_PX) leaveAlign();
        else if (d.axis === "y") { scrollVRef.current = -(d.vy * FLICK_K) / ROW_H; wake(); }
      } else if (m === "timeline") {
        if (d.axis === "y" && dy > SWIPE_PX) {
          if (expandedRef.current !== null) { expandedRef.current = null; setExpanded(null); wake(); }
          else enterPileFromTimeline();
        } else if (d.axis === "x") {
          wDragRef.current = false;
          const laneW = laneWOf();
          const max = Math.max(0, laneW * (daysRef.current.length - LANES_VISIBLE));
          worldTargetRef.current = Math.max(0, Math.min(max, Math.round(worldRef.current.p / laneW) * laneW));
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
  }, [enterAlign, openTimeline, enterPileFromTimeline, leaveAlign, syncFocus, wake, pieceAt, completeById, burst, laneWOf, laneLeft]);

  const today = new Date();
  const { w: sw } = sizeRef.current;
  const laneW = (sw || 390) / LANES_VISIBLE;
  const laneFs = Math.min(SWISS_XL, Math.floor((laneW * 0.92) / (3 * 0.70)));
  const layerName = mode === "align" ? "ALIGN" : mode === "timeline" ? "TIMELINE" : "GRAVITY";
  const expandedDay = expanded !== null ? days[expanded] : null;
  const expandedTasks = expandedDay ? tasks.filter((t) => t.dueDate === expandedDay) : [];

  return (
    <div ref={rootRef} style={{ position: "absolute", inset: 0 }}>
      <div ref={wrapRef} style={{ position: "absolute", inset: 0, touchAction: "none" }}>
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", willChange: "transform" }} />
      </div>

      <LayerName text={layerName} right={mode === "pile" ? <ViewToggle view={view} onChange={setView} /> : undefined} />

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
                    fontSize: dl.kind === "num" ? (focus ? SWISS_LG : SWISS_MD) : (focus ? TYPE.display : TYPE.head),
                    lineHeight: 0.9, opacity: dl.kind === "num" ? 1 : 0.55,
                  }}>{dl.text}</span>
                  {dl.sub && <span style={{ fontFamily: LATIN, fontWeight: 700, fontSize: TYPE.micro, letterSpacing: "0.18em", color: MUTED }}>{dl.sub}</span>}
                </div>
                <div style={{
                  fontFamily: SANS, fontWeight: focus ? 700 : 600, color: INK, marginTop: SPACE.xs,
                  fontSize: focus ? TYPE.display : TYPE.lead, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
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
          <div ref={bandRef} className="tl-band"
            style={{
              position: "absolute", left: 0, right: 0, bottom: `calc(${NAV_H} + ${SPACE.xl}px)`,
              height: LANE_HEAD_H, overflow: "hidden", pointerEvents: "none", zIndex: 3,
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
                    letterSpacing: "-0.04em", whiteSpace: "nowrap", paddingBottom: SPACE.xs,
                    // 濃さは毎フレーム `--wd` に入る(画面での位置で決まる)。
                    color: `var(--wd, ${i === 0 ? RUST : gradeInk(i)})`,
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
              bottom: `calc(${NAV_H} + ${SPACE.xl}px)`, zIndex: 3, pointerEvents: "none", willChange: "transform",
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

/** 画面での位置(0=いちばん左)から曜日の濃さ。★左ほど濃く、右へ退いていく。 */
function gradeInk(i: number): string {
  const a = Math.max(0.16, 0.5 - i * 0.15);
  return `color-mix(in srgb, ${INK} ${Math.round(a * 100)}%, ${PAPER})`;
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

function makePiece(
  M: typeof import("matter-js"), t: Task, view: SolidView, w: number, i: number, unit: number,
): Piece {
  const paint = paintOf(t, view);
  const b = shapeBounds(paint);
  const hw = ((b.maxX - b.minX) * unit) / 2;
  const x = Math.max(hw + 6, Math.min(Math.max(w - hw - 6, hw + 6), w * 0.14 + frac(t.id) * w * 0.72));
  const y = -((b.maxY - b.minY) * unit) - i * (110 + 100 * unit / UNIT);
  const { body, ox, oy } = makeBody(M, paint, x, y, unit);
  return { id: t.id, body, spec: paint.spec, paint, girth: girthOf(paint, unit), ox, oy, unit, lane: -1 };
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
  const floorY = h - navHeightPx();
  M.Composite.add(engine.world, [
    ...(withFloor ? [M.Bodies.rectangle(w / 2, floorY + T / 2, w + T * 2, T, { isStatic: true, friction: 0.6 })] : []),
    M.Bodies.rectangle(-T / 2, h / 2, T, h * 3, { isStatic: true, friction: 0.4 }),
    M.Bodies.rectangle(w + T / 2, h / 2, T, h * 3, { isStatic: true, friction: 0.4 }),
  ]);
}

function frac(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (Math.imul(h, 2654435761) >>> 0) / 4294967296;
}
