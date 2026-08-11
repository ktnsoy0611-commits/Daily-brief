"use client";

import { Masthead } from "@/components/common";
import { VoiceStudio } from "@/components/VoiceStudio";
import { appTitle } from "@/lib/apps";
import type { TabProps } from "@/lib/types";

// ★ジャーナルの最初のタブ。**1画面で完結し、スクロールしない**
// (AppShell の scrollLocked に journal-record を入れてある)。
// 声のメモの一覧はここには置かず、TODAY タブへ移した。
//
// ★祖先(data-tab-scroll-root)のパディングを打ち消して**画面の四隅まで**
// 広げる。参考画像と同じく、巨大な円が画面の外へ続いていく構図にするため、
// 上端も含めて余白を残さない。見出しはその上に重ねて置く。
//
// 中身は components/VoiceStudio.tsx。タブバー右端の録音アイコンから出る
// 全画面のオーバーレイも**同じ部品**なので、見た目と操作が必ず一致する。

const PAD_TOP = "max(16px, env(safe-area-inset-top))";

export function RecordTab({ profileButton, voice }: TabProps) {
  return (
    <main style={{
      position: "relative", flex: 1, minHeight: 0,
      margin: `calc(-1 * ${PAD_TOP}) -16px -16px`,
    }}>
      <VoiceStudio voice={voice} />
      <div style={{ position: "absolute", top: PAD_TOP, left: 16, right: 16, pointerEvents: "none" }}>
        <Masthead title={appTitle("journal")} corner={<span style={{ pointerEvents: "auto" }}>{profileButton}</span>} />
      </div>
    </main>
  );
}
