# 現在地（2026-08-24）

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
★**第38〜39巡でタスクアプリを「縦の空間＋カメラ」へ作り替え、4層すべてを
実装した**。仕様は `docs/project_knowledge.md` §4「縦の空間とカメラ」。

---

## 直近で完了したこと（第42巡）— カメラを per-layer の2Dへ ＋ UNDER に地表

ユーザーの3点の指摘（カメラの動きがイメージと違う／UNDER のシリンダーをやめ地表
と繋げる）に沿って作り直した。

1. ★★**カメラを per-layer の2Dへ**（`perspective`+`rotateX` をやめた。あれは
   「手前に倒れる板」に見えた）。4層を**各層の translateY＋scaleY**で動かし、
   「どちらから入り、どちらへ抜けるか」を層ごとに決める（`SCENES` の表）:
   - **GRAVITY→TOP** … 図形を落として消す → カメラが真下へティルト = **穴が下から
     上がってくる**（TOP を下から昇らせて scaleY で伸ばす）。
   - **TOP→UNDER** … 穴が**下へ消え** → 真横のカメラが地中へ潜る＝地面の断面
     （UNDER）が**上から降りてくる**。
   - 見下ろしの pitch は scaleY の圧縮で作る（3D は使わない）。二段の位相と床の
     開閉は従来どおり。ドラッグは `SCENES` を線形補間。
2. **UNDER に地表を足した**。画面上部に明るい帯（地表）＋**黒字で日付・曜日**、
   そこから穴の断面（グレー）が**地表と繋がって**降りる。**曜日の蓋は枠なしの
   テキスト**に。図形は幅を穴の太さに合わせて一律＝一段に一個。
3. Chromium で確認 … GRAVITY→TOP「穴が下から上がる」、TOP→UNDER「穴が下へ消え
   →地中が上から降りる」、UNDER の地表・断面・一段一個・枠なし曜日。

### 検証
`tsc` / `eslint` / 本番ビルド ✓、機械チェック4本 ✓、`space38`(13群)・`bugs38` を
per-layer 用に書き換えて全部OK。★実機 Safari 未確認（今回は 3D をやめたので古傷外）。

---

## 直近で完了したこと（第41巡・要点だけ）

遷移を二段に分け（`schedule()`。図形を落としてからカメラを向ける等。タブ操作の
ときだけ。ドラッグは同時）、UNDER をシリンダーから**抽象的なグレーの穴の断面**へ
（`UnderHole`。一段に一個・曜日の蓋）。★このときのカメラは `perspective`+`rotateX`
だったが、第42巡に per-layer の2Dへ差し替えた。

---

## 直近で完了したこと（第40巡・要点だけ）

カメラの pitch を `scaleY` から `perspective`+`rotateX` に変え、TOP をスイスの
カレンダー（月曜始まり・黒い穴・Helvetica）へ、UNDER を穴の中の姿へ初版。`HELV`
と `SWISS_XL/LG/MD` を constants に足した。★rotateX は第42巡に撤回（per-layer 2D）。

---

## 直近で完了したこと（第39巡・要点だけ）

★実機報告の2件（閉じたあと黒い丸が残る／上下スワイプが効かない）は**原因が1つ** ―
入力画面の `onClose` が `openId` を下ろさず `TaskComposer` が一度も外れなかった。
下ろすようにし、吸い込みの帰り先を右下の「作る」の丸へ、器に `touch-action: none`
（入力中と地中は auto）を置いて直した。タブを4つ化。★層の中の寸法は
`offsetWidth/offsetHeight` で測る（`getBoundingClientRect` は変形後の箱を返す）。

---

## 直近で完了したこと（第38巡・要点だけ）— 縦のカメラ

`TaskSpace`（縦のカメラの器）を新設。`--cam` を CSS 変数で駆動（state を通さ
ない）、層のあいだに空き（`LAYER_GAP` 0.4）、`--t-cam`(1400)/`--ease-cam`（対称の
S字）を語彙の例外として足した。DRIFT の円環を撤去し散らして浮かべる形へ
（経緯は `docs/archive/task-app-2026-08.md` §56）。札はカメラの器へ引き上げ、層は
`LayerName` を持つだけに。`AppShell` はタスクだけ `key` 固定・`tab-in` なし。
パン中は風（効果線）。

## 直近で完了したこと（第37巡・要点だけ）

GRAVITY の床がタブバーの裏に潜る実バグを直した（`navHeightPx()` の読み取り元）。
★iOS の `theme-color` は `default`/`black` では読まれず、上47pxの白い帯は
**ユーザー確定で許容**（これ以上追わない）。輪/タブの「点滅」は未特定
（Chromium で再現せず）。

---

## 次に着手すること

1. ★★**実機で確認してもらう**（第38〜42巡ぶんが未確認）。カメラの4つの動き
   （DRIFT↔GRAVITY／GRAVITY↔TOP で穴が下から／TOP↔UNDER で断面が上から）、
   カレンダー、UNDER の地表＋穴の断面＋一段一個。★第42巡で 3D をやめ 2D の
   translateY/scaleY だけにしたので、Safari の 3D の古傷からは外れているはず。
   ★**ホーム画面から追加し直してから**見ること。
2. **触れる数字**（`TaskSpace.tsx`／`:root`）… カメラの長さ `--t-cam`(1400ms)・
   位相 `PHASE_K`(0.72)／`DROP_MS`(540)・見下ろしの潰し `FS`(0.14)・逃がし量
   `OFF`(122)・スワイプ `SNAP_RATIO`(0.14)/`FLICK_V`(0.28)。
3. **輪の開閉・タブ切り替えの「点滅」を実機で切り分ける**。Chromium では
   再現しない。「どのタイミングで」「何色から何色へ」を具体的に聞く。
4. ★**`v7.mjs` が落ちるのを追う**（第33巡からの積み残し）。日程シートを開いた
   あと、器のキーボード判定が「閉じた」と誤解して入力画面ごと閉じているように
   見える。**実バグの可能性がある。**
5. **Cowork のプロンプト更新**（`COWORK-ROUTINES.md`）… 候補の項目を
   `いつ`（★**日付で書かせる**。YYYY-MM-DD）/ `道具・場所` / `持ち物` /
   `タグ`（英字5つ）へ揃える。日付で書かれないと期日にならず、
   `lib/inboxImport.ts` がメモへ回す。
   ★**プロンプトの全文を提示して承認を得てから**実装する。

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
- **層の名前（`LayerName`）の見え方**と、**地中から指で上へ戻る道の弱さ**
  （一覧が送れる間はカメラを掴めない。タブバーからは戻れる）は実機で要確認。

---

## いま触っている領域のファイル

★全体のファイル地図は `CLAUDE.md`。ここは**いま手を入れている所だけ**。

```
lib/constants.ts                   ★NAV_BOTTOM_GAP(比率式)／SANS(Helvetica+Noto Sans)
app/layout.tsx                     ★Noto_Sans_JPの読み込み／appleWebApp.statusBarStyle
components/CreateMenu.tsx          ★輪。閉じるアニメーション／半径配置(legibleAngle)
components/tasks/TaskSpace.tsx     ★★縦のカメラの器。層の並び・--cam・縦のドラッグ
components/tasks/LayerName.tsx     ★層の名前。層と一緒に流れる
components/tabs/DriftTab.tsx       ★浮遊の層。円環をやめ、ゆらいだ格子で散らす
components/tabs/GravityTab.tsx     地上の層。★床の開け閉め(floorOpen)
components/tasks/TopView.tsx       ★見下ろし。黒い穴のカレンダー(月曜始まり・Helvetica)
components/tasks/Underground.tsx   ★地中。左に穴の断面・右に一覧。黒地
components/tasks/UnderHole.tsx     ★穴の断面(抽象的なグレー帯)。一段一個＋曜日の蓋(matter.js)
app/globals.css                    ★.task-layer の transition(per-layer 2D)
lib/motion.ts                      ★surfaceOrigin の帰り先=右下の丸([data-create-anchor])
components/tasks/TaskAddButton.tsx TaskAddButton本体を撤去。DemoSeedButtonのみ残る
lib/ground.ts                      地色。優先度つきの積み木・onGround・GROUND_EASE
components/AppShell.tsx            列の横スライド／タブバー／輪の入口／NAV_H
components/tasks/TaskComposer.tsx  入力画面。★板＋器の top/height 追従／LEAVE_MS
components/tasks/ViewportProbe.tsx ★開発用の数値表示（直ったら撤去）
```

## 検証の作法

```bash
# ★検証は必ず本番ビルドで（dev は next/font とプロキシの相性で真っ白になる）
NODE_OPTIONS=--use-env-proxy npm run build && npx next start -p 3201

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

主な回帰（`scratchpad/`）… **`space38`（★4層のカメラ）/ `bugs38`（★実機報告の
2件: 吸い込みの行き先・上下スワイプ）**/
`chin35`（上下の帯）/ `ground26`（地色）/
`motion26`（動き）/ `rect24`（器の追従）/ `menu28`（作るものの輪。閉じる動き・
半径配置も含む）/ `probe31`（数値表示）/ `when25` `pop21` `when20` `tap`
`geo4` `v5`〜`v15`(`v9`はport 3000決め打ちで別件・`v7`は既知の不具合)
`blink` `bake` `swipe` `seam` `junk` `text` /
単体 `solid.test` `tag.test` `inbox.test`。
★`v7` は落ちたまま（上記「次に着手すること」）。
★`drift2`（円環の送り）は**第38巡に円環ごと無くなったので破棄**。
代わりが `space38` の [3]（候補が重ならずに浮いていること）。

## ユーザー側の作業（アプリの外）

- Cowork に**毎晩のタスク「1日を仕分ける」**を設置する（例: 02:00 JST）。
- 任意: `OPENAI_API_KEY` を Vercel に登録すると文字起こしが Whisper 系になる。
