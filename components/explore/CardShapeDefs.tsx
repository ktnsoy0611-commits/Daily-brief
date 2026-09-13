"use client";

import { CARD_SHAPES, cardShapePath } from "@/lib/cardShape";

// ★★★**札の写真を切り抜く `<clipPath>` の置き場**（2026-09-13・第95巡）。
//
// ★★★**なぜ CSS のマスクをやめたか**は `lib/cardShape.ts` の頭に書いてある
//   （実機で `mask-size: 100% 100%` が効かず、SVG が固有の 1:1 の比のまま
//   置かれていた。Chromium でも Playwright の WebKit でも再現しない）。
//
// ★★★**id は札ごとに違うものを渡すこと**（`prefix`）。`AppShell` は**タブを
//   全部載せたまま**横へ送るので、BRIEF の札と `DEV` の見本帳が**同時に
//   存在する**。固定の id にすると重複して、どれが効くか決まらなくなる。
//   → 呼ぶ側（`CardFace`）が `useId()` を1つ取り、この器と `clip-path` の
//   両方へ同じ `prefix` を渡す。**札1枚が自分の defs を持つ。**
//
// ★★`<svg>` は**描かない**（`width`/`height` 0、`position: absolute`）。
//   `<defs>` の中身は描画されないが、器が場所を取ると列の高さが狂う。

export function CardShapeDefs({ prefix }: { prefix: string }) {
  return (
    <svg
      aria-hidden
      width={0}
      height={0}
      /* ★目盛りの外（描かない器。場所を取らせないための 0） */
      style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
    >
      <defs>
        {CARD_SHAPES.map((shape) => (
          <clipPath key={shape} id={`${prefix}-${shape}`} clipPathUnits="objectBoundingBox">
            <path d={cardShapePath(shape)} />
          </clipPath>
        ))}
      </defs>
    </svg>
  );
}
