"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Masthead, SectionLabel } from "@/components/common";
import { AssignSheet } from "@/components/home/AssignSheet";
import { DateDock } from "@/components/tasks/DateDock";
import { SuggestDeck } from "@/components/tasks/SuggestDeck";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { TaskPod, type CarryStart } from "@/components/tasks/TaskPod";
import { appTitle } from "@/lib/apps";
import { INK, LATIN, MUTED, PAPER, SANS, TASK_FACE } from "@/lib/constants";
import { haptic, todayKey } from "@/lib/helpers";
import { ms, T_OUT } from "@/lib/motion";
import { animate } from "@/lib/softMotion";
import { D_CATCH, K_CATCH, spring, springTo, settled } from "@/lib/spring";
import {
  acceptVoice, adoptSuggestion, checkTip, deckOf, dropSuggestion, finishSub, finishTask, groupsOf, rejectVoice,
  removeTask, restoreTask, setDue, slotsOf, tipToSub, tipsOf, type DateSlot, type DeckCard,
} from "@/lib/taskBoard";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
import type { AppState, Task, TabProps } from "@/lib/types";

// ★★★**新しい TASK の画面**（2026-10-10・第137巡。ユーザー承認の試作 https://claude.ai/artifact/VpzPX2vMvLk9ZE8w5pSAek
//   の実装。第135巡の日付の列・仮のタブ ALIGN／DRIFT はこれに置き換えた ―― ユーザー承認「新しいのができたら今の task は外して良い」）。
//   上 ＝ 先回りの札（準備の提案・声の候補）／下 ＝ 日付ごとの包み（サブタスクと tips の雲を中に持つ）。
//   ★中身と操作の規則は `lib/taskBoard.ts`。ここは描くのと、指の受け渡しだけ。
//   ★★書き込みは**その時点の最新**から作る（`latest`。雫や払いのばねを待ってから書くので、待つ前の状態を写さない）。

/** 「元に戻す」を出しておく時間。★目盛りの外（読む時間）。 */
const UNDO_MS = 4200;
/** 雫の大きさ。 */
const DROP = SPACE.xxl + SPACE.md;

type Notice = { text: string; undo?: () => void };
type Carry = CarryStart & { px: number; py: number; hot: string | null };

export function TaskBoard({ appState, persist }: TabProps) {
  const today = todayKey();
  const latest = useRef(appState);
  useEffect(() => { latest.current = appState; });
  const edit = useCallback((fn: (s: AppState) => void) => {
    const next = structuredClone(latest.current);
    fn(next);
    latest.current = next;
    persist(next);
  }, [persist]);

  const groups = useMemo(() => groupsOf(appState.tasks ?? [], today), [appState.tasks, today]);
  const deck = useMemo(() => deckOf(appState, today), [appState, today]);
  const slots = useMemo(() => slotsOf(today), [today]);
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // 雫が飛んでいるあいだ札を山から外す
  const cards = deck.filter((c) => !hidden.has(c.key));

  // ── 下の札（元に戻す） ──
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef(0);
  const say = useCallback((n: Notice) => {
    setNotice(n);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), n.undo ? UNDO_MS : ms(T_OUT) * 4);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // ── 包みの登録簿（雫の行き先） ──
  const pods = useRef(new Map<string, { el: HTMLElement; gulp: () => void }>());
  const registerPod = useCallback((id: string, el: HTMLElement | null, gulp: () => void) => {
    if (el) pods.current.set(id, { el, gulp }); else pods.current.delete(id);
  }, []);

  // ── 雫 … 札が縮んで墨の丸になり、親の包みへ飛んで吸い込まれる ──
  const [drop, setDrop] = useState<{ x: number; y: number; s: number } | null>(null);
  const fly = useCallback((from: DOMRect, taskId: string | null, then: (landed: boolean) => void) => {
    const target = taskId ? pods.current.get(taskId) : undefined;
    const r = target?.el.getBoundingClientRect();
    const seen = !!r && r.top > 0 && r.bottom < window.innerHeight;
    const tx = seen ? r!.right - SPACE.xxl : from.left + from.width / 2;
    const ty = seen ? r!.top + SPACE.xl : window.innerHeight + DROP;
    const X = spring(from.left + from.width / 2), Y = spring(from.top + from.height / 2), S = spring(3);
    const key = {};
    animate(key, () => {
      springTo(X, tx, K_CATCH * 0.35, D_CATCH * 0.6); springTo(Y, ty, K_CATCH * 0.35, D_CATCH * 0.6); springTo(S, 1, K_CATCH, D_CATCH);
      return !(settled(X, tx, 1) && settled(Y, ty, 1));
    }, () => {
      const done = settled(X, tx, 1) && settled(Y, ty, 1);
      setDrop(done ? null : { x: X.p, y: Y.p, s: S.p });
      if (done) { if (seen) target!.gulp(); then(seen); }
    });
  }, []);

  const decide = (c: DeckCard, keep: boolean, from: DOMRect) => {
    if (!keep) {
      edit((s) => (c.kind === "suggest" ? dropSuggestion(s, c.taskId, c.sugId) : rejectVoice(s, c.candId)));
      return;
    }
    if (c.kind === "voice") {
      if (c.dueDate) { edit((s) => { acceptVoice(s, c.candId); }); say({ text: "タスクにしました" }); return; }
      setHidden((h) => new Set(h).add(c.key));
      setVoicePick(c);
      return;
    }
    setHidden((h) => new Set(h).add(c.key));
    fly(from, c.taskId, (landed) => {
      edit((s) => { adoptSuggestion(s, c.taskId, c.sugId); });
      setHidden((h) => { const n = new Set(h); n.delete(c.key); return n; });
      if (!landed) say({ text: `↓ ${c.parent}へ` });
    });
  };

  // ── 声の札の日付選び ──
  const [voicePick, setVoicePick] = useState<Extract<DeckCard, { kind: "voice" }> | null>(null);
  const [assignFor, setAssignFor] = useState<{ title: string; value?: string; put: (iso: string) => void } | null>(null);
  const pickVoice = (slot: DateSlot) => {
    const c = voicePick;
    if (!c) return;
    const done = (iso: string | null) => {
      edit((s) => { acceptVoice(s, c.candId, iso); });
      setVoicePick(null);
      setHidden((h) => { const n = new Set(h); n.delete(c.key); return n; });
      say({ text: "タスクにしました" });
    };
    if (slot.other) { setAssignFor({ title: c.title, put: (iso) => { setAssignFor(null); done(iso); } }); return; }
    done(slot.iso);
  };

  // ── 包みを運ぶ（長押し） ──
  const [carry, setCarry] = useState<Carry | null>(null);
  const carryRef = useRef<Carry | null>(null);
  useEffect(() => { carryRef.current = carry; });
  // ★運ぶあいだの受け皿は指を受けない（`pointerEvents: none`）ので、升の矩形で当てる。
  const slotAt = (x: number, y: number) => {
    for (const el of document.querySelectorAll<HTMLElement>("[data-carry-dock] [data-slot]")) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el.dataset.slot ?? null;
    }
    return null;
  };
  useEffect(() => {
    if (!carry) return;
    const move = (e: PointerEvent) => {
      const c = carryRef.current;
      if (!c || e.pointerId !== c.pointerId) return;
      const hot = slotAt(e.clientX, e.clientY);
      if (hot !== c.hot) haptic(6);
      setCarry({ ...c, px: e.clientX, py: e.clientY, hot });
    };
    const up = (e: PointerEvent) => {
      const c = carryRef.current;
      if (!c || e.pointerId !== c.pointerId) return;
      setCarry(null);
      const slot = slots.find((s) => s.key === slotAt(e.clientX, e.clientY));
      if (!slot) return;
      if (slot.other) {
        const t = (latest.current.tasks ?? []).find((x) => x.id === c.id);
        setAssignFor({ title: c.title, value: t?.dueDate, put: (iso) => { setAssignFor(null); edit((s) => setDue(s, c.id, iso)); } });
        return;
      }
      haptic(14);
      edit((s) => setDue(s, c.id, slot.iso));
      say({ text: slot.iso ? `${slot.jp}へ` : "いつかへ" });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [carry !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  const carriedTask = carry ? (appState.tasks ?? []).find((t) => t.id === carry.id) : undefined;
  const hereKey = carriedTask ? slots.find((s) => (carriedTask.dueDate ? s.iso === carriedTask.dueDate : s.key === "someday"))?.key : null;

  // ── 済む・消す（元に戻せる） ──
  const finishOrRemove = (t: Task, finish: boolean) => {
    const before = structuredClone((latest.current.tasks ?? []).find((x) => x.id === t.id) ?? t);
    edit((s) => (finish ? finishTask(s, t.id) : removeTask(s, t.id)));
    say({ text: finish ? "済みました" : "消しました", undo: () => edit((s) => restoreTask(s, before)) });
  };

  // ── 開く（入力画面） ──
  const [openId, setOpenId] = useState<string | null>(null);
  const open = (appState.tasks ?? []).find((t) => t.id === openId) ?? null;
  const patch = (id: string, p: Partial<ComposerData>) => edit((s) => { const t = s.tasks.find((x) => x.id === id); if (t) Object.assign(t, p); });

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{
        position: "absolute", inset: 0, overflowY: carry ? "hidden" : "auto", overflowX: "hidden", overscrollBehavior: "contain",
        padding: `var(--pad-top) ${SPACE.lg}px calc(var(--nav-h) + ${SPACE.xxl}px)`,
      }}>
        <Masthead title={appTitle("tasks")} />
        <SectionLabel text="TODAY" style={{ marginTop: -SPACE.md, marginBottom: SPACE.md }} />
        <SuggestDeck cards={cards} onDecide={decide} />
        {groups.map((g) => (
          <section key={g.key}>
            <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.sm, margin: `${SPACE.xl}px 0 ${SPACE.md}px` }}>
              <b style={{ fontSize: TYPE.lead, fontWeight: WEIGHT.heavy, lineHeight: LEAD.flat, letterSpacing: TRACK.normal, color: INK, fontFamily: SANS }}>{g.jp}</b>
              <span style={{ fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, letterSpacing: TRACK.caps, color: MUTED }}>{g.en}</span>
            </div>
            {g.tasks.map((t) => (
              <TaskPod
                key={t.id} task={t} tips={tipsOf(t, today)} carrying={carry?.id === t.id}
                registerPod={registerPod}
                onOpen={() => { haptic(6); setOpenId(t.id); }}
                onSub={(sub) => edit((s) => finishSub(s, t.id, sub.id))}
                onFinish={() => finishOrRemove(t, true)}
                onRemove={() => finishOrRemove(t, false)}
                onCarry={(c) => setCarry({ ...c, px: c.x, py: c.y, hot: null })}
                onTipCheck={(p) => edit((s) => checkTip(s, t.id, p.id))}
                onTipTodo={(p) => edit((s) => tipToSub(s, t.id, p.id))}
              />
            ))}
          </section>
        ))}
      </div>

      {/* 運んでいる包み ＝ 題だけのピル。指について来る。 */}
      {carry && (
        <div aria-hidden style={{
          position: "fixed", left: 0, top: 0, zIndex: 9, pointerEvents: "none",
          transform: `translate(${carry.px}px, ${carry.py}px) translate(-50%, -120%)`,
          maxWidth: "70vw", padding: `${SPACE.md}px ${SPACE.lg}px`, borderRadius: RADIUS.pill,
          background: carry.dated ? TASK_FACE : PAPER, boxShadow: `inset 0 0 0 ${SPACE.hair}px ${TASK_FACE}`,
          color: INK, fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.heavy, lineHeight: LEAD.flat, letterSpacing: TRACK.normal,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{carry.title}</div>
      )}
      <DateDock carry slots={slots} title="どの日へ？" up={!!carry} hot={carry?.hot} here={hereKey} />
      <DateDock slots={slots} title={voicePick ? `「${voicePick.title}」はいつ？` : ""}
        up={!!voicePick && !assignFor} pick={pickVoice}
        onClose={() => { const c = voicePick; setVoicePick(null); if (c) setHidden((h) => { const n = new Set(h); n.delete(c.key); return n; }); }} />

      {/* 下の札（元に戻す）。 */}
      <div role="status" style={{
        position: "absolute", left: "50%", bottom: `calc(var(--nav-h) + ${SPACE.lg}px)`, zIndex: 9,
        transform: notice ? "translate(-50%, 0)" : `translate(-50%, ${SPACE.md}px)`, opacity: notice ? 1 : 0,
        pointerEvents: notice?.undo ? "auto" : "none",
        transition: "opacity var(--t-item) var(--ease-settle), transform var(--t-item) var(--ease-settle)",
        display: "flex", alignItems: "center", gap: SPACE.md, whiteSpace: "nowrap",
        background: INK, color: PAPER, borderRadius: RADIUS.pill, padding: `${SPACE.sm}px ${notice?.undo ? SPACE.sm : SPACE.lg}px ${SPACE.sm}px ${SPACE.lg}px`,
        fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.heavy, lineHeight: LEAD.flat, letterSpacing: TRACK.normal,
      }}>
        <span>{notice?.text}</span>
        {notice?.undo && (
          <button type="button" onClick={() => { notice.undo?.(); setNotice(null); haptic(10); }} style={{
            border: 0, borderRadius: RADIUS.pill, padding: `${SPACE.sm}px ${SPACE.md}px`, background: "rgba(250,250,249,0.16)", color: PAPER, cursor: "pointer",
            fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.heavy, lineHeight: LEAD.flat, letterSpacing: TRACK.normal,
          }}>元に戻す</button>
        )}
      </div>

      {drop && typeof document !== "undefined" && createPortal(
        <div aria-hidden style={{
          position: "fixed", left: 0, top: 0, zIndex: 70, pointerEvents: "none", width: DROP, height: DROP, borderRadius: RADIUS.circle,
          background: INK, transform: `translate(${drop.x - DROP / 2}px, ${drop.y - DROP / 2}px) scale(${drop.s.toFixed(3)})`,
        }} />, document.body)}

      {assignFor && (
        <AssignSheet title={assignFor.title} accent={TASK_FACE} value={assignFor.value} onPick={assignFor.put} onClose={() => setAssignFor(null)} />
      )}
      {open && (
        <TaskComposer key={open.id} data={open} mode="task"
          onCommit={(d) => patch(open.id, d)}
          onConfirm={(d) => { patch(open.id, d); setOpenId(null); finishOrRemove(open, true); }}
          onDelete={() => { setOpenId(null); finishOrRemove(open, false); }}
          onClose={(d) => { patch(open.id, d); setOpenId(null); }} />
      )}
    </div>
  );
}
