"use client";

import { INK, LATIN, PAPER } from "@/lib/constants";
import { SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";

// ★★★**右端の「ASSIGN」の帯**（2026-09-14・第102巡にユーザー指定）。
//
// > 別の日付を割り当てる場合ですが、掴んだまま**画面の右端に近づけると画面の
// > 右端から黒い帯が出てきます。そこにはアサイン、英語で ASSIGN と書いてあります**。
// > この時、**帯が出てくる時のアニメーションもベジエ曲線を使ってスムーズに**
// > 入ってくるようにして、そこで**その帯で図形を離すとカレンダーの画面**が出てきます。
//
// ★★★**曲線は `--ease-sheet`**（`app/globals.css` の「面が滑り込む」用）。
//   `--ease-settle` は**距離の 80% を最初の 1/4 で使う**ので、画面の端から入って
//   くる大きな面には使わない（`globals.css` の但し書き）。
//
// ★★★**当たり判定はこの要素で取らない。** 指の x が右の縁から `RAIL_NEAR` の
//   内側に居るか、だけで決める（`lib/pullDrag.ts`）。`--t-in`(700ms) のあいだ
//   この面は `transform` の途中なので、**矩形を測っても嘘になる**
//   （`components/tasks/DropTargets.tsx` が `offsetLeft` を使っているのと同じ理由）。
//   ★測らなければ嘘も付かない。だから `pointerEvents` は切ってある。

/** 帯の幅。★目盛りの外（部品の寸法）。 */
const RAIL_W = SPACE.xxl + SPACE.lg;

export function AssignRail({ show }: { show: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute", zIndex: 5, pointerEvents: "none",
        /* ★目盛りの外（画面の縁に貼る面） */ top: 0, bottom: 0, right: 0,
        width: RAIL_W, background: INK,
        display: "flex", alignItems: "center", justifyContent: "center",
        transform: show ? "translateX(0)" : "translateX(100%)",
        transition: "transform var(--t-in) var(--ease-sheet)",
        willChange: "transform",
      }}
    >
      {/* ★層の名前と同じ組み方（大文字・`wide`・小さく）。★`caps`/`wide` は
          最後の字の右にも字間が付くので、中央揃えでは同じだけ左へ戻す。 */}
      <span style={{
        fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: WEIGHT.bold,
        letterSpacing: TRACK.wide, color: PAPER,
        writingMode: "vertical-rl", textOrientation: "mixed",
        marginBottom: "-0.24em",
      }}>ASSIGN</span>
    </div>
  );
}
