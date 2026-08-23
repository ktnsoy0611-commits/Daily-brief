"use client";

import { RADIUS, TYPE } from "@/lib/tokens";
import { SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";

// ★タスク(候補)を手で足す丸ボタンは撤去した(2026-08-23)。タスクの追加は
// タブバー右端の輪(CreateMenu)からどのアプリでもできるようになったため。
// 候補(DRIFT)の追加はAIが行い、ユーザーは承認/却下するだけなので、
// 候補タブにも手で足すボタンは置かない。

/** 何も無いときだけ出す、動作確認用のダミー投入。完成時に撤去する。 */
export function DemoSeedButton({ label, onSeed, lifted }: { label: string; onSeed: () => void; lifted?: boolean }) {
  return (
    <button
      onClick={() => { haptic(8); onSeed(); }}
      style={{
        position: "absolute", left: "50%", transform: "translateX(-50%)", zIndex: 26,
        bottom: lifted ? "calc(var(--nav-h) + 22px)" : 22,
        padding: "12px 16px", borderRadius: RADIUS.pill, border: "1px solid rgba(26,26,24,0.16)",
        background: "transparent", color: "rgba(26,26,24,0.5)", cursor: "pointer",
        fontFamily: SANS, fontSize: TYPE.small, fontWeight: 700, letterSpacing: "0.06em", whiteSpace: "nowrap",
      }}>{label}</button>
  );
}
