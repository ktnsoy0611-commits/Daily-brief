"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

// ★★タスクアプリの**縦のカメラ**(第38巡)。
//
// DRIFT(浮遊層) と GRAVITY(地上) は、別々の画面ではなく **1本の縦の空間**の
// 上下。上に漂っている候補が、確定すると重さを持って真下へ落ちて積まれる —
// という中身の物語を、そのまま動きに出す。タブを押しても指で払っても、
// 起きるのは「カメラが上下する」ことだけ。
//
// ★★**CSS の 3D 変形(perspective / preserve-3d / rotateX/rotateY)は使わない。**
// このコードベースは CSS の 3D で Safari の描画崩れを5回踏んでいる
// (`components/tabs/DriftTab.tsx` の冒頭も同じ戒め)。縦の空間は
// **translateY だけ**で作る。
//
// ★指の追従で React の state を動かさない(§14 の性能の落とし穴)。ドラッグ中に
// setState すると、マウント済みの全タブが毎フレーム作り直される。ここは
// `--cam`(CSSカスタムプロパティ)を器へ直接書くだけで、再レンダーは起きない。
// タブバーの `--drag` / ダッシュボードの `--dash` と同じ手。

/** ★層の並び。**この配列の順が、そのまま上→下**。
 *  `lib/apps.ts` のタブの並びと必ず揃えること(タブバーの印とカメラが
 *  同じ向きへ動くのはこれが揃っているから)。
 *
 *  上2つ(DRIFT / GRAVITY)は**立面**、下2つ(TOP / UNDER)は見下ろしと断面。
 *  境目(1↔2)でだけ、カメラが真下を向く演出が入る(`data-plan`)。 */
export const TASK_LAYERS: TabId[] = ["tasks-drift", "tasks-gravity", "tasks-top", "tasks-under"];

export const layerIndexOf = (tab: TabId): number => {
  const i = TASK_LAYERS.indexOf(tab);
  return i < 0 ? 0 : i;
};

/**
 * ★★層と層の**あいだの空き**(画面の高さに対する割合)。
 *
 * DRIFT と GRAVITY は隣り合ったページではなく、**離れた2つの場所**
 * (上は宇宙、下は地上 — 直接そうは描かない)。間に何も無いと、どれだけ
 * 時間をかけても「切り替わった」に見えてしまう。**通り抜ける空間が実際に
 * 有ること**が、距離の表現の本体で、時間はその裏付け。
 * 1つぶんの移動量 = 画面 1 + この空き。
 */
const LAYER_GAP = 0.4;
/** 層1つぶんの移動量(画面の高さに対する%)。CSS へ `--cam-span` として渡す。 */
const CAM_SPAN = 100 * (1 + LAYER_GAP);

/** ★動く割合が小さいときは、そのぶん短く。行き先が目の前なのに `--t-cam`
 *  まるまるかけると、最後のひと押しだけが妙に遅い。下限は付ける
 *  (短すぎるとパンではなく「飛んだ」に見える)。 */
const CAM_K_MIN = 0.34;

/** 風の筋。★**少しだけ**(ユーザー指定)。読むものの前に出る飾りなので
 *  濃さは 0.2 未満。位置と濃さは固定 — 毎回ばらけると、乗り物ではなく
 *  「毎回ちがう絵」に見える。 */
const STREAKS = [
  // left = 横の位置 / w = 太さ / o = 濃さ / a〜b = 箱の中で見えている範囲(%)
  { left: 6,  w: 2, o: 0.14, a: 8,  b: 52 },
  { left: 14, w: 1, o: 0.07, a: 46, b: 92 },
  { left: 23, w: 2, o: 0.18, a: 22, b: 60 },
  { left: 31, w: 1, o: 0.09, a: 62, b: 98 },
  { left: 39, w: 2, o: 0.12, a: 4,  b: 40 },
  { left: 47, w: 1, o: 0.06, a: 36, b: 84 },
  { left: 55, w: 2, o: 0.16, a: 14, b: 46 },
  { left: 63, w: 1, o: 0.08, a: 54, b: 96 },
  { left: 71, w: 2, o: 0.13, a: 28, b: 72 },
  { left: 79, w: 1, o: 0.07, a: 68, b: 100 },
  { left: 87, w: 2, o: 0.17, a: 10, b: 44 },
  { left: 94, w: 1, o: 0.10, a: 40, b: 88 },
];

/**
 * 次の層へ送るのに要る指の移動量(**画面**の高さに対する割合)。
 * ★★層1つぶん(`CAM_SPAN`)ではなく**画面**で測ること。層のあいだに空きを
 * 作ったので、割合で見ると同じ 0.18 でも要る指の距離が 152px → 212px へ
 * 伸びていて、実機で「上下スワイプがなかなか効かない」状態になっていた。
 * 送る判断は**指の実際の移動量**の話で、世界がどれだけ広いかとは別。
 */
const SNAP_RATIO = 0.14;
/** これ以上の速さ(px/ms)で払ったら、距離が足りなくても送る。
 *  ★0.45 は「勢いよく払う」でないと届かなかった(同上)。 */
const FLICK_V = 0.28;
/** 指を止めてから離したとみなす間(ms)。惰性を残さないための足切り。 */
const FLICK_IDLE_MS = 90;
/** 縦か横かを決める距離。 */
const AXIS_PX = 8;
/** 行き止まり(いちばん上/いちばん下)の引っぱりの効き。 */
const RUBBER = 0.28;

export function TaskSpace({ tab, appActive, ...tabProps }: TabProps & { tab: TabId; appActive: boolean }) {
  const { profileButton, goTab } = tabProps;
  const rootRef = useRef<HTMLElement | null>(null);
  const camRef = useRef<HTMLDivElement | null>(null);
  const idx = layerIndexOf(tab);
  // ハンドラは window に張るので、いまの層は ref でも持つ(張り直さない)。
  const idxRef = useRef(idx);
  // ★縦へ払ったあとの tap を落とすための札。各層へ配る。
  const draggedRef = useRef(false);
  // ★いま潜っている日。地表の穴をたたくと決まる。タブから直接 UNDER へ
  //   来たときは今日にする(どこへ潜ったのか分からない状態を作らない)。
  const [diveIso, setDiveIso] = useState<string | null>(null);
  const dragRef = useRef<{
    id: number; x: number; y: number; from: number; axis: "" | "x" | "y";
    vel: number; lastY: number; lastT: number;
  } | null>(null);
  const windRef = useRef<HTMLDivElement | null>(null);
  const windTimer = useRef(0);
  // 指がもう `--cam` を書いたか(下の effect が二重に書いて時間を変えないように)。
  const byDragRef = useRef(false);
  // 直前の層。タブを押されたときに、どちら向きへ動いたかを知るのに要る。
  const prevRef = useRef(idx);

  /**
   * ★地中に居るか。**触りをコンテンツへ返す**ための合図。
   * 地中は「読むための面」で、縦の指はリストを送るもの。ここで器が
   * `touch-action: none` を握ったままだと、**その日の一覧が1行も送れない**。
   * 送れる先が無いところ(リストの上端で下へ引く等)では、そのままカメラの
   * ドラッグが効くので、上の層へ戻る道も残る。
   */
  const setUnder = useCallback((on: boolean) => {
    const cam = camRef.current;
    if (!cam) return;
    if (on === cam.hasAttribute("data-under")) return;
    if (on) cam.setAttribute("data-under", ""); else cam.removeAttribute("data-under");
  }, []);

  /** ★真下を向いているか(層2より下)。立面 → 平面のすり替えの合図。 */
  const setPlan = useCallback((on: boolean) => {
    const cam = camRef.current;
    if (!cam) return;
    if (on === cam.hasAttribute("data-plan")) return;
    if (on) cam.setAttribute("data-plan", ""); else cam.removeAttribute("data-plan");
  }, []);

  /** 層のあいだを通り抜けるあいだだけ風を流す。 */
  const blow = useCallback((dir: "down" | "up", k: number) => {
    const el = windRef.current;
    if (!el) return;
    window.clearTimeout(windTimer.current);
    // ★続けて払われたときに**必ず頭から流し直す**。属性を外しただけでは
    //   同じ animation が走り続けるので、一度消して強制的に組み直す。
    el.removeAttribute("data-blow");
    void el.offsetWidth;
    el.setAttribute("data-blow", dir);
    windTimer.current = window.setTimeout(() => el.removeAttribute("data-blow"), ms(T_CAM) * k);
  }, []);

  // タブが変わったら、カメラをその層へ落ち着かせる。
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = idx;
    idxRef.current = idx;
    const cam = camRef.current;
    if (!cam) return;
    cam.removeAttribute("data-drag");
    // ★指で動かした直後はここが書かない。書くと転がっている最中に
    //   `--cam-k`(=時間)が変わり、パンの途中で速さが飛ぶ。
    const wasDrag = byDragRef.current;
    byDragRef.current = false;
    if (wasDrag || prev === idx) return;
    cam.style.setProperty("--cam-k", String(Math.min(1, Math.abs(idx - prev))));
    cam.style.setProperty("--cam", String(idx));
    setPlan(idx === 2);
    setUnder(idx === 3);
    blow(idx > prev ? "down" : "up", 1);
  }, [idx, blow, setPlan, setUnder]);

  // タブから直接 UNDER へ来たときの行き先。
  useEffect(() => { if (idx === 3 && !diveIso) setDiveIso(todayKey()); }, [idx, diveIso]);

  useEffect(() => () => window.clearTimeout(windTimer.current), []);

  /**
   * ★地表の穴をたたいた = **その穴へ潜る**。行き先の日を控えて、カメラを
   * 地中(UNDER)へ降ろす。見下ろし → 立面の**視点の起き上がり**は
   * `data-plan` が外れることで CSS が pitch させる ― それが「穴の中へ潜って
   * 視点が立面へ戻った」の見え方になる(第40巡にユーザー指定)。
   * ★以前の「穴の場所から円を広げる `clip-path`」は廃止した。回転する層に
   *   clip を重ねるのは、このコードベースが Safari で5回踏んだ組み合わせ。
   */
  const dive = useCallback((iso: string) => {
    setDiveIso(iso);
    goTab("tasks-under");
  }, [goTab]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (dragRef.current) return;
    // ★★入力画面・録音が開いている間はカメラを掴ませない。オーバーレイは
    //   この器の**内側**に出るので、素通しにするとカレンダーやダイアルを
    //   なぞるたびに空間ごと動いてしまう(下の touchmove も道連れで、
    //   送れるはずの箱が送れなくなる)。印は入力画面が html へ立てている
    //   `[data-overlay]` をそのまま見る — 判定の出どころを増やさない。
    if (document.documentElement.hasAttribute("data-overlay")) return;
    // ★札はここで下ろす。pointerup の側で下ろすと、そのあとに来る click に
    //   間に合わない(タブバーの navDragged と同じ約束)。
    draggedRef.current = false;
    dragRef.current = {
      id: e.pointerId, x: e.clientX, y: e.clientY, from: idxRef.current, axis: "",
      vel: 0, lastY: e.clientY, lastT: performance.now(),
    };
  };

  // ★追従は window に張る。指が舞台の外へ出た瞬間に要素側の onPointerMove は
  //   呼ばれなくなり、ジェスチャーが途中で死ぬため(§7.26)。
  useEffect(() => {
    // ★指の1:1追従は**世界の側**で測る。層1つぶんは画面1つではなく
    //   `CAM_SPAN`(画面 + あいだの空き)なので、画面いっぱい引いても
    //   層1つには届かない ― それが「遠い」という手ざわりになる。
    const spanOf = () => (rootRef.current?.getBoundingClientRect().height || window.innerHeight) * (CAM_SPAN / 100);
    const last = TASK_LAYERS.length - 1;

    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      // 最初の8pxでどちらの軸かを決め、決まった軸だけを見る。
      if (!d.axis) {
        if (Math.abs(dx) < AXIS_PX && Math.abs(dy) < AXIS_PX) return;
        d.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
        // 横はこの器の仕事ではない(アプリの行き来はタブバーが持つ)。
        if (d.axis === "x") { dragRef.current = null; return; }
        camRef.current?.setAttribute("data-drag", "");
      }
      draggedRef.current = true;
      // 速さ(px/ms)を平滑化しながら持つ。
      const now = performance.now();
      const dt = Math.max(1, now - d.lastT);
      const v = (e.clientY - d.lastY) / dt;
      d.vel = d.vel * 0.4 + v * 0.6;
      d.lastY = e.clientY;
      d.lastT = now;
      // ★指を**上**へ払うと、空間が上へ流れて**下の層**が出てくる(= cam が増える)。
      const raw = d.from - dy / spanOf();
      const cam = raw < 0 ? raw * RUBBER : raw > last ? last + (raw - last) * RUBBER : raw;
      camRef.current?.style.setProperty("--cam", cam.toFixed(4));
      // 立面と見下ろしの境目(1↔2)を跨いだ瞬間に倒す/起こす。
      // ★見下ろしは TOP(cam≈2)の周りだけ。GRAVITY→TOP と TOP→UNDER の
      //   両方の境目で pitch が起きる。
      setPlan(cam > 1.5 && cam < 2.5);
    };

    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.id) return;
      dragRef.current = null;
      if (d.axis !== "y") return;
      camRef.current?.removeAttribute("data-drag");
      // 指を止めてから離したときは惰性ゼロ(最後に動いたときの速さが残り
      // 続けるのを防ぐ。声の記録のダイヤルで踏んだのと同じ罠)。
      const vel = performance.now() - d.lastT > FLICK_IDLE_MS ? 0 : d.vel;
      // ★送る判断は**画面**の高さで測る(上の SNAP_RATIO)。追従(--cam)は
      //   世界の側(spanOf)で測る。ここを取り違えると指が届かない。
      const moved = -(e.clientY - d.y) / (rootRef.current?.getBoundingClientRect().height || window.innerHeight);
      const flick = Math.abs(vel) > FLICK_V;
      let next = d.from;
      if (flick) next = d.from + (vel < 0 ? 1 : -1);
      else if (Math.abs(moved) > SNAP_RATIO) next = d.from + (moved > 0 ? 1 : -1);
      next = Math.max(0, Math.min(last, next));
      const cam = camRef.current;
      // ★残りの距離ぶんだけ時間を取る。指がもう半分連れてきているのに
      //   まるまる `--t-cam` かけると、そこから先だけが妙に遅い。
      const now = parseFloat(cam?.style.getPropertyValue("--cam") || String(d.from)) || 0;
      const k = Math.max(CAM_K_MIN, Math.min(1, Math.abs(next - now)));
      cam?.style.setProperty("--cam-k", String(k));
      // ★行き先は必ず自分で書く。タブが変わらないとき(行き止まり・戻り)は
      //   下の goTab が走らないので、ここが唯一の戻し役になる。
      cam?.style.setProperty("--cam", String(next));
      setPlan(next === 2);
      setUnder(next === 3);
      if (next !== d.from) {
        byDragRef.current = true;
        haptic(8);
        blow(next > d.from ? "down" : "up", k);
        goTab(TASK_LAYERS[next]);
      }
    };

    // ★縦へ引いている間だけ、ブラウザ側のスクロール/ゴムを止める。
    //   `touch-action: none` を器へ置く手は採れない — 祖先の touch-action は
    //   子孫にも効くので、この中で開く入力画面(カレンダー)が送れなくなる。
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
  }, [goTab, blow, setPlan, setUnder]);

  return (
    <main
      ref={rootRef}
      className="full-bleed"
      style={{ position: "relative", flex: 1, minHeight: 0, overflow: "clip" }}>

      {/* ★4層ぶんの高さを持つ縦の空間。動くのはこの器だけ。 */}
      <div
        ref={camRef}
        className="task-cam"
        onPointerDown={onPointerDown}
        style={{ position: "absolute", inset: 0, ["--cam" as string]: idx, ["--cam-span" as string]: `${CAM_SPAN}%` }}>

        <Layer at={0} face="elev">
          <DriftTab {...tabProps} appActive={appActive} dragged={draggedRef} />
        </Layer>

        {/* ★重力層も active(このアプリが表示中か)を受け取る。物理の rAF を
            「表示中かつ起きている物体があるとき」だけ回すため。 */}
        <Layer at={1} face="elev">
          {/* ★見下ろしへ向かうときは**床を開ける**。図形は重力のまま下へ
              落ちて画面から消える ― 消すのではなく、落ちて無くなる。 */}
          <GravityTab {...tabProps} appActive={appActive} dragged={draggedRef} floorOpen={idx >= 2} />
        </Layer>

        <Layer at={2} face="plan">
          <TopView tasks={tabProps.appState.tasks ?? []} onDive={dive} />
        </Layer>

        <Layer at={3} face="elev">
          <Underground
            appState={tabProps.appState}
            persist={tabProps.persist}
            iso={diveIso}
            active={idx === 3}
          />
        </Layer>
      </div>

      {/* ★層のあいだを通り抜けている間だけ流れる風。カメラには**乗らない**
          (画面に固定) ― 止まっている粒の横を自分が動いている、という
          見え方にするため。 */}
      <div ref={windRef} className="cam-wind" aria-hidden style={{ zIndex: 2 }}>
        {STREAKS.map((s) => (
          // 筋の形(縦のグラデーション)は CSS 側。ここが渡すのは**色だけ**で、
          // 濃さは筋ごとに変える。地の色は `INK` から作るので出どころは1つ。
          <div key={s.left} className="cam-streak" style={{
            left: `${s.left}%`, width: s.w,
            ["--streak" as string]: `color-mix(in srgb, ${INK} ${Math.round(s.o * 100)}%, transparent)`,
            ["--a" as string]: `${s.a}%`, ["--b" as string]: `${s.b}%`,
          }} />
        ))}
      </div>

      {/* ★アプリ名の札は**カメラに乗らない**(画面に固定)。層と一緒に流すと、
          同じ「TASK」の札が2枚すれ違って見える。層の名前は層の側が持つ。 */}
      <div style={{ position: "absolute", top: TAB_PAD_TOP, left: 16, right: 16, pointerEvents: "none", zIndex: 3 }}>
        {/* ★地中では**アプリ名を出さない**。札は `INK` で描くので黒い地に
            沈むうえ、地中が自分で持つ大きな日付とぶつかる。設定の丸だけ残す
            (白い丸なので黒地でも読める)。 */}
        <Masthead title={idx === 3 ? "" : appTitle("tasks")} corner={<span style={{ pointerEvents: "auto" }}>{profileButton}</span>} />
      </div>
    </main>
  );
}

/**
 * 縦の空間の中の1層。
 * ★★積む間隔は画面1つぶん(`100%`)ではなく **`CAM_SPAN`**。カメラの移動量と
 * 必ず同じ数から作ること — 片方だけ変えると、カメラが層の**手前や奥**で
 * 止まる(実際に踏んだ: 器を 140% 動かすのに層は 100% 間隔のままで、
 * GRAVITY が画面の 40% ぶん上へ行き、床がタブバーより 338px 高くなった)。
 */
function Layer({ at, children, face }: { at: number; children: React.ReactNode; face: "elev" | "plan" }) {
  return (
    <div
      className="task-layer"
      // ★立面(elev)か見下ろし(plan)か。境目を跨ぐと CSS 側が scaleY で
      //   すれ違わせる(`app/globals.css` の「立面 → 見下ろし のすり替え」)。
      data-elev={face === "elev" ? "" : undefined}
      data-plan-face={face === "plan" ? "" : undefined}
      style={{ position: "absolute", left: 0, right: 0, top: `${at * CAM_SPAN}%`, height: "100%" }}>
      {children}
    </div>
  );
}
