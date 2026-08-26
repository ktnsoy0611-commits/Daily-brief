"use client";

import { SPACE, TYPE, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import { PAPER, SANS, CHARCOAL } from "@/lib/constants";
// ★押せる面は `components/Button.tsx` が唯一の持ち主(第33巡)。
import { Press } from "@/components/Button";

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
export const LIFT = CHARCOAL;
/** 墨の上の控えめな文字。 */
export const DIM = "rgba(250,250,249,0.44)";

export const CAP: React.CSSProperties = {
  fontFamily: SANS, fontSize: TYPE.micro, fontWeight: WEIGHT.bold, letterSpacing: TRACK.wide,
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
          // ★持ち上げは要らない(2026-08-19・第24巡)。器が**見えている矩形
          //   そのもの**になったので、舞台の下端はもうキーボードの裏ではない。
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
          borderRadius: RADIUS.xl, boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
          padding: `${SPACE.sm}px ${SPACE.lg}px ${SPACE.md}px`,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SPACE.xs, flexShrink: 0 }}>
          <span style={{ ...CAP, color: DIM }}>{label}</span>
          <Press onPress={onClose} aria-label="閉じる" style={{
            width: 26, height: 26, borderRadius: RADIUS.circle, background: "rgba(250,250,249,0.10)",
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
