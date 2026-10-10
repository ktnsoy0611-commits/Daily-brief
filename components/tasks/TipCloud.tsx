"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { INK, JOURNAL_FACE, SANS } from "@/lib/constants";
import { closedGeo, genesOf, lerpGeo, openGeo, paintCloud, seedOf, shiftGeo, type CloudGeo } from "@/lib/cloudShape";
import { haptic } from "@/lib/helpers";
import { ms, T_ITEM } from "@/lib/motion";
import { animate, stillMotion, stopAnim } from "@/lib/softMotion";
import { D_OPEN, D_SWING, K_OPEN, K_SWING, spring, springTo, settled } from "@/lib/spring";
import { LEAD, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
import type { TaskTip } from "@/lib/types";

// ★★★**tips の雲**（2026-10-10・第137巡。試作の実装）。JOURNAL の青・1語だけ・3日以内のタスクに2つまで。
//   閉じているあいだは**こぶがゆっくり息をし、雲ごとの周期で漂う**（ユーザー指定「少し動いて浮いている感じ」）。
//   押すと**同じ1つの雲のまま**大きく開き（こぶと面をばねで移す）、外を押すと縮んで戻る。
//   ★★試作で直した開き方の3つ（ユーザー指摘「タップして開いた時の挙動がおかしい」）――
//   ① 漂いを止めてから測る（漂ったぶんだけ開く形がずれた）② 閉じるのは**画面のどこを押しても**（雲の外の押下を
//   `document` の捕獲相で拾う）③ 開いているあいだ兄弟の雲は消して押せなくする（`dim`）。
//   ★形の式は `lib/cloudShape.ts`。

/** 開いた雲の幅（絵の寸法）。★目盛りの外。 */
const OPEN_W = 224;
/** 開いた雲の上の余白 ＝ 上のこぶの高さ。★目盛りの外（こぶの寸法から）。 */
const OPEN_TOP = SPACE.xxl + SPACE.xxl;
/** 閉じた雲の上の余白（こぶが乗るぶん）。★目盛りの外。 */
const CLOSED_TOP = SPACE.lg + SPACE.xs;
/** 器の外へ描ける幅（開閉の行き過ぎで膨らむぶん）。 */
const PAD_CLOSED = SPACE.xs;
const PAD_OPEN = SPACE.lg + SPACE.hair;

// ── 閉じた雲の息と漂い（見えている雲だけ・1本のループ） ─────────────
type Live = { el: HTMLElement; cv: HTMLCanvasElement; seed: number; busy: () => boolean };
const LIVE = new Set<Live>();
let raf = 0, tick = 0;
const phOf = (seed: number, t: number) => [t / 960 + seed, t / 1130 + seed * 2.1, t / 1040 + seed * 3.3];
function paintClosed(c: Live, t: number) {
  const w = c.el.offsetWidth, h = c.el.offsetHeight;
  if (w && h) paintCloud(c.cv, closedGeo(w, h, stillMotion() ? [0, 0, 0] : phOf(c.seed, t), genesOf(c.seed)), w, h, JOURNAL_FACE, PAD_CLOSED);
}
function breathe(t: number) {
  tick++;
  for (const c of LIVE) {
    if (c.busy()) continue;
    const r = c.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight || !r.width) continue;
    // ★浮かぶ … 割り切れない3つの周期で 横 ±2px・縦 ±3.5px・傾き ±2°。★目盛りの外（絵の動き）。
    const s = t / 1000 + c.seed * 7;
    const x = 2 * Math.sin(s * 2 * Math.PI / 7.3), y = 3.5 * Math.sin(s * 2 * Math.PI / 5.1), rot = 2 * Math.sin(s * 2 * Math.PI / 9.7);
    c.el.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`;
    if (tick % 2 === 0) paintClosed(c, t); // ★息は 30fps で足りる
  }
  raf = LIVE.size && !stillMotion() ? requestAnimationFrame(breathe) : 0;
}

type Phase = "closed" | "open" | "closing" | "gone";

export function TipCloud({ tip, dim, onOpenChange, onCheck, onTodo }: {
  tip: TaskTip;
  /** 兄弟の雲が開いているあいだは消して押せなくする。 */
  dim: boolean;
  onOpenChange: (open: boolean) => void;
  onCheck: () => void;
  onTodo: () => void;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<Phase>("closed");
  const seed = seedOf(tip.id);
  const geoRef = useRef<{ A: CloudGeo; B: CloudGeo; w: number; h: number } | null>(null);
  const from = useRef<{ r: DOMRect; w: number; h: number } | null>(null);
  const T = useRef(spring(0));
  const phaseRef = useRef<Phase>("closed");
  useEffect(() => { phaseRef.current = phase; });

  // 閉じた雲を登録（息と漂い）。
  useEffect(() => {
    const el = elRef.current, cv = cvRef.current;
    if (!el || !cv) return;
    const c: Live = { el, cv, seed, busy: () => phaseRef.current !== "closed" };
    LIVE.add(c);
    paintClosed(c, performance.now());
    if (!raf && !stillMotion()) raf = requestAnimationFrame(breathe);
    return () => { LIVE.delete(c); };
  }, [seed]);

  const run = (to: 0 | 1) => {
    const s = T.current, k = to ? K_SWING : K_OPEN, d = to ? D_SWING : D_OPEN;
    animate(T, () => { springTo(s, to, k, d); return !settled(s, to, 0.002); }, () => {
      const g = geoRef.current, cv = cvRef.current, tx = textRef.current;
      if (!g || !cv) return;
      const done = settled(s, to, 0.002);
      paintCloud(cv, lerpGeo(g.A, g.B, Math.max(-0.1, Math.min(1.14, done ? to : s.p))), g.w, g.h, JOURNAL_FACE, PAD_OPEN);
      if (tx) tx.style.opacity = to === 1 && s.p > 0.85 ? "1" : "0";
      if (done && to === 0) {
        geoRef.current = null;
        setPhase("closed");
        onOpenChange(false);
      }
    });
  };
  const toggle = (open: boolean) => {
    const el = elRef.current;
    if (!el) return;
    if (open) {
      el.style.transform = ""; // ★漂いを止めてから測る
      from.current = { r: el.getBoundingClientRect(), w: el.offsetWidth, h: el.offsetHeight };
      haptic(8);
      setPhase("open");
      onOpenChange(true);
    } else if (phaseRef.current === "open") {
      setPhase("closing");
      run(0);
    }
  };

  // 開くレイアウトになった直後に、閉じた輪郭 → 開いた輪郭のばねを始める。
  useLayoutEffect(() => {
    if (phase !== "open" || geoRef.current || !from.current) return;
    const el = elRef.current!;
    const r1 = el.getBoundingClientRect(), w1 = el.offsetWidth, h1 = el.offsetHeight, f = from.current;
    const g = genesOf(seed);
    geoRef.current = { w: w1, h: h1, A: shiftGeo(closedGeo(f.w, f.h, phOf(seed, performance.now()), g), f.r.left - r1.left, f.r.top - r1.top), B: openGeo(w1, h1, g) };
    T.current = spring(0);
    run(1);
  });



  // ★開いているあいだ、画面のどこを押しても閉じる（雲の中は除く）。捕獲相で拾う ―― 下の要素が止めても届く。
  useEffect(() => {
    if (phase !== "open") return;
    // ★外を押したときは**閉じるだけ**（その押下で下の包みが開かないように、押下とそれに続く1回のクリックを飲み込む）。
    const off = (e: PointerEvent) => {
      if (elRef.current?.contains(e.target as Node)) return;
      e.stopPropagation();
      const eat = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
      document.addEventListener("click", eat, { capture: true, once: true });
      window.setTimeout(() => document.removeEventListener("click", eat, true), ms(T_ITEM));
      toggle(false);
    };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  });

  useEffect(() => () => stopAnim(T), []);
  useLayoutEffect(() => {
    // 閉じ切った直後は閉じた形で塗り直す（開いた絵が残らないように）。
    if (phase === "closed" && elRef.current && cvRef.current) paintClosed({ el: elRef.current, cv: cvRef.current, seed, busy: () => false }, performance.now());
  }, [phase, seed]);

  const leave = (then: () => void) => {
    // ★「確認した」「やることに」… 雲が縮んで消えてから書き込む（消える前に一覧が組み替わらないように）。
    const el = elRef.current;
    if (!el) return then();
    haptic(12);
    const s = spring(1);
    setPhase("gone");
    onOpenChange(false);
    animate(s, () => { springTo(s, 0, K_OPEN, D_OPEN); return !settled(s, 0, 0.01); }, () => {
      el.style.transform = `scale(${Math.max(0, s.p).toFixed(3)})`;
      if (settled(s, 0, 0.01)) then();
    });
  };

  const open = phase === "open" || phase === "closing";
  return (
    <div
      ref={elRef}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={() => { if (phase === "closed") toggle(true); }}
      onKeyDown={(e) => { if (e.key === "Enter" && phase === "closed") toggle(true); }}
      style={{
        position: "relative", isolation: "isolate", color: INK, fontFamily: SANS, cursor: "pointer",
        willChange: "transform", transformOrigin: "50% 100%",
        opacity: dim ? 0 : 1, pointerEvents: dim ? "none" : "auto",
        transition: "opacity var(--t-item) var(--ease-settle)",
        ...(open
          ? { width: OPEN_W, padding: `${OPEN_TOP}px ${SPACE.xl}px ${SPACE.lg}px`, zIndex: 6 }
          : { minWidth: OPEN_W / 3.6, padding: `${CLOSED_TOP}px ${SPACE.md}px ${SPACE.sm}px`, textAlign: "center", whiteSpace: "nowrap" }),
      }}
    >
      <canvas ref={cvRef} aria-hidden style={{ position: "absolute", zIndex: -1, pointerEvents: "none" }} />
      {open ? (
        <div ref={textRef} style={{ opacity: 0, transition: "opacity var(--t-item) var(--ease-settle)" }}>
          <div style={{ fontSize: TYPE.body, fontWeight: WEIGHT.bold, lineHeight: LEAD.body, letterSpacing: TRACK.normal }}>{tip.check}</div>
          <div style={{ display: "flex", gap: SPACE.sm, marginTop: SPACE.md }}>
            <Button size="sm" variant="ghost" onClick={() => leave(onCheck)}>確認した</Button>
            <Button size="sm" variant="primary" onClick={() => leave(onTodo)}>やることに</Button>
          </div>
        </div>
      ) : (
        <span style={{ fontSize: TYPE.small, fontWeight: WEIGHT.heavy, lineHeight: LEAD.flat, letterSpacing: TRACK.normal }}>{tip.word}</span>
      )}
    </div>
  );
}
