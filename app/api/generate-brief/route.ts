import { NextResponse } from "next/server";
import { buildDeck, type InterestSignal } from "@/lib/briefPipeline";

// ブリーフ生成の実験用サーバー関数(フェーズC-0「プロンプト実験場」)。
// 実体の取得・抽出・分類・編成は lib/briefPipeline.ts の buildDeck() が担う
// (夜間Cronと共通)。このルートは設定画面の実験カードから叩かれ、body で渡された
// taste(wishes/taste/interest)と情報源URLを buildDeck へ渡して結果を返すだけの
// 薄いラッパー。GEMINI_API_KEY 未設定なら buildDeck が reason:"no_key" を返す。

export const runtime = "nodejs";
export const maxDuration = 60;

function parseSignals(v: unknown): InterestSignal[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((i): InterestSignal | null => {
      if (typeof i === "string") return i.trim() ? { label: i.trim(), weight: 0 } : null;
      if (i && typeof i === "object" && typeof (i as { label?: unknown }).label === "string") {
        const o = i as { label: string; weight?: unknown };
        return o.label.trim() ? { label: o.label.trim(), weight: typeof o.weight === "number" ? o.weight : 0 } : null;
      }
      return null;
    })
    .filter((i): i is InterestSignal => i !== null)
    .slice(0, 20);
}

export async function POST(req: Request) {
  let body: { wishes?: string[]; taste?: unknown; interest?: unknown; sources?: string[]; count?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const wishes = (body.wishes ?? []).filter((w) => typeof w === "string" && w.trim()).slice(0, 20);
  const taste = parseSignals(body.taste);
  const interest = parseSignals(body.interest);
  const sources = (body.sources ?? []).filter((u) => typeof u === "string").map((u) => u.trim());
  const count = body.count ?? 3;

  const result = await buildDeck({ taste: { taste, interest, wishes }, sources, count });
  const status = result.ok ? 200 : result.reason.startsWith("gemini_") || result.reason === "fetch_failed" ? 502 : 200;
  return NextResponse.json(result, { status });
}
