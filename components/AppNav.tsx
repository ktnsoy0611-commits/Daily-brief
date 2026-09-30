"use client";

import { BookOpen, CircleCheck, Compass, House, type LucideIcon } from "lucide-react";
import { TabIcon } from "@/components/TabIcons";
import { INK, LATIN, NAV_BOTTOM_GAP, NAV_CREATE_SLOT, NAV_PILL_PAD, NAV_ROW_MAX, PAPER, TAB_ICON_OFF, TAB_MARK } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { APPS, appDef } from "@/lib/apps";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
import type { AppId } from "@/lib/types";

// ★★★**下のバー**（2026-09-29・第134巡にユーザー承認の構成）。
// ★4つのアプリを**同じ格で**並べる（HOME／EXPLORE／TASK／JOURNAL）。選んでいるアプリだけ
//   **アイコンの右に名前が出て、墨のピルで囲う**（ユーザー指定）。色は墨1色。
// ★★★**アイコンは「見て分かる」ものにする**（第134巡の2度目にユーザー指摘「**アイコンが全くダメ。シンプルで
//   わかりやすいデザインに。もっと大きく**」）―― 第1稿はアプリの顔（山・札の形・ピル・回る円）を線で描いた
//   抽象で、何のアプリか読めなかった。→ 家（HOME）／方位磁針（EXPLORE ＝ 見つけに行く）／チェック（TASK）／
//   本（JOURNAL ＝ 日々の記録）。lucide の線のアイコン（ほかの画面と同じ語彙）。
// ★★未読の数の丸は外した（第134巡にユーザー指定「Explore の数字はなくして」）。
// ★★★**バーは1本だけ**（`AppShell` がアプリの列の外に置く）。列ごとに持つと、切り替えのたびに
//   バーが列と一緒に動いたり消えたりした。
// ★選んでいる印をもう一度押すと、そのアプリの先頭のモジュールへ戻る（`onGo` が同じ id を受ける）。

/** アイコンの一辺と線の太さ。★目盛りの外（アイコンの内部＝図形の座標系）。 */
const ICON = 26;
const STROKE = 1.75;

const MARK: Record<AppId, LucideIcon> = { home: House, life: Compass, tasks: CircleCheck, journal: BookOpen };

export function AppMark({ id, color, size = ICON }: { id: AppId; color: string; size?: number }) {
  const Icon = MARK[id];
  return <Icon size={size} strokeWidth={STROKE} color={color} aria-hidden style={{ flexShrink: 0, display: "block" }} />;
}

export function AppNav({ current, onGo, onCreate }: {
  current: AppId;
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
                // ★★選んでいるものは名前のぶんだけ伸び、ほかは残りを等分。**伸び縮みも墨の面も滑らかに移る**
                //   （名前は幅 0 から開く）―― 押したアイコンへ墨のピルが流れて見える。
                flex: on ? "1.9 1 0" : "1 1 0",
                borderRadius: RADIUS.pill, background: on ? INK : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                transition: "flex-grow var(--t-item) var(--ease-settle), background-color var(--t-item) var(--ease-settle)",
                userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
              }}
            >
              <AppMark id={a.id} color={on ? PAPER : TAB_ICON_OFF} />
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
