import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "デイリーブリーフ",
    short_name: "デイリーブリーフ",
    description: "趣味嗜好を貯蓄・トラッキングする個人用QOLアプリ",
    start_url: "/",
    display: "standalone",
    // ★★**アプリの地色(BD_GREY)と必ず同じにする**(2026-08-19・第27巡)。
    // この2つは**ホーム画面へ追加した時点で端末に焼き込まれ**、iOS が自分で
    // 塗る領域(起動画面・画面の縁)に使う。`#1A1A18` のままだと地色と食い違い、
    // 帆布が届かなかった所がその色の帯として残る。
    // ★変えても、すでにホーム画面にあるアプリには反映されない。
    //   一度消して追加し直すこと。
    // ★第76巡に `BD_GREY` を盤の CLOUD `#FFFBF5` へ変えたので、ここも合わせた。
    background_color: "#FFFBF5",
    theme_color: "#FFFBF5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
