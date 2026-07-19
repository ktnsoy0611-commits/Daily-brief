import type { AppState } from "@/lib/types";

// 設定画面・ウィッシュ追加など、taste(気になっていること・興味・願い・
// お気に入りの情報源)をユーザーが能動的に編集した直後に呼ぶ。my-brainへの
// 反映はベストエフォート(失敗しても握りつぶす。アプリ自体の保存は
// persist()がSupabase側で別途行っている)。
export function syncTasteToMyBrain(appState: AppState): void {
  const interests = (appState.profile?.interests ?? []).map((i) => ({ label: i.label, weight: i.weight }));
  const wishes = (appState.wishes ?? []).filter((w) => w.status === "stock").map((w) => w.title);
  const sources = (appState.sources ?? []).map((s) => ({ url: s.url, label: s.label }));
  const focus = appState.profile?.currentFocus ?? "";
  fetch("/api/mybrain/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ focus, interests, wishes, sources }),
  }).catch(() => {});
}
