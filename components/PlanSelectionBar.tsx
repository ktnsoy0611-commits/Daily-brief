"use client";

import { RADIUS, TYPE } from "@/lib/tokens";
import { INK, NAV_OFFSET, PAPER, SANS, SOFT_SHADOW_LG } from "@/lib/constants";
import { haptic, img } from "@/lib/helpers";
import type { AppState, PlanSelection } from "@/lib/types";

// タブを跨いで持ち回す選択の「目印」。以前はここに確定ボタン(「バインダーへ」)と
// 内訳シートを持たせていたが、確定の操作はダッシュボード(画面下から引き上げる
// 引き出し)の「今日を終える」へ一本化したため、この浮遊UIは
// **いま何件選んでいるかを示すだけ**の小さな目印に縮めた。タップすると
// ダッシュボードが開き、そこで内訳の確認・1件ずつ外す・締める、がすべてできる。
export function SelectionMarker({ appState, selection, onOpen }: {
  appState: AppState;
  selection: PlanSelection;
  onOpen: () => void;
}) {
  const entries = selection.itemIds
    .map((id) => appState.items.find((x) => x.id === id))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const count = entries.length;
  if (count === 0) return null;
  // 直近に選んだ2枚だけを小さく重ねて「束」を示す。
  const shown = entries.slice(-2);

  return (
    <button
      onClick={() => { haptic(8); onOpen(); }}
      aria-label={`選択中の${count}件を見る`}
      style={{
        // navのピル(zIndex:25)より手前。nav手前のグラデーション(15)にも
        // 覆われないよう26にする(このプロジェクトのzIndex規約)。
        position: "fixed", right: 16, bottom: `calc(${NAV_OFFSET} + 8px)`, zIndex: 26,
        display: "flex", alignItems: "center", gap: 8, background: PAPER, border: "none",
        borderRadius: RADIUS.pill, padding: "8px 12px 8px 8px", boxShadow: SOFT_SHADOW_LG, cursor: "pointer",
      }}
    >
      <span style={{ position: "relative", width: 30, height: 26, flexShrink: 0 }}>
        {shown.map((it, i) => (
          <span key={it.id} style={{
            position: "absolute", top: 0, left: 0, width: 22, height: 22, borderRadius: RADIUS.md, overflow: "hidden",
            border: "2px solid #fff", boxShadow: "0 2px 5px rgba(26,26,24,0.24)",
            transform: `rotate(${i === 0 ? -7 : 5}deg) translate(${i * 6}px, ${i * -1}px)`, zIndex: i,
            background: it.color ?? "#5A5A54",
          }}>
            {it.images?.[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img(it.images[0], 60, 60)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            )}
          </span>
        ))}
      </span>
      <span style={{ fontFamily: SANS, fontSize: TYPE.body, fontWeight: 700, color: INK, letterSpacing: "0.04em" }}>{count}</span>
    </button>
  );
}
