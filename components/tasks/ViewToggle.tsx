"use client";

import { INK, PAPER, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import type { SolidView } from "@/lib/solidPaint";

// ★ネームビュー / タグビューの切り替え。2マスの幾何学スイッチ。
// 角丸・影・OS標準のフォームUIは使わない(ベタ塗りの正方形だけ)。
//
// ★切り替えても**形も位置も変わらない**。図形に載る文字が
// 「タスクの題」から「タグの英字」に変わるだけ(2026-08-16にユーザー確定)。

const CELL = 40;

export function ViewToggle({ view, onChange }: { view: SolidView; onChange: (v: SolidView) => void }) {
  return (
    <div style={{ display: "flex", gap: 2, pointerEvents: "auto" }}>
      {(["name", "tag"] as const).map((v) => {
        const on = view === v;
        return (
          <button key={v} onClick={() => { haptic(6); onChange(v); }}
            aria-label={v === "name" ? "名前を表示" : "タグを表示"}
            style={{
              width: CELL, height: CELL, border: "none", cursor: "pointer", padding: 0,
              background: on ? INK : "rgba(26,26,24,0.10)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
            }}>
            {v === "name" ? <NameMark on={on} /> : <TagMark on={on} />}
            <span style={{
              fontFamily: SANS, fontSize: 6, fontWeight: 700, letterSpacing: "0.12em",
              color: on ? PAPER : "rgba(26,26,24,0.5)",
            }}>{v === "name" ? "NAME" : "TAG"}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 文の行が入った面。「名前が載っている」ことを表す。 */
function NameMark({ on }: { on: boolean }) {
  const c = on ? PAPER : INK;
  return (
    <svg width={20} height={13} viewBox="0 0 20 13" aria-hidden focusable="false">
      <rect x={0} y={1} width={20} height={11} fill={c} opacity={0.35} />
      <rect x={3} y={4} width={14} height={2} fill={c} />
      <rect x={3} y={7.5} width={9} height={2} fill={c} />
    </svg>
  );
}

/** 5つの色面が並んだ姿。「タグが載っている」ことを表す。 */
function TagMark({ on }: { on: boolean }) {
  const c = on ? PAPER : INK;
  return (
    <svg width={20} height={13} viewBox="0 0 20 13" aria-hidden focusable="false">
      <rect x={0} y={1} width={20} height={11} fill={c} opacity={0.35} />
      <rect x={2.5} y={3.5} width={15} height={6} fill={c} />
    </svg>
  );
}
