"use client";

import { Check, Mic, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BLUE, GOLD, GREEN, HAIRLINE, INK, NAV_OFFSET, PAPER, RUST, SANS, SOFT_SHADOW } from "@/lib/constants";
import { FloatingBubble, floatStyle } from "@/components/FloatingBubble";
import { haptic, todayKey } from "@/lib/helpers";
import type { AppState, InboxCandidate, VoiceNote } from "@/lib/types";

// ★インボックス。夜のうちに語った声のメモをCoworkが読んで作った
// 「これはタスクにした方がいいのでは?」という候補が、ここにふわふわと
// 漂っている。タップすると画面の中央にその候補が来て、周りに5W1Hが雲の
// ように浮かび、ひとつずつ埋めながら承認できる(HANDOFF §11)。
//
// 承認するまで本登録はされない。放っておけば漂ったまま残る。

const KIND_LABEL: Record<InboxCandidate["kind"], string> = {
  task: "タスク", journal: "ジャーナル", wish: "ウィッシュ", item: "ストック",
};
const KIND_COLOR: Record<InboxCandidate["kind"], string> = {
  task: GOLD, journal: GREEN, wish: BLUE, item: RUST,
};

// 5W1Hの並び。中央の候補を囲む雲の順番でもある。
const FIVE_W: { key: keyof Pick<InboxCandidate, "when" | "where" | "who" | "what" | "why" | "how">; label: string; hint: string }[] = [
  { key: "when", label: "いつ", hint: "明日の午前 / 今週中" },
  { key: "where", label: "どこで", hint: "自宅 / 神保町" },
  { key: "who", label: "だれと", hint: "ひとりで / ◯◯さんと" },
  { key: "what", label: "なにを", hint: "具体的にすること" },
  { key: "why", label: "なぜ", hint: "そうしたい理由" },
  { key: "how", label: "どうやって", hint: "手段・段取り" },
];

// 中央に候補、周りに5W1Hの雲。雲をタップするとその場で書き込める。
function CandidateEditor({ candidate, onChange, onApprove, onDismiss, onClose }: {
  candidate: InboxCandidate;
  onChange: (patch: Partial<InboxCandidate>) => void;
  onApprove: () => void;
  onDismiss: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(candidate.title);

  const openField = (key: string, current?: string) => {
    haptic(6);
    setEditing(key);
    setDraft(current ?? "");
  };
  const commit = () => {
    if (editing) onChange({ [editing]: draft.trim() || undefined } as Partial<InboxCandidate>);
    setEditing(null);
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 57, display: "flex", flexDirection: "column" }}>
      <div onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); onClose(); } }} style={{
        position: "absolute", inset: 0, background: "rgba(16,16,20,0.5)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      }} />
      <div style={{ position: "relative", flex: 1, minHeight: 0, overflowY: "auto", padding: "max(20px, env(safe-area-inset-top)) 18px 20px" }}>
        {/* 中央の候補。 */}
        <div style={{ margin: "18px 0 22px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: KIND_COLOR[candidate.kind] }} />
            <span style={{ fontSize: 10, letterSpacing: "0.16em", color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>
              {KIND_LABEL[candidate.kind]}の候補
            </span>
          </div>
          {titleEditing ? (
            <input
              autoFocus value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => { onChange({ title: titleDraft.trim() || candidate.title }); setTitleEditing(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              style={{
                width: "100%", boxSizing: "border-box", background: "transparent", border: "none",
                borderBottom: `2px solid ${PAPER}`, color: PAPER, fontFamily: SANS, fontSize: 22, fontWeight: 800,
                padding: "2px 0 6px", outline: "none",
              }}
            />
          ) : (
            <button onClick={() => { setTitleDraft(candidate.title); setTitleEditing(true); }} style={{
              background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer",
              fontFamily: SANS, fontSize: 22, fontWeight: 800, color: PAPER, lineHeight: 1.4,
            }}>{candidate.title}</button>
          )}
        </div>

        {/* 5W1Hの雲。埋まっているものは濃く、空はうっすら。 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
          {FIVE_W.map((f) => {
            const value = candidate[f.key];
            const open = editing === f.key;
            if (open) {
              return (
                <div key={f.key} style={{ width: "100%", background: PAPER, borderRadius: 18, padding: "12px 14px", boxShadow: SOFT_SHADOW }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.16em", color: "#9A988E", fontWeight: 700, marginBottom: 6 }}>{f.label}</div>
                  <input
                    autoFocus value={draft} placeholder={f.hint}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    style={{
                      width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`,
                      padding: "6px 2px", fontFamily: SANS, fontSize: 16, outline: "none", background: "transparent", color: INK,
                    }}
                  />
                </div>
              );
            }
            return (
              <button key={f.key} onClick={() => openField(f.key, value)} style={{
                cursor: "pointer", border: value ? "none" : "1px dashed rgba(255,255,255,0.45)",
                background: value ? PAPER : "transparent", borderRadius: 999, padding: value ? "9px 14px" : "9px 14px",
                display: "flex", alignItems: "baseline", gap: 7, maxWidth: "100%",
              }}>
                <span style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: value ? "#9A988E" : "rgba(255,255,255,0.7)" }}>{f.label}</span>
                <span style={{
                  fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: value ? INK : "rgba(255,255,255,0.5)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{value ?? "—"}</span>
              </button>
            );
          })}
        </div>

        {/* 元の声。分類が思い違いをしていないか、その場で確かめられる。 */}
        {candidate.sourceText && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.18)", paddingTop: 14, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Mic size={12} strokeWidth={2} color="rgba(255,255,255,0.6)" />
              <span style={{ fontSize: 9.5, letterSpacing: "0.16em", color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>もとの声</span>
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.9, color: "rgba(255,255,255,0.72)", whiteSpace: "pre-wrap" }}>{candidate.sourceText}</p>
          </div>
        )}
      </div>

      {/* 承認 / 捨てる */}
      <div style={{ position: "relative", flexShrink: 0, display: "flex", gap: 10, padding: "0 18px max(18px, env(safe-area-inset-bottom))" }}>
        <button onClick={() => { haptic(6); onDismiss(); }} style={{
          flexShrink: 0, width: 52, height: 52, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.35)",
          background: "transparent", color: PAPER, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }} aria-label="この候補を捨てる">
          <X size={20} strokeWidth={2.2} />
        </button>
        <button onClick={() => { haptic(16); onApprove(); }} style={{
          flex: 1, height: 52, borderRadius: 999, border: "none", background: PAPER, color: INK, cursor: "pointer",
          fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <Check size={16} strokeWidth={2.6} />
          {KIND_LABEL[candidate.kind]}に登録する
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function InboxView({ appState, persist, showToast }: {
  appState: AppState;
  persist: (next: AppState) => void;
  showToast: (m: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // useMemoの依存が毎回変わらないよう、?? [] をそのままフックへ渡さない。
  const inbox = appState.inbox;
  const candidates = useMemo(() => inbox ?? [], [inbox]);
  const notes = (appState.voiceNotes ?? []).filter((n) => n.status === "new");
  const open = candidates.find((c) => c.id === openId) ?? null;
  const bubbles = useMemo(() => candidates.map((c, i) => ({ c, style: floatStyle(c.id, i, candidates.length) })), [candidates]);

  const patch = (id: string, p: Partial<InboxCandidate>) => {
    const next = structuredClone(appState);
    const c = next.inbox.find((x) => x.id === id);
    if (c) Object.assign(c, p);
    persist(next);
  };
  const remember = (next: AppState, id: string) => {
    next.profile.handledInbox = Array.from(new Set([...(next.profile.handledInbox ?? []), id])).slice(-500);
  };
  const drop = (id: string) => {
    const next = structuredClone(appState);
    next.inbox = next.inbox.filter((x) => x.id !== id);
    remember(next, id);
    persist(next);
    setOpenId(null);
  };
  // 登録したタスクの付随提案を作る。結果が返ったら、そのタスクへ書き込む。
  const askSuggestions = async (taskId: string, title: string, when: string | undefined, base: AppState) => {
    try {
      const { findSimilarTasks } = await import("@/lib/taskSuggest");
      const res = await fetch("/api/suggest-subtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, dueDate: when, pastSimilar: findSimilarTasks(title, base.tasks ?? []) }),
      });
      const data = await res.json().catch(() => null);
      const next = structuredClone(base);
      const t = next.tasks.find((x) => x.id === taskId);
      if (!t) return;
      t.suggestedAt = new Date().toISOString();
      if (data?.ok && Array.isArray(data.suggestions)) t.suggestions = data.suggestions;
      persist(next);
    } catch {
      /* 提案が作れなくてもタスクの登録は済んでいる */
    }
  };

  // 承認 = その種類の本体へ登録し、候補は消す。
  const approve = (c: InboxCandidate) => {
    const next = structuredClone(appState);
    const now = new Date().toISOString();
    const detail = [c.where && `どこで: ${c.where}`, c.who && `だれと: ${c.who}`, c.how && `どうやって: ${c.how}`, c.why && `なぜ: ${c.why}`]
      .filter(Boolean).join(" ・ ") || undefined;
    const taskId = `task-${Date.now()}`;
    if (c.kind === "task") {
      next.tasks.unshift({
        id: taskId, title: c.title,
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(c.when ?? "") ? c.when : undefined,
        note: [c.when && !/^\d{4}-\d{2}-\d{2}$/.test(c.when) ? c.when : null, detail].filter(Boolean).join(" ・ ") || undefined,
        done: false, createdAt: now,
      });
    } else if (c.kind === "journal") {
      next.journal.unshift({ id: `journal-${Date.now()}`, date: todayKey(), body: [c.title, c.what, detail].filter(Boolean).join("\n"), createdAt: now });
    } else if (c.kind === "wish") {
      next.wishes.unshift({ id: `wish-${Date.now()}`, title: c.title, category: "experience", status: "stock", addedAt: now });
    } else {
      next.items.unshift({
        id: `manual-${Date.now()}`, kind: "info", title: c.title, area: c.where || undefined,
        summary: detail, status: "candidate", addedAt: now, origin: "manual",
      });
    }
    next.inbox = next.inbox.filter((x) => x.id !== c.id);
    remember(next, c.id);
    persist(next);
    setOpenId(null);
    showToast(`${KIND_LABEL[c.kind]}に登録しました`);
    // ★タスクにしたものは、登録した瞬間に付随タスクの提案を作りに行く
    // (「新幹線は取った?」「会議室は取った?」)。開いたときには既に周りに
    // 漂っている、という体験にするため(ユーザー指定: 即時)。失敗しても
    // タスク自体の登録は済んでいるので、静かに諦める(開いたときに作り直す)。
    if (c.kind === "task") askSuggestions(taskId, c.title, c.when, next);
  };

  return (
    <main style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, paddingBottom: `calc(${NAV_OFFSET} + 12px)` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "10px 4px 6px" }}>
        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 28, letterSpacing: "-0.01em", color: INK }}>インボックス</span>
        <span style={{ fontSize: 10.5, letterSpacing: "0.12em", color: "#9A988E", fontWeight: 700 }}>{candidates.length}件</span>
      </div>

      {candidates.length === 0 ? (
        <div style={{ padding: "60px 12px", textAlign: "center" }}>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 17, color: INK, marginBottom: 10 }}>候補はありません。</div>
          <p style={{ fontSize: 11.5, lineHeight: 1.9, color: "#9A988E" }}>
            タブバー右のボタンを長押しして語ると、その声が夜のうちに読まれて、
            ここに「タスクにしますか？」という候補が漂います。
          </p>
          {notes.length > 0 && (
            <p style={{ fontSize: 11, lineHeight: 1.9, color: "#9A988E", marginTop: 14 }}>
              まだ読まれていない声のメモが{notes.length}件あります。
            </p>
          )}
        </div>
      ) : (
        // 漂う候補。高さは画面いっぱいに取り、そこに散らして浮かべる。
        <div style={{ position: "relative", flex: 1, minHeight: 380, marginTop: 6 }}>
          {bubbles.map(({ c, style }) => (
            <FloatingBubble key={c.id} label={c.title} dotColor={KIND_COLOR[c.kind]} style={style} onTap={() => setOpenId(c.id)} />
          ))}
        </div>
      )}

      {notes.length > 0 && candidates.length > 0 && (
        <div style={{ borderTop: `1px solid ${HAIRLINE}`, marginTop: 10, paddingTop: 10, fontSize: 10.5, color: "#9A988E", textAlign: "center" }}>
          まだ読まれていない声のメモが{notes.length}件
        </div>
      )}

      {open && (
        <CandidateEditor
          candidate={open}
          onChange={(p) => patch(open.id, p)}
          onApprove={() => approve(open)}
          onDismiss={() => drop(open.id)}
          onClose={() => setOpenId(null)}
        />
      )}
    </main>
  );
}

export type { VoiceNote };
