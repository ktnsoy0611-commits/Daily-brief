# プロジェクトナレッジ（現行仕様の正）

このファイルは**いま有効な設計・確定仕様・データモデル**だけを載せる。
過去の経緯・却下された案・不具合の修正史は `docs/archive/` にある。
「いまどこまで進んでいるか」は `handoff_current.md`。

- 生成パイプラインの設計思想 … `SYSTEM-DESIGN.md`
- Cowork（週次の発掘・分析、毎晩の仕分け）に渡すプロンプト … `COWORK-ROUTINES.md`
- 初期要件定義書（**データモデルとタブ構成は古い**。目的と思想の参照用）
  … `docs/archive/implementation-handoff-2026-07.md`

---

## 0. このアプリは何か

ユーザー本人 1 人のための PWA。タスク管理アプリではなく、
**「やりたいこと」を集め・実行し・記録として綴じる**ための道具。

**絶対に守るユーザーの設計思想**
- タスク化しない（義務や TODO の消化にしない）
- 設定画面を増やさない（`ProfileTab` が唯一の設定で、これ以上増やさない）
- 説明文を置かない（本人専用アプリなので、使い方の案内は不要）
- OS 標準のフォーム UI（角丸ボタン・ドロップダウン・標準テキストボックス・
  シャドウ）を使わない。**純粋な幾何学図形・ベタ塗り・太いタイポグラフィだけ**で
  画面を構成する

---

## 1. アプリの構造

3 つのアプリを、**タブバーの帯を横に払って**行き来する（`lib/apps.ts` が正）。

| 順 | アプリ | `en` | タブ |
|---|---|---|---|
| 0 | ジャーナル `journal` | JOURNAL | レコード `journal-record` / 今日 `journal-today` / アーカイブ `journal-archive` |
| 1 | タスク `tasks` | TASK | 候補 `tasks-drift` / タスク `tasks-gravity` |
| 2 | ブリーフ `life` | EXPLORE | ブリーフ `brief` / ゴール `goals` / ストック `stock` / プラン `execute` |

- 右端からさらに右へ払うと先頭へ**回り込む**（一周ループ）。位置は 0〜2 に
  丸めない**通し番号 `pos`** で持つ。丸めると端で位置が飛ぶ。
- **3 つの列は常にマウントされたまま**。初回描画後に `requestIdleCallback` で
  残り 2 つを先読みし、以後アンマウントしない。
- アプリごとに最後に見ていたタブを覚える（`tabByApp`）。
- 画面左上（`Masthead`）は**アプリ名**（EXPLORE / TASK / JOURNAL）を
  幾何アルファベットで。タブ名はタブバーのアイコンの下に小さく出す。

### ダッシュボード
画面下から引き上げる共通の引き出し（`components/Dashboard.tsx`）。
どのアプリからでも開ける。中身は「選んでいるカード」と「今日のタスク」、
下端に **「今日を終える」**。これで選んだカードは `done` になりアーカイブへ移る。
開き具合は 0〜1 の連続値 `--dash` で、指の位置と 1 対 1。

**メタファー（§38 で確定した体験の構造）**
- Journal … 音声の抽出（テープを巻き、切り出す）
- Task … 落下と粉砕
- Explore … 立体の展開と結合
- 1 日の終わりに 3 要素が 1 枚の幾何学ポスターへプレスされる（**未実装**）

---

## 2. データモデル（`lib/types.ts` が正）

- `Item` … ストック／プラン／アーカイブに出る「願望の対象物」。
  `kind`（place/exhibition/live/activity/food/movie/book/album/info/thing）×
  `area`（場所の有無は種類と独立の直交軸）。
  `status: candidate → planned → done`、`origin: brief | manual | wish | info`、
  `lat/lng/placeId`、`goalId?`、`expiresAt?`。
  分類の入口は `domainOf(item)`（`lib/helpers.ts`）ただ 1 つ。
  4 ドメイン `ItemDomain = place | experience | info | thing`
  （バショ／タイケン／ジョウホウ／モノ）。
- `Wish` … ✨で書く受信箱。`category: ItemDomain`。KEEP されて初めて Item になる。
- `Goal` / `CheckIn` … ゴールのバインダーと記録。
- `Task extends TaskSides` … §4 参照。
- `InboxCandidate extends TaskSides` … Cowork が声のメモから作った候補。
- `JournalEntry` / `VoiceNote` … ジャーナルと声のメモ。
- `BriefCard` / `GrowthCard` … ブリーフのデッキのカード。
- `AppState` … 上記すべての入れ物。
  - `generatedDecks: Record<"YYYY-MM-DD", BriefCard[]>` と `cronStatus` は
    **サーバー（夜間 Cron）が所有**する（`lib/dataStore.ts` の
    `SERVER_OWNED_KEYS`）。クライアントは読むが上書きしない。
  - `magazine` / `weekendMeta` / `shelfOrder` は**もう更新されない**
    （それを使っていた UI が廃止済み）。型は互換のために残してある。

**永続化** … `lib/dataStore.ts`。3 モード（cloud / persistent / memory）。
Supabase の環境変数があり、かつログイン済みのときだけ cloud。
localStorage のキーは `qol-app-state-v1`。

★`migrate()` は `wishes` が無い state を**最古の形式とみなして全部捨てる**。
テストで localStorage に state を差し込むときは必ず `wishes` を置くこと。

---

## 3. デザイン言語

**テクスチャを排除し、ベタ塗りの色面・直線・円などの純粋幾何学**（§38 で確定）。
角度は 0 / 45 / 90 / 180 度のみ。

### 色（`lib/constants.ts`）
| 用途 | 定数 | 値 |
|---|---|---|
| 地（EXPLORE / TASK） | `BD_GREY` | `#ECECEA` |
| 地（JOURNAL） | `JOURNAL_BG` | `#B3B3AE` |
| 紙 | `PAPER` | `#FAFAF9` |
| 墨 | `INK` | `#1A1A18` |
| 控えめな字 | `MUTED` | `#8E8E88` |
| アクセント | `BLUE` `RUST` `GREEN` `GOLD` `PLUM` `SLATE` | — |

色を捨てたぶんアクセントの 6 色家族が効く。遊び心はそちらが担う。

### 幾何アルファベット（`components/GeoType.tsx`）
見本から**画像解析して転写**した書体。1 文字＝162×162 の正方形を
「セル 78px＋溝 6px の 2×2 グリッド」に割り、`full` / 四半円 / 端丸帯 / 空 の
4 種を置き、**繋がっているところだけ溝を塗る**。等幅。A–Z と 0–9。
**使うのは `Masthead` のアプリ名だけ**。タグ・棚の見出しは本文の書体
（`SectionLabel`、`components/common.tsx`）。

### ★構造的な約束（破ると必ず壊れる）

1. **CSS の 3D 変形を使わない。** `perspective` / `preserve-3d` / `rotateX/Y` は
   Safari の合成で 5 回崩れた（archive: ui-binder §5 / §7.9 / §7.14、
   shell-redesign §7.32 / §7.35）。
2. **`position: fixed` は必ず `createPortal` で `document.body` 直下へ。**
   `.app-track` が `transform` を持つので、その中の fixed は画面ではなく
   トラックを基準に解決され、画面外へ飛ぶ（archive: shell-redesign §26.1）。
3. **アプリの地色を塗ってよいのは `AppColumn` だけ。** 出どころが 2 つあると
   遷移中に混ざって境目が出る（同 §51）。地色を変えるときは
   `components/AppBackdrop.tsx` の `groundOf` だけを直す。
4. **`body` に `background` を書かない。** body 直下の負の z-index にある地を
   塗りつぶす。地色は `html` にだけ書く（同 §27.1）。
5. **タブバーはフローから外す**（`position: absolute; bottom: 0`、`fixed` は
   iOS の URL バー伸縮でズレるので禁止）。本文の領域は常に画面いっぱい。
   画面の四隅まで敷きたいタブは **`.full-bleed` を付けるだけ**で、
   タブバーの高さの計算をタブ側に書かない。高さを知っているのは
   `lib/constants.ts` の `NAV_H` / `TAB_PAD_TOP` と、それを CSS 変数
   `--nav-h` / `--pad-top` として配る `AppShell` だけ（同 §50）。
6. **`document.querySelector("[data-tab-scroll-root]")` は使わない。**
   スクロールルートは 3 つ同時に存在し、先頭は必ずタスクの列。
   自分の列は `el.closest("[data-tab-scroll-root]")` で引く。
7. **共有する定数は `lib/constants.ts` へ。** `AppShell` に置くと
   `Dashboard → AppShell → Dashboard` の循環参照でビルドが落ちる。

### ★性能の作法
- **毎フレーム変わる値を React の state に入れない。** ref と、CSS カスタム
  プロパティ（`--drag` / `--dash`）への直接書き込み、canvas で扱う。
  ドラッグ中の React のレンダーは 0 回が正しい。
- **`@property` は使わない**（Safari 16.4 未満に無い）。トランジションは
  カスタムプロパティ自身ではなく、そこから `calc()` で導かれる
  transform / width / opacity の側に掛ける。
- **重いものは合成レイヤーへ上げる**（`will-change: transform`）。巨大な図形の
  隣で canvas を毎フレーム描くと、同じレイヤーを汚して図形ごと塗り直される。
- **`animation-direction: reverse` では再生し直されない。** 逆再生させたい
  ときは**別名のキーフレーム**を用意して `animation-name` ごと差し替える。
- **`animation-fill-mode`** … `both` にすると最後のコマの transform が
  残り続け、JS が書く値を上書きする。遅延の間だけ見せたいなら `backwards`。

---

## 4. タスクアプリ（§53 で確定）

**アイソメも 3D も持たない。真横から見た立面を 2 枚、ベタ塗りで描くだけ。**

| ビュー | 形 | 載る文字 |
|---|---|---|
| FRONT | 長方形（`len × 2r`）。スラブの切れ目で割れる | **タスクのタイトル** |
| BOTTOM | 断面（円／半円／三角／四角）。**縦横比は正しいまま** | **タグの英字** |

色はどちらもタグの色を全面に。文字は下地の輝度で白か黒。

**書体は図形（タスク）ごとに 1 つ**（2026-08-16 確定）。1 文字ずつ変えるのは
明確に否定された。`faceIndexFor(seed)` が id だけから決定的に引く
（乱数だと再描画のたびに変わってちらつく）。同じ図形の中の同じ文字は
ピクセル単位で同一になる。

**タグを持たない図形は作らない**（同）。`resolveTag()` が
①本人／Cowork が決めたタグ → ②題や側面の言葉から見立て（`inferTag`）→
③id から決定的に 5 つのどれかへ、の順で必ず 1 つ与える。「NO TAG」の
無彩色は廃止した。展開図のタグのマスにも「未設定（—）」の見え方は無い。

**ビューを切り替えるたびに落とし直す**（同）。切り替えると、いま画面にある
図形が**上にあるものから順に縮んで消え**（`EXIT_MS` 260ms /
`EXIT_STAGGER` 38ms・消えている間は物理を止める）、消え切ってから新しい
見え方で上から落ちてくる。

### 寸法の対応
```
横幅   len   = タイトルの文字数 × 手順の残り     lib/taskSize.ts
高さ   2r    = 重要度（小/中/大）。物理の重さも直結
断面の形     = 埋まっている側面の数（1..4）      lib/solid.ts
スラブ       = 残っている手順（済ませるたび 1 枚消え、短く軽くなる）
色           = タグ                              lib/taskTags.ts
落ちる順     = 切迫度（期日）
```
- 側面の情報は `Title / When / Context / Belongings`（`SideKey`）。文字として
  出るのは**タイトルとタグ名だけ**で、他は「埋まっている数＝断面の形」として効く。
- タグは 5 つ … `WORK / LIFE / WELLNESS / SOCIAL / GROWTH`。
- 図形の基本サイズ `UNIT = 64`。

### ファイルの役割
- `lib/solid.ts` … 幾何。純粋関数のみ。`section` / `sectionOutline` /
  `innerBox`（文字を置いてよい矩形）/ `frontRect` / `slabRects` / `boundsOf`。
- `lib/textFit.ts` … 1 文字ごとの書体割り当て、箱に最大で収める、白黒判定、
  **グリフのアトラス**。
- `lib/solidPaint.ts` … `paintShape`（立面 2 枚）＋図形 1 枚のビットマップ
  キャッシュ（LRU、フレームごとの焼き予算つき）。
- `components/tasks/` … `SolidCanvas` / `TaskSheet`（方眼の設定画面）/
  `ViewToggle` / `TaskAddButton`。
- `components/tabs/GravityTab.tsx`（落として積む）/ `DriftTab.tsx`（円環の
  カバーフロー）。

### ★守ること
- **`ctx.font` は CSS 変数を解決できない。** `var(--font-…)` を含む文字列を
  代入すると黙って失敗し、既定の 10px サンセリフのままになる。
  `resolveFamily()` で `getComputedStyle(document.documentElement)` から
  一度だけ解決する。
- **文字はグリフのアトラス経由で描く。** 和文の Web フォントは unicode-range で
  数百の `@font-face` に分割されており、`fillText`/`measureText` は
  **(書体, 文字) の組ごとに初回 5〜10ms** かかる。素直に描くと落下中に
  `fillText` だけで 2.4 秒。同じ (書体, 文字, 色) は一度だけ焼いて
  `drawImage` で使い回し、**1 フレームに 1 枚だけ**焼く。
  書体を図形ごと 1 つにしてから (書体, 文字) の組み合わせが激減し、図形を
  7 個→16 個に増やしても落下のコストは変わらなくなった
  （4× CPU 絞り・本番ビルドで合計 1186ms / 最大 164ms。ビュー切替は 88ms、
  積み終わったあとと横スワイプは 0ms）。
- **和文の Google フォントは 1 書体につき 1 ウェイトまで。** 3 書体 × 3
  ウェイトで turbopack が `Module not found` を出す。太字・斜体はブラウザの
  合成に任せる（`app/layout.tsx`）。
- **`document.fonts.load()` の Promise は必ず `.catch()` する**
  （unhandled rejection で pageerror が飛ぶ）。書体が届いたら
  `onFontsReady` でアトラスとビットマップを捨てて描き直す。
- **当たり判定は「そのビューで実際に描く形」**。FRONT は長方形、BOTTOM は
  断面の多角形（`Bodies.fromVertices`）。BOTTOM でも長方形で当てていた頃は、
  断面の周りの見えない余白どうしがぶつかって図形が宙に浮いて見えた。
  ★`fromVertices` は**重心**を `body.position` に置くが、絵は図形の原点を
  中心に焼いてある。三角形のように両者がずれる形では、そのズレ（`ox`/`oy`）を
  描画側で戻すこと。戻さないと絵と当たり判定が食い違う。
- 手順を済ませて形が変わったときは、位置と速度を引き継いで body を差し替える
  （ビュー切替は全部作り直すので、こちらは編集のときだけ）。
- **落下位置の hash に連番をそのまま使わない。** `"t1","t2",…` は hash も
  連番になり、全部が同じ x に落ちて 1 本の塔になる。黄金比の定数を掛けて混ぜる。
- `TaskSheet` のルートは `data-task-sheet` と `--cell` / `--gx` / `--gy` の
  **既定値**を持つこと。無いと `var()` が不正になり方眼ごと描かれない。

---

## 5. 声の記録（Journal）

`components/VoiceStudio.tsx` 1 つで完結。ジャーナルの RECORD タブと、
タブバー右端の録音ボタンから開くオーバーレイが**同じ部品**を使う。

- 画面下部に**画面をはみ出す巨大な円が 2 つ**（カセットのリールの抽象）。
  直径＝器の幅の 1.30、中心 x = ∓0.30、中心 y は
  「タイトルの下端とタブバーの上端の中間」。
- 操作は**トグル**。REC キーか**円の上**をタップで開始／停止。それ以外の
  余白は反応しない。止めても送らず `review` で待つ。
- 停止後、同じ 2 つの円が**トリミングのダイヤル**になる。左＝始点、右＝終点。
  1 回転で全体の 50%。惰性つき（指を止めてから離したら速さは 0）。
- 物理キー 4 つ（丸・直径 42・出っ張り 4）… `REC` / `PAUSE` / `SEND` / `CANCEL`。
  `MediaRecorder.pause()/resume()` で続きから録れる。止まっている間は数えない。
- 実際に切る … `lib/audioTrim.ts`。`decodeAudioData` で波形に戻し、必要な範囲
  だけを 16bit PCM モノラル WAV へ組み直す。デコードできない端末では
  **元の音声をそのまま送る**。
- 文字起こし … `app/api/transcribe/route.ts`。`OPENAI_API_KEY` があれば
  Whisper 系、無ければ `GEMINI_API_KEY` で Gemini の音声入力。結果は
  `AppState.voiceNotes` と my-brain の `days/YYYY-MM/voice.md` へ。

### ★守ること
- **マイクは必ず解放する。** 生ストリームを自分で持ち（`streamRef`）、
  二重起動を防ぎ（`startingRef`）、`onstop` が来なかったときの保険
  （1500ms）も置く。どの終わり方でも `releaseStream()` を通す。
- **波形の棒は「本数 × 等間隔」で置かない。** 測定の `setInterval` は
  45ms ちょうどでは来ないので、増えるたびに 1 本ぶん飛ぶ。測った瞬間の
  経過時刻を記録し、**時刻から位置を出す**。
- **`navigator.vibrate` は iOS Safari に無い。** 手応えはハプティクスでは
  返せないので、掴んだ合図は `transform: scale()` の視覚で出す
  （**塗りの色は変えない**。巨大な面が十数フレーム塗り直される）。
- **入場アニメーションの再生の合図は AppShell から prop で渡す。**
  IntersectionObserver で見え方から推測すると実機で閾値に達せず、
  円が出てこない。

---

## 6. ブリーフ生成（運用ポリシー）

パイプラインの詳細は `SYSTEM-DESIGN.md`、実装は `lib/briefPipeline.ts`。
**ここに書くのはユーザーが明言した「これを正とする」運用だけ。**

### 情報源とカードの関係（§8.15）
- **情報源の本体は、雑多で高品質なネットマガジン**（カルチャー・技術・生活・
  音楽・ファッション）。淘汰・入れ替えでゆっくり好みに追従する。
  ここから、興味に合致する＝**提案カード**、合致しない新着＝**情報カード**。
  **カルチャー誌の「記事」を第一級で扱う**のが中核の体験。
- 展覧会・映画・イベントの集約サイトは、**情報が集約されているから固定に
  しているだけ**で、他の情報源と完全に平等。**抽出・分類・枚数配分のどこにも
  「展覧会を優先する」構造を作らない。**

### 更新と枚数（§8.18）
- **1 日 2 回**（朝 06:30 JST / 夕 13:30 JST の Cron）、各 **10 枚くらい**。
  事前に生成してストックし、アプリを開いたら即出る。
- 未消化カードの保持は **3 日**。ストック上限 **40 枚**（超えている間は追加生成
  しない）。キーは**日付だけ**（`YYYY-MM-DD`。朝刊／夕刊の概念は撤去済みで、
  Cron は置き換えではなく **id 重複を除いた積み増し**）。
- **「今すぐ生成」はテスト用**。完成時に削除する。

### 構造（§8.19）
2 層＋コード検証。**AI に「落とす」判断をさせない**ので、候補が 1 件でもあれば
構造的に 0 枚にならない。
- 層 1（サイトごと・並列）… 抽出と関連度付け（0〜100）を 1 回で。
- 選抜（コードのみ）… 出典 URL の実在検証・終了済み／圏外／重複の除外の後、
  関連度順にサイト横断ラウンドロビン。`>=80` ストレート／`50〜79` 派生／
  `<50` 情報カード。**trigger もコードが関連度から決める。**
- 層 2 … 採用分だけ個別ページを取得して本文を詳細化。

### ★絶対の原則
- **LLM に URL を抽出させない。** 抽出のつもりが推測創作になる（§8.12.5 で
  実在しない展覧会を丸ごと捏造した）。URL は必ず**コードが実 HTML／Markdown
  から機械的に取り出した集合**で照合し、外れたカードは機械的に捨てる。
- **retrieval は Jina Reader 経由**（`r.jina.ai`）。生 fetch は IP ブロック・
  JS 描画・正規表現依存で繰り返し失敗した（§8.12.13）。
- **機械的な処理はコードで、LLM に投機させない**（日付の期限切れ判定、距離の
  計算、枚数の配分、重複の統合）。

### 情報源の淘汰（§8.20）
個別のスキップは記録しないので、打率は**集計値として別に持つ**。
`lib/sourceStats.ts` が `generatedDecks` と `briefs` からドメインごとの
`shown / kept / flagged` を積算し（`countedIds` で二重計上を防ぐ）、
my-brain の `sources/stats.md` へ書く。Cowork の発掘タスクはこの数字だけを
見て並べ替え・淘汰する。

---

## 7. 基盤

- **Supabase** … `supabase/schema.sql`。`app_state`（キーごとの行＝書き込みを
  分離）/ `context_notes` / `api_usage` / `content_cache`。RLS は全テーブル
  `auth.uid()` 一致。★`value` 列に `not null` を付けないこと（`magazine` など
  正当に null になる値があり、付けると upsert 全体が 400 で落ちる）。
- **認証** … **6 桁コードの入力**（`components/SignInGate.tsx`）。マジックリンクは
  使わない。iOS ではホーム画面 PWA と Safari が別の保存領域を持つため、リンクを
  踏むと永遠にログインできない。Supabase のメールテンプレートに `{{ .Token }}`
  が必要で、独自 SMTP（Resend）は**ポート 587**（465 は失敗する）。
- **Vercel** … ★**ハッシュ入りのデプロイ固定 URL を実機で常用しない**
  （そのビルドに永久に凍結される）。安定 URL は
  `daily-brief-lyart-six.vercel.app`。Supabase Auth の Site URL /
  Redirect URLs にもこれを登録してある。
- **地図** … Leaflet + CartoDB Positron タイル（`components/LeafletMap.tsx`）。
  座標は Places API（New）で解決（`app/api/resolve-place/route.ts`）。
  Google マップ URL に埋まった `@lat,lng` を正規表現で先に抜き、API 呼び出しを省く。
- **my-brain**（別リポジトリ。人間が編集する自己モデルの真実源）
  … パスを知っている場所は `lib/myBrainPaths.ts` **だけ**。以後どのコードも
  ここ経由でしかパスを書かない。
  ```
  me/taste.md      興味・好み・生活圏・願い・ゴールに効くキーワード
  me/patterns.md   手配漏れ・物忘れの傾向（毎晩の仕分けが育てる）
  me/goals.md      ゴールとチェックイン
  days/YYYY-MM/    facts.md / voice.md / summary.md / feedback.md
  inbox/candidates.md
  sources/         list.md / stats.md / proposed.md / dismissed.md
  analysis/taste.md
  ```
  front-matter の `owner: app | cowork | human` で所有者を分ける。1 ファイルを
  共同編集するのは `me/taste.md` と `sources/list.md` だけで、
  `<!-- BEGIN/END app-managed:… -->` のゾーン方式で衝突を避ける。

---

## 8. 検証ワークフロー

```bash
# 開発サーバー（★性能の計測は必ず本番ビルドで。dev は桁違いに遅く数字が無意味）
npm run build && npx next start > /tmp/.../server.log 2>&1 &

# Playwright はグローバル install 済みのものを使う
NODE_PATH=/opt/node22/lib/node_modules node script.mjs
#   import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
#   chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })
```

締め … `npx tsc --noEmit` / `npx eslint .`（`common.tsx` などの `<img>` 警告
3 件は既知・容認）/ `npm run build`。

### ★検証スクリプトの落とし穴
- **3 つの列と nav は常に DOM にある。** グローバルな `getByLabel` は別の
  アプリにヒットする。`getBoundingClientRect().x ≈ 0` で見えている列を特定し、
  その中に限定して探す。タブの `aria-label` は**日本語**。
- **`migrate()` は `wishes` の無い state を全部捨てる**（§2）。
- **見た目のスクリーンショットは「効果が出ている」証明にならない。** 影・
  グラデーションなど微弱な効果は Pillow などで**ピクセル値を直接サンプリング**
  して数値で確かめる。
- **WebGL / canvas のある画面は `page.screenshot()` 1 枚に 0.5〜1 秒かかり、
  その間 rAF が止まる。** 位相ごとの絵が要るときはアニメーションの定数を
  一時的に伸ばして撮る。CSS アニメーションなら `getAnimations()` で止めて
  `currentTime` を指定するのが確実。

### ★性能の測り方
`PerformanceObserver` で `longtask` を拾い、CDP の
`Emulation.setCPUThrottlingRate { rate: 4 }` を掛けて**本番ビルド**で測る。
- 比べてよいのは「**同じスクリプトで、変更あり／なしを続けて測った値**」だけ。
  スクリプトが変われば数字の意味も変わるので、過去の記録と比較しない。
- 重いときは Paint を疑う前に、まず **Layout かどうか**を CDP の `Tracing`
  （`devtools.timeline`）で確定させる。`textContent` への代入は**値が同じでも**
  レイアウトを汚し、`font-size` の遷移は遷移中ずっとレイアウトを走らせる。
- 「1 つずつ外して数字が動かない」ときは、**原因が 1 つではない**可能性を先に疑う。

### 動作確認用のダミー（★完成時に撤去する）
- `lib/constants.ts` の `CARDS`（ダミーのブリーフデッキ）
- `components/tabs/ExecuteTab.tsx` の `injectDemo`（「デモ用データを投入」）
- `lib/taskDemo.ts`（タスク 16・候補 12）と「デモのタスク／候補を入れる」ボタン。
  設定 →「その他」→「データの整理」の**「デモのタスク・候補を削除」**で、
  id が `demo-` で始まるものだけを消せる（手で作ったタスクと、声のメモから
  来た候補は残る）
- `ProfileTab` の「ブリーフ生成の実験（開発用）」カード・「今すぐ生成」

---

## 9. ドキュメントの構成と運用

| ファイル | 役割 | 上限 |
|---|---|---|
| `CLAUDE.md` | 普遍のルール・ファイル地図・恒久ルール。**毎セッション自動で読まれる** | 100 行 |
| `handoff_current.md` | いまどこにいるか・直近完了・次の一手・重要パス | 200 行 |
| `docs/project_knowledge.md` | 現行の設計・確定仕様・データモデル（このファイル） | — |
| `docs/archive/*.md` | 経緯と教訓。**自動では読まない**。必要なときだけ `grep` する | — |
| `SYSTEM-DESIGN.md` | 生成パイプラインの設計思想 | — |
| `COWORK-ROUTINES.md` | Cowork に渡すプロンプト（アプリは読まない） | — |

**変更を加えたら、コミットの前に必ず**：価値の無い記述を消し、教訓は
`docs/archive/` へ退避し、確定した仕様はこのファイルの該当章を**上書き**し、
`handoff_current.md` を書き直す。手順は `CLAUDE.md` の「恒久ルール」が正。
