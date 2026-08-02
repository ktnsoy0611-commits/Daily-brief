// 情報源ごとの打率(出した数・残した数)を集計する純粋関数。
//
// なぜ「反応ログ」と別に持つのか: 反応ログ(days/*/feedback.md)は前向きな反応
// (残した/実行/星)だけを記録し、流した(スキップ)は一切残さない方針(ユーザー指定)。
// そのため打率の分母(=その情報源のカードを何枚見せたか)がログからは出せない。
// 個別のスキップ記録を作らずに打率を出すため、**集計値だけ**をこのモジュールで
// 作り、my-brain の統計ファイルへ書く。Coworkの発掘タスクはこれを読んで
// cowork:discovered の並べ替え・淘汰を行う(HANDOFF §8.20)。
//
// 入力は app_state の generatedDecks(カードのsourceUrl)と briefs(keep/skipの決定)
// だけ。カードがデッキから消える前の分は集計済みの値として積み上げる(prevで渡す)。

export type SourceStatRow = {
  domain: string;   // 情報源のホスト(www.は除く)
  shown: number;    // スワイプで決定済みのカード数(=見せた数。未消化は数えない)
  kept: number;     // 残した(keep)数
  flagged: number;  // 旗を立てた(質が低いと申告した)数。強い負のシグナル
};

// URLからホスト(ドメイン)だけを取り出す。打率の集計単位はドメイン
// (1つの情報源が複数のURLパスでカードを出すため)。
export function domainOfUrl(url: string): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

type DeckCardLike = { id?: unknown; sourceUrl?: unknown };
type BriefLike = { decisions?: Record<string, unknown>; feedback?: Record<string, unknown> };

// 全号のデッキ×決定から、ドメインごとの shown/kept/flagged を数え、prev に加算する。
//
// 二重計上の防止: カードは保持期間(3日)を過ぎるとデッキから消えるため、集計は
// 毎晩少しずつ積み上げる必要がある。一方、同じカードがデッキに残っている間は
// 毎晩集計対象になるので、既に数えたカードidを countedIds で受け取って除外する。
// 返り値の newlyCounted を呼び出し側が countedIds へ足して次回渡す。
// (カードがデッキに居るのは最長3日なので、countedIdsは直近ぶんだけ保てばよい)
export function buildSourceStats(
  decksVal: unknown,
  briefsVal: unknown,
  prev: SourceStatRow[] = [],
  countedIds: string[] = [],
): { rows: SourceStatRow[]; newlyCounted: string[] } {
  const decks = (decksVal ?? {}) as Record<string, DeckCardLike[]>;
  const briefs = (briefsVal ?? {}) as Record<string, BriefLike>;

  // カードid → 決定/旗。決定は号をまたいでidが一意なのでマージして引ける。
  const decided = new Map<string, string>();
  const flagged = new Set<string>();
  for (const b of Object.values(briefs)) {
    for (const [id, d] of Object.entries(b?.decisions ?? {})) {
      if (typeof d === "string") decided.set(id, d);
    }
    for (const [id, f] of Object.entries(b?.feedback ?? {})) {
      if (f) flagged.add(id);
    }
  }

  const acc = new Map<string, SourceStatRow>();
  for (const r of prev) {
    if (!r?.domain) continue;
    acc.set(r.domain, {
      domain: r.domain,
      shown: Math.max(0, r.shown | 0),
      kept: Math.max(0, r.kept | 0),
      flagged: Math.max(0, r.flagged | 0),
    });
  }
  const already = new Set(countedIds);
  const seenCard = new Set<string>(); // 同じidが複数号に出ても1回だけ数える
  const newlyCounted: string[] = [];
  for (const deck of Object.values(decks)) {
    for (const c of deck ?? []) {
      const id = String(c?.id ?? "");
      if (!id || seenCard.has(id) || already.has(id)) continue;
      seenCard.add(id);
      const dec = decided.get(id);
      if (!dec) continue; // まだスワイプしていないカードは「見せた」に数えない
      const domain = domainOfUrl(typeof c?.sourceUrl === "string" ? c.sourceUrl : "");
      if (!domain) continue;
      const row = acc.get(domain) ?? { domain, shown: 0, kept: 0, flagged: 0 };
      row.shown += 1;
      if (dec === "keep") row.kept += 1;
      if (flagged.has(id)) row.flagged += 1;
      acc.set(domain, row);
      newlyCounted.push(id);
    }
  }
  // 打率の高い順(同率なら見せた数が多い順)に並べて返す。
  const rows = Array.from(acc.values()).sort((a, b) => {
    const ra = a.shown ? a.kept / a.shown : 0;
    const rb = b.shown ? b.kept / b.shown : 0;
    if (rb !== ra) return rb - ra;
    return b.shown - a.shown;
  });
  return { rows, newlyCounted };
}

export function hitRate(row: SourceStatRow): number {
  return row.shown ? row.kept / row.shown : 0;
}

// my-brain へ書くMarkdown。発掘タスクが読んで並べ替え・淘汰の根拠にする。
// 数字だけの素朴な表にして、AIが誤読しないようにする。
export function renderSourceStatsMd(rows: SourceStatRow[], now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const lines = rows.map((r) => {
    const rate = Math.round(hitRate(r) * 100);
    return `- ${r.domain}｜出した${r.shown}｜残した${r.kept}｜打率${rate}%｜旗${r.flagged}`;
  });
  return [
    `# source-stats（自動集計: ${stamp}。情報源ごとの打率。発掘タスクが並べ替え・淘汰に使う）`,
    "",
    "各行は「ドメイン｜出した数（スワイプで決定済み）｜残した数（KEEP）｜打率｜旗（質が低いと申告された数）」。",
    "打率 = 残した ÷ 出した。出した数が少ないサイトは判断材料が足りないので淘汰しないこと。",
    "",
    lines.length ? lines.join("\n") : "（まだ反応がありません）",
    "",
  ].join("\n");
}
