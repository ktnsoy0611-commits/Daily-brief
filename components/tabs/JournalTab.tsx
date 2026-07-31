"use client";

import { Masthead } from "@/components/common";
import { INK, NAV_OFFSET, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";
import { dayInfo } from "@/lib/helpers";
import type { JournalEntry, JournalTabId, TabProps } from "@/lib/types";

// ★ジャーナルアプリ。今は器だけ(ログの見た目と空状態、月ごとのアーカイブ)。
// 書く・編集する・気分をつける等の中身は後で詰める。デザイン言語は今の
// アプリを踏襲(PAPER地のカード+SOFT_SHADOW、字間を空けた小さな日付ラベル)。

const newestFirst = (a: JournalEntry, b: JournalEntry) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

function EntryCard({ entry }: { entry: JournalEntry }) {
  return (
    <div style={{ background: PAPER, borderRadius: 16, padding: "14px 16px 16px", boxShadow: SOFT_SHADOW }}>
      <div style={{ fontSize: 9, letterSpacing: "0.16em", color: "#9A988E", fontWeight: 700, marginBottom: 8 }}>
        {dayInfo(entry.createdAt).label}
      </div>
      <p style={{ fontFamily: SANS, fontSize: 12.5, lineHeight: 1.95, color: INK, whiteSpace: "pre-wrap" }}>{entry.body}</p>
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

export function JournalTab({ appState, profileButton, tab }: TabProps & { tab: JournalTabId }) {
  const entries = (appState.journal ?? []).slice().sort(newestFirst);

  // アーカイブは月ごとにまとめる(アーカイブタブの日付ビューと同じ考え方)。
  const byMonth = new Map<string, JournalEntry[]>();
  entries.forEach((e) => {
    const key = (e.date || e.createdAt).slice(0, 7);
    const list = byMonth.get(key) ?? [];
    list.push(e);
    byMonth.set(key, list);
  });
  const months = Array.from(byMonth.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <main style={{ paddingBottom: `calc(${NAV_OFFSET} + 12px)` }}>
      <Masthead
        title={tab === "journal-log" ? "ログ" : "アーカイブ"}
        statValue={entries.length}
        statLabel="件の記録"
        corner={profileButton}
      />
      {entries.length === 0 ? (
        <EmptyNote
          title={tab === "journal-log" ? "まだ書いていません。" : "記録がありません。"}
          body="その日のことを書き残すと、ここに積み上がります。"
        />
      ) : tab === "journal-log" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {entries.map((e) => <EntryCard key={e.id} entry={e} />)}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {months.map(([month, list]) => (
            <section key={month}>
              <div style={{ fontSize: 11, letterSpacing: "0.16em", color: "#9A988E", fontWeight: 700, margin: "0 4px 10px" }}>
                {month.replace("-", "年")}月
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {list.map((e) => <EntryCard key={e.id} entry={e} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
