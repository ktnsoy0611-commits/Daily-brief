import { NextResponse } from "next/server";
import { isOwner } from "@/lib/ownerAuth";
import { parseCandidates, parseDaySummaries } from "@/lib/inboxImport";
import { PATHS, dayPath, monthKey } from "@/lib/myBrainPaths";
import { readMyBrainFile } from "@/lib/myBrainWrite";

// 夜間のCoworkが my-brain へ書いた「インボックスの候補」と「その日の
// まとめ(自動生成の日記)」を読むだけのルート。クライアントはGitHubへ直接アクセス
// できない(GITHUB_TOKENはサーバーのみ)ため、AppShellの起動時pullは
// ここを経由する。書き込みはしない。

export const runtime = "nodejs";
export const maxDuration = 15;

const summaryPath = (d: Date) => dayPath(monthKey(d), "summary");

// ★本人だけ（2026-10-10・第137巡）―― その日のまとめ（日記）と候補が誰でも読めた。
export async function GET(req: Request) {
  if (!(await isOwner(req))) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // 月をまたいだ直後も取りこぼさないよう、今月と先月を読む。
  const [candMd, sumThis, sumLast] = await Promise.all([
    readMyBrainFile(PATHS.candidates),
    readMyBrainFile(summaryPath(now)),
    readMyBrainFile(summaryPath(prev)),
  ]);
  const candidates = parseCandidates(candMd);
  // その日のまとめ(Coworkが自動生成した日記)。ジャーナルは候補にせず、この
  // まとめとしてその日の記録へ直接入る方針になったので、読むのはこれだけ。
  const summaries = { ...parseDaySummaries(sumLast), ...parseDaySummaries(sumThis) };
  return NextResponse.json({ ok: true, candidates, journal: [], summaries });
}
