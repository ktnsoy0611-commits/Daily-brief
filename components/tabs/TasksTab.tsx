"use client";

import { Check } from "lucide-react";
import { Masthead } from "@/components/common";
import { HAIRLINE, INK, NAV_OFFSET, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";
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

// 1件の行。タップでチェックの入り切りだけができる。
export function TaskRow({ task, onToggle }: { task: Task; onToggle: (id: string) => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 11, background: PAPER, borderRadius: 14,
      padding: "12px 14px", boxShadow: SOFT_SHADOW, opacity: task.done ? 0.55 : 1,
    }}>
      <button
        onClick={() => { haptic(8); onToggle(task.id); }}
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
        {(task.note || task.dueDate) && (
          <div style={{ fontSize: 10, color: "#9A988E", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[task.dueDate, task.note].filter(Boolean).join(" ・ ")}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyNote({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: "56px 12px", textAlign: "center" }}>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 17, color: INK, marginBottom: 10 }}>{title}</div>
      <p style={{ fontSize: 11.5, lineHeight: 1.9, color: "#9A988E" }}>{body}</p>
    </div>
  );
}

export function TasksTab({ appState, persist, profileButton, tab }: TabProps & { tab: TasksTabId }) {
  const tasks = appState.tasks ?? [];
  const today = todayKey();
  const todays = tasks.filter((t) => t.dueDate === today).sort(sortTasks);
  const all = tasks.slice().sort(sortTasks);
  const shown = tab === "tasks-today" ? todays : all;
  const remaining = todays.filter((t) => !t.done).length;

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
          {shown.map((t) => <TaskRow key={t.id} task={t} onToggle={toggle} />)}
        </div>
      )}
    </main>
  );
}
