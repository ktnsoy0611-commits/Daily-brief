"use client";

import { Masthead } from "@/components/common";
import { VoiceStudio } from "@/components/VoiceStudio";
import { appTitle } from "@/lib/apps";
import { NAV_BOTTOM_GAP } from "@/lib/constants";
import type { TabProps } from "@/lib/types";

// ★ジャーナルの最初のタブ。**1画面で完結し、スクロールしない**
// (AppShell の scrollLocked に journal-record を入れてある)。
// 声のメモの一覧はここには置かず、TODAY タブへ移した。
//
// ★祖先(data-tab-scroll-root)のパディングを打ち消して**画面の四隅まで**
// 広げる。参考画像と同じく、巨大な円が画面の外へ続いていく構図にするため、
// 上端も含めて余白を残さない。見出しはその上に重ねて置く。
//
// ★下端は「切る」のではなく**タブバーの下へ潜らせる**。以前は器がタブバーの
// 上端で終わっていたため、そこで円がスパッと切れて横一直線の境目が出ていた
// (実機で「画面の下部がタブのところで切れている」と報告された)。器を
// タブバーの高さ(NAV_H)ぶん下へ伸ばし、はみ出した先は祖先が画面の下端で
// 切ってくれる。これで器の実高さが画面いっぱいになり、**全画面の
// オーバーレイと円がぴったり同じ**になる(これもユーザー指定)。
//
// 中身は components/VoiceStudio.tsx。タブバー右端の録音アイコンから出る
// 全画面のオーバーレイも**同じ部品**なので、見た目と操作が必ず一致する。

const PAD_TOP = "max(16px, env(safe-area-inset-top))";
// タブバーの実高さ(画面の下端からタブバーの上端まで)。アプリの目印の行(5+7)
// + ピル(TAB_MARK+NAV_PILL_PAD*2=64) + 画面下端からの浮き。
// AppShell の nav を変えたらここも合わせ直すこと。
const NAV_H = `calc(76px + ${NAV_BOTTOM_GAP})`;
// 器を下へ伸ばす量。タブバーのぶんに加えて、祖先(data-tab-scroll-root)の
// 下パディング16pxぶんも足す。この2つを足してちょうど画面の下端に届く
// (実測: main の下端 748 + 96 = 844 = 画面の高さ)。
const BLEED = `calc(${NAV_H} + 16px)`;

export function RecordTab({ profileButton, voice }: TabProps) {
  return (
    <main style={{
      position: "relative", flex: 1, minHeight: 0,
      margin: `calc(-1 * ${PAD_TOP}) -16px 0`,
    }}>
      <VoiceStudio voice={voice} bleed={BLEED} keyBottom={NAV_H} />
      <div style={{ position: "absolute", top: PAD_TOP, left: 16, right: 16, pointerEvents: "none" }}>
        <Masthead title={appTitle("journal")} corner={<span style={{ pointerEvents: "auto" }}>{profileButton}</span>} />
      </div>
    </main>
  );
}
