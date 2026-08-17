"use client";

import { INK, MUTED, PAPER, SANS, SOFT_SHADOW_LG } from "@/lib/constants";

// ★入力画面(TaskComposer)のポップオーバーの器。入力エリアの**すぐ上**に、
// 角丸の紙を1枚立ち上げる。丸みと影はアプリ共通の値(22 / SOFT_SHADOW_LG)。
//
// ★キーボードは**出したまま**にする(2026-08-16にユーザー指定)。閉じると
// 器の高さが変わってレイアウトが飛ぶため。よってこの紙は「キーボードの上・
// 入力エリアの上」に収まる高さしか使えない — 中身が長ければ内側で送る。
//
// 位置は「親(下の帯)を position:relative にして bottom:100%」で決める。
// 親はキーボードのぶん持ち上がっているので、これも一緒に動く。

/**
 * ★**キーボードを閉じさせない**(2026-08-16にユーザー指定)。ボタンを押すと
 * フォーカスがそのボタンへ移り、iOS はそれだけでキーボードを引っ込める
 * → 器の高さが変わってレイアウトが飛ぶ。mousedown の既定動作(フォーカス移動)
 * を止めれば、押しても書きかけの行にフォーカスが残る。
 * 文字を打つ欄(メモ・持ち物)だけは通す。
 */
export const keepKeyboard = (e: React.MouseEvent) => {
  const t = e.target as HTMLElement | null;
  const tag = t?.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT") return;
  e.preventDefault();
};

export const CAP: React.CSSProperties = {
  fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.22em",
};

export function Popover({ label, maxHeight, onClose, children }: {
  label: string;
  /** 入る高さ(px)。キーボードを出したままでも収まるよう呼び側が測って渡す。 */
  maxHeight: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* 外側をつつくと閉じる。暗幕は重ねない(下の入力が見えたままの方が速い)。
          ★**pointerdown ではなく click** で閉じる。押した瞬間に閉じると、
          同じタップの click がその下のボタンへ届いて開き直してしまう
          (「開くアニメーションだけ出て閉じられない」の原因・2026-08-17)。
          ★ツールバーと入力行は zIndex 3 でこの板より前に出してあるので、
          そこを叩いたぶんはここへ来ない。 */}
      <div
        aria-hidden
        onMouseDown={keepKeyboard}
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 1 }}
      />
      <div
        role="dialog"
        aria-label={label}
        className="tc-pop-in"
        onMouseDown={keepKeyboard}
        style={{
          position: "absolute", left: 10, right: 10, bottom: "calc(100% + 8px)", zIndex: 2,
          background: PAPER, color: INK,
          borderRadius: 22, boxShadow: SOFT_SHADOW_LG,
          padding: "14px 16px 16px",
          maxHeight: Math.max(140, maxHeight), overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <span style={{ ...CAP, color: MUTED }}>{label}</span>
          <button onClick={onClose} aria-label="閉じる" style={{
            width: 28, height: 28, borderRadius: "50%", border: "none", background: "rgba(26,26,24,0.06)",
            padding: 0, cursor: "pointer", position: "relative", flexShrink: 0,
          }}>
            <span style={{ position: "absolute", left: 8, top: 13, width: 12, height: 1.5, background: INK, transform: "rotate(45deg)" }} />
            <span style={{ position: "absolute", left: 8, top: 13, width: 12, height: 1.5, background: INK, transform: "rotate(-45deg)" }} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
