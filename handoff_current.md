# いまどこにいるか（第69巡・2026-08-28／Explore の刷新に着手した）

3アプリ（JOURNAL / TASK / EXPLORE）は動いている。第68巡までで TASK は一段落。
**第69巡から Explore の刷新を始めた。設計の正は `docs/explore-redesign.md`。**

---

## Explore 刷新の骨子（`docs/explore-redesign.md` が正）

- **2本の柱**は提案と実行。それを貫く共通部品が**券**で、場所によって縮尺だけが変わる。
- 場所は3つ … 提案（1枚）／ストック（格子）／マップ（点）＋ プランを重ねる。
- **言葉は一般語**。メタファーは視覚だけ。「本日の販売は終了しました」のような
  言い回しは使わない。
- 入鋏＝残す。**鋏痕の形は4ドメインに対応**し、3か所（券の穴／マップのノードの形／
  ストックの絞り込み）で同じ意味を持つ。
- **CSS の 3D 変形は使えない**（design.md 冒頭）。立体感は SVG で「描く」。

---

## 直近完了（第69巡）

### 券の部品を作った
- `lib/ticket.ts` … 鋏痕の形（4ドメイン→半円/三角/角型/二山）と輪郭の生成、
  辺ごとの回転、通し番号、バーコードの棒の並び。
  ★**鋏痕は券の縁を切り欠く**（紙の中の穴ではない）。実物の鋏こんと同じ。
- `components/explore/PunchMark.tsx` … 切り欠き（`PunchNotch`）、印（`PunchGlyph`）、
  バーコード（`Barcode`・棒の並びは通し番号から決まるので毎回同じ）。
- `components/explore/Nipper.tsx` … 改札鋏。★**SVG で立体的に描く**
  （CSS の 3D 変形は Safari の描画崩れを5回踏んでいるので使わない）。
  顎の開閉は支点まわりの2Dの回転だけ。彩色は `NIPPER_PAINT`（図形専用のパレット）。
- `components/explore/Ticket.tsx` … 券面。左の耳（バーコード＋縦の通し番号）／
  肩の極小欄／写真／大きな日付と分類の丸／題・要約／VENUE・VALID UNTIL の欄／
  縁の切り欠き。細い罫と極小の欧文で券らしさを出している。
  **写真が無い券は写真の枠が分類色の面になり、題がその中で大きく伸びる。**
- `lib/constants.ts` に `TICKET_DOMAIN_COLOR` / `TICKET_PAPER` / `TICKET_DECK` /
  `TICKET_ASPECT`(5/7) / `TICKET_PERF` / `TICKET_GRAIN` を追加。
  ★**分類の色は4ドメインが持つ**（kind ごとの色は使わない）。kind は帯の漢字1文字。
- `app/dev/explore/page.tsx` … 開発用の確認画面（本番の導線からは辿れない）。

機械チェック13本は 0件。`npx tsc --noEmit` と eslint も通っている。

### 検証手順の穴を1つ塞いだ
開発サーバーは **`NODE_EXTRA_CA_CERTS` と `NODE_OPTIONS=--use-env-proxy` の両方**が要る。
片方だけだと next/font/google の取得が落ちてページが 500 になる。
curl は成功するので気づきにくい（`docs/project_knowledge.md` §8 に記録）。

---

## 次の一手

1. **提案（TODAY）** … 鋏を右下に大きく置き、ドラッグすると**一番近い縁に吸い付く**。
   離すとそこが切り欠かれ、券が落ちて次が出る。下端に束の厚み。
2. **券面の詰め** … 切り欠きが分類の丸や文字に被る位置がある。写真が無い券の
   色面の比率。鋏の柄の描き込み。
3. **ストック（STOCK）** … 格子・鋏痕での絞り込み・期限。
4. ここで一度**実機で確認**（提案側が完成する）。
5. マップのレイアウトエンジン（駅データの調達から）。

## 未解決

- 場所ごとに地の色を変えてよいか（design.md は「地色は列が持つ」）。
- 提案とストックを1画面にするか、2つに分けるか。
- 駅データ（ekidata）の同梱可否。
- ★**既存の Explore の4タブはまだ手つかず**。新しい部品ができるまで現状のまま動く。

---

## 重要パス

- ★Explore 刷新の設計 … `docs/explore-redesign.md`
- ★UI の規約と機械チェック13本 … `design.md`（作業の前後に必ず走らせる）
  ／ 目盛り … `lib/tokens.ts` ／ 色 … `lib/constants.ts`
- 券 … `components/explore/Ticket.tsx` / `PunchMark.tsx` / `lib/ticket.ts`
  ／ 確認画面 `app/dev/explore`
- タスクの本体 … `components/tabs/GravityTab.tsx`
- 入口の輪 … `components/CreateMenu.tsx`（RECORD / TASKS / SETTING）
- カメラ … `components/tasks/TaskSpace.tsx`
- ブリーフ … `lib/briefPipeline.ts`（`fetchSite` / `fetchDirect` / `jinaSlot`）
  ／ 単体チェック `npx tsx tools/jina-check.mjs`
- 検証 … 開発サーバーは上の2つの環境変数を付ける。Playwright は
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  ★★測り方の罠4つ … ①dispatch 直後に DOM を読むと rAF 前の値が返る
  ②遠い行を測ると「連鎖」の遅れを不具合と読み違える（**焦点の行**を測る）
  ③`waitForTimeout(40)` は 60fps に対して 2.4 コマなので**測り方のせいで**ばらつく
  ④★**同じ式から書いた2つの値を突き合わせても検証にならない** ―
  「見えている幾何」を測り、**比較できた件数を必ず出す**
