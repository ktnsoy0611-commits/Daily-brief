# デイリーブリーフ — 現行仕様引き継ぎ書（2026-07-11時点）

**このファイルが最新の正。** ルートの `IMPLEMENTATION HANDOFF.md`（初期要件定義書）は
技術スタック・設計思想の背景資料としては有効だが、**データモデルとタブ構成の記述は
古い**（wishes.category_id の do/buy/watch/go、keeps/records の2テーブル分割などは廃止済み）。
矛盾する場合は必ずこちらを優先すること。`qol-app-v19.tsx` は移植元プロトタイプの参照用。

## 1. 前セッションからの経緯（要約）

v19プロトタイプのNext.js App Router + TS移植から始まり、長いUI磨き込みセッションを経て
以下の大きな仕様変更がユーザーとの対話で確定した:

1. **Keep(場所)とMediaRecord(作品)の2コンテナを廃止し、単一の `Item` に統一。**
   「場所か作品か」は排他ではなく「種類(kind) × 場所の有無(area)」の直交軸。
   例: 新作映画=movie+area(劇場)、旧作映画=movieのみ(家で観る)、そこでしか買えないモノ=thing+area。
2. **分類の最上位は「願望の究極の対象物」による4ドメイン**:
   モノ(thing)・バショ(place)・タイケン(experience)・ジョウホウ(info)。
   ストック/プラン/アーカイブの棚はすべてこの4区分・この語彙で統一。
   カード上の種類ラベルもドメイン名を表示（ゴールだけは別枠）。
   展覧会・ライブは「その場でしか体験できない」のでタイケン所属（作品扱いをやめた）。
3. **ウィッシュはストックのカテゴリではなく上流の「受信箱」。**
   タブバー右の独立した丸ボタン(✨)からどのタブでも書ける。書く時に4ドメインを選択。
   ウィッシュはブリーフの生成材料になり、KEEPされて初めてItem(origin:"wish"、WISHバッジ付き)になる。
   アーカイブ最下部に全ウィッシュのフラットなチェックリストを置き、派生カードが
   バインドされたら自動でチェックが付く(`isWishBound`、手動トグル不可)。
   チェック済みのウィッシュ詳細では「叶えた！」「ゴールにする」を非表示。

## 2. 技術スタックと開発規約

- Next.js (App Router) + TypeScript。**Tailwind不使用、すべてインラインstyle**。
- スタイル定数・和文コメントの文化はコードベース全体で統一されている。合わせること。
- コミットメッセージは日本語で「何をなぜ」を書く。
- `node_modules/next/dist/docs/` を参照せよという AGENTS.md の注意は引き続き有効。
- 永続化は `lib/dataStore.ts` の localStorage 実装。load/save/clear のインターフェースを
  維持したまま、実装フェーズで Supabase 版に差し替える予定（UI側は無変更で済む設計）。
- 将来スタック（初期要件定義書 §2 が有効）: Supabase Free / Gemini API / Places API / Vercel。

## 3. データモデル（lib/types.ts が正）

- `ItemDomain = "place" | "experience" | "info" | "thing"`
- `ItemKind = place | exhibition | live | activity | food | movie | book | album | info | thing`
  （各kindは `lib/constants.ts` の `KIND_DOMAIN` で必ず1ドメインに属す。
  分類は `domainOf(item)` (lib/helpers.ts) が唯一の入口）
- `Item`: kind / title / creator? / category?(自由文の元カテゴリ) / **area?(場所の有無は
  ドメインと独立の直交軸)** / status: candidate→planned→done / addedAt / doneAt? /
  expiresAt? / price? / images? / meta? / sourceUrl? / color? / good? /
  **origin: "brief"|"manual"|"wish"**（バッジ表示 KEEP/WISH/なし） / sourceWishId?
- `Wish`: title / **category: ItemDomain** / status: stock|fulfilled / addedAt / fulfilledAt?
- `hasPlace(item)`: area有無の判定。地図のピンは**ドメインを問わず**これで出す。
- `isWishBound(wish, items)`: 派生Item(sourceWishId)が candidate 以外なら true。
- その他: goals(checkIns、checkin 14日毎 / milestone 45日毎)、magazine(その日のプラン、
  日付が変わると pendingReview へ)、briefs(朝刊am/夕刊pmの2エディション/日)。

## 4. タブ構成（components/AppShell.tsx）

ナビ順: **アーカイブ(records・初期タブ) / ブリーフ(brief) / ゴール(goals) / ストック(stock) / プラン(execute)**。
ピルの右に独立した✨ボタン=ウィッシュ入力(`AddWishSheet`)。プロフィールはヘッダーの丸ボタン。

- **ブリーフ**: カードデッキをスワイプ(右=KEEP/左=SKIP)。育成カード(checkin/milestone)は
  スワイプ無効でフッターの「あとで/記録する」ボタン。KEEPでItem生成
  (sourceWishTitleが未達ウィッシュと一致すれば origin:"wish")。
- **ストック**: 未実行(status!=="done")のItemを4ドメインの `CardStack` で表示。
  追加シートはドメインごと(バショ=URL解析(現状モック)、タイケン/ジョウホウ=`AddKindItemSheet`、
  モノ=`AddThingSheet`)。カード詳細オーバーレイに「＋プランに追加 / 行った系 / 削除」。
- **プラン**: 地図(hasPlaceなItemのピン) + 「今週のおすすめ」エンベロープ(地図座標の近接
  クラスタリングによるモデルプラン。面に行き先の箇条書き、右上に開かず選べる+ボタン、
  タップで詳細シート) + 4ドメイン棚。選択はAppShellの共有state(`PlanSelectionBar`、
  タブ横断)。バインド！→ `buildMagazine` → 確定ビュー(ConfirmedStack、バインダー綴じ
  アニメーション) → 登録でアーカイブへ。
- **アーカイブ**: 実行済み(done)がバインダー棚に積み上がる。棚=バショ(エリア毎)/タイケン・
  ジョウホウ(種類毎)/モノ(1冊)/ゴール + 日付ビュー。最下部にウィッシュのチェックリスト(§1-3)。
- **ゴール**: バインダーグリッド + チェックイン記録。

## 5. デザインシステムの要点

- カード共通言語: `PosterCard`(パンチ穴 `PunchHoles`・左上バッジKEEP/WISH・右上の丸トグル22px)。
  穴と文字の回避マージンは `HOLE_CLEAR`。
- バインダー: `Binder.tsx` の Binder3D + `BinderCoverflowRow`。表紙はバウハウス的
  グリッド構図(45/90/180度・塗りつぶし図形のみ)。kind毎のアクセントは `MEDIA_ACCENT`、
  モノは `THING_ACCENT`、場所は `placeAccent(エリア名)`、日付/ゴールも専用accent。
- **zIndex規約**: navピル=25、nav手前の下地グラデーション=15、
  フローティング操作ボタン(バインド！2箇所・ブリーフのフッター)=**26**(グラデーションに
  覆われないため。この規約を破ると「ボタンが半透明マスクに隠れる」バグが再発する)。
- navはposition:sticky(fixedはiOS URLバー伸縮でズレるため禁止)。
- タブ切替は `key={tab}` でスクロールコンテナごと作り直し(スクロール位置引き継ぎバグ対策)。
  ブリーフタブ滞在中だけ外側コンテナのoverflowをhiddenにする。

## 6. 検証ワークフロー（この環境での定石）

```bash
nohup npm run dev > /tmp/.../dev.log 2>&1 & disown; sleep 6; curl -s localhost:3000
# Playwright はグローバル install 済みのものを使う:
NODE_PATH=/opt/node22/lib/node_modules node script.mjs
# script内: import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
#           chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })
```
- プランタブが空の時に出る「デモ用データを投入」ボタンで、ウィッシュ8件+Item約50件+
  ゴール8件のダミーが入る(`ExecuteTab.tsx` の `injectDemo`)。
- 検証の締め: `npx tsc --noEmit` / `npx eslint .`(common.tsxの`<img>`警告2件は既知・容認) /
  `npm run build`。
- 開発ブランチ: `claude/qol-app-nextjs-migration-cvj6na`（PR #1 → main）。

## 7. ★未解決の最優先バグ: ブリーフタブのカード挙動（実機iPhone Safari）

**症状（ユーザー報告・実機スクリーンショットあり）:**
1. カード本文がカードの角丸の外(下)へはみ出して見切れる。
2. スワイプで次のカードが出た瞬間、上方向にガクッと位置ずれする。
3. チェックインカードで下の「あとで/記録する」が出た瞬間にカードがガクッと縮む。

**Chromium(Playwright)では再現しない。** スワイプ前後・育成カード昇格前後で
boundingBoxが完全一致し、本文も収まることを確認済み。**Safari(WebKit)実機でのみ残る。**

**試行済みの対策（BriefTab.tsx に実装済み・コミット履歴 57409a4→7b01893 参照）:**
- top/peekのtransformを同じ関数順(translate→scale→rotate)に統一、`key={card.id}`で
  同一DOM要素をpeek→topへ使い回し（マトリクス分解補間によるスナップ対策）
- 本文の`paddingRight`を常時確保（isTop分岐による折り返し位置ジャンプ対策）
- カード幅のdvh予算をisGrowth分岐から一定値へ → さらに**dvh推測自体をやめて
  ResizeObserverで枠(arenaRef)を実測**する方式へ
- 本文の`flex:1`+line-clampをやめ、`maxHeight: calc(1.7em*5)`の固定頭打ちへ
  （Safariのflex+line-clamp不具合対策）
- 育成カード用フッターの枠(`GROWTH_FOOTER_SLOT`=58px)をisGrowthに関わらず常時確保

**未検証の仮説（次セッションはここから）:**
- **WebKitで検証していないこと自体が穴。** Playwrightのwebkitエンジンで再現を試みる
  （`playwright install webkit`が必要。ネットワーク制約で不可なら実機のiOS Safari
  リモートインスペクタ、または画面録画をユーザーにもらう）。**2026-07-11時点でも
  依然としてダウンロードがブロックされる**(`request rejected: host not permitted`)。
  この環境でWebKit実機検証は引き続き不可能。
- フォント(Zen Kaku Gothic New, next/font)のロード完了タイミング: 実測(ResizeObserver)や
  クランプ計算(em)がフォントスワップ前後で変わり、遅れて再レイアウトされる可能性。
- 対症療法に走らず、「その場で数値が見えるデバッグオーバーレイ」(rect実測値・cardBox・
  フォント状態を画面に出す)を一時的に仕込んでユーザーにスクショをもらうのが早い。
  （まだ未着手。次に実機で再現した場合はこれを優先。）

**2026-07-11セッションでの追加調査と対応:**
- ユーザー提供の実機スクリーンショット(iPhone Safari)をピクセル単位で解析
  (PillowでBG/PAPER色との境界を走査)した結果、**このスクショの時点では
  cardBoxは正しく実測されていた**(w≈340px, h≈452px, 比率3:4が一致)。
  「初回レンダーのフォールバック幅がそのまま出ている」仮説はこのスクショに
  関しては否定された(実測が効かないケースが常時ではなく間欠的である可能性)。
  本文もこのスクショでは角丸の内側に収まっており、はみ出しは写っていなかった
  (#2/#3のガクつき系は静止画では原理的に確認できない)。
- **新しい仮説として、AppShell最外周コンテナの`100dvh`を疑い、`100svh`へ変更した**
  (`components/AppShell.tsx`)。理由: このコンテナは中身を一切スクロールさせない
  設計(スクロールは内側のdivが担当、ブリーフタブ滞在中はそれもhidden)なので、
  dvh(動的ビューポート高)がSafariのURLバー追従のために持つ「ライブに値が
  変わる」性質を本来必要としていない。一方でSafari実機のdvhはツールバーの
  実際の動きと無関係なタイミング(DOM更新時など)でも再計算されることがある
  という既知の挙動があり、これがブリーフタブの2つのガクつき症状──
  (a)スワイプ確定でindexが進んだ瞬間、(b)育成カードのフッターが出現する瞬間──
  の**どちらも「index更新に伴うDOM再レンダーの瞬間」という共通点を持つ**ことと
  整合する。dvhの再計算がこの瞬間に外側コンテナ高さを揺らし、それが
  flexチェーンを通じてarenaRefのResizeObserverまで伝播し、cardBoxが
  一瞬再計算されてカードごと動いて見える、という一本の筋で両症状を
  説明できる。svh(ツールバー表示時の固定高さ)に替えることで、この
  ライブ再計算の経路自体を構造的に断つ。
- 検証: `npx tsc --noEmit` / `npx eslint .`(既知の2件のみ) / `npm run build`は
  すべて通過。Chromiumでのスワイプ前後boundingBox一致も従来どおり確認済み。
  **ただしWebKit実機での検証はできていないため、この修正が実際に症状を
  解消するかは未確認。次はユーザーの実機で再テストしてもらうこと。**
  直らなければ次点は上記のデバッグオーバーレイ案。

**2026-07-11セッション・続報(ユーザーの実機再テスト後):**
- svh化(上記)で**症状3(チェックインカード昇格時の縮み)は解消**と報告あり。
  一方で**症状2(スワイプ確定で次のカードが出る瞬間のガクつき)は残った**。
  この非対称な結果から、症状2はdvhのようなSafari固有の揺らぎではなく、
  **アニメーション設計そのものの欠陥**だったと判明した(ユーザー本人の指摘)。
- **根本原因**: `peekTransform`(控えのカードの位置)は、指でドラッグしている
  間はdxに応じて追従するが、指を離してcommit()した後は**320ms後にindexが
  実際に進む瞬間まで**8px下にずれた位置のまま停止していた。その320ms後、
  「控え→本番」に役割が切り替わるのと**同じReactコミットの中で**初めて
  transformの値を(0,0)へ動かしていたため、CSSトランジションが正しく
  発火する保証がなく瞬間移動して見えていた(役割切り替えという離散的な
  イベントに、連続的な位置合わせのアニメーションを乗せてしまっていたのが
  設計上の誤り)。ChromiumでもmouseイベントでSWIPE_THRESHOLDを正しく
  超えさせて詳細に計測すると、controlled雑な検証では見逃していたが、
  この「320ms経過時点で8px→0pxへ瞬間的に変わる」こと自体はChromium上でも
  起きていた(以前のセッションの「Chromiumでは再現しない」という所見は、
  boundingBoxを離散的な2時点でしか比較していなかったため、瞬間移動を
  見落としていたことが判明)。
- **修正**: `peekTransform`/`peekTransition`を、indexの切り替わりではなく
  `exit`ステート(=手前のカードが飛び始める、まさにその瞬間)に連動させた。
  commit()でexitがセットされた瞬間に、控えのカードも**同じ0.32sの間に**
  定位置(translateY 0, scale 1)へ向けて動き始めるようにしたため、320ms後に
  実際にindexが進んで「控え→本番」に役割が切り替わる頃には、transformの値は
  既に定位置に収まっている。役割切り替えの瞬間には見た目上なにも変化しない
  ため、原理的にガクつきようがない(`components/tabs/BriefTab.tsx`の
  `peekTransform`/`peekTransition`定義とその上のコメント参照)。
- 検証: Playwrightでmousedown→複数回のmousemove→mouseupにより実際に
  SWIPE_THRESHOLDを超えるドラッグを再現し、release後40ms刻みでtop/peek両
  要素のtransform・transition・boundingBox.topを記録。控えカードのtopが
  211px→199px→…→191pxと連続的に収束し、320ms後の役割交代の瞬間には
  既に191pxで一致していることを確認(離散的な瞬間移動が消えたことを数値で確認)。
  `tsc`/`eslint`/`build`も通過。**この修正はChromium上の実測データに基づく
  確認が取れているため、前回のdvh仮説よりも確度が高い。** とはいえ実機
  Safariでの最終確認はまだ。

## 8. UI完了後の実装フェーズ（未着手）

初期要件定義書の§2以降が土台。ただしデータモデルは本書§3を正として読み替える:
1. **ブリーフ生成のAI化**(Gemini): 提案のテイスト・トーンは現行ダミー(CARDS)のまま、
   分類は4ドメインへマッピング。ウィッシュ(category付き)が生成の手がかり。
   朝刊=Vercel Cron、夕刊=オンデマンド。
2. **URL解析の実装**: StockTabの`mockParseUrl`を Places API(New)(マップURL) /
   Gemini(その他URL) に差し替え。
3. **Supabase永続化**: DataStoreのインターフェースを維持して差し替え。
   旧localStorageデータは`migrate()`が吸収する形を維持。テーブル設計は初期定義書の
   SQL草案を**本書§3のItem統一モデルに合わせて作り直す**こと。
4. PWA(manifest/アイコン/safe-area)は対応済み。
