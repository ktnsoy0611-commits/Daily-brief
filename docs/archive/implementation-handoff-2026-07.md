# デイリーブリーフ — 実装引き継ぎドキュメント（v19対応・完全版）

Claude Codeでの実装開始時に、このファイルと `qol-app-v19.jsx` をプロジェクトルートに置き、
最初に「IMPLEMENTATION_HANDOFF.md を読んでから、フェーズ1を開始して」と指示すること。

---

## 1. プロジェクト概要と設計思想

個人用QOLアプリ（PWA・利用者は本人1名のみ）。趣味嗜好を貯蓄・トラッキングし、
週末と日々の生活を豊かにする提案を行う。

**核となる体験のループ:**
1. 朝夕2回の「デイリーブリーフ」(雑誌の号のようなカードデッキ)をスワイプでKEEP/SKIP
2. KEEPは地図上のピンとして貯まる（＝新しい情報を拾っておくニュースフィード）
3. 出かける日に地図でパパッと選ぶと「その日専用のマガジン」ができる（日付が変わると自動リセット）
4. 実行した記録がホームのダッシュボード（記録タブ）にポスター・バインダーとして積み上がる
5. 蓄積から興味が自動検出され、次のブリーフの質が上がる（ループ）

**絶対に守るべきユーザーの設計思想:**
- プラン組みをタスク化しない。時間割・所要時間の表記は出さない
- パーソナライズは裏で自動処理。設定画面は作らない（プロフィールはフラット1画面のみ）
- アプリ側から問いを投げて引き出す（目標のチェックインカード等）
- 操作導線（編集モード等）は控えめに配置し、デザインを優先する
- デザインは洋雑誌スタイル: Zen Old Mincho(見出し) / Zen Kaku Gothic New(本文) /
  Playfair Display italic(数字)。色: INK #171715, PAPER #FBFAF7, BG #EFEDE6,
  BLUE #2B3FBF, RUST #A8552F, GREEN #3E4A3A, ゴールド #D9A441(良かったバッジ)
- **主な利用端末はiPhone**。プロトタイプは元々 maxWidth:420 の縦長カード設計のため、
  そのままiPhone幅に収まる。実装時にiOS PWA対応として以下を追加すること:
  `viewport-fit=cover`(ノッチ/Dynamic Island対応)、`apple-touch-icon`とmanifest
  (ホーム画面追加用)。`env(safe-area-inset-bottom)`は既存コードのまま活用できる
- 課金には非常に慎重（§6・§7が最優先実装事項）

## 2. 技術スタック（確定）

| 層 | 技術 | 備考 |
|---|---|---|
| フロント | Next.js (App Router) + PWA | Vercel Hobby（非商用） |
| DB | Supabase Free | 1週間非アクセスで停止 → GitHub Actions heartbeat必須 |
| AI | Gemini API (2.5 Flash-Lite / Flash) | 無料ティア運用。Grounding検索は月5,000回まで無料 |
| 地図/場所 | Google Maps JavaScript API + Places API (New) | 裏取り・写真・地理計算の脇役（§5） |
| バッチ | Vercel Cron | Hobbyは1日1回 → 朝刊はCron、夕刊はオンデマンド生成 |
| デプロイ | GitHub → Vercel | ユーザーは経験あり |

## 3. データモデル（Supabase SQL草案）

プロトタイプ STORAGE_KEY="qol-app-state-v1" の構造をテーブル化。

```sql
create table wishes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category_id text not null,            -- do/buy/watch/go
  status text not null default 'stock', -- stock/fulfilled
  added_at timestamptz default now(),
  fulfilled_at timestamptz
);

create table keeps (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  area text,
  status text not null default 'candidate', -- candidate/planned/done
  kept_at timestamptz default now(),
  done_at timestamptz,
  expires_at timestamptz,   -- 会期末・予約締切。null なら kept_at+30日 で自動削除
  images jsonb,             -- Place Photos の photo_name 配列
  meta jsonb,
  source_url text,
  source_label text,
  source_id uuid,           -- どの情報源から来たか（§5の淘汰スコアに使用）
  color text,
  place_id text, lat double precision, lng double precision
);

create table briefs (
  edition_key text primary key,  -- 'YYYY-MM-DD-am' / 'YYYY-MM-DD-pm'
  cards jsonb not null,
  decisions jsonb default '{}',
  feedback jsonb default '{}',   -- カード旗フィードバック {cardId: true}
  completed_at timestamptz
);

create table magazine (
  id int primary key default 1,  -- 常に1行
  date_key date,                 -- 当日のみ有効。日付が変わったら未処理分をpending_reviewへ
  decided_at timestamptz,
  item_ids jsonb not null
);

create table pending_review (    -- 「行きましたか？」通知キュー
  keep_id uuid primary key references keeps(id) on delete cascade,
  queued_at timestamptz default now()
);

create table profile (
  id int primary key default 1,
  current_focus text default '',
  interests jsonb default '[]'   -- {id,label,categoryId,kind:hobby/artist/architect,weight,source}
);

create table records_media (     -- メディア記録（自動では増えない。§4の3経路のみ）
  id uuid primary key default gen_random_uuid(),
  kind text not null,            -- movie/exhibition/live/book/album
  title text not null,
  creator text,
  added_at timestamptz default now(),
  image text, color text, good boolean default false,
  source_keep_id uuid, source_url text
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  added_at timestamptz default now(),
  check_ins jsonb default '[]'   -- {id,at,text,source:prompted/manual,kind?:milestone,rating?:1-3}
);

create table sources (           -- 情報源プール（§5の心臓部）
  id uuid primary key default gen_random_uuid(),
  url text not null,
  label text,
  type text default 'html',      -- rss/html
  interests jsonb default '[]',
  origin text not null,          -- 'user'(登録・淘汰されない) / 'auto'(発掘・淘汰対象) / 'fixed'(チケットサイト等の固定)
  score real default 0,          -- KEEP率で加点、旗フィードバックで減点
  added_at timestamptz default now(),
  last_crawled_at timestamptz
);

create table content_cache (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id),
  payload jsonb not null,        -- 抽出済み候補 {title,url,date,area,...}
  fetched_at timestamptz default now()
);
```

RLS: 本人1名利用のため、単一ユーザーの auth.uid() 一致のみ許可。

## 4. UI移植ノート（qol-app-v19.jsx / 1936行）

- 5タブ構成。**記録タブがホーム（起動時デフォルト・タブ先頭）**: 記録/ブリーフ/願望/目標/週末
- `DataStore`(load/save/clear)が抽象化層。Supabaseクライアントに差し替えればUI側は無変更
- 全オーバーレイは共通 `BottomSheet`（エントランス・ドラッグで閉じる・220msスライドダウン、
  cubic-bezier(0.32,0.72,0,1)）。新しいシートを作る際も必ずこれをベースにすること
- **ブリーフ**: 正午を境に朝刊(am)/夕刊(pm)の2エディション。editionKeyで独立管理。
  デッキ最大10枚＋育成カード1枚(checkin 14日毎 / milestone 45日毎、urgency最大の1件のみ)。
  カード右下に旗アイコン（情報源スコアへの負のフィードバック）
- **KEEPの入り先分岐**: 通常カード→keeps(candidate)。mediaKind付きカード(本・アルバム等)→records_mediaへ直接
- **メディア記録の3経路（自動抽出はしない）**: ①マガジンで✓ ②「行きましたか？」通知で「行った」
  ③手動＋（いずれも inferMediaKind でカテゴリが映画/展覧会/ライブの場合のみ）
- **マガジン**: dateKey付きで当日限り。日付跨ぎで未処理分はpendingReviewへ移動しリセット。
  全画面表示、上部に控えめな「← 地図で選び直す」「編集」。編集モードで追加カード・解散リンク
- **Keep自動失効**: expiresAt超過、またはkeptAtから30日で削除（done除外）。起動時に整合処理
- **週末おすすめ束**: 木曜更新・NEWバッジ（mostRecentThursday週キー）
- 写真: Lorem Picsum → Place Photos に差し替え。地図: AREA_COORDSのスタイライズド地図 →
  Google Maps JavaScript API に差し替え。mockParseUrl → サーバー関数に差し替え

## 5. 情報収集アーキテクチャ（最重要・3層構造）

**大原則: Geminiに事実を創作させない。「取得」と「選定・執筆」を分離し、
Geminiは実際に取得できた情報の選定・要約・執筆だけを担当する。**

**役割分担: 発見の主役はGemini+Grounding検索。Places APIは裏取り(住所/営業時間/写真/地理計算)の脇役。**
ユーザーの明確な要望: 「検索上位の浅い情報ではなく、自分では辿り着けないニッチで質の高い情報」

### 層1: 情報源プール（毎日巡回・基盤）
- sourcesテーブルの各URLをサーバーでfetch(RSS優先、なければHTML)
- 取得テキストをFlash-Liteに渡し「新着情報をJSONで抽出」（検索ではなく抽出なので極めて安価）
- **自己調整**: ソースごとのKEEP率で加点、カードの旗フィードバックで減点。
  origin='auto'の下位ソースは週次の発掘で見つけた新ソースと入れ替える（多腕バンディット構造）
- origin='user'（プロフィールで登録。例: rateyourmusic.com）と origin='fixed'
  （チケットサイト新着・美術館展覧会一覧・映画公開スケジュール）は淘汰しない
- RYM等ランキング系は上位N件からのランダムサンプリングで「ある程度ランダムに」を実現

### 層2: Grounding検索（発掘と即時性）
- **週1回**: 興味タグごとに新しい質の高い情報源を発掘しプールに補充
  プロンプト例: 「[興味]について質の高い情報を継続的に発信している個人ブログ・
  地域専門メディア・専門サイトを探せ。大手まとめサイトは除外」
- **毎日**: アーティスト系興味タグのライブ告知チェック（発表直後に拾わないとチケットが取れないため）
- **ブリーフ生成時**: 「直近数日の公開・更新情報を優先し、大手まとめサイトや検索上位ではなく
  個人ブログ・地域専門メディア・会場一次情報を重視して候補を探せ。検索結果から見つかった
  事実だけでタイトル・紹介文・メタ情報を作り、必ず参照元URLを添えよ」

### 層3: セレンディピティ
①Geminiが興味の隣接キーワードを発想（創作OK、事実不要）→②そのキーワードでGrounding検索
→③実在の情報に一言添える。実在しない体験を創作することは一度もない。

### Gemini利用箇所の全リスト
| # | 用途 | 頻度 | モデル |
|---|---|---|---|
| 1 | ブリーフ生成(選定・執筆) | 1日2回(朝刊Cron/夕刊オンデマンド) | Flash + Grounding |
| 2 | ソース巡回の新着抽出 | 毎日30〜50回 | Flash-Lite |
| 3 | 興味の自動検出 | 週1回 | Flash-Lite |
| 4 | 情報源の発掘 | 週1回 | Flash + Grounding |
| 5 | ライブ告知チェック | 毎日数回 | Flash + Grounding |
| 6 | URL場所解析(非マップURL時のみ) | 手動時のみ | Flash-Lite |
| 7 | セレンディピティのキーワード発想 | ブリーフ生成に内包 | Flash-Lite |

## 6. コスト（2026年7月時点の調査結果）

- Gemini 2.5 Flash-Lite: $0.10/1M入力・$0.40/1M出力。無料ティアはリクエスト数ベースで
  1日あたり千件規模 → 本アプリの消費は多くて60リクエスト/日程度（数%）
- **Grounding検索: 月5,000回まで無料**（Gemini 3系）。本アプリは月200〜400回想定 → 無料枠内
  ※1リクエストが複数検索クエリを発行し各々カウントされる点に注意
- Places API: 月間無料枠内（Text Search等）。Photos/Details も個人利用規模なら同様
- 結論: **実質無料〜月数十円**。制約はコストでなくVercel Hobby Cronの1日1回制限
  → 朝刊=Cron、夕刊=正午以降の初回アクセス時にオンデマンド生成
- 2026年4月〜 Google側で強制支出上限・プリペイド請求が導入済み（安全装置として追い風）

## 7. 課金安全装置（フェーズ1の最初に実装）

1. 可能な限り請求先未登録のまま運用（無料ティア運用が基本）
2. Places API: Google Cloud Quotasで日次上限を手動設定
3. Gemini: 月間支出上限を設定
4. GCP予算アラート + 超過時の自動停止
5. APIキーはドメイン制限（Vercel本番ドメインのみ）
6. アプリ側でも日次のAPI呼び出しカウンタを持ち、閾値超過で当日の生成を停止

## 8. フェーズ分けロードマップ

**フェーズ1（まず動くものをデプロイ）**
1. Next.js雛形作成、v19のUIをタブごとにコンポーネント分割して移植
2. 課金安全装置の設定（APIキー作成前に上限設定）
3. Supabase接続（DataStore差し替え）+ GitHub Actions heartbeat
4. ダミーデータのままVercelへデプロイ → iPadで動作確認

**フェーズ2（AI連携）**
5. sourcesテーブル + 固定ソースの巡回と抽出（層1）
6. ブリーフ生成（朝刊Cron/夕刊オンデマンド、Grounding使用）
7. 旗フィードバック・KEEP率によるソーススコアリングと週次入れ替え（層2の発掘）
8. 興味の自動検出のGemini置換、URL登録のサーバー関数
9. Google Maps JavaScript API + Place Photos差し替え

**フェーズ3（外部連携・中長期）**
10. ライブ告知の毎日チェック、建築家作品のWikidata連携
11. カレンダー連携（ics生成→後にOAuth）
12. Spotify連携（Dev Mode: Premium必須・個人利用OK）、YouTube高評価のOAuth取得

## 9. 未解決・判断待ち事項

- 映画情報の取得源（公開APIなし。RSS/固定ソース巡回でどこまで拾えるか実装時に検証）
- PWAプッシュ通知（朝刊・夕刊の到着通知）を入れるか
- Physical/Financialトラッキング（要件定義4.4）は当面スコープ外
- Instagram連携は不採用と決定済み（本人判断）

## 10. Claude Codeへの移行方法（iPhoneのみで進める場合）

パソコンを使わず、iPhoneのSafariまたはClaudeアプリだけで進める場合は
**「Claude Code on the web」**（`claude.ai/code`）を使う。これはAnthropicのクラウド上で
セッションが動く方式で、ローカル環境が不要。「Remote Control」（PCがつけっぱなし前提の
遠隔操作機能）とは別物なので注意。

1. GitHubで空のリポジトリを作成し、`IMPLEMENTATION_HANDOFF.md` と `qol-app-v19.jsx` をアップロード
2. iPhoneで `claude.ai/code` を開く（またはClaudeアプリのCodeタブから）
3. GitHub連携で上記リポジトリを選び、セッションを開始
4. 以下を貼り付けて開始:

```
このフォルダの IMPLEMENTATION_HANDOFF.md を読んでください。
qol-app-v19.jsx が完成済みのUIプロトタイプです。
まずフェーズ1の1（Next.js雛形とUI移植）から始めてください。
進め方: 大きな変更の前に計画を説明し、私の確認を取ってから実装してください。
```
