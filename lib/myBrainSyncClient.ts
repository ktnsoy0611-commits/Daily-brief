import type { AppState } from "@/lib/types";

export type MyBrainSyncResult = { ok: true; wrote: string[] } | { ok: false; reason: string };

// 設定画面・ウィッシュ追加など、taste(気になっていること・興味・願い・
// お気に入りの情報源)をユーザーが能動的に編集した直後に呼ぶ。my-brainへの
// 反映はベストエフォート(アプリ自体の保存はpersist()がSupabase側で別途
// 行っている)だが、失敗理由は呼び出し側が画面に出せるよう返す
// (以前は結果を一切見ておらず、失敗しても何も表示されなかった)。
export async function syncTasteToMyBrain(appState: AppState): Promise<MyBrainSyncResult | null> {
  const interests = (appState.profile?.interests ?? []).map((i) => ({ label: i.label, weight: i.weight }));
  const wishes = (appState.wishes ?? []).filter((w) => w.status === "stock").map((w) => w.title);
  const sources = (appState.sources ?? []).map((s) => ({ url: s.url, label: s.label }));
  const focus = appState.profile?.currentFocus ?? "";
  try {
    const res = await fetch("/api/mybrain/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ focus, interests, wishes, sources }),
    });
    return (await res.json()) as MyBrainSyncResult;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "network_error" };
  }
}
