# いまどこにいるか（第68巡・2026-08-26／TIMELINE の閉じを根治し、設定を輪へ入れた）

3アプリ（JOURNAL / TASK / EXPLORE）は動いている。
第66巡で UI 規約 `design.md` と目盛りへの移行が済み、第67〜68巡は TASK の
TIMELINE まわりの詰め。**第68巡の2件はまだ実機で見ていない。**

---

## 直近完了（第68巡）

### ★★★曜日の詳細の閉じ — 3巡ぶり3回目の指摘を根治した
**原因は `laneLeft()` の1行**。`sel` を `expandedRef.current` だけで見ていたので、
閉じ始めた**そのフレーム**に縦線・曜日の札・図形から隙間が消え、詳細パネルだけが
600ms かけて拭かれていた（＝「縦の列だけ閉じるのが早すぎる」）。
→ `expandedRef.current ?? closingRef.current` に。第62巡・第67巡の直し
（DOM を残す／隙間を待たせる）はどちらも症状側だった。経緯は
`docs/archive/shell-redesign-2026-08.md` §68。

- **見え幅は隙間 `gapRef` そのもの**。`advance()` が毎フレーム
  `clip-path: inset(0 N% 0 0)` に入れる。`.tl-detail` の CSS 2本・`ms(T_OUT)` の
  タイマー・開閉で `key` を変える作り直しは**すべて捨てた**。
- 片づけは `settled(gapRef, 0)`（バネの実際の長さで測る）。
- 実測 … パネルの見えている右端と、戻ってくる隣のレーンの左端の距離が
  **全フレームで 16.0±0.1px**（規定 `SPACE.lg`）。比較できたフレーム 9/16 ×2往復。

### ★★設定を右下の輪へ（RECORD / TASKS / SETTING）
各画面の `Masthead` 右上の歯車を廃止（`TabProps.profileButton` と
`Masthead` の `right`/`corner` ごと）。輪の3つは**文字だけ・半径の線上**。
`TYPE.lead`(16) / `WEIGHT.heavy`(800) / `TRACK.caps`(0.16em) / `LATIN`。
角度は SETTING 185° / TASKS 220° / RECORD 255°（35°ずつ）。
使える半径 122px に対し、いちばん長い SETTING が 85px。

---

## 直近完了（第67巡）

- **「自由」のワープ** … `syncLanes` は物体そのものを動かすので、画面外の列の物体は
  物理座標で `0..w` の外に居る。閉じる前に側壁を張り直すと matter が中へ押し戻す。
  → 壁を張る前に片づける。★前回「再現しない」と言ったのは**横にパンした状態で
  閉じていなかった**ため。再現手順には「何をした状態か」が要る。
- **TIMELINE の縦線と日付を常時表示**にし、入りを合図（`tlPhase`）に合わせた
  （`mode` は上へ引き**始めた**瞬間に timeline になるので、合図には使えない）。
- **詳細を図形の高さへ**（毎フレーム置き、重なりは**二段階**で解く。
  上から詰めるだけだと入り切らないとき下端で潰れ合う）。
- **詳細のレイアウトを組み直した** … 日 → 題 → 時刻とタグ → 手順 → 持ちもの。
  大きさ5段・色3段・**画面で唯一の色はタグのピル**。→ `design.md` §5 を新設。
- ALIGN のスクロール（投げの効き・指の下で戻るバグ）、上下の境目のマスク、
  焦点を画面の中央へ、設定アイコンの作り直し、層の名前の撤去。

## 直近完了（第66巡）

- UI 規約 `design.md`（405→221行）と目盛りへの移行（717件）。機械チェック**13本**。
- 画面の縦のラインを1本に（題字・バインダー・カード内オーバーレイ）。
- `app/layout.tsx` が `lib/constants.ts` から `:root` を注入し、CSS は変数だけ読む。

---

## 次の一手・未解決

- ★★**実機（iPhone / PWA）で確認**。ホーム画面から追加し直すこと。第68巡の2件
  （曜日の閉じ・右下の輪の3つ）と、第66巡の第1段（見た目が変わる）が未確認。
- `components/TabIcons.tsx` の `gear` は**参照が無くなった**が残してある
  （戻したくなったときのため）。
- `components/tasks/ViewportProbe.tsx` と `lib/debugViewport.ts` は開発用。
  iOS の画面の数値が落ち着いたら撤去する。
- **`JINA_API_KEY` は触らなくてよい**（第64巡に鍵なし既定へ。トークンを消費しない）。
  夜間実行のあと、設定 →「ブリーフ生成の状況」に「取得成功10・鍵なし」と出れば
  EXPLORE も復旧している。0 なら理由が出る。
- 開発環境は外向き通信がプロキシで 403 になるため、**実サイトの取得は試せていない**。

---

## 重要パス

- ★**UI の規約と機械チェック13本** … `design.md`（作業の前後に必ず走らせる）
  ／ 目盛り … `lib/tokens.ts`（`SPACE`/`TYPE`/`LEAD`/`TRACK`/`WEIGHT`/`RADIUS`）
  ／ 色 … `lib/constants.ts`（グレーは `INK`/`CHARCOAL`/`SECOND`/`MUTED` の4段）
- タスクの本体 … `components/tabs/GravityTab.tsx`
  （`advance` / `laneLeft` ★隙間の主 / `collapseDay` / `arcGeom` / `layoutAlign`）
- 入口の輪 … `components/CreateMenu.tsx`（RECORD / TASKS / SETTING）
- DRIFT … `components/tabs/DriftTab.tsx` ／ 的 … `components/tasks/DropTargets.tsx`
- カメラ … `components/tasks/TaskSpace.tsx`
- 紙 … `lib/paperTexture.ts` ＋ `public/paper-kraft.webp`（作り直しは `tools/make-paper.py`）
- ブリーフ … `lib/briefPipeline.ts`（`fetchSite` / `fetchDirect` / `jinaSlot`）
  ／ 単体チェック `npx tsx tools/jina-check.mjs`
- 検証 … `scratchpad/close68.mjs`（詳細の閉じ・輪の3つ）／ `scratchpad/r65.mjs`（ALIGN）
  ★★測り方の罠4つ … ①dispatch 直後に DOM を読むと rAF 前の値が返る
  ②遠い行を測ると「連鎖」の遅れを不具合と読み違える（**焦点の行**を測る）
  ③`waitForTimeout(40)` は 60fps に対して 2.4 コマなので**測り方のせいで**ばらつく
  ④★**同じ式から書いた2つの値を突き合わせても検証にならない** ―
  「見えている幾何」（＝別々の要素の位置関係）を測り、**比較できた件数を必ず出す**
