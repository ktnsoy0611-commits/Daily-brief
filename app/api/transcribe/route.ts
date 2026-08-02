import { NextResponse } from "next/server";
import { writeMyBrainFile, readMyBrainFile } from "@/lib/myBrainWrite";

// ★声のメモの文字起こし。タブバー右の丸ボタンを長押しして録音した音声を
// 受け取り、テキストにして返す。あわせて my-brain の受信箱
// (inbox/voice-YYYY-MM.md)へ追記し、夜間のCoworkがそれを読んで
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

async function viaGemini(key: string, file: File): Promise<{ ok: true; text: string } | { ok: false; detail: string }> {
  const buf = Buffer.from(await file.arrayBuffer());
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    },
  );
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

// my-brain の受信箱へ追記する(月ごとの1ファイル)。Coworkはこれを読んで
// 候補を作る。失敗しても文字起こし自体は返す(ベストエフォート)。
async function appendToMyBrain(text: string, at: Date): Promise<boolean> {
  const path = `inbox/voice-${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}.md`;
  const stamp = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")} ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  const existing = await readMyBrainFile(path);
  const head = `# 声のメモ（${at.getFullYear()}年${at.getMonth() + 1}月）\n\nアプリで録音し、文字起こししたもの。分類前の生のテキスト。\n`;
  const entry = `\n## ${stamp}\n\n${text.trim()}\n`;
  const next = (existing ?? head) + entry;
  const res = await writeMyBrainFile(path, next, `声のメモを追記 (${stamp})`);
  return res.ok;
}

export async function POST(req: Request) {
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

  const result = openaiKey ? await viaOpenAI(openaiKey, file) : await viaGemini(geminiKey!, file);
  if (!result.ok) return NextResponse.json({ ok: false, reason: "transcribe_failed", detail: result.detail }, { status: 502 });

  const at = new Date();
  const saved = await appendToMyBrain(result.text, at);
  return NextResponse.json({ ok: true, text: result.text, at: at.toISOString(), savedToMyBrain: saved });
}
