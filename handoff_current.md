# いまどこにいるか（2026-09-14／ホームを作っている最中）

**ホームが動いている**（帯＋山＋日付の板）。★第102巡に**ホームの軸になる操作**
＝**帯のピルを引いて日付を割り当てる**が入った。
★★★**Explore の刷新（券・改札鋏）は保留**（`DEV` タブごと最後に処分）。
★★★**いま試している大きな変更は1つ**（実機で見て決めてもらう段階）… **アプリごとの
アクセント配色**（`lib/appAccent.ts` の `ACCENT_TEST`。**`false` の1行で元へ戻る**）。
仕様の正 … `docs/home-spec.md`（ホーム。**§6 が引き下ろしの正**）／
`docs/project_knowledge.md` §3-h／`design.md`（UI の規約と機械チェック13本）。

---

## 直近完了

### ★★★第102巡 ── セーフエリアを戻す／板をもう一回り／**引き下ろして日付を割り当てる**

**① セーフエリアは左右対称**（ユーザー指摘）。**第101巡のわたしの読み違いを戻した。**
「タブバーの横幅」＝**右下の「作る」の丸まで含めた** `[16, w−16]` であって、
帯（白いピル）の右端 310 ではない。→ `pileLeftOf`/`pileRightOf`/`pileSpanOf` を**削除**、
`PILE_INSET` の対称へ。★★★**`lib/pileBox.ts` の頭に「もう振らない」と書いた。**
★実測 … 山の図形 left **19.3** / right **367.7**（セーフエリア [16, 374] の内側）。

**② 板をもう一回り** … `PILE_WORD_MAX` **61 → 72**。塗りの箱 240×54 → **283×64**。

**③ 引き下ろし**（ユーザー指定。**`docs/home-spec.md` §6 が全文**）――
触る＝沈む → 〜56px は**ゴム**（指の 42%）→ 越えると**図形へ変形しながら指に吸い付く**
→ **ホームで離す＝今日**／**右端で離す＝カレンダー**／**途中で離す＝何も起きない**。
- ★★★**摘みは4つだけ**（`lib/pullDrag.ts`。`PULL_ARM` 56 / `PULL_RESIST` 0.42 /
  `MORPH_SPAN` 160 / `PULL_GIVE` 1.6）。**進みは時間ではなく距離**なので曲線4本は使わない。
- ★★★**形は `stackOutline(rows, ar, waist)` の `waist` 1本**。新しい形を作らない
  （帯のピル＝1段のピルの積み）。提案だけは `t > 0.5` で**札の形**へ。
- ★★★**絵は山の canvas に描く**（`drawGhost`）。**離した瞬間の継ぎ目が無い。**
- ★★**ゴムは `lib/spring.ts` の `rubber()` 1本**（TIMELINE の伸びと共用）。
- ★★**「7本の柱」（旧 K1）はやめた**（ユーザー確定）。遠い日が選べないため。

**④ 山の図形が長押しで動かなかった** ―― **`Body.setVelocity` は眠った体を起こさない**。
→ `M.Sleeping.set(body, false)`。★実測 … **無し 0.0px / 有り 156.7px**。

**⑤ カレンダーの盤を `components/DateGrid.tsx` へ持ち上げた**（`WhenSheet` と共用）。
早押しは**今日・明日・来週**（「今週末」→「来週」。入力画面も変わった）。
★地は**墨**。★**日をタップしたらその場で確定**。
★★★**`createPortal(…, document.body)` が必須** ―― `.app-track` の `transform` が
`position: fixed` の包含ブロックになるので、**横に3倍（1170px）へ伸びた**。

**⑥ Explore の「日付に割り当てる」は半分しか無かった** ―― 実行とログ（`finishDay` →
`doneAt` → `bindLog`）は生きていたが、**「その日の予定」の入れ物が死んでいた**
（`magazine` は今日1日ぶん＋**書き込む呼び手 0 件**＝**山の提案の円は常に0個**）。
→ **`Item.plannedFor`（`Task.dueDate` と同じ形）を1つ足した**。
★★**実行・ログ・アーカイブ・my-brain は1行も変えていない。**
★★★**「今日を終える」は `AppShell.finishDay` と `Dashboard` の両方**に足す
（`Dashboard` の `canFinish` を忘れて**ボタンが死んだ**）。★`buildMagazine` は削除。

**検証（件数つき・WebKit 390×844）**
- 器 … タブバーの帯 [16, 310]／丸 [322, 374]／**山の図形 19.3〜367.7**（2件）。
- 板 … `WEDNESDAY` の塗り **283.1 × 64**（第101巡 240×54）。4辺とも切れていない。
- `waist` … `waist=1` が旧実装と一致（**9件・最大差 3.5e-9**）／外接箱は両端で ±0.5。
- 手つき … 20px 引く＝`dueDate` 空のまま／240px 引いてホームで離す＝`dueDate` 今日／
  ASSIGN の帯が出る（x 342・w 48）／カレンダーが開く（来週あり）／20 をタップ＝その日。
- Explore … 提案を引き下ろす＝`plannedFor` 今日、**山に札の形の円が出た**（前は常に0個）。
  「今日を終える」＝`status: done` / `doneAt` / **`bindLog` 1 件**。
- `WhenSheet` 回帰なし … 早押し3つ・月送り 9→10・`›` で 10→11・62 マス。
- 機械チェック13本 **0件**・`tsc` 0・`eslint` 0（警告7は既存）・`build` 成功・`pageerror` 0。

### ★★★第101巡 ── 板の見切れ／当たり判定／芯の色／ピルの左右／字間

- **板の見切れ** … ★★★**canvas の `ctx.font` は書体の読み込みを頼まない**し、
  `document.fonts.ready` は**頼んでいないものを待たない**。→ `ensureWordFont` で
  頼んでから測る／`wordFontReady` で1度だけ測り直す／**余りを字の大きさに比例**
  （`PLATE_BLEED` 0.16）。★ついでに `PLATE_TRACK` の渡し漏れと鍵の `dx`/`dy` も。
- **図形が出なくなる** … **中身を入れる引き金は「世界を作り終えた最後の1行」だけ**で、
  途中で抜けると山は二度と埋まらない。→ **締切つきの門**（`GATE_MS`）／
  **`getContext` は毎フレーム取り直す**／**0 の寸法を弾く**／**空だったら入れ直す番人**。
  ★★実証（第100巡のコードで画素 0 → いまは出る）2件。
- **当たり判定** … ホームの山だけ体が矩形だった。→ `stackOutline` / `cardShapePoints`。
  `HAIR`(1.5) → **`PHYS_GAP`(1)** で4か所が同じ数を読む。
- **芯をグレーへ**（`MUTED`。比 4.3）／**ピルの左右のベゼル**（`ROW_SIDE` 2。★`rowAspect`
  も同じ数を読むので字は小さくならない）／**板の字間 -0.02em**（Anton は元から詰まっている）。

### ★★★第89〜100巡までの要点（寸法は上書き済み。教訓だけ）

- ★★★**段の中に1行**（`layoutInRows` に一本化）。**壊れていた理由は刻みが2つあった**。
- ★★★**大きな欧文は Anton（`DISPLAY`）**。「ダサい」の正体は書体ではなく**潰し方**。
  **偽コンデンスは撤回**（`SQUEEZE_AIM = 1`）。canvas は `wdth` を受けない。
- ★★★**参照の形は全部「円をつないだ形」**。**正弦波で円に似せない**（角で √2 倍）。
- ★★★**`objectBoundingBox` は 0〜1 のパスを器へそのまま掛ける** ―― ①器が正方形で
  ないと潰れる ②外接箱が 0〜1 でないとベゼルが形ごとに変わる（→`fitBox`）。
- ★★★**録音画面は「アイコンを拡大して画面に嵌めた絵」**。数は全部 `lib/cassette.ts`。
- ★★★**コメントと値が食い違う定数を作らない**（`KEY_LABEL_H` で 5px ずれた）。
- ★★★**実機のバグの正体 ＝ `mask-size` が効かず SVG が固有の 1:1 で置かれていた**。
  → **`clip-path` ＋ `objectBoundingBox`**。★id は札ごとに `useId()`。
  ★★**Playwright の WebKit でも再現しなかった** ―― 実機でしか証明できない。
- ★★★**切るのは写真だけ。札には掛けない**（掛けると `box-shadow` が消える）。
- ★★★**タグを全廃**。タスクの性質は**「日付があるか／ないか」だけ**（`isDated`）。
- ★★★**ぼやけ ＝ ResizeObserver が2つ**／**下が空く ＝ 床の二重引き**（`.bleed-x-b`）／
  **effect を2本に割る**（1本だと題を1文字直すたび山ごと落ち直す）。
- **タブバーの高さは `navHeightPx()`**（実機 132px／Chromium 81px）。

---

## 次の一手

1. ★★**実機で見てもらう**（第102巡）… ①**引き下ろしの手ざわり**（ゴム 56px・変形
   160px・吸い付き）②**ASSIGN の帯の出方**（`--ease-sheet` / 700ms）③**カレンダー**
   （墨・早押し3つ・横スワイプ）④**山の図形が長押しで掴めるか** ⑤**セーフエリア**
   （右端が開きすぎていないか）⑥**板の大きさ**（`PILE_WORD_MAX` 72）
   ⑦**提案を今日へ割り当てて「今日を終える」**とログに残るか
   ⑧**アクセント配色を採るか捨てるか**（捨てるなら `ACCENT_TEST` を `false`）。
2. ★**日付を付けると山が丸ごと落ち直す**（下の「未解決」）。1つだけ足す道へ。
3. ★**`magazine` と `ItemStatus "planned"` を消す**（起動時の後片付けと永続化の移行に
   絡むので単独の巡で）。
4. **持ち物** … 右上のアイコン＋数の印（警告）。押すと印のすぐ下に小さな一覧。
5. **フォローアップの夜間生成がまだ無い**（★プロンプトは先に文面で出して承認を得る）。
6. ★ピルを押したときの詳細（まだ無い）。★山の図形はもう押せる（`Piece.nav`）。

## 未解決

- ★★★**日付を割り当てると `sig` が変わるので山が丸ごと落ち直す**（第102巡）。
  **1つだけ足す**道が要る（`Pile.tsx` の中身の effect）。
- ★★**`magazine` と `ItemStatus "planned"` は死んだ欄**（`plannedFor` が正）。
- ★★★**提案の生成は止まったまま。** 15 は**表示だけ**の上限なので裏の未読 41 枚は
  減らず、夜間の生成は `POOL_CAP`(40) に掛かり続ける（切り替える場所は
  `app/api/cron/build-brief/route.ts` にコメント済み）。
- ★★**波形は録音中しか出ない**ので、**帯そのものの見え方は実機でしか確かめていない**。
- ★★★**「器が一度 0×0 になる」道は再現できていない**（第101巡）。守りは入れたが、
  **実機でまだ出るなら残っているのはこの道**。`Pile.tsx` の `read()` と
  `makeWalls` の下限を疑うこと。
- ★★**GRAVITY の山とホームの山は同じ `PILE_INSET`**（第102巡に揃った）。
- ★★**輪郭の字は地の上で比 2.55**（本文の下限を割る。★目盛りの外・ユーザー確定）。
- ★★★**札の比は `ITEM_CARD_ASPECT` から来ていない。`BRIEF_CARD_ASPECT` が正。**
- ★★**録音画面の本体は左右へはみ出したまま**（片側 **243px**）＝**仕様**（ユーザー確定）。
- ★★**黄の札とクリームの地の比は 1.27**。縁は**影**が持つので、札を切り抜くと縁が消える。
- ★★★**札の実機のバグは「直したはず」の段階**（Chromium も WebKit も再現しない）。
- ★★**券の大きな英語は Archivo ＋ `wdth 70` のまま**（`DEV` と `/dev/explore` だけ）。
- ★★**地と紙の差が比 1.01**／`SectionLabel` は明るい地で 3.2 ＝ AA 割れ。**既知・未対応。**
- ★★**札の中の「文の下から操作の列までの隙間」**（本文が短い札で空く）。**未着手。**
- ★★★**帯の「今日行ける」は営業時間を知らない**（`kind` ごとの表＝**近似**）。

---

## 重要パス

- ホーム … `HomeTab.tsx`／帯 `Band.tsx` ＋ `lib/homeBand.ts`／山
  `components/home/Pile.tsx` ＋ `pileWorld.ts` ＋ `pilePaint.ts`／器 `lib/pileBox.ts`
  ／配線 `AppShell.tsx`／仕様 `docs/home-spec.md`
- ★★★**引き下ろし … `lib/pullDrag.ts`（算数と `pullBus`）／`components/home/AssignRail.tsx`
  （右端の帯）／`components/home/AssignSheet.tsx`（カレンダー）／盤は
  `components/DateGrid.tsx`（`WhenSheet` と共用）**。**摘みは4つだけ。**
- ★★★**セーフエリアは全画面で `SPACE.lg`、左右対称**（`lib/pileBox.ts` の `PILE_INSET`）。
  **タブバーは右下の丸まで含めてこの幅。もう振らない。**
- ★★★**タスクの形は `lib/solid.ts` の `stackOutline`（ピルの積み）が正**。
  **段の数は `lib/taskSize.ts` の `rowsOf(title)`**（純粋な関数）。絵も物理も山も
  **そこから引く**（`shapeRowsOf`）。★**`waist` が「ピル ⇄ 図形」の変形**。
- ★★★**文字の割り付けは `lib/textFit.ts` の `layoutInRows` だけ**（段に1行。
  ベゼルは `ROW_FILL` から四方へ回る）。**割り付けを2つ持たない。**
- ★★★**塗り／輪郭は `lib/solidPaint.ts` の `paintShape` と `isDated` が正**
  （山は `pilePaint.ts` にも同じ分岐。**片方を直したら両方**）。
- ★★★**カセットの寸法は `lib/cassette.ts` の1か所**（タブの SVG／山の canvas／
  録音画面の DOM）。**リールの芯の形は `lib/reelHub.ts`**（SVG と canvas が同じ点の列）。
- ★★★**書体は3つ** … `SANS`／`LATIN`／**`DISPLAY`（大きな欧文と数字だけ。Anton）**。
  ★★**canvas は `font-variation-settings` を受けない**（**偽コンデンスは撤回済み**）。
- ★★★**札の形は `lib/cardShape.ts`（点の列が正）＋ `CardShapeDefs.tsx`。
  割り当ては `lib/ticket.ts` の `PUNCH_BY_DOMAIN` から導く**。
  ★**CSS のマスクを使わない。`clip-path` ＋ `objectBoundingBox`。器は必ず正方形。**
- ★★★**山の器は `.bleed-x-b`**／**器を見る ResizeObserver は1つだけ**／
  **文字の板は `lib/wordPlate.ts` の1か所**（★DOM で組み直さない）。
- ★★★**帯の「今日行ける」は `lib/todayPick.ts` の1か所**（`kind` ごとの時間帯＝**近似**）。
- ★**色そのものは `lib/constants.ts` の `PALETTE`（6行）だけ**／役との対応は
  `SCHEME` と `lib/palette.ts`／★**面から導く3つ** … `bodyInkOn`・`redOn`・`inkVarsOn`。
- ★UI の規約と機械チェック13本 … `design.md`／目盛り `lib/tokens.ts`／動き
  `lib/motion.ts` ＋ `app/globals.css` の `:root`
- タスク … `GravityTab.tsx`（★山の物理の出どころ。ホームと**対**）／カメラ
  `TaskSpace.tsx`／入口の輪 `CreateMenu.tsx`
- 券・鋏（★保留中）… `components/explore/samples/`／`Ticket.tsx`／`lib/nipperShape.ts`
- ブリーフ … `lib/briefPipeline.ts`／単体チェック `npx tsx tools/jina-check.mjs`
- ★★★**WebKit がこの環境で動く** … `executablePath` 無しに起動（**Chromium だけ**
  `/opt/pw-browsers/chromium`）。★★**万能ではない**（第95巡の札のバグは再現しなかった）。
- 検証 … 開発サーバーは `localhost` で開く。★★**山の測定は 8 秒待つ**／
  **canvas の倍率は場所で違う**（山 3／他 2）／`next build` は Google フォントの取得に
  **ときどき失敗する**（数回やり直す）。★**入力画面の見本は upright なので、図形の
  文字を画素で測るのに使える**（外側から塗って輪郭の連結成分を除くと字だけ残る）。
