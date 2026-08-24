"use client";

import { Masthead } from "@/components/common";
import { DriftTab } from "@/components/tabs/DriftTab";
import { GravityTab } from "@/components/tabs/GravityTab";
import { appTitle } from "@/lib/apps";
import { TAB_PAD_TOP } from "@/lib/constants";
import type { TabId, TabProps } from "@/lib/types";

// ★★タスクアプリの器(第52巡に**縦のカメラを撤去**)。
//
// 以前は DRIFT / GRAVITY / TOP / UNDER の4層をカメラで上下していたが、「図形が
// GRAVITY に積まれているのに同時に別画面(TOP/UNDER)にも在る」のは物理のメタファー
// として破綻していた(ユーザー指摘)。TOP/UNDER を破棄し、**タスク図形は常に
// GRAVITY 空間にだけ在る**ことにした。詳細リスト(ALIGN)とスケジュール俯瞰
// (TIMELINE)は、画面遷移ではなく **GRAVITY 空間の物理法則を一時的に変えるモード**
// として `GravityTab` の中で作る。
//
// ここはその薄い器 — **画面に固定したアプリ名の札(TASK)**と、いま出ているタブの
// 中身(GRAVITY か、候補の DRIFT)を並べるだけ。
//   ・GRAVITY … 常にマウントしたまま(山を保つ)。DRIFT に切り替わると `active=false`
//     でループとジェスチャーだけ止める。
//   ・DRIFT   … そのタブのときだけ上に重ねてマウントする(候補の無重力の場)。

export function TaskSpace({ tab, appActive, ...tabProps }: TabProps & { tab: TabId; appActive: boolean }) {
  const { profileButton } = tabProps;
  const onDrift = tab === "tasks-drift";

  return (
    <main className="full-bleed" style={{ position: "relative", flex: 1, minHeight: 0, overflow: "clip" }}>
      {/* GRAVITY は常にマウント(山を保つ)。DRIFT のときは眠らせる。 */}
      <GravityTab {...tabProps} appActive={appActive} active={!onDrift} />

      {/* 候補の DRIFT はそのタブのときだけ上に重ねる。 */}
      {onDrift && (
        <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
          <DriftTab {...tabProps} appActive={appActive} active />
        </div>
      )}

      {/* アプリ名の札は画面に固定。 */}
      <div style={{ position: "absolute", top: TAB_PAD_TOP, left: 16, right: 16, pointerEvents: "none", zIndex: 3 }}>
        <Masthead title={appTitle("tasks")} corner={<span style={{ pointerEvents: "auto" }}>{profileButton}</span>} />
      </div>
    </main>
  );
}
