"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { BG, INK, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";

// マジックリンク(Supabase Auth OTP)のサインイン画面。
// AppShellが「構成済み(環境変数あり)かつ未ログイン」のときだけ描画する。
// 環境変数が無い間はそもそも呼ばれない(localStorage運用のまま)。
// デザインは既存のシート類と同じく簡素に。マガジン風の重い装飾はしない。
export function SignInGate() {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  const send = async () => {
    const addr = email.trim();
    if (!addr || !supabase) return;
    setPhase("sending");
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: addr,
        // マジックリンクを踏むとこのURLへ戻り、supabase-jsがセッションを確立する。
        // ※Supabaseダッシュボードの Auth → URL Configuration で、このオリジンを
        //   Site URL / Redirect URLs に登録しておく必要がある。
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setPhase("sent");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "送信に失敗しました");
    }
  };

  return (
    <div style={{
      minHeight: "100svh", background: BG, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", fontFamily: SANS, color: INK, padding: 24,
    }}>
      <div style={{
        width: "100%", maxWidth: 340, background: PAPER, borderRadius: 20, boxShadow: SOFT_SHADOW,
        padding: "28px 22px", boxSizing: "border-box",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.02em", marginBottom: 6 }}>デイリーブリーフ</div>

        {phase === "sent" ? (
          <p style={{ fontSize: 13, color: "#6A685E", lineHeight: 1.8, margin: 0 }}>
            <strong style={{ color: INK }}>{email.trim()}</strong> にログイン用のリンクを送りました。
            メールのリンクを開くと、この端末でそのままログインできます。
          </p>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: "#9A988E", lineHeight: 1.7, margin: "0 0 16px" }}>
              メールアドレスにログイン用のリンクを送ります。パスワードは不要です。
            </p>
            <input
              type="email" inputMode="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="you@example.com"
              style={{
                width: "100%", boxSizing: "border-box", border: `1.5px solid ${INK}`, borderRadius: 12,
                padding: "12px 14px", fontFamily: SANS, fontSize: 16, outline: "none", marginBottom: 14,
              }}
            />
            {error && <div style={{ fontSize: 11.5, color: "#C1502E", lineHeight: 1.6, margin: "0 0 12px" }}>{error}</div>}
            <button
              onClick={send} disabled={!email.trim() || phase === "sending"}
              style={{
                width: "100%", padding: "13px 0", background: email.trim() && phase !== "sending" ? INK : "rgba(23,23,21,0.2)",
                color: PAPER, border: "none", borderRadius: 999, cursor: email.trim() && phase !== "sending" ? "pointer" : "default",
                fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
              }}
            >
              {phase === "sending" ? "送信中…" : "ログインリンクを送る"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
