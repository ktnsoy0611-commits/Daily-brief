"use client";

import { useEffect, useRef, useState } from "react";
import { TipCloud } from "@/components/tasks/TipCloud";
import { CARD_RADIUS, INK, LATIN, MUTED, PAPER, SANS, SOFT_SHADOW, SURFACE, TASK_FACE } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { ms, T_ITEM } from "@/lib/motion";
import { animate, stopAnim, useSquish } from "@/lib/softMotion";
import { D_OPEN, D_SWING, D_TRAVEL, K_OPEN, K_SWING, K_TRAVEL, rubber, spring, springTo, settled } from "@/lib/spring";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
import type { SubTask, Task, TaskTip } from "@/lib/types";

// ★★★**包み（親のタスク）**（2026-10-10・第137巡。試作の実装）。オレンジの面（日付が無ければ輪郭だけ）に題と時刻、
//   **サブタスクは中に紙のピル**で入れる（線も数も無く「中にある＝このタスクのもの」）。
//   手つき（ユーザー承認の推奨どおり）… **右へ払う＝済む／左へ払う＝消す**（後ろから ✓／× の丸が引いた量で膨らむ）・
//   **長押し＝運んで日付を付ける・替える**（運ぶのは `TaskBoard`）・軽く押す＝開く（入力画面）。
//   ★縦の指は一覧のスクロールに譲る（`touchAction: pan-y`）。横に決まったら・運び始めたら、スクロールを止める。

/** 払う／運ぶの見分けの遊び（px）。★目盛りの外（指の寸法）。 */
const SLOP = 10;
/** これより引いて離したら済む／消す（px）。★目盛りの外（指の寸法）。 */
const TRIP = 96;
/** 丸の大きさ。 */
const RV = SPACE.xxl + SPACE.md;
/** サブタスクのピルの高さと、左の丸。 */
const SUB_H = SPACE.xxl + SPACE.sm;
const CK = SPACE.xl - SPACE.hair;

export type CarryStart = { id: string; title: string; dated: boolean; x: number; y: number; pointerId: number; el: HTMLElement };

export function TaskPod({ task, tips, onOpen, onSub, onFinish, onRemove, onCarry, carrying, onTipCheck, onTipTodo, registerPod }: {
  task: Task;
  tips: TaskTip[];
  onOpen: () => void;
  onSub: (sub: SubTask) => void;
  onFinish: () => void;
  onRemove: () => void;
  onCarry: (c: CarryStart) => void;
  /** いま運ばれている（元の場所は薄くして残す）。 */
  carrying: boolean;
  onTipCheck: (tip: TaskTip) => void;
  onTipTodo: (tip: TaskTip) => void;
  /** 雫の行き先として自分の要素と「ごくん」を知らせる。 */
  registerPod: (id: string, el: HTMLElement | null, gulp: () => void) => void;
}) {
  const dated = !!task.dueDate;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const slideRef = useRef<HTMLDivElement | null>(null);
  const okRef = useRef<HTMLElement | null>(null);
  const noRef = useRef<HTMLElement | null>(null);
  const podRef = useSquish<HTMLDivElement>();
  const [openTip, setOpenTip] = useState<string | null>(null);
  const subs = (task.subtasks ?? []).filter((s) => !s.done);

  // ── 雫が入ったときの「ごくん」（縦に弾む） ──
  const gulpS = useRef(spring(1));
  useEffect(() => {
    const el = podRef.current;
    registerPod(task.id, wrapRef.current, () => {
      if (!el) return;
      const s = gulpS.current;
      s.v = 0.06; // ★押し込む強さ。★目盛りの外（絵の動き）
      animate(s, () => { springTo(s, 1, K_SWING, D_SWING); return !settled(s, 1, 0.0005); }, () => {
        el.style.transform = `scale(${(2 - s.p).toFixed(4)},${s.p.toFixed(4)})`;
        if (settled(s, 1, 0.0005)) el.style.transform = "";
      });
    });
    return () => registerPod(task.id, null, () => {});
  }, [task.id, registerPod, podRef]);

  // ── 払う・長押し ──
  const g = useRef<{ id: number; x0: number; y0: number; mode: "idle" | "swipe" | "carry" | "scroll"; timer: number; dx: number } | null>(null);
  const x = useRef(spring(0));
  const paintX = () => {
    const el = slideRef.current;
    if (!el) return;
    el.style.transform = x.current.p ? `translateX(${x.current.p.toFixed(2)}px)` : "";
    const k = Math.min(1, Math.abs(x.current.p) / TRIP);
    if (okRef.current) okRef.current.style.transform = `scale(${x.current.p > 0 ? k : 0})`;
    if (noRef.current) noRef.current.style.transform = `scale(${x.current.p < 0 ? k : 0})`;
  };

  // ★運ぶ・払うあいだはスクロールを止める（iOS は pan-y の要素でも touchmove を止めれば止まる）。
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => { const m = g.current?.mode; if (m === "swipe" || m === "carry") e.preventDefault(); };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);
  useEffect(() => () => { stopAnim(x); stopAnim(gulpS); }, []);

  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-own-press]")) return; // 丸・雲はそれ自身が受ける
    if (g.current) return;
    const id = e.pointerId, x0 = e.clientX, y0 = e.clientY, el = e.currentTarget as HTMLElement;
    const timer = window.setTimeout(() => {
      const cur = g.current;
      if (!cur || cur.mode !== "idle") return;
      cur.mode = "carry"; // ★以後の指の位置は `TaskBoard` が見る（ここはスクロールを止める役だけ）
      haptic(14);
      onCarry({ id: task.id, title: task.title, dated, x: x0, y: y0, pointerId: id, el });
    }, ms(T_ITEM));
    g.current = { id, x0, y0, mode: "idle", timer, dx: 0 };
  };
  const move = (e: React.PointerEvent) => {
    const cur = g.current;
    if (!cur || cur.id !== e.pointerId) return;
    const dx = e.clientX - cur.x0, dy = e.clientY - cur.y0;
    if (cur.mode === "idle") {
      if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) { clearTimeout(cur.timer); cur.mode = "scroll"; return; }
      if (Math.abs(dx) > SLOP) {
        clearTimeout(cur.timer);
        cur.mode = "swipe";
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 合成の指 */ }
      }
    }
    if (cur.mode !== "swipe") return;
    cur.dx = dx;
    // ★引いた量の 1.4 倍の先は重くなる（ゴム）。
    const s = Math.sign(dx), over = rubber(Math.abs(dx) / TRIP, 1.4) * TRIP;
    x.current.p = s * over; x.current.v = 0;
    stopAnim(x);
    paintX();
  };
  const up = (e: React.PointerEvent) => {
    const cur = g.current;
    if (!cur || cur.id !== e.pointerId) return;
    clearTimeout(cur.timer);
    g.current = null;
    if (cur.mode === "idle") { onOpen(); return; }
    if (cur.mode === "carry") return;
    if (cur.mode !== "swipe") return;
    if (Math.abs(cur.dx) >= TRIP) leave(cur.dx > 0 ? 1 : -1);
    else animate(x, () => { springTo(x.current, 0, K_OPEN, D_OPEN); return !settled(x.current, 0, 0.3); }, () => {
      if (settled(x.current, 0, 0.3)) x.current.p = 0;
      paintX();
    });
  };

  /** 払い切った … 横へ抜け、間がばねで詰まってから書き込む。 */
  const leave = (dir: 1 | -1) => {
    haptic(dir > 0 ? 18 : 10);
    const w = wrapRef.current, out = (w?.offsetWidth ?? 400) + SPACE.xxl;
    const h = spring(w?.offsetHeight ?? 0), h0 = h.p;
    animate(x, () => { springTo(x.current, dir * out, K_TRAVEL, D_TRAVEL); return Math.abs(x.current.p) < out * 0.98; }, () => {
      paintX();
      if (Math.abs(x.current.p) < out * 0.98 || !w) return;
      w.style.overflow = "hidden";
      animate(h, () => { springTo(h, 0, K_OPEN, D_OPEN); return h.p > 0.5; }, () => {
        w.style.height = `${Math.max(0, h.p)}px`;
        w.style.marginBottom = `${(SPACE.md * Math.max(0, h.p)) / (h0 || 1)}px`;
        if (h.p <= 0.5) (dir > 0 ? onFinish : onRemove)();
      });
    });
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", marginBottom: SPACE.md, marginTop: tips.length ? SPACE.lg : 0 }}>
      {/* 後ろから膨らむ丸（済む ✓ ／ 消す ×）。 */}
      <i ref={(n) => { okRef.current = n; }} aria-hidden style={{ ...rv, left: SPACE.xs, background: INK, color: PAPER }}>✓</i>
      <i ref={(n) => { noRef.current = n; }} aria-hidden style={{ ...rv, right: SPACE.xs, background: SURFACE, color: INK }}>×</i>
      <div ref={slideRef} style={{ position: "relative", willChange: "transform", opacity: carrying ? 0.35 : 1, transition: "opacity var(--t-item) var(--ease-settle)" }}>
        {tips.length > 0 && (
          <div style={{ position: "absolute", right: SPACE.lg, top: -SPACE.xl, display: "flex", gap: SPACE.xs, alignItems: "flex-start", zIndex: 3 }}>
            {tips.map((p) => (
              <div key={p.id} data-own-press>
                <TipCloud tip={p} dim={!!openTip && openTip !== p.id}
                  onOpenChange={(o) => setOpenTip((cur) => (o ? p.id : cur === p.id ? null : cur))}
                  onCheck={() => onTipCheck(p)} onTodo={() => onTipTodo(p)} />
              </div>
            ))}
          </div>
        )}
        <div
          ref={podRef}
          data-squish
          role="button"
          tabIndex={0}
          aria-label={`${task.title}を開く`}
          onPointerDown={down} onPointerMove={move} onPointerUp={up}
          onPointerCancel={() => { const c = g.current; if (c) clearTimeout(c.timer); g.current = null; x.current.p = 0; paintX(); }}
          onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
          style={{
            position: "relative", borderRadius: CARD_RADIUS, padding: SPACE.lg, transformOrigin: "50% 0%",
            background: dated ? TASK_FACE : "transparent",
            boxShadow: dated ? SOFT_SHADOW : `inset 0 0 0 ${SPACE.hair}px ${TASK_FACE}`,
            touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none", cursor: "pointer", color: INK, fontFamily: SANS,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.md, padding: `0 ${SPACE.xs}px` }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: TYPE.lead, fontWeight: WEIGHT.heavy, lineHeight: LEAD.snug, letterSpacing: TRACK.normal }}>{task.title}</span>
            {task.dueTime && (
              <span style={{ fontFamily: LATIN, fontSize: TYPE.small, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, letterSpacing: TRACK.normal }}>{task.dueTime}</span>
            )}
          </div>
          {subs.length > 0 && (
            <div style={{ display: "grid", gap: SPACE.sm, marginTop: SPACE.md }}>
              {subs.map((s) => <SubPill key={s.id} sub={s} onDone={() => onSub(s)} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const rv: React.CSSProperties = {
  position: "absolute", top: `calc(50% - ${RV / 2}px)`, width: RV, height: RV, borderRadius: RADIUS.circle,
  display: "grid", placeItems: "center", fontFamily: LATIN, fontStyle: "normal",
  fontSize: TYPE.head, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, transform: "scale(0)", pointerEvents: "none",
};

/** サブタスク … 左の丸を押すと満ちてから、縮んで消える。数は出さない（ユーザー承認の推奨）。 */
function SubPill({ sub, onDone }: { sub: SubTask; onDone: () => void }) {
  const ref = useSquish<HTMLDivElement>();
  const [filled, setFilled] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const done = () => {
    if (filled) return;
    haptic(12);
    setFilled(true);
    const el = boxRef.current;
    const s = spring(1);
    window.setTimeout(() => {
      if (!el) return onDone();
      const h0 = el.offsetHeight;
      el.style.overflow = "hidden";
      animate(s, () => { springTo(s, 0, K_OPEN, D_OPEN); return s.p > 0.01; }, () => {
        el.style.height = `${Math.max(0, s.p * h0)}px`;
        el.style.opacity = String(Math.max(0, s.p));
        if (s.p <= 0.01) onDone();
      });
    }, ms(T_ITEM));
  };
  return (
    <div ref={boxRef}>
      <div ref={ref} data-squish data-own-press style={{
        height: SUB_H, borderRadius: RADIUS.pill, background: PAPER, display: "flex", alignItems: "center", gap: SPACE.md,
        padding: `0 ${SPACE.lg}px 0 ${SPACE.sm}px`, transformOrigin: "12% 50%",
      }}>
        {/* ★横並びの center … 高さの決まった丸と1行の字（design.md §1 の②）。 */}
        <button type="button" onClick={done} aria-label={`${sub.title}を済んだにする`} style={{
          flex: `0 0 ${CK}px`, height: CK, borderRadius: RADIUS.circle, border: 0, padding: 0, cursor: "pointer",
          background: filled ? INK : SURFACE, color: PAPER, display: "grid", placeItems: "center",
          fontFamily: LATIN, fontSize: TYPE.small, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat,
          transition: "background-color var(--t-press) var(--ease-press)",
        }}>{filled ? "✓" : ""}</button>
        <span style={{
          flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          fontSize: TYPE.body, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, letterSpacing: TRACK.normal, color: filled ? MUTED : INK,
        }}>{sub.title}</span>
      </div>
    </div>
  );
}
