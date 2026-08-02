"use client";

import { Mic } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { INK, PAPER, RUST, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";

// ★声のメモの録音。タブバー右の丸ボタンを **長押し** している間だけ録音し、
// 指を離すと文字起こしへ送る(トランシーバーと同じ操作感)。タップは従来
// どおり「書く」入口のまま。
//
// 録音中は画面全体に暗い幕と経過時間・波形の目印を出し、「いま録っている」
// ことが指を離すまで分かるようにする。幕はcreatePortalでbody直下へ描く
// (nav や sticky が作る重なりコンテキストの影響を受けないため)。

export type RecordState = "idle" | "recording" | "sending";

export interface VoiceResult {
  text: string;
  at: string;
  durationMs: number;
  savedToMyBrain: boolean;
}

// 長押しの判定時間。これより短ければ「タップ」として扱い録音しない。
export const HOLD_MS = 320;

export function useVoiceRecorder(opts: {
  onDone: (r: VoiceResult) => void;
  onError: (message: string) => void;
}) {
  const { onDone, onError } = opts;
  const [state, setState] = useState<RecordState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  // 停止処理が二重に走らないようにする(指を離す/キャンセルが同時に来る)。
  const stoppingRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => () => {
    clearTimer();
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("この端末では録音できません");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // iOS Safari は webm を作れないため、対応している形式を順に試す。
      const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];
      const mimeType = types.find((t) => MediaRecorder.isTypeSupported?.(t));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.start();
      recRef.current = rec;
      stoppingRef.current = false;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setState("recording");
      haptic(14);
      clearTimer();
      timerRef.current = window.setInterval(() => setElapsed(Date.now() - startedAtRef.current), 100);
    } catch {
      onError("マイクを使えませんでした");
    }
  }, [state, onError]);

  // 指を離したときの確定。cancel=true なら捨てる。
  const stop = useCallback((cancel = false) => {
    const rec = recRef.current;
    if (!rec || stoppingRef.current) return;
    stoppingRef.current = true;
    clearTimer();
    const durationMs = Date.now() - startedAtRef.current;
    rec.onstop = async () => {
      rec.stream.getTracks().forEach((t) => t.stop());
      recRef.current = null;
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      chunksRef.current = [];
      // 短すぎる録音(誤爆・言い直し)は送らない。
      if (cancel || durationMs < 700 || blob.size === 0) { setState("idle"); return; }
      setState("sending");
      try {
        const form = new FormData();
        const ext = (rec.mimeType || "").includes("mp4") ? "m4a" : "webm";
        form.append("audio", blob, `voice.${ext}`);
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const data = await res.json().catch(() => null);
        if (data?.ok && typeof data.text === "string" && data.text.trim()) {
          onDone({ text: data.text.trim(), at: data.at ?? new Date().toISOString(), durationMs, savedToMyBrain: !!data.savedToMyBrain });
        } else if (data?.reason === "no_key") {
          onError("文字起こしの設定がまだ有効になっていません");
        } else {
          onError("うまく聞き取れませんでした");
        }
      } catch {
        onError("通信に失敗しました");
      } finally {
        setState("idle");
      }
    };
    try { rec.stop(); } catch { setState("idle"); }
  }, [onDone, onError]);

  return { state, elapsed, start, stop };
}

// 録音中/送信中の全画面の幕。
export function RecordingOverlay({ state, elapsed }: { state: RecordState; elapsed: number }) {
  if (state === "idle" || typeof document === "undefined") return null;
  const sec = Math.floor(elapsed / 1000);
  const mmss = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  return createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 58, pointerEvents: "none",
      background: "rgba(16,16,20,0.42)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18,
    }}>
      <div style={{
        width: 84, height: 84, borderRadius: "50%", background: state === "recording" ? RUST : INK,
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: state === "recording" ? "voice-pulse 1.4s ease-in-out infinite" : undefined,
      }}>
        <Mic size={32} strokeWidth={1.8} color={PAPER} />
      </div>
      <div style={{ fontFamily: SANS, fontSize: 20, fontWeight: 800, color: PAPER, letterSpacing: "0.08em" }}>
        {state === "recording" ? mmss : "…"}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 11.5, color: "rgba(255,255,255,0.72)", letterSpacing: "0.06em" }}>
        {state === "recording" ? "指を離すと保存します" : "文字にしています…"}
      </div>
    </div>,
    document.body,
  );
}
