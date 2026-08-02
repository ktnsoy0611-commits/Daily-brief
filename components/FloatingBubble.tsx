"use client";

import type { CSSProperties, ReactNode } from "react";
import { INK, PAPER, SANS, SOFT_SHADOW_LG } from "@/lib/constants";
import { haptic, hashStr } from "@/lib/helpers";

// ★「ふわふわ漂う候補」の共通部品。インボックス(声のメモから作った候補)と
// タスクの付随提案(新幹線は取った? 会議室は取った?)の両方で使う。
// どちらも「AIが差し出したもので、まだ自分のものになっていない」という
// 同じ状態を表すので、見た目と動きを共有する(globals.css の inbox-drift)。

// 漂う位置と速さは id から決める。毎回同じ場所に落ち着き、再描画で飛び回らない。
// 縦は順番で配り、重ならないようにする。
export function floatStyle(id: string, index: number, total: number): CSSProperties {
  const h = hashStr(id);
  const left = 8 + (h % 34);            // 8〜42%
  const top = (index + 0.5) * (100 / Math.max(total, 1));
  const dur = 5.5 + (h % 20) / 10;      // 5.5〜7.4秒
  const delay = -((h >> 3) % 40) / 10;  // 位相をずらす
  return {
    position: "absolute",
    left: `${left}%`,
    top: `calc(${top}% - 26px)`,
    animation: `inbox-drift ${dur}s ease-in-out ${delay}s infinite`,
  };
}

export function FloatingBubble({ label, dotColor, style, onTap, children }: {
  label: string;
  dotColor: string;
  style: CSSProperties;
  onTap: () => void;
  children?: ReactNode;
}) {
  return (
    <button onClick={() => { haptic(8); onTap(); }} style={{
      ...style,
      maxWidth: "62%", textAlign: "left", cursor: "pointer", border: "none",
      background: PAPER, borderRadius: 999, padding: "10px 16px 10px 12px", boxShadow: SOFT_SHADOW_LG,
      display: "flex", alignItems: "center", gap: 9,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
      <span style={{
        fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: INK,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{label}</span>
      {children}
    </button>
  );
}
