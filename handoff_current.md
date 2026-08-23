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
作り、第33巡でデザインシステムを正規化した。**第35巡で「上下の帯」を
解決した** — `statusBarStyle` を `default` にし、副作用の2つ（タブバーが
47px 下がる／上 47px が `theme-color` の帯になる）をそれぞれ潰した。

---

## 直近で完了したこと（第35巡）★上下の帯を解決

**第34巡の `--screen-h` は実機で効かなかった**（写真の実測で円の下端は
796.7pt のまま1pxも動かず）。「`position: fixed` の面を伸ばせばビューポートの
外も描かれる」という前提が誤りだった。撤去して、**実際に効いた
`statusBarStyle: "default"`（第29巡）へ戻した**。

実測で分かった対比（390×844 の端末）:

| | 画面の下 47px | 画面の上 47px |
|---|---|---|
| `black-translucent` | **どの要素も塗れない帯** | 中身が描かれる |
| `default` | 中身が描かれる ✓ | iOS が `theme-color` で塗る |

- ★`default` の副作用①**タブバーが 47px 下がる**（実測: ピルの下端
  783.0 → 830.0pt でホームインジケーターに乗っていた）→ `NAV_BOTTOM_GAP` に
  **`+ env(safe-area-inset-top)`** を足して戻した。伸びた量と戻す量が同じなので
  **元と同じ位置**。セーフエリアの無い Chromium では両方 0 で値は変わらない
- ★★副作用②**上 47px が `theme-color` の帯**になる。これはうちの色なので
  地色に合っていれば見えない。第29巡に「黒い帯」と見えたのは iOS の仕様ではなく
  **入力画面の色 `#33332E` が残っていた**もの（写真の実測で判明）。原因は
  `theme-color` の補間が `requestAnimationFrame` 頼みだったこと —
  **rAF は画面が隠れている間や iOS が絞っている間は止まる**ので、止まった
  ところの色で固まっていた。`GROUND_MS + 40` の `setTimeout` で行き先を必ず
  書き込む保険を置いた
- 検証 `scratchpad/chin35.mjs` を新設（第34巡の `chin34.mjs` は撤去）。**rAF を殺した状態で
  入力画面を閉じても `theme-color` が地色へ着地するか**を見る（第29巡の症状を
  そのまま試験にした）
- ★`drift2` は輪の送りがまれに2つ進む**ゆらぎ**があった（3回連続で通ることを
  確認。実装の問題ではなく指の当て方の再現性）

## 直近で完了したこと（第33巡）★デザインシステムの正規化

きっかけは「スペーシング・ボタン・タイポが不規則」という体感。実測すると
**真因は仕組み不足ではなく、第26巡の語彙が守られていなかったこと**だった
（`fontSize` 約25種類 / 直書き `cubic-bezier` 17箇所 / 共通ボタン部品が無い）。

- `lib/tokens.ts` を新設 … `SPACE`（4の倍数）/ `TYPE`（7段）/ `RADIUS`。
  **寸法の語彙の持ち主はここだけ**。目盛りの外に居てよい3つの例外も明記。
- `components/Button.tsx` を新設 … 押下の作法が3流派に分かれていたので集約。
  `Press`（入力画面専用・押した瞬間に走る）と `Button`（離上で走る・
  `variant` × `size`）。`common.tsx` の `rowBtn()` は吸収して削除。
- **モーションを語彙へ寄せ切った** … 直書きの `cubic-bezier` 17箇所と
  約20種類の直書きの時間を `var(--*)` へ。跳ね返るカーブ
  `cubic-bezier(0.34,1.56,0.64,1)`（規約違反）を撤去。環境の無限ループは
  `--t-amb-*` へ分離し、そこだけ `ease-in-out` を許した。
- ★**`--t-out` を 350ms → 600ms**（2026-08-23にユーザー確定）。第27巡の
  「きびきび」をシネマティックな手ざわりを優先して戻した。**今回いちばん
  体感の変わる数字。** 戻すなら `app/globals.css` と `lib/motion.ts` の2つ同時。
- JS のタイマーが CSS とずれないよう `lib/motion.ts` に `ms()` を足し、
  `BottomSheet` の閉じ待ち / `LEAVE_MS` / `POP_OUT_MS` / `GROUND_MS` /
  `DIAL_OUT_MS` / `MAP_FULLSCREEN_MS` / `SLIDE_MS` / `DASH_MS` を参照へ変えた。
- `CLAUDE.md` に**デザインシステムの章**と**grep の機械チェック**を追加。
  「shadcn/ui・Tailwind・Framer Motion・`layoutId` を入れない理由」も明記。

### ついでに直った実バグ（3件）

1. **`@keyframes tab-in` の二重定義**。後勝ちしていた方が `translateY` を
   持っていて、もう一方の「transform を乗せると下部固定バーがガクつく」という
   理由付きコメントを無効化していた。opacity のみへ一本化。
2. **入力欄の自動ズーム**。`input`/`textarea` の文字が 12〜15 のまま残っている
   欄が7つあった。iOS は 15 以下の入力欄にフォーカスすると画面を拡大し、
   以後レイアウトが崩れたまま戻らない。すべて 16 以上にした。
3. **`DASH_MS`(360) が `--dash-ms` の既定値(420) と食い違っていた**。指の
   速さが取れないときだけ使われる値なので気づきにくかった。

### 検証したこと / していないこと

- `npm run build` ✓ / `tsc --noEmit` ✓ / `eslint` ✓（残る警告は既存の `<img>` 3件）
- **本番ビルド**（`npx next start`）＋ Playwright で 390×797・コンソールエラー
  **0件**。ブリーフ / ストック / プラン / ゴール / 設定 の各画面と、タブの
  切り替え・トースト・`Button` の primary が正しく出ることを確認した。
- ★**dev サーバーでは読み込み画面から進まない**（`next/font` とプロキシの
  既知の相性。`docs/project_knowledge.md` §8 参照）。**検証は本番ビルドで行う。**
- ★**実機は未検証**（この環境で WebKit を動かせない構造的な制約）。

---

## 次に着手すること

1. **実機（iOS Safari）での確認**。★今回は「見た目の数字」を全面的に動かして
   いるので、いつもより広く見ること。
   - ★★**閉じる動きが 350ms → 600ms になった手ざわり**。ボトムシート・
     ポップオーバー・作るものを選ぶ輪・入力画面。**遅すぎたら
     `--t-out` と `T_OUT` の2つを戻すだけ**（他は全部そこから引いている）。
   - ★**全体がわずかに大きく・ゆったりした**はず（本文 12 → 13px、
     補助 10.5 → 11px、入力欄が 16px）。詰まって見える所・溢れる所が無いか。
   - ★**タブバーの高さが 76 → 77px**（目印の行の余白を目盛りに乗せたため）。
     下部固定バーがタブバーへ潜っていないか。
   - ★★★**上下の帯が消えたか**（第35巡の本題）。①下の帯（輪の円が下で
     まっすぐ切れないか）②上の帯（入力画面を開いて閉じたあと、上に暗い帯が
     残らないか）③**タブバーが元の位置に戻っているか**（ホームインジケーターに
     乗っていないか）。★**ホーム画面から一度消して追加し直してから**見ること。
   - キーボードの後ろ … 操作バー（`^ v ✓`）の裏まで帯と同じ色か。
2. ★**`v7.mjs` が落ちるのを追う**（第33巡からの積み残し）。日程シートを開いた
   あと、器のキーボード判定が「閉じた」と誤解して入力画面ごと閉じている
   ように見える。**実バグの可能性がある。**
3. **Cowork のプロンプト更新**（`COWORK-ROUTINES.md`）… 候補の項目を
   `いつ`（★**日付で書かせる**。YYYY-MM-DD）/ `道具・場所` / `持ち物` /
   `タグ`（英字5つ）へ揃える。日付で書かれないと期日にならず、
   `lib/inboxImport.ts` がメモへ回す。
   ★**プロンプトの全文を提示して承認を得てから**実装する。

---

## 未解決・持ち越し

- **実機 Safari の未検証** … 第33巡の見た目の変更全般、タスクアプリ全般、
  ジャーナルの円のドラッグとマイクの解放。
- ★画面の上下の帯は**第35巡で解決した**（`statusBarStyle: "default"` ＋
  `NAV_BOTTOM_GAP` の足し戻し ＋ `theme-color` の着地保険）。
  ★**`black-translucent` へ戻さないこと／`position: fixed` を伸ばして
  下の帯を埋めようとしないこと**（第34巡に試して実機で1pxも動かなかった）。
- ジャーナル・ウィッシュ・ストックの行先が未定／1日の終わりに3アプリを
  1枚のポスターへプレスする（§38）は未着手。
- **完成時に撤去** … `lib/taskDemo.ts`「デモを入れる」ボタン、`ProfileTab` の
  「ブリーフ生成の実験」、★「画面の数値を出す」
  （`lib/debugViewport.ts` / `components/tasks/ViewportProbe.tsx`）。
- `.tc-lamp` は `.press` の別名として当分残してある（既存の18箇所を一度に
  書き換えないため）。手が空いたら `.press` へ寄せて別名を消す。

---

## いま触っている領域のファイル

★全体のファイル地図は `CLAUDE.md`。ここは**いま手を入れている所だけ**。

```
lib/tokens.ts                      ★寸法の語彙(SPACE / TYPE / RADIUS)。第33巡に新設
lib/motion.ts                      ★動きの語彙(JS)。曲線・時間・ms()・＋の丸の場所
app/globals.css                    ★動きの語彙(CSS)の :root ／振付／.press(沈む合図)
components/Button.tsx              ★押せる面(Button / Press)。第33巡に新設
lib/ground.ts                      ★地色。優先度つきの積み木・onGround・GROUND_EASE
lib/viewportKick.ts                ★iOS の起動直後だけ縮む不具合への対処(未確証)
components/AppShell.tsx            列の横スライド／タブバー／輪の入口／NAV_H
components/BottomSheet.tsx         ★閉じ待ち(ms(T_OUT))と CSS の時間が対
components/CreateMenu.tsx          作るものを選ぶ輪(RECORD / TASK)
components/tasks/TaskComposer.tsx  入力画面。★板＋器の top/height 追従／LEAVE_MS
components/tasks/Popover.tsx       ポップオーバーの器(Press は Button.tsx へ移した)
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

主な回帰（`scratchpad/`）… `chin35`（上下の帯）/ `ground26`（地色）/
`motion26`（動き）/ `rect24`（器の追従）/ `menu28`（作るものの輪）/
`probe31`（数値表示）/ `when25` `pop21` `when20` `tap` `plus` `geo4`
`v6`〜`v15` `blink` `bake` `swipe` `seam` `junk` `text` `drift2` /
単体 `solid.test` `tag.test` `inbox.test`。
★`v7` は落ちたまま（下記「次に着手すること」）。`drift2` はまれにゆらぐ。

## ユーザー側の作業（アプリの外）

- Cowork に**毎晩のタスク「1日を仕分ける」**を設置する（例: 02:00 JST）。
- 任意: `OPENAI_API_KEY` を Vercel に登録すると文字起こしが Whisper 系になる。
