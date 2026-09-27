import type { AppState, SubTask } from "./types";

// ★★★**忘れ防止の通知（アプリ内）**（2026-09-27・第133巡にユーザー指定「**あさってがどこどこに行くっていう
// 予定だとして…忘れっぽい・後回しにする性格を先読みして、これは確認しましたかと通知みたいなもので出して
// ほしい**」「**まずアプリ内だけ**」）。
//
// ★★**聞く中身は準備の提案**（`Task.suggestions`。`lib/prepSuggest.ts` が頼み、`lib/taskSuggest.ts` の
//   承認済みのプロンプトが「確認の問い」として作る）。**AI への頼み方は1文字も変えていない。**
//   ここが決めるのは「いつ・どれを・どの順に聞くか」と「答えをどう残すか」だけ。
// ★★**聞き始め** … 期日の `WINDOW` 日前から。**「まだ」が多い人は `WINDOW_LAZY` 日前から**（後回しの癖）。
// ★★**答え** … 済んだ ＝ 親タスクの「済んだ小タスク」へ移す（似たタスクの次の提案の材料になる）／
//   まだ ＝ 明日また聞く。**期日が明日か今日なら `SOON_MS` 後にもう一度**（次に開いたとき）。
// ★目盛りの外（仕様の数）。

const WINDOW = 3;
const WINDOW_LAZY = 5;
/** 「まだ」が多い人と見なす答えの数の下限と割合。 */
const LAZY_MIN = 4;
const LAZY_RATE = 0.5;
/** 期日が迫っているとき、「まだ」のあとにもう一度聞くまで。 */
const SOON_MS = 2 * 60 * 60 * 1000;

export interface Remind {
  taskId: string;
  sugId: string;
  /** 親の予定（例「大阪出張」）。 */
  parent: string;
  /** いつの予定か（今日・明日・あさって・n日後）。 */
  when: string;
  title: string;
  why?: string;
  days: number;
}

function daysUntil(ymd: string, now: Date): number | null {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((new Date(y, m - 1, d).getTime() - a) / 86400000);
}
const whenOf = (n: number) => (n === 0 ? "今日" : n === 1 ? "明日" : n === 2 ? "あさって" : `${n}日後`);

/** ★いま聞いてよい問いを、近い予定から順に。 */
export function pickReminders(state: AppState, now = new Date()): Remind[] {
  const st = state.remindStats ?? { done: 0, notYet: 0 };
  const n = st.done + st.notYet;
  const lazy = n >= LAZY_MIN && st.notYet / n > LAZY_RATE;
  const win = lazy ? WINDOW_LAZY : WINDOW;
  const out: { r: Remind; skip: number }[] = [];
  for (const t of state.tasks ?? []) {
    if (t.done || !t.dueDate) continue;
    const days = daysUntil(t.dueDate, now);
    if (days === null || days < 0 || days > win) continue;
    for (const s of t.suggestions ?? []) {
      if (s.askAfter && Date.parse(s.askAfter) > now.getTime()) continue;
      out.push({
        r: { taskId: t.id, sugId: s.id, parent: t.title, when: whenOf(days), title: s.title, why: s.why, days },
        skip: s.notYet ?? 0,
      });
    }
  }
  // ★★近い予定が先。同じ日なら「まだ」を重ねたものほど先（後回しにしているものほど強く聞く）。
  out.sort((a, b) => a.r.days - b.r.days || b.skip - a.skip);
  return out.map((o) => o.r);
}

/** ★答えを残した次の状態を返す（`persist` は呼ぶ側）。 */
export function answerRemind(state: AppState, r: Remind, done: boolean, now = new Date()): AppState {
  const next = structuredClone(state);
  const t = next.tasks.find((x) => x.id === r.taskId);
  const s = t?.suggestions?.find((x) => x.id === r.sugId);
  if (!t || !s) return state;
  const st = next.remindStats ?? { done: 0, notYet: 0 };
  if (done) {
    t.suggestions = (t.suggestions ?? []).filter((x) => x.id !== r.sugId);
    const sub: SubTask = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: s.title, done: true, doneAt: now.toISOString(), fromSuggestion: true,
    };
    t.subtasks = [...(t.subtasks ?? []), sub];
    st.done += 1;
  } else {
    s.notYet = (s.notYet ?? 0) + 1;
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    s.askAfter = (r.days <= 1 ? new Date(now.getTime() + SOON_MS) : tomorrow).toISOString();
    st.notYet += 1;
  }
  next.remindStats = st;
  return next;
}
