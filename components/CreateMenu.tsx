"use client";

import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { TabIcon } from "@/components/TabIcons";
import { CAP, Press } from "@/components/tasks/Popover";
import { INK, PAPER } from "@/lib/constants";
import { haptic } from "@/lib/helpers";

// ★★**作るものを選ぶ輪**(2026-08-19・第28巡にユーザー指定)。
//
// タブバー右端の丸を押すと、その丸から**円が広がって** RECORD と TASK が
// 出てくる。どちらかを押すと、録音のオーバーレイか、タスクの入力画面へ。
// これで**タスクの追加が3つのアプリのどこからでもできる**ようになる
// (以前はタスクアプリの ＋ からしか作れなかった)。
//
// ★広がり方は入力画面と**同じ作法**にしてある —
//   円で切り抜く(`clip-path`)/ 曲線は `--ease-sheet` / 中身は時間差(`.tc-cue`)。
//   数字は `app/globals.css` の `:root` から。ここで新しい数字を作らないこと。

/** 押した丸の場所。ここを中心に円が広がる。 */
export interface MenuAt { x: number; y: number; w: number; h: number }

/** 円の大きさ。中の2つが収まるだけ。 */
const R = 172;

export function CreateMenu({ at, onRecord, onTask, onClose }: {
  at: MenuAt;
  onRecord: () => void;
  /** 押した要素を渡す — 入力画面がその場所から広がる。 */
  onTask: (from: Element | null) => void;
  onClose: () => void;
}) {
  const discRef = useRef<HTMLDivElement | null>(null);
  /** TASK の丸。入力画面はここから広がる。 */
  const taskRef = useRef<HTMLSpanElement | null>(null);
  const cx = at.x + at.w / 2;
  const cy = at.y + at.h / 2;

  // ★丸の大きさから広げる。閉じるときは呼び側が消すだけ(すぐ次の画面が覆う)。
  useLayoutEffect(() => {
    const el = discRef.current;
    if (!el) return;
    el.style.setProperty("--rev", `circle(${Math.round(at.w / 2)}px at 50% 50%)`);
    delete el.dataset.rev;
    void el.offsetWidth;
    el.dataset.rev = "in";
    el.style.setProperty("--rev", `circle(${R}px at 50% 50%)`);
  }, [at.w]);

  if (typeof document === "undefined") return null;

  const item = (
    label: string, icon: "record" | "pile", cue: string,
    run: () => void, ref?: React.Ref<HTMLSpanElement>,
  ) => (
    <Press
      key={label}
      className={`tc-cue ${cue}`}
      onPress={() => { haptic(10); run(); }}
      aria-label={label}
      style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10,
        padding: "9px 4px", color: PAPER,
      }}
    >
      <span style={{ ...CAP, fontSize: 10 }}>{label}</span>
      <span ref={ref} className="tc-lamp" style={{
        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `inset 0 0 0 1.5px rgba(250,250,249,0.34)`,
      }}>
        <TabIcon name={icon} color={PAPER} size={17} />
      </span>
    </Press>
  );

  return createPortal((
    // ★輪の外を触ったら閉じる。丸そのものより上、入力画面(59)より下。
    <div
      onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); onClose(); } }}
      style={{ position: "fixed", inset: 0, zIndex: 58 }}
    >
      <div ref={discRef} data-create-menu style={{
        position: "absolute",
        left: Math.round(cx - R), top: Math.round(cy - R), width: R * 2, height: R * 2,
        borderRadius: "50%", background: INK,
        display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "flex-end",
        // 丸(タブバーの右端)の上に2つ積む。右端は丸の中心に揃える。
        padding: `0 ${Math.round(R - at.w / 2)}px ${Math.round(R + at.h / 2 + 6)}px 0`,
      }}>
        {item("RECORD", "record", "tc-cue-1", () => { onClose(); onRecord(); })}
        {item("TASK", "pile", "tc-cue-2", () => { const el = taskRef.current; onClose(); onTask(el); }, taskRef)}
      </div>
    </div>
  ), document.body);
}
