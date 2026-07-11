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
import type { ItemKind } from "@/lib/types";

// ---- デザインコード ---------------------------------------------------------
//
// 「全体としての統一感」と「3種それぞれの個性」を同時に満たすため、
// 明示的な階層でルールを分けている。
//
//   [Lv.0 共通コード] 3種すべてが同じ土台(白背景・角丸は開く側だけ・
//   同じPunchHoles・グリッドに沿った図形配置)の上に立つ。「アクセント
//   色がどれだけの面積を占めるか」の1本の軸で扱いの違いを表す点は
//   従来通りだが、向きを一度反転させている: target(0%=帯なし、全面が
//   自分の色)は変わらず最大。media/geoは「メディアは種類が5つで増えない
//   ので簡素に、行った場所は際限なく増えて1冊ごとの個性が主役なので
//   賑やかに」という指摘を受け、media=26%(細い帯・図形ひとつだけ)、
//   geo=58%(広い帯・グリッドで複数図形を組む)へ入れ替えた。
//   [Lv.1 種別コード] 面積の軸に加え、質感でも重ねて差をつける:
//   target=単色の全面塗り、media=常に縦縞の下地+図形ひとつだけ、
//   geo=常に無地の下地+2x2グリッドで複数図形を組む「凝った」構成。
//   [Lv.2 個体コード] 種別の中でさらに1冊1冊を見分けるための軸:
//   target→goalAccentが名前のハッシュで色相を振る。media→ジャンルごとに
//   固定の色+専用の図形。geo→placeAccent/dateAccentが名前のハッシュで
//   色相・構図・グリッドの中身をすべて振る。
//
// 個々の図形の語彙は、参考にしたバウハウスのポスター群に合わせて
// 「円・半円(上向き/下向き)・四半円(4方向)・三角形(上向き/下向き)・
// 長方形・ストライプの面」だけに絞り、すべてベタ塗り(線・輪郭だけの
// 図形は使わない)で構成する。
//
// 図形が「グリッドに乗っていない」ことが統一感のなさの本質だった、
// という指摘を受け、「アクセント帯の高さを1辺とする正方形」を最小の
// グリッド単位(セル)とし、図形はこのセル(またはセルを束ねた正方形の
// 領域)の中だけで完結させる設計にした。セルは必ず正方形になるよう
// flexboxのaspect-ratioで強制しているため、帯がどんな横長比率でも
// 円・半円・四半円が引き伸ばされて「丸でも四角でもない」歪んだ形に
// なることがない(以前はセルの縦横比を無視して図形を敷き詰めていたため、
// 特に帯が細いメディアで顕著に歪んでいた)。
//
// ただし「1セルに必ず1図形」というルールではない。無地のセル(色面
// だけ)があってもよいし、帯全体を1つのセルとして大きな図形ひとつだけ
// を置いてもよいし、何も置かずストライプの下地だけで終わってもよい。
// 図形の端部や中心といった「意味のある部分」がセルの境界に乗っていれば
// よい、というゆるやかな基準でグリッドを捉えている。
// 角度は0度・45度・90度・180度だけを使う(円は例外)。「揃えるなら
// 揃える、揃えないなら揃えない」を徹底し、図形のサイズや帯の幅を
// ハッシュで連続的に微妙に揺らすことはしない(揺らすのは「どのセルに
// 何を置くか」という離散的な組み合わせだけ)。

export type PlaneShape =
  | "circle" | "semicircleUp" | "semicircleDown"
  | "quarterTL" | "quarterTR" | "quarterBL" | "quarterBR"
  | "triangleUp" | "triangleDown" | "rectangle";

// 正方形のセルの中だけで完結する、ベタ塗りの単図形。circle/semicircle/
// quarterは必ずSquareCell(下記)の中で使うことで、常に真円ベースの
// 正しい比率になる(border-radiusのパーセント指定は箱が正方形でないと
// 楕円になってしまうため、半円・四半円は固定pxの大きな半径を指定して
// 箱の短辺いっぱいでクランプさせることで、箱の縦横比によらず常に真円
// ベースの弧になるようにしている)。
function PlaneFill({ shape, color }: { shape: PlaneShape; color: string }) {
  switch (shape) {
    case "circle":
      return <div style={{ position: "absolute", inset: 0, background: color, borderRadius: "50%" }} />;
    case "semicircleUp":
      return <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "50%", background: color, borderRadius: "999px 999px 0 0" }} />;
    case "semicircleDown":
      return <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "50%", background: color, borderRadius: "0 0 999px 999px" }} />;
    case "quarterTL":
      return <div style={{ position: "absolute", inset: 0, background: color, borderRadius: "0 0 999px 0" }} />;
    case "quarterTR":
      return <div style={{ position: "absolute", inset: 0, background: color, borderRadius: "0 0 0 999px" }} />;
    case "quarterBL":
      return <div style={{ position: "absolute", inset: 0, background: color, borderRadius: "0 999px 0 0" }} />;
    case "quarterBR":
      return <div style={{ position: "absolute", inset: 0, background: color, borderRadius: "999px 0 0 0" }} />;
    case "triangleUp":
      return <div style={{ position: "absolute", inset: 0, background: color, clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }} />;
    case "triangleDown":
      return <div style={{ position: "absolute", inset: 0, background: color, clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />;
    case "rectangle":
      return <div style={{ position: "absolute", inset: 0, background: color }} />;
  }
}

// 円系の図形(circle/semicircle/quarter)専用。長方形はセルの正方形制約を
// 受けなくてよいので別扱いにする。
const ROUND_SHAPES: PlaneShape[] = ["circle", "semicircleUp", "semicircleDown", "quarterTL", "quarterTR", "quarterBL", "quarterBR"];
const PLANE_SHAPES: PlaneShape[] = [...ROUND_SHAPES, "triangleUp", "triangleDown"];

// グリッドの最小単位。高さを常に100%(＝帯の高さ、または親の正方形
// ブロックの1辺)にし、aspect-ratio:1/1で幅を追従させることで、帯や
// ブロックが横長でも真の正方形になる。円系の図形はこの中でのみ使う。
function SquareCell({ shape, color }: { shape: PlaneShape; color: string }) {
  return (
    <div style={{ position: "relative", height: "100%", aspectRatio: "1 / 1", flexShrink: 0, overflow: "hidden" }}>
      <PlaneFill shape={shape} color={color} />
    </div>
  );
}

// メディアの5ジャンルは、円系の図形から1つずつ割り当て、帯の高さを
// 1辺とする正方形のセルひとつだけに敷く簡素な構成にする(メディアは
// 種類が増えないので、扱いとして最も簡素にする)。
type MediaShape = PlaneShape;
// geoは正方形のブロックを軸にした4つの構図。縞はmedia専用の質感として
// 予約する。
type GeoLayout = "bigShape" | "grid2x2" | "units" | "stripePatch";

export type Accent =
  | { kind: "target"; color: string }
  | { kind: "media"; color: string; shape: MediaShape }
  | { kind: "geo"; color: string; layout: GeoLayout; seed: number };

// 全バインダー共通の「目標」の下地色(表紙自体は常に白なので、これは
// 背表紙の単色フォールバック(accent未指定時)としてのみ使う)。
export const GOAL_BASE = "#F5EAD3";

// 目標は行った場所・日付と同じく際限なく増えるため、固定の1色ではなく
// 名前のハッシュから色相を振る(増えるたびに色が変わる)。目標の的
// (同心円)だけは種類を問わず常に同じ図形にすることで、「図形は
// 目標という種別そのものの印」「色は個体差」という役割分担にしている。
// 参考画像(生成りのクリーム地+黒・マスタード・コーラル・ティール・
// 深緑)に合わせ、寒色寄りの紫を含む配色からこの5色家族の暖色アース
// カラーへ全面的に入れ替えた。
const GOAL_HUES = ["#B8742E", "#2C6E8A", "#8A3C2A", "#3F6B45", "#6B4A2E", "#C1502E", "#4A5C3E"];
export function goalAccent(seed: string): Accent {
  const h = hashString(seed);
  return { kind: "target", color: GOAL_HUES[h % GOAL_HUES.length] };
}

// メディア5ジャンルのワンポイント(図形+色)。RecordsTabの棚だけでなく、
// ExecuteTabのデモデータ(写真の無いカードの下地色)もこれを基準にした
// 色調で揃え、バインダーとカードの色が世界観として一致するようにしている。
// 作品系のItemKindごとのワンポイント。place/thingは対象外(場所はエリア名
// からplaceAccentで、モノは固定の1冊で扱う)。
export const MEDIA_ACCENT: Partial<Record<ItemKind, Accent>> & Record<"movie" | "exhibition" | "live" | "book" | "album", Accent> = {
  movie: { kind: "media", shape: "semicircleUp", color: "#2C4E74" },
  exhibition: { kind: "media", shape: "triangleUp", color: "#2C6E7A" },
  live: { kind: "media", shape: "circle", color: "#B8442E" },
  book: { kind: "media", shape: "rectangle", color: "#33633F" },
  album: { kind: "media", shape: "semicircleDown", color: "#C1922E" },
};

// 的のエンブレムだった線描きの同心円は、参考画像がどれも線ではなく面の
// 重なりだけで構成されていたことを踏まえてベタ塗りの大きな円へ描き直した。
// 目標は表紙全面が自分の色になるため、その上に白(PAPER)の円をひとつ、
// 「直径の半分ちょうどが上端からはみ出す」という明確な比率で置く
// (中途半端な比率で「気持ち」はみ出させると、微妙にズレて見えるだけ
// になるため、はみ出す/はみ出さないをはっきりさせている)。
function TargetMotif({ color = PAPER }: { color?: string }) {
  return (
    <div style={{ position: "absolute", left: "50%", top: "-24%", transform: "translateX(-50%)", width: "64%", aspectRatio: "1 / 1", borderRadius: "50%", background: color }} />
  );
}

// メディア用: 縦縞の帯地(BinderCoverFace側で敷く)の上に、帯の高さを
// 1辺とする正方形のセルをひとつだけ端に寄せて置き、そのセルいっぱいに
// 図形を敷く。セルの外側は下地の縦縞がそのまま見える。「縦縞の下地+
// 端に正方形のセルひとつ」という配置のルールを5ジャンル共通にすることで、
// 図形自体はジャンルごとに違っても家族らしさが伝わるようにしている。
// メディアは種類が5つで増えないため、行った場所より意図して簡素にし、
// セルもひとつだけに絞っている。
function MediaMotif({ shape }: { shape: MediaShape }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end" }}>
      <SquareCell shape={shape} color={PAPER} />
    </div>
  );
}

// 際限なく増える種類(場所・日付)専用。「行った場所は柄の面積を増やして
// 凝った、楽しい見た目にしてほしい」という指摘を受けつつ、「1セルに
// 必ず1図形とは限らない」という訂正も踏まえた4構図。どれも「帯の高さを
// 1辺とする正方形ブロック」を土台にし、その中身の組み方だけを変える:
// bigShape=ブロックまるごと1つのセルとして大きな図形をひとつだけ置く
// (「4セル分を1つにまとめる」の実装)。grid2x2=同じブロックを2x2の
// 真の正方形セルへ分割し、セルごとに図形と色調をハッシュで振る(以前の
// grid4はブロックの外形自体が正方形である保証がなかったため、真の
// 正方形ブロックを分割する形に作り直した)。units=正方形の単位セルを
// 2〜3個横に並べつつ、各セルは「図形入り」か「無地の色面のまま」かを
// ハッシュのビットで決める(全セルが図形で埋まっている必要はない)。
// stripePatch=下地を無地のまま保ち、帯を半分だけストライプ地にする、
// 図形をひとつも使わない構図。ブロック以外の余白は帯自体の無地の
// アクセントカラーがそのまま見える。
const TONE_STEPS = [-26, -9, 11, 30];

function GeoMotif({ color, layout, seed }: { color: string; layout: GeoLayout; seed: number }) {
  const light = shade(color, 30);
  const dark = shade(color, -18);
  const fromRight = (seed >> 7) % 2 === 0;

  if (layout === "bigShape") {
    const shape = ROUND_SHAPES[(seed >> 4) % ROUND_SHAPES.length];
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: fromRight ? "flex-end" : "flex-start" }}>
        <div style={{ position: "relative", height: "100%", aspectRatio: "1 / 1", flexShrink: 0, background: dark, overflow: "hidden" }}>
          <PlaneFill shape={shape} color={light} />
        </div>
      </div>
    );
  }
  if (layout === "grid2x2") {
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: fromRight ? "flex-end" : "flex-start" }}>
        <div style={{ position: "relative", height: "100%", aspectRatio: "1 / 1", flexShrink: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", overflow: "hidden" }}>
          {[0, 1, 2, 3].map((i) => {
            const bg = shade(color, TONE_STEPS[(seed >> (i * 5)) % TONE_STEPS.length]);
            const fg = shade(color, TONE_STEPS[(seed >> (i * 5 + 2)) % TONE_STEPS.length]);
            const shape = PLANE_SHAPES[(seed >> (i * 5 + 4)) % PLANE_SHAPES.length];
            return (
              <div key={i} style={{ position: "relative", background: bg, overflow: "hidden" }}>
                <PlaneFill shape={shape} color={fg} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (layout === "units") {
    const count = 2 + ((seed >> 8) % 2);
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end" }}>
        {Array.from({ length: count }, (_, i) => {
          const filled = (seed >> (i * 3)) & 1;
          const tone = shade(color, TONE_STEPS[(seed >> (i * 3 + 1)) % TONE_STEPS.length]);
          if (!filled) return <div key={i} style={{ position: "relative", height: "100%", aspectRatio: "1 / 1", flexShrink: 0, background: tone }} />;
          const shape = PLANE_SHAPES[(seed >> (i * 3 + 2)) % PLANE_SHAPES.length];
          return <SquareCell key={i} shape={shape} color={shade(tone, 30)} />;
        })}
      </div>
    );
  }
  // stripePatch: 下地は無地のまま、帯をちょうど半分に割った片方だけを
  // ストライプ地にする。「下地が無地の時は、四角の面をストライプにすると
  // 可愛い」という語彙をそのまま採用した、図形をひとつも使わない構図。
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: fromRight ? "row-reverse" : "row" }}>
      <div style={{ flex: 1, background: color }} />
      <div style={{ flex: 1, background: `repeating-linear-gradient(90deg, ${light} 0, ${light} 8px, ${color} 8px, ${color} 16px)` }} />
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

const GEO_LAYOUTS: GeoLayout[] = ["bigShape", "grid2x2", "units", "stripePatch"];

// 行った場所(エリア)は際限なく増えるため固定色を割り当てず、名前の
// ハッシュから色相・構図・細部をすべて決める。同じ色相のエリアが
// 出てきても、構図や角度/本数が違うので1冊1冊に個性が出る。
const PLACE_HUES = ["#2C6E8A", "#B8742E", "#8A3C2A", "#3F6B45", "#6B4A2E", "#4A5C3E", "#C1502E", "#5A6B7A"];
export function placeAccent(seed: string): Accent {
  const h = hashString(seed);
  return { kind: "geo", color: PLACE_HUES[h % PLACE_HUES.length], layout: GEO_LAYOUTS[(h >> 4) % GEO_LAYOUTS.length], seed: h };
}

// 日付ビューの各日も同様に無限に増える。場所とは別の色相セットにして、
// 隣り合っても混同しないようにしている。
const DATE_HUES = ["#6B5A42", "#42586B", "#6B4238", "#42546B", "#5A4230", "#3E4A3A"];
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
// geo(場所・日付)の帯の高さ。行った場所は際限なく増え、1冊1冊の個性が
// 主役になるため、3種の中でもっとも広い帯を取り、2x2グリッドで複数の
// 図形を組む「凝った」見た目にしている。
const GEO_BAND = "58%";
// mediaの帯の高さ。ジャンルは5つで増えないため、扱いとして最も簡素に
// する: 帯を細くし、図形もひとつだけに絞る。以前はmedia=広い帯/geo=
// 細い帯だったが、「メディアは簡素、行った場所は賑やかに」という指摘で
// 逆転させた。
const MEDIA_BAND = "26%";

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
    // 縞の角度は45度で固定する(以前は20〜70度でハッシュから細かく
    // 振っていたが、0/45/90/180以外の中途半端な角度は「揃っていない」
    // 印象の一因だった)。個体差は縞の間隔の広さ・狭さの2段階だけで表す。
    const light = shade(accent.color, 30);
    const wide = (accent.seed >> 3) % 2 === 0;
    const step = wide ? 14 : 8;
    return (
      <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(45deg, ${accent.color} 0, ${accent.color} ${step}px, ${light} ${step}px, ${light} ${step * 2}px)` }}>
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
// 表紙面(BinderCoverFace)側は開く側の角だけ丸めているが、この面は今まで
// 角丸を持たない素の四角のままだった。表紙・背表紙・側面をそれぞれ独立
// した平面として貼り合わせて立体に見せている都合上、正面からわずかでも
// 角度が付く(GoalsTabのrotateY(-14度)など)と、表紙の丸まった角のすぐ
// 脇からこの面の四角い角が覗いてしまい、「角丸のテクスチャを四角い箱に
// 貼っただけ」という不自然な継ぎ目になっていた。この面自体にも同じ半径の
// 角丸を与え、表紙の丸みと視覚的に馴染むようにする。
function BinderEdgeFace() {
  return <div style={{ position: "absolute", inset: 0, borderRadius: COVER_RADIUS, background: "linear-gradient(90deg, rgba(0,0,0,0.18), rgba(0,0,0,0.04))" }} />;
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
// スワイプ中、速度に応じて開きを強める角度(パカッとめくれる演出)。
const OPEN_DEG_ACTIVE = 6;
// 表紙・裏表紙の開閉に使うCSSトランジションは意図的に持たない。呼び出し側
// (BinderCoverflowRow)がopenDegを毎フレームJSで連続的に計算して渡すため、
// ここでさらにCSSトランジションを重ねると「毎フレーム動き続ける目標値を
// 固定時間で追いかける」形になり、目標が動き続ける限り常に少し遅れて
// 追いつこうとし続ける(=減速が終わったあとも尾を引いて動く)不具合に
// なる。他の呼び出し元(GoalsTabなど)はopenDegをマウント後に変更しない
// ため、トランジションが無くても実害はない。

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
        {/* 表紙面(正面)。影を落とすこの箱自体にも中のBinderCoverFaceと
            同じ角丸(開く側=右のみ)を付けておく。以前はここに角丸が無く、
            中身だけが丸まっていたため、box-shadowが素の四角のまま角丸の
            外にはみ出す「角に合わない影」になっていた。 */}
        <div style={{
          position: "absolute", inset: 0, overflow: "hidden", boxShadow: SOFT_SHADOW,
          borderTopRightRadius: COVER_RADIUS, borderBottomRightRadius: COVER_RADIUS,
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
          transformOrigin: "0% 50%",
          transform: `translateZ(${resolvedDepth / 2}px) rotateY(${-openDeg}deg)`,
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
  const centerRef = useRef(0);
  const velocityRef = useRef(0);
  const openDegRef = useRef(OPEN_DEG_REST);
  const rafRef = useRef<number | null>(null);
  const lastLeftRef = useRef(0);
  const idleFramesRef = useRef(0);
  const step = pitch;

  // 初回描画の瞬間はまだ実測前でcontainerWidth=0のため、両端の余白
  // (sidePad)も0として最初のレイアウトが組まれる。ResizeObserverが実際の
  // 幅を報告した直後にscrollLeftを0へ入れ直しても、その時点ではまだ
  // Reactが新しいsidePadでDOMを更新していない(setState自体は非同期に
  // コミットされる)。古いsidePad=0のままscrollLeft=0を入れても何も
  // 変わらず、直後にReactが正しいsidePadでスペーサーを挿入すると、
  // 表示中の内容の手前に幅が増えるという変化をブラウザのスクロール
  // アンカリングが「よかれと思って」勝手に補正しようとし、その補正結果が
  // タイミング次第でブレる、というのが「開くたびに先頭の位置が揃わない」
  // 不具合の実体だった。containerWidth(=sidePadの元)がコミットされた
  // 「後」のエフェクトでscrollLeftを入れ直すことで、正しい幅のスペーサーが
  // 実際にDOMへ反映された状態を基準に必ず先頭が中央に来るよう強制し、
  // overflowAnchorも切ってブラウザ側の自動補正そのものを無効化している。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = 0;
  }, [containerWidth]);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  // scroll位置を毎フレーム(rAF)ポーリングし続けることで解決した不具合の
  // 経緯: (1)ネイティブのscroll-snapは減速の終盤、scrollイベント自体を
  // 疎にしか発火しないことがあり、イベント頼みで値を更新すると速度が
  // 落ちるほど更新が飛び飛びになって見えていた→毎フレームポーリングで解消。
  // (2)回転角(centerRef)を生のscrollLeftへ即座に同期させる形にしたが、
  // ゆっくりスワイプして指を離した直後だけガクガクと震える不具合が残った
  // →centerRefを指数関数的に追従させる形にして一度緩和した。
  // それでも次の2つが残っていた:
  //   A. ゆっくり指を動かしている「最中」でも、ほんの少し動かしただけで
  //      ガクッと挙動する。
  //   B. 表紙の開き(flap)を「動いているか否か」の2値(boolean)で判定し、
  //      trueからfalseへ切り替わった瞬間にBinder3D側のCSSトランジション
  //      (260msのバウンドする曲線)へ切り替える設計だったため、実際の
  //      速度がゼロへ滑らかに減っていくのに対し、表紙の開閉は「開いた
  //      状態」から「閉じるアニメーションの開始」へ離散的にジャンプする
  //      瞬間が必ず存在し、そこがガクッとした不安定な挙動に見えていた。
  // Aの原因は、centerRefの指数追従だけでは「今フレーム実際にどれだけ
  // 速く動いているか」という速度そのものを扱っていなかったこと。ほんの
  // 少しの移動でも、その1フレームだけを見れば(絶対量は小さくても)
  // 前フレームとの差分が閾値を超えれば即「動いた」と判定され、表紙が
  // 全開(OPEN_DEG_ACTIVE)へ向けて動き出す一方、実際の指の動きはまだ
  // ゆっくりなので数フレーム後にはまた止まって見える、という短い開閉の
  // 繰り返しがガクッとした印象になっていた。
  // Bの原因は上述の通り、boolean+CSSトランジションという「離散的な
  // 切り替え+固定時間で追いかける」設計そのものが、速度が連続的にゼロへ
  // 減っていく実際の動きと本質的に噛み合っていなかったこと。
  // 対策として、表紙の開き具合(openDeg)もcenterRefと同じく「毎フレーム
  // 連続的に計算する値」に作り替えた: このフレームで実際に動いたpx量を
  // 「速度」の瞬間値とし、それ自体も指数平滑化(velocityRef)してから、
  // OPEN_DEG_REST〜OPEN_DEG_ACTIVEの間へ連続的に写像する。booleanのflap
  // 状態そのものを廃止し、Binder3D側のCSSトランジション(HINGE_TRANSITION)
  // も外した(下記Binder3D参照)。これにより「動いている間はその速さに
  // 応じてパタパタ開き、止まるにつれて連続的に閉じていく」という、離散的な
  // 切り替わりの瞬間が存在しない挙動になり、A・Bどちらの症状も解消する。
  const SMOOTH = 0.32;
  const VELOCITY_SMOOTH = 0.3;
  // この速度(1フレームあたりの移動量、アイテム単位)以上で表紙が全開になる。
  const VELOCITY_FOR_FULL_FLAP = 0.05;
  const pollFrame = () => {
    const el = scrollRef.current;
    if (!el) { rafRef.current = null; return; }
    const left = el.scrollLeft;
    const rawCenter = left / step;
    const rawDelta = left - lastLeftRef.current;
    const scrollMoved = Math.abs(rawDelta) > 0.5;
    lastLeftRef.current = left;

    const diff = rawCenter - centerRef.current;
    const stillCatchingUp = Math.abs(diff) > 0.004;
    centerRef.current += diff * SMOOTH;

    const instVelocity = Math.abs(rawDelta) / step;
    velocityRef.current += (instVelocity - velocityRef.current) * VELOCITY_SMOOTH;
    const flapAmount = Math.min(1, velocityRef.current / VELOCITY_FOR_FULL_FLAP);
    openDegRef.current = OPEN_DEG_REST + (OPEN_DEG_ACTIVE - OPEN_DEG_REST) * flapAmount;

    setTick((t) => t + 1);
    const settled = !scrollMoved && !stillCatchingUp && velocityRef.current < 0.001;
    if (!settled) {
      idleFramesRef.current = 0;
      rafRef.current = requestAnimationFrame(pollFrame);
    } else if (idleFramesRef.current < 2) {
      idleFramesRef.current += 1;
      rafRef.current = requestAnimationFrame(pollFrame);
    } else {
      rafRef.current = null;
      centerRef.current = rawCenter;
      velocityRef.current = 0;
      openDegRef.current = OPEN_DEG_REST;
      setTick((t) => t + 1);
    }
  };
  const onScroll = () => {
    if (rafRef.current == null) {
      idleFramesRef.current = 0;
      rafRef.current = requestAnimationFrame(pollFrame);
    }
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
      style={{ display: "flex", alignItems: "flex-end", overflowX: "auto", overflowAnchor: "none", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", padding: `${topPad}px 0 14px` }}
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
                openDeg={openDegRef.current}
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
