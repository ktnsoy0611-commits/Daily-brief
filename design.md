# design.md — UI の目盛りと、それを強制する grep

数値の持ち主は `lib/tokens.ts`（余白・文字）/ `lib/constants.ts`（色）/
`app/globals.css` の `:root`（動き）の**3か所だけ**。実装が食い違ったら本ファイルが正。
★段を増やさないこと。**目盛りの外に居てよい例外**（`env(safe-area-inset-*)`／
図形と物理の座標系／噛み合う部品寸法）と、段を決めた経緯は
`docs/project_knowledge.md` §3。
★入れないもの … shadcn/ui・Tailwind・Framer Motion・`layoutId`・CSS の 3D 変形
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
WEIGHT = { text: 400, bold: 700, heavy: 800 }
```

- `heavy`(800) は数字の主役だけ。`wide`(0.24em) は層名・ロゴ的な大文字だけ。
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

## 3. 色 — グレーは4段。増やさない

| 名前 | 値 | 比 | 役 |
|---|---|---|---|
| `INK` | `#1A1A18` | 15.3:1 | 主役の文字 |
| `CHARCOAL` | `#2A2A28` | 12.6:1 | ほぼ黒 |
| `SECOND` | `#5A5A54` | 6.1:1 | 副文（二番目に強い文字） |
| `MUTED` | `#8E8E88` | 2.9:1 | 補助・非活性。★**本文に使わない**（AA 4.5:1 を割る） |

- ★16 進をコンポーネントに書かない。画面固有のパレットは**名前付きの集合**へ
  （`TASK_TAGS` / `BINDER_COLORS`）。グレーの語彙に混ぜない。

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

## 5. 機械チェック（作業の前後に必ず走らせる）

★**#1〜#7 は 0 件。#8・#9 は件数を見て目視。**
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
# 5 生の余白
grep -rnE '\b(padding|margin|gap|rowGap|columnGap)[A-Za-z]*: *-?[0-9]' components app --include=*.tsx
# 6 生の行間・字間・太さ
grep -rnE '\b(lineHeight|letterSpacing|fontWeight): *("?-?[0-9]|")' components app --include=*.tsx | grep -vE '(LEAD|TRACK|WEIGHT)\.'
# 7 16 進の直書き
grep -rn '#[0-9A-Fa-f]\{3,8\}\b' components app --include=*.tsx
# 8 左右パディングの持ち主（目視。最上位の器だけか）
grep -rnE '\b(paddingLeft|paddingRight|paddingInline): ' components --include=*.tsx
# 9 横並びの center（目視。baseline であるべきものが無いか）
grep -rn 'alignItems: "center"' components --include=*.tsx | wc -l
```

★移行が済むまで #5〜#7 は 0 になりません。**新しく増やさないこと**を最優先とする。
件数の推移と移行表は `handoff_current.md`。
