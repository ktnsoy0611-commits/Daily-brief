"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import {
  INK, LATIN, MUTED, RUST, SANS, SECOND, SOFT_SHADOW_LG,
  TICKET_ASPECT, TICKET_DECK, TICKET_DOMAIN_COLOR, TICKET_GRAIN, TICKET_PAPER, TICKET_PERF,
  itemKindOf, KIND_DOMAIN,
} from "@/lib/constants";
import { serialOf, type TicketEdge } from "@/lib/ticket";
import type { ItemKind } from "@/lib/types";
import { Barcode, PunchNotch } from "./PunchMark";

// 券。Explore の唯一の共通部品で、提案・ストック・マップで縮尺だけが変わる。
// 設計の正は docs/explore-redesign.md。
//
// ★分類の色は4ドメインが持ち、10種類の kind は帯の中の漢字1文字が担う。
// ★入鋏の痕は**縁の切り欠き**（紙の中の穴ではない）。
// ★写真が無い券は、写真の枠が分類色の面になり、題がその中まで大きく伸びる。

export interface TicketData {
  kind: ItemKind;
  /** 帯に出す漢字1文字。生成カードは glyph を持っている。 */
  glyph?: string;
  title: string;
  summary?: string;
  image?: string;
  venue?: string;
  area?: string;
  /** 会期の終わり・刊行日など、券面の下に出す日付。 */
  until?: string;
  /** 券面の肩に大きく出す日付（MM.DD）。 */
  date?: string;
  /** 期限が近い。 */
  soon?: boolean;
  /** 自分で書いた／声から拾った項目。手書きの欄として見せる。 */
  handwritten?: boolean;
  serial: number;
}

export interface TicketPunch {
  edge: TicketEdge;
  /** 辺のどこか（0〜1）。 */
  t: number;
}

// ★以下は目盛りの外（図形の座標系・design.md §7）。
const BAND_DOT = SPACE.xl;      // 分類の丸の直径
const STUB_W = 30;              // 左の耳（バーコードの帯）の幅
const NOTCH_PCT = 24;           // 切り欠きの大きさ（券の幅に対する％）
const RULE = 1;                 // 極細の罫

export function Ticket({ data, punch, deck = TICKET_DECK, width }: {
  data: TicketData;
  punch?: TicketPunch | null;
  deck?: string;
  width?: number | string;
}) {
  const kindDef = itemKindOf(data.kind);
  const domain = KIND_DOMAIN[data.kind];
  const accent = TICKET_DOMAIN_COLOR[domain];
  const hasImage = !!data.image;

  const notchPos: Record<TicketEdge, React.CSSProperties> = {
    left: { left: 0, top: `${punch ? punch.t * 100 : 0}%`, transform: "translateY(-50%)" },
    right: { right: 0, top: `${punch ? punch.t * 100 : 0}%`, transform: "translateY(-50%)" },
    top: { top: 0, left: `${punch ? punch.t * 100 : 0}%`, transform: "translateX(-50%)" },
    bottom: { bottom: 0, left: `${punch ? punch.t * 100 : 0}%`, transform: "translateX(-50%)" },
  };

  return (
    <div style={{
      position: "relative",
      width: width ?? "100%",
      aspectRatio: TICKET_ASPECT,
      background: TICKET_PAPER,
      borderRadius: RADIUS.sm,
      boxShadow: SOFT_SHADOW_LG,
      display: "flex",
      overflow: "hidden",
      color: INK,
    }}>
      {/* 紙の目。★目盛りの外（図形） */}
      <span aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4,
        backgroundImage:
          `repeating-linear-gradient(90deg, ${TICKET_GRAIN} 0 1px, transparent 1px 4px),`
          + `repeating-linear-gradient(0deg, ${TICKET_GRAIN} 0 1px, transparent 1px 3px)`,
      }} />
      {/* 地紋。★目盛りの外（図形） */}
      <span aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1, opacity: 0.09,
        backgroundImage: `repeating-linear-gradient(45deg, ${accent} 0 1px, transparent 1px 7px)`,
      }} />

      {/* 左の耳（バーコードと通し番号）。★目盛りの外（図形） */}
      <div style={{
        flex: "none", width: STUB_W, position: "relative", zIndex: 3,
        borderRight: `${RULE}px dashed ${TICKET_PERF}`,
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: `${SPACE.sm}px ${SPACE.xs}px`, gap: SPACE.sm,
      }}>
        <span style={{ flex: 1, width: "100%", opacity: 0.85 }}>
          <Barcode serial={data.serial} ink={INK} />
        </span>
        <span style={{
          writingMode: "vertical-rl",
          fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
          letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: MUTED,
        }}>No {serialOf(data.serial)}</span>
      </div>

      {/* 本体 */}
      <div style={{
        flex: 1, minWidth: 0, position: "relative", zIndex: 3,
        display: "flex", flexDirection: "column",
      }}>
        {/* 肩の極小欄 */}
        <div style={{
          flex: "none", display: "flex", alignItems: "baseline", justifyContent: "space-between",
          gap: SPACE.sm, padding: `${SPACE.sm}px ${SPACE.md}px ${SPACE.xs}px`,
          borderBottom: `${RULE}px solid ${INK}`,
        }}>
          <span style={{
            fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
            letterSpacing: TRACK.wide, lineHeight: LEAD.flat, color: INK, textTransform: "uppercase",
          }}>Explore</span>
          <span style={{
            fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
            letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: MUTED, textTransform: "uppercase",
          }}>{data.handwritten ? "Self issued" : "Issued"} · {kindDef.en}</span>
        </div>

        {/* 写真、または題を抱えた色面 */}
        <div style={{
          flex: hasImage ? "0 0 34%" : "1 1 auto", minHeight: 0,
          position: "relative",
          background: hasImage ? undefined : accent,
          backgroundImage: hasImage ? `url("${data.image}")` : undefined,
          backgroundSize: "cover", backgroundPosition: "center",
          display: "flex", alignItems: "flex-end",
          padding: hasImage ? undefined : `${SPACE.md}px`,
          borderBottom: `${RULE}px solid ${INK}`,
        }}>
          {!hasImage && (
            <span style={{
              fontFamily: SANS, fontSize: TYPE.display, fontWeight: WEIGHT.bold,
              lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: TICKET_PAPER,
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>{data.title}</span>
          )}
        </div>

        {/* 日付と分類 */}
        <div style={{
          flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: SPACE.sm, padding: `${SPACE.sm}px ${SPACE.md}px`,
          borderBottom: `${RULE}px solid ${TICKET_PERF}`,
        }}>
          <span style={{
            fontFamily: LATIN, fontSize: TYPE.head, fontWeight: WEIGHT.heavy,
            letterSpacing: TRACK.tight, lineHeight: LEAD.flat,
            fontVariantNumeric: "tabular-nums", color: INK,
          }}>{data.date ?? "—"}</span>
          <span style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
            <span style={{
              fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: WEIGHT.bold,
              letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: MUTED, textTransform: "uppercase",
            }}>{domain}</span>
            <span style={{
              width: BAND_DOT, height: BAND_DOT, borderRadius: RADIUS.circle, background: accent,
              display: "grid", placeItems: "center",
              fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold,
              lineHeight: LEAD.flat, color: TICKET_PAPER,
            }}>{data.glyph ?? kindDef.label.slice(0, 1)}</span>
          </span>
        </div>

        {/* 題と要約 */}
        <div style={{
          flex: hasImage ? "1 1 auto" : "0 0 auto", minHeight: 0, overflow: "hidden",
          display: "flex", flexDirection: "column",
          padding: `${SPACE.md}px ${SPACE.md}px ${SPACE.sm}px`,
        }}>
          {hasImage && (
            <span style={{
              fontFamily: SANS, fontSize: TYPE.display, fontWeight: WEIGHT.bold,
              lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: INK,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>{data.title}</span>
          )}
          {data.summary && (
            <span style={{
              marginTop: SPACE.sm,
              fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.text,
              lineHeight: LEAD.body, letterSpacing: TRACK.normal, color: SECOND,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>{data.summary}</span>
          )}
        </div>

        {/* 足元の欄 */}
        <div style={{
          flex: "none", display: "flex", flexDirection: "column", gap: SPACE.xs,
          padding: `${SPACE.sm}px ${SPACE.md}px ${SPACE.md}px`,
          borderTop: `${RULE}px solid ${INK}`,
        }}>
          <span style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: SPACE.sm,
          }}>
            <span style={{
              fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
              letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: MUTED, textTransform: "uppercase",
            }}>Venue</span>
            <span style={{
              flex: 1, textAlign: "right",
              fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold,
              lineHeight: LEAD.flat, letterSpacing: TRACK.normal, color: INK,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              // ★手書きの欄は罫の上に書いたように見せる
              borderBottom: data.handwritten ? `${RULE}px solid ${TICKET_PERF}` : undefined,
            }}>{[data.venue, data.area].filter(Boolean).join(" ・ ") || "—"}</span>
          </span>
          <span style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: SPACE.sm,
          }}>
            <span style={{
              fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
              letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: MUTED, textTransform: "uppercase",
            }}>Valid until</span>
            <span style={{
              fontFamily: LATIN, fontSize: TYPE.body, fontWeight: WEIGHT.heavy,
              lineHeight: LEAD.flat, letterSpacing: TRACK.caps,
              fontVariantNumeric: "tabular-nums", color: data.soon ? RUST : INK,
            }}>{data.until ?? "—"}</span>
          </span>
        </div>
      </div>

      {/* 縁の切り欠き。★目盛りの外（図形） */}
      {punch && (
        <span aria-hidden style={{
          position: "absolute", zIndex: 5,
          width: `${NOTCH_PCT}%`, aspectRatio: "1",
          ...notchPos[punch.edge],
        }}>
          <PunchNotch domain={domain} edge={punch.edge} deck={deck} />
        </span>
      )}
    </div>
  );
}
