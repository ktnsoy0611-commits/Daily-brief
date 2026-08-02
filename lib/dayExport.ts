import { itemKindOf } from "./constants";
import type { DayRecord } from "./dayRecords";

// ★その日の記録を my-brain へ同期するためのMarkdown。
// アプリが書き、Coworkが読む。Coworkはこれと声のメモを材料に、その日の
// 「まとめ(自動生成のジャーナル)」を journal/summary-YYYY-MM.md へ書く
// (書くファイルを分けてあるので、アプリの上書きとCoworkの追記がぶつからない)。
//
// 記録はアプリの中でも見られるが、my-brain側にも同じものが揃っていて
// いつでも読めるようにする、というユーザーの指定による(HANDOFF §12)。

const time = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function renderDayBlock(day: DayRecord): string {
  const lines: string[] = [`## ${day.dateKey} ${day.label}`, ""];
  if (day.items.length > 0) {
    lines.push("### 行った・実行した");
    day.items.forEach((i) => {
      const bits = [itemKindOf(i.kind).label, i.area && i.area !== "—" ? i.area : null, time(i.doneAt)].filter(Boolean);
      lines.push(`- ${i.title}（${bits.join(" ・ ")}）`);
      if (i.summary) lines.push(`  - ${i.summary.replace(/\s+/g, " ").slice(0, 200)}`);
    });
    lines.push("");
  }
  if (day.tasks.length > 0) {
    lines.push("### 済ませたタスク");
    day.tasks.forEach((t) => lines.push(`- ${t.title}${t.note ? `（${t.note}）` : ""}${time(t.doneAt) ? ` ・ ${time(t.doneAt)}` : ""}`));
    lines.push("");
  }
  if (day.entries.length > 0) {
    lines.push("### 自分で書いた記録");
    day.entries.forEach((e) => {
      lines.push(`- ${time(e.createdAt)}`);
      e.body.split("\n").forEach((l) => lines.push(`  ${l}`));
    });
    lines.push("");
  }
  return lines.join("\n");
}

// 1か月ぶんをまとめる(新しい日が上)。
export function renderMonthMd(month: string, days: DayRecord[]): string {
  const [y, m] = month.split("-");
  const head = [
    `# 記録（${y}年${Number(m)}月）`,
    "",
    "アプリ（デイリーブリーフ）が書き出したその日の事実。行った場所・実行したカード・済ませたタスク・自分で書いた記録。",
    "この内容と声のメモをもとに、その日のまとめを `journal/summary-" + month + ".md` へ書く。",
    "",
  ].join("\n");
  return head + days.map(renderDayBlock).join("\n");
}

// 日付キー(YYYY-MM-DD)から月キー(YYYY-MM)へ。
export const monthOf = (dateKey: string) => dateKey.slice(0, 7);

// 日々の記録を月ごとに分ける(同期は月単位のファイルで行う)。
export function byMonth(days: DayRecord[]): Map<string, DayRecord[]> {
  const out = new Map<string, DayRecord[]>();
  days.forEach((d) => {
    const key = monthOf(d.dateKey);
    const list = out.get(key) ?? [];
    list.push(d);
    out.set(key, list);
  });
  return out;
}
