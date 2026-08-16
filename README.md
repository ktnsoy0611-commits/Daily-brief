# デイリーブリーフ

個人用QOLアプリ。

## ドキュメント

| ファイル | 役割 |
|---|---|
| `CLAUDE.md` | 開発の規約・ファイル地図・恒久ルール（毎セッション読む） |
| `handoff_current.md` | いまどこまで進んでいるか（200行以内） |
| `docs/project_knowledge.md` | **現行仕様の正**。設計・データモデル・守るべき約束 |
| `docs/archive/` | 過去の経緯と教訓（必要な節だけ `grep` して読む） |
| `SYSTEM-DESIGN.md` | 生成パイプラインの設計思想 |
| `COWORK-ROUTINES.md` | Cowork（週次の発掘・分析、毎晩の仕分け）に渡すプロンプト |

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
