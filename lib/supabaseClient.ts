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
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        // マジックリンク後のセッションをブラウザに保持し、自動更新する。
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
