import { callGemini, extractJsonArray } from "./briefPipeline";
import type { TaskSuggestion, TaskTip } from "./types";

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
export const TIP_LIMIT = 2;
const WORD_MAX = 8;
const CHECK_MAX = 40;
const TITLE_MAX = 40;
const WHY_MAX = 60;

// ★★★**第137巡（2026-10-10）に (B) tips の雲を足した**（ユーザー承認の下書き1。規則1〜7は1文字も変えていない）。
//   1つのタスクにつき1回の呼び出しで、事前に済ませること（subtasks）と当日に確かめる一言（tips）を両方もらう。
const SYSTEM_SUGGEST = `あなたはタスクの段取りを補うモジュールです。1つのタスクを受け取り、(A) 事前に済ませておくべきこと と、(B) 当日その場で確かめる一言 の2種類を返します。

# 入力仕様
<基準日>: 本日の日付
<タスク>: 題・期日・メモ
<この人の傾向>: 過去に手配を漏らした・後回しにした・忘れ物や遅刻をした癖の記録（無いこともある）
<過去に済ませた似たタスク>: 同じようなタスクで実際にやったこと（無いこともある）

# (A) 事前に済ませること（subtasks）
1. タスクに書かれていない固有名（店名・人名・路線名・金額・時刻）を作らない。「新幹線」「会議室」のような、そのタスクなら誰でも思いつく一般的な手配は書いてよい。
2. 1件は、その場で「済んだ/まだ」を答えられる粒度にする。「準備する」ではなく「予約を取る」「集合時間を伝える」のように、行動が1つに定まる言葉にする。
3. タスクの本体そのもの（例: 旅行に行く）は書かない。本体より前に済ませておくことだけを書く。
4. <この人の傾向>にある癖に当たるものを優先して先に置く。
5. 期日が近いもの・予約や連絡など相手がいるものを先に置く。
6. 思いつく限り並べるのではなく、本当に落としそうなものだけを最大6件。当たり前すぎて確認するまでもないことは省く。
7. title は12〜20字。why は「なぜ今それを確認するのか」を20字前後で1文。理由が自明なものは why を省く。

# (B) 当日に確かめる一言（tips）
8. 当日その場で「ある／ない」「間に合う／間に合わない」を確かめるもの（持ち物・出発の時間・場所）だけを書く。予約や連絡のように前もって動く必要があるものは (A) に書き、(B) に重ねない。
9. word は 2〜6字の名詞（例: 診察券・保険証・折りたたみ傘・受付の時間）。check はその確認を問う1文で、30字以内、「〜ありますか？」「〜ですか？」のように問いで終える。todo は、それを私がやることにしたときのサブタスクの題で、12〜20字。
10. 多くて2件。<この人の傾向>に忘れ物・遅刻の癖があれば、それに当たるものを優先する。本当に忘れそうなものが無ければ [] にする（無理に作らない）。
11. タスクに書かれていない固有名・天気・時刻・金額を作らない。

# 出力契約
次の形のJSONオブジェクトのみを出力する。該当が無い側は空の配列にする。
{"subtasks": [{"title": 文字列, "why": 文字列（任意）}], "tips": [{"word": 文字列, "check": 文字列, "todo": 文字列}]}`;

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
  | { ok: true; suggestions: TaskSuggestion[]; tips: TaskTip[] }
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

// {"subtasks": [...], "tips": [...]} の形を取り出す（前後の文や ``` の囲みは捨てる）。
export function extractJsonObject(text: string): { subtasks: unknown; tips: unknown } | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const o = JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    if (!("subtasks" in o) && !("tips" in o)) return null;
    return { subtasks: o.subtasks ?? [], tips: o.tips ?? [] };
  } catch {
    return null;
  }
}

// tips を検品する。空・長すぎ・同じ語・準備タスクと同じ題は落とし、2件で切る（件数の管理は AI に任せない）。
export function validateTips(raw: unknown, subtaskTitles: string[] = []): TaskTip[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set(subtaskTitles.map(norm));
  const out: TaskTip[] = [];
  list.forEach((r, i) => {
    if (!r || typeof r !== "object" || out.length >= TIP_LIMIT) return;
    const o = r as { word?: unknown; check?: unknown; todo?: unknown };
    const word = typeof o.word === "string" ? o.word.trim() : "";
    const check = typeof o.check === "string" ? o.check.trim() : "";
    const todo = typeof o.todo === "string" ? o.todo.trim() : "";
    if (!word || word.length > WORD_MAX || !check || check.length > CHECK_MAX || !todo || todo.length > TITLE_MAX) return;
    const key = norm(word);
    if (!key || seen.has(key) || seen.has(norm(todo))) return;
    seen.add(key);
    seen.add(norm(todo));
    out.push({ id: `tip-${Date.now()}-${i}`, word, check, todo });
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
  // ★待ちは 10 秒・やり直し1回まで（`/api/suggest-subtasks` の `maxDuration` 30 秒に収める）。
  const res = await callGemini(key, SYSTEM_SUGGEST, buildSuggestPrompt(input, todayJp), true, 1024, { timeoutMs: 10000, retries: 1 });
  if (!res.ok) return { ok: false, reason: res.status === 0 ? "budget" : `gemini_${res.status}`, detail: res.detail };
  // ★答えは {subtasks, tips}。古い形（配列だけ）が返っても準備タスクとして読む。
  const obj = extractJsonObject(res.text);
  const subs = obj ? obj.subtasks : extractJsonArray<unknown>(res.text);
  if (!subs && !obj) return { ok: false, reason: "parse_failed", detail: res.text.slice(0, 200) };
  const suggestions = validateSuggestions(subs ?? [], input.existing ?? []);
  return { ok: true, suggestions, tips: validateTips(obj?.tips ?? [], suggestions.map((x) => x.title)) };
}
