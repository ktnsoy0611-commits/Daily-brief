"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import {
  INK, KIND_DOMAIN, LATIN, SANS, SOFT_SHADOW_LG, TICKET_DECK, TICKET_PERF, itemKindOf,
} from "@/lib/constants";
import { DOMAIN_COLOR } from "@/lib/palette";
import { grainStyle, useDevicePixelRatio } from "@/lib/printGrain";
import { serialOf, type TicketEdge } from "@/lib/ticket";
import type { ItemKind } from "@/lib/types";
import { Barcode, PunchNotch } from "./PunchMark";

// 券。Explore の唯一の共通部品で、提案・ストック・マップで縮尺だけが変わる。
// 設計の正は docs/explore-redesign.md。
//
// ★★★組み方の正は **Vitsœ のラベル**（2026-08-28 にユーザー確定）。
//   1. 券は**その色の紙そのもの**。地はドメイン色のベタで、紙の目を焼いてある。
//   2. **文字は全部黒**。階層は色ではなく**大きさだけ**が作る。
//      段は3つ … 題 `display`(26) ／ 内容 `body`(13) ／ ラベル `micro`(9)＋`nano`(7)。
//   3. **主役は題**。measure いっぱいに組んで、他は全部それより小さい。
//   4. 欄は**和文＋欧文の2行ラベル**と内容の対（Vitsœ の独／英と同じ）。
//   5. 罫は**細い線が3本**とミシン目1本だけ。囲まない。
//   6. **写真は周囲に余白をとった四角**。裁ち落とさない。
//   7. 余白は題と欄のあいだへ逃がす（＝空きが主役になる）。
//
// ★紙の目は**色のすぐ上・文字の下**に multiply で敷く（下地）。最前面に
//   overlay で乗せると写真も文字も霞む（2巡目に実際にそうなった）。

export interface TicketData {
  kind: ItemKind;
  /** 帯に出す漢字1文字。生成カードは glyph を持っている。 */
  glyph?: string;
  title: string;
  summary?: string;
  image?: string;
  venue?: string;
  area?: string;
  /** 会期の終わり・刊行日など。 */
  until?: string;
  /** 会期の始まり（MM.DD）。 */
  date?: string;
  /** 期限が近い。★色ではなく**ラベルの語**で伝える（有彩色は紙の1色だけ）。 */
  soon?: boolean;
  /** 自分で書いた／声から拾った項目。 */
  handwritten?: boolean;
  serial: number;
}

export interface TicketPunch {
  edge: TicketEdge;
  /** 辺のどこか（0〜1）。 */
  t: number;
  /** 入鋏の傾き（度）。★垂直に入らなくてよい ― 実物もそうなっている。 */
  tilt?: number;
}

// ★以下は目盛りの外（図形の座標系・design.md §7）。
// ★券が彩度の高い紙になったので、切り欠きは小さくてもはっきり読む。
// 32% は紙を食い荒らして版面が壊れた（3巡目に実測）。
const NOTCH_PCT = 13;      // 切り欠きの大きさ（券の幅に対する％）
const RULE = 1;            // 罫の太さ
const PERF_D = 3;          // ミシン目の穴の直径
const BARCODE_H = 12;      // 半券のバーコードの高さ
const PHOTO_PCT = 36;      // 写真の高さ（券の高さに対する％。横長の帯になる）
const LABEL_W = 64;        // 欄の左のラベル列の幅
/** ★★**旧版の比**。新しい比は `TICKET_ASPECT`（3/4）で、見本帳の3案がそれを使う。
 *  この版は 300 × 485 で組んであり 3/4 では中身が入らないので、差し替わるまで
 *  自分の比を持たせておく（第72巡）。 */
const OLD_ASPECT = "13 / 21";  // ★目盛りの外（旧版の版面の比）

/** 欄の左に立つ、和文＋欧文の2行ラベル。Vitsœ の独／英の対と同じ役。 */
function FieldLabel({ ja, en }: { ja: string; en: string }) {
  return (
    <span style={{ flex: "none", width: LABEL_W, display: "flex", flexDirection: "column" }}>
      <span style={{
        fontFamily: SANS, fontSize: TYPE.micro, fontWeight: WEIGHT.bold,
        lineHeight: LEAD.flat, letterSpacing: TRACK.normal, color: INK,
      }}>{ja}</span>
      <span style={{
        fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
        lineHeight: LEAD.flat, letterSpacing: TRACK.caps, color: INK,
        textTransform: "uppercase",
      }}>{en}</span>
    </span>
  );
}

/** 欄の1行。ラベルと内容はベースラインで揃える。 */
function Field({ ja, en, children }: { ja: string; en: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.sm }}>
      <FieldLabel ja={ja} en={en} />
      <span style={{
        flex: 1, minWidth: 0,
        fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold,
        lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: INK,
        fontVariantNumeric: "tabular-nums",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>{children}</span>
    </div>
  );
}

export function Ticket({ data, punch, deck = TICKET_DECK, width }: {
  data: TicketData;
  punch?: TicketPunch | null;
  deck?: string;
  width?: number | string;
}) {
  const dpr = useDevicePixelRatio();
  const kindDef = itemKindOf(data.kind);
  const domain = KIND_DOMAIN[data.kind];
  const stock = DOMAIN_COLOR[domain];
  const span = [data.date, data.until].filter(Boolean);
  const period = (span[0] === span[1] ? span.slice(0, 1) : span).join(" – ") || "—";
  const place = [data.venue, data.area].filter(Boolean).join("・") || "—";
  const rule: React.CSSProperties = { flex: "none", height: RULE, background: INK };

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
      aspectRatio: OLD_ASPECT,
      background: stock,
      borderRadius: RADIUS.sm,
      boxShadow: SOFT_SHADOW_LG,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      color: INK,
    }}>
      {/* 質感。★★★第76巡まで、ここは**茶色いカラー写真**を `multiply` 0.42 で
          敷いていた ―― 実効倍率 R×0.868 / G×0.840 / B×0.809 で、**13〜19% 暗く
          なり、青だけ 6pt 余計に落ちる茶色かぶり**だった（ユーザー報告「濁った色」）。
          第71巡に見本帳だけ `Grain` へ移し、こちらが取り残されていた。
          いまは**券も図形も同じ網点**で、平均 128 を `soft-light`（＝128 が恒等）
          なので**地の色は動かない**。★色のすぐ上・文字の下に置くこと。 */}
      <span aria-hidden style={{ ...grainStyle(dpr), zIndex: 1 }} />

      {/* 券面。★左右の余白はこの器だけが持つ。 */}
      <div style={{
        flex: "1 1 auto", minHeight: 0, position: "relative", zIndex: 2,
        display: "flex", flexDirection: "column",
        padding: `${SPACE.lg}px ${SPACE.lg}px 0`,
      }}>
        {/* 券種と通し番号 */}
        <div style={{
          flex: "none", display: "flex", alignItems: "baseline", justifyContent: "space-between",
          gap: SPACE.sm, paddingBottom: SPACE.sm,
        }}>
          <span style={{
            fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
            letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: INK,
            textTransform: "uppercase",
          }}>{data.handwritten ? "Self issued" : kindDef.en}</span>
          <span style={{
            fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
            letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: INK,
            fontVariantNumeric: "tabular-nums",
          }}>Nº {serialOf(data.serial)}</span>
        </div>
        <span aria-hidden style={rule} />

        {/* 写真。★周囲に余白をとった四角（裁ち落とさない）。 */}
        {data.image && (
          <div style={{
            flex: `0 0 ${PHOTO_PCT}%`, minHeight: 0,
            marginTop: SPACE.lg,
            backgroundImage: `url("${data.image}")`,
            backgroundSize: "cover", backgroundPosition: "center",
          }} />
        )}

        {/* ★余白は題の**上下**へ 3:5 で割る。写真が無い券でも塊の位置が動かない。 */}
        <span aria-hidden style={{ flex: "3 1 0", minHeight: SPACE.lg }} />

        {/* ★主役 ── 題。measure いっぱいに組む。 */}
        <span style={{
          flex: "none",
          fontFamily: SANS, fontSize: TYPE.display, fontWeight: WEIGHT.bold,
          lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: INK,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{data.title}</span>

        {data.summary && (
          <span style={{
            flex: "none", marginTop: SPACE.md,
            fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.text,
            lineHeight: LEAD.body, letterSpacing: TRACK.normal, color: INK,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{data.summary}</span>
        )}

        <span aria-hidden style={{ flex: "5 1 0", minHeight: SPACE.lg }} />

        {/* 欄 */}
        <span aria-hidden style={rule} />
        <div style={{
          flex: "none", display: "flex", flexDirection: "column", gap: SPACE.md,
          padding: `${SPACE.md}px 0`,
        }}>
          <Field ja="会期" en={data.soon ? "Soon" : "Period"}>{period}</Field>
          <Field ja="会場" en="Venue">{place}</Field>
        </div>
      </div>

      {/* ミシン目。★破線ではなく**穿孔**（丸の列）。実物の券と同じ。 */}
      <span aria-hidden style={{
        flex: "none", height: PERF_D, position: "relative", zIndex: 2,
        backgroundImage:
          `repeating-radial-gradient(circle at ${PERF_D / 2}px 50%, ${TICKET_PERF} 0 ${PERF_D / 2}px, transparent ${PERF_D / 2}px ${PERF_D * 2}px)`,
      }} />

      {/* 半券 */}
      <div style={{
        flex: "none", position: "relative", zIndex: 2,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: SPACE.md,
        padding: `${SPACE.sm}px ${SPACE.lg}px ${SPACE.md}px`,
      }}>
        <span style={{
          fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
          letterSpacing: TRACK.wide, lineHeight: LEAD.flat, color: INK,
          textTransform: "uppercase",
        }}>Explore</span>
        <span style={{ flex: "none", width: "40%", height: BARCODE_H }}>
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
          <PunchNotch domain={domain} edge={punch.edge} deck={deck} tilt={punch.tilt ?? 0} />
        </span>
      )}
    </div>
  );
}
