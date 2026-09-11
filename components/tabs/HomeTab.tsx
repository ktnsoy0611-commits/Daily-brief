"use client";

import { useMemo } from "react";
import { Masthead } from "@/components/common";
import { Band } from "@/components/home/Band";
import { Pile } from "@/components/home/Pile";
import { appTitle } from "@/lib/apps";
import { bandRows, unreadCards } from "@/lib/homeBand";
import { todayKey } from "@/lib/helpers";
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

/** ★★声を録っていない日に山へ落ちる図形の文面。**変えるときはここ1行**。 */
const JOURNAL_PROMPT = "今日を録る";

export function HomeTab({ appState, goTab }: TabProps) {
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

  // ★★★**その日まだ声を録っていなければ、JOURNAL の図形も山に落とす**
  //   （2026-09-09 ユーザー指定）。録ってあれば出さない ―― 済んだことを
  //   画面に残さない。押すと JOURNAL のレコードへ飛ぶ。
  const journal = useMemo(() => {
    const done = (appState.voiceNotes ?? []).some((v) => (v.at ?? "").slice(0, 10) === day);
    return done ? null : { title: JOURNAL_PROMPT };
  }, [appState.voiceNotes, day]);

  // ★★★**口とブラックホールは置かない**（2026-09-09 ユーザー指定で削除）。
  //   山で図形にできるのは**掴んで運ぶこと**だけ。完了も削除もここでは起こさない
  //   ―― 何をどうやって片づけるかは、引き下ろしの動きと一緒に決める。

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      {/* ★左上の名前。**3アプリとまったく同じ組み方**（幾何アルファベットの
          `Masthead`）。ホームも列の1つなので、顔を揃える。 */}
      <Masthead title={appTitle("home")} />
      {/* ★★★**帯は山の上に重ねる**（2026-09-10 ユーザー指定「ピルの後ろに背景が
          あって図形が落ちてくるのが見えない」）。縦に並べると、山の器は帯の
          **下から**始まるので、**図形は帯の高さぶん見えないところを落ちてくる**。
          重ねれば器は名前の下から全部で、**図形はピルの後ろを通って**降りてくる。 */}
      {/* ★★★**山の器は列のパディングの外へ出す**（2026-09-11・`.bleed-x`）。
          内側に置くと、図形の壁が**画面の端から 32px**（列の 16 ＋ 壁の 16）になり、
          **画面の端から 16px のタブバーと揃わない**。外へ出して壁を `PILE_INSET`
          にすると、左右がタブバーと**同じ位置**になる。★帯と同じ扱い。 */}
      <div className="bleed-x" style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {/* 山。★器は名前の下の**残り全部**（左右は画面いっぱい）。 */}
        <Pile
          tasks={pileTasks} offers={pileOffers} unread={unread} today={today}
          journal={journal} onOpen={goTab}
        />
        {/* 帯（2段）。★器の左右のパディングの外へ出る（`.bleed-x`）ので、
            左右とも画面の外へ切れる ＝「まだ続きがある」を形で言う。
            ★触れるのはピルだけ（`pointerEvents`）―― 帯の余白で山の操作を殺さない。 */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, pointerEvents: "none" }}>
          <Band rows={rows} />
        </div>
      </div>
    </div>
  );
}
