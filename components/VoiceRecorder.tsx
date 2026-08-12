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

/** 波形を測る間隔(ms)。★描く側(VoiceStudio)が、この間隔と経過時間から
 *  「次の1本までの端数」を出して波形を滑らかに流すので、export する。 */
export const LEVEL_MS = 45;
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
  const [paused, setPaused] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  // ★マイクの生ストリーム。MediaRecorder とは別に**自分で持っておく**。
  // rec.stream 経由でしか止めていないと、MediaRecorder を作る前に例外が出た
  // 場合や、二重に start してしまった場合に、止め損ねたストリームが残って
  // マイクが点きっぱなしになる(実機で「録音していないのにマイクがオンの
  // ような挙動」と報告された)。
  const streamRef = useRef<MediaStream | null>(null);
  /** 開始処理が走っている最中の目印。二重に getUserMedia しないため。 */
  const startingRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const startedAtRef = useRef(0);
  const stoppingRef = useRef(false);
  // ★一時停止をまたいでも正しい長さを出すため、「確定済みの長さ」と
  // 「いま数えている区間の開始時刻」に分けて持つ。止まっている間は
  // segStart を使わない。
  const recordedRef = useRef(0);
  const segStartRef = useRef(0);
  const pausedRef = useRef(false);
  // 波形。0〜1 の並び。録音を始めるたびに空にする。
  const levelsRef = useRef<number[]>([]);
  // ★その1本を測った時刻(録音の経過ms)。描く側が「棒の実際の位置」を
  // 時刻から出すために使う。setInterval は 45ms ちょうどでは来ないので、
  // 本数を数えて等間隔に置くと、そのズレがそのまま「ガクつき」になる。
  // 一時停止中は経過が進まないので、棒もその場で止まる。
  const timesRef = useRef<number[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelTimerRef = useRef<number | null>(null);

  /** 実際に録音できている長さ(ms)。一時停止していた間は数えない。
   *  ★参照の同一性を保つため依存は空。中身は ref だけを読む。 */
  const elapsedMs = useCallback(() => {
    if (pausedRef.current || segStartRef.current === 0) return recordedRef.current;
    return recordedRef.current + (Date.now() - segStartRef.current);
  }, []);

  /** 音量の測定を始める/止める。一時停止のたびに止め、再開で張り直す。 */
  const startMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || levelTimerRef.current != null) return;
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
      timesRef.current.push(elapsedMs());
    }, LEVEL_MS);
  }, [elapsedMs]);

  const pauseMeter = useCallback(() => {
    if (levelTimerRef.current != null) window.clearInterval(levelTimerRef.current);
    levelTimerRef.current = null;
  }, []);

  const stopMeter = useCallback(() => {
    pauseMeter();
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, [pauseMeter]);

  /** ★マイクを手放す。どの終わり方でも必ずここを通すこと。 */
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => { try { t.stop(); } catch { /* 既に停止 */ } });
    streamRef.current = null;
    recRef.current = null;
  }, []);

  useEffect(() => () => {
    stopMeter();
    releaseStream();
  }, [stopMeter, releaseStream]);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("この端末では録音できません");
      return;
    }
    // ★二重起動を防ぐ。ここが無いと、素早く2回タップしたときに
    // getUserMedia が2つ走り、後から来た方だけが recRef に入って、
    // 先に取ったストリームが誰にも止められずマイクが点きっぱなしになる。
    if (startingRef.current || recRef.current) return;
    startingRef.current = true;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // iOS Safari は webm を作れないため、対応している形式を順に試す。
      const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"];
      const mimeType = types.find((t) => MediaRecorder.isTypeSupported?.(t));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      blobRef.current = null;
      levelsRef.current = [];
      timesRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.start();
      recRef.current = rec;
      stoppingRef.current = false;
      startedAtRef.current = Date.now();
      recordedRef.current = 0;
      segStartRef.current = startedAtRef.current;
      pausedRef.current = false;
      setPaused(false);
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
        analyserRef.current = analyser;
        startMeter();
      } catch {
        // 波形が測れなくても録音自体は続ける(棒が出ないだけ)。
      }
    } catch {
      // ★MediaRecorder の生成などで落ちた場合も、取ったストリームは必ず返す。
      stream?.getTracks().forEach((t) => { try { t.stop(); } catch { /* 既に停止 */ } });
      streamRef.current = null;
      recRef.current = null;
      onError("マイクを使えませんでした");
    } finally {
      startingRef.current = false;
    }
  }, [onError, startMeter]);

  /** ★録音の一時停止/再開。もう一度押すとそのまま続きから録れる。
   *  MediaRecorder.pause()/resume() は、そのまま同じ録音の続きになる
   *  (チャンクが連結されるだけなので、あとで切り出す位置もずれない)。 */
  const togglePause = useCallback(() => {
    const rec = recRef.current;
    if (!rec || rec.state === "inactive") return;
    if (!pausedRef.current) {
      recordedRef.current += Date.now() - segStartRef.current;
      pausedRef.current = true;
      setPaused(true);
      pauseMeter();
      try { rec.pause(); } catch { /* 対応していない端末では録り続ける */ }
    } else {
      segStartRef.current = Date.now();
      pausedRef.current = false;
      setPaused(false);
      try { rec.resume(); } catch { /* 同上 */ }
      startMeter();
    }
    haptic(9);
  }, [pauseMeter, startMeter]);

  /** 録音を止めて review へ。ここではまだ送らない。 */
  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec || stoppingRef.current) return;
    stoppingRef.current = true;
    const ms = elapsedMs();
    stopMeter();
    pausedRef.current = false;
    segStartRef.current = 0;
    setPaused(false);
    // ★onstop が来なかった場合の保険。ここを通らないとマイクが点いたままに
    // なるので、少し待って必ず手放す(Safari で onstop が落ちる報告がある)。
    const guard = window.setTimeout(releaseStream, 1500);
    rec.onstop = () => {
      window.clearTimeout(guard);
      releaseStream();
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      chunksRef.current = [];
      if (ms < MIN_MS || blob.size === 0) { setState("idle"); return; }
      blobRef.current = blob;
      setDurationMs(ms);
      setState("review");
      haptic(10);
    };
    try { rec.stop(); } catch { window.clearTimeout(guard); releaseStream(); setState("idle"); }
  }, [stopMeter, elapsedMs, releaseStream]);

  const toggle = useCallback(() => {
    if (state === "recording") stop();
    else if (state === "idle") void start();
  }, [state, start, stop]);

  const cancel = useCallback(() => {
    // ★どの状態から取り消しても、波形・長さ・音声をすべて捨てて初期状態へ戻す。
    // 以前は録音中の経路で波形(levelsRef)を消しておらず、取り消したのに
    // 前の録音の波形が残ったままになっていた。
    levelsRef.current = [];
    timesRef.current = [];
    blobRef.current = null;
    setDurationMs(0);
    if (state === "recording") {
      // 録音中のキャンセルは、止めてから捨てる。
      stoppingRef.current = true;
      stopMeter();
      pausedRef.current = false;
      segStartRef.current = 0;
      setPaused(false);
      const rec = recRef.current;
      if (rec) {
        rec.onstop = () => {
          releaseStream();
          chunksRef.current = [];
          setState("idle");
        };
        try { rec.stop(); } catch { releaseStream(); setState("idle"); }
      } else { releaseStream(); setState("idle"); }
    } else if (state === "review") {
      setState("idle");
    }
    haptic(6);
  }, [state, stopMeter, releaseStream]);

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
      timesRef.current = [];
      setDurationMs(0);
      setState("idle");
    }
  }, [durationMs, onDone, onError]);

  return { state, startedAt, durationMs, paused, elapsedMs, levelsRef, timesRef, toggle, togglePause, cancel, send };
}
