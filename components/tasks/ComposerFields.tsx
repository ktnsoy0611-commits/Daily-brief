"use client";

import { useEffect, useRef, useState } from "react";
import { CAP } from "@/components/tasks/Popover";
import { INK, MUTED, PAPER, RUST, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { TASK_TAGS, tagInk } from "@/lib/taskTags";
import type { TaskTag, TaskWeight } from "@/lib/types";

// ★入力画面(TaskComposer)のポップオーバーの中身。
// ★見た目はアプリの他の画面に揃える(2026-08-16にユーザー指定) —
// 円と角丸。以前の「角を立てた矩形だけ」は、タブバーのピルや丸ボタン、
// 角丸22のカードから浮いていた。
// 値はその場で親の下書きへ書き、確定ボタンは持たない(閉じれば確定している)。

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 月送りをスワイプで決める閾値(px)。 */
const SWIPE = 44;

/**
 * 期日。日は円。今日は輪、選んだ日はベタ塗り。**横スワイプで月送り**。
 *
 * ★**期間と時刻**を持つ(2026-08-17にユーザー指定):
 *   1回目のタップ = 開始日(dueDate)
 *   別の日をタップ = そこまでが期間(endDate)。開始より前なら入れ替える
 *   同じ日を再タップ = 解除
 *   時刻 = 「終日 / 時刻」の切り替えと、時・分のチップ(dueTime)
 * ★大きさ(切迫度)に効くのは dueDate だけ。endDate と dueTime は表示のため。
 */
export function Calendar({ value, end, time, onPick }: {
  value?: string;
  end?: string;
  time?: string;
  onPick: (v: { dueDate?: string; endDate?: string; dueTime?: string }) => void;
}) {
  const today = new Date();
  const base = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : today;
  const [cursor, setCursor] = useState({ y: base.getFullYear(), m: base.getMonth() });
  const [dx, setDx] = useState(0);
  const dragRef = useRef<{ id: number; x: number } | null>(null);

  const step = (d: number) => {
    haptic(6);
    const n = new Date(cursor.y, cursor.m + d, 1);
    setCursor({ y: n.getFullYear(), m: n.getMonth() });
  };

  // ★指で追う。輪(DriftTab)と同じで、離した瞬間に1ヶ月ぶん送る。
  const onDown = (e: React.PointerEvent) => { dragRef.current = { id: e.pointerId, x: e.clientX }; };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    setDx((e.clientX - d.x) * 0.4);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    const moved = e.clientX - d.x;
    setDx(0);
    if (Math.abs(moved) > SWIPE) step(moved < 0 ? 1 : -1);
  };

  /** 日をタップしたとき。1つ目=開始 / 2つ目=期間 / 同じ日=解除。 */
  const tap = (iso: string) => {
    haptic(6);
    if (iso === value && !end) return onPick({ dueDate: undefined, endDate: undefined, dueTime: undefined });
    if (!value || end) return onPick({ dueDate: iso, endDate: undefined, dueTime: time });
    if (iso === value) return onPick({ dueDate: iso, endDate: undefined, dueTime: time });
    const [a, b] = iso < value ? [iso, value] : [value, iso];
    onPick({ dueDate: a, endDate: b, dueTime: time });
  };

  const first = new Date(cursor.y, cursor.m, 1);
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <Arrow dir={-1} onClick={() => step(-1)} />
        <span style={{ ...CAP, fontSize: 12, letterSpacing: "0.14em", color: INK }}>
          {cursor.y} / {pad(cursor.m + 1)}
        </span>
        <Arrow dir={1} onClick={() => step(1)} />
      </div>

      <div
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ touchAction: "pan-y", overflow: "hidden" }}
      >
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
          transform: `translateX(${dx}px)`,
          transition: dragRef.current ? "none" : "transform 260ms cubic-bezier(0.16,1,0.3,1)",
        }}>
          {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
            <span key={i} style={{ ...CAP, fontSize: 8.5, color: MUTED, textAlign: "center", paddingBottom: 2 }}>{w}</span>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <span key={i} />;
            const iso = `${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`;
            const isStart = iso === value;
            const isEnd = !!end && iso === end;
            const inRange = !!value && !!end && iso > value && iso < end;
            const on = isStart || isEnd;
            const isToday = iso === ymd(today);
            return (
              // 期間は帯で塗る。両端の丸と地続きに見えるよう、帯は角を丸めない。
              <span key={i} style={{
                display: "flex", justifyContent: "center", alignItems: "center", height: 34,
                background: inRange ? "rgba(26,26,24,0.08)" : "transparent",
                borderRadius: inRange ? 0 : undefined,
              }}>
                <button
                  onClick={() => tap(iso)}
                  aria-label={`${cursor.m + 1}月${d}日`}
                  aria-pressed={on}
                  className="tc-lamp"
                  style={{
                    width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0,
                    background: on ? INK : "transparent",
                    boxShadow: !on && isToday ? `inset 0 0 0 1.5px ${RUST}` : "none",
                    color: on ? PAPER : INK,
                    fontFamily: SANS, fontSize: 13, fontWeight: on ? 700 : 500,
                  }}
                >{d}</button>
              </span>
            );
          })}
        </div>
      </div>

      {/* 時刻。終日と切り替え、時と分をチップで選ぶ。 */}
      <TimeRow
        value={time}
        disabled={!value}
        onChange={(t) => onPick({ dueDate: value, endDate: end, dueTime: t })}
      />

      <button onClick={() => { haptic(6); onPick({ dueDate: undefined, endDate: undefined, dueTime: undefined }); }}
        style={{
          marginTop: 6, width: "100%", height: 36, borderRadius: 999, border: "none", cursor: "pointer",
          background: value ? "rgba(26,26,24,0.06)" : "transparent",
          boxShadow: value ? "none" : `inset 0 0 0 1.5px rgba(26,26,24,0.14)`,
          ...CAP, fontSize: 10, color: MUTED,
        }}>NO DATE</button>
    </div>
  );
}

/** 時刻。「終日」と、時・分のチップの列。横に送って選ぶ。 */
function TimeRow({ value, disabled, onChange }: {
  value?: string;
  disabled: boolean;
  onChange: (t: string | undefined) => void;
}) {
  const [h, m] = (value ?? "09:00").split(":");
  const chip = (on: boolean): React.CSSProperties => ({
    flexShrink: 0, height: 30, minWidth: 34, padding: "0 9px", borderRadius: 999, border: "none",
    cursor: "pointer", background: on ? INK : "rgba(26,26,24,0.06)", color: on ? PAPER : INK,
    fontFamily: SANS, fontSize: 12.5, fontWeight: on ? 700 : 500,
  });
  return (
    <div style={{ marginTop: 8, opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <button onClick={() => { haptic(6); onChange(undefined); }} className="tc-lamp"
          aria-label="終日" aria-pressed={!value} style={{ ...chip(!value), flex: 1 }}>終日</button>
        <button onClick={() => { haptic(6); onChange(value ?? "09:00"); }} className="tc-lamp"
          aria-label="時刻を指定" aria-pressed={!!value} style={{ ...chip(!!value), flex: 1 }}>
          {value ?? "時刻"}
        </button>
      </div>
      {!!value && (
        <>
          <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 5 }}>
            {Array.from({ length: 24 }, (_, i) => pad(i)).map((hh) => (
              <button key={hh} onClick={() => onChange(`${hh}:${m}`)} aria-label={`${Number(hh)}時`}
                style={chip(hh === h)}>{Number(hh)}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {["00", "10", "20", "30", "40", "50"].map((mm) => (
              <button key={mm} onClick={() => onChange(`${h}:${mm}`)} aria-label={`${Number(mm)}分`}
                style={{ ...chip(mm === m), flex: 1 }}>{mm}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** 月送りの三角。線ではなく面で描く。 */
function Arrow({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={dir < 0 ? "前の月" : "次の月"} className="tc-lamp" style={{
      width: 34, height: 34, borderRadius: "50%", border: "none", background: "transparent",
      cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
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
    <div style={{ display: "flex", gap: 8 }}>
      {steps.map((s) => {
        const on = s.w === value;
        return (
          <button key={s.w} onClick={() => { haptic(6); onPick(s.w); }} aria-pressed={on}
            aria-label={`重要度 ${s.label}`}
            className="tc-lamp"
            style={{
              flex: 1, height: 84, borderRadius: 18, border: "none", cursor: "pointer",
              background: on ? INK : "rgba(26,26,24,0.05)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            <span style={{ width: s.size, height: s.size, borderRadius: "50%", background: on ? PAPER : INK }} />
            <span style={{ ...CAP, fontSize: 9.5, letterSpacing: "0.1em", color: on ? PAPER : MUTED }}>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** タグ。**色の円**を横に5つ。選んだものだけ名前が出る。 */
export function TagPicker({ value, onPick }: {
  value: TaskTag;
  onPick: (t: TaskTag) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {TASK_TAGS.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} onClick={() => { haptic(6); onPick(t.id); }} aria-pressed={on}
            aria-label={t.label}
            className="tc-lamp"
            style={{
              flex: on ? 2.2 : 1, height: 56, borderRadius: 999, border: "none", cursor: "pointer",
              background: t.color, padding: 0, overflow: "hidden",
              boxShadow: on ? `0 0 0 2.5px ${PAPER}, 0 0 0 4.5px ${t.color}` : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              ...CAP, fontSize: 9.5, color: tagInk(t.id),
            }}>{on ? t.label : ""}</button>
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
        width: "100%", background: "rgba(26,26,24,0.05)", border: "none", outline: "none", resize: "none",
        borderRadius: 16, padding: "12px 14px",
        fontFamily: SANS, fontSize: 16, fontWeight: 600, lineHeight: 1.5, color: INK,
      }}
    />
  );
}
