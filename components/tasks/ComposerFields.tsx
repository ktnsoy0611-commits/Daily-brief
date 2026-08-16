"use client";

import { useEffect, useRef, useState } from "react";
import { CAP } from "@/components/tasks/Popover";
import { INK, MUTED, PAPER, RUST, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { TASK_TAGS, tagInk } from "@/lib/taskTags";
import type { TaskTag, TaskWeight } from "@/lib/types";

// ★入力画面(TaskComposer)のポップオーバーの中身。どれも
// 「ベタ塗りの矩形と直線」だけで作る(OS標準のカレンダー・ドロップダウン・
// 角丸ボタン・影は使わない)。値はその場で親の下書きへ書き、確定ボタンは
// 持たない(閉じれば確定している)。

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 期日。月送りの見出し + 7列の方眼。今日は赤の枠、選んだ日はベタ塗り。 */
export function Calendar({ value, onPick }: {
  value?: string;
  onPick: (v: string | undefined) => void;
}) {
  const today = new Date();
  const base = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : today;
  const [cursor, setCursor] = useState({ y: base.getFullYear(), m: base.getMonth() });

  const first = new Date(cursor.y, cursor.m, 1);
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const lead = first.getDay();
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const step = (d: number) => {
    const n = new Date(cursor.y, cursor.m + d, 1);
    setCursor({ y: n.getFullYear(), m: n.getMonth() });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
        <Arrow dir={-1} onClick={() => step(-1)} />
        <span style={{ ...CAP, fontSize: 12, letterSpacing: "0.14em", color: INK }}>
          {cursor.y} / {pad(cursor.m + 1)}
        </span>
        <Arrow dir={1} onClick={() => step(1)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
          <span key={i} style={{ ...CAP, fontSize: 8.5, color: MUTED, textAlign: "center", paddingBottom: 3 }}>{w}</span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={i} />;
          const iso = `${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`;
          const on = iso === value;
          const isToday = iso === ymd(today);
          return (
            <button
              key={i}
              onClick={() => { haptic(6); onPick(on ? undefined : iso); }}
              aria-label={`${cursor.m + 1}月${d}日`}
              aria-pressed={on}
              style={{
                aspectRatio: "1 / 1", border: "none", cursor: "pointer", padding: 0,
                background: on ? INK : "transparent",
                boxShadow: !on && isToday ? `inset 0 0 0 1.5px ${RUST}` : "none",
                color: on ? PAPER : INK,
                fontFamily: SANS, fontSize: 13, fontWeight: on ? 700 : 500,
              }}
            >{d}</button>
          );
        })}
      </div>

      <button onClick={() => { haptic(6); onPick(undefined); }} style={{
        marginTop: 10, width: "100%", height: 38, border: "none", cursor: "pointer",
        background: "transparent", boxShadow: `inset 0 0 0 1.5px ${MUTED}`,
        ...CAP, fontSize: 10, color: MUTED,
      }}>NO DATE</button>
    </div>
  );
}

/** 月送りの三角。線ではなく面で描く。 */
function Arrow({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={dir < 0 ? "前の月" : "次の月"} style={{
      width: 34, height: 30, border: "none", background: "transparent", cursor: "pointer", padding: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{
        width: 0, height: 0,
        borderTop: "6px solid transparent", borderBottom: "6px solid transparent",
        borderRight: dir < 0 ? `8px solid ${INK}` : undefined,
        borderLeft: dir > 0 ? `8px solid ${INK}` : undefined,
      }} />
    </button>
  );
}

/** 重要度。四角の大きさがそのまま段を表す。 */
export function WeightPicker({ value, onPick }: {
  value: TaskWeight;
  onPick: (w: TaskWeight) => void;
}) {
  const steps: { w: TaskWeight; label: string; size: number }[] = [
    { w: 1, label: "低", size: 16 },
    { w: 2, label: "中", size: 26 },
    { w: 3, label: "高", size: 38 },
  ];
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {steps.map((s) => {
        const on = s.w === value;
        return (
          <button key={s.w} onClick={() => { haptic(6); onPick(s.w); }} aria-pressed={on}
            aria-label={`重要度 ${s.label}`}
            style={{
              flex: 1, height: 76, border: "none", cursor: "pointer",
              background: on ? INK : "transparent",
              boxShadow: on ? "none" : `inset 0 0 0 1.5px ${MUTED}`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            <span style={{ width: s.size, height: s.size, background: on ? PAPER : INK }} />
            <span style={{ ...CAP, fontSize: 9.5, letterSpacing: "0.1em", color: on ? PAPER : MUTED }}>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** タグ。5色のベタ塗りを並べ、その組の文字色で英字を載せる。 */
export function TagPicker({ value, onPick }: {
  value: TaskTag;
  onPick: (t: TaskTag) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {TASK_TAGS.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} onClick={() => { haptic(6); onPick(t.id); }} aria-pressed={on}
            aria-label={t.label}
            style={{
              height: 40, border: "none", cursor: "pointer", background: t.color,
              boxShadow: on ? `inset 0 0 0 3px ${INK}` : "none",
              display: "flex", alignItems: "center", padding: "0 12px",
              ...CAP, fontSize: 11, color: tagInk(t.id),
            }}>{t.label}</button>
        );
      })}
    </div>
  );
}

/** メモ・持ち物。枠は持たず、下に1本の直線だけ引く。 */
export function TextField({ value, multiline, placeholder, onChange }: {
  value: string;
  multiline?: boolean;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={multiline ? 4 : 1}
      placeholder={placeholder}
      onChange={(e) => onChange(multiline ? e.target.value : e.target.value.replace(/\n/g, ""))}
      style={{
        width: "100%", background: "transparent", border: "none", outline: "none", resize: "none",
        borderBottom: `1.5px solid ${INK}`, borderRadius: 0,
        fontFamily: SANS, fontSize: 16, fontWeight: 600, lineHeight: 1.5, color: INK,
        padding: "0 0 7px",
      }}
    />
  );
}
