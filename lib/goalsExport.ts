// ゴール(と、そこに書き溜めたチェックインの記録)を my-brain の goals.md へ
// 書き出すための純粋関数。
//
// ゴールは app_state(アプリのゴールタブ)にしか無く、Coworkはそれを読めない。
// 週次の分析タスクに「ゴールを分析し、達成に効くキーワードを出す」役割を
// 足すため、夜間Cronがこのファイルを書き出して共有する(HANDOFF §8.21)。
// チェックインの記録(日付・本文・節目かどうか・満足度)は分析の主材料なので、
// 直近を優先して**記録もすべて**載せる(ユーザー指定)。

export type CheckInLike = {
  at?: unknown; text?: unknown; kind?: unknown; rating?: unknown;
};
export type GoalLike = {
  id?: unknown; title?: unknown; addedAt?: unknown; checkIns?: unknown;
};

const CHECKINS_PER_GOAL = 30; // 1ゴールあたり載せる記録の上限(新しい順)

function ymd(iso: unknown): string {
  if (typeof iso !== "string") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function clean(s: unknown): string {
  return typeof s === "string" ? s.replace(/[｜\n\r]/g, " ").replace(/\s+/g, " ").trim() : "";
}

export function renderGoalsMd(goalsVal: unknown, now = new Date()): string {
  const goals = Array.isArray(goalsVal) ? (goalsVal as GoalLike[]) : [];
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const head = [
    `# goals（アプリのゴールタブから自動同期: ${stamp}。読むだけ・書き換えない）`,
    "",
    "各ゴールの下に、チェックインの記録を新しい順で並べている。",
    "記録の形式は「日付｜チェックイン or 節目｜(節目なら)満足度1〜3｜本文」。",
    "",
  ];
  const blocks: string[] = [];
  for (const g of goals) {
    const title = clean(g?.title);
    if (!title) continue;
    const id = typeof g?.id === "string" ? g.id : "";
    const started = ymd(g?.addedAt);
    const list = Array.isArray(g?.checkIns) ? (g.checkIns as CheckInLike[]) : [];
    const rows = list
      .filter((c) => c && (clean(c.text) || ymd(c.at)))
      .slice()
      .sort((a, b) => String(b?.at ?? "").localeCompare(String(a?.at ?? "")))
      .slice(0, CHECKINS_PER_GOAL)
      .map((c) => {
        const kind = c?.kind === "milestone" ? "節目" : "チェックイン";
        const rating = typeof c?.rating === "number" ? `満足度${c.rating}` : "";
        return `- ${ymd(c.at) || "日付不明"}｜${kind}${rating ? `｜${rating}` : ""}｜${clean(c.text) || "(記録なし)"}`;
      });
    blocks.push(
      [
        `## ${title}${id ? `（id: ${id}` : "（"}${started ? `${id ? " ／ " : ""}開始 ${started}` : ""} ／ 記録 ${list.length}件）`,
        rows.length ? rows.join("\n") : "- （まだ記録がありません）",
        "",
      ].join("\n"),
    );
  }
  if (blocks.length === 0) blocks.push("（まだゴールがありません）\n");
  return [...head, ...blocks].join("\n");
}
