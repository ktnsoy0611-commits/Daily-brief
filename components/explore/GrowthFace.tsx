"use client";

import { CARD_RADIUS, INK, JOURNAL_FACE, LATIN, PAPER, SANS, SOFT_SHADOW_LG } from "@/lib/constants";
import { ratingLabel } from "@/lib/helpers";
import { bodyInkOn } from "@/lib/palette";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
import type { GrowthCard } from "@/lib/types";

// ★★★**育成の札（ゴールの札）の版面**（2026-09-28・第134巡にユーザー指定「**check-in のカードが今のデザインに
//   全く整合していない**」「**あとで・記録するの UI がはみ出している。カード内に収めて、アイコンやボタンも
//   今のデザインに整合させて**」「**ゴールを増やすカード**」「**進捗を聞くカードで、達成した・諦めるを選べるように**」）。
// ★作りは提案の札と同じ … 角 `CARD_RADIUS`・ベゼル `SPACE.xl`・影 `SOFT_SHADOW_LG`・面は1色（JOURNAL の青 ――
//   ゴールの記録は JOURNAL のログへ行くので、行き先の色）・字は面から導く墨（`bodyInkOn`）。
// ★★ボタンは**札の中の下の1列**（高さ 44 ＝ 提案の札の下の列と同じ）。第133巡までは札の外の足元にあり、
//   タブバーへはみ出していた。★綴じ穴・芽のアイコン・緑の面は外した（今の札の語彙に無い）。
// ★★押せない「記録する」は**薄くしない**（`design.md` の「押せる／押せないをグレーアウトで言わない」）――
//   塗り ＝ 押せる／輪郭 ＝ まだ押せない、の形で言う。

export type GoalOutcome = "keep" | "achieved" | "dropped";

const PAD = SPACE.xl;
const ROW_H = 44;
const CHIP_H = 32;

const EYEBROW: Record<GrowthCard["type"], string> = {
  checkin: "CHECK-IN",
  milestone: "MILESTONE",
  "goal-new": "NEW GOAL",
};
const QUESTION: Record<GrowthCard["type"], string> = {
  checkin: "最近は、どうですか？",
  milestone: "できるようになったこと、ありますか？",
  "goal-new": "最近、達成したいことは？",
};
const HINT: Record<GrowthCard["type"], string> = {
  checkin: "今取り組んでいることを、ひとことで",
  milestone: "この1〜2か月で、できるようになったこと",
  "goal-new": "例 … ギターで1曲通して弾けるようになる",
};
const OUTCOMES: { id: GoalOutcome; label: string }[] = [
  { id: "keep", label: "続ける" },
  { id: "achieved", label: "達成した" },
  { id: "dropped", label: "諦める" },
];

/** 選べる小さなピル。★選んだもの ＝ 墨の塗り／他 ＝ 墨の輪郭（色を足さない）。 */
function Chip({ on, label, ink, onPick }: { on: boolean; label: string; ink: string; onPick: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onPick(); }}
      aria-pressed={on}
      style={{
        flex: 1, height: CHIP_H, padding: 0, borderRadius: RADIUS.pill, cursor: "pointer",
        background: on ? ink : "transparent", border: `1.5px solid ${ink}`, color: on ? PAPER : ink,
        fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, letterSpacing: TRACK.normal,
        transition: "background var(--t-item) var(--ease-settle), color var(--t-item) var(--ease-settle)",
      }}
    >{label}</button>
  );
}

export function GrowthFace({ card, isTop, value, onValue, rating, onRating, outcome, onOutcome, canRecord, onSkip, onRecord }: {
  card: GrowthCard;
  isTop: boolean;
  value: string;
  onValue: (v: string) => void;
  rating: 1 | 2 | 3 | null;
  onRating: (r: 1 | 2 | 3) => void;
  outcome: GoalOutcome;
  onOutcome: (o: GoalOutcome) => void;
  canRecord: boolean;
  onSkip?: () => void;
  onRecord?: () => void;
}) {
  const face = JOURNAL_FACE;
  const ink = bodyInkOn(face);
  const isNew = card.type === "goal-new";
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <div style={{
      width: "100%", height: "100%", background: face, borderRadius: CARD_RADIUS, boxShadow: SOFT_SHADOW_LG,
      padding: PAD, display: "flex", flexDirection: "column", userSelect: "none", position: "relative",
    }}>
      <div style={{ fontFamily: LATIN, fontSize: TYPE.small, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, letterSpacing: TRACK.caps, color: ink }}>
        {EYEBROW[card.type]}
      </div>
      {!isNew && (
        <div style={{
          marginTop: SPACE.sm, fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold, lineHeight: LEAD.snug, color: ink,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{card.goalTitle}</div>
      )}
      <h2 style={{ margin: `${SPACE.md}px 0 0`, fontFamily: SANS, fontSize: TYPE.head, fontWeight: WEIGHT.bold, lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: ink }}>
        {QUESTION[card.type]}
      </h2>
      {/* ★書く面は紙。角は札と同心（札の角 − ベゼル）。 */}
      <textarea
        value={value}
        onChange={(e) => onValue(e.target.value)}
        onPointerDown={stop}
        placeholder={HINT[card.type]}
        readOnly={!isTop}
        style={{
          flex: "1 1 auto", minHeight: 0, marginTop: SPACE.lg, resize: "none", border: "none", outline: "none",
          borderRadius: RADIUS.lg, padding: SPACE.md, background: PAPER, color: INK,
          fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.text, lineHeight: LEAD.body, letterSpacing: TRACK.normal,
        }}
      />
      {card.type === "milestone" && (
        <div style={{ display: "flex", gap: SPACE.sm, marginTop: SPACE.md }}>
          {([1, 2, 3] as const).map((r) => (
            <Chip key={r} on={rating === r} label={ratingLabel(r)} ink={ink} onPick={() => onRating(r)} />
          ))}
        </div>
      )}
      {!isNew && (
        <div style={{ display: "flex", gap: SPACE.sm, marginTop: SPACE.md }}>
          {OUTCOMES.map((o) => (
            <Chip key={o.id} on={outcome === o.id} label={o.label} ink={ink} onPick={() => onOutcome(o.id)} />
          ))}
        </div>
      )}
      {/* ★★下の1列（提案の札の操作の列と同じ高さ）。★見本帳（`DEV`）では押し手が無いので出さない。 */}
      {(onSkip || onRecord) && (
        <div style={{ flex: "0 0 auto", height: ROW_H, marginTop: SPACE.lg, display: "flex", gap: SPACE.sm }}>
          <button
            type="button" onPointerDown={stop}
            onClick={(e) => { e.stopPropagation(); onSkip?.(); }}
            style={{
              flex: 1, height: ROW_H, borderRadius: RADIUS.pill, background: "transparent", border: `1.5px solid ${ink}`, color: ink,
              fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, letterSpacing: TRACK.normal, cursor: "pointer",
            }}
          >あとで</button>
          <button
            type="button" onPointerDown={stop}
            onClick={(e) => { e.stopPropagation(); if (canRecord) onRecord?.(); }}
            aria-disabled={!canRecord}
            style={{
              flex: 1.4, height: ROW_H, borderRadius: RADIUS.pill,
              background: canRecord ? ink : "transparent", border: `1.5px solid ${ink}`, color: canRecord ? PAPER : ink,
              fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, letterSpacing: TRACK.normal,
              cursor: canRecord ? "pointer" : "default",
              transition: "background var(--t-item) var(--ease-settle), color var(--t-item) var(--ease-settle)",
            }}
          >{isNew ? "追加する" : outcome === "achieved" ? "達成を記録" : outcome === "dropped" ? "諦めて閉じる" : "記録する"}</button>
        </div>
      )}
    </div>
  );
}
