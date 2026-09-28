"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {
  makeRail, pieceY, railDrag, railHold, railIndex, railLayout, railPieceAt, railRelease, railStep, RAIL_STEP_MS,
} from "@/lib/moduleRail";

// ★★★**モジュール送りの器**（2026-09-28・第134巡）。算数は `lib/moduleRail.ts`。ここは器・指・ループだけ。
// ★1枚ずつを `position: absolute` に置き、`translate3d` だけで動かす（レイアウトを起こさない）。
// ★★縦の送りは**この器が自分でやる**（ネイティブのスクロールを使わない ―― 連鎖のバネが要るため）。
//   `touch-action: pan-x` なので横のネイティブのスクロール（棚など）はそのまま効く。
// ★★指の取り合い … 遊び `SLOP` を越えて**縦が勝ったときだけ**奪う（`setPointerCapture`）。横が勝ったら
//   中の部品（札の束など）へ譲る。★`data-rail-lock` の中で始まった指は見ない（録音機の円など）。
// ★★ループは**固定の刻み**（`RAIL_STEP_MS`）で回し、止まったら止める（120Hz の実機で2倍速にしない）。
// ★目盛りの外（指の遊び）。

const SLOP = 8;
/** 1フレームに進める刻みの上限（画面を離れて戻ったときに貯まった時間で飛ばない）。 */
const MAX_STEPS = 4;
/** 離した瞬間の速さを測る窓（ms）。 */
const VEL_WINDOW = 90;

export interface RailPiece {
  key: string;
  node: ReactNode;
}

export function ModuleRail({ pieces, gap, padX = 0, endPad = 0, onIndex, style }: {
  pieces: RailPiece[];
  /** 1枚と1枚のあいだ（px）。 */
  gap: number;
  /** 1枚の左右の余白（★この器が画面の最上位の器なので、左右の余白はここだけが持つ）。 */
  padX?: number;
  /** 最後の1枚の下に足す余り（タブバーの裏に隠れないように）。 */
  endPad?: number;
  /** 線の上の1枚が替わったら。 */
  onIndex?: (i: number) => void;
  style?: CSSProperties;
}) {
  const box = useRef<HTMLDivElement>(null);
  const els = useRef<(HTMLDivElement | null)[]>([]);
  const rail = useRef(makeRail());
  const shownIndex = useRef(-1);
  const onIndexRef = useRef(onIndex);
  useEffect(() => { onIndexRef.current = onIndex; }, [onIndex]);
  const grab = useRef<{ id: number; x0: number; y0: number; y: number; won: boolean; lost: boolean; samples: { t: number; y: number }[] } | null>(null);
  const justDragged = useRef(false);

  const paint = useCallback(() => {
    const r = rail.current;
    els.current.forEach((el, i) => {
      if (el && i < r.ys.length) el.style.transform = `translate3d(0, ${pieceY(r, i)}px, 0)`;
    });
    const idx = railIndex(r);
    if (idx !== shownIndex.current) { shownIndex.current = idx; onIndexRef.current?.(idx); }
  }, []);

  // ★ループは効果の中の閉じた関数（React Compiler が「宣言の前に使う」を拒むため、ref で起こす）。
  const wakeRef = useRef<() => void>(() => {});
  useEffect(() => {
    let raf = 0; let last = 0; let acc = 0;
    const tick = (now: number) => {
      raf = 0;
      const r = rail.current;
      acc += Math.min(now - last, RAIL_STEP_MS * MAX_STEPS);
      last = now;
      let moving = false;
      let n = 0;
      while (acc >= RAIL_STEP_MS && n < MAX_STEPS) { moving = railStep(r) || moving; acc -= RAIL_STEP_MS; n += 1; }
      if (n === 0) moving = true;
      paint();
      if (moving || r.held) raf = requestAnimationFrame(tick);
    };
    wakeRef.current = () => {
      if (raf) return;
      last = performance.now();
      acc = RAIL_STEP_MS;
      raf = requestAnimationFrame(tick);
    };
    wakeRef.current();
    return () => { cancelAnimationFrame(raf); raf = 0; wakeRef.current = () => {}; };
  }, [paint]);
  const wake = () => wakeRef.current();

  const measure = useCallback(() => {
    const b = box.current;
    if (!b) return;
    els.current.length = pieces.length;
    const hs = pieces.map((_, i) => els.current[i]?.offsetHeight ?? 0);
    railLayout(rail.current, hs, gap, b.clientHeight, endPad);
    paint();
    wakeRef.current();
  }, [pieces, gap, endPad, paint]);

  useLayoutEffect(() => { measure(); }, [measure]);
  // ★★★**iOS に先にパンを始めさせない**（第134巡。ユーザー報告「**全く反応しない時がかなり頻発する。一度動かすと
  //   何回かは続けて成功する**」）。止まっている間は遊び `SLOP` を越えるまで指を奪わないので、そのあいだに
  //   iOS が祖先の列のスクロールを始め、**`pointercancel` で指ごと取り上げていた**（動いている最中は押した瞬間に
  //   奪うので成功する ―― 「続けて成功する」の正体）。`touch-action: pan-x` は iOS では当てにならない。
  //   → 最初の `touchmove` で**縦が勝っていたら `preventDefault`**（`passive: false` でないと効かない）。
  //   横が勝ったら何もしない（棚の横スクロール・札の束はそのまま）。`data-rail-lock` の中も触らない。
  useEffect(() => {
    const b = box.current;
    if (!b) return;
    let x0 = 0; let y0 = 0; let axis: "x" | "y" | null = null;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      x0 = t.clientX; y0 = t.clientY;
      axis = (e.target as HTMLElement).closest?.("[data-rail-lock]") ? "x" : null;
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || axis === "x") return;
      if (axis === null) {
        const dx = Math.abs(t.clientX - x0); const dy = Math.abs(t.clientY - y0);
        if (dx < 1 && dy < 1) return;
        axis = dx > dy ? "x" : "y";
        if (axis === "x") return;
      }
      if (e.cancelable) e.preventDefault();
    };
    b.addEventListener("touchstart", start, { passive: true });
    b.addEventListener("touchmove", move, { passive: false });
    return () => { b.removeEventListener("touchstart", start); b.removeEventListener("touchmove", move); };
  }, []);

  useEffect(() => {
    const ro = new ResizeObserver(() => measure());
    if (box.current) ro.observe(box.current);
    els.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [measure]);

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-rail-lock]")) return;
    if (grab.current) return;
    const b = box.current;
    if (!b) return;
    grab.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, y: e.clientY, won: false, lost: false, samples: [{ t: e.timeStamp, y: e.clientY }] };
    // ★投げの途中なら、その場で止める（掴んだ所で止まる ＝ 普通のスクロールと同じ）。
    const r = rail.current;
    if (r.target !== null) {
      railHold(r, railPieceAt(r, e.clientY - b.getBoundingClientRect().top));
      grab.current.won = true;
      b.setPointerCapture?.(e.pointerId);
      wake();
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId || g.lost) return;
    const b = box.current;
    if (!b) return;
    if (!g.won) {
      const dx = e.clientX - g.x0; const dy = e.clientY - g.y0;
      if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) { g.lost = true; return; }
      if (Math.abs(dy) <= SLOP) return;
      g.won = true;
      g.y = e.clientY;
      b.setPointerCapture?.(e.pointerId);
      railHold(rail.current, railPieceAt(rail.current, g.y0 - b.getBoundingClientRect().top));
      wake();
      return;
    }
    railDrag(rail.current, e.clientY - g.y);
    g.y = e.clientY;
    g.samples.push({ t: e.timeStamp, y: e.clientY });
    while (g.samples.length > 2 && e.timeStamp - g.samples[0].t > VEL_WINDOW) g.samples.shift();
    wake();
  };
  const onUp = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    grab.current = null;
    if (!g.won) return;
    const s0 = g.samples[0]; const s1 = g.samples[g.samples.length - 1];
    const dt = Math.max(1, s1.t - s0.t);
    const fresh = e.timeStamp - s1.t < VEL_WINDOW;
    const vy = fresh ? ((s1.y - s0.y) / dt) * RAIL_STEP_MS : 0;
    railRelease(rail.current, vy);
    justDragged.current = true;
    window.setTimeout(() => { justDragged.current = false; }, 0);
    wake();
  };

  return (
    <div
      ref={box}
      data-rail=""
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      // ★送ったあとの離上で、中のボタンが押されたことにしない。
      onClickCapture={(e) => { if (justDragged.current) { e.stopPropagation(); e.preventDefault(); } }}
      style={{ position: "relative", overflow: "hidden", touchAction: "pan-x", ...style }}
    >
      {pieces.map((p, i) => (
        <div
          key={p.key}
          ref={(el) => { els.current[i] = el; }}
          style={{ position: "absolute", left: 0, right: 0, top: 0, padding: `0 ${padX}px`, willChange: "transform" }}
        >
          {p.node}
        </div>
      ))}
    </div>
  );
}
