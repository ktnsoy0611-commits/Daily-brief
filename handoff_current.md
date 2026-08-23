# 現在地（2026-08-23）

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

---

## 直近で完了したこと（第37巡）

実機の新しい報告3件を調査。

1. **GRAVITY(タスクの山)の床がタブバーの裏に潜っていた＝実バグ、直した**。
   `navHeightPx()`が`--nav-h`を`document.documentElement`から読んでいたが、
   このCSSカスタムプロパティは`[data-app-shell]`に立てている
   （祖先→子孫にしか継承しないので、祖先の`documentElement`からは常に
   空文字が返り、`96px`のハードコードされたフォールバックへ毎回落ちていた）。
   実機(NAV_BOTTOM_GAP=55px前提)では本当は`--nav-h`≈132pxなのに常に96pxで
   計算していたため、床がタブバーの上端より**36px下**（＝タブバーの裏）に
   置かれていた。`document.querySelector("[data-app-shell]")`から読むよう修正。
   `scratchpad/navfix.mjs`で「床の計算値 == 実際のタブバー上端」を確認。
   ★同じ関数が山の並べ方(`pileOf`の`usableH`)にも使われているので、
   「タイトルの下に妙な空白が広がる」印象の一部もこれで緩和されるはず。
2. ★★**iOSの`theme-color`は`default`/`black`では一切読まれない**と判明
   （Apple公式の既知の制限。第35巡の前提が誤りだった）。入力画面を開いた
   ときに上47pxが白いままなのは**コードの不具合ではなくiOSの仕様上の制約**。
   動的に色を追従させられるのは`black-translucent`だけだが、それは
   撤去済みの下の帯が復活する。両立不可。詳細は`docs/project_knowledge.md`
   §3の訂正箇所。★**ユーザーへどう見せるかの方針決定が必要**（次の一手参照）。
3. **輪の開閉・タブ切り替えの「点滅」は未特定**。`.tab-in`のopacityフェード
   自体は意図した動きだが、実機でどう見えているかは推測の域を出ていない。
   Chromiumでは確認できない類の症状（Safari特有の合成/フォントスワップ等の
   可能性はあるが未検証）。**次に実機で再現条件を絞り込む必要あり**。

---

## 直近で完了したこと（第36巡）

1. **タブバーの位置がまだ下がったまま**という報告を受け、`NAV_BOTTOM_GAP`の
   `+ env(safe-area-inset-top)`（第35巡）が実機で**効いていなかった**と発覚
   （実機写真の画素比較。`default`ではこの値が0になるらしい）。
   `env(safe-area-inset-bottom)`を比率(2.382)で使う式へ差し替え。
   `scratchpad/chin35.mjs`で式そのものを`lib/constants.ts`から読んで検算
   （セーフエリア0→4px／実機相当34pt→55px）。詳細は
   `docs/project_knowledge.md` §3、教訓は上記archive §56。
2. **`CreateMenu`（作るものを選ぶ輪）に閉じるアニメーションを追加**。
   外を触る／項目を選ぶ、どちらも即座に消さず、丸へ吸い込む円を`--t-out`
   かけて縮めてから外す（`data-rev="out"`。入力画面の`shrink`/`leave`と対）。
3. **RECORD/TASKを輪の中心(押した丸)から円周へ向かう半径の線上に配置**。
   文字も半径の角度へ傾けるが、90〜270°(左半分)は天地が逆に見えるので
   `legibleAngle()`で180°戻す。★**回転を持つ要素と`.tc-cue`(登場の時間差)を
   同じ要素に乗せると、アニメーションの終値`transform:none`が回転を消して
   しまう**バグを実際に踏んで直した(`components/CreateMenu.tsx`のコメント参照)。
4. **タスクの＋ボタン（`TaskAddButton`）を撤去**。GRAVITY・DRIFT両方。
   DRIFT(候補)側も「候補の追加はAIだけが行い、ユーザーは承認/却下するだけ」
   というユーザー方針の確認を取ってから撤去した。`GravityTab`/`DriftTab`の
   下書き(draft)分岐も、＋が無くなり到達不能になったぶん一緒に削除。
5. **基本のUIフォントをHelvetica + Noto Sansへ統一**（タスク図形の文字
   `FONT_FACES`は対象外）。`app/layout.tsx`に`Noto_Sans_JP`を追加、
   `lib/constants.ts`の`SANS`を書き換え。

### 検証したこと（第36・37巡共通）

`tsc`/`eslint`/本番ビルド✓、機械チェック4本✓。`chin35.mjs`(上下の帯・
theme-color)・`menu28.mjs`(輪の開閉・半径配置)・`navfix.mjs`(床の位置)
全項目OK、既存回帰一式に新規の不合格なし。旧「＋」ボタンに依存していた
約30本の試験は輪（作る→TASK）経由へ機械的に置き換えた（`fix_plus.pl`）。

---

## 次に着手すること

1. ★★★**入力画面を開いたときの上47pxの白い帯 — 方針決定待ち**。
   iOSの制約で`theme-color`が`default`/`black`では効かないため
   （§3参照）、コードだけでは解決できない。ユーザーに選択肢を提示済み
   （① `default`のまま・白い帯は仕様として受け入れる ②
   `black-translucent`に戻し下の帯を再び許容する ③ 入力画面側を
   「上だけ意図的に明るいヘッダー」としてデザインし直す）。回答が来たら着手。
2. **輪の開閉・タブ切り替えの「点滅」を実機で切り分ける**。Chromiumでは
   再現しない。次に実機で見るときは「どのタイミングで」「何色から何色へ」
   点滅するかを具体的に聞く（動画があれば一番早い）。
3. **実機（iOS Safari）での再確認**。★GRAVITYの床の修正／タブバー位置／
   輪の閉じ方・半径配置／フォント統一、いずれも前回未確認。
   ★**ホーム画面から一度消して追加し直してから**見ること。
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
- `drift2` は輪の送りがまれに2つ進む**ゆらぎ**がある（3回連続で通ることは
  確認済み。実装の問題ではなく指の当て方の再現性）。

---

## いま触っている領域のファイル

★全体のファイル地図は `CLAUDE.md`。ここは**いま手を入れている所だけ**。

```
lib/constants.ts                   ★NAV_BOTTOM_GAP(比率式)／SANS(Helvetica+Noto Sans)
app/layout.tsx                     ★Noto_Sans_JPの読み込み／appleWebApp.statusBarStyle
components/CreateMenu.tsx          ★輪。閉じるアニメーション／半径配置(legibleAngle)
components/tabs/GravityTab.tsx     ＋を撤去。★navHeightPx()の読み取り元を修正(第37巡)
components/tabs/DriftTab.tsx       同上(候補側)
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

主な回帰（`scratchpad/`）… `chin35`（上下の帯）/ `ground26`（地色）/
`motion26`（動き）/ `rect24`（器の追従）/ `menu28`（作るものの輪。閉じる動き・
半径配置も含む）/ `probe31`（数値表示）/ `when25` `pop21` `when20` `tap`
`geo4` `v5`〜`v15`(`v9`はport 3000決め打ちで別件・`v7`は既知の不具合)
`blink` `bake` `swipe` `seam` `junk` `text` `drift2` /
単体 `solid.test` `tag.test` `inbox.test`。
★`v7` は落ちたまま（下記「次に着手すること」）。`drift2` はまれにゆらぐ。

## ユーザー側の作業（アプリの外）

- Cowork に**毎晩のタスク「1日を仕分ける」**を設置する（例: 02:00 JST）。
- 任意: `OPENAI_API_KEY` を Vercel に登録すると文字起こしが Whisper 系になる。
