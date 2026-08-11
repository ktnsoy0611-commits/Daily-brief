"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { INK, JOURNAL_BG, JOURNAL_FIG, JOURNAL_MUTED, PAPER, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import type { VoiceControls, VoiceTrim } from "@/lib/types";

// ★声の記録の画面(2026-08-11・参考画像に合わせて作り直し)。
//
// ■ 参考にした構図(ユーザー提供の画像)
//   ・地は暖かみのある中間グレー。**図と地の明度差はごくわずか**(約18)。
//   ・画面の外に中心を置いた**巨大な円が2つ**、左右から寄ってくる。円は
//     ただの塗り面で、輪もスポークもハブも持たない(「シンプルな円」)。
//     2つの円のあいだに残る細い縦の帯(砂時計の腰)が、テープの通り道になる。
//   ・その上に、数字だけの大きなタイポグラフィ。
//   ・最下部に1本のバー: 左に ✕、中央に短いラベル、右に濃い丸ボタン。
//   ・線・枠・影は一切使わない。
//
// ■ 手触り
//   録音中 … 2つの円がゆっくり回る(小さな点ひとつだけが回転を示す)。
//   録音後 … 同じ2つの円が**物理ダイヤル**になる。左の円を回すと波形の
//            開始位置、右の円を回すと終了位置が動く。1回転で全体の50%
//            動く重い比率にしてあり、15度ごとに手応え(haptic)を返す。
//   送信は明示 … 止めた時点では何も起きない。右の丸(✓)で送り、左の ✕ で捨てる。
//
// ■ 性能
//   波形も切り出し位置も **ref** に持ち、canvas へ rAF で描く。指の動きで
//   React を再レンダーしない(§14で潰した性能の穴を踏まないため)。
//
// ■ ハプティクスの限界(正直に書いておく)
//   haptic() は navigator.vibrate。**iOS Safari はこのAPIを持たない**ため、
//   実機(iPhone)では手応えは返らない。Androidと対応ブラウザでのみ効く。

/** 波形の棒の間隔(px)と太さ(px)。 */
const BAR_PITCH = 5;
const BAR_W = 2;
/** ダイヤル1回転で動かす割合。小さいほど「重い」。 */
const TURN_RATIO = 0.5;
/** 手応えを返す刻み(rad)。15度ごと。 */
const NOTCH = (15 * Math.PI) / 180;
/** 開始と終了が潰れないよう、最低これだけは残す。 */
const MIN_SPAN = 0.04;
/** 最下部のバーの高さ。 */
const BAR_H = 74;
/** 円の半径と中心(器の幅に対する比)。参考画像の腰のくびれ(幅の約16%)に合わせた。 */
const R_RATIO = 0.97;
const CX_RATIO = 0.55;

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
  /** オーバーレイとして幕の上に出すか。 */
  dim?: boolean;
  /** 幕を閉じる(オーバーレイのときだけ)。 */
  onClose?: () => void;
}) {
  // 幕の上でも、地と図の関係(わずかな明度差)は同じにする。
  const ground = dim ? "#2A2A28" : JOURNAL_BG;
  const figure = dim ? "#3A3A37" : JOURNAL_FIG;
  const fg = dim ? PAPER : INK;
  const mute = dim ? "rgba(255,255,255,0.46)" : JOURNAL_MUTED;

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reelL = useRef<HTMLDivElement>(null);
  const reelR = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // ★切り出しの位置は **ref**。ダイヤルを回すたびに setState すると
  // 1ジェスチャーで数十回の再レンダーになる(§14)。
  const trimRef = useRef<VoiceTrim>({ start: 0, end: 1 });
  const [elapsed, setElapsed] = useState(0);

  const { state, startedAt, durationMs, levelsRef } = voice;
  const recording = state === "recording";
  const review = state === "review";
  const sending = state === "sending";

  useEffect(() => { if (state === "recording" || state === "idle") trimRef.current = { start: 0, end: 1 }; }, [state]);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // 経過時間。★録音中だけ数える(値そのものは props で受け取らない)。
  useEffect(() => {
    if (!recording || !startedAt) { setElapsed(0); return; }
    setElapsed(Date.now() - startedAt);
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => window.clearInterval(id);
  }, [recording, startedAt]);

  // ---- 円の配置 --------------------------------------------------------------
  const w = size.w || 390;
  const h = size.h || 620;
  const RD = w * R_RATIO * 2;          // 直径
  const stageH = h - BAR_H;            // 円が乗る舞台(バーの上まで)
  const cy = stageH / 2;
  const cxL = -w * CX_RATIO;
  const cxR = w * (1 + CX_RATIO);

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
    // 録音中は「いま鳴っている分」が流れて見えるよう末尾だけ。止めたあとは
    // 全体を均して、どこを切り出すか決められるようにする。
    const bars = resample(recording ? all.slice(-n) : all, n);
    const t = trimRef.current;
    const mid = ch / 2;
    for (let i = 0; i < n; i++) {
      const r = n <= 1 ? 0 : i / (n - 1);
      const inRange = all.length > 0 && (recording || (r >= t.start && r <= t.end));
      const hgt = Math.max(1, bars[i] * (ch - 4));
      c.fillStyle = inRange ? fg : mute;
      c.fillRect(i * BAR_PITCH, mid - hgt / 2, BAR_W, hgt);
    }
    if (!recording && all.length > 0) {
      c.fillStyle = fg;
      for (const r of [t.start, t.end]) {
        c.fillRect(Math.min(cw - 1.5, Math.max(0, r * cw)), 0, 1.5, ch);
      }
    }
  }, [fg, mute, recording, levelsRef]);

  const shownMs = useCallback(() => (recording ? Date.now() - startedAt
    : review || sending ? durationMs * Math.max(0, trimRef.current.end - trimRef.current.start)
      : 0), [recording, review, sending, startedAt, durationMs]);

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
    dragRef.current = {
      id: e.pointerId, side, ang: Math.atan2(e.clientY - oy, e.clientX - ox),
      notch: 0, rot: Number(el?.dataset.rot ?? 0),
    };
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

  // 録音を始めるたびに、ダイヤルの角度も戻す。
  useEffect(() => {
    if (state !== "idle" && state !== "recording") return;
    for (const el of [reelL.current, reelR.current]) {
      if (!el) continue;
      el.dataset.rot = "0";
      el.style.transform = "";
    }
  }, [state]);

  // ---- 文言 -------------------------------------------------------------------
  const centerLabel = recording ? "もう一度タップで停止"
    : review ? "左右の円で切り出す"
      : sending ? "文字にしています"
        : "タップして録音";

  const canToggle = recording || state === "idle";

  return (
    <div ref={boxRef} style={{
      position: "relative", width: "100%", height: "100%", overflow: "hidden", background: ground,
    }}>
      {/* 巨大な円ふたつ。ただの塗り面。録音中はゆっくり回り、止めると
          切り出しのダイヤルになる。 */}
      {(["L", "R"] as const).map((side) => (
        <div
          key={side}
          ref={side === "L" ? reelL : reelR}
          data-rot="0"
          className={recording ? "vs-reel-spin" : undefined}
          onPointerDown={(e) => onDialDown(e, side)}
          style={{
            position: "absolute", width: RD, height: RD, borderRadius: "50%", background: figure,
            left: (side === "L" ? cxL : cxR) - RD / 2, top: cy - RD / 2,
            touchAction: "none", cursor: review ? "grab" : "default",
          }}
        >
          {/* 回転が読めるようにする、ただ1つの小さな点。 */}
          <div style={{
            position: "absolute", left: "50%", top: RD * 0.09, width: RD * 0.022, height: RD * 0.022,
            marginLeft: -RD * 0.011, borderRadius: "50%", background: mute,
          }} />
        </div>
      ))}

      {/* 舞台。タップで録音の開始/停止。 */}
      <div
        onClick={() => { if (canToggle) voice.toggle(); }}
        role={canToggle ? "button" : undefined}
        aria-label={recording ? "録音を停止" : "録音を開始"}
        style={{
          position: "absolute", left: 0, right: 0, top: 0, height: stageH,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "0 26px", gap: 22,
          cursor: canToggle ? "pointer" : "default",
          userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
        }}
      >
        <div ref={timeRef} style={{
          fontFamily: SANS, fontSize: 66, fontWeight: 500, lineHeight: 1,
          letterSpacing: "-0.02em", color: fg, fontVariantNumeric: "tabular-nums",
        }}>{mmss(recording ? elapsed : 0)}</div>

        {/* まだ何も録っていないときは波形そのものを出さない(参考画像と同じく、
            静止しているときの画面には数字とラベルしか無い)。 */}
        <canvas ref={canvasRef} style={{
          display: "block", width: "100%", height: 92,
          visibility: state === "idle" ? "hidden" : "visible",
        }} />
      </div>

      {/* 最下部のバー。左に破棄、中央にラベル、右に確定。参考画像と同じ構え。 */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: BAR_H,
        display: "flex", alignItems: "center", padding: "0 22px", gap: 12,
      }}>
        <div style={{ width: 46, display: "flex", justifyContent: "flex-start" }}>
          {(review || (dim && !recording && !sending)) && (
            <button
              onClick={() => { if (review) voice.cancel(); else onClose?.(); }}
              aria-label={review ? "破棄する" : "閉じる"}
              style={{ ...plain, width: 34, height: 34, position: "relative" }}
            >
              <span style={{ ...bar34, background: fg, transform: "rotate(45deg)" }} />
              <span style={{ ...bar34, background: fg, transform: "rotate(-45deg)" }} />
            </button>
          )}
        </div>

        <div style={{
          flex: 1, textAlign: "center", fontFamily: SANS, fontSize: 12.5, fontWeight: 500,
          letterSpacing: "0.02em", color: mute,
        }}>{centerLabel}</div>

        <div style={{ width: 46, display: "flex", justifyContent: "flex-end" }}>
          {review && (
            <button onClick={() => voice.send(trimRef.current)} aria-label="送信する" style={{
              ...plain, width: 46, height: 46, borderRadius: "50%", background: fg,
            }}>
              {/* ✓ を2本の直線で。 */}
              <span style={{ position: "absolute", width: 7, height: 2, background: ground, transform: "translate(-4px, 3px) rotate(45deg)" }} />
              <span style={{ position: "absolute", width: 15, height: 2, background: ground, transform: "translate(2px, 0px) rotate(-45deg)" }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const plain: React.CSSProperties = {
  border: "none", background: "transparent", padding: 0, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  userSelect: "none", WebkitUserSelect: "none",
};
const bar34: React.CSSProperties = { position: "absolute", width: 16, height: 1.6 };

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
    <div className="vs-in" style={{ position: "fixed", inset: 0, zIndex: 58 }}>
      <VoiceStudio voice={voice} dim onClose={onClose} />
    </div>,
    document.body,
  );
}
