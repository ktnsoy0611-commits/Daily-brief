import { createClient } from "@supabase/supabase-js";

// ★★★**AI を呼ぶ口は本人だけが叩ける**（2026-10-10・第137巡）。
//   第136巡までは `/api/suggest-subtasks`・`/api/curate-band`・`/api/generate-plan`・`/api/transcribe` が
//   **誰でも叩ける口**で、外から叩かれると Gemini の1日の回数がそのまま減った（上限に当たるとアプリの AI が全部止まる）。
//   → クライアントは Supabase のアクセストークンを付けて叩き（`lib/authedFetch.ts`）、ここでそれが
//     `OWNER_USER_ID` 本人かを確かめる（`/api/cron/build-brief` の手動実行と同じ作法）。
//   ★Supabase が未構成（手元の開発）なら確かめない ―― アプリは localStorage だけで動くので、トークンが無い。

export async function isOwner(req: Request): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const owner = process.env.OWNER_USER_ID;
  if (!url || !anon || !owner) return true;
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") === secret) return true;
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return false;
  try {
    const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await c.auth.getUser(token);
    return data?.user?.id === owner;
  } catch {
    return false;
  }
}
