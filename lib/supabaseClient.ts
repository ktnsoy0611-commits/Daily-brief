import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabaseの接続情報。Vercel(および .env.local)の環境変数で与える。
// どちらも未設定の間は「未構成」とみなし、アプリはこれまでどおり
// localStorage で動く(DataStore側でフォールバックする)。キーが入って
// 初めてクラウド永続化が有効になる、という段階的移行のための入口。
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(url && anonKey);

// 未構成のときは null。呼び出し側は isSupabaseConfigured で分岐し、
// null を触らないこと。
// ★★★**Supabase への通信には必ず締切を付ける**（2026-10-10・第137巡）。ユーザー報告「録音したら SENDING で止まった」
//   と同じ日、iPhone からの保存が1件も届いていなかった。トークンの更新の通信が返らないと（iOS がアプリを眠らせると
//   通信が宙に浮く）、`getSession()` はその更新を待ち続け、**保存も AI の口も始まらない**。締切で切れば更新は失敗として
//   終わり、次の呼び出しで取り直す。
const FETCH_LIMIT_MS = 15000; // ★目盛りの外（待ち時間）
const fetchWithLimit: typeof fetch = (input, init) => {
  const limit = AbortSignal.timeout(FETCH_LIMIT_MS);
  // ★`AbortSignal.any` が無い古い端末では呼び手の signal を優先する（締切は付かない）。
  const signal = !init?.signal ? limit : typeof AbortSignal.any === "function" ? AbortSignal.any([init.signal, limit]) : init.signal;
  return fetch(input, { ...init, signal });
};

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      global: { fetch: fetchWithLimit },
      auth: {
        // マジックリンク後のセッションをブラウザに保持し、自動更新する。
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
