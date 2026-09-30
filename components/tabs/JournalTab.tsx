"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import { Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { RailPiece } from "@/components/ModuleRail";
import { BottomSheet, OverlayCard } from "@/components/BottomSheet";
import { SectionLabel } from "@/components/common";
import { GoalsSection } from "@/components/journal/GoalsSection";
import { GREEN, GREEN_INK, INK, MUTED, SANS, TILE, itemKindOf, SECOND } from "@/lib/constants";
import { buildDayRecords, dayRecordCount, groupByMonth, type DayRecord } from "@/lib/dayRecords";
import { dayInfo, img, ratingLabel, todayKey } from "@/lib/helpers";
import type { JournalEntry, JournalTabId, TabProps, VoiceNote } from "@/lib/types";

// ★ジャーナルアプリ。アーカイブ(旧・独立タブ)をここへ統合した。
// 「今日」= 今日の記録を書く/読む場所。「アーカイブ」= 過去の日々を
// **1日=1枚のカード**で縦に積み、その日に実行したカード・済ませたタスク・
// 書いたジャーナルを1枚にまとめて見せる(HANDOFF §10)。

function EntryCard({ entry }: { entry: JournalEntry }) {
  return (
    <div style={{ ...TILE }}>
      <div style={{ fontSize: TYPE.micro, letterSpacing: TRACK.caps, color: MUTED, fontWeight: WEIGHT.bold, marginBottom: SPACE.sm }}>
        {new Date(entry.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
      </div>
      <p style={{ fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.text, lineHeight: LEAD.body, color: INK, whiteSpace: "pre-wrap" }}>{entry.body}</p>
    </div>
  );
}

// ★声のメモ。以前はレコードタブの下に並べていたが、レコードは1画面で
// 完結させる(スクロールさせない)ことにしたので、こちらへ移した。
function VoiceNoteCard({ note }: { note: VoiceNote }) {
  return (
    <div style={{ ...TILE }}>
      <div style={{ fontSize: TYPE.micro, letterSpacing: TRACK.caps, color: MUTED, fontWeight: WEIGHT.bold, marginBottom: SPACE.sm }}>
        {new Date(note.at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
        {note.durationMs ? ` ・ ${mmssOf(note.durationMs)}` : ""}
      </div>
      <p style={{ fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.text, lineHeight: LEAD.body, color: INK, whiteSpace: "pre-wrap" }}>{note.text}</p>
    </div>
  );
}

function mmssOf(ms: number) {
  const sec = Math.floor(ms / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

// その日にやったこと(カード・タスク)の小さな一覧。「今日」タブと
// アーカイブの詳細の両方で使う。
function DoneList({ day }: { day: DayRecord }) {
  return (
    <>
      {day.items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm, marginBottom: day.tasks.length > 0 ? SPACE.lg : 0 }}>
          {day.items.map((i) => (
            <div key={i.id} style={{ ...TILE, display: "flex", alignItems: "center", gap: SPACE.md, padding: SPACE.md }}>
              <div style={{ width: 42, height: 42, borderRadius: RADIUS.lg, overflow: "hidden", flexShrink: 0, background: i.color ?? SECOND }}>
                {i.images?.[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img(i.images[0], 100, 100)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</div>
                <div style={{ fontSize: TYPE.small, fontWeight: WEIGHT.text, color: MUTED, marginTop: SPACE.hair }}>
                  {itemKindOf(i.kind).label}{i.area && i.area !== "—" ? ` ・ ${i.area}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {day.tasks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
          {day.tasks.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: SPACE.sm, padding: `${SPACE.xs}px 0` }}>
              <span style={{ width: 17, height: 17, borderRadius: RADIUS.circle, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Check size={10} strokeWidth={3} color={GREEN_INK} />
              </span>
              <span style={{ fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.text, color: SECOND, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// アーカイブの1日=1枚。中身の要約(サムネイル・済ませたこと・記録の抜粋)を
// 1枚の紙にまとめ、タップでその日の全体を開く。
function DayCard({ day, summary, onOpen }: { day: DayRecord; summary?: string; onOpen: () => void }) {
  const thumbs = day.items.slice(0, 4);
  // まとめがあればそれを見せる(自分で書いた記録の抜粋より、その日の全体が
  // 分かるまとめの方が手がかりとして強い)。
  const source = summary ?? day.entries[0]?.body;
  const excerpt = source?.replace(/\s+/g, " ").slice(0, 46);
  return (
    <button onClick={onOpen} style={{
      display: "block", width: "100%", textAlign: "left", cursor: "pointer",
      ...TILE, border: "none",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: SPACE.md, marginBottom: thumbs.length > 0 || excerpt || day.tasks.length > 0 ? SPACE.md : 0 }}>
        <span style={{ fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.lead, color: INK }}>{day.label}</span>
        <span style={{ fontSize: TYPE.small, letterSpacing: TRACK.caps, color: MUTED, fontWeight: WEIGHT.bold }}>{dayRecordCount(day)}件</span>
      </div>
      {thumbs.length > 0 && (
        <div style={{ display: "flex", gap: SPACE.sm, marginBottom: SPACE.md }}>
          {thumbs.map((i) => (
            <div key={i.id} style={{ width: 52, height: 52, borderRadius: RADIUS.lg, overflow: "hidden", background: i.color ?? SECOND, flexShrink: 0 }}>
              {i.images?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img(i.images[0], 120, 120)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              )}
            </div>
          ))}
          {day.items.length > thumbs.length && (
            <div style={{ width: 52, height: 52, borderRadius: RADIUS.lg, background: "rgba(26,26,24,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: TYPE.small, fontWeight: WEIGHT.bold, color: MUTED, flexShrink: 0 }}>
              +{day.items.length - thumbs.length}
            </div>
          )}
        </div>
      )}
      {day.tasks.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm, marginBottom: excerpt ? SPACE.sm : 0 }}>
          <span style={{ width: 15, height: 15, borderRadius: RADIUS.circle, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Check size={9} strokeWidth={3} color={GREEN_INK} />
          </span>
          <span style={{ fontSize: TYPE.small, fontWeight: WEIGHT.text, color: SECOND, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {day.tasks[0].title}{day.tasks.length > 1 ? ` ほか${day.tasks.length - 1}件` : ""}
          </span>
        </div>
      )}
      {excerpt && (
        <p style={{ fontSize: TYPE.small, fontWeight: WEIGHT.text, lineHeight: LEAD.body, color: MUTED, overflow: "hidden" }}>
          {summary ? excerpt : `「${excerpt}`}{(source?.length ?? 0) > 46 ? "…" : ""}{summary ? "" : "」"}
        </p>
      )}
    </button>
  );
}

// その日の全体。カード・タスク・記録をすべて出す。
function DaySheet({ day, summary, onClose }: { day: DayRecord; summary?: string; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose} maxHeight="80vh">
      {() => (
        <OverlayCard>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: SPACE.md, marginBottom: SPACE.lg }}>
            <span style={{ fontFamily: SANS, fontWeight: WEIGHT.heavy, fontSize: TYPE.head, color: INK }}>{day.label}</span>
            <span style={{ fontSize: TYPE.small, letterSpacing: TRACK.caps, color: MUTED, fontWeight: WEIGHT.bold }}>{dayRecordCount(day)}件</span>
          </div>
          {summary && <SummaryBlock text={summary} />}
          {(day.items.length > 0 || day.tasks.length > 0) && (
            <section style={{ marginBottom: day.entries.length + day.goals.length > 0 ? SPACE.xl : 0 }}>
              <SectionLabel text="やったこと" style={{ marginBottom: SPACE.md }} />
              <DoneList day={day} />
            </section>
          )}
          {day.goals.length > 0 && (
            <section style={{ marginBottom: day.entries.length > 0 ? SPACE.xl : 0 }}>
              <SectionLabel text="ゴール" style={{ marginBottom: SPACE.md }} />
              <GoalNotes day={day} />
            </section>
          )}
          {day.entries.length > 0 && (
            <section>
              <SectionLabel text="記録" style={{ marginBottom: SPACE.md }} />
              <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
                {day.entries.map((e) => (
                  <div key={e.id}>
                    <div style={{ fontSize: TYPE.micro, letterSpacing: TRACK.caps, color: MUTED, fontWeight: WEIGHT.bold, marginBottom: SPACE.xs }}>
                      {new Date(e.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <p style={{ fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.text, lineHeight: LEAD.body, color: INK, whiteSpace: "pre-wrap" }}>{e.body}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </OverlayCard>
      )}
    </BottomSheet>
  );
}

// ★その日のまとめ。夜のうちにCoworkが、その日の声のメモ・実行したカード・
// 行った場所・済ませたタスクをまとめて書いた日記。事実の一覧より前に、
// 一番読みたいものとして最初に置く。
function SummaryBlock({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div style={{
      ...TILE, padding: compact ? SPACE.md : SPACE.lg, marginBottom: compact ? SPACE.md : SPACE.xl,
    }}>
      <div style={{ fontSize: TYPE.micro, letterSpacing: TRACK.caps, color: MUTED, fontWeight: WEIGHT.bold, marginBottom: SPACE.sm }}>その日のまとめ</div>
      <p style={{
        fontFamily: SANS, fontSize: compact ? TYPE.small : TYPE.body, fontWeight: WEIGHT.text, lineHeight: LEAD.body, color: INK, whiteSpace: "pre-wrap",
        ...(compact ? { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" as const, overflow: "hidden" } : {}),
      }}>{text}</p>
    </div>
  );
}

/** ★★その日のゴールの記録（第134巡）。ゴールの名前・何をしたか・書いたこと。 */
function GoalNotes({ day }: { day: DayRecord }) {
  const what = (k?: string, r?: 1 | 2 | 3) =>
    k === "achieved" ? "達成" : k === "dropped" ? "諦めた" : k === "added" ? "立てた" : k === "milestone" ? ratingLabel(r) : "記録";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
      {day.goals.map(({ goal, ci }) => (
        <div key={ci.id}>
          <div style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, letterSpacing: TRACK.normal, color: MUTED, marginBottom: SPACE.xs }}>
            {goal} ・ {what(ci.kind, ci.rating)}
          </div>
          <p style={{ margin: 0, fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.text, lineHeight: LEAD.body, color: INK }}>{ci.text}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * ★★★**LOG は「行ごとの1枚」の列を返す**（2026-09-30・第134巡の2度目。ユーザー指摘「**スクロールのアニメーションは、
 *   バネ感のある動作をするモジュールとしないものがある**」）。送りのばねは1枚ずつに掛かるので、今日の節・ゴール・
 *   月の見出し・日の1枚を**別々の1枚**にする（`components/tabs/StockTab.tsx` の `useStockModule` と同じ作法）。
 * ★LOG の中身は作り直す（いまは今日＋ゴール＋アーカイブ）。★日の詳細（`DaySheet`）は `overlay`（送りの外）。
 * ★`tab` … その1枚が `goTab("journal-today" | "journal-archive")` の行き先か。
 */
export function useJournalLog({ appState, persist }: TabProps): { pieces: (RailPiece & { tab?: JournalTabId })[]; overlay: ReactNode } {
  const [openDay, setOpenDay] = useState<DayRecord | null>(null);
  const days = buildDayRecords(appState);
  const summaries = appState.daySummaries ?? {};
  const today = todayKey();
  const todayRec = days.find((d) => d.dateKey === today)
    ?? { dateKey: today, label: dayInfo(new Date().toISOString()).label, items: [], tasks: [], entries: [], goals: [] };
  const past = days.filter((d) => d.dateKey !== today);
  const months = groupByMonth(past);
  const notes = (appState.voiceNotes ?? []).slice(0, 12);
  const label = (text: string) => <SectionLabel text={text} style={{ margin: `0 ${SPACE.xs}px ${SPACE.md}px` }} />;
  /** 節の下の余白（送りの隙間 `SPACE.lg` に足して `SPACE.xl` にする）。 */
  const below = { paddingBottom: SPACE.xl - SPACE.lg };

  const pieces: (RailPiece & { tab?: JournalTabId })[] = [];
  const todayParts: RailPiece[] = [];
  if (summaries[todayRec.dateKey]) todayParts.push({ key: "log-summary", node: <div style={below}><SummaryBlock text={summaries[todayRec.dateKey].text} /></div> });
  if (todayRec.items.length > 0 || todayRec.tasks.length > 0) {
    todayParts.push({ key: "log-done", node: <section style={below}>{label("やったこと")}<DoneList day={todayRec} /></section> });
  }
  if (todayRec.entries.length > 0) {
    todayParts.push({
      key: "log-entries",
      node: (
        <section style={below}>
          {label("記録")}
          <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
            {todayRec.entries.map((e) => <EntryCard key={e.id} entry={e} />)}
          </div>
        </section>
      ),
    });
  }
  if (todayRec.goals.length > 0) {
    todayParts.push({ key: "log-goals-today", node: <section style={below}>{label("ゴール")}<GoalNotes day={todayRec} /></section> });
  }
  if (notes.length > 0) {
    todayParts.push({
      key: "log-notes",
      node: (
        <section style={below}>
          {label("声のメモ")}
          <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
            {notes.map((n) => <VoiceNoteCard key={n.id} note={n} />)}
          </div>
        </section>
      ),
    });
  }
  todayParts.forEach((p, i) => pieces.push(i === 0 ? { ...p, tab: "journal-today" } : p));
  // ★★★ゴールはログの節（第134巡。EXPLORE の GOALS タブを畳んだ先）。
  pieces.push({ key: "log-goals", tab: "journal-archive", node: <div style={below}><GoalsSection appState={appState} persist={persist} /></div> });
  if (!todayParts.length) pieces[pieces.length - 1].tab = "journal-archive";
  for (const m of months) {
    pieces.push({
      key: `log-month-${m.month}`,
      node: <div style={{ fontSize: TYPE.small, letterSpacing: TRACK.caps, color: MUTED, fontWeight: WEIGHT.bold, margin: `0 ${SPACE.xs}px`, lineHeight: LEAD.flat }}>{m.label}</div>,
    });
    for (const d of m.days) {
      pieces.push({ key: `log-day-${d.dateKey}`, node: <DayCard day={d} summary={summaries[d.dateKey]?.text} onOpen={() => setOpenDay(d)} /> });
    }
  }
  const overlay = openDay ? <DaySheet day={openDay} summary={summaries[openDay.dateKey]?.text} onClose={() => setOpenDay(null)} /> : null;
  return { pieces, overlay };
}
