import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 開発時のNext.js DevToolsインジケーターがbottom-left(デフォルト)だと、
  // アプリ自体の下部タブナビ「記録」ボタンと重なりクリックを奪うため右上に退避。
  devIndicators: {
    position: "top-left",
  },
  // 静的プリレンダーされたHTMLシェル(/など)はデフォルトでVercelのCDNが
  // s-maxage=31536000(1年)を付ける。Vercel自身のエッジは新デプロイのたびに
  // 正しく差し替わるが、キャリアの透過プロキシ等「Vercelより手前にある
  // 共有キャッシュ」はs-maxageをそのまま信じて1年間握り続けうる。これだと
  // 新しいデプロイをしても実機には古いJSチャンクを参照した古いHTMLが
  // 届き続ける(=コードは直っているのに実機だけ直らない、という事故になる)。
  // _next/static(ファイル名がコンテンツハッシュ付き)以外の全ルートに対し
  // 明示的にno-cache(=毎回サーバーへ検証を要求)を強制し、この経路を断つ。
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image).*)",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
