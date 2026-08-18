"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CAP, Press } from "@/components/tasks/Popover";
import { PAPER, RUST, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";

// ★日程の入力(2026-08-17・第6巡で作り直し。参照＝TickTick の画像4枚)。
//
// ★★**ここだけキーボードを閉じる**(2026-08-17にユーザーが方針転換)。
// 他の項目(メモ・持ち物・重要度・タグ)は今までどおり出したままだが、日程は
// カレンダーに高さが要るので、閉じて画面いっぱいのシートを立ち上げる。
// 呼び側(TaskComposer)が blur とシートの出入りを持ち、ここは中身だけ。
//
//   (✕)      [ 期日 | 期間 ]      (✓)     ← 左上で取り消し / 右上で確定
//   今日   明日   今週末                   ← 早押し
//   ‹  8月  ›  ＋ 6週の方眼
//   時刻 …(カード)
//   クリア
//
// 期間のとき:
//   終日ON  … [開始 › 終了] を**1枚のカードの中で2つに割る**
//   終日OFF … [期日][時刻] の**別々の2枚**
//   どちらも下に「終日」のスイッチ
//
// ★モードは値から決まる(状態を二重に持たない)。
//   endDate か endTime があれば「期間」、無ければ「期日」。
// ★大きさ(切迫度)に効くのは dueDate だけ。他は表示のため。

export interface WhenValue {
  dueDate?: string;
  endDate?: string;
  dueTime?: string;
  endTime?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : null);
/** `Date.getDay()` の添字で引く曜日名。**日曜始まりのまま**にすること
 *  (label() がこの添字で引いている)。 */
const WD = ["日", "月", "火", "水", "木", "金", "土"];
/** カレンダーの見出し。★**月曜始まり**(2026-08-17にユーザー指定)。 */
const WD_HEAD = ["月", "火", "水", "木", "金", "土", "日"];
/** その月の1日が何マス目から始まるか(月曜始まり)。 */
const leadBlanks = (y: number, m: number) => (new Date(y, m, 1).getDay() + 6) % 7;

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

/** 月のヘッダー(‹ 8月 ›)の高さ。 */
const HEAD_H = 34;
/** 曜日の行の高さ。 */
const WD_H = 18;
/** ★常に6週ぶん描く。月によって5週/6週と変わると、送るたびに盤の高さが
 *  跳ねて、下の行まで動いてしまう。 */
const WEEKS = 6;
/** 1週の高さ。★キーボードを閉じたので**大きく取れる**(2026-08-17)。 */
const ROW_MAX = 40;
/** 器が縮んだときの下限(保険)。 */
const ROW_MIN = 24;
/** カレンダーまるごとの高さ。 */
const CAL_H = HEAD_H + WD_H + ROW_MAX * WEEKS;

/** 早押しの高さ。 */
const QUICK_H = 62;
/** 「時刻」「終日」の行・カードの高さ。 */
const ROW_H = 52;
/** 「クリア」の高さ。 */
const CLEAR_H = 36;

/**
 * ★★**シートの中身の高さ**(下の余白を除く)。
 *
 * 「期日」の並びの合計から導く。**上端を動かさない**ために呼び側
 * (`TaskComposer`)がこの高さでシートを固定する — 高さを中身なりにすると、
 * 中身の少ない「期間」で上端が下がり、押す位置が変わって不便だった
 * (2026-08-17にユーザー指摘)。「期間」では下が空くが、それでよい。
 *
 *   上余白 14 + 見出し 44 + (8 + 早押し) + (8 + カレンダー)
 *          + (8 + 時刻の行) + (8 + クリア)
 */
export const SHEET_BODY_H = 14 + 44 + (8 + QUICK_H) + (8 + CAL_H) + (8 + ROW_H) + (8 + CLEAR_H);

const ON_G = PAPER;
const DIM = "rgba(250,250,249,0.44)";
/** カードの地。 */
const CELL = "rgba(250,250,249,0.07)";
/** 浮かせるもの(カレンダー・ダイアル)の地。 */
const FLOAT = "#3B3B36";
/** 今日のマスの塗り。選んでいる日(アクセント)と混ざらないよう沈ませる。 */
const TODAY_FILL = "rgba(250,250,249,0.16)";
/** 期間のあいだの日に敷く色。アクセントを薄く。 */
const rangeTint = (accent: string) => `color-mix(in srgb, ${accent} 22%, transparent)`;

const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
/** 今週末(次の土曜。今日が土曜ならその日)。 */
function weekend(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return ymd(d);
}

export function WhenSheet({ value, accent, onChange, onCancel, onCommit }: {
  value: WhenValue;
  /** アクセント色。**そのタスクのタグの色**(2026-08-17にユーザー確定)。 */
  accent: string;
  onChange: (v: WhenValue) => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const isRange = !!value.endDate || !!value.endTime;
  const allDay = !value.dueTime;
  /** いま浮かせているもの。 */
  const [pop, setPop] = useState<null | "cal-start" | "cal-end" | "cal-due" | "time">(null);
  /** 時刻のダイアルで、開始と終了のどちらを触っているか。 */
  const [edge, setEdge] = useState<"start" | "end">("start");
  // 浮きを出す位置の基準。**押した相手の隣**に出すために測る(Float を参照)。
  const cardsRef = useRef<HTMLDivElement | null>(null);   // 期間のカードの行
  const timeRef = useRef<HTMLDivElement | null>(null);    // 期日のときの「時刻」の行

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
    // ★**器いっぱいに広げる**(`height: 100%`)。中身なりの高さにしていると、
    // 浮きの置き場所を決めるときの「使える高さ」が中身の高さになってしまい、
    // 下に余裕があるのに上へ返って見出しを覆っていた(2026-08-17)。
    // 中身は上から並ぶ(既定の flex-start)ので、下が空くだけ。
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
      {/* ── 見出し。✕ は取り消し / ✓ は確定。ピルは**中央・幅を絞る**
             (参照画像のとおり。以前は幅いっぱいに伸ばしていた)。 ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", height: 44, flexShrink: 0,
      }}>
        <Press onPress={() => { haptic(6); onCancel(); }} aria-label="取り消す" className="tc-lamp" style={{
          width: 36, height: 36, borderRadius: "50%", background: "rgba(250,250,249,0.10)",
          position: "relative", flexShrink: 0,
        }}>
          <span style={{ position: "absolute", left: 11, top: 17, width: 14, height: 1.6, background: ON_G, transform: "rotate(45deg)" }} />
          <span style={{ position: "absolute", left: 11, top: 17, width: 14, height: 1.6, background: ON_G, transform: "rotate(-45deg)" }} />
        </Press>

        <div style={{ display: "flex", width: 200, padding: 2, borderRadius: 999, background: CELL }}>
          {[["期日", false], ["期間", true]].map(([t, on]) => (
            <Press key={String(t)} onPress={() => toRange(on as boolean)}
              aria-label={t as string} aria-pressed={isRange === on}
              className="tc-lamp" style={{
                flex: 1, height: 30, borderRadius: 999,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isRange === on ? "rgba(250,250,249,0.18)" : "transparent",
                fontFamily: SANS, fontSize: 13, fontWeight: 700,
                color: isRange === on ? ON_G : DIM,
              }}>{t as string}</Press>
          ))}
        </div>

        <Press onPress={() => { haptic(16); onCommit(); }} aria-label="確定する" className="tc-lamp" style={{
          width: 40, height: 40, borderRadius: "50%", background: accent,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Check c={FLOAT} />
        </Press>
      </div>

      {!isRange ? (
        <>
          <Quick accent={accent} selected={value.dueDate} onPick={(iso) => { haptic(6); set({ dueDate: iso }); }} />
          <MonthGrid accent={accent} selected={value.dueDate}
            onPick={(iso) => { haptic(6); set({ dueDate: iso }); }} />
          <Row ref={timeRef} label="時刻" value={value.dueTime} accent={accent}
            onOpen={() => { setEdge("start"); setPop(pop === "time" ? null : "time"); }}
            onClear={value.dueTime ? () => set({ dueTime: undefined, endTime: undefined }) : undefined}
          />
        </>
      ) : (
        <>
          {allDay ? (
            // ★終日ON … 1枚のカードの中で開始と終了に割る(参照画像2)。
            <div ref={cardsRef} style={{ display: "flex", borderRadius: 16, background: CELL, overflow: "hidden", flexShrink: 0 }}>
              <Half title="開始" aria="開始日を選ぶ" main={label(value.dueDate)} accent={accent}
                sub={value.dueDate === today ? "今日" : ""}
                open={pop === "cal-start"} onOpen={() => setPop(pop === "cal-start" ? null : "cal-start")} />
              <Wedge />
              <Half title="終了" aria="終了日を選ぶ" main={label(value.endDate ?? value.dueDate)} accent={accent}
                sub={span(value.dueDate, value.endDate)}
                open={pop === "cal-end"} onOpen={() => setPop(pop === "cal-end" ? null : "cal-end")} />
            </div>
          ) : (
            // ★終日OFF … 期日と時刻は別々の2枚(参照画像3)。
            <div ref={cardsRef} style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <Card title="期日" aria="期日を選ぶ" main={label(value.dueDate)} accent={accent}
                sub={value.dueDate === today ? "今日" : ""}
                open={pop === "cal-due"} onOpen={() => setPop(pop === "cal-due" ? null : "cal-due")} />
              <Card title="時刻" aria="時刻を選ぶ" accent={accent}
                main={`${value.dueTime ?? "--:--"} - ${value.endTime ?? "--:--"}`}
                sub={hours(value.dueTime, value.endTime)}
                open={pop === "time"} onOpen={() => { setEdge("start"); setPop(pop === "time" ? null : "time"); }} />
            </div>
          )}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            height: ROW_H, padding: "0 14px", borderRadius: 16, background: CELL, flexShrink: 0,
          }}>
            <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: ON_G }}>終日</span>
            <Switch on={allDay} accent={accent} onToggle={() => toAllDay(!allDay)} />
          </div>
        </>
      )}

      <Press onPress={() => { haptic(8); setPop(null); onChange({}); }} aria-label="クリア" style={{
        width: "100%", height: CLEAR_H, borderRadius: 999, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        ...CAP, fontSize: 10.5, color: RUST,
      }}>クリア</Press>

      {/* ── 浮かせるもの ── */}
      {pop?.startsWith("cal-") && (
        <Float anchor={cardsRef} onClose={() => setPop(null)}>
          <MonthGrid accent={accent}
            range={{ start: value.dueDate, end: value.endDate }}
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
        <Float anchor={isRange ? cardsRef : timeRef} onClose={() => setPop(null)}>
          {isRange && !allDay && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexShrink: 0 }}>
              {[["start", "開始"], ["end", "終了"]].map(([k, t]) => (
                <Press key={k} onPress={() => setEdge(k as "start" | "end")}
                  aria-label={t as string} aria-pressed={edge === k}
                  style={{
                    flex: 1, height: 32, borderRadius: 999,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: edge === k ? "rgba(250,250,249,0.18)" : "transparent",
                    fontFamily: SANS, fontSize: 12.5, fontWeight: 700,
                    color: edge === k ? ON_G : DIM,
                  }}>{t as string}</Press>
              ))}
            </div>
          )}
          {/* ★`edge` で作り直す。列の中央合わせは初回だけなので、
              key を変えないと開始⇄終了で位置が前のまま残る。 */}
          <Dial key={edge} accent={accent}
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

/** ✓。面で描く(アプリの他のアイコンと同じ作り)。 */
function Check({ c }: { c: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden style={{ display: "block" }}>
      <path d="M4.5 12.6 L9.4 17.5 L19.6 6.6 L17.5 4.6 L9.4 13.3 L6.6 10.5 Z" fill={c} />
    </svg>
  );
}

// ── 早押し ──────────────────────────────────────────────────
// ★参照画像4の「今日 / 明日 / 次の月曜 / 明日の朝」に倣う。ただし
// **時刻を勝手に決めるもの(明日の朝)は入れない** — 3つだけ
// (今日・明日・今週末。2026-08-17にユーザー確定)。

function Quick({ accent, selected, onPick }: {
  accent: string; selected?: string; onPick: (iso: string) => void;
}) {
  const items = [
    { k: "today", t: "今日", iso: addDays(0) },
    { k: "tomorrow", t: "明日", iso: addDays(1) },
    { k: "weekend", t: "今週末", iso: weekend() },
  ];
  return (
    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
      {items.map((q) => {
        const on = q.iso === selected;
        return (
          <Press key={q.k} onPress={() => onPick(q.iso)} aria-label={q.t} aria-pressed={on}
            className="tc-lamp" style={{
              flex: 1, height: QUICK_H, borderRadius: 16,
              background: on ? "rgba(250,250,249,0.14)" : CELL,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5,
            }}>
            <QuickGlyph name={q.k} c={accent} />
            <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: on ? ON_G : DIM }}>{q.t}</span>
          </Press>
        );
      })}
    </div>
  );
}

/** 早押しのアイコン。面だけで描く(components/TabIcons.tsx と同じ作り)。 */
function QuickGlyph({ name, c }: { name: string; c: string }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: c, "aria-hidden": true } as const;
  if (name === "today") {
    // 今日 = カレンダーの枠に今日の数字。
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="17" rx="3" opacity={0.3} />
        <rect x="3" y="4" width="18" height="4.4" rx="2" />
        <text x="12" y="17.6" textAnchor="middle" fontSize="9.5" fontWeight="700"
          fontFamily="system-ui, sans-serif" fill={c}>{new Date().getDate()}</text>
      </svg>
    );
  }
  if (name === "tomorrow") {
    // 明日 = 右へ1つ送る矢印。
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="17" rx="3" opacity={0.3} />
        <rect x="3" y="4" width="18" height="4.4" rx="2" />
        <path d="M8.6 17 L13.4 12.8 L8.6 8.6 Z" />
        <rect x="14.4" y="8.6" width="1.9" height="8.4" />
      </svg>
    );
  }
  // 今週末 = 2日ぶんの小さな面が並ぶ。
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="17" rx="3" opacity={0.3} />
      <rect x="3" y="4" width="18" height="4.4" rx="2" />
      <rect x="6.8" y="11.6" width="4.4" height="5.6" rx="1" />
      <rect x="12.8" y="11.6" width="4.4" height="5.6" rx="1" />
    </svg>
  );
}

// ── 浮かせる面 ──────────────────────────────────────────────

/** 浮きと、開いた相手とのすき間。 */
const FLOAT_GAP = 6;

/**
 * 浮かせる小さな面。外をつつくと閉じる。
 *
 * ★★**押した相手の隣に出す**(2026-08-17にユーザー指摘
 * 「時刻というボタンと離れてホバーが出てくる」)。以前は見出しのすぐ下
 * (`top: 52`)に固定していたので、どこから開いても同じ場所に出ていた。
 *
 * 下に入るなら相手の下、入らないなら**上へ返す**。幅はシートいっぱいのまま
 * (カレンダーは半分の幅のカードに収まらない)。置き場所はシートの中に必ず
 * 収まる — `anchor` も自分もシートの中にあり、上下どちらかには必ず入る。
 */
function Float({ anchor, onClose, children }: {
  /** 開いた行・カードの並び。この隣に出す。 */
  anchor: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // 測るまでは画面の外。1フレームだけなので見えない。
  const [top, setTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const a = anchor.current;
    const host = el?.offsetParent as HTMLElement | null;   // = シートの根
    if (!el || !a || !host) return;
    const hr = host.getBoundingClientRect();
    const ar = a.getBoundingClientRect();
    const h = el.offsetHeight;
    const below = ar.bottom - hr.top + FLOAT_GAP;
    const above = ar.top - hr.top - h - FLOAT_GAP;
    setTop(below + h <= hr.height ? below : Math.max(FLOAT_GAP, above));
  }, [anchor]);
  return (
    <>
      <div aria-hidden onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 4 }} />
      <div ref={ref} className="tc-pop-in" data-float style={{
        position: "absolute", left: 0, right: 0, zIndex: 5,
        top: top ?? -9999, visibility: top === null ? "hidden" : "visible",
        background: FLOAT, borderRadius: 18, padding: 10,
        boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
        display: "flex", flexDirection: "column",
      }}>{children}</div>
    </>
  );
}

// ── カード ──────────────────────────────────────────────────
// ラベル(沈んだ色・小)/ 値(アクセント色・太)/ 注記(沈んだ色・極小) の3段。
// 参照画像2・3のとおり。

function Face({ title, main, sub, accent }: {
  title: string; main: string; sub: string; accent: string;
}) {
  return (
    <>
      <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, color: DIM, marginBottom: 4 }}>{title}</div>
      <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 700, color: accent, whiteSpace: "nowrap" }}>{main}</div>
      <div style={{ fontFamily: SANS, fontSize: 10.5, color: DIM, marginTop: 3, minHeight: 13 }}>{sub}</div>
    </>
  );
}

/** 独立した1枚。 */
function Card({ title, aria, main, sub, accent, open, onOpen }: {
  title: string; aria: string; main: string; sub: string; accent: string;
  open: boolean; onOpen: () => void;
}) {
  return (
    <Press onPress={onOpen} aria-label={aria} aria-pressed={open} className="tc-lamp" style={{
      flex: 1, minWidth: 0, textAlign: "left", borderRadius: 16, padding: "12px 14px",
      background: open ? "rgba(250,250,249,0.16)" : CELL,
    }}>
      <Face title={title} main={main} sub={sub} accent={accent} />
    </Press>
  );
}

/** 1枚のカードを2つに割った片方(開始 › 終了)。 */
function Half({ title, aria, main, sub, accent, open, onOpen }: {
  title: string; aria: string; main: string; sub: string; accent: string;
  open: boolean; onOpen: () => void;
}) {
  return (
    <Press onPress={onOpen} aria-label={aria} aria-pressed={open} className="tc-lamp" style={{
      flex: 1, minWidth: 0, textAlign: "left", padding: "12px 14px",
      background: open ? "rgba(250,250,249,0.10)" : "transparent",
    }}>
      <Face title={title} main={main} sub={sub} accent={accent} />
    </Press>
  );
}

/** 開始と終了のあいだの山形の切り込み(参照画像2)。 */
function Wedge() {
  return (
    <span aria-hidden style={{ position: "relative", width: 14, flexShrink: 0 }}>
      <span style={{
        position: "absolute", top: "50%", left: 1, width: 9, height: 9,
        borderTop: `1.5px solid ${DIM}`, borderRight: `1.5px solid ${DIM}`,
        transform: "translateY(-50%) rotate(45deg)",
      }} />
    </span>
  );
}

/** 期日のときの「時刻」の行。値と ✕。 */
function Row({ ref, label: t, value, accent, onOpen, onClear }: {
  ref: React.RefObject<HTMLDivElement | null>;
  label: string; value?: string; accent: string; onOpen: () => void; onClear?: () => void;
}) {
  return (
    <div ref={ref} style={{
      display: "flex", alignItems: "center", height: ROW_H, borderRadius: 16, background: CELL, flexShrink: 0,
    }}>
      <Press onPress={onOpen} aria-label={t} className="tc-lamp" style={{
        flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 6px 0 14px", borderRadius: 16,
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Clock c={DIM} />
          <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: ON_G }}>{t}</span>
        </span>
        <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: value ? accent : DIM }}>
          {value ?? "終日"}
        </span>
      </Press>
      <Press onPress={() => onClear?.()} disabled={!onClear} aria-label={`${t}を消す`} style={{
        width: 40, height: "100%", position: "relative", opacity: onClear ? 1 : 0.25,
      }}>
        <span style={{ position: "absolute", left: 14, top: 25, width: 12, height: 1.5, background: DIM, transform: "rotate(45deg)" }} />
        <span style={{ position: "absolute", left: 14, top: 25, width: 12, height: 1.5, background: DIM, transform: "rotate(-45deg)" }} />
      </Press>
    </div>
  );
}

/** 時計。 */
function Clock({ c }: { c: string }) {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" aria-hidden style={{ display: "block" }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke={c} strokeWidth="1.8" />
      <rect x="11.1" y="6.6" width="1.8" height="6.2" fill={c} />
      <rect x="11.1" y="11.1" width="5.4" height="1.8" fill={c} />
    </svg>
  );
}

/** 終日のスイッチ。丸が左右へ動くだけ。 */
function Switch({ on, accent, onToggle }: { on: boolean; accent: string; onToggle: () => void }) {
  return (
    <Press onPress={onToggle} role="switch" aria-checked={on} aria-label="終日" style={{
      width: 50, height: 30, borderRadius: 999, padding: 3,
      background: on ? accent : "rgba(250,250,249,0.20)",
      transition: "background-color 180ms ease",
    }}>
      <span style={{
        display: "block", width: 24, height: 24, borderRadius: "50%", background: PAPER,
        transform: `translateX(${on ? 20 : 0}px)`,
        transition: "transform 200ms cubic-bezier(0.16,1,0.3,1)",
      }} />
    </Press>
  );
}

// ── カレンダー ──────────────────────────────────────────────
// ★月送りは**面ごと滑らせる**(2026-08-17)。前月・当月・翌月を横に並べ、
// 指を追って translateX し、離したら隣まで送る。送り終わったら transition を
// 切って中央へ戻す(`.app-track` と同じ手)。
// 以前は月の数字だけ差し替わっていて、変わったことに気づけなかった。

const SWIPE = 40;
/** 横か縦かを決める距離(px)。 */
const AXIS = 8;
/** 月を送る時間(ms)。 */
const SLIDE_MS = 220;


function MonthGrid({ accent, selected, range, onPick }: {
  accent: string; selected?: string;
  /** 期間のときの開始〜終了。両端を塗り、あいだを薄く敷く。 */
  range?: { start?: string; end?: string };
  onPick: (iso: string) => void;
}) {
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

  // ★1週の高さは残りに合わせる(保険)。キーボードを閉じたので普段は ROW_MAX で
  // 足りるが、背の低い端末でも最後の週が切れないようにしておく。
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
      flex: 1, minHeight: HEAD_H + WD_H + ROW_MIN * WEEKS,
      display: "flex", flexDirection: "column",
    }}>
      {/* 月。★太字で中央、山形は小さく(参照画像4)。 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
        height: HEAD_H, flexShrink: 0,
      }}>
        <Arrow dir={-1} onClick={() => step(-1)} />
        <span style={{
          fontFamily: SANS, fontSize: 17, fontWeight: 700, color: ON_G,
          minWidth: 96, textAlign: "center",
        }}>{cursor.m + 1}月</span>
        <Arrow dir={1} onClick={() => step(1)} />
      </div>
      {/* ★曜日は**送らない**。月ごとに描いていたため、指で送っている途中の
          曜日の並びがずれて見えた(2026-08-17)。 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", flexShrink: 0 }}>
        {WD_HEAD.map((wd, i) => (
          <span key={i} style={{
            fontFamily: SANS, fontSize: 11, fontWeight: 700, color: DIM,
            textAlign: "center", height: WD_H, lineHeight: `${WD_H}px`,
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
              {/* ★隣の月は**押せない**ので、Press ではなく span で軽く描く。
                  3か月ぶんを全部押せるようにすると 126 個になり、開いた瞬間の
                  レイアウトで 200ms 級のひっかかりが出た(実測)。 */}
              <Days y={mm.y} m={mm.m} selected={selected} range={range} onPick={onPick}
                flat={!mm.self} rowH={rowH} accent={accent} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Days({ y, m, selected, range, onPick, flat, rowH, accent }: {
  y: number; m: number; selected?: string;
  range?: { start?: string; end?: string };
  onPick: (iso: string) => void;
  /** 隣の月。押せないので軽い描き方にする。 */
  flat?: boolean;
  /** 1週の高さ。器の残りから決まる。 */
  rowH: number;
  accent: string;
}) {
  const today = ymd(new Date());
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: leadBlanks(y, m) }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length < WEEKS * 7) cells.push(null);
  // ★丸は行の高さから決めるが、**数字の大きさは丸に引きずられすぎないこと**。
  // 行が痩せた画面で数字まで比例して縮めると読めなくなる。
  const size = Math.min(ROW_MAX - 6, rowH - 6);
  const digit = Math.min(15, size * 0.46);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
      {cells.map((d, i) => {
        if (d === null) return <span key={i} style={{ height: rowH }} />;
        const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
        // ★期間の両端と、そのあいだ(2026-08-18にユーザー指定
        //   「開始で選んだ日が終了の方でも見れるように」)。
        const rs = range?.start, re = range?.end ?? range?.start;
        const isEdge = !!rs && (iso === rs || iso === re);
        const inside = !!rs && !!re && iso > rs && iso < re;
        const on = iso === selected || isEdge;
        const isToday = iso === today;
        const cell: React.CSSProperties = {
          width: size, height: size, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          // 選んだ日・期間の両端 … アクセントの塗り
          // 今日 … ★**塗りの円**(2026-08-18にユーザー指定。囲みはやめた)
          background: on ? accent : isToday ? TODAY_FILL : "transparent",
          color: on ? FLOAT : ON_G,
          fontFamily: SANS, fontSize: digit, fontWeight: on || isToday ? 700 : 500,
        };
        const body = flat
          ? <span aria-hidden style={cell}>{d}</span>
          : (
            <Press onPress={() => onPick(iso)} aria-label={`${m + 1}月${d}日`} aria-pressed={on}
              className={on ? "tc-lamp tc-pick" : "tc-lamp"} style={cell}>{d}</Press>
          );
        return (
          <span key={i} style={{
            display: "flex", justifyContent: "center", alignItems: "center", height: rowH,
            // あいだの日は薄い帯で繋ぐ(マスいっぱいに敷いて連続して見せる)。
            background: inside ? rangeTint(accent) : "transparent",
          }}>{body}</span>
        );
      })}
    </div>
  );
}

function Arrow({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  return (
    <Press onPress={onClick} aria-label={dir < 0 ? "前の月" : "次の月"} className="tc-lamp" style={{
      width: 34, height: 30, borderRadius: "50%",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* 山形。細く小さく(参照画像4)。 */}
      <span style={{
        width: 8, height: 8,
        borderTop: `1.8px solid ${DIM}`,
        ...(dir < 0 ? { borderLeft: `1.8px solid ${DIM}` } : { borderRight: `1.8px solid ${DIM}` }),
        transform: `rotate(${dir < 0 ? -45 : 45}deg)`,
      }} />
    </Press>
  );
}

// ── 時刻のダイアル ──────────────────────────────────────────
// 時 / 分 の2列。`scroll-snap` で1つずつ止まるので、外部ライブラリは不要。
// 中央のハイライトが「いま選んでいる値」。

const ITEM_H = 36;
/** 列の幅。★全幅に広げないこと(2026-08-17にユーザー指摘)。 */
const COL_W = 70;
/** 見えている行数。★iPhone のアラームと同じ見え方に(2026-08-17にユーザー指定)。 */
const VISIBLE = 5;
/** 中央の行までの段数。 */
const MID = (VISIBLE - 1) / 2;
/** ダイアルまるごとの高さ(浮きの置き場所の計算に使う)。 */
const DIAL_H = ITEM_H * VISIBLE;
/** ★一周させるために並べる周の数。奇数にして真ん中の周を定位置にする。 */
const LOOPS = 5;

function Dial({ value, accent, onChange }: {
  value: string; accent: string; onChange: (t: string) => void;
}) {
  const h = Number(value.slice(0, 2));
  const m = Number(value.slice(3));
  return (
    <div style={{
      position: "relative", display: "flex", gap: 6,
      width: COL_W * 2 + 22, margin: "0 auto", alignItems: "stretch",
    }}>
      {/* 中央のハイライト。列の裏に敷く。 */}
      <span aria-hidden style={{
        position: "absolute", left: 0, right: 0, top: ITEM_H * MID, height: ITEM_H,
        borderRadius: 12, background: "rgba(250,250,249,0.12)", pointerEvents: "none",
      }} />
      <Column values={Array.from({ length: 24 }, (_, i) => pad(i))} value={pad(h)}
        accent={accent} onPick={(v) => onChange(`${v}:${pad(m)}`)} />
      <span aria-hidden style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: SANS, fontSize: 18, fontWeight: 700, color: ON_G, width: 10,
      }}>:</span>
      <Column values={Array.from({ length: 12 }, (_, i) => pad(i * 5))} value={pad(m - (m % 5))}
        accent={accent} onPick={(v) => onChange(`${pad(h)}:${v}`)} />
    </div>
  );
}

/**
 * ダイアルの1列。
 *
 * ★**真ん中に来た値がそのまま選ばれる**(iPhone のアラームと同じ)。
 * ★★**一周する**(2026-08-18にユーザー指定「一番下までスクロールすると
 *   止まってしまう」)。値を LOOPS 周ぶん並べておき、外側の周へ入ったら
 *   **transition を使わずに**中央の周へ差し戻す(見た目は動かない)。
 * ★★**ワンテンポ遅れさせない**(同指摘)。以前は 120ms 待ってから確定して
 *   いた。いまは**スクロール中に中央の値が変わった瞬間**に確定する。
 *   止まったあとの差し戻しだけデバウンスに残す。
 */
function Column({ values, value, accent, onPick }: {
  values: string[]; value: string; accent: string; onPick: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const timer = useRef(0);
  /** いま出している値。onPick を無駄に呼ばないための控え。 */
  const shown = useRef(value);
  shown.current = value;

  const cycle = values.length * ITEM_H;
  /** 中央の周の先頭。 */
  const base = Math.floor(LOOPS / 2) * cycle;

  // 開いたとき、いまの値を中央の周の中央へ。
  useEffect(() => {
    const el = ref.current;
    const i = values.indexOf(value);
    if (el && i >= 0) el.scrollTop = base + i * ITEM_H;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 中央に来ている値。 */
  const centered = (el: HTMLDivElement) =>
    values[((Math.round(el.scrollTop / ITEM_H) % values.length) + values.length) % values.length];

  /** 外側の周に入っていたら中央の周へ戻す。**見た目は1pxも動かない。** */
  const recenter = (el: HTMLDivElement) => {
    const off = ((el.scrollTop - base) % cycle + cycle) % cycle;
    const want = base + off;
    if (Math.abs(el.scrollTop - want) > 1) el.scrollTop = want;
  };

  return (
    <div
      ref={ref}
      onScroll={() => {
        const el = ref.current;
        if (!el) return;
        // ★指が動いているあいだに確定する(待たない)。
        const v = centered(el);
        if (v !== shown.current) { shown.current = v; haptic(4); onPick(v); }
        // 止まった頃に周を戻す。scrollend が使えない環境のための保険つき。
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => recenter(el), 140);
      }}
      onScrollEnd={() => { const el = ref.current; if (el) recenter(el); }}
      style={{
        width: COL_W, height: DIAL_H, overflowY: "auto", scrollSnapType: "y mandatory",
        padding: `${ITEM_H * MID}px 0`, scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
      }}
    >
      {/* ★★**ここに `Press` を置かないこと**(2026-08-17に実機で
          「時刻の設定 UI が操作できない」と報告された)。`Press` は iOS の
          フォーカス移動を止めるために非 passive な `touchstart` で
          `preventDefault()` するが、**それはスクロールも打ち消す**。
          そもそも押す必要が無い — 選ぶのは中央に来た値、つまりスクロール
          位置だけ。 */}
      {Array.from({ length: LOOPS }, (_, r) => values.map((v) => (
        <span key={`${r}-${v}`} aria-hidden={v !== value}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "100%", height: ITEM_H, scrollSnapAlign: "center",
            fontFamily: SANS, fontSize: v === value ? 22 : 17,
            fontWeight: v === value ? 700 : 500,
            color: v === value ? accent : DIM,
          }}>{v}</span>
      )))}
    </div>
  );
}
