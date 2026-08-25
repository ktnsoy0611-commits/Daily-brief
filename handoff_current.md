# 現在地（2026-08-25・第57巡）

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

## 直近で完了したこと（第57巡）— 一筋の道・本当の物理・口とブラックホール

### 地面
1. ★`GROUND_LIFT`(32px) ぶん床を上げた。★**床の出どころは `floorYOf(h)` だけ**。
   ★DOM の曜日の帯（`BAND_BOTTOM`）も**同じだけ**上げること（片方だけ上げて、
   図形が帯から浮いた所で積まれるのを踏んだ）。

### ALIGN
2. ★★**出を「1本の道」へ作り直した**。第55巡は図形ごとに別々のベジエ＋蛇行だったので
   **一筋にまとまる瞬間が構造的に無かった**。全部が同じ道（`streamAt`）を通り、
   走りながら道へ吸い寄せられ（`join`）、道の上の間隔が等間隔へ揃う（`conv`）。
3. ★★進みを **`cine(t) = t³/(t³+(1-t)³)`**（遅→速→遅）に。両端で傾きがほぼ 0。
   ★canvas の図形の座標系だけの道具（バネと同じ扱い）。CSS へは持ち込まない。
4. ★入口は**番号ぶん円弧の下**（`ENTRY_QUEUE`）。同じ点から一斉に上がると団子になる。
   2段目を始めるのは `A_HANDOFF`(0.72)＝図形が完全に画面の外に居る所。
5. ★円弧の半径 1400 → **950**（左右の振れ 41px）。
6. ★★**スクロールを指と 1:1 にやめた**。指は目標だけを動かし、位置は**バネが追う**。
   動き出しに粘りが出て、離したあとは投げ→整数の位置へバネが収める。

### TIMELINE
7. ★**曜日を黒に**（今日だけ RUST）。薄墨の階調（`gradeInk`）は捨てた。
8. ★★**引き上げが指に追従する** … `--tl` を `move` の中で直接書く（rAF を待つと
   1フレーム遅れ、速い払いで置いていかれる）。離すときは**指の速さをバネの初速へ**。
9. ★★★**落下を本当に GRAVITY と同じにした** … `setInertia(Infinity)` を全部やめ、
   図形は落ちながら転がり傾いたまま積まれる。**投入もばらした**（同じ高さ・速度0・
   角度0で入れると隣同士が寸分違わず同じ速さで落ちて**アニメーションに見える**）。
10. ★★**横スワイプが引き戻されない** … 離した瞬間に最寄りへ丸めていたので、
    半レーンの払いは必ず元へ戻っていた。**投げを先に伸ばしてから**レーンを決める。
11. ★「自由」の字の大きさを**語によらず1つ**に（いちばん長い語に合わせる）。

### 口とブラックホール（`DropTargets`）
12. ★★**作るボタンから分離して出てくる**（`createAnchorRect()` で測った差を
    `--ox`/`--oy` へ）。★的自身を `getBoundingClientRect` で測らないこと（自分の
    変形ぶんずれる）。★`--ox` を入れてから1フレーム置いて `.in` を付ける。
13. ★★**近さを連続値で持つ**（`aimTargets` → `--near`）。真偽だけでは「近づけると」が
    作れない。
14. ★口は**上下の唇**。近づくと開き、指の方へ少し寄る。常にわずかに呼吸している。
15. ★ゴミ箱は**ブラックホール**。降着円盤が逆向きに回り、近づくと速く回って塵が舞う。
    速い回転は既存の環境ループの**比**で作る（新しい時間を足さない）。

### 検証
`tsc`/`eslint`/機械チェック4本/本番ビルド ✓。`scratchpad/r57.mjs`（17項目）が
**3回連続で全部OK** — 地面／一筋にまとまる／遅→速の緩急／スクロールの慣性／
黒い曜日／move 直後の追従／引っ張って戻る／半レーンで次へ進む／落下が物理／
自由の字が同じ／的が作るボタンから出る・近づくと回転が速く塵が出る。
目視は `scratchpad/z-*.png`（各画面）と `s-1..5.png`（ALIGN の出の途中）。
★★**実機 Safari 未確認**。

### （参考）第52〜56巡の要点
第56巡: ALIGN を「輪」から**ほぼ縦の列**へ（間隔は中央だけ広い）。文字を水平に。
曜日を引っ張れるように＋幅の軸で縦長に。日付なしを落とす。空いた日に「自由」。
DRIFT の投げの上限（`clampDrift` の 1.0）が慣性を潰していたのを直した。
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

1. ★★**実機で確認してもらう**（第57巡ぶん）。**ALIGN**（出が一筋にまとまるか／
   遅→速→遅の緩急／スクロールの慣性）／**TIMELINE**（曜日が指に追従して伸びるか／
   落下が物理に見えるか／横スワイプで引き戻されないか）／**口とブラックホール**
   （作るボタンから出る／近づくと口が開いて寄る・穴が速く回って塵が舞う）。
   ★**ホーム画面から追加し直してから**見ること。
2. ★**TIMELINE のリスケジュール**（別の曜日レーンへドラッグして `dueDate` を書換）は
   未実装。レーンの器と当たり判定の層は揃っているので次はここ。
3. **触れる数字**（`GravityTab.tsx`）… 地面 `GROUND_LIFT`(32)、掴み `HOLD_MS`(150)・
   `GRAB_K`(0.34)/`GRAB_MAX`(34)、ジェスチャー `EDGE_PX`(30)・`SWIPE_PX`(44)。
   ALIGN の出 `LEAD_GAP`(210)・`GAP_DECAY`(0.72)・`STREAM_GAP`(0.115)・
   `A_HANDOFF`(0.72)・`ENTRY_QUEUE`(74)、並び `ARC_R`(950)・`ARC_APEX_X`(96)・
   `PITCH_TIGHT`(72)/`PITCH_SPREAD`(110)・`ROW_H`(128)・`ALIGN_MAX_H`(132)/`_W`(176)・
   `FOCUS_BOOST`(1.25)・`TEXT_GAP`(100)・焦点の高さ `alignMid`(0.34)・`FLICK_K`(0.9)。
   TIMELINE `TL_FILL`(0.94)・`LANE_HEAD_H`(92)・`WALL_T`(16)・`RECYCLE_Y`(150)・
   `TL_SPAN`(240)・`TL_TRIGGER`(0.45)・`TL_STRETCH`(1.9)・`WORLD_FLING`(9)・
   `WD_WDTH`(75)/`WD_ADV`(0.62)・`GAP_W`(232)・`PAD_L`(20)・`LANES_VISIBLE`(3)・
   `FREE_FILL`(0.80)。バネの係数は `lib/spring.ts` の4つだけ。
   的（`DropTargets.tsx`）… `NEAR_R`(150)・`LEAN`(9)・`PAD`(14)。
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
- ジャーナル・ウィッシュ・ストックの行先が未定／1日の終わりに3アプリを
  1枚のポスターへプレスする（§38）は未着手。
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

主な回帰（`scratchpad/`）… **`r57`（★地面・一筋の出と緩急・スクロールの慣性・黒い
曜日・追従・横スワイプ・落下の物理・自由の大きさ・口とブラックホール）/
`r56`（ALIGN の水平な文字と間隔・自由のブロック・DRIFT の投げ）/ `r55`（選択が
出ない・掴むと周りが動く・曜日タップ）/ `drift54` / `modes53`**/
`chin35`（上下の帯）/ `ground26`（地色）/ `motion26`（動き）/ `rect24`（器の追従）/
`menu28`（作るものの輪）/ `when25` `pop21` `when20` `tap` `geo4` `blink` `swipe`。
★`space38`/`bugs38`（4層カメラ前提）は無効。`modes52` は `modes53` が置き換えた。
`v5`〜`v15` のうち `v7` は既知の不具合で落ちたまま・`v9` は port 3000 決め打ち。
（scratchpad は gitignore。テストはローカルのみ）。

## ユーザー側の作業（アプリの外）

- Cowork に**毎晩のタスク「1日を仕分ける」**を設置する（例: 02:00 JST）。
- 任意: `OPENAI_API_KEY` を Vercel に登録すると文字起こしが Whisper 系になる。
