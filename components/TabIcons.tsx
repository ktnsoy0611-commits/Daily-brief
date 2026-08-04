"use client";

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
  | "venn" | "toggle" | "grid"
  | "pen" | "dots"
  | "sparkle" | "plus" | "gear";

const S = 24;
// 未選択のアイコンの色。**不透明**にすること(半透明にすると上記の
// 二重掛けが起きる)。PAPER の上に rgba(26,26,24,0.42) を重ねた見た目と同じ。
export const TAB_ICON_OFF = "#9C9C9B";
// 薄いほうの段。
const PALE = 0.42;

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
    // インボックス = 重なる2つの円(集まってくる)。
    case "venn":
      return (
        <>
          <circle cx="9.2" cy="12" r="6.4" fill={c} opacity={PALE} />
          <circle cx="14.8" cy="12" r="6.4" fill={c} />
        </>
      );
    // 今日(タスク) = 2段のスイッチ(済み/未)。
    case "toggle":
      return (
        <>
          <g opacity={PALE} fill={c}>
            <rect x="2.4" y="3.6" width="15.2" height="7.4" rx="3.7" />
            <circle cx="6.4" cy="16.8" r="3.7" />
          </g>
          <g fill={c}>
            <circle cx="17.6" cy="7.3" r="3.7" />
            <rect x="6.4" y="13.1" width="15.2" height="7.4" rx="3.7" />
          </g>
        </>
      );
    // すべて = 2x2の面(全体を見渡す)。
    case "grid":
      return (
        <>
          <g opacity={PALE} fill={c}>
            <rect x="13" y="2.6" width="8.4" height="8.4" rx="1.4" />
            <rect x="2.6" y="13" width="8.4" height="8.4" rx="1.4" />
          </g>
          <g fill={c}>
            <rect x="2.6" y="2.6" width="8.4" height="8.4" rx="1.4" />
            <circle cx="17.2" cy="17.2" r="4.2" />
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
    // 設定 = つまみ(円の下地 ＋ 目盛りを指す面 ＋ 中心の円)。lucideの歯車の
    // 線画から差し替えた(2026-08-03)。歯車を4つの正方形の歯で表すと、この
    // 大きさ(17px)では十字キーに見えてしまったため、面だけで確実に読める
    // 「つまみ」にした。ヘッダーの丸ボタンで使う。
    case "gear":
      return (
        <>
          <circle cx="12" cy="12" r="9.6" fill={c} opacity={PALE} />
          <g fill={c}>
            <rect x="10.7" y="3.2" width="2.6" height="7" />
            <circle cx="12" cy="12" r="2.8" />
          </g>
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
