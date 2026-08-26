"use client";

import { SPACE, TYPE, WEIGHT, RADIUS, LEAD, TRACK } from "@/lib/tokens";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Press } from "@/components/Button";
import { INK, LATIN, PAPER } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { ms, T_OUT } from "@/lib/motion";

// ★★**このアプリの入口の輪**(2026-08-19・第28巡にユーザー指定)。
//
// タブバー右端の丸を押すと、その丸から**円が広がって** RECORD / TASKS /
// SETTING が出てくる。録音のオーバーレイ・タスクの入力画面・設定画面へ。
// これで**タスクの追加が3つのアプリのどこからでもできる**ようになる
// (以前はタスクアプリの ＋ からしか作れなかった)。
//
// ★★**設定もここに入れた**(2026-08-26・第68巡にユーザー指定)。以前は各画面の
//   `Masthead` 右上に歯車の丸を常設していたが、常に見えている必要のない入口を
//   7画面ぶん占め続けていた。**入口は1か所に集める**。
//
// ★★**アイコンは持たない。文字だけ**(同巡にユーザー指定)。3つを見分けるのに
//   絵は要らず、絵があると「文字＋絵」の2つの塊が半径の線上で競って、
//   輪の中心から放射する線が読み取れなくなる。
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

/** 円の大きさ。中の3つが収まるだけ。★目盛りの外（極座標の半径） */
const R = 172;

/** 0°=右・時計回り。文字が逆さに見える範囲(90°〜270°)だけ180°戻す。 */
function legibleAngle(deg: number) {
  const n = ((deg % 360) + 360) % 360;
  return n > 90 && n < 270 ? n - 180 : n;
}

export function CreateMenu({ at, onRecord, onTask, onSetting, onClose }: {
  at: MenuAt;
  onRecord: () => void;
  onTask: () => void;
  onSetting: () => void;
  onClose: () => void;
}) {
  const discRef = useRef<HTMLDivElement | null>(null);
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

  const item = (label: string, cue: string, angleDeg: number, run: () => void) => (
    // ★★`tc-cue`(登場の時間差アニメーション)は`transform`を`none`まで
    //   動かして止める(`fill-mode:both`)。**半径の向きの回転(下)と同じ
    //   要素に載せると、アニメーションの終値が回転を上書きして消してしまう**
    //   ので、時間差は回転の無い専用の入れ子(下から2番目)に持たせる。
    <div
      key={label}
      style={{ position: "absolute", left: R, top: R, width: 0, height: 0, transform: `rotate(${angleDeg}deg)` }}
    >
      {/* ★目盛りの外（半径の線の始まり。押した丸の縁 `btnR` から `SPACE.xl` 離す
          ＝丸に文字が乗らない最小の距離。余白ではなく極座標の半径） */}
      <div style={{ position: "absolute", left: btnR + SPACE.xl, top: 0, transform: "translateY(-50%)" }}>
        <div className={`tc-cue ${cue}`}>
          <Press
            onPress={() => { haptic(10); run(); }}
            aria-label={label}
            style={{ padding: `${SPACE.md}px ${SPACE.sm}px`, color: PAPER }}
          >
            <span style={{
              fontFamily: LATIN, fontSize: TYPE.lead, fontWeight: WEIGHT.heavy,
              lineHeight: LEAD.flat, letterSpacing: TRACK.caps,
              whiteSpace: "nowrap", display: "inline-block",
              transform: `rotate(${legibleAngle(angleDeg) - angleDeg}deg)`,
            }}>{label}</span>
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
        {/* ★半径は丸(押した場所)から円周へ。左上の扇へ**35°ずつ3本**。
            上から RECORD → TASKS → SETTING(いちばん水平＝いちばん指に近い)。 */}
        {item("RECORD", "tc-cue-1", 255, () => { close(); onRecord(); })}
        {item("TASKS", "tc-cue-2", 220, () => { close(); onTask(); })}
        {item("SETTING", "tc-cue-3", 185, () => { close(); onSetting(); })}
      </div>
    </div>
  ), document.body);
}
