"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GeoText } from "@/components/GeoType";
import { INK, JOURNAL_BG, JOURNAL_FIG, JOURNAL_MUTED, PAPER, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import type { VoiceControls, VoiceTrim } from "@/lib/types";

// ★声の記録の画面(2026-08-11)。純粋幾何学ミニマリズム。
//
// ■ 構図
//   ・地は暖かみのある中間グレー。**図と地の明度差はごくわずか**。
//   ・画面の外に中心を置いた**巨大な円が2つ**、左右から寄ってくる。
//     2つの円のあいだに残る細い縦の帯(砂時計の腰)がテープの通り道。
//     腰の位置(=円の中心の高さ)は**画面の下寄り**にしてある。そこが
//     いちばん内側まで来る所で、親指が届く高さでなければ操作できない。
//   ・その上の空きに、波形と数字。最下部に1本のバー(✕ / ラベル / ✓)。
//
// ■ 数字の扱い(ユーザー指定)
//   ・録音中は**強調しない**。小さく、控えめな色で置くだけ。
//   ・録音を終えたときだけ、幾何アルファベット(components/GeoType.tsx =
//     このアプリ固有の書体)で大きく出す。コロンは正方形2つで組む。
//   ・切り出し中は、**それぞれの円の上にその位置の秒数**が出る。
//
// ■ 手触り
//   ・画面を開いたとき/録音を始めたときに、円が左右から入ってくる。
//   ・録音中は円がゆっくり回る。縁の目盛りで回転が読める。
//   ・切り出し中に円を掴むと、その円だけ濃くなり少し持ち上がる(反応)。
//
// ■ 性能
//   波形も切り出し位置も **ref** に持ち、canvas へ rAF で描く。指の動きで
//   React を再レンダーしない(§14で潰した性能の穴を踏まないため)。
//   幾何アルファベットの数字だけは SVG なので、**指を離した時に1回だけ**
//   state を更新して描き直す(ドラッグ中は円の上の数字が DOM 直書きで動く)。
//
// ■ ハプティクスの限界(正直に書いておく)
//   haptic() は navigator.vibrate。**iOS Safari はこのAPIを持たない**ため、
//   実機(iPhone)では手応えは返らない。Androidと対応ブラウザでのみ効く。

/** 波形の棒の間隔と太さ(px)。太めで、両端は丸い。 */
const BAR_PITCH = 9;
const BAR_W = 5;
/** ダイヤル1回転で動かす割合。小さいほど「重い」。 */
const TURN_RATIO = 0.5;
/** 手応えを返す刻み(rad)。15度ごと。 */
const NOTCH = (15 * Math.PI) / 180;
/** 開始と終了が潰れないよう、最低これだけは残す。 */
const MIN_SPAN = 0.04;
/** 最下部のバーの高さ。 */
const BAR_H = 74;
/** ダイヤルの直径(器の幅に対する比)。画面をはみ出す大きさ。 */
const DIAL_RATIO = 1.94;
/** 中心のx(器の幅に対する比)。左右へ大きくはみ出す。 */
const DIAL_CX = 0.55;
/** 中心のyを、器の下端からどれだけ上に置くか(直径に対する比)。
 *  ★ここが砂時計の腰=いちばん掴みやすい高さになるので、下寄りにする。 */
const DIAL_CY_UP = 0.30;
/** 縁の目盛りの本数。 */
const TICKS = 5;

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

/** 幾何アルファベットの数字で mm:ss を組む。コロンは正方形2つ。 */
function GeoDuration({ ms, size, color }: { ms: number; size: number; color: string }) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  const dot = size * 0.15;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.16 }}>
      <GeoText text={mm} size={size} color={color} />
      <div style={{ display: "flex", flexDirection: "column", gap: dot * 1.1, padding: `0 ${size * 0.04}px` }}>
        <div style={{ width: dot, height: dot, background: color }} />
        <div style={{ width: dot, height: dot, background: color }} />
      </div>
      <GeoText text={ss} size={size} color={color} />
    </div>
  );
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
  const tick = dim ? "rgba(255,255,255,0.40)" : "rgba(26,26,24,0.38)";

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reelL = useRef<SVGSVGElement>(null);
  const reelR = useRef<SVGSVGElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const markL = useRef<HTMLDivElement>(null);
  const markR = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // ★波形のcanvasの実寸は **ref に控えておく**。draw() の中で clientWidth /
  // clientHeight を読むと、その瞬間に同期レイアウトが走る。ダイヤルの
  // transform を書いた直後の毎フレームでこれをやると、巨大な円を含む
  // ページ全体のレイアウトを毎回やり直すことになり、実測(4倍スロットリング)で
  // 1ドラッグあたり clientWidth の取得だけで 374ms 使っていた。
  const cvSizeRef = useRef({ w: 0, h: 0 });
  // ★切り出しの位置は **ref**。ダイヤルを回すたびに setState すると
  // 1ジェスチャーで数十回の再レンダーになる(§14)。
  const trimRef = useRef<VoiceTrim>({ start: 0, end: 1 });
  const [elapsed, setElapsed] = useState(0);
  /** 幾何アルファベットで出す長さ。**指を離した時だけ**更新する。 */
  const [keptMs, setKeptMs] = useState(0);
  /** いま掴んでいる円。掴んでいなければ null。 */
  const [active, setActive] = useState<"L" | "R" | null>(null);
  /** 円が左右から入ってくるアニメーションの再生キー。 */
  const [enterKey, setEnterKey] = useState(0);

  const { state, startedAt, durationMs, levelsRef } = voice;
  const recording = state === "recording";
  const review = state === "review";
  const sending = state === "sending";

  useEffect(() => {
    if (state === "recording" || state === "idle") trimRef.current = { start: 0, end: 1 };
    if (state === "review") setKeptMs(durationMs);
  }, [state, durationMs]);

  // ★円の入場。画面を開いたとき(mount)と、録音を始めた瞬間に流す。
  useEffect(() => { if (state === "idle" || state === "recording") setEnterKey((n) => n + 1); }, [state]);

  useLayoutEffect(() => {
    const el = boxRef.current;
    const cv = canvasRef.current;
    if (!el || !cv) return;
    const read = () => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
      cvSizeRef.current = { w: cv.clientWidth, h: cv.clientHeight };
    };
    const ro = new ResizeObserver(read);
    ro.observe(el);
    ro.observe(cv);
    read();
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
  const RD = w * DIAL_RATIO;                 // 直径
  const cy = h - RD * DIAL_CY_UP;            // 腰(=掴む高さ)を下寄りに
  const cxL = -w * DIAL_CX;
  const cxR = w * (1 + DIAL_CX);

  // ---- 波形を描く ------------------------------------------------------------
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    // ★実寸は ref から。ここで clientWidth を読むと毎フレーム同期レイアウトが走る。
    const { w: cw, h: ch } = cvSizeRef.current;
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

    const n = Math.max(1, Math.floor((cw - BAR_W) / BAR_PITCH) + 1);
    const all = levelsRef.current;
    // 録音中は「いま鳴っている分」が流れて見えるよう末尾だけ。止めたあとは
    // 全体を均して、どこを切り出すか決められるようにする。
    const bars = resample(recording ? all.slice(-n) : all, n);
    const t = trimRef.current;
    const mid = ch / 2;
    // ★太い線＋丸い端。存在感を出すため、塗りではなく線で描く。
    c.lineWidth = BAR_W;
    c.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const r = n <= 1 ? 0 : i / (n - 1);
      const inRange = all.length > 0 && (recording || (r >= t.start && r <= t.end));
      const hgt = Math.max(0, bars[i] * (ch - BAR_W));
      const x = BAR_W / 2 + i * BAR_PITCH;
      c.strokeStyle = inRange ? fg : mute;
      c.beginPath();
      c.moveTo(x, mid - hgt / 2);
      c.lineTo(x, mid + hgt / 2);
      c.stroke();
    }
    if (!recording && all.length > 0) {
      // 切り出しの位置。細い直線で示す。
      c.lineWidth = 2;
      c.lineCap = "butt";
      c.strokeStyle = fg;
      for (const r of [t.start, t.end]) {
        const x = Math.min(cw - 1, Math.max(1, r * cw));
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, ch);
        c.stroke();
      }
    }
  }, [fg, mute, recording, levelsRef]);

  // ★同じ文字列なら書かない。textContent への代入は、値が同じでもその
  // 要素のレイアウトを汚す。毎フレームやると、巨大な円を含むページの
  // レイアウトを繰り返すことになり、実測(4倍スロットリング)で1ドラッグ
  // あたり Layout だけで 508ms 使っていた。
  const setText = (el: HTMLElement | null, v: string) => {
    if (el && el.textContent !== v) el.textContent = v;
  };
  const drawAll = useCallback(() => {
    draw();
    const t = trimRef.current;
    // 録音中の経過時間だけ、この控えめな数字に出す。
    if (recording) setText(timeRef.current, mmss(Date.now() - startedAt));
    // ★切り出し中は、それぞれの円の上にその位置の秒数を出す。
    setText(markL.current, mmss(durationMs * t.start));
    setText(markR.current, mmss(durationMs * t.end));
  }, [draw, recording, startedAt, durationMs]);

  // rAF を回すのは「録音中」と「ダイヤルを回している間」だけ。
  useEffect(() => {
    let raf = 0;
    const loop = () => { drawAll(); raf = requestAnimationFrame(loop); };
    if (recording || active) raf = requestAnimationFrame(loop);
    else drawAll();
    return () => cancelAnimationFrame(raf);
  }, [drawAll, recording, active, size.w, size.h]);

  // ---- ダイヤルを回す --------------------------------------------------------
  const dragRef = useRef<{ id: number; side: "L" | "R"; ang: number; notch: number; rot: number } | null>(null);

  // ★回すのは**目盛りの層だけ**。塗りつぶしの円は回転対称なので動かす意味が
  // 無く、直径が画面幅の約2倍あるため毎フレーム塗り直すと非常に高くつく
  // (実測: 4倍スロットリングで1ドラッグあたりブラウザ側の描画に1237ms)。
  // 目盛りの層は透明な面に細い線が5本あるだけなので、同じ大きさでも安い。
  // ★transform だけを書く。data-rot は指を離したときに1回だけ書く
  // (属性の書き換えはスタイル再計算を誘うので、毎フレームやらない)。
  const applyDial = (el: SVGSVGElement | null, rot: number) => {
    if (!el) return;
    // translateZ(0) を必ず残す。外すと合成レイヤーから降りてしまう。
    el.style.transform = `translateZ(0) rotate(${rot}rad)`;
  };

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
    setActive(side);
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
      applyDial(d.side === "L" ? reelL.current : reelR.current, d.rot);
      const dr = (delta / (Math.PI * 2)) * TURN_RATIO;
      const prev = trimRef.current;
      trimRef.current = d.side === "L"
        ? { ...prev, start: clamp01(Math.min(prev.end - MIN_SPAN, prev.start + dr)) }
        : { ...prev, end: clamp01(Math.max(prev.start + MIN_SPAN, prev.end + dr)) };
    };
    const up = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (d && ev.pointerId !== d.id) return;
      if (d) {
        const el = d.side === "L" ? reelL.current : reelR.current;
        if (el) el.dataset.rot = String(d.rot);
      }
      dragRef.current = null;
      setActive(null);
      // 幾何アルファベットの数字はここで1回だけ更新する。
      const t = trimRef.current;
      setKeptMs(durationMs * Math.max(0, t.end - t.start));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [review, cxL, cxR, cy, durationMs]);

  // 録音を始めるたびに、ダイヤルの角度も戻す。
  useEffect(() => {
    if (state !== "idle" && state !== "recording") return;
    for (const el of [reelL.current, reelR.current]) {
      if (!el) continue;
      el.dataset.rot = "0";
      el.style.transform = "";
    }
  }, [state, enterKey]);

  // ---- 文言 -------------------------------------------------------------------
  const centerLabel = recording ? "もう一度タップで停止"
    : review ? "左右の円で切り出す"
      : sending ? "文字にしています"
        : "タップして録音";

  const canToggle = recording || state === "idle";
  const geoSize = Math.min(52, w * 0.132);

  return (
    <div ref={boxRef} style={{
      position: "relative", width: "100%", height: "100%", overflow: "hidden", background: ground,
    }}>
      {/* 巨大な円ふたつ。ただの塗り面＋縁の目盛り。
          ★重なり順とポインタの通し方に注意: 舞台(タップで録音)はこの上に
          あるので、review のときは舞台をポインタに対して透明にして、
          こちらが指を受け取る。これを忘れると円が一切操作できない。 */}
      {(["L", "R"] as const).map((side) => (
        <div
          key={`${side}-${enterKey}`}
          className={side === "L" ? "vs-dial-in-l" : "vs-dial-in-r"}
          onPointerDown={(e) => onDialDown(e, side)}
          style={{
            position: "absolute", width: RD, height: RD, borderRadius: "50%",
            // ★掴んだ反応で**この円の塗りは変えない**。直径が画面幅の約2倍
            // あるため、背景色を変えるだけで 757px の面が塗り直され、
            // transition を付けるとそれが十数フレーム続く(実測でこれだけで
            // 1ドラッグ約500msのコスト)。反応は目盛りと数字で見せる。
            background: figure,
            left: (side === "L" ? cxL : cxR) - RD / 2, top: cy - RD / 2,
            zIndex: 1, touchAction: "none",
            pointerEvents: review ? "auto" : "none",
            cursor: review ? "grab" : "default",
          }}
        >
          {/* ★回るのはこの層だけ。塗りつぶしの円は回転対称なので静止させる。
              目盛りは div を10個入れ子にせず **SVG 1枚**にしてある(同じ
              大きさのレイヤーでも、ラスタライズが桁違いに安い)。 */}
          <svg
            ref={side === "L" ? reelL : reelR}
            data-rot="0"
            className={recording ? "vs-reel-spin" : undefined}
            viewBox="0 0 100 100"
            aria-hidden
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              // 合成レイヤーへ上げて、回転を「塗り直し」ではなく「合成」にする。
              willChange: "transform", transform: "translateZ(0)",
            }}
          >
            {/* 縁の目盛り。一番端に寄せた、短く太い線。角は丸めない。 */}
            {Array.from({ length: TICKS }, (_, i) => (
              <rect
                key={i}
                x={50 - 0.73} y={0.8} width={1.46} height={4.5}
                fill={active === side ? fg : tick}
                transform={`rotate(${(i * 360) / TICKS} 50 50)`}
              />
            ))}
          </svg>
        </div>
      ))}

      {/* 切り出し中、それぞれの円の上に「その位置の秒数」を出す。 */}
      {review && (["L", "R"] as const).map((side) => (
        <div
          key={side}
          ref={side === "L" ? markL : markR}
          style={{
            position: "absolute", zIndex: 2, pointerEvents: "none",
            left: side === "L" ? w * 0.21 : w * 0.79, top: cy + 26,
            transform: "translate(-50%, 0)",
            fontFamily: SANS, fontVariantNumeric: "tabular-nums",
            // ★font-size は遷移させない(遷移中ずっとレイアウトが走る)。
            // 反応は色と太さだけで見せる。
            fontSize: 17, fontWeight: 700, letterSpacing: "0.02em",
            color: active === side ? fg : mute,
            transition: "color 140ms ease",
          }}
        >00:00</div>
      ))}

      {/* 舞台。タップで録音の開始/停止。文字と波形はここに乗る。 */}
      <div
        onClick={() => { if (canToggle) voice.toggle(); }}
        role={canToggle ? "button" : undefined}
        aria-label={recording ? "録音を停止" : "録音を開始"}
        style={{
          position: "absolute", inset: 0, zIndex: 2,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "0 26px", paddingBottom: h * 0.22, gap: 26,
          cursor: canToggle ? "pointer" : "default",
          // ★review のときは指を素通りさせ、下のダイヤルに渡す。
          pointerEvents: canToggle ? "auto" : "none",
          userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
        }}
      >
        {/* 録音中の数字は**強調しない**。小さく、控えめに。 */}
        <div ref={timeRef} style={{
          fontFamily: SANS, fontSize: 19, fontWeight: 500, lineHeight: 1,
          letterSpacing: "0.20em", color: mute, fontVariantNumeric: "tabular-nums",
          opacity: recording ? 1 : 0, height: 19,
        }}>{mmss(elapsed)}</div>

        {/* まだ何も録っていないときは波形を出さない。 */}
        <canvas ref={canvasRef} style={{
          display: "block", width: "100%", height: 104,
          visibility: state === "idle" ? "hidden" : "visible",
        }} />

        {/* ★録音を終えたときだけ、幾何アルファベットで長さを大きく出す。 */}
        <div style={{ height: geoSize, display: "flex", alignItems: "center" }}>
          {(review || sending) && <GeoDuration ms={keptMs} size={geoSize} color={fg} />}
        </div>
      </div>

      {/* 最下部のバー。左に破棄、中央にラベル、右に確定。 */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: BAR_H, zIndex: 3,
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
