import { NextResponse } from "next/server";
import { dayPath } from "@/lib/myBrainPaths";
import { writeMyBrainFile } from "@/lib/myBrainWrite";

// その日の記録(やったこと・済ませたタスク・自分で書いた記録)を my-brain へ
// 同期する。クライアントはGitHubへ直接アクセスできない(GITHUB_TOKENは
// サーバーのみ)ため、ここを経由して書き込む。
//
// 書き込むのは `days/YYYY-MM/facts.md`(アプリが所有)だけ。Coworkが書く
// まとめは同じフォルダの `summary.md` と別ファイルなので、ぶつからない。

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(req: Request) {
  let body: { files?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const files = Array.isArray(body.files) ? body.files : [];
  const targets = files
    .map((f) => (f && typeof f === "object" ? (f as { month?: unknown; content?: unknown }) : null))
    .filter((f): f is { month: string; content: string } =>
      !!f && typeof f.month === "string" && /^\d{4}-\d{2}$/.test(f.month) && typeof f.content === "string")
    .slice(0, 3); // 一度に触るのは直近の数か月まで
  if (targets.length === 0) return NextResponse.json({ ok: false, reason: "no_files" }, { status: 400 });

  const written: string[] = [];
  for (const t of targets) {
    const res = await writeMyBrainFile(dayPath(t.month, "facts"), t.content, `記録を同期 (${t.month})`);
    if (res.ok) written.push(t.month);
    else if (res.reason === "no_repo" || res.reason === "no_token") {
      return NextResponse.json({ ok: false, reason: res.reason });
    }
  }
  return NextResponse.json({ ok: true, written });
}
