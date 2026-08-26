# いまどこにいるか（第64巡・2026-08-26）

3アプリ（JOURNAL / TASK / EXPLORE）は動いている。第64巡は実機確認の5件。
うち **EXPLORE の「提案カードが出ない」は本番の Cron ログで原因を確定**し、
ALIGN の2件は**第63巡に自分で入れた仕掛けの副作用**だった。

---

## 直近完了（第64巡）

- **ALIGN の出を作り直した** … 緩急を `cine`（遅→速→遅）から
  **`flow(t)=t^2.4`（加速しっぱなし）**へ。連なりの遅れも**等間隔**（`STREAM_STEP`）に。
  → 出口で減速しないので溜まらず、進むほど間隔が開くので**重なりが構造的に起きない**。
  揃えるための仕掛け（`span`/`conv`/`line`/`streamQ`/`STREAM_GAP`/`GAP_DECAY`）を全部撤去。
- **「画面から出る前に消える」を直した** … 引き渡しを**時刻から進み**へ（`HANDOFF_N`=0.96）。
  第63巡に緩急を変えたとき、`A_HANDOFF=0.72` が指す進みが 0.94 → 0.52 に落ちていた。
- **筋への合流** … 「動く点へ直線で寄せる」のをやめ、**筋の形を持ったまま自分のズレを
  減衰させる**（`keep=(1-n/MERGE)²`）。あった場所からそのまま曲線を描いて合流する。
- **閉じを速く、落下を前倒し** … `OUT_MS`=`ms(T_ITEM)` / 遅れ `×0.5` /
  最後の図形が進み 0.55 を超えたら `dropAll()`。★モードは変えず、`draw` が
  `outDroppedRef` を見て**山と出ていく図形の両方**を描く。
- **効果線を「余白」へ** … `.task-cam` の中の `SKY_GAP` に敷いた。周期の違う線2本＋
  横向きマスクで不均一に、濃さ 0.14 → **0.09**。
- **紙を本物の写真に** … `public/paper-kraft.webp`（320px角×4枚・**121KB**）。
  `paperize(…, seed)` が絵ごとに**4枚×4向き×ずらし**を選ぶので繰り返しに見えない。
- **★EXPLORE の原因を特定して直した**（下）。

## ★★EXPLORE — 何が起きていたか

1. **`r.jina.ai` が 2026-08-21 から全滅**（10/10 が 4xx）。Cron は毎日**緑**。
   今朝の応答: `cardCount:0` / `note:"情報源ページを取得できませんでした。"`。
   実行時間が 60秒前後 → 13秒前後に落ちていたのが唯一の手がかりだった。
   カードは3日で消えるので 08-24 頃にプールが空になり「今日はここまで」に。
   → **取得を2段に**（Jina → 直接 `fetchDirect` + `htmlToMarkdownish`）。
   → **失敗を必ず理由ごと残す**（`SiteTrace.via/jina/direct` → `cronStatus.fetchFail`
     → 設定タブ「取得できず: jina 401×10 ／ 直接 403×10」）。
2. **育成カードの数え方がずれていた**（同居していた別のバグ）。id が日付を含まないのに、
   差し込みは今日の号・数える方は全号マージ。→ `decidedOf` で**同じ入れ物**を見る。
3. **「あとで」は次の間隔まで出さない**（ユーザー確定）。`Goal.snoozedAt` を追加。

## ★次の一手（ユーザーへ）

- **`JINA_API_KEY` を Vercel に設定／更新すること。** これが本筋の復旧。
  直接取得は保険で、ブロックするサイトもあるため全部は戻らない可能性がある。
  設定タブの「ブリーフ生成の状況」に**取得できなかった理由**が出るので、
  次の夜間実行のあとそこを見れば、鍵が効いたか／直接取得が通ったかが分かる。

## 未解決・注意

- **直接取得が実際に何件通るかは未確認。** この開発環境は外向きの通信が
  すべてプロキシで 403 になるため（example.com すら）、実サイトでは試せていない。
- 設定タブの1行の**文面**は要確認 →「取得できず: jina 401×10 ／ 直接 403×10」。
- iOS の上下の帯は解決済み（`statusBarStyle: "default"`）。**触らない。**

## 重要パス

- タスクの本体 … `components/tabs/GravityTab.tsx`（`flow` / `startAt` / `streamAt` /
  `homeAt` / `outDroppedRef`）／カメラ … `components/tasks/TaskSpace.tsx`
- 紙 … `lib/paperTexture.ts` ＋ `public/paper-kraft.webp`（作り直しは
  `tools/make-paper.py`）／焼く所 … `lib/solidPaint.ts`
- ブリーフ … `lib/briefPipeline.ts`（`fetchSite` / `fetchDirect` / `htmlToMarkdownish`）
  ／ `components/tabs/BriefTab.tsx`（`decidedOf` / `dueCandidate`）
  ／ `app/api/cron/build-brief/route.ts`（`fetchFailSummary`）
- 検証 … `scratchpad/r64.mjs`（ALIGN・効果線）/ `paper64.mjs`（紙）/ `brief64.mjs`（デッキ）
