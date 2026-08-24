"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Masthead } from "@/components/common";
import { TopView } from "@/components/tasks/TopView";
import { Underground } from "@/components/tasks/Underground";
import { DriftTab } from "@/components/tabs/DriftTab";
import { GravityTab } from "@/components/tabs/GravityTab";
import { appTitle } from "@/lib/apps";
import { INK, TAB_PAD_TOP } from "@/lib/constants";
import { T_CAM, ms } from "@/lib/motion";
import { haptic, todayKey } from "@/lib/helpers";
import type { TabId, TabProps } from "@/lib/types";

// ★★タスクアプリの**カメラ**(第42巡に per-layer の2Dへ作り直し)。
//
// 4層 DRIFT(浮遊) / GRAVITY(地上) / TOP(地表を見下ろす) / UNDER(地中) を、
// **各層それぞれの translateY と scaleY** で動かす。カメラは1つの器を動かす
// のではなく、層ごとの出入りが**合わさって**視点の動きに見える、という作り。
// これにより「どちらから入り、どちらへ抜けるか」を層ごとに決められる:
//   ・GRAVITY→TOP … 穴(見下ろし)が**下から上がってくる**(カメラが下を向く)。
//   ・TOP→UNDER  … 穴が**下へ消え**、地面の断面が**上から降りてくる**
//                   (真横のカメラが地中へ潜っていく)。
//
// ★★**CSS の 3D 変形(perspective / preserve-3d / rotateX/rotateY)は使わない。**
// このコードベースは CSS の 3D で Safari の描画崩れを5回踏んでいる。視点の
// pitch(見下ろし)は **scaleY の圧縮**で錯覚として作る ― 遠くから見た地面ほど
// 縦に潰れて見える、を「地面が起き上がる/伏せる」に使う。
//
// ★指の追従で React の state を動かさない(§14)。層の transform は ref 越しに
// 直に書く。再レンダーは起きない。

/** ★層の並び。**この配列の順が、そのまま上→下**。`lib/apps.ts` と揃えること。 */
export const TASK_LAYERS: TabId[] = ["tasks-drift", "tasks-gravity", "tasks-top", "tasks-under"];

export const layerIndexOf = (tab: TabId): number => {
  const i = TASK_LAYERS.indexOf(tab);
  return i < 0 ? 0 : i;
};

/** 画面の外へ完全に逃がす縦の移動量(%)。100 より大きくして端まで隠す。 */
const OFF = 122;
/** 見下ろし/伏せの圧縮(scaleY)。小さいほど強く潰れる(＝視点が寝ている)。 */
const FS = 0.14;

/**
 * ★★層ごとの**居場所の表**。`[translateY(%), scaleY]` を4つの局面
 * (DRIFT / GRAVITY / TOP / UNDER)ぶん持つ。各層の値が**単調**になっている
 * のが要点 ― 隣り合う局面のあいだで、隠れている層が画面を横切らないため
 * (横切ると遷移中にゴミが一瞬見える)。
 *
 * ・DRIFT/GRAVITY … 立面。上下にパンするだけ(scaleY=1)。
 * ・TOP … 見下ろし。GRAVITY からは**下から**上がり、UNDER へは**下へ**抜ける。
 * ・UNDER … 地中。TOP からは**上から**降りてくる(潜っていく視点)。
 */
const SCENES: [number, number][][] = [
  // DRIFT (origin center)          drift        gravity      top          under
  [[0, 1], [-OFF, 1], [-2 * OFF, 1], [-3 * OFF, 1]],
  // GRAVITY (origin top)
  [[OFF, 1], [0, 1], [-OFF, FS], [-2 * OFF, FS]],
  // TOP (origin bottom)
  [[2 * OFF, FS], [OFF, FS], [0, 1], [OFF, FS]],
  // UNDER (origin center)
  [[-2 * OFF, 1], [-2 * OFF, 1], [-OFF, 1], [0, 1]],
];
/** 各層の圧縮の軸。立面は上端、見下ろしは下端(手前)から潰す。 */
const ORIGIN = ["50% 50%", "50% 0%", "50% 100%", "50% 50%"];

// ★★遷移を**二段に分ける**ための刻み(第41巡・ユーザー指定)。
/** 図形が落ちて画面から消えるのを待つ時間。 */
const DROP_MS = 540;
/** 二段遷移の1フェーズぶんの `--cam-k`(＝時間の割合)。 */
const PHASE_K = 0.72;
/** 動く割合が小さいときの下限(短すぎると「飛んだ」に見える)。 */
const CAM_K_MIN = 0.34;

/** 風の筋(パン中だけ流れる効果線)。 */
const STREAKS = [
  { left: 6, w: 2, o: 0.14, a: 8, b: 52 }, { left: 14, w: 1, o: 0.07, a: 46, b: 92 },
  { left: 23, w: 2, o: 0.18, a: 22, b: 60 }, { left: 31, w: 1, o: 0.09, a: 62, b: 98 },
  { left: 39, w: 2, o: 0.12, a: 4, b: 40 }, { left: 47, w: 1, o: 0.06, a: 36, b: 84 },
  { left: 55, w: 2, o: 0.16, a: 14, b: 46 }, { left: 63, w: 1, o: 0.08, a: 54, b: 96 },
  { left: 71, w: 2, o: 0.13, a: 28, b: 72 }, { left: 79, w: 1, o: 0.07, a: 68, b: 100 },
  { left: 87, w: 2, o: 0.17, a: 10, b: 44 }, { left: 94, w: 1, o: 0.10, a: 40, b: 88 },
];

/** 次の層へ送るのに要る指の移動量(画面の高さに対する割合)。 */
const SNAP_RATIO = 0.14;
/** これ以上の速さ(px/ms)で払ったら距離が足りなくても送る。 */
const FLICK_V = 0.28;
const FLICK_IDLE_MS = 90;
const AXIS_PX = 8;
/** 指1つぶんの移動で層1つ動くまでの距離(画面 + あいだの空き)の感度。 */
const SPAN_RATIO = 1.4;

export function TaskSpace({ tab, appActive, ...tabProps }: TabProps & { tab: TabId; appActive: boolean }) {
  const { profileButton, goTab } = tabProps;
  const rootRef = useRef<HTMLElement | null>(null);
  const camRef = useRef<HTMLDivElement | null>(null);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const idx = layerIndexOf(tab);
  const idxRef = useRef(idx);
  const draggedRef = useRef(false);
  const [diveIso, setDiveIso] = useState<string | null>(null);
  const [floorOpen, setFloorOpen] = useState(idx >= 2);
  const timersRef = useRef<number[]>([]);
  const dragRef = useRef<{
    id: number; x: number; y: number; from: number; axis: "" | "x" | "y";
    vel: number; lastY: number; lastT: number;
  } | null>(null);
  const windRef = useRef<HTMLDivElement | null>(null);
  const windTimer = useRef(0);
  const byDragRef = useRef(false);
  const prevRef = useRef(idx);

  /** 1層の transform を書く(ref 越し。再レンダーしない)。 */
  const setLayer = useCallback((i: number, ty: number, sy: number) => {
    const el = layerRefs.current[i];
    if (el) el.style.transform = `translateY(${ty.toFixed(2)}%) scaleY(${sy.toFixed(4)})`;
  }, []);
  /** 全層をある局面の居場所へ。CSS の transition が補間する。 */
  const applyScene = useCallback((scene: number, k = 1) => {
    camRef.current?.style.setProperty("--cam-k", String(k));
    for (let i = 0; i < 4; i += 1) setLayer(i, SCENES[i][scene][0], SCENES[i][scene][1]);
  }, [setLayer]);
  /** 連続値(ドラッグ中)。隣り合う局面を線形補間して各層を置く。 */
  const applyPos = useCallback((pos: number) => {
    const p = Math.max(0, Math.min(3, pos));
    const lo = Math.floor(p);
    const hi = Math.min(3, lo + 1);
    const f = p - lo;
    for (let i = 0; i < 4; i += 1) {
      const a = SCENES[i][lo];
      const b = SCENES[i][hi];
      setLayer(i, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
    }
  }, [setLayer]);

  /** 地中に居るか(触りをコンテンツへ返す)。 */
  const setUnder = useCallback((on: boolean) => {
    const cam = camRef.current;
    if (!cam) return;
    if (on) cam.setAttribute("data-under", ""); else cam.removeAttribute("data-under");
  }, []);

  /** 層のあいだを通り抜けるあいだだけ風を流す。 */
  const blow = useCallback((dir: "down" | "up", k: number) => {
    const el = windRef.current;
    if (!el) return;
    window.clearTimeout(windTimer.current);
    el.removeAttribute("data-blow");
    void el.offsetWidth;
    el.setAttribute("data-blow", dir);
    windTimer.current = window.setTimeout(() => el.removeAttribute("data-blow"), ms(T_CAM) * k);
  }, []);

  // ★二段遷移のスケジューラ。タブで層が変わるたびに位相を組む。
  const schedule = useCallback((from: number, to: number) => {
    const cam = camRef.current;
    if (!cam) return;
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
    const at = (t: number, fn: () => void) => timersRef.current.push(window.setTimeout(fn, t));
    const down = to > from;
    setUnder(to === 3);

    if (Math.abs(to - from) !== 1) {
      // 隣り合わない飛び(タブで一気に跳ぶ)は素直に同時。
      applyScene(to, Math.min(1, Math.abs(to - from)));
      setFloorOpen(to >= 2);
      blow(down ? "down" : "up", 1);
      return;
    }
    if (from === 1 && to === 2) {
      // GRAVITY → TOP。まず床を開けて図形を落とし切る(立面のまま)。消えてから
      //   カメラが下を向く = 穴(TOP)が下から上がってくる。
      setFloorOpen(true);
      applyScene(1, 0.01);   // その場に留める
      at(DROP_MS, () => { applyScene(2, PHASE_K); blow("down", PHASE_K); });
    } else if (from === 2 && to === 1) {
      // TOP → GRAVITY。カメラが起き上がって戻り(穴が下へ沈む)、そのあと図形が降り直す。
      applyScene(1, PHASE_K); blow("up", PHASE_K);
      at(ms(T_CAM) * PHASE_K, () => setFloorOpen(false));
    } else if (from === 2 && to === 3) {
      // TOP → UNDER。まず穴が下へ消える(TOP だけ下へ抜く)。それから地面の断面
      //   (UNDER)が上から降りてくる = 真横のカメラが潜っていく。
      cam.style.setProperty("--cam-k", String(PHASE_K));
      setLayer(2, SCENES[2][3][0], SCENES[2][3][1]);   // TOP → 下へ抜ける
      at(ms(T_CAM) * PHASE_K, () => { applyScene(3, PHASE_K); blow("down", PHASE_K); });
    } else if (from === 3 && to === 2) {
      // UNDER → TOP。まず地中が上へ抜ける(潜りから戻る)。それから穴が下から上がる。
      cam.style.setProperty("--cam-k", String(PHASE_K));
      setLayer(3, SCENES[3][2][0], SCENES[3][2][1]);   // UNDER → 上へ抜ける
      at(ms(T_CAM) * PHASE_K, () => { applyScene(2, PHASE_K); blow("up", PHASE_K); });
    } else {
      // DRIFT ↔ GRAVITY。立面どうし。ただのパン。
      applyScene(to, 1); setFloorOpen(false); blow(down ? "down" : "up", 1);
    }
  }, [applyScene, setLayer, blow, setUnder]);

  // タブが変わったら二段で落ち着かせる。
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = idx;
    idxRef.current = idx;
    const cam = camRef.current;
    if (!cam) return;
    cam.removeAttribute("data-drag");
    const wasDrag = byDragRef.current;
    byDragRef.current = false;
    if (wasDrag || prev === idx) return;
    schedule(prev, idx);
  }, [idx, schedule]);

  // 起動時の居場所(アニメーション無しで置く)。
  useLayoutEffect(() => {
    const cam = camRef.current;
    if (!cam) return;
    cam.setAttribute("data-drag", "");   // transition を一瞬止める
    applyScene(idx, 1);
    setUnder(idx === 3);
    requestAnimationFrame(() => cam.removeAttribute("data-drag"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { timersRef.current.forEach(window.clearTimeout); window.clearTimeout(windTimer.current); }, []);

  // タブから直接 UNDER へ来たときの行き先。
  useEffect(() => { if (idx === 3 && !diveIso) setDiveIso(todayKey()); }, [idx, diveIso]);

  /** ★地表の穴をたたいた = その穴へ潜る。行き先の日を控えて UNDER へ。 */
  const dive = useCallback((iso: string) => {
    setDiveIso(iso);
    goTab("tasks-under");
  }, [goTab]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (dragRef.current) return;
    // 入力画面・録音が開いている間はカメラを掴ませない(オーバーレイは内側に出る)。
    if (document.documentElement.hasAttribute("data-overlay")) return;
    draggedRef.current = false;
    dragRef.current = {
      id: e.pointerId, x: e.clientX, y: e.clientY, from: idxRef.current, axis: "",
      vel: 0, lastY: e.clientY, lastT: performance.now(),
    };
  };

  useEffect(() => {
    const spanOf = () => (rootRef.current?.getBoundingClientRect().height || window.innerHeight) * SPAN_RATIO;
    const last = TASK_LAYERS.length - 1;

    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.axis) {
        if (Math.abs(dx) < AXIS_PX && Math.abs(dy) < AXIS_PX) return;
        d.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
        if (d.axis === "x") { dragRef.current = null; return; }
        camRef.current?.setAttribute("data-drag", "");
      }
      draggedRef.current = true;
      const now = performance.now();
      const dt = Math.max(1, now - d.lastT);
      const v = (e.clientY - d.lastY) / dt;
      d.vel = d.vel * 0.4 + v * 0.6;
      d.lastY = e.clientY;
      d.lastT = now;
      // 指を上へ払うと下の層が出てくる(= pos が増える)。
      const pos = Math.max(0, Math.min(last, d.from - dy / spanOf()));
      applyPos(pos);
    };

    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.id) return;
      dragRef.current = null;
      if (d.axis !== "y") return;
      const cam = camRef.current;
      cam?.removeAttribute("data-drag");
      const vel = performance.now() - d.lastT > FLICK_IDLE_MS ? 0 : d.vel;
      const moved = -(e.clientY - d.y) / (rootRef.current?.getBoundingClientRect().height || window.innerHeight);
      const flick = Math.abs(vel) > FLICK_V;
      let next = d.from;
      if (flick) next = d.from + (vel < 0 ? 1 : -1);
      else if (Math.abs(moved) > SNAP_RATIO) next = d.from + (moved > 0 ? 1 : -1);
      next = Math.max(0, Math.min(last, next));
      // ドラッグは直接操作なので**同時**に落ち着かせる(位相分けはタブのとき)。
      const k = Math.max(CAM_K_MIN, Math.min(1, Math.abs(next - d.from) || 0.5));
      applyScene(next, k);
      setUnder(next === 3);
      setFloorOpen(next >= 2);
      if (next !== d.from) {
        byDragRef.current = true;
        haptic(8);
        blow(next > d.from ? "down" : "up", k);
        goTab(TASK_LAYERS[next]);
      }
    };

    const touchMove = (e: TouchEvent) => {
      if (dragRef.current?.axis === "y" && e.cancelable) e.preventDefault();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("touchmove", touchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("touchmove", touchMove);
    };
  }, [goTab, blow, applyPos, applyScene, setUnder]);

  const layerRef = (i: number) => (el: HTMLDivElement | null) => { layerRefs.current[i] = el; };

  return (
    <main
      ref={rootRef}
      className="full-bleed"
      style={{ position: "relative", flex: 1, minHeight: 0, overflow: "clip" }}>

      <div ref={camRef} className="task-cam" onPointerDown={onPointerDown} style={{ position: "absolute", inset: 0 }}>
        <Layer i={0} refCb={layerRef(0)}>
          <DriftTab {...tabProps} appActive={appActive} dragged={draggedRef} />
        </Layer>
        <Layer i={1} refCb={layerRef(1)}>
          <GravityTab {...tabProps} appActive={appActive} dragged={draggedRef} floorOpen={floorOpen} />
        </Layer>
        <Layer i={2} refCb={layerRef(2)}>
          <TopView tasks={tabProps.appState.tasks ?? []} onDive={dive} />
        </Layer>
        <Layer i={3} refCb={layerRef(3)}>
          <Underground appState={tabProps.appState} persist={tabProps.persist} iso={diveIso} active={idx === 3} />
        </Layer>
      </div>

      {/* 層のあいだを通り抜けている間だけ流れる風。カメラには乗らない(画面に固定)。 */}
      <div ref={windRef} className="cam-wind" aria-hidden style={{ zIndex: 2 }}>
        {STREAKS.map((s) => (
          <div key={s.left} className="cam-streak" style={{
            left: `${s.left}%`, width: s.w,
            ["--streak" as string]: `color-mix(in srgb, ${INK} ${Math.round(s.o * 100)}%, transparent)`,
            ["--a" as string]: `${s.a}%`, ["--b" as string]: `${s.b}%`,
          }} />
        ))}
      </div>

      {/* アプリ名の札は画面に固定。地中では出さない(黒地に沈むうえ大きな日付とぶつかる)。 */}
      <div style={{ position: "absolute", top: TAB_PAD_TOP, left: 16, right: 16, pointerEvents: "none", zIndex: 3 }}>
        <Masthead title={idx === 3 ? "" : appTitle("tasks")} corner={<span style={{ pointerEvents: "auto" }}>{profileButton}</span>} />
      </div>
    </main>
  );
}

/** 1層。画面いっぱいに敷き、`transform`(translateY＋scaleY)で出入りする。
 *  居場所は `TaskSpace` が ref 越しに書く(`SCENES`)。 */
function Layer({ i, refCb, children }: { i: number; refCb: (el: HTMLDivElement | null) => void; children: React.ReactNode }) {
  return (
    <div
      ref={refCb}
      className="task-layer"
      style={{ position: "absolute", inset: 0, transformOrigin: ORIGIN[i], willChange: "transform" }}>
      {children}
    </div>
  );
}
