"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/Button";
import { CARD_RADIUS, INK, JOURNAL_FACE, SANS, SECOND, SOFT_SHADOW_LG, TASK_FACE } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { animate, stopAnim } from "@/lib/softMotion";
import { D_OPEN, D_TRAVEL, K_OPEN, K_TRAVEL, spring, springTo, settled } from "@/lib/spring";
import type { DeckCard } from "@/lib/taskBoard";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";

// ★★★**上の札（先回り）**（2026-10-10・第137巡。試作の実装）。載せるのは3つだけ ――
//   **どのタスクのためか／やること／なぜ**。声からの札は左上が「青い縁の墨の円」で「声から」。
//   右へ払う（＋）＝ 取り入れる／左へ払う（×）＝ 要らない。速く引くほど進む向きに伸びる。
//   ★札が尽きたら何も置かない（空の状態に飾りを置かない。`components/common.tsx`）。

/** 払い切る距離（px）と、払いと見なす速さ（px/ms）。★目盛りの外（指の寸法）。 */
const TRIP = 110;
const FLICK = 0.5;
const SLOP = 8;
/** 札の高さの下限（中身が短くても札の大きさを揃える）。★目盛りの外（部品の寸法）。 */
const CARD_MIN_H = 200;
const MARK = SPACE.md + SPACE.hair;

export function SuggestDeck({ cards, onDecide }: {
  cards: DeckCard[];
  /** `from` ＝ 札の画面上の矩形（雫の出発点）。 */
  onDecide: (c: DeckCard, keep: boolean, from: DOMRect) => void;
}) {
  if (!cards.length) return null;
  const [top, next] = cards;
  return (
    <div style={{ position: "relative", marginBottom: SPACE.sm }}>
      {next && <Face key={`b-${next.key}`} card={next} back />}
      <Top key={top.key} card={top} onDecide={onDecide} />
    </div>
  );
}

function Top({ card, onDecide }: { card: DeckCard; onDecide: (c: DeckCard, keep: boolean, from: DOMRect) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const x = useRef(spring(0));
  const sq = useRef(spring(1));
  const g = useRef<{ id: number; x0: number; y0: number; t: number; v: number; on: boolean; lx: number; lt: number } | null>(null);
  const gone = useRef(false);

  const paint = () => {
    const el = ref.current;
    if (!el) return;
    const p = x.current.p, v = Math.min(0.08, Math.abs(g.current?.v ?? x.current.v / 16) * 0.05);
    el.style.transform = `translateX(${p.toFixed(1)}px) rotate(${(p / 22).toFixed(2)}deg) scale(${(sq.current.p * (1 + v)).toFixed(4)},${(sq.current.p * (1 - v / 2)).toFixed(4)})`;
  };
  useEffect(() => () => { stopAnim(x); stopAnim(sq); }, []);
  // ★iOS … 横に決まったらスクロールを止める。
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: TouchEvent) => { if (g.current?.on) e.preventDefault(); };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  const decide = (keep: boolean) => {
    if (gone.current || !ref.current) return;
    gone.current = true;
    haptic(keep ? 16 : 8);
    const from = ref.current.getBoundingClientRect();
    if (keep) { onDecide(card, true, from); return; } // ★取り入れる札は雫になって飛ぶ（`TaskBoard`）。札はここで消える
    const out = (from.width + SPACE.xxl) * -1;
    animate(x, () => { springTo(x.current, out, K_TRAVEL, D_TRAVEL); return x.current.p > out * 0.95; }, () => {
      paint();
      if (x.current.p <= out * 0.95) onDecide(card, false, from);
    });
  };

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t: e.timeStamp, v: 0, on: false, lx: e.clientX, lt: e.timeStamp };
        sq.current.p = 1;
        animate(sq, () => { springTo(sq.current, 0.97, K_OPEN, D_OPEN); return !settled(sq.current, 0.97, 0.0005); }, paint);
      }}
      onPointerMove={(e) => {
        const c = g.current;
        if (!c || c.id !== e.pointerId) return;
        const dx = e.clientX - c.x0, dy = e.clientY - c.y0;
        if (!c.on) {
          if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) { g.current = null; release(); return; }
          if (Math.abs(dx) < SLOP) return;
          c.on = true;
          try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 合成の指 */ }
        }
        const dt = Math.max(1, e.timeStamp - c.lt);
        c.v = (e.clientX - c.lx) / dt; c.lx = e.clientX; c.lt = e.timeStamp;
        stopAnim(x);
        x.current.p = dx; x.current.v = 0;
        paint();
      }}
      onPointerUp={(e) => {
        const c = g.current;
        if (!c || c.id !== e.pointerId) return;
        g.current = null;
        const dx = e.clientX - c.x0;
        if (c.on && (Math.abs(dx) > TRIP || Math.abs(c.v) > FLICK)) decide((Math.abs(c.v) > FLICK ? c.v : dx) > 0);
        else release();
      }}
      onPointerCancel={() => { g.current = null; release(); }}
      style={{ position: "relative", zIndex: 2, touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none", willChange: "transform", transformOrigin: "50% 60%" }}
    >
      <Face card={card} onKeep={() => decide(true)} onSkip={() => decide(false)} />
    </div>
  );

  function release() {
    animate(x, () => {
      springTo(x.current, 0, K_OPEN, D_OPEN); springTo(sq.current, 1, K_OPEN, D_OPEN);
      return !settled(x.current, 0, 0.2) || !settled(sq.current, 1, 0.0005);
    }, paint);
  }
}

function Face({ card, back, onKeep, onSkip }: { card: DeckCard; back?: boolean; onKeep?: () => void; onSkip?: () => void }) {
  const voice = card.kind === "voice";
  return (
    <div style={{
      ...(back ? { position: "absolute", inset: 0, transform: `translateY(${SPACE.sm}px) scale(0.96)`, filter: "brightness(0.97)" } : { boxShadow: SOFT_SHADOW_LG }),
      minHeight: CARD_MIN_H, borderRadius: CARD_RADIUS, background: TASK_FACE, padding: SPACE.xl, color: INK, fontFamily: SANS,
      display: "flex", flexDirection: "column", gap: SPACE.md,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
        {/* ★横並びの center … 丸（高さの決まった箱）と1行の字。 */}
        <i aria-hidden style={{
          width: MARK, height: MARK, borderRadius: RADIUS.circle, background: INK, flex: `0 0 ${MARK}px`,
          boxShadow: voice ? `0 0 0 ${SPACE.hair}px ${JOURNAL_FACE}` : "none",
        }} />
        <span style={{ fontSize: TYPE.small, fontWeight: WEIGHT.heavy, lineHeight: LEAD.flat, letterSpacing: TRACK.normal, color: SECOND }}>
          {voice ? "声から" : card.parent}
        </span>
      </div>
      <div style={{ fontSize: TYPE.head, fontWeight: WEIGHT.heavy, lineHeight: LEAD.snug, letterSpacing: TRACK.normal, textWrap: "balance" }}>{card.title}</div>
      {card.why && (
        <div style={{ fontSize: TYPE.body, fontWeight: WEIGHT.text, lineHeight: LEAD.body, letterSpacing: TRACK.normal }}>{card.why}</div>
      )}
      {!back && (
        <div style={{ marginTop: "auto", display: "flex", gap: SPACE.md, justifyContent: "flex-end" }}>
          <Button variant="icon" size="lg" aria-label="要らない" onClick={onSkip}>×</Button>
          <Button variant="icon" size="lg" tone={INK} aria-label={voice ? "タスクにする" : "やることに入れる"} onClick={onKeep}
            style={{ background: INK, color: TASK_FACE }}>＋</Button>
        </div>
      )}
    </div>
  );
}
