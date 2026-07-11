"use client";

import { useState } from "react";
import { rowBtn } from "@/components/common";
import { HAIRLINE, INK, PAPER, SANS, SERIF, catOf } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import type { AppState } from "@/lib/types";

export function ProfileTab({ appState, persist, onClose }: {
  appState: AppState;
  persist: (next: AppState) => void;
  onClose: () => void;
}) {
  const [editingFocus, setEditingFocus] = useState(false);
  const [focusDraft, setFocusDraft] = useState(appState.profile?.currentFocus ?? "");
  const [srcInput, setSrcInput] = useState("");

  const interests = appState.profile?.interests ?? [];
  const sources = appState.sources ?? [];
  const weightSize = (w: number) => Math.min(11 + w * 1.4, 16);

  const saveFocus = () => {
    const next = structuredClone(appState);
    next.profile = next.profile ?? { interests: [], currentFocus: "" };
    next.profile.currentFocus = focusDraft.trim();
    persist(next);
    setEditingFocus(false);
  };
  const addSource = () => {
    const url = srcInput.trim();
    if (!/^https?:\/\//.test(url)) return;
    haptic();
    let label = url;
    try {
      label = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      /* そのまま */
    }
    const next = structuredClone(appState);
    next.sources = next.sources ?? [];
    next.sources.unshift({ id: `src-${Date.now()}`, url, label, addedAt: new Date().toISOString() });
    persist(next);
    setSrcInput("");
  };
  const removeSource = (id: string) => {
    const next = structuredClone(appState);
    next.sources = next.sources.filter((s) => s.id !== id);
    persist(next);
  };

  return (
    <>
      <header style={{ padding: "16px 4px 12px", borderBottom: `2px solid ${INK}`, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: INK, padding: 0, lineHeight: 1 }} aria-label="閉じる">←</button>
        <div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 20, letterSpacing: "0.02em", lineHeight: 1 }}>プロフィール</div>
          <div style={{ fontSize: 9, letterSpacing: "0.26em", color: "#9A988E", marginTop: 4 }}>ABOUT YOU</div>
        </div>
      </header>

      <section style={{ paddingTop: 20 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 8 }}>今、気になっていること</div>
        {editingFocus ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input autoFocus value={focusDraft} onChange={(e) => setFocusDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveFocus()}
              style={{ flex: 1, border: "none", borderBottom: `1.5px solid ${INK}`, background: "transparent", fontFamily: SERIF, fontSize: 16, padding: "4px 2px", outline: "none" }} />
            <button onClick={saveFocus} style={rowBtn(INK, PAPER)}>保存</button>
          </div>
        ) : (
          <div onClick={() => { setFocusDraft(appState.profile?.currentFocus ?? ""); setEditingFocus(true); }} style={{
            fontFamily: SERIF, fontSize: 17, lineHeight: 1.6, color: appState.profile?.currentFocus ? INK : "#9A988E", cursor: "pointer",
            borderBottom: "1px dashed rgba(23,23,21,0.25)", paddingBottom: 10,
          }}>
            {appState.profile?.currentFocus || "タップして入力（例: 最近は器に興味がある）"}
          </div>
        )}
      </section>

      <section style={{ paddingTop: 26, paddingBottom: 24 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 10 }}>興味・好み</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {interests.length === 0 ? (
            <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>まだ何もありません。願望やKeepが増えると、自動でここに見つかっていきます。</p>
          ) : interests.map((item) => {
            const cat = catOf(item.categoryId);
            return (
              <span key={item.id} style={{ display: "inline-flex", alignItems: "center", padding: "7px 12px", borderRadius: 999, background: cat.color, color: PAPER, fontFamily: SANS, fontWeight: 700, fontSize: weightSize(item.weight) }}>
                {item.label}
              </span>
            );
          })}
        </div>
        <p style={{ fontSize: 10, color: "#9A988E", marginTop: 12, lineHeight: 1.7 }}>
          願望やKeepの傾向から、意識しなくても自動で見つかっていきます。
        </p>
      </section>

      <section style={{ paddingTop: 6, paddingBottom: 28 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 10 }}>お気に入りの情報源</div>
        <p style={{ fontSize: 10, color: "#9A988E", lineHeight: 1.7, margin: "0 0 12px" }}>
          信頼しているサイト(例: rateyourmusic.com)を登録すると、ブリーフの情報源として優先的に巡回され、そこからカードが届くようになります。
        </p>
        {sources.map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderTop: i === 0 ? `1px solid ${HAIRLINE}` : `1px solid ${HAIRLINE}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</div>
              <div style={{ fontSize: 9.5, color: "#9A988E", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.url}</div>
            </div>
            <button onClick={() => removeSource(s.id)} style={{ background: "none", border: "none", color: "#9A988E", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>削除</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input value={srcInput} onChange={(e) => setSrcInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSource()}
            placeholder="https:// から始まるURLを貼り付け" style={{ flex: 1, border: "none", borderBottom: `1px solid ${INK}`, background: "transparent", fontFamily: SANS, fontSize: 12.5, padding: "6px 2px", outline: "none", minWidth: 0 }} />
          <button onClick={addSource} style={rowBtn(INK, PAPER)}>登録</button>
        </div>
      </section>
    </>
  );
}
