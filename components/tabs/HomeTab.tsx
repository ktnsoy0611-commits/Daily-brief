"use client";

import { useCallback, useMemo } from "react";
import { Band } from "@/components/home/Band";
import { Pile } from "@/components/home/Pile";
import { bandRows, unreadCards } from "@/lib/homeBand";
import { haptic, todayKey } from "@/lib/helpers";
import { SPACE } from "@/lib/tokens";
import type { TabProps } from "@/lib/types";

// ★★★**ホーム**（2026-09-07）。起動して最初に見る画面で、3アプリの**玄関**。
//
// **このアプリは時間管理でもタスク管理でもない。** AI が先回りして「いま自分に
// 最適なもの」を差し出す場で、仕事も週末も余暇も**同じ種類の提案**として扱う。
//
// 画面は上下2つ:
//   **上＝帯** … AI が差し出したものが流れる（`components/home/Band.tsx`）。
//   **下＝山** … 今日やると決めたものが積もる（`components/home/Pile.tsx`）。
// 帯のピルを掴んで引き下ろすと、図形に変わって山へ落ちる ―― この一続きの
// 動きが軸（★引き下ろしはこの次に作る）。

export function HomeTab({ appState, persist, showToast }: TabProps) {
  const day = todayKey();
  const today = useMemo(() => new Date(), []);
  const rows = useMemo(() => bandRows(appState), [appState]);
  const unread = useMemo(() => unreadCards(appState).length, [appState]);

  // ★★山にいるのは**今日のものだけ**（ユーザー確定）。だから山は説明が要らない
  //   ―― 日付のラベルもレーンも無い。
  //   ・四角 … 期日が今日（と、過ぎてまだ終わっていない）タスク。
  //   ・円  … **今日行くと決めた提案**（プランに入れた Item ＝ 旧バインド）。
  const pileTasks = useMemo(
    () => (appState.tasks ?? []).filter((t) => !t.done && t.dueDate && t.dueDate <= day),
    [appState.tasks, day],
  );
  const pileOffers = useMemo(() => {
    const ids = appState.magazine?.dateKey === day ? appState.magazine.itemIds : [];
    if (!ids.length) return [];
    const by = new Map((appState.items ?? []).map((i) => [i.id, i]));
    return ids.flatMap((id) => {
      const it = by.get(id);
      return it && it.status !== "done" ? [it] : [];
    });
  }, [appState.items, appState.magazine, day]);

  // ★口＝完了 ／ ゴミ箱＝削除。**既存の GRAVITY と同じ動作**（掴んで放り込む）。
  const complete = useCallback((p: { kind: "task" | "offer"; id: string }) => {
    haptic(8);
    const next = structuredClone(appState);
    if (p.kind === "task") {
      const t = next.tasks.find((x) => x.id === p.id);
      if (!t) return;
      t.done = true; t.doneAt = new Date().toISOString();
      showToast(`${t.title} を終えた`);
    } else {
      const it = next.items.find((x) => x.id === p.id);
      if (!it) return;
      it.status = "done"; it.doneAt = new Date().toISOString();
      showToast(`${it.title} を終えた`);
    }
    persist(next);
  }, [appState, persist, showToast]);

  const remove = useCallback((p: { kind: "task" | "offer"; id: string }) => {
    haptic(8);
    const next = structuredClone(appState);
    if (p.kind === "task") {
      next.tasks = next.tasks.filter((x) => x.id !== p.id);
    } else {
      // ★提案は消さずに**候補へ戻す**（ストックに残る）。山から下ろすだけ。
      const it = next.items.find((x) => x.id === p.id);
      if (it) it.status = "candidate";
      if (next.magazine) next.magazine.itemIds = next.magazine.itemIds.filter((id) => id !== p.id);
    }
    persist(next);
  }, [appState, persist]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%", paddingTop: SPACE.sm }}>
      {/* 帯（3段）。★器の左右のパディングの外へ出る（`.bleed-x`）ので、
          左右とも画面の外へ切れる ＝「まだ続きがある」を形で言う。 */}
      <Band rows={rows} />
      {/* 山。★帯の下の**残り全部**を器にする（帯が何段でも山が余りを取る）。 */}
      <Pile
        tasks={pileTasks}
        offers={pileOffers}
        unread={unread}
        today={today}
        onComplete={complete}
        onDelete={remove}
      />
    </div>
  );
}
