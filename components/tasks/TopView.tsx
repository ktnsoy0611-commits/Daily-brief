"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GeoText, geoTextWidth } from "@/components/GeoType";
import { LayerName } from "@/components/tasks/LayerName";
import { INK, MAST_H, NAV_H, PAPER, SANS, TAB_PAD_TOP } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { SPACE, TYPE } from "@/lib/tokens";
import { ymd } from "@/components/tasks/WhenSheet";
import type { Task } from "@/lib/types";

// ★地表(TOP VIEW)。真上から見下ろした平面図で、日付に対応した**黒い穴**が
// 規則的に並ぶ。穴の中には白く太い数字。穴の濃さがその日の量を示す。
//
// ★★ここは「予定を読む」ための面ではなく、**どこに掘るかを選ぶ**ための面。
// だから穴と数字しか無い。中身は穴に潜って(UNDERGROUND)から読む。
//
// ★CSS の 3D 変形は使わない。見下ろしている感じは、層の `scaleY` のすり替え
// (`TaskSpace`)が作る。ここは素直な平面。

/** 見せる期間の段。横に払うと切り替わる。**日数だけ**が縮尺で、並べ方は
 *  器の形から決まる(下の `packCols`)。 */
const SCALES = [
  { days: 3, label: "3日" },
  { days: 7, label: "1週" },
  { days: 28, label: "4週" },
] as const;

/** 穴がマスの中で占める割合。1.0 だと隣とくっつく。 */
const HOLE_FILL = 0.84;

/**
 * ★★列の数は**器の形から決める**(穴がいちばん大きくなる割り方を選ぶ)。
 *
 * 曜日に合わせて7列で固定すると、1週は**細い1行が広い野原の真ん中に
 * ぽつんと残る**(実際にそうなった)。ここは曜日を読む暦ではなく
 * 「どこを掘るか選ぶ地面」なので、器を埋める方が正しい。寄るほど穴が
 * 大きくなるのも、縮尺を変えた手ごたえとして効く。
 */
function packCols(n: number, w: number, h: number): number {
  if (n <= 1 || w <= 0 || h <= 0) return 1;
  let best = 1;
  let widest = -1;
  for (let c = 1; c <= n; c += 1) {
    const d = Math.min(w / c, h / Math.ceil(n / c));
    if (d > widest) { widest = d; best = c; }
  }
  return best;
}

/**
 * 穴に収まる数字の大きさ。★2桁と1桁で送りが違うので、**実際の字幅から
 * 逆算**する(`geoTextWidth`)。決め打ちの割合だと2桁が円からはみ出す。
 */
function digitSize(text: string, hole: number): number {
  const unit = geoTextWidth("0") || 1;
  const w = geoTextWidth(text) || unit;
  return Math.max(7, Math.min(hole * 0.46, (hole * 0.66 * unit) / w));
}
/** 横に払って段を変えるのに要る距離。 */
const SWIPE_PX = 44;

/**
 * その日の量 → 穴の濃さ。
 * ★★どの穴も**まず黒い穴として読めること**。濃淡は「その日にどれだけ
 * 入っているか」の**気配**であって、薄い穴を「無い」と読ませるためでは
 * ない(0.12 まで薄くしたら、空いている日が穴に見えなくなった)。
 */
const shadeOf = (n: number) => (n === 0 ? 0.46 : n === 1 ? 0.62 : n === 2 ? 0.74 : n >= 5 ? 1 : 0.86);

const addDays = (base: Date, n: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
};

export function TopView({ tasks, onDive }: {
  tasks: Task[];
  /** 穴をたたいた。潜る先の日付と、円を広げる中心(画面の座標)。 */
  onDive: (iso: string, from: DOMRect) => void;
}) {
  const [scaleIx, setScaleIx] = useState(1);
  const scale = SCALES[scaleIx];
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const swipeRef = useRef<{ x: number; y: number; done: boolean } | null>(null);

  // その日に何件あるか。予定日の無いものは数えない(穴は日付のものなので)。
  const countByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) {
      if (t.done || !t.dueDate) continue;
      m.set(t.dueDate, (m.get(t.dueDate) ?? 0) + 1);
    }
    return m;
  }, [tasks]);

  // 今日から始めて、段のぶんだけ日を並べる。
  const days = useMemo(() => {
    const base = new Date();
    return Array.from({ length: scale.days }, (_, i) => {
      const d = addDays(base, i);
      const iso = ymd(d);
      return { iso, n: d.getDate(), count: countByDay.get(iso) ?? 0, today: i === 0 };
    });
  }, [scale.days, countByDay]);


  // ★横に払って縮尺を変える。縦は器(カメラ)のものなので、横だけ見る。
  //   カメラ側は最初の8pxで軸を決めて横なら降りるので、ここと衝突しない。
  const onDown = (e: React.PointerEvent) => {
    swipeRef.current = { x: e.clientX, y: e.clientY, done: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const s = swipeRef.current;
    if (!s || s.done) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    s.done = true;
    // 左へ払う = もっと広く(先の日まで)。右へ払う = もっと寄る。
    setScaleIx((i) => Math.max(0, Math.min(SCALES.length - 1, i + (dx < 0 ? 1 : -1))));
    haptic(6);
  };
  const onUp = () => { swipeRef.current = null; };

  // 器の実寸から穴の直径を出す。
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const read = () => {
      // ★★`getBoundingClientRect()` は**変形後**の箱を返す。層は見下ろしへ
      //   移るあいだ `scaleY` で畳まれるので、これで測ると器が数十pxの
      //   高さに見え、割り付けが崩れる(実際に踏んだ: 593px の器が 38px に
      //   見えて、穴が7列の細い1行になった)。**変形を含まない**
      //   `offsetWidth/offsetHeight` で測ること。
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setSize((s) => (Math.abs(s.w - w) < 0.5 && Math.abs(s.h - h) < 0.5 ? s : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = packCols(scale.days, size.w, size.h);
  const rows = Math.ceil(scale.days / cols);
  const hole = Math.max(0, Math.min(size.w / cols, size.h / rows) * HOLE_FILL);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <LayerName text="TOP" right={
        <span style={{ fontFamily: SANS, fontSize: TYPE.micro, fontWeight: 700, letterSpacing: "0.12em", color: INK }}>
          {scale.label}
        </span>
      } />

      <div
        ref={fieldRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          position: "absolute",
          top: `calc(${TAB_PAD_TOP} + ${MAST_H}px + ${SPACE.xxl}px)`,
          left: SPACE.sm, right: SPACE.sm,
          bottom: `calc(${NAV_H} + ${SPACE.xl}px)`,
        }}>
        {days.map((d, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          return (
            <button
              key={d.iso}
              onClick={(e) => { haptic(8); onDive(d.iso, e.currentTarget.getBoundingClientRect()); }}
              aria-label={`${d.n}日を開く（${d.count}件）`}
              style={{
                position: "absolute",
                left: `${((col + 0.5) / cols) * 100}%`,
                top: `${((row + 0.5) / rows) * 100}%`,
                transform: "translate(-50%, -50%)",
                width: hole, height: hole, borderRadius: "50%",
                // ★穴。地面に開いた**空**なので、地色より濃い1色の濃淡だけで作る。
                //   縁も影も付けない(付けると「置いた円」に見える)。
                background: `color-mix(in srgb, ${INK} ${Math.round(shadeOf(d.count) * 100)}%, transparent)`,
                border: "none", padding: 0, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                // 今日だけ、穴の外に細い輪を置いて居場所を示す。
                outline: d.today ? `2px solid ${INK}` : "none",
                outlineOffset: 3,
              }}>
              {/* 数字は幾何アルファベット。汎用の書体は使わない。 */}
              <GeoText text={String(d.n)} size={Math.round(digitSize(String(d.n), hole))} color={PAPER} />
            </button>
          );
        })}
      </div>

    </div>
  );
}
