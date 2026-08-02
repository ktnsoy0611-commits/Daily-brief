"use client";

import { Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { Masthead } from "@/components/common";
import { TaskDetail } from "@/components/TaskDetail";
import { GOLD, HAIRLINE, INK, MUTED, NAV_OFFSET, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";
import { haptic, todayKey } from "@/lib/helpers";
import type { Task, TabProps, TasksTabId } from "@/lib/types";

// ★タスクアプリ。今は器だけ(一覧の見た目と空状態)で、追加・編集・
// 繰り返しなどの中身は後で詰める。デザイン言語は今のアプリを踏襲し、
// 行はPAPER地+SOFT_SHADOWの丸みのある帯、チェックはINKの丸ボタン。

const sortTasks = (a: Task, b: Task) => {
  if (a.done !== b.done) return a.done ? 1 : -1;
  const ad = a.dueDate ?? "9999-12-31";
  const bd = b.dueDate ?? "9999-12-31";
  if (ad !== bd) return ad < bd ? -1 : 1;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
};

// 1件の行。左のチェックで済ませ、行そのものをタップすると中身(手順と
// AIの提案)が開く。onOpenを渡さなければチェックだけの行になる
// (ダッシュボードはこの形で使う)。
export function TaskRow({ task, onToggle, onOpen }: { task: Task; onToggle: (id: string) => void; onOpen?: (id: string) => void }) {
  const subtasks = task.subtasks ?? [];
  const doneSubs = subtasks.filter((s) => s.done).length;
  const pending = (task.suggestions ?? []).length;
  return (
    <div
      onClick={onOpen ? () => onOpen(task.id) : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 11, background: PAPER, borderRadius: 14,
        padding: "12px 14px", boxShadow: SOFT_SHADOW, opacity: task.done ? 0.55 : 1,
        cursor: onOpen ? "pointer" : "default",
      }}>
      <button
        onClick={(e) => { e.stopPropagation(); haptic(8); onToggle(task.id); }}
        aria-label={task.done ? `${task.title}のチェックを外す` : `${task.title}を完了にする`}
        style={{
          width: 22, height: 22, borderRadius: "50%", flexShrink: 0, cursor: "pointer", padding: 0,
          border: task.done ? "none" : `1.5px solid ${HAIRLINE}`,
          background: task.done ? INK : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {task.done && <Check size={12} strokeWidth={3} color={PAPER} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: SANS, fontSize: 13, fontWeight: 600, color: INK,
          textDecoration: task.done ? "line-through" : "none",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{task.title}</div>
        {(task.note || task.dueDate || subtasks.length > 0) && (
          <div style={{ fontSize: 10, color: MUTED, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[task.dueDate, subtasks.length > 0 ? `手順 ${doneSubs}/${subtasks.length}` : null, task.note].filter(Boolean).join(" ・ ")}
          </div>
        )}
      </div>
      {/* まだ見ていない提案がある印。開かなくても気づけるように行にも出す。 */}
      {pending > 0 && !task.done && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0,
          background: "rgba(199,148,51,0.16)", color: GOLD, borderRadius: 999, padding: "3px 8px",
          fontSize: 10, fontWeight: 700,
        }}>
          <Sparkles size={10} strokeWidth={2.4} />
          {pending}
        </span>
      )}
    </div>
  );
}

function EmptyNote({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: "56px 12px", textAlign: "center" }}>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 17, color: INK, marginBottom: 10 }}>{title}</div>
      <p style={{ fontSize: 11.5, lineHeight: 1.9, color: MUTED }}>{body}</p>
    </div>
  );
}

export function TasksTab({ appState, persist, profileButton, tab }: TabProps & { tab: TasksTabId }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const tasks = appState.tasks ?? [];
  const today = todayKey();
  const todays = tasks.filter((t) => t.dueDate === today).sort(sortTasks);
  const all = tasks.slice().sort(sortTasks);
  const shown = tab === "tasks-today" ? todays : all;
  const open = tasks.find((t) => t.id === openId) ?? null;
  const remaining = todays.filter((t) => !t.done).length;

  const patchTask = (id: string, patch: Partial<Task>) => {
    const next = structuredClone(appState);
    const t = next.tasks.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, patch);
    persist(next);
  };
  const removeTask = (id: string) => {
    const next = structuredClone(appState);
    next.tasks = next.tasks.filter((x) => x.id !== id);
    persist(next);
    setOpenId(null);
  };
  const toggle = (id: string) => {
    const next = structuredClone(appState);
    const t = next.tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : undefined;
    persist(next);
  };

  return (
    <main style={{ paddingBottom: `calc(${NAV_OFFSET} + 12px)` }}>
      <Masthead
        title={tab === "tasks-today" ? "今日" : "すべて"}
        statValue={tab === "tasks-today" ? remaining : all.filter((t) => !t.done).length}
        statLabel="件のこり"
        corner={profileButton}
      />
      {shown.length === 0 ? (
        <EmptyNote
          title={tab === "tasks-today" ? "今日のタスクはありません。" : "タスクがありません。"}
          body="やることを書くと、ここに並びます。ダッシュボードを引き上げると、その日のタスクとカードをまとめて見られます。"
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shown.map((t) => <TaskRow key={t.id} task={t} onToggle={toggle} onOpen={setOpenId} />)}
        </div>
      )}
      {open && (
        <TaskDetail
          task={open}
          allTasks={tasks}
          onChange={(patch) => patchTask(open.id, patch)}
          onDelete={() => removeTask(open.id)}
          onClose={() => setOpenId(null)}
        />
      )}
    </main>
  );
}
