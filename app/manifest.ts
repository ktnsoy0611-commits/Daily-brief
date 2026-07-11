import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "デイリーブリーフ",
    short_name: "デイリーブリーフ",
    description: "趣味嗜好を貯蓄・トラッキングする個人用QOLアプリ",
    start_url: "/",
    display: "standalone",
    background_color: "#F2EADA",
    theme_color: "#1A1712",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
