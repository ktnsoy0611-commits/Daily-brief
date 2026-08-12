"use client";

import { useMemo, useState } from "react";
import { Masthead } from "@/components/common";
import { floatStyle } from "@/components/FloatingBubble";
import { PrismSolid } from "@/components/tasks/PrismSolid";
import { DemoSeedButton, TaskAddButton } from "@/components/tasks/TaskAddButton";
import { TaskNet, type NetData } from "@/components/tasks/TaskNet";
import { appTitle } from "@/lib/apps";
import { INK, MUTED, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { assignFaces } from "@/lib/prism";
import { demoCandidates } from "@/lib/taskDemo";
import type { InboxCandidate, TabProps } from "@/lib/types";

// ★候補タブ(DRIFT)。まだ確定していないタスクの候補が、無重力で漂う。
// 声のメモを Cowork が読んで作った「これはタスクでは?」という提案が、
// ここへ流れてくる(HANDOFF §11・§12)。
//
// ★ここに物理演算は使わない。位置と揺れは id から決まる CSS の
// keyframes(globals.css の inbox-drift)なので、毎フレームの計算はゼロ。
// 重力(落下と積み上げ)は確定したあと、隣の GRAVITY タブが担う。
//
// 候補の**大きさは揃える**。重さ(重要度 × 切迫度)を持つのは確定してからで、
// 漂っているうちはまだ量られていない、という区別を形で示す。

const SOLID = 74;

/** 候補の 5W1H から、いま何面の立体か。 */
export const candidateFaces = (c: InboxCandidate): number =>
  assignFaces({ when: c.when, where: c.where, who: c.who, why: c.why, how: c.how }, c.faces, c.title).faceCount;

function DriftItem({ candidate, style, onTap }: {
  candidate: InboxCandidate;
  style: React.CSSProperties;
  onTap: () => void;
}) {
  const faces = candidateFaces(candidate);
  return (
    <button
      onClick={() => { haptic(8); onTap(); }}
      aria-label={`${candidate.title}を開く`}
      style={{
        ...style, border: "none", background: "none", padding: 0, cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4, maxWidth: "46%",
      }}>
      <PrismSolid faceCount={faces} size={SOLID} />
      <span style={{
        fontFamily: SANS, fontSize: 11, fontWeight: 600, color: INK, textAlign: "center",
        maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{candidate.title}</span>
    </button>
  );
}

export function DriftTab({ appState, persist, profileButton, showToast, goTab }: TabProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  // ＋で作ったばかりのもの。開いた直後に題の入力へ入り、何も書かずに
  // 閉じたらそのまま捨てる(名前のないものを残さない)。
  const [draftId, setDraftId] = useState<string | null>(null);
  const inbox = appState.inbox;
  // ★タスクの候補だけを出す(2026-08-12にユーザー確定)。ジャーナル・ウィッシュ・
  // ストックの候補はデータとしては残るが、行き先は別途決める。
  const candidates = useMemo(() => (inbox ?? []).filter((c) => c.kind === "task"), [inbox]);
  const drifting = useMemo(
    () => candidates.map((c, i) => ({ c, style: floatStyle(c.id, i, candidates.length) })),
    [candidates],
  );
  const notes = (appState.voiceNotes ?? []).filter((n) => n.status === "new").length;
  const open = candidates.find((c) => c.id === openId) ?? null;

  const patch = (id: string, p: Partial<NetData>) => {
    const next = structuredClone(appState);
    const c = next.inbox.find((x) => x.id === id);
    if (c) Object.assign(c, p);
    persist(next);
  };
  // 承認・却下した候補は覚えておく(Coworkが同じものを何度も差し出さないように)。
  const remember = (next: typeof appState, id: string) => {
    next.profile.handledInbox = Array.from(new Set([...(next.profile.handledInbox ?? []), id])).slice(-500);
  };
  const drop = (id: string) => {
    const next = structuredClone(appState);
    next.inbox = next.inbox.filter((x) => x.id !== id);
    remember(next, id);
    persist(next);
    setOpenId(null);
  };

  // ★確定 = 重さを持ち、重力の側へ落ちていく。
  const confirm = (c: InboxCandidate) => {
    const next = structuredClone(appState);
    const now = new Date().toISOString();
    next.tasks.unshift({
      id: `task-${Date.now()}`,
      title: c.title,
      // 「いつ」が日付そのものなら期日として持つ(切迫度=大きさに効く)。
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(c.when ?? "") ? c.when : undefined,
      when: c.when, where: c.where, who: c.who, why: c.why, how: c.how,
      faces: c.faces, weight: c.weight ?? 2,
      // Coworkが別に「なにを」を書いていた場合だけメモへ回す(タイトルと同義のため)。
      note: c.what && c.what !== c.title ? c.what : undefined,
      done: false, createdAt: now,
    });
    next.inbox = next.inbox.filter((x) => x.id !== c.id);
    remember(next, c.id);
    persist(next);
    setOpenId(null);
    showToast("タスクにしました");
    goTab("tasks-gravity");
  };

  // 手で候補を足す。まず空のまま作って開き、題を書いてもらう。
  const addCandidate = () => {
    const id = `cand-${Date.now()}`;
    const next = structuredClone(appState);
    next.inbox = [{ id, kind: "task", title: "", createdAt: new Date().toISOString() }, ...(next.inbox ?? [])];
    persist(next);
    setDraftId(id);
    setOpenId(id);
  };

  // 題が空のまま閉じたら、作りかけを消す。
  const closeNet = (id: string) => {
    setOpenId(null);
    if (draftId !== id) return;
    setDraftId(null);
    const c = (appState.inbox ?? []).find((x) => x.id === id);
    if (c && !c.title.trim()) {
      const next = structuredClone(appState);
      next.inbox = next.inbox.filter((x) => x.id !== id);
      persist(next);
    }
  };

  const seedDemo = () => {
    const next = structuredClone(appState);
    next.inbox = [...demoCandidates(), ...(next.inbox ?? [])];
    persist(next);
    showToast("デモの候補を入れました");
  };

  return (
    <main style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <Masthead title={appTitle("tasks")} corner={profileButton} />
      <div style={{ position: "relative", flex: 1, minHeight: 420 }}>
        {drifting.map(({ c, style }) => (
          <DriftItem key={c.id} candidate={c} style={style} onTap={() => setOpenId(c.id)} />
        ))}
      </div>
      {notes > 0 && (
        <div style={{ fontSize: 10.5, color: MUTED, textAlign: "center", padding: "10px 0 2px" }}>
          まだ読まれていない声のメモが{notes}件
        </div>
      )}
      <TaskAddButton onAdd={addCandidate} />
      {candidates.length === 0 && <DemoSeedButton label="デモの候補を入れる" onSeed={seedDemo} />}
      {open && (
        <TaskNet
          key={open.id}
          data={open}
          mode="candidate"
          autoEdit={draftId === open.id}
          onChange={(p) => patch(open.id, p)}
          onConfirm={() => confirm(open)}
          onDelete={() => drop(open.id)}
          onClose={() => closeNet(open.id)}
        />
      )}
    </main>
  );
}
