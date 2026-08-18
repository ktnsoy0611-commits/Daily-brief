"use client";

import { useEffect, useRef } from "react";
import { PAPER, SANS } from "@/lib/constants";

// ★入力画面(TaskComposer)のポップオーバーの器。入力エリアの**すぐ上**に、
// 角丸の面を1枚立ち上げる。丸みはアプリ共通の 22。
// ★地は**墨**(2026-08-17にユーザー確定)。白い紙だと入力画面の墨地から浮き、
// 参照した TickTick の見た目とも違っていた。地より少し明るいチャコールにして
// 「同じ暗い面の続き」として繋げる。
//
// ★キーボードは**出したまま**にする(2026-08-16にユーザー指定)。閉じると
// 器の高さが変わってレイアウトが飛ぶため。
//
// ★位置は「図形のステージ(＝上のバーの下〜下の帯の上)を親にした inset」で
// 決める(2026-08-17に作り直し)。以前は帯を親にして bottom:100% で上へ
// 伸ばしていたので、中身が高いと**画面の上へはみ出して**タブの下に潜り、
// 下へスワイプしないと触れなかった。領域そのものを枠にすれば構造的に
// はみ出せない。**縦スクロールも持たせない** — 中身をこの高さに収める。

/**
 * ★★**入力画面の押せる面はこれ**(2026-08-17・第6巡)。`<button>` は使わない。
 *
 * 以前の `press()`(`<button>` + `pointerdown` の `preventDefault`)では実機で
 * 取りこぼしが残った(「何度も押しているとキーボードが閉じる」)。原因は2つ:
 *
 *  1. **`<button>` はタップすると、いま focus している欄を Safari が blur する**。
 *     `div` は(tabindex が無ければ)フォーカスを受け取れないので、そもそも
 *     移動先が無い。
 *  2. iOS でフォーカス移動を確実に止められるのは **`touchstart` の
 *     `preventDefault`**。ところが React は root の `touchstart` を **passive**
 *     で張るため、React の `onTouchStart` からは preventDefault できない。
 *     素の listener を `{ passive: false }` で張り直す。
 *
 * 処理を走らせるのは `pointerdown` の側だけ(iOS は pointerdown → touchstart の
 * 順に飛ぶので、両方で走らせると二重になる)。`touchstart` は
 * **既定動作を止める役だけ**。
 */
export function Press({ onPress, disabled, children, style, ...rest }: {
  onPress: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  "aria-checked"?: boolean;
  "aria-hidden"?: boolean;
  role?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // 押したときにやることは毎レンダー変わるので ref 越しに読む
  // (listener を張り替えないため)。
  const fn = useRef(onPress);
  fn.current = onPress;
  const off = useRef(disabled);
  off.current = disabled;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ★止める役だけ。処理は pointerdown 側で走る。
    const on = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    el.addEventListener("touchstart", on, { passive: false });
    return () => el.removeEventListener("touchstart", on);
  }, []);

  return (
    <div
      ref={ref}
      role={rest.role ?? "button"}
      aria-disabled={disabled || undefined}
      onPointerDown={(e) => {
        e.preventDefault();
        if (!off.current) fn.current();
      }}
      style={{
        cursor: disabled ? "default" : "pointer",
        userSelect: "none", WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        ...style,
      }}
      {...rest}
    >{children}</div>
  );
}

/**
 * 保険。器のルートに掛けて、ボタン以外(余白・ラベル)を叩いたときにも
 * フォーカスが飛ばないようにする。文字を打つ欄だけは通す。
 */
export const keepKeyboard = (e: React.MouseEvent) => {
  const t = e.target as HTMLElement | null;
  const tag = t?.tagName;
  // ★文字を打つ面は contenteditable(`EditableLine`)。tagName では判らないので
  // `isContentEditable` で見る。
  if (t?.isContentEditable || tag === "TEXTAREA" || tag === "INPUT") return;
  e.preventDefault();
};

/** ポップオーバーの面。地(CHARCOAL)より少し明るいチャコール。 */
export const LIFT = "#33332E";
/** 墨の上の控えめな文字。 */
export const DIM = "rgba(250,250,249,0.44)";

export const CAP: React.CSSProperties = {
  fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.22em",
};

export function Popover({ label, closing, onClose, children }: {
  label: string;
  /** 閉じている最中。下へ抜ける動きを鳴らす。 */
  closing?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* 外側をつつくと閉じる。暗幕は重ねない(下の入力が見えたままの方が速い)。
          ★上のバーと下の帯は zIndex 2 でこの板より前に出してある(呼び側)。
          そこを叩いたぶんはここへ来ないので、「アイコンを叩いたら閉じてすぐ
          開き直す」は起きない(2026-08-17)。 */}
      {/* 抜けている最中はタップを拾わない(閉じ終わる前の空打ちを防ぐ)。 */}
      {!closing && <Press aria-hidden onPress={onClose} style={{ position: "fixed", inset: 0, zIndex: 1 }} />}
      {/* ★外側は**置き場所と追従だけ**。`.tc-pop-in` は transform を animate
          するので、同じ要素にキーボード追従の transform を書くと animation に
          上書きされてしまう(fill-mode: both)。見える面は内側が持つ。 */}
      <div
        data-pop
        style={{
          // ★下の帯のすぐ上に置き、**高さは中身のぶんだけ**。ただし
          // 「上のバーの下〜下の帯の上」(＝呼び側が親にしている領域)を
          // **絶対に超えない**。以前は帯の上へ伸ばしていたので、中身が高いと
          // 画面の上へはみ出し、タブの下に潜って触れなくなっていた。
          position: "absolute", left: 10, right: 10, bottom: 8, zIndex: 2,
          maxHeight: "calc(100% - 8px)",
          display: "flex", flexDirection: "column",
        }}
      >
      <div
        role="dialog"
        aria-label={label}
        className={closing ? "tc-pop-out" : "tc-pop-in"}
        onMouseDown={keepKeyboard}
        style={{
          // ★縦スクロールは持たせない(2026-08-17にユーザー指定) — 溢れそうな
          // ときは中身の側が縮んで収まる。
          flex: "0 1 auto", minHeight: 0,
          background: LIFT, color: PAPER,
          borderRadius: 22, boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
          padding: "8px 14px 10px",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexShrink: 0 }}>
          <span style={{ ...CAP, color: DIM }}>{label}</span>
          <Press onPress={onClose} aria-label="閉じる" style={{
            width: 26, height: 26, borderRadius: "50%", background: "rgba(250,250,249,0.10)",
            position: "relative", flexShrink: 0,
          }}>
            <span style={{ position: "absolute", left: 7, top: 12, width: 12, height: 1.5, background: PAPER, transform: "rotate(45deg)" }} />
            <span style={{ position: "absolute", left: 7, top: 12, width: 12, height: 1.5, background: PAPER, transform: "rotate(-45deg)" }} />
          </Press>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
      </div>
      </div>
    </>
  );
}
