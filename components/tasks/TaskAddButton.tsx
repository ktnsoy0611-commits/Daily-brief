"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { INK, PAPER, SANS, SOFT_SHADOW_LG } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { setSurfaceOrigin, SURFACE_ID, SURFACE_IN } from "@/lib/motion";

// ★タスク(候補)を手で足す丸ボタンと、動作確認用のダミー投入。
// 候補タブ・重力タブの両方が同じものを使うので、置き場所と見た目が必ず揃う。
//
// ★zIndex は 26。nav(25)とその手前の帯より上に出す規約(HANDOFF §5)。
// タブバーの高さは CSS変数 --nav-h から引く(数字を二重に持たない・§50)。

export function TaskAddButton({ onAdd, lifted, open }: {
  onAdd: () => void; lifted?: boolean;
  /** 入力画面が出ているあいだ。丸は入力画面の地へ**移っている**ので消す。 */
  open?: boolean;
}) {
  return (
    <button
      onClick={(e) => { haptic(10); setSurfaceOrigin(e.currentTarget); onAdd(); }}
      aria-label="タスクを追加"
      style={{
        position: "absolute", right: 0, zIndex: 26,
        bottom: lifted ? "calc(var(--nav-h) + 14px)" : 14,
        width: 54, height: 54, borderRadius: "50%", border: "none",
        // ★丸そのものは下の共有要素が描く。ここは当たり判定と字だけ。
        background: "transparent", color: INK, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
      }}>
      {/* ★★**ここの丸が、そのまま入力画面の地になる**(2026-08-19・第26巡)。
          同じ `layoutId` を入力画面の地の面も名乗るので、開くと丸が画面いっぱいへ
          広がり、閉じると同じ場所へ吸い込まれる(画面が切り替わるのではなく、
          押したものが変形して続く)。★開いているあいだは消しておくこと —
          同じ `layoutId` が2つ同時に居ると行き先が決まらない。 */}
      {!open && (
        <motion.span layoutId={SURFACE_ID} transition={SURFACE_IN} aria-hidden data-surface style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: PAPER, boxShadow: SOFT_SHADOW_LG,
        }} />
      )}
      <Plus size={24} strokeWidth={2.2} style={{ position: "relative", zIndex: 1 }} />
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
