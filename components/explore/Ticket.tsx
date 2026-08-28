"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import {
  INK, LATIN, MUTED, RUST, SANS, SECOND, SOFT_SHADOW_LG,
  TICKET_ASPECT, TICKET_DECK, TICKET_DOMAIN_COLOR, TICKET_GRAIN, TICKET_PAPER, TICKET_PERF,
  itemKindOf, KIND_DOMAIN,
} from "@/lib/constants";
import { serialOf } from "@/lib/ticket";
import type { ItemKind } from "@/lib/types";
import { PunchHole } from "./PunchMark";

// 券。Explore の唯一の共通部品で、提案・ストック・マップで縮尺だけが変わる。
// 設計の正は docs/explore-redesign.md。
//
// ★分類の色は4ドメインが持ち、10種類の kind は帯の中の漢字1文字が担う。
// ★写真が無い券は、写真の枠が分類色の面になり、題がその中まで大きく伸びる。
//   型が壊れないので、束の中で混ざっても一貫して見える。

/** 券面に載る内容。Item / BriefCard のどちらからでも作れる薄い形。 */
export interface TicketData {
  kind: ItemKind;
  /** 帯に出す漢字1文字。生成カードは glyph を持っている。 */
  glyph?: string;
  title: string;
  summary?: string;
  image?: string;
  venue?: string;
  area?: string;
  /** 会期・刊行など、表示用に整えた文字列。 */
  term?: string;
  /** 期限が近い（残り日数が少ない）。 */
  soon?: boolean;
  /** 自分で書いた／声から拾った項目。手書きの欄として見せる。 */
  handwritten?: boolean;
  serial: number;
}

// ★以下は目盛りの外（図形の座標系・design.md §7）。
const BAND_DOT = SPACE.xl;          // 帯の中の丸の直径
const PERF_PITCH = 9;               // 端のミシン目の間隔
const PERF_R = 3;                   // ミシン目の半径
const HOLE_PCT = 15;                // 鋏痕の直径（券の幅に対する％）

export function Ticket({ data, punch, deck = TICKET_DECK, width }: {
  data: TicketData;
  /** 入鋏の位置（券に対する 0〜1 の相対座標）。無ければ未入鋏。 */
  punch?: { x: number; y: number } | null;
  /** 穴から透けて見える台の色。 */
  deck?: string;
  /** 幅。省略すると親の幅いっぱい。 */
  width?: number | string;
}) {
  const kindDef = itemKindOf(data.kind);
  const domain = KIND_DOMAIN[data.kind];
  const accent = TICKET_DOMAIN_COLOR[domain];
  const hasImage = !!data.image;

  return (
    <div style={{
      position: "relative",
      width: width ?? "100%",
      aspectRatio: TICKET_ASPECT,
      background: TICKET_PAPER,
      borderRadius: RADIUS.sm,
      boxShadow: SOFT_SHADOW_LG,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      color: INK,
    }}>
      {/* 紙の目と地紋。★目盛りの外（図形） */}
      <span aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2,
        backgroundImage:
          `repeating-linear-gradient(90deg, ${TICKET_GRAIN} 0 1px, transparent 1px 4px),`
          + `repeating-linear-gradient(0deg, ${TICKET_GRAIN} 0 1px, transparent 1px 3px)`,
      }} />
      <span aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1, opacity: 0.1,
        backgroundImage: `repeating-linear-gradient(45deg, ${accent} 0 1px, transparent 1px 6px)`,
      }} />

      {/* 帯 */}
      <div style={{
        flex: "none", position: "relative", zIndex: 3,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: SPACE.sm,
        padding: `${SPACE.sm}px ${SPACE.md}px`,
        borderBottom: `${SPACE.hair}px solid ${INK}`,
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
          <span style={{
            width: BAND_DOT, height: BAND_DOT, borderRadius: RADIUS.circle, background: accent,
            display: "grid", placeItems: "center",
            fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold,
            lineHeight: LEAD.flat, color: TICKET_PAPER,
          }}>{data.glyph ?? kindDef.label.slice(0, 1)}</span>
          <span style={{
            fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: WEIGHT.bold,
            letterSpacing: TRACK.caps, color: MUTED, textTransform: "uppercase",
          }}>{kindDef.en}</span>
        </span>
        <span style={{
          fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: WEIGHT.bold,
          letterSpacing: TRACK.caps, color: MUTED,
        }}>No {serialOf(data.serial)}</span>
      </div>

      {/* 写真、または題を抱えた色面 */}
      <div style={{
        flex: hasImage ? "0 0 40%" : "1 1 auto", minHeight: 0,
        position: "relative", zIndex: 3,
        background: hasImage ? undefined : accent,
        backgroundImage: hasImage ? `url("${data.image}")` : undefined,
        backgroundSize: "cover", backgroundPosition: "center",
        display: hasImage ? undefined : "flex",
        alignItems: "flex-end",
        padding: hasImage ? undefined : SPACE.md,
      }}>
        {!hasImage && (
          <span style={{
            fontFamily: SANS, fontSize: TYPE.display, fontWeight: WEIGHT.bold,
            lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: TICKET_PAPER,
            // ★3行で切る（写真が無い券は題が主役なので1行ぶん多く許す）
            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{data.title}</span>
        )}
      </div>

      {/* 分節の点線 */}
      <span aria-hidden style={{
        flex: "none", zIndex: 3,
        borderTop: `${SPACE.hair}px dashed ${TICKET_PERF}`,
      }} />

      {/* 文字の面 */}
      <div style={{
        flex: hasImage ? "1 1 auto" : "0 0 auto", minHeight: 0, overflow: "hidden",
        position: "relative", zIndex: 3,
        display: "flex", flexDirection: "column",
        padding: `${SPACE.md}px ${SPACE.md}px ${SPACE.md}px`,
      }}>
        {hasImage && (
          <span style={{
            fontFamily: SANS, fontSize: TYPE.display, fontWeight: WEIGHT.bold,
            lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: INK,
            // ★2行で切る（券の高さが揃わなくなるため）
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{data.title}</span>
        )}
        {data.summary && (
          <span style={{
            marginTop: SPACE.sm,
            fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.text,
            lineHeight: LEAD.body, letterSpacing: TRACK.normal, color: SECOND,
            // ★2行で切る（券の高さが揃わなくなるため）
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{data.summary}</span>
        )}
        <span style={{
          marginTop: "auto", paddingTop: SPACE.sm,
          borderTop: `${SPACE.hair}px solid ${TICKET_PERF}`,
          display: "flex", flexDirection: "column", gap: SPACE.xs,
        }}>
          {(data.venue || data.area) && (
            <span style={{
              fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold,
              lineHeight: LEAD.flat, letterSpacing: TRACK.normal, color: SECOND,
              // ★手書きの欄は下線を1本引いて、印刷された券と区別する
              borderBottom: data.handwritten ? `${SPACE.hair}px solid ${TICKET_PERF}` : undefined,
              paddingBottom: data.handwritten ? SPACE.xs : undefined,
            }}>{[data.venue, data.area].filter(Boolean).join(" ・ ")}</span>
          )}
          {data.term && (
            <span style={{
              fontFamily: LATIN, fontSize: TYPE.body, fontWeight: WEIGHT.bold,
              lineHeight: LEAD.flat, letterSpacing: TRACK.caps,
              color: data.soon ? RUST : INK,
            }}>{data.term}</span>
          )}
        </span>
      </div>

      {/* 端のミシン目。★目盛りの外（図形） */}
      {(["left", "right"] as const).map((side) => (
        <span key={side} aria-hidden style={{
          position: "absolute", top: 0, bottom: 0, [side]: -PERF_R, width: PERF_R * 2, zIndex: 4,
          backgroundImage: `radial-gradient(circle at ${side === "left" ? "0" : "100%"} 50%, ${deck} ${PERF_R}px, transparent ${PERF_R + 0.5}px)`,
          backgroundSize: `${PERF_R * 2}px ${PERF_PITCH}px`,
          backgroundRepeat: "repeat-y",
        }} />
      ))}

      {/* 鋏痕。★目盛りの外（図形） */}
      {punch && (
        <span aria-hidden style={{
          position: "absolute", zIndex: 5,
          left: `${punch.x * 100}%`, top: `${punch.y * 100}%`,
          width: `${HOLE_PCT}%`, aspectRatio: "1",
          transform: "translate(-50%, -50%)",
        }}>
          <PunchHole domain={domain} deck={deck} />
        </span>
      )}
    </div>
  );
}
