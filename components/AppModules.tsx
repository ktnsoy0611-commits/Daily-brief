"use client";

import { useEffect, useMemo, useState } from "react";
import { Masthead, SectionLabel } from "@/components/common";
import { ModuleRail, type RailPiece } from "@/components/ModuleRail";
import { VoiceStudio } from "@/components/VoiceStudio";
import { BriefTab } from "@/components/tabs/BriefTab";
import { JournalTab } from "@/components/tabs/JournalTab";
import { StockTab } from "@/components/tabs/StockTab";
import { appTitle } from "@/lib/apps";
import { INK, MUTED, navHeightPx, onNavHeight } from "@/lib/constants";
import { RADIUS, SPACE } from "@/lib/tokens";
import type { AppId, TabId, TabProps } from "@/lib/types";

// ★★★**アプリの中の縦のモジュール**（2026-09-29・第134巡にユーザー確定の構成）。
// ★見出し（アプリ名）とその下の**今のモジュール名**は動かない。その下を `ModuleRail` が1枚ずつ送る。
// ★約束（`docs/project_knowledge.md` の「モジュールの約束」）… 1番目 ＝ 今日やること（1画面に収まる）／
//   2番目から ＝ 溜まったもの（長い一覧は1行ずつ止まる ＝ 中に `data-rail-snap` の印）／
//   **モジュールの中で上下に払う操作を作らない**（作るならその面を `data-rail-lock` で囲む）。
// ★HOME と TASK はここを通らない（HOME は1枚きり・TASK は作り直すまで中で縦の払いを使う）。

/** 1画面のモジュールの下に、次のモジュールを覗かせる量（タブバーの上に `PEEK − 隙間` だけ見える）。
 *  ★目盛りの外（覗かせる量。STOCK の頭の列 48px がちょうど見える）。 */
const PEEK = SPACE.xxl * 2;
/** 1画面で完結するモジュールの高さ（見る窓 − タブバー − 覗き）。`--rail-h` は `ModuleRail` が配る。 */
const SCREEN_H = `calc(var(--rail-h, 100svh) - var(--nav-h) - ${PEEK}px)`;

interface Piece extends RailPiece { module: string; tabs: TabId[] }

export function AppModules({ app, tabProps, active, jump }: {
  app: Extract<AppId, "life" | "journal">;
  tabProps: TabProps;
  active: boolean;
  /** ★そのモジュールへ運ぶ合図（`goTab` とバーの再タップ。`n` が変わるたびに1回）。 */
  jump: { tab: TabId; n: number };
}) {
  const [idx, setIdx] = useState(0);
  const [nav, setNav] = useState(0);
  useEffect(() => { setNav(navHeightPx()); return onNavHeight(() => setNav(navHeightPx())); }, []);

  const pieces = useMemo<Piece[]>(() => {
    if (app === "life") {
      return [
        {
          key: "brief", module: "BRIEF", tabs: ["brief"],
          node: (
            <div style={{ height: SCREEN_H, display: "flex", flexDirection: "column" }}>
              <BriefTab {...tabProps} bare />
            </div>
          ),
        },
        { key: "stock", module: "STOCK", tabs: ["stock"], node: <StockTab {...tabProps} bare /> },
      ];
    }
    return [
      {
        key: "record", module: "RECORD", tabs: ["journal-record"],
        node: (
          <div style={{ height: SCREEN_H, position: "relative" }}>
            <VoiceStudio voice={tabProps.voice} active={active} fit />
          </div>
        ),
      },
      { key: "today", module: "LOG", tabs: ["journal-today"], node: <JournalTab {...tabProps} tab="journal-today" bare /> },
      { key: "archive", module: "LOG", tabs: ["journal-archive"], node: <JournalTab {...tabProps} tab="journal-archive" bare /> },
    ];
  }, [app, tabProps, active]);

  /** モジュールの名前（重ねない）と、いま線の上にあるモジュールの番号。 */
  const modules = useMemo(() => [...new Set(pieces.map((p) => p.module))], [pieces]);
  const moduleIdx = Math.max(0, modules.indexOf(pieces[idx]?.module ?? ""));
  const railJump = useMemo(() => {
    const i = pieces.findIndex((p) => p.tabs.includes(jump.tab));
    return { piece: Math.max(0, i), n: jump.n };
  }, [pieces, jump]);

  return (
    <div className="full-bleed" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", paddingTop: "var(--pad-top)" }}>
      <div style={{ padding: `0 ${SPACE.lg}px` }}>
        <Masthead title={appTitle(app)} />
        {/* ★今のモジュール名。見出しの下の余白（`SPACE.lg`）のうち `SPACE.md` を食って寄せる。 */}
        <SectionLabel text={pieces[idx]?.module ?? ""} style={{ marginTop: -SPACE.md, marginBottom: SPACE.md }} />
      </div>
      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <ModuleRail
          pieces={pieces} gap={SPACE.lg} padX={SPACE.lg} endPad={nav + SPACE.lg}
          onIndex={setIdx} jump={railJump} style={{ flex: 1, minHeight: 0 }}
        />
        {/* ★★**位置の目盛り**（第134巡の構成案）。画面の右端に墨の短い線をモジュールの数だけ。今いる所だけ長い。
            ★押せない（見るだけ）。★左右の余白の中に置く（中身に重ねない）。 */}
        <div aria-hidden style={{
          position: "absolute", right: SPACE.xs, top: "40%", display: "flex", flexDirection: "column", gap: SPACE.xs,
          pointerEvents: "none", zIndex: 3,
        }}>
          {modules.map((m, i) => (
            <span key={m} style={{
              width: SPACE.hair, height: i === moduleIdx ? SPACE.xl : SPACE.sm, borderRadius: RADIUS.pill,
              background: i === moduleIdx ? `var(--ink-on, ${INK})` : `var(--muted-on, ${MUTED})`,
              opacity: i === moduleIdx ? 1 : 0.5,
              transition: "height var(--t-item) var(--ease-settle), background-color var(--t-item) var(--ease-settle)",
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}
