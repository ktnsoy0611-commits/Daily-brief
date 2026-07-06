"use client";

import { CheckCircle2, ChevronDown, Eye, MapPin, ShoppingBag, Sprout, Trash2 } from "lucide-react";
import { useState, type ComponentType } from "react";
import { Dot, Masthead, rowBtn } from "@/components/common";
import { BG, CATEGORIES, DISPLAY, GREEN, HAIRLINE, INK, PAPER, RUST, SANS, SERIF, catOf } from "@/lib/constants";
import { haptic, ratingLabel, shortDate } from "@/lib/helpers";
import type { CategoryId, Goal, TabProps, Wish } from "@/lib/types";

const CATEGORY_ICONS: Record<CategoryId, ComponentType<{ size?: number }>> = {
  do: CheckCircle2, buy: ShoppingBag, watch: Eye, go: MapPin,
};

function WishRow({ item, index, isOpen, onToggle, onFulfill, onRemove }: {
  item: Wish; index: number; isOpen: boolean; onToggle: () => void; onFulfill: () => void; onRemove: () => void;
}) {
  const cat = catOf(item.categoryId ?? "do");
  return (
    <div>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "12px 2px", cursor: "pointer", borderTop: index === 0 ? "none" : `1px solid ${HAIRLINE}` }}>
        <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 700, fontSize: 15, color: cat.color, minWidth: 26, textAlign: "right" }}>{String(index + 1).padStart(2, "0")}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 14.5, lineHeight: 1.5 }}>{item.title}</div>
          <div style={{ marginTop: 4 }}><Dot color={cat.color} label={`${cat.label} ・ ${shortDate(item.addedAt)}`} /></div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateRows: isOpen ? "1fr" : "0fr", transition: "grid-template-rows 0.22s cubic-bezier(0.32,0.72,0,1)" }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 2px 12px 38px" }}>
            <button onClick={onFulfill} style={rowBtn(INK, PAPER)}>叶えた</button>
            <button onClick={onRemove} aria-label="削除" style={{ background: "none", border: "none", color: RUST, cursor: "pointer", padding: 6, display: "flex" }}><Trash2 size={15} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoalRow({ item, index, isOpen, onToggle, onRemove, draft, onDraftChange, onManualAdd }: {
  item: Goal; index: number; isOpen: boolean; onToggle: () => void; onRemove: () => void;
  draft: string; onDraftChange: (v: string) => void; onManualAdd: () => void;
}) {
  const latest = item.checkIns?.[0];
  return (
    <div style={{ borderTop: index === 0 ? "none" : `1px solid ${HAIRLINE}`, padding: "12px 2px" }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "baseline", gap: 12, cursor: "pointer" }}>
        <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 700, fontSize: 15, color: GREEN, minWidth: 26, textAlign: "right" }}>{String(index + 1).padStart(2, "0")}</span>
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

// 願望タブ: 「願望」(カテゴリ付き・叶えたら完了)と「目標」(カテゴリなし・
// 終わりがなくチェックインが積み上がる)を上部の1つの切り替えで行き来する。
// 今見ているモードがそのまま追加対象になるため、フィルターと入力の
// 二重管理が起きない。データはwishes/goals別配列のまま(ブリーフの
// 育成カード生成など、goals配列に依存する既存ロジックへの影響を避けるため)。
export function WishTab({ appState, persist, showToast }: TabProps) {
  const [mode, setMode] = useState<"wish" | "goal">("wish");
  const [categoryFilter, setCategoryFilter] = useState<"all" | CategoryId>("all");
  const [input, setInput] = useState("");
  const [inputCat, setInputCat] = useState<CategoryId>("do");
  const [openId, setOpenId] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState<Record<string, string>>({});

  const addWish = () => {
    if (!input.trim()) return;
    haptic();
    const next = structuredClone(appState);
    next.wishes.unshift({ id: `wish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: input.trim(), category: catOf(inputCat).label, categoryId: inputCat, status: "stock", addedAt: new Date().toISOString() });
    persist(next);
    showToast("願望をストックしました");
    setInput("");
  };
  const addGoal = () => {
    if (!input.trim()) return;
    haptic();
    const next = structuredClone(appState);
    next.goals = next.goals ?? [];
    next.goals.push({ id: `goal-${Date.now()}`, title: input.trim(), addedAt: new Date().toISOString(), checkIns: [] });
    persist(next);
    showToast("目標を登録しました");
    setInput("");
  };
  const updateWish = (id: string, patch: Partial<Wish>) => {
    const next = structuredClone(appState);
    const w = next.wishes.find((x) => x.id === id);
    if (w) Object.assign(w, patch);
    persist(next);
    setOpenId(null);
  };
  const removeWish = (id: string) => {
    const next = structuredClone(appState);
    next.wishes = next.wishes.filter((x) => x.id !== id);
    persist(next);
    setOpenId(null);
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

  const wishItems = appState.wishes.filter((w) => w.status === "stock" && (categoryFilter === "all" || (w.categoryId ?? "do") === categoryFilter));
  const goalItems = (appState.goals ?? []).slice().sort((a, b) => new Date(b.checkIns?.[0]?.at ?? b.addedAt).getTime() - new Date(a.checkIns?.[0]?.at ?? a.addedAt).getTime());

  return (
    <>
      <Masthead title="願望" en="WISHES" statValue={mode === "wish" ? wishItems.length : goalItems.length} statLabel="件" />

      <div style={{ display: "flex", gap: 4, padding: "14px 0 10px", background: "rgba(23,23,21,0.05)", borderRadius: 999, marginTop: 4 }}>
        {([{ id: "wish" as const, label: "願望" }, { id: "goal" as const, label: "目標" }]).map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            flex: 1, padding: "9px 0", borderRadius: 999, cursor: "pointer", fontFamily: SERIF, fontSize: 13, fontWeight: 700,
            background: mode === m.id ? INK : "transparent", color: mode === m.id ? PAPER : "#5A5A54", border: "none",
            transition: "background 0.18s, color 0.18s",
          }}>{m.label}</button>
        ))}
      </div>

      {mode === "wish" && (
        <nav style={{ display: "flex", gap: 6, padding: "10px 0 4px", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {([{ id: "all" as const, label: "すべて", Icon: undefined }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, Icon: CATEGORY_ICONS[c.id] }))]).map((c) => (
            <button key={c.id} onClick={() => setCategoryFilter(c.id)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, background: categoryFilter === c.id ? INK : "transparent", color: categoryFilter === c.id ? PAPER : "#5A5A54", border: categoryFilter === c.id ? `1.5px solid ${INK}` : "1.5px solid rgba(23,23,21,0.2)" }}>
              {c.Icon && <c.Icon size={12} />}{c.label}
            </button>
          ))}
        </nav>
      )}

      <main style={{ flex: 1, paddingTop: 8, paddingBottom: 150 }}>
        {mode === "wish" ? (
          wishItems.length === 0 ? (
            <div style={{ padding: "40px 4px", textAlign: "center" }}>
              <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>まだ何もありません</div>
              <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>ふと思った願望を、大小問わず。</p>
            </div>
          ) : wishItems.map((w, i) => (
            <WishRow key={w.id} item={w} index={i} isOpen={openId === w.id}
              onToggle={() => setOpenId(openId === w.id ? null : w.id)}
              onFulfill={() => updateWish(w.id, { status: "fulfilled", fulfilledAt: new Date().toISOString() })}
              onRemove={() => removeWish(w.id)} />
          ))
        ) : (
          goalItems.length === 0 ? (
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
          ))
        )}
      </main>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 60, zIndex: 20, display: "flex", justifyContent: "center", background: `linear-gradient(to top, ${BG} 75%, rgba(239,237,230,0))`, paddingTop: 16 }}>
        <div style={{ width: "100%", maxWidth: 420, padding: "0 16px 10px" }}>
          {mode === "wish" && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              {CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICONS[c.id];
                return (
                  <button key={c.id} onClick={() => setInputCat(c.id)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, padding: "4px 10px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontWeight: 700, background: inputCat === c.id ? c.color : "transparent", color: inputCat === c.id ? PAPER : "#7A7A72", border: `1px solid ${inputCat === c.id ? c.color : "rgba(23,23,21,0.2)"}` }}>
                    <Icon size={11} />{c.label}
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, background: PAPER, border: `1.5px solid ${INK}`, borderRadius: 999, padding: "4px 4px 4px 18px", boxShadow: "0 6px 20px rgba(23,23,21,0.1)" }}>
            <input
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (mode === "wish" ? addWish() : addGoal())}
              placeholder={mode === "wish" ? "ふと思った願望を、なんでも" : "終わりのない目標を"}
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: SANS, fontSize: 13, color: INK, minWidth: 0 }} />
            <button onClick={mode === "wish" ? addWish : addGoal} style={{ background: INK, color: PAPER, border: "none", borderRadius: 999, padding: "10px 18px", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>追加</button>
          </div>
        </div>
      </div>
    </>
  );
}
