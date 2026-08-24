"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Body, Engine } from "matter-js";
import { LayerName } from "@/components/tasks/LayerName";
import { DemoSeedButton } from "@/components/tasks/TaskAddButton";
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
import { HELV, INK, MUTED, PAPER, SANS, SWISS_XL } from "@/lib/constants";
import { SPACE, TYPE } from "@/lib/tokens";
import type { AppState, TabProps, Task } from "@/lib/types";

// ★タスクタブ(GRAVITY)。確定したタスクが上から落ちてきて積み上がる。
//
// ★★第52巡: **TOP/UNDER の画面を破棄**し、タスク図形は**常に GRAVITY 空間に
// だけ在る**ようにした。別画面へ遷移するのではなく、スワイプで**この空間の物理
// 法則を一時的に変える**ことで、詳細リスト(ALIGN)とスケジュール俯瞰(TIMELINE)を
// 見せる。モードは matter.js の重力を切り、各図形を目標へ寄せる力(アトラクタ)で作る。
//   ・pile     … 既定。重力で落ちて積まれる。
//   ・align    … 画面左端から右へ払う。磁場でビシッと一列に整列し、右に詳細リスト。
//   ・timeline … 下から上へ払う。巨大な曜日が仕切りとして立ち、図形が日付レーンへ吸着。
//
// 図形の寸法がそのままタスクの中身になっている(lib/taskSize.ts):
//   塗られる面積 = 重要度(WEIGHT × 期限の倍率)。**大きさに効くのはこれだけ**
//   形          = 埋まっている側面の数(円/半円/三角/四角)
//   縦横比      = **四角だけ**題の長さで横に伸びる(他は本来の比を保つ)
//   スラブの枚数 = 残っている手順
//   色と書体    = タグ
//
// ★毎フレームのコストは物体ごとに drawImage 1回。立体の絵は lib/solidPaint.ts が
// 1枚のビットマップに焼いてキャッシュしており、物体は画面内の2D回転しかしないので
// body.angle で回すだけで厳密に正しい。matter.js は effect の中で dynamic import する。

/** 図形の1単位を何pxで描くか。 */
const UNIT = 64;
/** 物理の重さの倍率。 */
const MASS_K = 1.6;
/** 図形の合計面積を、床から上の領域のどれだけに収めるか。 */
const FILL = 0.58;
/** ★どこまで縮めてよいか。これ以上は縮めず、代わりに間引く。 */
const SCALE_MIN = 0.70;
/** 見出し(アプリ名の札 + 層の名前 + ビュー切替)が占める高さ。 */
const MASTHEAD_H = 124;
/** いちばん大きい1枚が、画面の幅・高さのどこまでを占めてよいか。 */
const FIT_W = 0.86;
const FIT_H = 0.62;
/** どこまで大きくしてよいか。 */
const SCALE_MAX = 1.6;
/** 縮尺がこれ以上変わったら山を作り直す。 */
const SCALE_EPS = 0.02;
/** 当たり判定の多角形の頂点の上限。 */
const PHYS_VERTS = 12;
/** 1フレームに焼いてよい図形の絵の枚数。 */
const BAKE_BUDGET = 1;
/** 1フレームに用意してよいグリフの枚数。 */
const GLYPH_BUDGET = 4;
/** これ未満の代表寸法(px)になる図形は山に入れない。 */
const CULL_PX = 30;

// ── モードの語彙(matter の座標系。生数字でよい ── `lib/tokens.ts` の例外2) ──
type Mode = "pile" | "align" | "timeline";
/** 左端とみなす始点の幅(px)。ここから右へ払うと ALIGN。 */
const EDGE_PX = 26;
/** モードを切り替えるのに要る払いの距離(px)。 */
const SWIPE_PX = 44;
/** タップとみなす動きの上限(px)。 */
const TAP_MOVE = 8;
/** 軸を決めるしきい(px)。 */
const AXIS_PX = 8;
/** 目標へ毎フレーム寄せる割合。 */
const ATTRACT_K = 0.18;
/** 角を 0 へ戻す割合。 */
const ANGLE_K = 0.80;
/** これ以下の距離・角度になったら「着いた」とみなす。 */
const SETTLE_PX = 0.5;
/** ALIGN … 図形が入る左の帯の幅(画面幅に対する割合の上限つき)。 */
const ALIGN_BAND_MAX = 132;
/** ALIGN … 1行の縦の間隔の上限。 */
const ALIGN_ROW_MAX = 108;
/** TIMELINE … 同時に見えるレーンの数。 */
const LANES_VISIBLE = 3;
/** TIMELINE … 何日先まで並べるか。 */
const HORIZON = 14;
/** TIMELINE … レーンの中で図形を積む縦の間隔。 */
const LANE_PITCH = 64;
/** TIMELINE … 巨大な曜日ラベルの帯の高さ。 */
const LANE_HEAD_H = 84;

/** 曜日の英字3文字(`Date.getDay()` の添字。日曜=0)。既存カレンダーと同じ綴り。 */
const WD3 = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

/** 完了したときに飛び散る破片。 */
interface Shard { x: number; y: number; vx: number; vy: number; r: number; life: number; fill: string }
const SHARD_MS = 620;

interface Piece {
  id: string;
  body: Body;
  spec: SolidSpec;
  paint: SolidPaint;
  girth: number;
  ox: number;
  oy: number;
}

/** 目標の居場所(align/timeline のとき、各図形が寄っていく先)。 */
interface Target { x: number; y: number }

const paintOf = (t: Task, view: SolidView): SolidPaint => ({
  spec: specOf(t), view, title: t.title,
  tag: resolveTag(t.tag, t.id, t.title, t.context, t.belongings, t.note),
});

const sameShape = (a: SolidSpec, b: SolidSpec) =>
  a.sides.length === b.sides.length
  && Math.abs(a.w - b.w) < 1e-6 && Math.abs(a.h - b.h) < 1e-6;

/** ★残り日数の見せ方(2026-08-24 にユーザー確定: 大きな数字＋小ラベル)。
 *  今日=TODAY / 過ぎている=OVER / 期日なし=—。 */
function daysLabel(dueDate: string | undefined, today: Date): { big: string; sub: string } {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { big: "—", sub: "" };
  const d = daysUntil(dueDate, today);
  if (d < 0) return { big: "OVER", sub: "" };
  if (d === 0) return { big: "TODAY", sub: "" };
  return { big: String(d), sub: d === 1 ? "DAY" : "DAYS" };
}

/** ★曜日の見出し(TIMELINE の仕切り)。i=0(今日)だけ TODAY。 */
function weekdayLabel(dateKey: string, i: number): string {
  if (i === 0) return "TODAY";
  const [y, m, d] = dateKey.split("-").map(Number);
  return WD3[new Date(y, m - 1, d).getDay()];
}

export function GravityTab({ appState, persist, showToast, appActive, active = true, dragged }: TabProps & {
  appActive?: boolean;
  /** この層(GRAVITY タブ)が画面に出ているか。DRIFT タブに切り替わると false に
   *  なり、ループとジェスチャーを止める(山はマウントしたまま保つ)。 */
  active?: boolean;
  dragged?: React.MutableRefObject<boolean>;
}) {
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

  // ── モード ──
  const [mode, setMode] = useState<Mode>("pile");
  const modeRef = useRef<Mode>("pile");
  const targetsRef = useRef<Map<string, Target>>(new Map());
  /** 描くときの1単位(px)。align/timeline では小さくして収める。 */
  const drawUnitRef = useRef(0);
  /** align の並び(id の順)と行の刻み。DOM の詳細リストと共有する。 */
  const [alignRows, setAlignRows] = useState<{ ids: string[]; top: number; pitch: number }>({ ids: [], top: 0, pitch: 0 });
  /** timeline の横スクロール量(px)。ドラッグ中は ref だけ動かす(再レンダーしない)。 */
  const worldRef = useRef(0);
  const laneWrapRef = useRef<HTMLDivElement | null>(null);
  const [lanes, setLanes] = useState<string[]>([]);

  const dropAllRef = useRef<() => void>(() => {});
  const scaleRef = useRef(1);

  const tasks = useMemo(() => (appState.tasks ?? []).filter((t) => !t.done), [appState.tasks]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const open = (appState.tasks ?? []).find((t) => t.id === openId) ?? null;
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

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
    const unit = drawUnitRef.current || pileUnit;
    // 立体の絵は焼いた unit を鍵にキャッシュされる。align/timeline で unit を
    // 縮めると、その unit のぶんだけ焼き直される(ズレは1〜2フレームの塗りで隠れる)。
    const r = unit / pileUnit;   // ox/oy(重心のズレ)は pileUnit で測ってあるので比で戻す。
    for (const p of piecesRef.current) {
      let bmp = peekSolidBitmap(p.paint, unit, bakeDpr);
      if (!bmp) {
        if (glyphBudget > 0) glyphBudget -= warmShapeGlyphs(p.paint, glyphBudget, unit, bakeDpr);
        if (budget > 0 && shapeGlyphsReady(p.paint, unit, bakeDpr)) { bmp = solidBitmap(p.paint, unit, bakeDpr); budget--; }
      }
      ctx.save();
      ctx.translate(p.body.position.x, p.body.position.y);
      ctx.rotate(p.body.angle);
      if (bmp) {
        ctx.drawImage(bmp.canvas, p.ox * r - bmp.w / 2, p.oy * r - bmp.h / 2, bmp.w, bmp.h);
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
      || piecesRef.current.some((p) => !peekSolidBitmap(p.paint, unit, bakeDpr));
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

  // ★align/timeline のとき、各図形を目標へ寄せる。まだ動いていれば true。
  const attract = useCallback((): boolean => {
    const M = matterRef.current;
    if (!M) return false;
    const targets = targetsRef.current;
    let moving = false;
    for (const p of piecesRef.current) {
      const t = targets.get(p.id);
      if (!t) continue;
      const dx = t.x - p.body.position.x;
      const dy = t.y - p.body.position.y;
      if (Math.abs(dx) > SETTLE_PX || Math.abs(dy) > SETTLE_PX || Math.abs(p.body.angle) > 0.01) moving = true;
      M.Body.setPosition(p.body, { x: p.body.position.x + dx * ATTRACT_K, y: p.body.position.y + dy * ATTRACT_K });
      M.Body.setAngle(p.body, p.body.angle * ANGLE_K);
      M.Body.setVelocity(p.body, { x: 0, y: 0 });
    }
    return moving;
  }, []);

  useEffect(() => {
    loopRef.current = () => {
      const M = matterRef.current;
      const engine = engineRef.current;
      if (!M || !engine) { runningRef.current = false; return; }

      let moving = false;
      if (modeRef.current === "pile") {
        M.Engine.update(engine, 1000 / 60);
      } else {
        moving = attract();
        M.Engine.update(engine, 1000 / 60);
      }

      shardsRef.current = shardsRef.current
        .map((s) => ({ ...s, x: s.x + s.vx, y: s.y + s.vy, vy: s.vy + 0.6, life: s.life - 1000 / 60 / SHARD_MS }))
        .filter((s) => s.life > 0);

      drawRef.current();

      if (modeRef.current === "pile") {
        const awake = piecesRef.current.some((p) => !p.body.isSleeping);
        if (!awake && shardsRef.current.length === 0 && !pendingBakeRef.current) { runningRef.current = false; return; }
      } else if (!moving && shardsRef.current.length === 0 && !pendingBakeRef.current) {
        runningRef.current = false; return;
      }
      rafRef.current = requestAnimationFrame(() => loopRef.current());
    };
  }, [attract]);

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
    else {
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
    }
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
    const added = dropOrder(keep, new Date())
      .map((t, i) => makePiece(M, t, viewRef.current, w, i, unit));
    M.Composite.add(engine.world, added.map((p) => p.body));
    piecesRef.current = added;
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
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (Math.abs(w - sizeRef.current.w) < 0.5 && Math.abs(h - sizeRef.current.h) < 0.5) return;
      sizeRef.current = { w, h };
      const M = matterRef.current;
      const engine = engineRef.current;
      if (M && engine) { rebuildWalls(M, engine, w, h); wake(); }
    });
    ro.observe(el);
    return () => {
      disposed = true;
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // タスクの増減・中身の変化に物理の世界を合わせる。★モード中は触らない
  // (align/timeline は一時的な見え方で、山の顔ぶれは pile に戻ってから直す)。
  useEffect(() => {
    if (modeRef.current !== "pile") return;
    const M = matterRef.current;
    const engine = engineRef.current;
    const { w } = sizeRef.current;
    if (!M || !engine || !w) return;

    const { keep, scale } = planPile(tasks);
    const keepIds = new Set(keep.map((t) => t.id));
    const shownIds = new Set(piecesRef.current.map((p) => p.id));
    const aliveIds = new Set(tasks.map((t) => t.id));
    const pushedOut = [...shownIds].some((id) => !keepIds.has(id) && aliveIds.has(id));
    if (piecesRef.current.length && pushedOut) {
      dropAll();
      return;
    }
    const rescale = piecesRef.current.length > 0 && Math.abs(scale - scaleRef.current) > SCALE_EPS;
    scaleRef.current = scale;
    const unit = UNIT * scale;
    const alive = new Map(keep.map((t) => [t.id, t]));

    for (const p of piecesRef.current) {
      if (!alive.has(p.id)) M.Composite.remove(engine.world, p.body);
    }

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
    const added = dropOrder(keep, new Date())
      .filter((t) => !have.has(t.id))
      .map((t, i) => makePiece(M, t, viewRef.current, w, i, unit));
    if (added.length) {
      M.Composite.add(engine.world, added.map((p) => p.body));
      piecesRef.current = [...piecesRef.current, ...added];
    }
    wake();
  }, [tasks, wake, ready, planPile, dropAll]);

  // ── モードの出入り ──────────────────────────────────────────
  /** 図形をぶつからない素通し(sensor)にして、重力を切る/戻す。 */
  const setPhysicsForMode = useCallback((m: Mode) => {
    const M = matterRef.current;
    const engine = engineRef.current;
    if (!M || !engine) return;
    const flat = m !== "pile";
    engine.gravity.y = flat ? 0 : 1.4;
    engine.enableSleeping = !flat;   // 寄せている間は寝かせない
    for (const p of piecesRef.current) {
      M.Body.set(p.body, "isSensor", flat);   // align/timeline は当たり判定を切って自由に運ぶ
      M.Sleeping.set(p.body, false);
    }
  }, []);

  /** ALIGN … 面積の降順に左の帯へ一列。行の刻みと並びを DOM と共有する。 */
  const enterAlign = useCallback(() => {
    const { w, h } = sizeRef.current;
    const order = [...piecesRef.current].sort((a, b) => b.spec.area - a.spec.area);
    const n = order.length;
    if (!n) return;
    const top = MASTHEAD_H + SPACE.lg;
    const bottom = h - navHeightPx() - SPACE.lg;
    const pitch = Math.min(ALIGN_ROW_MAX, (bottom - top) / n);
    const band = Math.min(ALIGN_BAND_MAX, w * 0.36);
    // 帯にいちばん背の高い図形が収まるよう、描く単位を決める(全図形同じ比で縮む
    // ので、面積の大小＝見た目の大小は保たれる)。
    const pileUnit = UNIT * scaleRef.current;
    const maxNatH = Math.max(...order.map((p) => (shapeBounds(p.paint).maxY - shapeBounds(p.paint).minY) * pileUnit));
    // 図形は行の高さより一回り小さく描いて、隣の行と重ならないようにする。
    const fit = Math.min(1, (pitch * 0.56) / (maxNatH || 1), (band * 0.62) / (maxNatH || 1));
    drawUnitRef.current = pileUnit * fit;
    // ★body の**重心**を目標へ置くと、半円や三角のように重心と絵の中心がずれる形は
    //   スロットから上下にずれて見える。絵の中心(重心＋ox/oy×比)がスロットに来るよう
    //   目標から差し引く。
    const targets = new Map<string, Target>();
    order.forEach((p, i) => targets.set(p.id, { x: band / 2 - p.ox * fit, y: top + pitch * i + pitch / 2 - p.oy * fit }));
    targetsRef.current = targets;
    setAlignRows({ ids: order.map((p) => p.id), top, pitch });
    modeRef.current = "align";
    setMode("align");
    setPhysicsForMode("align");
    haptic(10);
    wake();
  }, [setPhysicsForMode, wake]);

  /** TIMELINE の目標を(横スクロール量 world を反映して)組み直す。 */
  const layoutTimeline = useCallback(() => {
    const { w, h } = sizeRef.current;
    const laneW = w / LANES_VISIBLE;
    const today = new Date();
    const days: string[] = [];
    for (let i = 0; i < HORIZON; i += 1) {
      const d = new Date(today); d.setDate(today.getDate() + i); days.push(ymd(d));
    }
    const laneTop = MASTHEAD_H + SPACE.md + LANE_HEAD_H + SPACE.xl;   // 曜日ラベルの帯より下へ
    const world = worldRef.current;
    // ★TIMELINE は body の**重心**をそのままスロットへ置く(ALIGN のような絵の中心
    //   補正はしない ― レーンの図形は大きめで、補正すると帯の外へ飛ぶことがある)。
    const count = new Array(HORIZON).fill(0);
    const targets = new Map<string, Target>();
    for (const p of piecesRef.current) {
      const t = taskById.get(p.id);
      const li = t?.dueDate ? days.indexOf(t.dueDate) : -1;
      if (li < 0) { targets.set(p.id, { x: w / 2, y: h + 240 }); continue; } // 期日なし/過去/範囲外は画面下へ退避
      const k = count[li]; count[li] += 1;
      targets.set(p.id, { x: laneW * li + laneW / 2 - world, y: laneTop + k * LANE_PITCH + LANE_PITCH / 2 });
    }
    targetsRef.current = targets;
    return days;
  }, [taskById]);

  /** TIMELINE … 巨大な曜日が立ち上がり、図形が日付レーンへ吸着。 */
  const enterTimeline = useCallback(() => {
    if (!piecesRef.current.length) return;
    worldRef.current = 0;
    // 図形は一律で小さく(レーンに複数積むため)。いちばん背の高い図形が LANE_PITCH に
    // 収まるよう縮める(ALIGN と同じ理屈。面積の大小＝見た目の大小は保たれる)。
    const pileUnit = UNIT * scaleRef.current;
    const laneW = (sizeRef.current.w || 390) / LANES_VISIBLE;
    const maxNatH = Math.max(1, ...piecesRef.current.map((p) => (shapeBounds(p.paint).maxY - shapeBounds(p.paint).minY) * pileUnit));
    const fit = Math.min(1, (LANE_PITCH * 0.82) / maxNatH, (laneW * 0.66) / maxNatH);
    drawUnitRef.current = pileUnit * fit;
    const days = layoutTimeline();
    setLanes(days);
    if (laneWrapRef.current) laneWrapRef.current.style.transform = "translateX(0px)";
    modeRef.current = "timeline";
    setMode("timeline");
    setPhysicsForMode("timeline");
    haptic(10);
    wake();
  }, [layoutTimeline, setPhysicsForMode, wake]);

  /** pile へ戻す … 磁場が解け、図形が重力で山へドサドサ落ちる。
   *  ★整列/レーンで一律に縮めて描いていたので、その場から落とすと本来の大きな
   *  当たり判定どうしが重なって弾け飛ぶ。上から降らせ直す `dropAll` の方が安全で、
   *  「元の乱雑な山に戻る」という筋にも合う。 */
  const enterPile = useCallback(() => {
    targetsRef.current = new Map();
    drawUnitRef.current = 0;
    modeRef.current = "pile";
    setMode("pile");
    setPhysicsForMode("pile");   // 重力と sleeping を戻す
    haptic(8);
    dropAllRef.current();        // 上から降らせ直す
  }, [setPhysicsForMode]);

  const patch = (id: string, p: Partial<ComposerData>) => {
    const next: AppState = structuredClone(appState);
    const t = next.tasks.find((x) => x.id === id);
    if (t) Object.assign(t, p);
    persist(next);
  };

  const complete = (t: Task, final: ComposerData) => {
    haptic(18);
    const piece = piecesRef.current.find((p) => p.id === t.id);
    if (piece) {
      const { x, y } = piece.body.position;
      const fill = tagColor(t.tag);
      for (let i = 0; i < 14; i++) {
        const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
        const sp = 2 + Math.random() * 4;
        shardsRef.current.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
          r: piece.girth * (0.1 + Math.random() * 0.12),
          life: 1, fill,
        });
      }
      const M = matterRef.current;
      if (M) for (const p of piecesRef.current) M.Sleeping.set(p.body, false);
      wake();
    }
    const next: AppState = structuredClone(appState);
    const task = next.tasks.find((x) => x.id === t.id);
    if (task) { Object.assign(task, final); task.done = true; task.doneAt = new Date().toISOString(); }
    persist(next);
    setOpenId(null);
    showToast("完了しました");
  };

  const remove = (id: string) => {
    setOpenId(null);
    const next: AppState = structuredClone(appState);
    next.tasks = next.tasks.filter((x) => x.id !== id);
    persist(next);
  };

  /** ★別の日のレーンへドラッグして離す = 期日を書き換える(リスケジュール)。
   *  骨組みではフックだけ用意し、ドラッグの詰めは段階的に。 */
  const reschedule = useCallback((id: string, dateKey: string) => {
    const next: AppState = structuredClone(appState);
    const t = next.tasks.find((x) => x.id === id);
    if (t && t.dueDate !== dateKey) { t.dueDate = dateKey; persist(next); showToast(`${dateKey} へ移しました`); }
  }, [appState, persist, showToast]);
  void reschedule;   // TIMELINE のドラッグ実装で使う(段階的)。

  const seedDemo = () => {
    const next: AppState = structuredClone(appState);
    next.tasks = [...demoTasks(), ...(next.tasks ?? [])];
    persist(next);
    showToast("デモのタスクを入れました");
  };

  // 図形をタップして開く(どのモードでも効く)。
  const tapAt = (clientX: number, clientY: number) => {
    if (dragged?.current) return;
    const M = matterRef.current;
    const cv = canvasRef.current;
    if (!M || !cv) return;
    const r = cv.getBoundingClientRect();
    const pt = { x: clientX - r.left, y: clientY - r.top };
    const hits = M.Query.point(piecesRef.current.map((p) => p.body), pt);
    if (!hits.length) return;
    const piece = piecesRef.current.find((p) => p.body === hits[hits.length - 1]);
    if (piece) { haptic(8); setOpenId(piece.id); }
  };

  // ── ジェスチャー(左端→右=ALIGN / 下→上=TIMELINE / 逆で pile / TIMELINEは横スクロール) ──
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let g: { id: number; x: number; y: number; edge: boolean; axis: "" | "x" | "y"; moved: boolean; lastX: number } | null = null;

    const down = (e: PointerEvent) => {
      if (g) return;
      if (!visibleRef.current) return;   // DRIFT タブが上にいる間は拾わない
      if (document.documentElement.hasAttribute("data-overlay")) return;
      if (dragged) dragged.current = false;
      const left = wrap.getBoundingClientRect().left;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, edge: e.clientX - left < EDGE_PX, axis: "", moved: false, lastX: e.clientX };
    };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.axis) {
        if (Math.abs(dx) < AXIS_PX && Math.abs(dy) < AXIS_PX) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (Math.hypot(dx, dy) > TAP_MOVE) { g.moved = true; if (dragged) dragged.current = true; }
      // TIMELINE の横スクロール … 目標とラベルの帯を指に追わせる(再レンダーしない)。
      if (modeRef.current === "timeline" && g.axis === "x") {
        const { w } = sizeRef.current;
        const laneW = w / LANES_VISIBLE;
        const max = Math.max(0, laneW * (HORIZON - LANES_VISIBLE));
        worldRef.current = Math.max(0, Math.min(max, worldRef.current - (e.clientX - g.lastX)));
        g.lastX = e.clientX;
        layoutTimeline();
        if (laneWrapRef.current) laneWrapRef.current.style.transform = `translateX(${-worldRef.current}px)`;
        wake();
      }
    };
    const up = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const d = g; g = null;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved) { tapAt(e.clientX, e.clientY); return; }
      const m = modeRef.current;
      if (m === "pile") {
        if (d.edge && d.axis === "x" && dx > SWIPE_PX) enterAlign();
        else if (d.axis === "y" && dy < -SWIPE_PX) enterTimeline();
      } else if (m === "align") {
        if (d.axis === "x" && dx < -SWIPE_PX) enterPile();
      } else if (m === "timeline") {
        if (d.axis === "y" && dy > SWIPE_PX) enterPile();
        else if (d.axis === "x") {
          // レーンの頭に吸着(横スクロールを1レーン単位で丸める)。
          const { w } = sizeRef.current;
          const laneW = w / LANES_VISIBLE;
          const max = Math.max(0, laneW * (HORIZON - LANES_VISIBLE));
          worldRef.current = Math.max(0, Math.min(max, Math.round(worldRef.current / laneW) * laneW));
          layoutTimeline();
          if (laneWrapRef.current) laneWrapRef.current.style.transform = `translateX(${-worldRef.current}px)`;
          wake();
        }
      }
    };

    wrap.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      wrap.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enterAlign, enterTimeline, enterPile, layoutTimeline, wake]);

  const today = new Date();
  const { w: sw } = sizeRef.current;
  const alignBand = Math.min(ALIGN_BAND_MAX, (sw || 390) * 0.36);
  const laneW = (sw || 390) / LANES_VISIBLE;
  // 曜日ラベルは全レーン同じ大きさ。いちばん幅を食う "TODAY"(5文字)がレーンに
  // 収まる大きさに揃える(巨大だが3レーン見える)。
  const laneFs = Math.min(SWISS_XL, Math.floor((laneW * 0.9) / (5 * 0.56)));

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div ref={wrapRef} style={{ position: "absolute", inset: 0, touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", willChange: "transform" }}
        />
      </div>

      <LayerName text="GRAVITY" right={mode === "pile" ? <ViewToggle view={view} onChange={setView} /> : undefined} />

      {/* ALIGN … 図形の右に、残り日数を特大にした詳細リスト。 */}
      {mode === "align" && (
        <div className="mode-panel" aria-hidden={false} style={{
          position: "absolute", left: alignBand + SPACE.md, right: SPACE.lg, top: alignRows.top, bottom: 0,
          pointerEvents: "none",
        }}>
          {alignRows.ids.map((id, i) => {
            const t = taskById.get(id);
            if (!t) return null;
            const dl = daysLabel(t.dueDate, today);
            const tag = resolveTag(t.tag, t.id, t.title, t.context, t.belongings, t.note);
            return (
              <div key={id} className="mode-row" data-id={id} style={{
                position: "absolute", top: alignRows.pitch * i, left: 0, right: 0, height: alignRows.pitch,
                display: "flex", alignItems: "center", gap: SPACE.md,
                ["--i" as string]: String(i),
              }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
                  <span style={{ fontFamily: HELV, fontWeight: 800, fontSize: dl.big.length > 3 ? TYPE.head : SWISS_XL, lineHeight: 0.9, color: INK, letterSpacing: "-0.02em" }}>{dl.big}</span>
                  {dl.sub && <span style={{ fontFamily: HELV, fontWeight: 700, fontSize: TYPE.micro, letterSpacing: "0.18em", color: MUTED, marginTop: 2 }}>{dl.sub}</span>}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: SANS, fontSize: TYPE.lead, fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title || "無題"}</div>
                  <div style={{ fontFamily: HELV, fontSize: TYPE.micro, fontWeight: 700, letterSpacing: "0.14em", color: tagColor(tag), marginTop: SPACE.xs }}>#{tag.toUpperCase()}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TIMELINE … 巨大な曜日ラベルの帯(下から立ち上がり、横スクロールで指に追う)。 */}
      {mode === "timeline" && (
        <div className="mode-lanes" style={{ position: "absolute", left: 0, right: 0, top: MASTHEAD_H + SPACE.md, height: LANE_HEAD_H, overflow: "hidden", pointerEvents: "none" }}>
          <div ref={laneWrapRef} style={{ position: "absolute", left: 0, top: 0, height: "100%", display: "flex", willChange: "transform" }}>
            {lanes.map((d, i) => (
              <div key={d} style={{ width: laneW, flex: "0 0 auto", display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden" }}>
                <span style={{
                  fontFamily: HELV, fontWeight: 800, fontSize: laneFs, lineHeight: 0.82,
                  letterSpacing: "-0.03em", color: i === 0 ? INK : BD_LINE(i), whiteSpace: "nowrap",
                }}>{weekdayLabel(d, i)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === "pile" && tasks.length === 0 && <DemoSeedButton label="デモのタスクを入れる" onSeed={seedDemo} lifted />}

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

/** 手前のレーンほど濃く。奥のレーンは薄いグレーで沈める(遠近の気配)。 */
function BD_LINE(i: number): string {
  const a = Math.max(0.16, 0.5 - i * 0.12);
  return `color-mix(in srgb, ${INK} ${Math.round(a * 100)}%, ${PAPER})`;
}

function primeTagMetrics() {
  if (typeof window === "undefined") return;
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 32));
  const step = () => {
    if (primeAdvances(allTagLabels(), allTagFaces(), 4) > 0) idle(step as never);
  };
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
  let body: Body;
  let ox = 0;
  let oy = 0;
  if (n === 1) {
    body = M.Bodies.circle(x, y, (w * unit) / 2, opts);
  } else {
    const src = sectionOutline(n);
    const step = Math.max(1, Math.ceil(src.length / PHYS_VERTS));
    const verts = src
      .filter((_, k) => k % step === 0)
      .map((q) => ({ x: q.x * w * unit, y: q.y * h * unit }));
    body = M.Bodies.fromVertices(x, y, [verts], opts);
    const c = M.Vertices.centre(verts);
    ox = -c.x;
    oy = -c.y;
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
  const sorted = [...tasks]
    .map((t) => ({ t, area: areaOf(t, today) }))
    .sort((a, b) => b.area - a.area);
  const budget = ((w * usableH) / (UNIT * UNIT)) * FILL;
  const scaleFor = (total: number) => Math.min(SCALE_MAX, Math.sqrt(budget / total));

  let total = 0;
  let n = 0;
  for (const row of sorted) {
    const next = total + row.area;
    const scale = scaleFor(next);
    if (n > 0 && (scale < SCALE_MIN || Math.sqrt(row.area) * UNIT * scale < CULL_PX)) break;
    total = next;
    n++;
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

function navHeightPx(): number {
  if (typeof window === "undefined") return 96;
  const shell = document.querySelector("[data-app-shell]") ?? document.documentElement;
  const v = getComputedStyle(shell).getPropertyValue("--nav-h").trim();
  if (!v) return 96;
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;height:${v}`;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px || 96;
}

function frac(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (Math.imul(h, 2654435761) >>> 0) / 4294967296;
}
