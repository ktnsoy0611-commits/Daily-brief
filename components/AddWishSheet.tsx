"use client";

import { useState } from "react";
import { BottomSheet, OverlayCard } from "@/components/BottomSheet";
import { HAIRLINE, INK, ITEM_DOMAINS, PAPER, SANS } from "@/lib/constants";
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
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>ウィッシュを書く</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="ふと思ったことを、なんでも"
            style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 15, outline: "none", marginBottom: 16, background: "transparent" }} />
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>種類</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0 20px" }}>
            {ITEM_DOMAINS.map((d) => (
              <button key={d.id} onClick={() => setCategory(d.id)} style={{
                flex: "1 1 40%", padding: "9px 0", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700,
                background: category === d.id ? INK : "transparent", color: category === d.id ? PAPER : "#5A5A54",
                border: `1.5px solid ${category === d.id ? INK : HAIRLINE}`,
              }}>{d.label}</button>
            ))}
          </div>
          <button onClick={() => { if (!title.trim()) return; onAdd(title.trim(), category); requestClose(); }} disabled={!title.trim()} style={{
            width: "100%", padding: "13px 0", background: title.trim() ? INK : "rgba(23,23,21,0.2)", color: PAPER, border: "none",
            borderRadius: 999, cursor: title.trim() ? "pointer" : "default", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
          }}>追加する</button>
        </OverlayCard>
      )}
    </BottomSheet>
  );
}
