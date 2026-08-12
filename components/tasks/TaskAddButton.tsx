"use client";

import { Plus } from "lucide-react";
import { INK, PAPER, SANS, SOFT_SHADOW_LG } from "@/lib/constants";
import { haptic } from "@/lib/helpers";

// ★タスク(候補)を手で足す丸ボタンと、動作確認用のダミー投入。
// 候補タブ・重力タブの両方が同じものを使うので、置き場所と見た目が必ず揃う。
//
// ★zIndex は 26。nav(25)とその手前の帯より上に出す規約(HANDOFF §5)。
// タブバーの高さは CSS変数 --nav-h から引く(数字を二重に持たない・§50)。

export function TaskAddButton({ onAdd, lifted }: { onAdd: () => void; lifted?: boolean }) {
  return (
    <button
      onClick={() => { haptic(10); onAdd(); }}
      aria-label="タスクを追加"
      style={{
        position: "absolute", right: 0, zIndex: 26,
        bottom: lifted ? "calc(var(--nav-h) + 14px)" : 14,
        width: 54, height: 54, borderRadius: "50%", border: "none",
        background: PAPER, color: INK, boxShadow: SOFT_SHADOW_LG, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
      }}>
      <Plus size={24} strokeWidth={2.2} />
    </button>
  );
}

/** 何も無いときだけ出す、動作確認用のダミー投入。完成時に撤去する。 */
export function DemoSeedButton({ label, onSeed, lifted }: { label: string; onSeed: () => void; lifted?: boolean }) {
  return (
    <button
      onClick={() => { haptic(8); onSeed(); }}
      style={{
        position: "absolute", left: "50%", transform: "translateX(-50%)", zIndex: 26,
        bottom: lifted ? "calc(var(--nav-h) + 22px)" : 22,
        padding: "10px 18px", borderRadius: 999, border: "1px solid rgba(26,26,24,0.16)",
        background: "transparent", color: "rgba(26,26,24,0.5)", cursor: "pointer",
        fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", whiteSpace: "nowrap",
      }}>{label}</button>
  );
}
