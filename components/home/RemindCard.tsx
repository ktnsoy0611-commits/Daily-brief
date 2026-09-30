"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/Button";
import { HERO, INK, MUTED, NOTE_BLUR, NOTE_GLASS, SANS, SOFT_SHADOW_LG, TAB_PAD_TOP } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { ms, T_OUT } from "@/lib/motion";
import type { Remind } from "@/lib/remind";
import { LEAD, SPACE, TYPE, WEIGHT } from "@/lib/tokens";

// ★★★**忘れ防止の通知の札**（2026-09-27・第133巡）。画面の上から降りてくる1枚（iOS の通知と同じ場所・
// 同じ作り）。★中身と答えの残し方は `lib/remind.ts`。ここは見え方と手つきだけ。
// ★★**1枚ずつ**。答えると上へ抜け、次があれば降りてくる。**上へ払うと「あとで」**（この起動の間は聞かない）。
// ★★`createPortal` で `body` 直下へ（`design.md` §4。`--nav-h` は読まない）。
// ★★面は**すりガラスの白**（後ろをぼかして透かす）＋ 既存の大きな影 `SOFT_SHADOW_LG`。縁の線は引かない。

/** 上へ払って消すまでの距離（これより上へ離したら「あとで」）。 */
const FLICK = SPACE.xl;

export function RemindCard({ item, onAnswer, onLater }: {
  item: Remind | null;
  onAnswer: (r: Remind, done: boolean) => void;
  onLater: (r: Remind) => void;
}) {
  // ★出ている1枚（抜けていくあいだは前の1枚を持ち続ける）。
  const [cur, setCur] = useState<Remind | null>(null);
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState(0);
  const grab = useRef<{ y: number; id: number } | null>(null);
  const leaving = useRef(false);

  // ★新しい1枚が来たら、画面の上の外に置いてから降ろす。
  const key = item ? `${item.taskId}|${item.sugId}` : "";
  useLayoutEffect(() => {
    if (!item || leaving.current) return;
    setCur(item);
    setShown(false);
    setDrag(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!cur || shown) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => { setShown(true); haptic(8); }));
    return () => cancelAnimationFrame(id);
  }, [cur, shown]);

  if (typeof document === "undefined" || !cur) return null;

  /** ★上へ抜けてから答えを渡す（抜ける動きを見せる）。 */
  const leave = (then: () => void) => {
    if (leaving.current) return;
    leaving.current = true;
    setShown(false);
    window.setTimeout(() => {
      leaving.current = false;
      setCur(null);
      then();
    }, ms(T_OUT));
  };
  const answer = (done: boolean) => { haptic(10); const r = cur; leave(() => onAnswer(r, done)); };

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    grab.current = { y: e.clientY, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    const dy = e.clientY - g.y;
    // ★上へは指と 1:1、下へは少しだけ（引っ張れる感触だけ残す）。
    setDrag(dy < 0 ? dy : dy / 4);
  };
  const onUp = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    grab.current = null;
    if (drag < -FLICK) { const r = cur; leave(() => onLater(r)); return; }
    setDrag(0);
  };

  const dragging = grab.current !== null;
  return createPortal(
    <div
      role="alertdialog" aria-label="確認"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      style={{
        position: "fixed", zIndex: 70, left: SPACE.lg, right: SPACE.lg,
        top: `calc(${TAB_PAD_TOP} + ${SPACE.sm}px)`,
        transform: shown ? `translateY(${drag}px)` : `translateY(calc(-100% - ${SPACE.xxl * 2}px))`,
        transition: dragging ? "none"
          : shown ? "transform var(--t-in) var(--ease-settle)"
          : "transform var(--t-out) var(--ease-exit)",
        touchAction: "none",
      }}
    >
      {/* ★★★**ぼかす面は動かす器と分ける**（第133巡）―― 変形している要素そのものに `backdrop-filter` を
          掛けると、Chromium はぼかす範囲を取り違えて一部しかぼけなかった（実測）。 */}
      <div style={{
        padding: HERO.padding,
        borderRadius: HERO.borderRadius,
        background: NOTE_GLASS,
        backdropFilter: NOTE_BLUR, WebkitBackdropFilter: NOTE_BLUR,
        boxShadow: SOFT_SHADOW_LG,
        fontFamily: SANS, color: INK,
      }}>
      <div style={{ fontSize: TYPE.small, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, color: MUTED }}>
        {cur.when}・{cur.parent}の準備
      </div>
      <div style={{ fontSize: TYPE.head, fontWeight: WEIGHT.bold, lineHeight: LEAD.snug, marginTop: SPACE.sm }}>
        {cur.title}
      </div>
      {cur.why && (
        <div style={{ fontSize: TYPE.body, fontWeight: WEIGHT.text, lineHeight: LEAD.body, color: MUTED, marginTop: SPACE.xs }}>
          {cur.why}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: SPACE.sm, marginTop: SPACE.md }}>
        <Button variant="ghost" onClick={() => answer(false)}>まだ</Button>
        <Button variant="primary" onClick={() => answer(true)}>済んだ</Button>
      </div>
      </div>
    </div>,
    document.body,
  );
}
