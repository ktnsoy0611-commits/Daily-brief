"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Masthead, rowBtn } from "@/components/common";
import { BG, HAIRLINE, INK, PAPER, RUST, SANS, SERIF } from "@/lib/constants";
import { haptic, ratingLabel, shortDate } from "@/lib/helpers";
import type { TabProps } from "@/lib/types";

// 目標: ギターや読書のような終わりのない自己研鑽のための場所。
// タグ付き入力を持つ願望とは意図的に切り離し、タイトルだけの単純な入力にする。
// AIによる分類・分解は一切行わない。ブリーフの問いかけに答える、または
// 自分で書き足す、という2つの方法で同じ記録ログに積み上がっていく。
export function GoalsTab({ appState, persist }: TabProps) {
  const [title, setTitle] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState<Record<string, string>>({});

  const goals = (appState.goals ?? []).slice().sort((a, b) => {
    const la = a.checkIns?.[0]?.at ?? a.addedAt;
    const lb = b.checkIns?.[0]?.at ?? b.addedAt;
    return new Date(lb).getTime() - new Date(la).getTime();
  });

  const addGoal = () => {
    if (!title.trim()) return;
    haptic();
    const next = structuredClone(appState);
    next.goals = next.goals ?? [];
    next.goals.push({ id: `goal-${Date.now()}`, title: title.trim(), addedAt: new Date().toISOString(), checkIns: [] });
    persist(next);
    setTitle("");
  };
  const removeGoal = (id: string) => {
    const next = structuredClone(appState);
    next.goals = next.goals.filter((g) => g.id !== id);
    persist(next);
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

  return (
    <>
      <Masthead title="目標" en="LONG-TERM GOALS" statValue={goals.length} statLabel="件の目標" />
      <main style={{ flex: 1, paddingTop: 18, paddingBottom: 150 }}>
        <p style={{ fontSize: 11.5, color: "#9A988E", lineHeight: 1.8, margin: "0 0 18px" }}>
          ギターや読書のように、終わりのない自己研鑽のための場所です。ブリーフでときどき「最近どうですか？」と聞かれるので、答えるだけで記録が積み上がります。もちろん、自分からいつでも書き足せます。
        </p>
        {goals.length === 0 ? (
          <div style={{ padding: "30px 4px", textAlign: "center" }}>
            <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700 }}>まだ目標がありません。</div>
          </div>
        ) : goals.map((g, i) => {
          const latest = g.checkIns?.[0];
          const expanded = expandedId === g.id;
          return (
            <div key={g.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}`, padding: "14px 2px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 15 }}>{g.title}</div>
                <button onClick={() => removeGoal(g.id)} style={{ background: "none", border: "none", color: "#9A988E", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>削除</button>
              </div>
              <p style={{ fontSize: 12.5, color: latest ? "#4A4A44" : "#9A988E", lineHeight: 1.7, margin: "8px 0 0", fontStyle: latest ? "normal" : "italic" }}>
                {latest ? latest.text : "まだ記録がありません。"}
              </p>
              {latest && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 9.5, color: "#9A988E" }}>{shortDate(latest.at)}</span>
                  {latest.kind === "milestone" && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.05em", color: PAPER, background: RUST, borderRadius: 999, padding: "2px 7px" }}>{ratingLabel(latest.rating)}</span>}
                </div>
              )}

              <button onClick={() => setExpandedId(expanded ? null : g.id)} style={{ ...rowBtn("transparent", "#5A5A54", "rgba(23,23,21,0.2)"), marginTop: 10, display: "inline-flex", alignItems: "center", gap: 5 }}>
                これまでの記録（{g.checkIns?.length ?? 0}）
                <ChevronDown size={12} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </button>

              {expanded && (
                <div style={{ marginTop: 12 }}>
                  {(g.checkIns ?? []).length === 0 ? (
                    <p style={{ fontSize: 11.5, color: "#9A988E" }}>まだ記録がありません。</p>
                  ) : g.checkIns.map((ci) => (
                    <div key={ci.id} style={{ padding: "8px 0", borderTop: `1px solid ${HAIRLINE}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 9.5, color: "#9A988E" }}>{shortDate(ci.at)}{ci.source === "prompted" && " ・ ブリーフより"}</span>
                        {ci.kind === "milestone" && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.05em", color: PAPER, background: RUST, borderRadius: 999, padding: "2px 7px" }}>{ratingLabel(ci.rating)}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#4A4A44", lineHeight: 1.6 }}>{ci.text}</div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <input value={manualDraft[g.id] ?? ""} onChange={(e) => setManualDraft((d) => ({ ...d, [g.id]: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addManualCheckIn(g.id)}
                      placeholder="今の様子を書き足す" style={{ flex: 1, border: "none", borderBottom: `1px solid ${INK}`, background: "transparent", fontFamily: SANS, fontSize: 12.5, padding: "6px 2px", outline: "none" }} />
                    <button onClick={() => addManualCheckIn(g.id)} style={rowBtn(INK, PAPER)}>記録</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </main>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 60, zIndex: 20, display: "flex", justifyContent: "center", background: `linear-gradient(to top, ${BG} 75%, rgba(239,237,230,0))`, paddingTop: 16 }}>
        <div style={{ width: "100%", maxWidth: 420, padding: "0 16px 10px" }}>
          <div style={{ display: "flex", gap: 8, background: PAPER, border: `1.5px solid ${INK}`, borderRadius: 999, padding: "4px 4px 4px 18px", boxShadow: "0 6px 20px rgba(23,23,21,0.1)" }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addGoal()} placeholder="ギター、読書、筋トレ…終わりのない目標を"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: SANS, fontSize: 13, minWidth: 0 }} />
            <button onClick={addGoal} style={{ background: INK, color: PAPER, border: "none", borderRadius: 999, padding: "10px 18px", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>追加</button>
          </div>
        </div>
      </div>
    </>
  );
}
