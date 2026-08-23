"use client";

import { RADIUS, TYPE } from "@/lib/tokens";
import { useState } from "react";
import { BottomSheet, OverlayCard } from "@/components/BottomSheet";
import { HAIRLINE, INK, ITEM_DOMAINS, MUTED, PAPER, SANS } from "@/lib/constants";
import type { ItemDomain } from "@/lib/types";

// ウィッシュを書くシート。タブバー横の＋からアプリのどこからでも開ける
// 「受信箱」への入力口。構造化はせず自由文のままだが、4つのドメイン
// (モノ/バショ/タイケン/ジョウホウ)のうちどれに向けた願いかだけを選んで
// もらう。ここで選んだドメインは、ブリーフがどんな種類の提案として
// 返すかの手がかりになる(フェーズ1では表示・分類の意味だけを持つ)。
export function AddWishSheet({ onAdd, onClose }: { onAdd: (title: string, category: ItemDomain) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ItemDomain>("experience");

  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <OverlayCard>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.lead, marginBottom: 16 }}>ウィッシュを書く</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="ふと思ったことを、なんでも"
            style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: TYPE.lead, outline: "none", marginBottom: 16, background: "transparent" }} />
          <label style={{ fontSize: TYPE.lead, letterSpacing: "0.15em", color: MUTED }}>種類</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0 24px" }}>
            {ITEM_DOMAINS.map((d) => (
              <button key={d.id} onClick={() => setCategory(d.id)} style={{
                flex: "1 1 40%", padding: "8px 0", borderRadius: RADIUS.pill, cursor: "pointer", fontFamily: SANS, fontSize: TYPE.small, fontWeight: 700,
                background: category === d.id ? INK : "transparent", color: category === d.id ? PAPER : "#5A5A54",
                border: `1.5px solid ${category === d.id ? INK : HAIRLINE}`,
              }}>{d.label}</button>
            ))}
          </div>
          <button onClick={() => { if (!title.trim()) return; onAdd(title.trim(), category); requestClose(); }} disabled={!title.trim()} style={{
            width: "100%", padding: "12px 0", background: title.trim() ? INK : "rgba(26,26,24,0.2)", color: PAPER, border: "none",
            borderRadius: RADIUS.pill, cursor: title.trim() ? "pointer" : "default", fontFamily: SANS, fontSize: TYPE.body, fontWeight: 700, letterSpacing: "0.1em",
          }}>追加する</button>
        </OverlayCard>
      )}
    </BottomSheet>
  );
}
