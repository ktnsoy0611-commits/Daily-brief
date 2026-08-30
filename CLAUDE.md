@AGENTS.md

# 読むもの（必要なときだけ開く）

- `docs/project_knowledge.md` … **現行仕様の正**。設計・データモデル・守るべき約束。
- `handoff_current.md` … いまどこにいるか。直近完了・次の一手・重要パス（200行以内）。
- `docs/archive/*.md` … 経緯と教訓。**全文を読まない。`grep` で必要な節だけ**。
  コード内コメントの `HANDOFF §N` はここの節番号を指す。§5・§7.x=`ui-binder`、
  §8.x=`brief-pipeline`、§9〜§31・§50・§51・§56・§65〜§67=`shell-redesign`、
  §38〜§49=`journal-voice`、§52・§53=`task-app`。
- `design.md` … **UI の規約の正**。文字・余白・配色・動きの表と、機械チェック13本。
- `SYSTEM-DESIGN.md` … 生成パイプラインの設計思想。
- `COWORK-ROUTINES.md` … Cowork に渡すプロンプト（アプリ側は読まない）。

# AIへの絶対ルール（最優先・厳守）

## ★★★0. UI に触るなら `design.md` を必ず開く（セッションをまたいで厳守）

**コンポーネント・CSS・トークンのどれかに1行でも触れる前に `design.md` を読むこと。**
記憶や過去の会話に頼らない。セッションが切れても、この規約は生き続ける。

作業を**終える前に**、`design.md` §5 の**機械チェック13本を必ず走らせる**。
**#1〜#7・#10〜#13 は 0 件**でなければ終わってはいけない。
0 にできない値があるなら、それは**目盛りの外**（`design.md` §6）なので、
**その行に `// ★目盛りの外（理由）` を書く**。**印の無い例外は例外ではない。**

★守るべきことの要点（詳細と数値はすべて `design.md`）:
1. 生の数字を書かない … 余白 `SPACE` / 文字 `TYPE` / 行間 `LEAD` / 字間 `TRACK` /
   太さ `WEIGHT` / 角丸 `RADIUS`（`lib/tokens.ts`）、色は `lib/constants.ts`。
2. **左右のパディングはページ最上位の器だけが持つ**（入れ子で増幅させない）。
3. `fontSize` と `fontWeight` は必ず同時に書く。和文に欧文の字間を当てない。
4. 動きは曲線4本・時間の4分割から引く。**押下だけが非対称**（即座に沈み、ゆっくり戻る）。
5. **見た目が変わる変更は、事前に文面を提示して承認を得てから**行う。
6. 検証は**移行前後の computed style を突き合わせ、「比較できた件数」を必ず出す**
   （件数を出さない検証は、検証していないのと区別がつかない）。

## 1. 漠然とした指示の受け方

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
- `components/CreateMenu.tsx` — タブバー右端の丸から広がる輪
  （RECORD / TASKS / SETTING。**文字だけ・半径の線上**）。
  **タスクの追加も設定もどのアプリからでもここから**（第68巡に歯車を廃止）。
- `lib/apps.ts` — アプリとタブの定義（**タブ構成の正**）。

## ブリーフ（EXPLORE）
- `components/tabs/BriefTab.tsx` — カードのデッキ（右=KEEP / 左=SKIP）。
- `components/tabs/StockTab.tsx` — 候補の一覧・追加シート・ウィッシュ一覧。
- `components/tabs/ExecuteTab.tsx` — 地図（Leaflet）・プラン生成・4ドメインの棚。
- `components/tabs/GoalsTab.tsx` — ゴールのバインダーとチェックイン。
- `components/tabs/ProfileTab.tsx` — 設定（好み・情報源・サインアウト・開発用の実験）。
  入口は**右下の輪の SETTING だけ**（`CreateMenu`）。
- ★`components/tabs/DevStageTab.tsx` — **開発用の `DEV` タブ**（第70巡）。中身は
  「**券**」＝版面の見本帳と「**場**」＝券と鋏の3D。**実機で見るためだけ**に在る。
  ★★★**タブバーの高さは `navHeightPx()` から引く。自分で測らない**（`.app-nav` の
  矩形は `NAV_H` と一致しない ―― Chromium 81px／実機 132px。第71巡に踏んだ）。
  ★★Explore の刷新が本物になったら、このファイル／`components/explore/samples/`／
  `lib/apps.ts` の `life-dev`／`lib/types.ts` の `LifeTabId`／
  `components/TabIcons.tsx` の `ticket` を**まとめて消す**。
- ★`components/explore/samples/` — **券の版面の見本帳**（第71巡）。参照4枚の作法を
  1案1ファイルで写した A〜F ＋ 共通部品 `TicketParts.tsx` ＋ 一覧 `index.ts`。
  ★★**選ばれた1案を `Ticket.tsx` へ畳んだら、ディレクトリごと消す。**
- ★**刷新中の部品**（`/dev/explore` と `DEV` タブにしか無い。4タブは手つかず）…
  `components/explore/Ticket.tsx`（券）/ `PunchMark.tsx`（鋏痕）/ `lib/ticket.ts`、
  改札鋏（★**three.js／WebGL**。第17巡に SVG の自前投影をやめた）…
  `components/explore/Nipper.tsx`（画角・器・動き）／`NipperViews.tsx`（三面図。開発用）
  ＋ `lib/nipperMesh.ts`（**立体の作り方**。面取り・厚み・針金・段の当て方）
  ＋ `lib/nipperRig.ts`（**組み立てと光**。本番と三面図が同じものを見るための1か所）。
  ★★**鋏の形は `lib/nipperShape.ts` が正**。ただし**2段の生成物で、手で直さない**
  ―― 平面図4枚 → `tools/trace-nipper.mjs` → `lib/nipperShapeRaw.ts`（**生**のトレース）
  → `tools/clean-nipper.mts` → `lib/nipperShape.ts`（**整えた**形。立体はこれを読む）。
  パスの語彙（型と `L`/`A`/`piece`）は `lib/nipperPath.ts`（唯一の手書き）。
  **形を直すときは図を描き直すか、整理の規則の目盛りを直して走らせ直す。**
  元データは `docs/archive/nipper-shape-21.ts` に凍結（誰も import しない。消さない）。
  目で数値を打ち込んでいた 9〜15巡目はプロポーションが合わなかった。
  設計の正は `docs/explore-redesign.md`。
  ★★券と鋏を**同じ3D空間**に置く器 … `components/explore/TicketStage.tsx`
  （**券の面は「深さだけ書く板」**なので、下に敷いた DOM の券がそのまま見える
  ＝版面は劣化しないのに、鋏が券の奥へ回れば隠れる）。
  ★禁じられているのは **CSS の 3D 変形**であって WebGL ではない（design.md 冒頭）。

## タスク（TASK）
**タスク図形は常に GRAVITY 空間にだけ在る**（第52巡に TOP/UNDER の4層を破棄）。
別画面へ遷移せず、スワイプで**GRAVITY の物理法則を一時的に変える**ことで詳細リスト
（ALIGN）と俯瞰（TIMELINE）を見せる。タブは DRIFT（候補）＋ GRAVITY の2つで、
**GRAVITY＝地上／DRIFT＝上空**を**2Dのカメラ**が縦に送る（第62巡）。
- `components/tabs/GravityTab.tsx` — **タスクの本体**。matter.js の山（pile）と、
  **3つの物理モード**（`pile` / `align` / `timeline`）。左端→右スワイプで ALIGN
  （**左に円弧**で図形が並び、右に文字。中央が大きく、上下スワイプで回る）、
  **上**スワイプで TIMELINE（**地面から巨大な曜日が指に連れて伸び**、図形が
  日付レーンへ下から詰まる）、**下**スワイプで**効果線を伴って DRIFT へ**
  （DRIFT からは**上**スワイプで戻る）。★山は**表に出るたびに落とし直す**（毎回ちがう並び）。
  その日の**日付と曜日の英語**も、枠の無い黒い文字の板として一緒に落ちる。
  ★★モード中は **body の位置で描かない** — レイアウトが決めた**スロットへ絵の中心を
  置く**（`ox/oy` 補正をやめたのがズレの根治。詳しくは `docs/project_knowledge.md` §4）。
  ★山では**長押しで図形を掴んで運べる**（すぐ動かすとスワイプ）。口=完了/ゴミ箱=削除。
- `components/tasks/TaskSpace.tsx` — **カメラ**。**GRAVITY＝地上／DRIFT＝上空**を
  縦に積み、器ごと `translateY` で送る（`--cam`）。効果線は**パンの半ば**だけ。
  画面に固定した `Masthead`（TASK）もここ。
- `components/tasks/LayerName.tsx` — 層の名前（GRAVITY / ALIGN / TIMELINE / DRIFT）。
- `components/tasks/DropTargets.tsx` — **口とブラックホール**（掴んでいる間だけ
  「作る」の丸から分離して出る）。DRIFT と GRAVITY の共通部品。当たり判定 `targetAt`、
  **近さ** `aimTargets`、合図 `fireTarget` もここ。
- `components/tabs/DriftTab.tsx` — 候補が**無重力で漂う**層（1枚の canvas＋matter.js）。
  ホールドで図形を運び、右下から出る**口＝完了 / ゴミ箱＝削除**へ落とす（第44巡）。
  上スワイプで**カメラが地上の GRAVITY へ**。★★**場は自分の寸法だけで決める**
  （画面の座標を測らない。列が動くとずれる。第61巡に根治）。
- `components/tasks/` — `TaskComposer`（入力画面。ツールバー＋ポップオーバー）/
  `WhenSheet`（日程。**ここだけキーボードを閉じる**）/ `ComposerToolbar` /
  `ComposerFields`（重要度・タグ・テキスト）/ `Popover`（器と `Press`＝押せる面）/
  `TimeRange`（時刻。タイムラインで範囲を選ぶ）/
  `SolidCanvas` /
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
- `lib/spring.ts` — **canvas の図形だけの動きの土台（バネ＝減衰振動）**。係数は4つ。
  CSS の transition には使わない。
- `lib/scroll.ts` — **スクロールの語彙はここだけ**（指の 1:1 ＋投げ＋減衰＋最寄りへ吸着）。
  強さを触るのは `SCROLL_GAIN` と `FLICK_K` の2つだけ。いまは ALIGN の縦送りが使う。
- `lib/motion.ts` — **動きの語彙（曲線4本・時間5つ・＋の丸の場所）**。
  CSS 側は `app/globals.css` の `:root`。数字はこの2つだけ。増やさない。
  JS のタイマーは `ms(T_OUT)` のようにここから引く（数字を書き写さない）。
- `lib/viewportKick.ts` — iOS の起動直後だけ画面が縮む不具合への対処（未確証）。
  ★**画面の上下の帯**は別件で、`statusBarStyle: "default"` で解決済み（第35巡）。
- `lib/ground.ts` — **画面の地色（html の背景 ＋ theme-color）を知っている唯一の場所**。
  背景が途切れたらここを見る。全画面の面を作ったら `pushGround` を呼ぶ。
- ★`lib/printGrain.ts` — **券の「印刷の粒」を知っている唯一の場所**（第71巡）。
  `tools/make-grain.mjs` → `public/print-grain.webp`（128px 角）。
  ★★**1画像画素 = 1デバイス画素**で敷く（`background-size: 128 / dpr`）。等倍だと
  3x の実機で粒が3倍に太る。★濃さは**タイルの中央**（247）で決める ―― 不透明度で
  薄めると地ごと沈む。★★下の**クラフト紙とは別物**。混ぜない（券は板紙、図形は切った紙）。
- `lib/paperTexture.ts` — **クラフト紙の目を知っている唯一の場所**。図形と文字の面に
  だけ**焼き込む**（`lib/solidPaint.ts` が焼くときに1度だけ。毎フレームの負荷はゼロで、
  図形が回れば紙も回る）。強さは **`PAPER_ALPHA`**（既定 0.12）の1つだけ。
  ★**中身は本物の写真**（`public/paper-kraft.webp` … 768px角1枚・83KB。
  ユーザーの撮ったクラフト紙を**等倍で切っただけ**＝加工しない）。絵ごとに
  **4向き×ずらし**が当たるので、繰り返しに見えない。乗せるのは**凹凸だけ**（無彩色）。
  作り直すときは `tools/make-paper.py` を使う（元の写真はリポジトリに無い）。
  ★★**縮小しないこと**（紙の目は高周波なので消える）。軽くしたいときは品質を下げる。
- `lib/briefPipeline.ts` `lib/deckStyle.ts` `lib/planPipeline.ts` `lib/taskSuggest.ts` — 生成。
  ★ブリーフの取得は **Jina → 直接**の2段（第64巡）。**失敗は必ず HTTP コードごと
  `SiteTrace` に残す** — 残さなかったせいで6日間の停止に気づけなかった。
  ★★**Jina に鍵を送らない**（鍵ありはトークンを消費して必ず尽きる。鍵なしは
  20 RPM だがトークン無制限＝永久に無料）。18 RPM に絞る仕掛けと締切は
  `jinaSlot` / `JINA_PACE_BUDGET_MS`。単体チェックは `npx tsx tools/jina-check.mjs`。
- `lib/myBrainPaths.ts` — **my-brain のパスを知っている唯一の場所**。`myBrain.ts` / `myBrainWrite.ts` / `myBrainSyncClient.ts`。

## サーバー関数（app/api）
- `cron/build-brief` 夜間生成 / `generate-brief` 実験 / `generate-plan` / `transcribe` / `suggest-subtasks` / `resolve-place` / `mybrain/*`。

# デザインシステム（2026-08-23・第33巡に確定）

## 目標

**Awwwards の「Site of the Day」級の UI/UX。** そこへ届く道は、汎用の UI キットで
見た目を揃えることではなく、**自分の語彙をひとつも破らないこと**。手で作った顔
（`GeoType` の幾何アルファベット / `SolidCanvas` の図形 / matter.js / Leaflet）が
このアプリの価値なので、それを平均的な見た目へ寄せる変更はしない。

## 守ること

★**規約の正は `design.md`** … 文字（`TYPE`×太さ・行間・字間）／余白／配色／
動き（曲線4本・時間の4分割）の表と、**機械チェック13本**。作業の前後に走らせる。
寸法の段（`SPACE`/`TYPE`/`RADIUS`）と目盛りの外の例外は
`docs/project_knowledge.md` §3。**この2つ以外に UI の規約を書かない。**

★★**iOS の「上下の帯」は解決済み。触らないこと**（第35〜37巡）。
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
