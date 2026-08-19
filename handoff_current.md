# 現在地（2026-08-19）

現行仕様は `docs/project_knowledge.md` が正。経緯は `docs/archive/`。
このファイルは**常に200行以内**に保つ（更新手順は `CLAUDE.md` の「恒久ルール」）。

- ブランチ … `claude/brief-tab-bind-bugs-9ijd62`。
  ★**毎回 `main` へも push する**（2026-08-18にユーザー確定・確認不要）。
  `main` が Vercel の本番ブランチで、実機はここを見る。作業ブランチへ
  push しただけでは**実機に何も届かない**。

---

## いまどこにいるか

タスクアプリ（TASK）は**図形**（断面ひとつのベタ塗り）と**入力画面**の両方が
確定した。入力は TickTick 型の即時入力（チャコール地・ツールバー＋ポップオーバー）で、
書いた情報の量がそのまま図形になる。3D・アイソメは持たない。

3 つのアプリのうち、**ブリーフ（EXPLORE）は実運用中**（夜間 Cron が毎日 2 回
デッキを生成し、実機で使えている）。**タスクとジャーナルは UI が出来た段階**で、
中身の運用（Cowork の仕分けとの往復）はこれから。

第10〜23巡は**入力画面（`TaskComposer`）だけ**を直し続けていた。第24巡で
**原因が確定し、開発環境で再現もできた**（下）。実機の確認待ち。

---

## 直近で完了したこと（第24巡）

- ★★★**崩れの原因は `--vvtop`（ずれの補正）そのもの。削除した。**
  `--vvtop = visualViewport.offsetTop` を `[data-fit]` に掛けていたが、
  **iPhone は `offsetTop` にキーボードの高さ K を返すのに、`position: fixed` の
  器はずれていない**。補正がまるごと余分で、中身が K だけ下へ落ちていた:
  上のバー `y=K`（画面の真ん中）/ 帯の下端 `y=100lvh`（キーボードの裏）/
  図形の中心も可視の外 — **報告された崩れ方と3か所とも数字が一致する**。
  キーボードは `--kb`（＝ `器の offsetHeight − vv.height`・第18巡で確定）だけが運ぶ。
- ★★★**第22巡の「測って直す」は物差しが循環していた**。残りを
  `印の rect.top − vv.offsetTop` で測っていたので、`--vvtop = offsetTop` を
  当てた瞬間に**必ず 0**。疑っている値そのものを物差しにしていたので、
  この誤りだけは構造的に検出できない（`SHIFT_CAP` が素通りしたのと同じ循環）。
- ★★★**実機の崩れを Chromium で再現できるようにした**（14巡ぶんの検証が
  一度も再現できていなかった原因）。Chromium は素で `offsetTop` に 0 しか
  返さない。**getter を差し替える**と実機と同じ条件になる:
  「値は返るが `fixed` の器は動かない」。`scratchpad/vvtop24.mjs`。
  直す前に現行コードで落ちることを確認 →「上のバー 340 / 帯の下端 844 /
  図形の中心 569」が出て、実機の写真と一致した。
- ★★**判定の期待値から `vv.offsetTop` を追放した**。第18〜23巡の判定は
  「上のバーの上端 == `vv.offsetTop`」と書いていたので、**中身が落ちている
  状態を「正しい」と判定していた**。いまは `--kb` と器の高さだけで書く。
- ★**開発用の数値表示を入れ替えた**。循環していた `res`（ずれ残り）と
  `bar − offsetTop` をやめ、**`shl`（器の rect.top）/ `doc`（html の rect.top）/
  `bar`（そのままの rect.top）**へ。`fixed` で画面最前面に貼るので、
  崩れても読める（「崩れすぎて数値が読めなかった」への手当て）。
- ★**旧方式は `components/tasks/legacyShift.ts` に隔離**し、設定の
  「ずれの補正を試す（旧方式）」で呼び戻せるようにした（実機で見比べる用）。
  **次巡でファイルごと撤去する。**

---

## 次に着手すること

1. **実機（iOS Safari）での確認**（この環境で WebKit を動かせないため構造的な制約）
   - ★**キーボードを出しても崩れないか**（第24巡の本題）。上のバーが上に居るか /
     帯がキーボードの真上か / 図形が真ん中に見えるか / 日程シートの下が切れないか
   - ★**アイコン（メモ・持ち物・重要度・タグ）をタップしても崩れないか**
   - ★**＋を押してすぐ閉じないか**（とくに gravity で山が動いている最中）
   - ★**閉じる動きが1枚の板で滑るか**／**図形の登場と大きさの変化**
   - ★**キーボードを閉じたら入力画面が閉じるか**（iOS の「完了」・下スワイプ）
   - ★**指で動かないか**／★**時刻**／★**カレンダー**／★**drift**
   - **文字が出るか**（第6巡の本題。Chromium では2〜4秒。実機が本番）
   - ★**まだ崩れていたら、設定 →「画面の数値を出す」を ON にして1枚**。
     **`bar` がセーフエリア上と一致していれば中身は正しい位置に居る。**
     **`shl` が 0 でなければ器そのものが動いている**（＝原因は `--vvtop` の外）。
2. **直ったら撤去する**（第24巡の置き土産）… `components/tasks/legacyShift.ts`、
   設定の「ずれの補正を試す（旧方式）」、`lib/debugViewport.ts` の
   `isLegacyShift`/`setLegacyShift`、`scratchpad/legacy24.mjs`。
3. **Cowork のプロンプト更新**（`COWORK-ROUTINES.md`）… 候補の項目を
   `いつ`（★**日付で書かせる**。YYYY-MM-DD）/ `道具・場所` / `持ち物` /
   `タグ`（英字5つ）へ揃える。日付で書かれないと期日にならず、
   `lib/inboxImport.ts` がメモへ回してしまう。
   ★**プロンプトの全文を提示して承認を得てから**実装する。

---

## 未解決・持ち越し

- **実機 Safari の未検証** … タスクアプリ全般、ジャーナルの円のドラッグと
  マイクの解放。
- **候補のうちジャーナル・ウィッシュ・ストックの行先が未定**／**1日の終わりに
  3アプリの要素を1枚のポスターへプレスする**（§38）は未着手。
- **完成時に撤去するもの** … `lib/taskDemo.ts` と「デモを入れる」ボタン、
  `ProfileTab` の「ブリーフ生成の実験」カードと「今すぐ生成」、
  ★**「画面の数値を出す」**（`lib/debugViewport.ts` / `ViewportProbe.tsx`）。

---

## いま触っている領域のファイル

★全体のファイル地図は `CLAUDE.md`。ここは**いま手を入れている所だけ**。

```
components/tasks/TaskComposer.tsx  入力画面。--kb / 出入り / 図形の舞台
components/tasks/legacyShift.ts    ★旧方式のずれの補正（既定は切。次巡で撤去）
components/tasks/Popover.tsx       ポップオーバーの器と ★`Press`(押せる面)
components/tasks/WhenSheet.tsx     日程（★キーボードを閉じるシート）
components/tasks/ViewportProbe.tsx ★開発用の数値表示（直ったら撤去）
app/globals.css                    出入り・図形の登場と入れ替え・沈む合図
lib/textFit.ts / solidPaint.ts     グリフのアトラス・★書体の門・ビットマップ
```

## 検証（`scratchpad/`。★追跡していないので毎回作り直す）

```bash
# ★next/font/google がプロキシを通らないと真っ白になる
NODE_OPTIONS="--use-env-proxy" setsid npm run dev > scratchpad/dev.log 2>&1 &
npm i -D playwright@1.56.1 --no-save   # 実体は /opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

```
vvtop24.mjs  ★★崩れの再現ひとつ（offsetTop の getter を差し替える）
fix24.mjs    ★★回帰一式。4画面 ×「offsetTop を返す/返さない」＋ポップオーバー
             ＋日程シート＋CPU 6× 絞りで＋が即閉じないか
legacy24.mjs 旧方式のスイッチが効くか（★次巡で legacyShift.ts ごと消す）
shot24.mjs   写真（引数 legacy で旧方式）。キーボードの板を重ねて実機に近づける
```

★**単体テストの前に必ず写しを焼き直す**（`lib/*.ts` → `*.mjs`。焼かないと
固まったままで、消えた API を試し続ける）:
`for m in solid taskSize taskTags inboxImport; do npx esbuild lib/$m.ts --bundle --format=esm --outfile=scratchpad/$m.mjs; done`

## ユーザー側の作業（アプリの外）

- Cowork に**毎晩のタスク「1日を仕分ける」**を設置する（例: 02:00 JST）。
- 任意: `OPENAI_API_KEY` を Vercel に登録すると文字起こしが Whisper 系になる。
