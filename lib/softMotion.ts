"use client";

import { useEffect, useRef } from "react";
import { D_OPEN, D_SWING, K_OPEN, K_SWING, spring, springTo, settled, type Spring } from "./spring";

// ★★★**TASK の画面の「柔らかさ」の土台**（2026-10-10・第137巡。試作の「潰れる・伸びる・行き過ぎて戻る」）。
//   ばねは `lib/spring.ts` の係数（1フレーム ＝ 1/60 秒の単位）をそのまま使う。
//   ★**刻みは実時間を貯めて 60Hz の整数歩**（`STEP_MS`）―― rAF ごとに1歩だと 120Hz の iPhone で2倍速になる
//   （ホームの山で踏んだ。`docs/project_knowledge.md` §3-h）。描くのは最後の1歩のあとだけ。
//   ★動いているものが無くなったらループは止まる（見えていない画面で回り続けない）。

const STEP_MS = 1000 / 60; // ★目盛りの外（物理の刻み）
const MAX_STEPS = 4; // ★目盛りの外（1フレームで追いつく歩数の上限）

type Job = () => boolean; // 1歩進める。false で終わり。
type Paint = () => void;
const jobs = new Map<object, { step: Job; paint: Paint }>();
let raf = 0;
let last = 0;
let acc = 0;

function loop(t: number) {
  acc += Math.min(STEP_MS * MAX_STEPS, last ? t - last : STEP_MS);
  last = t;
  while (acc >= STEP_MS) {
    acc -= STEP_MS;
    for (const [key, j] of [...jobs]) if (!j.step()) { j.paint(); jobs.delete(key); }
  }
  for (const j of jobs.values()) j.paint();
  raf = jobs.size ? requestAnimationFrame(loop) : 0;
  if (!raf) { last = 0; acc = 0; }
}

/** `key` ごとに1本だけ動かす（同じ `key` で呼び直すと差し替える ―― 速さはばねが持っているので途切れない）。 */
export function animate(key: object, step: Job, paint: Paint) {
  jobs.set(key, { step, paint });
  if (!raf) raf = requestAnimationFrame(loop);
}
export const stopAnim = (key: object) => { jobs.delete(key); };

/** ばねを `to` へ。着いたら止まる。 */
export function springAnim(key: object, s: Spring, to: () => number, k: number, d: number, paint: Paint) {
  animate(key, () => { springTo(s, to(), k, d); return !settled(s, to(), 0.0005); }, paint);
}

/**
 * ★押すと横に広がって潰れ（即座）、離すと行き過ぎてぷるんと戻る（`design.md` §4 の「押下だけ非対称」と同じ考え）。
 * ★`transform` は scale だけ ―― 払う・運ぶ動きは別の要素（外側）が持つ。
 */
export function useSquish<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const sx = spring(1), sy = spring(1);
    let tx = 1, ty = 1, k = K_OPEN, d = D_OPEN;
    const paint = () => { el.style.transform = sx.p === 1 && sy.p === 1 ? "" : `scale(${sx.p.toFixed(4)},${sy.p.toFixed(4)})`; };
    const go = () => animate(sx, () => {
      springTo(sx, tx, k, d); springTo(sy, ty, k, d);
      const done = settled(sx, tx, 0.0004) && settled(sy, ty, 0.0004);
      if (done) { sx.p = tx; sy.p = ty; sx.v = sy.v = 0; }
      return !done;
    }, paint);
    const down = (e: PointerEvent) => {
      // ★中の押せるもの（丸・雲）を押したときは、それ自身が潰れる。外側まで潰さない。
      if ((e.target as HTMLElement).closest("[data-squish]") !== el) return;
      tx = 1.035; ty = 0.93; k = K_OPEN; d = D_OPEN; go();
    };
    const up = () => { if (tx === 1 && ty === 1) return; tx = 1; ty = 1; k = K_SWING; d = D_SWING; go(); };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
    return () => {
      stopAnim(sx);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", up);
    };
  }, [enabled]);
  return ref;
}

/** 視差を減らす設定のとき（漂い・揺らぎを止める）。 */
export const stillMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
