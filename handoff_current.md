# 現在地（2026-08-25・第60巡）

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
★**第52巡に破棄**。現行仕様は `docs/project_knowledge.md` §4。

---

## 直近で完了したこと（第60巡）— DRIFT の空表示、ALIGN の作法、上スワイプで DRIFT へ

### ★★DRIFT に何も出なくなっていたバグ（ユーザー報告。ダミーは消えていない）
1. **原因** … 見えていない間は湧かせないので候補を `pending` に溜めるが、第58巡は
   `setActive` の中で **`pending` を無条件に空にしてから `sync` を呼んで**いた。
   DRIFT は**既定のタブ**なので `setActive(true)` は `import("matter-js")` より先に
   走る ― `sync` は `!M` で素通りし、列だけ捨てられて**永久に空**になっていた。
2. **直し** … 流す条件を **1か所（`flush()`）に集め**、`setActive` と matter の
   読み込み完了の**両方**から同じ関数を呼ぶ。

### ALIGN（誇張を弱め・指の追従を上げ・閉じを入りと揃える）
3. 誇張をもう一段弱く … `SQUASH_MAX` 0.11→**0.07** / `SQUASH_REF` 42→**48** /
   `SMEAR_A` 0.09→**0.065** / `SMEAR_LEN` 0.45→**0.40** / `SMEAR_MIN` 18→**22**。
4. 指の追従を普通寄りへ … `SCROLL_GAIN` 0.2→**0.55**、釣り合いで `FLICK_K` 0.18→**0.14**
   （`flickThrow` は両方を掛けるので、効きを上げると投げは勝手に伸びる）。
5. ★★**閉じも「1本の道」**（`homeAt`）… 円弧のあたりから**左下へ画面のはるか外**まで
   抜ける3次ベジエを、入りとまったく同じ段取り（`startAt`→`join`→`conv`→`cine`）で
   走らせる。★第59巡までは「x を -260 へバネで寄せるだけ」で**速さが `SMEAR_MIN` に
   届かず伸びも残像も出ていなかった** ―「閉じのストレッチが無さすぎる」の正体。
   誇張は**係数ではなく道の長さと緩急で**出す。
6. ★★**出入りの長さの頭打ち**（`STREAM_Q_MAX`=6）。素の `i` を使うと道の長さが
   **タスクの数だけ伸び**、16個で約4秒・30個なら8秒。その間ジェスチャーが効かず
   実質フリーズだった（実測して発覚）。あわせて**入りの途中でも左払いで閉じられる**
   ようにし、入り終わりの下限（`txtEnd`）から余分な 0.7 秒を落とした。

### TIMELINE
7. ★★「自由」が**画面の上（負の y）から落ちる**ように。第59巡までは帯の上端から
   数えていたので**画面の真ん中あたりに現れて**いた（「途中から急に現れる」の正体）。
   日付のあるタスクの投入も同じ罠だったので一緒に直した。
8. 「自由」を大きく … `FREE_FILL` 0.90→**0.94** / `FREE_H` 0.78→**0.92**。

### GRAVITY
9. ★**表に出るたびに山を落とし直す**（毎回ちがう並び）。ばらつきは `makePiece` に
   渡す**その回の種**で作る。ALIGN / TIMELINE を開いたまま離れても山からやり直す。
   ★傾きと回りは控えめ（±0.25rad）― 強いと逆さまに積まれて名前が読めない。
10. ★**その日の日付（`8/25`）と曜日の英語（`TUESDAY`）**を、「自由」と同じ
    **枠の無い黒い文字の板**として一緒に落とす。タスクではないので、山を組み直す
    各所で `p.word` は `alive` の判定から除外し、`recycleToPile` の最後で作り直す。
11. **NAME / TAG の切り替えを撤去**（`components/tasks/ViewToggle.tsx` ごと削除）。
12. ★★**上スワイプの行き先を出どころで分ける** … **地面際**（床から 132px）から
    上へ＝TIMELINE（曜日は地面から伸びるので掴む所は地面でなければ嘘）、
    **それより上**から上へ＝**効果線を伴って DRIFT へ**（`enterDrift`）。
    画面の切り替えではなく**物理で吹き飛ばす**（床を抜き、重力を上向きに裏返す）。
    ★係数は「`WARP_MS` のあいだに画面の高さぶんだけ上がる」で決める。強くしすぎると
    数フレームで空になり**効果線しか見えない**（最初の版で踏んだ）。

### 検証
- `tsc` / `eslint` / 機械チェック4本（1・2・4 は0件、3 は何も出ない）。
- `scratchpad/r60.mjs`（390×797）… 12項目。**3回連続で全部OK**。

---

## 次に着手すること

1. ★★**実機で確認してもらう**（第60巡ぶん）。**DRIFT に候補が出るか**／
   **ALIGN の指の追従**（速すぎ／遅すぎ）と**閉じの伸び**／**自由が上から落ちるか**／
   **山が毎回ちがうか**／**日付と曜日の板の大きさと置き場所**／
   **上スワイプで DRIFT へ移るときの効果線**。
   ★**ホーム画面から追加し直してから**見ること。
   ★スクロールが良ければ **TIMELINE の横送りも `lib/scroll.ts` へ寄せる**。
2. ★**TIMELINE のリスケジュール**（別の曜日レーンへドラッグして `dueDate` を書換）は
   未実装。レーンの器と当たり判定の層は揃っているので次はここ。
3. **触れる数字**（`GravityTab.tsx`）… 地面 `GROUND_LIFT`(32)・重力 `GRAVITY_Y`(1.4)、
   掴み `HOLD_MS`(150)・`GRAB_K`(0.34)/`GRAB_MAX`(34)、`EDGE_PX`(30)・`SWIPE_PX`(44)、
   ★上スワイプの分かれ目 `TL_GRAB_H`(132)、ワープ `WARP_MS`(=`ms(T_OUT)`)/`WARP_G`(2)/
   `WARP_LINES`(26)。
   ALIGN の出入り `LEAD_GAP`(210)・`GAP_DECAY`(0.72)・`STREAM_GAP`(0.115)・
   ★`STREAM_Q_MAX`(6)・`A_HANDOFF`(0.72)・`ENTRY_QUEUE`(74)・`D_IN`(0.12)、
   伸び `SQUASH_REF`(48)/`SQUASH_MAX`(0.07)、残像 `SMEAR_MIN`(22)/`_N`(2)/`_LEN`(0.40)/`_A`(0.065)。
   並び `ARC_R`(700)・`ARC_APEX_X`(96)・`PITCH_TIGHT`(54)/`PITCH_SPREAD`(124)・
   `ROW_H`(128)・`ALIGN_MAX_H`(132)/`_W`(176)・`FOCUS_BOOST`(1.25)・`TEXT_GAP`(100)・
   `alignMid`(0.34)・連鎖 `CHAIN`(0.72)/`CHAIN_MAX`(6)。
   ★**スクロールの強さは `lib/scroll.ts` の `SCROLL_GAIN`(0.55)/`FLICK_K`(0.14) だけ**。
   TIMELINE `TL_FILL`(0.94)・`LANE_HEAD_H`(92)・`WALL_T`(16)・`RECYCLE_Y`(150)・
   `TL_SPAN`(240)・`TL_TRIGGER`(0.45)・`TL_STRETCH`(1.9)・`WORLD_FLING`(9)・
   `WD_WDTH`(58)/`WD_ADV`(0.54)・`GAP_W`(232)・`PAD_L`(20)・`LANES_VISIBLE`(3)・
   `FREE_FILL`(0.94)/`FREE_H`(0.92)/`FREE_SQUEEZE`(0.50)、
   ★山の文字の板 `PILE_WORD_W`(0.46)/`PILE_WORD_H`(0.40)。
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

- **実機 Safari の未検証** … タスクアプリ全般、ジャーナルの円のドラッグとマイク。
- ジャーナル・ウィッシュ・ストックの行先が未定（§38 のポスターも未着手）。
- **完成時に撤去** … `lib/taskDemo.ts`「デモを入れる」ボタン、`ProfileTab` の
  「ブリーフ生成の実験」、「画面の数値を出す」（`lib/debugViewport.ts` / `ViewportProbe`）。
- `.tc-lamp` は `.press` の別名として残してある。手が空いたら `.press` へ寄せる。
- **左端→右スワイプ（ALIGN）が隣アプリへの横払いと混線しないか**実機で要確認。
- ★**ALIGN の入りは、図形の数だけ長くなる**（頭打ちを入れて最大 ~2.6 秒）。
  その間**縦スワイプは効かない**（図形がまだ所定の位置に居ないため）。左払いでの
  中断は効く。長さが気になるなら `STREAM_Q_MAX` か `STREAM_MS` を触る。
- ★**日付・曜日の板は日をまたいでも入れ替わらない**（`dropAll` が走るまで古い日付の
  まま）。GRAVITY は表に出るたび落とし直すので実害は小さいが、開きっぱなしで
  日付が変わると古いまま残る。

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
lib/scroll.ts                      ★★スクロールの語彙(指1:1＋投げ＋減衰＋吸着)。強さは2つ
lib/spring.ts                      ★★canvas の図形の動きの土台(バネ)。係数は4つ
lib/motion.ts                      ★T_CAM/EASE_CAM 撤去／surfaceOrigin の帰り先=右下の丸
components/AppShell.tsx            列の横スライド／タブバー／輪の入口／NAV_H
components/tasks/TaskComposer.tsx  入力画面。★板＋器の top/height 追従／LEAVE_MS
★`components/tasks/ViewToggle.tsx` は第60巡に削除（NAME/TAG の切り替えを撤去）
```

## 検証の作法

```bash
# ★検証は必ず本番ビルドで（dev は next/font とプロキシの相性で真っ白になる）
# ★★フォントの取得が**時々失敗する**。必ずリトライを噛ませ、**ログで成否を確かめる**
#   （第52巡は古い .next を掴んだまま検証して時間を溶かした）。★`pkill` 等が非0を
#   返すと**以降の行が走らない**シェルなので、掃除は `|| true` を付ける。
#   ★`kill` はポートが空くまで待つこと（空かないと古いビルドを見続ける・第60巡）。
rm -rf .next
for i in 1 2 3 4 5; do NODE_OPTIONS=--use-env-proxy npm run build > /tmp/b.log 2>&1; \
  grep -q "Compiled successfully" /tmp/b.log && break; done
npx next start -p 3201

# ★目盛りが守られているかの機械チェック（4本とも CLAUDE.md に載せてある）
#   1・2・4 は 0件、3 は何も出ないのが正しい
```

Playwright は `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`、実体は
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`。ビューポートは **390×797**
（実機の `innerHeight`。物理は 844 で差の 47 が「下の帯」。第35巡に
`statusBarStyle: "default"` にして web ビューは下端まで届くが `innerHeight` は 797）。
★**継続アニメーションのある要素は `locator.click()` が待ち続ける**ので、
`dispatchEvent` で `pointerdown`/`pointerup` を直接撃つ。★`click` まで撃たないこと —
`Press` は**押した瞬間**に走るので同じ操作が2回走る（第34巡）。出入りの最中は同じ器が
2枚居ることがあるので `querySelectorAll` の**最後**を掴むこと。
★**タスクの新規作成は「作る」→「TASK」の2クリックが唯一の入口**（第36巡に＋を撤去）。
`button[aria-label="作る"]`は3アプリぶんDOMに在るので、`boundingBox().x`が
画面内(0〜390)のものだけを選ぶ（`menu28.mjs`の`makeBtn()`が実装例）。

主な回帰（`scratchpad/`）… **`r60`（★DRIFT に候補が出る・切替の削除・山が毎回ちがう・
上スワイプの分かれ目と効果線・自由が上から落ちる・ALIGN の追従と閉じ）/
`r59`（出が止まらない・誇張の係数・スクロールの効き・閉じの段取り）/
`r58`（DRIFT の初回・無重力・
的の形・連鎖）/ `r57`（地面・一筋の出と緩急・黒い曜日・落下の物理）/
`r56` / `r55` / `drift54` / `modes53`**/
★`r60` の作法 … ALIGN は**入りが終わるまで縦スワイプが効かない**（数が多いほど長い）。
判定を書くときは十分待つこと。
★`r59` の作法 … 掴み損ねたときは**動かしてから**離すこと（そのまま離すとタップ扱いで
入力画面が開き、以降の操作が全部塞がる）。
★`r58` の作法 … **タスクアプリの既定タブは DRIFT**なので、デモのタスクを入れる前に
必ず GRAVITY タブへ移ること(DRIFT のまま押すと隠れたボタンを叩いて何も入らない)。
`chin35`（上下の帯）/ `ground26`（地色）/ `motion26`（動き）/ `rect24`（器の追従）/
`menu28`（作るものの輪）/ `when25` `pop21` `when20` `tap` `geo4` `blink` `swipe`。
★`space38`/`bugs38`（4層カメラ前提）と `modes52` は無効。
（scratchpad は gitignore。テストはローカルのみ）。

## ユーザー側の作業（アプリの外）

- Cowork に**毎晩のタスク「1日を仕分ける」**を設置する（例: 02:00 JST）。
- 任意: `OPENAI_API_KEY` を Vercel に登録すると文字起こしが Whisper 系になる。
