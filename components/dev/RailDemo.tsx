"use client";

import { useEffect, useMemo, useState } from "react";
import { Masthead, SectionLabel } from "@/components/common";
import { ModuleRail, type RailPiece } from "@/components/ModuleRail";
import {
  CARD_RADIUS, INK, JOURNAL_FACE, LATIN, MUTED, PAPER, SOFT_SHADOW, SOFT_SHADOW_LG, SURFACE, navHeightPx, onNavHeight,
} from "@/lib/constants";
import {
  RECORDER_AR, RECORDER_BEZEL_PER_W, RECORDER_DECK_H_PER_W, RECORDER_DECK_Y_PER_W, RECORDER_REEL_CY_PER_W,
  RECORDER_REEL_D_PER_W, RECORDER_SCREEN_H_PER_W, RECORDER_SCREEN_Y_PER_W,
} from "@/lib/recorder";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";

// ★★**モジュール送りの試作**（2026-09-28・第134巡。`DEV` タブの「送り」）。JOURNAL を
//   「RECORD（録音機）→ LOG（日のタイル）」の2つに組み直したときの**動きだけ**を実機で触るための見本。
//   ★中身は置き物（録音機は形だけ・タイルは日付と灰色の行）。★本物の画面へ移したらこのファイルは消す。

const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** 幅に対する比を、器の高さに対する % へ（`top` の % は高さで解決されるため）。 */
const ofH = (perW: number) => `${perW * RECORDER_AR * 100}%`;

function RecorderShape() {
  return (
    <div style={{
      position: "relative", width: "100%", aspectRatio: RECORDER_AR,
      background: JOURNAL_FACE, borderRadius: CARD_RADIUS, boxShadow: SOFT_SHADOW_LG,
    }}>
      <div style={{
        position: "absolute", left: "50%", transform: "translateX(-50%)",
        top: ofH(RECORDER_REEL_CY_PER_W - RECORDER_REEL_D_PER_W / 2),
        width: `${RECORDER_REEL_D_PER_W * 100}%`, aspectRatio: 1, borderRadius: RADIUS.circle, background: INK,
      }} />
      <div style={{
        position: "absolute", left: `${RECORDER_BEZEL_PER_W * 100}%`, right: `${RECORDER_BEZEL_PER_W * 100}%`,
        top: ofH(RECORDER_SCREEN_Y_PER_W), height: ofH(RECORDER_SCREEN_H_PER_W),
        borderRadius: CARD_RADIUS - SPACE.xl, background: INK,
      }} />
      <div style={{
        position: "absolute", left: `${RECORDER_BEZEL_PER_W * 100}%`, right: `${RECORDER_BEZEL_PER_W * 100}%`,
        top: ofH(RECORDER_DECK_Y_PER_W), height: ofH(RECORDER_DECK_H_PER_W),
        borderRadius: RADIUS.pill, background: INK,
      }} />
    </div>
  );
}

function Lines({ n }: { n: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} style={{ height: SPACE.sm, borderRadius: RADIUS.pill, background: SURFACE, width: i === n - 1 ? "60%" : "100%" }} />
      ))}
    </div>
  );
}

function DayTile({ label, big }: { label: string; big?: boolean }) {
  return (
    <div style={{
      background: PAPER, borderRadius: CARD_RADIUS, boxShadow: SOFT_SHADOW, padding: SPACE.lg,
      display: "flex", flexDirection: "column", gap: SPACE.md,
      ...(big ? {} : { aspectRatio: 1, flex: 1, minWidth: 0 }),
    }}>
      <span style={{ fontFamily: LATIN, fontSize: TYPE.small, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat, letterSpacing: TRACK.caps, color: MUTED }}>
        {label}
      </span>
      <Lines n={big ? 3 : 2} />
    </div>
  );
}

export function RailDemo() {
  const [idx, setIdx] = useState(0);
  const [nav, setNav] = useState(0);
  useEffect(() => { setNav(navHeightPx()); return onNavHeight(() => setNav(navHeightPx())); }, []);

  const pieces = useMemo<RailPiece[]>(() => {
    const days = Array.from({ length: 13 }, (_, i) => {
      const d = new Date(Date.now() - (i + 1) * 864e5);
      return `${d.getMonth() + 1}.${d.getDate()} ${WD[d.getDay()]}`;
    });
    const rows: RailPiece[] = [];
    for (let i = 0; i < days.length; i += 2) {
      rows.push({
        key: `row-${i}`,
        node: (
          <div style={{ display: "flex", gap: SPACE.md }}>
            <DayTile label={days[i]} />
            {days[i + 1] ? <DayTile label={days[i + 1]} /> : <div style={{ flex: 1 }} />}
          </div>
        ),
      });
    }
    return [
      { key: "record", node: <RecorderShape /> },
      { key: "today", node: <DayTile label="TODAY" big /> },
      ...rows,
    ];
  }, []);
  const name = idx === 0 ? "RECORD" : "LOG";

  return (
    <div className="full-bleed" style={{
      position: "relative", height: "100dvh", display: "flex", flexDirection: "column",
      paddingTop: "var(--pad-top)",
    }}>
      <div style={{ padding: `0 ${SPACE.lg}px` }}>
        <Masthead title="JOURNAL" />
        <SectionLabel text={name} style={{ marginTop: -SPACE.md, marginBottom: SPACE.md }} />
      </div>
      <ModuleRail
        pieces={pieces} gap={SPACE.lg} padX={SPACE.lg} endPad={nav + SPACE.lg}
        onIndex={setIdx} style={{ flex: 1, minHeight: 0 }}
      />
    </div>
  );
}
