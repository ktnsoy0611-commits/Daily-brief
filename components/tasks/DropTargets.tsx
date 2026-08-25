"use client";

import { NAV_H, PAPER } from "@/lib/constants";
import { SPACE } from "@/lib/tokens";

// ★★図形を**掴んでいるあいだ**だけ右下から出てくる的(第44巡に DRIFT で作り、
// 第54巡に GRAVITY へも広げたので共通部品へ切り出した)。
//   上 = 口   … 飲み込む。DRIFT では「タスクにする」、GRAVITY では「完了」。
//   下 = ゴミ箱 … 捨てる。どちらの層でも「削除」。
// 見た目と動き(滑り出す・ホバーで反応する・離した瞬間のアクション)は
// `app/globals.css` の `.drift-target` が持つ。ここは器と当たり判定だけ。

export type DropTarget = "trash" | "mouth" | null;

/** 的の当たり判定。指の座標(clientX/Y)が的の矩形＋遊びの中にあるか。 */
const PAD = 14;
export function targetAt(
  mouth: HTMLElement | null, trash: HTMLElement | null, cx: number, cy: number,
): DropTarget {
  const inR = (el: HTMLElement | null) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return cx >= r.left - PAD && cx <= r.right + PAD && cy >= r.top - PAD && cy <= r.bottom + PAD;
  };
  if (inR(mouth)) return "mouth";
  if (inR(trash)) return "trash";
  return null;
}

/** 離した瞬間のアクションの合図(CSS の `[data-fire]`)。 */
export const FIRE_MS = 460;
export function fireTarget(el: HTMLElement | null) {
  if (!el) return;
  el.setAttribute("data-fire", "");
  window.setTimeout(() => el.removeAttribute("data-fire"), FIRE_MS);
}

export function DropTargets({ show, hover, mouthRef, trashRef }: {
  /** 掴んでいるあいだ true(滑り出す)。 */
  show: boolean;
  hover: DropTarget;
  mouthRef: React.MutableRefObject<HTMLDivElement | null>;
  trashRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  return (
    <div style={{
      position: "absolute", right: SPACE.lg - 2, bottom: `calc(${NAV_H} + ${SPACE.md}px)`,
      display: "flex", flexDirection: "column", gap: SPACE.md + 2,
      pointerEvents: "none", zIndex: 4,
    }}>
      <div ref={mouthRef} className={`drift-target${show ? " in" : ""}${hover === "mouth" ? " hot" : ""}`} data-kind="mouth">
        <MouthMark />
      </div>
      <div ref={trashRef} className={`drift-target${show ? " in" : ""}${hover === "trash" ? " hot" : ""}`} data-kind="trash">
        <TrashMark />
      </div>
    </div>
  );
}

/** ★口。抽象的なレンズ状(閉じた口)。ホバーで開き、離すと噛む(CSS)。 */
function MouthMark() {
  return (
    <svg width={30} height={30} viewBox="0 0 30 30" aria-hidden focusable="false">
      <path className="mouth-lip" d="M3 15 Q15 8 27 15 Q15 22 3 15 Z" fill={PAPER} />
    </svg>
  );
}
/** ★ゴミ箱。抽象的な漏斗(逆三角)＋上の帯。ホバーで震える(CSS)。 */
function TrashMark() {
  return (
    <svg width={30} height={30} viewBox="0 0 30 30" aria-hidden focusable="false">
      <rect x={5} y={6} width={20} height={3.4} fill={PAPER} />
      <path d="M6 11 H24 L18 25 H12 Z" fill={PAPER} />
    </svg>
  );
}
