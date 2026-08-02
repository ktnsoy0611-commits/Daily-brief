"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { BottomSheet, OverlayCard } from "@/components/BottomSheet";
import { Masthead } from "@/components/common";
import { GOLD, HAIRLINE, INK, NAV_OFFSET, PAPER, SANS, SOFT_SHADOW, itemKindOf } from "@/lib/constants";
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
      <div style={{ fontSize: 9, letterSpacing: "0.16em", color: "#9A988E", fontWeight: 700, marginBottom: 8 }}>
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
                <div style={{ fontSize: 10, color: "#9A988E", marginTop: 2 }}>
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
function DayCard({ day, onOpen }: { day: DayRecord; onOpen: () => void }) {
  const thumbs = day.items.slice(0, 4);
  const excerpt = day.entries[0]?.body.replace(/\s+/g, " ").slice(0, 46);
  return (
    <button onClick={onOpen} style={{
      display: "block", width: "100%", textAlign: "left", cursor: "pointer",
      background: PAPER, border: "none", borderRadius: 18, padding: "14px 16px 16px", boxShadow: SOFT_SHADOW,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: thumbs.length > 0 || excerpt || day.tasks.length > 0 ? 12 : 0 }}>
        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 15, color: INK }}>{day.label}</span>
        <span style={{ fontSize: 10, letterSpacing: "0.12em", color: "#9A988E", fontWeight: 700 }}>{dayRecordCount(day)}件</span>
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
            <div style={{ width: 52, height: 52, borderRadius: 10, background: "rgba(26,23,18,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#9A988E", flexShrink: 0 }}>
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
        <p style={{ fontSize: 11.5, lineHeight: 1.8, color: "#9A988E", overflow: "hidden" }}>
          「{excerpt}{(day.entries[0]?.body.length ?? 0) > 46 ? "…" : ""}」
        </p>
      )}
    </button>
  );
}

// その日の全体。カード・タスク・記録をすべて出す。
function DaySheet({ day, onClose }: { day: DayRecord; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose} maxHeight="80vh">
      {() => (
        <OverlayCard>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>
            <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 19, color: INK }}>{day.label}</span>
            <span style={{ fontSize: 10, letterSpacing: "0.12em", color: "#9A988E", fontWeight: 700 }}>{dayRecordCount(day)}件</span>
          </div>
          {(day.items.length > 0 || day.tasks.length > 0) && (
            <section style={{ marginBottom: day.entries.length > 0 ? 22 : 0 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.16em", color: "#9A988E", fontWeight: 700, marginBottom: 10 }}>やったこと</div>
              <DoneList day={day} />
            </section>
          )}
          {day.entries.length > 0 && (
            <section>
              <div style={{ fontSize: 10, letterSpacing: "0.16em", color: "#9A988E", fontWeight: 700, marginBottom: 10 }}>記録</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {day.entries.map((e) => (
                  <div key={e.id}>
                    <div style={{ fontSize: 9, letterSpacing: "0.14em", color: "#9A988E", fontWeight: 700, marginBottom: 5 }}>
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

function EmptyNote({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: "56px 12px", textAlign: "center" }}>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 17, color: INK, marginBottom: 10 }}>{title}</div>
      <p style={{ fontSize: 11.5, lineHeight: 1.9, color: "#9A988E" }}>{body}</p>
    </div>
  );
}

export function JournalTab({ appState, profileButton, tab }: TabProps & { tab: JournalTabId }) {
  const [openDay, setOpenDay] = useState<DayRecord | null>(null);
  const days = buildDayRecords(appState);
  const today = todayKey();
  const todayRec = days.find((d) => d.dateKey === today)
    ?? { dateKey: today, label: dayInfo(new Date().toISOString()).label, items: [], tasks: [], entries: [] };
  const past = days.filter((d) => d.dateKey !== today);
  const months = groupByMonth(past);

  if (tab === "journal-today") {
    const empty = dayRecordCount(todayRec) === 0;
    return (
      <main style={{ paddingBottom: `calc(${NAV_OFFSET} + 12px)` }}>
        <Masthead title="今日" statValue={dayRecordCount(todayRec)} statLabel="件の記録" corner={profileButton} />
        {empty ? (
          <EmptyNote
            title="今日はまだ何もありません。"
            body="書いた記録・実行したカード・済ませたタスクが、その日ごとにここへ集まります。"
          />
        ) : (
          <>
            {(todayRec.items.length > 0 || todayRec.tasks.length > 0) && (
              <section style={{ marginBottom: 26 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.16em", color: "#9A988E", fontWeight: 700, margin: "0 4px 10px" }}>やったこと</div>
                <DoneList day={todayRec} />
              </section>
            )}
            {todayRec.entries.length > 0 && (
              <section>
                <div style={{ fontSize: 11, letterSpacing: "0.16em", color: "#9A988E", fontWeight: 700, margin: "0 4px 10px" }}>記録</div>
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
      <Masthead title="アーカイブ" statValue={past.length} statLabel="日の記録" corner={profileButton} />
      {past.length === 0 ? (
        <EmptyNote title="まだ記録がありません。" body="1日を終えると、その日の記録が1枚のカードになってここに積み上がります。" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {months.map((m) => (
            <section key={m.month}>
              <div style={{ fontSize: 11, letterSpacing: "0.16em", color: "#9A988E", fontWeight: 700, margin: "0 4px 10px", borderTop: `1px solid ${HAIRLINE}`, paddingTop: 12 }}>{m.label}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {m.days.map((d) => <DayCard key={d.dateKey} day={d} onOpen={() => setOpenDay(d)} />)}
              </div>
            </section>
          ))}
        </div>
      )}
      {openDay && <DaySheet day={openDay} onClose={() => setOpenDay(null)} />}
    </main>
  );
}
