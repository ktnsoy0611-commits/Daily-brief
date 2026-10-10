"use client";

import { CARD_RADIUS, CHARCOAL, INK, JOURNAL_FACE, LATIN, PAPER, SANS, SURFACE_DIM } from "@/lib/constants";
import type { DateSlot } from "@/lib/taskBoard";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";

// ★★★**日付の受け皿**（2026-10-10・第137巡。試作の実装）。包みを長押しで運んでいるあいだだけ下から上がる墨の面。
//   日の上に来るとその日が青く膨らみ、離すとそこへ入る。★同じ面を「声の札をタスクにするときの日付選び」にも使う
//   （`pick` を渡すと押して選ぶ形になる）。並びと日付は `lib/taskBoard.ts` の `slotsOf` の1か所。

/** 1つの升の高さ。★目盛りの外（部品の寸法）。 */
const SLOT_H = SPACE.xxl + SPACE.xl - SPACE.hair;

export function DateDock({ carry, slots, title, hot, here, up, pick, onClose }: {
  /** 運ぶあいだの受け皿（升の矩形で当てる印）。 */
  carry?: boolean;
  slots: DateSlot[];
  title: string;
  /** 指が上にある升の key。 */
  hot?: string | null;
  /** いまの日（運んでいるタスクがすでに居る升 ―― 薄くする）。 */
  here?: string | null;
  up: boolean;
  /** 押して選ぶ形（声の札）。運ぶときは渡さない。 */
  pick?: (s: DateSlot) => void;
  onClose?: () => void;
}) {
  return (
    <div
      aria-hidden={!up}
      data-carry-dock={carry ? "" : undefined}
      style={{
        position: "absolute", left: SPACE.sm, right: SPACE.sm, bottom: `calc(var(--nav-h) + ${SPACE.sm}px)`, zIndex: 8,
        background: CHARCOAL, color: PAPER, borderRadius: CARD_RADIUS, padding: `${SPACE.lg}px ${SPACE.md}px ${SPACE.md}px`,
        transform: up ? "translateY(0)" : "translateY(calc(100% + var(--nav-h) + 48px))",
        transition: "transform var(--t-in) var(--ease-sheet)",
        pointerEvents: up && pick ? "auto" : "none", fontFamily: SANS,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.sm, margin: `0 ${SPACE.xs}px ${SPACE.md}px` }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: TYPE.small, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, letterSpacing: TRACK.normal, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        {onClose && (
          <button type="button" onClick={onClose} style={{
            border: 0, background: "none", color: PAPER, cursor: "pointer", padding: 0,
            fontSize: TYPE.small, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, letterSpacing: TRACK.normal,
          }}>やめる</button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: SPACE.sm }}>
        {slots.map((s) => {
          const on = hot === s.key, dim = here === s.key;
          return (
            <button
              key={s.key}
              type="button"
              data-slot={s.key}
              onClick={pick ? () => pick(s) : undefined}
              style={{
                height: SLOT_H, borderRadius: RADIUS.pill, border: 0, cursor: pick ? "pointer" : "default",
                background: on ? JOURNAL_FACE : SURFACE_DIM, color: on ? INK : PAPER, opacity: dim ? 0.35 : 1,
                display: "grid", placeContent: "center", gap: SPACE.hair, textAlign: "center",
                transform: on ? "scale(1.06)" : "scale(1)",
                transition: "transform var(--t-item) var(--ease-settle), background-color var(--t-item) var(--ease-settle)",
              }}
            >
              <b style={{ fontSize: TYPE.body, fontWeight: WEIGHT.heavy, lineHeight: LEAD.flat, letterSpacing: TRACK.normal }}>{s.jp}</b>
              <span style={{ fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, letterSpacing: TRACK.caps, opacity: 0.7 }}>{s.en}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
