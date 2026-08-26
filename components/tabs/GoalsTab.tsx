"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { BottomSheet, OverlayCard } from "@/components/BottomSheet";
import { GoalBinderCard, goalAccent, GOAL_BASE } from "@/components/Binder";
import { Button } from "@/components/Button";
import { AddCardTile, Masthead } from "@/components/common";
import { appTitle } from "@/lib/apps";
import { GOAL_CARD_ASPECT, HAIRLINE, INK, MUTED, PAPER, RUST, SANS, SECOND } from "@/lib/constants";
import { haptic, ratingLabel, shortDate } from "@/lib/helpers";
import type { Goal, TabProps } from "@/lib/types";

function AddGoalSheet({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <OverlayCard>
          <div style={{ fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.lead, marginBottom: SPACE.lg }}>ゴールを追加</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="終わりのないゴールを"
            style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: `${SPACE.sm}px 0`, fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.text, outline: "none", marginBottom: SPACE.xl, background: "transparent" }} />
          <button onClick={() => { if (!title.trim()) return; onAdd(title.trim()); requestClose(); }} disabled={!title.trim()} style={{
            width: "100%", padding: `${SPACE.md}px 0`, background: title.trim() ? INK : "rgba(26,26,24,0.2)", color: PAPER, border: "none",
            borderRadius: RADIUS.pill, cursor: title.trim() ? "pointer" : "default", fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.bold, letterSpacing: TRACK.caps,
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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: SPACE.lg }}>
          <div style={{ fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.lead, lineHeight: LEAD.snug }}>{goal.title}</div>
          <button onClick={onRemove} aria-label="削除" style={{ flexShrink: 0, background: "none", border: "none", color: MUTED, cursor: "pointer", padding: SPACE.xs, display: "flex" }}><Trash2 size={16} /></button>
        </div>
        <div style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.text, letterSpacing: TRACK.wide, color: MUTED, marginBottom: SPACE.md }}>記録（{goal.checkIns?.length ?? 0}）</div>
        {(goal.checkIns ?? []).length === 0 ? (
          <p style={{ fontSize: TYPE.small, fontWeight: WEIGHT.text, color: MUTED, marginBottom: SPACE.lg }}>まだ記録がありません</p>
        ) : (
          <div style={{ marginBottom: SPACE.lg, maxHeight: "40vh", overflowY: "auto" }}>
            {goal.checkIns.map((ci) => (
              <div key={ci.id} style={{ padding: `${SPACE.sm}px 0`, borderTop: `1px solid ${HAIRLINE}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.xs }}>
                  <span style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.text, color: MUTED }}>{shortDate(ci.at)}{ci.source === "prompted" && " ・ ブリーフより"}</span>
                  {ci.kind === "milestone" && <span style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.bold, letterSpacing: TRACK.normal, color: PAPER, background: RUST, borderRadius: RADIUS.pill, padding: `0 ${SPACE.sm}px` }}>{ratingLabel(ci.rating)}</span>}
                </div>
                <div style={{ fontSize: TYPE.body, fontWeight: WEIGHT.text, color: SECOND, lineHeight: LEAD.body }}>{ci.text}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: SPACE.sm }}>
          <input value={draft} onChange={(e) => onDraftChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onManualAdd()}
            placeholder="今の様子を書き足す" style={{ flex: 1, border: "none", borderBottom: `1px solid ${INK}`, background: "transparent", fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.text, padding: `${SPACE.sm}px 0`, outline: "none" }} />
          <Button variant="primary" onClick={onManualAdd}>記録</Button>
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
  // ★バインダーを閉じた直後(BottomSheetの220msのフェードアウト中)に同じ
  // バインダーを再タップすると、openGoalIdは既にそのidのまま(実際にnull
  // になるのは閉じるアニメーション終了後)のため、同じ値をsetStateしても
  // Reactは「変化なし」とみなして再レンダーをスキップする。以前はこれを
  // 「一度nullを経由させてから次のフレームで入れ直す」という値の変化を
  // 捏造するハックで回避していたが、rAFの1フレーム分の遅延が生じる上、
  // 値の等価性判定に依存する不安定な仕組み自体は残っていたため、実機では
  // 「時間を置かないと開けない」「反応するまで2〜3回かかる」という
  // 再発報告があった。根本的には「このタップで開くべきシートの実体」を
  // 値(id)の変化ではなく、タップそのものの発生回数で管理すべきだった。
  // タップのたびに単調増加するnonceをキーの一部に含めることで、たとえ
  // idが直前と同じでも(古いBottomSheetインスタンスの220ms閉じるタイマーが
  // まだ生きていても)Reactに必ず「別のシート」として認識させ、古い
  // インスタンスを即座に破棄(そのuseEffectクリーンアップで古いタイマーも
  // 確実に解除される)して新しいインスタンスを確実にマウントする。
  // 値の等価性判定に依存する分岐が無くなるため、タイミング次第で反応が
  // 遅れたり複数回タップが必要になったりする余地が構造的に無くなる。
  const [openNonce, setOpenNonce] = useState(0);
  const openGoalCard = (id: string) => {
    setOpenGoalId(id);
    setOpenNonce((n) => n + 1);
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
      <Masthead title={appTitle("life")} corner={profileButton} />

      {/* ★左右のパディングは持たない（持ち主は AppShell の 16px だけ。design.md §2）。
          第66巡まで「16(AppShell) + 8(ここ) + 9.8(88% を中央寄せ)」の3段重ねで
          バインダーの左端が 33.8px にあり、画面に縦の柵が2本立っていた。 */}
      <main style={{ flex: 1, paddingTop: SPACE.lg, paddingBottom: SPACE.xxl }}>
        {/* ゴールはGoalBinderCard(Binder.tsx参照)で表示する。表紙は左端の
            蝶番を軸にわずかに傾け、その下に裏表紙(表紙より暗い色の角丸の
            四角形)が表紙の右(開く側)の縁からほんの少しだけ覗く、という
            「机の上でノートの表紙だけ少し開いて浮いている」構図。 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: SPACE.xxl, columnGap: SPACE.lg, justifyItems: "stretch" }}>
          {goalItems.map((g) => {
            const count = g.checkIns?.length ?? 0;
            return (
              <GoalBinderCard
                key={g.id} width="100%" aspect={GOAL_CARD_ASPECT}
                color={GOAL_BASE} eyebrowLabel="GOAL" title={g.title} accent={goalAccent(g.id)}
                onClick={() => openGoalCard(g.id)}
                // 表紙にはGOAL・タイトル・記録の件数だけを表示する。以前は
                // 最新の記録内容のプレビュー文+「タップで見る」も出しており、
                // タイトルが長いカードでは表紙の限られた高さの中でGOALラベル
                // と文字が被る原因になっていた。件数だけのシンプルな1行に絞る。
                footer={
                  <div style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.bold, color: "rgba(250,250,249,0.7)", borderTop: "1px solid rgba(250,250,249,0.3)", paddingTop: SPACE.sm }}>
                    {count > 0 ? `記録 ${count}件` : "まだ記録がありません"}
                  </div>
                }
              />
            );
          })}
          <AddCardTile aspect={GOAL_CARD_ASPECT} size="100%" onClick={() => setAdding(true)} label="ゴールを追加" />
        </div>
      </main>

      {adding && <AddGoalSheet onAdd={addGoal} onClose={() => setAdding(false)} />}
      {openGoal && (
        <GoalDetailSheet key={`${openGoal.id}-${openNonce}`} goal={openGoal} draft={manualDraft[openGoal.id] ?? ""} onDraftChange={(v) => setManualDraft((d) => ({ ...d, [openGoal.id]: v }))}
          onManualAdd={() => addManualCheckIn(openGoal.id)} onRemove={() => removeGoal(openGoal.id)} onClose={() => setOpenGoalId(null)} />
      )}
    </>
  );
}
