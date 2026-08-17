"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CAP } from "@/components/tasks/Popover";
import { PAPER, RUST, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";

// ★日程の入力(2026-08-17にユーザー指定・参照画像=TickTick)。
//
//   ✕      [ 期日 | 期間 ]      ✓
//   ── 期日 … カレンダーで1日 ＋ 時刻(押すとダイアルが浮く / ✕で終日)
//   ── 期間 … 「終日」のスイッチ
//        終日ON  … [開始][終了] の2枚。押すとカレンダーが浮く
//        終日OFF … [期日][時刻] の2枚。時刻は開始〜終了の2つ
//   クリア … 全部消す
//
// ★モードは値から決まる(状態を二重に持たない)。
//   endDate か endTime があれば「期間」、無ければ「期日」。
// ★大きさ(切迫度)に効くのは dueDate だけ。他は表示のため。
//
// ★カレンダー・ダイアルは**このシートの上に浮かせる**(新しい
// ポップオーバーを重ねない)。キーボードは出したままにする。

export interface WhenValue {
  dueDate?: string;
  endDate?: string;
  dueTime?: string;
  endTime?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : null);
const WD = ["日", "月", "火", "水", "木", "金", "土"];

/** 「8月17日, 月」。 */
function label(iso?: string): string {
  const d = parse(iso);
  return d ? `${d.getMonth() + 1}月${d.getDate()}日, ${WD[d.getDay()]}` : "—";
}

/** 何日ぶんか。 */
function span(a?: string, b?: string): string {
  const x = parse(a), y = parse(b ?? a);
  if (!x || !y) return "";
  return `期間: ${Math.round((+y - +x) / 86400000) + 1} 日`;
}

const ON_G = PAPER;
const DIM = "rgba(250,250,249,0.44)";
const CELL = "rgba(250,250,249,0.07)";
const FLOAT = "#3B3B36";

export function WhenSheet({ value, maxHeight, onChange }: {
  value: WhenValue;
  /** 使える高さ(px)。キーボードを出したままでも収まるよう呼び側が測って渡す。 */
  maxHeight: number;
  onChange: (v: WhenValue) => void;
}) {
  const isRange = !!value.endDate || !!value.endTime;
  const allDay = !value.dueTime;
  /** いま浮かせているもの。 */
  const [pop, setPop] = useState<null | "cal-due" | "cal-start" | "cal-end" | "time">(null);
  /** 時刻のダイアルで、開始と終了のどちらを触っているか。 */
  const [edge, setEdge] = useState<"start" | "end">("start");

  const today = ymd(new Date());
  const set = (p: WhenValue) => onChange({ ...value, ...p });

  /** 期日 ⇄ 期間 の切り替え。値の形も一緒に整える。 */
  const toRange = (on: boolean) => {
    haptic(6);
    setPop(null);
    if (on) {
      const start = value.dueDate ?? today;
      set({ dueDate: start, endDate: value.dueTime ? undefined : (value.endDate ?? start),
        dueTime: value.dueTime, endTime: value.dueTime ? (value.endTime ?? addHour(value.dueTime)) : undefined });
    } else {
      set({ dueDate: value.dueDate ?? today, endDate: undefined, dueTime: value.dueTime, endTime: undefined });
    }
  };

  /** 期間のときの「終日」。 */
  const toAllDay = (on: boolean) => {
    haptic(6);
    setPop(null);
    const start = value.dueDate ?? today;
    if (on) set({ dueDate: start, endDate: value.endDate ?? start, dueTime: undefined, endTime: undefined });
    else set({ dueDate: start, endDate: undefined, dueTime: "09:00", endTime: "10:00" });
  };

  return (
    <div style={{ maxHeight, overflowY: "auto", position: "relative" }}>
      {/* ── 期日 / 期間 ── */}
      <div style={{
        display: "flex", padding: 3, borderRadius: 999, background: CELL, marginBottom: 12,
      }}>
        {[["期日", false], ["期間", true]].map(([t, on]) => (
          <button key={String(t)} onClick={() => toRange(on as boolean)}
            aria-label={t as string} aria-pressed={isRange === on}
            className="tc-lamp" style={{
              flex: 1, height: 32, borderRadius: 999, border: "none", cursor: "pointer",
              background: isRange === on ? "rgba(250,250,249,0.16)" : "transparent",
              ...CAP, fontSize: 11, letterSpacing: "0.12em",
              color: isRange === on ? ON_G : DIM,
            }}>{t as string}</button>
        ))}
      </div>

      {!isRange ? (
        <>
          <MonthGrid
            selected={value.dueDate}
            onPick={(iso) => { haptic(6); set({ dueDate: iso }); }}
          />
          <Row label="時刻" value={value.dueTime}
            onOpen={() => { setEdge("start"); setPop(pop === "time" ? null : "time"); }}
            onClear={value.dueTime ? () => set({ dueTime: undefined, endTime: undefined }) : undefined}
          />
        </>
      ) : (
        <>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            height: 46, padding: "0 14px", borderRadius: 16, background: CELL, marginBottom: 8,
          }}>
            <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: ON_G }}>終日</span>
            <Switch on={allDay} onToggle={() => toAllDay(!allDay)} />
          </div>
          {allDay ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Card title="開始" aria="開始日を選ぶ" main={label(value.dueDate)} sub={value.dueDate === today ? "今日" : ""}
                open={pop === "cal-start"} onOpen={() => setPop(pop === "cal-start" ? null : "cal-start")} />
              <Card title="終了" aria="終了日を選ぶ" main={label(value.endDate ?? value.dueDate)} sub={span(value.dueDate, value.endDate)}
                open={pop === "cal-end"} onOpen={() => setPop(pop === "cal-end" ? null : "cal-end")} />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <Card title="期日" aria="期日を選ぶ" main={label(value.dueDate)} sub={value.dueDate === today ? "今日" : ""}
                open={pop === "cal-due"} onOpen={() => setPop(pop === "cal-due" ? null : "cal-due")} />
              <Card title="時刻" aria="時刻を選ぶ" main={`${value.dueTime ?? "--:--"} - ${value.endTime ?? "--:--"}`}
                sub={hours(value.dueTime, value.endTime)}
                open={pop === "time"} onOpen={() => { setEdge("start"); setPop(pop === "time" ? null : "time"); }} />
            </div>
          )}
        </>
      )}

      <button onClick={() => { haptic(8); setPop(null); onChange({}); }} style={{
        marginTop: 12, width: "100%", height: 38, borderRadius: 999, border: "none",
        background: "transparent", cursor: "pointer",
        ...CAP, fontSize: 10.5, color: RUST,
      }}>クリア</button>

      {/* ── 浮かせるもの ── */}
      {pop?.startsWith("cal-") && (
        <Float onClose={() => setPop(null)}>
          <MonthGrid
            selected={pop === "cal-end" ? (value.endDate ?? value.dueDate) : value.dueDate}
            onPick={(iso) => {
              haptic(6);
              if (pop === "cal-end") {
                const start = value.dueDate ?? today;
                set(iso < start ? { dueDate: iso, endDate: start } : { endDate: iso });
              } else {
                const end = value.endDate;
                set(end && iso > end ? { dueDate: end, endDate: iso } : { dueDate: iso });
              }
              setPop(null);
            }}
          />
        </Float>
      )}
      {pop === "time" && (
        <Float onClose={() => setPop(null)}>
          {isRange && !allDay && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {[["start", "開始"], ["end", "終了"]].map(([k, t]) => (
                <button key={k} onClick={() => setEdge(k as "start" | "end")}
                  aria-label={t as string} aria-pressed={edge === k}
                  style={{
                    flex: 1, height: 30, borderRadius: 999, border: "none", cursor: "pointer",
                    background: edge === k ? "rgba(250,250,249,0.18)" : "transparent",
                    ...CAP, fontSize: 10, color: edge === k ? ON_G : DIM,
                  }}>{t as string}</button>
              ))}
            </div>
          )}
          <Dial
            value={(edge === "end" ? value.endTime : value.dueTime) ?? "09:00"}
            onChange={(t) => {
              if (!isRange) return set({ dueTime: t });
              if (edge === "end") return set({ endTime: t, dueTime: value.dueTime ?? "09:00" });
              set({ dueTime: t, endTime: value.endTime ?? addHour(t) });
            }}
          />
        </Float>
      )}
    </div>
  );
}

const addHour = (t: string) => `${pad((Number(t.slice(0, 2)) + 1) % 24)}:${t.slice(3)}`;

function hours(a?: string, b?: string): string {
  if (!a || !b) return "";
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const d = (m(b) - m(a) + 1440) % 1440;
  return `期間: ${d % 60 === 0 ? `${d / 60} 時` : `${Math.floor(d / 60)}:${pad(d % 60)}`}`;
}

/** 浮かせる小さな面。外をつつくと閉じる。 */
function Float({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div aria-hidden onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 4 }} />
      <div className="tc-pop-in" style={{
        position: "absolute", left: 0, right: 0, top: 46, zIndex: 5,
        background: FLOAT, borderRadius: 18, padding: 12,
        boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
      }}>{children}</div>
    </>
  );
}

/** 期間のときの2枚のカード。 */
function Card({ title, aria, main, sub, open, onOpen }: {
  title: string; aria: string; main: string; sub: string; open: boolean; onOpen: () => void;
}) {
  return (
    <button onClick={onOpen} aria-label={aria} aria-pressed={open} className="tc-lamp" style={{
      flex: 1, minWidth: 0, textAlign: "left", border: "none", cursor: "pointer",
      borderRadius: 16, padding: "10px 12px",
      background: open ? "rgba(250,250,249,0.16)" : CELL,
    }}>
      <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, color: DIM, marginBottom: 3 }}>{title}</div>
      <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: ON_G, whiteSpace: "nowrap" }}>{main}</div>
      <div style={{ fontFamily: SANS, fontSize: 10.5, color: DIM, marginTop: 2, minHeight: 13 }}>{sub}</div>
    </button>
  );
}

/** 期日のときの「時刻」の行。値と ✕。 */
function Row({ label: t, value, onOpen, onClear }: {
  label: string; value?: string; onOpen: () => void; onClear?: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", height: 44, borderRadius: 16, background: CELL, marginTop: 8,
    }}>
      <button onClick={onOpen} aria-label={t} className="tc-lamp" style={{
        flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        border: "none", background: "transparent", cursor: "pointer", padding: "0 6px 0 14px", borderRadius: 16,
      }}>
        <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: ON_G }}>{t}</span>
        <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: value ? ON_G : DIM }}>
          {value ?? "終日"}
        </span>
      </button>
      <button onClick={onClear} disabled={!onClear} aria-label={`${t}を消す`} style={{
        width: 38, height: "100%", border: "none", background: "transparent",
        cursor: onClear ? "pointer" : "default", position: "relative", opacity: onClear ? 1 : 0.25,
      }}>
        <span style={{ position: "absolute", left: 13, top: 21, width: 12, height: 1.5, background: DIM, transform: "rotate(45deg)" }} />
        <span style={{ position: "absolute", left: 13, top: 21, width: 12, height: 1.5, background: DIM, transform: "rotate(-45deg)" }} />
      </button>
    </div>
  );
}

/** 終日のスイッチ。丸が左右へ動くだけ。 */
function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} role="switch" aria-checked={on} aria-label="終日" style={{
      width: 48, height: 28, borderRadius: 999, border: "none", cursor: "pointer", padding: 3,
      background: on ? PAPER : "rgba(250,250,249,0.20)",
      transition: "background-color 180ms ease",
    }}>
      <span style={{
        display: "block", width: 22, height: 22, borderRadius: "50%",
        background: on ? "#2A2A28" : PAPER,
        transform: `translateX(${on ? 20 : 0}px)`,
        transition: "transform 200ms cubic-bezier(0.16,1,0.3,1), background-color 180ms ease",
      }} />
    </button>
  );
}

// ── カレンダー ──────────────────────────────────────────────
// ★月送りは**面ごと滑らせる**(2026-08-17にユーザー指摘)。前月・当月・翌月を
// 横に並べ、指を追って translateX し、離したら隣まで送る。送り終わったら
// transition を切って中央へ戻す(`.app-track` と同じ手)。
// 以前は月の数字だけ差し替わっていて、変わったことに気づけなかった。

const SWIPE = 40;

function MonthGrid({ selected, onPick }: { selected?: string; onPick: (iso: string) => void }) {
  const base = parse(selected) ?? new Date();
  const [cursor, setCursor] = useState({ y: base.getFullYear(), m: base.getMonth() });
  const [dx, setDx] = useState(0);
  const [slide, setSlide] = useState<-1 | 0 | 1>(0);
  const dragRef = useRef<{ id: number; x: number } | null>(null);
  const wRef = useRef<HTMLDivElement | null>(null);
  // ★隣の月は**触られるまで作らない**。3か月ぶんを最初から並べると、
  // 開いた瞬間のレイアウトと描画で 200ms 級のひっかかりが出た(4×絞りで実測
  // 856ms)。指を置いた時点で用意すれば、開くのは1か月ぶんの値段で済む。
  const [live, setLive] = useState(false);

  const step = (d: -1 | 1) => {
    haptic(6);
    setLive(true);
    setSlide(d);
    // 送り終わってから、transition を切って中央へ戻す。
    window.setTimeout(() => {
      const n = new Date(cursor.y, cursor.m + d, 1);
      setCursor({ y: n.getFullYear(), m: n.getMonth() });
      setSlide(0);
    }, 260);
  };

  const onDown = (e: React.PointerEvent) => {
    setLive(true);
    dragRef.current = { id: e.pointerId, x: e.clientX };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    setDx(e.clientX - d.x);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    const moved = e.clientX - d.x;
    setDx(0);
    if (Math.abs(moved) > SWIPE) step(moved < 0 ? 1 : -1);
  };

  const months = useMemo(() => (live ? [-1, 0, 1] : [0]).map((k) => {
    const d = new Date(cursor.y, cursor.m + k, 1);
    return { y: d.getFullYear(), m: d.getMonth(), self: k === 0 };
  }), [cursor, live]);

  const w = wRef.current?.clientWidth ?? 0;
  const shift = live ? -w + dx - slide * w : 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <Arrow dir={-1} onClick={() => step(-1)} />
        <span style={{ ...CAP, fontSize: 12, letterSpacing: "0.14em", color: ON_G }}>
          {cursor.y} / {pad(cursor.m + 1)}
        </span>
        <Arrow dir={1} onClick={() => step(1)} />
      </div>
      <div ref={wRef}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ overflow: "hidden", touchAction: "pan-y" }}>
        <div style={{
          display: "flex", width: live ? "300%" : "100%",
          transform: `translateX(${shift}px)`,
          transition: dragRef.current ? "none" : "transform 260ms cubic-bezier(0.16,1,0.3,1)",
        }}>
          {months.map((mm) => (
            <div key={`${mm.y}-${mm.m}`} style={{ width: live ? (w || "33.3333%") : "100%", flexShrink: 0 }}>
              {/* ★隣の月は**押せない**ので、button ではなく span で軽く描く。
                  3か月ぶんを全部 button にすると 126 個になり、開いた瞬間の
                  レイアウトで 200ms 級のひっかかりが出た(実測)。 */}
              <Days y={mm.y} m={mm.m} selected={selected} onPick={onPick} flat={!mm.self} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Days({ y, m, selected, onPick, flat }: {
  y: number; m: number; selected?: string; onPick: (iso: string) => void;
  /** 隣の月。押せないので軽い描き方にする。 */
  flat?: boolean;
}) {
  const today = ymd(new Date());
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: new Date(y, m, 1).getDay() }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
      {["S", "M", "T", "W", "T", "F", "S"].map((wd, i) => (
        <span key={i} style={{ ...CAP, fontSize: 8.5, color: DIM, textAlign: "center", paddingBottom: 2 }}>{wd}</span>
      ))}
      {cells.map((d, i) => {
        if (d === null) return <span key={i} />;
        const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
        const on = iso === selected;
        const cell: React.CSSProperties = {
          width: 30, height: 30, borderRadius: "50%", border: "none", padding: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: on ? PAPER : "transparent",
          boxShadow: !on && iso === today ? `inset 0 0 0 1.5px ${RUST}` : "none",
          color: on ? "#2A2A28" : ON_G,
          fontFamily: SANS, fontSize: 12.5, fontWeight: on ? 700 : 500,
        };
        return (
          <span key={i} style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 32 }}>
            {flat
              ? <span aria-hidden style={cell}>{d}</span>
              : (
                <button onClick={() => onPick(iso)} aria-label={`${m + 1}月${d}日`} aria-pressed={on}
                  className="tc-lamp" style={{ ...cell, cursor: "pointer" }}>{d}</button>
              )}
          </span>
        );
      })}
    </div>
  );
}

function Arrow({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={dir < 0 ? "前の月" : "次の月"} className="tc-lamp" style={{
      width: 32, height: 30, borderRadius: "50%", border: "none", background: "transparent",
      cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{
        width: 0, height: 0,
        borderTop: "5.5px solid transparent", borderBottom: "5.5px solid transparent",
        borderRight: dir < 0 ? `7px solid ${ON_G}` : undefined,
        borderLeft: dir > 0 ? `7px solid ${ON_G}` : undefined,
      }} />
    </button>
  );
}

// ── 時刻のダイアル ──────────────────────────────────────────
// 時 / 分 の2列。`scroll-snap` で1つずつ止まるので、外部ライブラリは不要。
// 中央のハイライトが「いま選んでいる値」。

const ITEM_H = 34;

function Dial({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const h = Number(value.slice(0, 2));
  const m = Number(value.slice(3));
  return (
    <div style={{ position: "relative", display: "flex", gap: 8 }}>
      {/* 中央のハイライト。列の裏に敷く。 */}
      <span aria-hidden style={{
        position: "absolute", left: 0, right: 0, top: ITEM_H, height: ITEM_H,
        borderRadius: 12, background: "rgba(250,250,249,0.12)", pointerEvents: "none",
      }} />
      <Column values={Array.from({ length: 24 }, (_, i) => pad(i))} value={pad(h)}
        unit="時" onPick={(v) => onChange(`${v}:${pad(m)}`)} />
      <Column values={Array.from({ length: 12 }, (_, i) => pad(i * 5))} value={pad(m - (m % 5))}
        unit="分" onPick={(v) => onChange(`${pad(h)}:${v}`)} />
    </div>
  );
}

function Column({ values, value, unit, onPick }: {
  values: string[]; value: string; unit: string; onPick: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // 開いたとき、いまの値を中央へ。
  useEffect(() => {
    const el = ref.current;
    const i = values.indexOf(value);
    if (el && i >= 0) el.scrollTop = i * ITEM_H;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={ref} style={{
      flex: 1, height: ITEM_H * 3, overflowY: "auto", scrollSnapType: "y mandatory",
      padding: `${ITEM_H}px 0`, scrollbarWidth: "none",
    }}>
      {values.map((v) => (
        <button key={v} onClick={() => { haptic(4); onPick(v); }}
          aria-label={`${Number(v)}${unit}`} aria-pressed={v === value}
          style={{
            display: "block", width: "100%", height: ITEM_H, border: "none", background: "transparent",
            cursor: "pointer", scrollSnapAlign: "center",
            fontFamily: SANS, fontSize: v === value ? 19 : 16,
            fontWeight: v === value ? 700 : 500,
            color: v === value ? ON_G : DIM,
          }}>{v}</button>
      ))}
    </div>
  );
}
