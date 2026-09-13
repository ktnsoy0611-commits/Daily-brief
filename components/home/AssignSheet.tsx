"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Press } from "@/components/Button";
import { MonthGrid, ON_G, DIM, Quick, ymd } from "@/components/DateGrid";
import { CHARCOAL, SANS } from "@/lib/constants";
import { pushGround } from "@/lib/ground";
import { haptic } from "@/lib/helpers";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";

// ★★★**日付を割り当てる画面**（2026-09-14・第102巡にユーザー指定）。
//
// > そこで**その帯で図形を離すとカレンダーの画面が出てきて**、カレンダーの上部には
// > **今日・明日・来週っていうボタン**があって、カレンダーは**横にスワイプ**、
// > 滑らかにスワイプさせることができて、**割り当てたい日付をタップすると登録が完了**。
//
// ★★★**盤は `components/DateGrid.tsx`**（タスクの入力画面と**同じ1つ**）。
// ★★★**日をタップしたらその場で確定**。✓ を押させない ―― 手つきを2回に割らない
//   （`docs/home-spec.md` が K3「下から暗いシート」を弱いとした理由がまさにそれ）。
// ★地は**墨**（ユーザー確定。タスクの入力画面・声の録音・設定と同じ側）。

export function AssignSheet({ title, accent, value, onPick, onClose }: {
  /** 何に日付を付けるのか（題をそのまま出す）。 */
  title: string;
  /** そのものが持っている色（提案はジャンルの色、タスクはメインカラー）。 */
  accent: string;
  /** すでに入っている日（付け直しのとき）。 */
  value?: string;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  // ★全画面の面を作ったら地色を知らせる（`lib/ground.ts` の約束）。
  useEffect(() => pushGround(CHARCOAL), []);

  const pick = (iso: string) => { haptic(10); onPick(iso); };

  // ★★★**body 直下へポータルで出す**（2026-09-14・第102巡）。祖先の `.app-track` は
  //   `transform` を持つので、CSS の規則で**その子孫の `position: fixed` の包含ブロックに
  //   なる** ―― そのまま置くと `inset: 0` が**3列ぶんの幅（1170px）**に広がり、
  //   カレンダーが横に3倍へ伸びた（実測。曜日が2列しか見えなくなった）。
  //   ★`components/BottomSheet.tsx` が同じ理由でポータルを使っている。
  if (typeof document === "undefined") return null;
  return createPortal((
    <div
      className="tc-sheet"
      style={{
        position: "fixed", inset: 0, zIndex: 60, background: CHARCOAL,
        display: "flex", flexDirection: "column",
        padding: `max(${SPACE.xl}px, env(safe-area-inset-top)) ${SPACE.lg}px max(${SPACE.lg}px, env(safe-area-inset-bottom))`,
        overscrollBehavior: "contain",
      }}
    >
      {/* 見出しの行 … 左に ✕、右に題。★題は1行で頭打ち（長い題で盤が下がらない）。 */}
      <div style={{ display: "flex", alignItems: "center", gap: SPACE.md, flexShrink: 0 }}>
        <Press onPress={onClose} aria-label="閉じる" className="tc-lamp" style={{
          width: SPACE.xxl, height: SPACE.xxl, borderRadius: RADIUS.circle,
          display: "flex", alignItems: "center", justifyContent: "center", color: DIM,
          fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.bold, lineHeight: LEAD.flat,
        }}>✕</Press>
        <span style={{
          minWidth: 0, flex: 1, color: ON_G,
          fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold,
          lineHeight: LEAD.snug, letterSpacing: TRACK.normal,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{title}</span>
      </div>

      <div style={{ height: SPACE.lg, flexShrink: 0 }} />
      <Quick accent={accent} selected={value} onPick={pick} />
      <div style={{ height: SPACE.md, flexShrink: 0 }} />
      <MonthGrid accent={accent} selected={value ?? ymd(new Date())} onPick={pick} />
    </div>
  ), document.body);
}
