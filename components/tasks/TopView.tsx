"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HELV, INK, NAV_H, PAPER, SWISS_MD, SWISS_XL, TAB_PAD_TOP } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { SPACE, TYPE } from "@/lib/tokens";
import { ymd } from "@/components/tasks/WhenSheet";
import type { Task } from "@/lib/types";

// ★地表(TOP VIEW)。真上から見下ろした**カレンダー**(スイス・スタイル)。
// その月の日付に対応した**黒い穴**が、月曜始まりの7列の格子に並ぶ。穴の中に
// 白い Helvetica の数字。穴をたたくと、その日の中へ潜る(UNDERGROUND)。
//
// ★★ここは「予定を読む」面ではなく、**どこに掘るかを選ぶ**面。だから
// 穴と数字と、月の見出ししか無い。ブルータリズム/スイスの語彙 ―
// 強い格子・Helvetica・黒と白・余白 ― でレイアウトする。
//
// ★CSS の 3D 変形はこの層は持たない。見下ろしへ倒れるカメラの動きは
// `TaskSpace` が作る(perspective + rotateX)。ここは倒れ切った後の平面図。

/** 曜日の見出し。★**月曜始まり**(ユーザー指定)。 */
const WD_HEAD = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
/** 月の頭文字(スイス・スタイルの大きな見出しに使う)。 */
const MONTH_INITIAL = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
/** 穴がマスの中で占める割合。1.0 だと隣とくっつく。 */
const HOLE_FILL = 0.82;
/** 横に払って月を送るのに要る距離。 */
const SWIPE_PX = 48;

const pad2 = (n: number) => String(n).padStart(2, "0");
/** その月の1日が何マス目から始まるか(月曜始まり)。 */
const leadBlanks = (y: number, m: number) => (new Date(y, m, 1).getDay() + 6) % 7;

export function TopView({ tasks, onDive }: {
  tasks: Task[];
  /** 穴をたたいた。潜る先の日付。 */
  onDive: (iso: string) => void;
}) {
  const today = new Date();
  const todayIso = ymd(today);
  // 見ている月(1日を持つ)。横に払うと前後の月へ。
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const y = month.getFullYear();
  const m = month.getMonth();

  const fieldRef = useRef<HTMLDivElement | null>(null);
  const swipeRef = useRef<{ x: number; y: number; done: boolean } | null>(null);

  // その日に何件あるか。予定日の無いものは数えない(穴は日付のものなので)。
  const countByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (t.done || !t.dueDate) continue;
      map.set(t.dueDate, (map.get(t.dueDate) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  // カレンダーのマス。先頭の空白 + その月の日数。月曜始まり。
  const cells = useMemo(() => {
    const lead = leadBlanks(y, m);
    const days = new Date(y, m + 1, 0).getDate();
    const out: ({ n: number; iso: string; count: number } | null)[] = [];
    for (let i = 0; i < lead; i += 1) out.push(null);
    for (let d = 1; d <= days; d += 1) {
      const iso = `${y}-${pad2(m + 1)}-${pad2(d)}`;
      out.push({ n: d, iso, count: countByDay.get(iso) ?? 0 });
    }
    return out;
  }, [y, m, countByDay]);
  const rows = Math.ceil(cells.length / 7);

  // ★横に払って月を送る。縦は器(カメラ)のものなので、横だけ見る。
  const onDown = (e: React.PointerEvent) => { swipeRef.current = { x: e.clientX, y: e.clientY, done: false }; };
  const onMove = (e: React.PointerEvent) => {
    const s = swipeRef.current;
    if (!s || s.done) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    s.done = true;
    setMonth((cur) => new Date(cur.getFullYear(), cur.getMonth() + (dx < 0 ? 1 : -1), 1));
    haptic(6);
  };
  const onUp = () => { swipeRef.current = null; };

  // 器の実寸から穴の直径を出す。★変形後ではなく offsetWidth/Height で測る
  //   (層は見下ろしへ倒れるあいだ変形するので、rect だと潰れて見える)。
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const read = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setSize((s) => (Math.abs(s.w - w) < 0.5 && Math.abs(s.h - h) < 0.5 ? s : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cw = size.w / 7;
  const ch = size.h / rows;
  const hole = Math.max(0, Math.min(cw, ch) * HOLE_FILL);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* 曜日の見出し。左揃えのスイス・グリッド。層の名前は左下の月の見出しが
          兼ねるので、`LayerName` は置かない(右上で SUN と重なるため)。 */}
      <div style={{
        position: "absolute", top: `calc(${TAB_PAD_TOP} + 56px + ${SPACE.md}px)`,
        left: SPACE.lg, right: SPACE.lg,
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
      }}>
        {WD_HEAD.map((w, i) => (
          <span key={w} style={{
            fontFamily: HELV, fontSize: TYPE.micro, fontWeight: 700, letterSpacing: "0.08em",
            color: i >= 5 ? "rgba(26,26,24,0.4)" : INK, textAlign: "center",
          }}>{w}</span>
        ))}
      </div>

      {/* 穴の格子。 */}
      <div
        ref={fieldRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          position: "absolute",
          top: `calc(${TAB_PAD_TOP} + 56px + ${SPACE.md}px + 22px)`,
          left: SPACE.lg, right: SPACE.lg,
          bottom: `calc(${NAV_H} + 96px)`,
        }}>
        {cells.map((c, i) => {
          if (!c) return null;
          const col = i % 7;
          const row = Math.floor(i / 7);
          const isToday = c.iso === todayIso;
          const has = c.count > 0;
          return (
            <button
              key={c.iso}
              onClick={() => { haptic(8); onDive(c.iso); }}
              aria-label={`${m + 1}月${c.n}日を開く（${c.count}件）`}
              style={{
                position: "absolute",
                left: `${((col + 0.5) / 7) * 100}%`,
                top: `${((row + 0.5) / rows) * 100}%`,
                transform: "translate(-50%, -50%)",
                width: hole, height: hole, borderRadius: "50%",
                // ★穴は**黒**(ユーザー指定)。地面に開いた空なので、縁も影も無い。
                background: INK,
                // 今日だけ、穴の外に白い細い輪を置いて居場所を示す。
                boxShadow: isToday ? `0 0 0 2px ${PAPER}, 0 0 0 4px ${INK}` : "none",
                border: "none", padding: 0, cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
              }}>
              {/* 数字は白い Helvetica。予定の無い日は沈める。 */}
              <span style={{
                fontFamily: HELV, fontSize: Math.round(hole * 0.34), fontWeight: 600, lineHeight: 1,
                color: PAPER, opacity: has ? 1 : 0.42, letterSpacing: "-0.02em",
              }}>{c.n}</span>
              {/* 件数は白い小さな四角の列(スイス。1〜3個、それ以上は3個で頭打ち)。 */}
              {has && (
                <span style={{ display: "flex", gap: 2 }}>
                  {Array.from({ length: Math.min(c.count, 3) }).map((_, k) => (
                    <span key={k} style={{ width: Math.max(2, hole * 0.05), height: Math.max(2, hole * 0.05), background: PAPER }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 月の見出し。左下、黒い Helvetica。頭文字を大きく、月の数字を添える。 */}
      <div style={{
        position: "absolute", left: SPACE.lg, bottom: `calc(${NAV_H} + ${SPACE.md}px)`,
        display: "flex", alignItems: "flex-end", gap: SPACE.sm, pointerEvents: "none",
      }}>
        <span style={{ fontFamily: HELV, fontSize: SWISS_XL, fontWeight: 700, color: INK, lineHeight: 0.8, letterSpacing: "-0.04em" }}>
          {MONTH_INITIAL[m]}
        </span>
        <span style={{ fontFamily: HELV, fontSize: SWISS_MD, fontWeight: 700, color: INK, lineHeight: 1, letterSpacing: "-0.02em", paddingBottom: 6 }}>
          {pad2(m + 1)}
        </span>
        <span style={{ fontFamily: HELV, fontSize: TYPE.small, fontWeight: 500, color: "rgba(26,26,24,0.5)", letterSpacing: "0.04em", paddingBottom: 10 }}>
          {y}
        </span>
      </div>
    </div>
  );
}
