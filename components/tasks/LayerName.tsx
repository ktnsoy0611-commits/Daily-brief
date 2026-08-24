"use client";

import { MAST_H, MUTED, SANS, TAB_PAD_TOP } from "@/lib/constants";
import { SPACE, TYPE } from "@/lib/tokens";

/**
 * 縦の空間の中の1層の名前(DRIFT / GRAVITY)。アプリ名の札(`Masthead`)の
 * **すぐ下**、右端に置く。
 *
 * ★アプリ名の札はカメラに乗らない(画面に固定。`TaskSpace`)が、こちらは
 * **層の持ち物なのでカメラと一緒に流れる** — いま自分が縦の空間のどこに
 * 居るかが、動いている最中も読める。
 *
 * ★別ファイルにしてあるのは循環参照を作らないため。`TaskSpace` が各層を
 * import しているので、層の側が `TaskSpace` から import し返してはいけない。
 */
export function LayerName({ text, right }: { text: string; right?: React.ReactNode }) {
  return (
    <div style={{
      position: "absolute", top: `calc(${TAB_PAD_TOP} + ${MAST_H}px + ${SPACE.sm}px)`, left: 16, right: 16, zIndex: 2,
      display: "flex", alignItems: "center", justifyContent: "flex-end", gap: SPACE.md, pointerEvents: "none",
    }}>
      <span style={{
        fontFamily: SANS, fontSize: TYPE.micro, fontWeight: 700, letterSpacing: "0.18em", color: MUTED,
      }}>{text}</span>
      {right && <span style={{ pointerEvents: "auto" }}>{right}</span>}
    </div>
  );
}
