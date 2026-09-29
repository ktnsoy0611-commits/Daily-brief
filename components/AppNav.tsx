"use client";

import { TabIcon } from "@/components/TabIcons";
import { INK, LATIN, NAV_BOTTOM_GAP, NAV_CREATE_SLOT, NAV_PILL_PAD, NAV_ROW_MAX, PAPER, SANS, TAB_ICON_OFF, TAB_MARK } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { APPS, appDef } from "@/lib/apps";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
import type { AppId } from "@/lib/types";

// ★★★**下のバー**（2026-09-29・第134巡にユーザー承認の構成）。
// ★4つのアプリを**同じ格で**並べる（HOME／EXPLORE／TASK／JOURNAL）。選んでいるアプリだけ
//   **アイコンの右に名前が出て、墨のピルで囲う**（ユーザー指定「選んでいるタブのアイコンの右だけに名前が出て、
//   ピル型で囲う」）。色は墨1色・アイコンは線だけ（「色は使わない」「アイコンは極力ミニマル」）。
// ★アプリの中のタブは無い ―― 中の区分けは縦のモジュール（`components/AppModules.tsx`）が受け持つ。
// ★横に払ってアプリは替えない（帯・札・一覧が横の払いを使うので取り合いになる）。押すだけ。
// ★選んでいる印をもう一度押すと、そのアプリの先頭のモジュールへ戻る（`onGo` が同じ id を受ける）。

/** アイコンの一辺。★目盛りの外（アイコンの内部＝図形の座標系）。 */
const ICON = 22;
const STROKE = 1.5;

/** アプリの印（線だけ）。形はそのアプリの顔 ―― 山（ピルと円）・札（アーチ）・ピル・回る円。 */
export function AppMark({ id, color }: { id: AppId; color: string }) {
  const p = { fill: "none", stroke: color, strokeWidth: STROKE, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={ICON} height={ICON} viewBox="0 0 20 20" aria-hidden style={{ flexShrink: 0, display: "block" }}>
      {id === "home" && (<>
        <rect x="3" y="12" width="9" height="4.5" rx="2.25" {...p} />
        <circle cx="14.5" cy="13.75" r="2.75" {...p} />
        <rect x="6" y="6" width="8" height="4.5" rx="2.25" {...p} />
      </>)}
      {id === "life" && <path d="M5 16.5V9a5 5 0 0110 0v7.5z" {...p} />}
      {id === "tasks" && <rect x="2.75" y="7" width="14.5" height="6" rx="3" {...p} />}
      {id === "journal" && (<>
        <circle cx="10" cy="10" r="6.25" {...p} />
        <circle cx="10" cy="10" r="1.3" fill={color} stroke="none" />
      </>)}
    </svg>
  );
}

export function AppNav({ current, unread, onGo, onCreate }: {
  current: AppId;
  /** EXPLORE の未読の提案の数（0 なら出さない）。 */
  unread: number;
  onGo: (id: AppId) => void;
  onCreate: (from: HTMLElement) => void;
}) {
  return (
    <div style={{
      /* ★隙間と右の丸は `NAV_CREATE_SLOT`（= TAB_MARK + SPACE.md）で1つ。 */
      display: "flex", alignItems: "center", gap: NAV_CREATE_SLOT - TAB_MARK, width: "100%", maxWidth: NAV_ROW_MAX,
      pointerEvents: "auto", marginBottom: NAV_BOTTOM_GAP,
    }}>
      <div style={{
        flex: 1, display: "flex", background: PAPER, borderRadius: RADIUS.pill,
        boxShadow: "0 2px 7px rgba(26,26,24,0.14)", padding: NAV_PILL_PAD, gap: SPACE.hair,
      }}>
        {APPS.map((a) => {
          const on = a.id === current;
          return (
            <button
              key={a.id}
              aria-label={appDef(a.id).label}
              aria-current={on ? "page" : undefined}
              onClick={() => { haptic(5); onGo(a.id); }}
              style={{
                position: "relative", height: TAB_MARK, minWidth: TAB_MARK, padding: 0, border: "none", cursor: "pointer",
                // ★選んでいるものだけ中身の幅（名前の分だけ伸びる）、ほかは残りを等分。
                flex: on ? "0 0 auto" : "1 1 0",
                borderRadius: RADIUS.pill, background: on ? INK : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background-color var(--t-item) var(--ease-settle)",
                userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
              }}
            >
              <span style={{
                display: "flex", alignItems: "center", gap: on ? SPACE.sm : 0,
                padding: on ? `0 ${SPACE.lg}px 0 ${SPACE.md}px` : 0,
              }}>
                <AppMark id={a.id} color={on ? PAPER : TAB_ICON_OFF} />
                {on && (
                  <span style={{
                    fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat,
                    letterSpacing: TRACK.caps, marginRight: `-${TRACK.caps}`, color: PAPER, whiteSpace: "nowrap",
                  }}>{appDef(a.id).en}</span>
                )}
              </span>
              {/* ★★未読の提案の数（第132巡）。EXPLORE を見ていないときだけ、印の右肩に小さな墨の丸。 */}
              {a.id === "life" && !on && unread > 0 && (
                <span aria-label={`未読 ${unread}`} style={{
                  position: "absolute", top: SPACE.xs, left: `calc(50% + ${SPACE.xs}px)`,
                  minWidth: SPACE.lg, height: SPACE.lg, padding: `0 ${SPACE.xs}px`, boxSizing: "border-box",
                  borderRadius: RADIUS.pill, background: INK, color: PAPER,
                  fontFamily: SANS, fontSize: TYPE.micro, fontWeight: WEIGHT.bold, lineHeight: `${SPACE.lg}px`,
                  letterSpacing: TRACK.normal, textAlign: "center", pointerEvents: "none",
                }}>{unread}</span>
              )}
            </button>
          );
        })}
      </div>
      {/* ★★右端の丸は**作るものを選ぶ入口**(第28巡)。どのアプリでも同じ位置・同じ意味。
          ★全画面の面(入力画面・録音)が**帰っていく先**なので `data-create-anchor` を外さないこと。 */}
      <button
        onClick={(e) => onCreate(e.currentTarget)}
        aria-label="作る"
        data-create-anchor
        style={{
          flexShrink: 0, width: TAB_MARK, height: TAB_MARK, borderRadius: RADIUS.circle,
          background: `var(--ink-on, ${INK})`, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 7px rgba(26,26,24,0.14)", padding: 0,
        }}
      >
        <TabIcon name="record" color={`var(--on-ink, ${PAPER})`} size={22} />
      </button>
    </div>
  );
}
