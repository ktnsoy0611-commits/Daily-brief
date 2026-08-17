"use client";

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
 * ★★**入力画面のボタンはこれで押す**(2026-08-17)。`onClick` は使わない。
 *
 * キーボードが閉じると器の高さが変わってレイアウトごと飛ぶ。閉じる引き金は
 * 「押したボタンへフォーカスが移ること」で、`onMouseDown` の preventDefault
 * (＝フォーカス移動を止める定石)は **Chromium では効くが iOS Safari では
 * 取りこぼす** — iOS は touchend の時点でフォーカスを動かすことがあり、
 * 合成 mousedown を止めても間に合わない(実機で3度報告された)。
 *
 * そこで **pointerdown で止めて、その場で処理する**。click を待たないので
 * フォーカスは一度も動かない。`tabIndex: -1` でそもそも受け取らせない。
 */
export const press = (fn: () => void) => ({
  onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); fn(); },
  tabIndex: -1 as const,
});

/**
 * 保険。器のルートに掛けて、ボタン以外(余白・ラベル)を叩いたときにも
 * フォーカスが飛ばないようにする。文字を打つ欄だけは通す。
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

export function Popover({ label, onClose, children }: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* 外側をつつくと閉じる。暗幕は重ねない(下の入力が見えたままの方が速い)。
          ★上のバーと下の帯は zIndex 2 でこの板より前に出してある(呼び側)。
          そこを叩いたぶんはここへ来ないので、「アイコンを叩いたら閉じてすぐ
          開き直す」は起きない(2026-08-17)。 */}
      <div
        aria-hidden
        onMouseDown={keepKeyboard}
        {...press(onClose)}
        style={{ position: "fixed", inset: 0, zIndex: 1 }}
      />
      <div
        role="dialog"
        aria-label={label}
        className="tc-pop-in"
        onMouseDown={keepKeyboard}
        style={{
          // ★下の帯のすぐ上に置き、**高さは中身のぶんだけ**。ただし
          // 「上のバーの下〜下の帯の上」(＝呼び側が親にしている領域)を
          // **絶対に超えない**。以前は帯の上へ伸ばしていたので、中身が高いと
          // 画面の上へはみ出し、タブの下に潜って触れなくなっていた。
          // ★縦スクロールは持たせない(2026-08-17にユーザー指定) — 溢れそうな
          // ときは中身の側(カレンダー)が縮んで収まる。
          position: "absolute", left: 10, right: 10, bottom: 8,
          maxHeight: "calc(100% - 8px)", zIndex: 2,
          background: LIFT, color: PAPER,
          borderRadius: 22, boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
          // ★詰める(2026-08-17)。キーボードで器が 470px まで縮んだとき、
          // ここで取った余白のぶんだけカレンダーの1週が痩せる。
          padding: "8px 14px 10px",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexShrink: 0 }}>
          <span style={{ ...CAP, color: DIM }}>{label}</span>
          <button {...press(onClose)} aria-label="閉じる" style={{
            width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(250,250,249,0.10)",
            padding: 0, cursor: "pointer", position: "relative", flexShrink: 0,
          }}>
            <span style={{ position: "absolute", left: 7, top: 12, width: 12, height: 1.5, background: PAPER, transform: "rotate(45deg)" }} />
            <span style={{ position: "absolute", left: 7, top: 12, width: 12, height: 1.5, background: PAPER, transform: "rotate(-45deg)" }} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
      </div>
    </>
  );
}
