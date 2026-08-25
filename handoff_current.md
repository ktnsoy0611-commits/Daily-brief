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
第38〜44巡でタスクアプリを「縦の空間＋カメラ」＋4層（DRIFT/GRAVITY/TOP/UNDER）
にしたが、★**第52巡にそれを大きく作り替えた**（下記）。現行仕様は
`docs/project_knowledge.md` §4「GRAVITY の物理モード」。

---

## 直近で完了したこと（第54巡）— 5つの指摘に対応

1. ★**ALIGN の向きを入れ替えた** … **文字が円弧に沿って回り、図形は平行を保つ**
   （第53巡はこの逆だった）。中央の図形と文字をさらに大きく（`FOCUS_BOOST` 0.72）。
   ★焼く単位にブーストを掛けていたため焦点が膨らんで文字へめり込んでいたのを修正。
2. ★★**ALIGN の開閉アニメーション** … 入りは「山が右上へ弧を描いて順に抜ける →
   円弧の下から円に沿って上がって埋まる → 着いた行から文字が右からスライドイン」。
   閉じは「文字は右へ・図形は左へはけ、山へ落とし直す」。時間は全部 `motion.ts` から。
3. ★**TIMELINE** … 図形を大きく（`TL_MAX_H` 76）、左右スワイプに慣性、
   開閉のアニメ（開き=山が落ちて上から各曜日の列へ降る／閉じ=下へ落として落とし直す）、
   **曜日タップで左端そのまま右へ広がる詳細パネル**（`clip-path` で開く）。
4. ★**GRAVITY でも図形を掴める** … 長押し→運ぶ、口=完了/ゴミ箱=削除。
   すぐ動かせばスワイプ（掴みでモードの入口を塞がない）。口/ゴミ箱は
   `components/tasks/DropTargets.tsx` へ切り出して DRIFT と共通化。
5. ★**DRIFT** … タブバーの下へ潜る不具合を修正（**canvas は full-bleed で画面より
   大きい**ので、画面の座標へ変換してから壁を置く）。投げたら**減速して止まる**
   （速さの下限をやめ空気抵抗へ）。図形を大きく、初期位置を画面中央のひまわり配置に。
   ★DRIFT を見ている間、下の GRAVITY の層名・ビュー切替・デモのボタンが透けて
   出て押す面まで奪っていたのを `visibility: hidden` で塞いだ（`TaskSpace`）。

### 検証
`tsc`/`eslint`/機械チェック4本/本番ビルド ✓。`scratchpad/r54.mjs`(11項目) と
`scratchpad/drift54.mjs`(3項目) 全部OK — 掴んで口へ落とすと未完了が1件減る／文字が
円弧に沿う／焦点が大きい／曜日タップで左端そのまま右へ広がる／下へ払うと山へ戻る／
DRIFT が床の上に収まり中央に湧いて減速して止まる。★★**実機 Safari 未確認**。

### （参考）第52〜53巡の要点
第52巡: TOP/UNDER と縦のカメラを破棄し、タスク図形を GRAVITY 空間だけに集約。詳細
リストと俯瞰を「画面遷移」から「物理モード」へ。タブは DRIFT＋GRAVITY の2つ。
第53巡: 欧文を **Archivo**（幅 88%）へ。**スロット描画**（絵の中心をスロットへ置く）で
図形のズレを根治。残り日数は種類で大きさを決める（期日なしは `SOMEDAY`）。

### （参考）第44巡までの要点
UNDER を真横スライドに・DRIFT を無重力＋口/ゴミ箱に・穴の物理（いずれも第52巡の
GRAVITY 集約で TOP/UNDER 側は退役。DRIFT の無重力＋口/ゴミ箱は現役）。詳細は
`docs/archive/task-app-2026-08.md`。

---

## 直近で完了したこと（第37〜38巡・要点だけ）

第38巡: `TaskSpace`（縦のカメラの器）を新設し、`--t-cam`/`--ease-cam` を語彙の
例外に。札は器へ・層は `LayerName` のみ。`AppShell` はタスクだけ `key` 固定・
`tab-in` なし。パン中は風（効果線）。経緯は `docs/archive/task-app-2026-08.md` §56。
第37巡: GRAVITY の床がタブバーの裏に潜る実バグを修正。★iOS の `theme-color` は
`default`/`black` では読まれず、上47pxの白い帯は**ユーザー確定で許容**（追わない）。

---

## 次に着手すること

1. ★★**実機で確認してもらう**（第54巡ぶん）。**ALIGN**（文字が円弧に沿う／図形は平行／
   中央が大きい／入りと閉じの段取り）、**TIMELINE**（曜日が立ち上がり上から降る／横の
   慣性／曜日タップで右へ広がる詳細）、**GRAVITY の掴み**（長押し→口/ゴミ箱）、
   **DRIFT**（タブ下へ潜らない・減速して止まる・大きさ・中央から）。
   ★**ホーム画面から追加し直してから**見ること。
2. ★**TIMELINE のリスケジュール**（別の曜日レーンへドラッグして `dueDate` を書換）は
   未実装。構造（スロット・レーンの当たり判定）は揃っているので次はここ。
3. **触れる数字**（`GravityTab.tsx`）… 掴み `HOLD_MS`(150)・`FLING`(0.6)、
   ジェスチャー `EDGE_PX`(30)・`SWIPE_PX`(44)。ALIGN `ARC_R`(290)・`ARC_APEX_X`(88)・
   `ROW_H`(112)・`ALIGN_MAX_H`(104)/`_W`(148)・`FOCUS_BOOST`(0.72)・`TEXT_GAP`(96)・
   `ARC_ENTER_TH`(1.45)。TIMELINE `TL_MAX_H`(76)・`LANE_PITCH`(88)・`LANE_HEAD_H`(92)・
   `TL_SPAN`(240)・`TL_FALL`(0.45)・`WORLD_DECAY`(0.94)。段取りの時間は `motion.ts` から
   （`A_OUT`/`A_IN`/`A_TXT`/`A_STEP`・連なりの頭打ち `STAG_MAX`)。
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
app/globals.css                    ★body の wdth 88／.tl-band(曜日が伸びる --tl)
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

主な回帰（`scratchpad/`）… **`r54`（★掴んで口へ＝完了・文字が円弧・焦点・曜日タップの
詳細・山へ戻る）/ `drift54`（★DRIFT が床の上・中央・減速して止まる）/ `modes53`（書体・
黒い棒の再発防止・曜日の指追従）**/
`chin35`（上下の帯）/ `ground26`（地色）/ `motion26`（動き）/ `rect24`（器の追従）/
`menu28`（作るものの輪）/ `when25` `pop21` `when20` `tap` `geo4` `blink` `swipe`。
★`space38`/`bugs38`（4層カメラ前提）は無効。`modes52` は `modes53` が置き換えた。
`v5`〜`v15` のうち `v7` は既知の不具合で落ちたまま・`v9` は port 3000 決め打ち。
（scratchpad は gitignore。テストはローカルのみ）。

## ユーザー側の作業（アプリの外）

- Cowork に**毎晩のタスク「1日を仕分ける」**を設置する（例: 02:00 JST）。
- 任意: `OPENAI_API_KEY` を Vercel に登録すると文字起こしが Whisper 系になる。
