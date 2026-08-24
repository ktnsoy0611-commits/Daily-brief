"use client";

import { TYPE } from "@/lib/tokens";
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
  | "drift" | "pile" | "holes" | "strata"
  | "pen" | "dots" | "cassette"
  | "sparkle" | "plus" | "gear" | "record";

const S = 24;
// 未選択のアイコンの色。**不透明**にすること(半透明にすると上記の
// 二重掛けが起きる)。PAPER の上に rgba(26,26,24,0.42) を重ねた見た目と同じ。
export const TAB_ICON_OFF = "#9C9C9B";
// 薄いほうの段。
const PALE = 0.42;

// 歯車の輪郭。歯8つ。歯の頂き(外周R)と谷(内周r)を角度で行き来する多角形を、
// その場で1本のパスに組む(手で座標を並べると必ず順序を取り違えるため)。
const GEAR_PATH = (() => {
  const cx = 12, cy = 12, R = 11, r = 8.2, teeth = 8;
  const step = 360 / teeth;      // 1歯あたりの角度
  const half = step * 0.28;      // 歯の頂きの半幅
  const gap = step * 0.14;       // 頂きから谷へ落ちる角度
  const pt = (deg: number, rad: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(cx + Math.cos(a) * rad).toFixed(2)} ${(cy + Math.sin(a) * rad).toFixed(2)}`;
  };
  let d = "";
  for (let i = 0; i < teeth; i++) {
    const base = i * step;
    d += `${i === 0 ? "M" : "L"}${pt(base - half, R)}L${pt(base + half, R)}`;
    d += `L${pt(base + half + gap, r)}L${pt(base + step - half - gap, r)}`;
  }
  return `${d}Z`;
})();

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
    // 日付(TOP VIEW) = 真上から見下ろした、規則的に並ぶ穴。
    // 濃さ2段は「その日に入っている量の差」を表す(実際の盤もそう塗る)。
    case "holes":
      return (
        <>
          <g opacity={PALE} fill={c}>
            <circle cx="6.4" cy="6.4" r="2.9" />
            <circle cx="17.6" cy="6.4" r="2.9" />
            <circle cx="12" cy="17.6" r="2.9" />
          </g>
          <g fill={c}>
            <circle cx="12" cy="6.4" r="2.9" />
            <circle cx="6.4" cy="17.6" r="2.9" />
            <circle cx="17.6" cy="17.6" r="2.9" />
          </g>
        </>
      );
    // 地中(UNDERGROUND) = 横に重なった地層の断面。下ほど厚い。
    case "strata":
      return (
        <>
          <g opacity={PALE} fill={c}>
            <rect x="2.6" y="3.2" width="18.8" height="2.6" />
            <rect x="2.6" y="8" width="18.8" height="1.8" />
          </g>
          <g fill={c}>
            <rect x="2.6" y="12" width="18.8" height="3.6" />
            <rect x="2.6" y="17.4" width="18.8" height="4" />
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
    // 設定 = 歯車。歯を4つの正方形で表すと十字キーに、円＋つまみで表すと
    // ダイヤルに見えてしまったので、**歯が8つある本物の歯車の輪郭**を1本の
    // パスで描いた(GEAR_PATH)。輪郭がぎざぎざしているだけで「設定」と
    // 読めるので、この大きさ(17px)でも成立する。中心の軸を濃い円で置く。
    case "gear":
      return (
        <>
          <path d={GEAR_PATH} fill={c} opacity={PALE} />
          <circle cx="12" cy="12" r="3.4" fill={c} />
        </>
      );
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
  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, lineHeight: 1 }}>
      <TabIcon name={name} color={color} size={21} />
      <span style={{
        fontFamily: SANS, fontSize: TYPE.nano, fontWeight: 700, letterSpacing: "0.06em",
        color, marginRight: "-0.06em", whiteSpace: "nowrap",
      }}>{label}</span>
    </span>
  );
}
