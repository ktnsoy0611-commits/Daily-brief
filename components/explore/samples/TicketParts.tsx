"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import {
  INK, KIND_DOMAIN, LATIN, SANS, SOFT_SHADOW_LG,
  TICKET_ASPECT, TICKET_DECK, itemKindOf,
} from "@/lib/constants";
import { grainStyle, useDevicePixelRatio } from "@/lib/printGrain";
import { serialOf } from "@/lib/ticket";
import { PunchNotch } from "../PunchMark";
import type { TicketData, TicketPunch } from "../Ticket";

// ★★★**券の見本帳の共通部品**（2026-08-31・第72巡に組み直し）。
//
// ★★★**選ばれなかった案は次回まとめて消す**。このディレクトリ
//   （`components/explore/samples/`）ごと消せるように、外から参照しているのは
//   `components/tabs/DevStageTab.tsx` の1か所だけにしてある。
//
// ★★★第72巡の指摘は版面の割り方ではなく**組み立てそのもの**だった
//   （「全くオーガナイズされていません。並列に情報が並んでいるだけで、写真も
//   小さいし、無駄が非常に多い」）。直したのは4つ:
//   ① **写真が余りを全部取る**（`flex: 1`）。割合を決め打ちしない ＝ 空きが出ない。
//   ② **段は4つだけ**（26 / 13 / 11 / 7）。役の数だけ使う（design.md §5-1）。
//   ③ **ラベル列を捨てた**。日付は「かたち」（罫で囲った升）になり、
//      `会期／SOON／会場／VENUE` の4行のラベルが 0 行になった。
//   ④ **版面の左端を1本にそろえた**（バー・題・要約・升が同じ縦線に乗る）。

/** 罫の太さ。★参照はどれも罫を**2種**しか使わない ―― 太いバーと細罫。 */
export const RULE_HAIR = 1;
export const RULE_BAR = 4;   // ★目盛りの外（罫の太さ）
/** 写真がこれ以上痩せないところ（券の高さに対する％）。★目盛りの外（図形） */
export const PHOTO_MIN = 40;

/** 見本帳のどの案も同じ受け口。 */
export interface SampleProps {
  data: TicketData;
  punch?: TicketPunch | null;
  deck?: string;
  width?: number | string;
}

// ── 紙の形 ────────────────────────────────────────────────────────
/**
 * ギザギザの半円の半径と、中心どうしの間隔。★目盛りの外（図形）
 * ★★**上下の縁に付ける**（2026-08-31・ユーザー指定）。参照の NYC の券は横長で、
 *   ギザギザは**短いほうの縁**に並んでいた。こちらは縦長なので短辺は上下になる。
 * ★踏んだ穴 … r=6/gap=16 は**フリル**、r=4/gap=13 は**綴じたノート**に見えた
 *   （どちらも数が多すぎた）。**深さより「数」が印象を決める。**
 *   いまは券の幅 278 に対して 11〜12 個。
 */
const SCALLOP = { r: 7, gap: 24 };  // ★目盛りの外（図形の座標系）

/**
 * ★★**上下の縁のギザギザ**（2026-08-31・ユーザー指定。NYC の地下鉄券）。
 *
 * 上の縁に穴を開けたマスクと、下の縁に穴を開けたマスクを**掛け合わせる**
 * （`intersect`）。両方が不透明なところだけ残るので、どちらの穴も抜ける。
 *
 * ★★★**`mask-composite` が無い環境では、ひとりでに素の矩形へ戻る。**
 *   既定の合成は `add`＝和なので、片方の穴をもう片方の不透明が埋めて
 *   「穴の無いマスク」になる。JS で能力を見に行く必要がない。
 * ★`#000` は色ではなく**不透明**の意味（`TimeRange` / `GravityTab` と同じ作法）。
 */
export function scallopMask(): React.CSSProperties {
  const { r, gap } = SCALLOP;
  const hole = (side: string) =>
    `radial-gradient(circle ${r}px at ${side}, transparent 98%, #000 100%)`;  // ★目盛りの外（マスクの #000 は「色」でなく「不透明」）
  const image = `${hole("top")}, ${hole("bottom")}`;
  const size = `${gap}px 100%, ${gap}px 100%`;
  const pos = "left top, left bottom";
  const repeat = "repeat-x, repeat-x";
  return {
    maskImage: image, WebkitMaskImage: image,
    maskSize: size, WebkitMaskSize: size,
    maskPosition: pos, WebkitMaskPosition: pos,
    maskRepeat: repeat, WebkitMaskRepeat: repeat,
    maskComposite: "intersect", WebkitMaskComposite: "source-in",
  } as React.CSSProperties;
}

/**
 * 券の外形。★どの案も同じ … 比・角丸・影・粒・ギザギザ・切り欠き。
 * ★角丸は `sm` まで。ギザギザと大きな角丸は喧嘩する。
 */
export function Sheet({ data, punch, deck = TICKET_DECK, width, stock, children }: {
  data: TicketData;
  punch?: TicketPunch | null;
  deck?: string;
  width?: number | string;
  /** 紙の地。 */
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
      //   （第70巡に、閉じていなくて文字だけが 3D の canvas を突き抜けた）。
      isolation: "isolate",
      ...scallopMask(),
    }}>
      <Grain />
      {children}
      {punch && (
        <span aria-hidden style={{
          position: "absolute", zIndex: 5,
          width: "13%", aspectRatio: "1",   // ★目盛りの外（切り欠きの大きさ＝券の幅の 13%）
          ...notchPos[punch.edge],
        }}>
          <PunchNotch domain={domain} edge={punch.edge} deck={deck} tilt={punch.tilt ?? 0} />
        </span>
      )}
    </div>
  );
}

/** ★**左右の余白を持つのはこの器だけ**（design.md §2）。版面の左端はここで1本になる。 */
export function Pad({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: "relative", zIndex: 2, display: "flex", flexDirection: "column",
      paddingInline: SPACE.lg, ...style,
    }}>{children}</div>
  );
}

/** 罫。★`Pad` の外に置けば**紙の端まで**走る。 */
export function Rule({ weight = RULE_HAIR, ink = INK }: { weight?: number; ink?: string }) {
  return <span aria-hidden style={{ flex: "none", height: weight, background: ink }} />;
}

/** 印刷の粒。★**色のすぐ上・文字の下**に敷く。 */
export function Grain() {
  const dpr = useDevicePixelRatio();
  return <span aria-hidden style={{ ...grainStyle(dpr), zIndex: 1 }} />;
}

// ── 4つの段 ──────────────────────────────────────────────────────
// ★★これ以外の段を券の中で使わないこと（design.md §5-1「★4段まで」）。

/** 【印】券種・状態・番号。`nano`(7) caps。 */
export function Mark({ data, ink = INK }: { data: TicketData; ink?: string }) {
  const cap: React.CSSProperties = {
    fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
    letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: ink,
    textTransform: "uppercase",
  };
  const kind = data.handwritten ? "Self issued" : itemKindOf(data.kind).en;
  return (
    <div style={{
      flex: "none", display: "flex", alignItems: "baseline",
      justifyContent: "space-between", gap: SPACE.sm,
    }}>
      {/* ★「会期が近い」は色ではなく**語**で伝える（有彩色は紙の1色だけ）。 */}
      <span style={cap}>{kind}{data.soon ? " — Soon" : ""}</span>
      <span style={{ ...cap, fontVariantNumeric: "tabular-nums" }}>Nº {serialOf(data.serial)}</span>
    </div>
  );
}

/**
 * 【主】題。`head`(20) bold。★2行まで。
 * ★★`display`(26) では**和文が9文字で折り返し、2行目に1文字だけ残る**
 *   （第72巡に実測 ―― 券の幅 278、版面 246 に対し 26×10 = 260）。
 *   `head`(20) なら12文字入るので、たいていの題が1行に収まる。
 *   主役は**写真**なので、題がいちばん大きい文字であれば足りる。
 */
export function Title({ children, ink = INK, style }: {
  children: React.ReactNode; ink?: string; style?: React.CSSProperties;
}) {
  return (
    <span style={{
      flex: "none",
      fontFamily: SANS, fontSize: TYPE.head, fontWeight: WEIGHT.bold,
      lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: ink,
      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      ...style,
    }}>{children}</span>
  );
}

/** 【付帯】要約。`small`(11) text。★1行だけ ―― ここが写真の大きさを食う。 */
export function Lede({ children, ink = INK, lines = 1, style }: {
  children: React.ReactNode; ink?: string; lines?: number; style?: React.CSSProperties;
}) {
  return (
    <span style={{
      flex: "none",
      fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.text,
      lineHeight: LEAD.body, letterSpacing: TRACK.normal, color: ink,
      display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden",
      ...style,
    }}>{children}</span>
  );
}

/**
 * 【従】会期と会場。★**ラベル列を作らない** ―― 日付は罫で囲った**升**になり、
 * 会場はその右へ置く。イベントカードの `DEC / 12 / TUE` の升と同じ役。
 */
export function Meta({ period, until, place, ink = INK, style }: {
  period: string; until?: string; place: string; ink?: string; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      flex: "none", display: "flex", alignItems: "stretch", gap: SPACE.sm, ...style,
    }}>
      {/* ★★升は**細く**する。会期を1行に伸ばすと 130px 食い、会場が2行に折れて
          「東京都現代美術館・清澄／白河」と割れた（第72巡に実測）。 */}
      <span style={{
        flex: "none", display: "flex", flexDirection: "column",
        padding: `${SPACE.xs}px ${SPACE.sm}px`,
        border: `${RULE_HAIR}px solid ${ink}`,
      }}>
        {/* ★数字だけ欧文＋等幅数字＋詰めた字間（design.md §1）。 */}
        <span style={{
          fontFamily: LATIN, fontSize: TYPE.body, fontWeight: WEIGHT.bold,
          lineHeight: LEAD.snug, letterSpacing: TRACK.tight, color: ink,
          fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
        }}>{period}</span>
        {until && (
          <span style={{
            fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
            lineHeight: LEAD.flat, letterSpacing: TRACK.caps, color: ink,
            fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
          }}>– {until}</span>
        )}
      </span>
      {/* ★center は意匠 ―― 升と同じ高さの中に置く（design.md §1 の③）。 */}
      <span style={{
        flex: 1, minWidth: 0, display: "flex", alignItems: "center",
        fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold,
        lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: ink,
      }}>
        <span style={{
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{place}</span>
      </span>
    </div>
  );
}

// ── 絵 ───────────────────────────────────────────────────────────

/** 写真。★**余りを全部取る**（`flex: 1`）。割合を決め打ちしないので空きが出ない。 */
export function Photo({ src, style }: { src: string; style?: React.CSSProperties }) {
  return (
    <div aria-hidden style={{
      flex: "1 1 auto", minHeight: `${PHOTO_MIN}%`, position: "relative", zIndex: 2,
      backgroundImage: `url("${src}")`, backgroundSize: "cover", backgroundPosition: "center",
      ...style,
    }} />
  );
}

/**
 * ドメインの**平らな幾何形1つ**（写真の無い券が使う）。
 * ★形の性格は鋏痕（`PUNCH_BY_DOMAIN`）と**そろえてある** ――
 *   弧（半円）／斜め（三角）／直角（四角）／切れ込み（十字）。形だけ差し替えないこと。
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

/** 写真か、無ければドメインの幾何形。★どの案も入口はここ1つ。 */
export function Figure({ data, fill, style }: {
  data: TicketData; fill: string; style?: React.CSSProperties;
}) {
  if (data.image) return <Photo src={data.image} style={style} />;
  return (
    <div aria-hidden style={{
      flex: "1 1 auto", minHeight: `${PHOTO_MIN}%`, position: "relative", zIndex: 2,
      display: "flex", alignItems: "center", justifyContent: "center", ...style,
    }}>
      <DomainFigure domain={KIND_DOMAIN[data.kind]} fill={fill}
        style={{ width: "46%", height: "62%" }} />
    </div>
  );
}

/** 期間と場所の文字（どの案も同じ文面を使う）。 */
export function partsOf(data: TicketData) {
  return {
    /** 升の1行目（始まり）。 */
    period: data.date || data.until || "—",
    /** 升の2行目（終わり）。★始まりと同じなら出さない。 */
    until: data.until && data.until !== data.date ? data.until : undefined,
    place: [data.venue, data.area].filter(Boolean).join("・") || "—",
  };
}
