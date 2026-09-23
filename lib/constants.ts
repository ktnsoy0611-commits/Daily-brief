import type { AppState, ItemDomain, ItemKind } from "./types";
import { SPACE } from "./tokens";

export const STORAGE_KEY = "qol-app-state-v1";

export const DEFAULT_STATE: AppState = {
  wishes: [],
  items: [],
  briefs: {},
  magazine: null,
  profile: { interests: [] },
  weekendMeta: { lastSeenBundleWeek: null },
  goals: [],
  pendingReview: [],
  sources: [],
  bindLog: [],
  shelfOrder: {},
  tasks: [],
  journal: [],
  voiceNotes: [],
  inbox: [],
  generatedDecks: {},
  generatedPlans: null,
};

// 目標への「最近どうですか？」を投げかける間隔
export const CHECKIN_INTERVAL_DAYS = 14;
// 「できるようになったこと」を評価つきで振り返る間隔(1〜2ヶ月)
export const MILESTONE_INTERVAL_DAYS = 45;
// 場所を持つItemの自動失効: expiresAtがなければaddedAtからこの日数で削除
export const KEEP_MAX_AGE_DAYS = 30;
// ブリーフの記録(briefs[日付])はその日を過ぎたら二度と参照されない
// (BriefTabは常にtodayKey()しか読まない)ため、無期限に
// 溜まり続けるだけの死重になる。この日数を過ぎた号はAppShellの起動時
// クリーンアップで削除する。
// ★カード本体(generatedDecks)は**3日**保持(Cronの RETENTION_DAYS・ユーザー指定)。決定
// (briefs.decisions)はそれより長く残す必要がある。もし決定の方が先に
// 消えると、まだ保持中の未消化でないカードの「消化済み」記録が失われ、
// そのカードが未消化プールに復活してしまう。よって35日(カードより長く)にする。
export const BRIEF_RETENTION_DAYS = 35;

export const SWIPE_THRESHOLD = 90;

// ---- スタイル共通 ------------------------------------------------------
// フォント本体は app/layout.tsx で next/font/google により読み込み、CSS変数
// として <html> に適用している。ここではその変数を参照するだけ。
// マガジン風(明朝体の見出し+Playfairの斜体数字)の縛りは撤廃し、ミニマルで
// リッチな1書体構成に統一した。★第73巡に `SERIF` / `DISPLAY` という別名を
// **消した** ―― どちらも中身は `SANS` で、名前だけが残っていた(12箇所を直した)。
// ★★**欧文は Archivo、和文は Noto Sans JP**(2026-08-24・第53巡にユーザー確定)。
// 「ブルータリズム/スイスに合う、太めで幅が少し詰まった、洗練された書体」という
// 指定に対して Archivo(可変フォント)を選んだ。幅は `app/globals.css` の
// `font-variation-settings: "wdth" 88` で全体を少し詰め、太さは使う場所で指定する。
// 和文は Archivo にグリフが無いので、次点の Noto Sans JP へ自動的に委ねられる
// (この**並び順**が「欧文だけ Archivo」を作っている)。
// タスクの図形に載る文字(`FONT_FACES`)はこの対象外。

// ★★★**和文は Noto Sans JP**（2026-09-20・第126巡にユーザー指定「**フォントは前の
//   ものに戻し、帯のピルに使われていたフォントをすべての日本語の部分に適用して
//   ください**」）。
//   ★★★**第125巡に試した LINE Seed JP は撤回した**（`app/fonts/` と
//     `app/layout.tsx` の `localFont` ごと削除。戻したいなら commit `0b04755`）。
//   ★★★**図形に載る字（`GOTHIC`）も同じ `JP` を読む** ―― これが指定の後半
//     （「帯のピルに使われていたフォントを**すべての**日本語に」）。第124巡までは
//     図形だけ Zen Kaku Gothic New で、**帯のピルと山の図形で書体が違っていた**。
//   ★★**欧文の並び（Archivo が先）は変えていない** ―― 「欧文だけ Archivo」は
//     この並び順が作っている。
const JP = 'var(--font-noto-sans-jp), "Noto Sans JP"';
export const SANS = `var(--font-archivo), "Archivo", ${JP}, sans-serif`;
// ★★**欧文だけの並び**(和文フォールバックを**含めない**)。ラテン文字と数字だけを
// スイス・スタイルで置く場所で使う ― 残り日数の数字・曜日の見出し・#タグ。
// SANS と分けてあるのは、和文フォールバックが混じると数字の骨格が Noto の字面に
// 寄って、均一なグリッドが崩れるため。
// ★旧名 `HELV`(素の Helvetica)から改名(第53巡)。名前が中身と食い違わないように。
export const LATIN = 'var(--font-archivo), "Archivo", "Helvetica Neue", Arial, sans-serif';

// ★★★**大きな欧文と数字だけの書体**（2026-09-13・第100巡にユーザー確定
//   「**タブの文字は良いですが、大きい文字と数字が変です**」）。
//   ★★**役を増やして、大きい所だけ差し替える** ―― `SANS` / `LATIN`（Archivo）は
//     タブの文字・券の小さなラベル・ボタンが読んでいて、そこは「良い」と言われている。
//   ★★★**線を引く場所は「`SWISS_XL` 級の巨大な文字」と「未読の数（円の径の 0.9 倍）」**。
//     `TYPE.head`(20) 以下はこれを使わない（残り日数・`CreateMenu`・券のラベル）。
//   ★Anton は**縦長で単一ウェイト**。だから `fontWeight` は 400 のまま使い、
//     横を潰して細く見せる細工（`lib/wordPlate.ts` の偽コンデンス）は**しない**。
//   ★和文のグリフは無いので、**和文に当てないこと**（TIMELINE の「自由」は `SANS`）。
export const DISPLAY = 'var(--font-anton), "Anton", var(--font-archivo), "Archivo", sans-serif';

// ★スイス見出し(**表示専用の大きな欧文**)。`TYPE` の目盛りは本文のためのもので
// display(26)止まり。ブルータリズム/スイスの大きな見出しはその外に居る ―
// `TAB_MARK`(52) などと同じ「部品の寸法」の例外(2026-08-24 にユーザーがこの
// 見た目を指定)。★**増やさない**。使うのは GRAVITY の ALIGN/TIMELINE。
// ★第56巡に**二段**へ。第53巡は 72/44/28 の三段で、ALIGN の残り日数は 44/28 の
//   二段だったが、「真ん中の選択中のものはもっと大きく」という指定で焦点が 72 へ
//   上がり、44 の使い手が居なくなったので捨てた(使わない段は残さない)。
// ★第65巡に**一段**へ。ALIGN の右の行を組み直したとき `SWISS_MD`(28) の
//   使い手が居なくなり、`TYPE.display`(26) と 2px しか違わない別系統だったので
//   捨てた。**残るのは表示専用の巨大欧文だけ**。
export const SWISS_XL = 72;   // TIMELINE の曜日の見出し(これ1つ。増やさない)

// ★タスクの図形に載る文字の書体。**1つだけ**（2026-09-12・第93巡にユーザー確定）。
// 読み込みは app/layout.tsx が行い、ここは表だけ。
//
// ★★★**なぜ1つになったか。** 以前は「**同じタグなら必ず同じ書体**」という
// 決めごとで、タグ（最後は2つ）が書体を選んでいた。**タグを廃止した**ので
// 選ぶものが無くなった ―― タスクの見分けは「**日付があるか／ないか**」の1軸だけで、
// それは**塗りと輪郭**が言う。同じことを書体でも言うと道具が二重になる。
// ★★**書体を「分類の道具」として使わないこと。** 増やしたくなったら、それは
// 新しい分類を持ち込もうとしているということ。
// ★**全部ゴシック系**(2026-08-16にユーザー確定で明朝を廃止)。
// ★**斜体で見分けを作らないこと**(2026-08-17にユーザー指摘)。iOS は和文の
// 斜体を合成しないので、実機では直立と区別が付かない。
export interface FontFace { family: string; weight: number; italic?: boolean }

// ★和文のフォールバックも一緒に持つ（Googleフォントの和文は分割配信で遅れて届く）。
// ★★★**図形の字も `JP`（＝帯のピルと同じ書体）**（第126巡にユーザー指定
//   「**帯のピルに使われていたフォントをすべての日本語の部分に適用して**」）。
//   ★★**Zen Kaku Gothic New は読み込みごと外した**（誰も読まなくなったので、
//     残すと実機で取りに行くだけの重さになる。第93巡に3本外したのと同じ判断）。
const GOTHIC = `${JP}, "Hiragino Sans", sans-serif`;

// ★★★**太さは 800**（2026-09-24・第128巡にユーザー指定「**文字は太めの黒で良い**」）。
//   `WEIGHT.heavy` と同じ値。★Noto Sans JP は可変の軸で読み込んでいる
//   （`app/layout.tsx` で `weight` を固定しない）ので、800 は合成ではなく本物の太さ。
export const FONT_FACES: FontFace[] = [
  { family: GOTHIC, weight: 800 },              // 0 太いゴシック（これ1つ）
];

/** ★★図形に載る文字の書体。**`FONT_FACES` の番号はここから引く。** */
export const SHAPE_FACE = 0;

// ★ネオバウハウス化(2026-08-02)。それまでは暖色のクリーム地(BG #F2EADA /
// PAPER #FBF6E9)に、アプリごとに違う地の色(グレージュ・緑)を敷いて「別の
// アプリにいる」ことを伝えていた。ユーザー指定により、地は**3アプリとも
// 同じほんとに薄いグレー**へ統一し、アプリの違いは背景に置いた大きな図形
// (AppBackdrop)ひとつだけで伝える。クリームは廃止し、紙・墨とも色味を
// 抜いた中性のグレースケールにする。
//
// 色を捨てたぶん、残したアクセント(下のBLUE/RUST/GREEN/GOLDと、バインダー
// のアクセント各種)がはっきり効くようになる = 「遊び心」はそちらが担う。
// ★★★墨は **Velvet Black `#2C2627`**（2026-08-31・第77巡にユーザー指定
// 「文字や、タブバーや、record タブの黒寄りの色は添付のブラックに」）。
// 地 `#F7F6FB` との比 13.82（第126巡に地が替わった）。★わずかに赤へ寄った黒
// （HSL 350°/7%/16%）なので、ほんのり紫がかった白の上でも濁らない。★★**黒はこの1つだけ**（下の `CHARCOAL` も同じ値）。
// ★2026-09-07 に一度 `#23252B`（寒色）へ替えたが、**カラースキームは既存のまま
// 使う**とユーザーが決めたので戻した。地と墨だけ寒色にすると、暖色の有彩色
// （Terracota / Amarillo）と喧嘩する。
export const INK = "#2C2627";
export const PAPER = "#FAFAF9";
export const BG = "#F0F0EE";
// 背景(AppBackdrop)専用の2段。バインダーの表紙と同じ「下地(=BG) / 帯(SHADE) /
// 図形(SHADE_DEEP)」の3層を、グレーの濃淡だけで作るための値。
// 地に溶ける透かしの調子は保ちたいので、いちばん濃いSHADE_DEEPでも地との差は
// 16程度に留めてある。ここを触ると背景の主張の強さが変わる。
export const SHADE = "#E9E9E6";
export const SHADE_DEEP = "#E0E0DC";
// 全画面のオーバーレイの地(声の録音・タスクの入力・設定)。★出どころはここ1つ。
// 明るい地から切り離して「いまは書く/録るためだけの画面」を作るための墨。
// ★★★第80巡に**復活**（第77巡に `INK` と同じ値へ畳んでいた）。ユーザー指定
// 「現状のブラックはそのまま使う。またグレーを復活させて」。新しいパレットには
// **無彩色が1つも無い**ので、面と文字のためのグレーを持ち直す必要がある。
// ★★`INK` より**ほんの少しだけ明るい**（クリームの地との比 11.94）。地を黒
// そのものにすると、その上の墨のものが完全に沈んで層が読めなくなる。
export const CHARCOAL = "#383432";
// 補助の文字色。以前は各所で "#9A988E" を直書きしていたものをここへ集約した。
export const MUTED = "#8E8E88";

/**
 * ★★★**第125巡に無彩色をやめた**（2026-09-20・ユーザー指定「**タスクもニュースも
 * 色を割り当てます。タスク、ジャーナル、提案の図形が主に目立つ色でバランスを
 * 取ってください**」）。★**値は `PALETTE.naranja`**（下の `TASK_FACE`）。
 * ★★**この定数は消さない** ―― 第117〜124巡の「タスクは無彩色」へ戻すときに要る。
 *   ★★実測（地 `BD_GREY` との比 **1.86** ／ 黒の字 **7.76**）。
 */
export const TASK_GREY = "#BFBBB2";

/** ★★**面のためのグレー**（第80巡に復活）。カード・入力欄・カードの中の小区分。
 *  ★★★**半透明の重ねがけをやめるために在る** ―― 白の 6%/16% を重ねると、
 *  下に何が居るかで色が変わり、重ねる順で結果が動く。**不透明の1枚**なら動かない。
 *  クリームの地との比 1.17／この上の墨 12.36。★暗い画面用は `SURFACE_DIM`。 */
export const SURFACE = "#EDEAE2";
/** ★暗いオーバーレイの上の面（カード）。`CHARCOAL` の地との比 1.24。 */
export const SURFACE_DIM = "#464240";
/** ★そのカードの中の小区分。`SURFACE_DIM` の上で 1.24／地から 1.54。 */
export const SURFACE_DIM_2 = "#545049";

/** ★副文(二番目に強い文字)。CHARCOAL(12.6:1) と MUTED(2.9:1) の間が空いていて、
 *  名前を持たないまま `#5A5A54` が 17 箇所・9 ファイルで埋めていた(第65巡)。
 *  MUTED へ丸めると本文が **WCAG AA(4.5:1) を割る**ので、ここだけ名前を与えた。
 *  ★グレーは3段(INK＝CHARCOAL / SECOND / MUTED)で打ち止め。増やさない。 */
export const SECOND = "#5A5A54";   // 6.08:1

/** ★写真や暗幕の上に乗る**純白**。`PAPER`(#FAFAF9) は紙の面の色で**別物**。
 *  用途が違うので混ぜない(紙の上に純白を置くと浮き、写真の上に紙色を置くと濁る)。 */
export const WHITE = "#FFFFFF";

/** ★光を通さない穴の芯(`DropTargets` のブラックホール)。周りの輪は `INK` で、
 *  芯だけ純黒にして深さを作っている。**INK より暗い色はここだけ**。 */
export const VOID = "#000000";

/** タブバーの非活性のアイコン。 */
export const TAB_ICON_OFF = "#9C9C9B";

/** ★録音機の素材色(`VoiceStudio` の物理キーとランプ)。`dim` は全画面の暗い状態。
 *  **画面固有のパレット**なので、無彩色の梯子には混ぜない。
 *  ★どれも不透明にすること — 下が明るい円か地かで見え方が変わらないように。 */
export const STUDIO = {
  // ★★★第79巡に**キーだけ白へ戻した**（ユーザー指定「journal のボタンはやはり
  //   白系に」）。第78巡は `figure` 1つが「大きな円」と「キーの面」の両方を
  //   決めていたが、**別の材料**なので割った。
  // ★★★**大きな円の色はここに無い**（2026-09-12・第93巡）。`JOURNAL_FACE`
  //   （アプリのメインカラー）に移した ―― **画面で反転しなくなった**ので、
  //   `dialLit`/`dialDim` の2つを持つ理由が消えた。
  /** ★★キーの面。**両方の画面で同じ白**。★地（`BD_GREY`）と同じ値。 */
  cap: "#F7F6FB",
  /** ★★キーが沈む穴。**面との比 18.21**。★キーの輪郭はこの影だけで見せる
   *  （ユーザー確定・第79巡）ので、穴は**キーより少しだけ大きく**取る
   *  （`VoiceStudio` の `WELL_LIP`）。そうしないと下の三日月しか見えない。 */
  well: "#141112",
  /** ★★★**記号が灯る窓**（キーの面に開いた小さな暗い穴）。
   *  白い面の上では盤の色が 1.2〜1.8 しか出ないが、**この墨の上なら全部 4.7 以上**
   *  出る（杏 9.23／若草 12.10／桃 8.13／朱 4.73）。面との比 14.41。 */
  socket: "#2C2627",   // ★`INK` と同じ値
  /** 消えているランプ。★窓の上で**かすかに見える**だけ（比 2.11）。 */
  lampOff: "#5E5758",
} as const;

/** ★ゴールのバインダー固有の意匠(`components/Binder.tsx`)。色相は名前のハッシュで
 *  選ぶので、**集合として持つ**必要がある。無彩色の梯子には混ぜない。 */
// ★★第73巡に **`BINDER_COLORS`（22色の独自パレット）を撤去**した。
// ゴールのバインダーは、ドメインの4色を `shade` で明暗に振って使う
// （`lib/palette.ts` の `DOMAIN_COLOR` と `DOMAIN_STEPS`）。
// 同じ「展覧会」が券では橙・バインダーでは青緑、という食い違いがここで消えた。

// ── カラースキーム(2026-09-24・第128巡にユーザーが参照画像で指定) ──
//
// 参照画像 … Barcelona の SNS 版面（黄・青・オレンジ・緑の4色のハイライトと黒）。
// **画素を数えて**採った（彩度 0.3 以上の画素を塊にまとめ、各塊の平均）。
//
// ★★★**第129巡に役を入れ替えた**（ユーザー指定「**提案は黄色、タスクはオレンジ、
//   ジャーナルは青、ニュースは黒にしてください**」）。色そのもの（4行）は第128巡のまま。
// ★★★**第128巡に4色を差し替え**（ユーザー指定「**やはりダメです。こっちの色に
//   してください。4色のカラースキームがあるのでこれを適応してください。
//   文字は太めの黒で良いです**」）。
//   ★★**役の割り当ては第127巡のまま**（黄＝JOURNAL／オレンジ＝提案／青＝その他）。
//     **赤が緑に替わった**ので、**TASK ＝ 緑**。
//   ★★★**第127巡の「塗りと文字の組」（`PAIR`）は撤回した** ―― 字は全部墨。
//
// ★★★**色そのものはここだけ。パレットを替えるときは、この4行を書き換える。**
//
// ★★★**提案のジャンルは色で分けない**（第127巡から）。`DOMAIN_COLOR`
//   （`lib/palette.ts`）の4行は同じ色を指している。**ジャンルは形が言う。**
//
// ★実測（**地 `#F7F6FB` との比** ／ **墨 `#2C2627` との比**）:
//   青 1.82 / 7.59 ／ 黄 1.16 / 11.89 ／ オレンジ 2.50 / 5.52 ／ 緑 1.54 / 8.98。
// ★★★**墨の字は4色すべてで AA（4.5）を満たす**（最低はオレンジの 5.52）。
// ★★**4色とも地との比は低い**（1.16〜2.50）―― 参照画像と同じく**彩度差で立つ**色。
//   **地の上に直接いる小さな字にはしない**（面と縁にだけ使う）。
export const PALETTE = {
  azul:     "#A2B9F0",  // 青       … JOURNAL ／選択・肯定
  amarillo: "#F3EA70",  // 黄       … 提案（ドメイン4は全部これ）
  naranja:  "#F47B51",  // オレンジ … TASK ／危険
  verde:    "#3AE580",  // 緑       … 録音の CANCEL だけ（★第129巡に TASK から外れた）
} as const;

// ★★★**役 → 色**。ここが「何がどの色か」の唯一の表。
// ★★★**キーの名前は変えない** ―― 呼び出し側が数十箇所で使っている。
//
// ★★★**`danger` はオレンジ**（第128巡）―― 参照画像に赤が無い。4色のうち
//   いちばん赤に近く、**墨の窓の上でも地の上でもいちばん強い**（地 2.50）。
//   **提案と同じ色だが、危険が出る面（設定・削除の確認・録音の REC）に
//   提案の図形は出ない**ので衝突しない。★青は「押してよいもの」なので使わない。
export const SCHEME = {
  work: PALETTE.azul,          // 青       … 選ばれている・リンク
  life: PALETTE.azul,          // 青       … 肯定・達成
  growth: PALETTE.amarillo,    // 黄       … 提案（ドメイン4の唯一の色）
  wellness: PALETTE.amarillo,  // 黄       … キーの PAUSE
  social: PALETTE.azul,        // 青       … JOURNAL
  danger: PALETTE.naranja,     // オレンジ … 危険（★上の注釈。第129巡から TASK と同じ色）
} as const;

/**
 * ★★★**タスクの図形の色 ＝ 緑**（2026-09-24・第128巡。参照画像の4色のうち、
 * 第127巡に TASK が持っていた赤の席に入った色）。
 * ★★実測 … 地（`BD_GREY`）との比 **1.54**／**墨の字 8.98**。
 * ★★★**第117〜124巡の「タスクは無彩色」は撤回したまま**（`TASK_GREY` は残してある）。
 */
// ★★★**第129巡に緑 → オレンジ**（ユーザー指定「**提案は黄色、タスクはオレンジ、
//   ジャーナルは青、ニュースは黒にしてください**」）。墨の字 5.52（AA）。
export const TASK_FACE = PALETTE.naranja;

/**
 * ★★★**ニュースの色 ＝ 青**（第127巡から。ユーザー指定の「**その他は青**」）。
 * ★★実測 … 地との比 **1.82**／墨の字 7.59。
 */
// ★★★**第129巡に青 → 黒**（ユーザー指定「**ニュースは黒**」）。**有彩色ではない**
//   ので `PALETTE` には入れず、墨 `INK` をそのまま使う。字は `bodyInkOn(INK)` ＝ 紙（14.22）。
//   ★★**帯の文章（黒いピル）と同じ見え方**になるが、文章は上の段・ニュースは下の段
//   にしか流れないので、段で見分けられる。
export const NEWS_FACE = INK;

/**
 * ★★★**JOURNAL の顔の色 ＝ 黄**（第127巡から）。録音の大きな円（ダイヤル）と
 * ホームの山のカセットの本体が同じ色を読む。
 * ★★実測 … 地との比 **1.16**（明度では地とほとんど同じ。彩度だけで立つ）／
 *   墨の字 **11.89**。
 */
export const JOURNAL_FACE = SCHEME.social;

/**
 * ★★★キーの記号の色（第78巡にユーザー指定「journal のボタン関係のアクセントに
 * 色をつけて」）。記号は `STUDIO.socket`（墨）の窓の中に置く（第79巡）。
 * ★★**REC の色はここに書かない** ―― `redOn()`（`lib/palette.ts`）が面から導く。
 * 墨の窓の上での比 … 黄 **11.89** ／ 青 **7.59** ／ 緑 **8.98**。
 * ★★**CANCEL はオレンジにしない** ―― 第128巡から `danger`（REC）と同じ色なので、
 *   並ぶと見分けが付かない。
 */
export const STUDIO_KEY = {
  pause: SCHEME.wellness,   // 黄 … 墨の窓の上で 11.89
  send: SCHEME.work,        // 青 … 7.59
  cancel: PALETTE.verde,    // 緑 … 8.98
} as const;

// ★★**状態の色は3つだけ**（第73巡）。**分類の色から借りる**（専用の色を持たない）。
// ★★`GREEN` は第127巡から**青**（肯定・達成）。**名前は変えない**（13箇所以上が読む）。
export const BLUE = SCHEME.work;     // 青       … 選ばれている・リンク
export const RUST = SCHEME.danger;   // オレンジ … 危険（削除・エラー）
export const GREEN = SCHEME.life;    // 青       … 肯定・達成（★もう緑ではない）
/** ★★★**状態の面に載る色**（第76巡）。★★状態の色を**そのまま小さな文字に
 *  使わないこと** ―― 地の上では4色とも 1.16〜2.50 しか出ない。**状態は「面」で見せる。**
 *  ★★★**`bodyInkOn()` と同じ結果を手で書いている**（`lib/palette.ts` を import
 *  すると循環参照になるため）。**パレットを替えたら必ずここも確かめる。**
 *  ★★★**第128巡から字は全部墨**（ユーザー指定「文字は太めの黒で良い」）。 */
export const GREEN_INK = INK;   // 青の面に載る（比 7.59）
export const BLUE_INK = INK;    // 青の面に載る（比 7.59）
// ★第73巡に `PLUM` / `SLATE`、第74巡に `GOLD` を**消した**。`GOLD` は
//   「白い ✓ を載せる面」＝**肯定**そのものだったので `GREEN` に寄せた（13箇所）。
/** RUST の淡い敷き。★オレンジ `#F47B51` = rgb(244,123,81) から作る。 */
export const RUST_TINT = "rgba(244,123,81,0.14)";
export const RUST_EDGE = "rgba(244,123,81,0.50)";
/** GREEN の淡い敷き。★青 `#A2B9F0` = rgb(162,185,240) から作る。 */
export const GREEN_TINT = "rgba(162,185,240,0.24)";
export const HAIRLINE = "rgba(26,26,24,0.08)";
// カードの縁取りは基本的にこの柔らかい影1つに統一する(枠線は使わない)。
export const SOFT_SHADOW = "0 4px 16px rgba(28,28,30,0.07)";
export const SOFT_SHADOW_LG = "0 12px 32px rgba(28,28,30,0.12)";
/**
 * ★★★**券の影**（第80巡）。`box-shadow` ではなく **`filter: drop-shadow`**。
 *
 * ★★★**券にはマスクが掛かっているので `box-shadow` は出ない** ―― マスクは
 *   要素の描画結果を切り抜くので、枠の外へ出る影ごと消える。第78巡にギザギザと
 *   切り欠きを入れて以来、券の影は**ずっと出ていなかった**（色の紙のうちは
 *   色で縁が分かるので気づかなかった。第80巡に紙を白にして露見した）。
 * ★★`drop-shadow` は**描いたあとの α の形**に落ちるので、ギザギザと切り欠きの
 *   輪郭にそのまま沿う。**マスクした要素の親**に掛けること。
 * ★2枚組 … 近くて濃い影（縁を立てる）＋ 遠くて薄い影（浮かせる）。
 */
export const TICKET_SHADOW =
  "drop-shadow(0 1px 1px rgba(28,28,30,0.22)) drop-shadow(0 10px 22px rgba(28,28,30,0.16))";

// ヘッダー行に並ぶ「丸いアイコンボタン」と「件数ピル」の高さを揃えるための
// 共通サイズ。形(円/ピル)は違っても高さを合わせることで、同じ行の部品として
// 統一感を持たせる。
export const HEADER_CHIP_SIZE = 40;

// アプリ全体で使う統一カードの縦横比。写真付き(Keepの場所など)も
// 文字だけ(作品など)も、目標のバインダーも、この比率1種類に統一する。
export const ITEM_CARD_ASPECT = "3 / 4";
export const GOAL_CARD_ASPECT = ITEM_CARD_ASPECT;

// ★★★**ブリーフの札だけは別の比**（2026-09-13・第96巡）。
//   ★★★**`ITEM_CARD_ASPECT` を変えても札は 1px も動かない** ―― 札の比は
//   `BriefTab.tsx` に **`availH * 0.75` と `w * (4/3)` の生の数で2回**書いてあった
//   （逆に `ITEM_CARD_ASPECT` を変えると**ストックの一覧・ゴールのバインダー・
//   表紙・コーヴァーフロー**が動く）。**別の名前に分け、札はこちらだけを読む。**
//   ★★写真の器を**正方形**にしたぶん背が高くなった（参照画像の実測 ―― 器は
//   218×218 / 218×217 / 188×188 で**どれも正方形**だった）。
//   ★検算 … 比から内側の余白が消える（`高さ = 幅 + 文 + 操作の列`）ので、
//   ベゼルを変えてもこの比は動かない。
/** ブリーフの札の縦横比。★`ITEM_CARD_ASPECT` とは**別物**。 */
export const BRIEF_CARD_ASPECT = "2 / 3";

// ★★第73巡に撤去。文字だけのカードの地も**そのカードのドメインの色**を使う
// （`lib/palette.ts` の `colorOfKind`）。題のハッシュで色を散らすのをやめた
// ―― 同じ展覧会が開くたびに違う色になっていた。

// ★タブバーの寸法。選択中の印は**正円**で、その直径がそのまま
// ピルの内側の高さになる(ピルの高さ = TAB_MARK + NAV_PILL_PAD * 2 = 64)。
// タブバー(AppShell)とダッシュボードのモーフ用ピル(Dashboard)の両方が
// 使う。開閉の途中でこの2つが入れ替わるので、必ず同じ値を見ること。
export const TAB_MARK = 52;
export const NAV_PILL_PAD = 6;

/**
 * ★★★**タブバーの行のうち「作る」の丸が取る幅**（2026-09-13・第101巡）。
 * ＝ 丸の径 `TAB_MARK`(52) ＋ 行の隙間 `SPACE.md`(12) ＝ **64**。
 *
 * ★★**この数は3か所が必要としていて、どこも生で書いていた** ――
 *   `AppShell`（行を組む）／`Dashboard`（モーフ用のピルを本物と同じ幅にする。
 *   ★**62 と書き違えていた**）／`lib/pileBox.ts`（山の右の内寸）。
 * ★★★**タブバーの帯は左右対称ではない** ―― 左は `SPACE.lg` だが、右は
 *   `SPACE.lg + NAV_CREATE_SLOT`。**1つの対称な数では表現できない。**
 */
export const NAV_CREATE_SLOT = TAB_MARK + SPACE.md;

/** タブバーの行の最大幅（列の `maxWidth` 420 から左右の `SPACE.lg` を引いたもの）。
 *  ★`AppShell`（本物）と `Dashboard`（モーフ用のピル）が同じ数を読む。 */
export const NAV_ROW_MAX = 420 - SPACE.lg * 2;

/**
 * ★★**ホームの帯のピルの厚み**（2026-09-07）。★これは「余白」ではなく
 * **部品の寸法**（`TAB_MARK` と同じ扱い）。
 * ・`photo` … 提案の段。**写真の丸が高さいっぱいに入る**ので、この値がそのまま
 *   丸の直径になる（縁取りぶんを引いた値）。★70 → 96 → 76 →（実機でまだ大きかった
 *   ので）**60**。★★帯が厚いほど**山の取り分が減る**ので、ここは山の大きさと
 *   セットで決める（`components/home/Pile.tsx` の `FILL`）。
 *   ★写真が無い提案は丸を持たない（字面は置かない。ユーザー確定）。
 * ・`plain` … 写真を持たない段（候補・期日未割当）。
 * ・`news` … **ニュースの段**（2026-09-18・第122巡）。**輪郭だけのピル**
 *   （第123巡に字だけから替えた）で、字は `small`(11)。3段の中でいちばん薄い
 *   ―― 段が1つ増えたぶん**山の取り分が減る**ので、厚くしない
 *   （`buildPieces` は帯の下端を予算から引いている）。
 * ★3段の差が「上ほど自分に近いもの」を形で言っている。
 */
// ★★★**第128巡に細くした**（ユーザー指定「**帯は全体的にもっと小さく**」）。
//   60/44/34 → **44/32/28**。★提案の段は**題の2段組**（`TYPE.small` × `LEAD.snug`
//   × 2 ＝ 28.6px）が入る高さ、残りは1行が入る高さ。
export const BAND_H = { photo: 44, plain: 32, news: 28 } as const;
/** ★★帯のピルの中で、写真の丸が縁から離れる量（縁取り）。★これは「余白」では
 *  なく**部品の寸法** ―― 丸の直径が「ピルの高さ − これ×2」で決まる。
 *  ★高さいっぱいにすると丸とピルの輪郭が接し、「はめ込んだ」ではなく
 *  「はみ出した」に見える（2026-09-07 のユーザー指摘）。 */
export const BAND_BEZEL = 6;


// 背景(AppBackdrop)の地と図形。画面より下(iOSでツールバーが引っ込んだ
// ときに現れる帯)にも同じ色が要るので、ここに置いて body へも書く。
// ★★★**第126巡に地を替えた**（ユーザー指定「**色が気に入らないので、次はこの画像を
//   参考にして、カラースキームを構成し、適応してください**」）。参照画像の地
//   `#F7F6FB` ＝ **ほんのり紫がかった白**。
//   ★★★**地も配色の一部** ―― 新しい7色はライム・水色・ラベンダー・紫と**寒色寄り**で、
//     暖かいクリーム `#FFFBF5` の上ではどれも濁って見える。**参照の調和は
//     「冷たい地」の上で成り立っている。**
//   ★★**替えたら `app/manifest.ts` の `background_color`/`theme_color` も同時に直す**
//     （`lib/ground.ts` が `theme-color` を追従させるのは実行時だけ）。
//   ★実測 … 墨との比 **14.41 → 13.82**（どちらも AAA）。
export const BD_GREY = "#F7F6FB";   // ★第76巡に盤の CLOUD（BACKGROUND COLOR）へ
// ★ジャーナル(声の記録)の地と図。参考画像(2026-08-11)から採った、暖かみの
// ある中間グレー。地と図の差はごくわずか(明度差 約18)で、円は「浮いた面」
// ではなく「地の濃淡」として読める。
// ★★★第78巡に**クリームへ戻した**（ユーザー指定「journal だけ背景が黒だと統一感が
// ないので、journal もクリームの背景に」）。**3アプリの地はこれで1色**。
// ★暗さは地ではなく**機械の側**（録音のダイヤルとキー）が持つ。
export const JOURNAL_BG = BD_GREY;
// ★★★**大きな円の色は `JOURNAL_FACE`**（2026-09-12・第93巡にユーザー指定で
// メインカラーへ）。`JOURNAL_FIG` は**廃止**した ―― 同じものを2つの名前で
// 呼ばない。第78巡の「クリームの紙の上に置かれた**黒い機械**」（比 11.25）は
// これで終わり、円は**色で覚えるもの**になった。
// この地の上での控えめな文字色。
export const JOURNAL_MUTED = "rgba(44,38,39,0.66)";  // ★クリームの地の上の控えめな文字（比 4.84）
export const BD_LIGHT = "#F3F3F1";

// navのピル自体を画面下端からどれだけ浮かせるか。ホーム画面に追加した
// PWA(スタンドアロン)起動時、env(safe-area-inset-bottom)をそのまま
// marginBottomに使うと、実機では表示領域が想定より狭く感じられるほど
// 下に余白が残る指摘があったため、その値の一部だけを使うように絞って
// いる。safe-area自体が無い機種ではmax(4px, 負の値)により最小の4pxへ
// 収まる。
//
// ★★★**`env(safe-area-inset-top)` を足す試みは失敗した**
// (2026-08-23・第35巡で追加 → 同日ユーザー報告で判明・第36巡で撤回)。
// `statusBarStyle` を `default` にしたことで、web ビューが**画面の下端まで**
// 広がるようになった(それまでは上のセーフエリアぶん(47px)手前で終わっていた)。
// そのぶん、下端に貼り付くタブバーが**画面上で 47px 下がる** —
// 実測(実機の写真): ピルの下端が 783.0pt → 830.0pt、画面下までの余白が
// 60.7pt → 13.7pt になり、ホームインジケーターに乗ってしまっていた。
//
// `env(safe-area-inset-top)` で足し戻そうとしたが、**`default` では
// この値が 0 になるらしい**(実測: 足した前後でピルの位置が 0.1pt も
// 動かなかった。`default` は「web ビューが物理的にステータスバーの下に
// 無い」モードなので、そこに「不安全な領域」という概念自体が無い=
// 補正すべき隙間がそもそも存在しない、という理屈で説明はつく)。
//
// ★★**足し戻す信号が無いので、`env(safe-area-inset-bottom)` を比率で
// 使う。** これは実機でだけ非ゼロ(34pt)になる値で、Chromium・検証環境
// では常に 0 なので、そこでの見た目・既存の検証は**今までどおり 4px**の
// ままになる。実機だけ、必要な 47pt ぶんを足す比率(2.382)を掛ける
// (34 × 2.382 − 26 ＝ 55 ＝ 元の 8px ＋ 47px)。
// ★★★**この比率は今の端末(セーフエリア下 34pt)専用の逆算値。**
// 別の端末(例: Dynamic Island で下 34pt・上 59pt のような機種)では
// 比が変わるので合わなくなる。ずれたら「画面の数値を出す」の
// `safe` の値と実機の写真を見比べて、
// `目標(旧の55px相当) ÷ 実測のsafe-bottom` へこの数字を計算し直すこと。
export const NAV_BOTTOM_GAP =
  "max(4px, calc(env(safe-area-inset-bottom) * 2.382 - 26px))";

// タブ本文やストック/目標/実行タブの下部固定バーが、フローティングの
// タブバー(AppShellのnav)の直上に収まるためのオフセット。表示領域を
// 少しでも広く取るため、navのピル自体の余白を切り詰めて画面下端ぎりぎり
// まで下げた分、この値も縮めている。navのスタイルを変えたら実測して
// 合わせ直すこと。NAV_BOTTOM_GAPと同じ値を足しているのは、navが画面下端
// から浮く量が変わればここに揃えるUIが下端に近づく量も連動させるため。
// ★第33巡: `NAV_H` が 76 → 77 になったぶん、ここも 82 → 83(差の 6px は据え置き)。
export const NAV_OFFSET = `calc(83px + ${NAV_BOTTOM_GAP})`;

// ★タブバーの実高さ(画面の下端からタブバーの上端まで)。
// アプリの目印の行(丸 5 + 下の余白 8 = 13) + ピル(TAB_MARK + NAV_PILL_PAD*2 = 64)
// + 下の浮き。★第33巡に目印の行の余白を目盛りへ乗せた(7 → 8)ので 76 → 77。
// ★★タブバーは**フローから外して**画面の上に浮かせてある(AppShell参照)ので、
// 「タブバーのぶんの余白」が要る場所はすべてこの値を見ること。ここと
// globals.css の --nav-h だけが、タブバーの高さを知っている場所。
export const NAV_H = `calc(77px + ${NAV_BOTTOM_GAP})`;
// タブ本文の上の余白(セーフエリア込み)。--pad-top として全体へ配る。
/**
 * ★タブバーの実際の高さ(px)。`NAV_H` は `env()` を含む CSS の式なので、JS 側は
 * 一度要素へ流し込んで測る。**数字を二重に持たないため**、床の位置や的の逃がしは
 * 必ずここから引く(第37巡に、独自の 96px を持っていて実機で床がタブバーの裏へ
 * 潜った)。★`--nav-h` は `[data-app-shell]` に立っているので、そこから読む
 * (`document.documentElement` は祖先なので常に空になる)。
 */
/**
 * ★★★**測った値を憶える**（2026-09-15・第106巡）。
 *
 * ★★★**この関数は `document.body` に要素を足して矩形を読むので、呼ぶたびに
 *   「全文書のレイアウトを強制」する。** それを `components/home/Pile.tsx` の
 *   `requestAnimationFrame` のループが**2秒に1度**呼んでいたので、**2秒に1度
 *   必ず1フレーム飛んでいた**（実機の「がくがく」の一因）。
 * ★★**変わるのは端末が向きを変えたときと安全域が動いたときだけ**なので、
 *   その合図でだけ測り直せばよい。★合図は1度だけ張る（呼び手は5か所ある）。
 */
let navPx = 0;
let navWatching = false;

function measureNav(): number {
  const shell = document.querySelector("[data-app-shell]") ?? document.documentElement;
  const v = getComputedStyle(shell).getPropertyValue("--nav-h").trim();
  if (!v) return 96;
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;height:${v}`;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px || 96;
}

export function navHeightPx(): number {
  if (typeof window === "undefined") return 96;
  if (!navWatching) {
    navWatching = true;
    const stale = () => { navPx = 0; };
    window.addEventListener("resize", stale);
    window.addEventListener("orientationchange", stale);
    window.visualViewport?.addEventListener("resize", stale);
  }
  if (!navPx) navPx = measureNav();
  return navPx;
}

export const TAB_PAD_TOP = "max(16px, env(safe-area-inset-top))";

// ★Masthead(アプリ名の札。components/common.tsx)の高さ。
// タスクアプリは4層を1本の縦の空間に積むので、アプリ名の札は**層ではなく
// カメラの器が画面に固定して**持つ(components/tasks/TaskSpace.tsx)。層の側は
// このぶんだけ下げてから自分の見出し(層の名前・ビュー切替)を置く。
// 内訳 = 上下の padding(12 + 16) + GeoText の size(30)。
export const MAST_H = 58;

// ---- 興味の自動検出（プロトタイプ: キーワード頻度。現在は未使用） --
// 好み/興味は「興味・好み」1リストへ統合し、チップ本体はCoworkの週次分析が
// taste-state.md で所有する(HANDOFF §8.14 優先度3)。この頻度検出ルールは
// 現在どこからも参照されていない(lib/helpers.tsのdetectInterests参照)。
export interface InterestRule {
  match: RegExp;
  label: string;
}
export const INTEREST_RULES: InterestRule[] = [
  { match: /カフェ|コーヒー|焙煎/, label: "カフェ巡り" },
  { match: /古着|ヴィンテージ/, label: "古着収集" },
  { match: /映画|シネマ/, label: "映画鑑賞" },
  { match: /展覧会|美術館|ギャラリー/, label: "アート鑑賞" },
  { match: /建築/, label: "建築巡り" },
  { match: /陶芸|工芸|手仕事/, label: "ものづくり" },
  { match: /銭湯|温泉|サウナ/, label: "温泉・サウナ" },
  { match: /古書|本屋|書店/, label: "本屋巡り" },
  { match: /雑貨/, label: "雑貨集め" },
  { match: /ボルダリング|クライミング|筋トレ|ヨガ|ランニング/, label: "運動習慣" },
];
export const AUTO_THRESHOLD = 2;

// ---- 地図の座標（スタイライズド。旧・自作地図のピン配置用。実地図(Leaflet)
//      導入後もbuildRecommendedPlansの近接クラスタリングで内部的に使う） ----
export const AREA_COORDS: Record<string, { x: number; y: number }> = {
  "竹橋": { x: 46, y: 32 }, "神保町": { x: 42, y: 38 }, "日比谷": { x: 50, y: 50 },
  "谷根千": { x: 56, y: 18 }, "浅草橋": { x: 66, y: 38 }, "蔵前": { x: 70, y: 42 },
  "両国": { x: 74, y: 48 }, "清澄白河": { x: 68, y: 58 }, "高円寺": { x: 8, y: 44 },
};
export const AREA_FALLBACK = { x: 50, y: 80 };

// アプリ内蔵の固定情報源。展覧会・カルチャーイベント・映画の一覧系サイト
// (東京中心・カルチャー寄り)。ユーザーが手で登録するお気に入りとは別に、
// 夜間Cronが毎晩必ず巡回する(会期・上映は鮮度が命なのでローテーションに
// 埋もれさせない)。淘汰の対象にはしない。ミニシアター単館等へ差し替えたい
// 場合はこの配列を編集する。robots/規約は本番運用前に個別確認する前提。
export const FIXED_SOURCES: string[] = [
  "https://www.tokyoartbeat.com/",                 // 展覧会・アートイベント一覧
  "https://artscape.jp/exhibition/",               // 展覧会(Jina取得実績あり)
  "https://bijutsutecho.com/exhibitions",          // 美術・展覧会
  "https://www.timeout.jp/tokyo/ja/things-to-do",  // カルチャーイベント
  "https://eiga.com/now/",                         // 公開中の映画・上映
];

// 実地図(Leaflet)用の、既知エリアの実緯度経度。lat/lngを持たないItem
// (エリア名だけのもの・デモデータ)を実地図に置くためのフォールバック。
// AREA_COORDSの抽象座標と違い、こちらは本物の緯度経度。
export const AREA_LATLNG: Record<string, { lat: number; lng: number }> = {
  "竹橋": { lat: 35.6906, lng: 139.7580 }, "神保町": { lat: 35.6959, lng: 139.7576 },
  "日比谷": { lat: 35.6749, lng: 139.7594 }, "谷根千": { lat: 35.7261, lng: 139.7647 },
  "浅草橋": { lat: 35.6986, lng: 139.7856 }, "蔵前": { lat: 35.7057, lng: 139.7910 },
  "両国": { lat: 35.6960, lng: 139.7930 }, "清澄白河": { lat: 35.6817, lng: 139.7999 },
  "高円寺": { lat: 35.7057, lng: 139.6497 }, "下北沢": { lat: 35.6613, lng: 139.6680 },
};

// ---- 願望の4ドメイン ----
// 「究極の対象物は何か」で分ける、ウィッシュ・ストック・プラン・アーカイブ
// 共通の最上位カテゴリ。位置情報(area)の有無とは完全に別軸(タイケンや
// ジョウホウのItemもareaを持ちうる)。
export interface ItemDomainDef {
  id: ItemDomain;
  label: string;
  en: string;
}
export const ITEM_DOMAINS: ItemDomainDef[] = [
  { id: "thing", label: "モノ", en: "THING" },
  { id: "place", label: "バショ", en: "PLACE" },
  { id: "experience", label: "タイケン", en: "EXPERIENCE" },
  { id: "info", label: "ジョウホウ", en: "INFO" },
];
export const domainDefOf = (id: string) => ITEM_DOMAINS.find((d) => d.id === id) ?? ITEM_DOMAINS[0];

// ---- Itemの種類 ----
// 「何であるか」の規格化された語彙。アクション(行った/観た/読んだ/聴いた/
// やった/買った)はここから導出し、Item自体には保存しない。各kindはちょうど
// 1つのItemDomainに属する(KIND_DOMAIN)。
export interface ItemKindDef {
  id: ItemKind;
  domain: ItemDomain;
  label: string;
  en: string;
  creatorPlaceholder?: string;
  // candidateのItemを実際にやったログ(done)へ進める際のボタン文言
  doneActionLabel: string;
}
export const ITEM_KINDS: ItemKindDef[] = [
  { id: "place", domain: "place", label: "場所", en: "PLACE", doneActionLabel: "行った" },
  { id: "exhibition", domain: "experience", label: "展覧会", en: "EXHIBITION", creatorPlaceholder: "会場（任意）", doneActionLabel: "観た" },
  { id: "live", domain: "experience", label: "ライブ・コンサート", en: "LIVE", creatorPlaceholder: "アーティスト（任意）", doneActionLabel: "観た" },
  { id: "activity", domain: "experience", label: "体験・習い事", en: "ACTIVITY", doneActionLabel: "やった" },
  { id: "food", domain: "experience", label: "グルメ", en: "FOOD", doneActionLabel: "食べた" },
  { id: "movie", domain: "info", label: "映画", en: "CINEMA", creatorPlaceholder: "監督（任意）", doneActionLabel: "観た" },
  { id: "book", domain: "info", label: "本", en: "BOOK", creatorPlaceholder: "著者（任意）", doneActionLabel: "読んだ" },
  { id: "album", domain: "info", label: "音楽", en: "MUSIC", creatorPlaceholder: "アーティスト（任意）", doneActionLabel: "聴いた" },
  { id: "info", domain: "info", label: "知識・記事", en: "INFO", doneActionLabel: "知った" },
  { id: "thing", domain: "thing", label: "モノ", en: "THING", doneActionLabel: "買った" },
];
export const itemKindOf = (id: string) => ITEM_KINDS.find((k) => k.id === id) ?? ITEM_KINDS[0];
// kind→domainの規格化ルックアップ本体。helpers.tsのdomainOf()から使う。
export const KIND_DOMAIN: Record<ItemKind, ItemDomain> = Object.fromEntries(
  ITEM_KINDS.map((k) => [k.id, k.domain]),
) as Record<ItemKind, ItemDomain>;
export const kindsOfDomain = (domain: ItemDomain) => ITEM_KINDS.filter((k) => k.domain === domain);


// ---- 券（Explore の共通部品・第69巡） --------------------------------
// 1件＝1枚の券。提案・ストック・マップで**縮尺だけ**が変わる。
// 設計の正は docs/explore-redesign.md。
//
// ★分類の色は**4ドメイン**が持つ(kind ごとの色は廃止)。
//
// ★★★券は**その色の紙そのもの**になり、文字は全部黒で載る(第69巡3巡目・
//   Vitsœ のラベルが正)。だから**暗い色は使えない** ― forest/violet/wine の上では
//   黒が沈む。SCHEME の明るい4色から、色相が離れている4つを選ぶ。
//   黒 INK(#1A1A18) との比はいずれも 6:1 以上で本文に耐える。
// ★★割り当ては**アプリが kind ごとに持っている色**(`lib/deckStyle.ts`)へ寄せる
//   (第70巡・ユーザー確定)。同じものがアプリの中で2色になっていたのを直した。
//   もの→桃・情報→空は `deckStyle` と**完全に一致**する。
//   体験(展覧会=navy/ライブ=violet/体験=orange/食=red)で黒が読めるのは**橙**だけ。
//   場所は `deckStyle` では緑だが、緑の上では黒が沈むので使えず、余った**黄**を当てる。
// ★★第73巡に**`lib/palette.ts` の `DOMAIN_COLOR` へ引っ越した**。
//   券もブリーフもバインダーもマップも、ドメインの色は**そこ1か所**から引く。
//   この名前は呼び出し側の互換のために残してあるだけ。
// 券の紙。★第33巡で暖色のクリームは廃止したので戻さない。
// 紙らしさは**本物の写真**(`public/paper-kraft.webp`・`lib/paperTexture.ts`)で
// 出す。★★テクスチャは**色のすぐ上・文字の下**に multiply で敷く(下地)。
// 最前面に overlay で乗せると写真も文字も霞む(第69巡2巡目に実際にそうなった)。
export const TICKET_PAPER = PAPER;
// 券が乗る台。切り欠きから透けて見えるのはこの色。
export const TICKET_DECK = "#26251F";
// 券の縦横比。★★第72巡に **13/21(高さ 1.62倍) → 3/4(1.33倍)** へ
// (ユーザー指定「縦の比率が大きいのがあまり可愛くない」)。
// ★背が低くなったぶん、写真は**余りを全部取る**形で大きく取れる
// (`components/explore/samples/TicketParts.tsx` の `Figure`)。
export const TICKET_ASPECT = "3 / 4";
// ★数で要るとき用。`TICKET_ASPECT` と**同じ比**をここから引く(2か所に書かない)。
export const TICKET_H_PER_W = 4 / 3;
// ミシン目の穿孔。★彩度の高い紙の上に置くので、黒の薄めで足りる。
export const TICKET_PERF = "rgba(26,26,24,0.34)";

/**
 * 2つの色を混ぜる(0=a, 1=b)。★金属の段を**地の色から**作るのに使う。
 * ★★**混ぜる式はここ1つ**(2026-09-16・第113巡に `components/home/pillGhost.ts` の
 *   「白抜き ⇄ 塗り」の渡りも読むようにした。2か所に書かない)。
 */
export function mixHex(a: string, b: string, t: number) {
  const at = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const ch = (i: number) => Math.round(at(a, i) + (at(b, i) - at(a, i)) * t)
    .toString(16).padStart(2, "0");
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}
/** 金属の暗いほうの端。★無彩色よりわずかに暖色(青くしない)。 */
const STEEL_DARK = "#2E2D2B";

// ★改札鋏の彩色。**図形専用のパレット**で、UI のグレーの語彙(INK/CHARCOAL/
// SECOND/MUTED)とは混ぜない。
//
// ★★★**輪郭線を引かない**(第69巡3巡目・Sony Walkman のイラストが正)。
// 面は**明暗だけ**で分かれる。
// ★★★9巡目に**ローポリ(面取りした多角柱の集合)＋フラットシェーディング**へ
// 作り替えた。それまでは「輪郭を掃引して階調を塗る」作りで、面を持たないので
// 稜線が立たず、どう直しても塗り絵に見えた(ユーザー評:「すごくチープ」)。
// いまは**面の向きだけ**が階調を決めるので、名前付きの役(lit/face/side)は
// 要らない ― **明るさの段の並び**だけを持つ。
export const NIPPER_PAINT = {
  /**
   * ★フラットシェーディングの6段。**暗い順**。面の法線と固定光の内積を
   * この段に量子化する ― 手で塗らない。
   * ★★★第70巡に**地の色から導出**するようにした（ユーザー指定
   *   「アプリの背景の地の色が反射している感じの色味が良い」）。金属は環境を
   *   映すので、明るいほうの端は EXPLORE の地 `BD_GREY` へ寄っていく。
   *   ★手で置いた寒色の灰（`#33353A` など）は**青が7ほど強く**、金属ではなく
   *     青みがかったプラスチックに見えていた。
   */
  ramp: [0.14, 0.29, 0.45, 0.62, 0.80, 0.94].map((t) => mixHex(STEEL_DARK, BD_GREY, t)),
  /**
   * ★**光沢**（段の上に重ねる、なめらかなハイライト）。`shine` が大きいほど鋭い。
   * ★山は2つ重ねる ―― 鋭い芯（`shine`）と、そのまわりの広い明るみ（`shine/6`）。
   * ★★★第72巡に **0.85 → 0.14** へ落とした（ユーザー指定「カードの2D感に対して
   *   改札鋏が浮いている」）。券は**平らな刷り物**なので、鋏だけが濡れたように
   *   光ると「写真の中の金属」に見えてしまう。**段と傷は残す** ―― 形は読めるまま、
   *   照りだけを引いてマットにする。
   */
  gloss: 0.14,
  shine: 30,
  /** ★**すり傷**の強さ（0 で無し）。多方向の短い線として法線と照りに入る。 */
  scratch: 0.55,
  /** ★**券の色の映り込み**の強さ。券のほうを向いた面にだけ乗る。 */
  bounce: 0.30,
  /**
   * ★**隙間の色**（ダイのスリットなど、光の届かない凹み）。段の外に置く。
   * 凹みには当たる光が無いので、面の向きで塗ってはいけない ― 段の中でいちばん
   * 暗い色を当てても、暗く落とした部品の上では**1段しか差が付かず溝に見えない**
   * （10巡目に実測）。指定の「ディープシャドウ（隙間）」がこれに当たる。
   */
  gap: "#26241F",
  /** 地に落ちる影。★ぼかさない1枚の面。 */
  cast: "#3B3934",
  /** 落ち影の濃さ。★面ごとではなく**群に1度だけ**掛ける(重ねても濃くしない)。 */
  castAlpha: 0.26,
} as const;
// 券の切り口の陰（紙の厚み）と、切り欠きの中に落ちる券の影。
// ★★券の紙(#FAFAF9)と地(#F0F0EE)はほとんど同じ明るさなので、**地の色だけでは
//   切り欠きが見えない**（第69巡に実際に見えなかった）。切り口は
//   「地＋券の縁が落とす影」で読ませる。
export const TICKET_CUT = "rgba(52,44,28,0.5)";
export const TICKET_SHADE = "rgba(52,44,28,0.16)";
