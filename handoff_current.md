# 現在地（2026-08-25・第61巡）

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
第24巡でキーボード追従、第26巡でモーションの語彙、第33巡でデザインシステムを正規化。
第29〜36巡で「上下の帯」を解決（`docs/archive/shell-redesign-2026-08.md` §56 —
**同じ手を二度試さないこと**）。第38〜44巡の4層カメラは★**第52巡に破棄**。
現行仕様は `docs/project_knowledge.md` §4。

---

## 直近で完了したこと（第61巡）— DRIFT の座標の根治、上下スワイプ、文字の当たり判定、グレイン

第60巡ぶんの実機確認で7件。うち3件は「直したはずが直っていない」もので、
いずれも**対症療法で押さえていたのが崩れた**ものだった。

### ★★★DRIFT の初回の配置（3度目でようやく根治）
1. **原因** … DRIFT だけが `getBoundingClientRect()` で**画面の座標を測って**物理の場を
   置いていた。`AppShell` の列は一周ループのため `translateX(±300%)` が**アプリを
   切り替えた瞬間に飛ぶ**し、アイドルで後からマウントされる ―「測った瞬間」と
   「実際に見えている瞬間」がずれる。第58巡（原点の差分を運ぶ）も第60巡
   （流すのを matter が来てから）も**タイミングを合わせにいった対症療法**だった。
2. **直し** … GRAVITY と同じ「**自分の寸法だけで決まる canvas ローカル座標**」へ。
   `left = (w - innerWidth)/2` / `right = w - left` / `top = FIELD_TOP` /
   `bottom = h - navHeightPx()`。`lastField` の補正は丸ごと撤去。
   図形の大きさも**場の幅**から出す（`window.innerWidth` を混ぜない）。
   ★教訓 … **同じ器に居るのに片方だけ壊れるときは、座標の出どころを疑う。**

### 上下スワイプ（向きを直し、往復にし、抜け切ってから切り替える）
3. **上＝TIMELINE／下＝DRIFT／DRIFT から上＝GRAVITY**。第60巡は向きが逆だったので、
   `TL_GRAB_H`（地面際かどうかの切り分け）ごと撤去した。上スワイプはどこからでも。
4. ★★**切り替えは「時刻」ではなく「全部が場の外へ出たとき」**。`WARP_MS` は
   効果線の濃さの目盛りにだけ使う。判定は**外接矩形**（中心と `girth` で見ると
   画面が空になってから 0.5 秒ほど何も無い時間ができる）。上限だけ `WARP_MS × 3`。
5. ★DRIFT でも**すぐ動かせば払い、長押しすれば運ぶ**（GRAVITY と同じ作法）。
   図形で埋まっている層なので、空きからしか払えないと上スワイプが実質使えない。

### 日付・曜日の板（当たり判定・太さ・大きさ）
6. ★★**物体は「文字の塗り」そのもの**。`measureText` の実測から箱を作り、
   `textBaseline:"middle"` の原点と塗りの中心のずれ（`wordDx/wordDy`）を描くときに引く。
   第60巡までは決め打ちの矩形だったので `8/25` は箱が塗りの3倍あった。
7. 太さ `800 → 900`、書体 `LATIN`、字を組む幅 `0.46 → 0.66`。

### ALIGN
8. ★**日付・曜日の板も一緒に飛ぶ**（`flyRef`）。円弧のスロットは持たないので、
   図形の後ろに続く番号で同じ道を走り、終点で消える。
9. 指の追従をもう一段（`SCROLL_GAIN` 0.55 → **0.85**、`FLICK_K` 0.14 → **0.11**）。
10. 連鎖を控えめに（`CHAIN` 0.72 → **0.86** / `CHAIN_MAX` 6 → **4**）。

### TIMELINE の「自由」（3度目でようやく根治）
11. ★★★**板は「レーンの床」としか当たらない**（`FILTER_WORD`）。当たり判定の層を
    `CAT_LANE`（仕切り）と `CAT_FLOOR`（床）に分けた。「内寸に収める」と
    「大きく組む」は同時に満たせない ― 第56巡は押し出され、第59巡は回転を殺して
    「物体に見えない」になり、第61巡は塗りぴったりにしてもなお `FREE_PAD` で
    内寸を超えた。**層を分ける**のが正しい答えだった。大きいまま、回りながら落ちる。
12. `recycle()` が板に `swapUnit` を掛けないよう塞いだ（板が図形に化ける）。

### グレイン
13. `app/globals.css` の `body::after` 1枚。**強さは `--grain`（0.045）だけ**。
    静止・`mix-blend-mode` 無し（iOS で固定レイヤーに blend は合成し直しになる）。

### 検証
- `tsc` / `eslint` / 機械チェック4本（1・2・4 は0件、3 は何も出ない）。
- `scratchpad/r61.mjs`（390×797）… 17項目。**3回連続で全部OK**。
  ★[1] は**アプリを一周させてから** DRIFT を見る（列の `translateX` が飛ぶ経路を通す）。

---

## 次に着手すること

1. ★★**実機で確認してもらう**（第61巡ぶん）。**DRIFT の初回**（一周してから開く）／
   **上下スワイプの往復と効果線**（途中で切れないか）／**日付・曜日の板**（太さ・
   大きさ・当たり判定）／**ALIGN の追従と、板が一緒に飛ぶか**／
   **自由が回りながら床まで落ちるか**／**グレインの濃さ**。
   ★**ホーム画面から追加し直してから**見ること。
   ★グレインを濃く/薄くしたいときは `app/globals.css` の `--grain` 1行。
   ★スクロールが良ければ **TIMELINE の横送りも `lib/scroll.ts` へ寄せる**。
2. ★**TIMELINE のリスケジュール**（別の曜日レーンへドラッグして `dueDate` を書換）は
   未実装。レーンの器と当たり判定の層は揃っているので次はここ。
3. **触れる数字** … ★**強さを触る所は少ないほどよい**。
   - スクロール … `lib/scroll.ts` の `SCROLL_GAIN`(0.85) / `FLICK_K`(0.11) の**2つだけ**。
   - グレイン … `app/globals.css` の `--grain`(0.045) の**1つだけ**。
   - バネ … `lib/spring.ts` の**4つだけ**。
   - `GravityTab.tsx` … ワープ `WARP_G`(2)/`WARP_LINES`(26)、連鎖 `CHAIN`(0.86)/`CHAIN_MAX`(4)、
     伸び `SQUASH_MAX`(0.07)/残像 `SMEAR_A`(0.065)、出入り `STREAM_Q_MAX`(6)/`A_HANDOFF`(0.72)、
     並び `ARC_R`(700)/`PITCH_TIGHT`(54)/`FOCUS_BOOST`(1.25)、
     自由 `FREE_FILL`(1.02)/`FREE_SQUEEZE`(0.50)、文字 `WORD_WEIGHT`(900)/`PILE_WORD_W`(0.66)、
     地面 `GROUND_LIFT`(32)/重力 `GRAVITY_Y`(1.4)/`SWIPE_PX`(44)。
   - `DriftTab.tsx` … `W_RATIO`(0.34)/`W_MAX`(150)/`DRIFT_AIR`(0.016)/`FLING`(1.0)/`WARP_G`(2.8)。
   ★どれも**その場のコメントに理由が書いてある**。数字だけ動かす前に読むこと。
4. **DRIFT を GRAVITY へ集約するか**（今回は2タブのまま。ユーザーと別途相談）。
5. **Cowork のプロンプト更新**（`COWORK-ROUTINES.md`）… 候補の `いつ` を**日付で
   書かせる**（YYYY-MM-DD。TIMELINE のレーンは `dueDate` で束ねる）。日付が無いと
   期日にならず `lib/inboxImport.ts` がメモへ回す。★**全文を提示して承認を得てから**。

## 未解決・持ち越し

- **実機 Safari の未検証** … タスクアプリ全般、ジャーナルの円のドラッグとマイク。
- ジャーナル・ウィッシュ・ストックの行先が未定（§38 のポスターも未着手）。
- `.tc-lamp` は `.press` の別名。手が空いたら `.press` へ寄せる。
- **完成時に撤去** … `lib/taskDemo.ts`「デモを入れる」ボタン、`ProfileTab` の
  「ブリーフ生成の実験」、「画面の数値を出す」（`lib/debugViewport.ts` / `ViewportProbe`）。
- **左端→右スワイプ（ALIGN）が隣アプリへの横払いと混線しないか**実機で要確認。
- ★**ALIGN の入りは、図形の数だけ長くなる**（頭打ちを入れて最大 ~2.6 秒）。
  その間**縦スワイプは効かない**（図形がまだ所定の位置に居ないため）。左払いでの
  中断は効く。長さが気になるなら `STREAM_Q_MAX` か `STREAM_MS` を触る。
- ★**日付・曜日の板は日をまたいでも入れ替わらない**（`dropAll` が走るまで古い日付の
  まま）。GRAVITY は表に出るたび落とし直すので実害は小さいが、開きっぱなしで
  日付が変わると古いまま残る。
- ★**「自由」は平たい板なので、たまに逆さまに着地する**（0° か 180° に落ち着く）。
  初速と回りを控えめにして減らしてあるが、物理に任せている以上ゼロにはならない。
  気になるなら「着地したら水平へ寄せる」を足すことになる（未実装）。

---

## いま触っている領域のファイル

★全体のファイル地図は `CLAUDE.md`。ここは**いま手を入れている所だけ**。

```
components/tabs/DriftTab.tsx       ★★★場は自分の寸法だけ(根治)／上スワイプ→GRAVITY＋効果線
components/tabs/GravityTab.tsx     ★★タスク本体。上下スワイプ／ワープの終わり方／文字の板／
                                     ALIGNで板も飛ぶ／連鎖／自由は床としか当たらない
lib/scroll.ts                      ★スクロールの語彙。強さは SCROLL_GAIN と FLICK_K の2つ
lib/spring.ts                      ★canvas の図形の動きの土台(バネ)。係数は4つ
app/globals.css                    ★グレイン(body::after ＋ --grain)／.tl-band(--tl)／user-select
components/tasks/LayerName.tsx     層の名前。★検証用に data-layer を持つ
components/tasks/DropTargets.tsx   口とブラックホール(DRIFT/GRAVITY 共通)
components/tasks/TaskSpace.tsx     薄い器。GRAVITY常時マウント＋DRIFTを重ねる
components/AppShell.tsx            列の横スライド(★一周ループで translateX が飛ぶ)／タブバー
lib/constants.ts                   SANS/LATIN(Archivo+Noto Sans)／SWISS_*／NAV_BOTTOM_GAP
lib/motion.ts                      動きの語彙(曲線4本・時間5つ)
components/tasks/ViewportProbe.tsx ★開発用の数値表示（直ったら撤去）
```

## 検証の作法

```bash
# ★検証は必ず本番ビルドで（dev は next/font とプロキシの相性で真っ白になる）
# ★★フォントの取得が時々失敗する。リトライを噛ませ、**ログで成否を確かめる**。
#   ★掃除は `|| true`（非0で以降が走らないシェル）。★`kill` はポートが空くまで待つ
#   （空かないと古いビルドを見続ける・第60巡）。
rm -rf .next
for i in 1 2 3 4 5; do NODE_OPTIONS=--use-env-proxy npm run build > /tmp/b.log 2>&1; \
  grep -q "Compiled successfully" /tmp/b.log && break; done
npx next start -p 3201

# ★目盛りが守られているかの機械チェック（4本とも CLAUDE.md に載せてある）
#   1・2・4 は 0件、3 は何も出ないのが正しい
```

Playwright は `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`、実体は
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`。ビューポートは **390×797**
（実機の `innerHeight`。物理は 844 で差の 47 が「下の帯」・第35巡）。
★**継続アニメーションのある要素は `locator.click()` が待ち続ける**ので、
`dispatchEvent` で `pointerdown`/`pointerup` を直接撃つ。★`click` まで撃たないこと
（`Press` は押した瞬間に走るので2回走る・第34巡）。出入りの最中は同じ器が2枚居るので
`querySelectorAll` の**最後**を掴む。
★**タスクの新規作成は「作る」→「TASK」の2クリックが唯一の入口**（第36巡に＋を撤去）。
`button[aria-label="作る"]`は3アプリぶんDOMに在るので、`boundingBox().x`が
画面内(0〜390)のものだけを選ぶ（`menu28.mjs`の`makeBtn()`が実装例）。

主な回帰（`scratchpad/`）… **`r61`（★DRIFT の初回＝一周してから・上下スワイプの往復と
効果線・文字の板・ALIGN で板も飛ぶ・自由・グレイン）＋ `free61`（自由が床まで）/
`r60`（切替の削除・山が毎回ちがう・自由が上から落ちる）/
`r59`（出が止まらない・誇張の係数・スクロールの効き・閉じの段取り）/
`r58`（DRIFT の初回・無重力・
的の形・連鎖）/ `r57`（地面・一筋の出と緩急・黒い曜日・落下の物理）/
`r56` / `r55` / `drift54` / `modes53`**/
★★`r61` の作法 … **層の名前は `[data-layer]` から読む**。DOM を文字で走査すると
タブバーの "GRAVITY"/"DRIFT" を拾う。★DRIFT のとき GRAVITY は
`visibility: hidden` で**画面に残っている**ので、`getComputedStyle` で弾くこと
（これを忘れて2巡ぶん誤判定した）。
★`r60` の作法 … ALIGN は**入りが終わるまで縦スワイプが効かない**（数が多いほど長い）。
判定を書くときは十分待つこと。★**数える方を先に、スクリーンショットは後に**
（撮ってから数えると、速い動きはもう終わっている）。
★`r59` の作法 … 掴み損ねたときは**動かしてから**離すこと（そのまま離すとタップ扱いで
入力画面が開き、以降の操作が全部塞がる）。
★`r58` の作法 … **タスクアプリの既定タブは DRIFT**なので、デモのタスクを入れる前に
必ず GRAVITY タブへ移ること(DRIFT のまま押すと隠れたボタンを叩いて何も入らない)。
`chin35`（上下の帯）/ `ground26`（地色）/ `motion26`（動き）/ `rect24`（器の追従）/
`menu28`（作るものの輪）/ `when25` `pop21` `when20` `tap` `geo4` `blink` `swipe`。
★`space38`/`bugs38`（4層カメラ前提）と `modes52` は無効。
（scratchpad は gitignore）。
## ユーザー側の作業（アプリの外）

- Cowork に**毎晩のタスク「1日を仕分ける」**を設置する（例: 02:00 JST）。
- 任意: `OPENAI_API_KEY` を Vercel に登録すると文字起こしが Whisper 系になる。