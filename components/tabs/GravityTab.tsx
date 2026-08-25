"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Body, Engine } from "matter-js";
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
import { ms, T_IN, T_ITEM, T_OUT, T_STEP } from "@/lib/motion";
import { SPACE, TYPE } from "@/lib/tokens";
import type { AppState, TabProps, Task } from "@/lib/types";

// ★タスクタブ(GRAVITY)。**タスク図形は常にこの空間にだけ在る**(第52巡)。別画面へ
// 遷移せず、スワイプで**この空間の物理法則を一時的に変える**:
//   ・pile     … 既定。重力で落ちて積まれる。**掴んで運べる**(第54巡)。
//   ・align    … 画面左端から右へ払う。**左に円弧**で図形が並び、**文字も円弧に沿う**。
//   ・timeline … 下から上へ払う。**地面から曜日が立ち上がり**、上から各曜日の列へ降る。
//
// ★★描き方 … align/timeline では **matter の body の位置で描かない**。レイアウトが
// 決めた**スロット `{x,y,s,a,o}` へ焼いた絵の中心を置く**(第53巡。`ox/oy` 補正を
// やめたのがズレの根治)。大小は `ctx.scale`、焼くのは1つの unit だけ。
//
// ★★動きの段取り(第54巡にユーザー指定)は**時間で刻む**(`phaseRef` + `t0Ref`)。
// 各図形は自分の**持ち時間**(番号ぶんずらした局所の進み)で動くので、「順番に連なって
// 出ていく」「上から順に文字が入る」が1つのループの中で作れる。

/** 図形の1単位を何pxで描くか。 */
const UNIT = 64;
const MASS_K = 1.6;
const FILL = 0.58;
const SCALE_MIN = 0.70;
/** 見出し(アプリ名の札 + 層の名前 + ビュー切替)が占める高さ。 */
const MASTHEAD_H = 124;
const FIT_W = 0.86;
const FIT_H = 0.62;
const SCALE_MAX = 1.6;
const SCALE_EPS = 0.02;
const PHYS_VERTS = 12;
const BAKE_BUDGET = 1;
const GLYPH_BUDGET = 4;
const CULL_PX = 30;

// ── モードの語彙(図形とレイアウトの座標系。`lib/tokens.ts` の例外2) ──
type Mode = "pile" | "align" | "timeline";
/** 段取りの局面。null = 落ち着いている。 */
type Phase = "align-in" | "align-out" | "tl-out" | null;
const EDGE_PX = 30;
const SWIPE_PX = 44;
const TAP_MOVE = 8;
const AXIS_PX = 8;
/** 掴むまでの長押し(DRIFT と同じ)。 */
const HOLD_MS = 150;
/** 離した指の速さを物体へ渡す倍率(投げ)。 */
const FLING = 0.6;

// ALIGN … 左の円弧
const ARC_R = 290;
const ARC_APEX_X = 88;
const ROW_H = 112;
/** ★**焦点(中央)の図形**の高さ・幅の目標(px)。焦点以外はここから `FOCUS_BOOST`
 *  ぶん小さくなる。★焼く単位にブーストを掛けないこと — 掛けると焦点が
 *  `ALIGN_MAX_*`×1.72 まで膨らみ、右の文字へめり込む(第54巡に実機で発覚)。 */
const ALIGN_MAX_H = 104;
const ALIGN_MAX_W = 148;
/** ★焦点(中央)の強調。第54巡に「もっと大きく」の指定で 0.34 → 0.72。 */
const FOCUS_BOOST = 0.72;
/** 文字を置く円の半径 … 図形の円弧より外側。文字もこの円に沿って回る。 */
const TEXT_GAP = 96;
const SCROLL_DECAY = 0.92;
const SNAP_K = 0.18;
const FLICK_K = 0.9;
/** 円弧の下の入り口(ここから上がってきて埋まる)。 */
const ARC_ENTER_TH = 1.45;

// TIMELINE
const LANES_VISIBLE = 3;
const HORIZON = 14;
/** ★第54巡に図形を大きく(小さすぎるという指摘)。段の間隔もそれに合わせる。 */
const TL_MAX_H = 76;
const LANE_PITCH = 88;
const LANE_HEAD_H = 92;
/** 指で引き上げ切るまでの距離(px)。 */
const TL_SPAN = 240;
/** 潰れている曜日の縦の倍率。 */
const TL_FLAT = 0.04;
/** 山が落ち切る進み具合(ここから上の空が降り始める)。 */
const TL_FALL = 0.45;
/** 横スワイプの慣性と吸着。 */
const WORLD_DECAY = 0.94;
const WORLD_SNAP_K = 0.16;
const WORLD_FLICK = 14;
/** 横スワイプの追従 … **下(k=0)がいちばん速く、上ほど遅れて付いてくる**。 */
const LAG_BASE = 0.34;
const LAG_DECAY = 0.82;

// 段取りの時間(すべて `lib/motion.ts` の語彙から引く。新しい数字を足さない)
const A_OUT = ms(T_OUT);                    // 山から抜ける / はける
const A_STEP = ms(T_STEP);                  // 連なりの間
const A_IN = ms(T_IN);                      // 円弧へ上がる
const A_TXT = ms(T_ITEM);                   // 文字が右から入る
const A_T0 = Math.round(A_OUT * 0.55);      // 抜け切る前に上がり始める(間を空けない)
/** 連なりの間はここで頭打ち(件数が多くても待たされない)。 */
const STAG_MAX = 10;

const WD3 = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

interface Shard { x: number; y: number; vx: number; vy: number; r: number; life: number; fill: string }
const SHARD_MS = 620;

interface Piece {
  id: string; body: Body; spec: SolidSpec; paint: SolidPaint;
  girth: number; ox: number; oy: number;
}
interface Item { id: string; task: Task; paint: SolidPaint; spec: SolidSpec; tag: string }
/** 絵を置く場所。x/y は**絵の中心**、s は倍率、a は角度、o は濃さ。 */
interface Slot { x: number; y: number; s: number; a: number; o: number }

const paintOf = (t: Task, view: SolidView): SolidPaint => ({
  spec: specOf(t), view, title: t.title,
  tag: resolveTag(t.tag, t.id, t.title, t.context, t.belongings, t.note),
});

const sameShape = (a: SolidSpec, b: SolidSpec) =>
  a.sides.length === b.sides.length
  && Math.abs(a.w - b.w) < 1e-6 && Math.abs(a.h - b.h) < 1e-6;

/**
 * ★残り日数の見せ方。**文字数ではなく「種類」で大きさを決める**(第53巡)。
 *   num  … 数字。大きく出す。 word … `OVER` / `SOMEDAY`。小さく薄く。
 */
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

const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const stag = (i: number) => Math.min(i, STAG_MAX) * A_STEP;

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

  // ── モードと段取り ──
  const [mode, setMode] = useState<Mode>("pile");
  const modeRef = useRef<Mode>("pile");
  const frozenRef = useRef(false);
  const phaseRef = useRef<Phase>(null);
  const t0Ref = useRef(0);
  /** TIMELINE の進み具合(0..1)。指が直に進める。 */
  const tlPRef = useRef(0);
  const tlDragRef = useRef(false);

  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const slotRef = useRef<Map<string, Slot>>(new Map());
  const curRef = useRef<Map<string, Slot>>(new Map());
  const fromRef = useRef<Map<string, Slot>>(new Map());
  const stackRef = useRef<Map<string, number>>(new Map());
  const laneOfRef = useRef<Map<string, number>>(new Map());
  const bakeUnitRef = useRef(UNIT);

  // ALIGN
  const scrollRef = useRef(0);
  const scrollVRef = useRef(0);
  const aDragRef = useRef(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const focusRef = useRef(0);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // TIMELINE
  const worldRef = useRef(0);
  const worldVRef = useRef(0);
  const wDragRef = useRef(false);
  const daysRef = useRef<string[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const bandRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const expandedRef = useRef<number | null>(null);

  // 掴む(pile)
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

  // ── 描く ───────────────────────────────────────────────────
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    const { w, h } = sizeRef.current;
    if (!cv || !w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bakeDpr = Math.min(dpr, 1.5);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, w, h);

    let budget = BAKE_BUDGET;
    let glyphBudget = GLYPH_BUDGET;
    const pileUnit = UNIT * scaleRef.current;
    const want = (paint: SolidPaint, unit: number) => {
      let bmp = peekSolidBitmap(paint, unit, bakeDpr);
      if (!bmp) {
        if (glyphBudget > 0) glyphBudget -= warmShapeGlyphs(paint, glyphBudget, unit, bakeDpr);
        if (budget > 0 && shapeGlyphsReady(paint, unit, bakeDpr)) { bmp = solidBitmap(paint, unit, bakeDpr); budget--; }
      }
      return bmp;
    };

    if (modeRef.current === "pile" && !phaseRef.current) {
      for (const p of piecesRef.current) {
        const bmp = want(p.paint, pileUnit);
        ctx.save();
        ctx.translate(p.body.position.x, p.body.position.y);
        ctx.rotate(p.body.angle);
        if (bmp) {
          ctx.drawImage(bmp.canvas, p.ox - bmp.w / 2, p.oy - bmp.h / 2, bmp.w, bmp.h);
        } else {
          ctx.rotate(-p.body.angle);
          ctx.translate(-p.body.position.x, -p.body.position.y);
          ctx.fillStyle = tagColor(p.paint.tag);
          ctx.beginPath();
          p.body.vertices.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)));
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      pendingBakeRef.current = budget === 0 || glyphBudget === 0
        || piecesRef.current.some((p) => !peekSolidBitmap(p.paint, pileUnit, bakeDpr));
    } else {
      const bakeUnit = bakeUnitRef.current;
      for (const it of itemsRef.current) {
        const cu = curRef.current.get(it.id);
        if (!cu || cu.o <= 0.01) continue;
        let bmp = want(it.paint, bakeUnit);
        let s = cu.s;
        if (!bmp) {
          const pb = peekSolidBitmap(it.paint, pileUnit, bakeDpr);
          if (pb) { bmp = pb; s = (cu.s * bakeUnit) / pileUnit; }
        }
        ctx.save();
        ctx.globalAlpha = cu.o;
        ctx.translate(cu.x, cu.y);
        ctx.rotate(cu.a);
        ctx.scale(s, s);
        if (bmp) {
          ctx.drawImage(bmp.canvas, -bmp.w / 2, -bmp.h / 2, bmp.w, bmp.h);
        } else {
          const b = shapeBounds(it.paint);
          ctx.globalAlpha = cu.o * 0.22;
          ctx.fillStyle = tagColor(it.paint.tag);
          ctx.fillRect(-((b.maxX - b.minX) * bakeUnit) / 2, -((b.maxY - b.minY) * bakeUnit) / 2,
            (b.maxX - b.minX) * bakeUnit, (b.maxY - b.minY) * bakeUnit);
        }
        ctx.restore();
      }
      pendingBakeRef.current = budget === 0 || glyphBudget === 0
        || itemsRef.current.some((it) => !peekSolidBitmap(it.paint, bakeUnit, bakeDpr));
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

  const fieldOf = useCallback(() => {
    const { h } = sizeRef.current;
    const floor = h - navHeightPx();
    return { top: MASTHEAD_H, floor, mid: (MASTHEAD_H + floor) / 2 };
  }, []);

  // ── ALIGN のレイアウト(左の円弧) ──────────────────────────
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
        x: cx + ARC_R * Math.cos(th),
        y: mid + ARC_R * Math.sin(th),
        s: (1 + FOCUS_BOOST * f) / (1 + FOCUS_BOOST),
        // ★★図形は**回さない**(第54巡にユーザー指定「半径方向に合わせるのではなく
        //   平行を保って」)。円弧に沿って回るのは**文字の側**。
        a: 0,
        o: clamp01(1.35 - Math.abs(d) / 1.6),
      });
    }
  }, [fieldOf]);

  // ── TIMELINE のレイアウト ──────────────────────────────────
  const layoutTimeline = useCallback(() => {
    const list = itemsRef.current;
    const { w } = sizeRef.current;
    const { top, floor } = fieldOf();
    const laneW = w / LANES_VISIBLE;
    const ds = daysRef.current;
    const world = worldRef.current;
    const slots = slotRef.current;
    const stack = stackRef.current;
    const lane = laneOfRef.current;
    const count = new Array(ds.length).fill(0);
    const base = floor - LANE_HEAD_H - SPACE.xl - SPACE.md;
    for (const it of list) {
      const li = it.task.dueDate ? ds.indexOf(it.task.dueDate) : -1;
      if (li < 0) {
        stack.set(it.id, 0);
        lane.set(it.id, -1);
        slots.set(it.id, {
          x: w * (0.16 + 0.68 * frac(it.id)),
          y: top + SPACE.xl + frac(`${it.id}#y`) * 96,
          s: 0.66, a: 0, o: 0.7,
        });
        continue;
      }
      const k = count[li];
      count[li] += 1;
      stack.set(it.id, k);
      lane.set(it.id, li);
      slots.set(it.id, {
        x: laneW * li + laneW / 2 - world,
        y: base - (k * LANE_PITCH + LANE_PITCH / 2),
        s: 1, a: 0, o: 1,
      });
    }
  }, [fieldOf]);

  const layoutRef = useRef(() => {});
  layoutRef.current = () => {
    if (modeRef.current === "align") layoutAlign();
    else if (modeRef.current === "timeline") layoutTimeline();
  };

  const syncFocus = useCallback(() => {
    const n = Math.max(0, Math.min(itemsRef.current.length - 1, Math.round(scrollRef.current)));
    if (n !== focusRef.current) { focusRef.current = n; setFocusIdx(n); }
  }, []);

  /** 山から右上へ抜ける弧(2次ベジエ)。 */
  const flyOut = (fr: Slot, w: number, t: number): { x: number; y: number } => {
    const p2x = w + 160, p2y = -160;
    const p1x = fr.x + (p2x - fr.x) * 0.15, p1y = fr.y - 300;
    const u = 1 - t;
    return {
      x: u * u * fr.x + 2 * u * t * p1x + t * t * p2x,
      y: u * u * fr.y + 2 * u * t * p1y + t * t * p2y,
    };
  };

  // ── 毎フレームの前進 ───────────────────────────────────────
  const advance = useCallback((): boolean => {
    const m = modeRef.current;
    const ph = phaseRef.current;
    if (m === "pile" && !ph) return false;
    let moving = false;
    const now = performance.now();
    const t = now - t0Ref.current;
    const { w, h } = sizeRef.current;
    const { mid } = fieldOf();
    const cur = curRef.current;
    const from = fromRef.current;
    const slots = slotRef.current;
    const list = itemsRef.current;

    // ALIGN … 慣性 → 最寄りへ吸着(落ち着いている間だけ)。
    if (m === "align" && !ph && !aDragRef.current) {
      const last = list.length - 1;
      if (Math.abs(scrollVRef.current) > 0.0015) {
        scrollRef.current += scrollVRef.current;
        scrollVRef.current *= SCROLL_DECAY;
        moving = true;
      } else {
        scrollVRef.current = 0;
        const n = Math.max(0, Math.min(last, Math.round(scrollRef.current)));
        const d = n - scrollRef.current;
        if (Math.abs(d) > 0.002) { scrollRef.current += d * SNAP_K; moving = true; }
        else scrollRef.current = n;
      }
      scrollRef.current = Math.max(-0.4, Math.min(last + 0.4, scrollRef.current));
      syncFocus();
    }
    // TIMELINE … 横の慣性 → レーンへ吸着。
    if (m === "timeline" && !ph && !wDragRef.current && expandedRef.current === null) {
      const laneW = w / LANES_VISIBLE;
      const max = Math.max(0, laneW * (daysRef.current.length - LANES_VISIBLE));
      if (Math.abs(worldVRef.current) > 0.4) {
        worldRef.current = Math.max(0, Math.min(max, worldRef.current + worldVRef.current));
        worldVRef.current *= WORLD_DECAY;
        moving = true;
      } else {
        worldVRef.current = 0;
        const n = Math.max(0, Math.min(max, Math.round(worldRef.current / laneW) * laneW));
        const d = n - worldRef.current;
        if (Math.abs(d) > 0.4) { worldRef.current += d * WORLD_SNAP_K; moving = true; }
        else worldRef.current = n;
      }
    }

    layoutRef.current();

    // ── 図形の居場所 ──
    if (ph === "align-in") {
      // ①山から右上へ弧を描いて順に抜ける → ②下から円弧を上がって埋まる
      const cx = ARC_APEX_X - ARC_R;
      let done = true;
      for (let i = 0; i < list.length; i += 1) {
        const it = list[i];
        const sl = slots.get(it.id); const fr = from.get(it.id);
        if (!sl || !fr) continue;
        const s2 = clamp01((t - A_T0 - stag(i)) / A_IN);
        if (s2 <= 0) {
          const s1 = clamp01((t - stag(i)) / A_OUT);
          const p = flyOut(fr, w, ease(s1));
          cur.set(it.id, { x: p.x, y: p.y, s: fr.s, a: fr.a * (1 - s1), o: 1 });
          done = false;
        } else {
          // 円弧の下の入り口から、円に沿って所定の角度まで上がる。
          const thEnd = Math.atan2(sl.y - mid, sl.x - cx);
          const th = lerp(ARC_ENTER_TH, thEnd, ease(s2));
          const r = ARC_R;
          cur.set(it.id, {
            x: cx + r * Math.cos(th), y: mid + r * Math.sin(th),
            s: lerp(sl.s * 0.7, sl.s, ease(s2)), a: 0, o: lerp(0.2, sl.o, ease(s2)),
          });
          if (s2 < 1) done = false;
        }
      }
      moving = true;
      const txtEnd = A_T0 + stag(list.length - 1) + A_IN + A_TXT;
      if (done && t > txtEnd) { phaseRef.current = null; }
    } else if (ph === "align-out") {
      // 文字は右へ、図形は左へはける。
      let done = true;
      for (let i = 0; i < list.length; i += 1) {
        const it = list[i];
        const fr = from.get(it.id);
        if (!fr) continue;
        const u = clamp01((t - stag(i)) / A_OUT);
        cur.set(it.id, { x: lerp(fr.x, -220, ease(u)), y: fr.y, s: fr.s, a: 0, o: 1 - u * 0.35 });
        if (u < 1) done = false;
      }
      moving = true;
      if (done) { phaseRef.current = null; dropAllRef.current(); modeRef.current = "pile"; setMode("pile"); itemsRef.current = []; setItems([]); }
    } else if (ph === "tl-out") {
      // ★下へ落としてから、山へ落とし直す。
      let done = true;
      for (let i = 0; i < list.length; i += 1) {
        const it = list[i];
        const fr = from.get(it.id);
        if (!fr) continue;
        const u = clamp01((t - stag(i)) / A_OUT);
        cur.set(it.id, { x: fr.x, y: lerp(fr.y, h + 200, ease(u)), s: fr.s, a: 0, o: 1 });
        if (u < 1) done = false;
      }
      const band = bandRef.current;
      if (band) band.style.setProperty("--tl", String(TL_FLAT + (1 - TL_FLAT) * (1 - clamp01(t / A_OUT))));
      moving = true;
      if (done) { phaseRef.current = null; dropAllRef.current(); modeRef.current = "pile"; setMode("pile"); itemsRef.current = []; setItems([]); }
    } else if (m === "timeline") {
      // ★★入りは指が進める … ①山が落下 → ②上から各曜日の列へ降ってくる。
      const p = tlPRef.current;
      const laneW = w / LANES_VISIBLE;
      for (const it of list) {
        const sl = slots.get(it.id); const fr = from.get(it.id);
        if (!sl || !fr) continue;
        if (p < TL_FALL) {
          const u = ease(p / TL_FALL);
          cur.set(it.id, { x: fr.x, y: lerp(fr.y, h + 200, u), s: fr.s, a: fr.a * (1 - u), o: 1 });
          moving = true;
        } else {
          const k = Math.min(stackRef.current.get(it.id) ?? 0, 4);
          const off = k * 0.05;
          const u = ease(clamp01(((p - TL_FALL) / (1 - TL_FALL) - off) / Math.max(0.05, 1 - off)));
          const li = laneOfRef.current.get(it.id) ?? -1;
          const fromX = li >= 0 ? laneW * li + laneW / 2 - worldRef.current : sl.x;
          const c = cur.get(it.id);
          const nx = u >= 1 && c ? c.x + (sl.x - c.x) * (LAG_BASE * Math.pow(LAG_DECAY, k)) : lerp(fromX, sl.x, u);
          cur.set(it.id, { x: nx, y: lerp(-200, sl.y, u), s: sl.s, a: 0, o: sl.o });
          if (u < 1 || Math.abs(sl.x - nx) > 0.4) moving = true;
        }
      }
    } else if (m === "align") {
      for (const it of list) {
        const sl = slots.get(it.id);
        if (sl) cur.set(it.id, sl);
      }
    }

    // ── DOM 側(文字・曜日の帯)を ref 越しに動かす ──
    if (m === "align") {
      const cx = ARC_APEX_X - ARC_R;
      const rows = rowRefs.current;
      for (let i = 0; i < list.length; i += 1) {
        const el = rows[i];
        if (!el) continue;
        const d = i - scrollRef.current;
        const th = d * (ROW_H / ARC_R);
        // ★★文字も**円弧に沿わせる**(第54巡にユーザー指定)。図形の円より外側の
        //   円周上に左端を置き、同じ角度だけ回す(原点は左端＝円の内側)。
        const ax = cx + (ARC_R + TEXT_GAP) * Math.cos(th);
        const ay = mid + (ARC_R + TEXT_GAP) * Math.sin(th);
        let slide = 0; let op = clamp01(1.35 - Math.abs(d) / 1.6);
        if (ph === "align-in") {
          const u = clamp01((t - A_T0 - stag(i) - A_IN) / A_TXT);
          slide = (1 - ease(u)) * (w * 0.9);
          op *= u;
        } else if (ph === "align-out") {
          const u = clamp01((t - stag(i)) / A_TXT);
          slide = ease(u) * (w * 0.9);
          op *= 1 - u;
        }
        el.style.transform = `translate(${(ax + slide).toFixed(1)}px, ${(ay - ROW_H / 2).toFixed(1)}px) rotate(${th.toFixed(3)}rad)`;
        el.style.opacity = String(op);
      }
    } else if (m === "timeline") {
      const band = bandRef.current;
      const strip = stripRef.current;
      if (band && ph !== "tl-out") band.style.setProperty("--tl", String(TL_FLAT + (1 - TL_FLAT) * ease(tlPRef.current)));
      if (strip) strip.style.transform = `translateX(${(-worldRef.current).toFixed(1)}px)`;
    }
    return moving;
  }, [fieldOf, syncFocus]);

  useEffect(() => {
    loopRef.current = () => {
      const M = matterRef.current;
      const engine = engineRef.current;
      if (!M || !engine) { runningRef.current = false; return; }

      if (!frozenRef.current) M.Engine.update(engine, 1000 / 60);
      const moving = advance();

      shardsRef.current = shardsRef.current
        .map((s) => ({ ...s, x: s.x + s.vx, y: s.y + s.vy, vy: s.vy + 0.6, life: s.life - 1000 / 60 / SHARD_MS }))
        .filter((s) => s.life > 0);

      drawRef.current();

      if (modeRef.current === "pile" && !phaseRef.current) {
        const awake = piecesRef.current.some((p) => !p.body.isSleeping);
        if (!awake && shardsRef.current.length === 0 && !pendingBakeRef.current && !grabRef.current) { runningRef.current = false; return; }
      } else if (!moving && shardsRef.current.length === 0 && !pendingBakeRef.current) {
        runningRef.current = false; return;
      }
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
    const M = matterRef.current;
    const engine = engineRef.current;
    const { w } = sizeRef.current;
    if (!M || !engine || !w) return;
    M.Composite.remove(engine.world, piecesRef.current.map((p) => p.body));
    shardsRef.current = [];
    const { keep, scale } = planPile(tasksRef.current);
    scaleRef.current = scale;
    const unit = UNIT * scale;
    const added = dropOrder(keep, new Date()).map((t, i) => makePiece(M, t, viewRef.current, w, i, unit));
    M.Composite.add(engine.world, added.map((p) => p.body));
    piecesRef.current = added;
    frozenRef.current = false;
    engine.gravity.y = 1.4;
    wake();
    drawRef.current();
  }, [wake, planPile]);
  dropAllRef.current = dropAll;

  useEffect(() => {
    viewRef.current = view;
    piecesRef.current = piecesRef.current.map((p) => ({ ...p, paint: { ...p.paint, view } }));
    wake();
    drawRef.current();
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
      draw();
      setReady(true);
    };
    setup();
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth; const h = el.offsetHeight;
      if (Math.abs(w - sizeRef.current.w) < 0.5 && Math.abs(h - sizeRef.current.h) < 0.5) return;
      sizeRef.current = { w, h };
      const M = matterRef.current; const engine = engineRef.current;
      if (M && engine) { rebuildWalls(M, engine, w, h); wake(); }
    });
    ro.observe(el);
    return () => {
      disposed = true; ro.disconnect();
      cancelAnimationFrame(rafRef.current); runningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // タスクの増減に山を合わせる。★モード中・段取り中は触らない。
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
    piecesRef.current = piecesRef.current
      .filter((p) => alive.has(p.id))
      .map((p) => {
        const t = alive.get(p.id) as Task;
        const paint = paintOf(t, viewRef.current);
        if (rescale || !sameShape(p.spec, paint.spec)) {
          const { body, ox, oy } = makeBody(M, paint, p.body.position.x, p.body.position.y, unit);
          M.Body.setAngle(body, p.body.angle);
          M.Body.setVelocity(body, p.body.velocity);
          M.Composite.remove(engine.world, p.body);
          M.Composite.add(engine.world, body);
          return { ...p, body, spec: paint.spec, paint, girth: girthOf(paint, unit), ox, oy };
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
  const buildItems = useCallback((m: Mode): Item[] => {
    const today = new Date();
    const src = m === "align"
      ? [...tasksRef.current].sort((a, b) => areaOf(b, today) - areaOf(a, today))
      : dropOrder(tasksRef.current, today);
    return src.map((t) => {
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
  }, []);

  /** いま画面に見えている場所を出発点にする(はける動きの起点)。 */
  const snapshotCur = useCallback(() => {
    fromRef.current = new Map(curRef.current);
  }, []);

  const bakeUnitFor = useCallback((list: Item[], maxH: number, maxW: number, boost: number) => {
    let mh = 1; let mw = 1;
    for (const it of list) {
      const b = shapeBounds(it.paint);
      mh = Math.max(mh, b.maxY - b.minY);
      mw = Math.max(mw, b.maxX - b.minX);
    }
    return Math.min(maxH / mh, maxW / mw) * boost;
  }, []);

  const freeze = useCallback((on: boolean) => {
    const engine = engineRef.current;
    frozenRef.current = on;
    if (engine) engine.gravity.y = on ? 0 : 1.4;
  }, []);

  const enterAlign = useCallback(() => {
    const list = buildItems("align");
    if (!list.length) return;
    bakeUnitRef.current = bakeUnitFor(list, ALIGN_MAX_H, ALIGN_MAX_W, 1);
    itemsRef.current = list; setItems(list);
    scrollRef.current = 0; scrollVRef.current = 0;
    focusRef.current = 0; setFocusIdx(0);
    slotRef.current = new Map();
    snapshot(list);
    layoutAlign();
    modeRef.current = "align"; setMode("align");
    phaseRef.current = "align-in"; t0Ref.current = performance.now();
    freeze(true); haptic(10); wake();
  }, [buildItems, bakeUnitFor, snapshot, layoutAlign, freeze, wake]);

  const enterTimeline = useCallback(() => {
    const list = buildItems("timeline");
    if (!list.length) return;
    const today = new Date();
    const ds: string[] = [];
    for (let i = 0; i < HORIZON; i += 1) { const d = new Date(today); d.setDate(today.getDate() + i); ds.push(ymd(d)); }
    daysRef.current = ds; setDays(ds);
    bakeUnitRef.current = bakeUnitFor(list, TL_MAX_H, (sizeRef.current.w / LANES_VISIBLE) * 0.72, 1);
    itemsRef.current = list; setItems(list);
    worldRef.current = 0; worldVRef.current = 0;
    expandedRef.current = null; setExpanded(null);
    slotRef.current = new Map(); stackRef.current = new Map(); laneOfRef.current = new Map();
    snapshot(list);
    layoutTimeline();
    modeRef.current = "timeline"; setMode("timeline");
    phaseRef.current = null; tlPRef.current = 0;
    freeze(true); wake();
  }, [buildItems, bakeUnitFor, snapshot, layoutTimeline, freeze, wake]);

  /** はけてから山へ落とし直す(段取りの終わりで `dropAll` が走る)。 */
  const leaveTo = useCallback((ph: Phase) => {
    snapshotCur();
    phaseRef.current = ph; t0Ref.current = performance.now();
    expandedRef.current = null; setExpanded(null);
    haptic(8); wake();
  }, [snapshotCur, wake]);

  /** 指を離したのに引き上げ切らなかった → その場で山へ戻す。 */
  const cancelTimeline = useCallback(() => {
    phaseRef.current = null; tlDragRef.current = false;
    modeRef.current = "pile"; setMode("pile");
    itemsRef.current = []; setItems([]);
    freeze(false); wake();
  }, [freeze, wake]);

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
      shardsRef.current.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
        r: piece.girth * (0.1 + Math.random() * 0.12), life: 1, fill,
      });
    }
    const M = matterRef.current;
    if (M) for (const p of piecesRef.current) M.Sleeping.set(p.body, false);
  }, []);

  const complete = (t: Task, final: ComposerData) => {
    haptic(18);
    if (modeRef.current === "pile") { burst(t.id); wake(); }
    const next: AppState = structuredClone(appState);
    const task = next.tasks.find((x) => x.id === t.id);
    if (task) { Object.assign(task, final); task.done = true; task.doneAt = new Date().toISOString(); }
    persist(next);
    setOpenId(null);
    showToast("完了しました");
  };

  /** ★口へ落とした = 完了(第54巡)。入力画面を開かずにその場で終える。 */
  const completeById = useCallback((id: string) => {
    haptic(20); burst(id);
    const next: AppState = structuredClone(appState);
    const task = next.tasks.find((x) => x.id === id);
    if (task) { task.done = true; task.doneAt = new Date().toISOString(); }
    persist(next);
    showToast("完了しました");
    wake();
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
    persist(next);
    showToast("デモのタスクを入れました");
  };

  // ── 当たり判定 ─────────────────────────────────────────────
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
    // ★曜日の帯をたたく = その日を開く/閉じる(第54巡)。
    if (modeRef.current === "timeline") {
      const band = bandRef.current?.getBoundingClientRect();
      if (band && clientY >= band.top && clientY <= band.bottom) {
        const laneW = sizeRef.current.w / LANES_VISIBLE;
        const li = Math.floor((px + worldRef.current) / laneW);
        if (li >= 0 && li < daysRef.current.length) {
          const next = expandedRef.current === li ? null : li;
          expandedRef.current = next; setExpanded(next);
          haptic(8); wake();
        }
        return;
      }
      if (expandedRef.current !== null) { expandedRef.current = null; setExpanded(null); wake(); return; }
    }
    if (modeRef.current === "pile" && !phaseRef.current) {
      const piece = pieceAt(px, py);
      if (piece) { haptic(8); setOpenId(piece.id); }
      return;
    }
    const it = itemAt(px, py);
    if (it) { haptic(8); setOpenId(it.id); }
  };

  // ── ジェスチャー ───────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    const root = rootRef.current;
    if (!wrap || !root) return;
    let g: {
      id: number; x: number; y: number; edge: boolean; axis: "" | "x" | "y";
      moved: boolean; lastX: number; lastY: number; vy: number;
    } | null = null;

    const clearGrab = () => {
      const gr = grabRef.current;
      if (gr) window.clearTimeout(gr.holdT);
      grabRef.current = null;
      setHolding(false); setHover(null);
    };

    const beginHold = () => {
      const gr = grabRef.current;
      const M = matterRef.current;
      if (!gr || !M) return;
      if (g?.moved) { grabRef.current = null; return; }   // もう払い始めている
      gr.held = true;
      M.Body.setStatic(gr.piece.body, true);
      haptic(10); setHolding(true); wake();
    };

    const down = (e: PointerEvent) => {
      if (g) return;
      if (!visibleRef.current) return;
      if (document.documentElement.hasAttribute("data-overlay")) return;
      // 押せる面(ビュー切替・デモ)の上では層のジェスチャーを始めない。
      if ((e.target as HTMLElement | null)?.closest("button")) return;
      if (dragged) dragged.current = false;
      const r = wrap.getBoundingClientRect();
      const edge = e.clientX - r.left < EDGE_PX;
      // ★山では図形を掴める(第54巡)。ただし**左端**はモードの入口なので掴まない。
      if (modeRef.current === "pile" && !phaseRef.current && !edge) {
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
      if (modeRef.current === "timeline") { wDragRef.current = false; worldVRef.current = 0; }
    };

    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x; const dy = e.clientY - g.y;
      if (!g.axis) {
        if (Math.abs(dx) < AXIS_PX && Math.abs(dy) < AXIS_PX) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (Math.hypot(dx, dy) > TAP_MOVE) { g.moved = true; if (dragged) dragged.current = true; }

      // 掴んでいる図形を運ぶ。
      // ★★**長押ししてから動かす**と図形を運び、**すぐ動かす**と空間のスワイプ
      //   (モードの出入り)になる。図形に触れただけでスワイプを塞ぐと、山が
      //   埋まっているとき TIMELINE を開けなくなる(第54巡に実機の指で発覚)。
      const gr = grabRef.current;
      if (gr) {
        if (!gr.held && g.moved) { window.clearTimeout(gr.holdT); grabRef.current = null; }
        else if (gr.held) {
          const M = matterRef.current;
          const r = wrap.getBoundingClientRect();
          if (M) M.Body.setPosition(gr.piece.body, { x: e.clientX - r.left + gr.dx, y: e.clientY - r.top + gr.dy });
          gr.vx = e.clientX - gr.lastX; gr.vy = e.clientY - gr.lastY;
          gr.lastX = e.clientX; gr.lastY = e.clientY;
          const t = targetAt(mouthRef.current, trashRef.current, e.clientX, e.clientY);
          setHover((cur) => (cur === t ? cur : t));
          wake();
          g.lastX = e.clientX; g.lastY = e.clientY;
          return;
        }
      }

      const m = modeRef.current;
      if (m === "pile" && !phaseRef.current && g.axis === "y" && dy < 0) {
        if (!tlDragRef.current) { tlDragRef.current = true; enterTimeline(); }
        tlPRef.current = clamp01(-dy / TL_SPAN);
        wake();
      } else if (m === "timeline" && tlDragRef.current && g.axis === "y") {
        tlPRef.current = clamp01(-dy / TL_SPAN);
        wake();
      } else if (m === "align" && !phaseRef.current && g.axis === "y") {
        const d = e.clientY - g.lastY;
        scrollRef.current -= d / ROW_H;
        g.vy = d; syncFocus(); wake();
      } else if (m === "timeline" && !tlDragRef.current && g.axis === "x" && expandedRef.current === null) {
        const { w } = sizeRef.current;
        const laneW = w / LANES_VISIBLE;
        const max = Math.max(0, laneW * (daysRef.current.length - LANES_VISIBLE));
        wDragRef.current = true;
        worldRef.current = Math.max(0, Math.min(max, worldRef.current - (e.clientX - g.lastX)));
        worldVRef.current = -(e.clientX - g.lastX);
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

      // 掴んでいた図形を離す。
      const gr = grabRef.current;
      if (gr) {
        const M = matterRef.current;
        window.clearTimeout(gr.holdT);
        if (gr.held && M) {
          M.Body.setStatic(gr.piece.body, false);
          const t = targetAt(mouthRef.current, trashRef.current, e.clientX, e.clientY);
          grabRef.current = null; setHolding(false); setHover(null);
          if (t) {
            fireTarget(t === "mouth" ? mouthRef.current : trashRef.current);
            if (t === "mouth") completeById(gr.piece.id);
            else { haptic(14); burst(gr.piece.id); removeRef.current(gr.piece.id); }
          } else {
            M.Body.setVelocity(gr.piece.body, { x: gr.vx * FLING, y: gr.vy * FLING });
            M.Sleeping.set(gr.piece.body, false);
          }
          wake();
          return;
        }
        clearGrab();
      }

      if (tlDragRef.current) {
        tlDragRef.current = false;
        if (tlPRef.current > 0.42) { tlPRef.current = 1; haptic(10); }
        else cancelTimeline();
        wake();
        return;
      }
      if (!d.moved) { tapAt(e.clientX, e.clientY); return; }

      if (m === "pile") {
        if (d.edge && d.axis === "x" && dx > SWIPE_PX && !phaseRef.current) enterAlign();
      } else if (m === "align" && !phaseRef.current) {
        if (d.axis === "x" && dx < -SWIPE_PX) leaveTo("align-out");
        else if (d.axis === "y") { scrollVRef.current = -(d.vy * FLICK_K) / ROW_H; wake(); }
      } else if (m === "timeline" && !phaseRef.current) {
        if (d.axis === "y" && dy > SWIPE_PX) {
          if (expandedRef.current !== null) { expandedRef.current = null; setExpanded(null); wake(); }
          else leaveTo("tl-out");
        } else if (d.axis === "x") {
          wDragRef.current = false;
          worldVRef.current = Math.max(-WORLD_FLICK, Math.min(WORLD_FLICK, worldVRef.current));
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
  }, [enterAlign, enterTimeline, leaveTo, cancelTimeline, syncFocus, wake, pieceAt, completeById, burst]);

  const today = new Date();
  const { w: sw } = sizeRef.current;
  const laneW = (sw || 390) / LANES_VISIBLE;
  const laneFs = Math.min(SWISS_XL, Math.floor((laneW * 0.92) / (3 * 0.70)));
  const layerName = mode === "align" ? "ALIGN" : mode === "timeline" ? "TIMELINE" : "GRAVITY";
  const expandedDay = expanded !== null ? days[expanded] : null;
  const expandedTasks = expandedDay ? items.filter((it) => it.task.dueDate === expandedDay) : [];
  const panelLeft = expanded !== null ? Math.max(0, laneW * expanded - worldRef.current) : 0;

  return (
    <div ref={rootRef} style={{ position: "absolute", inset: 0 }}>
      <div ref={wrapRef} style={{ position: "absolute", inset: 0, touchAction: "none" }}>
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", willChange: "transform" }} />
      </div>

      <LayerName text={layerName} right={mode === "pile" ? <ViewToggle view={view} onChange={setView} /> : undefined} />

      {/* ALIGN … 円弧に沿って回る文字。位置と角度は毎フレーム ref 越しに書く。 */}
      {mode === "align" && (
        <div className="mode-panel" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
          {items.map((it, i) => {
            const dl = daysLabel(it.task.dueDate, today);
            const focus = i === focusIdx;
            return (
              <div
                key={it.id}
                ref={(el) => { rowRefs.current[i] = el; }}
                className="mode-row" data-id={it.id}
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
                  {dl.sub && (
                    <span style={{ fontFamily: LATIN, fontWeight: 700, fontSize: TYPE.micro, letterSpacing: "0.18em", color: MUTED }}>{dl.sub}</span>
                  )}
                </div>
                <div style={{
                  fontFamily: SANS, fontWeight: focus ? 700 : 600, color: INK, marginTop: SPACE.xs,
                  fontSize: focus ? TYPE.display : TYPE.lead,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{it.task.title || "無題"}</div>
                <div style={{
                  fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: 700, letterSpacing: "0.14em",
                  color: tagColor(it.paint.tag), marginTop: SPACE.hair,
                }}>#{it.tag.toUpperCase()}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* TIMELINE … 地面に立つ巨大な曜日。たたくとその日が開く。 */}
      {mode === "timeline" && (
        <>
          <div
            ref={bandRef}
            className="tl-band"
            style={{
              position: "absolute", left: 0, right: 0, bottom: `calc(${NAV_H} + ${SPACE.xl}px)`,
              height: LANE_HEAD_H, overflow: "hidden", pointerEvents: "none", zIndex: 3,
            }}>
            <div ref={stripRef} style={{ position: "absolute", left: 0, bottom: 0, display: "flex", willChange: "transform" }}>
              {days.map((d, i) => (
                <div key={d} style={{ width: laneW, flex: "0 0 auto", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  <span style={{
                    fontFamily: LATIN, fontWeight: 800, fontSize: laneFs, lineHeight: 0.86,
                    letterSpacing: "-0.04em", whiteSpace: "nowrap", paddingBottom: SPACE.xs,
                    color: i === 0 ? RUST : gradeInk(i),
                    opacity: expanded !== null && expanded !== i ? 0.25 : 1,
                  }}>{weekdayOf(d)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ★曜日をたたくと**左端はそのまま右へ広がり**、その日の詳細が出る。 */}
          {expandedDay && (
            <div className="tl-detail open" style={{
              position: "absolute", left: panelLeft, right: 0, top: MASTHEAD_H,
              bottom: `calc(${NAV_H} + ${SPACE.xl}px + ${LANE_HEAD_H}px)`,
              background: PAPER, zIndex: 2, overflow: "hidden",
              padding: `${SPACE.xl}px ${SPACE.lg}px`,
              // ★★読むだけの面なので**指は通す**。ここで受け取ってしまうと、
              //   パネルの上から払っても層のジェスチャーへ届かず閉じられない
              //   (第54巡に実機の手順で発覚)。
              pointerEvents: "none",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.sm }}>
                <span style={{ fontFamily: LATIN, fontWeight: 800, fontSize: TYPE.display, letterSpacing: "-0.03em", color: expanded === 0 ? RUST : INK }}>
                  {weekdayOf(expandedDay)}
                </span>
                <span style={{ fontFamily: LATIN, fontWeight: 700, fontSize: TYPE.small, letterSpacing: "0.12em", color: MUTED }}>
                  {monthDayOf(expandedDay)}
                </span>
              </div>
              <div style={{ marginTop: SPACE.lg, display: "flex", flexDirection: "column", gap: SPACE.md, overflow: "hidden", maxHeight: "76%" }}>
                {expandedTasks.length === 0 && (
                  <div style={{ fontFamily: SANS, fontSize: TYPE.body, color: MUTED }}>この日には何も入っていない。</div>
                )}
                {expandedTasks.map((it) => (
                  <div key={it.id} style={{ display: "flex", alignItems: "baseline", gap: SPACE.md }}>
                    <span style={{ width: 10, height: 10, flex: "0 0 auto", background: tagColor(it.paint.tag), borderRadius: "50%", alignSelf: "center" }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: TYPE.lead, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {it.task.title || "無題"}
                      </div>
                      <div style={{ fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: 700, letterSpacing: "0.14em", color: tagColor(it.paint.tag), marginTop: SPACE.hair }}>
                        #{it.tag.toUpperCase()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* 掴んでいるあいだの口/ゴミ箱(共通部品)。 */}
      <DropTargets show={holding} hover={hover} mouthRef={mouthRef} trashRef={trashRef} />

      {mode === "pile" && !phaseRef.current && tasks.length === 0 && (
        <DemoSeedButton label="デモのタスクを入れる" onSeed={seedDemo} lifted />
      )}

      {open && (
        <TaskComposer
          key={open.id}
          data={open}
          mode="task"
          onCommit={(d) => patch(open.id, d)}
          onConfirm={(d) => complete(open, d)}
          onDelete={() => remove(open.id)}
          onClose={(d) => { patch(open.id, d); setOpenId(null); }}
        />
      )}
    </div>
  );
}

/** 手前のレーンほど濃く、先のレーンほど薄く沈める(遠近の気配)。 */
function gradeInk(i: number): string {
  const a = Math.max(0.14, 0.46 - i * 0.11);
  return `color-mix(in srgb, ${INK} ${Math.round(a * 100)}%, ${PAPER})`;
}

function primeTagMetrics() {
  if (typeof window === "undefined") return;
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 32));
  const step = () => { if (primeAdvances(allTagLabels(), allTagFaces(), 4) > 0) idle(step as never); };
  idle(step as never);
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
  return { id: t.id, body, spec: paint.spec, paint, girth: girthOf(paint, unit), ox, oy };
}

function makeBody(
  M: typeof import("matter-js"), paint: SolidPaint, x: number, y: number, unit: number,
): { body: Body; ox: number; oy: number } {
  const opts = { restitution: 0.04, friction: 0.55, frictionStatic: 0.9, frictionAir: 0.012 };
  const n = paint.spec.sides.length;
  const { w, h } = rectOf(paint.spec);
  let body: Body; let ox = 0; let oy = 0;
  if (n === 1) {
    body = M.Bodies.circle(x, y, (w * unit) / 2, opts);
  } else {
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

function rebuildWalls(M: typeof import("matter-js"), engine: Engine, w: number, h: number, withFloor = true) {
  const old = M.Composite.allBodies(engine.world).filter((b) => b.isStatic);
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
