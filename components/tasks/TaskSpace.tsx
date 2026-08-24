"use client";

import { useEffect, useRef } from "react";
import { Masthead } from "@/components/common";
import { DriftTab } from "@/components/tabs/DriftTab";
import { GravityTab } from "@/components/tabs/GravityTab";
import { appTitle } from "@/lib/apps";
import { TAB_PAD_TOP } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
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
 *  第2段階でここへ `tasks-top` / `tasks-under` が続く。 */
export const TASK_LAYERS: TabId[] = ["tasks-drift", "tasks-gravity"];

export const layerIndexOf = (tab: TabId): number => {
  const i = TASK_LAYERS.indexOf(tab);
  return i < 0 ? 0 : i;
};

/** 次の層へ送るのに要る、画面の高さに対する割合。 */
const SNAP_RATIO = 0.18;
/** これ以上の速さ(px/ms)で払ったら、距離が足りなくても送る。 */
const FLICK_V = 0.45;
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
  const dragRef = useRef<{
    id: number; x: number; y: number; from: number; axis: "" | "x" | "y";
    vel: number; lastY: number; lastT: number;
  } | null>(null);

  // タブが変わったら、カメラをその層へ落ち着かせる。
  useEffect(() => {
    idxRef.current = idx;
    const cam = camRef.current;
    if (!cam) return;
    cam.removeAttribute("data-drag");
    cam.style.setProperty("--cam", String(idx));
  }, [idx]);

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
    const heightOf = () => rootRef.current?.getBoundingClientRect().height || window.innerHeight;
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
      const raw = d.from - dy / heightOf();
      const cam = raw < 0 ? raw * RUBBER : raw > last ? last + (raw - last) * RUBBER : raw;
      camRef.current?.style.setProperty("--cam", cam.toFixed(4));
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
      const moved = -(e.clientY - d.y) / heightOf();
      const flick = Math.abs(vel) > FLICK_V;
      let next = d.from;
      if (flick) next = d.from + (vel < 0 ? 1 : -1);
      else if (Math.abs(moved) > SNAP_RATIO) next = d.from + (moved > 0 ? 1 : -1);
      next = Math.max(0, Math.min(last, next));
      // ★行き先は必ず自分で書く。タブが変わらないとき(行き止まり・戻り)は
      //   下の goTab が走らないので、ここが唯一の戻し役になる。
      camRef.current?.style.setProperty("--cam", String(next));
      if (next !== d.from) { haptic(8); goTab(TASK_LAYERS[next]); }
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
  }, [goTab]);

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
        style={{ position: "absolute", inset: 0, ["--cam" as string]: idx }}>

        <Layer at={0}>
          <DriftTab {...tabProps} appActive={appActive} dragged={draggedRef} />
        </Layer>

        {/* ★重力層も active(このアプリが表示中か)を受け取る。物理の rAF を
            「表示中かつ起きている物体があるとき」だけ回すため。 */}
        <Layer at={1}>
          <GravityTab {...tabProps} appActive={appActive} dragged={draggedRef} />
        </Layer>
      </div>

      {/* ★アプリ名の札は**カメラに乗らない**(画面に固定)。層と一緒に流すと、
          同じ「TASK」の札が2枚すれ違って見える。層の名前は層の側が持つ。 */}
      <div style={{ position: "absolute", top: TAB_PAD_TOP, left: 16, right: 16, pointerEvents: "none", zIndex: 3 }}>
        <Masthead title={appTitle("tasks")} corner={<span style={{ pointerEvents: "auto" }}>{profileButton}</span>} />
      </div>
    </main>
  );
}

/** 縦の空間の中の1層。上から順に画面1つぶんずつ積む。 */
function Layer({ at, children }: { at: number; children: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: `${at * 100}%`, height: "100%" }}>
      {children}
    </div>
  );
}
