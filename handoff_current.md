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

## 直近で完了したこと（第52巡）— TOP/UNDER 破棄、GRAVITY を物理モード化

「図形が GRAVITY に積まれているのに同時に別画面（TOP/UNDER）にも在る」のは物理の
メタファーとして破綻、というユーザー指摘。**TOP/UNDER と縦のカメラを完全に破棄**し、
タスク図形は**常に GRAVITY 空間にだけ在る**ようにした。詳細リスト・俯瞰は画面遷移
ではなく **GRAVITY 内の物理モード**（matter.js の重力切替＋アトラクタ）で見せる。

1. ★★**GRAVITY をモード化**（`GravityTab`。`modeRef`=pile/align/timeline）。既存の
   山（pile）の機構はそのまま土台に。`align`/`timeline` では重力0＋`isSensor`で
   各 body を毎フレーム目標へ lerp、`pile` へ戻すとき重力を戻して `dropAll` で降らせ直す。
2. ★**ALIGN PRESS**（左端→右）… 面積の降順に左へ一列＋右にスイス体の詳細リスト。
   **残り日数を特大**（`SWISS_XL` の数字＋小 `DAYS`。今日=TODAY/過ぎ=OVER/なし=—）。
3. ★**MAGNETIC TIMELINE**（下→上）… 巨大な曜日（TODAY/WED/THU…英字3文字）が仕切りに
   立ち、図形が `dueDate` の日付レーンへ吸着。左右スワイプで横スクロール。
   リスケジュールは `reschedule(id, ymd)` フックまで（ドラッグの詰めは段階的）。
4. ★**掃除**… `TaskSpace` を薄い器へ（GRAVITY 常時マウント＋DRIFT を重ねるだけ）。
   `TopView`/`Underground`/`UnderHole` を削除、`lib/apps.ts` から TOP/UNDER タブと
   `TabIcons` の holes/strata を削除、`.task-layer`/`.cam-*` と `--t-cam`/`--ease-cam`/
   `T_CAM`/`EASE_CAM` を撤去（例外語彙が無くなった）。

### 検証
`tsc`/`eslint`/機械チェック4本/本番ビルド ✓。新規 `scratchpad/modes52.mjs`（Playwright）で
ALIGN（面積降順に整列・残り日数が特大72px）・TIMELINE（曜日3つ立つ・TODAY 先頭・横
スクロール）・pile へ戻る、を確認。★★**実機 Safari 未確認**。
★v1 の粗さ: TIMELINE のレーン内で図形が1つ帯の外へ寄ることがある（要磨き）。

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

1. ★★**実機で確認してもらう**（第52巡ぶん）。GRAVITY の **ALIGN**（左端→右で
   面積降順に整列＋残り日数特大）・**TIMELINE**（下→上で曜日が立ち日付レーンへ吸着・
   横スクロール）・逆スワイプで山へ戻る。**DRIFT の無重力＋口/ゴミ箱**も継続。
   ★左端→右スワイプが隣アプリへの横払いと混線しないか要注意。
   ★**ホーム画面から追加し直してから**見ること。
2. ★**TIMELINE のレーン内の縦の詰め**を磨く（図形が1つ帯の外へ寄る v1 の粗さ）。
   ドラッグでの**リスケジュール**（`reschedule` フックは用意済み）を仕上げる。
3. **触れる数字**（`GravityTab.tsx`）… ジェスチャー `EDGE_PX`(26)・`SWIPE_PX`(44)・
   `TAP_MOVE`(8)。アトラクタ `ATTRACT_K`(0.18)・`ANGLE_K`(0.80)・`SETTLE_PX`(0.5)。
   ALIGN `ALIGN_BAND_MAX`(132)・`ALIGN_ROW_MAX`(108)。TIMELINE `LANES_VISIBLE`(3)・
   `HORIZON`(14)・`LANE_PITCH`(64)・`LANE_HEAD_H`(84)。
   DRIFT（`DriftTab.tsx`）: `HOLD_MS`(150)・`TAP_MOVE`(8)・`FLING`(0.9)。
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
- **TIMELINE のレーン内の縦の詰め**が甘い（図形が1つ帯の外へ寄る）。要磨き。
- **左端→右スワイプ（ALIGN）が隣アプリへの横払いと混線しないか**実機で要確認。
- **DRIFT を GRAVITY へ集約するか**（今回は2タブのまま。別途相談）。

---

## いま触っている領域のファイル

★全体のファイル地図は `CLAUDE.md`。ここは**いま手を入れている所だけ**。

```
lib/constants.ts                   ★NAV_BOTTOM_GAP(比率式)／SANS(Helvetica+Noto Sans)
app/layout.tsx                     ★Noto_Sans_JPの読み込み／appleWebApp.statusBarStyle
components/CreateMenu.tsx          ★輪。閉じるアニメーション／半径配置(legibleAngle)
components/tabs/GravityTab.tsx     ★★タスク本体。物理モード(pile/align/timeline)・ジェスチャー・詳細DOM・曜日DOM
components/tasks/TaskSpace.tsx     ★薄い器。GRAVITY常時マウント＋DRIFTを重ねる＋固定Masthead
components/tasks/LayerName.tsx     層の名前(GRAVITY/DRIFT)を右上に
components/tabs/DriftTab.tsx       ★無重力の場(canvas+matter.js)。ホールド→口/ゴミ箱
app/globals.css                    ★.mode-panel/.mode-lanes の入場keyframes(cam-* は撤去)
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

主な回帰（`scratchpad/`）… **`modes52`（★GRAVITY の物理モード: ALIGN 整列＋残り日数・
TIMELINE 曜日＋レーン・横スクロール・pile へ戻る）/ `drift-verify`（DRIFT の口/ゴミ箱）**/
`chin35`（上下の帯）/ `ground26`（地色）/ `motion26`（動き）/ `rect24`（器の追従）/
`menu28`（作るものの輪）/ `when25` `pop21` `when20` `tap` `geo4` `blink` `swipe`。
★`space38`/`bugs38`（4層カメラ前提）は**第52巡でカメラ撤去により無効**。
`v5`〜`v15` のうち `v7` は既知の不具合で落ちたまま・`v9` は port 3000 決め打ち。
（scratchpad は gitignore。テストはローカルのみ）。

## ユーザー側の作業（アプリの外）

- Cowork に**毎晩のタスク「1日を仕分ける」**を設置する（例: 02:00 JST）。
- 任意: `OPENAI_API_KEY` を Vercel に登録すると文字起こしが Whisper 系になる。
