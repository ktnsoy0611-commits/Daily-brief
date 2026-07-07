import type { AppState, BriefCard, CategoryId } from "./types";

export const STORAGE_KEY = "qol-app-state-v1";

export const DEFAULT_STATE: AppState = {
  wishes: [],
  keeps: [],
  briefs: {},
  magazine: null,
  profile: { interests: [], currentFocus: "" },
  records: { media: [] },
  weekendMeta: { lastSeenBundleWeek: null },
  goals: [],
  pendingReview: [],
  sources: [],
};

// 目標への「最近どうですか？」を投げかける間隔
export const CHECKIN_INTERVAL_DAYS = 14;
// 「できるようになったこと」を評価つきで振り返る間隔(1〜2ヶ月)
export const MILESTONE_INTERVAL_DAYS = 45;
// Keepの自動失効: expiresAtがなければkeptAtからこの日数で削除
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
export const INK = "#1C1C1E";
export const PAPER = "#FFFFFF";
export const BG = "#F3F1EC";
export const BLUE = "#3357C7";
export const RUST = "#C15A34";
export const GREEN = "#2E9A5C";
export const HAIRLINE = "rgba(28,28,30,0.08)";
// カードの縁取りは基本的にこの柔らかい影1つに統一する(枠線は使わない)。
export const SOFT_SHADOW = "0 4px 16px rgba(28,28,30,0.07)";
export const SOFT_SHADOW_LG = "0 12px 32px rgba(28,28,30,0.12)";

// ヘッダー行に並ぶ「丸いアイコンボタン」と「件数ピル」の高さを揃えるための
// 共通サイズ。形(円/ピル)は違っても高さを合わせることで、同じ行の部品として
// 統一感を持たせる。
export const HEADER_CHIP_SIZE = 40;

// アプリ全体で使う統一カードの縦横比。写真付き(Keepの場所など)も
// 文字だけ(作品など)も、この比率のカード1種類に統一する。
export const ITEM_CARD_ASPECT = "3 / 4";
// 目標カードだけは意図的に少し違う比率にして、視覚的に区別できるようにする。
export const GOAL_CARD_ASPECT = "3 / 5";

// 色数を絞った、写真が映えるための控えめなパレット。以前は8色の
// ビビッドな色相を持っていたが、カードが並んだ時に色がぶつかり合って
// ごちゃついたため、渋めで馴染みやすい4色まで減らした。
export const POSTER_PALETTE = ["#33467C", "#B85C38", "#3F6B4A", "#5C4B6B"];

// 下部固定バー(ストック・目標・実行タブ)がナビゲーションバーの直上にぴったり
// 収まるためのオフセット。ナビの実測高さ(66px、アイコンのピル+ラベル+
// 上下padding)に安全域を足す。ここが合っていないと、固定バーとナビの間に
// 隙間ができる。ナビのスタイルを変えたら実測して合わせ直すこと。
export const NAV_OFFSET = "calc(66px + env(safe-area-inset-bottom))";

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

// ---- メディア記録の種類 ----
export interface MediaKindDef {
  id: "movie" | "exhibition" | "live" | "book" | "album";
  label: string;
  en: string;
  creatorPlaceholder: string;
  // KEEPしたメディア(candidate)を実際にやったログ(done)へ進める際のボタン文言
  doneActionLabel: string;
}
export const MEDIA_KINDS: MediaKindDef[] = [
  { id: "movie", label: "映画", en: "CINEMA", creatorPlaceholder: "監督（任意）", doneActionLabel: "観た" },
  { id: "exhibition", label: "展覧会", en: "EXHIBITION", creatorPlaceholder: "会場（任意）", doneActionLabel: "観た" },
  { id: "live", label: "ライブ・コンサート", en: "LIVE", creatorPlaceholder: "アーティスト（任意）", doneActionLabel: "観た" },
  { id: "book", label: "読書", en: "BOOK", creatorPlaceholder: "著者（任意）", doneActionLabel: "読んだ" },
  { id: "album", label: "音楽", en: "MUSIC", creatorPlaceholder: "アーティスト（任意）", doneActionLabel: "聴いた" },
];
export const mediaKindOf = (id: string) => MEDIA_KINDS.find((k) => k.id === id) ?? MEDIA_KINDS[0];

// ---- ブリーフのダミーデータ（8件+本+音楽・画像/情報ソース/地図色付き） --------
// フェーズ1はダミーデータのままデプロイする(実装引き継ぎドキュメント §8)。
// フェーズ2でGemini生成のブリーフに置き換わる。
export const CARDS: BriefCard[] = [
  { id: 1, glyph: "展", category: "ART & EXHIBITION", categoryJp: "展覧会", trigger: "タイムリー", area: "竹橋", color: "#33467C",
    title: "「建築と自然」展、今日から開幕",
    body: "願望リストの「安藤忠雄の建築を観る」に関連。国立近代美術館で本日より。会期は8月末まで、混雑は初週が最も少ない予測。",
    meta: ["国立近代美術館", "10:00 – 17:00", "¥1,800"], bg: "#33467C", fg: "#F0EEE6", accent: "#A9B7E0",
    images: ["momat-a", "momat-b", "momat-c"], sourceUrl: "https://www.momat.go.jp/", sourceLabel: "公式サイトを見る" },
  { id: 2, glyph: "映", category: "CINEMA", categoryJp: "映画", trigger: "タイムリー", area: "日比谷", color: "#1C1B22",
    title: "観たかったあの映画、公開初週",
    body: "リスト登録済みの『Perfect Days 2』が昨日公開。金曜夜のレイトショーなら、仕事帰りの動線上の劇場で21:10の回に間に合います。",
    meta: ["TOHOシネマズ 日比谷", "21:10 レイトショー", "¥1,500"], bg: "#1C1B22", fg: "#F0EEE6", accent: "#C9A860",
    images: ["hibiya-a", "hibiya-b"], sourceUrl: "https://www.tohotheater.jp/", sourceLabel: "上映情報・チケットを見る" },
  { id: 3, glyph: "珈", category: "NEIGHBORHOOD", categoryJp: "近所の発見", trigger: "ロケーション", area: "蔵前", color: "#3F6B4A",
    title: "明日の予定の途中に、あの焙煎所",
    body: "土曜の外出ルートから徒歩4分。願望リストの「浅煎りの豆を買う」が達成できます。土曜は焼き菓子の入荷日でもあります。",
    meta: ["蔵前・COFFEE WRIGHTS", "9:00 – 18:00", "徒歩4分の寄り道"], bg: "#3F6B4A", fg: "#F0EEE6", accent: "#A9CBAE",
    images: ["kuramae-a", "kuramae-b", "kuramae-c"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("COFFEE WRIGHTS 蔵前")}`, sourceLabel: "地図で見る" },
  { id: 4, glyph: "貯", category: "FINANCE", categoryJp: "貯金の進捗", trigger: "フィナンシャル", area: "—", color: "#B85C38",
    title: "カメラ貯金、あと12%で目標達成",
    body: "先週末の予算余剰¥6,400を自動振り分け。現在の達成率88%。このペースなら7月中旬に「フィルムカメラ購入」に手が届きます。",
    meta: ["目標 ¥72,000", "現在 ¥63,400", "達成率 88%"], bg: "#F5F0E8", fg: "#1C1C1E", accent: "#B85C38",
    images: ["camera-a", "camera-b"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("中古カメラ店 東京")}`, sourceLabel: "地図で見る" },
  { id: 5, glyph: "陶", category: "SERENDIPITY", categoryJp: "未知との遭遇", trigger: "セレンディピティ", area: "清澄白河", color: "#5C4B6B",
    title: "陶芸、はじめてみませんか",
    body: "あなたの「手を動かす趣味」への関心から一歩外へ。日曜午前の一日体験クラスに空きが2席。建築好きの参加者が多い教室です。",
    meta: ["清澄白河・陶房", "日曜 10:00 – 12:30", "体験 ¥4,500"], bg: "#5C4B6B", fg: "#F0EEE6", accent: "#D4C6DE", serendipity: true,
    images: ["pottery-a", "pottery-b", "pottery-c"], sourceUrl: `https://www.google.com/search?q=${encodeURIComponent("清澄白河 陶芸体験 一日")}`, sourceLabel: "詳しく調べる" },
  { id: 6, glyph: "古", category: "VINTAGE", categoryJp: "古着", trigger: "ロケーション", area: "高円寺", color: "#8B4A2E",
    title: "高円寺の一点物古着屋、新しい入荷情報",
    body: "願望リストの「古着でジャケットを探す」に近いお店。個人経営で入荷が読めない分、タイミングが合う今週末が狙い目です。",
    meta: ["高円寺北口エリア", "12:00 – 20:00", "現金のみ"], bg: "#8B4A2E", fg: "#F0EEE6", accent: "#D9AE86",
    images: ["vintage-a", "vintage-b", "vintage-c"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("高円寺 古着屋")}`, sourceLabel: "地図で見る" },
  { id: 7, glyph: "雑", category: "ZAKKA", categoryJp: "雑貨", trigger: "タイムリー", area: "谷根千", color: "#3A6B6B",
    title: "谷根千の小さな雑貨店、一年に一度の陶器市",
    body: "普段は棚に並びきらない作家ものの器が、期間限定で店先に広がります。年に一度なので、今週を逃すと来年までお預けです。",
    meta: ["谷中エリア", "11:00 – 17:00", "会期は今週末まで"], bg: "#3A6B6B", fg: "#F0EEE6", accent: "#A9D0D0",
    images: ["zakka-a", "zakka-b"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("谷中 雑貨店")}`, sourceLabel: "地図で見る" },
  { id: 8, glyph: "登", category: "PHYSICAL", categoryJp: "身体", trigger: "ロケーション", area: "浅草橋", color: "#3A4A5C",
    title: "近所にできたボルダリングジム、初回体験無料",
    body: "願望リストの「筋力向上」に直結。浅草橋なら他のKeepとも動線を組みやすいエリアです。初回体験は道具レンタル込み。",
    meta: ["浅草橋駅から徒歩6分", "初回体験 無料", "予約制"], bg: "#3A4A5C", fg: "#F0EEE6", accent: "#A9BCD0",
    images: ["climb-a", "climb-b", "climb-c"], sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("浅草橋 ボルダリングジム")}`, sourceLabel: "地図で見る" },
  // 本の提案は「行く場所」ではないため、KEEPすると地図ではなく記録タブの
  // メディアへ直接入る(mediaKind指定)。area/imagesは持たせず、地図には出さない。
  { id: 9, glyph: "本", category: "BOOK", categoryJp: "読書", trigger: "興味との一致", mediaKind: "book", color: "#7A5636",
    title: "積んでいた分野、今週読み切れる一冊",
    body: "最近の興味の傾向から、建築家の手による随筆集はいかがでしょう。新書サイズで通勤の隙間時間でも読み切れる分量です。",
    meta: ["新書・224ページ", "¥900前後"], bg: "#7A5636", fg: "#F0EEE6", accent: "#D9BE96",
    images: [], sourceUrl: `https://www.google.com/search?q=${encodeURIComponent("建築家 エッセイ おすすめ 新書")}`, sourceLabel: "書店で探す" },
  // 登録サイト(例: Rate Your Music)から拾ってくるカードの例。
  { id: 10, glyph: "音", category: "MUSIC", categoryJp: "音楽", trigger: "登録サイトより", mediaKind: "album", color: "#6B4558",
    title: "評価の高い一枚、通勤で聴き切るアルバム",
    body: "登録サイトのチャートから、あなたの傾向に近いジャンルで高評価の一枚を。全42分、往復の通勤でちょうど聴き終わります。",
    meta: ["出典: rateyourmusic.com", "1971年 ・ 42分"], bg: "#6B4558", fg: "#F0EEE6", accent: "#D8B6C6",
    images: [], sourceUrl: "https://rateyourmusic.com/charts/", sourceLabel: "チャートで見る" },
];
