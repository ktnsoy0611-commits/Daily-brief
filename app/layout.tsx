import type { Metadata, Viewport } from "next";
import { Anton, Dela_Gothic_One, Zen_Kaku_Gothic_New, Zen_Maru_Gothic, Zen_Old_Mincho } from "next/font/google";
import "./globals.css";

// ミニマルなデザインへの刷新に伴い、明朝体(Zen Old Mincho)とPlayfair
// Displayの読み込みは廃止。サンセリフ1書体(太さ違い)に統一している。
const zenKakuGothicNew = Zen_Kaku_Gothic_New({
  variable: "--font-zen-kaku-gothic-new",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  preload: false,
});

// バインダー(components/Binder.tsx)専用の、ミッドセンチュリーのポスター
// レタリングを思わせる太いディスプレイ書体。ラテン文字のみのフォントだが、
// 和文が来た場合はfont-familyのフォールバックでZen Kaku Gothic Newへ
// 自動的に切り替わるため、英字の見出し(PLACE/GOALなど)だけにこの書体が
// 効く形で共存できる。
const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
  preload: false,
});

// ★タスクの図形に載る文字は、**1文字ごとに書体を変える**(2026-08-13にユーザー
// 指定、画像2のステッカーのポスターのような見え方)。そのために和文を持つ書体を
// 系統ごとに揃える。組み合わせの表は lib/constants.ts の FONT_FACES が正。
// いずれも日本語のサブセットを持つので、和文の題でも書体の違いが出る。
// Googleフォントの和文は unicode-range で細かく分割されて配信されるため、
// 実際に使われた文字を含む断片だけがダウンロードされる。
const zenOldMincho = Zen_Old_Mincho({
  variable: "--font-zen-old-mincho",
  // ★太さは1つだけ落とす。和文のGoogleフォントは unicode-range で 100 以上の
  // 断片に分かれて配信されるため、太さを増やすとビルドで取りに行くファイルが
  // 一気に増える(実測で失敗するほど)。太字・斜体はブラウザの合成に任せる。
  weight: "400",
  preload: false,
});

const zenMaruGothic = Zen_Maru_Gothic({
  variable: "--font-zen-maru-gothic",
  weight: "500",
  preload: false,
});

const delaGothicOne = Dela_Gothic_One({
  variable: "--font-dela-gothic-one",
  weight: "400",
  preload: false,
});

export const metadata: Metadata = {
  title: "デイリーブリーフ",
  description: "趣味嗜好を貯蓄・トラッキングする個人用QOLアプリ",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "デイリーブリーフ",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1A1A18",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={[
      zenKakuGothicNew.variable, anton.variable,
      zenOldMincho.variable, zenMaruGothic.variable, delaGothicOne.variable,
    ].join(" ")}>
      <body>{children}</body>
    </html>
  );
}
