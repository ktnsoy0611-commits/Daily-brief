"use client";

import { PAPER, SANS } from "@/lib/constants";

// ★入力画面(TaskComposer)のポップオーバーの器。入力エリアの**すぐ上**に、
// 角丸の面を1枚立ち上げる。丸みはアプリ共通の 22。
// ★地は**墨**(2026-08-17にユーザー確定)。白い紙だと入力画面の墨地から浮き、
// 参照した TickTick の見た目とも違っていた。地より少し明るいチャコールにして
// 「同じ暗い面の続き」として繋げる。
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

/** ポップオーバーの面。地(CHARCOAL)より少し明るいチャコール。 */
export const LIFT = "#33332E";
/** 墨の上の控えめな文字。 */
export const DIM = "rgba(250,250,249,0.44)";

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
          background: LIFT, color: PAPER,
          borderRadius: 22, boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
          padding: "14px 16px 16px",
          maxHeight: Math.max(140, maxHeight), overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
          <span style={{ ...CAP, color: DIM }}>{label}</span>
          <button onClick={onClose} aria-label="閉じる" style={{
            width: 28, height: 28, borderRadius: "50%", border: "none", background: "rgba(250,250,249,0.10)",
            padding: 0, cursor: "pointer", position: "relative", flexShrink: 0,
          }}>
            <span style={{ position: "absolute", left: 8, top: 13, width: 12, height: 1.5, background: PAPER, transform: "rotate(45deg)" }} />
            <span style={{ position: "absolute", left: 8, top: 13, width: 12, height: 1.5, background: PAPER, transform: "rotate(-45deg)" }} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
