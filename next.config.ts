import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 開発時のNext.js DevToolsインジケーターがbottom-left(デフォルト)だと、
  // アプリ自体の下部タブナビ「記録」ボタンと重なりクリックを奪うため右上に退避。
  devIndicators: {
    position: "top-left",
  },
};

export default nextConfig;
