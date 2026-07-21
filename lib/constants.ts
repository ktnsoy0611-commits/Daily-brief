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
  generatedDecks: {},
};

// 目標への「最近どうですか？」を投げかける間隔
export const CHECKIN_INTERVAL_DAYS = 14;
// 「できるようになったこと」を評価つきで振り返る間隔(1〜2ヶ月)
export const MILESTONE_INTERVAL_DAYS = 45;
// 場所を持つItemの自動失効: expiresAtがなければaddedAtからこの日数で削除
export const KEEP_MAX_AGE_DAYS = 30;
// ブリーフの号(briefs[editionKey])はその日を過ぎたら二度と参照されない
// (BriefTabは常にtodayKey()ベースのeditionKeyしか読まない)ため、無期限に
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

// ---- 興味の自動検出（プロトタイプ: キーワード頻度。本実装ではGeminiに置換） --
// 自動検出はウィッシュ・KEEPしたItemという「直近の行動」から拾うため、
// 性質上つねに興味(category:"interest"、時期で変わる方)に分類する
// (lib/helpers.tsのdetectInterests参照)。
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

