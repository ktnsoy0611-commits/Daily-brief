"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { BottomSheet, OverlayCard } from "@/components/BottomSheet";
import { GoalBinderCard, goalAccent, GOAL_BASE } from "@/components/Binder";
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

  // ★バインダーを閉じた直後(BottomSheetの220msのフェードアウト中)に
  // 同じバインダーを再タップすると、openGoalIdは既にそのidのまま(実際に
  // nullになるのは閉じるアニメーション終了後)なので、同じ値をsetState
  // してもReactは「変化なし」とみなして無視し、シートが開き直らない
  // まま数百ms後に元の閉じる処理だけが完了して終わる、という不具合が
  // あった。既に同じidが指定されている場合は一度nullを経由させてから
  // 次のフレームで入れ直すことで、値としては異なる更新を強制し、
  // 確実に(古いシートを破棄して)新しいシートを開き直す。
  const openGoalCard = (id: string) => {
    setOpenGoalId((prev) => {
      if (prev === id) {
        requestAnimationFrame(() => setOpenGoalId(id));
        return null;
      }
      return id;
    });
  };

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

      <main style={{ flex: 1, paddingTop: 18, paddingBottom: 32, paddingLeft: 8, paddingRight: 8 }}>
        {/* ゴールはGoalBinderCard(Binder.tsx参照)で表示する。表紙は左端の
            蝶番を軸にわずかに傾け、その下に裏表紙(表紙より暗い色の角丸の
            四角形)が表紙の右(開く側)の縁からほんの少しだけ覗く、という
            「机の上でノートの表紙だけ少し開いて浮いている」構図。 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 30, columnGap: 14, justifyItems: "center" }}>
          {goalItems.map((g) => {
            const count = g.checkIns?.length ?? 0;
            return (
              <GoalBinderCard
                key={g.id} width="88%" aspect={GOAL_CARD_ASPECT}
                color={GOAL_BASE} eyebrowLabel="GOAL" title={g.title} accent={goalAccent(g.id)}
                onClick={() => openGoalCard(g.id)}
                // 表紙にはGOAL・タイトル・記録の件数だけを表示する。以前は
                // 最新の記録内容のプレビュー文+「タップで見る」も出しており、
                // タイトルが長いカードでは表紙の限られた高さの中でGOALラベル
                // と文字が被る原因になっていた。件数だけのシンプルな1行に絞る。
                footer={
                  <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(253,251,245,0.7)", borderTop: "1px solid rgba(253,251,245,0.3)", paddingTop: 6 }}>
                    {count > 0 ? `記録 ${count}件` : "まだ記録がありません"}
                  </div>
                }
              />
            );
          })}
          <AddCardTile aspect={GOAL_CARD_ASPECT} size="88%" onClick={() => setAdding(true)} label="ゴールを追加" />
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
