"use client";

import { haptic } from "@/lib/helpers";

// ★入力画面(TaskComposer)の下の帯。5つの項目を面で描いたアイコンで並べる
// (components/TabIcons.tsx と同じ作り — 線ではなく面だけ)。
// 値が入っているものはタグの色で灯り、空のものは沈む。

export type ToolKey = "due" | "context" | "belongings" | "weight" | "tag";

export const TOOL_LABEL: Record<ToolKey, string> = {
  due: "日付", context: "メモ", belongings: "持ち物", weight: "重要度", tag: "タグ",
};

const S = 22;

function Glyph({ name, c }: { name: ToolKey; c: string }) {
  const common = { width: S, height: S, viewBox: "0 0 24 24", fill: c, "aria-hidden": true } as const;
  switch (name) {
    // 日付 = カレンダー。上に濃い帯、下は方眼の点。
    case "due":
      return (
        <svg {...common}>
          <rect x="2.5" y="4" width="19" height="4.6" />
          <rect x="2.5" y="10.4" width="19" height="9.6" opacity={0.34} />
          <rect x="6" y="13" width="3.4" height="3.4" />
          <rect x="10.3" y="13" width="3.4" height="3.4" />
          <rect x="14.6" y="13" width="3.4" height="3.4" />
        </svg>
      );
    // メモ = 紙に3本の帯。
    case "context":
      return (
        <svg {...common}>
          <rect x="3.5" y="3" width="17" height="18" opacity={0.34} />
          <rect x="6.5" y="7" width="11" height="2.2" />
          <rect x="6.5" y="11" width="11" height="2.2" />
          <rect x="6.5" y="15" width="6.5" height="2.2" />
        </svg>
      );
    // 持ち物 = 鞄。胴の四角と、その上の取っ手。
    case "belongings":
      return (
        <svg {...common}>
          <rect x="8.4" y="3" width="7.2" height="2" />
          <rect x="8.4" y="3" width="2" height="4.6" />
          <rect x="13.6" y="3" width="2" height="4.6" />
          <rect x="2.5" y="7.6" width="19" height="12.4" opacity={0.34} />
          <rect x="2.5" y="7.6" width="19" height="3.2" />
        </svg>
      );
    // 重要度 = 3段に積み上がる帯。
    case "weight":
      return (
        <svg {...common}>
          <rect x="3" y="15.4" width="5" height="5" />
          <rect x="9.5" y="10.4" width="5" height="10" opacity={0.34} />
          <rect x="16" y="4.4" width="5" height="16" />
        </svg>
      );
    // タグ = 円。ここだけタグの色そのものが出る。
    case "tag":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}

export function ComposerToolbar({ open, filled, onOpen, on, off }: {
  /** いま開いているポップオーバー。 */
  open: ToolKey | null;
  /** 値が入っている項目。 */
  filled: Record<ToolKey, boolean>;
  onOpen: (k: ToolKey) => void;
  /** 灯っているときの色(タグの色) / 沈んでいるときの色。 */
  on: string;
  off: string;
}) {
  const keys: ToolKey[] = ["due", "context", "belongings", "weight", "tag"];
  return (
    <div style={{ display: "flex", alignItems: "stretch" }}>
      {keys.map((k) => {
        const lit = filled[k] || open === k;
        return (
          <button
            key={k}
            onClick={() => { haptic(6); onOpen(k); }}
            aria-label={TOOL_LABEL[k]}
            aria-pressed={open === k}
            style={{
              flex: 1, height: 52, border: "none", cursor: "pointer", padding: 0,
              background: open === k ? "rgba(250,250,249,0.10)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Glyph name={k} c={lit ? on : off} />
          </button>
        );
      })}
    </div>
  );
}
