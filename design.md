# design.md — UI の目盛りと、それを強制する grep

数値の持ち主は `lib/tokens.ts`（余白・文字）/ `lib/constants.ts`（色）/
`app/globals.css` の `:root`（動き）の**3か所だけ**。実装が食い違ったら本ファイルが正。
★段を増やさないこと。**目盛りの外に居てよいもの**は §7。段を決めた経緯は
`docs/project_knowledge.md` §3。
★入れないもの … shadcn/ui・Tailwind・Framer Motion・`layoutId`・CSS の 3D 変形
（★**WebGL は別件**で、使ってよい。改札鋏は three.js で描いている ―― 第17巡）
（`perspective` / `rotateX/Y`）。理由は `docs/archive/shell-redesign-2026-08.md` §65。

---

## 1. 文字 — この表から引く

| `TYPE` の段 | 太さ | 行間 | 字間 |
|---|---|---|---|
| `display` 26 / `head` 20 | `bold` | `snug` | 数字 `tight` / 和文 `normal` |
| `lead` 16 / `body` 13 | `text` | `body` | `normal` |
| `small` 11 / `micro` 9 / `nano` 7 | `bold` | `flat` | 欧文 `caps` / 和文 `normal` |

```ts
LEAD   = { flat: 1.0, snug: 1.3, body: 1.7 }
TRACK  = { tight: "-0.02em", normal: "0", caps: "0.16em", wide: "0.24em" }
WEIGHT = { text: 400, bold: 700, heavy: 800, black: 900 }
```

- `heavy`(800) は数字の主役だけ。`wide`(0.24em) は層名・ロゴ的な大文字だけ。
- ★★`black`(900) は**券の題だけ**（第74巡にユーザー指定）。§5-2 の「中間を作らない」に
  反しないのは、これが**中間ではなく上の端**だから。`heavy` と同じ扱いで、**増やさない**。
  ★和文で 900 が本当に出るのは、`app/layout.tsx` が `Noto Sans JP` を**可変**で
  読んでいるから（`weight` を渡すと 700 で頭打ちになる。第73巡に踏んだ）。
- ★**`fontSize` と `fontWeight` は必ず同時に書く**（片方だけだと既定 400 へ落ちて弱く見える）。
- ★**和文に `caps` / `wide` を当てない**。和文は字面が正方形なので、欧文用の字間を足すと
  **字間だけが抜けて見える**。和文は必ず `normal`。
- ★**`caps` / `wide` を `textAlign: "center"` と使うときは `marginRight: "-0.16em"` を添える**。
  字間は最後の字の右にも付くので、そのぶん右へずれて見える。
- ★★**横並びは `alignItems: "baseline"`。** `center` は行ボックスの中心で揃えるため、
  文字サイズが違うと**ベースラインは原理的に揃わない**。`center` が正しいのは
  ①両側とも文字でない ②高さの決まった箱どうし（★**両方に同じ `height` を与える**。
  片方だけ `padding` で膨らませると下端が揃わない）③意図した意匠（理由をコメントに書く）の3つ。
- 入力欄は `lead`(16) 以上（15 以下は iOS が勝手に拡大する）。

## 2. 余白 — `SPACE` から引く。左右は「ページ最上位の器」だけが持つ

★`padding` / `margin` / `gap` / `rowGap` / `columnGap` に**数字を直接書かない**。
必ず `SPACE.*`（`hair` 2 / `xs` 4 / `sm` 8 / `md` 12 / `lg` 16 / `xl` 24 / `xxl` 32）。
複合指定も同じ … `` padding: `${SPACE.md}px ${SPACE.lg}px` ``。
角丸も同じ … `RADIUS`（`sm` 4 / `md` 8 / `lg` 12 / `xl` 18 / `sheet` 28 / `pill` 999 / `circle` "50%"）。

```
[タブ直下の最上位コンテナ]   ← ★ここだけが paddingInline（= SPACE.lg）
  └ セクション / カード / 行  ← 左右パディングは 0。内側の余白は上下か gap で作る
```

- ★`paddingLeft` / `paddingRight` / `paddingInline` を書いてよいのは最上位だけ。
  入れ子が 1 段増えると実効 32px になる。
- ★**負の余白は禁止**（重ねたいなら `position` で重ねる）。要るなら `-SPACE.sm` の形だけ。
- 端まで伸ばす面は `full-bleed` の器を**1つだけ**（★二重に掛けない）。
- 合計値は手で足さず**式で書く**（`MAST_H + TAB_PAD_TOP + …`）。

## 3. 色 — グレーは4段。有彩色は9つ

| 名前 | 値 | 比 | 役 |
|---|---|---|---|
| `INK` | `#1A1A18` | 15.3:1 | 主役の文字 |
| `CHARCOAL` | `#2A2A28` | 12.6:1 | ほぼ黒 |
| `SECOND` | `#5A5A54` | 6.1:1 | 副文（二番目に強い文字） |
| `MUTED` | `#8E8E88` | 2.9:1 | 補助・非活性。★**本文に使わない**（AA 4.5:1 を割る） |

★★**分類に使う有彩色は9つだけ**（第73巡に決め、第75巡に色を差し替えた）。
色そのものは `lib/constants.ts` の **`SCHEME`**、「役 → 色」は **`lib/palette.ts`** の
1か所。**この2つ以外に色を書かない。**

★★★**色は「メイン × サブ」の組で持つ**（2026-08-31・第75巡にユーザー指定）。
**メイン**＝面の色（普通の意味のカラースキーム）／**サブ**＝その面に載る
**大きな文字**の色。★★**サブは大きな文字だけ**（券の題 `head`/900・図形の名前・罫）。
本文（`body` 13）と小さなラベル（`small`/`nano`）は `INK`／`PAPER` を使う ――
サブは表示用の色なので、組によっては本文に要る 4.5 に届かない（実測 2.98〜6.78）。
**載せる大きさで要る比が変わる**（WCAG … 本文 4.5／18.66px 太字以上と図 3.0）。

| 役 | メイン | サブ | サブ比 | 本文 | 本文比 |
|---|---|---|---|---|---|
| ドメイン バショ | `#FDCD84` | `#A96017` | 3.26 | `INK` | 11.8 |
| ドメイン タイケン | `#D37552` | `#6D190D` | 3.59 | `INK` | 5.3 |
| ドメイン ジョウホウ | `#6AB3CD` | `#084753` | 4.39 | `INK` | 7.4 |
| ドメイン モノ | `#E3B3D6` | `#661B54` | 6.32 | `INK` | 9.7 |
| タグ WORK ／ **肯定** | `#344C41` | `#F2D1C3` | 6.51 | `PAPER` | 8.9 |
| タグ LIFE | `#85AD9D` | `#0F2114` | 6.78 | `INK` | 7.0 |
| タグ WELLNESS ／ **選ばれている** | `#8176B7` | `#2F247B` | 3.14 | — | 3.9 |
| タグ SOCIAL ／ **危険** | `#B65116` | `#FDCF76` | 3.44 | `PAPER` | 4.8 |
| タグ GROWTH | `#9B1A14` | `#F9A788` | 4.28 | `PAPER` | 7.9 |

- ★**状態の3色は9つから借りる**。新しい色を足さない。**ドメインの4色は
  どの状態とも重ならない**ので、券の色が UI の合図と混ざらない。
- ★地は `BD_GREY`(`#E6E7E1`) と `JOURNAL_BG`(`#B3B3AE`) の2つだけ。
- ★同じ役のものを何十枚も並べる場所（バインダー）は、**色相を変えず明暗だけ**
  散らす（`DOMAIN_STEPS`）。
- ★16 進をコンポーネントに書かない。グレーの語彙に混ぜない。

## 4. 動き — 曲線4本。時間は「何が動くか」で4つ

| 何が動くか | 時間 | 曲線 |
|---|---|---|
| **面**（シート・ページ・カメラ） | `--t-in` 700 / `--t-out` 600 | `--ease-settle`（下から出る面は `--ease-sheet`） |
| **要素**（面の中のひとつ） | `--t-item` 420 | `--ease-settle` |
| **押下** | 沈み `--t-press` **90** ／ 戻り `--t-out` 600 | 沈み `--ease-press` ／ 戻り `--ease-settle` |
| **環境ループ**（無限） | `--t-amb-*` | `linear` / `ease-in-out` |

`--ease-settle`(0.16,1,0.3,1) ★主役 ／ `--ease-sheet`(0.32,0.72,0,1) 下から出る面 ／
`--ease-press`(0.4,0,1,1) 加速して沈む ／ `--ease-exit`(0.4,0,0.2,1) 加速してから減速する唯一の形

- ★★**押下だけが非対称**（即座に沈み、ゆっくり戻る）。**沈みを 0.6s にしない** ―
  押した感触が消える。
- 新しい `cubic-bezier` を書かない。対称な `ease` / `ease-in-out` は環境ループ以外で使わない。
- 時間差は `--t-step`(50ms) の倍数。合成は可（`calc(var(--t-in) + var(--t-item))`）。
- インラインの `transition` は必ず `var(--t-*)` と `var(--ease-*)` を含む文字列で書く。
  語彙から引いた埋め込み（`` `opacity ${ms(T_OUT)}ms var(--ease-press)` ``）も可。
- JS のタイマーも語彙から引く（`ms(T_OUT)`）。数字を書き写すと CSS だけ変えたときにずれる。
- 押せる面は `components/Button.tsx` だけ（`Button` ／ 入力画面は `Press`）。
- **`primary` は1画面に1つ。** 並び立つ選択肢は `secondary`、取り消し・あとでは `ghost`、
  図だけは `icon`（`aria-label` 必須）。

---

## 5. 情報の階層 — レイアウトを決める順番

**「余白が多い」の正体は、たいてい情報が足りないことではなく、束ね方が決まって
いないこと。** 大きさや色を触る前に、まず役を決める。

### 5-1. 決める順番

1. **数える** … 画面に載せる項目を全部書き出し、**役**で束ねる（主／従／付帯）。
2. **段を割り当てる** … 役の数だけ `TYPE` の段を使う。★**4段まで**。5段以上要ると
   感じたら、それは役が整理できていない合図。
3. **主役は1画面に1つ** … いちばん大きい文字はひとつだけ。同率一位を作らない。
4. **色は最後** … 階層は**大きさ・太さ・余白**で作る。色は階層の道具ではなく、
   **1か所だけの合図**（このアプリではタグのピル）。
5. **同じ役は同じ形** … ALIGN の「時刻＋タグ」と TIMELINE の詳細の「時刻＋タグ」は
   同じ組み方にする。画面が違っても、役が同じなら形も同じ。

### 5-2. 差は「見て分かる」だけ離す

| | 決まり |
|---|---|
| 大きさ | 隣り合う段は **1.3倍以上**。26/20(1.3)はぎりぎり、26/16(1.63)は明確 |
| 太さ | `bold` と `text` の2値で足りる。**中間を作らない** |
| 色 | `INK`(主) → `SECOND`(従) → `MUTED`(付帯) の3段。**同じ段の中で色を変えない** |
| 余白 | 束の**中**は `hair`〜`xs`、束の**間**は `md` 以上 |

★★**束の間が束の中より狭くなったら、階層は壊れている。** 距離の差そのものが
「これらは仲間」「これらは別」を伝えている。

### 5-3. 縦に積むか、高さを合わせるか

一覧は上から順に積む。ただし**別の絵と対応している文字**は、順番ではなく
**その絵の高さに合わせる**（TIMELINE の詳細＝レーンの図形と、その説明）。

★このとき重なりは**二段階**で解く … ①上から順に「上の行を追い越さない」
②下から順に「下端と次の行を越えない」ように押し戻す。
**前へ詰めるだけにすると、入り切らないときに末尾の行が下端で潰れ合う**
（第67巡に実際に起きた）。

### 5-4. 例 — TIMELINE の詳細（第67巡）

```
名刺を刷り直す              ← 主   SANS bold  lead   INK    snug
14:00–16:00  #WORK         ← 従   LATIN bold small  MUTED  ＋ 唯一の色（ピル）
版下を確認する ・ 紙を選ぶ    ← 付帯 SANS text  body   SECOND
TAKE  名刺入れ・見本         ← 付帯 ラベルは micro caps MUTED、中身は body SECOND
─────────────────
8/27                3 TASKS ← 日の見出し（帯のすぐ上に固定）
```

段は `head / lead / small / body / micro` の5段、色は3段、束の中は `hair`〜`xs`、
束の間は `md`。**ALIGN より項目が多いのに散らからないのは、段と色を増やして
いないから。**

## 6. 機械チェック（作業の前後に必ず走らせる）

★**#1〜#7・#10〜#13 は 0 件。#8・#9 は件数を見て目視。**
ルールと検出は必ず対で持つこと ― 検出の無い性質は例外なく劣化する。

```bash
# 1 迂回した cubic-bezier
grep -rn "cubic-bezier" components lib --include=*.tsx --include=*.ts | grep -v "var(--" | grep -v "GROUND_EASE" | grep -v "^components/Button.tsx:9:"
# 2 インラインの生の時間（" と ` の両方）
grep -rnE 'transition[A-Za-z]*: *("|`)[^"`]*[0-9]+m?s' components app --include=*.tsx | grep -v "var(--" | grep -vE '\$\{ms\('
# 3 生の fontSize
grep -rhoE 'fontSize: [0-9.]+' components app --include=*.tsx | sort | uniq -c
# 4 globals.css の生の時間（var(--) と同居していても拾う。0ms / 0s は除く）
grep -nE '\b(transition|animation)\b[^;]*(^|[^-\w(])(0*[1-9][0-9]*(\.[0-9]+)?|0*\.[0-9]*[1-9][0-9]*)m?s\b' app/globals.css
# 5 生の余白（★三項やテンプレの陰も見る。0 と、理由を書いた例外は除く）
grep -rnE '\b(padding|margin|gap|rowGap|columnGap)[A-Za-z]*:[^,}]*[^\w.$-]-?[1-9][0-9]*\b' components app --include=*.tsx | grep -v 目盛りの外 | grep -vE ':[0-9]+: *(//|\*)'
# 6 生の行間・字間・太さ（★lineHeight: 0 は行ボックスのリセットなので除く）
grep -rnE '\b(lineHeight|letterSpacing|fontWeight): *"?-?[1-9]' components app --include=*.tsx | grep -v 目盛りの外
# 7 16 進の直書き
grep -rn '#[0-9A-Fa-f]\{3,8\}\b' components app --include=*.tsx | grep -v 目盛りの外 | grep -vE ':[0-9]+: *(//|\*)'
# 8 左右パディングの持ち主（目視。最上位の器だけか）
grep -rnE '\b(paddingLeft|paddingRight|paddingInline): ' components --include=*.tsx
# 9 横並びの center（目視。baseline であるべきものが無いか）
grep -rn 'alignItems: "center"' components --include=*.tsx | wc -l
# 10 位置の生の数値（隅のバッジなど）。★下の FIG は図形・物理のファイル（§7）
FIG='GravityTab|DriftTab|SolidCanvas|GeoType|TabIcons|LeafletMap|Binder|TaskSpace'
grep -rnE '\b(top|left|right|bottom|inset)[A-Za-z]*: *-?[1-9][0-9.]*' components app --include=*.tsx | grep -vE "$FIG" | grep -v 目盛りの外 | grep -vE ':[0-9]+: *[(/*]'
# 11 fontSize と fontWeight は必ず対（style オブジェクト単位なので grep では書けない）
#    ★これだけは件数ではなく**終了コード**で見る（0 なら OK）
node tools/check-weight.mjs
# 12 globals.css の 16進と生の余白（★色の持ち主は lib/constants.ts の1か所だけ）
grep -nE '#[0-9A-Fa-f]{3,8}\b|(padding|margin)[a-z-]*: *[^;]*[1-9][0-9]*px' app/globals.css | grep -v 目盛りの外 | grep -vE '^[0-9]+: *(/\*|\*)'
# 13 hair(2) の役の誤用（罫と光学的な詰め専用。器の左右の余白に使わない）
grep -rn 'px \${SPACE.hair}px' components app --include=*.tsx
```

---

## 7. 目盛りの外（絵と物理の寸法）

**画面の余白ではなく「絵と物理の寸法」であるものは、4の倍数へ丸めると
物理法則が変わるか、絵が歪む。** だから目盛りに乗せない。

| 種類 | 具体例 |
|---|---|
| **matter.js の力と場** | 初速・`frictionAir`・アトラクタの係数・`TAP_MOVE`(8px) |
| **ALIGN / TIMELINE の寸法** | `ALIGN_MAX_W/H`・`PITCH_TIGHT/SPREAD`・`ARC_APEX_X`・`ARC_SWING`・`ROW_H`。★互いに縛り合っている（`H × 0.75 ≤ PITCH` を割ると図形が重なる）ので**一つだけ動かせない** |
| **canvas の描画座標** | `SolidCanvas` / `GeoType` / `lib/solidPaint.ts` / `lib/paperTexture.ts` / `lib/spring.ts` のバネ係数 |
| **図形そのものの寸法** | 綴じ穴の直径・装飾図形の `-height/2`（縦の中央合わせ）・アイコン内部の `gap`・✕印の2本の線の交点 |
| **表示専用の巨大欧文** | `SWISS_XL`(72) と、その行間 `0.86`（字面を詰めて塊にする。`LEAD.flat`(1.0) では緩い） |
| **端末が決める値** | `env(safe-area-inset-*)` を含む式（`TAB_PAD_TOP` / `NAV_BOTTOM_GAP` / `NAV_H` / `NAV_OFFSET`） |
| **外部APIの引数** | Leaflet の `fitBounds({ padding: [40,40] })` |
| **マスク** | `#000` は「色」ではなく「不透明」の意味 |

**ファイルまるごと図形の座標系**なので検査 #10 から外すもの …
`GravityTab` / `DriftTab` / `SolidCanvas` / `GeoType` / `TabIcons` / `LeafletMap` /
`Binder` / `TaskSpace`。

★**それ以外は、その行に理由を書く**（`// ★目盛りの外（…）` ／ JSX の中では `/* … */`）。
検査はこの印だけで除外する。**印の無い例外は例外ではない。**

---

## 8. 検査の書き方（過去に2度やった失敗）

★★**除外を「行ごと」にしないこと。** 行に他のトークンがあるだけで行全体を捨てると、
同じ行に同居した生の値を見逃す（#4 と #6 が実際にそれで取りこぼしていた）。
**トークンは数字で始まらない**ので、`プロパティ: 数字` を直接見れば行ごとの除外は要らない。

★★**値が「見えているか」で判定を分けないこと。** #5 は `プロパティ: 数字` の形しか
見ておらず、**三項の陰**（`marginBottom: x ? 22 : 0`）とテンプレの中の12件を見逃していた。

★★**突き合わせの検証は「比較できた件数」を必ず表示すること。** 移行前後の
computed style を突き合わせるとき、キーを「木の中の位置」で作ると、要素が1つ
増減しただけで全キーがずれ、**比較0件のまま「差分なし」と誤報する**（第66巡に
実際に起きた）。キーは**タグ＋中身＋文字サイズ＋同名の何番目**で作る。
