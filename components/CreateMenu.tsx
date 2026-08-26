"use client";

import { SPACE, TYPE, RADIUS } from "@/lib/tokens";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { TabIcon } from "@/components/TabIcons";
import { Press } from "@/components/Button";
import { CAP } from "@/components/tasks/Popover";
import { INK, PAPER } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { ms, T_OUT } from "@/lib/motion";

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
//
// ★★**閉じる動きも入力画面と同じ作法**(2026-08-23)。丸へ吸い込む円を
//   `--t-out` かけて縮め、その時間だけ待ってから呼び側へ知らせて外す
//   (`components/tasks/TaskComposer.tsx` の `shrink`/`leave` と対)。
//
// ★★**RECORD/TASK は輪の中心(＝押した丸)から円周へ向かう半径の線上に
//   配置する**(2026-08-23にユーザー指定)。文字も半径の角度へ傾ける。
//   ただし角度がそのままだと画面の左上へ向かう扇形は文字が上下逆さに
//   読めてしまう(CSSのrotateは180°付近で天地が反転する)ので、
//   文字自身には180°の補正を掛けて読める向きへ戻す(`legibleAngle`)。
//   位置(半径の向き)と文字の傾きを別の数として持つのはそのため。

/** 押した丸の場所。ここを中心に円が広がる。 */
export interface MenuAt { x: number; y: number; w: number; h: number }

/** 円の大きさ。中の2つが収まるだけ。 */
const R = 172;

/** 0°=右・時計回り。文字が逆さに見える範囲(90°〜270°)だけ180°戻す。 */
function legibleAngle(deg: number) {
  const n = ((deg % 360) + 360) % 360;
  return n > 90 && n < 270 ? n - 180 : n;
}

export function CreateMenu({ at, onRecord, onTask, onClose }: {
  at: MenuAt;
  onRecord: () => void;
  /** 押した要素を渡す — 入力画面がその場所から広がる。 */
  onTask: () => void;
  onClose: () => void;
}) {
  const discRef = useRef<HTMLDivElement | null>(null);
  /** TASK の丸。入力画面はここから広がる。 */
  const taskRef = useRef<HTMLSpanElement | null>(null);
  /** 二重に閉じ始めない(タップ連打・選択と外タップの競合)よう見張る。 */
  const closingRef = useRef(false);
  const cx = at.x + at.w / 2;
  const cy = at.y + at.h / 2;
  const btnR = Math.round(at.w / 2);

  // ★丸の大きさから広げる。
  useLayoutEffect(() => {
    const el = discRef.current;
    if (!el) return;
    el.style.setProperty("--rev", `circle(${btnR}px at 50% 50%)`);
    delete el.dataset.rev;
    void el.offsetWidth;
    el.dataset.rev = "in";
    el.style.setProperty("--rev", `circle(${R}px at 50% 50%)`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at.w]);

  /** 丸へ吸い込んでから呼び側に閉じたことを伝える。 */
  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const el = discRef.current;
    if (el) {
      el.style.setProperty("--rev", `circle(${R}px at 50% 50%)`);
      delete el.dataset.rev;
      void el.offsetWidth;
      el.dataset.rev = "out";
      el.style.setProperty("--rev", `circle(${btnR}px at 50% 50%)`);
    }
    window.setTimeout(onClose, ms(T_OUT));
  };

  if (typeof document === "undefined") return null;

  const item = (
    label: string, icon: "record" | "pile", cue: string, angleDeg: number,
    run: () => void, ref?: React.Ref<HTMLSpanElement>,
  ) => (
    // ★★`tc-cue`(登場の時間差アニメーション)は`transform`を`none`まで
    //   動かして止める(`fill-mode:both`)。**半径の向きの回転(下)と同じ
    //   要素に載せると、アニメーションの終値が回転を上書きして消してしまう**
    //   ので、時間差は回転の無い専用の入れ子(下から2番目)に持たせる。
    <div
      key={label}
      style={{ position: "absolute", left: R, top: R, width: 0, height: 0, transform: `rotate(${angleDeg}deg)` }}
    >
      <div style={{ position: "absolute", left: btnR + 22, top: 0, transform: "translateY(-50%)" }}>
        <div className={`tc-cue ${cue}`}>
          <Press
            onPress={() => { haptic(10); run(); }}
            aria-label={label}
            style={{ display: "flex", alignItems: "center", gap: SPACE.md, padding: `${SPACE.sm}px ${SPACE.xs}px`, color: PAPER }}
          >
            <span style={{
              ...CAP, fontSize: TYPE.small, whiteSpace: "nowrap", display: "inline-block",
              transform: `rotate(${legibleAngle(angleDeg) - angleDeg}deg)`,
            }}>{label}</span>
            <span ref={ref} className="tc-lamp" style={{
              width: 34, height: 34, borderRadius: RADIUS.circle, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `inset 0 0 0 1.5px rgba(250,250,249,0.34)`,
              transform: `rotate(${-angleDeg}deg)`,
            }}>
              <TabIcon name={icon} color={PAPER} size={17} />
            </span>
          </Press>
        </div>
      </div>
    </div>
  );

  return createPortal((
    // ★輪の外を触ったら閉じる。丸そのものより上、入力画面(59)より下。
    <div
      onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); close(); } }}
      data-paint
      style={{ position: "fixed", inset: 0, zIndex: 58 }}
    >
      <div ref={discRef} data-create-menu style={{
        position: "absolute",
        left: Math.round(cx - R), top: Math.round(cy - R), width: R * 2, height: R * 2,
        borderRadius: RADIUS.circle, background: INK,
      }}>
        {/* ★半径は丸(押した場所)から円周へ。左上の扇へ2本(RECORDが上寄り)。 */}
        {item("RECORD", "record", "tc-cue-1", 245, () => { close(); onRecord(); })}
        {item("TASK", "pile", "tc-cue-2", 205, () => { close(); onTask(); }, taskRef)}
      </div>
    </div>
  ), document.body);
}
