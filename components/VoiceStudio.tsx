"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BD_LIGHT, INK, PAPER, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import type { VoiceControls, VoiceTrim } from "@/lib/types";

// ★声の記録の画面(2026-08-11 新設)。純粋幾何学ミニマリズム。
// テクスチャ・写実・3Dの箱はすべてやめ、**ベタ塗りの円と直線だけ**で組む。
//
// ■ 配置(ユーザー指定)
//   画面の下部 … 画面をはみ出すほど巨大な円が2つ。カセットのリールの抽象。
//                 2つの円のあいだは「テープ」を表す直線の帯でつながる。
//   その上     … 音声波形とタイポグラフィ。
//
// ■ 手触り
//   録音中 … 2つの円が実際にテープを巻くように回り、帯の縞が流れる。
//   録音後 … 同じ2つの円が**物理ダイヤル**になる。左の円を回すと波形の
//            開始位置、右の円を回すと終了位置が動く。1回転で全体の50%
//            動く重い比率にしてあり、15度ごとに手応え(haptic)を返す。
//   送信は明示 … 止めた時点では何も起きない。「送信」を押して初めて
//            文字起こしへ回る。「キャンセル」で捨てる。
//
// ■ 性能
//   波形は canvas に rAF で描く。音量の並びは ref から読むだけなので、
//   録音中に React のレンダーは1回も走らない(§14の落とし穴を踏まない)。
//
// ■ ハプティクスの限界(正直に書いておく)
//   haptic() は navigator.vibrate。**iOS Safari はこのAPIを持たない**ため、
//   実機(iPhone)では手応えは返らない。Androidと対応ブラウザでのみ効く。

/** 波形の棒の間隔(px)と太さ(px)。 */
const BAR_PITCH = 5;
const BAR_W = 3;
/** ダイヤル1回転で動かす割合。小さいほど「重い」。 */
const TURN_RATIO = 0.5;
/** 手応えを返す刻み(rad)。15度ごと。 */
const NOTCH = (15 * Math.PI) / 180;
/** 開始と終了が潰れないよう、最低これだけは残す。 */
const MIN_SPAN = 0.04;
/** オーバーレイの地の色。★円の「抜き」と同じ色でなければ段差が出るので、
 *  半透明の幕ではなく**ほぼ不透明**にしてある。 */
const SCRIM = "#15151A";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 波形の並びを、表示する本数へ均す(その区間の最大値を取る)。 */
function resample(levels: number[], n: number): number[] {
  if (n <= 0) return [];
  const out = new Array<number>(n).fill(0);
  if (levels.length === 0) return out;
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * levels.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * levels.length) / n));
    let m = 0;
    for (let k = a; k < b && k < levels.length; k++) m = Math.max(m, levels[k]);
    out[i] = m;
  }
  return out;
}

export function VoiceStudio({ voice, dim, onClose }: {
  voice: VoiceControls;
  /** オーバーレイとして暗い幕の上に出すか。 */
  dim?: boolean;
  /** 幕を閉じる(オーバーレイのときだけ)。 */
  onClose?: () => void;
}) {
  const fg = dim ? PAPER : INK;
  const mute = dim ? "rgba(255,255,255,0.26)" : "rgba(26,26,24,0.20)";
  // 円の「抜き」の色。★背景と完全に同じ色でなければ縁に段差が出る。
  // 幕(VoiceOverlay)の地は SCRIM で塗りつぶしてあるので、そこと同じ色を使う。
  const hole = dim ? SCRIM : BD_LIGHT;

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reelL = useRef<HTMLDivElement>(null);
  const reelR = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // ★トリミングの位置は **ref** で持つ。ダイヤルを回すたびに setState すると
  // 1ジェスチャーで数十回の再レンダーになり、実測(4倍スロットリング)で
  // 251ms の long task が乗った。指の動きに追従するものは DOM へ直接書く、
  // というこのコードベースの流儀(§14)に合わせてある。
  const trimRef = useRef<VoiceTrim>({ start: 0, end: 1 });
  const timeRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);

  const { state, startedAt, durationMs, levelsRef } = voice;
  const recording = state === "recording";
  const review = state === "review";
  const sending = state === "sending";

  // 録音のたびにトリミングを初期化する。
  useEffect(() => { if (state === "recording" || state === "idle") trimRef.current = { start: 0, end: 1 }; }, [state]);

  // 器の大きさを実測する(円の直径も位置もここから決まる)。
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // 経過時間。★録音中だけ 100ms 間隔で数える(値そのものは props で
  // 受け取らない。受け取ると全タブが再レンダーされる)。
  useEffect(() => {
    if (!recording || !startedAt) { setElapsed(0); return; }
    setElapsed(Date.now() - startedAt);
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => window.clearInterval(id);
  }, [recording, startedAt]);

  // ---- 円の配置(器の幅から決まる)------------------------------------------
  const w = size.w || 390;
  const h = size.h || 560;
  const RD = w * 0.66;               // 直径。中心が画面の外なので半分弱しか見えない。
  const cxL = -w * 0.02;             // ★中心を画面の外に置いて大きくはみ出させる。
  const cxR = w * 1.02;
  const cy = h - RD * 0.22;          // 下にもはみ出す。
  const waveH = Math.max(64, Math.min(112, cy - RD / 2 - 170));

  // ---- 波形を描く ------------------------------------------------------------
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const cw = cv.clientWidth;
    const ch = cv.clientHeight;
    if (cw === 0 || ch === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
      cv.width = Math.round(cw * dpr);
      cv.height = Math.round(ch * dpr);
    }
    const c = cv.getContext("2d");
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);

    const n = Math.max(1, Math.floor(cw / BAR_PITCH));
    const all = levelsRef.current;
    // 録音中は「いま鳴っている分」が流れて見えるよう末尾だけを見せる。
    // 止めたあとは全体を均してトリミングできるようにする。
    const src = recording ? all.slice(-n) : all;
    const bars = resample(src, n);
    const t = trimRef.current;
    const mid = ch / 2;
    for (let i = 0; i < n; i++) {
      const r = n <= 1 ? 0 : i / (n - 1);
      const inRange = all.length > 0 && (recording || (r >= t.start && r <= t.end));
      const hgt = Math.max(2, bars[i] * (ch - 6));
      c.fillStyle = inRange ? fg : mute;
      c.fillRect(i * BAR_PITCH, mid - hgt / 2, BAR_W, hgt);
    }
    if (!recording && all.length > 0) {
      // トリミングの位置を示す縦の直線。
      c.fillStyle = fg;
      for (const r of [t.start, t.end]) {
        const x = Math.min(cw - 2, Math.max(0, r * cw));
        c.fillRect(x, 0, 2, ch);
      }
    }
  }, [fg, mute, recording, levelsRef]);

  // 表示する秒数。review 中はトリミングで刻々と変わるので、rAF から
  // timeRef へ直接書く(下の drawAll)。
  const shownMs = useCallback(() => (recording ? Date.now() - startedAt
    : review || sending ? durationMs * Math.max(0, trimRef.current.end - trimRef.current.start)
      : 0), [recording, review, sending, startedAt, durationMs]);

  // 波形と秒数をまとめて1回描く。
  const drawAll = useCallback(() => {
    draw();
    if (timeRef.current) timeRef.current.textContent = mmss(shownMs());
  }, [draw, shownMs]);

  // rAF を回すのは「録音中」と「ダイヤルを回している間」だけ。
  const [spinning, setSpinning] = useState(false);
  useEffect(() => {
    let raf = 0;
    const loop = () => { drawAll(); raf = requestAnimationFrame(loop); };
    if (recording || spinning) raf = requestAnimationFrame(loop);
    else drawAll();
    return () => cancelAnimationFrame(raf);
  }, [drawAll, recording, spinning, size.w, size.h]);

  // ---- ダイヤルを回す --------------------------------------------------------
  const dragRef = useRef<{ id: number; side: "L" | "R"; ang: number; notch: number; rot: number } | null>(null);

  const onDialDown = useCallback((e: React.PointerEvent, side: "L" | "R") => {
    if (!review) return;
    e.stopPropagation();
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    const ox = r.left + (side === "L" ? cxL : cxR);
    const oy = r.top + cy;
    const el = side === "L" ? reelL.current : reelR.current;
    const cur = Number(el?.dataset.rot ?? 0);
    dragRef.current = { id: e.pointerId, side, ang: Math.atan2(e.clientY - oy, e.clientX - ox), notch: 0, rot: cur };
    setSpinning(true);
    haptic(8);

    // ★リスナーは window に張る。要素の setPointerCapture は、この
    // コードベースで何度も取りこぼしてきた(§7.26)。
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== d.id) return;
      const a = Math.atan2(ev.clientY - oy, ev.clientX - ox);
      let delta = a - d.ang;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      d.ang = a;
      d.rot += delta;
      d.notch += delta;
      if (Math.abs(d.notch) >= NOTCH) { haptic(9); d.notch = 0; }
      const target = d.side === "L" ? reelL.current : reelR.current;
      if (target) {
        target.dataset.rot = String(d.rot);
        target.style.transform = `rotate(${d.rot}rad)`;
      }
      const dr = (delta / (Math.PI * 2)) * TURN_RATIO;
      const prev = trimRef.current;
      trimRef.current = d.side === "L"
        ? { ...prev, start: clamp01(Math.min(prev.end - MIN_SPAN, prev.start + dr)) }
        : { ...prev, end: clamp01(Math.max(prev.start + MIN_SPAN, prev.end + dr)) };
    };
    const up = (ev: PointerEvent) => {
      if (dragRef.current && ev.pointerId !== dragRef.current.id) return;
      dragRef.current = null;
      setSpinning(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [review, cxL, cxR, cy]);

  // 録音を始めるたびに、ダイヤルの見た目の角度も戻す。
  useEffect(() => {
    if (state !== "idle" && state !== "recording") return;
    for (const el of [reelL.current, reelR.current]) {
      if (!el) continue;
      el.dataset.rot = "0";
      el.style.transform = "";
    }
  }, [state]);

  // ---- 文言 -------------------------------------------------------------------
  const label = recording ? "RECORDING" : review ? "TRIM" : sending ? "SENDING" : "VOICE";
  const hint = recording ? "もう一度タップで停止"
    : review ? "左の円で始点、右の円で終点"
      : sending ? "文字にしています…"
        : "タップして録音";
  const btn: React.CSSProperties = {
    flex: 1, height: 46, borderRadius: 999, cursor: "pointer",
    fontFamily: SANS, fontSize: 13, fontWeight: 800, letterSpacing: "0.14em",
    userSelect: "none", WebkitUserSelect: "none",
  };
  const dialCommon: React.CSSProperties = {
    position: "absolute", width: RD, height: RD, borderRadius: "50%",
    background: fg, top: cy - RD / 2,
    touchAction: "none", cursor: review ? "grab" : "default",
  };

  return (
    <div
      ref={boxRef}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
    >
      {/* 上の空間。ここをタップすると録音が始まる/止まる。 */}
      <div
        onClick={() => { if (recording || state === "idle") voice.toggle(); }}
        role={recording || state === "idle" ? "button" : undefined}
        aria-label={recording ? "録音を停止" : "録音を開始"}
        style={{
          position: "absolute", left: 0, right: 0, top: 0, height: Math.max(170, cy - RD / 2),
          display: "flex", flexDirection: "column", justifyContent: "flex-end",
          padding: "0 24px 16px", gap: 13,
          cursor: recording || state === "idle" ? "pointer" : "default",
          userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.28em", color: mute, marginBottom: 6 }}>
              {label}
            </div>
            <div ref={timeRef} style={{ fontFamily: SANS, fontSize: 46, fontWeight: 800, lineHeight: 1, letterSpacing: "0.02em", color: fg, fontVariantNumeric: "tabular-nums" }}>
              {mmss(recording ? elapsed : 0)}
            </div>
          </div>
          {/* 録音中の目印。ベタ塗りの円ひとつ。 */}
          {recording && <div className="vs-blink" style={{ width: 14, height: 14, borderRadius: "50%", background: fg, marginBottom: 6 }} />}
        </div>

        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: waveH }} />

        <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", color: mute }}>{hint}</div>

        {/* 送信 / キャンセル。録音を止めてからだけ出す。★円(ダイヤル)に
            重ならないよう、必ずこの上のブロックの中に置くこと。 */}
        {review && (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={(e) => { e.stopPropagation(); voice.send(trimRef.current); }} style={{ ...btn, background: fg, color: dim ? INK : PAPER, border: "none" }}>送信</button>
            <button onClick={(e) => { e.stopPropagation(); voice.cancel(); }} style={{ ...btn, background: "transparent", color: fg, border: `2px solid ${fg}` }}>キャンセル</button>
          </div>
        )}
      </div>

      {/* テープ。2つの円のあいだにピンと張った直線の帯。録音中は縞が流れる。 */}
      <div
        aria-hidden
        className={recording ? "vs-tape vs-tape-run" : "vs-tape"}
        style={{
          position: "absolute", left: cxL, width: cxR - cxL,
          top: cy - RD * 0.045, height: RD * 0.09,
          background: fg, opacity: 0.9,
        }}
      />

      {/* 巨大な2つの円。録音中は回り、止めるとトリミングのダイヤルになる。 */}
      {(["L", "R"] as const).map((side) => (
        <div
          key={side}
          ref={side === "L" ? reelL : reelR}
          data-rot="0"
          className={recording ? "vs-reel-spin" : undefined}
          onPointerDown={(e) => onDialDown(e, side)}
          style={{ ...dialCommon, left: (side === "L" ? cxL : cxR) - RD / 2 }}
        >
          {/* リールの意匠。輪(フランジ)・短いスポーク3本・中心のハブ。
              どれも背景と同じ色で「抜く」ので、ベタ塗りの円に穴が空いて
              いるように見える。 */}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              position: "absolute", width: RD * 0.78, height: RD * 0.78, borderRadius: "50%",
              border: `${RD * 0.028}px solid ${hole}`,
            }} />
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                position: "absolute", width: RD * 0.46, height: RD * 0.048,
                background: hole, transform: `rotate(${i * 60}deg)`,
              }} />
            ))}
            <div style={{ width: RD * 0.20, height: RD * 0.20, borderRadius: "50%", background: hole }} />
          </div>
        </div>
      ))}

      {/* オーバーレイのときだけ、閉じるための面(左上)。 */}
      {dim && onClose && (
        <button onClick={onClose} aria-label="閉じる" style={{
          position: "absolute", top: 14, left: 16, width: 34, height: 34, borderRadius: "50%",
          background: "transparent", border: `2px solid ${mute}`, cursor: "pointer", zIndex: 4,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}>
          <div style={{ width: 14, height: 2, background: fg, transform: "rotate(45deg)", position: "absolute" }} />
          <div style={{ width: 14, height: 2, background: fg, transform: "rotate(-45deg)", position: "absolute" }} />
        </button>
      )}
    </div>
  );
}

// ★どのアプリからでも録音できる全画面のオーバーレイ。タブバー右端の録音
// アイコンを押すと、いまの画面が暗くなり、その上に同じ VoiceStudio が出る。
// createPortal で body 直下へ描く(.app-track が transform を持つため、
// シェルの中に position:fixed を書くと画面ではなくトラック基準で解決されて
// 画面外へ飛ぶ。§26.1 で実際にそうなった)。
export function VoiceOverlay({ voice, open, onClose }: {
  voice: VoiceControls;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="vs-in" style={{
      position: "fixed", inset: 0, zIndex: 58,
      background: SCRIM,
    }}>
      <VoiceStudio voice={voice} dim onClose={onClose} />
    </div>,
    document.body,
  );
}
