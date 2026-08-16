import { inferTag, normalizeTag } from "./taskTags";
import type { InboxCandidate, JournalEntry, TaskWeight } from "./types";

// ★Coworkが夜間に書いた my-brain のファイルを読み取る(純粋関数)。
//   inbox/candidates.md … タスク・ウィッシュの候補(承認して初めて登録される)
//   inbox/journal-YYYY-MM.md … その日の記録として直接入るジャーナル
// どちらも「## 見出し = 1件」の素直なMarkdown。Coworkに書かせるものなので、
// 欠けた項目・順番の入れ替わり・余分な空行に寛容にパースする
// (書式が少し崩れても取りこぼさない)。

const KIND_MAP: Record<string, InboxCandidate["kind"]> = {
  "タスク": "task", "ウィッシュ": "wish", "ジャーナル": "journal", "ストック": "item",
};

// 「- ラベル: 値」の行を拾う。値が空なら未記入として扱う(項目ごと落とす)。
function fields(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  block.split("\n").forEach((line) => {
    const m = /^\s*[-*]\s*([^:：]+)[:：]\s*(.*)$/.exec(line);
    if (!m) return;
    const key = m[1].trim();
    const value = m[2].trim();
    if (value) out[key] = value;
  });
  return out;
}

// 「## 見出し」で切り分ける。見出し自体をキー(id/日時)として返す。
function blocks(md: string): { head: string; body: string }[] {
  const out: { head: string; body: string }[] = [];
  const lines = md.split("\n");
  let head: string | null = null;
  let buf: string[] = [];
  const flush = () => { if (head !== null) out.push({ head, body: buf.join("\n") }); };
  lines.forEach((line) => {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) { flush(); head = m[1]; buf = []; return; }
    if (head !== null) buf.push(line);
  });
  flush();
  return out;
}

// 「重要度: 3」の値を 1〜3 に丸める。全角の数字・「3（…）」のような
// 注釈つきにも寛容にする(Coworkに書かせるものなので書式が少し崩れうる)。
function parseWeight(raw: string | undefined): TaskWeight | undefined {
  if (!raw) return undefined;
  const m = /[1-3１-３]/.exec(raw.normalize("NFKC"));
  if (!m) return undefined;
  return Number(m[0].normalize("NFKC")) as TaskWeight;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * ★「いつ」を**日付**として読む(2026-08-16にユーザー確定で面の2番目を
 * dueDate へ一本化した)。読めた分だけ拾い、「今週中」のような自由文は
 * undefined を返す — 呼び側がメモ(context)へ回す。
 *
 * Coworkに書かせる値なので、書式は一通り受ける:
 *   2026-08-20 / 2026/8/20 / 8月20日 / 8/20 / 今日・明日・明後日
 * 月日だけのものは**未来に寄せる**(過ぎていれば翌年)。
 */
export function parseWhenDate(raw: string | undefined, today = new Date()): string | undefined {
  if (!raw) return undefined;
  const s = raw.normalize("NFKC").trim();
  const rel = { "今日": 0, "本日": 0, "明日": 1, "あす": 1, "明後日": 2, "あさって": 2 }[s];
  if (rel !== undefined) {
    const d = new Date(today);
    d.setDate(d.getDate() + rel);
    return ymd(d);
  }
  const full = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/.exec(s);
  if (full) {
    const [, y, m, d] = full.map(Number);
    return isValid(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : undefined;
  }
  const md = /^(\d{1,2})[-/月](\d{1,2})日?$/.exec(s);
  if (md) {
    const [, m, d] = md.map(Number);
    if (!isValid(today.getFullYear(), m, d)) return undefined;
    const y = today.getFullYear();
    const cand = `${y}-${pad(m)}-${pad(d)}`;
    return cand < ymd(today) ? `${y + 1}-${pad(m)}-${pad(d)}` : cand;
  }
  return undefined;
}

/** 実在する日付か(2月30日のような値を弾く)。 */
function isValid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}

export function parseCandidates(md: string | null): InboxCandidate[] {
  if (!md) return [];
  return blocks(md)
    .map(({ head, body }): InboxCandidate | null => {
      const f = fields(body);
      const kind = KIND_MAP[f["種類"] ?? ""];
      const title = f["題"] ?? f["タイトル"];
      if (!kind || !title) return null;
      // ジャーナルは候補にしない方針(その日の記録へ直接入る)。混ざっていても弾く。
      if (kind === "journal") return null;
      // 側面の4項目。Coworkの新しい書式(道具・場所/持ち物)と、旧書式
      // (どこで)の両方を受ける。面に載らなくなった旧項目(だれと/なぜ/
      // どうやって/なにを)は捨てずに Free Text(note)へ回す。
      // 「いつ」は日付として読む。読めなければメモ(context)の先頭へ回す。
      const when = f["いつ"];
      const dueDate = parseWhenDate(when);
      const context = [
        dueDate ? undefined : when,
        f["道具・場所"] ?? f["道具"] ?? f["どこで"],
      ].filter(Boolean).join("\n") || undefined;
      const belongings = f["持ち物"];
      const extra = [
        ["だれと", f["だれと"]], ["なぜ", f["なぜ"]], ["どうやって", f["どうやって"]],
        ["なにを", f["なにを"] && f["なにを"] !== title ? f["なにを"] : undefined],
      ]
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`);
      const note = [f["メモ"], ...extra].filter(Boolean).join("\n") || undefined;
      return {
        id: head.trim(),
        kind,
        title,
        dueDate,
        context,
        belongings,
        note,
        // ★AIから来た時点でタグ(=色)を自動で割り振る。Coworkが書いてくれば
        // そちらを優先し(旧6タグの綴りも読み替える)、無ければ言葉から見立てる。
        tag: normalizeTag(f["タグ"]) ?? inferTag(title, when, context, belongings, note),
        // 重要度の見立て(1〜3)。物体の大きさ = 重要度 × 切迫度 の片方になる。
        // 1〜3以外・未記入は未設定のままにし、アプリ側で「中」として扱う。
        weight: parseWeight(f["重要度"]),
        sourceText: f["もとの声"],
        createdAt: f["出典"] ?? new Date().toISOString(),
      };
    })
    .filter((c): c is InboxCandidate => !!c);
}

// 見出しは「YYYY-MM-DD HH:MM」。本文はそのまま記録の本文になる。
export function parseJournal(md: string | null): JournalEntry[] {
  if (!md) return [];
  return blocks(md)
    .map(({ head, body }): JournalEntry | null => {
      const m = /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}):(\d{2}))?/.exec(head.trim());
      const text = body.split("\n").filter((l) => !/^\s*[-*]\s*[^:：]+[:：]/.test(l)).join("\n").trim();
      if (!m || !text) return null;
      const [, date, hh, mm] = m;
      const createdAt = new Date(`${date}T${hh ?? "21"}:${mm ?? "00"}:00`).toISOString();
      return { id: `voice-journal-${date}-${hh ?? "21"}${mm ?? "00"}`, date, body: text, createdAt };
    })
    .filter((e): e is JournalEntry => !!e);
}

// Coworkが書いた「その日のまとめ」。見出しは YYYY-MM-DD、本文がまとめ。
export function parseDaySummaries(md: string | null): Record<string, { text: string; at: string }> {
  if (!md) return {};
  const out: Record<string, { text: string; at: string }> = {};
  blocks(md).forEach(({ head, body }) => {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(head.trim());
    const text = body.trim();
    if (!m || !text) return;
    out[m[1]] = { text, at: new Date().toISOString() };
  });
  return out;
}
