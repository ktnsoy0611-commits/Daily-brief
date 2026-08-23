import type { Metadata, Viewport } from "next";
import { Anton, Dela_Gothic_One, M_PLUS_1, Zen_Kaku_Gothic_New, Zen_Maru_Gothic } from "next/font/google";
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

// ★タスクの図形に載る文字は、**タグごとに書体を変える**(組み合わせの表は
// lib/constants.ts の FONT_FACES が正)。★明朝(Zen Old Mincho)は
// 2026-08-16にユーザー指定で廃止し、ゴシック系だけにした。
// Googleフォントの和文は unicode-range で細かく分割されて配信されるため、
// 実際に使われた文字を含む断片だけがダウンロードされる。
// ★太さは1書体につき1つだけ落とす。太さを増やすとビルドで取りに行く断片が
// 一気に増える(実測で失敗するほど)。太字・斜体はブラウザの合成に任せる。
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

// ★SOCIAL(赤)の書体。Dela の斜体 → Reggae One → **M PLUS 1 (800)** と
// 替えた(2026-08-17にユーザー選択)。幾何学的で平らな、いちばん「シンプル」な
// ゴシック。800 あるので赤地に淡桃の文字でも線が消えない。
const mplus1 = M_PLUS_1({
  variable: "--font-mplus-1",
  weight: "800",
  preload: false,
});

export const metadata: Metadata = {
  title: "デイリーブリーフ",
  description: "趣味嗜好を貯蓄・トラッキングする個人用QOLアプリ",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // ★★`black-translucent` をやめた(2026-08-19・第29巡)。あれは
    //   **時計とアイコンを必ず白**にするので、明るい地色(#ECECEA)の上では
    //   読めない(第26巡の写真で実際に白く潰れていた)。`default` なら黒文字の
    //   ままで、**画面の下端まで web ビューが届く**ことは変わらない
    //   (ステータスバーの見た目しか変えない設定なので)。
    statusBarStyle: "default",
    title: "デイリーブリーフ",
  },
  // ★★★**`apple-mobile-web-app-capable` を自分で出す**(2026-08-19・第29巡)。
  //
  // Next は `appleWebApp.capable` から **`mobile-web-app-capable`(Android 用の
  // 名前)しか出さない**。iOS はそちらを見ないので、ホーム画面から起動した
  // アプリが「マニフェスト方式のスタンドアロン」になり、**web ビューが画面の
  // 下端まで届かない**状態だった。
  // 実測(実機の写真): 円が y=796.7pt で**どの x でもまっすぐ**切れ、その下
  // 47pt はページが一切塗れない領域で、iOS が `theme-color` で塗っていた。
  // 「画面の下端だけ別の扱いになっている」「コンポーネントが途切れる」の正体。
  // ★この値は**ホーム画面へ追加した時点で端末に焼き込まれる**。反映するには
  //   一度ホーム画面から消して、追加し直すこと。
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // ★初期値だけ。以後は lib/ground.ts が html の背景色とセットで書き換える
  // (固定の暗いグレーのままだと、iOS が自分で塗る領域 — キーボードの手前の
  //  帯や画面の下端 — がその色になり、地色が途切れて見える)。
  themeColor: "#ECECEA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={[
      zenKakuGothicNew.variable, anton.variable,
      zenMaruGothic.variable, delaGothicOne.variable, mplus1.variable,
    ].join(" ")}>
      <body>{children}</body>
    </html>
  );
}
