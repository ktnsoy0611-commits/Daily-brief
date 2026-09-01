"use client";

import { createContext, useContext, useId, useLayoutEffect, useRef, useState } from "react";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT } from "@/lib/tokens";
import {
  INK, KIND_DOMAIN, LATIN, MUTED, PAPER, SANS, SECOND, TICKET_SHADOW,
  TICKET_ASPECT, TICKET_DECK, TICKET_H_PER_W, itemKindOf,
} from "@/lib/constants";
import { grainStyle } from "@/lib/printGrain";
import { bodyInkOn, deepen, DOMAIN_COLOR } from "@/lib/palette";
import { PunchNotch } from "../PunchMark";
import type { ItemDomain } from "@/lib/types";
import type { TicketData, TicketPunch } from "../Ticket";

// ★★★**券の共通部品**（2026-08-31・第81巡に版面ごと作り直し）。
//
// ★★★第81巡は**参照5枚の分析**から始めた。参照に在って、券に無かったのは5つ:
//   ① **写真が「素材」になっていない** ―― 参照5枚のうち4枚が**デュオトーン**、
//      残り1枚がグレースケール。**生のフルカラー写真を置いている参照は1枚も無い。**
//   ② **書体の「声」が1つしかない** ―― 参照はどれも表示用とデータ用で質感が違う。
//   ③ **括弧がラベルを消している** ―― `(2020)` `(WA)` `WITH …`。券は羅列だった。
//   ④ **語が紙の端まで届いていない** ―― 大きさが固定なので短い語だけ弱く見えた
//      （実測 `EXHIBITION` は幅の 88% でも `THING` は 48%）。
//   ⑤ **余白が均一**（どこも `md`）でリズムが無い。
//
// ★★★**役と段は1対1**（4段）。この4つ以外を券の中で使わない:
//   【印】券種の英語 `poster` 38 上限・**幅いっぱい** / `black` 900 / `wdth` 70
//   【主】題（和文）  `head`   20 / `bold`  700
//   【付帯】要約（和文）`small`  11 / `text`  400（★表の外。券だけの例外）
//   【従】括弧の添え物 `micro`   9 / `bold`  700 / `caps`
//
// ★★★**選ばれなかった案は次回まとめて消す**。このディレクトリごと消せるように、
//   外から参照しているのは `components/tabs/DevStageTab.tsx` の1か所だけ。

/** 罫の太さ。★いまの版面は罫を使わないが、案が要るときのために残す。 */
export const RULE_HAIR = 1;
export const RULE_BAR = 4;   // ★目盛りの外（罫の太さ）
/** 写真がこれ以上痩せないところ（券の高さに対する％）。★目盛りの外（図形） */
export const PHOTO_MIN = 40;

/**
 * ★★**大きな英語だけ幅を絞る**（第81巡）。Archivo は可変フォントで `wdth`(62〜125)
 * を持ち、`app/globals.css` の既定は 88。**見出しだけ 70 まで絞る**と凝縮した
 * 表示用の顔になり、データ行（88 のまま）との間に**質感の差**が生まれる。
 * ★★★**書体を増やさずに「2つ目の声」を作れる**のが要点（欧文は Archivo 1本のまま）。
 */
const POSTER_WDTH = 70;   // ★目盛りの外（可変フォントの軸）

/** 見本帳のどの案も同じ受け口。 */
export interface SampleProps {
  data: TicketData;
  punch?: TicketPunch | null;
  deck?: string;
  width?: number | string;
}

// ── 紙と、その上の色の語彙 ────────────────────────────────────────
/**
 * ★★**紙が白か色かで、上に載るものの色が全部決まる**。案ごとに書き分けず、
 * ここ1か所で導く（`bodyInkOn` が面から本文の色を出す）。
 * ★`accent` … 白い紙ではドメインの色／色の紙では紙に載る色そのもの
 *   （色の上にもう1つ色を置かない ―― 参照 Post Familiar も2色で組んでいる）。
 */
interface Skin { stock: string; ink: string; sub: string; faint: string; accent: string }
const SkinCtx = createContext<Skin>({
  stock: PAPER, ink: INK, sub: SECOND, faint: MUTED, accent: INK,
});
export const useSkin = () => useContext(SkinCtx);

function skinOf(domain: ItemDomain, stock: string): Skin {
  if (stock === PAPER) {
    return { stock, ink: INK, sub: SECOND, faint: MUTED, accent: DOMAIN_COLOR[domain] };
  }
  // 色の紙。★載る色は1つだけ（`bodyInkOn` が紙から導く）。濃淡は不透明度で作る。
  const ink = bodyInkOn(stock);
  return { stock, ink, sub: ink, faint: ink, accent: ink };
}

// ── 紙の形 ────────────────────────────────────────────────────────
/**
 * ギザギザ。★目盛りの外（図形）
 * ★★**上下の縁に付ける**（第72巡・ユーザー指定）。参照の NYC の券は横長で、
 *   ギザギザは**短いほうの縁**に並んでいた。こちらは縦長なので短辺は上下になる。
 * ★★★**間隔ではなく「数」で持つ。** px の間隔で並べると券の幅で割り切れず、
 *   **右端の1個が途中で切れる**（第72巡にユーザー指摘）。`calc(100% / N)` なら
 *   幅がいくつでも必ず割り切れ、間隔は幅に比例して伸び縮みする。
 */
const SCALLOP = { r: 7, count: 11 };

/**
 * ★★**四隅の切り欠き**（第78巡にユーザー指定／第80巡に「もう少し大きい円で」）。
 * ★★**券の幅に対する割合**で持つ ―― px で持つと券の大きさが変わったときに
 *   ギザギザ（幅に比例する）と食い合う。
 */
const CORNER_PCT = 14;

/**
 * ★★★**欠けに触れないための余白**（第80巡）。
 * ★★**CSS の `padding` に `%` を書くと、必ず親の「幅」に対して解決される**ので、
 *   `paddingTop: SAFE` は**切り欠きの半径とぴったり同じ px**になる。
 * ★★★円は**角から半径の距離までしか食わない**ので、上端（下端）から半径ぶん
 *   下がった所より内側なら、**横位置がどこであっても欠けに掛からない**。
 * ★★**避けるのは文字だけ。写真は逆に欠けへ噛ませる**（紙の端まで出す）。
 */
export const SAFE = `${CORNER_PCT}%`;

/**
 * ★★**上下の縁のギザギザ ＋ 四隅の切り欠き**。穴を開けたマスクを6枚重ねて
 * **掛け合わせる**（`intersect`）。全部が不透明なところだけ残る。
 *
 * ★★★**`mask-composite` が無い環境では、ひとりでに素の矩形へ戻る**（既定の
 *   `add` が穴を埋める）。JS で能力を見に行く必要がない。
 * ★★★**小さな箱に `no-repeat` で置いてはいけない** ―― 箱の外はその層の α が 0 に
 *   なり、`intersect` が**券を丸ごと消す**（第78巡に実際に消した）。
 * ★`#000` は色ではなく**不透明**の意味（`TimeRange` / `GravityTab` と同じ作法）。
 */
export function scallopMask(): React.CSSProperties {
  const { r, count } = SCALLOP;
  const scallop = (side: string) =>
    `radial-gradient(circle ${r}px at ${side}, transparent 98%, #000 100%)`;  // ★目盛りの外（マスクの #000 は「色」でなく「不透明」）
  // ★`circle` の半径は**割合で書けない**ので `ellipse` を使い、縦横で別の割合を
  //   与えて**結果として真円**にする（券の比は `TICKET_ASPECT`＝3/4 で固定）。
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
 * ★★**角丸は 0**。丸みは**四隅の切り欠き**が持つ。
 * ★★★**マスクした要素に `box-shadow` は出ない**（影ごと切り抜かれる）ので、
 *   影は**外側の器**が `filter: drop-shadow` で持つ（輪郭の α に沿う）。
 * ★`stock` を渡さなければ**白い紙**。色を渡せるのは「全面が色」の案だけ。
 */
export function Sheet({ data, punch, deck = TICKET_DECK, width, stock = PAPER, children }: {
  data: TicketData;
  punch?: TicketPunch | null;
  deck?: string;
  width?: number | string;
  /** 紙の地。★既定は白。 */
  stock?: string;
  children: React.ReactNode;
}) {
  const domain = KIND_DOMAIN[data.kind];
  const skin = skinOf(domain, stock);
  const notchPos: Record<string, React.CSSProperties> = {
    left: { left: 0, top: `${punch ? punch.t * 100 : 0}%`, transform: "translateY(-50%)" },
    right: { right: 0, top: `${punch ? punch.t * 100 : 0}%`, transform: "translateY(-50%)" },
    top: { top: 0, left: `${punch ? punch.t * 100 : 0}%`, transform: "translateX(-50%)" },
    bottom: { bottom: 0, left: `${punch ? punch.t * 100 : 0}%`, transform: "translateX(-50%)" },
  };
  return (
    <SkinCtx.Provider value={skin}>
      <div style={{ width: width ?? "100%", filter: TICKET_SHADOW }}>
        <div style={{
          position: "relative", width: "100%", aspectRatio: TICKET_ASPECT,
          background: skin.stock,
          display: "flex", flexDirection: "column", overflow: "hidden", color: skin.ink,
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
    </SkinCtx.Provider>
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
  const skin = useSkin();
  return <span aria-hidden style={{ flex: "none", height: weight, background: ink ?? skin.ink }} />;
}

/** 印刷の粒。★**紙のすぐ上・文字の下**に敷く。 */
export function Grain() {
  return <span aria-hidden style={{ ...grainStyle(), zIndex: 1 }} />;
}

// ── 4つの段 ──────────────────────────────────────────────────────
// ★★これ以外の段を券の中で使わないこと（design.md §5-1「★4段まで」）。

/**
 * ★★★**器の幅ぴったりに1行を組む**（第81巡）。
 *
 * ★★★**`textLength` で伸ばさない。** `spacingAndGlyphs` は字形が歪み、
 *   `spacing` は字間だけ間延びする。**正しいのは大きさを変えること。**
 * ★幅は文字サイズに**比例**するので、いまの幅を1回測れば次の大きさが直接出る
 *   （`次 = いま × 器の幅 ÷ いまの幅`）。反復は要らない。
 * ★★書体が届く前に測ると別の書体の幅を掴むので、`document.fonts.ready` で測り直す。
 *
 * ★★★**この行の大きさは「段」から選ばない**（`design.md` §7 目盛りの外）。
 *   大きさが**版面の幅から決まる**ものなので、段から選ぶ性質のものではない ――
 *   図形の座標や物理の寸法と同じ扱い。上限を置くと、置いた瞬間に**短い語だけ
 *   小さいまま**になり、第80巡の問題（`THING` が幅の 48%）がそのまま戻る。
 * ★`seed` は測り始めの大きさ（結果には影響しない）。
 */
const FIT_SEED = 40;   // ★目盛りの外（測り始めの大きさ）

function FitLine({ children, style }: {
  children: React.ReactNode; style?: React.CSSProperties;
}) {
  const box = useRef<HTMLDivElement>(null);
  const ink = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(FIT_SEED);

  useLayoutEffect(() => {
    let alive = true;
    const fit = () => {
      const b = box.current, s = ink.current;
      if (!alive || !b || !s) return;
      const room = b.clientWidth;
      const now = s.getBoundingClientRect().width;
      if (room < 1 || now < 1) return;
      setSize((cur) => Math.max(1, (cur * room) / now));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    // ★書体が届いたら測り直す（届く前は代替書体の幅を掴んでいる）。
    document.fonts?.ready.then(fit).catch(() => {});
    return () => { alive = false; ro.disconnect(); };
  }, [children]);

  return (
    <div ref={box} data-fit style={{ flex: "none", minWidth: 0, ...style }}>
      {/* ★★`inline-block` でなければならない ―― `block` にすると箱が器いっぱいに
          広がり、**測っているのが文字ではなく器**になって比が常に 1 になる。 */}
      <span ref={ink} style={{
        // ★目盛りの外（大きさは版面の幅から決まる。太さは呼ぶ側の子が持つ）
        display: "inline-block", fontSize: size, whiteSpace: "nowrap",
      }}>
        {children}
      </span>
    </div>
  );
}

/**
 * 【印】券種の**英語**。**紙の幅いっぱい**／`black`(900)／`wdth` 70。
 * **この券で唯一の色**（白い紙のとき）。
 *
 * ★★★第80巡は大きさが固定だったので、短い語（`THING`）だけ幅の 48% で終わり、
 *   券によって強さが違って見えた。**幅に合わせて組む**と、どの語も同じ強さで立つ。
 * ★★大きな欧文の caps に `caps`(0.16em) を当てない ―― 字間は**小さい字を読ませる
 *   ため**のもので、大きくすると語が散る。`tight` を当てる。
 */
export function Mark({ data, ink }: { data: TicketData; ink?: string }) {
  const skin = useSkin();
  const word = data.handwritten ? "Self issued" : itemKindOf(data.kind).en;
  return (
    <FitLine>
      <span style={{
        fontFamily: LATIN, fontWeight: WEIGHT.black,
        fontVariationSettings: `"wdth" ${POSTER_WDTH}`,
        // ★★行間は `flat`。`snug`(1.3) だと 90px 級の語の下に 27px の空きが残り、
        //   次の行との束が見えなくなる（design.md「単一行のラベルは `flat`」）。
        letterSpacing: TRACK.tight, lineHeight: LEAD.flat, color: ink ?? skin.accent,
        textTransform: "uppercase",
      }}>{word}</span>
    </FitLine>
  );
}

/**
 * 【主】題（和文）。`head`(20) / `bold`(700)。★2行まで。
 * ★★第80巡に **`black`(900) を英語へ譲って `bold` へ下がった**（主役は1つ）。
 */
export function Title({ children, ink, style }: {
  children: React.ReactNode; ink?: string; style?: React.CSSProperties;
}) {
  const skin = useSkin();
  return (
    <span style={{
      flex: "none",
      fontFamily: SANS, fontSize: TYPE.head, fontWeight: WEIGHT.bold,
      lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: ink ?? skin.ink,
      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      ...style,
    }}>{children}</span>
  );
}

/**
 * 【付帯】要約（和文）。`small`(11) / `text`(400) / `body` 行間。
 * ★★★**`small` を文章に使うのは表の外**（本来は `bold`/`flat` のラベル用）。
 *   第80巡にユーザー指定「日本語の詳細な説明の文字はもっと小さくて良い」。
 *   **券だけの例外**として `design.md` に書いてある。
 * ★色の紙の上では、濃淡を**不透明度**で作る（色の上にもう1つ色を置かない）。
 */
export function Lede({ children, ink, lines = 3, style }: {
  children: React.ReactNode; ink?: string; lines?: number; style?: React.CSSProperties;
}) {
  const skin = useSkin();
  return (
    <span style={{
      flex: "none",
      fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.text,
      lineHeight: LEAD.body, letterSpacing: TRACK.normal, color: ink ?? skin.sub,
      // ★★色の紙の上では**不透明度を下げない** ―― 下げると本文の 4.5 を割る
      //   （朱の券では素で 4.36 しか出ない。第81巡に実測）。濃淡は段が作る。
      display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden",
      ...style,
    }}>{children}</span>
  );
}

/** ★★**和文が混ざっているか**。混ざっていたら欧文の字間を当てない（design.md §1）。
 *  ★会期は「12.02」のこともあれば「通年」「受注」のこともある ―― 出どころが
 *  ユーザーの入力なので、**書体を決め打ちできない**。 */
const hasJa = (t: string) => /[^\u0000-\u007F]/.test(t);

/** 【従】括弧の添え物の土台。`micro`(9) / `bold` / `flat`。★欧文だけ `caps`。 */
function asideStyle(color: string, latin: boolean): React.CSSProperties {
  return {
    fontFamily: latin ? LATIN : SANS,
    fontSize: TYPE.micro, fontWeight: WEIGHT.bold,
    lineHeight: LEAD.flat, letterSpacing: latin ? TRACK.caps : TRACK.normal,
    color, whiteSpace: "nowrap",
  };
}

/**
 * 【従】会期。**括弧に入れる**（第81巡）。
 * ★★★参照はどれも補助情報を**括弧**に入れて、ラベル行を消している
 *   （`(2020)` `(N.01 – SS21)` `(WA)`）。券も「会期:」のようなラベルを持たない。
 * ★数字は欧文＋等幅（`LATIN` / `tabular-nums`）。
 */
export function Period({ period, until, ink }: { period: string; until?: string; ink?: string }) {
  const skin = useSkin();
  const tinted = skin.stock !== PAPER;
  const latin = !hasJa(period) && !hasJa(until ?? "");
  return (
    <span style={{
      flex: "none", ...asideStyle(ink ?? skin.faint, latin),
      fontVariantNumeric: "tabular-nums",
      opacity: tinted ? 0.72 : 1,   // ★目盛りの外（色の紙の上の濃淡）
    }}>({period}{until ? ` – ${until}` : ""})</span>
  );
}

/**
 * 【従】会場。`WITH 東京都現代美術館 (清澄白河)`（第81巡）。
 * ★★参照 Post Familiar の `WITH THE MARIGNY (OR)` の作法。
 * ★★**和文に `caps` を当てない**ので、`WITH` と地名だけ欧文の字間を持ち、
 *   会場名は和文の `normal`。**1行の中で span を分ける。**
 */
export function Venue({ place, area, ink }: { place: string; area?: string; ink?: string }) {
  const skin = useSkin();
  const c = ink ?? skin.faint;
  const tinted = skin.stock !== PAPER;
  return (
    <span style={{
      flex: "none", display: "flex", alignItems: "baseline", gap: SPACE.xs,
      minWidth: 0, opacity: tinted ? 0.72 : 1,   // ★目盛りの外（色の紙の上の濃淡）
    }}>
      <span style={asideStyle(c, true)}>WITH</span>
      <span style={{
        ...asideStyle(c, !hasJa(place)),
        minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
      }}>{place}</span>
      {area && <span style={asideStyle(c, hasJa(area) ? false : true)}>({area})</span>}
    </span>
  );
}

// ── 絵 ───────────────────────────────────────────────────────────

/**
 * ★★★**デュオトーン**（第81巡）。写真を**明暗だけ**にして、その明暗を
 * **「影の色 → 紙の色」の1本の帯へ写す**。参照5枚のうち4枚がこれをやっていた
 * ―― **生のフルカラー写真を置いている参照は1枚も無い。**
 *
 * ★★★**やり方は SVG のフィルタ1本**（`feColorMatrix` で彩度を 0 にし、
 *   `feComponentTransfer` の `type="table"` で各チャンネルを2点補間する）。
 *   ★★これが**本物のグラデーションマップ** ―― 0 が影の色、1 が紙の色で、
 *   **あいだは線形**。中間調がそのまま残る。
 * ★★★**混色（`lighten`/`darken`/`multiply`/`screen`）ではできない**。実際に試して
 *   両方とも失敗した（第81巡）:
 *   ・`lighten`＋`darken` は**切り捨て**なので、影の色より暗い画素が全部その色で
 *     潰れる（実測 … 明度の中央値 0.70 の写真で 96% が単色になった）。
 *   ・`multiply`＋`screen` は**線形ではない**ので、中間調が一様に浅い方へ寄る
 *     （実測 … 中間が淡い桃色の靄になった）。
 *   **デュオトーンは「切り捨て」でも「掛け算」でもなく、写像である。**
 * ★★`color-interpolation-filters="sRGB"` を必ず書く ―― 既定の linearRGB だと
 *   中間調が持ち上がって、狙った調子にならない。
 *
 * ★★白い紙の券では **影＝ドメインの色の暗い側／光＝紙**。
 * ★★色の紙の券では **影＝地そのもの** ―― 写真の影が地へ溶け、
 *   **写真が色の面から浮き上がる**（Post Familiar の見え方の正体）。
 *
 * ★★★第76巡の「`multiply` を使うな」に**反しない**。あちらは**質感**の規則
 *   （テクスチャは明暗だけを足し、地の色を動かすな）。こちらは**写真を意図して
 *   パレットへ入れる**別の操作で、**色が動くことが目的**。
 *   ―― どちらの規則を当てるかは「**色を動かすつもりがあるか**」で決まる。
 */
const DUOTONE_CONTRAST = 1.12;   // ★目盛りの外（写真の調子）
/**
 * ★★★**白い紙の券では、影の極をドメインの色の「暗い側」から作る**。
 *   色そのものを影に使うと、いちばん暗い所がその色の明るさ（0.44〜0.66）で
 *   止まり、**写真が暗くなれない**（実測で「淡い靄」にしかならなかった）。
 * ★★★**掛け算で暗くする**（`deepen`）。`lib/helpers.ts` の `shade()` は
 *   チャンネルに同じ数を足し引きするので、**色相が飛ぶ** ―― 実測 …
 *   朱 → 純赤 `#7F0000`／緑 → 純緑 `#004200`。新しい色を足さないためには
 *   **比を保つ**必要がある。
 */
const DUOTONE_DEEP = 0.55;   // ★目盛りの外（影の極の深さ）

/** 16進 → 0〜1 の3チャンネル。★フィルタの `tableValues` に渡す。 */
const channels = (hex: string): [number, number, number] => {
  const n = hex.replace("#", "");
  const v = (i: number) => parseInt(n.slice(i * 2, i * 2 + 2), 16) / 255;
  return [v(0), v(1), v(2)];
};

export function Photo({ src, shade: pole, style }: {
  src: string;
  /** 影の極。★渡さなければ紙から導く。 */
  shade?: string;
  style?: React.CSSProperties;
}) {
  const skin = useSkin();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const lo = channels(pole ?? (skin.stock === PAPER ? deepen(skin.accent, DUOTONE_DEEP) : skin.stock));
  const hi = channels(PAPER);
  return (
    <div aria-hidden style={{
      flex: "1 1 auto", minHeight: `${PHOTO_MIN}%`, position: "relative", zIndex: 2,
      overflow: "hidden", ...style,
    }}>
      <svg width="0" height="0" focusable="false" style={{ position: "absolute" }}>
        <filter id={uid} colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={`${lo[0]} ${hi[0]}`} />
            <feFuncG type="table" tableValues={`${lo[1]} ${hi[1]}`} />
            <feFuncB type="table" tableValues={`${lo[2]} ${hi[2]}`} />
          </feComponentTransfer>
        </filter>
      </svg>
      <span style={{
        position: "absolute", inset: 0,
        backgroundImage: `url("${src}")`, backgroundSize: "cover", backgroundPosition: "center",
        filter: `contrast(${DUOTONE_CONTRAST}) url(#${uid})`,
      }} />
    </div>
  );
}

/**
 * ドメインの**平らな幾何形1つ**。
 * ★形の性格は鋏痕（`PUNCH_BY_DOMAIN`）と**そろえてある** ――
 *   弧（半円）／斜め（三角）／直角（四角）／切れ込み（十字）。形だけ差し替えないこと。
 */
export function DomainFigure({ domain, fill, line, style }: {
  domain: ItemDomain; fill: string;
  /** ★線画にする（塗らずに輪郭だけ）。写真の上の印はこちら。 */
  line?: boolean;
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
    <svg viewBox="-6 -6 112 112" aria-hidden focusable="false"
      preserveAspectRatio={line ? undefined : "none"} style={{ display: "block", ...style }}>
      <path d={d} fill={line ? "none" : fill}
        stroke={line ? fill : undefined}
        strokeWidth={line ? 9 : undefined}          /* ★目盛りの外（図形の座標系） */
        strokeLinejoin={line ? "miter" : undefined} />
    </svg>
  );
}

/**
 * ★★**写真の上に置く小さな印**（第81巡）。参照2は写真の上に白い線画を1つ置いて
 * いた ―― ユーザーが第80巡に言った「何かしらのアイコンなどワンポイント」がこれ。
 * ★デュオトーンの**ハイライト＝紙の色**なので、印は紙の色で抜く。
 * ★★★**塗らずに線で描く**（参照2も線画だった）。塗りつぶすと、四角のドメイン
 *   （ジョウホウ）が**写真に開いた穴**に見えて、意匠ではなく不具合として読まれる。
 */
export function DomainMark({ data, style }: { data: TicketData; style?: React.CSSProperties }) {
  return (
    <span aria-hidden style={{
      position: "absolute", zIndex: 3,
      left: SPACE.lg, bottom: SPACE.lg,
      width: 26, height: 26,   // ★目盛りの外（印の大きさ＝図形の座標系）
      ...style,
    }}>
      <DomainFigure domain={KIND_DOMAIN[data.kind]} fill={PAPER} line
        style={{ width: "100%", height: "100%" }} />
    </span>
  );
}

/** 写真か、無ければドメインの幾何形。★どの案も入口はここ1つ。 */
export function Figure({ data, style }: { data: TicketData; style?: React.CSSProperties }) {
  const skin = useSkin();
  if (data.image) return <Photo src={data.image} style={style} />;
  return (
    <div aria-hidden style={{
      flex: "1 1 auto", minHeight: `${PHOTO_MIN}%`, position: "relative", zIndex: 2,
      display: "flex", alignItems: "center", justifyContent: "center", ...style,
    }}>
      <DomainFigure domain={KIND_DOMAIN[data.kind]} fill={skin.accent}
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
    place: data.venue || "—",
    area: data.area,
  };
}
