"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { BottomSheet, OverlayCard } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { SectionLabel } from "@/components/common";
import { CARD_RADIUS, INK, LATIN, MUTED, PAPER, SANS, SECOND, SOFT_SHADOW } from "@/lib/constants";
import { haptic, ratingLabel, shortDate } from "@/lib/helpers";
import { LEAD, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
import type { AppState, CheckIn, Goal } from "@/lib/types";

// ★★★**ゴールは JOURNAL のログの節**（2026-09-28・第134巡にユーザー指定「**Explore のゴールはセクションとしては
//   削除。ブリーフの札として聞いてきて、勝手に記録され、それもログに行く。ゴールはジャーナルのログの方に
//   セクションを作る**」）。旧 `components/tabs/GoalsTab.tsx`（バインダーの棚）はここへ畳んで消した。
// ★1つのゴール ＝ 紙の札1枚（題・いちばん新しい記録・件数）。押すと記録の一覧（書き足す・閉じる・消す）。
// ★閉じたゴール（達成・諦め）は「おわったゴール」として下にまとめる。★区切りに線を引かない。

const KIND_LABEL: Partial<Record<NonNullable<CheckIn["kind"]>, string>> = {
  achieved: "達成", dropped: "諦めた", added: "立てた",
};

function AddGoalSheet({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <OverlayCard>
          <div style={{ fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.lead, lineHeight: LEAD.snug, marginBottom: SPACE.lg }}>ゴールを追加</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="最近、達成したいことは？"
            style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: `${SPACE.sm}px 0`, fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.text, outline: "none", marginBottom: SPACE.xl, background: "transparent" }} />
          <Button variant="primary" size="lg" disabled={!title.trim()} style={{ width: "100%" }}
            onClick={() => { if (!title.trim()) return; onAdd(title.trim()); requestClose(); }}>追加する</Button>
        </OverlayCard>
      )}
    </BottomSheet>
  );
}

function GoalDetailSheet({ goal, onRecord, onClose, onEnd, onRemove }: {
  goal: Goal;
  onRecord: (text: string) => void;
  onEnd: (status: Goal["status"]) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => { if (!draft.trim()) return; onRecord(draft.trim()); setDraft(""); };
  return (
    <BottomSheet onClose={onClose} maxHeight="76vh">
      <OverlayCard>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: SPACE.md, marginBottom: SPACE.lg }}>
          <div style={{ fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.lead, lineHeight: LEAD.snug, color: INK }}>{goal.title}</div>
          <button onClick={onRemove} aria-label="削除" style={{ flexShrink: 0, background: "none", border: "none", color: MUTED, cursor: "pointer", padding: SPACE.xs, display: "flex" }}><Trash2 size={16} /></button>
        </div>
        <SectionLabel text={`記録 ${goal.checkIns?.length ?? 0}`} style={{ marginBottom: SPACE.md }} />
        <div style={{ marginBottom: SPACE.lg, maxHeight: "40vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: SPACE.md }}>
          {(goal.checkIns ?? []).map((ci) => (
            <div key={ci.id}>
              <div style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, letterSpacing: TRACK.normal, color: MUTED, marginBottom: SPACE.xs }}>
                {shortDate(ci.at)}{ci.kind === "milestone" ? ` ・ ${ratingLabel(ci.rating)}` : ci.kind && KIND_LABEL[ci.kind] ? ` ・ ${KIND_LABEL[ci.kind]}` : ""}
              </div>
              <div style={{ fontSize: TYPE.body, fontWeight: WEIGHT.text, color: SECOND, lineHeight: LEAD.body }}>{ci.text}</div>
            </div>
          ))}
        </div>
        {!goal.status && (
          <div style={{ display: "flex", gap: SPACE.sm, marginBottom: SPACE.lg }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="今の様子を書き足す" style={{ flex: 1, border: "none", borderBottom: `1px solid ${INK}`, background: "transparent", fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.text, padding: `${SPACE.sm}px 0`, outline: "none" }} />
            <Button variant="primary" onClick={add}>記録</Button>
          </div>
        )}
        <div style={{ display: "flex", gap: SPACE.sm }}>
          {goal.status ? (
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => onEnd(undefined)}>進行中に戻す</Button>
          ) : (
            <>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => onEnd("achieved")}>達成した</Button>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => onEnd("dropped")}>諦める</Button>
            </>
          )}
        </div>
      </OverlayCard>
    </BottomSheet>
  );
}

function GoalRow({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  const last = goal.checkIns?.[0];
  const n = goal.checkIns?.length ?? 0;
  const tag = goal.status === "achieved" ? "ACHIEVED" : goal.status === "dropped" ? "DROPPED" : "GOAL";
  return (
    <button type="button" onClick={onOpen} style={{
      display: "flex", flexDirection: "column", gap: SPACE.xs, width: "100%", textAlign: "left", cursor: "pointer",
      background: PAPER, border: "none", borderRadius: CARD_RADIUS, boxShadow: SOFT_SHADOW, padding: SPACE.lg,
    }}>
      <span style={{ fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, letterSpacing: TRACK.caps, color: MUTED }}>
        {tag}{goal.endedAt ? ` ${shortDate(goal.endedAt)}` : ""}
      </span>
      <span style={{ fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.bold, lineHeight: LEAD.snug, color: INK }}>{goal.title}</span>
      <span style={{ fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.text, lineHeight: LEAD.body, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {last ? `${shortDate(last.at)} ・ ${last.text}` : "まだ記録がありません"}{n > 1 ? `（ほか ${n - 1}件）` : ""}
      </span>
    </button>
  );
}

export function GoalsSection({ appState, persist }: { appState: AppState; persist: (s: AppState) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const goals = appState.goals ?? [];
  const recent = (g: Goal) => new Date(g.checkIns?.[0]?.at ?? g.addedAt).getTime();
  const active = goals.filter((g) => !g.status).sort((a, b) => recent(b) - recent(a));
  const ended = goals.filter((g) => g.status).sort((a, b) => new Date(b.endedAt ?? 0).getTime() - new Date(a.endedAt ?? 0).getTime());
  const open = goals.find((g) => g.id === openId) ?? null;

  const edit = (fn: (next: AppState) => void) => { haptic(); const next = structuredClone(appState); next.goals = next.goals ?? []; fn(next); persist(next); };
  const addGoal = (title: string) => edit((next) => {
    const now = new Date().toISOString();
    next.goals.push({ id: `goal-${Date.now()}`, title, addedAt: now, checkIns: [{ id: `ci-${Date.now()}`, at: now, text: "ゴールを立てた", source: "manual", kind: "added" }] });
  });
  const record = (id: string, text: string) => edit((next) => {
    const g = next.goals.find((x) => x.id === id);
    if (!g) return;
    g.checkIns = g.checkIns ?? [];
    g.checkIns.unshift({ id: `ci-${Date.now()}`, at: new Date().toISOString(), text, source: "manual" });
  });
  const end = (id: string, status: Goal["status"]) => edit((next) => {
    const g = next.goals.find((x) => x.id === id);
    if (!g) return;
    const now = new Date().toISOString();
    if (status) {
      g.checkIns = g.checkIns ?? [];
      g.checkIns.unshift({ id: `ci-${Date.now()}`, at: now, text: status === "achieved" ? "達成した" : "諦めた", source: "manual", kind: status });
      g.status = status; g.endedAt = now;
    } else { delete g.status; delete g.endedAt; }
  });
  const remove = (id: string) => { edit((next) => { next.goals = next.goals.filter((g) => g.id !== id); }); setOpenId(null); };

  return (
    <section>
      <SectionLabel text="GOALS" style={{ margin: `0 ${SPACE.xs}px ${SPACE.md}px` }} />
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
        {active.map((g) => <GoalRow key={g.id} goal={g} onOpen={() => setOpenId(g.id)} />)}
        <Button variant="ghost" style={{ alignSelf: "flex-start" }} onClick={() => setAdding(true)}>ゴールを追加</Button>
      </div>
      {ended.length > 0 && (
        <>
          <SectionLabel text="おわったゴール" style={{ margin: `${SPACE.xl}px ${SPACE.xs}px ${SPACE.md}px` }} />
          <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
            {ended.map((g) => <GoalRow key={g.id} goal={g} onOpen={() => setOpenId(g.id)} />)}
          </div>
        </>
      )}
      {adding && <AddGoalSheet onAdd={addGoal} onClose={() => setAdding(false)} />}
      {open && (
        <GoalDetailSheet key={open.id} goal={open} onClose={() => setOpenId(null)}
          onRecord={(t) => record(open.id, t)} onEnd={(s) => end(open.id, s)} onRemove={() => remove(open.id)} />
      )}
    </section>
  );
}
