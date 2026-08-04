"use client";

import { useEffect, useState } from "react";
import { CassettePlayer } from "@/components/CassettePlayer";
import { Masthead, SectionLabel } from "@/components/common";
import { appTitle } from "@/lib/apps";
import { INK, MUTED, NAV_OFFSET, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import type { TabProps, VoiceNote } from "@/lib/types";

// ★ジャーナルの最初のタブ。中央に置いたカセットプレイヤーをタップすると
// 録音が始まり、もう一度タップすると文字起こしへ送る(蓋が開いて中の
// カセットが飛んでいく)。タブバー右の丸ボタンの長押しと同じ録音を、
// 別の入口から動かしているだけ(状態は AppShell の useVoiceRecorder が持つ)。

function mmss(ms: number) {
  const sec = Math.floor(ms / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function NoteCard({ note }: { note: VoiceNote }) {
  return (
    <div style={{ background: PAPER, borderRadius: 14, padding: "11px 14px 13px", boxShadow: SOFT_SHADOW }}>
      <div style={{ fontSize: 9, letterSpacing: "0.16em", color: MUTED, fontWeight: 700, marginBottom: 6 }}>
        {new Date(note.at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
        {note.durationMs ? ` ・ ${mmss(note.durationMs)}` : ""}
      </div>
      <p style={{
        fontFamily: SANS, fontSize: 12.5, lineHeight: 1.9, color: INK,
        display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>{note.text}</p>
    </div>
  );
}

export function RecordTab({ appState, profileButton, voice }: TabProps) {
  const notes = (appState.voiceNotes ?? []).slice(0, 6);
  const recording = voice.state === "recording";
  const sending = voice.state === "sending";
  // ★経過時間はここで数える。100msごとに変わる値をAppShellからpropsで
  // 受け取ると、そのたびに全タブが再レンダーされてしまう(§14)。
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!recording || !voice.startedAt) { setElapsed(0); return; }
    setElapsed(Date.now() - voice.startedAt);
    const id = window.setInterval(() => setElapsed(Date.now() - voice.startedAt), 100);
    return () => window.clearInterval(id);
  }, [recording, voice.startedAt]);

  const onTap = () => {
    if (sending) return;
    haptic(recording ? 12 : 8);
    if (recording) voice.stop();
    else voice.start("tab");
  };

  const hint = sending ? "文字にしています…" : recording ? "もう一度タップで送る" : "タップして録音";

  return (
    <main style={{ paddingBottom: `calc(${NAV_OFFSET} + 12px)` }}>
      <Masthead title={appTitle("journal")} corner={profileButton} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, margin: "8px 0 30px" }}>
        <CassettePlayer width={236} mode={voice.state} onTap={onTap} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minHeight: 46 }}>
          {recording && (
            <div style={{ fontFamily: SANS, fontSize: 20, fontWeight: 800, color: INK, letterSpacing: "0.08em" }}>
              {mmss(elapsed)}
            </div>
          )}
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: MUTED, letterSpacing: "0.06em", fontWeight: 700 }}>{hint}</div>
        </div>
      </div>
      {notes.length > 0 && (
        <section>
          <SectionLabel text="声のメモ" style={{ margin: "0 4px 10px" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {notes.map((n) => <NoteCard key={n.id} note={n} />)}
          </div>
        </section>
      )}
    </main>
  );
}
