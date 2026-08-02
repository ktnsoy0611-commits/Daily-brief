// ★my-brain(データベース)のファイル配置は、このファイルだけが知っている。
//
// 以前は15個のファイルがルート直下と logs/ inbox/ journal/ に混在し、命名も
// 主題(taste/sources/goals)・所有者(-user/-proposed/-stats)・日付が混ざって
// いた。このまま「傾向」「声のメモ」「まとめ」を足すと収拾がつかなくなるため、
// **役割 × 日付** の2軸で整理し直した(ユーザー指定: 「ファイルが乱立せず、
// 今後増減しても対応できるように」)。
//
//   my-brain/
//     README.md              地図と規約(人間向け・Coworkが書く)
//     me/                    私という人。少数・恒久・上書き更新
//       taste.md             興味・好み(アプリのゾーン + Coworkの分析)
//       patterns.md          手配漏れ・物忘れ・後回しの傾向(Coworkが育てる)
//       goals.md             ゴールとチェックイン(アプリ)
//     days/2026-08/          日付で増えるものは全部この下。種類は4つに固定
//       facts.md             その日の事実(アプリ)
//       voice.md             声のメモの文字起こし(アプリ)
//       summary.md           その日のまとめ=自動生成の日記(Cowork)
//       feedback.md          カードへの反応ログ(アプリ)
//     inbox/candidates.md    タスク・ウィッシュの候補(Cowork→アプリが消費)
//     sources/list.md        巡回する情報源(お気に入りゾーン + 発掘分)
//     sources/stats.md       情報源ごとの打率
//     sources/proposed.md    Cronが提案した情報源
//     sources/dismissed.md   アプリで削除した情報源(発掘タスクが尊重する)
//     analysis/taste.md      嗜好の分析レポート(Cowork週次・人間が読む)
//
// 規約:
//   - 恒久的なもの = 主題ごとに1ファイル。増えるとしても数個。
//   - 日付で増えるもの = days/YYYY-MM/ の中だけ。増えるのは月フォルダで、
//     ファイルの種類は増えない。月フォルダを開けばその月のすべてが揃う。
//   - 各ファイルの先頭に front-matter で所有者(owner: app|cowork|human)を書き、
//     所有者が違うファイルは互いに上書きしない。1ファイルを共同編集するのは
//     me/taste.md と sources/list.md だけで、そこは既存のゾーン方式
//     (<!-- BEGIN/END app-managed:... -->)を使う。
//   - **パス文字列をこのファイルの外に書かない。** 新しい情報を足すときは、
//     まずここに置き場を決めてから使う。

export const PATHS = {
  readme: "README.md",
  taste: "me/taste.md",
  patterns: "me/patterns.md",
  goals: "me/goals.md",
  candidates: "inbox/candidates.md",
  sources: "sources/list.md",
  stats: "sources/stats.md",
  proposed: "sources/proposed.md",
  dismissed: "sources/dismissed.md",
  analysis: "analysis/taste.md",
} as const;

// days/YYYY-MM/ の中に置く4種類。
export type DayFile = "facts" | "voice" | "summary" | "feedback";

export const dayPath = (month: string, kind: DayFile) => `days/${month}/${kind}.md`;

// Date から月キー(YYYY-MM)。
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// ---- 旧パス(移行前に書かれたファイル) --------------------------------------
// 移行が済むまでは、読むときだけ旧パスへフォールバックする(書き込みは新パス
// のみ)。移行はCoworkに一度だけ実行させ、済んだらこの表は消してよい。
export const LEGACY: Record<string, string> = {
  [PATHS.taste]: "taste-state.md",
  [PATHS.goals]: "goals.md",
  [PATHS.sources]: "sources.md",
  [PATHS.stats]: "source-stats.md",
  [PATHS.proposed]: "sources-proposed.md",
  [PATHS.dismissed]: "sources-user.md",
  [PATHS.analysis]: "taste-analysis.md",
};

export function legacyDayPath(month: string, kind: DayFile): string | null {
  if (kind === "feedback") return `logs/feedback-${month}.md`;
  if (kind === "voice") return `inbox/voice-${month}.md`;
  if (kind === "facts") return `journal/${month}.md`;
  if (kind === "summary") return `journal/summary-${month}.md`;
  return null;
}

// 新パスに対応する旧パス(無ければnull)。dayPath形式も解釈する。
export function legacyOf(path: string): string | null {
  if (LEGACY[path]) return LEGACY[path];
  const m = /^days\/(\d{4}-\d{2})\/(facts|voice|summary|feedback)\.md$/.exec(path);
  return m ? legacyDayPath(m[1], m[2] as DayFile) : null;
}
