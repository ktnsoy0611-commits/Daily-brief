"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CAP, press } from "@/components/tasks/Popover";
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

export function WhenSheet({ value, onChange }: {
  value: WhenValue;
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
    // ★縦スクロールは持たせない(2026-08-17にユーザー指定)。枠(Popover)は
    // 「上のバーの下〜下の帯の上」に固定されているので、中身はそこへ収める。
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* ── 期日 / 期間 ── */}
      <div style={{
        display: "flex", padding: 2, borderRadius: 999, background: CELL, marginBottom: 6, flexShrink: 0,
      }}>
        {[["期日", false], ["期間", true]].map(([t, on]) => (
          <button key={String(t)} {...press(() => toRange(on as boolean))}
            aria-label={t as string} aria-pressed={isRange === on}
            className="tc-lamp" style={{
              flex: 1, height: 28, borderRadius: 999, border: "none", cursor: "pointer",
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
            height: 40, padding: "0 14px", borderRadius: 16, background: CELL, marginBottom: 6, flexShrink: 0,
          }}>
            <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: ON_G }}>終日</span>
            <Switch on={allDay} onToggle={() => toAllDay(!allDay)} />
          </div>
          {allDay ? (
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <Card title="開始" aria="開始日を選ぶ" main={label(value.dueDate)} sub={value.dueDate === today ? "今日" : ""}
                open={pop === "cal-start"} onOpen={() => setPop(pop === "cal-start" ? null : "cal-start")} />
              <Card title="終了" aria="終了日を選ぶ" main={label(value.endDate ?? value.dueDate)} sub={span(value.dueDate, value.endDate)}
                open={pop === "cal-end"} onOpen={() => setPop(pop === "cal-end" ? null : "cal-end")} />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <Card title="期日" aria="期日を選ぶ" main={label(value.dueDate)} sub={value.dueDate === today ? "今日" : ""}
                open={pop === "cal-due"} onOpen={() => setPop(pop === "cal-due" ? null : "cal-due")} />
              <Card title="時刻" aria="時刻を選ぶ" main={`${value.dueTime ?? "--:--"} - ${value.endTime ?? "--:--"}`}
                sub={hours(value.dueTime, value.endTime)}
                open={pop === "time"} onOpen={() => { setEdge("start"); setPop(pop === "time" ? null : "time"); }} />
            </div>
          )}
        </>
      )}

      <button {...press(() => { haptic(8); setPop(null); onChange({}); })} style={{
        marginTop: "auto", flexShrink: 0, width: "100%", height: 30, borderRadius: 999, border: "none",
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
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexShrink: 0 }}>
              {[["start", "開始"], ["end", "終了"]].map(([k, t]) => (
                <button key={k} {...press(() => setEdge(k as "start" | "end"))}
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
      {/* ★高さは中身のぶんだけ。ただし**シートの中に収まる**ところまで
          (`maxHeight`)。溢れそうなときは中のカレンダーが縮む(flex)。
          以前は高さを取り放題で、器が縮むと下が切れて日が押せなかった。 */}
      <div className="tc-pop-in" style={{
        position: "absolute", left: 0, right: 0, top: 42, zIndex: 5,
        maxHeight: "calc(100% - 42px)",
        background: FLOAT, borderRadius: 18, padding: 10,
        boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>{children}</div>
    </>
  );
}

/** 期間のときの2枚のカード。 */
function Card({ title, aria, main, sub, open, onOpen }: {
  title: string; aria: string; main: string; sub: string; open: boolean; onOpen: () => void;
}) {
  return (
    <button {...press(onOpen)} aria-label={aria} aria-pressed={open} className="tc-lamp" style={{
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
      display: "flex", alignItems: "center", height: 40, borderRadius: 16, background: CELL, marginTop: 6, flexShrink: 0,
    }}>
      <button {...press(onOpen)} aria-label={t} className="tc-lamp" style={{
        flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        border: "none", background: "transparent", cursor: "pointer", padding: "0 6px 0 14px", borderRadius: 16,
      }}>
        <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: ON_G }}>{t}</span>
        <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: value ? ON_G : DIM }}>
          {value ?? "終日"}
        </span>
      </button>
      <button {...press(() => onClear?.())} disabled={!onClear} aria-label={`${t}を消す`} style={{
        width: 36, height: "100%", border: "none", background: "transparent",
        cursor: onClear ? "pointer" : "default", position: "relative", opacity: onClear ? 1 : 0.25,
      }}>
        <span style={{ position: "absolute", left: 12, top: 20, width: 12, height: 1.5, background: DIM, transform: "rotate(45deg)" }} />
        <span style={{ position: "absolute", left: 12, top: 20, width: 12, height: 1.5, background: DIM, transform: "rotate(-45deg)" }} />
      </button>
    </div>
  );
}

/** 終日のスイッチ。丸が左右へ動くだけ。 */
function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button {...press(onToggle)} role="switch" aria-checked={on} aria-label="終日" style={{
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
/** 横か縦かを決める距離(px)。 */
const AXIS = 8;
/** 月を送る時間(ms)。 */
const SLIDE_MS = 220;

function MonthGrid({ selected, onPick }: { selected?: string; onPick: (iso: string) => void }) {
  const base = parse(selected) ?? new Date();
  const [cursor, setCursor] = useState({ y: base.getFullYear(), m: base.getMonth() });
  const [dx, setDx] = useState(0);
  const [slide, setSlide] = useState<-1 | 0 | 1>(0);
  /** 送り終わって中央へ戻す1フレームだけ true。transition を切るために使う。 */
  const [snapBack, setSnapBack] = useState(false);
  // ★指が横か縦かを最初の AXIS px で決める。決まるまでは動かさない
  //   (以前は pointerdown した時点で横取りしていたので、縦や斜めでも月が動いた)。
  const dragRef = useRef<{ id: number; x: number; y: number; axis: "" | "x" | "y" } | null>(null);
  const wRef = useRef<HTMLDivElement | null>(null);
  // ★隣の月は**触られるまで作らない**。3か月ぶんを最初から並べると、
  // 開いた瞬間のレイアウトと描画で 200ms 級のひっかかりが出た(4×絞りで実測
  // 856ms)。指を置いた時点で用意すれば、開くのは1か月ぶんの値段で済む。
  const [live, setLive] = useState(false);

  /**
   * 月を1つ送る。★**送ったあとに逆へ戻る動きを出さないこと。**
   * 隣まで滑らせたら、その位置で `cursor` を進めて `slide` を 0 に戻すのだが、
   * transition が生きていると中央へ戻る動き(＝逆走)が見えてしまう
   * (2026-08-17に実機で「スワイプ後に一回逆に動く」と報告された)。
   * 戻す1フレームだけ transition を切り、次のフレームで戻す。
   */
  const step = (d: -1 | 1) => {
    haptic(6);
    setLive(true);
    setSlide(d);
    window.setTimeout(() => {
      const n = new Date(cursor.y, cursor.m + d, 1);
      setSnapBack(true);
      setCursor({ y: n.getFullYear(), m: n.getMonth() });
      setSlide(0);
      requestAnimationFrame(() => requestAnimationFrame(() => setSnapBack(false)));
    }, SLIDE_MS);
  };

  const onDown = (e: React.PointerEvent) => {
    setLive(true);
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: "" };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.axis) {
      // まだ軸が決まっていない。8px 動いた方向で決める。
      if (Math.max(Math.abs(mx), Math.abs(my)) < AXIS) return;
      d.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (d.axis === "y") { dragRef.current = null; return; }  // 縦の指は捨てる
    }
    setDx(mx);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    const moved = d.axis === "x" ? e.clientX - d.x : 0;
    setDx(0);
    if (Math.abs(moved) > SWIPE) step(moved < 0 ? 1 : -1);
  };

  const months = useMemo(() => (live ? [-1, 0, 1] : [0]).map((k) => {
    const d = new Date(cursor.y, cursor.m + k, 1);
    return { y: d.getFullYear(), m: d.getMonth(), self: k === 0 };
  }), [cursor, live]);

  // ★盤の高さは**残った高さに合わせる**(2026-08-17にユーザー指定「入力画面は
  // 全て縦スクロール不要」)。日のマスを 28px 固定にしていたため、キーボードで
  // 器が 470px まで縮んだうえ 6 週ある月では 36px はみ出していた(実測)。
  // 残りを 6 で割った高さに詰め、上限 30px までは伸ばす。
  const [rowH, setRowH] = useState(ROW_MAX);
  useEffect(() => {
    const el = wRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      if (h <= 0) return;
      const n = Math.max(ROW_MIN, Math.min(ROW_MAX, Math.floor(h / WEEKS)));
      setRowH((p) => (p === n ? p : n));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = wRef.current?.clientWidth ?? 0;
  const shift = live ? -w + dx - slide * w : 0;

  return (
    <div style={{
      // ★下限は「月のヘッダー＋曜日＋6週」。これより痩せると最後の週が
      // 切れて日が押せなくなる(overflow:hidden なので気づきにくい)。
      flex: 1, minHeight: HEAD_H + WD_H + ROW_MIN * WEEKS + 2,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2, flexShrink: 0,
      }}>
        <Arrow dir={-1} onClick={() => step(-1)} />
        <span style={{ ...CAP, fontSize: 12, letterSpacing: "0.14em", color: ON_G }}>
          {cursor.y} / {pad(cursor.m + 1)}
        </span>
        <Arrow dir={1} onClick={() => step(1)} />
      </div>
      {/* ★曜日は**送らない**。月ごとに描いていたため、指で送っている途中の
          曜日の並びが「T W T F S S M」のようにずれて見えた(2026-08-17)。 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", flexShrink: 0 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((wd, i) => (
          <span key={i} style={{
            ...CAP, fontSize: 8.5, color: DIM, textAlign: "center", height: WD_H, lineHeight: `${WD_H}px`,
          }}>{wd}</span>
        ))}
      </div>
      <div ref={wRef}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ flex: 1, minHeight: 0, overflow: "hidden", touchAction: "none" }}>
        <div style={{
          display: "flex", width: live ? "300%" : "100%",
          transform: `translateX(${shift}px)`,
          transition: dragRef.current || snapBack
            ? "none"
            : `transform ${SLIDE_MS}ms cubic-bezier(0.22,1,0.36,1)`,
        }}>
          {months.map((mm) => (
            <div key={`${mm.y}-${mm.m}`} style={{ width: live ? (w || "33.3333%") : "100%", flexShrink: 0 }}>
              {/* ★隣の月は**押せない**ので、button ではなく span で軽く描く。
                  3か月ぶんを全部 button にすると 126 個になり、開いた瞬間の
                  レイアウトで 200ms 級のひっかかりが出た(実測)。 */}
              <Days y={mm.y} m={mm.m} selected={selected} onPick={onPick} flat={!mm.self} rowH={rowH} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 月のヘッダー(◀ 2026 / 08 ▶)の高さ ＋ 下の余白。 */
const HEAD_H = 28;
/** 曜日の行の高さ。 */
const WD_H = 13;
/** ★常に6週ぶん描く。月によって5週/6週と変わると、送るたびに盤の高さが
 *  跳ねて、下の時刻の行まで動いてしまう。 */
const WEEKS = 6;
/** 1週の高さの下限。iPhone SE 級(キーボードを出すと器が 440px)でも
 *  最後の週が切れないところまで。数字は `digit` が別に守る。 */
const ROW_MIN = 18;
const ROW_MAX = 30;

function Days({ y, m, selected, onPick, flat, rowH }: {
  y: number; m: number; selected?: string; onPick: (iso: string) => void;
  /** 隣の月。押せないので軽い描き方にする。 */
  flat?: boolean;
  /** 1週の高さ。器の残りから決まる。 */
  rowH: number;
}) {
  const today = ymd(new Date());
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: new Date(y, m, 1).getDay() }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length < WEEKS * 7) cells.push(null);
  // ★丸は行の高さから決めるが、**数字の大きさは丸に引きずられすぎないこと**。
  // 行が痩せた画面で数字まで比例して縮めると 9px 以下になって読めなかった。
  const size = Math.min(ROW_MAX - 2, rowH - 1);
  const digit = Math.min(12.5, size * 0.62);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
      {cells.map((d, i) => {
        if (d === null) return <span key={i} style={{ height: rowH }} />;
        const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
        const on = iso === selected;
        const cell: React.CSSProperties = {
          width: size, height: size, borderRadius: "50%", border: "none", padding: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: on ? PAPER : "transparent",
          boxShadow: !on && iso === today ? `inset 0 0 0 1.5px ${RUST}` : "none",
          color: on ? "#2A2A28" : ON_G,
          fontFamily: SANS, fontSize: digit, fontWeight: on ? 700 : 500,
        };
        return (
          <span key={i} style={{ display: "flex", justifyContent: "center", alignItems: "center", height: rowH }}>
            {flat
              ? <span aria-hidden style={cell}>{d}</span>
              : (
                <button {...press(() => onPick(iso))} aria-label={`${m + 1}月${d}日`} aria-pressed={on}
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
    <button {...press(onClick)} aria-label={dir < 0 ? "前の月" : "次の月"} className="tc-lamp" style={{
      width: 30, height: 26, borderRadius: "50%", border: "none", background: "transparent",
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
/** 列の幅。★全幅に広げないこと(2026-08-17にユーザー指摘)。 */
const COL_W = 66;

function Dial({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const h = Number(value.slice(0, 2));
  const m = Number(value.slice(3));
  return (
    <div style={{
      position: "relative", display: "flex", gap: 6,
      width: COL_W * 2 + 22, margin: "0 auto", alignItems: "stretch",
    }}>
      {/* 中央のハイライト。列の裏に敷く。 */}
      <span aria-hidden style={{
        position: "absolute", left: 0, right: 0, top: ITEM_H, height: ITEM_H,
        borderRadius: 12, background: "rgba(250,250,249,0.12)", pointerEvents: "none",
      }} />
      <Column values={Array.from({ length: 24 }, (_, i) => pad(i))} value={pad(h)}
        unit="時" onPick={(v) => onChange(`${v}:${pad(m)}`)} />
      <span aria-hidden style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: SANS, fontSize: 17, fontWeight: 700, color: ON_G, width: 10,
      }}>:</span>
      <Column values={Array.from({ length: 12 }, (_, i) => pad(i * 5))} value={pad(m - (m % 5))}
        unit="分" onPick={(v) => onChange(`${pad(h)}:${v}`)} />
    </div>
  );
}

/**
 * ダイアルの1列。★**真ん中に来た値がそのまま選ばれる**(2026-08-17にユーザー
 * 指定。Apple のピッカーと同じ)。以前は回したあとタップが要った。
 * scroll が止まったのを見て、中央のindexを確定する。
 */
function Column({ values, value, unit, onPick }: {
  values: string[]; value: string; unit: string; onPick: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const timer = useRef(0);
  // 開いたとき、いまの値を中央へ。
  useEffect(() => {
    const el = ref.current;
    const i = values.indexOf(value);
    if (el && i >= 0) el.scrollTop = i * ITEM_H;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM_H)));
    if (values[i] !== value) { haptic(4); onPick(values[i]); }
  };

  return (
    <div
      ref={ref}
      // scrollend が使えない環境(iOS の古い版など)のために、止まった頃を測って拾う。
      onScroll={() => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(settle, 120);
      }}
      onScrollEnd={settle}
      style={{
        width: COL_W, height: ITEM_H * 3, overflowY: "auto", scrollSnapType: "y mandatory",
        padding: `${ITEM_H}px 0`, scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
      }}
    >
      {values.map((v) => (
        <button key={v} {...press(() => onPick(v))}
          aria-label={`${Number(v)}${unit}`} aria-pressed={v === value}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "100%", height: ITEM_H, border: "none", background: "transparent",
            cursor: "pointer", scrollSnapAlign: "center",
            fontFamily: SANS, fontSize: v === value ? 19 : 16,
            fontWeight: v === value ? 700 : 500,
            color: v === value ? ON_G : DIM,
          }}>{v}</button>
      ))}
    </div>
  );
}
