import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Newspaper, Heart, Map as MapIcon, User, LayoutGrid, Sprout, ChevronDown, Check, X, Star, Flag } from "lucide-react";

// ==================================================================
// QOLアプリ 統合版 ver.9 ── 軌道修正版
//
// 【今回の方針転換】
// 1. 週末プランを「時間割を組むタスク」から「地図で選んでマガジンに
//    する」体験に作り替えた。松竹梅(時間・所要時間つきの行程)は廃止し、
//    ①Keepを地図上のピンとして表示 → タップで今日行く場所を選ぶ →
//    ②選んだ場所が「その日専用のマガジン」になる(横スクロールでめくれる
//    雑誌形式、各ページにGoogleマップと情報ソースへのリンク)という
//    体験に変更。
// 2. モデルプランの提案自体は残し、「さらっと／ゆったり／じっくり」と
//    いう時間を書かないゆるいリストとして再設計。選ぶと即座にその日の
//    マガジンになる。
// 3. 地図はこの環境に実際のGoogle Maps APIキーがないため、位置関係を
//    保ったスタイライズド(挿絵的)な地図で代替した。本実装では実際の
//    Google Maps JavaScript APIやPlaces Photosに差し替える。
// 4. デザインを「和風」から「洋雑誌的」に調整: 見出しフォントをShippori
//    Mincho(筆文字系)からZen Old Mincho(より中庸な明朝)に、タブの漢字
//    一字アイコンをlucideのアイコンに、数字表示にPlayfair Display
//    (欧文雑誌の定番セリフ)を採用。
// 5. この変更に伴い、候補(candidate)と棚(shelved)の区別が地図上では
//    意味を持たなくなったため、両者を同列に扱うよう簡略化した(以前
//    保留していた「先週・今週の境界をなくす」要望が自然に解消される)。
//    期限切れで自動的に退避させる処理も撤廃し、Keepは削除しない限り
//    ずっと地図に残り続ける。
// ==================================================================

const STORAGE_KEY = "qol-app-state-v1";
const DEFAULT_STATE = { wishes: [], keeps: [], briefs: {}, magazine: null, profile: { interests: [], currentFocus: "" }, records: { media: [] }, weekendMeta: { lastSeenBundleWeek: null }, goals: [], pendingReview: [], sources: [] };
const CHECKIN_INTERVAL_DAYS = 14; // 目標への「最近どうですか？」を投げかける間隔
const MILESTONE_INTERVAL_DAYS = 45; // 「できるようになったこと」を評価つきで振り返る間隔(1〜2ヶ月)
function ratingLabel(r) { return r === 1 ? "伸び悩み" : r === 2 ? "まずまず" : "大きく前進"; }

function mapsUrl(query) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`; }
function searchUrl(query) { return `https://www.google.com/search?q=${encodeURIComponent(query)}`; }
function img(seed, w = 400, h = 300) { return `https://picsum.photos/seed/${seed}/${w}/${h}`; }

// ---- データ層 ------------------------------------------------------
let memoryStore = null;
let memoryMode = typeof window === "undefined" || !window.storage;

function migrate(s) {
  if (s.wishes && s.keeps) {
    const merged = { ...structuredClone(DEFAULT_STATE), ...s };
    merged.magazine = merged.magazine ?? null;
    merged.profile = merged.profile ?? structuredClone(DEFAULT_STATE.profile);
    merged.records = merged.records ?? structuredClone(DEFAULT_STATE.records);
    // 旧形式(records.books)からの移行: 本のレコードをmedia配列(kind:"book")に統合する
    if (merged.records.books) {
      merged.records.media = [...(merged.records.media ?? []), ...merged.records.books.map((b) => ({ ...b, kind: "book", creator: b.author }))];
      delete merged.records.books;
    }
    merged.records.media = merged.records.media ?? [];
    merged.weekendMeta = merged.weekendMeta ?? structuredClone(DEFAULT_STATE.weekendMeta);
    merged.goals = merged.goals ?? [];
    merged.pendingReview = merged.pendingReview ?? [];
    merged.sources = merged.sources ?? [];
    return merged;
  }
  const v2 = { ...structuredClone(DEFAULT_STATE) };
  (s.wishlist ?? []).forEach((w) => {
    if (w.source === "daily-brief" || w.keptAt) {
      v2.keeps.push({
        id: w.id, title: w.title, category: w.category, area: w.area,
        status: w.status === "done" ? "done" : "candidate",
        keptAt: w.keptAt ?? w.addedAt,
      });
    } else {
      v2.wishes.push({
        id: w.id, title: w.title, category: w.category, categoryId: w.categoryId,
        status: w.status === "done" ? "fulfilled" : "stock",
        addedAt: w.addedAt, fulfilledAt: w.doneAt,
      });
    }
  });
  return v2;
}

const DataStore = {
  get mode() { return memoryMode ? "memory" : "persistent"; },
  async load() {
    if (memoryMode) return migrate(memoryStore ?? structuredClone(DEFAULT_STATE));
    try {
      const result = await window.storage.get(STORAGE_KEY);
      return migrate(result ? JSON.parse(result.value) : structuredClone(DEFAULT_STATE));
    } catch { return structuredClone(DEFAULT_STATE); }
  },
  async save(state) {
    memoryStore = state;
    if (memoryMode) return "memory";
    try {
      const r = await window.storage.set(STORAGE_KEY, JSON.stringify(state));
      if (!r) throw new Error("no result");
      return "persistent";
    } catch (e) {
      console.warn("永続化に失敗。メモリモードに切り替えます:", e);
      memoryMode = true;
      return "memory";
    }
  },
  async clear() {
    memoryStore = null;
    if (!memoryMode) { try { await window.storage.delete(STORAGE_KEY); } catch { /* noop */ } }
  },
};

// ---- 共通ヘルパー --------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayLabel() {
  const d = new Date();
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${days[d.getDay()]}`;
}
function shortDate(iso) { const d = new Date(iso); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; }
function daysBetween(iso) { return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); }
function haptic(ms = 10) { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms); }
// Keepの自動失効: 展覧会/ライブなどexpiresAt(会期末・予約締切)を持つものは
// それを過ぎたら、持たないものも一律30日を過ぎたら削除する。実行済み(done)は
// 記録として残すため対象外。
const KEEP_MAX_AGE_DAYS = 30;
function isExpiredKeep(k) {
  if (k.status === "done") return false;
  if (k.expiresAt) return new Date() > new Date(k.expiresAt);
  return daysBetween(k.keptAt) > KEEP_MAX_AGE_DAYS;
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
// おすすめプランは木曜日に更新される、という仕様のための「週キー」。
// 直近の木曜日の日付をキーにすることで、木曜日を跨ぐたびに自動で変わる。
function mostRecentThursday(d = new Date()) {
  const day = d.getDay();
  const diff = (day - 4 + 7) % 7;
  const thu = new Date(d);
  thu.setDate(d.getDate() - diff);
  thu.setHours(0, 0, 0, 0);
  return thu.toISOString().slice(0, 10);
}
const POSTER_PALETTE = ["#20304A", "#1A1A18", "#3E4A3A", "#A8552F", "#2B3FBF", "#5C3A21", "#3A4A4A", "#1F2937"];

const CATEGORIES = [
  { id: "do", label: "やりたい", en: "TO DO", color: "#20304A" },
  { id: "buy", label: "欲しい", en: "TO BUY", color: "#A8552F" },
  { id: "watch", label: "観たい", en: "TO WATCH", color: "#1A1A18" },
  { id: "go", label: "行きたい", en: "TO GO", color: "#3E4A3A" },
];
const catOf = (id) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];

// ---- 興味の自動検出（プロトタイプ: キーワード頻度。本実装ではGeminiに置換） --
const INTEREST_RULES = [
  { match: /カフェ|コーヒー|焙煎/, label: "カフェ巡り", categoryId: "do", kind: "hobby" },
  { match: /古着|ヴィンテージ/, label: "古着収集", categoryId: "buy", kind: "hobby" },
  { match: /映画|シネマ/, label: "映画鑑賞", categoryId: "watch", kind: "hobby" },
  { match: /展覧会|美術館|ギャラリー/, label: "アート鑑賞", categoryId: "watch", kind: "hobby" },
  { match: /建築/, label: "建築巡り", categoryId: "go", kind: "hobby" },
  { match: /陶芸|工芸|手仕事/, label: "ものづくり", categoryId: "do", kind: "hobby" },
  { match: /銭湯|温泉|サウナ/, label: "温泉・サウナ", categoryId: "go", kind: "hobby" },
  { match: /古書|本屋|書店/, label: "本屋巡り", categoryId: "go", kind: "hobby" },
  { match: /雑貨/, label: "雑貨集め", categoryId: "buy", kind: "hobby" },
  { match: /ボルダリング|クライミング|筋トレ|ヨガ|ランニング/, label: "運動習慣", categoryId: "do", kind: "hobby" },
];
const AUTO_THRESHOLD = 2;
function detectInterests(wishes, keeps) {
  const titles = [...wishes.map((w) => w.title), ...keeps.map((k) => k.title)];
  const results = [];
  INTEREST_RULES.forEach((rule) => {
    const count = titles.filter((t) => rule.match.test(t)).length;
    if (count >= AUTO_THRESHOLD) results.push({ id: `auto-${rule.label}`, label: rule.label, categoryId: rule.categoryId, kind: rule.kind, weight: count, source: "auto" });
  });
  return results;
}

// ---- 地図の座標（スタイライズド。実装ではGoogle Mapsの実座標に置換） ----
const AREA_COORDS = {
  "竹橋": { x: 46, y: 32 }, "神保町": { x: 42, y: 38 }, "日比谷": { x: 50, y: 50 },
  "谷根千": { x: 56, y: 18 }, "浅草橋": { x: 66, y: 38 }, "蔵前": { x: 70, y: 42 },
  "両国": { x: 74, y: 48 }, "清澄白河": { x: 68, y: 58 }, "高円寺": { x: 8, y: 44 },
};
const AREA_FALLBACK = { x: 50, y: 80 };
function pinPosition(item) {
  const base = AREA_COORDS[item.area] ?? AREA_FALLBACK;
  let h = 0;
  const id = item.id || "";
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const jx = ((h % 11) - 5) * 0.7;
  const jy = (((h >> 3) % 11) - 5) * 0.7;
  return { x: Math.min(95, Math.max(5, base.x + jx)), y: Math.min(92, Math.max(8, base.y + jy)) };
}

// ---- ブリーフのダミーデータ（8件・画像/情報ソース/地図色付き） --------
const CARDS = [
  { id: 1, glyph: "展", category: "ART & EXHIBITION", categoryJp: "展覧会", trigger: "タイムリー", area: "竹橋", color: "#20304A",
    title: "「建築と自然」展、今日から開幕",
    body: "願望リストの「安藤忠雄の建築を観る」に関連。国立近代美術館で本日より。会期は8月末まで、混雑は初週が最も少ない予測。",
    meta: ["国立近代美術館", "10:00 – 17:00", "¥1,800"], bg: "#20304A", fg: "#E8EDF5", accent: "#8FB4E8",
    images: ["momat-a", "momat-b", "momat-c"], sourceUrl: "https://www.momat.go.jp/", sourceLabel: "公式サイトを見る" },
  { id: 2, glyph: "映", category: "CINEMA", categoryJp: "映画", trigger: "タイムリー", area: "日比谷", color: "#1A1A18",
    title: "観たかったあの映画、公開初週",
    body: "リスト登録済みの『Perfect Days 2』が昨日公開。金曜夜のレイトショーなら、仕事帰りの動線上の劇場で21:10の回に間に合います。",
    meta: ["TOHOシネマズ 日比谷", "21:10 レイトショー", "¥1,500"], bg: "#1A1A18", fg: "#F2EFE8", accent: "#D9C87A",
    images: ["hibiya-a", "hibiya-b"], sourceUrl: "https://www.tohotheater.jp/", sourceLabel: "上映情報・チケットを見る" },
  { id: 3, glyph: "珈", category: "NEIGHBORHOOD", categoryJp: "近所の発見", trigger: "ロケーション", area: "蔵前", color: "#3E4A3A",
    title: "明日の予定の途中に、あの焙煎所",
    body: "土曜の外出ルートから徒歩4分。願望リストの「浅煎りの豆を買う」が達成できます。土曜は焼き菓子の入荷日でもあります。",
    meta: ["蔵前・COFFEE WRIGHTS", "9:00 – 18:00", "徒歩4分の寄り道"], bg: "#3E4A3A", fg: "#EEF0E8", accent: "#B8C87A",
    images: ["kuramae-a", "kuramae-b", "kuramae-c"], sourceUrl: mapsUrl("COFFEE WRIGHTS 蔵前"), sourceLabel: "地図で見る" },
  { id: 4, glyph: "貯", category: "FINANCE", categoryJp: "貯金の進捗", trigger: "フィナンシャル", area: "—", color: "#A8552F",
    title: "カメラ貯金、あと12%で目標達成",
    body: "先週末の予算余剰¥6,400を自動振り分け。現在の達成率88%。このペースなら7月中旬に「フィルムカメラ購入」に手が届きます。",
    meta: ["目標 ¥72,000", "現在 ¥63,400", "達成率 88%"], bg: "#F3EFE6", fg: "#1F1E1A", accent: "#A8552F",
    images: ["camera-a", "camera-b"], sourceUrl: mapsUrl("中古カメラ店 東京"), sourceLabel: "地図で見る" },
  { id: 5, glyph: "陶", category: "SERENDIPITY", categoryJp: "未知との遭遇", trigger: "セレンディピティ", area: "清澄白河", color: "#2B3FBF",
    title: "陶芸、はじめてみませんか",
    body: "あなたの「手を動かす趣味」への関心から一歩外へ。日曜午前の一日体験クラスに空きが2席。建築好きの参加者が多い教室です。",
    meta: ["清澄白河・陶房", "日曜 10:00 – 12:30", "体験 ¥4,500"], bg: "#2B3FBF", fg: "#F5F4EE", accent: "#F5F4EE", serendipity: true,
    images: ["pottery-a", "pottery-b", "pottery-c"], sourceUrl: searchUrl("清澄白河 陶芸体験 一日"), sourceLabel: "詳しく調べる" },
  { id: 6, glyph: "古", category: "VINTAGE", categoryJp: "古着", trigger: "ロケーション", area: "高円寺", color: "#5C3A21",
    title: "高円寺の一点物古着屋、新しい入荷情報",
    body: "願望リストの「古着でジャケットを探す」に近いお店。個人経営で入荷が読めない分、タイミングが合う今週末が狙い目です。",
    meta: ["高円寺北口エリア", "12:00 – 20:00", "現金のみ"], bg: "#5C3A21", fg: "#F2E8DA", accent: "#D9B98A",
    images: ["vintage-a", "vintage-b", "vintage-c"], sourceUrl: mapsUrl("高円寺 古着屋"), sourceLabel: "地図で見る" },
  { id: 7, glyph: "雑", category: "ZAKKA", categoryJp: "雑貨", trigger: "タイムリー", area: "谷根千", color: "#3A4A4A",
    title: "谷根千の小さな雑貨店、一年に一度の陶器市",
    body: "普段は棚に並びきらない作家ものの器が、期間限定で店先に広がります。年に一度なので、今週を逃すと来年までお預けです。",
    meta: ["谷中エリア", "11:00 – 17:00", "会期は今週末まで"], bg: "#3A4A4A", fg: "#EDF2F0", accent: "#9AC2BC",
    images: ["zakka-a", "zakka-b"], sourceUrl: mapsUrl("谷中 雑貨店"), sourceLabel: "地図で見る" },
  { id: 8, glyph: "登", category: "PHYSICAL", categoryJp: "身体", trigger: "ロケーション", area: "浅草橋", color: "#1F2937",
    title: "近所にできたボルダリングジム、初回体験無料",
    body: "願望リストの「筋力向上」に直結。浅草橋なら他のKeepとも動線を組みやすいエリアです。初回体験は道具レンタル込み。",
    meta: ["浅草橋駅から徒歩6分", "初回体験 無料", "予約制"], bg: "#1F2937", fg: "#E7ECF2", accent: "#7FA8D9",
    images: ["climb-a", "climb-b", "climb-c"], sourceUrl: mapsUrl("浅草橋 ボルダリングジム"), sourceLabel: "地図で見る" },
  // 本の提案は「行く場所」ではないため、KEEPすると地図ではなく記録タブの
  // メディアへ直接入る(mediaKind指定)。area/imagesは持たせず、地図には出さない。
  { id: 9, glyph: "本", category: "BOOK", categoryJp: "読書", trigger: "興味との一致", mediaKind: "book", color: "#4A3728",
    title: "積んでいた分野、今週読み切れる一冊",
    body: "最近の興味の傾向から、建築家の手による随筆集はいかがでしょう。新書サイズで通勤の隙間時間でも読み切れる分量です。",
    meta: ["新書・224ページ", "¥900前後"], bg: "#4A3728", fg: "#F2E8DA", accent: "#D9B98A",
    images: [], sourceUrl: searchUrl("建築家 エッセイ おすすめ 新書"), sourceLabel: "書店で探す" },
  // 登録サイト(例: Rate Your Music)から拾ってくるカードの例。ユーザーが
  // プロフィールで登録したサイトは情報源プールに優先的に加わり、そこから
  // ランダム性を持たせて評価の高いアルバムなどが提案される。
  { id: 10, glyph: "音", category: "MUSIC", categoryJp: "音楽", trigger: "登録サイトより", mediaKind: "album", color: "#2E2A3F",
    title: "評価の高い一枚、通勤で聴き切るアルバム",
    body: "登録サイトのチャートから、あなたの傾向に近いジャンルで高評価の一枚を。全42分、往復の通勤でちょうど聴き終わります。",
    meta: ["出典: rateyourmusic.com", "1971年 ・ 42分"], bg: "#2E2A3F", fg: "#EAE6F2", accent: "#B8A8E8",
    images: [], sourceUrl: "https://rateyourmusic.com/charts/", sourceLabel: "チャートで見る" },
];
const SWIPE_THRESHOLD = 90;

// ---- スタイル共通 ------------------------------------------------------
const SERIF = "'Zen Old Mincho', serif";
const SANS = "'Zen Kaku Gothic New', sans-serif";
const DISPLAY = "'Playfair Display', serif";
const INK = "#171715";
const PAPER = "#FBFAF7";
const BG = "#EFEDE6";
const BLUE = "#2B3FBF";
const RUST = "#A8552F";
const GREEN = "#3E4A3A";
const HAIRLINE = "rgba(23,23,21,0.08)";

function Masthead({ title, en, statValue, statLabel, dateline, right }) {
  return (
    <header style={{ padding: "16px 4px 12px", borderBottom: `2px solid ${INK}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, letterSpacing: "0.02em", lineHeight: 1 }}>{title}</div>
          <div style={{ fontSize: 9, letterSpacing: "0.28em", color: "#9A988E", marginTop: 5 }}>{en}</div>
        </div>
        {right ? right : (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 700, fontSize: 22, lineHeight: 1, color: INK }}>{statValue}</div>
            <div style={{ fontSize: 9, color: "#9A988E", letterSpacing: "0.08em", marginTop: 3 }}>{statLabel}</div>
          </div>
        )}
      </div>
      {dateline && <div style={{ fontSize: 10, color: "#9A988E", letterSpacing: "0.06em", marginTop: 8 }}>{dateline}</div>}
    </header>
  );
}
function Dot({ color, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 9, color, fontWeight: 700, letterSpacing: "0.05em" }}>{label}</span>
    </span>
  );
}
function rowBtn(bg, color, border) { return { background: bg, color, cursor: "pointer", border: `1px solid ${border ?? bg}`, borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", padding: "7px 12px", fontFamily: SANS }; }
function keepStatus(k) {
  if (k.status === "planned") return { label: "マガジン掲載中", color: BLUE };
  if (k.status === "done") return { label: "実行済み", color: "#9A988E" };
  return { label: "候補", color: GREEN };
}
function Thumb({ seed, onOpen, size = 44 }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onOpen(); }} style={{ padding: 0, border: "none", background: "none", cursor: "pointer", flexShrink: 0, borderRadius: 8, overflow: "hidden", width: size, height: size }}>
      <img src={img(seed, size * 2, size * 2)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </button>
  );
}
// 全オーバーレイ共通の下部シート。エントランス(下から滑り上がる)・ドラッグで
// 閉じる・背景タップで閉じる・閉じる際のスライドダウンを、すべて同じ動きで
// 統一する。children は "そのままの要素" か "requestClose を受け取る関数"
// のどちらでも良い(内部の確定ボタンなどからも同じ演出で閉じたい場合に使う)。
function BottomSheet({ onClose, children, maxHeight = "82vh" }) {
  const [dragY, setDragY] = useState(500);
  const dragRef = useRef({ startY: 0, active: false, base: 0 });

  useEffect(() => {
    const raf = requestAnimationFrame(() => setDragY(0));
    return () => cancelAnimationFrame(raf);
  }, []);

  const requestClose = () => {
    dragRef.current.active = false;
    setDragY(560);
    setTimeout(onClose, 220);
  };
  const onHandleDown = (e) => {
    dragRef.current = { startY: e.clientY, active: true, base: dragY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onHandleMove = (e) => {
    if (!dragRef.current.active) return;
    setDragY(Math.max(0, dragRef.current.base + (e.clientY - dragRef.current.startY)));
  };
  const onHandleUp = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    if (dragY > 90) requestClose();
    else setDragY(0);
  };

  return (
    <div onClick={requestClose} style={{ position: "fixed", inset: 0, zIndex: 45, background: "rgba(23,23,21,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 420, background: PAPER, borderRadius: "20px 20px 0 0", maxHeight,
        display: "flex", flexDirection: "column", overflow: "hidden",
        transform: `translateY(${dragY}px)`,
        transition: dragRef.current.active ? "none" : "transform 0.24s cubic-bezier(0.32,0.72,0,1)",
      }}>
        <div
          onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
          style={{ touchAction: "none", cursor: "grab", padding: "12px 0 6px", display: "flex", justifyContent: "center", flexShrink: 0 }}
        >
          <div style={{ width: 32, height: 4, borderRadius: 2, background: "rgba(23,23,21,0.15)" }} />
        </div>
        <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 20px", paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
          {typeof children === "function" ? children(requestClose) : children}
        </div>
      </div>
    </div>
  );
}

function BinderModal({ item, onClose, actionSlot }) {
  if (!item) return null;
  const rotations = [-7, 3, 9];

  return (
    <BottomSheet onClose={onClose} maxHeight="82vh">
      {(requestClose) => (
        <>
          <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#9A988E", marginBottom: 4 }}>{item.category ?? item.categoryJp}</div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16, marginBottom: actionSlot ? 12 : 16 }}>{item.title}</div>
          {actionSlot && <div style={{ marginBottom: 16 }}>{actionSlot(requestClose)}</div>}
          <div style={{ display: "flex", justifyContent: "center", padding: "4px 0 22px" }}>
            {(item.images ?? []).map((seed, i) => (
              <img key={seed} src={img(seed, 300, 380)} alt="" style={{ width: "32%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: 6, border: "4px solid #fff", boxShadow: "0 8px 20px rgba(23,23,21,0.3)", transform: `rotate(${rotations[i % 3]}deg)`, marginLeft: i === 0 ? 0 : -18, position: "relative", zIndex: i }} />
            ))}
          </div>
          {item.meta?.length > 0 && (
            <div style={{ borderTop: `1px solid ${HAIRLINE}`, borderBottom: `1px solid ${HAIRLINE}`, padding: "12px 2px", margin: "0 0 18px", display: "flex", flexDirection: "column", gap: 7 }}>
              {item.meta.map((m, i) => (
                <div key={i} style={{ fontSize: 12.5, color: "#4A4A44", fontFamily: SANS }}>{m}</div>
              ))}
            </div>
          )}
          {item.sourceUrl && (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", padding: "13px 0", background: INK, color: PAPER, borderRadius: 999, textDecoration: "none", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>
              {item.sourceLabel ?? "情報ソースを見る"} ↗
            </a>
          )}
        </>
      )}
    </BottomSheet>
  );
}

// ==================================================================
// タブ1: ブリーフ
// ==================================================================
function CardFace({ card, dx, isTop, onOpenBinder, checkinValue, onCheckinChange, milestoneText, onMilestoneTextChange, milestoneRating, onMilestoneRatingChange, flagged, onFlag }) {
  const keepOpacity = isTop ? Math.min(Math.max(dx / SWIPE_THRESHOLD, 0), 1) : 0;
  const skipOpacity = isTop ? Math.min(Math.max(-dx / SWIPE_THRESHOLD, 0), 1) : 0;
  const hasPhotos = card.images?.length > 0;

  if (card.type === "checkin") {
    return (
      <div style={{
        width: "100%", height: "100%", background: PAPER, borderRadius: 18, overflow: "hidden",
        display: "flex", flexDirection: "column", boxShadow: "0 10px 32px rgba(23,23,21,0.14)",
        border: `2px solid ${GREEN}`, position: "relative", userSelect: "none",
      }}>
        <div style={{ flex: "0 0 38%", background: GREEN, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: PAPER }}>
          <Sprout size={32} strokeWidth={1.5} />
          <span style={{ fontSize: 9, letterSpacing: "0.26em", opacity: 0.8 }}>CHECK-IN</span>
        </div>
        <div style={{ flex: 1, padding: "18px 20px 20px", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E", marginBottom: 8 }}>{card.goalTitle}</div>
          <h2 style={{ margin: "0 0 12px", fontFamily: SERIF, fontWeight: 700, fontSize: 18, lineHeight: 1.4, color: INK }}>最近は、どうですか？</h2>
          <textarea
            value={checkinValue}
            onChange={(e) => onCheckinChange(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="今取り組んでいることを、ひとことで"
            style={{ flex: 1, resize: "none", border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: 12, fontFamily: SANS, fontSize: 13, outline: "none", background: "#FAFAF6", color: INK }}
          />
        </div>
      </div>
    );
  }

  if (card.type === "milestone") {
    return (
      <div style={{
        width: "100%", height: "100%", background: PAPER, borderRadius: 18, overflow: "hidden",
        display: "flex", flexDirection: "column", boxShadow: "0 10px 32px rgba(23,23,21,0.14)",
        border: `2px solid ${RUST}`, position: "relative", userSelect: "none",
      }}>
        <div style={{ flex: "0 0 34%", background: RUST, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: PAPER }}>
          <Sprout size={30} strokeWidth={1.5} />
          <span style={{ fontSize: 9, letterSpacing: "0.26em", opacity: 0.85 }}>MILESTONE</span>
        </div>
        <div style={{ flex: 1, padding: "16px 20px 20px", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E", marginBottom: 8 }}>{card.goalTitle}</div>
          <h2 style={{ margin: "0 0 10px", fontFamily: SERIF, fontWeight: 700, fontSize: 17, lineHeight: 1.4, color: INK }}>できるようになったこと、ありますか？</h2>
          <textarea
            value={milestoneText}
            onChange={(e) => onMilestoneTextChange(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="この1〜2ヶ月で、できるようになったこと"
            style={{ flex: 1, resize: "none", border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: 12, fontFamily: SANS, fontSize: 13, outline: "none", background: "#FAFAF6", color: INK, marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 6 }} onPointerDown={(e) => e.stopPropagation()}>
            {[1, 2, 3].map((r) => (
              <button key={r} onClick={() => onMilestoneRatingChange(r)} style={{
                flex: 1, padding: "9px 4px", borderRadius: 10, cursor: "pointer", fontFamily: SANS, fontSize: 10.5, fontWeight: 700,
                background: milestoneRating === r ? RUST : "transparent", color: milestoneRating === r ? PAPER : "#5A5A54",
                border: `1.5px solid ${milestoneRating === r ? RUST : "rgba(23,23,21,0.2)"}`,
              }}>{ratingLabel(r)}</button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: "100%", height: "100%", background: PAPER, borderRadius: 18, overflow: "hidden",
      display: "flex", flexDirection: "column", boxShadow: "0 10px 32px rgba(23,23,21,0.14)",
      border: card.serendipity ? `2px solid ${BLUE}` : "1px solid rgba(23,23,21,0.06)", position: "relative", userSelect: "none",
    }}>
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => isTop && onOpenBinder && onOpenBinder()}
        style={{ flex: "0 0 52%", position: "relative", overflow: "hidden", background: card.bg, cursor: isTop && hasPhotos ? "pointer" : "default" }}
      >
        {hasPhotos ? (
          <img src={img(card.images[0], 500, 400)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span aria-hidden style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "min(42vw, 170px)", lineHeight: 1, color: card.fg, opacity: 0.92 }}>{card.glyph}</span>
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0) 40%, rgba(0,0,0,0.22) 100%)", pointerEvents: "none" }} />
        {card.serendipity && (
          <span style={{ position: "absolute", left: 0, bottom: 12, background: BLUE, color: PAPER, fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", padding: "5px 14px 5px 18px" }}>セレンディピティ枠</span>
        )}
        {isTop && hasPhotos && (
          <span style={{
            position: "absolute", bottom: 12, right: 14, display: "flex", alignItems: "center", gap: 5,
            background: "rgba(23,23,21,0.5)", color: "#fff", borderRadius: 999, padding: "5px 11px 5px 9px",
            fontSize: 10, fontFamily: SANS, fontWeight: 700, pointerEvents: "none",
          }}>写真 {card.images.length} を見る ⤢</span>
        )}
      </div>
      <div style={{ flex: 1, padding: "16px 20px 18px", display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 8 }}><Dot color={card.serendipity ? BLUE : "#5A5A54"} label={`${card.category} ・ ${card.trigger}`} /></div>
        <h2 style={{ margin: "0 0 7px", fontFamily: SERIF, fontWeight: 700, fontSize: 19, lineHeight: 1.35, color: INK }}>{card.title}</h2>
        <p style={{ margin: 0, flex: 1, fontFamily: SANS, fontSize: 12.5, lineHeight: 1.7, color: "#4A4A44" }}>{card.body}</p>
        {isTop && onFlag && (
          <button
            onClick={(e) => { e.stopPropagation(); onFlag(); }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="この情報の質をフィードバック"
            style={{ position: "absolute", bottom: 12, right: 14, background: "none", border: "none", cursor: "pointer", padding: 6, lineHeight: 0 }}
          >
            <Flag size={13} strokeWidth={2} color={flagged ? RUST : "#C8C6BC"} fill={flagged ? RUST : "none"} />
          </button>
        )}
      </div>
      <div style={{ position: "absolute", top: 20, left: 18, transform: "rotate(-12deg)", opacity: keepOpacity, border: `3px solid ${BLUE}`, color: BLUE, fontFamily: SANS, fontWeight: 700, fontSize: 24, letterSpacing: "0.15em", padding: "3px 12px", borderRadius: 6, background: "rgba(251,250,247,0.85)", pointerEvents: "none" }}>KEEP</div>
      <div style={{ position: "absolute", top: 20, right: 18, transform: "rotate(12deg)", opacity: skipOpacity, border: "3px solid #8A8A82", color: "#8A8A82", fontFamily: SANS, fontWeight: 700, fontSize: 24, letterSpacing: "0.15em", padding: "3px 12px", borderRadius: 6, background: "rgba(251,250,247,0.85)", pointerEvents: "none" }}>SKIP</div>
    </div>
  );
}

function BriefTab({ appState, persist, goTab, showToast }) {
  const [drag, setDrag] = useState({ dx: 0, dy: 0, active: false });
  const [exit, setExit] = useState(null);
  const [binderItem, setBinderItem] = useState(null);
  const [checkinAnswer, setCheckinAnswer] = useState("");
  const [milestoneText, setMilestoneText] = useState("");
  const [milestoneRating, setMilestoneRating] = useState(null);
  const startRef = useRef({ x: 0, y: 0 });

  const dateKey = todayKey();
  // ブリーフは1日2回更新される: 正午を境に「朝刊」と「夕刊」。
  // エディションごとに独立したキーを持つため、午後になるとデッキが再び届く。
  const edition = new Date().getHours() < 12 ? "am" : "pm";
  const editionKey = `${dateKey}-${edition}`;
  const editionLabel = edition === "am" ? "朝刊" : "夕刊";
  const decisions = appState.briefs?.[editionKey]?.decisions ?? {};
  const feedback = appState.briefs?.[editionKey]?.feedback ?? {};

  // カードの質が低かったときの控えめなフィードバック。本実装では
  // このカードを生成した情報源(source)のスコアを下げる材料になる。
  const toggleFlag = (cardId) => {
    haptic(6);
    const next = structuredClone(appState);
    const brief = next.briefs[editionKey] ?? { decisions: {} };
    brief.feedback = brief.feedback ?? {};
    brief.feedback[cardId] = !brief.feedback[cardId];
    next.briefs[editionKey] = brief;
    persist(next);
    if (brief.feedback[cardId]) showToast("フィードバックを記録しました");
  };

  // 目標には2種類の「育成カード」が届く: 軽い問いかけ(checkin, 14日毎)と、
  // 評価つきの振り返り(milestone, 45日毎)。同じ日に何件も届くと煩わしいので、
  // 全目標×両方の種類の中から「間隔に対してもっとも待たせている1件」だけを選ぶ。
  const dueCandidate = useMemo(() => {
    const goals = appState.goals ?? [];
    const candidates = [];
    goals.forEach((g) => {
      const sinceCheckin = daysBetween(g.checkIns?.[0]?.at ?? g.addedAt);
      const lastMilestoneAt = g.checkIns?.find((ci) => ci.kind === "milestone")?.at ?? g.addedAt;
      const sinceMilestone = daysBetween(lastMilestoneAt);
      if (sinceCheckin >= CHECKIN_INTERVAL_DAYS) candidates.push({ g, kind: "checkin", urgency: sinceCheckin / CHECKIN_INTERVAL_DAYS });
      if (sinceMilestone >= MILESTONE_INTERVAL_DAYS) candidates.push({ g, kind: "milestone", urgency: sinceMilestone / MILESTONE_INTERVAL_DAYS });
    });
    candidates.sort((a, b) => b.urgency - a.urgency);
    return candidates[0] ?? null;
  }, [appState.goals]);

  const deck = useMemo(() => {
    const base = [...CARDS];
    if (dueCandidate) {
      const { g, kind } = dueCandidate;
      base.splice(3, 0, { id: `${kind}-${g.id}`, type: kind, goalId: g.id, goalTitle: g.title });
    }
    return base;
  }, [dueCandidate]);

  const index = deck.filter((c) => decisions[c.id]).length;
  const done = index >= deck.length;
  const keptCards = deck.filter((c) => decisions[c.id] === "keep");
  const currentCard = deck[index];
  const isCheckin = currentCard?.type === "checkin";
  const isMilestone = currentCard?.type === "milestone";
  const isGrowthCard = isCheckin || isMilestone;
  const canRecord = isCheckin ? !!checkinAnswer.trim() : isMilestone ? !!(milestoneText.trim() && milestoneRating) : true;

  const commit = (dir) => {
    if (done || exit) return;
    const card = deck[index];
    haptic(dir === "keep" ? 18 : 8);
    setExit(dir);
    setTimeout(() => {
      const next = structuredClone(appState);
      const brief = next.briefs[editionKey] ?? { decisions: {} };

      if (card.type === "checkin" || card.type === "milestone") {
        brief.decisions[card.id] = dir === "keep" ? "answered" : "skipped";
        if (dir === "keep") {
          const g = (next.goals ?? []).find((x) => x.id === card.goalId);
          if (g) {
            g.checkIns = g.checkIns ?? [];
            if (card.type === "checkin" && checkinAnswer.trim()) {
              g.checkIns.unshift({ id: `ci-${Date.now()}`, at: new Date().toISOString(), text: checkinAnswer.trim(), source: "prompted" });
            } else if (card.type === "milestone" && milestoneText.trim() && milestoneRating) {
              g.checkIns.unshift({ id: `ci-${Date.now()}`, at: new Date().toISOString(), text: milestoneText.trim(), rating: milestoneRating, kind: "milestone", source: "prompted" });
            }
          }
        }
      } else {
        brief.decisions[card.id] = dir;
        if (dir === "keep") {
          if (card.mediaKind) {
            next.records = next.records ?? { media: [] };
            next.records.media.unshift({
              id: `media-${editionKey}-${card.id}`, kind: card.mediaKind, title: card.title, creator: "",
              addedAt: new Date().toISOString(), color: card.color, sourceUrl: card.sourceUrl, sourceLabel: card.sourceLabel,
            });
          } else {
            next.keeps.push({
              id: `brief-${editionKey}-${card.id}`, title: card.title, category: card.categoryJp, area: card.area,
              images: card.images, meta: card.meta, sourceUrl: card.sourceUrl, sourceLabel: card.sourceLabel, color: card.color,
              status: "candidate", keptAt: new Date().toISOString(),
            });
          }
        }
      }

      if (Object.keys(brief.decisions).length >= deck.length) brief.completedAt = new Date().toISOString();
      next.briefs[editionKey] = brief;
      setExit(null);
      setDrag({ dx: 0, dy: 0, active: false });
      setCheckinAnswer("");
      setMilestoneText("");
      setMilestoneRating(null);
      persist(next);
    }, 320);
  };

  const onPointerDown = (e) => {
    if (exit || done || isGrowthCard) return; // 育成カードはテキスト入力と衝突するためドラッグ無効
    startRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ dx: 0, dy: 0, active: true });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.active || exit) return;
    setDrag({ dx: e.clientX - startRef.current.x, dy: (e.clientY - startRef.current.y) * 0.25, active: true });
  };
  const onPointerUp = () => {
    if (!drag.active || exit) return;
    if (drag.dx > SWIPE_THRESHOLD) commit("keep");
    else if (drag.dx < -SWIPE_THRESHOLD) commit("skip");
    else setDrag({ dx: 0, dy: 0, active: false });
  };

  const exitX = exit === "keep" ? window.innerWidth * 1.2 : exit === "skip" ? -window.innerWidth * 1.2 : 0;
  const topTransform = exit
    ? `translate(${exitX}px, ${drag.dy - 40}px) rotate(${exit === "keep" ? 22 : -22}deg)`
    : `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx * 0.06}deg)`;
  const topTransition = exit ? "transform 0.32s cubic-bezier(0.32,0.72,0,1)" : drag.active ? "none" : "transform 0.28s cubic-bezier(0.32,0.72,0,1)";

  return (
    <>
      <Masthead title="デイリーブリーフ" en="DAILY BRIEF" statValue={done ? keptCards.length : index + 1} statLabel={done ? "件Keep" : `／ ${deck.length} 件目`} dateline={`${todayLabel()} ・ ${editionLabel}`} />
      <div style={{ display: "flex", gap: 4, padding: "12px 4px 4px" }}>
        {deck.map((c, i) => (
          <span key={c.id} style={{ flex: 1, height: 3, borderRadius: 2, background: decisions[c.id] === "keep" || decisions[c.id] === "answered" ? (c.type === "checkin" || c.type === "milestone" ? GREEN : BLUE) : decisions[c.id] ? "#D8D6CC" : i === index && !done ? INK : "rgba(23,23,21,0.1)", transition: "background 0.3s" }} />
        ))}
      </div>

      {!done ? (
        <>
          <main style={{ flex: 1, position: "relative", margin: "14px 0 10px", minHeight: 420 }}>
            {index + 1 < deck.length && (
              <div key={`peek-${deck[index + 1].id}`} style={{ position: "absolute", inset: 0, transform: `scale(${0.95 + Math.min(Math.abs(drag.dx) / SWIPE_THRESHOLD, 1) * 0.05}) translateY(8px)`, transition: drag.active ? "none" : "transform 0.28s" }}>
                <CardFace key={deck[index + 1].id} card={deck[index + 1]} dx={0} isTop={false} checkinValue="" onCheckinChange={() => {}} milestoneText="" onMilestoneTextChange={() => {}} milestoneRating={null} onMilestoneRatingChange={() => {}} />
              </div>
            )}
            <div key={`top-${deck[index].id}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
              style={{ position: "absolute", inset: 0, transform: topTransform, transition: topTransition, touchAction: isGrowthCard ? "auto" : "none", cursor: isGrowthCard ? "default" : drag.active ? "grabbing" : "grab" }}>
              <CardFace key={deck[index].id} card={deck[index]} dx={drag.dx} isTop onOpenBinder={() => setBinderItem(deck[index])} checkinValue={checkinAnswer} onCheckinChange={setCheckinAnswer} milestoneText={milestoneText} onMilestoneTextChange={setMilestoneText} milestoneRating={milestoneRating} onMilestoneRatingChange={setMilestoneRating} flagged={!!feedback[deck[index].id]} onFlag={() => toggleFlag(deck[index].id)} />
            </div>
          </main>
          <footer style={{ paddingBottom: 8 }}>
            {isGrowthCard ? (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => commit("skip")} style={{ flex: 1, padding: "13px 0", background: "transparent", border: "1.5px solid rgba(23,23,21,0.3)", borderRadius: 999, fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: "#5A5A54", cursor: "pointer" }}>あとで</button>
                <button onClick={() => commit("keep")} disabled={!canRecord} style={{ flex: 1.4, padding: "13px 0", background: isMilestone ? RUST : GREEN, border: "none", borderRadius: 999, fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: PAPER, cursor: canRecord ? "pointer" : "default", opacity: canRecord ? 1 : 0.4 }}>記録する</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => commit("skip")} style={{ flex: 1, padding: "13px 0", background: "transparent", border: "1.5px solid rgba(23,23,21,0.3)", borderRadius: 999, fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", color: "#5A5A54", cursor: "pointer" }}>SKIP</button>
                <button onClick={() => commit("keep")} style={{ flex: 1.4, padding: "13px 0", background: INK, border: "none", borderRadius: 999, fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", color: PAPER, cursor: "pointer" }}>KEEP</button>
              </div>
            )}
          </footer>
        </>
      ) : (
        <main style={{ flex: 1, padding: "28px 4px" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.28em", color: "#9A988E" }}>END OF ISSUE</div>
          <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 26, lineHeight: 1.4, margin: "10px 0 20px" }}>{editionLabel}は、<br />ここまで。</h2>
          <p style={{ fontSize: 11.5, color: "#9A988E", lineHeight: 1.8, margin: "0 0 20px" }}>{edition === "am" ? "夕刊は、正午にお届けします。" : "明日の朝刊で、また。"}</p>
          {keptCards.map((c, i) => (
            <div key={c.id} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "12px 2px", borderTop: `1px solid ${HAIRLINE}` }}>
              <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 700, fontSize: 17, color: BLUE, minWidth: 28 }}>{String(i + 1).padStart(2, "0")}</span>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 14 }}>{c.title}</div>
            </div>
          ))}
          <button onClick={() => goTab("weekend")} style={{ marginTop: 22, width: "100%", padding: "13px 0", background: INK, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: PAPER }}>
            週末タブで地図を見る
          </button>
        </main>
      )}
      <BinderModal item={binderItem} onClose={() => setBinderItem(null)} />
    </>
  );
}

// ==================================================================
// タブ2: 願望
// ==================================================================
// 目標: ギターや読書のような終わりのない自己研鑽のための場所。
// タグ付き入力を持つ願望とは意図的に切り離し、タイトルだけの単純な入力にする。
// AIによる分類・分解は一切行わない。ブリーフの問いかけに答える、または
// 自分で書き足す、という2つの方法で同じ記録ログに積み上がっていく。
function GoalsTab({ appState, persist }) {
  const [title, setTitle] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [manualDraft, setManualDraft] = useState({});

  const goals = (appState.goals ?? []).slice().sort((a, b) => {
    const la = a.checkIns?.[0]?.at ?? a.addedAt;
    const lb = b.checkIns?.[0]?.at ?? b.addedAt;
    return new Date(lb) - new Date(la);
  });

  const addGoal = () => {
    if (!title.trim()) return;
    haptic();
    const next = structuredClone(appState);
    next.goals = next.goals ?? [];
    next.goals.push({ id: `goal-${Date.now()}`, title: title.trim(), addedAt: new Date().toISOString(), checkIns: [] });
    persist(next);
    setTitle("");
  };
  const removeGoal = (id) => {
    const next = structuredClone(appState);
    next.goals = next.goals.filter((g) => g.id !== id);
    persist(next);
  };
  const addManualCheckIn = (goalId) => {
    const text = (manualDraft[goalId] ?? "").trim();
    if (!text) return;
    haptic();
    const next = structuredClone(appState);
    const g = next.goals.find((x) => x.id === goalId);
    g.checkIns = g.checkIns ?? [];
    g.checkIns.unshift({ id: `ci-${Date.now()}`, at: new Date().toISOString(), text, source: "manual" });
    persist(next);
    setManualDraft((d) => ({ ...d, [goalId]: "" }));
  };

  return (
    <>
      <Masthead title="目標" en="LONG-TERM GOALS" statValue={goals.length} statLabel="件の目標" />
      <main style={{ flex: 1, paddingTop: 18, paddingBottom: 150 }}>
        <p style={{ fontSize: 11.5, color: "#9A988E", lineHeight: 1.8, margin: "0 0 18px" }}>
          ギターや読書のように、終わりのない自己研鑽のための場所です。ブリーフでときどき「最近どうですか？」と聞かれるので、答えるだけで記録が積み上がります。もちろん、自分からいつでも書き足せます。
        </p>
        {goals.length === 0 ? (
          <div style={{ padding: "30px 4px", textAlign: "center" }}>
            <div style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700 }}>まだ目標がありません。</div>
          </div>
        ) : goals.map((g, i) => {
          const latest = g.checkIns?.[0];
          const expanded = expandedId === g.id;
          return (
            <div key={g.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}`, padding: "14px 2px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 15 }}>{g.title}</div>
                <button onClick={() => removeGoal(g.id)} style={{ background: "none", border: "none", color: "#9A988E", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>削除</button>
              </div>
              <p style={{ fontSize: 12.5, color: latest ? "#4A4A44" : "#9A988E", lineHeight: 1.7, margin: "8px 0 0", fontStyle: latest ? "normal" : "italic" }}>
                {latest ? latest.text : "まだ記録がありません。"}
              </p>
              {latest && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 9.5, color: "#9A988E" }}>{shortDate(latest.at)}</span>
                  {latest.kind === "milestone" && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.05em", color: PAPER, background: RUST, borderRadius: 999, padding: "2px 7px" }}>{ratingLabel(latest.rating)}</span>}
                </div>
              )}

              <button onClick={() => setExpandedId(expanded ? null : g.id)} style={{ ...rowBtn("transparent", "#5A5A54", "rgba(23,23,21,0.2)"), marginTop: 10, display: "inline-flex", alignItems: "center", gap: 5 }}>
                これまでの記録（{g.checkIns?.length ?? 0}）
                <ChevronDown size={12} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </button>

              {expanded && (
                <div style={{ marginTop: 12 }}>
                  {(g.checkIns ?? []).length === 0 ? (
                    <p style={{ fontSize: 11.5, color: "#9A988E" }}>まだ記録がありません。</p>
                  ) : g.checkIns.map((ci) => (
                    <div key={ci.id} style={{ padding: "8px 0", borderTop: `1px solid ${HAIRLINE}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 9.5, color: "#9A988E" }}>{shortDate(ci.at)}{ci.source === "prompted" && " ・ ブリーフより"}</span>
                        {ci.kind === "milestone" && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.05em", color: PAPER, background: RUST, borderRadius: 999, padding: "2px 7px" }}>{ratingLabel(ci.rating)}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#4A4A44", lineHeight: 1.6 }}>{ci.text}</div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <input value={manualDraft[g.id] ?? ""} onChange={(e) => setManualDraft((d) => ({ ...d, [g.id]: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addManualCheckIn(g.id)}
                      placeholder="今の様子を書き足す" style={{ flex: 1, border: "none", borderBottom: `1px solid ${INK}`, background: "transparent", fontFamily: SANS, fontSize: 12.5, padding: "6px 2px", outline: "none" }} />
                    <button onClick={() => addManualCheckIn(g.id)} style={rowBtn(INK, PAPER)}>記録</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </main>

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 60, zIndex: 20, display: "flex", justifyContent: "center", background: `linear-gradient(to top, ${BG} 75%, rgba(239,237,230,0))`, paddingTop: 16 }}>
        <div style={{ width: "100%", maxWidth: 420, padding: "0 16px 10px" }}>
          <div style={{ display: "flex", gap: 8, background: PAPER, border: `1.5px solid ${INK}`, borderRadius: 999, padding: "4px 4px 4px 18px", boxShadow: "0 6px 20px rgba(23,23,21,0.1)" }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addGoal()} placeholder="ギター、読書、筋トレ…終わりのない目標を"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: SANS, fontSize: 13, minWidth: 0 }} />
            <button onClick={addGoal} style={{ background: INK, color: PAPER, border: "none", borderRadius: 999, padding: "10px 18px", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>追加</button>
          </div>
        </div>
      </div>
    </>
  );
}

function WishTab({ appState, persist, showToast }) {
  const [filter, setFilter] = useState("all");
  const [input, setInput] = useState("");
  const [inputCat, setInputCat] = useState("do");
  const [selectedId, setSelectedId] = useState(null);
  const [addingUrl, setAddingUrl] = useState(false);

  const addWish = () => {
    if (!input.trim()) return;
    haptic();
    const next = structuredClone(appState);
    next.wishes.unshift({ id: `wish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: input.trim(), category: catOf(inputCat).label, categoryId: inputCat, status: "stock", addedAt: new Date().toISOString() });
    persist(next);
    showToast("願望をストックしました");
    setInput("");
  };
  const updateWish = (id, patch) => { const next = structuredClone(appState); const w = next.wishes.find((x) => x.id === id); if (w) Object.assign(w, patch); persist(next); setSelectedId(null); };
  const removeWish = (id) => { const next = structuredClone(appState); next.wishes = next.wishes.filter((x) => x.id !== id); persist(next); setSelectedId(null); };
  const addPlaceFromUrl = (data) => {
    haptic(14);
    const next = structuredClone(appState);
    const seed = `url-${Date.now()}`;
    next.keeps.push({
      id: `manual-${Date.now()}`, title: data.title, category: data.category, area: data.area || undefined,
      status: "candidate", keptAt: new Date().toISOString(),
      images: [seed], color: POSTER_PALETTE[hashStr(data.title) % POSTER_PALETTE.length],
      sourceUrl: data.sourceUrl, sourceLabel: data.sourceLabel,
    });
    persist(next);
    showToast("週末の地図に追加しました");
  };

  const stock = appState.wishes.filter((w) => w.status === "stock" && (filter === "all" || (w.categoryId ?? "do") === filter));

  return (
    <>
      <Masthead title="願望" en="WISHES" statValue={stock.length} statLabel="件ストック中" />
      <nav style={{ display: "flex", gap: 6, padding: "14px 0 4px", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {[{ id: "all", label: "すべて" }, ...CATEGORIES].map((c) => (
          <button key={c.id} onClick={() => setFilter(c.id)} style={{ flexShrink: 0, padding: "6px 13px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, background: filter === c.id ? INK : "transparent", color: filter === c.id ? PAPER : "#5A5A54", border: filter === c.id ? `1.5px solid ${INK}` : "1.5px solid rgba(23,23,21,0.2)" }}>{c.label}</button>
        ))}
      </nav>
      <button onClick={() => setAddingUrl(true)} style={{ margin: "10px 0 4px", width: "100%", padding: "10px 0", background: "transparent", border: "1.5px dashed rgba(23,23,21,0.3)", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#5A5A54" }}>＋ URLから行きたい場所を追加</button>
      <main style={{ flex: 1, paddingTop: 8, paddingBottom: 150 }}>
        {stock.length === 0 ? (
          <div style={{ padding: "40px 4px", textAlign: "center" }}>
            <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>まだ何もありません。</div>
            <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>ふと思った願望を、大小問わず。</p>
          </div>
        ) : stock.map((w, i) => {
          const cat = catOf(w.categoryId ?? "do");
          const isSel = selectedId === w.id;
          return (
            <div key={w.id}>
              <div onClick={() => setSelectedId(isSel ? null : w.id)} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "12px 2px", cursor: "pointer", borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}` }}>
                <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 700, fontSize: 15, color: cat.color, minWidth: 26, textAlign: "right" }}>{String(i + 1).padStart(2, "0")}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 14.5, lineHeight: 1.5 }}>{w.title}</div>
                  <div style={{ marginTop: 4 }}><Dot color={cat.color} label={`${cat.label} ・ ${shortDate(w.addedAt)}`} /></div>
                </div>
              </div>
              {isSel && (
                <div style={{ display: "flex", gap: 8, padding: "2px 2px 12px 38px" }}>
                  <button onClick={() => updateWish(w.id, { status: "fulfilled", fulfilledAt: new Date().toISOString() })} style={rowBtn(INK, PAPER)}>叶えた！</button>
                  <button onClick={() => removeWish(w.id)} style={rowBtn("transparent", RUST, "rgba(168,85,47,0.4)")}>削除</button>
                </div>
              )}
            </div>
          );
        })}
      </main>
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 60, zIndex: 20, display: "flex", justifyContent: "center", background: `linear-gradient(to top, ${BG} 75%, rgba(239,237,230,0))`, paddingTop: 16 }}>
        <div style={{ width: "100%", maxWidth: 420, padding: "0 16px 10px" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            {CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => setInputCat(c.id)} style={{ flexShrink: 0, fontSize: 10, padding: "4px 10px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontWeight: 700, background: inputCat === c.id ? c.color : "transparent", color: inputCat === c.id ? PAPER : "#7A7A72", border: `1px solid ${inputCat === c.id ? c.color : "rgba(23,23,21,0.2)"}` }}>{c.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, background: PAPER, border: `1.5px solid ${INK}`, borderRadius: 999, padding: "4px 4px 4px 18px", boxShadow: "0 6px 20px rgba(23,23,21,0.1)" }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addWish()} placeholder="ふと思った願望を、なんでも" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: SANS, fontSize: 13, color: INK, minWidth: 0 }} />
            <button onClick={addWish} style={{ background: INK, color: PAPER, border: "none", borderRadius: 999, padding: "10px 18px", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>追加</button>
          </div>
        </div>
      </div>
      {addingUrl && <AddPlaceSheet onAdd={addPlaceFromUrl} onClose={() => setAddingUrl(false)} />}
    </>
  );
}

// ==================================================================
// タブ3: プロフィール
// ==================================================================
function ProfileTab({ appState, persist, onClose }) {
  const [editingFocus, setEditingFocus] = useState(false);
  const [focusDraft, setFocusDraft] = useState(appState.profile?.currentFocus ?? "");
  const [srcInput, setSrcInput] = useState("");

  const interests = appState.profile?.interests ?? [];
  const sources = appState.sources ?? [];
  const weightSize = (w) => Math.min(11 + w * 1.4, 16);

  const saveFocus = () => {
    const next = structuredClone(appState);
    next.profile = next.profile ?? { interests: [], currentFocus: "" };
    next.profile.currentFocus = focusDraft.trim();
    persist(next);
    setEditingFocus(false);
  };
  const addSource = () => {
    const url = srcInput.trim();
    if (!/^https?:\/\//.test(url)) return;
    haptic();
    let label = url;
    try { label = new URL(url).hostname.replace(/^www\./, ""); } catch { /* そのまま */ }
    const next = structuredClone(appState);
    next.sources = next.sources ?? [];
    next.sources.unshift({ id: `src-${Date.now()}`, url, label, addedAt: new Date().toISOString() });
    persist(next);
    setSrcInput("");
  };
  const removeSource = (id) => {
    const next = structuredClone(appState);
    next.sources = next.sources.filter((s) => s.id !== id);
    persist(next);
  };

  return (
    <>
      <header style={{ padding: "16px 4px 12px", borderBottom: `2px solid ${INK}`, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: INK, padding: 0, lineHeight: 1 }} aria-label="閉じる">←</button>
        <div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 20, letterSpacing: "0.02em", lineHeight: 1 }}>プロフィール</div>
          <div style={{ fontSize: 9, letterSpacing: "0.26em", color: "#9A988E", marginTop: 4 }}>ABOUT YOU</div>
        </div>
      </header>

      <section style={{ paddingTop: 20 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 8 }}>今、気になっていること</div>
        {editingFocus ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input autoFocus value={focusDraft} onChange={(e) => setFocusDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveFocus()}
              style={{ flex: 1, border: "none", borderBottom: `1.5px solid ${INK}`, background: "transparent", fontFamily: SERIF, fontSize: 16, padding: "4px 2px", outline: "none" }} />
            <button onClick={saveFocus} style={rowBtn(INK, PAPER)}>保存</button>
          </div>
        ) : (
          <div onClick={() => { setFocusDraft(appState.profile?.currentFocus ?? ""); setEditingFocus(true); }} style={{
            fontFamily: SERIF, fontSize: 17, lineHeight: 1.6, color: appState.profile?.currentFocus ? INK : "#9A988E", cursor: "pointer",
            borderBottom: "1px dashed rgba(23,23,21,0.25)", paddingBottom: 10,
          }}>
            {appState.profile?.currentFocus || "タップして入力（例: 最近は器に興味がある）"}
          </div>
        )}
      </section>

      <section style={{ paddingTop: 26, paddingBottom: 24 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 10 }}>興味・好み</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {interests.length === 0 ? (
            <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>まだ何もありません。願望やKeepが増えると、自動でここに見つかっていきます。</p>
          ) : interests.map((item) => {
            const cat = catOf(item.categoryId);
            return (
              <span key={item.id} style={{ display: "inline-flex", alignItems: "center", padding: "7px 12px", borderRadius: 999, background: cat.color, color: PAPER, fontFamily: SANS, fontWeight: 700, fontSize: weightSize(item.weight) }}>
                {item.label}
              </span>
            );
          })}
        </div>
        <p style={{ fontSize: 10, color: "#9A988E", marginTop: 12, lineHeight: 1.7 }}>
          願望やKeepの傾向から、意識しなくても自動で見つかっていきます。
        </p>
      </section>

      <section style={{ paddingTop: 6, paddingBottom: 28 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 10 }}>お気に入りの情報源</div>
        <p style={{ fontSize: 10, color: "#9A988E", lineHeight: 1.7, margin: "0 0 12px" }}>
          信頼しているサイト(例: rateyourmusic.com)を登録すると、ブリーフの情報源として優先的に巡回され、そこからカードが届くようになります。
        </p>
        {sources.map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderTop: i === 0 ? `1px solid ${HAIRLINE}` : `1px solid ${HAIRLINE}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</div>
              <div style={{ fontSize: 9.5, color: "#9A988E", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.url}</div>
            </div>
            <button onClick={() => removeSource(s.id)} style={{ background: "none", border: "none", color: "#9A988E", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>削除</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input value={srcInput} onChange={(e) => setSrcInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSource()}
            placeholder="https:// から始まるURLを貼り付け" style={{ flex: 1, border: "none", borderBottom: `1px solid ${INK}`, background: "transparent", fontFamily: SANS, fontSize: 12.5, padding: "6px 2px", outline: "none", minWidth: 0 }} />
          <button onClick={addSource} style={rowBtn(INK, PAPER)}>登録</button>
        </div>
      </section>
    </>
  );
}

// ==================================================================
// タブ4: 週末 ── 地図 / マガジン / すべて
// ==================================================================
function MapCanvas({ items, selectedIds, onOpenPin }) {
  return (
    <div style={{
      position: "relative", width: "100%", aspectRatio: "4 / 3", borderRadius: 16, overflow: "hidden",
      background: "#F1EEE5",
      backgroundImage: "repeating-linear-gradient(0deg, rgba(23,23,21,0.05) 0, rgba(23,23,21,0.05) 1px, transparent 1px, transparent 32px), repeating-linear-gradient(90deg, rgba(23,23,21,0.05) 0, rgba(23,23,21,0.05) 1px, transparent 1px, transparent 32px)",
      border: `1px solid ${HAIRLINE}`,
    }}>
      {Object.entries(AREA_COORDS).map(([name, pos]) => (
        <span key={name} style={{ position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)", fontSize: 8.5, letterSpacing: "0.06em", color: "rgba(23,23,21,0.28)", fontFamily: SANS, whiteSpace: "nowrap", pointerEvents: "none" }}>{name}</span>
      ))}
      {items.map((item) => {
        const pos = pinPosition(item);
        const selected = selectedIds.includes(item.id);
        return (
          <button key={item.id} onClick={() => onOpenPin(item)} aria-label={item.title} style={{
            position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, width: 24, height: 24, marginLeft: -12, marginTop: -24,
            borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", cursor: "pointer", padding: 0,
            background: selected ? BLUE : PAPER, border: `2px solid ${selected ? BLUE : (item.color ?? INK)}`,
            boxShadow: "0 3px 7px rgba(23,23,21,0.3)", zIndex: selected ? 6 : 2,
          }}>
            <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(45deg)", width: 7, height: 7, borderRadius: "50%", background: selected ? PAPER : (item.color ?? INK) }} />
          </button>
        );
      })}
    </div>
  );
}

function MapPlanner({ pool, draftSelection, onOpenPin, onPickBundle, onInjectDemo, bundlesAreNew }) {
  const sorted = pool.slice().sort((a, b) => new Date(b.keptAt) - new Date(a.keptAt));
  const bundles = [
    { id: "light", label: "さらっと", tagline: "ひとつだけ、身軽に。", items: sorted.slice(0, 1) },
    { id: "easy", label: "ゆったり", tagline: "2〜3件、無理のない範囲で。", items: sorted.slice(0, 3) },
    { id: "full", label: "じっくり", tagline: "気になった分だけ、まとめて。", items: sorted.slice(0, 5) },
  ].filter((b) => b.items.length > 0);

  if (pool.length === 0) {
    return (
      <main style={{ padding: "48px 4px", textAlign: "center" }}>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 19, marginBottom: 10 }}>Keepが、まだありません。</div>
        <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.9, marginBottom: 22 }}>ブリーフでKeepしたカードや、願望タブでURLから追加した場所が、ここに地図として集まります。</p>
        <button onClick={onInjectDemo} style={{ padding: "13px 26px", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em" }}>デモ用データを投入</button>
      </main>
    );
  }

  return (
    <main style={{ paddingTop: 14, paddingBottom: draftSelection.length > 0 ? 108 : 24 }}>
      <MapCanvas items={pool} selectedIds={draftSelection} onOpenPin={onOpenPin} />
      <p style={{ fontSize: 10.5, color: "#9A988E", lineHeight: 1.8, margin: "10px 2px 20px" }}>ピンをタップして、今日行きたい場所を選んでください。</p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E" }}>今週のおすすめ</span>
        {bundlesAreNew && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.05em", color: PAPER, background: BLUE, borderRadius: 999, padding: "2px 7px" }}>NEW</span>}
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", WebkitOverflowScrolling: "touch", padding: "2px 0 4px", marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
        {bundles.map((b) => (
          <div key={b.id} style={{ flexShrink: 0, width: 180, background: PAPER, border: `1px solid ${HAIRLINE}`, borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16 }}>{b.label}</div>
            <div style={{ fontSize: 10.5, color: "#9A988E", margin: "3px 0 10px" }}>{b.tagline}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              {b.items.map((it) => (<div key={it.id} style={{ fontSize: 11, color: "#5A5A54", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>・{it.title}</div>))}
            </div>
            <button onClick={() => onPickBundle(b.items.map((it) => it.id))} style={{ width: "100%", padding: "9px 0", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700 }}>これにする</button>
          </div>
        ))}
      </div>
    </main>
  );
}

// URLから場所を追加するシート。
// GoogleマップのURLは無料のPlaces APIで解析(安価)、それ以外のURL(展覧会の
// 公式サイトなど)はGeminiでの読み取りが必要になる(わずかに課金が発生し
// うる)、という使い分けを見せている。この環境には実際のAPIがないため、
// 解析結果はモック。実装ではここをサーバー側の関数呼び出しに置き換える。
function mockParseUrl(url) {
  const isMaps = /google\.com\/maps|maps\.app\.goo\.gl/.test(url);
  let guessTitle = "新しい場所";
  try {
    const u = new URL(url);
    if (isMaps) {
      const m = decodeURIComponent(u.pathname).match(/\/place\/([^/@]+)/);
      if (m) guessTitle = m[1].replace(/\+/g, " ");
    } else {
      guessTitle = u.hostname.replace(/^www\./, "");
    }
  } catch { /* 不正なURLはデフォルトのまま */ }
  return {
    title: guessTitle,
    category: isMaps ? "登録した場所" : "展覧会・イベント",
    parseMethod: isMaps ? "places" : "gemini",
  };
}

function AddPlaceSheet({ onAdd, onClose }) {
  const [step, setStep] = useState("input");
  const [url, setUrl] = useState("");
  const [parsed, setParsed] = useState(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [area, setArea] = useState("");

  const analyze = () => {
    if (!url.trim()) return;
    setStep("loading");
    setTimeout(() => {
      const guess = mockParseUrl(url.trim());
      setParsed(guess);
      setTitle(guess.title);
      setCategory(guess.category);
      setStep("confirm");
    }, 700);
  };
  const isMapsUrl = /google\.com\/maps|maps\.app\.goo\.gl/.test(url);

  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>URLから場所を追加</div>

          {step === "input" && (
            <>
              <p style={{ fontSize: 11.5, color: "#9A988E", lineHeight: 1.7, margin: "0 0 14px" }}>
                GoogleマップのURL、または展覧会などのサイトURLを貼り付けてください。
              </p>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." style={{
                width: "100%", boxSizing: "border-box", border: `1.5px solid ${INK}`, borderRadius: 12, padding: "12px 14px",
                fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 14,
              }} />
              <button onClick={analyze} disabled={!url.trim()} style={{
                width: "100%", padding: "13px 0", background: url.trim() ? INK : "rgba(23,23,21,0.2)", color: PAPER, border: "none",
                borderRadius: 999, cursor: url.trim() ? "pointer" : "default", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
              }}>解析する</button>
            </>
          )}

          {step === "loading" && (
            <div style={{ padding: "28px 0", textAlign: "center" }}>
              <p style={{ fontSize: 12, color: "#9A988E" }}>{isMapsUrl ? "Places APIで解析中…" : "Geminiで内容を読み取り中…"}</p>
            </div>
          )}

          {step === "confirm" && (
            <>
              <div style={{ fontSize: 10, color: parsed?.parseMethod === "gemini" ? RUST : BLUE, marginBottom: 14, lineHeight: 1.7 }}>
                {parsed?.parseMethod === "gemini"
                  ? "※ Geminiで解析しました。内容を確認してください（わずかに課金が発生する場合があります）"
                  : "※ Places APIで解析しました（無料枠内）"}
              </div>
              <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>名前</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SERIF, fontSize: 15, outline: "none", marginBottom: 12, background: "transparent" }} />
              <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>種類</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 12, background: "transparent" }} />
              <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>エリア（任意）</label>
              <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="例: 蔵前" style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 18, background: "transparent" }} />
              <button onClick={() => { if (!title.trim()) return; onAdd({ title: title.trim(), category: category.trim() || "登録した場所", area: area.trim(), sourceUrl: url.trim(), sourceLabel: "登録したリンクを見る" }); requestClose(); }} disabled={!title.trim()} style={{ width: "100%", padding: "13px 0", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>この内容で追加</button>
            </>
          )}
        </>
      )}
    </BottomSheet>
  );
}

function CoverSpread({ items }) {
  return (
    <div style={{ flexShrink: 0, width: "78%", minWidth: 240, scrollSnapAlign: "center", height: 460, background: INK, color: PAPER, borderRadius: 18, padding: "26px 22px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 10px 30px rgba(23,23,21,0.25)" }}>
      <div>
        <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "rgba(251,250,247,0.55)" }}>TODAY'S ISSUE</div>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 25, lineHeight: 1.45, margin: "14px 0 0" }}>今日のための<br />特集号。</div>
      </div>
      <div>
        <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 700, fontSize: 44, lineHeight: 1 }}>{items.length}</div>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "rgba(251,250,247,0.55)", marginTop: 4 }}>DESTINATIONS</div>
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflow: "hidden" }}>
          {items.map((it, i) => (
            <div key={it.id} style={{ fontSize: 11.5, color: "rgba(251,250,247,0.85)", display: "flex", gap: 8 }}>
              <span style={{ opacity: 0.5, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DestinationSpread({ item, index, total, onRemove, onMarkDone }) {
  const isMapsSource = item.sourceLabel === "地図で見る" && !!item.sourceUrl;
  return (
    <div style={{ flexShrink: 0, width: "78%", minWidth: 240, scrollSnapAlign: "center", height: 460, borderRadius: 18, overflow: "hidden", position: "relative", boxShadow: "0 10px 30px rgba(23,23,21,0.2)", background: PAPER, display: "flex", flexDirection: "column" }}>
      <div style={{ height: "56%", position: "relative", flexShrink: 0 }}>
        {item.images?.length > 0 ? (
          <img src={img(item.images[0], 500, 500)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: item.color ?? "#5A5A54" }} />
        )}
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8 }}>
          <button onClick={onMarkDone} aria-label="行った" style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: GREEN, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(23,23,21,0.3)" }}><Check size={22} strokeWidth={2.5} /></button>
          <button onClick={onRemove} aria-label="行っていない" style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(23,23,21,0.55)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(23,23,21,0.3)" }}><X size={20} strokeWidth={2.5} /></button>
        </div>
        <div style={{ position: "absolute", top: 16, left: 14, fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 700, fontSize: 13, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
      </div>
      <div style={{ padding: "14px 18px 16px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.18em", color: "#9A988E" }}>{item.category}{item.area && item.area !== "—" ? ` ・ ${item.area}` : ""}</div>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16, lineHeight: 1.35, margin: "6px 0 6px" }}>{item.title}</div>
        {item.meta?.length > 0 && (
          <div style={{ fontSize: 10.5, color: "#7A7A72", lineHeight: 1.6, flex: 1, overflow: "hidden" }}>{item.meta.slice(0, 2).join(" ・ ")}</div>
        )}
        {/* 地図のURLと「Googleマップ」ボタンが同じ行き先を指す場合は、二重に出さず1つにまとめる */}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {isMapsSource ? (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: "center", padding: "10px 0", background: INK, color: PAPER, borderRadius: 999, textDecoration: "none", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>Googleマップで開く</a>
          ) : (
            <>
              <a href={mapsUrl(`${item.title} ${item.area && item.area !== "—" ? item.area : ""}`)} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: "center", padding: "10px 0", background: INK, color: PAPER, borderRadius: 999, textDecoration: "none", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>Googleマップ</a>
              {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: "center", padding: "10px 0", border: `1.5px solid ${INK}`, borderRadius: 999, textDecoration: "none", color: INK, fontFamily: SANS, fontSize: 10.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.sourceLabel ?? "詳細"}</a>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// マガジン編集モードで開く「候補から追加」シート
function AddToMagazineSheet({ pool, onAdd, onClose }) {
  return (
    <BottomSheet onClose={onClose} maxHeight="60vh">
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 15, marginBottom: 12 }}>候補から追加</div>
      {pool.length === 0 ? (
        <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>追加できる候補がありません。ブリーフや願望タブでKeepを増やしてみてください。</p>
      ) : pool.map((k, i) => (
        <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}` }}>
          {k.images?.length > 0 ? (
            <img src={img(k.images[0], 90, 90)} alt="" style={{ width: 42, height: 42, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 42, height: 42, borderRadius: 8, background: k.color ?? "#5A5A54", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.title}</div>
            <div style={{ fontSize: 9.5, color: "#9A988E", marginTop: 2 }}>{k.category}{k.area && k.area !== "—" ? ` ・ ${k.area}` : ""}</div>
          </div>
          <button onClick={() => onAdd(k.id)} style={{ flexShrink: 0, padding: "8px 14px", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>追加</button>
        </div>
      ))}
    </BottomSheet>
  );
}

function ShelfList({ appState, persist }) {
  const [selectedId, setSelectedId] = useState(null);
  const [binderItem, setBinderItem] = useState(null);
  const all = appState.keeps.filter((k) => k.status !== "done").sort((a, b) => new Date(b.keptAt) - new Date(a.keptAt));

  const removeKeep = (id) => { const next = structuredClone(appState); next.keeps = next.keeps.filter((x) => x.id !== id); persist(next); setSelectedId(null); };

  return (
    <main style={{ flex: 1, paddingBottom: 24, paddingTop: 14 }}>
      <p style={{ fontSize: 11, color: "#9A988E", lineHeight: 1.8, margin: "0 0 10px" }}>Keepは削除しない限り消えません。いつでも地図に呼び出せます。行った場所はマガジンの✓で「記録」タブに移ります。</p>
      {all.length === 0 ? (
        <div style={{ padding: "40px 4px", textAlign: "center" }}><div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>まだKeepがありません。</div></div>
      ) : all.map((k, i) => {
        const status = keepStatus(k);
        const isSel = selectedId === k.id;
        return (
          <div key={k.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 2px", borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}` }}>
              {k.images?.length > 0 && <Thumb seed={k.images[0]} onOpen={() => setBinderItem(k)} />}
              <div onClick={() => setSelectedId(isSel ? null : k.id)} style={{ flex: 1, cursor: "pointer" }}>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 13.5, lineHeight: 1.5 }}>{k.title}</div>
                <div style={{ marginTop: 4 }}><Dot color={status.color} label={`${status.label} ・ ${k.category}${k.area && k.area !== "—" ? "・" + k.area : ""} ・ ${daysBetween(k.keptAt) === 0 ? "今日" : daysBetween(k.keptAt) + "日前"}`} /></div>
              </div>
            </div>
            {isSel && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 2px 14px" }}>
                <button onClick={() => removeKeep(k.id)} style={rowBtn("transparent", RUST, "rgba(168,85,47,0.4)")}>削除</button>
              </div>
            )}
          </div>
        );
      })}
      <BinderModal item={binderItem} onClose={() => setBinderItem(null)} />
    </main>
  );
}

// ==================================================================
// タブ: 記録 ── 鑑賞した映画・読書記録・新規開拓エリアをポスター風に
// ==================================================================
// 記録タブ内で繰り返し使う「ポスター」カード。メディア/エリア共通。
// 記録タブ内で繰り返し使う「ポスター」カード。sizeを省略すると親グリッドに合わせて広がる。
function PosterCard({ image, color, title, sub, label, good, onToggleGood, onClick, size }) {
  return (
    <div onClick={onClick} style={{ position: "relative", flexShrink: 0, width: size ?? "100%", aspectRatio: "2 / 3", borderRadius: 14, overflow: "hidden", boxShadow: "0 8px 20px rgba(23,23,21,0.16)", cursor: onClick ? "pointer" : "default" }}>
      {image ? (
        <img src={img(image, 340, 510)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", background: color ?? "#5A5A54", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 17, color: PAPER, textAlign: "center", lineHeight: 1.45 }}>{title}</span>
        </div>
      )}
      {image && (
        <>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 48%, rgba(0,0,0,0.78) 100%)" }} />
          <div style={{ position: "absolute", bottom: 10, left: 10, right: 10 }}>
            {label && <div style={{ fontSize: 8, letterSpacing: "0.16em", color: "rgba(255,255,255,0.7)", marginBottom: 3 }}>{label}</div>}
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 14, color: "#fff", lineHeight: 1.3 }}>{title}</div>
            {sub && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>{sub}</div>}
          </div>
        </>
      )}
      {!image && (
        <div style={{ position: "absolute", bottom: 10, left: 12, right: 12, textAlign: "center" }}>
          {label && <div style={{ fontSize: 8, letterSpacing: "0.16em", color: "rgba(251,250,247,0.6)", marginBottom: 2 }}>{label}</div>}
          {sub && <div style={{ fontSize: 9, color: "rgba(251,250,247,0.75)" }}>{sub}</div>}
        </div>
      )}
      {onToggleGood && (
        <button onClick={(e) => { e.stopPropagation(); onToggleGood(); }} aria-label="良かった" style={{
          position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", border: "none", cursor: "pointer",
          background: good ? "#D9A441" : "rgba(23,23,21,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}>
          <Star size={14} fill={good ? "#fff" : "none"} color="#fff" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

// エリアごとの「バインダーフォルダー」。閉じているときは写真が重なった束、
// タップで開くとそのエリアで実行したカードのグリッドが現れる。
function AreaFolder({ area, keeps, onOpenItem }) {
  const [open, setOpen] = useState(false);
  const covers = keeps.filter((k) => k.images?.[0]).slice(0, 3);
  const rotations = [-6, 4, -2];
  return (
    <section style={{ marginBottom: open ? 26 : 14 }}>
      <button onClick={() => { haptic(6); setOpen(!open); }} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 14, background: PAPER, border: `1px solid ${HAIRLINE}`,
        borderRadius: 16, padding: "14px 16px", cursor: "pointer", textAlign: "left", boxShadow: open ? "none" : "0 6px 16px rgba(23,23,21,0.08)",
      }}>
        <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
          {covers.length === 0 ? (
            <div style={{ width: 56, height: 56, borderRadius: 10, background: keeps[0]?.color ?? "#5A5A54", margin: 4 }} />
          ) : covers.map((k, i) => (
            <img key={k.id} src={img(k.images[0], 120, 120)} alt="" style={{
              position: "absolute", top: 4, left: 4, width: 54, height: 54, objectFit: "cover", borderRadius: 8,
              border: "2.5px solid #fff", boxShadow: "0 3px 8px rgba(23,23,21,0.25)",
              transform: `rotate(${rotations[i]}deg) translate(${i * 3}px, ${i * -2}px)`, zIndex: i,
            }} />
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 18 }}>{area}</div>
          <div style={{ fontSize: 10, color: "#9A988E", marginTop: 3 }}>{keeps.length}件の記録</div>
        </div>
        <ChevronDown size={16} color="#9A988E" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          {keeps.map((k) => (
            <PosterCard key={k.id} image={k.images?.[0]} color={k.color} title={k.title} sub={shortDate(k.doneAt ?? k.keptAt)}
              onClick={k.images?.length > 0 ? () => onOpenItem(k) : undefined} />
          ))}
        </div>
      )}
    </section>
  );
}

// メディア(映画・展覧会・ライブ/コンサート・読書)を手動で記録するシート
const MEDIA_KINDS = [
  { id: "movie", label: "映画", en: "CINEMA", creatorPlaceholder: "監督（任意）" },
  { id: "exhibition", label: "展覧会", en: "EXHIBITION", creatorPlaceholder: "会場（任意）" },
  { id: "live", label: "ライブ・コンサート", en: "LIVE", creatorPlaceholder: "アーティスト（任意）" },
  { id: "book", label: "読書", en: "BOOK", creatorPlaceholder: "著者（任意）" },
  { id: "album", label: "音楽", en: "MUSIC", creatorPlaceholder: "アーティスト（任意）" },
];
function mediaKindOf(id) { return MEDIA_KINDS.find((k) => k.id === id) ?? MEDIA_KINDS[0]; }
// Keepのカテゴリ文字列から、メディア記録に該当する種類を推定する。
// 該当しなければnull(=カフェや古着など、単なる「行った場所」として扱う)。
function inferMediaKind(category) {
  if (!category) return null;
  if (/映画/.test(category)) return "movie";
  if (/展覧会/.test(category)) return "exhibition";
  if (/コンサート|ライブ/.test(category)) return "live";
  return null;
}
function AddMediaSheet({ onAdd, onClose }) {
  const [kind, setKind] = useState("movie");
  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const current = mediaKindOf(kind);

  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>メディアを記録</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {MEDIA_KINDS.map((k) => (
              <button key={k.id} onClick={() => setKind(k.id)} style={{
                flex: "1 1 40%", padding: "9px 0", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700,
                background: kind === k.id ? INK : "transparent", color: kind === k.id ? PAPER : "#5A5A54",
                border: `1.5px solid ${kind === k.id ? INK : "rgba(23,23,21,0.2)"}`,
              }}>{k.label}</button>
            ))}
          </div>
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>タイトル</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SERIF, fontSize: 15, outline: "none", marginBottom: 14, background: "transparent" }} />
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>{current.creatorPlaceholder}</label>
          <input value={creator} onChange={(e) => setCreator(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1px solid ${HAIRLINE}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 20, background: "transparent" }} />
          <button onClick={() => { if (!title.trim()) return; onAdd({ kind, title: title.trim(), creator: creator.trim() }); requestClose(); }} disabled={!title.trim()} style={{
            width: "100%", padding: "13px 0", background: title.trim() ? INK : "rgba(23,23,21,0.2)", color: PAPER, border: "none",
            borderRadius: 999, cursor: title.trim() ? "pointer" : "default", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
          }}>記録する</button>
        </>
      )}
    </BottomSheet>
  );
}

// ==================================================================
// タブ: 記録 ── アプリのホーム。カード主体の大きなレイアウトで、
// 目標・メディア・エリア(バインダーフォルダー)を構造化して見せる。
// ==================================================================
function RecordsTab({ appState, persist, goTab }) {
  const [binderItem, setBinderItem] = useState(null);
  const [addingMedia, setAddingMedia] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);

  const doneKeeps = appState.keeps.filter((k) => k.status === "done");
  const mediaRecords = (appState.records?.media ?? []).slice().sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
  const fulfilledWishes = appState.wishes.filter((w) => w.status === "fulfilled").sort((a, b) => new Date(b.fulfilledAt ?? b.addedAt) - new Date(a.fulfilledAt ?? a.addedAt));
  const pendingItems = (appState.pendingReview ?? []).map((id) => appState.keeps.find((k) => k.id === id)).filter(Boolean);
  const activeGoals = (appState.goals ?? []).slice().sort((a, b) => new Date(b.checkIns?.[0]?.at ?? b.addedAt) - new Date(a.checkIns?.[0]?.at ?? a.addedAt));

  // メディアは自動では増えない: マガジンで実行済みにしたもの／通知で「行った」を
  // 選んだもの／自分で+から手動記録したもの、の3経路だけがrecords.mediaに入る。
  const mediaLabel = { movie: "CINEMA", exhibition: "EXHIBITION", live: "LIVE", book: "BOOK", album: "MUSIC" };

  // エリアを親、そのエリアで実行したKeepを子とするフォルダー構造
  const areaGroups = new Map();
  doneKeeps.filter((k) => k.area && k.area !== "—").forEach((k) => {
    if (!areaGroups.has(k.area)) areaGroups.set(k.area, []);
    areaGroups.get(k.area).push(k);
  });
  const areaSections = Array.from(areaGroups.entries()).map(([area, keeps]) => {
    const sorted = keeps.slice().sort((a, b) => new Date(b.doneAt ?? b.keptAt) - new Date(a.doneAt ?? a.keptAt));
    return { area, keeps: sorted, lastAt: sorted[0].doneAt ?? sorted[0].keptAt };
  }).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

  const totalCount = doneKeeps.length + mediaRecords.length + fulfilledWishes.length;

  const addMedia = ({ kind, title, creator }) => {
    haptic();
    const next = structuredClone(appState);
    next.records = next.records ?? { media: [] };
    next.records.media.unshift({ id: `media-${Date.now()}`, kind, title, creator, addedAt: new Date().toISOString(), color: POSTER_PALETTE[hashStr(title) % POSTER_PALETTE.length] });
    persist(next);
  };
  const toggleGood = (id) => {
    haptic(6);
    const next = structuredClone(appState);
    const r = next.records.media.find((x) => x.id === id);
    if (r) r.good = !r.good;
    persist(next);
  };
  const resolvePending = (id, went) => {
    haptic(10);
    const next = structuredClone(appState);
    next.pendingReview = (next.pendingReview ?? []).filter((x) => x !== id);
    const k = next.keeps.find((x) => x.id === id);
    if (k) {
      if (went) {
        k.status = "done"; k.doneAt = new Date().toISOString();
        const mediaKind = inferMediaKind(k.category);
        if (mediaKind) {
          next.records = next.records ?? { media: [] };
          next.records.media.unshift({ id: `media-${Date.now()}`, kind: mediaKind, title: k.title, creator: "", addedAt: k.doneAt, image: k.images?.[0], color: k.color, sourceKeepId: k.id });
        }
      } else {
        k.status = "candidate";
      }
    }
    persist(next);
  };

  return (
    <>
      <Masthead title="記録" en="YOUR STORY SO FAR" statValue={totalCount} statLabel="件の記録" />
      <main style={{ flex: 1, paddingTop: 18, paddingBottom: 32 }}>

        {pendingItems.length > 0 && (
          <section style={{ marginBottom: 26 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.22em", color: RUST, marginBottom: 10 }}>行きましたか？</div>
            {pendingItems.map((k) => (
              <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#FBF3EC", border: "1px solid rgba(168,85,47,0.25)", borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ flex: 1, fontFamily: SERIF, fontWeight: 700, fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.title}</div>
                <button onClick={() => resolvePending(k.id, true)} style={{ flexShrink: 0, padding: "8px 12px", background: GREEN, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>行った</button>
                <button onClick={() => resolvePending(k.id, false)} style={{ flexShrink: 0, padding: "8px 12px", background: "transparent", color: "#5A5A54", border: "1px solid rgba(23,23,21,0.2)", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>行かなかった</button>
              </div>
            ))}
          </section>
        )}

        {activeGoals.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E" }}>目標</span>
              <button onClick={() => goTab("goals")} style={{ background: "none", border: "none", color: BLUE, fontSize: 10.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>すべて見る</button>
            </div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}>
              {activeGoals.map((g) => {
                const latest = g.checkIns?.[0];
                return (
                  <button key={g.id} onClick={() => goTab("goals")} style={{ flexShrink: 0, width: 168, textAlign: "left", background: PAPER, border: `1px solid ${HAIRLINE}`, borderRadius: 14, padding: "13px 15px", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <Sprout size={13} color={GREEN} />
                      <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 13.5 }}>{g.title}</span>
                    </div>
                    <p style={{ fontSize: 10.5, color: latest ? "#5A5A54" : "#9A988E", lineHeight: 1.6, margin: 0, fontStyle: latest ? "normal" : "italic", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {latest ? latest.text : "まだ記録がありません"}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section style={{ marginBottom: 30 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E" }}>メディア</span>
            <button onClick={() => setAddingMedia(true)} aria-label="メディアを記録" style={{
              width: 28, height: 28, borderRadius: "50%", border: `1.5px solid rgba(23,23,21,0.25)`, background: "transparent",
              color: "#5A5A54", cursor: "pointer", fontSize: 15, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
            }}>＋</button>
          </div>
          {mediaRecords.length === 0 ? (
            <p style={{ fontSize: 11.5, color: "#9A988E" }}>マガジンで✓にしたもの、通知で「行った」を選んだもの、＋から手動記録したものが並びます。</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {mediaRecords.map((r) => (
                <PosterCard key={r.id} image={r.image} color={r.color} title={r.title} sub={r.creator || shortDate(r.addedAt)} label={mediaLabel[r.kind]}
                  good={!!r.good} onToggleGood={() => toggleGood(r.id)}
                  onClick={r.image ? () => setBinderItem({ title: r.title, category: mediaKindOf(r.kind).label, images: [r.image], meta: r.creator ? [r.creator] : [] }) : undefined} />
              ))}
            </div>
          )}
        </section>

        {areaSections.length > 0 && (
          <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 12 }}>行った場所</div>
        )}
        {areaSections.map((sec) => (
          <AreaFolder key={sec.area} area={sec.area} keeps={sec.keeps} onOpenItem={setBinderItem} />
        ))}

        {fulfilledWishes.length > 0 && (
          <section style={{ margin: "28px 0 0" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 12 }}>叶えた願望</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {fulfilledWishes.map((w) => (
                <PosterCard key={w.id} image={null} color={catOf(w.categoryId).color} title={w.title} sub={shortDate(w.fulfilledAt ?? w.addedAt)} label="WISH" />
              ))}
            </div>
          </section>
        )}

        {totalCount === 0 && pendingItems.length === 0 && (
          <div style={{ padding: "36px 4px", textAlign: "center" }}>
            <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>まだ記録がありません。</div>
            <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>週末タブのマガジンで✓にすると、行った場所が自動でここに並びます。メディアは＋から記録できます。</p>
          </div>
        )}

        <section style={{ marginTop: 30 }}>
          <button onClick={() => setShelfOpen(!shelfOpen)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E" }}>候補中のKeep（{appState.keeps.filter((k) => k.status !== "done").length}）</span>
            <ChevronDown size={12} style={{ transform: shelfOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "#9A988E" }} />
          </button>
          {shelfOpen && <ShelfList appState={appState} persist={persist} />}
        </section>
      </main>

      {addingMedia && <AddMediaSheet onAdd={addMedia} onClose={() => setAddingMedia(false)} />}
      <BinderModal item={binderItem} onClose={() => setBinderItem(null)} />
    </>
  );
}

function WeekendTab({ appState, persist }) {
  const magazine = appState.magazine;
  const [mapMode, setMapMode] = useState(false); // マガジン確定後でも地図に戻って選び直すときtrue
  const [pinItem, setPinItem] = useState(null);
  const [draftSelection, setDraftSelection] = useState([]);
  const [editingMag, setEditingMag] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  const showMap = !magazine || mapMode;
  // 地図には実行済み以外の全Keepをピンとして出す(マガジン掲載中plannedも、選び直しのため含める)
  const pool = appState.keeps.filter((k) => k.status !== "done");
  const notInMagazine = pool.filter((k) => !(magazine?.itemIds ?? []).includes(k.id));
  const magItems = magazine ? magazine.itemIds.map((id) => appState.keeps.find((k) => k.id === id)).filter(Boolean) : [];

  const currentBundleWeek = mostRecentThursday();
  const bundlesAreNew = (appState.weekendMeta?.lastSeenBundleWeek ?? null) !== currentBundleWeek;

  useEffect(() => {
    if (!showMap || !bundlesAreNew || pool.length === 0) return;
    const t = setTimeout(() => {
      const next = structuredClone(appState);
      next.weekendMeta = { ...(next.weekendMeta ?? {}), lastSeenBundleWeek: currentBundleWeek };
      persist(next);
    }, 1200);
    return () => clearTimeout(t);
  }, [showMap, bundlesAreNew, currentBundleWeek, pool.length]);

  const toggleDraft = (item) => {
    haptic(8);
    setDraftSelection((prev) => prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id]);
  };
  // 地図での確定。新規作成と選び直し(更新)の両方に対応:
  // まず現在plannedのものを全て候補に戻し、選ばれたidだけをplannedにし直す。
  const confirmMagazine = (ids) => {
    if (!ids.length) return;
    haptic(16);
    const next = structuredClone(appState);
    next.keeps.forEach((k) => { if (k.status === "planned") k.status = "candidate"; });
    next.keeps.forEach((k) => { if (ids.includes(k.id)) k.status = "planned"; });
    next.magazine = { dateKey: todayKey(), decidedAt: new Date().toISOString(), itemIds: ids };
    persist(next);
    setDraftSelection([]);
    setMapMode(false);
    setEditingMag(false);
  };
  const addToMagazine = (id) => {
    haptic(10);
    const next = structuredClone(appState);
    const k = next.keeps.find((x) => x.id === id);
    if (k) k.status = "planned";
    next.magazine.itemIds = [...next.magazine.itemIds, id];
    persist(next);
  };
  const removeFromMagazine = (id) => {
    const next = structuredClone(appState);
    next.magazine.itemIds = next.magazine.itemIds.filter((x) => x !== id);
    const k = next.keeps.find((x) => x.id === id);
    if (k) k.status = "candidate";
    if (next.magazine.itemIds.length === 0) { next.magazine = null; setEditingMag(false); }
    persist(next);
  };
  const markDoneInMagazine = (id) => {
    haptic(14);
    const next = structuredClone(appState);
    next.magazine.itemIds = next.magazine.itemIds.filter((x) => x !== id);
    const k = next.keeps.find((x) => x.id === id);
    if (k) {
      k.status = "done"; k.doneAt = new Date().toISOString();
      const mediaKind = inferMediaKind(k.category);
      if (mediaKind) {
        next.records = next.records ?? { media: [] };
        next.records.media.unshift({ id: `media-${Date.now()}`, kind: mediaKind, title: k.title, creator: "", addedAt: k.doneAt, image: k.images?.[0], color: k.color, sourceKeepId: k.id });
      }
    }
    if (next.magazine.itemIds.length === 0) { next.magazine = null; setEditingMag(false); }
    persist(next);
  };
  const dissolveMagazine = () => {
    const next = structuredClone(appState);
    (next.magazine?.itemIds ?? []).forEach((id) => { const k = next.keeps.find((x) => x.id === id); if (k) k.status = "candidate"; });
    next.magazine = null;
    persist(next);
    setEditingMag(false);
    setMapMode(false);
  };
  const injectDemo = () => {
    const next = structuredClone(appState);
    const now = Date.now();
    [
      { title: "「建築と自然」展を観る", category: "展覧会", area: "竹橋", images: ["momat-a", "momat-b"], sourceUrl: "https://www.momat.go.jp/", sourceLabel: "公式サイトを見る", color: "#20304A", meta: ["国立近代美術館", "10:00–17:00", "¥1,800"] },
      { title: "蔵前の焙煎所で豆を買う", category: "近所の発見", area: "蔵前", images: ["kuramae-a", "kuramae-b"], sourceUrl: mapsUrl("COFFEE WRIGHTS 蔵前"), sourceLabel: "地図で見る", color: "#3E4A3A", meta: ["COFFEE WRIGHTS", "9:00–18:00"] },
      { title: "高円寺の古着屋を覗く", category: "古着", area: "高円寺", images: ["vintage-a", "vintage-b"], sourceUrl: mapsUrl("高円寺 古着屋"), sourceLabel: "地図で見る", color: "#5C3A21", meta: ["高円寺北口エリア"] },
      { title: "神保町の古書店街を歩く", category: "近所の発見", area: "神保町", images: ["books-a", "books-b"], sourceUrl: mapsUrl("神保町 古書店街"), sourceLabel: "地図で見る", color: "#3E4A3A", meta: ["神保町"] },
      { title: "『大工の技術史』展を観る", category: "展覧会", area: "両国", images: ["carpentry-a", "carpentry-b"], sourceUrl: mapsUrl("江戸東京博物館"), sourceLabel: "公式サイトを見る", color: "#20304A", meta: ["江戸東京博物館"] },
      { title: "銭湯サウナを開拓する", category: "未知との遭遇", area: "蔵前", images: ["sauna-a", "sauna-b"], sourceUrl: mapsUrl("蔵前 銭湯"), sourceLabel: "地図で見る", color: "#2B3FBF", meta: ["蔵前"] },
    ].forEach((d, i) => {
      next.keeps.push({ id: `demo-${now}-${i}`, title: d.title, category: d.category, area: d.area, status: "candidate", keptAt: new Date(now - i * 86400000).toISOString(), images: d.images, meta: d.meta, sourceUrl: d.sourceUrl, sourceLabel: d.sourceLabel, color: d.color });
    });
    persist(next);
  };

  return (
    <>
      <Masthead title="週末" en="WEEKEND" statValue={magazine && !showMap ? magItems.length : pool.length} statLabel={magazine && !showMap ? "件の目的地" : "件の候補"} />

      {showMap ? (
        <>
          {magazine && (
            <button onClick={() => { setMapMode(false); setDraftSelection([]); }} style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", padding: "12px 2px 0", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#9A988E" }}>← マガジンに戻る</button>
          )}
          <MapPlanner pool={pool} draftSelection={draftSelection} onOpenPin={setPinItem} onPickBundle={confirmMagazine} onInjectDemo={injectDemo} bundlesAreNew={bundlesAreNew} />
          {draftSelection.length > 0 && (
            <div style={{ position: "fixed", left: 0, right: 0, bottom: 60, zIndex: 20, display: "flex", justifyContent: "center", background: `linear-gradient(to top, ${BG} 75%, rgba(239,237,230,0))`, paddingTop: 16 }}>
              <div style={{ width: "100%", maxWidth: 420, padding: "0 16px 10px" }}>
                <button onClick={() => confirmMagazine(draftSelection)} style={{ width: "100%", padding: "14px 0", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", boxShadow: "0 8px 24px rgba(23,23,21,0.2)" }}>
                  {draftSelection.length}件で{magazine ? "マガジンを更新" : "マガジンを作る"}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <main style={{ paddingTop: 6, paddingBottom: 24 }}>
          {/* 編集への入り口は控えめに: 小さなテキストのみ */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 2px 10px" }}>
            <button onClick={() => { setDraftSelection(magazine.itemIds); setMapMode(true); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#9A988E" }}>← 地図で選び直す</button>
            <button onClick={() => setEditingMag(!editingMag)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 11, fontWeight: 700, color: editingMag ? INK : "#9A988E" }}>{editingMag ? "完了" : "編集"}</button>
          </div>

          <div style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", gap: 14, padding: "4px 0 6px", WebkitOverflowScrolling: "touch", marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
            <CoverSpread items={magItems} />
            {magItems.map((item, i) => (
              <DestinationSpread key={item.id} item={item} index={i} total={magItems.length} onRemove={() => removeFromMagazine(item.id)} onMarkDone={() => markDoneInMagazine(item.id)} />
            ))}
            {editingMag && (
              <button onClick={() => setAddSheetOpen(true)} style={{
                flexShrink: 0, width: "78%", minWidth: 240, scrollSnapAlign: "center", height: 460, borderRadius: 18, cursor: "pointer",
                border: "2px dashed rgba(23,23,21,0.25)", background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
              }}>
                <span style={{ fontSize: 34, color: "#9A988E", lineHeight: 1 }}>＋</span>
                <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#9A988E", letterSpacing: "0.08em" }}>候補から追加</span>
              </button>
            )}
          </div>
          <p style={{ fontSize: 10.5, color: "#9A988E", lineHeight: 1.8, margin: "14px 2px 0" }}>横にスワイプすると、次の目的地がすぐ開きます。</p>

          {editingMag && (
            <button onClick={dissolveMagazine} style={{ marginTop: 20, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: RUST, letterSpacing: "0.04em" }}>このマガジンを解散する</button>
          )}
        </main>
      )}

      <BinderModal
        item={pinItem}
        onClose={() => setPinItem(null)}
        actionSlot={pinItem && ((closeSheet) => (
          <button onClick={() => { toggleDraft(pinItem); closeSheet(); }} style={{
            width: "100%", padding: "12px 0", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
            background: draftSelection.includes(pinItem.id) ? "transparent" : INK,
            color: draftSelection.includes(pinItem.id) ? RUST : PAPER,
            border: draftSelection.includes(pinItem.id) ? `1.5px solid ${RUST}` : "none",
          }}>{draftSelection.includes(pinItem.id) ? "外す" : "＋ 今日に追加"}</button>
        ))}
      />
      {addSheetOpen && <AddToMagazineSheet pool={notInMagazine} onAdd={(id) => addToMagazine(id)} onClose={() => setAddSheetOpen(false)} />}
    </>
  );
}

// ==================================================================
// アプリ本体
// ==================================================================
const TABS = [
  { id: "records", label: "記録", Icon: LayoutGrid },
  { id: "brief", label: "ブリーフ", Icon: Newspaper },
  { id: "wish", label: "願望", Icon: Heart },
  { id: "goals", label: "目標", Icon: Sprout },
  { id: "weekend", label: "週末", Icon: MapIcon },
];

export default function App() {
  const [appState, setAppState] = useState(null);
  const [tab, setTab] = useState("records");
  const [showProfile, setShowProfile] = useState(false);
  const [storageMode, setStorageMode] = useState(DataStore.mode);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!document.getElementById("brief-fonts")) {
      const link = document.createElement("link");
      link.id = "brief-fonts";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@500;600;700;900&family=Playfair+Display:ital,wght@0,600;0,700;1,600;1,700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap";
      document.head.appendChild(link);
    }
    let alive = true;
    DataStore.load().then(async (s) => {
      if (!alive) return;
      // マガジンは「その日専用」。日付が変わっても未回答(✓も×もされていない)
      // ままの項目が残っていたら、ダッシュボードの通知キューに移してリセットする。
      let mutated = false;
      if (s.magazine && s.magazine.dateKey !== todayKey()) {
        const stale = s.magazine.itemIds ?? [];
        const existing = new Set(s.pendingReview ?? []);
        stale.forEach((id) => existing.add(id));
        s.pendingReview = Array.from(existing);
        s.magazine = null;
        mutated = true;
      }
      // 会期・予約期間が過ぎた(またはexpiresAtがなく30日経った)Keepを自動で削除。
      // 終わったはずの展覧会やライブが候補に残り続けるのを防ぐ。
      const expiredIds = s.keeps.filter(isExpiredKeep).map((k) => k.id);
      if (expiredIds.length > 0) {
        s.keeps = s.keeps.filter((k) => !expiredIds.includes(k.id));
        if (s.magazine) s.magazine.itemIds = s.magazine.itemIds.filter((id) => !expiredIds.includes(id));
        s.pendingReview = (s.pendingReview ?? []).filter((id) => !expiredIds.includes(id));
        mutated = true;
      }
      setAppState(s);
      setStorageMode(DataStore.mode);
      if (mutated) await DataStore.save(s);
    });
    return () => { alive = false; };
  }, []);

  const persist = useCallback(async (next) => { setAppState(next); setStorageMode(await DataStore.save(next)); }, []);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 1600); };

  useEffect(() => {
    if (!appState) return;
    const detected = detectInterests(appState.wishes, appState.keeps);
    const next = structuredClone(appState);
    next.profile = next.profile ?? { interests: [], currentFocus: "" };
    let changed = false;
    detected.forEach((d) => {
      const existing = next.profile.interests.find((i) => i.label === d.label);
      if (!existing) {
        next.profile.interests.push({ id: `auto-${d.label}-${Date.now()}`, label: d.label, categoryId: d.categoryId, kind: d.kind ?? "hobby", weight: d.weight, source: "auto", addedAt: new Date().toISOString() });
        changed = true;
      } else if (existing.source === "auto" && d.weight > existing.weight) {
        existing.weight = d.weight;
        changed = true;
      }
    });
    if (changed) persist(next);
  }, [appState?.wishes, appState?.keeps]);

  if (!appState) {
    return <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SERIF, color: "#9A988E", fontSize: 13, letterSpacing: "0.28em" }}>今日の号を綴じています…</div>;
  }

  const tabProps = { appState, persist, showToast, goTab: setTab };
  const interestCount = (appState.profile?.interests ?? []).length;

  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: SANS, color: INK }}>
      <div style={{ width: "100%", maxWidth: 420, flex: 1, display: "flex", flexDirection: "column", padding: `0 16px ${showProfile ? 24 : 84}px` }}>
        {storageMode === "memory" && <div style={{ fontSize: 9, color: RUST, letterSpacing: "0.05em", padding: "6px 4px 0", textAlign: "right" }}>メモリ動作中</div>}

        {showProfile ? (
          <ProfileTab appState={appState} persist={persist} onClose={() => setShowProfile(false)} />
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 0 0" }}>
              <button onClick={() => { haptic(5); setShowProfile(true); }} aria-label="プロフィール" style={{
                position: "relative", width: 32, height: 32, borderRadius: "50%",
                background: PAPER, border: `1.5px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: INK, boxShadow: "0 4px 12px rgba(23,23,21,0.12)", padding: 0, flexShrink: 0,
              }}>
                <User size={15} strokeWidth={1.75} />
                {interestCount > 0 && (
                  <span style={{
                    position: "absolute", top: -3, right: -3, minWidth: 15, height: 15, borderRadius: 999, background: BLUE,
                    color: PAPER, fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px",
                  }}>{interestCount}</span>
                )}
              </button>
            </div>
            {tab === "brief" && <BriefTab {...tabProps} />}
            {tab === "wish" && <WishTab {...tabProps} />}
            {tab === "goals" && <GoalsTab {...tabProps} />}
            {tab === "records" && <RecordsTab {...tabProps} />}
            {tab === "weekend" && <WeekendTab {...tabProps} />}
          </>
        )}
      </div>

      {toast && <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: INK, color: PAPER, borderRadius: 999, fontSize: 11, letterSpacing: "0.06em", padding: "8px 18px", boxShadow: "0 8px 24px rgba(23,23,21,0.25)", zIndex: 50 }}>{toast}</div>}

      {!showProfile && (
        <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 25, display: "flex", justifyContent: "center", background: PAPER, borderTop: `1.5px solid ${INK}`, paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div style={{ width: "100%", maxWidth: 420, display: "flex" }}>
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => { haptic(5); setTab(t.id); }} style={{ flex: 1, padding: "10px 0", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <t.Icon size={18} strokeWidth={1.6} color={active ? INK : "rgba(23,23,21,0.32)"} />
                  <span style={{ fontFamily: SANS, fontSize: 9, letterSpacing: "0.12em", color: active ? INK : "rgba(23,23,21,0.32)", fontWeight: active ? 700 : 400 }}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
