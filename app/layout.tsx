import type { Metadata, Viewport } from "next";
import { Anton, Zen_Kaku_Gothic_New } from "next/font/google";
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
  themeColor: "#1A1712",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${zenKakuGothicNew.variable} ${anton.variable}`}>
      <body>{children}</body>
    </html>
  );
}
