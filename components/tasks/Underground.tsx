"use client";

import { useEffect, useMemo, useState } from "react";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { UnderHole } from "@/components/tasks/UnderHole";
import { BD_GREY, HELV, INK, MUTED, NAV_H, SANS, SWISS_LG, TAB_PAD_TOP } from "@/lib/constants";
import { pushGround } from "@/lib/ground";
import { haptic } from "@/lib/helpers";
import { SPACE, TYPE } from "@/lib/tokens";
import type { AppState, Task } from "@/lib/types";

// ★地中(UNDERGROUND)。地表の穴に潜った先。**画面上部に地表(明るい帯)**が
// 見え、その左に**黒字で日付・曜日**。そこから下へ**穴の断面(グレーの帯)が
// 地表と繋がって**降り、その日のタスクが図形になって落ちて積もる(`UnderHole`)。
// 図形を落とし切ると曜日の文字(枠なし)が降ってきて蓋をする。右にその日の一覧。
//
// 上の3層は「どれをやるか」を形と大きさで選ぶ面。ここは**その日を片付ける**面
// なので、地の色は黒く(土)、光の量が違う。日付はスイスの大きな Helvetica。

const WD_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const parse = (iso: string) => new Date(`${iso}T00:00:00`);
const pad2 = (n: number) => String(n).padStart(2, "0");

/** 地中の地色。真っ黒ではなく、土の色。 */
const SOIL = "#141412";
/** 地表(明るい帯)の下端 = 穴の断面が始まる線。ここで地表と断面が繋がる。 */
const SURFACE = `calc(${TAB_PAD_TOP} + 116px)`;
/** 黒地の上の文字。 */
const ON_SOIL = "rgba(250,250,249,0.94)";
const ON_SOIL_DIM = "rgba(250,250,249,0.40)";
const SEAM = "rgba(250,250,249,0.10)";

export function Underground({ appState, persist, iso, active, drop }: {
  appState: AppState;
  persist: (next: AppState) => void;
  iso: string | null;
  active: boolean;
  /** 図形を落とし始めてよいか(地面が画面に入ってくる位相で true)。 */
  drop?: boolean;
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

  const wd = d ? WD_EN[d.getDay()] : "";
  return (
    <div style={{ position: "absolute", inset: 0, background: SOIL, overflow: "hidden" }}>
      {/* ── 地表(明るい帯)。ここより下が地中(土)。穴の断面はこの下端から降りる。 ── */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: SURFACE, background: BD_GREY }}>
        {/* ★境目はぼかさない(ユーザー指定)。地表と土は硬い線で分ける。 */}
        {/* 日付・曜日は**黒字**で地表の左に。 */}
        <div style={{ position: "absolute", top: `calc(${TAB_PAD_TOP} + ${SPACE.sm}px)`, left: SPACE.lg }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.sm }}>
            <span style={{ fontFamily: HELV, fontSize: SWISS_LG, fontWeight: 700, color: INK, lineHeight: 0.82, letterSpacing: "-0.04em" }}>
              {d ? d.getDate() : "—"}
            </span>
            <span style={{ fontFamily: HELV, fontSize: TYPE.small, fontWeight: 700, letterSpacing: "0.14em", color: INK }}>
              {wd}
            </span>
          </div>
          <div style={{ fontFamily: HELV, fontSize: TYPE.micro, fontWeight: 500, letterSpacing: "0.12em", color: MUTED, marginTop: 2 }}>
            {d ? `${d.getFullYear()}.${pad2(d.getMonth() + 1)}` : ""}
          </div>
        </div>
      </div>

      {/* ── 左: 穴の断面。地表の下端から降り、その日のタスクが落ちて積もる。 ── */}
      <div style={{
        position: "absolute", left: 0, width: "44%",
        top: SURFACE, bottom: `calc(${NAV_H} + ${SPACE.md}px)`,
        paddingLeft: SPACE.sm,
      }}>
        <UnderHole tasks={undone} weekday={wd} active={active} drop={drop !== false} />
      </div>

      {/* ── 右: その日の一覧(読むための面)。 ── */}
      <div data-under-list style={{
        position: "absolute", right: 0, width: "56%",
        top: `calc(${SURFACE} + ${SPACE.sm}px)`, bottom: `calc(${NAV_H} + ${SPACE.md}px)`,
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
