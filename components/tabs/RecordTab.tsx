"use client";

import { Masthead } from "@/components/common";
import { SPACE } from "@/lib/tokens";
import { VoiceStudio } from "@/components/VoiceStudio";
import { appTitle } from "@/lib/apps";
import { TAB_PAD_TOP } from "@/lib/constants";
import type { TabProps } from "@/lib/types";

// ★ジャーナルの最初のタブ。**1画面で完結し、スクロールしない**
// (AppShell の scrollLocked に journal-record を入れてある)。
// 声のメモの一覧はここには置かず、TODAY タブへ移した。
//
// ★画面の四隅まで敷くのは `.full-bleed`(app/globals.css)を付けるだけ。
// タブバーはフローから外して画面の上に浮かせてあるので、この器はそのまま
// タブバーの下まで続き、タブバーがその上に乗る。**タブ側で高さの計算を
// しないこと**(以前はタブバーの高さぶんの negative margin を各タブが
// 自前で持っており、数字がずれるたびに「タブバーの上下に境目が出る」
// 「背景が途中で切れる」不具合が再発していた)。
//
// 中身は components/VoiceStudio.tsx。タブバー右端の録音アイコンから出る
// 全画面のオーバーレイも**同じ部品**なので、見た目と操作が必ず一致する。

export function RecordTab({ voice, appActive }: TabProps & { appActive?: boolean }) {
  return (
    <main className="full-bleed" style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <VoiceStudio voice={voice} active={appActive} />
      <div style={{ position: "absolute", top: TAB_PAD_TOP, left: SPACE.lg, right: SPACE.lg, pointerEvents: "none" }}>
        <Masthead title={appTitle("journal")} />
      </div>
    </main>
  );
}
