import { NextResponse } from "next/server";
import { withBudget } from "@/lib/aiLedger";
import { callGemini, extractJsonArray } from "@/lib/briefPipeline";
import { isOwner } from "@/lib/ownerAuth";
import { SYSTEM_CURATE, buildCuratePrompt, validateScores, type CurateInput } from "@/lib/bandCurate";
import { PATHS } from "@/lib/myBrainPaths";
import { readMyBrainFile } from "@/lib/myBrainWrite";
import { patternsFromMd } from "@/lib/taskSuggest";

// ★★★**帯の下の段を AI に評価させる口**（2026-09-27・第133巡）。
//   材料はクライアントが組み（予定・好み・反応・候補）、**`<傾向>` だけはここで足す**
//   （my-brain の `me/patterns.md` はサーバーしか読めない。`/api/suggest-subtasks` と同じ作法）。
//   プロンプト・検品・順位は `lib/bandCurate.ts` の1か所。
// ★GEMINI_API_KEY が無ければ `no_key`（クライアントは規則の並びのまま出す）。

export const runtime = "nodejs";
export const maxDuration = 30;

/** ★候補の上限（プロンプトの長さの頭打ち）。★目盛りの外（件数）。 */
const MAX_CANDIDATES = 40;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strs = (v: unknown, n: number, max: number) =>
  Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : [];

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "no_key" });
  if (!(await isOwner(req))) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const candidates = (Array.isArray(body.candidates) ? body.candidates : [])
    .map((c) => {
      const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      return { id: str(o.id, 80), kind: str(o.kind, 30), title: str(o.title, 80), facts: str(o.facts, 120) };
    })
    .filter((c) => c.id && c.title)
    .slice(0, MAX_CANDIDATES);
  if (!candidates.length) return NextResponse.json({ ok: true, scores: [] });
  const input: CurateInput = {
    now: str(body.now, 40),
    schedule: strs(body.schedule, 30, 80),
    interests: strs(body.interests, 12, 30),
    reactions: strs(body.reactions, 12, 60),
    candidates,
  };
  const patterns = patternsFromMd(await readMyBrainFile(PATHS.patterns));
  // ★1日の上限は `AI_CAPS.curate`（並べ替えは無くても帯は規則の並びで出る ―― いちばん先に止めてよい仕事）。
  const res = await withBudget("curate", () => callGemini(key, SYSTEM_CURATE, buildCuratePrompt(input, patterns), true, 4096, { timeoutMs: 10000, retries: 1 }));
  if (!res.ok) return NextResponse.json({ ok: false, reason: res.status === 0 ? "budget" : `gemini_${res.status}` }, { status: res.status === 0 ? 429 : 502 });
  const raw = extractJsonArray<unknown>(res.text);
  if (!raw) return NextResponse.json({ ok: false, reason: "parse_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, scores: validateScores(raw, new Set(candidates.map((c) => c.id))) });
}
