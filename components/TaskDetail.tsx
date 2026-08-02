"use client";

import { Check, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FloatingBubble, floatStyle } from "@/components/FloatingBubble";
import { GOLD, HAIRLINE, INK, PAPER, RUST, SANS, SOFT_SHADOW } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import type { SubTask, Task, TaskSuggestion } from "@/lib/types";

// ★タスクを開いた画面。中央にタスク、周りに **付随タスクの提案** が漂う。
// ユーザー本人の言葉:
//   旅行に行くというタスクを登録した時に(した後でも)、新幹線はとった？とか、
//   朝何時に出るか確認した？とか、そういうことをアプリから提案してサポート
//   して欲しい。
// 提案をタップすると採用してサブタスク(チェックできる手順)になり、×で消える。
// インボックスの5W1H編集と同じ語彙・同じ漂い方(FloatingBubble)にしてある。

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export function TaskDetail({ task, allTasks, onChange, onDelete, onClose }: {
  task: Task;
  allTasks: Task[];
  onChange: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [titleEditing, setTitleEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const askedRef = useRef(false);

  const subtasks = useMemo(() => task.subtasks ?? [], [task.subtasks]);
  const suggestions = useMemo(() => task.suggestions ?? [], [task.suggestions]);
  const bubbles = suggestions.map((s, i) => ({ s, style: floatStyle(s.id, i, suggestions.length) }));

  // 提案を作る。登録直後にも作るが、まだ無いまま開かれたときはここで作る。
  const ask = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setNote(null);
    try {
      const { findSimilarTasks } = await import("@/lib/taskSuggest");
      const res = await fetch("/api/suggest-subtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: task.title,
          dueDate: task.dueDate,
          note: task.note,
          existing: [...subtasks.map((s) => s.title), ...suggestions.map((s) => s.title)],
          pastSimilar: findSimilarTasks(task.title, allTasks),
        }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok && Array.isArray(data.suggestions)) {
        const next = data.suggestions as TaskSuggestion[];
        onChange({ suggestions: [...suggestions, ...next], suggestedAt: new Date().toISOString() });
        if (next.length === 0) setNote("いまのところ、思い当たる手配はありません。");
      } else if (data?.reason === "no_key") {
        setNote("AIの設定がまだ有効になっていません。");
        onChange({ suggestedAt: new Date().toISOString() });
      } else {
        setNote("提案をうまく作れませんでした。");
      }
    } catch {
      setNote("通信に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [loading, task.title, task.dueDate, task.note, subtasks, suggestions, allTasks, onChange]);

  // まだ一度も作っていないタスクを開いたら、その場で作る(1回だけ)。
  useEffect(() => {
    if (task.suggestedAt || askedRef.current) return;
    askedRef.current = true;
    ask();
  }, [task.suggestedAt, ask]);

  const adopt = (s: TaskSuggestion) => {
    haptic(12);
    onChange({
      subtasks: [...subtasks, { id: uid("sub"), title: s.title, done: false, fromSuggestion: true }],
      suggestions: suggestions.filter((x) => x.id !== s.id),
    });
  };
  const dismiss = (s: TaskSuggestion) => {
    haptic(6);
    onChange({ suggestions: suggestions.filter((x) => x.id !== s.id) });
  };
  const toggleSub = (id: string) => {
    haptic(8);
    onChange({
      subtasks: subtasks.map((s) => (s.id === id ? { ...s, done: !s.done, doneAt: s.done ? undefined : new Date().toISOString() } : s)),
    });
  };
  const removeSub = (id: string) => onChange({ subtasks: subtasks.filter((s) => s.id !== id) });
  const addSub = () => {
    const t = addDraft.trim();
    if (t) onChange({ subtasks: [...subtasks, { id: uid("sub"), title: t, done: false }] });
    setAddDraft("");
    setAdding(false);
  };

  const doneCount = subtasks.filter((s) => s.done).length;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 57, display: "flex", flexDirection: "column" }}>
      <div
        onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); onClose(); } }}
        style={{
          position: "absolute", inset: 0, background: "rgba(16,16,20,0.5)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        }}
      />
      <div style={{ position: "relative", flex: 1, minHeight: 0, overflowY: "auto", padding: "max(20px, env(safe-area-inset-top)) 18px 20px" }}>
        {/* 中央のタスク */}
        <div style={{ margin: "14px 0 18px" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.16em", color: "rgba(255,255,255,0.7)", fontWeight: 700, marginBottom: 10 }}>
            {task.dueDate ?? "いつか"}
          </div>
          {titleEditing ? (
            <input
              autoFocus value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => { onChange({ title: titleDraft.trim() || task.title }); setTitleEditing(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              style={{
                width: "100%", boxSizing: "border-box", background: "transparent", border: "none",
                borderBottom: `2px solid ${PAPER}`, color: PAPER, fontFamily: SANS, fontSize: 22, fontWeight: 800,
                padding: "2px 0 6px", outline: "none",
              }}
            />
          ) : (
            <button onClick={() => { setTitleDraft(task.title); setTitleEditing(true); }} style={{
              background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer",
              fontFamily: SANS, fontSize: 22, fontWeight: 800, color: PAPER, lineHeight: 1.4,
            }}>{task.title}</button>
          )}
          {task.note && (
            <p style={{ fontSize: 11.5, lineHeight: 1.8, color: "rgba(255,255,255,0.7)", marginTop: 10 }}>{task.note}</p>
          )}
        </div>

        {/* 漂う提案 */}
        {suggestions.length > 0 && (
          <div style={{ position: "relative", height: Math.min(suggestions.length, 6) * 62, marginBottom: 8 }}>
            {bubbles.map(({ s, style }) => (
              <FloatingBubble key={s.id} label={s.title} dotColor={GOLD} style={style} onTap={() => adopt(s)}>
                <span
                  role="button" aria-label={`${s.title}を消す`}
                  onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); dismiss(s); }}
                  style={{
                    width: 18, height: 18, borderRadius: "50%", background: "rgba(26,23,18,0.07)", color: "#9A988E",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 2,
                  }}
                >
                  <X size={10} strokeWidth={2.6} />
                </span>
              </FloatingBubble>
            ))}
          </div>
        )}

        {/* 提案の状態と作り直し */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <button onClick={ask} disabled={loading} style={{
            display: "inline-flex", alignItems: "center", gap: 7, cursor: loading ? "default" : "pointer",
            background: "transparent", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 999,
            padding: "8px 14px", color: PAPER, fontFamily: SANS, fontSize: 11, fontWeight: 700,
          }}>
            <RefreshCw size={12} strokeWidth={2.2} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
            {loading ? "考えています…" : suggestions.length > 0 ? "ほかの手配も見る" : "手配を確認する"}
          </button>
          {note && <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)" }}>{note}</span>}
        </div>

        {/* サブタスク */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.18)", paddingTop: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 9.5, letterSpacing: "0.16em", color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>手順</span>
            {subtasks.length > 0 && (
              <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>{doneCount}/{subtasks.length}</span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {subtasks.map((s: SubTask) => (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", gap: 10, background: PAPER, borderRadius: 12,
                padding: "10px 12px", boxShadow: SOFT_SHADOW, opacity: s.done ? 0.55 : 1,
              }}>
                <button onClick={() => toggleSub(s.id)} aria-label={s.done ? `${s.title}のチェックを外す` : `${s.title}を済ませる`} style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0, cursor: "pointer", padding: 0,
                  border: s.done ? "none" : `1.5px solid ${HAIRLINE}`, background: s.done ? INK : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {s.done && <Check size={11} strokeWidth={3} color={PAPER} />}
                </button>
                <span style={{
                  flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: INK,
                  textDecoration: s.done ? "line-through" : "none",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{s.title}</span>
                <button onClick={() => removeSub(s.id)} aria-label={`${s.title}を削除`} style={{
                  width: 22, height: 22, borderRadius: "50%", border: "none", background: "transparent", color: "#B8B4A6",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0,
                }}>
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              </div>
            ))}
            {adding ? (
              <input
                autoFocus value={addDraft} placeholder="手順を書く"
                onChange={(e) => setAddDraft(e.target.value)}
                onBlur={addSub}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                style={{
                  width: "100%", boxSizing: "border-box", background: PAPER, border: "none", borderRadius: 12,
                  padding: "12px", fontFamily: SANS, fontSize: 16, outline: "none", color: INK, boxShadow: SOFT_SHADOW,
                }}
              />
            ) : (
              <button onClick={() => setAdding(true)} style={{
                display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start",
                background: "transparent", border: "none", cursor: "pointer", padding: "8px 2px",
                color: "rgba(255,255,255,0.7)", fontFamily: SANS, fontSize: 11.5, fontWeight: 700,
              }}>
                <Plus size={13} strokeWidth={2.4} />
                手順を足す
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ position: "relative", flexShrink: 0, display: "flex", gap: 10, padding: "0 18px max(18px, env(safe-area-inset-bottom))" }}>
        <button onClick={() => { haptic(6); onDelete(); }} aria-label="このタスクを削除" style={{
          flexShrink: 0, width: 52, height: 52, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.35)",
          background: "transparent", color: RUST, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Trash2 size={18} strokeWidth={2} />
        </button>
        <button onClick={() => { haptic(14); onChange({ done: !task.done, doneAt: task.done ? undefined : new Date().toISOString() }); onClose(); }} style={{
          flex: 1, height: 52, borderRadius: 999, border: "none", background: PAPER, color: INK, cursor: "pointer",
          fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <Check size={16} strokeWidth={2.6} />
          {task.done ? "まだ終わっていない" : "済ませた"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
