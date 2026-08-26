"use client";

import { SPACE, TYPE, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import { useState } from "react";
import { BottomSheet, OverlayCard } from "@/components/BottomSheet";
import { HAIRLINE, INK, ITEM_DOMAINS, MUTED, PAPER, SANS, SECOND } from "@/lib/constants";
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
          <div style={{ fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.lead, marginBottom: SPACE.lg }}>ウィッシュを書く</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="ふと思ったことを、なんでも"
            style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: `${SPACE.sm}px ${SPACE.hair}px`, fontFamily: SANS, fontSize: TYPE.lead, outline: "none", marginBottom: SPACE.lg, background: "transparent" }} />
          <label style={{ fontSize: TYPE.lead, letterSpacing: TRACK.caps, color: MUTED }}>種類</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.sm, margin: `${SPACE.sm}px 0 ${SPACE.xl}px` }}>
            {ITEM_DOMAINS.map((d) => (
              <button key={d.id} onClick={() => setCategory(d.id)} style={{
                flex: "1 1 40%", padding: `${SPACE.sm}px 0`, borderRadius: RADIUS.pill, cursor: "pointer", fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold,
                background: category === d.id ? INK : "transparent", color: category === d.id ? PAPER : SECOND,
                border: `1.5px solid ${category === d.id ? INK : HAIRLINE}`,
              }}>{d.label}</button>
            ))}
          </div>
          <button onClick={() => { if (!title.trim()) return; onAdd(title.trim(), category); requestClose(); }} disabled={!title.trim()} style={{
            width: "100%", padding: `${SPACE.md}px 0`, background: title.trim() ? INK : "rgba(26,26,24,0.2)", color: PAPER, border: "none",
            borderRadius: RADIUS.pill, cursor: title.trim() ? "pointer" : "default", fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold, letterSpacing: TRACK.caps,
          }}>追加する</button>
        </OverlayCard>
      )}
    </BottomSheet>
  );
}
