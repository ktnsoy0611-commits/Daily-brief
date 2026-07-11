# デイリーブリーフ

個人用QOLアプリ。実装方針の詳細は `IMPLEMENTATION HANDOFF.md` を参照。
UIプロトタイプは `qol-app-v19.tsx`（参照専用、ビルド対象外）。

## 開発

```bash
npm install
npm run dev
```

http://localhost:3000 を開く。データはブラウザの localStorage に保存される（`lib/dataStore.ts`）。

## 構成

- `app/` — Next.js App Router（layout/page/manifest）
- `components/` — UIコンポーネント。タブごとに `components/tabs/` 以下に分割
- `lib/` — 定数・ヘルパー関数・型・データ層(DataStore)
