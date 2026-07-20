// KEEP/SKIP分析 → discovery-seeds.md の組み立て（純粋関数）。
// 夜間Cron(app/api/cron/build-brief)が呼び、結果を my-brain の discovery-seeds.md へ
// 書く。情報源スカウト(Claude Codeの週次タスク)がそれを読んで検索の手がかりにする。
//
// 分担: ドメイン別のKEEP/SKIP集計は「機械的な処理」なのでコードで確実に行い
// (捏造の余地なし)、本文からの題材抽出だけを Gemini に任せる(briefPipeline の
// extractKeepSubjects)。SYSTEM-DESIGN §3-8「機械的処理はコードで」に従う。

import type { BriefCard } from "./types";

export type SeedCard = { title: string; body: string; domain: string | null };

// URLからドメイン(先頭のwww.を除く)を取り出す。取れなければnull。
export function domainOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// briefs(号ごとのdecisions/feedback)と generatedDecks(号ごとのカード配列)を
// 突き合わせ、KEEP群とSKIP群のカード(title/body/domain)を取り出す。
// 旗(feedback=true)は強い負としてSKIP群に含める。
export function collectDecisions(
  briefs: Record<string, { decisions?: Record<string, string>; feedback?: Record<string, boolean> }>,
  decks: Record<string, BriefCard[]>,
): { kept: SeedCard[]; skipped: SeedCard[] } {
  const kept: SeedCard[] = [];
  const skipped: SeedCard[] = [];
  for (const [edition, brief] of Object.entries(briefs ?? {})) {
    const byId = new Map((decks[edition] ?? []).map((c) => [String(c.id), c]));
    for (const [cardId, decision] of Object.entries(brief.decisions ?? {})) {
      const card = byId.get(String(cardId));
      if (!card) continue;
      const rec: SeedCard = { title: card.title ?? "", body: (card.body ?? "").slice(0, 200), domain: domainOf(card.sourceUrl) };
      if (decision === "keep") kept.push(rec);
      else if (decision === "skip") skipped.push(rec);
      if (brief.feedback?.[cardId]) skipped.push(rec);
    }
  }
  return { kept, skipped };
}

// discovery-seeds.md の本文を組み立てる。好調な情報源(ドメイン別KEEP数の多い順)と、
// Geminiが抽出した「よく選ばれる題材」を並べる。データが乏しければその旨を書く。
export function buildSeedsMarkdown(kept: SeedCard[], skipped: SeedCard[], subjects: { label: string; kind: string }[]): string {
  const domainCount = new Map<string, { keep: number; skip: number }>();
  for (const k of kept) {
    if (!k.domain) continue;
    const c = domainCount.get(k.domain) ?? { keep: 0, skip: 0 };
    c.keep++;
    domainCount.set(k.domain, c);
  }
  for (const s of skipped) {
    if (!s.domain) continue;
    const c = domainCount.get(s.domain) ?? { keep: 0, skip: 0 };
    c.skip++;
    domainCount.set(s.domain, c);
  }
  const goodDomains = [...domainCount.entries()].filter(([, c]) => c.keep > 0).sort((a, b) => b[1].keep - a[1].keep);
  return [
    "# discovery-seeds（自動生成: KEEP/SKIPの分析。情報源スカウトが検索の手がかりに使う。手で編集しても次回の生成で上書きされます）",
    "",
    "## 好調な情報源",
    goodDomains.length ? goodDomains.map(([d, c]) => `- ${d} — KEEP ${c.keep} / SKIP ${c.skip}`).join("\n") : "（まだ判断材料が少ない）",
    "",
    "## よく選ばれる題材",
    subjects.length ? subjects.map((s) => `- ${s.label} [${s.kind}]`).join("\n") : "（まだ判断材料が少ない）",
    "",
  ].join("\n");
}
