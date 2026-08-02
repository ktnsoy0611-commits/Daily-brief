import type { AppState } from "@/lib/types";

export type MyBrainSyncResult = { ok: true; wrote: string[] } | { ok: false; reason: string };

// 設定画面・ウィッシュ追加など、taste(好み・興味・願い・お気に入りの
// 情報源)をユーザーが能動的に編集した直後に呼ぶ。my-brainへの反映は
// ベストエフォート(アプリ自体の保存はpersist()がSupabase側で別途
// 行っている)だが、失敗理由は呼び出し側が画面に出せるよう返す
// (以前は結果を一切見ておらず、失敗しても何も表示されなかった)。
export async function syncTasteToMyBrain(appState: AppState): Promise<MyBrainSyncResult | null> {
  const allInterests = appState.profile?.interests ?? [];
  // taste-state.md は1ファイルに統合(HANDOFF §8.16)。アプリが書くのは app-managed
  // ゾーン=「手動で追加した興味・好み(source:"user")」と「手動で除外(dismissed)」だけ。
  // 分析結果(興味・好み本体・関連キーワード)は Cowork がゾーンの外に書く。
  const manualInterests = allInterests.filter((i) => i.source === "user").map((i) => ({ label: i.label }));
  const dismissed = appState.profile?.dismissedInterests ?? [];
  const sources = (appState.sources ?? []).map((s) => ({ url: s.url, label: s.label }));
  try {
    const res = await fetch("/api/mybrain/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manualInterests, dismissed, sources }),
    });
    return (await res.json()) as MyBrainSyncResult;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "network_error" };
  }
}

// ★その日の記録(やったこと・済ませたタスク・自分で書いた記録)を my-brain へ
// 同期する。1日を終えたとき・記録が増えたときに呼ぶ。直近3か月ぶんだけを
// 送る(古い月は既に同期済みで変化しないため)。
export async function syncDayRecordsToMyBrain(appState: AppState): Promise<MyBrainSyncResult | null> {
  const { buildDayRecords } = await import("@/lib/dayRecords");
  const { byMonth, renderMonthMd } = await import("@/lib/dayExport");
  const days = buildDayRecords(appState);
  if (days.length === 0) return null;
  const months = Array.from(byMonth(days).entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 3)
    .map(([month, list]) => ({ month, content: renderMonthMd(month, list) }));
  try {
    const res = await fetch("/api/mybrain/day-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: months }),
    });
    return (await res.json()) as MyBrainSyncResult;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "network_error" };
  }
}
