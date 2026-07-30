import { NextResponse } from "next/server";
import { buildPlans, type PlanCandidate } from "@/lib/planPipeline";
import { ITEM_KINDS } from "@/lib/constants";
import type { ItemKind } from "@/lib/types";

// プラン生成(プランタブの「プランを生成」)のサーバー関数。実体の距離計算・
// プロンプト・検証は lib/planPipeline.ts の buildPlans() が担い、このルートは
// クライアントが送ってきた候補カードを検証して渡すだけの薄いラッパー。
// GEMINI_API_KEY 未設定なら buildPlans が reason:"no_key" を返す。

export const runtime = "nodejs";
export const maxDuration = 60;

const KIND_IDS = new Set<string>(ITEM_KINDS.map((k) => k.id));

function parseCandidates(v: unknown): PlanCandidate[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw): PlanCandidate | null => {
      if (!raw || typeof raw !== "object") return null;
      const o = raw as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id.trim() : "";
      const title = typeof o.title === "string" ? o.title.trim() : "";
      if (!id || !title) return null;
      const kind = typeof o.kind === "string" && KIND_IDS.has(o.kind) ? (o.kind as ItemKind) : "place";
      return {
        id,
        title: title.slice(0, 80),
        kind,
        area: typeof o.area === "string" ? o.area.slice(0, 40) : undefined,
        lat: typeof o.lat === "number" ? o.lat : undefined,
        lng: typeof o.lng === "number" ? o.lng : undefined,
        summary: typeof o.summary === "string" ? o.summary.slice(0, 200) : undefined,
      };
    })
    .filter((c): c is PlanCandidate => c !== null);
}

export async function POST(req: Request) {
  let body: { items?: unknown; area?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const candidates = parseCandidates(body.items);
  const area = typeof body.area === "string" && body.area.trim() ? body.area.trim() : null;

  const result = await buildPlans({ candidates, area });
  const status = result.ok || !result.reason.startsWith("gemini_") ? 200 : 502;
  return NextResponse.json(result, { status });
}
