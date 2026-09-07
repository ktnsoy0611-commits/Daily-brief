"use client";

import { useMemo } from "react";
import { Band } from "@/components/home/Band";
import { bandRows } from "@/lib/homeBand";
import { todayKey } from "@/lib/helpers";
import { SPACE } from "@/lib/tokens";
import type { TabProps } from "@/lib/types";

// ★★★**ホーム**（2026-09-07）。起動して最初に見る画面で、3アプリの**玄関**。
//
// **このアプリは時間管理でもタスク管理でもない。** AI が先回りして「いま自分に
// 最適なもの」を差し出す場で、仕事も週末も余暇も**同じ種類の提案**として扱う。
//
// 画面は上下2つ … **上＝AI が差し出したものが流れる帯**（`components/home/Band.tsx`）
// ／**下＝今日やると決めたものが積もる山**。帯のピルを掴んで引き下ろすと、
// 図形に変わって山へ落ちる ―― この一続きの動きが軸。
//
// ★★いまは**帯までを作った段階**（山・引き下ろし・持ち物はこの後）。
//   下は地のまま空けてある。

export function HomeTab({ appState }: TabProps) {
  const day = todayKey();
  const rows = useMemo(() => bandRows(appState, day), [appState, day]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%", paddingTop: SPACE.sm }}>
      {/* 帯（3段）。★器の左右のパディングの外へ出る（`.bleed-x`）ので、
          左右とも画面の外へ切れる ＝「まだ続きがある」を形で言う。 */}
      <Band rows={rows} />
    </div>
  );
}
