import { NextResponse } from "next/server";
import { withBudget } from "@/lib/aiLedger";
import { currentMeter, noteError, takeOne } from "@/lib/aiMeter";
import { isOwner } from "@/lib/ownerAuth";
import { dayPath, jstParts, monthKey } from "@/lib/myBrainPaths";
import { writeMyBrainFile, readMyBrainFile } from "@/lib/myBrainWrite";

// ★声のメモの文字起こし。タブバー右の丸ボタンを長押しして録音した音声を
// 受け取り、テキストにして返す。あわせて my-brain の受信箱
// (days/YYYY-MM/voice.md)へ追記し、夜間のCoworkがそれを読んで
// タスク・ジャーナル・ウィッシュなどの候補へ分類できるようにする。
//
// 文字起こしの実体は2通り。OPENAI_API_KEY があれば OpenAI の音声API
// (Whisper系)、無ければ既存の GEMINI_API_KEY で Gemini の音声入力を使う。
// どちらのキーも NEXT_PUBLIC_ を付けずサーバーだけが読む。

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENAI_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const GEMINI_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-flash-latest";
// 話した内容をそのまま文字にするだけ。要約・整形・分類はここではしない
// (分類は夜間のCoworkの仕事)。
const PROMPT = "この音声を日本語で文字起こししてください。話した内容だけをそのまま書き、要約・補足・見出しは付けないでください。聞き取れない箇所は無理に推測せず飛ばしてください。";

async function viaOpenAI(key: string, file: File): Promise<{ ok: true; text: string } | { ok: false; detail: string }> {
  const form = new FormData();
  form.append("file", file, file.name || "voice.webm");
  form.append("model", OPENAI_MODEL);
  form.append("language", "ja");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const body = await res.text();
  if (!res.ok) return { ok: false, detail: body.slice(0, 300) };
  try {
    const json = JSON.parse(body) as { text?: string };
    return json.text ? { ok: true, text: json.text } : { ok: false, detail: "empty" };
  } catch {
    return { ok: false, detail: body.slice(0, 300) };
  }
}

// ★★数えるだけで止めない（`AI_CAPS.transcribe` は 0 ―― 止めると録った声が失われる）。429・5xx は1回だけやり直す。
async function viaGemini(key: string, file: File): Promise<{ ok: true; text: string } | { ok: false; detail: string }> {
  const buf = Buffer.from(await file.arrayBuffer());
  const meter = currentMeter();
  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    takeOne(meter);
    res = await fetchGemini(key, file, buf).catch(() => null);
    if (res?.ok) break;
    noteError(meter, res ? res.status : 408);
    if (res && ![408, 429, 500, 502, 503, 504].includes(res.status)) break;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!res) return { ok: false, detail: "fetch_failed" };
  return readGemini(res);
}

function fetchGemini(key: string, file: File, buf: Buffer) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      // ★鍵は見出しで渡す（URL はログに残りやすい。ほかの呼び出しと同じ形）。
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: file.type || "audio/webm", data: buf.toString("base64") } },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(25000),
    },
  );
}

async function readGemini(res: Response): Promise<{ ok: true; text: string } | { ok: false; detail: string }> {
  const body = await res.text();
  if (!res.ok) return { ok: false, detail: body.slice(0, 300) };
  try {
    const json = JSON.parse(body) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    return text ? { ok: true, text } : { ok: false, detail: "empty" };
  } catch {
    return { ok: false, detail: body.slice(0, 300) };
  }
}

// my-brain の受信箱へ追記する(その月のフォルダの voice.md)。Coworkはこれを読んで
// 候補を作る。失敗しても文字起こし自体は返す(ベストエフォート)。
async function appendToMyBrain(text: string, at: Date): Promise<boolean> {
  const path = dayPath(monthKey(at), "voice");
  // ★日本時間で書く（サーバーの時計は世界標準時。夜の「1日を仕分ける」が日付で読む）。
  const j = jstParts(at), pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${j.y}-${pad(j.m)}-${pad(j.d)} ${pad(j.h)}:${pad(j.min)}`;
  const existing = await readMyBrainFile(path);
  const head = `# 声のメモ（${j.y}年${j.m}月）\n\nアプリで録音し、文字起こししたもの。分類前の生のテキスト。\n`;
  const entry = `\n## ${stamp}\n\n${text.trim()}\n`;
  const next = (existing ?? head) + entry;
  const res = await writeMyBrainFile(path, next, `声のメモを追記 (${stamp})`);
  return res.ok;
}

export async function POST(req: Request) {
  if (!(await isOwner(req))) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("audio");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  if (!file || file.size === 0) return NextResponse.json({ ok: false, reason: "no_audio" }, { status: 400 });

  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!openaiKey && !geminiKey) return NextResponse.json({ ok: false, reason: "no_key" });

  const audio = file;
  const result = openaiKey ? await viaOpenAI(openaiKey, audio) : await withBudget("transcribe", () => viaGemini(geminiKey!, audio));
  if (!result.ok) return NextResponse.json({ ok: false, reason: "transcribe_failed", detail: result.detail }, { status: 502 });

  const at = new Date();
  const saved = await appendToMyBrain(result.text, at);
  return NextResponse.json({ ok: true, text: result.text, at: at.toISOString(), savedToMyBrain: saved });
}
