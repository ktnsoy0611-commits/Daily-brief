"use client";

import { useEffect, useRef, useState } from "react";
import { Masthead } from "@/components/common";
import { DriftTab } from "@/components/tabs/DriftTab";
import { GravityTab } from "@/components/tabs/GravityTab";
import { appTitle } from "@/lib/apps";
import { TAB_PAD_TOP } from "@/lib/constants";
import type { TabId, TabProps } from "@/lib/types";

// ★★タスクアプリの器 ＝**カメラ**(2026-08-25・第62巡に作り直し)。
//
// ユーザーの心象は **GRAVITY＝地上 / DRIFT＝上空**で、指で払うと
// **カメラが上空へパンして上がる**。第60〜61巡は「図形を物理で吹き飛ばして、
// 抜け切ったらタブを差し替える」だったので、**画面そのものは1ミリも動いて
// いなかった** ―「パンせずにそのまま切り替わる」というユーザー指摘の正体。
//
// ここでは2つの層を**縦に積んで、器ごと `translateY` する**。
//   ・地上(GRAVITY) … `inset: 0`。常にマウントしたまま(山を保つ)。
//   ・上空(DRIFT)   … 地上の**真上**(`bottom: 100%`)＋`SKY_GAP` ぶんの空。
// `--cam` はいまのタブから決まるだけで、**指には追従しない**(ユーザー確定
// 「払ったらグワーっとパン」)。払いは各層が `goTab` を呼ぶだけ。
//
// ★★第52巡に撤去したのは **4層＋`perspective`/`rotateX` の3Dカメラ**であって、
// これは**2枚を 2D の `translateY` で送るだけ**の別物。3D 変形は使わない。
//
// ★アプリ名の札(`Masthead`)は**カメラに乗らない**(画面に固定)。層の名前
// (`LayerName`)は層の持ち物なので一緒に流れる ― 動いている最中も、いま自分が
// どこに居るかが読める。

/** 地上と上空のあいだの「何も無い空」。画面の高さに対する割合。
 *  ★合計の移動が画面 1.6 枚ぶんになるので「遠くまで上がった」が出る。 */
const SKY_GAP = "60%";

export function TaskSpace({ tab, appActive, ...tabProps }: TabProps & { tab: TabId; appActive: boolean }) {
  const { profileButton } = tabProps;
  const onDrift = tab === "tasks-drift";

  // ★★上空は**一度出したら外さない**(`AppShell` の `mountedApps` と同じ作法)。
  //   パンの最中は地上と上空が両方見えるので、片方が居ないと**空白が流れていく**。
  //   ★第61巡に DRIFT の場を canvas ローカルにしたので、出しっぱなしでも位置は狂わない。
  const [skyReady, setSkyReady] = useState(onDrift);
  useEffect(() => { if (onDrift) setSkyReady(true); }, [onDrift]);

  // ★効果線は**パンの半ばだけ**(ユーザー指定「距離がある感じを出すために、
  //   アニメーションの半ばで効果線」)。タブが変わった瞬間に一度だけ流す。
  const [pan, setPan] = useState<"up" | "down" | null>(null);
  const prevRef = useRef(onDrift);
  useEffect(() => {
    if (prevRef.current === onDrift) return;
    setPan(onDrift ? "up" : "down");
    prevRef.current = onDrift;
  }, [onDrift]);

  return (
    <main className="full-bleed" style={{ position: "relative", flex: 1, minHeight: 0, overflow: "clip" }}>
      {/* ★カメラ。`--cam` は「いまどちらを見ているか」だけで決まる。 */}
      <div className="task-cam" style={{ ["--cam" as string]: onDrift ? `calc(100% + ${SKY_GAP})` : "0px" }}>
        {/* 上空 … 地上の真上。あいだに `SKY_GAP` ぶんの空を空ける。 */}
        {skyReady && (
          <div style={{ position: "absolute", left: 0, right: 0, height: "100%", bottom: `calc(100% + ${SKY_GAP})` }}>
            <DriftTab {...tabProps} appActive={appActive} active={onDrift} />
          </div>
        )}
        {/* 地上 */}
        <div style={{ position: "absolute", inset: 0 }}>
          <GravityTab {...tabProps} appActive={appActive} active={!onDrift} />
        </div>
      </div>

      {/* ★効果線 … パンの半ばでいちばん濃い。終わったら自分で外れる。 */}
      {pan && (
        <div key={pan} className="task-speed" data-dir={pan} onAnimationEnd={() => setPan(null)} />
      )}

      {/* アプリ名の札は画面に固定。 */}
      <div style={{ position: "absolute", top: TAB_PAD_TOP, left: 16, right: 16, pointerEvents: "none", zIndex: 3 }}>
        <Masthead title={appTitle("tasks")} corner={<span style={{ pointerEvents: "auto" }}>{profileButton}</span>} />
      </div>
    </main>
  );
}
