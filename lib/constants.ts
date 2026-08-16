import type { AppState, ItemDomain, ItemKind } from "./types";

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
// ★カード本体(generatedDecks)は30日保持(Cronの RETENTION_DAYS)。決定
// (briefs.decisions)はそれより長く残す必要がある。もし決定の方が先に
// 消えると、まだ保持中の未消化でないカードの「消化済み」記録が失われ、
// そのカードが未消化プールに復活してしまう。よって35日(カードより長く)にする。
export const BRIEF_RETENTION_DAYS = 35;

export const SWIPE_THRESHOLD = 90;

// ---- スタイル共通 ------------------------------------------------------
// フォント本体は app/layout.tsx で next/font/google により読み込み、CSS変数
// として <html> に適用している。ここではその変数を参照するだけ。
// マガジン風(明朝体の見出し+Playfairの斜体数字)の縛りは撤廃し、ミニマルで
// リッチな1書体構成に統一した。SERIF/DISPLAYという名前は既存コード互換の
// ために残しているが、実体はどちらもSANSを指す(見出しも本文も同じサンセリフ)。
export const SANS = "var(--font-zen-kaku-gothic-new), sans-serif";
export const SERIF = SANS;
export const DISPLAY = SANS;

// ★タスクの図形に載る文字の書体。**1文字ごとにここから選ぶ**(2026-08-13に
// ユーザー指定)。読み込みは app/layout.tsx が行い、ここは組み合わせの表だけを
// 持つ。★書体を増やすときは layout.tsx とこの表の2箇所だけを触る。
//
// 明朝・ゴシック・丸ゴシック・極太 と、太さ・斜体を掛け合わせてある。
// どれも和文を持つので、日本語の題でも書体の違いがはっきり出る。
export interface FontFace { family: string; weight: number; italic?: boolean }

// ★和文のフォールバックも系統ごとに変えておく。Googleフォントの和文は
// 分割配信で遅れて届くことがあり、その間も書体の違いが見えるようにするため。
const GOTHIC = 'var(--font-zen-kaku-gothic-new), "Hiragino Sans", sans-serif';
const MINCHO = 'var(--font-zen-old-mincho), "Hiragino Mincho ProN", "Yu Mincho", serif';
const MARU = 'var(--font-zen-maru-gothic), "Hiragino Maru Gothic ProN", sans-serif';
const DELA = 'var(--font-dela-gothic-one), "Hiragino Sans", sans-serif';

export const FONT_FACES: FontFace[] = [
  { family: GOTHIC, weight: 400 },
  { family: GOTHIC, weight: 700 },
  { family: GOTHIC, weight: 700, italic: true },
  { family: MINCHO, weight: 400 },
  { family: MINCHO, weight: 700 },
  { family: MINCHO, weight: 900 },
  { family: MINCHO, weight: 400, italic: true },
  { family: MARU, weight: 300 },
  { family: MARU, weight: 500 },
  { family: MARU, weight: 900 },
  { family: DELA, weight: 400 },
  { family: DELA, weight: 400, italic: true },
];
// ★ネオバウハウス化(2026-08-02)。それまでは暖色のクリーム地(BG #F2EADA /
// PAPER #FBF6E9)に、アプリごとに違う地の色(グレージュ・緑)を敷いて「別の
// アプリにいる」ことを伝えていた。ユーザー指定により、地は**3アプリとも
// 同じほんとに薄いグレー**へ統一し、アプリの違いは背景に置いた大きな図形
// (AppBackdrop)ひとつだけで伝える。クリームは廃止し、紙・墨とも色味を
// 抜いた中性のグレースケールにする。
//
// 色を捨てたぶん、残したアクセント(下のBLUE/RUST/GREEN/GOLDと、バインダー
// のアクセント各種)がはっきり効くようになる = 「遊び心」はそちらが担う。
export const INK = "#1A1A18";
export const PAPER = "#FAFAF9";
export const BG = "#F0F0EE";
// 背景(AppBackdrop)専用の2段。バインダーの表紙と同じ「下地(=BG) / 帯(SHADE) /
// 図形(SHADE_DEEP)」の3層を、グレーの濃淡だけで作るための値。
// 地に溶ける透かしの調子は保ちたいので、いちばん濃いSHADE_DEEPでも地との差は
// 16程度に留めてある。ここを触ると背景の主張の強さが変わる。
export const SHADE = "#E9E9E6";
export const SHADE_DEEP = "#E0E0DC";
// 補助の文字色。以前は各所で "#9A988E" を直書きしていたものをここへ集約した。
export const MUTED = "#8E8E88";

// ── カラースキーム(2026-08-16にユーザー指定・参照画像=Spotifyの配色見本) ──
//
// ★**色の出どころはここ1つ**。9つの「地の色 × その上に載る文字の色」の組。
// 使うのは**地の色**の方で、それがアプリの基本の色になる。文字の色は、
// その地の上に文字や図形を載せるときだけ相方として使う。
//
// ★無彩色(INK / PAPER / BG / SHADE / MUTED / BD_GREY / JOURNAL_* など)は
// この置き換えの対象外。地とタイトルのグレースケールは今までどおり。
export interface ColorPair {
  /** 地の色。これが「その色」の正体。 */
  bg: string;
  /** その地の上に載せる文字・図形の色。 */
  ink: string;
}
export const SCHEME = {
  pink: { bg: "#F76FA1", ink: "#4B2438" },
  orange: { bg: "#FA6E31", ink: "#1B2B4F" },
  sky: { bg: "#509BF5", ink: "#C4F0C5" },
  red: { bg: "#EE1B33", ink: "#F9C3C9" },
  violet: { bg: "#4100F5", ink: "#FFFFFF" },
  yellow: { bg: "#F5E837", ink: "#EF3E23" },
  navy: { bg: "#1E3264", ink: "#F573A0" },
  wine: { bg: "#8C1932", ink: "#A3E3C8" },
  forest: { bg: "#04624A", ink: "#F7D6D3" },
} as const satisfies Record<string, ColorPair>;

// アプリが前から持っている6つのアクセントの名前は変えず、**中身をスキームの
// 地の色へ差し替える**。呼び出し側(数十箇所)はそのまま新しい色になる。
// どれを当てるかは「元の色相を保つ」ことと「その色の上に何が載るか」で決めた。
export const BLUE = SCHEME.violet.bg;   // 選択中・リンク。濃いので細い字でも読める
export const RUST = SCHEME.red.bg;      // 削除・エラー。警告として最も強い赤
export const GREEN = SCHEME.forest.bg;  // 肯定・達成
export const GOLD = SCHEME.orange.bg;   // ★白い ✓ を載せる面。黄だと白が消える
export const PLUM = SCHEME.wine.bg;
export const SLATE = SCHEME.navy.bg;
/** RUST の淡い敷き。以前は rgba(193,80,46,…) を各所に直書きしていた。 */
export const RUST_TINT = "rgba(238,27,51,0.12)";
export const RUST_EDGE = "rgba(238,27,51,0.45)";
export const HAIRLINE = "rgba(26,26,24,0.08)";
// カードの縁取りは基本的にこの柔らかい影1つに統一する(枠線は使わない)。
export const SOFT_SHADOW = "0 4px 16px rgba(28,28,30,0.07)";
export const SOFT_SHADOW_LG = "0 12px 32px rgba(28,28,30,0.12)";

// ヘッダー行に並ぶ「丸いアイコンボタン」と「件数ピル」の高さを揃えるための
// 共通サイズ。形(円/ピル)は違っても高さを合わせることで、同じ行の部品として
// 統一感を持たせる。
export const HEADER_CHIP_SIZE = 40;

// アプリ全体で使う統一カードの縦横比。写真付き(Keepの場所など)も
// 文字だけ(作品など)も、目標のバインダーも、この比率1種類に統一する。
export const ITEM_CARD_ASPECT = "3 / 4";
export const GOAL_CARD_ASPECT = ITEM_CARD_ASPECT;

// 文字だけのカードの地。スキームの地の色から、濃さの違う4つを選ぶ
// (白い文字が載るので、明るい黄・空・ピンクは使わない)。
export const POSTER_PALETTE = [SCHEME.navy.bg, SCHEME.orange.bg, SCHEME.red.bg, SCHEME.forest.bg];

// ★タブバーの寸法。選択中の印は**正円**で、その直径がそのまま
// ピルの内側の高さになる(ピルの高さ = TAB_MARK + NAV_PILL_PAD * 2 = 64)。
// タブバー(AppShell)とダッシュボードのモーフ用ピル(Dashboard)の両方が
// 使う。開閉の途中でこの2つが入れ替わるので、必ず同じ値を見ること。
export const TAB_MARK = 52;
export const NAV_PILL_PAD = 6;

// 背景(AppBackdrop)の地と図形。画面より下(iOSでツールバーが引っ込んだ
// ときに現れる帯)にも同じ色が要るので、ここに置いて body へも書く。
export const BD_GREY = "#ECECEA";
// ★ジャーナル(声の記録)の地と図。参考画像(2026-08-11)から採った、暖かみの
// ある中間グレー。地と図の差はごくわずか(明度差 約18)で、円は「浮いた面」
// ではなく「地の濃淡」として読める。
export const JOURNAL_BG = "#B3B3AE";
// ★円は地よりはっきり明るく、ほぼ白へ寄せる。以前は明度差18しか無く、
// 「まだ背景に見えてしまう」と報告された(2026-08-11)。
export const JOURNAL_FIG = "#EAEAE6";
// この地の上での控えめな文字色。
export const JOURNAL_MUTED = "rgba(26,26,24,0.46)";
export const BD_LIGHT = "#F3F3F1";

// navのピル自体を画面下端からどれだけ浮かせるか。ホーム画面に追加した
// PWA(スタンドアロン)起動時、env(safe-area-inset-bottom)をそのまま
// marginBottomに使うと、実機では表示領域が想定より狭く感じられるほど
// 下に余白が残る指摘があったため、その値の一部だけを使うように絞って
// いる。safe-area自体が無い機種ではmax(4px, 負の値)により最小の4pxへ
// 収まる。
export const NAV_BOTTOM_GAP = "max(4px, calc(env(safe-area-inset-bottom) - 26px))";

// タブ本文やストック/目標/実行タブの下部固定バーが、フローティングの
// タブバー(AppShellのnav)の直上に収まるためのオフセット。表示領域を
// 少しでも広く取るため、navのピル自体の余白を切り詰めて画面下端ぎりぎり
// まで下げた分、この値も縮めている。navのスタイルを変えたら実測して
// 合わせ直すこと。NAV_BOTTOM_GAPと同じ値を足しているのは、navが画面下端
// から浮く量が変わればここに揃えるUIが下端に近づく量も連動させるため。
export const NAV_OFFSET = `calc(82px + ${NAV_BOTTOM_GAP})`;

// ★タブバーの実高さ(画面の下端からタブバーの上端まで)。
// アプリの目印の行(5+7=12) + ピル(TAB_MARK + NAV_PILL_PAD*2 = 64) + 下の浮き。
// ★★タブバーは**フローから外して**画面の上に浮かせてある(AppShell参照)ので、
// 「タブバーのぶんの余白」が要る場所はすべてこの値を見ること。ここと
// globals.css の --nav-h だけが、タブバーの高さを知っている場所。
export const NAV_H = `calc(76px + ${NAV_BOTTOM_GAP})`;
// タブ本文の上の余白(セーフエリア込み)。--pad-top として全体へ配る。
export const TAB_PAD_TOP = "max(16px, env(safe-area-inset-top))";

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

