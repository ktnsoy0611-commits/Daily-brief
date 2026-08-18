"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";

// ★時刻の入力(2026-08-18にユーザー確定)。ダイアル(時と分の2本の輪)をやめ、
// **タイムラインの上で帯をつまんで範囲を選ぶ**形にした。
// 「開始時刻と終了時刻の UI はタイムラインが表示され、その中で範囲を選ぶ UI に
// してください。デフォルトで間隔を1時間に」という指定。
//
// ダイアルは「いま何時を選んでいるか」は言えても「どれくらいの長さか」を
// 見せられなかった。タイムラインなら**長さがそのまま帯の長さ**になる。
//
// ★指が動いているあいだ React を回さない(ダイアルで踏んだのと同じ落とし穴)。
// 時間の目盛りは `useMemo` で作り置き、帯だけを ref 経由で動かす。
// 5分刻みなので、親へ返すのは値が実際に変わった瞬間だけ(1秒に数回)。

/** 1時間ぶんの高さ。 */
const HOUR_H = 44;
/** 見えている高さ。 */
export const TIMELINE_H = 200;
/** 何分刻みか。 */
const SNAP = 5;
/** これより短くはできない。 */
const MIN_DUR = 15;
/** 端をつまむ帯の高さ。 */
const GRIP = 15;
/** 時刻の目盛りの幅。 */
const GUTTER = 30;
/** 帯を置く面の幅。 */
const TRACK = 130;
const DAY = 24 * 60;

const pad = (n: number) => String(n).padStart(2, "0");
export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export const toStr = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 時間の目盛り。**一度だけ**作る(値に依存しない)。 */
const Grid = memo(function Grid({ line, ink }: { line: string; ink: string }) {
  const rows = useMemo(() => Array.from({ length: 24 }, (_, h) => (
    <div key={h} style={{ display: "flex", alignItems: "flex-start", height: HOUR_H }}>
      <span style={{
        width: GUTTER, flexShrink: 0, textAlign: "right", paddingRight: 6,
        transform: "translateY(-6px)",
        fontFamily: SANS, fontSize: 10, fontWeight: 600, color: ink,
      }}>{h === 0 ? "" : pad(h)}</span>
      <span style={{ flex: 1, height: 1, background: line }} />
    </div>
  )), [line, ink]);
  return <>{rows}</>;
});

export function TimeRange({ start, end, accent, onChange }: {
  /** HH:MM。 */
  start: string;
  end: string;
  accent: string;
  onChange: (start: string, end: string) => void;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const block = useRef<HTMLDivElement | null>(null);
  const readout = useRef<HTMLSpanElement | null>(null);
  const emit = useRef(onChange);
  emit.current = onChange;

  /** いま出している範囲(分)。つまんでいるあいだは props より新しい。 */
  const live = useRef({ s: toMin(start), e: toMin(end) });
  const drag = useRef<null | { id: number; y: number; mode: "move" | "top" | "bottom"; s: number; e: number }>(null);
  if (!drag.current) live.current = { s: toMin(start), e: toMin(end) };

  /** 帯を置き直す。**style を直接書く**(React を通さない)。 */
  const paint = () => {
    const b = block.current;
    if (!b) return;
    const { s, e } = live.current;
    b.style.top = `${(s * HOUR_H) / 60}px`;
    b.style.height = `${((e - s) * HOUR_H) / 60}px`;
    if (readout.current) readout.current.textContent = `${toStr(s)} – ${toStr(e)}`;
  };
  useLayoutEffect(paint);

  // 開いたら、いまの帯が真ん中に来るところまで送る。
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const { s, e } = live.current;
    const mid = ((s + e) / 2) * (HOUR_H / 60);
    sc.scrollTop = clamp(mid - TIMELINE_H / 2, 0, DAY * (HOUR_H / 60) - TIMELINE_H);
  }, []);

  // ★追従は window に張る。指が帯の外へ出た瞬間に要素側の pointermove は
  //   呼ばれなくなり、途中で置いていかれる。
  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.id) return;
      ev.preventDefault();
      const dMin = Math.round((ev.clientY - d.y) / (HOUR_H / 60) / SNAP) * SNAP;
      let s = d.s, e = d.e;
      if (d.mode === "move") {
        const dur = d.e - d.s;
        s = clamp(d.s + dMin, 0, DAY - dur);
        e = s + dur;
      } else if (d.mode === "top") {
        s = clamp(d.s + dMin, 0, d.e - MIN_DUR);
      } else {
        e = clamp(d.e + dMin, d.s + MIN_DUR, DAY);
      }
      if (s === live.current.s && e === live.current.e) return;
      live.current = { s, e };
      paint();
      haptic(3);
      emit.current(toStr(s), toStr(e));
    };
    const up = (ev: PointerEvent) => {
      if (drag.current?.id !== ev.pointerId) return;
      drag.current = null;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  const grab = (mode: "move" | "top" | "bottom") => (ev: React.PointerEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    haptic(8);
    drag.current = { id: ev.pointerId, y: ev.clientY, mode, s: live.current.s, e: live.current.e };
  };

  const line = "rgba(250,250,249,0.10)";
  const ink = "rgba(250,250,249,0.40)";
  return (
    <div style={{ width: GUTTER + TRACK, margin: "0 auto" }}>
      <div
        ref={scroller}
        style={{
          position: "relative", height: TIMELINE_H, overflowY: "auto",
          scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
          // 目盛りの上下は薄れさせる(ダイアルと同じ見え方)。
          maskImage: "linear-gradient(to bottom, transparent 0, #000 10%, #000 90%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 10%, #000 90%, transparent 100%)",
        }}
      >
        <div style={{ position: "relative", height: DAY * (HOUR_H / 60), paddingTop: 0 }}>
          <Grid line={line} ink={ink} />
          {/* つまむ帯。★`Press` は使わない(恒久ルール9 — 送れる面の中で
              touchstart を止めると、送ること自体ができなくなる)。 */}
          <div
            ref={block}
            onPointerDown={grab("move")}
            role="slider"
            aria-label="時刻の範囲"
            aria-valuemin={0}
            aria-valuemax={DAY}
            aria-valuenow={toMin(start)}
            aria-valuetext={`${start} から ${end}`}
            style={{
              position: "absolute", left: GUTTER + 2, right: 2,
              borderRadius: 10, background: accent, touchAction: "none",
              boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "grab", overflow: "hidden",
            }}
          >
            <span ref={readout} style={{
              fontFamily: SANS, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.02em",
              color: "#26261F", whiteSpace: "nowrap", pointerEvents: "none",
            }} />
            {/* 上下の端。ここをつまむと長さが変わる。 */}
            <span onPointerDown={grab("top")} style={{
              position: "absolute", top: 0, left: 0, right: 0, height: GRIP,
              touchAction: "none", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ width: 20, height: 2, borderRadius: 2, background: "rgba(38,38,31,0.45)" }} />
            </span>
            <span onPointerDown={grab("bottom")} style={{
              position: "absolute", bottom: 0, left: 0, right: 0, height: GRIP,
              touchAction: "none", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ width: 20, height: 2, borderRadius: 2, background: "rgba(38,38,31,0.45)" }} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
