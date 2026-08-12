"use client";

import { useMemo, useState } from "react";
import { Masthead } from "@/components/common";
import { floatStyle } from "@/components/FloatingBubble";
import { PrismSolid } from "@/components/tasks/PrismSolid";
import { appTitle } from "@/lib/apps";
import { INK, MUTED, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { assignFaces } from "@/lib/prism";
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
  assignFaces({ when: c.when, where: c.where, who: c.who, why: c.why, how: c.how }, undefined, c.title).faceCount;

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

export function DriftTab({ appState, profileButton }: TabProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const inbox = appState.inbox;
  // ★タスクの候補だけを出す(2026-08-12にユーザー確定)。ジャーナル・ウィッシュ・
  // ストックの候補はデータとしては残るが、行き先は別途決める。
  const candidates = useMemo(() => (inbox ?? []).filter((c) => c.kind === "task"), [inbox]);
  const drifting = useMemo(
    () => candidates.map((c, i) => ({ c, style: floatStyle(c.id, i, candidates.length) })),
    [candidates],
  );
  const notes = (appState.voiceNotes ?? []).filter((n) => n.status === "new").length;

  return (
    <main style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
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
      {/* 展開図(タップして中身を見る・直す)は次の段階で入れる。 */}
      {openId && null}
    </main>
  );
}
