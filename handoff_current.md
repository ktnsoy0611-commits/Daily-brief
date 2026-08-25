# 現在地（2026-08-25）

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

第24巡でキーボード追従を根から作り直し、第26巡でモーションの語彙を作り、
第33巡でデザインシステムを正規化した（`docs/archive/task-app-2026-08.md` §55）。
第29〜36巡で「上下の帯」を解決（`docs/archive/shell-redesign-2026-08.md` §56 —
同じ手を二度試さないこと）。第36巡で追加口を輪へ一本化。第37巡で GRAVITY の
床の実バグを直し、iOS の `theme-color` 無効を確定。
第38〜44巡でタスクアプリを「縦の空間＋カメラ」＋4層（DRIFT/GRAVITY/TOP/UNDER）
にしたが、★**第52巡にそれを大きく作り替えた**（下記）。現行仕様は
`docs/project_knowledge.md` §4「GRAVITY の物理モード」。

---

## 直近で完了したこと（第55巡）— 動きを「バネと物理」で作り直し

1. ★★**掴みが他の図形をすり抜けていた**（実機で発覚）… `setStatic` ＋ `setPosition`
   の瞬間移動をやめ、**`setVelocity` で指へ運ぶ**。動く物体のままなので周りを
   押しのけて山が崩れる。掴んでいる間は `enableSleeping = false`（眠っている物体は
   当たり判定が起きない）。離した勢いはそのまま投げに残る。
2. ★**長押しで iOS の選択メニューが出ていた** … `app/globals.css` の `html, body` に
   `user-select: none` / `-webkit-touch-callout: none`。入力欄だけ `text` へ戻す。
3. ★★**動きの土台を「バネ」にした**（新規 `lib/spring.ts`）… `t/持ち時間` の補間は
   全部が同時に始まり同時に止まるので安っぽい。canvas の図形と物理の座標系だけ
   減衰振動で解く。係数は4つ（`K_TRAVEL`/`D_TRAVEL`/`K_SETTLE`/`D_SETTLE`）。
   ★**CSS の transition は従来どおり曲線4本・時間5つのまま。**
4. ★★**ALIGN の出入りを作り直した** … 3次ベジエの**パス**に沿い、遅れの間隔を
   **減衰**させて（`LEAD_GAP × GAP_DECAY^i`）**最初の1つがぽつんと動き、あとは
   次々と流れ出す**。接線に直交する**蛇行**（`MEANDER·4u(1-u)·sin`）は中ほどで振れ、
   出口では消えて一列に揃う。進みはバネなので慣性が出る。
5. ★★★**TIMELINE を本物の落下に作り直した**（今回いちばん大きい）…
   指の動きに落下を対応させない。**指は合図**で、伸びが閾値を超えたら
   **GRAVITY の床が抜け**、山はそのまま重力で落ちる。画面の下へ出た図形を
   **その日の列の真上へ引き上げて離す**（`recycle`）ので、「落ちながら、すでに落ちた
   図形が上から順に振り分けられる」がそのまま出る。レーンごとの床と壁を静的な物体で
   置き、図形は**物理で下から積み上がる**。
   - ★**当たり判定の層**（`CAT_*`/`setFilter`）… 落下中はレーンの器をすり抜ける。
     これが無いと床を抜いた瞬間にその場で受け止められ、振り分けが起きない。
     ★`fromVertices` の複合 body は**各 `part`** の filter を見る（親だけでは効かない）。
   - ★列に入ったら `setInertia(Infinity)` で回らなくする（傾くと曜日の列が読めない）。
   - **日付の無いタスクは出さない**。図形を大きく（レーン幅の 0.94）。
6. ★**曜日をたたくと** … たたいた曜日が**左端＋`PAD_L`(20)** へ来て、**曜日の間隔が
   空き、その隙間に詳細**が出る。隙間と横スクロールは**どちらもバネ**で、`laneLeft(i)`
   が器・図形・曜日の札・詳細の**唯一の出どころ**（CSS の transition で札だけ別に
   動かすとズレる）。
7. ★**曜日の濃さを「画面での位置」で決めるようにした** … 絶対の日付番号で決めていた
   ので、横へ送ると全部が薄墨になって読めなかった。今日だけ `RUST`。

### 検証
`tsc`/`eslint`/機械チェック4本/本番ビルド ✓。`scratchpad/r55.mjs`（14項目）全部OK —
選択が出ない／掴むと周りが動く／ALIGN の出がぽつぽつ減る（＝連なり）／TIMELINE が
落ちてレーンに積む／曜日タップで左端＋20 と隙間の詳細／横スワイプ／下へ払うと山へ。
目視は `scratchpad/x-*.png`（落下の途中・着地後・詳細）と `a-1..6.png`（ALIGN の出）。
★★**実機 Safari 未確認**。

### （参考）第52〜54巡の要点
第54巡: ALIGN の向きを入れ替え（文字が円弧・図形は平行）、開閉の段取り、TIMELINE の
慣性と曜日タップの詳細、GRAVITY の掴み＋口/ゴミ箱（`DropTargets` へ共通化）、DRIFT が
タブ下へ潜る不具合（canvas は full-bleed で画面より大きい）と減速して止まる投げ。
第52巡: TOP/UNDER と縦のカメラを破棄し、タスク図形を GRAVITY 空間だけに集約。詳細
リストと俯瞰を「画面遷移」から「物理モード」へ。タブは DRIFT＋GRAVITY の2つ。
第53巡: 欧文を **Archivo**（幅 88%）へ。**スロット描画**（絵の中心をスロットへ置く）で
図形のズレを根治。残り日数は種類で大きさを決める（期日なしは `SOMEDAY`）。


## 次に着手すること

1. ★★**実機で確認してもらう**（第55巡ぶん）。**掴んだ図形が他を押しのけるか**／
   **長押しで選択メニューが出ないか**／**ALIGN の出**（1つ→ずらずら→蛇行→一列）／
   **TIMELINE**（床が抜けて落ち、上から曜日ごとに振り分けられて積む／曜日タップで
   左端＋余白と隙間の詳細／横スワイプ）。★**ホーム画面から追加し直してから**見ること。
2. ★**TIMELINE のリスケジュール**（別の曜日レーンへドラッグして `dueDate` を書換）は
   未実装。レーンの器と当たり判定の層は揃っているので次はここ。
3. **触れる数字**（`GravityTab.tsx`）… 掴み `HOLD_MS`(150)・`GRAB_K`(0.34)/
   `GRAB_MAX`(34)・`FLING`(0.6)、ジェスチャー `EDGE_PX`(30)・`SWIPE_PX`(44)。
   ALIGN の出入り `LEAD_GAP`(210)・`GAP_DECAY`(0.72)・`MEANDER`(46)・`WAVES`(1.35)、
   円弧 `ARC_R`(290)・`ARC_APEX_X`(88)・`ROW_H`(112)・`ALIGN_MAX_H`(104)/`_W`(148)・
   `FOCUS_BOOST`(0.72)・`TEXT_GAP`(96)。
   TIMELINE `TL_FILL`(0.94)・`LANE_HEAD_H`(92)・`WALL_T`(24)・`RECYCLE_Y`(150)・
   `TL_SPAN`(240)・`TL_TRIGGER`(0.45)・`GAP_W`(232)・`PAD_L`(20)・`LANES_VISIBLE`(3)。
   バネの係数は `lib/spring.ts` の4つだけ。
   DRIFT（`DriftTab.tsx`）… `W_RATIO`(0.34)/`W_MAX`(150)/`FIT_N`(6)・`DRIFT_AIR`(0.016)。
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
components/tasks/DropTargets.tsx   ★口とゴミ箱(DRIFT/GRAVITY 共通)。targetAt/fireTarget
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

主な回帰（`scratchpad/`）… **`r55`（★選択が出ない・掴むと周りが動く・ALIGN の連なり・
TIMELINE の落下と積み・曜日タップ・横スワイプ）/ `r54`（掴んで口へ＝完了・文字が円弧・
焦点）/ `drift54`（★DRIFT が床の上・中央・減速して止まる）/ `modes53`（書体・
黒い棒の再発防止・曜日の指追従）**/
`chin35`（上下の帯）/ `ground26`（地色）/ `motion26`（動き）/ `rect24`（器の追従）/
`menu28`（作るものの輪）/ `when25` `pop21` `when20` `tap` `geo4` `blink` `swipe`。
★`space38`/`bugs38`（4層カメラ前提）は無効。`modes52` は `modes53` が置き換えた。
`v5`〜`v15` のうち `v7` は既知の不具合で落ちたまま・`v9` は port 3000 決め打ち。
（scratchpad は gitignore。テストはローカルのみ）。

## ユーザー側の作業（アプリの外）

- Cowork に**毎晩のタスク「1日を仕分ける」**を設置する（例: 02:00 JST）。
- 任意: `OPENAI_API_KEY` を Vercel に登録すると文字起こしが Whisper 系になる。
