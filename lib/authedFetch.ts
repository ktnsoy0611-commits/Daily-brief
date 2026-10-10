"use client";

import { supabase } from "./supabaseClient";

// ★AI を呼ぶ口（`lib/ownerAuth.ts` が本人か確かめる）へ、Supabase のアクセストークンを付けて叩く。
//   未構成（手元の開発）ならそのまま叩く。
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.set("Authorization", `Bearer ${token}`);
    } catch { /* トークンが無ければ付けずに叩く（サーバーが断る） */ }
  }
  return fetch(url, { ...init, headers });
}
