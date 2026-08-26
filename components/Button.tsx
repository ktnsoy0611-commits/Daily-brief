"use client";

import { useCallback, useEffect, useRef } from "react";
import { HAIRLINE, INK, MUTED, PAPER, SANS } from "@/lib/constants";
import { SPACE, TYPE, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";

// ★★★**押せる面はここだけ**(2026-08-23・第33巡)。
// それまでは押下の作法が3流派に分かれていた —
//   ・`common.tsx` … `useState` + 跳ね返るカーブ(`cubic-bezier(0.34,1.56,0.64,1)`)
//   ・`tasks/Popover.tsx` の `Press` … `data-pressed` を DOM へ直に書く
//   ・素の `<button>` … CSS の `:active` 頼み
// 見た目も手ざわりも噛み合っていなかったので、**この1ファイルへ集めた**。
//
// 使い分けは1行で言える:
//   **入力画面(キーボードを出したまま触る面)＝ `Press` / それ以外＝ `Button`。**

// ---- Press(入力画面専用) ----------------------------------------------

/**
 * ★最後に**画面の中の**押せる面が押された時刻。
 *
 * 「キーボードを閉じたら入力画面も閉じる」を入れた 2026-08-18 から必要に
 * なった。フォーカスが外れた理由を2つに分ける必要がある:
 *   ・画面の中を押した → 取りこぼし。**その場で戻す**(いままでどおり)。
 *   ・画面の外(キーボードの「完了」やスワイプ) → **戻さない**。閉じる合図。
 * ページの中には iOS の「完了」を知る手がかりが無いので、
 * 「直前に画面を押していたか」で見分ける。
 */
let lastPressAt = 0;
export const pressedRecently = (ms = 500) => Date.now() - lastPressAt < ms;

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
 *
 * ★**押した瞬間に走る**(離上を待たない)。キーボードを保つのが最優先の面
 * なのでこれで良いが、**取り返しのつかない操作(削除など)には使わない**。
 * そちらは `Button`(離上で走る)を使うこと。
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
    const on = (e: TouchEvent) => { lastPressAt = Date.now(); if (e.cancelable) e.preventDefault(); };
    el.addEventListener("touchstart", on, { passive: false });
    return () => el.removeEventListener("touchstart", on);
  }, []);

  // ★★**沈む合図は自分で出す**(2026-08-18・第19巡)。`.press:active` に
  //   任せていたが、`touchstart` の既定動作を止めている面では iOS が
  //   `:active` を当てないことがあり、**押しても何も起きないように見える**
  //   (実機で「アイコンの反応が悪い」と報告された)。押した瞬間に印を立て、
  //   離す/取り消しで消す。再レンダーは挟まない(属性を直に書く)。
  const mark = (on: boolean) => {
    const el = ref.current;
    if (!el) return;
    if (on) el.dataset.pressed = "1";
    else el.removeAttribute("data-pressed");
  };

  return (
    <div
      ref={ref}
      role={rest.role ?? "button"}
      aria-disabled={disabled || undefined}
      onPointerDown={(e) => {
        e.preventDefault();
        lastPressAt = Date.now();
        mark(true);
        if (!off.current) fn.current();
      }}
      onPointerUp={() => mark(false)}
      onPointerCancel={() => mark(false)}
      onPointerLeave={() => mark(false)}
      style={{
        cursor: disabled ? "default" : "pointer",
        userSelect: "none", WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        // ★★**`touch-action: none`**(2026-08-18・第19巡)。これが無いと iOS は
        //   「この指はページを送るためのものか」を見極めるまで `pointerdown` を
        //   握り、押してから効くまでが目に見えて遅れる。送る余地が無いことを
        //   先に宣言しておけば、指が触れた瞬間に飛ぶ。
        touchAction: "none",
        ...style,
      }}
      {...rest}
    >{children}</div>
  );
}

// ---- Button(それ以外すべて) -------------------------------------------

/**
 * 視覚的な階層。**この4つ以外を作らない。**
 * - `primary` … その画面で**いちばん進めたい**1つ。地を塗る。1画面に1つまで。
 * - `secondary` … 並び立つ選択肢。輪郭だけ。色(`tone`)で意味を分ける。
 * - `ghost` … 取り消し・あとで。面も輪郭も持たない。
 * - `icon` … 図だけ。正方形の当たり判定を持ち、`aria-label` が必須。
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "icon";
/** 大きさ。文字と余白は `lib/tokens.ts` の目盛りから引く。 */
export type ButtonSize = "sm" | "md" | "lg";

/** 高さだけは「指が届く」ための実寸なので、目盛りとは別に持つ。 */
const HEIGHT: Record<ButtonSize, number> = { sm: 28, md: 36, lg: 48 };
const FONT: Record<ButtonSize, number> = { sm: TYPE.micro, md: TYPE.small, lg: TYPE.body };
const PAD_X: Record<ButtonSize, number> = { sm: SPACE.sm, md: SPACE.md, lg: SPACE.lg };

export function Button({
  variant = "secondary",
  size = "md",
  tone,
  round = true,
  onClick,
  disabled,
  children,
  style,
  className,
  type = "button",
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 意味の色。`primary` は地、`secondary` は文字と輪郭に使う。既定は墨。 */
  tone?: string;
  /** ピル(既定)か、角丸の四角か。`icon` では正円か角丸か。 */
  round?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  type?: "button" | "submit";
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  "aria-expanded"?: boolean;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);

  // ★iOS は listener を持たない要素へ `:active` を当てないことがあるので、
  //   `Press` と同じ「印を立てる」方式を併用する。再レンダーは挟まない。
  const mark = useCallback((on: boolean) => {
    const el = ref.current;
    if (!el) return;
    if (on) el.dataset.pressed = "1";
    else el.removeAttribute("data-pressed");
  }, []);

  const ink = tone ?? INK;
  // ★輪郭は**文字と同じ色を薄めたもの**。以前は同じ「輪郭だけのボタン」でも
  //   BLUE は色そのまま・RUST は 45%・INK は 30% とバラバラだった。1つの規則へ。
  //   `color-mix` が無い環境には、直前の行の実色がそのまま残る(段階的強化)。
  const edge: React.CSSProperties = {
    border: `1px solid ${ink}`,
    borderColor: `color-mix(in srgb, ${ink} 45%, transparent)`,
  };
  const look: React.CSSProperties =
    variant === "primary" ? { background: ink, color: PAPER, border: `1px solid ${ink}` }
    : variant === "secondary" ? { background: "transparent", color: ink, ...(tone ? edge : { border: `1px solid ${HAIRLINE}` }) }
    : variant === "ghost" ? { background: "transparent", color: tone ?? MUTED, border: "1px solid transparent" }
    : /* icon */ { background: "transparent", color: ink, border: "1px solid transparent" };

  const box: React.CSSProperties = variant === "icon"
    ? { width: HEIGHT[size], height: HEIGHT[size], padding: 0, borderRadius: round ? RADIUS.circle : RADIUS.lg }
    : { minHeight: HEIGHT[size], padding: `0 ${PAD_X[size]}px`, borderRadius: round ? RADIUS.pill : RADIUS.md };

  return (
    <button
      ref={ref}
      type={type}
      // ★`.press` が押下の手ざわりを持つ(沈み 90ms / 戻り --t-out)。
      //   見た目の数字は `app/globals.css` にしか書かない。
      className={["press", className].filter(Boolean).join(" ")}
      onClick={disabled ? undefined : onClick}
      onPointerDown={() => mark(true)}
      onPointerUp={() => mark(false)}
      onPointerCancel={() => mark(false)}
      onPointerLeave={() => mark(false)}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: SPACE.xs,
        fontFamily: SANS, fontSize: FONT[size], fontWeight: WEIGHT.bold, letterSpacing: TRACK.normal,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        userSelect: "none", WebkitUserSelect: "none",
        flexShrink: 0,
        ...look,
        ...box,
        ...style,
      }}
      {...rest}
    >{children}</button>
  );
}
