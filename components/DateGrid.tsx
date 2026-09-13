"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Press } from "@/components/Button";
import { CHARCOAL, PAPER, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { ms, T_ITEM } from "@/lib/motion";
import { RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";

// ★★★**月のカレンダーはここ1つ**（2026-09-14・第102巡に
// `components/tasks/WhenSheet.tsx` から持ち上げた）。
//
// ★★★**なぜ持ち上げたか。** ホームの「引き下ろし → 右端の ASSIGN →日付を選ぶ」に
//   同じカレンダーが要る。**書き直すと、次に画素を直す人が片方しか直さない。**
//   ここの盤は**4つの実機の不具合と戦って今の形**になっている ――
//   ① 送ったあと**逆へ跳ね返る**（`snapBack` の1フレームで transition を切る）
//   ② 送っている最中に**曜日の行までずれる**（見出しは動かさない）
//   ③ 開くのに **856ms** 掛かる（隣の月は**触るまで作らない**）
//   ④ **430→650ms** の退行（1マスに置くのは**丸と札の2つまで**）
//   **この4つを知らずに書き直さないこと。**
//
// ★★**読み手は2つ** … `components/tasks/WhenSheet.tsx`（タスクの入力画面）と
//   `components/home/AssignSheet.tsx`（ホームの割り当て）。

export const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : null);
/** `Date.getDay()` の添字で引く曜日名。**日曜始まりのまま**にすること
 *  (label() がこの添字で引いている)。 */
const WD = ["日", "月", "火", "水", "木", "金", "土"];
/** カレンダーの見出し。★**月曜始まり**(2026-08-17にユーザー指定)。 */
export const WD_HEAD = ["月", "火", "水", "木", "金", "土", "日"];
/** その月の1日が何マス目から始まるか(月曜始まり)。 */
export const leadBlanks = (y: number, m: number) => (new Date(y, m, 1).getDay() + 6) % 7;

/** 「8月17日, 月」。 */
export function label(iso?: string): string {
  const d = parse(iso);
  return d ? `${d.getMonth() + 1}月${d.getDate()}日, ${WD[d.getDay()]}` : "—";
}

/** 何日ぶんか。 */
export function span(a?: string, b?: string): string {
  const x = parse(a), y = parse(b ?? a);
  if (!x || !y) return "";
  return `期間: ${Math.round((+y - +x) / 86400000) + 1} 日`;
}

/** 月のヘッダー(‹ 8月 ›)の高さ。 */
export const HEAD_H = 34;
/** 曜日の行の高さ。 */
export const WD_H = 18;
/** ★常に6週ぶん描く。月によって5週/6週と変わると、送るたびに盤の高さが
 *  跳ねて、下の行まで動いてしまう。 */
export const WEEKS = 6;
/** 1週の高さ。★キーボードを閉じたので**大きく取れる**(2026-08-17)。 */
export const ROW_MAX = 40;
/** 丸の下の、開始・終了・今日の点を書く1行の高さ。 */
export const LABEL_H = 10;
/** 器が縮んだときの下限(保険)。 */
export const ROW_MIN = 24;
/** カレンダーまるごとの高さ。 */
export const CAL_H = HEAD_H + WD_H + ROW_MAX * WEEKS;

/** 早押しの高さ。 */
export const QUICK_H = 62;

export const ON_G = PAPER;
export const DIM = "rgba(250,250,249,0.44)";
/** カードの地。 */
export const CELL = "rgba(250,250,249,0.07)";
/** 浮かせるもの(カレンダー・ダイアル)の地。 */
export const FLOAT = CHARCOAL;
/** 今日のマスの塗り。選んでいる日(アクセント)と混ざらないよう沈ませる。 */
/** 期間のあいだの日に敷く色。アクセントを薄く。 */
export const rangeTint = (accent: string) => `color-mix(in srgb, ${accent} 22%, transparent)`;

export const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
/** ★★**来週（次の月曜）**（2026-09-14・第102巡にユーザー確定で「今週末」から替えた）。
 *  今日が月曜なら**来週の**月曜（＝必ず先の日を指す。押しても何も変わらないボタンを作らない）。 */
export function nextWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return ymd(d);
}


// ── 早押し ──────────────────────────────────────────────────
// ★参照画像4の「今日 / 明日 / 次の月曜 / 明日の朝」に倣う。ただし
// **時刻を勝手に決めるもの(明日の朝)は入れない** — 3つだけ
// (今日・明日・来週。★第102巡に「今週末」→「来週」。ユーザー確定)。

export function Quick({ accent, selected, onPick }: {
  accent: string; selected?: string; onPick: (iso: string) => void;
}) {
  const items = [
    { k: "today", t: "今日", iso: addDays(0) },
    { k: "tomorrow", t: "明日", iso: addDays(1) },
    { k: "next", t: "来週", iso: nextWeek() },
  ];
  return (
    <div style={{ display: "flex", gap: SPACE.sm, flexShrink: 0 }}>
      {items.map((q) => {
        const on = q.iso === selected;
        return (
          <Press key={q.k} onPress={() => onPick(q.iso)} aria-label={q.t} aria-pressed={on}
            className="tc-lamp" style={{
              flex: 1, height: QUICK_H, borderRadius: RADIUS.xl,
              background: on ? "rgba(250,250,249,0.14)" : CELL,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SPACE.xs,
            }}>
            <QuickGlyph name={q.k} c={accent} />
            <span style={{ fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold, color: on ? ON_G : DIM }}>{q.t}</span>
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
  // 来週 = 2日ぶんの小さな面が並ぶ（週が替わる合図として残す）。
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="17" rx="3" opacity={0.3} />
      <rect x="3" y="4" width="18" height="4.4" rx="2" />
      <rect x="6.8" y="11.6" width="4.4" height="5.6" rx="1" />
      <rect x="12.8" y="11.6" width="4.4" height="5.6" rx="1" />
    </svg>
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
/** 月を送る時間(ms)。★`--t-item` と同じ(第33巡)。 */
const SLIDE_MS = ms(T_ITEM);


export function MonthGrid({ accent, selected, range, onPick }: {
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
        display: "flex", alignItems: "center", justifyContent: "center", gap: SPACE.xs,
        height: HEAD_H, flexShrink: 0,
      }}>
        <Arrow dir={-1} onClick={() => step(-1)} />
        <span style={{
          fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.bold, color: ON_G,
          minWidth: 96, textAlign: "center",
        }}>{cursor.m + 1}月</span>
        <Arrow dir={1} onClick={() => step(1)} />
      </div>
      {/* ★曜日は**送らない**。月ごとに描いていたため、指で送っている途中の
          曜日の並びがずれて見えた(2026-08-17)。 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", flexShrink: 0 }}>
        {WD_HEAD.map((wd, i) => (
          <span key={i} style={{
            fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold, color: DIM,
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
            : `transform ${SLIDE_MS}ms var(--ease-settle)`,
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
  // ★丸の下に**小さなラベルの1行**を必ず空ける(2026-08-18にユーザー確定)。
  //   ここに「開始」「終了」と、今日の点が入る。行ごとに有無が変わると
  //   高さが跳ねるので、**いつでも同じだけ**空ける。
  const size = Math.min(ROW_MAX - LABEL_H, rowH - LABEL_H);
  const digit = Math.min(15, size * 0.46);
  const rs = range?.start, re = range?.end;
  /** 期間の両端が別の日のときだけ、開始・終了と書く(1日ならただの選択)。 */
  const named = !!rs && !!re && rs !== re;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
      {cells.map((d, i) => {
        if (d === null) return <span key={i} style={{ height: rowH }} />;
        const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
        // ★期間の両端と、そのあいだ(2026-08-18にユーザー指定
        //   「開始で選んだ日が終了の方でも見れるように」)。
        const end = re ?? rs;
        const isEdge = !!rs && (iso === rs || iso === end);
        const inside = !!rs && !!end && iso > rs && iso < end;
        const on = iso === selected || isEdge;
        const isToday = iso === today;
        // ★★**今日は塗らない**(2026-08-18にユーザー指摘「今日の表示なのか、
        //   選択した日の表示なのか分からない」)。塗りは**選んだ日だけ**の印に
        //   して、今日は**数字の色と下の点**で示す。役割ごとに手段を分ける。
        const cell: React.CSSProperties = {
          width: size, height: size, borderRadius: RADIUS.circle,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: on ? accent : "transparent",
          color: on ? FLOAT : isToday ? accent : ON_G,
          fontFamily: SANS, fontSize: digit, fontWeight: on || isToday ? 700 : 500,
        };
        const body = flat
          ? <span aria-hidden style={cell}>{d}</span>
          : (
            <Press onPress={() => onPick(iso)} aria-label={`${m + 1}月${d}日`} aria-pressed={on}
              className={on ? "tc-lamp tc-pick" : "tc-lamp"} style={cell}>{d}</Press>
          );
        // 丸の下の1行。開始 / 終了 / 今日の点。
        const tag = named && iso === rs ? "開始" : named && iso === end ? "終了" : "";
        // ★ラベルの札は**必要なマスにだけ**作る(2026-08-18)。42マス全部に
        //   空の札を置くと、日程シートを開くのが 430→650ms へ戻ってしまった
        //   (この画面の重さは昔から**要素数**が支配的)。場所は
        //   `paddingBottom` で必ず空けてあるので、有無で高さは跳ねない。
        const mark = tag || (isToday && !on);
        return (
          <span key={i} style={{
            // ★入れ子を増やさない。マス1つにつき**丸と札の2つまで**
            //   (42マスに1つ足すだけで日程シートの開きが 430→650ms になった)。
            position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
            height: rowH, paddingBottom: LABEL_H, boxSizing: "border-box",
            // ★あいだの日は薄い帯で繋ぐ。両端のマスは**半分だけ**敷いて、
            //   丸から帯が伸びているように見せる(帯が途中で切れていると
            //   「どこからどこまでか」が読み取りにくい)。
            background: inside ? rangeTint(accent)
              : named && iso === rs ? `linear-gradient(to right, transparent 50%, ${rangeTint(accent)} 50%)`
              : named && iso === end ? `linear-gradient(to right, ${rangeTint(accent)} 50%, transparent 50%)`
              : "transparent",
            backgroundClip: "content-box",
          }}>
            {body}
            {mark && (
              <span aria-hidden style={{
                position: "absolute", left: 0, right: 0, bottom: 0,
                height: LABEL_H, lineHeight: `${LABEL_H}px`, textAlign: "center",
                fontFamily: SANS, fontSize: TYPE.micro, fontWeight: WEIGHT.bold, letterSpacing: TRACK.normal,
                color: accent,
              }}>
                {tag || <span style={{
                  display: "inline-block", width: 3.5, height: 3.5, borderRadius: RADIUS.circle,
                  background: accent, verticalAlign: "middle",
                }} />}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}


function Arrow({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  return (
    <Press onPress={onClick} aria-label={dir < 0 ? "前の月" : "次の月"} className="tc-lamp" style={{
      width: 34, height: 30, borderRadius: RADIUS.circle,
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
