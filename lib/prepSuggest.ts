"use client";

import { useEffect, useRef } from "react";
import { todayKey } from "./helpers";
import type { AppState, Task, TaskSuggestion, TaskTip } from "./types";
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

/** ★期日の何日前にもう一度頼むか（予定が近づいて見えてくる準備がある）。★目盛りの外（仕様の数）。 */
const AGAIN_DAYS = 7;
/** ★準備の提案の上限（`lib/taskSuggest.ts` の `SUGGEST_LIMIT` と同じ数。あちらは Gemini を抱えるので読まない）。 */
const KEEP_MAX = 6;

const sigOf = (t: Task) => `${t.title}|${t.dueDate ?? ""}`;
const norm = (x: string) => x.normalize("NFKC").replace(/\s/g, "");

// ★★★**頼み直す条件**（2026-10-10・第137巡。ユーザー承認の下書き1）… ①まだ頼んでいない ②題か期日が変わった
//   ③期日の `AGAIN_DAYS` 日前を過ぎたのに、それより前に頼んだきり（予定が近づくと見える準備がある）
//   ④tips の雲が入る前（第136巡まで）に頼んだきり（`suggestedFor` が無い）。
type Why = "first" | "changed" | "again";
export function needOf(t: Task, today: string): Why | null {
  if (!t.suggestedAt) return "first";
  if (t.suggestedFor !== sigOf(t)) return t.suggestedFor ? "changed" : "again";
  if (t.dueDate && within(t.dueDate, today, AGAIN_DAYS)) {
    const cut = Date.parse(`${t.dueDate}T00:00:00`) - AGAIN_DAYS * 86400000;
    if (Date.parse(t.suggestedAt) < cut) return "again";
  }
  return null;
}

// ★頼み直しの結果を前の提案と合わせる。題か期日が変わったら入れ替える（前の提案は別の予定のもの）。
//   それ以外は前の提案を残し（「まだ」の数を消さない）、新しいものを後ろへ足す。
function mergeSuggestions(prev: TaskSuggestion[], got: TaskSuggestion[], why: Why): TaskSuggestion[] {
  if (why !== "again") return got;
  const seen = new Set(prev.map((x) => norm(x.title)));
  return [...prev, ...got.filter((x) => !seen.has(norm(x.title)))].slice(0, KEEP_MAX);
}
// ★tips は入れ替える。ただし同じ語で「確認した」を押していたものは押したままにする。
function mergeTips(prev: TaskTip[], got: TaskTip[]): TaskTip[] {
  const checked = new Set(prev.filter((x) => x.checked).map((x) => norm(x.word)));
  return got.map((x) => (checked.has(norm(x.word)) ? { ...x, checked: true } : x));
}

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
      !t.done && !!t.dueDate && !tried.has(t.id) && !!needOf(t, today)
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
      const got: Record<string, { s: TaskSuggestion[]; tips: TaskTip[]; why: Why; sig: string }> = {};
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
          if (j?.ok && Array.isArray(j.suggestions)) {
            got[t.id] = { s: j.suggestions as TaskSuggestion[], tips: Array.isArray(j.tips) ? (j.tips as TaskTip[]) : [], why: needOf(t, today) ?? "first", sig: sigOf(t) };
          }
        } catch { /* 次に開いたとき頼み直す */ }
      }
      running = false;
      const cur = latest.current;
      if (!cur || !Object.keys(got).length) return;
      const next = structuredClone(cur);
      const at = new Date().toISOString();
      for (const t of next.tasks ?? []) {
        const g = got[t.id];
        // ★頼んでいるあいだに題か期日がまた変わったら当てない（次の起動で新しい題で頼む）。
        if (!g || sigOf(t) !== g.sig) continue;
        t.suggestions = mergeSuggestions(t.suggestions ?? [], g.s, g.why);
        t.tips = mergeTips(t.tips ?? [], g.tips);
        t.suggestedAt = at;
        t.suggestedFor = g.sig;
      }
      persist(next);
    })();
  }, [state, persist]);
}
