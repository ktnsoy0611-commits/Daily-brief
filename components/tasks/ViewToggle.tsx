"use client";

import { INK, PAPER, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import type { SolidView } from "@/lib/solidPaint";

// ★FRONT / BOTTOM の切り替え。2マスの幾何学スイッチ。
// 角丸・影・OS標準のフォームUIは使わない(ベタ塗りの正方形だけ)。

const CELL = 40;

export function ViewToggle({ view, onChange }: { view: SolidView; onChange: (v: SolidView) => void }) {
  return (
    <div style={{ display: "flex", gap: 2, pointerEvents: "auto" }}>
      {(["front", "bottom"] as const).map((v) => {
        const on = view === v;
        return (
          <button key={v} onClick={() => { haptic(6); onChange(v); }}
            aria-label={v === "front" ? "正面から見る" : "真下から見る"}
            style={{
              width: CELL, height: CELL, border: "none", cursor: "pointer", padding: 0,
              background: on ? INK : "rgba(26,26,24,0.10)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
            }}>
            {v === "front" ? <FrontMark on={on} /> : <BottomMark on={on} />}
            <span style={{
              fontFamily: SANS, fontSize: 6, fontWeight: 700, letterSpacing: "0.12em",
              color: on ? PAPER : "rgba(26,26,24,0.5)",
            }}>{v === "front" ? "FRONT" : "BTM"}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 真横から見た長方形(スラブの切れ目入り)。 */
function FrontMark({ on }: { on: boolean }) {
  const c = on ? PAPER : INK;
  return (
    <svg width={20} height={13} viewBox="0 0 20 13" aria-hidden focusable="false">
      <rect x={0} y={2} width={8.6} height={9} fill={c} />
      <rect x={10} y={2} width={4.4} height={9} fill={c} />
      <rect x={15.8} y={2} width={4.2} height={9} fill={c} />
    </svg>
  );
}

/** 真下から見た断面(円)。 */
function BottomMark({ on }: { on: boolean }) {
  const c = on ? PAPER : INK;
  return (
    <svg width={20} height={13} viewBox="0 0 20 13" aria-hidden focusable="false">
      <circle cx={10} cy={6.5} r={6} fill={c} opacity={0.95} />
    </svg>
  );
}
