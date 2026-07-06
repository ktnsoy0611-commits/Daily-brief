"use client";

import { ChevronDown, Sprout, Trash2 } from "lucide-react";
import { useState } from "react";
import { Dot, Masthead, rowBtn } from "@/components/common";
import { BG, DISPLAY, GREEN, HAIRLINE, INK, NAV_OFFSET, PAPER, RUST, SANS, SERIF, SOFT_SHADOW_LG } from "@/lib/constants";
import { haptic, ratingLabel, shortDate } from "@/lib/helpers";
import type { Goal, TabProps } from "@/lib/types";

function GoalRow({ item, index, isOpen, onToggle, onRemove, draft, onDraftChange, onManualAdd }: {
  item: Goal; index: number; isOpen: boolean; onToggle: () => void; onRemove: () => void;
  draft: string; onDraftChange: (v: string) => void; onManualAdd: () => void;
}) {
  const latest = item.checkIns?.[0];
  return (
    <div style={{ borderTop: index === 0 ? "none" : `1px solid ${HAIRLINE}`, padding: "12px 2px" }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "baseline", gap: 12, cursor: "pointer" }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: GREEN, minWidth: 26, textAlign: "right" }}>{String(index + 1).padStart(2, "0")}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Sprout size={13} color={GREEN} style={{ flexShrink: 0 }} />
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 14.5, lineHeight: 1.5 }}>{item.title}</div>
          </div>
          <p style={{ fontSize: 12, color: latest ? "#4A4A44" : "#9A988E", lineHeight: 1.6, margin: "5px 0 0", fontStyle: latest ? "normal" : "italic" }}>
            {latest ? latest.text : "まだ記録がありません"}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Dot color={GREEN} label={shortDate(latest?.at ?? item.addedAt)} />
            {latest?.kind === "milestone" && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.05em", color: PAPER, background: RUST, borderRadius: 999, padding: "2px 7px" }}>{ratingLabel(latest.rating)}</span>}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginLeft: 38 }}>
        <button onClick={onToggle} style={{ ...rowBtn("transparent", "#5A5A54", "rgba(23,23,21,0.2)"), display: "inline-flex", alignItems: "center", gap: 5 }}>
          記録（{item.checkIns?.length ?? 0}）
          <ChevronDown size={12} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </button>
        <button onClick={onRemove} aria-label="削除" style={{ background: "none", border: "none", color: "#9A988E", cursor: "pointer", padding: 6, display: "flex" }}><Trash2 size={14} /></button>
      </div>

      <div style={{ display: "grid", gridTemplateRows: isOpen ? "1fr" : "0fr", transition: "grid-template-rows 0.26s cubic-bezier(0.32,0.72,0,1)" }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ marginTop: 12, marginLeft: 38 }}>
            {(item.checkIns ?? []).length === 0 ? (
              <p style={{ fontSize: 11.5, color: "#9A988E" }}>まだ記録がありません</p>
            ) : item.checkIns.map((ci) => (
              <div key={ci.id} style={{ padding: "8px 0", borderTop: `1px solid ${HAIRLINE}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 9.5, color: "#9A988E" }}>{shortDate(ci.at)}{ci.source === "prompted" && " ・ ブリーフより"}</span>
                  {ci.kind === "milestone" && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.05em", color: PAPER, background: RUST, borderRadius: 999, padding: "2px 7px" }}>{ratingLabel(ci.rating)}</span>}
                </div>
                <div style={{ fontSize: 12, color: "#4A4A44", lineHeight: 1.6 }}>{ci.text}</div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input value={draft} onChange={(e) => onDraftChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onManualAdd()}
                placeholder="今の様子を書き足す" style={{ flex: 1, border: "none", borderBottom: `1px solid ${INK}`, background: "transparent", fontFamily: SANS, fontSize: 12.5, padding: "6px 2px", outline: "none" }} />
              <button onClick={onManualAdd} style={rowBtn(INK, PAPER)}>記録</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 目標タブ: 終わりのない継続の記録。願望(ストック)とは別の独立したタブ。
export function GoalsTab({ appState, persist }: TabProps) {
  const [input, setInput] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState<Record<string, string>>({});

  const addGoal = () => {
    if (!input.trim()) return;
    haptic();
    const next = structuredClone(appState);
    next.goals = next.goals ?? [];
    next.goals.push({ id: `goal-${Date.now()}`, title: input.trim(), addedAt: new Date().toISOString(), checkIns: [] });
    persist(next);
    setInput("");
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

  const goalItems = (appState.goals ?? []).slice().sort((a, b) => new Date(b.checkIns?.[0]?.at ?? b.addedAt).getTime() - new Date(a.checkIns?.[0]?.at ?? a.addedAt).getTime());

  return (
    <>
      <Masthead title="目標" en="終わりのない目標を、ゆるく記録する" statValue={goalItems.length} statLabel="件" />

      <main style={{ flex: 1, paddingTop: 14, paddingBottom: 150 }}>
        {goalItems.length === 0 ? (
          <div style={{ padding: "40px 4px", textAlign: "center" }}>
            <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>まだ目標がありません</div>
            <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>ギターや読書のような、終わりのない目標を。</p>
          </div>
        ) : goalItems.map((g, i) => (
          <GoalRow key={g.id} item={g} index={i} isOpen={openId === g.id}
            onToggle={() => setOpenId(openId === g.id ? null : g.id)}
            onRemove={() => removeGoal(g.id)}
            draft={manualDraft[g.id] ?? ""} onDraftChange={(v) => setManualDraft((d) => ({ ...d, [g.id]: v }))}
            onManualAdd={() => addManualCheckIn(g.id)} />
        ))}
      </main>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: NAV_OFFSET, zIndex: 20, display: "flex", justifyContent: "center", background: `linear-gradient(to top, ${BG} 75%, rgba(239,237,230,0))`, paddingTop: 16 }}>
        <div style={{ width: "100%", maxWidth: 420, padding: "0 16px 10px" }}>
          <div style={{ display: "flex", gap: 8, background: PAPER, border: "none", borderRadius: 999, padding: "4px 4px 4px 18px", boxShadow: SOFT_SHADOW_LG }}>
            <input
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGoal()}
              placeholder="終わりのない目標を"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: SANS, fontSize: 13, color: INK, minWidth: 0 }} />
            <button onClick={addGoal} style={{ background: INK, color: PAPER, border: "none", borderRadius: 999, padding: "10px 18px", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>追加</button>
          </div>
        </div>
      </div>
    </>
  );
}
