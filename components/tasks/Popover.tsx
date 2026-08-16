"use client";

import { INK, MUTED, PAPER, SANS } from "@/lib/constants";

// ★入力画面(TaskComposer)のポップオーバーの器。ツールバーの**直上**に、
// 画面幅いっぱいの紙を1枚置くだけ。角丸・影・OS標準の部品は使わない
// (ベタ塗りの矩形と直線だけ)。
//
// 位置は「親(ツールバーを含む下の帯)を position:relative にして bottom:100%」で
// 決める。親はキーボードのぶん持ち上がっているので、ポップオーバーも一緒に
// 動く(キーボードとの重なりを別途計算しなくて済む)。

export const CAP: React.CSSProperties = {
  fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.22em",
};

export function Popover({ label, onClose, children }: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* 外側をつつくと閉じる。地は透けたまま(暗幕を重ねない)。 */}
      <div
        aria-hidden
        onPointerDown={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 1 }}
      />
      <div
        role="dialog"
        aria-label={label}
        style={{
          position: "absolute", left: 0, right: 0, bottom: "100%", zIndex: 2,
          background: PAPER, color: INK,
          padding: "13px 16px 15px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <span style={{ ...CAP, color: MUTED }}>{label}</span>
          <button onClick={onClose} aria-label="閉じる" style={{
            width: 20, height: 20, border: "none", background: "transparent", padding: 0,
            cursor: "pointer", position: "relative", flexShrink: 0,
          }}>
            <span style={{ position: "absolute", left: 1, top: 9, width: 18, height: 1.5, background: INK, transform: "rotate(45deg)" }} />
            <span style={{ position: "absolute", left: 1, top: 9, width: 18, height: 1.5, background: INK, transform: "rotate(-45deg)" }} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
