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

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { BG, INK, ITEM_CARD_ASPECT, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";
import { haptic, shade } from "@/lib/helpers";

// ドラッグ中だけ、html全体のtouch-actionを切り替えるためのヘルパー。
// 指が棚の外へずれても、ブラウザが縦スクロール等でポインタを奪って
// ドラッグを中断(pointercancel)しないようにする(コンポーネント本体から
// document直下のグローバルを直接いじるとlintに弾かれるため関数に切り出す)。
function setRootTouchAction(value: string) {
  if (typeof document !== "undefined") document.documentElement.style.touchAction = value;
}

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
  | { kind: "geo"; color: string; layout: GeoLayout; seed: number }
  | { kind: "side"; color: string; shape: PlaneShape }
  | { kind: "stamp"; color: string };

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

// ジョウホウドメインのkindごとのワンポイント(図形+色)。RecordsTabの棚
// だけでなく、ExecuteTabのデモデータ(写真の無いカードの下地色)もこれを
// 基準にした色調で揃え、バインダーとカードの色が世界観として一致する
// ようにしている。以前はタイケンもこのマップ(media型)を間借りしていたが、
// タイケンには下記EXPERIENCE_ACCENT(side型)という専用のデザインコードを
// 新設したため、ここはジョウホウ専用に絞った。
export const MEDIA_ACCENT: Record<"movie" | "book" | "album" | "info", Accent> = {
  movie: { kind: "media", shape: "semicircleUp", color: "#2C4E74" },
  book: { kind: "media", shape: "rectangle", color: "#33633F" },
  album: { kind: "media", shape: "semicircleDown", color: "#C1922E" },
  info: { kind: "media", shape: "triangleDown", color: "#4A5C3E" },
};

// タイケン専用のデザインコード。ジョウホウ(media型: 上端の細い帯+縦縞+
// 隅寄せの図形)と全く同じ「色+図形」の割り当て方式を踏襲しつつ、器そのもの
// を「side」という新しいkindにして構造を変えている(詳細はBinderCoverFaceの
// side分岐・SideMotifのコメント参照)。「上端の細い帯」という軸を変えず
// 色や図形だけ変えると結局ジョウホウと同じ見た目になってしまうため、
// 帯の向き自体(横→縦)を変えることで一目で見分けられるようにした。
export const EXPERIENCE_ACCENT: Record<"exhibition" | "live" | "activity" | "food", Accent> = {
  exhibition: { kind: "side", shape: "triangleUp", color: "#2C6E7A" },
  live: { kind: "side", shape: "circle", color: "#B8442E" },
  activity: { kind: "side", shape: "quarterTL", color: "#7A4432" },
  // グルメは以前quarterBR(隅の四半円)だったが、同じ「隅の四半円」系統の
  // activity(quarterTL)と小さいグリッドの中では見分けにくいという指摘を
  // 受け、系統ごと変えた: 半円(semicircleUp)を隙間なく積むと、連続した
  // 半円が並ぶ構図になる(下記SideSquareCellの高さ基準サイジングにより
  // セル同士が接するため、この形が自然に連なって見える)。
  food: { kind: "side", shape: "semicircleUp", color: "#A8552F" },
};

// ExecuteTabのデモデータ生成など、ジョウホウ・タイケンを問わず種類から
// 色だけ引きたい箇所向けの結合マップ。
export const KIND_ACCENT: Record<"movie" | "exhibition" | "live" | "book" | "album" | "activity" | "food" | "info", Accent> = {
  ...MEDIA_ACCENT, ...EXPERIENCE_ACCENT,
};

// モノ専用のデザインコード。バショ・ジョウホウ・タイケンはどれも「個体
// (エリア名・kind)ごとにハッシュ/固定で色や図形が決まる」設計だが、モノは
// ユーザー指定により逆の発想にしている: 意匠は固定(下端の無地の帯だけ)で
// 個性を出さず、「何巻目か」だけを軸に色を変える。買った物が積み上がって
// THING_ITEMS_PER_VOLUMEを超えると、同じ意匠のまま色だけ変わる次の巻へ
// 自動的に分かれる(RecordsTab.tsx参照)。
const THING_VOLUME_HUES = ["#8A6B2E", "#4A5C3E", "#6B4A2E", "#2C6E8A", "#8A3C2A", "#5A6B7A"];
export function thingVolumeAccent(volumeIndex: number): Accent {
  return { kind: "stamp", color: THING_VOLUME_HUES[volumeIndex % THING_VOLUME_HUES.length] };
}
export const THING_ITEMS_PER_VOLUME = 20;

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

// モノ専用。旧版(チェックマーク・円3つの組み合わせ・横一列の図形)は
// いずれも図形を載せていたが、ユーザー指定により「下端の帯だけ、図形は
// 無し」というもっとも簡素な構成に決着した。target=全面/geo=上端の
// 広い帯/media=上端の細い帯/side=左端の帯、という他4種が必ず持つ
// 「専用の帯(ゾーン)」を、モノは「下端の帯」として持つ。帯の太さは
// ジョウホウ(media)と揃えて同じ26%(=MEDIA_BAND)にする。図形を持たない
// 分、色(巻数だけで決まるthingVolumeAccent)と帯の位置(下端)そのものが
// モノという種別の印になる。

// タイケン専用: 帯を上端ではなく左端(蝶番側)に、横向きではなく縦向きに
// 配置する。target(全面)・media(上端の細い横帯)・geo(上端の広い横帯)は
// いずれも「上端の帯、または全面」という水平の構図を軸にしているため、
// タイケンだけ帯の向きそのもの(縦)を変えることで、同じセル+図形の
// ボキャブラリーを使いながら一目で見分けがつくようにしている。図形は
// 当初「端に1つだけ」だったが、「正方形のグリッドで4〜5個縦に並べて
// ほしい」という指定を受け、同じ図形(kindごとに固定)をSIDE_MOTIF_COUNT回、
// 帯の全高に均等配置する総柄(トーテムポール状)に作り直した(下地=帯の色
// 自体は変えていない)。
// ★セルの大きさは「帯の幅」ではなく「帯の高さ ÷ 個数」を基準にしている。
// 初版は帯の幅を1辺とする正方形(width:100%+aspectRatio:1/1)をそのまま
// 4個並べていたが、帯の幅(カード幅の34%)と帯の高さ(カードの全高)の
// 比率次第では「幅基準の正方形×4個分の高さ」が実際の帯の高さをわずかに
// 超えてしまい、一番下のセルだけがバインダーの角丸(overflow:hidden)で
// 切れて見える不具合があった(実機スクショで確認: ライブの円だけ下端が
// 欠けていた)。高さを`100/個数 %`で先に確定させ、幅はそこから
// aspectRatio:1/1で導く(=高さ基準)ことで、個数×セル高さが必ずぴったり
// 帯の高さに収まることを構造的に保証する。幅が帯自体よりわずかに
// 狭くなる分は、alignItems:centerで帯の中央に揃えている。
const SIDE_MOTIF_COUNT = 4;
function SideSquareCell({ shape, color }: { shape: PlaneShape; color: string }) {
  return (
    <div style={{ position: "relative", height: `${100 / SIDE_MOTIF_COUNT}%`, aspectRatio: "1 / 1", flexShrink: 0, overflow: "hidden" }}>
      <PlaneFill shape={shape} color={color} />
    </div>
  );
}
function SideMotif({ shape }: { shape: PlaneShape }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
      {Array.from({ length: SIDE_MOTIF_COUNT }, (_, i) => (
        <SideSquareCell key={i} shape={shape} color={PAPER} />
      ))}
    </div>
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
  if (accent.kind === "geo") return <GeoMotif color={accent.color} layout={accent.layout} seed={accent.seed} />;
  // stamp/sideはBinderCoverFace側の専用分岐が自前でモチーフを描画する
  // ため、共通の帯コンテナ(このAccentMotifの呼び出し元)は経由しない。
  return null;
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
// side(タイケン)の帯の幅。高さではなく横幅の比率であることに注意
// (帯そのものが縦向きのため)。
const SIDE_BAND = "34%";

// モノ(stamp)の帯。無地ではなく、帯の高さを1辺とする正方形のセルを横一列に
// 並べ、各セルを対角線(左下→右上の反対角)で斜めに分割し、**濃い方(accent色)を
// 必ず左上の三角、薄い方(shade(color,34))を右下の三角**にする(ユーザー指定で
// 向きを全セル統一)。帯全体はまず薄い色で塗り、その上に左上三角を濃い色で
// 重ねることで実現している。帯の幅ぴったりに整数個収まるとは限らないため、
// 余るぶんは器のoverflow:hiddenで切り、タイル状に敷き詰める。
const STAMP_CHECK_COUNT = 6;
function StampCheckBand({ color }: { color: string }) {
  const light = shade(color, 34);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", overflow: "hidden" }}>
      {Array.from({ length: STAMP_CHECK_COUNT }, (_, i) => (
        <div key={i} style={{ position: "relative", height: "100%", aspectRatio: "1 / 1", flexShrink: 0, background: light }}>
          {/* 左上の三角(頂点: 左上・右上・左下)を濃い色で塗る。残り(右下三角)は
              下地の薄い色のまま。 */}
          <div style={{
            position: "absolute", inset: 0, background: color,
            clipPath: "polygon(0 0, 100% 0, 0 100%)",
          }} />
        </div>
      ))}
    </div>
  );
}

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

  // モノ専用(stamp)。上端と下端の両方に帯を置く。帯の太さはどちらも
  // ジョウホウ(media)と揃えてMEDIA_BAND(26%)。帯は無地ではなく、正方形の
  // セルを斜めに分割して片方を明るくしたチェック(市松)状のデザイン
  // (StampCheckBand、ユーザー指定)。色(巻数だけで決まるthingVolumeAccent)と
  // 上下対称の帯構成そのものがモノという種別の印になる。タイトル側は白地
  // なので、文字色はgeo/mediaと同じINK(デフォルト)のまま。
  if (accent?.kind === "stamp") {
    return (
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: PAPER, overflow: "hidden",
        borderTopRightRadius: COVER_RADIUS, borderBottomRightRadius: COVER_RADIUS,
      }}>
        <div style={{ flex: `0 0 ${MEDIA_BAND}`, position: "relative", flexShrink: 0, background: accent.color }}>
          <StampCheckBand color={accent.color} />
        </div>
        <CoverBody eyebrowLabel={eyebrowLabel} title={title} footer={footer} accentColor={accent.color} />
        <div style={{ flex: `0 0 ${MEDIA_BAND}`, position: "relative", flexShrink: 0, background: accent.color }}>
          <StampCheckBand color={accent.color} />
        </div>
      </div>
    );
  }

  // タイケン専用(side)。帯を上端ではなく左端(蝶番側)に縦向きで配置する、
  // 唯一flexDirection: rowになる構成。詳細はSideMotifのコメント参照。
  if (accent?.kind === "side") {
    return (
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "row", background: PAPER, overflow: "hidden",
        borderTopRightRadius: COVER_RADIUS, borderBottomRightRadius: COVER_RADIUS,
      }}>
        <div style={{ flex: `0 0 ${SIDE_BAND}`, position: "relative", flexShrink: 0, background: accent.color }}>
          <SideMotif shape={accent.shape} />
        </div>
        <CoverBody eyebrowLabel={eyebrowLabel} title={title} footer={footer} accentColor={accent.color} />
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
  // バショ(geo)の背表紙は以前45度の縞模様だったが、「背表紙は単色に
  // してほしい」という指定を受けて撤去した。geo固有の処理を持たず、
  // 下のフォールバック(単色+左右の陰影オーバーレイ)へ素直に落ちる。
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
// 軸にわずかに開くため、ここは奥まった隙間の陰として見える程度でよい、
// という想定で以前は特定の色を持たせず「rgba(0,0,0,0.18〜0.04)を背景に
// 重ねるだけ」の実装にしていた。
// 以前はこの面にも表紙と同じ半径の角丸(COVER_RADIUS)を与えていたが、
// この面の幅は本の厚み(depth、細いものは5px、GoalsTabでは22px)しかない
// うえ、rotateY(90deg)でほぼ真横を向いた状態でrotateY(-14deg)の外側の
// 回転・perspectiveごしに描画されるため、角丸のカーブがそのまま映らず、
// 表紙の丸い角のすぐ外側から槍のように尖った影が突き出て見える描画上の
// 崩れが起きていた(半径をdepthの半分まで下げても改善しなかったため、
// 単純な「半径が幅を超えてレンズ化する」問題ではなく、この深い3D回転
// 自体と角丸の組み合わせが原因と判断した)ため、角丸を諦めて素の四角に
// 戻す対応を取った。
//
// ★実機スクショ(2026-07-12)で判明: 「rgba(0,0,0,0.18)を背景に重ねる
// だけ」の実装は、この面の裏に何も無い(3D空間上ページの背景色がそのまま
// 透けて見える)ため、想定していた「暗い陰」ではなく、生成り地を薄く
// 灰色がからせただけの明るいグレーの帯として描画されていた。角丸の表紙
// (濃い色)のすぐ隣に、色味の違う無関係な灰色の板が四角いまま突き出て
// 見えるため、「四角い箱に丸いテクスチャを貼り付けただけ」に見える、と
// いうユーザー指摘につながっていた。まず表紙・背表紙と同じアクセント
// カラーを土台にした不透明な面にし(色が独立して見える問題は解決)、
// さらにユーザーとの認識合わせにより次の1点が残っていることが判明した:
// この面は表紙の角丸が始まる位置(上下端からCOVER_RADIUS分)でも高さ
// いっぱいの四角のままなので、表紙の輪郭が丸くカーブして後退した所でも
// この面だけが直角のまま飛び出て見える。
//
// 「角丸に合わせてこの面をマスクし、はみ出す部分は背景を透過させる」の
// 実現方法として、border-radius(または同系のclip-path)をこの3D回転
// (rotateY 90度)された面に適用するのは避ける: §5で全く同じ面に
// border-radiusを与えたところ、この深い3D回転との組み合わせで「槍のように
// 尖った影」に描画が崩れるChromium側の不具合が起きており、境界のクリップ
// 系プロパティ(border-radius/overflow/clip-pathはいずれもクリップ実装)を
// 3D変形されたレイヤーに使うこと自体がこのバグの引き金だったため。
// 代わりに、クリップではなく単純なアルファ合成のグラデーションだけで
// 同じ見た目を作る: 上下端をページ背景色(BG)で不透明に塗り、
// COVER_RADIUS分だけ內側で透明へフェードさせる。これにより上下の角の
// 領域だけこの面が「消えて」背景が見えるようになり、border-radius系の
// プロパティを一切使わずに角丸をマスクしたのと同じ結果が得られる。
const EDGE_FADE = COVER_RADIUS + 4;
function BinderEdgeFace({ color }: { color: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: color }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,0.34), rgba(0,0,0,0.08))" }} />
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(180deg, ${BG} 0, transparent ${EDGE_FADE}px, transparent calc(100% - ${EDGE_FADE}px), ${BG} 100%)`,
      }} />
    </div>
  );
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
export function Binder3D({ width, aspect = ITEM_CARD_ASPECT, depth, rotateY, scale = 1, transitionMs, color, eyebrowLabel, title, footer, count, accent, openDeg = OPEN_DEG_REST, shadow = true, onClick }: CoverContent & {
  width: number | string;
  aspect?: string;
  depth?: number;
  rotateY: number;
  scale?: number;
  transitionMs?: number;
  count?: number;
  openDeg?: number;
  // ゴールタブでは表紙の影を出さない(ユーザー指定)。Archiveの棚は
  // 従来通り影を出すため、デフォルトはtrueのまま。
  shadow?: boolean;
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
            同じ角丸(開く側=右のみ)を付けておく。overflowはhiddenにせず
            visibleにする(3D変形されたレイヤーにoverflow:hidden+
            border-radiusを適用するとアクセント帯テクスチャの角丸が
            透過しない描画崩れがあったため。中身のBinderCoverFace自身が
            既に同じ角丸+overflow:hiddenで自分の内容を正しくクリップ
            している)。
            ★影はbox-shadowではなくfilter:drop-shadowで落とす。
            この箱はtranslateZ/rotateYで3D変形されており(=GPUの合成
            レイヤーに昇格する)、box-shadowは要素のborder-radiusから
            「幾何学的に」矩形+丸角の影を計算する実装になっているため、
            3D変形されたレイヤーに対してChromium/WebKitがこの影を正しく
            合成できず、回転や角丸を無視した素の直線的な影がそのまま
            (2D平面の位置に)描画されてしまう不具合があった(ユーザー
            報告: 「角は丸いのに影が直線でバインダーと合っていない」)。
            これはBinderEdgeFaceの槍状の影・アクセント帯テクスチャの
            角丸未透過と同じ「box-shadow/overflow:hidden+border-radiusを
            3D変形されたレイヤーに適用すると壊れる」という一貫したバグの
            3つ目の現れだった。drop-shadowは要素が実際に描画したピクセル
            (アルファ値のシルエット)を元に影を生成するため、角丸で
            クリップされた実際の輪郭に正しく沿い、かつ3D変形後の
            レイヤーそのものに対して合成されるため、回転にも追従する。
            SOFT_SHADOWの値("0 4px 16px rgba(...)")はbox-shadowと
            drop-shadowで引数の並びが同じなのでそのまま流用できる。 */}
        <div style={{
          position: "absolute", inset: 0, overflow: "visible", filter: shadow ? `drop-shadow(${SOFT_SHADOW})` : "none",
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
          <BinderEdgeFace color={shade(spineAccent.color, -10)} />
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

// ---- ゴールタブ専用: 裏表紙が右端からわずかに覗くバインダーカード -------------
//
// これまでの試行錯誤(§7.13〜§7.21)を経て、ユーザーから具体的なイメージが
// 示された: 「机の上にノートが置いてあって、表表紙だけ少し開いて浮かせて
// いるのを、少しあおりで見ている」構図。表紙自体の傾き・手前に出てくる
// 見た目はそのまま(既存のBinder3Dの表紙と同じ角度感)に、その一つ下に
// 裏表紙が一枚だけ、表紙の右(開く側)の縁に沿ってほんの少しだけ覗く。
//
// 実装は平面2枚だけの、意図的に単純な構成にしている:
//   1. 裏表紙(GoalBackCover): 表紙より少し暗い色の、角丸の四角形。
//      3D変形は一切受けず、コンテナにぴったり重ねて敷くだけ。
//   2. 表紙(BinderCoverFace): 左端(蝶番)を軸にrotateYでわずかに傾ける。
//      transformOriginを"0% 50%"(左端)にすることで、回転しても上端・
//      下端・左端(蝶番)は裏表紙とぴったり重なったまま動かず、右端だけが
//      パースにより奥へ後退する。結果、裏表紙のうち表紙の後退した右端の
//      外側にあたる部分だけが、自然に細い帯として覗いて見える(手動で
//      オフセットを計算する必要がない、幾何学的にそうなる)。
// 側面(BinderEdgeFace)や背表紙(BinderSpineFace)のような、厚みを表現する
// ための別パーツは一切使わない。§7.13・§7.14で繰り返し起きていた「表紙の
// 角丸と別要素の直角の角が衝突する」問題は、そもそも角のある別要素を
// 作らないことで構造的に起こり得ない。
// 裏表紙は「表紙よりわずかに暗い色」程度に留める(以前の-26は表紙と
// 別物の色に見えるほど暗すぎた、という指摘)。また、パースによる後退
// だけに任せず、裏表紙自体を右へ少しシフトすることで覗く帯を安定して
// 太くしている(見えている帯 = 裏表紙の右端 - 表紙の後退した右端、の
// 差分なので、裏表紙を右にずらすほど帯が太くなる)。左端(蝶番側)は
// 表紙の左端と同じ位置のまま動かさないよう、insetではなくtranslateXで
// 平行移動させる(左右の見え方を変えず、全体を右へずらすだけにするため)。
const BACK_COVER_SHIFT = 8;
function GoalBackCover({ color }: { color: string }) {
  return (
    <div style={{
      position: "absolute", inset: 0, transform: `translateX(${BACK_COVER_SHIFT}px)`, background: color,
      borderTopRightRadius: COVER_RADIUS, borderBottomRightRadius: COVER_RADIUS,
    }} />
  );
}

export function GoalBinderCard({ width, aspect = ITEM_CARD_ASPECT, color, eyebrowLabel, title, footer, accent, onClick, tiltDeg = -16 }: CoverContent & {
  width: number | string;
  aspect?: string;
  onClick?: () => void;
  tiltDeg?: number;
}) {
  const fill = accent?.color ?? color;
  return (
    <div onClick={onClick} style={{ width, aspectRatio: aspect, perspective: 500, position: "relative", cursor: onClick ? "pointer" : "default" }}>
      <GoalBackCover color={shade(fill, -7)} />
      <div style={{ position: "absolute", inset: 0, transformOrigin: "0% 50%", transform: `rotateY(${tiltDeg}deg)` }}>
        <BinderCoverFace color={color} eyebrowLabel={eyebrowLabel} title={title} footer={footer} accent={accent} />
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
export function BinderCoverflowRow({ items, itemWidth = 172, pitch = 46, aspect = ITEM_CARD_ASPECT, initialOrder, onReorder }: {
  items: BinderShelfItem[];
  itemWidth?: number;
  pitch?: number;
  aspect?: string;
  // 並び順の永続化(任意)。initialOrderは初回マウント時の並び順の種
  // (RecordsTab側でAppStateに保存された順序)。onReorderはドラッグで
  // 並び替えが確定するたびに最新の並び順(keyの配列)を通知する。
  initialOrder?: string[];
  onReorder?: (order: string[]) => void;
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

  // ★scroll-snapは「入場アニメーションが終わった直後にバインダーが横へ
  // スライドして初期位置へ戻る」ドリフトの原因になっていた。sidePadは
  // 数学的にはscrollLeft=0が先頭の正しいスナップ位置になるよう設計して
  // あるが、containerWidthが浮動小数点でsidePadも端数を持つため、実機の
  // ピクセル丸めでレイアウト計算とブラウザのスナップ判定がわずかに食い
  // 違い、レイアウト確定後のどこかでブラウザ自身がscrollLeftを「本来の
  // スナップ位置」へ勝手に補正することがあった(それがドリフトの実体)。
  // 初期表示中はscroll-snap自体を無効にし、ユーザーが最初に指で触れた
  // 瞬間に初めて有効化する。こうすると入場アニメーションや初期の
  // レイアウト確定の間はスナップ補正が一切起こらず、ユーザーが触る頃には
  // 位置がscrollLeft=0で完全に安定しているため、そこでスナップを
  // 有効化しても動かない。スワイプで送る時のスナップ(中央へ吸着)は
  // 最初のpointerdown以降は従来どおり効く。
  const [snapEnabled, setSnapEnabled] = useState(false);

  // ---- 長押しドラッグでの並べ替え ----
  // itemsの並び自体は呼び出し側(RecordsTab)が毎回「自然な順序」で作り
  // 直すため、ユーザーが並べ替えた結果はitems本体ではなくkeyの配列
  // (order)として別管理し、表示直前にitemsをこの順序へマップし直す。
  const buildOrder = (base: string[] | undefined, keys: string[]): string[] => {
    if (!base) return keys;
    const keySet = new Set(keys);
    const kept = base.filter((k) => keySet.has(k));
    const missing = keys.filter((k) => !kept.includes(k));
    return [...kept, ...missing];
  };
  const [order, setOrder] = useState<string[]>(() => buildOrder(initialOrder, items.map((it) => it.key)));
  const orderRef = useRef(order);
  orderRef.current = order;
  const itemKeyList = items.map((it) => it.key).join(" ");
  useEffect(() => {
    setOrder((prev) => {
      const next = buildOrder(prev, items.map((it) => it.key));
      if (next.length === prev.length && next.every((k, idx) => k === prev[idx])) return prev;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKeyList]);
  const itemsByKey = new Map(items.map((it) => [it.key, it]));
  const orderedItems = order.map((k) => itemsByKey.get(k)).filter((it): it is BinderShelfItem => !!it);

  const LONG_PRESS_MS = 450;
  const MOVE_CANCEL_PX = 10;
  const pressRef = useRef<{ key: string; index: number; pointerId: number; clientX: number; clientY: number; timer: number } | null>(null);
  const dragRef = useRef<{ key: string; pointerId: number; startIndex: number; currentIndex: number; rowLeft: number } | null>(null);
  // ドラッグ中の指のスクリーンX(生値、onMoveで毎回更新)と、そこから
  // 算出した「掴んだバインダーが今いるべき連続位置(virtualIndex)」。
  // 描画側はこのvirtualIndexだけを見て掴んだカードの位置を決める。
  const pointerClientXRef = useRef(0);
  const dragVirtualIndexRef = useRef(0);
  const dragRafRef = useRef<number | null>(null);
  // ★ドラッグ中の並び順の「唯一の同期的な真実」。swapのたびにこのrefの配列を
  // その場で書き換え、React state(order)へはそのコピーを流す。以前は
  // orderRef.current(=Reactのstate)を毎フレームのswapの土台にしていたが、
  // オートスクロールで1フレームに何度もvirtualIndexが進むと、Reactの再描画
  // (非同期)が追いつかず、まだ古いorderのままの土台に対して次のswapを
  // かけてしまい、最後のsetOrderが古い土台の結果で上書きする、という
  // 競合が起きていた(掴んだバインダーが実際には全く動かず0番のまま、
  // という不具合の実体)。同期的なrefを土台にすることでこの競合を無くす。
  const dragOrderRef = useRef<string[]>([]);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  // ドラッグ中のオートスクロール。指の移動量ぶんスクロールする(1:1)方式は
  // 画面端まで指を持っていくとそれ以上スクロールできず、遠くの候補まで
  // 手繰り寄せられないという問題があった。掴んで動かした「方向」へ一定速度で
  // 連続的にスクロールする方式にする: 掴んだ位置からの変位がデッドゾーンを
  // 超えたら、助走(RAMP)を経て最大速度(MAX)に達し、以後は指を止めても
  // その方向へ流れ続ける。指を中央側へ戻せば止まる。
  // ★感度調整: 「少し動かしただけでかなり速く動いて制御できない」という
  // 指摘を受け、デッドゾーンを広げ(小さな移動では動かない)、助走を大幅に
  // 延ばし(指の変位が大きいほど徐々に速くなる)、最大速度も下げた。これで
  // 小さな移動ではゆっくり、意図的に大きく動かした時だけ速く動く。
  const AUTOSCROLL_DEADZONE = 42;
  const AUTOSCROLL_RAMP = 120;
  const AUTOSCROLL_MAX = 9;

  const dragPollFrame = () => {
    const drag = dragRef.current;
    const el = scrollRef.current;
    if (!drag || !el) { dragRafRef.current = null; return; }

    // スクロール速度は「指が行の中央からどれだけ右/左に寄っているか」で
    // 決める。以前は掴んだ位置(startClientX)からの変位で決めていたが、
    // それだと一度右へ大きく動かした後に左へ戻そうとしても、指が掴んだ点
    // より右側にいる限りずっと右へ流れ続け、「右に動かしてから左に行こうと
    // しても左にスライドしない」という不具合になっていた。行の中央を基準に
    // すると、指を右半分に置けば右へ、左半分に置けば左へ、と即座に反転できる
    // (ユーザーの「右側にスライドさせたら右へ流れる」という表現とも一致)。
    // 中央付近のデッドゾーンでは止まる(細かい位置合わせ用)。速度は中央から
    // 離れるほど助走(RAMP)で徐々に上がり最大(MAX)で頭打ち。感度が高すぎる
    // という指摘を受け、デッドゾーンを広く・助走を長く・最大速度を低くして、
    // 端に寄せた時だけ速く動くようにしてある。
    const centerX = drag.rowLeft + el.clientWidth / 2;
    const fromCenter = pointerClientXRef.current - centerX;
    const mag = Math.abs(fromCenter);
    let v = 0;
    if (mag > AUTOSCROLL_DEADZONE) {
      const ramp = Math.min(1, (mag - AUTOSCROLL_DEADZONE) / AUTOSCROLL_RAMP);
      v = Math.sign(fromCenter) * AUTOSCROLL_MAX * ramp;
    }
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    el.scrollLeft = Math.max(0, Math.min(maxScroll, el.scrollLeft + v));
    centerRef.current = el.scrollLeft / step;

    // 掴んだバインダーは指の真下に持ち上げて追従させる。指の下にあたる連続
    // スロット位置(virtualIndex)を、スクロール込みの実座標(contentX)から
    // 算出する。以前はgrabAdjust(掴んだ点のズレ補正)を足していたが、これが
    // 「バインダーの端を掴むと指と本体がずれてバグる」原因だったため撤去し、
    // どこを掴んでも本体の中心が指の真下に来る(=掴んだ瞬間に指へ吸い付く)
    // ようにした。
    const contentX = pointerClientXRef.current - drag.rowLeft + el.scrollLeft;
    const virtualIndex = (contentX - sidePad) / step - 0.5;
    dragVirtualIndexRef.current = virtualIndex;

    // swapは同期的なdragOrderRefを土台に、その場で書き換える。1フレームで
    // virtualIndexが複数スロットぶん進んだ場合(オートスクロールが速い時)も
    // whileで追いつくまで繰り返す。土台が常に最新なので、何回swapしても
    // 競合しない。
    const working = dragOrderRef.current;
    let changed = false;
    while (virtualIndex > drag.currentIndex + 0.5 && drag.currentIndex < working.length - 1) {
      const a = drag.currentIndex, b = drag.currentIndex + 1;
      [working[a], working[b]] = [working[b], working[a]];
      drag.currentIndex = b;
      changed = true;
    }
    while (virtualIndex < drag.currentIndex - 0.5 && drag.currentIndex > 0) {
      const a = drag.currentIndex, b = drag.currentIndex - 1;
      [working[a], working[b]] = [working[b], working[a]];
      drag.currentIndex = b;
      changed = true;
    }
    if (changed) setOrder(working.slice());
    setTick((t) => t + 1);
    dragRafRef.current = requestAnimationFrame(dragPollFrame);
  };

  const beginDrag = (key: string, index: number, pointerId: number, clientX: number) => {
    haptic(10);
    const el = scrollRef.current;
    // ★scrollSnapType:"x mandatory"(下のJSXで常時指定)がドラッグ中も
    // 有効なままだと、el.scrollLeftへ生のpx値を直接代入しても、ブラウザの
    // スナップ機構が毎フレームそれを最寄りのアイテム境界へ勝手に
    // 引き戻してしまう。1:1追従のはずが46px刻みでガクガク量子化され、
    // 指を右へ動かしているのにscrollLeftの実測値が前フレームより
    // 減ることさえあった(デバッグログで実測、境界の中間点をまたぐたびに
    // 上下の境界の間で行ったり来たりしていた)。これが「他のバインダーが
    // スワイプのように追従して見えない」報告の実体だった。ドラッグ中だけ
    // スナップを無効化し、指を離した時に元へ戻す。
    if (el) { el.style.overflowX = "hidden"; el.style.touchAction = "none"; el.style.scrollSnapType = "none"; }
    // ★ドラッグ中に指が棚(この行)の外へずれたり画面端へ寄ったりすると、
    // その位置の要素(外側のタブスクロール等)が縦スクロールを引き取ろうとし、
    // ブラウザがこちらのポインタをpointercancelで奪ってしまう→ドラッグが
    // 指を離す前に途中で終わる、という不具合があった(ユーザー指摘)。
    // ドラッグ中はhtml全体のtouch-actionをnoneにして、指がどこにあっても
    // ブラウザが勝手にスクロール/ジェスチャーを開始できないようにする。
    // これでポインタが奪われず、指を離す(pointerup)まで確実に継続する。
    setRootTouchAction("none");
    // touch-action:noneはtouchstart後には効きにくいiOSの穴を埋めるため、
    // touchmove自体を抑止するガードも張る(上のtouchMoveHandlerRef参照)。
    attachTouchGuard();
    // 通常スクロール用のpollFrameループが(直前の慣性スクロールなどで)
    // まだ動いていた場合、ドラッグ用のループと衝突しないよう先に止める。
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    // press(押下中)からdrag(確定)への切り替えを明示する。以後の
    // onMove/onUpはpressRefが空であることを見てdragRef側の分岐に入る。
    pressRef.current = null;
    const rowLeft = el ? el.getBoundingClientRect().left : 0;
    pointerClientXRef.current = clientX;
    dragVirtualIndexRef.current = index;
    dragOrderRef.current = orderRef.current.slice();
    dragRef.current = { key, pointerId, startIndex: index, currentIndex: index, rowLeft };
    setDraggingKey(key);
    if (dragRafRef.current == null) dragRafRef.current = requestAnimationFrame(dragPollFrame);
  };

  const endDrag = () => {
    // 離した瞬間、掴んでいたバインダーが今いるスロット(currentIndex)が画面
    // 中央に来るようscrollLeftを合わせてから離す。ドラッグ中は掴んだバインダー
    // だけ正面(回転なし)で指の真下に浮いていたが、離すとコンベアの通常描画に
    // 戻る。その着地先を中央に固定することで、指を離すと掴んでいたバインダーが
    // 正面のまま中央にすっと収まる(「止めると中央へ戻る」挙動)。
    const droppedIndex = dragRef.current?.currentIndex ?? null;
    dragRef.current = null;
    if (dragRafRef.current != null) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null; }
    const el = scrollRef.current;
    if (el) { el.style.overflowX = "auto"; el.style.touchAction = ""; el.style.scrollSnapType = "x mandatory"; }
    setRootTouchAction("");
    detachTouchGuard();
    setDraggingKey(null);
    // 永続化の土台も同期的なdragOrderRef(=画面に見えている最新の並び)にする。
    // orderRef(Reactのstate)は再描画が追いつかず古い可能性があるため。
    setOrder(dragOrderRef.current.slice());
    onReorder?.(dragOrderRef.current);
    if (el && droppedIndex != null) {
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      el.scrollLeft = Math.max(0, Math.min(maxScroll, droppedIndex * step));
      centerRef.current = el.scrollLeft / step;
    }
  };

  // ★以前はsetPointerCaptureで「指がどこへ動いても最初の要素がイベントを
  // 受け取り続ける」方式にしていたが、実機相当のマウス操作で再現テストした
  // ところ、大きく・速くドラッグして複数回スワップが起きるケースでだけ
  // ドラッグが「固まって」二度と終了しない不具合が再現した。原因を
  // 突き止めると、swap(setOrder)のたびにReactがDOM上でスロットを並べ替え
  // (同じ要素をinsertBeforeで移動)ており、この移動が一瞬でも要素を
  // ドキュメントから外す形で実装されているブラウザでは、そのたびに
  // pointer captureが仕様通り自動的に解除されていた(hasPointerCaptureで
  // 実測して確認)。captureが外れた後は、指が実際にホバーしている別の
  // 要素(棚の外や隣のセクションなど)へイベントが流れてしまい、
  // pointerupがどのスロットにも届かず、ドラッグの終了処理
  // (endDrag)が永久に呼ばれないままになっていた。
  // 対策として、要素のcaptureに依存しない方式へ作り替えた:
  // pointerdownの瞬間にwindowへ直接move/up/cancelリスナーを登録し、
  // pointerIdの一致だけで判定する。この方式はDOM上のどの要素が
  // 並べ替えでどう動こうと、windowという不変の対象に貼ったリスナーは
  // 影響を受けないため、確実に最後まで追従できる。
  const pointerMoveHandlerRef = useRef<((e: PointerEvent) => void) | null>(null);
  const pointerUpHandlerRef = useRef<((e: PointerEvent) => void) | null>(null);
  // ★ドラッグ中だけwindowに貼るtouchmoveの抑止リスナー。iOS Safariは
  // touch-actionを「touchstartの瞬間」に確定するため、長押し(450ms後)に
  // touch-action:noneへ変えても、掴む前(スロットはtouch-action:auto)に
  // 始まったこのジェスチャーには縦スクロールが許可されたまま残っている。
  // その結果、掴んだ後に指が少しでも上下にズレると、ブラウザが縦スクロールを
  // 開始してこちらのポインタをpointercancelで奪い、ドラッグが指を離す前に
  // 途中終了していた(ユーザー報告「少しでも上下にズレるとキャンセルされる」)。
  // pointer eventsのpreventDefaultはiOSではスクロールを止められないが、
  // touchmoveのpreventDefaultは止められるため、ドラッグ中はtouchmoveを
  // 明示的に抑止して縦スクロール自体を発生させない=ポインタを奪われない。
  const touchMoveHandlerRef = useRef<((e: TouchEvent) => void) | null>(null);
  const attachTouchGuard = () => {
    if (touchMoveHandlerRef.current) return;
    const tm = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    touchMoveHandlerRef.current = tm;
    window.addEventListener("touchmove", tm, { passive: false });
  };
  const detachTouchGuard = () => {
    if (touchMoveHandlerRef.current) {
      window.removeEventListener("touchmove", touchMoveHandlerRef.current);
      touchMoveHandlerRef.current = null;
    }
  };
  const detachGlobalPointerListeners = () => {
    if (pointerMoveHandlerRef.current) {
      window.removeEventListener("pointermove", pointerMoveHandlerRef.current);
      pointerMoveHandlerRef.current = null;
    }
    if (pointerUpHandlerRef.current) {
      window.removeEventListener("pointerup", pointerUpHandlerRef.current);
      window.removeEventListener("pointercancel", pointerUpHandlerRef.current);
      pointerUpHandlerRef.current = null;
    }
    detachTouchGuard();
  };

  const handleSlotPointerDown = (e: ReactPointerEvent<HTMLDivElement>, key: string, index: number) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const pointerId = e.pointerId;
    const timer = window.setTimeout(() => {
      const press = pressRef.current;
      if (press) beginDrag(press.key, press.index, press.pointerId, press.clientX);
    }, LONG_PRESS_MS);
    pressRef.current = { key, index, pointerId, clientX: e.clientX, clientY: e.clientY, timer };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const press = pressRef.current;
      if (press) {
        const dx = ev.clientX - press.clientX, dy = ev.clientY - press.clientY;
        // 一定以上動いたら長押しではなく通常のスワイプ/タップとみなし、
        // ここまでpreventDefaultを一度も呼んでいないためネイティブの
        // スクロールへそのまま委ねる。
        if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
          window.clearTimeout(press.timer);
          pressRef.current = null;
          detachGlobalPointerListeners();
        }
        return;
      }
      const drag = dragRef.current;
      if (drag && drag.pointerId === pointerId) {
        ev.preventDefault();
        pointerClientXRef.current = ev.clientX;
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const press = pressRef.current;
      if (press) { window.clearTimeout(press.timer); pressRef.current = null; }
      const drag = dragRef.current;
      if (drag && drag.pointerId === pointerId) endDrag();
      detachGlobalPointerListeners();
    };
    pointerMoveHandlerRef.current = onMove;
    pointerUpHandlerRef.current = onUp;
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

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

  // ★以前は「入場アニメーションが終わり切った600ms後にscrollLeftと
  // centerRefを強制的に0へ揃え直す安全網」をここに置いていたが、これが
  // 原因で「アニメーションが終わった瞬間に画面がスライドし、その後
  // 初期値に戻る」という新たな不具合を生んでいたと判明したため撤去した。
  // 実機Safariでは、scrollSnapType:"x mandatory"がドラッグ中以外は常に
  // 有効なままのこの行(下記JSX参照)に対し、レイアウト確定後のどこかの
  // タイミングでブラウザ自身のスナップ機構が「本来揃えるべき位置」へ
  // scrollLeftを勝手に補正することがある(sidePadの計算上scrollLeft=0が
  // 数学的には正しいスナップ位置のはずだが、containerWidthが浮動小数点
  // なためsidePadも端数を持ち、実際のピクセル丸めでわずかにズレる余地が
  // ある)。この時この安全網が600ms後に「まだ0に戻っていなければ0へ
  // 戻す」処理を行っていたため、ブラウザの補正(0からのズレ)→この
  // タイマーによる強制的な巻き戻し、という2段階の動きが「スライドして
  // 初期値に戻る」という体感になっていた。ブラウザ側の補正自体は数px
  // 程度のはずで単独では目立たない可能性が高く、後から強制的に0へ
  // 巻き戻す対症療法をやめることで、この2段階の動き自体を無くす。

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
    // ★長押しドラッグのオートスクロールが自分でscrollLeftを書き換える
    // 際、それ自体がこのonScrollを再度発火させてしまう。ガードが無いと
    // 通常スクロール用のpollFrameループがdragPollFrameループと同時に
    // 2本走り、どちらもcenterRef.currentを別々の式で毎フレーム上書き
    // し合って競合し、ドラッグ中の位置計算が破綻する(小さい移動では
    // オートスクロールが発動せず気づかれないが、端まで大きく動かす
    // ドラッグでだけ再現する不具合の実体だった)。ドラッグ中はこちらの
    // ループを起動しない。
    if (dragRef.current) return;
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
      // 最初にユーザーが触れた瞬間にだけscroll-snapを有効化する(初期表示中の
      // ブラウザによるスナップ補正=ドリフトを断つため。上のsnapEnabled参照)。
      // 何度呼んでも同値なので2回目以降のsetStateはReactが無視する。
      onPointerDown={() => setSnapEnabled(true)}
      style={{
        display: "flex", alignItems: "flex-end", overflowX: "auto", overflowAnchor: "none",
        scrollSnapType: snapEnabled ? "x mandatory" : "none", WebkitOverflowScrolling: "touch",
        padding: `${topPad}px 0 14px`, margin: "0 -16px",
      }}
    >
      {/* containerWidth(=sidePadの元)が実測される前(0の間)はカードを
          一切描画しない。以前はcontainerWidth=0のままsidePad=0で最初の
          1フレームを描画し、直後にResizeObserverが実測してsidePadが
          正しい値へ変わった瞬間、全カードの位置が0→正しい値へガクッと
          動いていた(入場アニメーションを大きく・目立つようにしたことで
          この「後からの位置補正」も同様に目立つようになり、「アニメーション
          後に勝手にスライドする」という見え方になっていた)。containerWidth
          が既知になるまでは何も描画せず、実測が済んだ「正しいレイアウト」
          の状態で初めてカードを描画・入場アニメーションを開始することで、
          アニメーション完了後に位置がずれる余地を構造的に無くした。 */}
      {containerWidth > 0 && <div style={{ flex: "0 0 auto", width: sidePad }} />}
      {containerWidth > 0 && orderedItems.map((it, i) => {
        const d = i - centerRef.current;
        // 左右どちらの隣も背表紙(リング側、ラベルが読める面)が正面を
        // 向くのは共通だが、静止角は左右で非対称にしている: 右側は90度を
        // 少し超えて裏表紙がわずかに覗き、左側は90度に届く前で止めて
        // 表紙がわずかに多めに覗く。実際に棚を正面から見た時の収束する
        // パースを再現している。
        const isDragged = it.key === draggingKey && !!dragRef.current;
        // ★掴んだバインダーだけは、コンベアの回転(棚の中央から離れるほど横を
        // 向く)を一切かけず、常に正面(rotateY=0)・平ら(openDeg=rest)で、指の
        // 真下に持ち上げる。以前はこの本人にもd(中央からの距離)に応じた回転が
        // かかっていたため、指を端へ動かす=中央から離れると横向きになり、
        // そのままどんどんずれて画面外へ消えて見える不具合になっていた。
        const angle = isDragged ? 0 : (d >= 0 ? binderTiltAngle(d, REST_RIGHT) : binderTiltAngle(-d, REST_LEFT));
        const focus = Math.max(0, 1 - Math.min(1, Math.abs(d)));
        // 掴んだ本人は持ち上げた感を出すため一定の拡大。それ以外は中央ほど拡大。
        const scale = isDragged ? 1.12 : 1 + focus * ROW_FOCUS_SCALE;
        // フォーカス中(d=0)は0、|d|>=1では固定のgapだけシフトし、その間は
        // 滑らかに補間する。掴んだ本人はコンベアのgapシフトは効かせず、
        // dragExtraPxだけで指の真下へ持っていく。
        const spread = isDragged ? 0 : gap * Math.max(-1, Math.min(1, d));
        // 掴んだ本人だけ、dragPollFrameが毎フレーム算出した「指の真下にあたる
        // 連続位置(virtualIndex)」と現在のスロットindex(i、swapで離散的に飛ぶ)
        // との差分をpx単位で上乗せし、本体の中心を指の真下へ持っていく。swapの
        // 瞬間にiが±1ジャンプしても同時に(virtualIndex - i)も逆向きに±1動くため、
        // 合計位置は連続に保たれ、指にぴったり吸い付いたまま滑らかに見える。
        const dragExtraPx = isDragged
          ? (dragVirtualIndexRef.current - i) * step
          : 0;
        // Binder3DにtransitionMsを渡さない(=CSSトランジション無し)のは
        // 意図的。スクロールスナップがmandatoryのため、指を離すとブラウザ
        // 自身が滑らかなスナップアニメーションでscrollLeftを動かす。そこに
        // さらにCSSトランジションを重ねると、rotateY/scaleの目標値が毎フレーム
        // 変わり続けるものを90msかけて追いかける形になり、ネイティブの
        // スナップに対して常に半歩遅れて「ガクッ」と収束するように見える
        // 不具合があった。rAFで1フレームごとに値を更新しているのでこれ
        // だけで十分滑らかに追従する。ただし並べ替えドラッグ中、つまみ上げて
        // いない他のカードだけは例外: swapでindexが飛ぶ瞬間に位置が
        // 瞬間移動して見えないよう、短いトランジションを付けて滑らかに
        // 詰め直させる。
        const wrapperTransition = !isDragged && draggingKey ? "transform 180ms ease" : undefined;
        return (
          <div
            key={it.key}
            onPointerDown={(e) => handleSlotPointerDown(e, it.key, i)}
            style={{
              position: "relative", flex: "0 0 auto", width: pitch, height: itemHeight, scrollSnapAlign: "center",
              zIndex: isDragged ? 1000 : Math.round(focus * 100), touchAction: draggingKey ? "none" : undefined,
              userSelect: "none", WebkitUserSelect: "none",
              animation: "binder-in 0.3s cubic-bezier(0.22,0.9,0.32,1) both", animationDelay: `${Math.min(i, 12) * 18}ms`,
            }}>
            <div style={{
              position: "absolute", left: "50%", bottom: 0, width: itemWidth,
              transform: `translateX(calc(-50% + ${spread + dragExtraPx}px))`,
              transition: wrapperTransition,
            }}>
              <Binder3D
                width={itemWidth} aspect={aspect} rotateY={angle} scale={scale}
                openDeg={isDragged ? OPEN_DEG_REST : openDegRef.current}
                color={it.color} eyebrowLabel={it.eyebrowLabel} accent={it.accent}
                title={it.title} count={it.count} onClick={isDragged ? undefined : it.onOpen}
              />
            </div>
          </div>
        );
      })}
      {containerWidth > 0 && <div style={{ flex: "0 0 auto", width: sidePad }} />}
    </div>
  );
}
