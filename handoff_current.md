# 現在地（2026-08-25・第56巡）

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

## 直近で完了したこと（第56巡）— ALIGN を縦列へ／曜日の引き上げ／自由／DRIFT の慣性

### ALIGN（ユーザー指定 … 文字を水平に・詰める・中央だけ大きく・半径をもっと）
1. ★**ほぼ縦の列へ**（`ARC_R` 290→1400）。可視域で x の振れは約 28px。輪ではなく列。
2. ★★**間隔を等間隔にやめた** … `L(d) = PITCH_TIGHT·d + PITCH_SPREAD·d/√(1+d²)`。
   原点で傾きが最大なので、**中央の上下の隣だけ 150、あとは 72 に詰まる**。
   `d` は連続値なので指で回している間も滑らか。
3. ★**文字は地面と平行**（回転をやめた）。左端だけが図形と同じ弧の外側を平行移動。
4. ★**焦点をもっと大きく** … `FOCUS_BOOST` 0.72→1.25、残り日数 44→**72**、
   題 26→28（焦点だけ2行まで折り返す）。使い手の居なくなった `SWISS_LG`(44) は捨てた。
5. ★焦点の高さを器の**0.34**へ（真ん中だと先頭で上半分が丸ごと空く）。

### TIMELINE
6. ★**曜日を引っ張れる** … 1 を超えたぶんは重くなって 1.9 へ漸近し、**離すとバネで
   規定へ戻る**。`.tl-band` を `overflow: visible` に（切ると伸びが見えない）。
7. ★**規定の曜日を少し縦長に** … `scaleY` の変形ではなく **Archivo の幅の軸を細く**
   （`"wdth" 75`）。細いぶん同じレーン幅で大きくでき（56→64px）、書体が歪まない。
8. ★★**バグ … 日付の無いタスクが上へ払った瞬間に消えていた**（world から remove
   していた）。**一緒に落として**画面の外で畳むようにした。
9. ★★**タスクが無い日に「自由」のブロックを落とす**（10語・日付から選ぶので同じ日は
   同じ語）。**文字そのものが図形**で、色の面は敷かない。開かない・掴めない。
10. ★★**画面の左右の壁が、遠い日のレーンの図形を押し戻していた**（3日目より先の列は
    右の壁の**中**に居る）。壁を山と落下中にだけ効かせて解決。
11. ★★**図形をレーンの「内寸」に収める**（壁は境目の上に置くので、幅いっぱいだと
    挟まって宙に浮く）。`WALL_T` 24→16。

### DRIFT
12. ★★★**投げても慣性がかからない**の正体は `clampDrift` の**上限 1.0**（＝毎秒60px）。
    第54巡に下限を外したとき上限が残り、投げは次のフレームで毎回潰されていた。
    上限は**壁抜け止め**（26）としてだけ残した。
13. ★掴みを **velocity 駆動**へ（GRAVITY と同じ）。`setStatic` だと当たり判定が消え、
    離した瞬間の速度が物理に無いので投げが死ぬ。
14. ★投げの速さを**時間で割って1ステップぶんへ**揃え、直近に動いていた値を持つ
    （120Hz で半分になる／離す直前に止まると 0 になる、の両方を潰す）。
    跳ね返りを 0.9→0.5 にして、投げが鳴り止むようにした。

### 検証
`tsc`/`eslint`/機械チェック4本/本番ビルド ✓。`scratchpad/r56.mjs`（14項目）全部OK —
文字が回っていない／間隔が中央だけ広い／焦点が72px／ほぼ縦列／曜日が伸びて戻る／
曜日が細く大きい／自由のブロックが空いた日の上に居る／DRIFT の投げが滑って止まる。
目視は `scratchpad/y-*.png`。★★**実機 Safari 未確認**。

### （参考）第52〜55巡の要点
第55巡: 動きの土台を**バネ**(`lib/spring.ts`)へ。ALIGN の出入りをパス＋連なり＋蛇行に。
TIMELINE を**本物の落下**へ(床が抜け、下へ出た図形をその日の列の真上へ引き上げる)。
掴みを velocity 駆動に(すり抜けの修正)。長押しの選択メニューを止めた。
第54巡: ALIGN の向きを入れ替え（文字が円弧・図形は平行）、開閉の段取り、TIMELINE の
慣性と曜日タップの詳細、GRAVITY の掴み＋口/ゴミ箱（`DropTargets` へ共通化）、DRIFT が
タブ下へ潜る不具合（canvas は full-bleed で画面より大きい）と減速して止まる投げ。
第52巡: TOP/UNDER と縦のカメラを破棄し、タスク図形を GRAVITY 空間だけに集約。詳細
リストと俯瞰を「画面遷移」から「物理モード」へ。タブは DRIFT＋GRAVITY の2つ。
第53巡: 欧文を **Archivo**（幅 88%）へ。**スロット描画**（絵の中心をスロットへ置く）で
図形のズレを根治。残り日数は種類で大きさを決める（期日なしは `SOMEDAY`）。


## 次に着手すること

1. ★★**実機で確認してもらう**（第56巡ぶん）。**ALIGN**（文字が水平／詰まった並びと
   中央だけ広い間隔／焦点の大きさ／ほぼ縦の列）／**TIMELINE**（曜日を引っ張って離す／
   日付なしが落ちて消える／空いた日の「自由」／遠い日の列へ横送り）／
   **DRIFT の投げ**（勢いよく滑ってから止まる）。
   ★**ホーム画面から追加し直してから**見ること。
2. ★**TIMELINE のリスケジュール**（別の曜日レーンへドラッグして `dueDate` を書換）は
   未実装。レーンの器と当たり判定の層は揃っているので次はここ。
3. **触れる数字**（`GravityTab.tsx`）… 掴み `HOLD_MS`(150)・`GRAB_K`(0.34)/
   `GRAB_MAX`(34)、ジェスチャー `EDGE_PX`(30)・`SWIPE_PX`(44)。
   ALIGN の出入り `LEAD_GAP`(210)・`GAP_DECAY`(0.72)・`MEANDER`(46)・`WAVES`(1.35)、
   並び `ARC_R`(1400)・`ARC_APEX_X`(96)・`PITCH_TIGHT`(72)/`PITCH_SPREAD`(110)・
   `ROW_H`(128)・`ALIGN_MAX_H`(132)/`_W`(176)・`FOCUS_BOOST`(1.25)・`TEXT_GAP`(100)・
   焦点の高さ `alignMid`(0.34)。
   TIMELINE `TL_FILL`(0.94)・`LANE_HEAD_H`(92)・`WALL_T`(16)・`RECYCLE_Y`(150)・
   `TL_SPAN`(240)・`TL_TRIGGER`(0.45)・`TL_STRETCH`(1.9)・`WD_WDTH`(75)/`WD_ADV`(0.62)・
   `GAP_W`(232)・`PAD_L`(20)・`LANES_VISIBLE`(3)・`FREE_FILL`(0.80)。
   バネの係数は `lib/spring.ts` の4つだけ。
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

主な回帰（`scratchpad/`）… **`r56`（★ALIGN の水平な文字と間隔・曜日の引き上げ・
自由のブロック・DRIFT の投げ）/ `r55`（選択が出ない・掴むと周りが動く・TIMELINE の
落下と積み・曜日タップ）/ `drift54`（DRIFT が床の上・中央）/ `modes53`（書体・
黒い棒の再発防止）**/
`chin35`（上下の帯）/ `ground26`（地色）/ `motion26`（動き）/ `rect24`（器の追従）/
`menu28`（作るものの輪）/ `when25` `pop21` `when20` `tap` `geo4` `blink` `swipe`。
★`space38`/`bugs38`（4層カメラ前提）は無効。`modes52` は `modes53` が置き換えた。
`v5`〜`v15` のうち `v7` は既知の不具合で落ちたまま・`v9` は port 3000 決め打ち。
（scratchpad は gitignore。テストはローカルのみ）。

## ユーザー側の作業（アプリの外）

- Cowork に**毎晩のタスク「1日を仕分ける」**を設置する（例: 02:00 JST）。
- 任意: `OPENAI_API_KEY` を Vercel に登録すると文字起こしが Whisper 系になる。
