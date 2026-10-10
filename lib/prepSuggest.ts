"use client";

import { useEffect, useRef } from "react";
import { todayKey } from "./helpers";
import type { AppState, TaskSuggestion } from "./types";
import { authedFetch } from "@/lib/authedFetch";

// ★★★**準備タスクを AI に頼む「きっかけ」はここ1つ**（2026-09-27・第133巡）。
//   ユーザー指定「**補足のタスクを AI に分析させて、タスクの提案を作らせる機能は作りたい。
//   そしてその候補を帯に出したい**」。
//
// ★★★**生成の部品は第52巡以前からあった**（`lib/taskSuggest.ts` ＋ `/api/suggest-subtasks`。
//   プロンプトはユーザー承認済み）。**呼ぶ画面がタスク画面の作り直しで消え、一度も
//   呼ばれていなかった** ―― だから `Task.suggestions` は空で、帯の準備は出なかった。
//   ★プロンプトは**1文字も変えていない**。ここは「いつ・どれを頼むか」だけ。
//
// ★★**頼む対象** … 未完了・期日が今日から `PREP_DAYS` 日以内・まだ頼んでいない
//   （`suggestedAt` が無い）タスク。**1回に `PER_RUN` 件まで**（起動のたびに少しずつ）。
// ★★**結果は `Task.suggestions`**（帯の下の段が `follow-` として流す。`lib/homeBand.ts`）。
// ★★**失敗したら `suggestedAt` を付けない** ―― 次に開いたとき頼み直す。
//   ★ただし同じ起動の中では2度頼まない（`tried`）。

/** ★期日が何日先までのタスクに準備を頼むか。★目盛りの外（仕様の数）。 */
const PREP_DAYS = 14;
/** ★1回に頼む件数。★目盛りの外（呼ぶ回数の上限）。 */
const PER_RUN = 3;

/** ★★module のただ1つの入れ物（同じ起動の中で2度頼まない）。 */
const tried = new Set<string>();
let running = false;

const within = (ymd: string, today: string, days: number) => {
  const a = Date.parse(`${today}T00:00:00`);
  const b = Date.parse(`${ymd}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  const n = Math.round((b - a) / 86400000);
  return n >= 0 && n <= days;
};

export function usePrepSuggest(state: AppState | null, persist: (next: AppState) => void) {
  // ★★結果を当てるのは**その時点の最新の状態**（頼んでいるあいだに他の変更が入っても消さない）。
  const latest = useRef(state);
  useEffect(() => { latest.current = state; });

  useEffect(() => {
    if (!state || running) return;
    const today = todayKey();
    const targets = (state.tasks ?? []).filter((t) =>
      !t.done && !!t.dueDate && !t.suggestedAt && !tried.has(t.id)
      && within(t.dueDate, today, PREP_DAYS)).slice(0, PER_RUN);
    if (!targets.length) return;
    running = true;
    targets.forEach((t) => tried.add(t.id));
    // ★★似た過去のタスクはサーバーが探す（`history` を渡す）。済んだものだけ。
    const history = (state.tasks ?? [])
      .filter((t) => t.done)
      .slice(-200)
      .map((t) => ({ title: t.title, subtasks: (t.subtasks ?? []).filter((s) => s.done).map((s) => s.title) }));
    (async () => {
      const got: Record<string, TaskSuggestion[]> = {};
      for (const t of targets) {
        try {
          const res = await authedFetch("/api/suggest-subtasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: t.title, dueDate: t.dueDate, note: t.note,
              existing: (t.subtasks ?? []).map((s) => s.title),
              history,
            }),
          });
          const j = await res.json();
          if (j?.ok && Array.isArray(j.suggestions)) got[t.id] = j.suggestions as TaskSuggestion[];
        } catch { /* 次に開いたとき頼み直す */ }
      }
      running = false;
      const cur = latest.current;
      if (!cur || !Object.keys(got).length) return;
      const next = structuredClone(cur);
      const at = new Date().toISOString();
      for (const t of next.tasks ?? []) {
        const s = got[t.id];
        if (!s) continue;
        t.suggestions = s;
        t.suggestedAt = at;
      }
      persist(next);
    })();
  }, [state, persist]);
}
