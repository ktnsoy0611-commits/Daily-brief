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
- **欧文は Archivo**（可変フォント。幅は `body` の `font-variation-settings: "wdth" 88`、
  太さは使う場所で指定）、**和文は Noto Sans JP**。`SANS` / `LATIN`（旧 `HELV`）は
  `lib/constants.ts`。★`app/layout.tsx` で `weight` を固定で渡さないこと。

# ファイル地図

## 骨格
- `components/AppShell.tsx` — 3アプリの横スライド・タブ・共有state・ダッシュボードの司令塔。
- `components/AppBackdrop.tsx` — アプリごとの地色（`groundOf` が唯一の出どころ）。
- `components/Dashboard.tsx` — 下から引き上げる引き出し。「今日を終える」。
- `components/CreateMenu.tsx` — タブバー右端の丸から広がる輪（RECORD / TASK）。
  **タスクの追加はどのアプリからでもここから**。
- `lib/apps.ts` — アプリとタブの定義（**タブ構成の正**）。

## ブリーフ（EXPLORE）
- `components/tabs/BriefTab.tsx` — カードのデッキ（右=KEEP / 左=SKIP）。
- `components/tabs/StockTab.tsx` — 候補の一覧・追加シート・ウィッシュ一覧。
- `components/tabs/ExecuteTab.tsx` — 地図（Leaflet）・プラン生成・4ドメインの棚。
- `components/tabs/GoalsTab.tsx` — ゴールのバインダーとチェックイン。
- `components/tabs/ProfileTab.tsx` — 設定（好み・情報源・サインアウト・開発用の実験）。

## タスク（TASK）
**タスク図形は常に GRAVITY 空間にだけ在る**（第52巡に TOP/UNDER と縦のカメラを破棄）。
別画面へ遷移せず、スワイプで**GRAVITY の物理法則を一時的に変える**ことで詳細リスト
（ALIGN）と俯瞰（TIMELINE）を見せる。タブは DRIFT（候補）＋ GRAVITY の2つ。
- `components/tabs/GravityTab.tsx` — **タスクの本体**。matter.js の山（pile）と、
  **3つの物理モード**（`pile` / `align` / `timeline`）。左端→右スワイプで ALIGN
  （**左に円弧**で図形が並び、右に文字。中央が大きく、上下スワイプで回る）、
  下→上スワイプで TIMELINE（**地面から巨大な曜日が指に連れて伸び**、図形が日付レーンへ
  下から詰まる）。逆方向のスワイプで山へ戻る。
  ★★モード中は **body の位置で描かない** — レイアウトが決めた**スロットへ絵の中心を
  置く**（`ox/oy` 補正をやめたのがズレの根治。詳しくは `docs/project_knowledge.md` §4）。
  ★山では**長押しで図形を掴んで運べる**（すぐ動かすとスワイプ）。口=完了/ゴミ箱=削除。
- `components/tasks/TaskSpace.tsx` — **薄い器**。GRAVITY を常時マウント（山を保つ）、
  DRIFT タブのときだけ上に重ね、画面に固定した `Masthead`（TASK）を持つだけ。
- `components/tasks/LayerName.tsx` — 層の名前（GRAVITY / ALIGN / TIMELINE / DRIFT）。
- `components/tasks/DropTargets.tsx` — **口とゴミ箱**（掴んでいる間だけ右下から出る）。
  DRIFT と GRAVITY の共通部品。当たり判定 `targetAt` と合図 `fireTarget` もここ。
- `components/tabs/DriftTab.tsx` — 候補が**無重力で漂う**層（1枚の canvas＋matter.js）。
  ホールドで図形を運び、右下から出る**口＝完了 / ゴミ箱＝削除**へ落とす（第44巡）。
- `components/tasks/` — `TaskComposer`（入力画面。ツールバー＋ポップオーバー）/
  `WhenSheet`（日程。**ここだけキーボードを閉じる**）/ `ComposerToolbar` /
  `ComposerFields`（重要度・タグ・テキスト）/ `Popover`（器と `Press`＝押せる面）/
  `TimeRange`（時刻。タイムラインで範囲を選ぶ）/
  `SolidCanvas` / `ViewToggle` /
  `ViewportProbe`（★開発用の数値表示。`lib/debugViewport.ts` と対。直ったら撤去）。
  タスクの追加は`CreateMenu`（タブバー右端の輪）からのみ（第36巡に＋を撤去）。
  `TaskAddButton.tsx`は動作確認用の`DemoSeedButton`だけが残っている。
- `lib/solid.ts` `lib/solidPaint.ts` `lib/textFit.ts` `lib/taskSize.ts` `lib/taskTags.ts` — 図形・描画・寸法・タグ。

## ジャーナル（JOURNAL）
- `components/VoiceStudio.tsx` — 録音・トリミングのダイヤル・物理キー（録音UIはここ1つ）。
- `components/tabs/RecordTab.tsx` / `JournalTab.tsx` — レコード / 今日・アーカイブ。
- `lib/audioTrim.ts` `lib/dayRecords.ts` — 音声の切り出し・1日分の組み立て。

## 共通UI
- `components/Button.tsx` — **押せる面はここだけ**。`Button`（離上で走る／variant・size）と
  `Press`（入力画面専用。押した瞬間に走る）。
- `components/common.tsx` — `PosterCard` / `Masthead` / `SectionLabel`。
- `components/GeoType.tsx` — 幾何アルファベット。`components/TabIcons.tsx` — 面で描いたアイコン。
- `components/BottomSheet.tsx` / `PlanSelectionBar.tsx` / `PlanGenerateSheet.tsx` / `AddWishSheet.tsx` / `SignInGate.tsx` / `LeafletMap.tsx` / `Binder.tsx`（ゴールのみ）。

## データ・ロジック
- `lib/types.ts` — **データモデルの正**。`lib/constants.ts` — 色・書体・部品の寸法。
- `lib/tokens.ts` — **余白・文字・角丸の目盛り（`SPACE`/`TYPE`/`RADIUS`）**。
  数字が不揃いに見えたらここを見る。増やさない。
- `lib/helpers.ts`（`domainOf`/`hasPlace`）/ `lib/dataStore.ts`（永続化・`SERVER_OWNED_KEYS`）/ `lib/supabaseClient.ts`。
- `lib/motion.ts` — **動きの語彙（曲線4本・時間5つ・＋の丸の場所）**。
  CSS 側は `app/globals.css` の `:root`。数字はこの2つだけ。増やさない。
  JS のタイマーは `ms(T_OUT)` のようにここから引く（数字を書き写さない）。
- `lib/viewportKick.ts` — iOS の起動直後だけ画面が縮む不具合への対処（未確証）。
  ★**画面の上下の帯**は別件で、`statusBarStyle: "default"` で解決済み（第35巡）。
- `lib/ground.ts` — **画面の地色（html の背景 ＋ theme-color）を知っている唯一の場所**。
  背景が途切れたらここを見る。全画面の面を作ったら `pushGround` を呼ぶ。
- `lib/briefPipeline.ts` `lib/deckStyle.ts` `lib/planPipeline.ts` `lib/taskSuggest.ts` — 生成。
- `lib/myBrainPaths.ts` — **my-brain のパスを知っている唯一の場所**。`myBrain.ts` / `myBrainWrite.ts` / `myBrainSyncClient.ts`。

## サーバー関数（app/api）
- `cron/build-brief` 夜間生成 / `generate-brief` 実験 / `generate-plan` / `transcribe` / `suggest-subtasks` / `resolve-place` / `mybrain/*`。

# デザインシステム（2026-08-23・第33巡に確定）

## 目標

**Awwwards の「Site of the Day」級の UI/UX。** そこへ届く道は、汎用の UI キットで
見た目を揃えることではなく、**自分の語彙をひとつも破らないこと**。手で作った顔
（`GeoType` の幾何アルファベット / `SolidCanvas` の図形 / matter.js / Leaflet）が
このアプリの価値なので、それを平均的な見た目へ寄せる変更はしない。

## ★入れないもの（2026-08-23にユーザー確定）

| もの | 入れない理由 |
|---|---|
| **shadcn/ui・Tailwind** | shadcn は Tailwind + Radix が前提。このプロジェクトは**全インライン style**。加えて中身の大半は canvas と自作 SVG で、汎用キットの効く面が少ない。**目盛り（`lib/tokens.ts`）と `Button` を自前で持つ方が、揃う度も個性も上**。 |
| **Framer Motion** | そもそも入っていない。要求されがちなイージング `[0.16,1,0.3,1]`・Stagger・押下 0.1s 以内は**すでに CSS の語彙にある**。バンドルを増やす理由が無い。 |
| **`layoutId`（共有要素）** | 第27巡に**実機の不具合で撤去済み**。矩形を要素へ焼き付けるので、`visualViewport` に追従する入力画面と寸法の持ち主が二重になる。理由は `lib/motion.ts` の冒頭。 |

## 守ること

1. **寸法は `lib/tokens.ts` から引く。** `SPACE`（4の倍数）/ `TYPE`（7段）/
   `RADIUS`（4段＋pill＋circle）。生の数字を書かない。例外は
   `docs/project_knowledge.md` §3「寸法の語彙」に挙げた3つだけ。
2. **入力欄は `TYPE.lead`(16) 以上。** 15 以下だと iOS が勝手に拡大する。
3. **動きは `app/globals.css` の `:root` と `lib/motion.ts` から引く。**
   曲線4本・時間5つ・環境ループ5つ。**新しい数字を足さない。**
   直書きの `cubic-bezier` と `0.3s` を書かない。対称な `ease` / `ease-in-out` は
   環境ループ以外で使わない。CSS の 3D 変形（`perspective`/`rotateX/Y`）も使わない。
   ★第52巡に**縦のカメラを撤去**し、カメラ専用の `--t-cam` / `--ease-cam` と
   `perspective`+`rotateX` の例外も**無くなった**。GRAVITY の物理モード（ALIGN/
   TIMELINE）の動きは既存の語彙（`--t-item`/`--t-in`/`--ease-*`）と matter.js の
   アトラクタで作る（力の係数は matter の座標系なので生数字でよい）。
4. **JS のタイマーは `ms(T_OUT)` のように語彙から引く。** 数字を書き写すと、
   CSS だけ変えたときに閉じ切る前に消える。
5. **押せる面は `components/Button.tsx`。** 入力画面は `Press`、それ以外は
   `Button`。押下は「即座に沈み（`--t-press`）、ゆっくり戻る（`--t-out`）」。
6. **視覚的階層** … `primary` は1画面に1つ。並び立つ選択肢は `secondary`、
   取り消し・あとでは `ghost`、図だけは `icon`（`aria-label` 必須）。
7. ★★**iOS の「上下の帯」は解決済み。触らないこと**（第35〜37巡）。
   `apple-mobile-web-app-status-bar-style` は **`default`**
   （`black-translucent` は画面の下 47px がどの要素からも塗れなくなる）。
   タブバーが下がるぶんは `NAV_BOTTOM_GAP` が `env(safe-area-inset-bottom)`
   を比率で使って吸収する（`env(safe-area-inset-top)` は `default` では 0
   になり使えない）。★★上 47px は**常に固定の白地に黒文字**（iOS の制約で
   `theme-color` を一切読まない。`default`/`black` は静的固定、動的に色を
   追従できるのは `black-translucent` だけであり、それは下の帯の復活と
   両立しない）。**ユーザー確定で「白い帯は許容する」**（2026-08-23）。
   これ以上この件を追わないこと。
   ★**`position: fixed` の面を伸ばして下の帯を埋めようとしないこと** —
   第34巡に試して実機で1pxも動かなかった。詳しくは
   `docs/project_knowledge.md` §3「iOS のホーム画面アプリ『上下の帯』」。

## 目盛りが守られているかの機械チェック

作業を終える前に走らせる。1・2・4 は**0件**、3 は**何も出ない**のが正しい。

```bash
# 1. 語彙を迂回した cubic-bezier（lib/ground.ts の GROUND_EASE だけは例外）
grep -rn "cubic-bezier" components lib --include=*.tsx --include=*.ts | grep -v "var(--"
# 2. 直書きの時間を含む transition
grep -rnE 'transition[A-Za-z]*: *"[^"]*[0-9]+m?s' components app --include=*.tsx | grep -v "var(--"
# 3. 目盛りに無い fontSize（TYPE.* 以外の生の数字）
grep -rhoE 'fontSize: [0-9.]+' components app --include=*.tsx | sort | uniq -c
# 4. globals.css の直書きの時間
grep -nE 'transition[^;]*[0-9]+m?s|animation[^;]*[0-9]+m?s' app/globals.css | grep -v "var(--"
```

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
