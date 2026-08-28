"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import {
  INK, LATIN, MUTED, RUST, SANS, SECOND, SOFT_SHADOW_LG, SWISS_XL,
  TICKET_ASPECT, TICKET_DECK, TICKET_DOMAIN_COLOR, TICKET_PAPER, TICKET_PERF,
  itemKindOf, KIND_DOMAIN,
} from "@/lib/constants";
import { PAPER_SHEET_SRC } from "@/lib/paperTexture";
import { serialOf, type TicketEdge } from "@/lib/ticket";
import type { ItemKind } from "@/lib/types";
import { Barcode, PunchGlyph, PunchNotch } from "./PunchMark";

// 券。Explore の唯一の共通部品で、提案・ストック・マップで縮尺だけが変わる。
// 設計の正は docs/explore-redesign.md。
//
// ★★★第69巡に作り直した。前の版は**ただのカード**に見えた。原因は
//   「このアプリの語彙を1つも使っていなかった」こと ―
//   TASK の実物は**巨大な文字・裸の地・本物の紙の目**で出来ているのに、
//   券は**細い罫で囲った箱が6段**と**極小ラベル8個**で、主役が居なかった。
//   直したのは次の4つ。
//   1. 役を4段だけにする(主=期限の日付 / 従=題 / 付帯=会場 / ラベル)。
//      主役は `SWISS_XL`(72) ― TIMELINE の曜日と**同じ語彙**。
//   2. 罫を6本から2本へ(写真の下＋ミシン目)。束ねるのは余白でやる。
//   3. 紙を**本物の写真**にする(`public/paper-kraft.webp`)。偽の縞は捨てた。
//   4. 縦横比を 5/7(＝カードの比)から **13/21**(＝券の比)へ。
//
// ★入鋏の痕は**縁の切り欠き**(紙の中の穴ではない)。鋏は右下から来るので
//   縁は `right` だけを使い、**巨大な日付の右に空く余白**へ落ちる。

export interface TicketData {
  kind: ItemKind;
  /** 帯に出す漢字1文字。生成カードは glyph を持っている。 */
  glyph?: string;
  title: string;
  summary?: string;
  image?: string;
  venue?: string;
  area?: string;
  /** 会期の終わり・刊行日など。**券面の主役**になる。 */
  until?: string;
  /** 会期の終わりが無いときに主役へ回す日付（MM.DD）。 */
  date?: string;
  /** 期限が近い。 */
  soon?: boolean;
  /** 自分で書いた／声から拾った項目。 */
  handwritten?: boolean;
  serial: number;
}

export interface TicketPunch {
  edge: TicketEdge;
  /** 辺のどこか（0〜1）。 */
  t: number;
}

// ★以下は目盛りの外（図形の座標系・design.md §7）。
const NOTCH_PCT = 32;      // 切り欠きの大きさ（券の幅に対する％）
const RULE = 1;            // 罫の太さ
const PERF_D = 3;          // ミシン目の穴の直径
const BARCODE_H = 13;      // 半券のバーコードの高さ
const DATE_LEAD = 0.86;    // 巨大欧文の行間（SWISS_XL と対。字面を塊にする）
const PAPER_MULT = 0.22;   // 紙の目の強さ（overlay なので中間調は動かない）
const PHOTO_PCT = 36;      // 写真の高さ（券の高さに対する％）
const PANEL_PCT = 36;      // 写真が無い券の色面の高さ（％。写真と揃える）

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
  const big = data.until ?? data.date ?? "";
  const place = [data.venue, data.area].filter(Boolean).join("・");

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
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      color: INK,
    }}>
      {/* 紙の目。★**図形が焼き込んでいるのと同じ写真**を等倍で敷く。
          ★★縮小しない（紙の目は高周波なので消える）。768px 角あれば券1枚は
          繰り返しに当たらないので `no-repeat` で足りる。
          `overlay` は中間調を動かさないので、**凹凸だけ**が乗る。 */}
      <span aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4,
        backgroundImage: `url("${PAPER_SHEET_SRC}")`,
        backgroundSize: "auto", backgroundRepeat: "no-repeat", backgroundPosition: "center",
        mixBlendMode: "overlay", opacity: PAPER_MULT,
      }} />

      {/* 写真。★左右上とも裁ち落とし。写真が無い券はここが分類色のベタ面に
          なり、漢字1文字が透かしのように大きく入って**ポスター**になる。 */}
      <div style={{
        flex: `0 0 ${hasImage ? PHOTO_PCT : PANEL_PCT}%`, minHeight: 0, position: "relative", zIndex: 2,
        background: hasImage ? undefined : accent,
        backgroundImage: hasImage ? `url("${data.image}")` : undefined,
        backgroundSize: "cover", backgroundPosition: "center",
        borderBottom: `${RULE}px solid ${INK}`,
        overflow: "hidden",
      }}>
        {!hasImage && (
          <span aria-hidden style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
            padding: SPACE.md,
            fontFamily: SANS, fontSize: SWISS_XL, fontWeight: WEIGHT.heavy,
            lineHeight: DATE_LEAD, letterSpacing: TRACK.normal,
            color: TICKET_PAPER, opacity: 0.22,
          }}>{data.glyph ?? kindDef.label.slice(0, 1)}</span>
        )}
      </div>

      {/* 本文。★券は1枚の印刷物なので、左右の余白はこの器だけが持つ。 */}
      <div style={{
        flex: "1 1 auto", minHeight: 0, position: "relative", zIndex: 3,
        display: "flex", flexDirection: "column", justifyContent: "space-between", gap: SPACE.lg,
        padding: SPACE.lg, overflow: "hidden",
      }}>
        {/* 上の束 ── 券種・題・要約 */}
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md, minHeight: 0 }}>
          {/* ラベル ── 券種の欧文と、分類の印（鋏痕と同じ形） */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SPACE.sm }}>
            <span style={{
              fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
              letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: MUTED,
              textTransform: "uppercase",
            }}>{data.handwritten ? "Self" : kindDef.en}</span>
            <PunchGlyph domain={domain} size={SPACE.lg} color={accent} />
          </div>

          {/* 従 ── 題。写真の券だけがここに出す（写真が無い券は面の中で見せる）。 */}
          <span style={{
            fontFamily: SANS, fontSize: TYPE.display, fontWeight: WEIGHT.bold,
            lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: INK,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            // ★縮ませない。縮むと -webkit-box が**字の途中で切れる**。
            flexShrink: 0,
          }}>{data.title}</span>

          {data.summary && (
            <span style={{
              fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.text,
              lineHeight: LEAD.body, letterSpacing: TRACK.normal, color: SECOND,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
              flexShrink: 0,
            }}>{data.summary}</span>
          )}
        </div>

        {/* 主 ── 期限。★この束だけが束の中の余白（xs）で締まっている。
            巨大な日付の右に空く余白が、そのまま**鋏を入れる場所**になる。 */}
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <span style={{
            fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
            letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: MUTED,
            textTransform: "uppercase",
          }}>Until</span>
          <span style={{
            fontFamily: LATIN, fontSize: SWISS_XL, fontWeight: WEIGHT.heavy,
            lineHeight: DATE_LEAD, letterSpacing: TRACK.tight,
            fontVariantNumeric: "tabular-nums", color: data.soon ? RUST : INK,
          }}>{big || "—"}</span>
          {place && (
            <span style={{
              fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.text,
              lineHeight: LEAD.body, letterSpacing: TRACK.normal, color: SECOND,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{place}</span>
          )}
        </div>
      </div>

      {/* ミシン目。★破線ではなく**穿孔**（丸の列）。実物の券と同じ。 */}
      <span aria-hidden style={{
        flex: "none", height: PERF_D, position: "relative", zIndex: 3,
        backgroundImage:
          `repeating-radial-gradient(circle at ${PERF_D / 2}px 50%, ${TICKET_PERF} 0 ${PERF_D / 2}px, transparent ${PERF_D / 2}px ${PERF_D * 2}px)`,
      }} />

      {/* 半券 ── 通し番号とバーコード。 */}
      <div style={{
        flex: "none", position: "relative", zIndex: 3,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: SPACE.md,
        padding: `${SPACE.sm}px ${SPACE.lg}px ${SPACE.md}px`,
      }}>
        <span style={{
          fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
          letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: MUTED,
          fontVariantNumeric: "tabular-nums", textTransform: "uppercase",
        }}>No {serialOf(data.serial)}</span>
        <span style={{ flex: 1, maxWidth: "44%", height: BARCODE_H, opacity: 0.62 }}>
          <Barcode serial={data.serial} ink={INK} vertical={false} />
        </span>
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
