import { NextResponse } from "next/server";
import { isOwner } from "@/lib/ownerAuth";
import { loadMyBrain } from "@/lib/myBrain";

// my-brainのtaste(好み・興味・生活圏)と情報源を読むだけの薄いルート。
// クライアント(ブラウザ)はGitHubへ直接アクセスできない(GITHUB_TOKENは
// サーバーのみ)ため、AppShell起動時のpull(my-brain→アプリ画面への反映)は
// この経由で読む。書き込みは行わない(/api/mybrain/syncが担当)。

export const runtime = "nodejs";
export const maxDuration = 15;

// ★本人だけ（2026-10-10・第137巡）―― 好み・生活圏が誰でも読めた。
export async function GET(req: Request) {
  if (!(await isOwner(req))) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  const brain = await loadMyBrain();
  // 好み/興味は「興味・好み」1リストへ統合済み(HANDOFF §8.14 優先度3)。
  return NextResponse.json({
    ok: brain.ok,
    taste: brain.taste.taste ?? [],
    livingArea: brain.taste.livingArea,
    sources: brain.sources,
    filesRead: brain.filesRead,
  });
}
