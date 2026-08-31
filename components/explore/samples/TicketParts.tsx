"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT } from "@/lib/tokens";
import {
  INK, KIND_DOMAIN, LATIN, MUTED, PAPER, SANS, SECOND, TICKET_SHADOW,
  TICKET_ASPECT, TICKET_DECK, TICKET_H_PER_W, itemKindOf,
} from "@/lib/constants";
import { grainStyle } from "@/lib/printGrain";
import { DOMAIN_COLOR } from "@/lib/palette";
import { PunchNotch } from "../PunchMark";
import type { TicketData, TicketPunch } from "../Ticket";

// ★★★**券の共通部品**（2026-08-31・第80巡に版面ごと作り直し）。
//
// ★★★第79巡までの券は「**色の紙**に文字を刷る」形だった。ユーザーの判断は
//   「**色は背景として使うのではなく、大きな文字のアクセントやアイコンなど
//   ワンポイントで**」「まだ幼稚。洗練されていて、ミニマルで、**タイポグラフィが
//   際立った**デザインに到達していない」。→ 3つを同時に変えた:
//
//   ① **紙は白1色**（`PAPER`）。どの券も同じ紙。色が面になる場所を作らない。
//   ② **色が出るのは2か所だけ** … 券種の**大きな英語**と、**鋏痕**。
//   ③ **段を組み直した**。主役は写真でも題でもなく **`poster`(38) の英語**。
//
// ★★★**役と段は1対1**（4段）。この4つ以外を券の中で使わない:
//   【印】券種の英語 `poster` 38 / `black` 900 … **唯一の色**
//   【主】題（和文）   `head`   20 / `bold`  700 … 墨
//   【付帯】要約（和文）`small`  11 / `text`  400 … 副文グレー（★表の外。下記）
//   【従】会期・会場   `micro`   9 / `bold`  700 … 控えめグレー
//
// ★★★**選ばれなかった案は次回まとめて消す**。このディレクトリ
//   （`components/explore/samples/`）ごと消せるように、外から参照しているのは
//   `components/tabs/DevStageTab.tsx` の1か所だけにしてある。

/** 罫の太さ。★いまの版面は罫を使わないが、案が要るときのために残す。 */
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
 * ギザギザ。★目盛りの外（図形）
 * ★★**上下の縁に付ける**（第72巡・ユーザー指定）。参照の NYC の券は横長で、
 *   ギザギザは**短いほうの縁**に並んでいた。こちらは縦長なので短辺は上下になる。
 * ★★★**間隔ではなく「数」で持つ。** px の間隔で並べると券の幅で割り切れず、
 *   **右端の1個が途中で切れる**（第72巡にユーザー指摘）。`calc(100% / N)` なら
 *   幅がいくつでも必ず割り切れ、間隔は幅に比例して伸び縮みする。
 * ★踏んだ穴 … r=6 で密に並べると**フリル**、r=4 で密だと**綴じたノート**に見えた。
 *   **深さより「数」が印象を決める。**
 */
const SCALLOP = { r: 7, count: 11 };

/**
 * ★★**四隅の切り欠き**（第78巡にユーザー指定「角丸ではなく四角に。四つの角が
 * 大きく円で切り欠かれている感じに」／第80巡に「**もう少し大きい円で**」）。
 * ★★**券の幅に対する割合**で持つ ―― px で持つと券の大きさが変わったときに
 *   ギザギザ（幅に比例する）と食い合う。ギザギザの半径 7px（券の幅 278 のとき
 *   約 2.5%）に対し、こちらは **14%** ＝ 5倍以上。
 */
const CORNER_PCT = 14;

/**
 * ★★★**欠けに触れないための余白**（第80巡。ユーザー指摘「切り欠いた部分に対して
 * スペーシングなどが考えられていません」）。
 *
 * ★★**CSS の `padding` に `%` を書くと、必ず親の「幅」に対して解決される**
 *   （縦の余白でも高さではなく幅で決まる）。だから `paddingTop: SAFE` は
 *   **切り欠きの半径とぴったり同じ px** になる。
 * ★★★円は**角から半径の距離までしか食わない**ので、上端（下端）から半径ぶん
 *   下がった所より内側なら、**横位置がどこであっても欠けに掛からない**。
 *   ―― これが「安全域を縦の余白1つで解ける」理由。
 * ★★**避けるのは文字だけ。写真は逆に欠けへ噛ませる**（紙の端まで出す）。
 */
export const SAFE = `${CORNER_PCT}%`;

/**
 * ★★**上下の縁のギザギザ ＋ 四隅の切り欠き**。
 *
 * 穴を開けたマスクを何枚も重ねて**掛け合わせる**（`intersect`）。
 * 全部が不透明なところだけ残るので、どの穴も抜ける。**6枚** ――
 * 上のギザギザ / 下のギザギザ / 四隅の円 4枚。
 *
 * ★★★**`mask-composite` が無い環境では、ひとりでに素の矩形へ戻る。**
 *   既定の合成は `add`＝和なので、ある層の穴を別の層の不透明が埋めて
 *   「穴の無いマスク」になる。JS で能力を見に行く必要がない。
 * ★`#000` は色ではなく**不透明**の意味（`TimeRange` / `GravityTab` と同じ作法）。
 */
export function scallopMask(): React.CSSProperties {
  const { r, count } = SCALLOP;
  const scallop = (side: string) =>
    `radial-gradient(circle ${r}px at ${side}, transparent 98%, #000 100%)`;  // ★目盛りの外（マスクの #000 は「色」でなく「不透明」）
  // ★★四隅。**層は券いっぱい**に敷く（`100% 100%`）。★★★**小さな箱に
  //   `no-repeat` で置いてはいけない** ―― 箱の外はその層の α が 0 になり、
  //   `intersect` は「全部の層が不透明な所」しか残さないので、**券が丸ごと
  //   消える**（第78巡に実際に消した）。
  // ★`circle` の半径は**割合で書けない**ので `ellipse` を使い、縦横で別の
  //   割合を与えて**結果として真円**にする。券の比は `TICKET_ASPECT`＝3/4 で
  //   固定なので、縦の割合は横 ÷ `TICKET_H_PER_W`。
  const ry = +(CORNER_PCT / TICKET_H_PER_W).toFixed(3);
  const corner = (at: string) =>
    `radial-gradient(ellipse ${CORNER_PCT}% ${ry}% at ${at}, transparent 98%, #000 100%)`;  // ★目盛りの外（同上）
  const corners = ["top left", "top right", "bottom left", "bottom right"];
  const image = [scallop("top"), scallop("bottom"), ...corners.map(corner)].join(", ");
  const tile = `calc(100% / ${count})`;
  const size = [`${tile} 100%`, `${tile} 100%`, ...corners.map(() => "100% 100%")].join(", ");
  const pos = ["left top", "left bottom", ...corners.map(() => "center")].join(", ");
  const repeat = ["repeat-x", "repeat-x", ...corners.map(() => "no-repeat")].join(", ");
  return {
    maskImage: image, WebkitMaskImage: image,
    maskSize: size, WebkitMaskSize: size,
    maskPosition: pos, WebkitMaskPosition: pos,
    maskRepeat: repeat, WebkitMaskRepeat: repeat,
    maskComposite: "intersect", WebkitMaskComposite: "source-in",
  } as React.CSSProperties;
}

/**
 * 券の外形。★どの案も同じ … 比・影・粒・ギザギザ・四隅の切り欠き・鋏痕。
 * ★★**角丸は 0**（第78巡にユーザー指定）。丸みは**四隅の切り欠き**が持つ。
 * ★★★**紙は白1色**（第80巡）。案が `stock` を選ぶ余地を無くしてある ――
 *   「色を面に使わない」は、選べるようにした瞬間に破られる。
 */
export function Sheet({ data, punch, deck = TICKET_DECK, width, children }: {
  data: TicketData;
  punch?: TicketPunch | null;
  deck?: string;
  width?: number | string;
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
    // ★影は**外側の器**が持つ（マスクした要素に `box-shadow` を書いても消える）。
    <div style={{ width: width ?? "100%", filter: TICKET_SHADOW }}>
    <div style={{
      position: "relative", width: "100%", aspectRatio: TICKET_ASPECT,
      background: PAPER,
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
export function Rule({ weight = RULE_HAIR, ink }: { weight?: number; ink?: string }) {
  return <span aria-hidden style={{ flex: "none", height: weight, background: ink ?? INK }} />;
}

/** 印刷の粒。★**紙のすぐ上・文字の下**に敷く。 */
export function Grain() {
  return <span aria-hidden style={{ ...grainStyle(), zIndex: 1 }} />;
}

// ── 4つの段 ──────────────────────────────────────────────────────
// ★★これ以外の段を券の中で使わないこと（design.md §5-1「★4段まで」）。

/**
 * 【印】券種の**英語**。`poster`(38) **`black`(900)**。**この券で唯一の色**。
 *
 * ★★★第80巡にユーザー指定「Exhibition などの英語を**太いボールドで大きく**」。
 *   `nano`(7) の小さなラベルから **5.4倍**にして、版面の主役へ引き上げた。
 * ★★大きな欧文の caps に `caps`(0.16em) の字間を足さない ―― 字間は**小さい字を
 *   読ませるため**のもので、大きくすると逆に語が散る。`tight` を当てる。
 * ★2行まで（EXHIBITION は 10 文字で、狭い券では折り返す）。
 */
export function Mark({ data, ink }: { data: TicketData; ink?: string }) {
  const color = ink ?? DOMAIN_COLOR[KIND_DOMAIN[data.kind]];
  return (
    <span style={{
      flex: "none",
      fontFamily: LATIN, fontSize: TYPE.poster, fontWeight: WEIGHT.black,
      letterSpacing: TRACK.tight, lineHeight: LEAD.snug, color,
      textTransform: "uppercase",
      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
    }}>{data.handwritten ? "Self issued" : itemKindOf(data.kind).en}</span>
  );
}

/**
 * 【主】題（和文）。`head`(20) / `bold`(700)。★2行まで。
 * ★★第80巡に **`black`(900) を英語へ譲って `bold` へ下がった**。
 *   大きな英語が主役になったので、題まで 900 だと版面に主役が2つできる。
 */
export function Title({ children, ink, style }: {
  children: React.ReactNode; ink?: string; style?: React.CSSProperties;
}) {
  return (
    <span style={{
      flex: "none",
      fontFamily: SANS, fontSize: TYPE.head, fontWeight: WEIGHT.bold,
      lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: ink ?? INK,
      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      ...style,
    }}>{children}</span>
  );
}

/**
 * 【付帯】要約（和文）。`small`(11) / `text`(400) / `body` 行間。
 * ★★★**`small` を文章に使うのは表の外**（本来は `bold`/`flat` のラベル用）。
 *   第80巡にユーザー指定「日本語の詳細な説明の文字は**もっと小さくて良い**」。
 *   `body`(13) から1段落とした。**券だけの例外**として `design.md` に書いてある。
 * ★色も**副文グレー**へ落とす（墨だと題と競る）。
 */
export function Lede({ children, ink, lines = 3, style }: {
  children: React.ReactNode; ink?: string; lines?: number; style?: React.CSSProperties;
}) {
  return (
    <span style={{
      flex: "none",
      fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.text,
      lineHeight: LEAD.body, letterSpacing: TRACK.normal, color: ink ?? SECOND,
      display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden",
      ...style,
    }}>{children}</span>
  );
}

/**
 * 【従】会期と会場。`micro`(9) / `bold` / `flat` / `caps` の**1行**。
 * ★★★第80巡に**升（罫で囲った日付の箱）をやめた** ―― 区切りに線を引かないのが
 *   このアプリの語彙（第79巡）。日付・会場を中黒でつないだ1行にする。
 * ★★数字は欧文＋等幅（`LATIN` / `tabular-nums`）。和文の会場だけ `SANS` にすると
 *   1行の中で書体が2つになるので、**行ごと `LATIN` に置いて和文は自動で落とす**
 *   のではなく、**span を分ける**（欧文は `LATIN`・和文は `SANS`）。
 */
export function Meta({ period, until, place, ink, style }: {
  period: string; until?: string; place: string; ink?: string; style?: React.CSSProperties;
}) {
  const c = ink ?? MUTED;
  const base: React.CSSProperties = {
    fontSize: TYPE.micro, fontWeight: WEIGHT.bold,
    lineHeight: LEAD.flat, letterSpacing: TRACK.caps, color: c,
  };
  return (
    <div style={{
      flex: "none", display: "flex", alignItems: "center", gap: SPACE.sm,
      minWidth: 0, ...style,
    }}>
      <span style={{ ...base, fontFamily: LATIN, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {period}{until ? `–${until}` : ""}
      </span>
      <span style={{
        ...base, fontFamily: SANS, letterSpacing: TRACK.normal,
        minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{place}</span>
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
 * ドメインの**平らな幾何形1つ**（写真の無い券が使う。小さく添える「印」にもなる）。
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
  data: TicketData; fill?: string; style?: React.CSSProperties;
}) {
  if (data.image) return <Photo src={data.image} style={style} />;
  return (
    <div aria-hidden style={{
      flex: "1 1 auto", minHeight: `${PHOTO_MIN}%`, position: "relative", zIndex: 2,
      display: "flex", alignItems: "center", justifyContent: "center", ...style,
    }}>
      <DomainFigure domain={KIND_DOMAIN[data.kind]} fill={fill ?? DOMAIN_COLOR[KIND_DOMAIN[data.kind]]}
        style={{ width: "46%", height: "62%" }} />
    </div>
  );
}

/** 期間と場所の文字（どの案も同じ文面を使う）。 */
export function partsOf(data: TicketData) {
  return {
    /** 始まり。 */
    period: data.date || data.until || "—",
    /** 終わり。★始まりと同じなら出さない。 */
    until: data.until && data.until !== data.date ? data.until : undefined,
    place: [data.venue, data.area].filter(Boolean).join("・") || "—",
  };
}
