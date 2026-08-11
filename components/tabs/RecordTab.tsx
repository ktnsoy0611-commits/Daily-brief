"use client";

import { Masthead, SectionLabel } from "@/components/common";
import { VoiceStudio } from "@/components/VoiceStudio";
import { appTitle } from "@/lib/apps";
import { INK, MUTED, NAV_OFFSET, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";
import type { TabProps, VoiceNote } from "@/lib/types";

// ★ジャーナルの最初のタブ。画面の下部に置いた巨大な2つの円(カセットの
// リールの抽象)と、その上の波形・タイポグラフィで録音する。
// 中身は components/VoiceStudio.tsx。タブバー右端の録音アイコンから出る
// 全画面のオーバーレイも**同じ部品**なので、見た目と操作が必ず一致する。

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

  return (
    <main style={{ paddingBottom: `calc(${NAV_OFFSET} + 12px)` }}>
      <Masthead title={appTitle("journal")} corner={profileButton} />

      {/* ★左右にはみ出させるため、祖先(data-tab-scroll-root)の16pxの
          パディングを打ち消して画面幅いっぱいに広げる。高さは「画面の
          下端まで」。円はその下端で切られるので、画面からはみ出して
          見える(タブバーはその上に浮く)。 */}
      <div style={{ margin: "2px -16px 22px", height: "calc(100svh - 148px)", minHeight: 440 }}>
        <VoiceStudio voice={voice} />
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
