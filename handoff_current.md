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

## 直近で完了したこと（第39巡）— 実機の2件を修正 ＋ 第2段階

### ★★実機で報告された2件は、**どちらも原因が1つ**だった

`onClose` が書いて保存するだけで `openId` を下ろしておらず、`TaskComposer` が
**一度も外れなかった**（`DriftTab` / `GravityTab` の両方。元からの不具合）。

1. **「閉じたあと黒い丸が残る」** … 吸い込みの円は半径0まで縮まない（帰り先の
   丸の大きさで止まる）ので、外れないまま黒い丸が残って見えていた。
2. **「上下スワイプがなかなか効かない」** … 入力画面が html に立てる
   `[data-overlay]` も外れず、器が触りを握れないまま（`touch-action` が `auto`
   のまま）だった。一度タスクを開くと以後ずっと効かない状態。

あわせて直したこと:
- `surfaceOrigin()` の既定の帰り先を **右下の「作る」の丸**（`[data-create-anchor]`）
  へ。以前は「画面下端の中央」で、そこには**何も無い**。丸は黒いボタンに
  重なって初めて消えて見える。★**行き先は必ず実在する黒い丸にすること。**
- 器に `touch-action: none` を置いた（入力画面が開いている間と地中は `auto`）。
  これが無いと iOS は指が下りた瞬間に自分の送りを始め、`pointermove` が
  `pointercancel` に化けて**掴む前に死ぬ**。
- 送る判断を**画面**の高さで測るよう戻した（層のあいだに空きを作ったぶん、
  同じ 0.18 でも要る指の距離が 152px → 212px に伸びていた）。0.14 ＋ 払いの
  速さも 0.45 → 0.28。

### 第2段階（TOP VIEW / UNDERGROUND）

- **タブを4つへ**（DRIFT / GRAVITY / TOP / UNDER）。`TabIcons` に `holes` /
  `strata` を追加。`TasksTabId` も4つへ。
- **立面 → 見下ろしのすり替え**。★`rotateX` は使わず、2つの層の `scaleY` を
  すれ違わせる。同時に GRAVITY は**床を外して**図形を落とし、戻ったら
  `dropAll()` で降らせ直す。
- **TOP VIEW** … 黒い穴＋`GeoType` の数字。横に払って 3日 / 1週 / 4週。
  ★列の数は**器の形から決める**（`packCols`）。7列固定にしたら1週が細い1行に
  なった。数字の大きさは `geoTextWidth` から逆算（2桁が円からはみ出す）。
- **UNDERGROUND** … 穴の場所から円が広がり、地色は `pushGround` で黒へ。
  左に図形・右に題と詳細。★ここだけ器が触りをコンテンツへ返す（一覧が送れる）。
  ★アプリ名の札を出さない（黒地に黒い字が沈み、大きな日付とぶつかる）。

### ★踏んだ罠

**層の中で寸法を測るのに `getBoundingClientRect()` を使っていた。** これは
**変形後**の箱を返すので、`scaleY(0.06)` で畳まれた層では 593px の器が 38px に
見え、TOP VIEW の穴が7列の細い1行になった。`offsetWidth/offsetHeight` で測る。

### 検証したこと

`tsc` / `eslint` / 本番ビルド ✓、機械チェック4本 ✓。
`scratchpad/space38.mjs`（13群55項目）全部OK ― 4層の積み方・傾き・穴の並びと
濃淡・潜る・地色の出入り・触りの受け渡しまで。
新規 `scratchpad/bugs38.mjs` で**実機報告の2件**を名指しで確認（吸い込みの
行き先が右下の丸であること／閉じたら本当に外れること／126px の払いで送れて
32px のそっとした動きでは送らないこと）。★**実機は未確認**。

---

## 直近で完了したこと（第38巡・要点だけ）— 縦のカメラ

1. **`components/tasks/TaskSpace.tsx`**（縦のカメラの器）を新設。`--cam` は CSS
   カスタムプロパティで駆動（state を通さない）。3D 変形は使わない。
2. **DRIFT の円環を撤去**し、散らして浮遊する形へ（ゆらいだ格子）。経緯は
   `docs/archive/task-app-2026-08.md` §56。
3. アプリ名の札をカメラの器へ引き上げ、層は `LayerName` を持つだけに。
4. `AppShell` はタスクアプリだけ `key` 固定・`tab-in` なし（山を作り直さない）。
5. **層のあいだに空き**（`LAYER_GAP` 0.4）＋ **`--t-cam`(1400ms) / `--ease-cam`
   （対称のS字）を語彙へ足した**。規約2つの明示的な例外で、`TaskSpace` の外へ
   持ち出さない（理由は `:root` と §3・§4）。パン中は風（効果線）が流れる。
6. ★罠 … 器の移動量だけ 140% にして `Layer` の間隔を 100% のままにし、床が
   タブバーより 338px 高くなった。**積む間隔とカメラの移動量は同じ数から作る。**

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

1. ★★**実機で確認してもらう**（第38・39巡ぶんがまとめて未確認）。
   縦のカメラ／DRIFT の浮遊／パンの長さと風／4層のタブ／見下ろしと地中／
   ★**報告された2件（黒い丸・上下スワイプ）が本当に直っているか**。
   ★**ホーム画面から一度消して追加し直してから**見ること。
2. **触れる数字**（実機で振れる所）:
   - パンの長さ … `app/globals.css` の `--t-cam`（いま 1400ms）1行。
   - 層の遠さ … `TaskSpace.tsx` の `LAYER_GAP`（いま 0.4）。
   - 風の濃さ … `TaskSpace.tsx` の `STREAKS` の `o`（いま 0.06〜0.18）。
   - スワイプの効き … `SNAP_RATIO`(0.14) / `FLICK_V`(0.28)。
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
- **層の名前の見え方は実機で要確認**。設定の丸のすぐ下に置いてあり、Chromium
  では収まっているがセーフエリアが効く実機では詰まる可能性がある
  （`components/tasks/LayerName.tsx`）。
- **地中から上の層へ指で戻る道が弱い**。地中は触りをコンテンツへ返して
  いるので、一覧が送れる間はカメラを掴めない（タブバーからは戻れる）。
  実機で不便なら、一覧の上端でだけ掴む等を足す。

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
components/tasks/TopView.tsx       ★見下ろし。穴の並びは packCols が器から決める
components/tasks/Underground.tsx   ★地中。黒地・その日の一覧。触りはコンテンツへ
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
