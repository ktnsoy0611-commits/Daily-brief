"use client";

import { useEffect, useMemo, useState } from "react";
import { SolidCanvas } from "@/components/tasks/SolidCanvas";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { MAST_H, NAV_H, SANS, TAB_PAD_TOP } from "@/lib/constants";
import { pushGround } from "@/lib/ground";
import { haptic } from "@/lib/helpers";
import { specOf } from "@/lib/taskSize";
import { resolveTag } from "@/lib/taskTags";
import { SPACE, TYPE } from "@/lib/tokens";
import type { AppState, Task } from "@/lib/types";

// ★地中(UNDERGROUND)。地表の穴に潜った先で、**その日のタスクを実務として
// 片付ける**面。ここだけ地色が黒く、他の3層とは光の量が違う。
//
// 上の3層(DRIFT / GRAVITY / TOP)は「どれをやるか」を形と大きさで決める面で、
// 文字は図形に載っているぶんだけだった。ここは逆で、**読むための面**。
// 左に図形を縦に整列させ、その右に題と詳細を組む。
//
// ★CSS の 3D 変形は使わない。潜った感じは、穴から広がる円(`TaskSpace` の
// `clip-path`)と地色の黒さが作る。

/** 1行の高さ。図形の器もこれに合わせる。 */
const ROW_H = 64;
/** 左に置く図形の器。 */
const FIG = 44;

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const parse = (iso: string) => new Date(`${iso}T00:00:00`);

/** 地中の地色。真っ黒ではなく、`INK` をさらに沈めた土の色。 */
const SOIL = "#141412";
/** 黒地の上の文字。 */
const ON_SOIL = "rgba(250,250,249,0.92)";
const ON_SOIL_DIM = "rgba(250,250,249,0.44)";
/** 行を仕切る細い線。地層の目。 */
const SEAM = "rgba(250,250,249,0.10)";

export function Underground({ appState, persist, iso, active }: {
  appState: AppState;
  persist: (next: AppState) => void;
  /** いま潜っている日(YYYY-MM-DD)。 */
  iso: string | null;
  /** この層が画面を占めているか。地色を積むのはそのときだけ。 */
  active: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  // ★地色は `lib/ground.ts` の積み木で塗る。ここが直接 html を触らない
  //   (全画面の面を作ったら `pushGround` を呼ぶ、が既存の約束)。
  useEffect(() => {
    if (!active) return;
    return pushGround(SOIL, "app");
  }, [active]);

  const list = useMemo(
    () => (iso ? (appState.tasks ?? []).filter((t) => t.dueDate === iso) : []),
    [appState.tasks, iso],
  );
  const open = list.find((t) => t.id === openId) ?? null;
  const d = iso ? parse(iso) : null;

  const patch = (id: string, p: Partial<ComposerData>) => {
    const next = structuredClone(appState);
    const t = next.tasks.find((x) => x.id === id);
    if (t) Object.assign(t, p);
    persist(next);
  };
  const complete = (t: Task, final: ComposerData) => {
    const next = structuredClone(appState);
    const x = next.tasks.find((y) => y.id === t.id);
    if (x) { Object.assign(x, final); x.done = true; x.doneAt = new Date().toISOString(); }
    persist(next);
    setOpenId(null);
  };
  const remove = (id: string) => {
    const next = structuredClone(appState);
    next.tasks = next.tasks.filter((x) => x.id !== id);
    persist(next);
    setOpenId(null);
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: SOIL, overflow: "hidden" }}>
      {/* 日付は大きく。ここは読むための面なので、見出しも読ませる。 */}
      <div style={{
        position: "absolute", top: `calc(${TAB_PAD_TOP} + ${SPACE.md}px)`, left: 16, right: 16,
        display: "flex", alignItems: "baseline", gap: SPACE.md,
      }}>
        <span style={{ fontFamily: SANS, fontSize: TYPE.display, fontWeight: 700, color: ON_SOIL, lineHeight: 1 }}>
          {d ? `${d.getMonth() + 1}.${d.getDate()}` : "—"}
        </span>
        <span style={{ fontFamily: SANS, fontSize: TYPE.small, fontWeight: 700, letterSpacing: "0.18em", color: ON_SOIL_DIM }}>
          {d ? WD[d.getDay()] : ""}
        </span>
        <span style={{
          marginLeft: "auto", fontFamily: SANS, fontSize: TYPE.micro, fontWeight: 700,
          letterSpacing: "0.18em", color: ON_SOIL_DIM,
        }}>UNDER</span>
      </div>

      <div data-under-list style={{
        position: "absolute",
        top: `calc(${TAB_PAD_TOP} + ${MAST_H}px + ${SPACE.sm}px)`,
        left: 16, right: 16, bottom: `calc(${NAV_H} + ${SPACE.sm}px)`,
        overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain",
      }}>
        {list.length === 0 && (
          <div style={{ fontFamily: SANS, fontSize: TYPE.body, color: ON_SOIL_DIM, paddingTop: SPACE.xxl }}>
            この日には何も埋まっていない。
          </div>
        )}
        {list.map((t) => (
          <button
            key={t.id}
            onClick={() => { haptic(8); setOpenId(t.id); }}
            style={{
              display: "flex", alignItems: "center", gap: SPACE.lg, width: "100%",
              minHeight: ROW_H, padding: `${SPACE.sm}px 0`, background: "none",
              border: "none", borderBottom: `1px solid ${SEAM}`, cursor: "pointer", textAlign: "left",
            }}>
            {/* 左に図形。地上でどう見えているかと同じ顔で並ぶ。 */}
            <span style={{ flexShrink: 0, width: FIG, height: FIG, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <SolidCanvas
                w={FIG} h={FIG}
                paint={{
                  spec: specOf(t), view: "tag", title: t.title,
                  tag: resolveTag(t.tag, t.id, t.title, t.context, t.belongings, t.note),
                }}
              />
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{
                display: "block", fontFamily: SANS, fontSize: TYPE.lead, fontWeight: 700,
                color: t.done ? ON_SOIL_DIM : ON_SOIL, lineHeight: 1.35,
                textDecoration: t.done ? "line-through" : "none",
              }}>{t.title || "無題"}</span>
              {(t.dueTime || t.note || (t.subtasks?.length ?? 0) > 0) && (
                <span style={{
                  display: "block", marginTop: SPACE.xs, fontFamily: SANS, fontSize: TYPE.small,
                  color: ON_SOIL_DIM, letterSpacing: "0.04em",
                  overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                }}>
                  {[t.dueTime, t.subtasks?.length ? `手順 ${t.subtasks.filter((s) => !s.done).length}` : "", t.note]
                    .filter(Boolean).join(" ・ ")}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {open && (
        <TaskComposer
          key={open.id}
          data={open}
          mode="task"
          onCommit={(x) => patch(open.id, x)}
          onConfirm={(x) => complete(open, x)}
          onDelete={() => remove(open.id)}
          // ★★閉じたら**必ず開いている印を下ろす**(2026-08-24)。
          //   `patch` は書いて保存するだけで、`openId` を下ろさなかったため
          //   `TaskComposer` が**一度も外れなかった**。実害が2つ出ていた:
          //     ・吸い込みの円は半径0まで縮まない(帰り先の丸の大きさで止まる)
          //       ので、外れないまま**黒い丸が残って見えた**。
          //     ・入力画面が html に立てる `[data-overlay]` も外れず、
          //       タスクアプリの器が触りを握れないまま = **上下スワイプが
          //       効かない**。実機で報告された2件は、どちらもこれ1つが原因。
          onClose={(x) => { patch(open.id, x); setOpenId(null); }}
        />
      )}
    </div>
  );
}
