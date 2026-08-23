"use client";

import { Plus } from "lucide-react";
import { INK, PAPER, SANS, SOFT_SHADOW_LG } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { setSurfaceOrigin } from "@/lib/motion";

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
        // ★丸は下の `<span>` が描く(開いているあいだだけ消すため)。
        background: "transparent", color: INK, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
      }}>
      {/* ★★**ここが、入力画面が広がってくる中心**(2026-08-19・第27巡)。
          押した瞬間に `setSurfaceOrigin` でこの丸の場所を控え、入力画面が
          その点から円で広がる(`components/tasks/TaskComposer.tsx` の `grow`)。
          閉じるときも同じ点へ吸い込まれる。
          ★開いているあいだは消しておく — 入力画面がこの丸から広がってきた
          ように見せるので、下に丸が残っていると二重に見える。
          ★★第26巡は Framer Motion の共有要素(`layoutId`)でこの丸そのものを
          画面いっぱいへ変形させていたが、受け渡しの途中で測り直しが入って
          実機で「2段階ガクッ」になった。丸はもう動かない。 */}
      {!open && (
        <span aria-hidden data-surface style={{
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
