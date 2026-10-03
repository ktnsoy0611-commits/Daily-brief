"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Masthead, SectionLabel } from "@/components/common";
import { ModuleRail, type RailPiece } from "@/components/ModuleRail";
import { VoiceStudio } from "@/components/VoiceStudio";
import { BriefTab } from "@/components/tabs/BriefTab";
import { useJournalLog } from "@/components/tabs/JournalTab";
import { useStockModule } from "@/components/tabs/StockTab";
import { appTitle } from "@/lib/apps";
import { useAppActive } from "@/lib/appActive";
import { INK, MUTED, navHeightPx, onNavHeight } from "@/lib/constants";
import { RADIUS, SPACE } from "@/lib/tokens";
import type { AppId, TabId, TabProps } from "@/lib/types";

// ★★★**アプリの中の縦のモジュール**（2026-09-29・第134巡にユーザー確定の構成）。
// ★見出し（アプリ名）とその下の**今のモジュール名**は動かない。その下を `ModuleRail` が1枚ずつ送る。
// ★約束（`docs/project_knowledge.md` の「モジュールの約束」）… 1番目 ＝ 今日やること（1画面に収まる）／
//   2番目から ＝ 溜まったもの（★★**1行 ＝ 1枚**。送りのばねは1枚ずつに掛かるので、どの行でも同じ柔らかさで動き、
//   1行ずつ止まる ―― 第134巡の2度目にユーザー指摘「バネ感のあるモジュールとないモジュールがある」）／
//   **モジュールの中で上下に払う操作を作らない**（作るならその面を `data-rail-lock` で囲む）。
// ★HOME と TASK はここを通らない（HOME は1枚きり・TASK は作り直すまで中で縦の払いを使う）。

/** ★★★**モジュールとモジュールのあいだ**（2026-10-03・第136巡にユーザー指摘「**カードのすぐ下にプランを作るがあり
 *  近過ぎる。モジュール間のスペーシングが適切でない。必ずしも画面に入っていなくてよい**」）。
 *  ★第134〜135巡は行と行と同じ `SPACE.lg`(16) で、次のモジュールの頭をタブバーの上に覗かせていた ―― 塊の切れ目が
 *  行の切れ目と同じ幅なので、BRIEF の札と STOCK の頭が1つの塊に見えた。→ 切れ目は行の隙間の4倍。
 *  ★1画面のモジュールは「見る窓 − タブバー − この隙間」の高さ。次のモジュールは**画面の下端より下**から始める
 *  （タブバーのまわりに頭が半端に覗かない。位置は右端の目盛りが言う）―― 送る途中に見える切れ目は この隙間 ＋ タブバー。
 *  ★目盛りの外（塊の切れ目。`SPACE.xxl` × 2）。 */
const MODULE_GAP = SPACE.xxl * 2;
/** 1画面で完結するモジュールの高さ（見る窓 − タブバー − 切れ目）。`--rail-h` は `ModuleRail` が配る。 */
const SCREEN_H = `calc(var(--rail-h, 100svh) - var(--nav-h) - ${MODULE_GAP}px)`;

interface Piece extends RailPiece { module: string; tabs: TabId[] }

interface ModulesProps {
  tabProps: TabProps;
  /** ★そのモジュールへ運ぶ合図（`goTab` とバーの再タップ。`n` が変わるたびに1回）。 */
  jump: { tab: TabId; n: number };
}

export function AppModules({ app, ...rest }: ModulesProps & { app: Extract<AppId, "life" | "journal"> }) {
  return app === "life" ? <ExploreModules {...rest} /> : <JournalModules {...rest} />;
}

function ExploreModules({ tabProps, jump }: ModulesProps) {
  const stock = useStockModule(tabProps);
  const pieces: Piece[] = [
    {
      key: "brief", module: "BRIEF", tabs: ["brief"],
      node: (
        <div style={{ height: SCREEN_H, display: "flex", flexDirection: "column" }}>
          <BriefTab {...tabProps} bare />
        </div>
      ),
    },
    ...stock.pieces.map((p, i) => ({ ...p, module: "STOCK", tabs: i === 0 ? ["stock" as TabId] : [] })),
  ];
  return <ModuleShell app="life" pieces={pieces} jump={jump} overlay={stock.overlay} />;
}

function JournalModules({ tabProps, jump }: ModulesProps) {
  const log = useJournalLog(tabProps);
  const pieces: Piece[] = [
    {
      key: "record", module: "RECORD", tabs: ["journal-record"],
      node: (
        <div style={{ height: SCREEN_H, position: "relative" }}>
          <RecordPiece voice={tabProps.voice} />
        </div>
      ),
    },
    ...log.pieces.map((p) => ({ key: p.key, node: p.node, module: "LOG", tabs: p.tab ? [p.tab] : [] })),
  ];
  return <ModuleShell app="journal" pieces={pieces} jump={jump} overlay={log.overlay} />;
}

/** ★表示中かどうかを購読するのは**録音機だけ**（第135巡）。送りの中身は切り替えで描き直さない。 */
function RecordPiece({ voice }: { voice: TabProps["voice"] }) {
  const active = useAppActive("journal");
  return <VoiceStudio voice={voice} active={active} fit />;
}

function ModuleShell({ app, pieces, jump, overlay }: {
  app: AppId;
  pieces: Piece[];
  jump: { tab: TabId; n: number };
  overlay: ReactNode;
}) {
  const [idx, setIdx] = useState(0);
  const [nav, setNav] = useState(0);
  useEffect(() => { setNav(navHeightPx()); return onNavHeight(() => setNav(navHeightPx())); }, []);

  /** モジュールの名前（重ねない）と、いま線の上にあるモジュールの番号。 */
  const modules = [...new Set(pieces.map((p) => p.module))];
  const moduleIdx = Math.max(0, modules.indexOf(pieces[idx]?.module ?? ""));
  // ★合図の数 `n` が変わったときだけ運ぶ（中身が変わるたびに運び直さない ―― `ModuleRail` は `n` を見る）。
  const target = Math.max(0, pieces.findIndex((p) => p.tabs.includes(jump.tab)));
  const railJump = useMemo(() => ({ piece: target, n: jump.n }), [target, jump.n]);

  // ★モジュールの最後の1枚の下にだけ、切れ目の残り（切れ目 ＋ タブバー − 行の隙間）を足す。止まる所は各1枚の上端のまま。
  const railPieces = pieces.map((p, i) => (i + 1 < pieces.length && pieces[i + 1].module !== p.module
    ? { ...p, node: <div style={{ paddingBottom: `calc(${MODULE_GAP - SPACE.lg}px + var(--nav-h))` }}>{p.node}</div> }
    : p));

  return (
    <div className="full-bleed" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", paddingTop: "var(--pad-top)" }}>
      <div style={{ padding: `0 ${SPACE.lg}px` }}>
        <Masthead title={appTitle(app)} />
        {/* ★今のモジュール名。見出しの下の余白（`SPACE.lg`）のうち `SPACE.md` を食って寄せる。 */}
        <SectionLabel text={pieces[idx]?.module ?? ""} style={{ marginTop: -SPACE.md, marginBottom: SPACE.md }} />
      </div>
      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <ModuleRail
          pieces={railPieces} gap={SPACE.lg} padX={SPACE.lg} endPad={nav + SPACE.lg}
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
      {/* ★シート・詳細は送りの外（送りの1枚は `transform` を持つので、中に置くと固定の面が1枚に閉じ込められる）。 */}
      {overlay}
    </div>
  );
}
