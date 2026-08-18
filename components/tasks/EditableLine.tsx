"use client";

import { useLayoutEffect, useRef } from "react";

// ★入力画面の**文字を打つ面**(2026-08-18)。`<textarea>` ではなく
// `contenteditable` で作る。
//
// 理由は1つ — iOS が `<textarea>`/`<input>` にフォーカスすると、キーボードの
// 上に **`^ ∨ ✓` の操作バー**(フォーム間を行き来するためのもの)を出す。
// これを消す Web の API は無い。フォーム部品でなければ出ない、という一点に
// 賭けた作り替え(ユーザー確定「できればコンパクトにしたい」)。
//
// ★★**入力まわりで最も繊細なところ**なので、1つの部品に閉じ込めてある。
// 効かなかったらこのファイルごと戻せばよい。textarea が持っていたものは
// 全部ここが引き受ける:
//   高さが中身で伸びる … 素で伸びる(JS 不要)
//   プレースホルダ … `data-ph` ＋ `:empty` ではなく `[data-empty]::before`
//                    (空の contenteditable には `<br>` が残ることがあり
//                     `:empty` が当てにならない)
//   キャレットの位置 … `Range` を数える(`selectionStart` の代わり)
//   貼り付け … 平文に落とす(書式ごと入ると図形の字が崩れる)
//   IME … ★変換中の Enter で行を割らない(textarea のときからのバグ)

export type LineHandle = {
  el: HTMLDivElement;
  focus(): void;
  /** キャレットを先頭から n 文字目へ。 */
  setCaret(n: number): void;
  /** いま入っている文字数。 */
  length(): number;
};

/** いまのキャレットが、面の先頭から何文字目か。 */
function caretOf(el: HTMLElement): number {
  const s = window.getSelection();
  if (!s || s.rangeCount === 0) return read(el).length;
  const cur = s.getRangeAt(0);
  const r = document.createRange();
  r.selectNodeContents(el);
  try { r.setEnd(cur.endContainer, cur.endOffset); } catch { return read(el).length; }
  return r.toString().length;
}

/** 面の中身を文字列で読む。改行を持つ面は `innerText`(改行が保てる)。 */
function read(el: HTMLElement, multiline?: boolean): string {
  return multiline ? el.innerText.replace(/\n$/, "") : (el.textContent ?? "");
}

/** キャレットを先頭から n 文字目へ置く。 */
function place(el: HTMLElement, n: number) {
  const r = document.createRange();
  r.selectNodeContents(el);
  let left = n;
  let node: Node | null = null;
  let off = 0;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let t = walk.nextNode();
  while (t) {
    const len = t.textContent?.length ?? 0;
    if (left <= len) { node = t; off = left; break; }
    left -= len;
    t = walk.nextNode();
  }
  if (node) { r.setStart(node, off); r.collapse(true); }
  else r.collapse(false);
  const s = window.getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}

export function EditableLine({
  ref, value, placeholder, multiline, keepFocus, onFocus, onChange, onEnter, onMergeUp, style,
}: {
  ref?: (h: LineHandle | null) => void;
  value: string;
  placeholder: string;
  /** 改行を持てる面(メモ)。Enter は行を割らずに改行する。 */
  multiline?: boolean;
  /** true のあいだ、フォーカスが外れたらその場で戻す。 */
  keepFocus?: React.RefObject<boolean>;
  onFocus?: () => void;
  onChange: (v: string) => void;
  /** Enter。キャレットの位置を渡す(単行の面だけ)。 */
  onEnter?: (caret: number) => void;
  /** 行頭の Backspace。 */
  onMergeUp?: () => void;
  style?: React.CSSProperties;
}) {
  const own = useRef<HTMLDivElement | null>(null);
  const hand = useRef<LineHandle | null>(null);

  // ★中身は React に描かせない(描かせるとキャレットが毎打鍵で先頭へ飛ぶ)。
  // 外から来た値が、いま出ているものと違うときだけ書き戻す。
  useLayoutEffect(() => {
    const el = own.current;
    if (!el) return;
    if (read(el, multiline) !== value) el.textContent = value;
    if (value) el.removeAttribute("data-empty");
    else el.setAttribute("data-empty", "");
  }, [value, multiline]);

  return (
    <div
      ref={(el) => {
        own.current = el;
        hand.current = el ? {
          el,
          focus: () => el.focus(),
          setCaret: (n: number) => place(el, n),
          length: () => read(el, multiline).length,
        } : null;
        ref?.(hand.current);
      }}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={multiline ? true : undefined}
      aria-label={placeholder}
      data-ph={placeholder}
      data-empty=""
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      enterKeyHint={multiline ? "enter" : "next"}
      onFocus={onFocus}
      // ★★取りこぼしの受け皿。ここで**同期的に** focus し直せば iOS は
      // キーボードを閉じない(第6巡。詳しくは TaskComposer の layout effect)。
      onBlur={(e) => {
        if (!keepFocus?.current) return;
        const to = e.relatedTarget as HTMLElement | null;
        if (to && (to.isContentEditable || to.tagName === "TEXTAREA" || to.tagName === "INPUT")) return;
        e.currentTarget.focus();
      }}
      onInput={(e) => onChange(read(e.currentTarget, multiline))}
      onKeyDown={(e) => {
        // ★変換中(IME)の Enter は**確定の Enter**。行を割ってはいけない。
        // `isComposing` を見ていなかったので、日本語で変換するたびに手順が
        // 増えていた(textarea のときからの不具合)。
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        const el = e.currentTarget;
        if (e.key === "Enter") {
          e.preventDefault();
          if (multiline) document.execCommand("insertLineBreak");
          else onEnter?.(caretOf(el));
        } else if (e.key === "Backspace" && !multiline && caretOf(el) === 0
          && (window.getSelection()?.isCollapsed ?? true)) {
          e.preventDefault();
          onMergeUp?.();
        }
      }}
      // ★貼り付けは**平文だけ**。書式が入ると図形に載せる字が崩れる。
      onPaste={(e) => {
        e.preventDefault();
        const raw = e.clipboardData.getData("text/plain");
        const text = multiline ? raw : raw.replace(/\s*\n\s*/g, " ");
        if (text) document.execCommand("insertText", false, text);
      }}
      style={{
        flex: 1, minWidth: 0, outline: "none",
        whiteSpace: multiline ? "pre-wrap" : "pre-wrap",
        overflowWrap: "anywhere",
        WebkitUserModify: "read-write-plaintext-only",
        ...style,
      } as React.CSSProperties}
    />
  );
}
