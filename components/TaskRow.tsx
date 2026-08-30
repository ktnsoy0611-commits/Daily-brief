"use client";

import { SPACE, TYPE, WEIGHT, RADIUS } from "@/lib/tokens";
import { Check, Sparkles } from "lucide-react";
import { GREEN, GREEN_TINT, HAIRLINE, INK, MUTED, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import type { Task } from "@/lib/types";

// ★タスク1件の「行」。
// タスクアプリ本体は物体(柱体)で表すようになったので、この平らな行が残って
// いるのは**下から引き上げるダッシュボードの「今日のタスク」**だけ
// (期日が今日のものを並べる、というダッシュボードの見方は現状維持、
// 2026-08-12にユーザー確定)。以前は components/tabs/TasksTab.tsx にあったが、
// そのタブごと無くなったのでここへ移した。

export function TaskRow({ task, onToggle, onOpen }: { task: Task; onToggle: (id: string) => void; onOpen?: (id: string) => void }) {
  const subtasks = task.subtasks ?? [];
  const doneSubs = subtasks.filter((s) => s.done).length;
  const pending = (task.suggestions ?? []).length;
  return (
    <div
      onClick={onOpen ? () => onOpen(task.id) : undefined}
      style={{
        display: "flex", alignItems: "center", gap: SPACE.md, background: PAPER, borderRadius: RADIUS.lg,
        padding: `${SPACE.md}px ${SPACE.lg}px`, boxShadow: SOFT_SHADOW, opacity: task.done ? 0.55 : 1,
        cursor: onOpen ? "pointer" : "default",
      }}>
      <button
        onClick={(e) => { e.stopPropagation(); haptic(8); onToggle(task.id); }}
        aria-label={task.done ? `${task.title}のチェックを外す` : `${task.title}を完了にする`}
        style={{
          width: 22, height: 22, borderRadius: RADIUS.circle, flexShrink: 0, cursor: "pointer", padding: 0,
          border: task.done ? "none" : `1.5px solid ${HAIRLINE}`,
          background: task.done ? INK : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {task.done && <Check size={12} strokeWidth={3} color={PAPER} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold, color: INK,
          textDecoration: task.done ? "line-through" : "none",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{task.title}</div>
        {(task.note || task.dueDate || subtasks.length > 0) && (
          <div style={{ fontSize: TYPE.small, fontWeight: WEIGHT.text, color: MUTED, marginTop: SPACE.xs, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[task.dueDate, subtasks.length > 0 ? `手順 ${doneSubs}/${subtasks.length}` : null, task.note].filter(Boolean).join(" ・ ")}
          </div>
        )}
      </div>
      {/* まだ見ていない提案がある印。開かなくても気づけるように行にも出す。 */}
      {pending > 0 && !task.done && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: SPACE.xs, flexShrink: 0,
          background: GREEN_TINT, color: GREEN, borderRadius: RADIUS.pill, padding: `${SPACE.xs}px ${SPACE.sm}px`,
          fontSize: TYPE.small, fontWeight: WEIGHT.bold,
        }}>
          <Sparkles size={10} strokeWidth={2.4} />
          {pending}
        </span>
      )}
    </div>
  );
}
