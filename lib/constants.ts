import type { AppState, BriefCard, CategoryId, ItemDomain, ItemKind } from "./types";

export const STORAGE_KEY = "qol-app-state-v1";

export const DEFAULT_STATE: AppState = {
  wishes: [],
  items: [],
  briefs: {},
  magazine: null,
  profile: { interests: [], currentFocus: "" },
  weekendMeta: { lastSeenBundleWeek: null },
  goals: [],
  pendingReview: [],
  sources: [],
};

// 目標への「最近どうですか？」を投げかける間隔
export const CHECKIN_INTERVAL_DAYS = 14;
// 「できるようになったこと」を評価つきで振り返る間隔(1〜2ヶ月)
export const MILESTONE_INTERVAL_DAYS = 45;
// 場所を持つItemの自動失効: expiresAtがなければaddedAtからこの日数で削除
export const KEEP_MAX_AGE_DAYS = 30;

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
// 添付のバウハウス風ポスター(生成りのクリーム地に黒・マスタード・
// コーラル・ティール・深緑)を基準に、アプリ全体(UI・カード・バインダー)の
// 色味を寒色寄りの白黒基調から、この暖色のクリーム地+アースカラーへ寄せた。
export const INK = "#1A1712";
export const PAPER = "#FBF6E9";
export const BG = "#F2EADA";
export const BLUE = "#2C6E8A";
export const RUST = "#C1502E";
export const GREEN = "#33633F";
export const GOLD = "#C79433";
export const HAIRLINE = "rgba(26,23,18,0.1)";
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

// 色数を絞った、写真が映えるための控えめなパレット。以前は8色の
// ビビッドな色相を持っていたが、カードが並んだ時に色がぶつかり合って
// ごちゃついたため、渋めで馴染みやすい4色まで減らした。参考画像に
// 合わせ、紫系をやめてバウハウスの5色(黒・マスタード・コーラル・
// ティール・深緑)の家族に揃えている。
export const POSTER_PALETTE = ["#2C4E74", GOLD, RUST, GREEN];

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

export interface Category {
  id: CategoryId;
  label: string;
  en: string;
  color: string;
}

export const CATEGORIES: Category[] = [
  { id: "do", label: "やりたい", en: "TO DO", color: BLUE },
  { id: "buy", label: "欲しい", en: "TO BUY", color: RUST },
  { id: "go", label: "行きたい", en: "TO GO", color: GREEN },
];
export const catOf = (id: CategoryId) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];

// ---- 興味の自動検出（プロトタイプ: キーワード頻度。本実装ではGeminiに置換） --
export interface InterestRule {
  match: RegExp;
  label: string;
  categoryId: CategoryId;
  kind: "hobby";
}
export const INTEREST_RULES: InterestRule[] = [
  { match: /カフェ|コーヒー|焙煎/, label: "カフェ巡り", categoryId: "do", kind: "hobby" },
  { match: /古着|ヴィンテージ/, label: "古着収集", categoryId: "buy", kind: "hobby" },
  { match: /映画|シネマ/, label: "映画鑑賞", categoryId: "go", kind: "hobby" },
  { match: /展覧会|美術館|ギャラリー/, label: "アート鑑賞", categoryId: "go", kind: "hobby" },
  { match: /建築/, label: "建築巡り", categoryId: "go", kind: "hobby" },
  { match: /陶芸|工芸|手仕事/, label: "ものづくり", categoryId: "do", kind: "hobby" },
  { match: /銭湯|温泉|サウナ/, label: "温泉・サウナ", categoryId: "go", kind: "hobby" },
  { match: /古書|本屋|書店/, label: "本屋巡り", categoryId: "go", kind: "hobby" },
  { match: /雑貨/, label: "雑貨集め", categoryId: "buy", kind: "hobby" },
  { match: /ボルダリング|クライミング|筋トレ|ヨガ|ランニング/, label: "運動習慣", categoryId: "do", kind: "hobby" },
];
export const AUTO_THRESHOLD = 2;

// ---- 地図の座標（スタイライズド。実装ではGoogle Mapsの実座標に置換） ----
export const AREA_COORDS: Record<string, { x: number; y: number }> = {
  "竹橋": { x: 46, y: 32 }, "神保町": { x: 42, y: 38 }, "日比谷": { x: 50, y: 50 },
  "谷根千": { x: 56, y: 18 }, "浅草橋": { x: 66, y: 38 }, "蔵前": { x: 70, y: 42 },
  "両国": { x: 74, y: 48 }, "清澄白河": { x: 68, y: 58 }, "高円寺": { x: 8, y: 44 },
};
export const AREA_FALLBACK = { x: 50, y: 80 };

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

// ---- ブリーフのダミーデータ（8件+本+音楽・画像/情報ソース/地図色付き） --------
// フェーズ1はダミーデータのままデプロイする(実装引き継ぎドキュメント §8)。
// フェーズ2でGemini生成のブリーフに置き換わる。
export const CARDS: BriefCard[] = [
  // 展覧会は「作品」でありながら場所と不可分(kind:"exhibition"+area)。
  // ウィッシュに応えたカードはsourceWishTitleで元の願いに紐付き、KEEPすると
  // origin:"wish"のItemになる(フェーズ2ではGeminiがidで明示的に紐付ける)。
  { id: 1, glyph: "展", category: "ART & EXHIBITION", categoryJp: "展覧会", trigger: "タイムリー", area: "竹橋", color: "#2C4E74",
    kind: "exhibition", sourceWishTitle: "安藤忠雄の建築を観る",
    title: "「建築と自然」展、今日から開幕",
    body: "願望リストの「安藤忠雄の建築を観る」に関連。国立近代美術館で本日より。会期は8月末まで、混雑は初週が最も少ない予測。",
    meta: ["国立近代美術館", "10:00 – 17:00", "¥1,800"], bg: "#2C4E74", fg: "#F3ECDD", accent: "#A8BFD6",
    images: ["momat-a", "momat-b", "momat-c"], sourceUrl: "https://www.momat.go.jp/", sourceLabel: "公式サイトを見る" },
  // 新作映画は「作品(kind:"movie")+映画館という場所(area)」の組み合わせ。
  { id: 2, glyph: "映", category: "CINEMA", categoryJp: "映画", trigger: "タイムリー", area: "日比谷", color: "#1A1712",
    kind: "movie",
    title: "観たかったあの映画、公開初週",
    body: "リスト登録済みの『Perfect Days 2』が昨日公開。金曜夜のレイトショーなら、仕事帰りの動線上の劇場で21:10の回に間に合います。",
    meta: ["TOHOシネマズ 日比谷", "21:10 レイトショー", "¥1,500"], bg: "#1A1712", fg: "#F3ECDD", accent: "#C79433",
    images: ["hibiya-a", "hibiya-b"], sourceUrl: "https://www.tohotheater.jp/", sourceLabel: "上映情報・チケットを見る" },
  { id: 3, glyph: "珈", category: "NEIGHBORHOOD", categoryJp: "近所の発見", trigger: "ロケーション", area: "蔵前", color: "#33633F",
    kind: "thing", sourceWishTitle: "浅煎りの豆を買う",
    title: "明日の予定の途中に、あの焙煎所",
    body: "土曜の外出ルートから徒歩4分。願望リストの「浅煎りの豆を買う」が達成できます。土曜は焼き菓子の入荷日でもあります。",
    meta: ["蔵前・COFFEE WRIGHTS", "9:00 – 18:00", "徒歩4分の寄り道"], bg: "#33633F", fg: "#F3ECDD", accent: "#A7C7AE",
    images: ["kuramae-a", "kuramae-b", "kuramae-c"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("COFFEE WRIGHTS 蔵前")}`, sourceLabel: "地図で見る" },
  // 「買うモノ」の提案は場所を持たないthing。KEEPすると地図ではなく
  // ストックの「モノ」棚に入る。
  { id: 4, glyph: "貯", category: "FINANCE", categoryJp: "貯金の進捗", trigger: "フィナンシャル", color: "#C1502E",
    kind: "thing", sourceWishTitle: "フィルムカメラを買う",
    title: "カメラ貯金、あと12%で目標達成",
    body: "先週末の予算余剰¥6,400を自動振り分け。現在の達成率88%。このペースなら7月中旬に「フィルムカメラ購入」に手が届きます。",
    meta: ["目標 ¥72,000", "現在 ¥63,400", "達成率 88%"], bg: "#FAF3E4", fg: "#1A1712", accent: "#C1502E",
    images: ["camera-a", "camera-b"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("中古カメラ店 東京")}`, sourceLabel: "地図で見る" },
  { id: 5, glyph: "陶", category: "SERENDIPITY", categoryJp: "未知との遭遇", trigger: "セレンディピティ", area: "清澄白河", color: "#7A4432",
    kind: "activity",
    title: "陶芸、はじめてみませんか",
    body: "あなたの「手を動かす趣味」への関心から一歩外へ。日曜午前の一日体験クラスに空きが2席。建築好きの参加者が多い教室です。",
    meta: ["清澄白河・陶房", "日曜 10:00 – 12:30", "体験 ¥4,500"], bg: "#7A4432", fg: "#F3ECDD", accent: "#D9BBA8", serendipity: true,
    images: ["pottery-a", "pottery-b", "pottery-c"], sourceUrl: `https://www.google.com/search?q=${encodeURIComponent("清澄白河 陶芸体験 一日")}`, sourceLabel: "詳しく調べる" },
  { id: 6, glyph: "古", category: "VINTAGE", categoryJp: "古着", trigger: "ロケーション", area: "高円寺", color: "#8A3C2A",
    kind: "thing", sourceWishTitle: "古着でジャケットを探す",
    title: "高円寺の一点物古着屋、新しい入荷情報",
    body: "願望リストの「古着でジャケットを探す」に近いお店。個人経営で入荷が読めない分、タイミングが合う今週末が狙い目です。",
    meta: ["高円寺北口エリア", "12:00 – 20:00", "現金のみ"], bg: "#8A3C2A", fg: "#F3ECDD", accent: "#D9AE86",
    images: ["vintage-a", "vintage-b", "vintage-c"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("高円寺 古着屋")}`, sourceLabel: "地図で見る" },
  { id: 7, glyph: "雑", category: "ZAKKA", categoryJp: "雑貨", trigger: "タイムリー", area: "谷根千", color: "#2C6E7A",
    kind: "thing",
    title: "谷根千の小さな雑貨店、一年に一度の陶器市",
    body: "普段は棚に並びきらない作家ものの器が、期間限定で店先に広がります。年に一度なので、今週を逃すと来年までお預けです。",
    meta: ["谷中エリア", "11:00 – 17:00", "会期は今週末まで"], bg: "#2C6E7A", fg: "#F3ECDD", accent: "#A8D2D6",
    images: ["zakka-a", "zakka-b"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("谷中 雑貨店")}`, sourceLabel: "地図で見る" },
  { id: 8, glyph: "登", category: "PHYSICAL", categoryJp: "身体", trigger: "ロケーション", area: "浅草橋", color: "#33506E",
    kind: "activity",
    title: "近所にできたボルダリングジム、初回体験無料",
    body: "願望リストの「筋力向上」に直結。浅草橋なら他のKeepとも動線を組みやすいエリアです。初回体験は道具レンタル込み。",
    meta: ["浅草橋駅から徒歩6分", "初回体験 無料", "予約制"], bg: "#33506E", fg: "#F3ECDD", accent: "#AEC3D8",
    images: ["climb-a", "climb-b", "climb-c"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("浅草橋 ボルダリングジム")}`, sourceLabel: "地図で見る" },
  // 本の提案は場所を持たない作品(kind:"book")。KEEPするとストックの
  // 「作品」棚に入る。area/imagesは持たせず、地図には出さない。
  { id: 9, glyph: "本", category: "BOOK", categoryJp: "読書", trigger: "興味との一致", kind: "book", color: "#6B4A2E",
    title: "積んでいた分野、今週読み切れる一冊",
    body: "最近の興味の傾向から、建築家の手による随筆集はいかがでしょう。新書サイズで通勤の隙間時間でも読み切れる分量です。",
    meta: ["新書・224ページ", "¥900前後"], bg: "#6B4A2E", fg: "#F3ECDD", accent: "#D9C29C",
    images: [], sourceUrl: `https://www.google.com/search?q=${encodeURIComponent("建築家 エッセイ おすすめ 新書")}`, sourceLabel: "書店で探す" },
  // 登録サイト(例: Rate Your Music)から拾ってくるカードの例。
  { id: 10, glyph: "音", category: "MUSIC", categoryJp: "音楽", trigger: "登録サイトより", kind: "album", color: "#A67A2E",
    title: "評価の高い一枚、通勤で聴き切るアルバム",
    body: "登録サイトのチャートから、あなたの傾向に近いジャンルで高評価の一枚を。全42分、往復の通勤でちょうど聴き終わります。",
    meta: ["出典: rateyourmusic.com", "1971年 ・ 42分"], bg: "#A67A2E", fg: "#F3ECDD", accent: "#E0C68A",
    images: [], sourceUrl: "https://rateyourmusic.com/charts/", sourceLabel: "チャートで見る" },
  { id: 11, glyph: "劇", category: "LIVE", categoryJp: "音楽", trigger: "興味との一致", area: "下北沢", color: "#2A4A3A",
    kind: "live",
    title: "下北沢の小箱、対バンライブが今夜",
    body: "最近チェックが増えているインディーバンドの対バン。キャパ100人ほどの箱なので、当日券でも近くで観られる公算が高いです。",
    meta: ["下北沢 CLUB", "開場19:00 / 開演19:30", "前売¥3,200"], bg: "#2A4A3A", fg: "#F3ECDD", accent: "#A7CBB8",
    images: ["live-a", "live-b"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("下北沢 ライブハウス")}`, sourceLabel: "地図で見る" },
  { id: 12, glyph: "銭", category: "SERENDIPITY", categoryJp: "未知との遭遇", trigger: "ロケーション", area: "蔵前", color: "#3E5468",
    kind: "activity", sourceWishTitle: "サウナを開拓する",
    title: "蔵前に薪火の銭湯サウナ、今週末オープン",
    body: "リニューアルオープン記念で今週末は入浴料が半額。願望リストの「サウナを開拓する」に一歩近づきます。",
    meta: ["蔵前", "6:00 – 24:00", "半額 ¥400"], bg: "#3E5468", fg: "#F3ECDD", accent: "#AFC0D0", serendipity: true,
    images: ["sauna-a", "sauna-b"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("蔵前 サウナ")}`, sourceLabel: "地図で見る" },
  { id: 13, glyph: "映", category: "CINEMA", categoryJp: "映画", trigger: "興味との一致", area: "両国", color: "#4A3628",
    kind: "movie",
    title: "単館上映のドキュメンタリー、今週が最終週",
    body: "建築をテーマにしたドキュメンタリーが両国のミニシアターで上映中。今週の金曜が最終日、その後の上映予定は未定です。",
    meta: ["両国のミニシアター", "19:40の回", "¥1,900"], bg: "#4A3628", fg: "#F3ECDD", accent: "#D9C4AE",
    images: ["carpentry-a"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("両国 ミニシアター")}`, sourceLabel: "地図で見る" },
  { id: 14, glyph: "器", category: "ZAKKA", categoryJp: "雑貨", trigger: "ロケーション", area: "神保町", color: "#8A6B2E",
    kind: "exhibition",
    title: "神保町の器店、作家の個展が始まりました",
    body: "普段使いの器を作る作家の個展。会期中は作家本人が在廊している日もあり、器についての話が聞けるかもしれません。",
    meta: ["神保町", "12:00 – 19:00", "会期は今月いっぱい"], bg: "#8A6B2E", fg: "#F3ECDD", accent: "#E0CFA0",
    images: ["books-a"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("神保町 器 個展")}`, sourceLabel: "地図で見る" },
  { id: 15, glyph: "貯", category: "FINANCE", categoryJp: "貯金の進捗", trigger: "フィナンシャル", color: "#2E6E52",
    sourceWishTitle: "秋に一人旅へ行く",
    title: "旅行貯金、今月分の積立が完了しました",
    body: "毎月の自動積立が完了。現在の達成率は54%で、このペースなら年末までに「秋の一人旅」の予算に届く見込みです。",
    meta: ["目標 ¥180,000", "現在 ¥97,200", "達成率 54%"], bg: "#FAF3E4", fg: "#1A1712", accent: "#2E6E52",
    images: [], sourceUrl: `https://www.google.com/search?q=${encodeURIComponent("国内 一人旅 秋 おすすめ")}`, sourceLabel: "詳しく調べる" },
  { id: 16, glyph: "登", category: "PHYSICAL", categoryJp: "身体", trigger: "興味との一致", area: "谷根千", color: "#5A3A28",
    sourceWishTitle: "もっと歩く",
    title: "谷根千の坂道散歩コース、朝の時間帯が快適",
    body: "願望リストの「もっと歩く」に沿った提案。夕方より朝7時台のほうが人通りも少なく、坂の多いこのエリアを歩きやすいです。",
    meta: ["谷根千エリア", "推奨 7:00 – 8:30", "所要 約50分"], bg: "#5A3A28", fg: "#F3ECDD", accent: "#D9BB98",
    images: ["zakka-b"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("谷根千 散歩コース")}`, sourceLabel: "地図で見る" },
  { id: 17, glyph: "本", category: "BOOK", categoryJp: "読書", trigger: "登録サイトより", kind: "book", color: "#2C5468",
    title: "書評サイトで話題の短編集、電子版が今週セール",
    body: "普段読む作家の系統からやや外れた一冊ですが、書評サイトでの評価が高く、電子版は今週末まで20%オフです。",
    meta: ["文庫・288ページ", "セール価格 ¥720"], bg: "#2C5468", fg: "#F3ECDD", accent: "#A7C4D6",
    images: [], sourceUrl: `https://www.google.com/search?q=${encodeURIComponent("短編集 話題 書評 電子書籍")}`, sourceLabel: "書店で探す" },
  { id: 18, glyph: "陶", category: "VINTAGE", categoryJp: "古着", trigger: "タイムリー", area: "高円寺", color: "#8A3C34",
    kind: "thing", sourceWishTitle: "古着でジャケットを探す",
    title: "高円寺の古着市、年に2回の大型セールが明日から",
    body: "願望リストの「古着でジャケットを探す」に関連。複数の店舗が合同で開く大型セールで、掘り出し物が出やすいタイミングです。",
    meta: ["高円寺北口一帯", "10:00 – 19:00", "セールは3日間"], bg: "#8A3C34", fg: "#F3ECDD", accent: "#D9AFA4",
    images: ["vintage-c"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("高円寺 古着 セール")}`, sourceLabel: "地図で見る" },
];
