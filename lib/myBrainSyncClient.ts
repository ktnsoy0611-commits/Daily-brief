import type { AppState } from "@/lib/types";

export type MyBrainSyncResult = { ok: true; wrote: string[] } | { ok: false; reason: string };

// 設定画面・ウィッシュ追加など、taste(好み・興味・願い・お気に入りの
// 情報源)をユーザーが能動的に編集した直後に呼ぶ。my-brainへの反映は
// ベストエフォート(アプリ自体の保存はpersist()がSupabase側で別途
// 行っている)だが、失敗理由は呼び出し側が画面に出せるよう返す
// (以前は結果を一切見ておらず、失敗しても何も表示されなかった)。
export async function syncTasteToMyBrain(appState: AppState): Promise<MyBrainSyncResult | null> {
  const allInterests = appState.profile?.interests ?? [];
  const taste = allInterests.filter((i) => i.category === "taste").map((i) => ({ label: i.label, weight: i.weight }));
  const interest = allInterests.filter((i) => i.category === "interest").map((i) => ({ label: i.label, weight: i.weight }));
  const wishes = (appState.wishes ?? []).filter((w) => w.status === "stock").map((w) => w.title);
  const sources = (appState.sources ?? []).map((s) => ({ url: s.url, label: s.label }));
  try {
    const res = await fetch("/api/mybrain/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taste, interest, wishes, sources }),
    });
    return (await res.json()) as MyBrainSyncResult;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "network_error" };
  }
}
