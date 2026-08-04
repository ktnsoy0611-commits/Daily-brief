"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { BottomSheet, OverlayCard } from "@/components/BottomSheet";
import { Masthead, SectionLabel } from "@/components/common";
import { GOLD, HAIRLINE, INK, MUTED, NAV_OFFSET, PAPER, SANS, SOFT_SHADOW, itemKindOf } from "@/lib/constants";
import { buildDayRecords, dayRecordCount, groupByMonth, type DayRecord } from "@/lib/dayRecords";
import { dayInfo, img, todayKey } from "@/lib/helpers";
import type { JournalEntry, JournalTabId, TabProps } from "@/lib/types";

// ★ジャーナルアプリ。アーカイブ(旧・独立タブ)をここへ統合した。
// 「今日」= 今日の記録を書く/読む場所。「アーカイブ」= 過去の日々を
// **1日=1枚のカード**で縦に積み、その日に実行したカード・済ませたタスク・
// 書いたジャーナルを1枚にまとめて見せる(HANDOFF §10)。

function EntryCard({ entry }: { entry: JournalEntry }) {
  return (
    <div style={{ background: PAPER, borderRadius: 16, padding: "14px 16px 16px", boxShadow: SOFT_SHADOW }}>
      <div style={{ fontSize: 9, letterSpacing: "0.16em", color: MUTED, fontWeight: 700, marginBottom: 8 }}>
        {new Date(entry.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
      </div>
      <p style={{ fontFamily: SANS, fontSize: 12.5, lineHeight: 1.95, color: INK, whiteSpace: "pre-wrap" }}>{entry.body}</p>
    </div>
  );
}

// その日にやったこと(カード・タスク)の小さな一覧。「今日」タブと
// アーカイブの詳細の両方で使う。
function DoneList({ day }: { day: DayRecord }) {
  return (
    <>
      {day.items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: day.tasks.length > 0 ? 14 : 0 }}>
          {day.items.map((i) => (
            <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 11, background: PAPER, borderRadius: 14, padding: "9px 12px 9px 9px", boxShadow: SOFT_SHADOW }}>
              <div style={{ width: 42, height: 42, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: i.color ?? "#5A5A54" }}>
                {i.images?.[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img(i.images[0], 100, 100)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</div>
                <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                  {itemKindOf(i.kind).label}{i.area && i.area !== "—" ? ` ・ ${i.area}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {day.tasks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {day.tasks.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "3px 2px" }}>
              <span style={{ width: 17, height: 17, borderRadius: "50%", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Check size={10} strokeWidth={3} color={PAPER} />
              </span>
              <span style={{ fontFamily: SANS, fontSize: 12, color: "#5A5A54", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
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
      background: PAPER, border: "none", borderRadius: 18, padding: "14px 16px 16px", boxShadow: SOFT_SHADOW,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: thumbs.length > 0 || excerpt || day.tasks.length > 0 ? 12 : 0 }}>
        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 15, color: INK }}>{day.label}</span>
        <span style={{ fontSize: 10, letterSpacing: "0.12em", color: MUTED, fontWeight: 700 }}>{dayRecordCount(day)}件</span>
      </div>
      {thumbs.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {thumbs.map((i) => (
            <div key={i.id} style={{ width: 52, height: 52, borderRadius: 10, overflow: "hidden", background: i.color ?? "#5A5A54", flexShrink: 0 }}>
              {i.images?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img(i.images[0], 120, 120)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              )}
            </div>
          ))}
          {day.items.length > thumbs.length && (
            <div style={{ width: 52, height: 52, borderRadius: 10, background: "rgba(26,26,24,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: MUTED, flexShrink: 0 }}>
              +{day.items.length - thumbs.length}
            </div>
          )}
        </div>
      )}
      {day.tasks.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: excerpt ? 8 : 0 }}>
          <span style={{ width: 15, height: 15, borderRadius: "50%", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Check size={9} strokeWidth={3} color={PAPER} />
          </span>
          <span style={{ fontSize: 11, color: "#5A5A54", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {day.tasks[0].title}{day.tasks.length > 1 ? ` ほか${day.tasks.length - 1}件` : ""}
          </span>
        </div>
      )}
      {excerpt && (
        <p style={{ fontSize: 11.5, lineHeight: 1.8, color: MUTED, overflow: "hidden" }}>
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
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>
            <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 19, color: INK }}>{day.label}</span>
            <span style={{ fontSize: 10, letterSpacing: "0.12em", color: MUTED, fontWeight: 700 }}>{dayRecordCount(day)}件</span>
          </div>
          {summary && <SummaryBlock text={summary} />}
          {(day.items.length > 0 || day.tasks.length > 0) && (
            <section style={{ marginBottom: day.entries.length > 0 ? 22 : 0 }}>
              <SectionLabel text="やったこと" style={{ marginBottom: 10 }} />
              <DoneList day={day} />
            </section>
          )}
          {day.entries.length > 0 && (
            <section>
              <SectionLabel text="記録" style={{ marginBottom: 10 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {day.entries.map((e) => (
                  <div key={e.id}>
                    <div style={{ fontSize: 9, letterSpacing: "0.14em", color: MUTED, fontWeight: 700, marginBottom: 5 }}>
                      {new Date(e.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <p style={{ fontFamily: SANS, fontSize: 12.5, lineHeight: 1.95, color: INK, whiteSpace: "pre-wrap" }}>{e.body}</p>
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
      background: PAPER, borderRadius: 16, padding: compact ? "12px 14px" : "16px 18px 18px",
      boxShadow: SOFT_SHADOW, marginBottom: compact ? 10 : 22,
    }}>
      <div style={{ fontSize: 9, letterSpacing: "0.18em", color: MUTED, fontWeight: 700, marginBottom: 9 }}>その日のまとめ</div>
      <p style={{
        fontFamily: SANS, fontSize: compact ? 12 : 13, lineHeight: 1.95, color: INK, whiteSpace: "pre-wrap",
        ...(compact ? { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" as const, overflow: "hidden" } : {}),
      }}>{text}</p>
    </div>
  );
}

export function JournalTab({ appState, profileButton, tab }: TabProps & { tab: JournalTabId }) {
  const [openDay, setOpenDay] = useState<DayRecord | null>(null);
  const days = buildDayRecords(appState);
  const summaries = appState.daySummaries ?? {};
  const today = todayKey();
  const todayRec = days.find((d) => d.dateKey === today)
    ?? { dateKey: today, label: dayInfo(new Date().toISOString()).label, items: [], tasks: [], entries: [] };
  const past = days.filter((d) => d.dateKey !== today);
  const months = groupByMonth(past);

  if (tab === "journal-today") {
    const empty = dayRecordCount(todayRec) === 0 && !summaries[todayRec.dateKey];
    return (
      <main style={{ paddingBottom: `calc(${NAV_OFFSET} + 12px)` }}>
        <Masthead title="TODAY" corner={profileButton} />
        {empty ? null : (
          <>
            {summaries[todayRec.dateKey] && <SummaryBlock text={summaries[todayRec.dateKey].text} />}
            {(todayRec.items.length > 0 || todayRec.tasks.length > 0) && (
              <section style={{ marginBottom: 26 }}>
                <SectionLabel text="やったこと" style={{ margin: "0 4px 10px" }} />
                <DoneList day={todayRec} />
              </section>
            )}
            {todayRec.entries.length > 0 && (
              <section>
                <SectionLabel text="記録" style={{ margin: "0 4px 10px" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {todayRec.entries.map((e) => <EntryCard key={e.id} entry={e} />)}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    );
  }

  return (
    <main style={{ paddingBottom: `calc(${NAV_OFFSET} + 12px)` }}>
      <Masthead title="ARCHIVE" corner={profileButton} />
      {past.length === 0 ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {months.map((m) => (
            <section key={m.month}>
              <div style={{ fontSize: 11, letterSpacing: "0.16em", color: MUTED, fontWeight: 700, margin: "0 4px 10px", borderTop: `1px solid ${HAIRLINE}`, paddingTop: 12 }}>{m.label}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {m.days.map((d) => <DayCard key={d.dateKey} day={d} summary={summaries[d.dateKey]?.text} onOpen={() => setOpenDay(d)} />)}
              </div>
            </section>
          ))}
        </div>
      )}
      {openDay && <DaySheet day={openDay} summary={summaries[openDay.dateKey]?.text} onClose={() => setOpenDay(null)} />}
    </main>
  );
}
