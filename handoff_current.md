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

第24巡でキーボード追従を根から作り直し、第26巡でその上にモーションの語彙を
作り、第33巡でデザインシステムを正規化した（詳細は
`docs/archive/task-app-2026-08.md` §55）。第29〜36巡で「上下の帯」を
解決した（詳細は `docs/archive/shell-redesign-2026-08.md` §56 — 4巡分の
間違いと教訓を残してある。同じ手を二度試さないこと）。第36巡でタスクの
追加口を輪（`CreateMenu`）へ一本化し、基本フォントを統一した。第37巡で
GRAVITYの床(navHeightPx)の実バグを直し、iOSの`theme-color`無効の仕様を確定。
★**第38巡でタスクアプリを「縦の空間＋カメラ」へ作り替えはじめた**（2段階の
第1段階が完了）。仕様は `docs/project_knowledge.md` §4「縦の空間とカメラ」。

---

## 直近で完了したこと（第38巡）— タスクアプリの縦のカメラ・第1段階

ユーザー確定: **4タブへ増やす / DRIFTは浮遊する図形へ作り直す /
落下はタスクアプリに居るときだけ / 2段階（カメラ→新画面）で進める**。

1. **`components/tasks/TaskSpace.tsx` を新設**（縦のカメラの器）。DRIFT と
   GRAVITY を1本の縦の空間へ積み、タブでも指でもカメラが上下する。
   `--cam` は CSS カスタムプロパティで駆動（React の state を通さない）。
   3D 変形は使わない（`translateY` だけ）。
2. **DRIFT の円環カバーフローを撤去**し、**散らして浮遊する形**へ作り直した。
   散らし方は「ゆらいだ格子」。★ずらす量は**マス1つの寸法**に掛けること
   （器の幅に掛けて右端が画面外へ出た。直した）。円環の経緯と教訓は
   `docs/archive/task-app-2026-08.md` §56 へ退避。
3. **アプリ名の札（`Masthead`）をカメラの器へ引き上げ**、層の側は
   `LayerName.tsx`（DRIFT / GRAVITY）を持つだけにした。札が2枚すれ違うのを防ぐ。
4. **`AppShell` のタスクアプリだけ `key` を固定し `tab-in` を外した**。
   タブごとに作り直すと matter.js の山が毎回崩れる。
5. **輪から作ったタスクは、タスクアプリを見ているときだけ GRAVITY へ降りる**
   （`saveNewTask`）。落下そのものは既存の `makePiece` がやっている。
6. ★**入力画面が開いている間はカメラを掴ませない**ガードを入れた。
   オーバーレイは器の内側に出るので、素通しだとカレンダーをなぞるたびに
   空間ごと動いた（ガードを外して**試験が赤くなることも確認済み**）。

### 検証したこと

`tsc` / `eslint` / 本番ビルド ✓、機械チェック4本 ✓。
新規 `scratchpad/space38.mjs`（8群24項目）全部OK — 層の積み方・札が1枚で
カメラの外・候補が重ならず浮く・タブでの上下・指での追従と吸着・行き止まりの
抵抗・**床がタブバーの上端と一致**・入力画面中はカメラが動かない。
★**実機は未確認**。

---

## 直近で完了したこと（第37巡・要点だけ）

1. **GRAVITYの床がタブバーの裏に潜っていた＝実バグ、直した**。
   `navHeightPx()` が `--nav-h` を `documentElement` から読んでいたが、この
   カスタムプロパティは `[data-app-shell]` に立っている（祖先からは常に空文字が
   返り、`96px` のフォールバックへ毎回落ちていた）。実機では本来 ≈132px。
2. ★★**iOSの`theme-color`は`default`/`black`では一切読まれない**（Apple公式の
   既知の制限）。上47pxの白い帯は**iOSの制約**で、**ユーザー確定で許容**。
   ★これ以上この件を追わないこと。
3. **輪の開閉・タブ切り替えの「点滅」は未特定**（Chromiumでは再現しない）。

---

## 次に着手すること

1. ★★**第1段階を実機で確認してもらう**（縦のカメラ・DRIFT の浮遊）。
   ここが通ってから第2段階へ進む、という段取りでユーザーと合意している。
   ★**ホーム画面から一度消して追加し直してから**見ること。
2. ★**第2段階 — TOP VIEW と UNDERGROUND**。設計は
   `docs/project_knowledge.md` §4「縦の空間とカメラ」の表と、
   計画（`/root/.claude/plans/`）にある。要点:
   - `lib/apps.ts` を4タブへ（`tasks-top` / `tasks-under`）。
     `TASK_LAYERS`（`TaskSpace.tsx`）と**並びを必ず揃える**。
   - `components/TabIcons.tsx` に `holes` / `strata` を足す（面だけで描く）。
   - GRAVITY→TOP VIEW は「床を外す→図形が落ちて消える→`scaleY` のすり替え」。
     ★`rotateX` は使わない。
   - TOP VIEW の日付は `GeoType`（0-9対応）、穴の濃淡は件数、日付の組み立ては
     `WhenSheet` の `ymd()` を使う。
   - UNDERGROUND は `clip-path` の円で穴から広げ、地色は `pushGround`。
3. **輪の開閉・タブ切り替えの「点滅」を実機で切り分ける**。Chromiumでは
   再現しない。「どのタイミングで」「何色から何色へ」を具体的に聞く。
4. ★**`v7.mjs` が落ちるのを追う**（第33巡からの積み残し）。日程シートを開いた
   あと、器のキーボード判定が「閉じた」と誤解して入力画面ごと閉じている
   ように見える。**実バグの可能性がある。**
5. **Cowork のプロンプト更新**（`COWORK-ROUTINES.md`）… 候補の項目を
   `いつ`（★**日付で書かせる**。YYYY-MM-DD）/ `道具・場所` / `持ち物` /
   `タグ`（英字5つ）へ揃える。日付で書かれないと期日にならず、
   `lib/inboxImport.ts` がメモへ回す。
   ★**プロンプトの全文を提示して承認を得てから**実装する。
   （2026-08-23に一度提案したが、ユーザーから「先に上下の帯を直して」と
   保留された。次に着手してよい。）

---

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
- **層の名前（DRIFT / GRAVITY）の見え方は実機で要確認**。設定の丸のすぐ下に
  置いてあり、Chromium では収まっているがセーフエリアが効く実機では詰まる
  可能性がある（`components/tasks/LayerName.tsx`）。

---

## いま触っている領域のファイル

★全体のファイル地図は `CLAUDE.md`。ここは**いま手を入れている所だけ**。

```
lib/constants.ts                   ★NAV_BOTTOM_GAP(比率式)／SANS(Helvetica+Noto Sans)
app/layout.tsx                     ★Noto_Sans_JPの読み込み／appleWebApp.statusBarStyle
components/CreateMenu.tsx          ★輪。閉じるアニメーション／半径配置(legibleAngle)
components/tasks/TaskSpace.tsx     ★★縦のカメラの器。層の並び・--cam・縦のドラッグ
components/tasks/LayerName.tsx     ★層の名前(DRIFT/GRAVITY)。層と一緒に流れる
components/tabs/GravityTab.tsx     地上の層。★navHeightPx()の読み取り元を修正(第37巡)
components/tabs/DriftTab.tsx       ★浮遊の層。円環をやめ、ゆらいだ格子で散らす
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

主な回帰（`scratchpad/`）… **`space38`（★縦のカメラ。第38巡）**/
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
