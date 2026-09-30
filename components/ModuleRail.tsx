"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {
  makeRail, pieceY, railClaimed, railDrag, railGoTo, railHold, railIndex, railLayout, railPieceAt, railRelease, railStep, railUnclaim, RAIL_STEP_MS,
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

export function ModuleRail({ pieces, gap, padX = 0, endPad = 0, onIndex, jump, style }: {
  pieces: RailPiece[];
  /** 1枚と1枚のあいだ（px）。 */
  gap: number;
  /** 1枚の左右の余白（★この器が画面の最上位の器なので、左右の余白はここだけが持つ）。 */
  padX?: number;
  /** 最後の1枚の下に足す余り（タブバーの裏に隠れないように）。 */
  endPad?: number;
  /** 線の上の1枚が替わったら。 */
  onIndex?: (i: number) => void;
  /** ★その1枚へ運ぶ合図（`n` が変わるたびに1回）。 */
  jump?: { piece: number; n: number };
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

  // ★★★**測り直すのは「顔ぶれが変わった」ときと「寸法が変わった」ときだけ**（第135巡）。
  //   第134巡までは `pieces`（親が描くたびに新しい配列）に依っていたので、親が描き直すたびに
  //   **全文書のレイアウトを強制して**全部の1枚の高さを読み直していた（実測 CPU×4 で切り替えのたびに
  //   23〜70ms）。寸法の変化は `ResizeObserver` が知らせる（その時点でレイアウトは済んでいるので安い）。
  const countRef = useRef(pieces.length);
  countRef.current = pieces.length;
  const sig = pieces.map((p) => p.key).join("|");
  const measure = useCallback(() => {
    const b = box.current;
    if (!b) return;
    const n = countRef.current;
    els.current.length = n;
    // ★★1枚ぶんの見る窓の高さを配る（`--rail-h`）。1画面で完結するモジュール（BRIEF・RECORD）が
    //   自分の高さをこれから決める。
    b.style.setProperty("--rail-h", `${b.clientHeight}px`);
    const hs = Array.from({ length: n }, (_, i) => els.current[i]?.offsetHeight ?? 0);
    // ★1枚の中の「ここでも止まる」印（`data-rail-snap`）。読むのは測り直すときだけ。
    const inner = Array.from({ length: n }, (_, i) => {
      const el = els.current[i];
      if (!el) return [];
      const top = el.getBoundingClientRect().top;
      return [...el.querySelectorAll<HTMLElement>("[data-rail-snap]")].map((m) => m.getBoundingClientRect().top - top);
    });
    railLayout(rail.current, hs, gap, b.clientHeight, endPad, inner);
    paint();
    wakeRef.current();
  }, [gap, endPad, paint]);

  useLayoutEffect(() => { measure(); }, [measure, sig]);
  const jumpN = jump?.n ?? 0;
  const jumpPiece = jump?.piece ?? 0;
  // ★★運ぶのは**合図の数が変わったときだけ**（中身が増えて行き先の番号がずれても、勝手に運び直さない）。
  const jumpedN = useRef(0);
  useEffect(() => {
    if (!jumpN || jumpN === jumpedN.current) return;
    jumpedN.current = jumpN;
    railGoTo(rail.current, jumpPiece);
    wakeRef.current();
  }, [jumpN, jumpPiece]);
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
    // ★付けた直後の1回目の知らせは読み飛ばす（すぐ上の `useLayoutEffect` が測ったばかり）。
    let first = true;
    const ro = new ResizeObserver(() => { if (first) { first = false; return; } measure(); });
    if (box.current) ro.observe(box.current);
    els.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [measure, sig]);

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
    if (!g.won && railClaimed(e.pointerId)) { g.lost = true; return; }
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
    railUnclaim(e.pointerId);
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
      // ★★★**押し始めは捕獲相で受ける**（第134巡）―― 札の写真は押し始めを `stopPropagation` する
      //   （写真を押すと詳細が開くので、札のドラッグを始めないため）。泡立ちで受けると、**札の大半を占める
      //   写真の上から上下に払っても送りが動かなかった**。降りてほしい部品は `claimFromRail` を呼ぶ。
      onPointerDownCapture={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      // ★★★**自分の捕捉が外れたときだけ**（第134巡）。`lostpointercapture` は泡立つので、札が縦に払われて
      //   自分の捕捉を手放した瞬間の知らせまでここへ上がり、**送りが指を離したことにされて止まっていた**。
      onLostPointerCapture={(e) => { if (e.target === box.current) onUp(e); }}
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
