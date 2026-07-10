"use client";

// アプリ全体で「バインダー」という物体の見た目・動きを1つに揃えるための
// 共通モデル。RecordsTabの棚(BinderCoverflowRow)とGoalsTabのグリッドは
// どちらもここで定義するBinder3Dを組み合わせて作られている。
//   - 表紙面(BinderCoverFace): geo(場所・日付)・media(作品)・
//     target(目標)の3種で構造そのものを変えている。geo/mediaは白い
//     下地の上部にアクセントカラーの帯を敷く「カードを集めて挟んだ
//     バインダー」の語彙(ブリーフタブの育成カードと同じ帯+ラベルの
//     構成)で、mediaだけ帯を広めに取り縦縞の下地にする。targetは帯を
//     使わず、四辺を色の枠で縁取った中に白いラベルを1枚収めた構造にし、
//     「自分で直接書いたバインダー」であることを一目で伝える。
//   - 背表紙面(BinderSpineFace)・無地の側面(BinderEdgeFace): 厚みは
//     ごく薄く、文字は一切載せない。背表紙はアクセントカラーの単色で、
//     棚に並んだ時にそこだけが色の点になる。
//   - Binder3D: 上記4面(表紙・背表紙・裏表紙・無地の側面)を厚みを持った
//     3D箱として組み立てる。表紙と裏表紙は背表紙側(左端)を軸にほんの
//     少しだけ開いた扇形になるよう回転を加えており、上から見ると
//     ハの字に開いた形になる。rotateYで表紙⇄背表紙(リング側)を連続的に
//     行き来できる。厚み(depth)は挟んでいる件数(count)から自動で決まる。
//   - BinderCoverflowRow: Binder3Dを横に並べ、中央に来たものほど表紙が
//     こちらを向くコンベア。フォーカス中の1冊の両脇は、表紙の実際の
//     外側からすぐ背表紙が詰めて並ぶよう固定の隙間だけシフトする。
//     スワイプ中は棚全体がわずかにパカッと開く一瞬のアニメーションが付く。

import { useEffect, useRef, useState, type ReactNode } from "react";
import { INK, ITEM_CARD_ASPECT, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";
import { shade } from "@/lib/helpers";
import type { MediaKindId } from "@/lib/types";

// ---- デザインコード ---------------------------------------------------------
//
// 「全体としての統一感」と「3種それぞれの個性」を同時に満たすため、
// 明示的な階層でルールを分けている。
//
//   [Lv.0 共通コード] 3種すべてが同じ土台(白背景・角丸は開く側だけ・
//   同じPunchHoles)の上に立ち、違いは「アクセント色がどれだけの面積を
//   占めるか」という1本の軸だけで表現する。target(0%=帯なし、全面が
//   自分の色)→media(58%、面積の過半)→geo(26%、細い帯)と、面積を
//   極端に振ることで「似ているけど微妙に違う」ではなく「一目で扱いが
//   違う」と伝わるようにしている(以前はmedia46%/geo32%と差が小さすぎて
//   意図的な違いに見えなかった)。
//   [Lv.1 種別コード] 面積の軸に加え、質感でも重ねて差をつける:
//   target=単色の全面塗り、media=常に縦縞の下地、geo=常に無地(縞は
//   mediaの専売にするため、geoの構図からは縞を廃止した)。
//   [Lv.2 個体コード] 種別の中でさらに1冊1冊を見分けるための軸:
//   target→goalAccentが名前のハッシュで色相を振る(目標が増えるたびに
//   色が変わる)。media→ジャンルごとに固定の色+専用の大ぶりな構図
//   (MediaShape)。geo→placeAccent/dateAccentが名前のハッシュで
//   色相・構図・細部をすべて振る。
//
// 個々の図形の語彙は、参考にしたバウハウスのポスター群に合わせて
// 「円・半円・正方形・長方形・三角形・ストライプの面」の6種類だけに
// 絞り、すべてベタ塗り(線・輪郭だけの図形は使わない)で構成する。
// 以前は同心円のリングや二重の輪といった「線で描いた円」を使っていたが、
// 参考画像はどれも面(塗り)の重なりだけで構成されており、線で縁取った
// 図形は1つも使われていなかったため、全面的に塗りの図形へ描き直した。
// ストライプは「下地が無地の時に、四角い面をストライプ地にする」という
// 使い方に限定する(参考画像のジャケット下部の縞や、四角のストライプ地
// と同じ語彙)。図形は常に大きく・気持ちよい配置で使い、小さい図形を
// 複数散らす構成もやめた(小さすぎる図形は使わない、という指摘のため)。

export type PlaneShape = "circle" | "semicircle" | "square" | "rectangle" | "triangle";
// メディアの5ジャンルは、上のPlaneShapeの語彙だけを使い、ジャンルごとに
// 図形の種類・組み合わせを変えることで見分ける(色ではなく形の違い)。
type MediaShape = "semicircle" | "triangle" | "circle" | "rectangleStack" | "circlePair";
// geoは「大きな面をひとつ、気持ちよく配置する」構図に統一。縞は
// media専用の質感として予約しているが、geoでは「下地は無地、その上に
// 四角いストライプ地の面をひとつ添える」という使い方だけを許可する
// (参考画像の「無地の下地+ストライプの四角」の語彙)。
type GeoLayout = "diagonal" | "corner" | "bars" | "stripePatch";

export type Accent =
  | { kind: "target"; color: string }
  | { kind: "media"; color: string; shape: MediaShape }
  | { kind: "geo"; color: string; layout: GeoLayout; seed: number };

// 全バインダー共通の「目標」の下地色(表紙自体は常に白なので、これは
// 背表紙の単色フォールバック(accent未指定時)としてのみ使う)。
export const GOAL_BASE = "#F7F6F2";

// 目標は行った場所・日付と同じく際限なく増えるため、固定の1色ではなく
// 名前のハッシュから色相を振る(増えるたびに色が変わる)。目標の的
// (同心円)だけは種類を問わず常に同じ図形にすることで、「図形は
// 目標という種別そのものの印」「色は個体差」という役割分担にしている。
const GOAL_HUES = ["#9C6242", "#4E6B7A", "#6B5A3E", "#5A6B4E", "#7A4E6B", "#6B4A3E", "#4E5A6B"];
export function goalAccent(seed: string): Accent {
  const h = hashString(seed);
  return { kind: "target", color: GOAL_HUES[h % GOAL_HUES.length] };
}

// メディア5ジャンルのワンポイント(図形+色)。RecordsTabの棚だけでなく、
// ExecuteTabのデモデータ(写真の無いカードの下地色)もこれを基準にした
// 色調で揃え、バインダーとカードの色が世界観として一致するようにしている。
export const MEDIA_ACCENT: Record<MediaKindId, Accent> = {
  movie: { kind: "media", shape: "semicircle", color: "#4B4C8C" },
  exhibition: { kind: "media", shape: "triangle", color: "#3E7A82" },
  live: { kind: "media", shape: "circle", color: "#8C4A72" },
  book: { kind: "media", shape: "rectangleStack", color: "#4C7A5C" },
  album: { kind: "media", shape: "circlePair", color: "#8C8A3E" },
};

// PlaneShapeのベタ塗り単図形。半円は「アーチ(丸みが上)」の向きに統一
// している(参考画像の日の出/アーチのモチーフに合わせた)。
function PlaneGlyph({ shape, color, size }: { shape: PlaneShape; color: string; size: number }) {
  switch (shape) {
    case "circle":
      return <div style={{ width: size, height: size, borderRadius: "50%", background: color }} />;
    case "semicircle":
      return <div style={{ width: size, height: size / 2, background: color, borderRadius: `${size}px ${size}px 0 0` }} />;
    case "square":
      return <div style={{ width: size, height: size, background: color }} />;
    case "rectangle":
      return <div style={{ width: size * 1.5, height: size * 0.75, background: color }} />;
    case "triangle":
      return <div style={{ width: size, height: size, background: color, clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }} />;
  }
}

// 的のエンブレムだった線描きの同心円は、参考画像がどれも線ではなく面の
// 重なりだけで構成されていたことを踏まえてベタ塗りの大きな円へ描き直した。
// 目標は表紙全面が自分の色になるため、その上に白(PAPER)の円をひとつ、
// ど真ん中ではなく上端からわずかにはみ出す位置に大きく置くことで、
// 参考画像(黄色い面の上に赤いテクスチャの円が縁を跨いで乗る構図)と
// 同じ「面の重なり」の語彙にしている。
function TargetMotif({ color = PAPER }: { color?: string }) {
  // 表紙全体(inset:0のカード)を基準に配置する。上部の帯用スペーサーの
  // 中に収めようとすると、円の直径がスペーサーの高さより大きくなる
  // ケースで意図した「上端を跨いではみ出す」比率がスペーサー基準の
  // 相対値に埋もれてしまい、ほぼ中央に収まった円にしか見えなかった。
  // カード全体基準にすることで、直径・はみ出し量ともに狙った比率で
  // 安定して表示される。
  return (
    <div style={{ position: "absolute", left: "50%", top: "-11%", transform: "translateX(-50%)", width: "56%", aspectRatio: "1 / 1", borderRadius: "50%", background: color }} />
  );
}

// メディア5ジャンル専用の、PlaneShapeの語彙だけで組んだ大ぶりな構図。
// rectangleStack/circlePairは「同じ図形を複数重ねる/積む」ことで、
// 単図形よりも面積とリズムを持たせている(参考画像の、同じ丸や半円を
// 並べて構成するグリッドポスターと同じ考え方)。
function MediaGlyph({ shape, color, size }: { shape: MediaShape; color: string; size: number }) {
  if (shape === "rectangleStack") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: size * 0.12, alignItems: "flex-end" }}>
        {[1, 0.66, 0.84].map((w, i) => (
          <div key={i} style={{ width: size * w, height: size * 0.26, background: color }} />
        ))}
      </div>
    );
  }
  if (shape === "circlePair") {
    const r = size * 0.72;
    return (
      <div style={{ position: "relative", width: r * 1.55, height: r }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: r, height: r, borderRadius: "50%", background: color }} />
        <div style={{ position: "absolute", right: 0, top: 0, width: r, height: r, borderRadius: "50%", background: color, opacity: 0.62 }} />
      </div>
    );
  }
  return <PlaneGlyph shape={shape} color={color} size={size} />;
}

// メディア用: 縦縞の帯地(BinderCoverFace側で敷く)を共通の下地ルールに
// し、その上に大ぶりな構図をひとつだけ、ど真ん中を避けて右下寄りに置く。
// 「縦縞の下地+右下に大ぶりな図形」という配置のルールそのものを5ジャンル
// 共通にすることで、色も図形も違ってよい代わりに家族らしさが伝わるように
// している。
function MediaMotif({ shape }: { shape: MediaShape }) {
  return (
    <div style={{ position: "absolute", right: "9%", bottom: "8%" }}>
      <MediaGlyph shape={shape} color={PAPER} size={60} />
    </div>
  );
}

// 際限なく増える種類(場所・日付)専用。4つの構図から1つをハッシュで
// 選び、角度・本数などの細部もハッシュで振ることで、同じ色相が重なって
// も構図や細部の違いで個体を見分けられるようにしている。全レイアウトを
// 「大きな面をひとつ、気持ちよく配置する」(diagonal/corner/stripePatch)
// か「同じ形の帯を複数並べる」(bars)のどちらかに統一し、小さい図形が
// ぽつんと1つだけ浮く構成は作らない。
function GeoMotif({ color, layout, seed }: { color: string; layout: GeoLayout; seed: number }) {
  const light = shade(color, 30);
  const dark = shade(color, -16);

  if (layout === "diagonal") {
    // 大きな三角形の面を斜めに配置する。以前はlinear-gradientで斜めの
    // 色境界を作っていたが、境界がぼやけた「にじみ」に見えがちだった
    // ため、clip-pathで角がくっきりした本物の三角形の面にした。
    const corner = (seed >> 2) % 4;
    const clipPaths = [
      "polygon(0 0, 100% 0, 0 100%)",
      "polygon(100% 0, 100% 100%, 0 0)",
      "polygon(100% 100%, 0 100%, 100% 0)",
      "polygon(0 100%, 0 0, 100% 100%)",
    ];
    return (
      <div style={{ position: "absolute", inset: 0, background: color }}>
        <div style={{ position: "absolute", inset: 0, background: light, clipPath: clipPaths[corner] }} />
      </div>
    );
  }
  if (layout === "corner") {
    const fromLeft = (seed >> 2) % 2 === 0;
    const size = 68 + (seed % 40);
    return (
      <div style={{ position: "absolute", inset: 0, background: color, overflow: "hidden" }}>
        <div style={{
          position: "absolute", bottom: `-${size * 0.35}%`, [fromLeft ? "left" : "right"]: `-${size * 0.35}%`,
          width: `${size}%`, aspectRatio: "1 / 1", borderRadius: "50%", background: light,
        }} />
      </div>
    );
  }
  if (layout === "stripePatch") {
    // 下地は無地のまま、四角い面だけをストライプ地にして片側に添える。
    // 「下地が無地の時は、四角の面をストライプにすると可愛い」という
    // 語彙をそのまま採用した構図。
    const fromRight = (seed >> 3) % 2 === 0;
    const patchWidth = 42 + (seed % 22);
    return (
      <div style={{ position: "absolute", inset: 0, background: color }}>
        <div style={{
          position: "absolute", top: 0, bottom: 0, [fromRight ? "right" : "left"]: 0, width: `${patchWidth}%`,
          background: `repeating-linear-gradient(90deg, ${light} 0, ${light} 7px, ${color} 7px, ${color} 14px)`,
        }} />
      </div>
    );
  }
  // bars: 同じ幅の帯を並べた、北欧のテキスタイルのような構図。
  const barCount = 3 + (seed % 3);
  return (
    <div style={{ position: "absolute", inset: 0, background: color, display: "flex", alignItems: "flex-end", gap: "7%", padding: "18% 16%" }}>
      {Array.from({ length: barCount }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: `${28 + ((seed >> (i * 2)) % 4) * 16}%`, background: i % 2 ? light : dark }} />
      ))}
    </div>
  );
}

function AccentMotif({ accent }: { accent: Accent }) {
  if (accent.kind === "target") return <TargetMotif />;
  if (accent.kind === "media") return <MediaMotif shape={accent.shape} />;
  return <GeoMotif color={accent.color} layout={accent.layout} seed={accent.seed} />;
}

// 文字列から安定したハッシュ値を作る(同じ名前なら常に同じ柄になる)。
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const GEO_LAYOUTS: GeoLayout[] = ["diagonal", "corner", "bars", "stripePatch"];

// 行った場所(エリア)は際限なく増えるため固定色を割り当てず、名前の
// ハッシュから色相・構図・細部をすべて決める。同じ色相のエリアが
// 出てきても、構図や角度/本数が違うので1冊1冊に個性が出る。
const PLACE_HUES = ["#3E6B7A", "#6B5A3E", "#4E6B4A", "#6B3E5A", "#3E5A6B", "#5A4A6B", "#4A6B5A", "#6B4A3E"];
export function placeAccent(seed: string): Accent {
  const h = hashString(seed);
  return { kind: "geo", color: PLACE_HUES[h % PLACE_HUES.length], layout: GEO_LAYOUTS[(h >> 4) % GEO_LAYOUTS.length], seed: h };
}

// 日付ビューの各日も同様に無限に増える。場所とは別の色相セットにして、
// 隣り合っても混同しないようにしている。
const DATE_HUES = ["#5A5A4E", "#4E5A5A", "#5A4E5A", "#4E5A4E", "#5A4E4E", "#4E4E5A"];
export function dateAccent(seed: string): Accent {
  const h = hashString(seed);
  return { kind: "geo", color: DATE_HUES[h % DATE_HUES.length], layout: GEO_LAYOUTS[(h >> 6) % GEO_LAYOUTS.length], seed: h };
}

// ---- 表紙面・背表紙面・無地の側面・裏表紙 -----------------------------------

interface CoverContent {
  color: string;
  eyebrowLabel?: string;
  title: string;
  footer?: ReactNode;
  accent?: Accent;
}

export const COVER_RADIUS = 12;
// geo(場所・日付)の帯の高さ。3種の中でもっとも細い帯にし、mediaの帯
// (下記MEDIA_BAND)との差を極端にすることで「面積の違い」がひと目で
// 意図的だとわかるようにしている(以前は32%/46%程度の差しかなく、
// 微妙すぎて逆に不自然に見えていた)。
const GEO_BAND = "26%";
// mediaの帯の高さ。面積で過半を占めるくらい大きく取り、常に縦縞の
// 下地にすることで、geoの細い無地の帯とは質感・面積の両方で対極になる
// ようにしている。
const MEDIA_BAND = "58%";

// 表紙下部(エイボロウ+タイトル+フッター)。3種で構成そのものは完全に
// 共通にし、文字色だけ呼び出し側で選べるようにしている(targetは表紙
// 全面が自分の色になるため、白系の文字色を渡す)。
function CoverBody({ eyebrowLabel, title, footer, accentColor, titleColor = INK }: {
  eyebrowLabel?: string; title: string; footer?: ReactNode; accentColor: string; titleColor?: string;
}) {
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: "12px 14px 12px" }}>
      {eyebrowLabel && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7, flexShrink: 0 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: accentColor, flexShrink: 0 }} />
          <span style={{ fontSize: 9, letterSpacing: "0.12em", color: accentColor, fontWeight: 700 }}>{eyebrowLabel}</span>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "flex-end" }}>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 14.5, lineHeight: 1.3, color: titleColor, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
      </div>
      {footer && <div style={{ marginTop: 8, flexShrink: 0 }}>{footer}</div>}
    </div>
  );
}

// 表紙面。デザインコードは3階層:
//   [Lv.0 共通] 白背景・開く側だけ角丸・同じPunchHoles、という土台は
//   3種とも共通。違いは「アクセント色がどれだけの面積を占めるか」の
//   1本の軸: target(全面=100%)→media(58%の帯)→geo(26%の帯)と極端に
//   振ることで、一目で扱いの違いがわかるようにしている。
//   [Lv.1 種別] 面積に加え質感でも重ねる: media=常に縦縞の下地、
//   geo=常に無地(縞はmedia専用として予約)、target=単色べた塗り。
//   [Lv.2 個体] target=goalAccentが名前のハッシュで色相を振る、
//   media=ジャンルごとの固定色+専用の大ぶりな図形、geo=名前のハッシュ
//   で色相・構図・細部を振る。
export function BinderCoverFace({ eyebrowLabel, title, footer, accent }: CoverContent) {
  const accentColor = accent?.color ?? INK;

  if (accent?.kind === "target") {
    // 「自分で直接書いたバインダー」であることを、帯+白地というカードの
    // 語彙を一切使わない全面べた塗りのシンプルな1枚として伝える。以前は
    // 白い内側パネルを額装するように重ねていたが、二重の箱が「ダサい」
    // という指摘につながっていたため撤廃し、最も単純な1枚の色面にした。
    const light = "rgba(253,251,245,0.85)";
    return (
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: accent.color, overflow: "hidden",
        borderTopRightRadius: COVER_RADIUS, borderBottomRightRadius: COVER_RADIUS,
      }}>
        <div style={{ flex: "0 0 34%", flexShrink: 0 }} />
        <CoverBody eyebrowLabel={eyebrowLabel} title={title} footer={footer} accentColor={light} titleColor={PAPER} />
        <TargetMotif color={PAPER} />
      </div>
    );
  }

  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: PAPER, overflow: "hidden",
      borderTopRightRadius: COVER_RADIUS, borderBottomRightRadius: COVER_RADIUS,
    }}>
      {accent && (
        <div style={{
          flex: `0 0 ${accent.kind === "media" ? MEDIA_BAND : GEO_BAND}`, position: "relative", overflow: "hidden", flexShrink: 0,
          background: accent.kind === "media"
            ? `repeating-linear-gradient(90deg, ${accent.color} 0, ${accent.color} 7px, ${shade(accent.color, 24)} 7px, ${shade(accent.color, 24)} 14px)`
            : accent.color,
        }}>
          <AccentMotif accent={accent} />
        </div>
      )}
      <CoverBody eyebrowLabel={eyebrowLabel} title={title} footer={footer} accentColor={accentColor} />
    </div>
  );
}

// 背表紙面(リング側=バインダーの左端)。厚みがごく薄いため、タイトル
// 文字は載せない。表紙で使った3種類の構造ルール(geo=帯の斜め縞、
// media=縦縞、target=単色の枠)を背表紙でもそのまま踏襲することで、
// 棚に並んで背表紙しか見えない状態でも扱いの違いが伝わるようにしている。
function BinderSpineFace({ accent }: { accent: Accent }) {
  if (accent.kind === "geo") {
    const light = shade(accent.color, 30);
    const angle = 20 + (accent.seed % 50);
    return (
      <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(${angle}deg, ${accent.color} 0, ${accent.color} 10px, ${light} 10px, ${light} 18px)` }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(255,255,255,0.12), rgba(0,0,0,0.14))" }} />
      </div>
    );
  }
  if (accent.kind === "media") {
    const light = shade(accent.color, 24);
    return (
      <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(90deg, ${accent.color} 0, ${accent.color} 4px, ${light} 4px, ${light} 8px)` }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(255,255,255,0.12), rgba(0,0,0,0.14))" }} />
      </div>
    );
  }
  return (
    <div style={{ position: "absolute", inset: 0, background: accent.color }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(255,255,255,0.16), rgba(0,0,0,0.1))" }} />
    </div>
  );
}

// 無地の側面(リングの反対側=バインダーの右端=開く側)。表紙が背表紙を
// 軸にわずかに開くため、ここは奥まった隙間の陰として見える程度でよく、
// 特定の色を持たせず影のグラデーションだけにしている。
function BinderEdgeFace() {
  return <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,0.18), rgba(0,0,0,0.04))" }} />;
}

// 裏表紙(表紙面の真裏)。実物のバインダーと同じく無地。表紙側の角丸(右端)
// とは逆に、こちらはローカル座標の左端が世界座標の開く側(右)にあたるため
// 左端を丸めている(詳細はBinder3Dのコメント参照)。
function BinderBackCoverFace() {
  return <div style={{ position: "absolute", inset: 0, background: PAPER, borderTopLeftRadius: COVER_RADIUS, borderBottomLeftRadius: COVER_RADIUS }} />;
}

// ---- 3D箱としてのバインダー ------------------------------------------------

// rotateYが0(表紙が正面)から離れるほど、遠いものは側面側の角度へ寄せる。
// dは中心からの符号付き距離(コンベア上の位置)で、大きさ(絶対値)だけを
// 元に角度を計算する。符号(左右どちら向きに回すか)は呼び出し側で決める。
export function binderTiltAngle(d: number, rest = 80, focused = 0) {
  const amt = Math.max(0, 1 - Math.min(1, Math.abs(d)));
  return rest - (rest - focused) * amt;
}

// 静止時に表紙が背表紙側を軸にわずかに開いている角度(上から見ると扇形)。
// 厚みがごく薄いため、角度を大きくしすぎると開いた側の辺が厚み以上に
// 迫り出し、面と面の間に隙間(背景が透けて見える穴)ができてしまう。
// 厚みに対してつり合う程度のごく小さい値に留めている。
const OPEN_DEG_REST = 2;
// スワイプ中に一瞬だけ開きを強める角度(パカッとめくれる演出)。
const OPEN_DEG_ACTIVE = 6;
const HINGE_TRANSITION = "transform 260ms cubic-bezier(0.34,1.56,0.64,1)";

// 角丸を持つ白い箱として、表紙・背表紙(リング側)・裏表紙・無地の側面
// (開く側)の4面を組み立てる。rotateYが0度→90度→180度→270度(=-90度)と
// 回るにつれ、表紙→背表紙→裏表紙→無地の側面→(元の表紙に戻る)の順に
// 正面を向く(同じ軸のrotateYは足し算で合成されるため、各面のローカル
// 回転+外側のrotateYの合計が-90〜90度の範囲に入っている時だけ
// backface-visibilityにより正しく見える)。
//
// 表紙・裏表紙は、それぞれ背表紙側の辺(=蝶番)を軸にopenDeg分だけ
// 逆向きに回転させ、閉じた箱ではなく上から見て扇形に開いた形にしている。
// 表紙は translateZ の後に transform-origin を左端(0%)にしてrotateYを
// 足すだけで蝶番の辺が固定される。裏表紙は180度回転で自身のローカル
// 右端が世界座標の左端(蝶番の位置、z=-depth/2)へ移るため、外側に
// もう1枚ラッパーを重ね、そのtransform-originのz成分をdepth/2ぶん
// ずらすことで蝶番の位置に正しく一致させている。
//
// 厚み(depth)は明示的に渡さなければ挟んでいる件数(count)から自動的に
// 太く/細くなる。scaleは棚(BinderCoverflowRow)で中央に来たものだけを
// その場でひとまわり大きく見せるための上乗せで、レイアウト上の幅
// (width)自体は変えない。transformOriginを底辺中央にしているのは、
// 回転・拡大の中心を中央のままにするとscaleが変わるたびに上端だけでなく
// 下端も動いてしまい、スワイプ中に本棚全体が上下にガクガク揺れて見える
// 不具合があったため。棚に本の底が固定されているのと同じように、常に
// 下端を基準に伸び縮みさせる。
export function Binder3D({ width, aspect = ITEM_CARD_ASPECT, depth, rotateY, scale = 1, transitionMs, color, eyebrowLabel, title, footer, count, accent, openDeg = OPEN_DEG_REST, onClick }: CoverContent & {
  width: number | string;
  aspect?: string;
  depth?: number;
  rotateY: number;
  scale?: number;
  transitionMs?: number;
  count?: number;
  openDeg?: number;
  onClick?: () => void;
}) {
  const resolvedDepth = depth ?? Math.max(5, Math.min(14, 6 + (count ?? 0) * 0.5));
  const spineAccent: Accent = accent ?? { kind: "target", color };
  return (
    <div onClick={onClick} style={{ width, aspectRatio: aspect, perspective: 900, cursor: onClick ? "pointer" : "default" }}>
      <div style={{
        position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transformOrigin: "50% 100%",
        transform: `scale(${scale}) rotateY(${rotateY}deg)`,
        transition: transitionMs ? `transform ${transitionMs}ms cubic-bezier(0.22,0.9,0.32,1)` : "none",
      }}>
        {/* 表紙面(正面) */}
        <div style={{
          position: "absolute", inset: 0, overflow: "hidden", boxShadow: SOFT_SHADOW,
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
          transformOrigin: "0% 50%",
          transform: `translateZ(${resolvedDepth / 2}px) rotateY(${-openDeg}deg)`,
          transition: HINGE_TRANSITION,
        }}>
          <BinderCoverFace color={color} eyebrowLabel={eyebrowLabel} title={title} footer={footer} accent={accent} />
        </div>
        {/* 背表紙面(左端=リング側=蝶番) */}
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: resolvedDepth, overflow: "hidden",
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: `rotateY(-90deg) translateZ(${resolvedDepth / 2}px)`,
        }}>
          <BinderSpineFace accent={spineAccent} />
        </div>
        {/* 無地の側面(右端=リングの反対側=開く側) */}
        <div style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: resolvedDepth, overflow: "hidden",
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: `rotateY(90deg) translateZ(${resolvedDepth / 2}px)`,
        }}>
          <BinderEdgeFace />
        </div>
        {/* 裏表紙(表紙の真裏)。蝶番位置に合わせたラッパーで開き角を加える。 */}
        <div style={{
          position: "absolute", inset: 0, transformStyle: "preserve-3d",
          transformOrigin: `0% 50% ${-resolvedDepth / 2}px`,
          transform: `rotateY(${openDeg}deg)`,
          transition: HINGE_TRANSITION,
        }}>
          <div style={{
            position: "absolute", inset: 0, overflow: "hidden",
            backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: `rotateY(180deg) translateZ(${resolvedDepth / 2}px)`,
          }}>
            <BinderBackCoverFace />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- コンベア状の棚(RecordsTab) -------------------------------------------

export interface BinderShelfItem extends CoverContent {
  key: string;
  count?: number;
  onOpen: () => void;
}

// フォーカスした本を手前に迫り出させる量。控えめな値に絞っている。
const ROW_FOCUS_SCALE = 0.04;

// 中心より右側の本を回す静止角。90度(背表紙が真正面)より少しだけ多く
// 回すことで、裏表紙がわずかに覗く(実際の棚を正面から見た時、右にある
// 本ほど裏表紙が見えるのと同じ理屈)。
const REST_RIGHT = 98;
// 中心より左側の本を回す静止角。90度より少しだけ小さく留めることで、
// 表紙がわずかに多めに覗く(左にある本ほど表紙が見えるのと同じ理屈)。
const REST_LEFT = 70;

// ネイティブの横スクロール+スナップを使うことで、「タップ」と「スワイプで
// 送る」の判定をブラウザの標準挙動に任せられる。スクロール位置から各
// アイテムの中心からの距離を算出し、Binder3Dのrotateyへ直接反映する。
// scrollイベントはrequestAnimationFrameで1フレームに1回へ間引き、
// 更新が飛び飛びになったり過剰に再描画されたりしないようにしている。
//
// 「本の見た目サイズ(itemWidth)」と「棚に並ぶピッチ(pitch)」をあえて
// 分離している: 本棚では1冊1冊の表紙は大きくても、並んでいる時に見える
// のはほぼ背表紙の薄い幅だけなので、ピッチ自体はその薄さに合わせて詰める。
// DOM上の各スロットはpitch幅の空箱にし、その中央にitemWidth幅のBinder3Dを
// 絶対配置で重ねて迫り出させることで、「表紙は大きいのに本棚としては
// ぎっしり詰まっている」という実物の本棚に近い密度を再現している。
// フォーカス中の本の両隣より先(|d|>=1)は、フォーカス中の表紙の実際の
// 右端/左端のすぐ外側から始まる固定の隙間(gap)だけシフトし、そこから
// 先は元のpitchのまま詰めて並べる(距離に比例して隙間が広がり続ける
// わけではない)。
export function BinderCoverflowRow({ items, itemWidth = 172, pitch = 46, aspect = ITEM_CARD_ASPECT }: {
  items: BinderShelfItem[];
  itemWidth?: number;
  pitch?: number;
  aspect?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [flap, setFlap] = useState(false);
  const centerRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const flapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const step = pitch;

  // 初回描画の瞬間はまだ実測前でcontainerWidth=0のため、両端の余白
  // (sidePad)も0として最初のレイアウトが組まれる。ResizeObserverが実際の
  // 幅を報告した直後にsidePadが正しい値へ変わると、scrollLeft自体は0の
  // ままでも「0の時に中央に来るはずの1冊目」の見た目上の位置が前後の
  // 余白ぶんだけズレる。棚ごとにこの実測タイミングが微妙に前後するため、
  // 記録タブを開いた瞬間、行によって1冊目の初期位置が揃わずバラバラに
  // 見える不具合があった。実測直後に明示的にscrollLeftを0へ入れ直すことで、
  // 正しいsidePadを反映した状態で必ず先頭が中央に来るよう強制する。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) {
        setContainerWidth(w);
        el.scrollLeft = 0;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (flapTimeoutRef.current) clearTimeout(flapTimeoutRef.current);
  }, []);

  const onScroll = () => {
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const el = scrollRef.current;
        if (!el) return;
        centerRef.current = el.scrollLeft / step;
        setTick((t) => t + 1);
      });
    }
    setFlap(true);
    if (flapTimeoutRef.current) clearTimeout(flapTimeoutRef.current);
    flapTimeoutRef.current = setTimeout(() => setFlap(false), 180);
  };

  const sidePad = Math.max(0, (containerWidth - pitch) / 2);
  const [aspNum, aspDen] = aspect.split("/").map((s) => parseFloat(s.trim()));
  const itemHeight = itemWidth * (aspDen / aspNum);
  const topPad = Math.ceil(itemHeight * ROW_FOCUS_SCALE) + 22;
  // フォーカス中の表紙の実際の半幅(拡大込み)から、隣のスロット自身の
  // 半幅を差し引き、余裕(隙間+背表紙の最大想定幅)を足した値。これだけ
  // 両隣をシフトすれば、表紙の外側ぴったりから背表紙の列が始まる。
  const coverHalfWidth = (itemWidth * (1 + ROW_FOCUS_SCALE)) / 2;
  const gap = Math.max(0, coverHalfWidth - pitch / 2) + 26;

  return (
    <div
      ref={scrollRef} onScroll={onScroll} className="no-scrollbar"
      style={{ display: "flex", alignItems: "flex-end", overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", padding: `${topPad}px 0 14px` }}
    >
      <div style={{ flex: "0 0 auto", width: sidePad }} />
      {items.map((it, i) => {
        const d = i - centerRef.current;
        // 左右どちらの隣も背表紙(リング側、ラベルが読める面)が正面を
        // 向くのは共通だが、静止角は左右で非対称にしている: 右側は90度を
        // 少し超えて裏表紙がわずかに覗き、左側は90度に届く前で止めて
        // 表紙がわずかに多めに覗く。実際に棚を正面から見た時の収束する
        // パースを再現している。
        const angle = d >= 0 ? binderTiltAngle(d, REST_RIGHT) : binderTiltAngle(-d, REST_LEFT);
        const focus = Math.max(0, 1 - Math.min(1, Math.abs(d)));
        const scale = 1 + focus * ROW_FOCUS_SCALE;
        // フォーカス中(d=0)は0、|d|>=1では固定のgapだけシフトし、その間は
        // 滑らかに補間する。
        const spread = gap * Math.max(-1, Math.min(1, d));
        // Binder3DにtransitionMsを渡さない(=CSSトランジション無し)のは
        // 意図的。スクロールスナップがmandatoryのため、指を離すとブラウザ
        // 自身が滑らかなスナップアニメーションでscrollLeftを動かす。そこに
        // さらにCSSトランジションを重ねると、rotateY/scaleの目標値が毎フレーム
        // 変わり続けるものを90msかけて追いかける形になり、ネイティブの
        // スナップに対して常に半歩遅れて「ガクッ」と収束するように見える
        // 不具合があった。rAFで1フレームごとに値を更新しているのでこれ
        // だけで十分滑らかに追従する。
        return (
          <div key={it.key} style={{
            position: "relative", flex: "0 0 auto", width: pitch, height: itemHeight, scrollSnapAlign: "center", zIndex: Math.round(focus * 100),
            animation: "binder-in 0.46s cubic-bezier(0.22,0.9,0.32,1) both", animationDelay: `${Math.min(i, 12) * 26}ms`,
          }}>
            <div style={{ position: "absolute", left: "50%", bottom: 0, width: itemWidth, transform: `translateX(calc(-50% + ${spread}px))` }}>
              <Binder3D
                width={itemWidth} aspect={aspect} rotateY={angle} scale={scale}
                openDeg={flap ? OPEN_DEG_ACTIVE : OPEN_DEG_REST}
                color={it.color} eyebrowLabel={it.eyebrowLabel} accent={it.accent}
                title={it.title} count={it.count} onClick={it.onOpen}
              />
            </div>
          </div>
        );
      })}
      <div style={{ flex: "0 0 auto", width: sidePad }} />
    </div>
  );
}
