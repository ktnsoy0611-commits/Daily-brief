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

### 券は3巡目、鋏の投影は7巡目、鋏の**作り方**は9巡目に確定

★★9巡目に鋏を**ローポリ（面取りした多角柱の集合）＋フラットシェーディング**へ
作り替えた。8巡目までは「輪郭を掃引して階調を塗る」作りで、**面を持たない**ので
稜線が立たず、どこを直しても塗り絵に見えた（ユーザー評「すごくチープ」）。
**輪郭を描くのをやめ、立体を組んで面を落とす。** 詳細は `docs/explore-redesign.md` §2-b。

- `lib/nipperSolid.ts`（新設）… 断面（八角形ひとつ）・押し出し・法線・階調・投影・
  裏面落とし・奥から手前への並べ替え。**曲線は一度も出てこない。**
- `components/explore/Nipper.tsx` … **寸法と群（shadow / left_part / right_part /
  spring）と動き**だけ。投影（`away` の一点透視）は7巡目のまま。
- 階調は**面の向きだけ**で決まる（手で塗らない）。`NIPPER_PAINT` は
  **暗い順の6段 `ramp` ＋ `cast`** に作り替えた（役の名前 lit/face/side は廃止）。
- 光を正面寄りにすると**正面も面取りも一緒に白く飛ぶ**（面積で測ったら 44% が
  最明の段だった）。**ほぼ真横（左）から**当てるのが正しい。
- 動きは `lib/spring.ts` の減衰振動＋rAF（**framer-motion は入れない**。design.md
  冒頭で禁止）。閉じ＝`TRAVEL`（行き過ぎ＝ガチャン）／戻り＝`SETTLE`。
- ★JSX 側の `transform` は「いまのバネの値」で書く。`want` で書くと押した瞬間に
  **終わりの姿勢へ一度飛ぶ**。

### ★★アプリ全体のハイドレーションが壊れていたのを直した（`app/layout.tsx`）

`<style>` を `<html>` の直下に `precedence` 無しで置いていた。不正な HTML なので
**ハイドレーションが失敗し、クライアント側が丸ごと動かなくなる**
（`/dev/explore` で `useEffect` が1つも走らなかった）。
`href="tokens" precedence="default"` を付けて React に `<head>` へ持ち上げさせた。
★これは Explore とは無関係の**全画面に効く**修正。

### 検証手順の穴を1つ塞いだ
開発サーバーは **`NODE_EXTRA_CA_CERTS` と `NODE_OPTIONS=--use-env-proxy` の両方**が要る。
片方だけだと next/font/google の取得が落ちてページが 500 になる。
curl は成功するので気づきにくい（`docs/project_knowledge.md` §8 に記録）。

---

## 次の一手

1. **提案（TODAY）** … 鋏を右下に置き、掴んで券へ寄せる。券の縁に**吸い付き**、
   離すとそこが切り欠かれ、券が落ちて次が出る。下端に束の厚み。
2. **ストック（STOCK）** … 格子・鋏痕での絞り込み・期限。彩度の高い券が
   数百枚並ぶので、AuBe / Spotify 的な見え方になるはず。
3. ここで一度**実機で確認**（提案側が完成する）。
4. マップのレイアウトエンジン（駅データの調達から）。

## 未解決

- 提案とストックを1画面にするか、2つに分けるか。
- 駅データ（ekidata）の同梱可否。
- ★**既存の Explore の4タブはまだ手つかず**。新しい部品ができるまで現状のまま動く。

---

## 重要パス

- ★Explore 刷新の設計 … `docs/explore-redesign.md`
- ★UI の規約と機械チェック13本 … `design.md`（作業の前後に必ず走らせる）
  ／ 目盛り … `lib/tokens.ts` ／ 色 … `lib/constants.ts`
- 券 … `components/explore/Ticket.tsx` / `PunchMark.tsx` / `lib/ticket.ts`
  ／ 鋏 `components/explore/Nipper.tsx` ＋ `lib/nipperSolid.ts`
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
