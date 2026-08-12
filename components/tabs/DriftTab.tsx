"use client";

import { Masthead } from "@/components/common";
import { appTitle } from "@/lib/apps";
import type { TabProps } from "@/lib/types";

// ★候補タブ(DRIFT)。まだ確定していないタスクの候補が、無重力で漂う。
// 中身(柱体の描画と漂い)は Step 2 で入れる。

export function DriftTab({ appState, profileButton }: TabProps) {
  const candidates = (appState.inbox ?? []).filter((c) => c.kind === "task");
  return (
    <main style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <Masthead title={appTitle("tasks")} corner={profileButton} />
      <div style={{ position: "relative", flex: 1, minHeight: 380 }} data-drift-field>
        {candidates.length}
      </div>
    </main>
  );
}
