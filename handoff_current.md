# 現在地（2026-08-25・第58巡）

現行仕様は `docs/project_knowledge.md` が正。経緯は `docs/archive/`。
このファイルは**常に200行以内**に保つ（更新手順は `CLAUDE.md` の「恒久ルール」）。

- ブランチ … `claude/brief-tab-bind-bugs-9ijd62`。
  ★**毎回 `main` へも push する**（2026-08-18にユーザー確定・確認不要）。
  `main` が Vercel の本番ブランチで、実機はここを見る。作業ブランチへ
  push しただけでは**実機に何も届かない**。

---

## いまどこにいるか

3つのアプリのうち**ブリーフ（EXPLORE）は実運用中**、タスクとジャーナルは
UI が出来た段階で、Cowork の仕分けとの往復はこれから。

第24巡でキーボード追従、第26巡でモーションの語彙、第33巡でデザインシステムを
正規化。第29〜36巡で「上下の帯」を解決（`docs/archive/shell-redesign-2026-08.md`
§56 — **同じ手を二度試さないこと**）。第38〜44巡の「縦の空間＋カメラ」4層は
★**第52巡に破棄**した。現行仕様は `docs/project_knowledge.md` §4。

---

## 直近で完了したこと（第58巡）— DRIFT の初回バグ／無重力／形そのものの的／物理的な ALIGN

### ★★実害 … DRIFT が初回に壊れて操作できない
1. **原因** … `AppShell` の `mountedApps` は `["life"]` から始まり、タスクの列は
   **画面の外**（`translateX(±100%)`）に居るときにアイドルで組まれる。
   タスクアプリの**既定タブは DRIFT**（`lib/apps.ts`）なので毎回この経路を通る。
   `DriftTab.fieldOf()` は**画面の座標を canvas の座標へ変換**するので、壁も図形も
   390px ずれた場所に置かれる。`ResizeObserver` は寸法しか見ないので直らない。
2. **直し** … ① `live` が false の間は**湧かせない**（溜めて `setActive(true)` で流す）
   ② `walls()` が**原点の差だけ図形を運ぶ**（`lastField`）ので、列がどこに居ても戻る
   ③ `setActive(true)` のたびに測り直す。

### 掴み・的
3. ★**掴んでいる間は無重力**（`engine.gravity.y = 0` → 離したら `GRAVITY_Y`）。
4. ★★**的は「形そのもの」**（黒い丸の台も影も無い。72px）。口は**唇だけ**の
   シルエット、ゴミ箱は**穴そのもの**。`hot` は形の色で応える。

### ALIGN
5. ★★**スクロールを「連鎖」に**。指は 1:1（第57巡はスクロールをバネにしたので
   「重い」だけだった）。**行ごとの弧長のバネ**の硬さを焦点からの距離で落とすと、
   中央と隣の間隔がまず縮み、それに次が追い…と伝わる。文字も同じバネを読む。
6. ★★**スクアッシュ＆ストレッチ／スミアー**。速度から**進む向きへ伸び直交へ縮み**、
   速いときは残像を3枚薄く重ねる（焼き直し無し）。
7. ★★**出が途中で消えるバグ**。2段目の引き渡しが**全員一律の時刻**だったので、
   道の手前へ引き戻されている後ろの図形はまだ画面の中で消えていた。**1つずつ**渡す。
8. ★**入りは行き過ぎてから戻る**（クランプをやめ、減衰を弱め、硬さを `frac` で散らす）。
9. ★半径 950→**700**、間隔 `PITCH_TIGHT` 72→**54** / `PITCH_SPREAD` 110→**124**。

### TIMELINE
10. ★**「自由」を図形と同じ寸法の板に**。字は高さ基準で、横は 0.62 まで詰めて
    コンデンス体として読ませる（曜日の `wdth 75` と同じ考え方）。
11. ★**横に送っている間だけ日付の縦線**（細線＋上に M/D。`--pan` で出し入れ）。
12. ★★**閉じるアニメーション**を開くときの鏡に。`dropAll()` で作り直すのをやめ、
    **同じ物体が**落ち続けて画面の下から山の上へ回り込む。最後に床を戻す。

### 検証
`tsc`/`eslint`/機械チェック4本/本番ビルド ✓。`scratchpad/r58.mjs`（13項目）が
**3回連続で全部OK** — DRIFT の初回に候補が画面の中に居る／掴んでいる間は落ちない／
的に台が無い／出が最後まで届く／連鎖（中央が先、外側が遅れる）／縦線の出入り／
自由の字が大きい／閉じるとき同じ図形が落ちて山になる。
目視は `scratchpad/w-*.png` と `v-1..5.png`（出のスミアーと伸び）。
★★**実機 Safari 未確認**。

### （参考）第52〜57巡の要点
第57巡: ALIGN の出を**1本の道**へ（`cine` の極端な緩急）。TIMELINE の落下を
**本当の物理**へ（回転を止めない・投入をばらす）。曜日を黒に。的を「作る」の丸から
出す＋近さ（`--near`）で口が開き穴が速く回る。
第56巡: ALIGN を「輪」から**ほぼ縦の列**へ。文字を水平に。曜日を引っ張れるように。
空いた日に「自由」。DRIFT の投げの上限（`clampDrift` の 1.0）が慣性を潰していた。
第55巡: 動きの土台を**バネ**(`lib/spring.ts`)へ。TIMELINE を**本物の落下**へ(床が
抜け、下へ出た図形をその日の列の真上へ引き上げる)。掴みを velocity 駆動に。
第54巡: ALIGN の向きを入れ替え（文字が円弧・図形は平行）、開閉の段取り、TIMELINE の
慣性と曜日タップの詳細、GRAVITY の掴み＋口/ゴミ箱（`DropTargets` へ共通化）、DRIFT が
タブ下へ潜る不具合（canvas は full-bleed で画面より大きい）と減速して止まる投げ。
第52巡: TOP/UNDER と縦のカメラを破棄し、タスク図形を GRAVITY 空間だけに集約。詳細
リストと俯瞰を「画面遷移」から「物理モード」へ。タブは DRIFT＋GRAVITY の2つ。
第53巡: 欧文を **Archivo**（幅 88%）へ。**スロット描画**（絵の中心をスロットへ置く）で
図形のズレを根治。残り日数は種類で大きさを決める（期日なしは `SOMEDAY`）。


## 次に着手すること

1. ★★**実機で確認してもらう**（第58巡ぶん）。**★DRIFT を開いた初回**（配置が
   おかしくないか）／**掴んでいる間の無重力**／**的の形**（唇と穴）／
   **ALIGN**（出のスミアーと伸び／スクロールの連鎖／入りの行き過ぎ）／
   **TIMELINE**（日付の縦線／自由の大きさ／閉じるときに同じ図形が落ちるか）。
   ★**ホーム画面から追加し直してから**見ること。
2. ★**TIMELINE のリスケジュール**（別の曜日レーンへドラッグして `dueDate` を書換）は
   未実装。レーンの器と当たり判定の層は揃っているので次はここ。
3. **触れる数字**（`GravityTab.tsx`）… 地面 `GROUND_LIFT`(32)・重力 `GRAVITY_Y`(1.4)、
   掴み `HOLD_MS`(150)・`GRAB_K`(0.34)/`GRAB_MAX`(34)、`EDGE_PX`(30)・`SWIPE_PX`(44)。
   ALIGN の出 `LEAD_GAP`(210)・`GAP_DECAY`(0.72)・`STREAM_GAP`(0.115)・
   `A_HANDOFF`(0.72)・`ENTRY_QUEUE`(74)・`D_IN`(0.12)、
   伸び `SQUASH_REF`(42)/`SQUASH_MAX`(0.55)、残像 `SMEAR_MIN`(9)/`_N`(3)/`_LEN`(0.9)/`_A`(0.34)。
   並び `ARC_R`(700)・`ARC_APEX_X`(96)・`PITCH_TIGHT`(54)/`PITCH_SPREAD`(124)・
   `ROW_H`(128)・`ALIGN_MAX_H`(132)/`_W`(176)・`FOCUS_BOOST`(1.25)・`TEXT_GAP`(100)・
   `alignMid`(0.34)・連鎖 `CHAIN`(0.72)/`CHAIN_MAX`(6)・`SCROLL_DECAY`(0.9)/`FLICK_K`(0.9)。
   TIMELINE `TL_FILL`(0.94)・`LANE_HEAD_H`(92)・`WALL_T`(16)・`RECYCLE_Y`(150)・
   `TL_SPAN`(240)・`TL_TRIGGER`(0.45)・`TL_STRETCH`(1.9)・`WORLD_FLING`(9)・
   `WD_WDTH`(75)/`WD_ADV`(0.62)・`GAP_W`(232)・`PAD_L`(20)・`LANES_VISIBLE`(3)・
   `FREE_FILL`(0.90)/`FREE_H`(0.62)/`FREE_SQUEEZE`(0.62)。
   バネの係数は `lib/spring.ts` の4つだけ。
   的（`DropTargets.tsx`）… `NEAR_R`(150)・`LEAN`(9)・`PAD`(14)・器 72px。
   DRIFT（`DriftTab.tsx`）… `W_RATIO`(0.34)/`W_MAX`(150)/`FIT_N`(6)・`DRIFT_AIR`(0.016)・
   `DRIFT_MAX`(26＝壁抜け止め)・`FLING`(1.0)・`FLICK_WINDOW`(90)。
   書体の幅は `app/globals.css` の `body { font-variation-settings }`。
4. **DRIFT を GRAVITY へ集約するか**（今回は2タブのまま。ユーザーと別途相談）。
5. **Cowork のプロンプト更新**（`COWORK-ROUTINES.md`）… 候補の `いつ` を**日付で
   書かせる**（YYYY-MM-DD。TIMELINE のレーンは `dueDate` で束ねる）。日付が無いと
   期日にならず `lib/inboxImport.ts` がメモへ回す。★**全文を提示して承認を得てから**。

## 未解決・持ち越し

- **実機 Safari の未検証** … 第33巡の見た目の変更全般、タスクアプリ全般、
  ジャーナルの円のドラッグとマイクの解放。
- ジャーナル・ウィッシュ・ストックの行先が未定（§38 のポスターも未着手）。
- **完成時に撤去** … `lib/taskDemo.ts`「デモを入れる」ボタン、`ProfileTab` の
  「ブリーフ生成の実験」、★「画面の数値を出す」
  （`lib/debugViewport.ts` / `components/tasks/ViewportProbe.tsx`）。
- `.tc-lamp` は `.press` の別名として当分残してある（既存の18箇所を一度に
  書き換えないため）。手が空いたら `.press` へ寄せて別名を消す。
- **左端→右スワイプ（ALIGN）が隣アプリへの横払いと混線しないか**実機で要確認。
- **DRIFT を GRAVITY へ集約するか**（今回は2タブのまま。別途相談）。

---

## いま触っている領域のファイル

★全体のファイル地図は `CLAUDE.md`。ここは**いま手を入れている所だけ**。

```
lib/constants.ts                   ★SANS/LATIN(Archivo+Noto Sans)／SWISS_*／NAV_BOTTOM_GAP
app/layout.tsx                     ★Archivo(axes:wdth)/Noto_Sans_JPの読み込み／statusBarStyle
components/CreateMenu.tsx          ★輪。閉じるアニメーション／半径配置(legibleAngle)
components/tabs/GravityTab.tsx     ★★タスク本体。物理モード(pile/align/timeline)・ジェスチャー・詳細DOM・曜日DOM
components/tasks/TaskSpace.tsx     ★薄い器。GRAVITY常時マウント＋DRIFTを重ねる＋固定Masthead
components/tasks/DropTargets.tsx   ★★口とブラックホール(DRIFT/GRAVITY 共通)。aimTargets(近さ)/targetAt
components/tabs/DriftTab.tsx       ★無重力の場(canvas+matter.js)。ホールド→口/ゴミ箱
app/globals.css                    ★body の wdth 88／.tl-band(曜日が伸びる --tl)／★user-select:none
lib/spring.ts                      ★★canvas の図形の動きの土台(バネ)。係数は4つ
lib/motion.ts                      ★T_CAM/EASE_CAM 撤去／surfaceOrigin の帰り先=右下の丸
components/tasks/TaskAddButton.tsx TaskAddButton本体を撤去。DemoSeedButtonのみ残る
lib/ground.ts                      地色。優先度つきの積み木・onGround・GROUND_EASE
components/AppShell.tsx            列の横スライド／タブバー／輪の入口／NAV_H
components/tasks/TaskComposer.tsx  入力画面。★板＋器の top/height 追従／LEAVE_MS
components/tasks/ViewportProbe.tsx ★開発用の数値表示（直ったら撤去）
```

## 検証の作法

```bash
# ★検証は必ず本番ビルドで（dev は next/font とプロキシの相性で真っ白になる）
# ★★フォントの取得が**時々失敗する**（Module not found: .../font/google/font）。
#   必ずリトライを噛ませ、**ログで成否を確かめる**こと（第52巡は古い .next を
#   掴んだまま検証して時間を溶かした）。★`pkill` 等が非0を返すと**以降の行が
#   走らない**シェルなので、掃除は `|| true` を付ける。
rm -rf .next
for i in 1 2 3 4 5; do NODE_OPTIONS=--use-env-proxy npm run build > /tmp/b.log 2>&1; \
  grep -q "Compiled successfully" /tmp/b.log && break; done
npx next start -p 3201

# ★目盛りが守られているかの機械チェック（4本とも CLAUDE.md に載せてある）
#   1・2・4 は 0件、3 は何も出ないのが正しい
```

Playwright は `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`、実体は
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`。ビューポートは **390×797**
（実機の `innerHeight`。★画面の物理サイズは 844 で、差の 47 が「下の帯」。
第35巡に `statusBarStyle: "default"` にしたので、実機の web ビューは画面の
下端まで届く。`innerHeight` は 797 のままなのでここは変えなくてよい）。
★**継続アニメーションのある要素は `locator.click()` が待ち続ける**ので、
`dispatchEvent` で `pointerdown`/`pointerup` を直接撃つこと。★`click` まで
撃たないこと — `Press` は**押した瞬間**に走るので、同じ操作が2回走って
開いたシートがすぐ閉じる（第34巡に `v6` で踏んだ）。出入りの最中は同じ器が
2枚居ることがあるので、`querySelectorAll` の**最後**を掴むこと。
★**タスクの新規作成は「作る」→「TASK」の2クリックが唯一の入口**
（第36巡に＋を撤去したため）。`button[aria-label="作る"]`は3アプリぶん
DOMに存在するので、`boundingBox().x`が画面内(0〜390)のものだけを選ぶこと
（`menu28.mjs`の`makeBtn()`が実装例）。

主な回帰（`scratchpad/`）… **`r58`（★DRIFT の初回・無重力・的の形・出が最後まで届く・
連鎖・日付の縦線・自由の大きさ・閉じる段取り）/ `r57`（地面・一筋の出と緩急・黒い
曜日・横スワイプ・落下の物理）/ `r56`（ALIGN の水平な文字と間隔・DRIFT の投げ）/
`r55`（選択が出ない・掴むと周りが動く）/ `drift54` / `modes53`**/
★`r58` の作法 … **タスクアプリの既定タブは DRIFT**なので、デモのタスクを入れる前に
必ず GRAVITY タブへ移ること(DRIFT のまま押すと隠れたボタンを叩いて何も入らない)。
`chin35`（上下の帯）/ `ground26`（地色）/ `motion26`（動き）/ `rect24`（器の追従）/
`menu28`（作るものの輪）/ `when25` `pop21` `when20` `tap` `geo4` `blink` `swipe`。
★`space38`/`bugs38`（4層カメラ前提）は無効。`modes52` は `modes53` が置き換えた。
`v5`〜`v15` のうち `v7` は既知の不具合で落ちたまま・`v9` は port 3000 決め打ち。
（scratchpad は gitignore。テストはローカルのみ）。

## ユーザー側の作業（アプリの外）

- Cowork に**毎晩のタスク「1日を仕分ける」**を設置する（例: 02:00 JST）。
- 任意: `OPENAI_API_KEY` を Vercel に登録すると文字起こしが Whisper 系になる。
