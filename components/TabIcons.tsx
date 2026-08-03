"use client";

// ★タブバーのアイコン。線ではなく**面**だけで描き、アプリ全体の幾何学の
// 語彙(円・半円・四半円・三角・長方形、角度は0/45/90/180のみ)を守っている
// (2026-08-03)。lucideの線画アイコンから全面的に描き直した。
//
// 2色で描く: `color` が図形そのもの、`hole` が図形から抜く色。抜きは
// 背景色を上に重ねて表現するので、選択中(黒い円の上)でも未選択(白地の上)でも
// 同じ形に見える。呼び出し側がその場の下地の色を hole に渡す。
//
// 24 x 24 の正方形の中に収める。文字が無いぶんアイコンだけで見分けが付く
// 必要があるので、輪郭の外形(横長の束/円/ハート/しずく/…)を種類ごとに
// はっきり変えてある。

export type TabIconName =
  | "brief" | "goals" | "stock" | "plan"
  | "inbox" | "check" | "calendar"
  | "pen" | "book"
  | "wish" | "plus";

const S = 24;

// ★未選択のアイコンの色は**不透明**でなければならない。半透明(rgba)にすると、
// 図形が重なるところだけ色が二重に乗って濃い継ぎ目が出る(ハートの2つの円が
// 重なる中央、ピンの円と三角が重なる帯で実際に出ていた)。この値は
// rgba(26,26,24,0.42) を PAPER の上に重ねた見た目と同じ。
export const TAB_ICON_OFF = "#9C9C9B";

// 中身(figure)だけを種類ごとに切り替え、外枠のsvgは1つに集約する。
function shapes(name: TabIconName, color: string, hole: string) {
  switch (name) {
    // ブリーフ = 紙面。見出しの太い帯と、その下の本文の細い帯。
    case "brief":
      return (
        <>
          <rect x="2" y="3" width="20" height="7" fill={color} />
          <rect x="2" y="12.5" width="20" height="3" fill={color} />
          <rect x="2" y="18" width="13" height="3" fill={color} />
        </>
      );
    // ゴール = 的。大きい円から円を抜き、中心にもう一度置く同心円。
    case "goals":
      return (
        <>
          <circle cx="12" cy="12" r="10.5" fill={color} />
          <circle cx="12" cy="12" r="6.5" fill={hole} />
          <circle cx="12" cy="12" r="2.8" fill={color} />
        </>
      );
    // ストック = ハート。半円2つ + 45度に回した正方形、という幾何の組み方。
    case "stock":
      return (
        <>
          <circle cx="7.4" cy="8.6" r="5.4" fill={color} />
          <circle cx="16.6" cy="8.6" r="5.4" fill={color} />
          <path d="M3.6 11.2 L12 21.6 L20.4 11.2 Z" fill={color} />
        </>
      );
    // プラン = 地図のピン。円 + 下向きの三角、中心を抜く。
    case "plan":
      return (
        <>
          <circle cx="12" cy="9.2" r="7.4" fill={color} />
          <path d="M6.2 14.4 L17.8 14.4 L12 22.4 Z" fill={color} />
          <circle cx="12" cy="9.2" r="2.9" fill={hole} />
        </>
      );
    // インボックス = 受け皿と、そこへ落ちてくる下向きの三角。
    case "inbox":
      return (
        <>
          <rect x="10.4" y="2.4" width="3.2" height="6" fill={color} />
          <path d="M7.2 8 L16.8 8 L12 13.6 Z" fill={color} />
          <rect x="2.4" y="15.6" width="19.2" height="6" fill={color} />
        </>
      );
    // 今日(タスク) = 四角い枠と、45度の面で組んだチェック。
    case "check":
      return (
        <>
          <rect x="2.4" y="2.4" width="19.2" height="19.2" fill={color} />
          <rect x="5.4" y="5.4" width="13.2" height="13.2" fill={hole} />
          <path d="M7.4 11.8 L10.6 15 L16.6 9 L18.4 10.8 L10.6 18.6 L5.6 13.6 Z" fill={color} />
        </>
      );
    // すべて = 暦。上の帯と、日付を表す4つの正方形。
    case "calendar":
      return (
        <>
          <rect x="2.4" y="3.6" width="19.2" height="5" fill={color} />
          <rect x="2.4" y="10.4" width="19.2" height="11.2" fill={color} />
          <rect x="5.6" y="13.2" width="3.4" height="3.4" fill={hole} />
          <rect x="11.2" y="13.2" width="3.4" height="3.4" fill={hole} />
          <rect x="5.6" y="18" width="3.4" height="3.4" fill={hole} />
          <rect x="11.2" y="18" width="3.4" height="3.4" fill={hole} />
        </>
      );
    // 今日(ジャーナル) = ペン。45度の軸と、先の三角。
    case "pen":
      return (
        <>
          <path d="M17.6 2.6 L21.4 6.4 L10.4 17.4 L6.6 13.6 Z" fill={color} />
          <path d="M5.4 14.8 L9.2 18.6 L2.8 21.2 Z" fill={color} />
        </>
      );
    // アーカイブ = 棚に並んだバインダー。高さの違う3冊と、下の棚板。
    // 「見開きの本(左右2枚の面)」だと暦アイコンと見分けが付きにくかった。
    case "book":
      return (
        <>
          <rect x="3.2" y="4.4" width="4.6" height="13.6" fill={color} />
          <rect x="9.7" y="7.2" width="4.6" height="10.8" fill={color} />
          <rect x="16.2" y="2.4" width="4.6" height="15.6" fill={color} />
          <rect x="2.4" y="19.2" width="19.2" height="2.4" fill={color} />
        </>
      );
    // ウィッシュ = 四半円の弧を4つ繋いだ、へこんだ四つ星。
    case "wish":
      return (
        <>
          <path d="M12 1 A11 11 0 0 0 23 12 A11 11 0 0 0 12 23 A11 11 0 0 0 1 12 A11 11 0 0 0 12 1 Z" fill={color} />
        </>
      );
    // 追加 = 直交する2本の面。
    case "plus":
      return (
        <>
          <rect x="10.2" y="2.6" width="3.6" height="18.8" fill={color} />
          <rect x="2.6" y="10.2" width="18.8" height="3.6" fill={color} />
        </>
      );
  }
}

export function TabIcon({ name, color, hole, size = S }: { name: TabIconName; color: string; hole: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${S} ${S}`} aria-hidden focusable="false" style={{ display: "block" }}>
      {shapes(name, color, hole)}
    </svg>
  );
}
