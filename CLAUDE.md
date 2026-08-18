@AGENTS.md

# 読むもの（必要なときだけ開く）

- `docs/project_knowledge.md` … **現行仕様の正**。設計・データモデル・守るべき約束。
- `handoff_current.md` … いまどこにいるか。直近完了・次の一手・重要パス（200行以内）。
- `docs/archive/*.md` … 経緯と教訓。**全文を読まない。`grep` で必要な節だけ**。
  コード内コメントの `HANDOFF §N` はここの節番号を指す。§5・§7.x=`ui-binder`、
  §8.x=`brief-pipeline`、§9〜§31・§50・§51=`shell-redesign`、
  §38〜§49=`journal-voice`、§52・§53=`task-app`。
- `SYSTEM-DESIGN.md` … 生成パイプラインの設計思想。
- `COWORK-ROUTINES.md` … Cowork に渡すプロンプト（アプリ側は読まない）。

# AIへの絶対ルール（最優先・厳守）

ユーザーは**非エンジニア**であり、ファイル名やディレクトリ構造を把握していない。
漠然とした指示（例:「タスクのカードがおかしい」「設定画面を直して」）を受けたら:

1. **いきなりプロジェクト全体を検索しない**（grep・フルスキャン・広範な読み込み禁止）。
2. **まず下の「ファイル地図」で当たりをつける**。
3. 仮説に基づき、**必要最小限のファイルだけを開いてから**作業を始める。
4. 仮説が外れたと分かった時点で初めて、対象を絞った検索に切り替える。

# コミュニケーションスタイル

- 前置き・言い訳・過剰な相槌を挟まない。「〜だと思われます」より「原因は〜」。
- バグは CSS の微調整で誤魔化さず、**根本原因を特定してから**直す。対症療法は即座に見抜かれる。
- 実装後は必ず動作確認する（Playwright でのスクリーンショット／数値確認が定石）。
- 技術的な判断の理由（トレードオフ）は書く。ユーザーは「なぜその設計か」を尋ね返す。
- ユーザーは実機 iPhone で最終確認する。Chromium で問題なくても実機で直っていないことがある。
- **デザイン・文言の変更、AI のプロンプトの変更は、事前に文面を提示して承認を得てから**行う。
- Tailwind 不使用（すべてインライン style）。コミットメッセージは日本語で「何をなぜ」。

# ファイル地図

## 骨格
- `components/AppShell.tsx` — 3アプリの横スライド・タブ・共有state・ダッシュボードの司令塔。
- `components/AppBackdrop.tsx` — アプリごとの地色（`groundOf` が唯一の出どころ）。
- `components/Dashboard.tsx` — 下から引き上げる引き出し。「今日を終える」。
- `lib/apps.ts` — アプリとタブの定義（**タブ構成の正**）。

## ブリーフ（EXPLORE）
- `components/tabs/BriefTab.tsx` — カードのデッキ（右=KEEP / 左=SKIP）。
- `components/tabs/StockTab.tsx` — 候補の一覧・追加シート・ウィッシュ一覧。
- `components/tabs/ExecuteTab.tsx` — 地図（Leaflet）・プラン生成・4ドメインの棚。
- `components/tabs/GoalsTab.tsx` — ゴールのバインダーとチェックイン。
- `components/tabs/ProfileTab.tsx` — 設定（好み・情報源・サインアウト・開発用の実験）。

## タスク（TASK）
- `components/tabs/GravityTab.tsx` — 落として積む（matter.js）。
- `components/tabs/DriftTab.tsx` — 候補の円環カバーフロー。
- `components/tasks/` — `TaskComposer`（入力画面。ツールバー＋ポップオーバー）/
  `WhenSheet`（日程。**ここだけキーボードを閉じる**）/ `ComposerToolbar` /
  `ComposerFields`（重要度・タグ・テキスト）/ `Popover`（器と `Press`＝押せる面）/
  `TimeRange`（時刻。タイムラインで範囲を選ぶ）/
  `SolidCanvas` / `ViewToggle` / `TaskAddButton`。
- `lib/solid.ts` `lib/solidPaint.ts` `lib/textFit.ts` `lib/taskSize.ts` `lib/taskTags.ts` — 図形・描画・寸法・タグ。

## ジャーナル（JOURNAL）
- `components/VoiceStudio.tsx` — 録音・トリミングのダイヤル・物理キー（録音UIはここ1つ）。
- `components/tabs/RecordTab.tsx` / `JournalTab.tsx` — レコード / 今日・アーカイブ。
- `lib/audioTrim.ts` `lib/dayRecords.ts` — 音声の切り出し・1日分の組み立て。

## 共通UI
- `components/common.tsx` — `PosterCard` / `Masthead` / `SectionLabel`。
- `components/GeoType.tsx` — 幾何アルファベット。`components/TabIcons.tsx` — 面で描いたアイコン。
- `components/BottomSheet.tsx` / `PlanSelectionBar.tsx` / `PlanGenerateSheet.tsx` / `AddWishSheet.tsx` / `SignInGate.tsx` / `LeafletMap.tsx` / `Binder.tsx`（ゴールのみ）。

## データ・ロジック
- `lib/types.ts` — **データモデルの正**。`lib/constants.ts` — 色・寸法・書体。
- `lib/helpers.ts`（`domainOf`/`hasPlace`）/ `lib/dataStore.ts`（永続化・`SERVER_OWNED_KEYS`）/ `lib/supabaseClient.ts`。
- `lib/ground.ts` — **画面の地色（html の背景 ＋ theme-color）を知っている唯一の場所**。
  背景が途切れたらここを見る。全画面の面を作ったら `pushGround` を呼ぶ。
- `lib/briefPipeline.ts` `lib/deckStyle.ts` `lib/planPipeline.ts` `lib/taskSuggest.ts` — 生成。
- `lib/myBrainPaths.ts` — **my-brain のパスを知っている唯一の場所**。`myBrain.ts` / `myBrainWrite.ts` / `myBrainSyncClient.ts`。

## サーバー関数（app/api）
- `cron/build-brief` 夜間生成 / `generate-brief` 実験 / `generate-plan` / `transcribe` / `suggest-subtasks` / `resolve-place` / `mybrain/*`。

# 恒久ルール（全セッション厳守）

## ★配布（2026-08-18にユーザー確定・確認不要）

**毎回 `main` へ push する。**ユーザーへの確認は要らない。

`main` は **Vercel の本番ブランチ**で、ユーザーはここから実機（iPhone の
ホーム画面に追加した PWA）で確認する。**作業ブランチへ push しただけでは
実機に何も届かない。** 第9〜11巡はこれで3巡ぶん届いていなかった。

作業ブランチへ push したら、続けて必ず:

```
git checkout main && git merge --ff-only <作業ブランチ> && git push -u origin main
```

ユーザーが「変更が確認できません」と言ったら、まず `git log --oneline origin/main -1`
で `main` の先頭を疑うこと。

## 作業を終えるたびに必ず行う後始末
コードやドキュメントに変更を加えたら、**コミットの前に**必ず次の3つを行う。
省略しない。「次のセッションでやる」は禁止（引き継がれずに必ず腐る）。

1. **選別** … `handoff_current.md` を読み、価値の無くなった記述を消す。
   - 完全削除: 一時的な実行ログ、測定値の羅列、撤回されて跡形も無い案、会話のつなぎ。**アーカイブせず捨てる。**
   - 退避: 「なぜそう設計したか」「同じ轍を踏まないための教訓」がある記述は `docs/archive/` の該当ファイルへ移す。
2. **追記** … 今回確定した仕様・設計判断は `docs/project_knowledge.md` の該当章へ**追記ではなく上書き**で反映する（同じ話題の古い記述を残さない）。
3. **更新** … `handoff_current.md` を「いまどこにいるか / 直近完了（1行ずつ） / 次の一手 / 未解決 / 重要パス」の形に書き直す。**常に200行以内**。

この `CLAUDE.md` のファイル地図も、ファイルを増減させたら同時に直す。
実在しないファイルを指したまま放置しない。

## トークン節約
- **部分読み取りの徹底** … ファイル全体を出力（`cat` 等）しない。必ず `grep` / `head` / `tail` / `sed -n 'X,Yp'` で必要な箇所だけ読む。
- **ソースコードの分割** … 1ファイルが200〜300行を超えたら、UIコンポーネントやユーティリティを別ファイルへ分割する。
- **ログ出力の抑制** … 長大な出力やエラーが予想されるコマンドは `> /tmp/.../x.log 2>&1` へ逃がし、そのログを `grep` で絞って読む。
