"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import {
  INK, KIND_DOMAIN, LATIN, SANS, SOFT_SHADOW_LG,
  TICKET_ASPECT, TICKET_DECK, TICKET_PERF, itemKindOf,
} from "@/lib/constants";
import { grainStyle, useDevicePixelRatio } from "@/lib/printGrain";
import { serialOf } from "@/lib/ticket";
import { Barcode, PunchNotch } from "../PunchMark";
import type { TicketData, TicketPunch } from "../Ticket";

// ★★★**券の見本帳の共通部品**(2026-08-31・第71巡)。案 A〜F が共有する。
//
// ★★★**選ばれなかった案は次回まとめて消す**。このディレクトリ
//   (`components/explore/samples/`)ごと消せるように、外から参照しているのは
//   `components/tabs/DevStageTab.tsx` の1か所だけにしてある。
//
// ★案どうしを比べられるように、**どの案にも共通する部品はここに置く** ――
//   罫・対ラベル・ミシン目・半券・見出し。案ごとに違うのは**組み方だけ**にして、
//   「割り方の違い」だけが目に入るようにする。

/** 罫の太さ。★参照4枚は罫を**2種**しか使わない ―― 太いバー(大区分)と細罫(行)。 */
export const RULE_HAIR = 1;
export const RULE_BAR = 4;   // ★目盛りの外(罫の太さ。AuBe の黒バーの比から)
/** ミシン目の穴の直径。 */
export const PERF_D = 3;     // ★目盛りの外(図形)
/** 半券のバーコードの高さ。 */
export const BARCODE_H = 12; // ★目盛りの外(図形)
/** 欄の左のラベル列の幅。 */
export const LABEL_W = 64;   // ★目盛りの外(図形)

/** 罫。★`Pad` の外に置けば**紙の端まで**走る(Vitsœ の荷札はこう組んである)。 */
export function Rule({ weight = RULE_HAIR, ink = INK }: { weight?: number; ink?: string }) {
  return <span aria-hidden style={{ flex: "none", height: weight, background: ink }} />;
}

/** 縦の罫(Vitsœ が面を割るのに使っている手)。 */
export function VRule({ ink = INK }: { ink?: string }) {
  return <span aria-hidden style={{ flex: "none", alignSelf: "stretch", width: RULE_HAIR, background: ink }} />;
}

/** 極小の**対ラベル**。参照4枚に共通する作法(Vitsœ の独／英、Grilli の4言語)。 */
export function PairLabel({ ja, en, ink = INK, width }: {
  ja: string; en: string; ink?: string; width?: number;
}) {
  return (
    <span style={{ flex: "none", width, display: "flex", flexDirection: "column" }}>
      <span style={{
        fontFamily: SANS, fontSize: TYPE.micro, fontWeight: WEIGHT.bold,
        lineHeight: LEAD.flat, letterSpacing: TRACK.normal, color: ink,
      }}>{ja}</span>
      <span style={{
        fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
        lineHeight: LEAD.flat, letterSpacing: TRACK.caps, color: ink,
        textTransform: "uppercase",
      }}>{en}</span>
    </span>
  );
}

/** 欄の値。★ラベルとは**ベースラインで**揃える(design.md §1)。 */
export function FieldValue({ ink = INK, children }: { ink?: string; children: React.ReactNode }) {
  return (
    <span style={{
      flex: 1, minWidth: 0,
      fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold,
      lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: ink,
      fontVariantNumeric: "tabular-nums",
      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
    }}>{children}</span>
  );
}

/** 欄の1行(ラベル＋値)。 */
export function Field({ ja, en, ink, children }: {
  ja: string; en: string; ink?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.sm }}>
      <PairLabel ja={ja} en={en} ink={ink} width={LABEL_W} />
      <FieldValue ink={ink}>{children}</FieldValue>
    </div>
  );
}

/** 券種と通し番号(どの案も頭に置く)。 */
export function Masthead({ data, ink = INK }: { data: TicketData; ink?: string }) {
  const kindDef = itemKindOf(data.kind);
  const cap: React.CSSProperties = {
    fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
    letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: ink,
    textTransform: "uppercase",
  };
  return (
    <div style={{
      flex: "none", display: "flex", alignItems: "baseline", justifyContent: "space-between",
      gap: SPACE.sm,
    }}>
      <span style={cap}>{data.handwritten ? "Self issued" : kindDef.en}</span>
      <span style={{ ...cap, letterSpacing: TRACK.caps, fontVariantNumeric: "tabular-nums" }}>
        Nº {serialOf(data.serial)}
      </span>
    </div>
  );
}

/** ミシン目(破線ではなく**穿孔**)。 */
export function Perf({ ink = TICKET_PERF }: { ink?: string }) {
  return (
    <span aria-hidden style={{
      flex: "none", height: PERF_D,
      backgroundImage:
        `repeating-radial-gradient(circle at ${PERF_D / 2}px 50%, ${ink} 0 ${PERF_D / 2}px, transparent ${PERF_D / 2}px ${PERF_D * 2}px)`,
    }} />
  );
}

/** 半券(ミシン目より下)。 */
export function Stub({ serial, ink = INK }: { serial: number; ink?: string }) {
  return (
    <div style={{
      flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: SPACE.md, padding: `${SPACE.sm}px 0 ${SPACE.md}px`,
    }}>
      <span style={{
        fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
        letterSpacing: TRACK.wide, lineHeight: LEAD.flat, color: ink,
        textTransform: "uppercase",
      }}>Explore</span>
      <span style={{ flex: "none", width: "40%", height: BARCODE_H }}>
        <Barcode serial={serial} ink={ink} vertical={false} />
      </span>
    </div>
  );
}

/** 題(主役)。★`style` で余白を足す ―― **flex の器で包まないこと**。
 *  `flex: "none"` を横並びの器に入れると縮まなくなり、行が券の外へはみ出す
 *  (第71巡に実測 ―― 要約が右の縁で切れた)。 */
export function Title({ children, ink = INK, lines = 2, style }: {
  children: React.ReactNode; ink?: string; lines?: number; style?: React.CSSProperties;
}) {
  return (
    <span style={{
      flex: "none",
      fontFamily: SANS, fontSize: TYPE.display, fontWeight: WEIGHT.bold,
      lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: ink,
      display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden",
      ...style,
    }}>{children}</span>
  );
}

/** 要約。★`Title` と同じく **flex の器で包まないこと**。 */
export function Summary({ children, ink = INK, lines = 2, style }: {
  children: React.ReactNode; ink?: string; lines?: number; style?: React.CSSProperties;
}) {
  return (
    <span style={{
      flex: "none",
      fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.text,
      lineHeight: LEAD.body, letterSpacing: TRACK.normal, color: ink,
      display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden",
      ...style,
    }}>{children}</span>
  );
}

/** 写真の四角。★`Pad` の中なら余白つき、外なら裁ち落とし。
 *  ★**縦の器の子として直に置く**(包むと `flex` の意味が横になる)。 */
export function Photo({ src, grow, style }: {
  src: string; grow: string; style?: React.CSSProperties;
}) {
  return (
    <div aria-hidden style={{
      flex: grow, minHeight: 0,
      backgroundImage: `url("${src}")`, backgroundSize: "cover", backgroundPosition: "center",
      ...style,
    }} />
  );
}

/** 印刷の粒。★**色のすぐ上・文字の下**に敷く(最前面へ乗せると文字が霞む)。 */
export function Grain() {
  const dpr = useDevicePixelRatio();
  return <span aria-hidden style={{ ...grainStyle(dpr), zIndex: 1 }} />;
}

/** 期間と場所の文字(どの案も同じ文面を使う)。 */
export function partsOf(data: TicketData) {
  const span = [data.date, data.until].filter(Boolean);
  return {
    period: (span[0] === span[1] ? span.slice(0, 1) : span).join(" – ") || "—",
    place: [data.venue, data.area].filter(Boolean).join("・") || "—",
  };
}

/** 切り欠きの大きさ(券の幅に対する％)。 */
const NOTCH_PCT = 13;   // ★目盛りの外(図形)

/**
 * 券の外形。★どの案も同じ … 幅・比・角丸・影・粒・切り欠き。
 * **中身の組み方だけ**が案ごとに違う状態にして、割り方の差だけが目に入るようにする。
 */
export function Sheet({ data, punch, deck = TICKET_DECK, width, stock, children }: {
  data: TicketData;
  punch?: TicketPunch | null;
  deck?: string;
  width?: number | string;
  /** 紙の地。全面1色の案は色、上下で割る案はクリーム(面ごとに自分で塗る)。 */
  stock: string;
  children: React.ReactNode;
}) {
  const domain = KIND_DOMAIN[data.kind];
  const notchPos: Record<string, React.CSSProperties> = {
    left: { left: 0, top: `${punch ? punch.t * 100 : 0}%`, transform: "translateY(-50%)" },
    right: { right: 0, top: `${punch ? punch.t * 100 : 0}%`, transform: "translateY(-50%)" },
    top: { top: 0, left: `${punch ? punch.t * 100 : 0}%`, transform: "translateX(-50%)" },
    bottom: { bottom: 0, left: `${punch ? punch.t * 100 : 0}%`, transform: "translateX(-50%)" },
  };
  return (
    <div style={{
      position: "relative", width: width ?? "100%", aspectRatio: TICKET_ASPECT,
      background: stock, borderRadius: RADIUS.sm, boxShadow: SOFT_SHADOW_LG,
      display: "flex", flexDirection: "column", overflow: "hidden", color: INK,
      // ★券の中には zIndex を持つ要素があるので、積み重ねの文脈をここで閉じる
      //   (第70巡に、閉じていなくて文字だけが 3D の canvas を突き抜けた)。
      isolation: "isolate",
    }}>
      <Grain />
      {children}
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

/** 券面の中身を包む器。★**左右の余白はこの器だけが持つ**(design.md §2)。 */
export function Pad({ children, pad = true, style }: {
  children: React.ReactNode; pad?: boolean; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      position: "relative", zIndex: 2, display: "flex", flexDirection: "column",
      paddingInline: pad ? SPACE.lg : 0, ...style,
    }}>{children}</div>
  );
}

/** 見本帳のどの案も同じ受け口。 */
export interface SampleProps {
  data: TicketData;
  punch?: TicketPunch | null;
  deck?: string;
  width?: number | string;
}

/**
 * ドメインの**平らな幾何形1つ**（AuBe / Adobe の作法）。
 * ★形の性格は鋏痕（`PUNCH_BY_DOMAIN`）と**そろえてある** ――
 *   弧（半円）／斜め（三角）／直角（四角）／切れ込み（十字）。
 *   券・鋏痕・マップのノードで同じ語彙が読めるようにするため、形だけ差し替えないこと。
 * ★枠は 100×100。塗りは呼び手が決める（色は必ず1つ）。
 */
export function DomainFigure({ domain, fill, style }: {
  domain: "place" | "experience" | "info" | "thing";
  fill: string;
  style?: React.CSSProperties;
}) {
  // ★以下は目盛りの外（図形の座標系・design.md §7）。
  const d = {
    place: "M0 100 A50 50 0 0 1 100 100 Z",
    experience: "M50 0 L100 100 H0 Z",
    info: "M6 6 H94 V94 H6 Z",
    thing: "M36 0 H64 V36 H100 V64 H64 V100 H36 V64 H0 V36 H36 Z",
  }[domain];
  return (
    <svg viewBox="0 0 100 100" aria-hidden focusable="false"
      preserveAspectRatio="none" style={{ display: "block", ...style }}>
      <path d={d} fill={fill} />
    </svg>
  );
}
