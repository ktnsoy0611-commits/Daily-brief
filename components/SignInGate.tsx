"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { BG, INK, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";

// サインイン画面(Supabase Auth、メール確認コード方式)。
// AppShellが「構成済み(環境変数あり)かつ未ログイン」のときだけ描画する。
// 環境変数が無い間はそもそも呼ばれない(localStorage運用のまま)。
// デザインは既存のシート類と同じく簡素に。マガジン風の重い装飾はしない。
//
// ★リンク方式ではなく6桁コード入力方式にしている理由:
// iOSでホーム画面に追加したWebアプリ(スタンドアロン)と、通常のSafariタブは、
// 見た目は同じURLでも別々の保存領域(localStorage等)を持つ。メールのリンクは
// 必ずSafari側で開くため、そちらでセッションが確立してしまい、ホーム画面の
// アプリ側は永遠にログイン状態を受け取れず「毎回ログイン画面が出る」ループに
// なる。コード入力方式ならユーザーは最後までホーム画面アプリの中に留まった
// まま完結するため、この保存領域のズレ自体が起こらない。
// ※Supabaseダッシュボード側で、Auth → Email Templates → Magic Link の本文に
//   {{ .Token }} (6桁コード)が含まれている必要がある(デフォルトはリンクの
//   ボタンのみのことがあるため、無ければ追記が必要)。
export function SignInGate() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "sent" | "verifying">("idle");
  const [error, setError] = useState("");

  const send = async () => {
    const addr = email.trim();
    if (!addr || !supabase) return;
    setPhase("sending");
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: addr,
        // リンクを踏んだ場合の保険としてこのURLへ戻す設定は残すが、
        // 主経路は下のコード入力(verifyOtp)。
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setPhase("sent");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "送信に失敗しました");
    }
  };

  const verify = async () => {
    const token = code.trim();
    const addr = email.trim();
    if (!token || !addr || !supabase) return;
    setPhase("verifying");
    setError("");
    try {
      const { error } = await supabase.auth.verifyOtp({ email: addr, token, type: "email" });
      if (error) throw error;
      // 成功するとAppShell側のonAuthStateChangeが拾い、この画面ごと消える。
    } catch (e) {
      setPhase("sent");
      setError(e instanceof Error ? e.message : "コードが正しくないか、期限切れです");
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

        {phase === "sent" || phase === "verifying" ? (
          <>
            <p style={{ fontSize: 12.5, color: "#9A988E", lineHeight: 1.7, margin: "0 0 16px" }}>
              <strong style={{ color: INK }}>{email.trim()}</strong> に届いた6桁のコードを入力してください。
            </p>
            <input
              type="text" inputMode="numeric" autoComplete="one-time-code" value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") verify(); }}
              placeholder="123456"
              style={{
                width: "100%", boxSizing: "border-box", border: `1.5px solid ${INK}`, borderRadius: 12,
                padding: "12px 14px", fontFamily: SANS, fontSize: 20, letterSpacing: "0.2em", textAlign: "center",
                outline: "none", marginBottom: 14,
              }}
            />
            {error && <div style={{ fontSize: 11.5, color: "#C1502E", lineHeight: 1.6, margin: "0 0 12px" }}>{error}</div>}
            <button
              onClick={verify} disabled={!code.trim() || phase === "verifying"}
              style={{
                width: "100%", padding: "13px 0", background: code.trim() && phase !== "verifying" ? INK : "rgba(23,23,21,0.2)",
                color: PAPER, border: "none", borderRadius: 999, cursor: code.trim() && phase !== "verifying" ? "pointer" : "default",
                fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10,
              }}
            >
              {phase === "verifying" ? "確認中…" : "ログイン"}
            </button>
            <button
              onClick={() => { setPhase("idle"); setCode(""); setError(""); }}
              style={{
                width: "100%", padding: "8px 0", background: "transparent", color: "#9A988E",
                border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 11.5,
              }}
            >
              メールアドレスを入力し直す
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: "#9A988E", lineHeight: 1.7, margin: "0 0 16px" }}>
              メールアドレスに確認コードを送ります。パスワードは不要です。
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
              {phase === "sending" ? "送信中…" : "確認コードを送る"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
