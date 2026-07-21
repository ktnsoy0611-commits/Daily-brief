// 反応の生ログ(KEEP/SKIP/拒否/実行/星)を my-brain の logs/feedback-YYYY-MM.md へ
// エクスポートするための純粋関数。夜間Cronがこれを使い、カード内容が
// generatedDecks(app_stateで14日保持)から消える前に、月ごとのログへ焼き付ける。
// 分析はしない(それは別のCoworkタスクが logs/ を読んで推論する)。
// app_state に恒久ログを溜めず、履歴は my-brain 側に置くための仕組み。

import type { BriefCard } from "./types";

export type LogLine = { month: string; line: string };

const HEADER = "# feedback log（自動生成: 反応の記録。分析はしません。1年より古い月は自動削除されます）";

function ymd(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// editionKey "YYYY-MM-DD-am|pm" から日付(YYYY-MM-DD)と朝刊/夕刊を取り出す。
function parseEdition(editionKey: string): { date: string; edition: string } | null {
  const m = editionKey.match(/^(\d{4}-\d{2}-\d{2})-(am|pm)$/);
  if (!m) return null;
  return { date: m[1], edition: m[2] === "am" ? "朝刊" : "夕刊" };
}

function clean(s: string | undefined): string {
  return (s ?? "").replace(/[｜\n\r]/g, " ").replace(/\s+/g, " ").trim();
}

// URLはドメイン(ホスト)だけをログに残す。分析(好みの傾向)にはドメインで十分で、
// 長いパス・クエリ文字列はトークンの無駄なので落とす。ドメインは発掘タスクが
// 情報源の打率(KEEP率)を集計・淘汰するのに使う。
function domainOfUrl(url: string): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u.slice(0, 40);
  }
}

// 1行の自己完結ログ行を作る。区切りは全角｜。exact一致で重複排除できるよう決定的にする。
function makeLine(date: string, reaction: string, title: string, kind: string, url: string, summary: string): LogLine {
  // 要約(カード本文)は分析タスクがコンテキストとして読む主材料。途中で切らず
  // カード本文(約200字)が丸ごと収まる長さまで許す。URLはドメインだけにする。
  const line = `- ${date}｜${reaction}｜${clean(title)}｜${clean(kind)}｜${clean(domainOfUrl(url))}｜${clean(summary).slice(0, 400)}`;
  return { month: date.slice(0, 7), line };
}

// briefs(号ごとの決定)× generatedDecks(号ごとのカード)＋ items(KEEP後の顛末)から
// フラットなログ行を作る。1カード=1行(拒否>残した>流した の強い方を採る)。
export function buildLogLines(
  briefs: Record<string, { decisions?: Record<string, string>; feedback?: Record<string, boolean> }>,
  decks: Record<string, BriefCard[]>,
  items: { title?: string; kind?: string; sourceUrl?: string; good?: boolean; status?: string; doneAt?: string; addedAt?: string; summary?: string }[],
): LogLine[] {
  const out: LogLine[] = [];
  for (const [editionKey, brief] of Object.entries(briefs ?? {})) {
    const ed = parseEdition(editionKey);
    if (!ed) continue;
    const byId = new Map((decks[editionKey] ?? []).map((c) => [String(c.id), c]));
    for (const [cardId, decision] of Object.entries(brief.decisions ?? {})) {
      const card = byId.get(String(cardId));
      if (!card) continue; // 育成カード等、デッキに本体が無いものは記録しない
      const flagged = !!brief.feedback?.[cardId];
      const reaction = flagged ? "拒否" : decision === "keep" ? "残した" : decision === "skip" ? "流した" : null;
      if (!reaction) continue;
      out.push(makeLine(ed.date, reaction, card.title ?? "", card.kind ?? "", card.sourceUrl ?? "", card.body ?? ""));
    }
  }
  for (const it of items ?? []) {
    if (!it || typeof it.title !== "string") continue;
    if (it.status === "done") {
      const d = ymd(it.doneAt) ?? ymd(it.addedAt);
      if (d) out.push(makeLine(d, "実行", it.title, it.kind ?? "", it.sourceUrl ?? "", it.summary ?? ""));
    }
    if (it.good === true) {
      const d = ymd(it.doneAt) ?? ymd(it.addedAt);
      if (d) out.push(makeLine(d, "星付き", it.title, it.kind ?? "", it.sourceUrl ?? "", it.summary ?? ""));
    }
  }
  return out;
}

export function groupByMonth(lines: LogLine[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const { month, line } of lines) {
    const arr = map.get(month) ?? [];
    arr.push(line);
    map.set(month, arr);
  }
  return map;
}

// 既存の月ファイル本文に新しい行を追加し、重複(完全一致)を排除して書き戻す本文を作る。
// 既存の行を消さない(append-only)ので、カードがgeneratedDecksから消えた後の月でも
// 過去に記録済みの行は残る。日付の新しい順に並べる。
export function mergeMonthFile(existing: string | null, newLines: string[]): string {
  const prev = (existing ?? "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.startsWith("- "));
  const set = new Set<string>();
  const merged: string[] = [];
  for (const l of [...prev, ...newLines]) {
    if (set.has(l)) continue;
    set.add(l);
    merged.push(l);
  }
  merged.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)); // 行頭が日付なので文字列降順=新しい順
  return `${HEADER}\n\n${merged.join("\n")}\n`;
}

// 保持期間(既定12か月)より古い月のログファイルのパスを、基準日から機械的に列挙する。
// ディレクトリ一覧APIを使わず、13〜(13+span-1)か月前の月ファイル名を返す(定常運用では
// 毎月1つが期限切れになる。Cronが長期停止した場合の取りこぼしにspanで余裕を持たせる)。
export function oldLogPaths(now: Date, retentionMonths = 12, span = 6): string[] {
  const paths: string[] = [];
  for (let back = retentionMonths + 1; back < retentionMonths + 1 + span; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const p = (n: number) => String(n).padStart(2, "0");
    paths.push(`logs/feedback-${d.getFullYear()}-${p(d.getMonth() + 1)}.md`);
  }
  return paths;
}
