"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trimAudio } from "@/lib/audioTrim";
import { haptic } from "@/lib/helpers";
import type { RecordState, VoiceTrim } from "@/lib/types";

// ★声のメモの録音(2026-08-11・全面作り直し)。
//
// ■ 操作は「タップで始めて、タップで止める」トグル(ユーザー指定)。
// 以前の「押しているあいだだけ録音(トランシーバー式)」はやめた。
// 止めた時点では**まだ何も送らない**。review の状態で待ち、ユーザーが
// トリミングを整えてから「送信」を押して初めて文字起こしへ回す。
// 「キャンセル」を押せばその場で捨てる。
//
//   idle ──tap──> recording ──tap──> review ──送信──> sending ──> idle
//                                       └──キャンセル───────────> idle
//
// ■ 波形は AnalyserNode で 45ms ごとに音量(RMS)を測って ref へ貯める。
// ★state ではなく ref にすること。録音中に毎回 setState すると、その
// たびに3つのアプリの全タブが再レンダーされる(§14で潰した性能の穴)。
// 描く側(VoiceStudio)が rAF で読みに来る。
//
// ■ トリミングは lib/audioTrim.ts が AudioContext でデコードして
// WAV に焼き直す。デコードできない端末では元の音声をそのまま送る
// (トリミングは効かないが、記録は失われない)。

export type { RecordState } from "@/lib/types";

export interface VoiceResult {
  text: string;
  at: string;
  durationMs: number;
  savedToMyBrain: boolean;
}

/** 波形を測る間隔(ms)。 */
const LEVEL_MS = 45;
/** 短すぎる録音(誤爆・言い直し)は送らない。 */
const MIN_MS = 700;

export function useVoiceRecorder(opts: {
  onDone: (r: VoiceResult) => void;
  onError: (message: string) => void;
}) {
  const { onDone, onError } = opts;
  const [state, setState] = useState<RecordState>("idle");
  const [startedAt, setStartedAt] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const startedAtRef = useRef(0);
  const stoppingRef = useRef(false);
  // 波形。0〜1 の並び。録音を始めるたびに空にする。
  const levelsRef = useRef<number[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelTimerRef = useRef<number | null>(null);

  const stopMeter = useCallback(() => {
    if (levelTimerRef.current != null) window.clearInterval(levelTimerRef.current);
    levelTimerRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  useEffect(() => () => {
    stopMeter();
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, [stopMeter]);

  const start = useCallback(async () => {
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
      blobRef.current = null;
      levelsRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.start();
      recRef.current = rec;
      stoppingRef.current = false;
      startedAtRef.current = Date.now();
      setStartedAt(startedAtRef.current);
      setDurationMs(0);
      setState("recording");
      haptic(14);

      // 波形の測定。音量(RMS)を 0〜1 に均して貯めるだけ。
      try {
        const AC = window.AudioContext
          ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        levelTimerRef.current = window.setInterval(() => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          // 生のRMSは小さいので持ち上げる。1で頭打ち。
          levelsRef.current.push(Math.min(1, rms * 3.4));
        }, LEVEL_MS);
      } catch {
        // 波形が測れなくても録音自体は続ける(棒が出ないだけ)。
      }
    } catch {
      onError("マイクを使えませんでした");
    }
  }, [onError]);

  /** 録音を止めて review へ。ここではまだ送らない。 */
  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec || stoppingRef.current) return;
    stoppingRef.current = true;
    stopMeter();
    const ms = Date.now() - startedAtRef.current;
    rec.onstop = () => {
      rec.stream.getTracks().forEach((t) => t.stop());
      recRef.current = null;
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      chunksRef.current = [];
      if (ms < MIN_MS || blob.size === 0) { setState("idle"); return; }
      blobRef.current = blob;
      setDurationMs(ms);
      setState("review");
      haptic(10);
    };
    try { rec.stop(); } catch { setState("idle"); }
  }, [stopMeter]);

  const toggle = useCallback(() => {
    if (state === "recording") stop();
    else if (state === "idle") void start();
  }, [state, start, stop]);

  const cancel = useCallback(() => {
    if (state === "recording") {
      // 録音中のキャンセルは、止めてから捨てる。
      stoppingRef.current = true;
      stopMeter();
      const rec = recRef.current;
      if (rec) {
        rec.onstop = () => {
          rec.stream.getTracks().forEach((t) => t.stop());
          recRef.current = null;
          chunksRef.current = [];
          setState("idle");
        };
        try { rec.stop(); } catch { setState("idle"); }
      } else setState("idle");
    } else if (state === "review") {
      blobRef.current = null;
      levelsRef.current = [];
      setState("idle");
    }
    haptic(6);
  }, [state, stopMeter]);

  const send = useCallback(async (trim: VoiceTrim) => {
    const raw = blobRef.current;
    if (!raw) { setState("idle"); return; }
    setState("sending");
    haptic(12);
    const kept = durationMs * Math.max(0.02, trim.end - trim.start);
    try {
      const cut = (trim.start > 0.001 || trim.end < 0.999) ? await trimAudio(raw, trim.start, trim.end) : null;
      const blob = cut ?? raw;
      const ext = blob.type.includes("wav") ? "wav" : blob.type.includes("mp4") ? "m4a" : "webm";
      const form = new FormData();
      form.append("audio", blob, `voice.${ext}`);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (data?.ok && typeof data.text === "string" && data.text.trim()) {
        onDone({
          text: data.text.trim(),
          at: data.at ?? new Date().toISOString(),
          durationMs: Math.round(kept),
          savedToMyBrain: !!data.savedToMyBrain,
        });
      } else if (data?.reason === "no_key") {
        onError("文字起こしの設定がまだ有効になっていません");
      } else {
        onError("うまく聞き取れませんでした");
      }
    } catch {
      onError("通信に失敗しました");
    } finally {
      blobRef.current = null;
      levelsRef.current = [];
      setState("idle");
    }
  }, [durationMs, onDone, onError]);

  return { state, startedAt, durationMs, levelsRef, toggle, cancel, send };
}
