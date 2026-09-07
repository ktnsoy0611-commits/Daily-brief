"use client";

import { useMemo, useState } from "react";
import { Band } from "@/components/home/Band";
import { TabIcon } from "@/components/TabIcons";
import { HEADER_CHIP_SIZE, INK, MUTED, SANS, SCHEME } from "@/lib/constants";
import { bandRows, unreadCards } from "@/lib/homeBand";
import { todayKey } from "@/lib/helpers";
import { bodyInkOn } from "@/lib/palette";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
import type { TabProps } from "@/lib/types";

// ★★★**ホーム**（2026-09-07・`docs/home-spec.md`）。起動時に最初に出る画面で、
// 3アプリ（EXPLORE / TASK / JOURNAL）の**入口**。
//
// **主題は時間管理ではない。**「AI が先回りして、いま自分にとって最適なものを
// 差し出す」場所で、仕事も週末も余暇も**同じ種類の提案**として扱う。
//
// 置き場の規則は1本 ―― **日付が無いものは帯（上）。日付が付いたものは山（下）。**
//
// ★★★**大きな英語は1画面に1つ**（§8）。ホームのそれは**山の日付**が持つので、
//   ここの見出しは `HOME ／ 07 SEP ／ SUN` の**小さなラベル1行だけ**にする。
//   ごちゃごちゃの正体は、大きな英語が2つあることだった（第24〜25便）。
//
// ★★山（GRAVITY）はまだ繋いでいない（`docs/home-spec.md` §10-4）。いまは帯の
//   動きを実機で見るための段階（§10-3）で、下は地のまま空けてある。

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** `HOME ／ 07 SEP ／ SUN`。★小さいラベルは 8〜9px・大文字・字間（§8）。 */
function Dateline({ now }: { now: Date }) {
  const text = `HOME  ${String(now.getDate()).padStart(2, "0")} ${MONTHS[now.getMonth()]}  ${DAYS[now.getDay()]}`;
  return (
    <div style={{
      fontFamily: SANS, fontSize: TYPE.micro, fontWeight: WEIGHT.bold,
      letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: `var(--muted-on, ${MUTED})`,
      whiteSpace: "nowrap",
    }}>{text}</div>
  );
}

/**
 * 持ち物（§7-b）。★**面のアイコン ＋ 数字のバッジ**で、**山の物理に参加しない**。
 * ★★印（円の中に記号1つ）が付いてよいのは**触れる部品**だけで、ここはその1つ。
 * ★★まだ「開くと図形が扇に散る」は作っていない（§10-6）。いまは数だけを出す。
 */
function Carry({ count, onPress }: { count: number; onPress: () => void }) {
  const [down, setDown] = useState(false);
  return (
    <button
      aria-label={`持ち物 ${count}`}
      onPointerDown={() => setDown(true)}
      onPointerUp={() => setDown(false)}
      onPointerCancel={() => setDown(false)}
      onClick={onPress}
      style={{
        position: "relative", flexShrink: 0,
        width: HEADER_CHIP_SIZE, height: HEADER_CHIP_SIZE, padding: 0,
        background: "none", border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        // ★押下だけが非対称 ―― 即座に沈み、ゆっくり戻る（`design.md` §4）。
        transform: down ? "scale(0.94)" : "scale(1)",
        transition: down
          ? "transform var(--t-press) var(--ease-press)"
          : "transform var(--t-out) var(--ease-settle)",
      }}
    >
      <TabIcon name="layers" color={`var(--ink-on, ${INK})`} size={HEADER_CHIP_SIZE} />
      {count > 0 && (
        // ★印は**真円**で、直径は 18 / 28 / 46 の3段だけ（§7-a）。ここは最小の 18。
        <span style={{
          position: "absolute", top: 0, right: 0,
          width: 18, height: 18, borderRadius: RADIUS.circle,   /* ★目盛りの外（印の直径は 18/28/46 の3段） */
          background: SCHEME.danger, color: bodyInkOn(SCHEME.danger),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: SANS, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
          letterSpacing: TRACK.normal, lineHeight: LEAD.flat,
        }}>{count}</span>
      )}
    </button>
  );
}

export function HomeTab({ appState, showToast }: TabProps) {
  const now = useMemo(() => new Date(), []);
  const day = todayKey();
  const rows = useMemo(() => bandRows(appState, day), [appState, day]);
  // ★持ち物 … いまは**今日のタスクが持ち物として書いているもの**の数。
  //   ★★「持った」の印はデータモデルにまだ無い（`handoff_current.md` の未解決）。
  const carry = (appState.tasks ?? []).filter((t) => !t.done && t.belongings?.trim()).length;
  const unread = unreadCards(appState, day).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* 見出しの行。★左右のパディングは持たない（持ち主は `AppShell` だけ）。 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: SPACE.md, padding: `${SPACE.md}px 0 ${SPACE.lg}px`,
      }}>
        <Dateline now={now} />
        <Carry count={carry} onPress={() => showToast(`持ち物 ${carry} 件・未読の提案 ${unread} 枚`)} />
      </div>

      {/* 帯（3段）。★器の左右のパディングの外へ出る（`.bleed-x`）。 */}
      <Band rows={rows} />
    </div>
  );
}
