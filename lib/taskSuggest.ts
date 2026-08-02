import { callGemini, extractJsonArray } from "./briefPipeline";
import type { TaskSuggestion } from "./types";

// ★付随タスクの提案。「旅行に行く」と登録したら「新幹線は取った?」「朝何時に
// 出るか確認した?」を、「会議をする」なら「会議室は取った?」「リマインドの
// メールは送った?」を出す。ユーザー本人の言葉:
//
//   私は非常に物忘れが多かったり、気が利かなかったり、計画をあらかじめ
//   立てるのが面倒だったり、と言った性質があります。
//
// 材料は3つ: タスク本体 / この人の傾向(my-brain の me/patterns.md をCoworkが
// 育てる) / 過去に済ませた似たタスク。AIが出すのは文面だけで、件数の上限・
// 重複の排除・空の除去はコード側で切る(briefPipelineと同じ分担)。

export const SUGGEST_LIMIT = 6;
const TITLE_MAX = 40;
const WHY_MAX = 60;

const SYSTEM_SUGGEST = `あなたはタスクの段取りを補うモジュールです。1つのタスクを受け取り、それを実行するために事前に済ませておくべきことを、確認の問いとして列挙します。

# 入力仕様
<基準日>: 本日の日付
<タスク>: 題・期日・メモ
<この人の傾向>: 過去に手配を漏らした・後回しにした癖の記録（無いこともある）
<過去に済ませた似たタスク>: 同じようなタスクで実際にやったこと（無いこともある）

# ルール
1. タスクに書かれていない固有名（店名・人名・路線名・金額・時刻）を作らない。「新幹線」「会議室」のような、そのタスクなら誰でも思いつく一般的な手配は書いてよい。
2. 1件は、その場で「済んだ/まだ」を答えられる粒度にする。「準備する」ではなく「予約を取る」「集合時間を伝える」のように、行動が1つに定まる言葉にする。
3. タスクの本体そのもの（例: 旅行に行く）は書かない。本体より前に済ませておくことだけを書く。
4. <この人の傾向>にある癖に当たるものを優先して先に置く。
5. 期日が近いもの・予約や連絡など相手がいるものを先に置く。
6. 思いつく限り並べるのではなく、本当に落としそうなものだけを最大6件。当たり前すぎて確認するまでもないことは省く。
7. title は12〜20字。why は「なぜ今それを確認するのか」を20字前後で1文。理由が自明なものは why を省く。

# 出力契約
下記フィールドのJSON配列のみを出力する。該当が無ければ [] を出力する。
title: 文字列
why: 文字列（任意）`;

export interface SuggestInput {
  title: string;
  dueDate?: string;
  note?: string;
  // すでにあるサブタスク(同じことを二度提案しないため)
  existing?: string[];
  // me/patterns.md から抜いた傾向(箇条書きの行)
  patterns?: string[];
  // 過去に済ませた似たタスク(題 + そのサブタスク)
  pastSimilar?: { title: string; steps: string[] }[];
}

export type SuggestResult =
  | { ok: true; suggestions: TaskSuggestion[] }
  | { ok: false; reason: string; detail?: string };

// 比較用の正規化(全角/半角・空白・記号のゆらぎを吸収)。
const norm = (s: string) =>
  s.normalize("NFKC").toLowerCase().replace(/[\s　。、,.!?！？「」『』()（）]/g, "");

export function buildSuggestPrompt(input: SuggestInput, todayJp: string): string {
  const task = [
    `題: ${input.title}`,
    input.dueDate ? `期日: ${input.dueDate}` : null,
    input.note ? `メモ: ${input.note}` : null,
    input.existing?.length ? `すでに書き出した手順: ${input.existing.join(" / ")}` : null,
  ].filter(Boolean).join("\n");
  const past = (input.pastSimilar ?? [])
    .map((p) => `- ${p.title}${p.steps.length ? `（${p.steps.join(" / ")}）` : ""}`)
    .join("\n");
  return `<基準日>${todayJp}</基準日>
<タスク>
${task}
</タスク>
<この人の傾向>${input.patterns?.length ? `\n${input.patterns.map((p) => `- ${p}`).join("\n")}\n` : "記録なし"}</この人の傾向>
<過去に済ませた似たタスク>${past ? `\n${past}\n` : "記録なし"}</過去に済ませた似たタスク>`;
}

// AIの生出力を検証する。空・長すぎ・既存と重複・提案どうしの重複を落とし、
// 上限で切る(件数と重複の管理はAIに任せない)。
export function validateSuggestions(raw: unknown, existing: string[] = []): TaskSuggestion[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set(existing.map(norm));
  const out: TaskSuggestion[] = [];
  list.forEach((r, i) => {
    if (!r || typeof r !== "object") return;
    const o = r as { title?: unknown; why?: unknown };
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title || title.length > TITLE_MAX) return;
    const key = norm(title);
    if (!key || seen.has(key)) return;
    if (out.length >= SUGGEST_LIMIT) return;
    seen.add(key);
    const why = typeof o.why === "string" ? o.why.trim().slice(0, WHY_MAX) : "";
    out.push({ id: `sug-${Date.now()}-${i}`, title, why: why || undefined });
  });
  return out;
}

// my-brain の me/patterns.md から傾向の行だけを抜く(見出し・空行は捨てる)。
export function patternsFromMd(md: string | null, limit = 12): string[] {
  if (!md) return [];
  return md
    .split("\n")
    .map((l) => l.match(/^\s*[-*]\s+(.+?)\s*$/)?.[1] ?? "")
    .filter((l) => l && !l.startsWith("("))
    .slice(0, limit);
}

// 題が似ている過去のタスクを探す。文字の2-gramの重なり具合(Jaccard)で測る。
// 単純な「一致した数」だと「〜に行く」のような助詞まじりの共通部分だけで
// 「歯医者に行く」と「金沢へ旅行に行く」が似ていることになってしまうため、
// 両方の長さで割った比率で見て、しきい値未満は似ていないとみなす。
const bigrams = (s: string): Set<string> => {
  const t = norm(s);
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
};
const SIMILAR_MIN = 0.3;

export function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  A.forEach((g) => { if (B.has(g)) inter++; });
  return inter / (A.size + B.size - inter);
}

export function findSimilarTasks<T extends { title: string; done: boolean; subtasks?: { title: string; done: boolean }[] }>(
  title: string, tasks: T[], limit = 3,
): { title: string; steps: string[] }[] {
  return tasks
    .filter((t) => t.done && norm(t.title) !== norm(title))
    .map((t) => ({ t, s: similarity(title, t.title) }))
    .filter((x) => x.s >= SIMILAR_MIN)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => ({ title: x.t.title, steps: (x.t.subtasks ?? []).filter((s) => s.done).map((s) => s.title).slice(0, 6) }));
}

export async function suggestSubtasks(input: SuggestInput): Promise<SuggestResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: "no_key" };
  if (!input.title.trim()) return { ok: false, reason: "no_task" };
  const todayJp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const res = await callGemini(key, SYSTEM_SUGGEST, buildSuggestPrompt(input, todayJp), true, 1024);
  if (!res.ok) return { ok: false, reason: `gemini_${res.status}`, detail: res.detail };
  const raw = extractJsonArray<unknown>(res.text);
  if (!raw) return { ok: false, reason: "parse_failed", detail: res.text.slice(0, 200) };
  return { ok: true, suggestions: validateSuggestions(raw, input.existing ?? []) };
}
