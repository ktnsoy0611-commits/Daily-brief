import { NextResponse } from "next/server";
import { withBudget } from "@/lib/aiLedger";
import { isOwner } from "@/lib/ownerAuth";
import { PATHS } from "@/lib/myBrainPaths";
import { readMyBrainFile } from "@/lib/myBrainWrite";
import { findSimilarTasks, patternsFromMd, suggestSubtasks } from "@/lib/taskSuggest";

// 付随タスクの提案。タスクを登録した直後・タスクを開いたときにクライアントが
// 叩く。この人の傾向(my-brain の me/patterns.md、Coworkが育てる)はサーバー
// だけが読めるので、ここで足してから Gemini へ渡す。
// GEMINI_API_KEY 未設定なら reason:"no_key" を返す(他のAI機能と同じ作法)。

export const runtime = "nodejs";
export const maxDuration = 30;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

export async function POST(req: Request) {
  if (!(await isOwner(req))) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  let body: { title?: unknown; dueDate?: unknown; note?: unknown; existing?: unknown; pastSimilar?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const title = str(body.title, 120);
  if (!title) return NextResponse.json({ ok: false, reason: "no_task" }, { status: 400 });

  const existing = Array.isArray(body.existing)
    ? body.existing.map((x) => str(x, 60)).filter((x): x is string => !!x).slice(0, 20)
    : [];
  // ★★★**済んだタスクの一覧（`history`）を受けたら、似たものはここで探す**（第133巡）。
  //   `lib/taskSuggest.ts` は Gemini の呼び出しを抱えるのでクライアントへ持ち込まない。
  const history = Array.isArray(body.history)
    ? body.history.slice(0, 200).map((h) => {
        const o = (h && typeof h === "object" ? h : {}) as { title?: unknown; subtasks?: unknown };
        const subs = Array.isArray(o.subtasks) ? o.subtasks : [];
        return {
          title: str(o.title, 80) ?? "", done: true,
          subtasks: subs.map((x) => ({ title: str(x, 60) ?? "", done: true })).filter((x) => x.title),
        };
      }).filter((h) => h.title)
    : [];
  const pastSimilar = history.length ? findSimilarTasks(title, history) : Array.isArray(body.pastSimilar)
    ? body.pastSimilar
        .map((p) => (p && typeof p === "object" ? (p as { title?: unknown; steps?: unknown }) : null))
        .map((p) => {
          const t = str(p?.title, 80);
          if (!t) return null;
          const steps = Array.isArray(p?.steps) ? p!.steps.map((s) => str(s, 60)).filter((s): s is string => !!s).slice(0, 6) : [];
          return { title: t, steps };
        })
        .filter((p): p is { title: string; steps: string[] } => !!p)
        .slice(0, 3)
    : [];

  // この人の傾向。無くても提案は出す(一般的な手配だけになる)。
  const patterns = patternsFromMd(await readMyBrainFile(PATHS.patterns));

  const result = await withBudget("suggest", () => suggestSubtasks({
    title,
    dueDate: str(body.dueDate, 20),
    note: str(body.note, 200),
    existing,
    patterns,
    pastSimilar,
  }));
  const status = result.ok || !result.reason.startsWith("gemini_") ? 200 : 502;
  return NextResponse.json(result, { status });
}
