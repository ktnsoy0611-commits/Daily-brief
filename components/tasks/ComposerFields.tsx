"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import { useEffect, useRef } from "react";
import { Press } from "@/components/Button";
import { CAP, DIM, LIFT } from "@/components/tasks/Popover";
import { PAPER, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import type { TaskWeight } from "@/lib/types";

// ★入力画面(TaskComposer)のポップオーバーの中身(重要度 / テキスト)。
// ★★★**タグは第93巡に廃止**（塗り／輪郭が日付の有無を言うので、選ぶものが無い）。
// 日程は components/tasks/WhenSheet.tsx が持つ。
// ★見た目はアプリの他の画面に揃える(2026-08-16にユーザー指定) — 円と角丸。
// ★地は**墨**(2026-08-17にユーザー確定)。器と同じ暗い面の続きにする。
// 値はその場で親の下書きへ書き、確定ボタンは持たない(閉じれば確定している)。

/** 墨の上の面。 */
const CELL = "rgba(250,250,249,0.08)";

/** 重要度。**円の大きさ**がそのまま段を表す。 */
export function WeightPicker({ value, onPick }: {
  value: TaskWeight;
  onPick: (w: TaskWeight) => void;
}) {
  const steps: { w: TaskWeight; label: string; size: number }[] = [
    { w: 1, label: "低", size: 16 },
    { w: 2, label: "中", size: 28 },
    { w: 3, label: "大", size: 42 },
  ];
  return (
    <div style={{ display: "flex", gap: SPACE.sm }}>
      {steps.map((s) => {
        const on = s.w === value;
        return (
          <Press key={s.w} onPress={() => { haptic(6); onPick(s.w); }} aria-pressed={on}
            aria-label={`重要度 ${s.label}`}
            className="tc-lamp"
            style={{
              flex: 1, height: 76, borderRadius: RADIUS.xl,
              background: on ? PAPER : CELL,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SPACE.sm,
            }}>
            <span style={{ width: s.size, height: s.size, borderRadius: RADIUS.circle, background: on ? LIFT : PAPER }} />
            <span style={{ ...CAP, fontSize: TYPE.micro, fontWeight: WEIGHT.text, letterSpacing: TRACK.caps, color: on ? LIFT : DIM }}>{s.label}</span>
          </Press>
        );
      })}
    </div>
  );
}

/** メモ・持ち物。角丸の器に置く(枠線は持たせない)。 */
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
      rows={multiline ? 3 : 1}
      placeholder={placeholder}
      onChange={(e) => onChange(multiline ? e.target.value : e.target.value.replace(/\n/g, ""))}
      style={{
        width: "100%", background: CELL, border: "none", outline: "none", resize: "none",
        borderRadius: RADIUS.xl, padding: `${SPACE.md}px ${SPACE.lg}px`,
        fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.bold, lineHeight: LEAD.body, color: PAPER,
        caretColor: PAPER,
      }}
    />
  );
}
