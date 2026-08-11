"use client";

// 録音した音声を、開始/終了の比率で切り出して WAV にする。
//
// ★なぜ WAV に焼き直すのか
// MediaRecorder が出すのは webm/opus か mp4/aac のコンテナで、途中を
// 切り出すにはデコーダが要る。ブラウザは AudioContext.decodeAudioData を
// 持っているので、いったん生の波形(AudioBuffer)へ戻し、必要な範囲だけを
// 16bit PCM の WAV として組み直す。WAV は自分で書ける一番簡単な形式で、
// 文字起こしのAPI(OpenAI / Gemini どちらも)がそのまま受け取れる。
//
// デコードできない端末・形式に当たったら null を返す。呼び出し側は
// **元の音声をそのまま送る**(トリミングは効かないが、記録は失われない)。

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function encodeWav(buf: AudioBuffer, from: number, to: number): ArrayBuffer {
  const len = to - from;
  const ch = buf.numberOfChannels;
  // モノラルに畳む(文字起こしにステレオは要らないし、半分の大きさで済む)。
  const mix = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) mix[i] += data[from + i] / ch;
  }
  const bytes = 44 + len * 2;
  const out = new ArrayBuffer(bytes);
  const view = new DataView(out);
  const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  str(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  str(8, "WAVEfmt ");
  view.setUint32(16, 16, true);       // fmt チャンクの長さ
  view.setUint16(20, 1, true);        // 1 = リニアPCM
  view.setUint16(22, 1, true);        // モノラル
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * 2, true);  // バイト毎秒
  view.setUint16(32, 2, true);        // 1サンプルのバイト数
  view.setUint16(34, 16, true);       // ビット深度
  str(36, "data");
  view.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, mix[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

export async function trimAudio(blob: Blob, start: number, end: number): Promise<Blob | null> {
  try {
    const AC = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const from = Math.floor(buf.length * clamp01(start));
    const to = Math.max(from + 1, Math.min(buf.length, Math.floor(buf.length * clamp01(end))));
    const wav = encodeWav(buf, from, to);
    ctx.close();
    return new Blob([wav], { type: "audio/wav" });
  } catch {
    return null;
  }
}
