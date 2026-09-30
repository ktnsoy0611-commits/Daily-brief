"use client";

import { TabIcon } from "@/components/TabIcons";
import { INK, LATIN, NAV_BOTTOM_GAP, NAV_CREATE_SLOT, NAV_PILL_PAD, NAV_ROW_MAX, PAPER, TAB_ICON_OFF, TAB_MARK } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { APPS, appDef } from "@/lib/apps";
import { useNavCompact } from "@/lib/navCompact";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
import type { AppId } from "@/lib/types";

// ★★★**下のバー**（2026-09-29・第134巡にユーザー承認の構成）。
// ★4つのアプリを**同じ格で**並べる（HOME／EXPLORE／TASK／JOURNAL）。選んでいるアプリだけ
//   **アイコンの右に名前が出て、墨のピルで囲う**（ユーザー指定）。色は墨1色。
// ★★★**アイコンは「円と角丸の四角」から作る**（第135巡にユーザー指定「**もっと角を使わない、円とか角丸の四角を
//   基本の形としてそこからアレンジした形に。Explore は重なった2枚のカード、Journal は record の UI、Task は積まれた
//   ピルをモチーフに**」）。第134巡の lucide（家・方位磁針・チェック・本）は角が立っていた。
//   HOME ＝ 半円の屋根のアーチと小さなアーチの戸口／EXPLORE ＝ 傾いて重なった2枚の札（BRIEF の札の束）／
//   TASK ＝ 積まれた3本のピル（TASK の日付の列・ホームの山）／JOURNAL ＝ 縦長の角丸の本体に円とキーの段（録音機）。
//   ★線は 1.75・端も角も丸。重なる形は**下の形を地の色で塗って**奥行きを出す（線どうしを交差させない）。
// ★★未読の数の丸は外した（第134巡にユーザー指定）。
// ★★★**バーは1本だけ**（`AppShell` がアプリの列の外に置く）。
// ★★★**下へ送ると小さく畳む**（第135巡。`lib/navCompact.ts`）―― 列の中の送りが知らせ、ここは縮めるだけ。
//   `transform` の拡大縮小なので合成だけで動く（レイアウトは起きない）。支点は下の真ん中。
// ★選んでいる印をもう一度押すと、そのアプリの先頭のモジュールへ戻る（`onGo` が同じ id を受ける）。

/** アイコンの一辺と線の太さ。★目盛りの外（アイコンの内部＝図形の座標系）。 */
const ICON = 24;
const STROKE = 1.75;
/** 畳んだときの倍率。★目盛りの外（手ざわり）。 */
const COMPACT = 0.8;

/** ★アプリの印（24 の座標）。`fill` は重なりの奥行きを出すための地の色。 */
export function AppMark({ id, color, fill, size = ICON }: { id: AppId; color: string; fill: string; size?: number }) {
  const line = { fill: "none", stroke: color, strokeWidth: STROKE, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const solid = { fill, stroke: color, strokeWidth: STROKE, strokeLinejoin: "round" } as const;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0, display: "block" }}>
      {id === "home" && (
        <>
          <path d="M4.5 20.2V11.2a7.5 7.5 0 0 1 15 0v9h-15z" {...line} />
          <path d="M9.6 20.2v-3.4a2.4 2.4 0 0 1 4.8 0v3.4" {...line} />
        </>
      )}
      {id === "life" && (
        <>
          <rect x="3.6" y="5.2" width="11.4" height="15" rx="3.4" transform="rotate(-12 9.3 12.7)" {...solid} />
          <rect x="9" y="3.8" width="11.4" height="15" rx="3.4" transform="rotate(8 14.7 11.3)" {...solid} />
        </>
      )}
      {id === "tasks" && (
        <>
          <rect x="3" y="15.6" width="18" height="5.4" rx="2.7" {...solid} />
          <rect x="4.8" y="9.8" width="11.6" height="5.4" rx="2.7" transform="rotate(-6 10.6 12.5)" {...solid} />
          <rect x="10.6" y="3.6" width="8.6" height="5.4" rx="2.7" transform="rotate(10 14.9 6.3)" {...solid} />
        </>
      )}
      {id === "journal" && (
        <>
          <rect x="5" y="2.8" width="14" height="18.4" rx="4" {...line} />
          <circle cx="12" cy="9.6" r="3.8" {...line} />
          <path d="M9 16.8h6" {...line} />
        </>
      )}
    </svg>
  );
}

export function AppNav({ current, onGo, onCreate }: {
  current: AppId;
  onGo: (id: AppId) => void;
  onCreate: (from: HTMLElement) => void;
}) {
  const compact = useNavCompact();
  return (
    <div style={{
      /* ★隙間と右の丸は `NAV_CREATE_SLOT`（= TAB_MARK + SPACE.md）で1つ。 */
      display: "flex", alignItems: "center", gap: NAV_CREATE_SLOT - TAB_MARK, width: "100%", maxWidth: NAV_ROW_MAX,
      marginBottom: NAV_BOTTOM_GAP,
      transform: compact ? `scale(${COMPACT})` : "none", transformOrigin: "50% 100%",
      transition: "transform var(--t-item) var(--ease-settle)",
    }}>
      <div style={{
        flex: 1, minWidth: 0, display: "flex", background: PAPER, borderRadius: RADIUS.pill,
        boxShadow: "0 2px 7px rgba(26,26,24,0.14)", padding: NAV_PILL_PAD,
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
                height: TAB_MARK, minWidth: SPACE.xxl + SPACE.md, padding: 0, border: "none", cursor: "pointer",
                // ★★選んでいるものは名前のぶんだけ伸び、ほかは残りを等分。**伸び縮みも墨の面も滑らかに移る**。
                flex: on ? "1.9 1 0" : "1 1 0",
                borderRadius: RADIUS.pill, background: on ? INK : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                transition: "flex-grow var(--t-item) var(--ease-settle), background-color var(--t-item) var(--ease-settle)",
                userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
              }}
            >
              <AppMark id={a.id} color={on ? PAPER : TAB_ICON_OFF} fill={on ? INK : PAPER} />
              <span style={{
                fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat,
                letterSpacing: TRACK.caps, color: PAPER, whiteSpace: "nowrap", overflow: "hidden",
                maxWidth: on ? SPACE.xxl * 3 : 0, marginLeft: on ? SPACE.sm : 0, opacity: on ? 1 : 0,
                transition: "max-width var(--t-item) var(--ease-settle), margin-left var(--t-item) var(--ease-settle), opacity var(--t-item) var(--ease-settle)",
              }}>{appDef(a.id).en}</span>
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
        <TabIcon name="record" color={`var(--on-ink, ${PAPER})`} size={ICON} />
      </button>
    </div>
  );
}
