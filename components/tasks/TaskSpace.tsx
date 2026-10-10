"use client";

import { TaskBoard } from "@/components/tasks/TaskBoard";
import type { TabId, TabProps } from "@/lib/types";

// ★★★**TASK の器**（2026-10-10・第137巡に作り直した）。中身は `TaskBoard` の1枚だけ。
//   第135巡の日付の列（`TimelineTab`）と右上の仮のタブ（ALIGN／DRIFT ＝ 旧 `GravityTab`・`DriftTab`）は外した
//   （ユーザー承認「新しいのができたら今の task は外して良い」）。★`tab`（tasks-timeline／gravity／drift）はどれでもここへ来る。

export function TaskSpace(props: TabProps & { tab: TabId }) {
  return (
    <main className="full-bleed" style={{ position: "relative", flex: 1, minHeight: 0, overflow: "clip" }}>
      <TaskBoard {...props} />
    </main>
  );
}
