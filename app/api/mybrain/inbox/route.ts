import { NextResponse } from "next/server";
import { parseCandidates, parseJournal } from "@/lib/inboxImport";
import { readMyBrainFile } from "@/lib/myBrainWrite";

// 夜間のCoworkが my-brain へ書いた「インボックスの候補」と「その日の
// ジャーナル」を読むだけのルート。クライアントはGitHubへ直接アクセス
// できない(GITHUB_TOKENはサーバーのみ)ため、AppShellの起動時pullは
// ここを経由する。書き込みはしない。

export const runtime = "nodejs";
export const maxDuration = 15;

const monthPath = (d: Date) => `inbox/journal-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}.md`;

export async function GET() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // 月をまたいだ直後も取りこぼさないよう、今月と先月を読む。
  const [candMd, thisMonth, lastMonth] = await Promise.all([
    readMyBrainFile("inbox/candidates.md"),
    readMyBrainFile(monthPath(now)),
    readMyBrainFile(monthPath(prev)),
  ]);
  const candidates = parseCandidates(candMd);
  const journal = [...parseJournal(thisMonth), ...parseJournal(lastMonth)];
  return NextResponse.json({ ok: true, candidates, journal });
}
