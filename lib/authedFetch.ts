"use client";

import { supabase } from "./supabaseClient";

// ★AI を呼ぶ口（`lib/ownerAuth.ts` が本人か確かめる）へ、Supabase のアクセストークンを付けて叩く。
//   未構成（手元の開発）ならそのまま叩く。
// ★★★**トークンは覚えておいて使い、取り出しには締切を付ける**（2026-10-10・第137巡）。
//   ユーザー報告「**録音したら SENDING で画面が止まった。開き直したら動いた**」―― 毎回 `getSession()` を呼んでいたが、
//   これは Supabase の中の鍵（ロック）を取るので、起動直後の同時の呼び出しや画面の復帰と重なると**返ってこない**ことがある。
//   締切の無い待ちに入ると、送信そのものが始まらない。→ `onAuthStateChange` が知らせるトークンを覚え、
//   期限の内ならそれを使う。取り出すときは `TOKEN_WAIT_MS` で見切る（覚えている古いトークンで叩く）。
// ★★`timeoutMs` で送信全体にも締切を付けられる（文字起こし）。

/** トークンを取り出すのを待つ上限（ms）。★目盛りの外（待ち時間）。 */
const TOKEN_WAIT_MS = 3000;
/** 期限の何 ms 前から取り直すか。★目盛りの外（待ち時間）。 */
const REFRESH_EARLY_MS = 60000;

let cached: { token: string; exp: number } | null = null;
let hooked = false;

function hook() {
  if (hooked || !supabase) return;
  hooked = true;
  // ★この呼び返しの中で supabase の関数を呼ばない（同じ鍵を待って止まる）。
  supabase.auth.onAuthStateChange((_event, s) => {
    cached = s?.access_token ? { token: s.access_token, exp: (s.expires_at ?? 0) * 1000 } : null;
  });
}

async function tokenOf(): Promise<string | undefined> {
  if (!supabase) return undefined;
  hook();
  if (cached && cached.exp - REFRESH_EARLY_MS > Date.now()) return cached.token;
  try {
    const got = await Promise.race([
      supabase.auth.getSession().then(({ data }) => data.session),
      new Promise<null>((r) => setTimeout(() => r(null), TOKEN_WAIT_MS)),
    ]);
    if (got?.access_token) cached = { token: got.access_token, exp: (got.expires_at ?? 0) * 1000 };
  } catch { /* 覚えているものを使う */ }
  return cached?.token;
}

export async function authedFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs, ...rest } = init;
  const headers = new Headers(rest.headers);
  const token = await tokenOf();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : rest.signal;
  return fetch(url, { ...rest, headers, signal });
}
