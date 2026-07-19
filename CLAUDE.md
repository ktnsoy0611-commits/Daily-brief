@AGENTS.md
@HANDOFF-CURRENT.md

# AIへの絶対ルール（最優先・厳守）

ユーザーは**非エンジニア**であり、ファイル名やディレクトリ構造を把握していない。
漠然とした指示（例:「ブリーフのカードがおかしい」「設定画面を直して」）を受けた場合、
以下を必ず守ること。

1. **いきなりプロジェクト全体を検索しない**（grep・フルスキャン・広範なファイル読み込み禁止）。
2. **必ず最初にこの CLAUDE.md の「ファイル地図」を確認**し、修正対象になり得るファイルの仮説を立てる。
3. 仮説に基づき、**必要最小限のファイルだけを開いてから**作業を始める。
4. 仮説が外れたと分かった時点で初めて、対象を絞った検索に切り替える。

この順序を飛ばすとトークンを浪費し、ユーザーの意図もつかめない。

# ファイル地図（目次）

深掘り前の「当たりをつける」ための索引。詳細な仕様は `HANDOFF-CURRENT.md` が正。

## 画面・タブ（ユーザーが「〜の画面」と言ったらまずここ）

- `components/AppShell.tsx` — 全体の骨格。タブ切替・共有state・地図モード等の司令塔。
- `components/tabs/BriefTab.tsx` — **ブリーフ**（カードをスワイプするデッキ）。
- `components/tabs/RecordsTab.tsx` — **アーカイブ**（実行済みバインダーの棚）。初期タブ。
- `components/tabs/StockTab.tsx` — **ストック**（候補アイテムの一覧・追加シート）。
- `components/tabs/ExecuteTab.tsx` — **プラン**（地図・今週のおすすめ・バインド！確定）。
- `components/tabs/GoalsTab.tsx` — **ゴール**（ゴールのバインダー・チェックイン）。
- `components/tabs/ProfileTab.tsx` — **設定**（好み/興味・情報源・サインアウト・ブリーフ生成の実験）。

## 共通UI部品

- `components/common.tsx` — `PosterCard`・`Masthead` などカード共通言語。
- `components/Binder.tsx` — バインダーの3D表現・棚の長押しドラッグ並べ替え。
- `components/BottomSheet.tsx` — 下から出る共通オーバーレイ。
- `components/PlanSelectionBar.tsx` — プランの選択バー（「バインダーへ」ボタン）。
- `components/AddWishSheet.tsx` — ✨ウィッシュ入力シート。
- `components/SignInGate.tsx` — ログイン画面（6桁コード方式）。
- `components/LeafletMap.tsx` — 実地図（Leaflet + OSM/CartoDB）。

## データ・ロジック（型・保存・生成）

- `lib/types.ts` — **データモデルの正**（Item/Wish/BriefCard/AppState など）。
- `lib/constants.ts` — 色・定数・kind↔ドメイン対応・（撤去予定の）ダミーCARDS。
- `lib/helpers.ts` — `domainOf`/`hasPlace`/座標投影など純粋関数。
- `lib/dataStore.ts` — 永続化（localStorage / Supabase）。`SERVER_OWNED_KEYS`。
- `lib/supabaseClient.ts` — Supabaseクライアント（環境変数が無ければnull）。
- `lib/briefPipeline.ts` — **ブリーフ生成の中核**（Jina取得→層B抽出→層C分類→層D検証）。
- `lib/deckStyle.ts` — 生成カードを表示用BriefCardへ整形。
- `lib/myBrain.ts` / `myBrainSyncClient.ts` / `myBrainWrite.ts` — my-brain（好み/興味の真実源）連携。

## サーバー関数（app/api）

- `app/api/generate-brief/route.ts` — 設定画面「生成を試す」用（briefPipelineの薄いラッパー）。
- `app/api/cron/build-brief/route.ts` — 夜間Cron。デッキを生成し`generatedDecks`へ保存。
- `app/api/resolve-place/route.ts` — マップURL→座標/店名の解決（Places API）。
- `app/api/mybrain/read/route.ts` / `sync/route.ts` — my-brainの読み書き。

## 設定・基盤

- `app/layout.tsx` / `page.tsx` / `globals.css` / `manifest.ts` — Next.js基盤・PWA。
- `next.config.ts` — キャッシュヘッダ等。
- `supabase/schema.sql` — DBスキーマ（app_state/content_cache 他）。
- `.github/workflows/` — `build-brief.yml`（夜間生成）・`supabase-heartbeat.yml`。

## 参照専用（通常は開かない）

- `IMPLEMENTATION HANDOFF.md` — 初期要件定義書。**データモデル/タブ構成は古い**（HANDOFF-CURRENT.mdが正）。
- `SYSTEM-DESIGN.md` — 生成パイプライン・情報源戦略の設計思想。
- `qol-app-v19.tsx` — 移植元プロトタイプ（差分確認用）。
