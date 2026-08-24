"use client";

import { useEffect, useMemo, useState } from "react";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { UnderCylinder } from "@/components/tasks/UnderCylinder";
import { HELV, NAV_H, SANS, SWISS_LG, TAB_PAD_TOP } from "@/lib/constants";
import { pushGround } from "@/lib/ground";
import { haptic } from "@/lib/helpers";
import { SPACE, TYPE } from "@/lib/tokens";
import type { AppState, Task } from "@/lib/types";

// ★地中(UNDERGROUND)。地表の穴に潜った先。**穴の中**のイメージで、左に穴の
// 断面を模した少しだけ傾いたシリンダー(薄いグレー)があり、そこへその日の
// タスクが図形になって落ちて積もる(`UnderCylinder`)。右に日付と一覧。
//
// 上の3層は「どれをやるか」を形と大きさで選ぶ面。ここは**その日を片付ける**面
// なので、地色は黒く、光の量が違う。日付はスイス・スタイルの大きな Helvetica。
//
// ★CSS の 3D 変形は使わない。潜った感じは、カメラの pitch(`TaskSpace`)と
// 地色の黒さが作る。

const WD_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const parse = (iso: string) => new Date(`${iso}T00:00:00`);
const pad2 = (n: number) => String(n).padStart(2, "0");

/** 地中の地色。真っ黒ではなく、土の色。 */
const SOIL = "#141412";
/** シリンダーの地(薄いグレー)。 */
const CYL = "#3A3A37";
/** 黒地の上の文字。 */
const ON_SOIL = "rgba(250,250,249,0.94)";
const ON_SOIL_DIM = "rgba(250,250,249,0.40)";
const SEAM = "rgba(250,250,249,0.10)";

export function Underground({ appState, persist, iso, active }: {
  appState: AppState;
  persist: (next: AppState) => void;
  iso: string | null;
  active: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    return pushGround(SOIL, "app");
  }, [active]);

  const list = useMemo(
    () => (iso ? (appState.tasks ?? []).filter((t) => t.dueDate === iso) : []),
    [appState.tasks, iso],
  );
  const undone = useMemo(() => list.filter((t) => !t.done), [list]);
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
      {/* ── 日付の見出し。スイス・スタイルの大きな Helvetica。 ── */}
      <div style={{
        position: "absolute", top: `calc(${TAB_PAD_TOP} + ${SPACE.md}px)`, left: SPACE.lg, right: SPACE.lg,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.sm }}>
          <span style={{ fontFamily: HELV, fontSize: SWISS_LG, fontWeight: 700, color: ON_SOIL, lineHeight: 0.82, letterSpacing: "-0.04em" }}>
            {d ? d.getDate() : "—"}
          </span>
          <span style={{ fontFamily: HELV, fontSize: TYPE.small, fontWeight: 700, letterSpacing: "0.14em", color: ON_SOIL_DIM }}>
            {d ? WD_EN[d.getDay()] : ""}
          </span>
        </div>
        <div style={{ fontFamily: HELV, fontSize: TYPE.small, fontWeight: 500, letterSpacing: "0.12em", color: ON_SOIL_DIM, marginTop: 2 }}>
          {d ? `${d.getFullYear()}.${pad2(d.getMonth() + 1)}` : ""}　·　UNDER
        </div>
      </div>

      {/* ── 左: 穴の中のシリンダー。その日のタスクが落ちて積もる。 ── */}
      <div style={{
        position: "absolute", left: 0, width: "44%",
        top: `calc(${TAB_PAD_TOP} + 120px)`, bottom: `calc(${NAV_H} + ${SPACE.md}px)`,
        paddingLeft: SPACE.sm,
      }}>
        <UnderCylinder tasks={undone} active={active} tint={CYL} />
      </div>

      {/* ── 右: その日の一覧(読むための面)。 ── */}
      <div data-under-list style={{
        position: "absolute", right: 0, width: "56%",
        top: `calc(${TAB_PAD_TOP} + 120px)`, bottom: `calc(${NAV_H} + ${SPACE.md}px)`,
        paddingRight: SPACE.lg, paddingLeft: SPACE.sm,
        overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain",
      }}>
        {list.length === 0 && (
          <div style={{ fontFamily: SANS, fontSize: TYPE.body, color: ON_SOIL_DIM, paddingTop: SPACE.lg }}>
            この日には何も埋まっていない。
          </div>
        )}
        {list.map((t) => (
          <button
            key={t.id}
            onClick={() => { haptic(8); setOpenId(t.id); }}
            style={{
              display: "block", width: "100%", padding: `${SPACE.md}px 0`,
              background: "none", border: "none", borderBottom: `1px solid ${SEAM}`,
              cursor: "pointer", textAlign: "left",
            }}>
            <span style={{
              display: "block", fontFamily: SANS, fontSize: TYPE.body, fontWeight: 700,
              color: t.done ? ON_SOIL_DIM : ON_SOIL, lineHeight: 1.35,
              textDecoration: t.done ? "line-through" : "none",
            }}>{t.title || "無題"}</span>
            {(t.dueTime || (t.subtasks?.length ?? 0) > 0) && (
              <span style={{
                display: "block", marginTop: SPACE.xs, fontFamily: HELV, fontSize: TYPE.micro,
                color: ON_SOIL_DIM, letterSpacing: "0.06em",
              }}>
                {[t.dueTime, t.subtasks?.length ? `${t.subtasks.filter((s) => !s.done).length} STEPS` : ""].filter(Boolean).join("　·　")}
              </span>
            )}
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
          onClose={(x) => { patch(open.id, x); setOpenId(null); }}
        />
      )}
    </div>
  );
}
