import { NextResponse } from "next/server";
import { buildDeck, type InterestSignal } from "@/lib/briefPipeline";

// ブリーフ生成の実験用サーバー関数(フェーズC-0「プロンプト実験場」)。
// 実体の取得・抽出・分類・編成は lib/briefPipeline.ts の buildDeck() が担う
// (夜間Cronと共通)。このルートは設定画面の実験カードから叩かれ、body で渡された
// taste(wishes/interests/focus)と情報源URLを buildDeck へ渡して結果を返すだけの
// 薄いラッパー。GEMINI_API_KEY 未設定なら buildDeck が reason:"no_key" を返す。

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: { wishes?: string[]; interests?: any[]; focus?: string; sources?: string[]; count?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const wishes = (body.wishes ?? []).filter((w) => typeof w === "string" && w.trim()).slice(0, 20);
  // interests は {label, weight} を受け取る。文字列のみが来た場合は weight:0 扱い。
  const interests: InterestSignal[] = (body.interests ?? [])
    .map((i): InterestSignal | null => {
      if (typeof i === "string") return i.trim() ? { label: i.trim(), weight: 0 } : null;
      if (i && typeof i === "object" && typeof i.label === "string" && i.label.trim()) {
        return { label: i.label.trim(), weight: typeof i.weight === "number" ? i.weight : 0 };
      }
      return null;
    })
    .filter((i): i is InterestSignal => i !== null)
    .slice(0, 20);
  const focus = (body.focus ?? "").trim();
  const sources = (body.sources ?? []).filter((u) => typeof u === "string").map((u) => u.trim());
  const count = body.count ?? 3;

  const result = await buildDeck({ taste: { focus, wishes, interests }, sources, count });
  const status = result.ok ? 200 : result.reason.startsWith("gemini_") || result.reason === "fetch_failed" ? 502 : 200;
  return NextResponse.json(result, { status });
}
