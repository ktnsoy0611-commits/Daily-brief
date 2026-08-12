"use client";

import { Masthead } from "@/components/common";
import { appTitle } from "@/lib/apps";
import { TAB_PAD_TOP } from "@/lib/constants";
import type { TabProps } from "@/lib/types";

// ★タスクタブ(GRAVITY)。確定したタスクが上から落ちてきて積み上がる。
// 物体の大きさ = 重要度 × 切迫度。中身(matter.js の物理と canvas の描画)は
// Step 4 で入れる。
//
// ★画面の四隅まで使うので `.full-bleed`(app/globals.css)を付ける。
// タブバーはフローから外して浮かせてあるので、床はタブバーの下まで続き、
// タブバーがその上に乗る。**タブ側で高さの計算をしないこと**(§50)。

export function GravityTab({ profileButton }: TabProps & { appActive?: boolean }) {
  return (
    <main className="full-bleed" style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <div style={{ position: "absolute", top: TAB_PAD_TOP, left: 16, right: 16, pointerEvents: "none", zIndex: 2 }}>
        <Masthead title={appTitle("tasks")} corner={<span style={{ pointerEvents: "auto" }}>{profileButton}</span>} />
      </div>
    </main>
  );
}
