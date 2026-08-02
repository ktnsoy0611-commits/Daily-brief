import type { InboxCandidate, JournalEntry } from "./types";

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
      return {
        id: head.trim(),
        kind,
        title,
        when: f["いつ"],
        where: f["どこで"],
        who: f["だれと"],
        what: f["なにを"],
        why: f["なぜ"],
        how: f["どうやって"],
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
