import { NextResponse } from "next/server";
import { loadMyBrain } from "@/lib/myBrain";

// my-brainのtaste(好み・興味・生活圏)と情報源を読むだけの薄いルート。
// クライアント(ブラウザ)はGitHubへ直接アクセスできない(GITHUB_TOKENは
// サーバーのみ)ため、AppShell起動時のpull(my-brain→アプリ画面への反映)は
// この経由で読む。書き込みは行わない(/api/mybrain/syncが担当)。

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET() {
  const brain = await loadMyBrain();
  return NextResponse.json({
    ok: brain.ok,
    taste: brain.taste.taste ?? [],
    interest: brain.taste.interest ?? [],
    livingArea: brain.taste.livingArea,
    sources: brain.sources,
    filesRead: brain.filesRead,
  });
}
