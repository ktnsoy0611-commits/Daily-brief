-- デイリーブリーフ Supabase スキーマ（フェーズA / 2026-07-13）
--
-- 適用方法: Supabaseプロジェクトの SQL Editor にこの全文を貼って実行する。
-- 冪等（IF NOT EXISTS / DROP POLICY IF EXISTS）なので、追記しながら再実行してよい。
--
-- 設計方針（HANDOFF-CURRENT.md §8.1-2 / SYSTEM-DESIGN.md §8）:
--   - 利用者は本人1名。RLSは auth.uid() 一致のみ許可（マジックリンク認証）。
--   - クライアントの状態(AppState)は「トップレベルキーごとの行」に分割して
--     保存する(app_state テーブル)。キー単位で行が分かれるため、サーバー
--     (Vercel Cron)が briefs 行だけを更新してもクライアントが持つ items 等の
--     行と物理的に衝突しない(Postgresの行単位MVCC)。完全正規化(§8.1-2で不採用)
--     の実装量・型二重管理を避けつつ、1行jsonb(Cronと衝突)も避ける中間解。
--   - 「キーごとにテーブルを分ける」という記述の実体はこの「キーごとの行」。
--     書き込み分離という本来の目的は行分割で完全に満たせるため、物理テーブルの
--     乱立は避けた。
--
-- ※ フェーズC/D で使うサーバー主導テーブル(sources/discovery_log/
--    content_cache 等)はこのファイル末尾にまとめてあるが、フェーズAでは
--    app_state と context_notes と api_usage だけがあれば動く。

-- ---- 拡張 ----------------------------------------------------------------
-- pgvector（SYSTEM-DESIGN.md §3-8 のベクトル類似度スクリーニングで使う。
-- フェーズD で本格利用するが、拡張の有効化だけ先にしておく）
create extension if not exists vector;

-- ---- app_state: クライアント状態のキーごと分割保存 -----------------------
create table if not exists app_state (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,                     -- AppStateのトップレベルキー
                                         -- (items/wishes/briefs/magazine/profile/
                                         --  weekendMeta/goals/pendingReview/sources/
                                         --  bindLog/shelfOrder)
  value jsonb,                           -- そのキーの値(配列/オブジェクト/null)。
                                         -- AppState.magazine等、値そのものが
                                         -- 正当にnullになりうるためnot nullに
                                         -- しない(not nullにすると、その行を
                                         -- 送るたびにPostgRESTが「空は許さない」
                                         -- 制約違反=400で書き込み全体を拒否する)。
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
-- 既存プロジェクトに前バージョンのスキーマを適用済みの場合、上のcreate table
-- は素通りするため、この行が実際の修正を行う(冪等)。
alter table app_state alter column value drop not null;

alter table app_state enable row level security;
drop policy if exists app_state_owner on app_state;
create policy app_state_owner on app_state
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- context_notes: Coworkが夜間に蒸留した文脈の受け渡し先 ---------------
-- (SYSTEM-DESIGN.md §8。フェーズAではテーブル定義だけ用意し、書き手
--  (Cowork Routine)が現れるまで空のまま。ブリーフ生成は「あれば読む」)。
create table if not exists context_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'digest',   -- digest/calendar/advice 等
  body text not null,
  meta jsonb default '{}',
  created_at timestamptz not null default now()
);
alter table context_notes enable row level security;
drop policy if exists context_notes_owner on context_notes;
create policy context_notes_owner on context_notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- api_usage: 課金安全装置(初期定義書§7-6)の日次呼び出しカウンタ -------
-- サーバー側の生成処理が1日の呼び出し回数を積み、閾値超過で当日の生成を停止する。
create table if not exists api_usage (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null default current_date,
  provider text not null,                -- 'gemini' / 'places' / 'grounding'
  count int not null default 0,
  primary key (user_id, day, provider)
);
alter table api_usage enable row level security;
drop policy if exists api_usage_owner on api_usage;
create policy api_usage_owner on api_usage
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- 以下はフェーズC/Dで使うサーバー主導テーブル。フェーズAの動作には不要だが、
-- 後からのマイグレーションを避けるため目標スキーマとしてここに置いておく。
-- (実際に読み書きが始まるのは各フェーズ。RLSは同じく本人のみ)
-- =========================================================================

-- sources: 情報源プールの完全版(score/origin/prior/淘汰。クライアントの
-- 薄い Source 型とは別物。サーバーだけが score 等を書く)
create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  url text not null,
  label text,
  type text default 'html',              -- rss/html
  origin text not null,                  -- user/auto/fixed
  interests jsonb default '[]',
  score real default 0,                  -- KEEP率で加点・旗で減点
  prior real default 0,                  -- ソース審査(§3-7)由来のバンディット事前分布
  discovered_via text,                   -- search/traversal/domain_promotion
  added_at timestamptz not null default now(),
  last_crawled_at timestamptz
);
alter table sources enable row level security;
drop policy if exists sources_owner on sources;
create policy sources_owner on sources
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- discovery_log: カード化前のURL+原文抜粋の恒久ログ(SYSTEM-DESIGN.md §7-1)
create table if not exists discovery_log (
  url text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  excerpt text,                          -- 原文抜粋(1500字程度)
  source_id uuid references sources(id) on delete set null,
  domain text,
  embedding vector(768),                 -- pgvectorでの類似度スクリーニング用
  outcome text,                          -- carded/keep/skip/flag/unused
  fetched_at timestamptz not null default now(),
  primary key (user_id, url)
);
alter table discovery_log enable row level security;
drop policy if exists discovery_log_owner on discovery_log;
create policy discovery_log_owner on discovery_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- content_cache: 巡回で抽出した候補の一時バッファ(生成の材料)
create table if not exists content_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id uuid references sources(id) on delete cascade,
  payload jsonb not null,                -- {title,url,date_start,date_end,area,summary}
  fetched_at timestamptz not null default now()
);
alter table content_cache enable row level security;
drop policy if exists content_cache_owner on content_cache;
create policy content_cache_owner on content_cache
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
