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

## 直近で完了したこと（第53巡）— 書体の刷新と、ALIGN/TIMELINE の作り直し

第52巡の実機写真で**レイアウトが破綻**していた（巨大な黒い棒・図形が行から外れて
画面外へ・全部が小さすぎ）。方向は合っているので**組み方と書体**を作り直した。

1. ★★**欧文を Archivo へ**（アプリ全体。和文は Noto Sans JP のまま）。「太めで幅が
   少し詰まった、洗練された」という指定に対し、可変フォントの幅の軸を使い
   `body { font-variation-settings: "wdth" 88 }` で全体を少し詰める。
   `HELV` → **`LATIN`** に改名（中身が Helvetica でなくなったため）。
2. ★★★**描き方を作り直した（ズレの根治）** … align/timeline では **body の位置で
   描かない**。レイアウトが決めた**スロット `{x,y,s,a,o}` へ絵の中心を置く**。
   第52巡は body の**重心**へ寄せて `ox/oy` で補正していたため、半円・三角が行から
   外れ画面左端で切れていた。加えて `unit` を変えて焼き直すので、焼き上がるまで
   **実寸の多角形**が出て二重にズレていた。いまは大小を `ctx.scale` で作り、
   焼くのは1つの unit だけ。当たり判定もスロットの矩形。
3. ★**ALIGN を円弧のカルーセルへ** … 画面左に円弧で図形が並び（円弧と一緒に回る）、
   右に文字（**水平を保つ**）。中央の図形と文字が大きい。上下スワイプで滑らかに回転
   ＋慣性＋最寄りへ吸着。図形は読める固定寸法にし、入り切らないものはスクロール。
   残り日数は**数字だけ大きく**（焦点 44 / それ以外 28）、語（OVER/**SOMEDAY**）は
   小さく薄く ― ★**文字数ではなく種類で判定**するようにして「黒い棒」を構造的に根絶。
4. ★**TIMELINE を指追従＋下詰めへ** … 下からのドラッグで**地面の曜日がぺたんこから
   伸びる**（`--tl` を指が進める）。図形は各レーンで**下から詰めて**積み、曜日が
   割り当てられていないものは**上に浮遊**。`TODAY` の語をやめ**その日の曜日＋赤**に
   （はみ出しも解消）。横スワイプは**曜日が先に動き、上の段ほど遅れて追従**。

### 検証
`tsc`/`eslint`/機械チェック4本/本番ビルド ✓。新規 `scratchpad/modes53.mjs`（18項目）
全部OK ― 書体・円弧・焦点・**72px の文字が無いこと**・SOMEDAY・図形が左に居ること・
焦点の移動・曜日の中間の伸び(0.375/0.88)・赤・画面内に収まる・横の追従・山へ戻る。
スクリーンショットで目視（円弧／曜日が潰れた状態→立ち上がり／下詰め）。
★★**実機 Safari 未確認**。

### （参考）第52巡の要点
TOP/UNDER と縦のカメラを破棄し、タスク図形を GRAVITY 空間だけに集約。詳細リストと
俯瞰を「画面遷移」から「物理モード」へ。タブは DRIFT＋GRAVITY の2つ。

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

1. ★★**実機で確認してもらう**（第53巡ぶん）。**書体**（Archivo・幅88%）の印象、
   **ALIGN**（左の円弧・中央が大きい・上下で回る）、**TIMELINE**（下から引くと地面の
   曜日が伸びる・下詰め・横は曜日が先）。★**ホーム画面から追加し直してから**見ること。
2. ★**TIMELINE のリスケジュール**（別の曜日レーンへドラッグして `dueDate` を書換）は
   未実装。構造（スロット・レーンの当たり判定）は揃っているので次はここ。
3. **触れる数字**（`GravityTab.tsx`）… ジェスチャー `EDGE_PX`(30)・`SWIPE_PX`(44)。
   ALIGN の円弧 `ARC_R`(290)・`ARC_APEX_X`(88)・`ROW_H`(112)・`ALIGN_MAX_H`(92)・
   `FOCUS_BOOST`(0.34)・`TEXT_LEFT`(160)。TIMELINE `LANES_VISIBLE`(3)・`HORIZON`(14)・
   `LANE_PITCH`(62)・`LANE_HEAD_H`(92)・`TL_SPAN`(240)・`LAG_BASE/DECAY`(0.34/0.82)。
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
components/tasks/LayerName.tsx     層の名前(GRAVITY/DRIFT)を右上に
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

主な回帰（`scratchpad/`）… **`modes53`（★書体・ALIGN の円弧と焦点・黒い棒の再発防止・
TIMELINE の指追従/下詰め/赤/横の追従）/ `drift-verify`（DRIFT の口/ゴミ箱）**/
`chin35`（上下の帯）/ `ground26`（地色）/ `motion26`（動き）/ `rect24`（器の追従）/
`menu28`（作るものの輪）/ `when25` `pop21` `when20` `tap` `geo4` `blink` `swipe`。
★`space38`/`bugs38`（4層カメラ前提）は無効。`modes52` は `modes53` が置き換えた。
`v5`〜`v15` のうち `v7` は既知の不具合で落ちたまま・`v9` は port 3000 決め打ち。
（scratchpad は gitignore。テストはローカルのみ）。

## ユーザー側の作業（アプリの外）

- Cowork に**毎晩のタスク「1日を仕分ける」**を設置する（例: 02:00 JST）。
- 任意: `OPENAI_API_KEY` を Vercel に登録すると文字起こしが Whisper 系になる。
