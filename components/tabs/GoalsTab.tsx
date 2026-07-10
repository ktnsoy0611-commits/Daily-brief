"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { BottomSheet, OverlayCard } from "@/components/BottomSheet";
import { Binder3D, goalAccent, GOAL_BASE } from "@/components/Binder";
import { AddCardTile, Masthead, rowBtn } from "@/components/common";
import { GOAL_CARD_ASPECT, HAIRLINE, INK, PAPER, RUST, SANS } from "@/lib/constants";
import { haptic, ratingLabel, shortDate } from "@/lib/helpers";
import type { Goal, TabProps } from "@/lib/types";

function AddGoalSheet({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <OverlayCard>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>ゴールを追加</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="終わりのないゴールを"
            style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 15, outline: "none", marginBottom: 20, background: "transparent" }} />
          <button onClick={() => { if (!title.trim()) return; onAdd(title.trim()); requestClose(); }} disabled={!title.trim()} style={{
            width: "100%", padding: "13px 0", background: title.trim() ? INK : "rgba(23,23,21,0.2)", color: PAPER, border: "none",
            borderRadius: 999, cursor: title.trim() ? "pointer" : "default", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
          }}>追加する</button>
        </OverlayCard>
      )}
    </BottomSheet>
  );
}

function GoalDetailSheet({ goal, draft, onDraftChange, onManualAdd, onRemove, onClose }: {
  goal: Goal; draft: string; onDraftChange: (v: string) => void; onManualAdd: () => void; onRemove: () => void; onClose: () => void;
}) {
  return (
    <BottomSheet onClose={onClose} maxHeight="76vh">
      <OverlayCard>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, lineHeight: 1.4 }}>{goal.title}</div>
          <button onClick={onRemove} aria-label="削除" style={{ flexShrink: 0, background: "none", border: "none", color: "#9A988E", cursor: "pointer", padding: 4, display: "flex" }}><Trash2 size={16} /></button>
        </div>
        <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#9A988E", marginBottom: 10 }}>記録（{goal.checkIns?.length ?? 0}）</div>
        {(goal.checkIns ?? []).length === 0 ? (
          <p style={{ fontSize: 11.5, color: "#9A988E", marginBottom: 16 }}>まだ記録がありません</p>
        ) : (
          <div style={{ marginBottom: 16, maxHeight: "40vh", overflowY: "auto" }}>
            {goal.checkIns.map((ci) => (
              <div key={ci.id} style={{ padding: "8px 0", borderTop: `1px solid ${HAIRLINE}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 9.5, color: "#9A988E" }}>{shortDate(ci.at)}{ci.source === "prompted" && " ・ ブリーフより"}</span>
                  {ci.kind === "milestone" && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.05em", color: PAPER, background: RUST, borderRadius: 999, padding: "2px 7px" }}>{ratingLabel(ci.rating)}</span>}
                </div>
                <div style={{ fontSize: 12, color: "#4A4A44", lineHeight: 1.6 }}>{ci.text}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input value={draft} onChange={(e) => onDraftChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onManualAdd()}
            placeholder="今の様子を書き足す" style={{ flex: 1, border: "none", borderBottom: `1px solid ${INK}`, background: "transparent", fontFamily: SANS, fontSize: 12.5, padding: "6px 2px", outline: "none" }} />
          <button onClick={onManualAdd} style={rowBtn(INK, PAPER)}>記録</button>
        </div>
      </OverlayCard>
    </BottomSheet>
  );
}

// ゴールタブ: 終わりのない継続の記録。カードは2列グリッドで並び、他のカード
// (比率3:4)とは違う比率(3:5)・色で目標カードだと視覚的にわかるようにする。
// 追加は末尾の＋タイルから。
export function GoalsTab({ appState, persist, profileButton }: TabProps) {
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [manualDraft, setManualDraft] = useState<Record<string, string>>({});

  const addGoal = (title: string) => {
    haptic();
    const next = structuredClone(appState);
    next.goals = next.goals ?? [];
    next.goals.push({ id: `goal-${Date.now()}`, title, addedAt: new Date().toISOString(), checkIns: [] });
    persist(next);
  };
  const removeGoal = (id: string) => {
    const next = structuredClone(appState);
    next.goals = next.goals.filter((g) => g.id !== id);
    persist(next);
    setOpenGoalId(null);
  };
  const addManualCheckIn = (goalId: string) => {
    const text = (manualDraft[goalId] ?? "").trim();
    if (!text) return;
    haptic();
    const next = structuredClone(appState);
    const g = next.goals.find((x) => x.id === goalId);
    if (!g) return;
    g.checkIns = g.checkIns ?? [];
    g.checkIns.unshift({ id: `ci-${Date.now()}`, at: new Date().toISOString(), text, source: "manual" });
    persist(next);
    setManualDraft((d) => ({ ...d, [goalId]: "" }));
  };

  const goalItems = (appState.goals ?? []).slice().sort((a, b) => new Date(b.checkIns?.[0]?.at ?? b.addedAt).getTime() - new Date(a.checkIns?.[0]?.at ?? a.addedAt).getTime());
  const openGoal = goalItems.find((g) => g.id === openGoalId) ?? null;

  return (
    <>
      <Masthead title="ゴール" statValue={goalItems.length} statLabel="件" corner={profileButton} />

      <main style={{ flex: 1, paddingTop: 18, paddingBottom: 32 }}>
        {/* ゴールもアプリ共通のBinder3D(表紙+背表紙を持つリングバインダー)で
            統一する。以前は専用のGoalCardを使っており、アーカイブタブの棚と
            見た目が食い違っていた。グリッドでは常に表紙が正面(rotateY:0)
            を向いた状態で並べ、タイトルを読み取りやすくしている。 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {goalItems.map((g) => {
            const latest = g.checkIns?.[0];
            const count = g.checkIns?.length ?? 0;
            return (
              <Binder3D
                key={g.id} width="100%" aspect={GOAL_CARD_ASPECT} rotateY={0} count={count}
                color={GOAL_BASE} eyebrowLabel="GOAL" title={g.title} accent={goalAccent(g.id)}
                onClick={() => setOpenGoalId(g.id)}
                footer={
                  <div>
                    {latest && (
                      <p style={{ margin: "0 0 5px", fontSize: 9.5, lineHeight: 1.4, color: "rgba(253,251,245,0.8)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{latest.text}</p>
                    )}
                    <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(253,251,245,0.7)", borderTop: "1px solid rgba(253,251,245,0.3)", paddingTop: 6 }}>
                      {count > 0 ? `記録 ${count}件・タップで見る` : "まだ記録がありません"}
                    </div>
                  </div>
                }
              />
            );
          })}
          <AddCardTile aspect={GOAL_CARD_ASPECT} onClick={() => setAdding(true)} label="ゴールを追加" />
        </div>
      </main>

      {adding && <AddGoalSheet onAdd={addGoal} onClose={() => setAdding(false)} />}
      {openGoal && (
        <GoalDetailSheet goal={openGoal} draft={manualDraft[openGoal.id] ?? ""} onDraftChange={(v) => setManualDraft((d) => ({ ...d, [openGoal.id]: v }))}
          onManualAdd={() => addManualCheckIn(openGoal.id)} onRemove={() => removeGoal(openGoal.id)} onClose={() => setOpenGoalId(null)} />
      )}
    </>
  );
}
