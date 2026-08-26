"use client";

import { TYPE, LEAD, TRACK, WEIGHT } from "@/lib/tokens";
import { SANS } from "@/lib/constants";

// ★タブバーのアイコン(2026-08-03)。ユーザー提供の幾何アイコン集
// (IMG_1660.JPG)の図形をそのまま写したもの。線ではなく**面**だけで描き、
// アプリ全体の幾何学の語彙(円・四半円・三角・長方形・45度の菱形)を守る。
//
// 元の絵は3色(淡い紫・濃い紫・赤)で塗り分けられているが、このアプリは
// 1色なので**濃淡2段**に畳んでいる: 淡い紫 → 薄いほう、濃い紫と赤 → 濃いほう。
// ★薄いほうは <g opacity> でまとめて掛ける。1つずつ半透明にすると、図形が
// 重なるところだけ色が二重に乗って濃い継ぎ目が出る(以前これで失敗した)。
// グループ全体に掛ければ、グループ内で重なっても濃さは変わらない。

export type TabIconName =
  | "list" | "pie" | "layers" | "pin"
  | "drift" | "pile"
  | "pen" | "dots" | "cassette"
  | "sparkle" | "plus" | "gear" | "record";

const S = 24;
// 未選択のアイコンの色。**不透明**にすること(半透明にすると上記の
// 二重掛けが起きる)。PAPER の上に rgba(26,26,24,0.42) を重ねた見た目と同じ。
// 薄いほうの段。
const PALE = 0.42;

// ★設定 = 歯車。**丸い切り欠きを8つ**入れた円盤と、大きな中心の穴だけで作る
// (2026-08-26・第67巡にユーザーが参照画像を指定)。線ではなく**面の抜き**なので、
// 小さくしても歯の先が尖らず形が潰れない。
// ★数字は図形の座標系(24 の器の中の半径)。外 10.7 / 切り欠き 2.62 / 穴 4.95。
const GEAR_PATH = "M9.40 1.62 A2.62 2.62 0 0 0 14.60 1.62 A10.70 10.70 0 0 1 17.50 2.82 A2.62 2.62 0 0 0 21.18 6.50 A10.70 10.70 0 0 1 22.38 9.40 A2.62 2.62 0 0 0 22.38 14.60 A10.70 10.70 0 0 1 21.18 17.50 A2.62 2.62 0 0 0 17.50 21.18 A10.70 10.70 0 0 1 14.60 22.38 A2.62 2.62 0 0 0 9.40 22.38 A10.70 10.70 0 0 1 6.50 21.18 A2.62 2.62 0 0 0 2.82 17.50 A10.70 10.70 0 0 1 1.62 14.60 A2.62 2.62 0 0 0 1.62 9.40 A10.70 10.70 0 0 1 2.82 6.50 A2.62 2.62 0 0 0 6.50 2.82 A10.70 10.70 0 0 1 9.40 1.62 Z M7.05 12.00 A4.95 4.95 0 1 0 16.95 12.00 A4.95 4.95 0 1 0 7.05 12.00 Z";

function shapes(name: TabIconName, c: string) {
  switch (name) {
    // ブリーフ = 箇条書き(丸と帯が3段)。
    case "list":
      return (
        <>
          <g opacity={PALE} fill={c}>
            <circle cx="4.4" cy="6.2" r="1.9" />
            <circle cx="4.4" cy="12" r="1.9" />
            <rect x="8.8" y="16.2" width="12.8" height="3.6" rx="1.8" />
          </g>
          <g fill={c}>
            <rect x="8.8" y="4.4" width="12.8" height="3.6" rx="1.8" />
            <rect x="8.8" y="10.2" width="12.8" height="3.6" rx="1.8" />
            <circle cx="4.4" cy="18" r="1.9" />
          </g>
        </>
      );
    // ゴール = 円グラフ(達成の度合い)。
    case "pie":
      return (
        <>
          <circle cx="12" cy="12" r="9.6" fill={c} opacity={PALE} />
          <path d="M12 12 L12 2.4 A9.6 9.6 0 0 1 21.6 12 Z" fill={c} />
        </>
      );
    // ストック = 重ねた2枚(溜めておく)。
    case "layers":
      return (
        <>
          <rect x="2.2" y="7.4" width="12.4" height="12.4" rx="2.6" fill={c} opacity={PALE} />
          <rect x="9.4" y="2.2" width="12.4" height="12.4" rx="2.6" fill={c} />
        </>
      );
    // プラン = 場所(円と、そこから開く四半円)。
    case "pin":
      return (
        <>
          <path d="M10.6 19.8 L21.8 19.8 A11.2 11.2 0 0 0 10.6 8.6 Z" fill={c} opacity={PALE} />
          <circle cx="7.8" cy="8.4" r="4.4" fill={c} />
        </>
      );
    // 候補 = 宙に離れて漂う面(無重力)。下に何も無く、ばらばらの高さに浮く。
    case "drift":
      return (
        <>
          <g opacity={PALE} fill={c}>
            <circle cx="6.2" cy="15.4" r="3.6" />
            <rect x="13.4" y="14" width="7.2" height="7.2" rx="1.4" />
          </g>
          <g fill={c}>
            <rect x="3.4" y="3.2" width="7.2" height="7.2" rx="1.4" />
            <circle cx="17.2" cy="7.2" r="3.6" />
          </g>
        </>
      );
    // タスク = 下に積み上がった面(重力)。床の側ほど大きく、上ほど小さい。
    case "pile":
      return (
        <>
          <g opacity={PALE} fill={c}>
            <circle cx="8.2" cy="5.6" r="3.1" />
            <rect x="13.6" y="10.2" width="7.8" height="6.4" rx="1.2" />
          </g>
          <g fill={c}>
            <rect x="2.6" y="10.2" width="9.2" height="6.4" rx="1.2" />
            <rect x="2.6" y="18" width="18.8" height="3.4" rx="1.2" />
          </g>
        </>
      );
    // 今日(ジャーナル) = 書く(面の上に45度の軸)。
    case "pen":
      return (
        <>
          <rect x="2.6" y="8.4" width="12.8" height="12.8" rx="2.6" fill={c} opacity={PALE} />
          <path d="M17.4 2.2 L21.8 6.6 L11 17.4 L6.6 13 Z" fill={c} />
        </>
      );
    // アーカイブ = 積み上がった記録(3x3の点)。
    case "dots":
      return (
        <>
          <g opacity={PALE} fill={c}>
            <circle cx="12" cy="5.4" r="1.9" />
            <circle cx="5.4" cy="12" r="1.9" />
            <circle cx="18.6" cy="12" r="1.9" />
            <circle cx="12" cy="18.6" r="1.9" />
          </g>
          <g fill={c}>
            <circle cx="5.4" cy="5.4" r="1.9" />
            <circle cx="18.6" cy="5.4" r="1.9" />
            <circle cx="12" cy="12" r="1.9" />
            <rect x="3.5" y="16.7" width="3.8" height="3.8" />
            <circle cx="18.6" cy="18.6" r="1.9" />
          </g>
        </>
      );
    // レコード = カセット(角丸の面に、リールの丸が2つ)。
    case "cassette":
      return (
        <>
          <rect x="2.4" y="5" width="19.2" height="14" rx="2.6" fill={c} opacity={PALE} />
          <g fill={c}>
            <circle cx="8.4" cy="11" r="2.9" />
            <circle cx="15.6" cy="11" r="2.9" />
            <rect x="7.2" y="16.2" width="9.6" height="2.8" rx="1.4" />
          </g>
        </>
      );
    // ウィッシュ = 45度の菱形を4つ(きらめき)。
    case "sparkle":
      return (
        <>
          <g opacity={PALE} fill={c}>
            <path d="M7.2 3 L11.4 7.2 L7.2 11.4 L3 7.2 Z" />
            <path d="M16.8 12.6 L21 16.8 L16.8 21 L12.6 16.8 Z" />
          </g>
          <g fill={c}>
            <path d="M16.8 3 L21 7.2 L16.8 11.4 L12.6 7.2 Z" />
            <path d="M7.2 12.6 L11.4 16.8 L7.2 21 L3 16.8 Z" />
          </g>
        </>
      );
    case "gear":
      // ★中心は「濃い軸」ではなく**穴**。`evenodd` で1本のパスから抜く。
      return <path d={GEAR_PATH} fill={c} fillRule="evenodd" />;
    // 録音 = 同心の円ふたつ。外の輪が薄く、中の点が濃い。
    case "record":
      return (
        <>
          <circle cx="12" cy="12" r="10.4" fill={c} opacity={PALE} />
          <circle cx="12" cy="12" r="5.2" fill={c} />
        </>
      );
    // 追加 = 直交する2本の面。
    case "plus":
      return (
        <g fill={c}>
          <rect x="10.2" y="2.6" width="3.6" height="18.8" />
          <rect x="2.6" y="10.2" width="18.8" height="3.6" />
        </g>
      );
  }
}

export function TabIcon({ name, color, size = S }: { name: TabIconName; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${S} ${S}`} aria-hidden focusable="false" style={{ display: "block" }}>
      {shapes(name, color)}
    </svg>
  );
}

/** タブバーの1タブぶん。アイコンの下に短い英語のラベルを置く。
 *  ラベルは幾何アルファベットではなく**本文と同じ書体**(ユーザー指定、
 *  2026-08-04)。本物のタブバー(AppShell)とダッシュボードのモーフ用ピル
 *  (Dashboard)の両方がこれを使うので、見た目が必ず一致する。 */
export function TabGlyph({ name, label, color }: { name: TabIconName; label: string; color: string }) {
  // ★gap:3 は目盛りの外＝アイコンの内部（図形の座標系）。
  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 /* ★目盛りの外（アイコンの内部＝図形の座標系） */, lineHeight: LEAD.flat }}>
      <TabIcon name={name} color={color} size={21} />
      <span style={{
        fontFamily: SANS, fontSize: TYPE.nano, fontWeight: WEIGHT.bold, letterSpacing: TRACK.caps,
        color, marginRight: `-${TRACK.caps}`, whiteSpace: "nowrap",
      }}>{label}</span>
    </span>
  );
}
