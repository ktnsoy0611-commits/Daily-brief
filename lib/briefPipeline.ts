// ブリーフ生成の共通パイプライン。実験ルート(app/api/generate-brief)と
// 夜間Cron(app/api/cron/build-brief)の両方がこの buildDeck() を使う。
//
// retrieval は Jina Reader(https://r.jina.ai/<URL>)経由のクリーンMarkdown。
// 2層構成(§8.19で3層から再構築):
//   取得(コード): 各情報源をJinaで取得し、実在URLの集合を機械抽出(捏造防止allowlist)。
//   層1(サイトごとに1回・並列): 一覧Markdownから候補を抽出し、**その場で関連度
//     (0〜100)を付ける**。抽出と分類を1回に統合。採否は判断させない。
//   選抜(コード): 出典URLの実在検証・終了済み/圏外/重複の除外・関連度順の
//     ラウンドロビンで上位N枚を採用。relevance>=50を提案カード、<50を情報カードに。
//     **AIに「落とす」判断をさせないので、候補が1件でもあれば0枚にならない。**
//   補充検索(コード＋層1): 候補が少ない日だけ、興味キーワードでJina検索(s.jina.ai)し、
//     そのSERPを同じ層1プロンプトへ渡して候補を足す。
//   層2(採用分だけ): 個別ページを取得して本文・詳細を仕上げる(情報カードは記事の半分要約)。
//
// GEMINI_API_KEY / JINA_API_KEY は NEXT_PUBLIC_ を付けずサーバー側だけが読む。

import { ITEM_DOMAINS, kindsOfDomain } from "./constants";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const JINA_BASE = "https://r.jina.ai/";
const DEFAULT_LIVING_AREA = "東京23区(および電車で日常的に行ける範囲)";
const DERIVED_TRIGGER = "興味の広がり";
const GOAL_TRIGGER = "ゴールに向けて";

// 層1(サイトごとの抽出＋関連度)の設定。以前は全サイトを1回のGemini呼び出しに
// まとめており、1サイトあたり約3,300字しか渡せず、18サイトでも候補が10件程度しか
// 返らない致命的な低歩留まりだった(§8.19)。サイトごとに1回ずつ並列で呼ぶことで、
// 本文をたっぷり渡し、各サイトから確実にN件拾う。
const EXTRACT_LIMIT_PER_SITE = 10;    // 1サイトから抽出する候補の最大数
const LISTING_TEXT_LIMIT = 12000;     // 層1に渡す1サイトのMarkdownの上限(文字数)
const EXTRACT_CONCURRENCY = 5;        // 層1のGemini呼び出しを同時に走らせる数
const SOURCE_LIMIT = 30;              // buildDeckが読む情報源(一覧)の安全弁。実件数はCronが決める
const SITE_CARD_LIMIT = 3;            // 1つの情報源から採用するカードの最大数(1サイトに偏らせない)
// 関連度(0〜100)の境界。これ以上=提案カード、未満=中立の情報カード。
const PROPOSAL_MIN_RELEVANCE = 50;
const STRONG_MIN_RELEVANCE = 80;      // これ以上=直接合致(ストレート)、50〜79=興味の広がり(派生)
// 補充検索: 候補がこの件数に届かないとき、興味キーワードでJina検索して足す。
const SEARCH_TOPUP_THRESHOLD = 20;
const SEARCH_QUERY_LIMIT = 3;         // 1回の生成で投げる検索クエリ数
const JINA_SEARCH_BASE = "https://s.jina.ai/";
const ENRICH_PAGE_TEXT_LIMIT = 6000;  // 層E(本文詳細化)で1個別ページに使う本文の上限(文字数)
const ENRICH_CONCURRENCY = 12;        // 層Eで個別ページを同時取得する数(枚数増に合わせ6→12で待ち時間短縮)
const ENRICH_BATCH = 5;               // 層Eで1回のGemini呼び出しに含めるカード数(出力が8192を超えないよう小分け)
const SITE_FETCH_CONCURRENCY = 6;     // 情報源(一覧)をJinaで同時取得する数(多すぎると無料枠の429で失敗が増える)

// ---- 型 -------------------------------------------------------------------
export type InterestSignal = { label: string; weight: number };
// ウィッシュ(願望)は文字列(タイトルのみ)でも、Wish.category(ItemDomain)を
// 添えたオブジェクトでも受け取れる。domainがあれば層Cがそのウィッシュに
// 応えるカードのkindを、対応するドメインに沿った値へ優先的に揃える
// (HANDOFF-CURRENT.md §8.14 Issue 3)。
export type WishInput = { title: string; domain?: string; id?: string };
// ゴール(目標)の達成に効くキーワード。Coworkの週次分析が taste-state.md の
// 「## ゴールに効くキーワード」に書き、Cronがゴール本体(app_state)のidと突き合わせて
// ここへ渡す。層1がこれを見て「この候補はどのゴールに効くか」をgoalIdで返す。
export type GoalInput = { id?: string; title: string; keywords: string[] };
export type TasteInput = {
  wishes?: (string | WishInput)[];
  taste?: InterestSignal[];   // 興味・好み(関心を持ち好んでいるテーマ。好み/興味を統合した1リスト)
  related?: InterestSignal[]; // 興味・好みの関連キーワード(そこから派生する関連・隣接テーマ。カード生成の網を少し広げる材料)
  goals?: GoalInput[];        // ゴールと、その達成に効くキーワード
  // Coworkが書いた「ゴール名→キーワード」の生データ(myBrainが読み、Cronがidを付ける)。
  goalKeywords?: { title: string; keywords: string[] }[];
  livingArea?: string;
};
export type TokenUsage = { promptTokens: number; candidateTokens: number; totalTokens: number; calls: number };
// unchanged: 前回のダイジェスト(内容ハッシュ)と一致し、抽出をスキップしたサイト。
export type SiteTrace = { source: string; fetched: boolean; linkCount: number; unchanged?: boolean; candidates?: number };
export type PageReadTrace = { url: string; ok: boolean };
export type DropSummary = { sourceInvalid: number; expired: number; duplicateCandidate: number; outOfArea: number; irrelevant: number; overQuota: number };
export type GeneratedCard = {
  title: string; body: string; detail?: string; kind: string; trigger: string;
  area?: string; sourceUrl?: string; sourceLabel?: string; meta?: string[];
  expiresAt?: string; isDerived?: boolean;
  isInfo?: boolean;         // 好み/興味に強く当たらない中立の「新着情報」カード
  sourceWishId?: string;    // 応えた願いのid(id化・言い換えに強い)
  sourceWishTitle?: string; // 旧: 文字一致用(後方互換のため残す)
  goalId?: string;          // 達成に役立つゴールのid(検証済み)
  goalTitle?: string;       // 表示用のゴール名(コードが引く)
  images?: string[]; // OGP画像(og:image)。無ければ未設定=色ベタ表示
  lat?: number; lng?: number; placeId?: string; // 会場/エリアをPlacesで名寄せした実座標
};
export type CandidateRecord = {
  name: string; summary?: string; venue?: string; area?: string;
  start?: string; end?: string; price?: string; sourceUrl?: string;
  site?: string; // 由来する情報源(入力sources[]の1つ)。サイト別上限に使う
  // 層1がその場で付ける関連度(0〜100)とkind。採否はコードがこの点数で決める。
  relevance?: number; kind?: string; inLivingArea?: boolean; sourceWishId?: string;
  goalId?: string; // 検証済み(渡したゴールのidに一致した)場合だけ入る
};
export type BuildResult =
  | {
      ok: true; cards: GeneratedCard[]; candidateCount: number;
      records: CandidateRecord[]; // 検証を通った候補レコード(content_cacheプール用)
      sites: SiteTrace[]; pagesRead: PageReadTrace[];
      dropped: DropSummary; tokens: TokenUsage; note?: string;
      // 今回取得した各情報源の内容ハッシュ(normUrl→hash)。Cronがこれを保存し、
      // 次回 input.digests として渡すと、変化のないサイトを再抽出せずスキップできる。
      digests: Record<string, string>;
    }
  | { ok: false; reason: string; detail?: string };
// 層1(SYSTEM_EXTRACT)が返す生の候補。relevance/kind を含む。
type ExtractedCandidate = {
  name?: string; summary?: string; relevance?: number; kind?: string;
  inLivingArea?: boolean; venue?: string; area?: string;
  start?: string; end?: string; price?: string; sourceUrl?: string; sourceWishId?: string;
  goalId?: string; // そのゴールの達成に直接役立つ候補(検証してから採用する)
};

const ZERO_USAGE: TokenUsage = { promptTokens: 0, candidateTokens: 0, totalTokens: 0, calls: 0 };
const ZERO_DROPS: DropSummary = { sourceInvalid: 0, expired: 0, duplicateCandidate: 0, outOfArea: 0, irrelevant: 0, overQuota: 0 };

// 内容ハッシュ(FNV-1a・32bit)。サイトのMarkdownが前回から変わったかの
// 判定にだけ使う(暗号強度は不要)。同じ入力に対して安定した16進文字列を返す。
export function contentHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// ---- URL正規化・名称一致 --------------------------------------------------
export function normUrl(u: string): string {
  try {
    const x = new URL(u);
    return (x.origin + x.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return u.trim().replace(/\/+$/, "").toLowerCase();
  }
}
function normName(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[\s　]+/g, "").replace(/[「」『』【】()（）・,、.。!！?？:：;；\-—–]/g, "");
}
// 2つの文字列に共通する最長の連続部分文字列の長さ(動的計画法)。
// namesLikelyMatchが「前後に会場名・年など異なる情報が付いて、単純な
// 包含関係にならない」表記ゆれを拾うために使う。
function longestCommonSubstringLength(a: string, b: string): number {
  let prev = new Array(b.length + 1).fill(0);
  let max = 0;
  for (let i = 1; i <= a.length; i++) {
    const curr = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > max) max = curr[j];
      }
    }
    prev = curr;
  }
  return max;
}
export function namesLikelyMatch(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (shorter.length >= 4 && longer.includes(shorter)) return true;
  // 単純な包含関係にはならないが、核となる名称部分が長く一致している場合も
  // 同一の事物とみなす(例:「○○展 東京都美術館」⇔「○○展(2026年開催)」)。
  const lcs = longestCommonSubstringLength(na, nb);
  return lcs >= 6 && lcs >= shorter.length * 0.6;
}

// 展覧会名から定型語(特別展/企画展/展覧会/展 等・位置を問わず)を除いた核の名称。
// namesLikelyMatch が拾えない「○○展」⇔「特別展 ○○」⇔「○○ 展覧会」のような
// 展の位置違いを同一視するためのキー(issue 3: 別サイト・別日の同一展の重複)。
export function canonicalEventName(name: string): string {
  return normName(name)
    .replace(/(特別|企画|回顧|記念|巡回|コレクション)?展覧会/g, "")
    .replace(/(特別|企画|回顧|記念|巡回|コレクション)展/g, "")
    .replace(/展$/g, "")
    .replace(/exhibitions?/gi, "");
}
// 2つの名称が同一の事物を指すか。namesLikelyMatch に加えて、展の定型語を
// 除いた核名称(canonicalEventName)の一致・包含でも同一とみなす。4文字未満の
// 短い核名称は誤統合を避けて完全一致のみ対象にする。
export function sameEvent(a: string, b: string): boolean {
  if (namesLikelyMatch(a, b)) return true;
  const ca = canonicalEventName(a);
  const cb = canonicalEventName(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const [sh, lo] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
  return sh.length >= 4 && lo.includes(sh);
}

// Markdownの画像記法などトークンを食うだけの要素を落とす(軽いトークン節約)。
export function stripMarkdownNoise(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/^\s*[-*]\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Markdown本文から実在するURLの集合を機械抽出する(捏造防止のallowlist)。
// どのリンクが項目かの「選定」はしない。検証用の集合を作るだけ。
export function markdownUrlMap(md: string, sourceUrl: string): Map<string, string> {
  const map = new Map<string, string>();
  const srcKey = normUrl(sourceUrl);
  const add = (raw: string) => {
    const u = raw.replace(/[.,;>"']+$/, "").trim();
    if (!/^https?:\/\//i.test(u)) return;
    const k = normUrl(u);
    if (k === srcKey) return;
    if (!map.has(k)) map.set(k, u);
  };
  for (const m of md.matchAll(/\]\((https?:\/\/[^)\s]+)\)/gi)) add(m[1]);
  for (const m of md.matchAll(/\bhttps?:\/\/[^\s)\]]+/gi)) add(m[0]);
  return map;
}

// ---- Jina Reader 経由のクリーンMarkdown取得 -------------------------------
type FetchedPage = { url: string; ok: boolean; md: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fetchViaJina(url: string): Promise<FetchedPage> {
  // Jina無料枠(キー無し)は同時リクエストが多いと429で弾かれやすい。多数サイトを
  // 一度に取りに行くと取得失敗が増えて候補が激減するため、失敗時は少し待って
  // 最大2回まで再試行する(特に429/5xx対策)。JINA_API_KEYがあればレート上限が
  // 上がるので、恒久対策としてはキー設定が望ましい。
  const jinaKey = process.env.JINA_API_KEY;
  const headers: Record<string, string> = { Accept: "text/plain", "X-Return-Format": "markdown" };
  if (jinaKey) headers["Authorization"] = `Bearer ${jinaKey}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(JINA_BASE + url, { headers, signal: AbortSignal.timeout(30000) });
      if (!res.ok) {
        // 429(レート超過)・5xx(一時障害)は待って再試行。4xxの他は諦める。
        if ((res.status === 429 || res.status >= 500) && attempt < 2) { await sleep(1200 * (attempt + 1)); continue; }
        return { url, ok: false, md: "" };
      }
      const md = (await res.text()).trim();
      if (!md) { if (attempt < 2) { await sleep(1000); continue; } return { url, ok: false, md: "" }; }
      return { url, ok: true, md };
    } catch {
      if (attempt < 2) { await sleep(1000); continue; } // タイムアウト・ネットワークも1回は再試行
      return { url, ok: false, md: "" };
    }
  }
  return { url, ok: false, md: "" };
}

// ---- OGP画像(og:image)の取得 ---------------------------------------------
// 個別ページの生HTMLのheadから og:image / twitter:image を1枚だけ取り出す。
// https画面でhttp画像を出すとmixed-contentで弾かれるため https のみ採用する。
// 取得はベストエフォート: ブロック・不在・http のときは null(=写真なし=色ベタ)。
const OG_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function extractOgImage(html: string, baseUrl: string): string | null {
  const head = html.slice(0, 200000); // メタタグはhead(先頭)にあるので前方だけ見る
  const patterns: RegExp[] = [
    /<meta[^>]+property=["']og:image(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url|:url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
  ];
  for (const re of patterns) {
    const m = head.match(re);
    if (!m || !m[1]) continue;
    let raw = m[1].trim();
    if (raw.startsWith("//")) raw = "https:" + raw; // プロトコル相対はhttpsへ
    let abs: string;
    try {
      abs = new URL(raw, baseUrl).href;
    } catch {
      continue;
    }
    if (!/^https:\/\//i.test(abs)) continue; // httpはmixed-contentになるので不採用
    return abs;
  }
  return null;
}

async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": OG_UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!/html/i.test(ct)) return null;
    const html = await res.text();
    return extractOgImage(html, url);
  } catch {
    return null;
  }
}

// ---- 場所の名寄せ(Places API(New) Text Search) --------------------------
// 会場名・エリアから実座標を1件引く。app/api/resolve-place と同じPlaces(New)
// Text Searchだが、こちらは生成パイプライン(サーバー)内で会場を持つカードに
// 座標を付けるために使う。GOOGLE_PLACES_API_KEY 未設定なら null(=座標なし=
// 従来どおりAREA_LATLNGへのフォールバック任せ)。ベストエフォート。
export type Geo = { lat: number; lng: number; placeId?: string };
async function geocodePlace(query: string): Promise<Geo | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !query.trim()) return null;
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // 課金は要求フィールドで決まる。座標・idだけに絞って最小コストにする。
        "X-Goog-FieldMask": "places.id,places.location",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "ja", regionCode: "JP", maxResultCount: 1 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.places?.[0];
    if (!p?.location) return null;
    return { lat: p.location.latitude, lng: p.location.longitude, placeId: p.id };
  } catch {
    return null;
  }
}

// ---- Geminiモデル解決 + 呼び出し ----------------------------------------
function endpointFor(model: string) {
  const m = model.startsWith("models/") ? model.slice("models/".length) : model;
  return `${API_BASE}/models/${m}:generateContent`;
}
async function listFlashModel(key: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/models`, { headers: { "x-goog-api-key": key } });
    if (!res.ok) return null;
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const models: any[] = (data?.models ?? []).filter((m: any) => (m?.supportedGenerationMethods ?? []).includes("generateContent"));
    const nm = (m: { name?: string }) => m?.name ?? "";
    const flash = models.filter((m) => /flash/i.test(nm(m)) && !/vision|embedding|aqa|imagen|tts|audio|thinking/i.test(nm(m)));
    const pick =
      flash.find((m) => /flash-lite-latest/i.test(nm(m))) ??
      flash.find((m) => /flash-lite/i.test(nm(m))) ??
      flash.find((m) => /flash-latest/i.test(nm(m))) ??
      flash[flash.length - 1] ??
      models[0];
    return pick?.name ?? null;
  } catch {
    return null;
  }
}
function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    candidateTokens: a.candidateTokens + b.candidateTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    calls: a.calls + b.calls,
  };
}
// モデル解決(404時のフォールバック含む)・使用トークンの集計をまとめた唯一の
// Gemini呼び出し口。プラン生成(lib/planPipeline.ts)からも使うためexportする。
export async function callGemini(
  key: string, systemText: string, userText: string, jsonMode: boolean, maxOutputTokens = 3072,
): Promise<{ ok: true; text: string; usage: TokenUsage } | { ok: false; status: number; detail: string }> {
  const reqBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens, ...(jsonMode ? { responseMimeType: "application/json" } : {}) },
  });
  const callModel = (model: string) =>
    fetch(endpointFor(model), { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: reqBody });
  let res = await callModel(DEFAULT_MODEL);
  if (res.status === 404) {
    const alt = await listFlashModel(key);
    if (alt) res = await callModel(alt);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    return { ok: false, status: res.status, detail };
  }
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("").trim();
  const um = data?.usageMetadata ?? {};
  return {
    ok: true, text,
    usage: { promptTokens: um.promptTokenCount ?? 0, candidateTokens: um.candidatesTokenCount ?? 0, totalTokens: um.totalTokenCount ?? 0, calls: 1 },
  };
}
export function extractJsonArray<T>(text: string): T[] | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);
  try {
    const parsed = JSON.parse(t);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

// ---- プロンプト -----------------------------------------------------------
// 願望の4ドメイン(Wish.category)→kindの対応表。願いに直接応えるカードの
// kindを揃えるための固定テーブルで、constants.ts(ITEM_DOMAINS/kindsOfDomain)
// から動的に生成する(プロンプトとコードのドメイン定義が食い違わないように)。
const DOMAIN_KIND_TABLE = ITEM_DOMAINS
  .map((d) => {
    const kinds = kindsOfDomain(d.id).map((k) => k.id);
    return `  ${d.label} → ${kinds.join("・")}${kinds.length > 1 ? " のいずれか" : ""}`;
  })
  .join("\n");

// 層1: 1サイトを読んで候補を抽出し、その場で関連度(0〜100)を付ける。以前は
// 「抽出(層B)」と「分類(層C)」を別々のGemini呼び出しに分け、しかも全サイトを
// 1回にまとめていたため、(a)1サイトあたりの本文が足りず候補がごく少数、
// (b)分類が全候補をnoneにして0枚、という二重の失敗が起きていた(§8.19)。
// 抽出と関連度付けを1回に統合し、サイトごとに並列で呼ぶ。**採否は判断させない**
// (点数だけ付けさせ、選抜はコードが行う)ので、構造的に0枚にならない。
const SYSTEM_EXTRACT = `あなたは情報抽出モジュールです。1つのWebページのMarkdown本文だけを情報源として、そこに並ぶ個別の事物を候補としてJSON配列で出力します。各候補には、渡されたプロファイルとの関連度を0〜100の数値で付けます。採否の判断はしません（低い候補も除外せず、点数を低く付けて出力します）。

# 入力仕様
<基準日>: 本日の日付
<生活圏>: 提案の対象とする地理的範囲
<プロファイル>
  願望リスト: 具体的な願い。各行は「- (id: 識別子) 内容」または「- (id: 識別子) 内容 [ドメイン: …]」の形式
  興味・好み: 関心を持ち、好んでいるテーマ
  興味・好みの関連キーワード: そこから派生する関連・隣接テーマ
  ゴール: 達成したい目標。各行は「- (id: 識別子) 目標 ／ 効くキーワード: …」の形式
<抽出上限>: このページから作る候補の最大件数
<ページ>: URLとMarkdown本文

# ドメインとkindの対応表(願いに応える候補のkind選択に使う)
${DOMAIN_KIND_TABLE}

# 抽出ルール
1. 記述はページ本文に明記された事実のみを根拠とする。本文に無い情報の補完・推測・一般知識の使用は禁止。名称が本文から特定できない事物は候補にしない。
2. 1候補は1つの事物を表す。催し・展示・上映・作品に加えて、記事・特集・レビュー・インタビュー・作品紹介・エッセイ、および記事中で紹介・言及される具体的な商品・アイテム（ブランドの服・新商品・道具など）も候補にする。会場や会期は無くてよい。ナビゲーション・サイト案内・タグ一覧・広告は候補にしない。
3. <基準日>時点で既に終了している事物は候補にしない。開始日・終了日が本文から読み取れる場合のみ start / end に記す。
4. sourceUrl は、その事物の個別ページを指す、本文中に実在するリンクのURLをそのまま用いる。URLの生成・改変・補完は禁止。個別リンクが本文に無い事物は、ページ自体のURLを用いる。
5. <抽出上限>まで、できるだけ多く拾う。関連度の低い候補も省略せず出力する。
6. <プロファイル>の「ゴール」に挙がった目標の達成に直接役立つ候補（その目標のための場所・道具・講座・体験・記事など）には goalId にその目標の識別子を記す。役立たない候補には付けない。目標に役立つかどうかは relevance とは別の判断で、relevance は従来どおり興味・好みとの近さで付ける。

# 関連度(relevance)の付け方
プロファイルとの近さを0〜100の整数で付ける。合致は文字どおりの一致に限らず、上位概念・下位概念・隣接ジャンルまで含めて考える（例: 特定のブランド名は「ファッション」という上位ジャンルを、ある作家名はその分野を含意する）。
  80〜100: 願望リスト・興味・好みに、直接またはその上位/下位概念として合致する
  50〜79: 興味・好みの関連キーワードに合致する、または興味・好みと地続きの隣接領域にある
  20〜49: プロファイルとの直接の関係は薄いが、その分野の新着として読む価値がある
  0〜19: 関係がなく、読む価値も乏しい

# 出力契約
下記フィールドのJSON配列のみを出力する。候補が無い場合は [] を出力する。
name / summary（1〜3文。本文の事実に基づく内容の要約。固有名・日時・場所などの具体を最低1つ含める。プロファイルとの合致理由やユーザーへの言及・勧誘は書かない） / relevance（0〜100の整数） / kind（"place" | "exhibition" | "live" | "activity" | "food" | "movie" | "book" | "album" | "info" | "thing"。商品・アイテムは "thing"） / inLivingArea（任意。所在地の記述がある場合のみ、それが<生活圏>内かどうか） / venue（任意） / area（任意） / start（任意,ISO8601） / end（任意,ISO8601） / price（任意） / sourceUrl / sourceWishId（任意。願望リストのいずれかに直接応える場合のみ、その願いの行頭にある識別子） / goalId（任意。上記ゴールの達成に直接役立つ場合のみ、その目標の行頭にある識別子）`;

const SYSTEM_ENRICH_BODY = `あなたは情報編成パイプラインの本文詳細化モジュールです。既に選ばれたカードごとに、その事物の個別ページ本文を読み、カードの本文(body)と詳細(detail)を書きます。

# 入力仕様
<基準日>: 本日の日付
<プロファイル>: ユーザーの好み・興味・興味の関連キーワード（bodyの誘いの一文の根拠にのみ使う）
<カード群>: 各カードの id・title・現在の body・sourcePage（その事物の個別ページのMarkdown本文）

# 書き直しルール
1. body・detail とも、記述は sourcePage 本文に明記された事実のみを根拠とする。本文に無い情報の補完・推測・一般知識の使用は禁止。
2. body: カード表面に出す短い紹介文。「内容の要約（2〜3文）＋ 最後に短い誘いの一文（1文）」とする。
   - 要約: 何の展示・作品か、誰によるものか等、本文の要点を簡潔に。概略で終わらせず、本文にある固有名・日時・場所などの具体を最低1つは含める。
   - 誘いの一文: <プロファイル>を踏まえ、なぜ今これを見てほしいかを自然な話し言葉で1文添える。事実と矛盾しないこと。
   - ただし 情報カード="true" のカードは、誘いの一文を付けず、内容の中立な要約（3文程度）だけにする。
3. detail: タップして開いて読む、より詳しい説明。通常のカードは4〜7文（200〜400字程度）。sourcePage 本文から読み取れる具体的な情報——テーマや背景、構成・見どころ、出品作家・出演者・監督などの固有名、会場・会期・時間・料金・アクセスなど——をできるだけ具体的に盛り込む。固有名や数字を省略しない。bodyの単なる繰り返しにしない。ただし 情報カード="true" のカードは、元記事のおよそ半分の分量でまとめた要約にする（段落を分けてよい・固有名や数字を省略しない・事実に忠実に・誘い文やユーザーへの言及は入れない）。読み手がその記事の要点を最後まで追えるようにする。
4. 禁止事項: bodyの誘いの一文で「〜に関心がある人にとって」「〜な機会です」のような定型的な言い回し・ユーザーの属性のラベル貼り・プロファイルに無い決めつけ・本文に無い事実の追加。detailには誘い文やユーザーへの言及を入れず、事実の説明に徹する。評価の誇張・過度な煽りはしない。
5. title は変更しない。sourcePage から読み取れる情報が乏しい場合は、body は現在の body をそのまま返し、detail は空文字列でよい。

# 出力契約
下記フィールドのJSON配列のみを出力する。入力カードは1件も省略しない。
id / body / detail`;

// 層1のユーザープロンプト(1サイト分)。プロファイルも一緒に渡し、抽出と同時に
// 関連度を付けさせる。
function userExtract(todayJp: string, livingArea: string, tasteBlock: string, extractLimit: number, pageUrl: string, pageMd: string): string {
  return `<基準日>${todayJp}</基準日>\n<生活圏>${livingArea}</生活圏>\n<プロファイル>\n${tasteBlock}\n</プロファイル>\n<抽出上限>${extractLimit}</抽出上限>\n<ページ url="${pageUrl}">\n${pageMd}\n</ページ>`;
}
function userEnrich(todayJp: string, profileText: string, blocks: string): string {
  return `<基準日>${todayJp}</基準日>\n<プロファイル>\n${profileText}\n</プロファイル>\n<カード群>\n${blocks}\n</カード群>`;
}

// 並行数を制限しつつ全件処理する(Jina Readerを一度に大量に叩いてレート制限に
// 引っかからないようにするため)。
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// 層E: 採用が確定したカードだけ個別ページを取得し、本文をより具体的に書き直す。
// 1ページから複数カードが生まれている場合はページ取得を1回にまとめる。
async function enrichCardBodies(
  key: string, todayJp: string, profileText: string, cards: GeneratedCard[],
): Promise<{ cards: GeneratedCard[]; usage: TokenUsage; pagesRead: PageReadTrace[] }> {
  const withUrl = cards.map((c, i) => ({ c, i })).filter((x) => x.c.sourceUrl);
  if (withUrl.length === 0) return { cards, usage: ZERO_USAGE, pagesRead: [] };

  const uniqueUrls = Array.from(new Set(withUrl.map((x) => x.c.sourceUrl!)));
  // 個別ページの本文(Jina)とOGP画像(生HTMLのog:image)を並行して取得する。
  const [fetched, ogImages] = await Promise.all([
    mapWithConcurrency(uniqueUrls, ENRICH_CONCURRENCY, (u) => fetchViaJina(u)),
    mapWithConcurrency(uniqueUrls, ENRICH_CONCURRENCY, (u) => fetchOgImage(u)),
  ]);
  const pageByUrl = new Map<string, FetchedPage>();
  fetched.forEach((p, i) => pageByUrl.set(uniqueUrls[i], p));
  const ogByUrl = new Map<string, string | null>();
  ogImages.forEach((im, i) => ogByUrl.set(uniqueUrls[i], im));
  const pagesRead: PageReadTrace[] = fetched.map((p) => ({ url: p.url, ok: p.ok }));

  // OGP画像を先に付与しておく(本文詳細化の成否に関わらず写真は載せる)。
  const out = cards.slice();
  for (const { c, i } of withUrl) {
    const og = ogByUrl.get(c.sourceUrl!);
    if (og) out[i] = { ...out[i], images: [og] };
  }

  // カードを ENRICH_BATCH 件ずつに分けて並列に書き直す。枚数が増え、情報カードの
  // detail(記事の半分要約)が長くなると、全カードを1回で書き直すと出力が
  // maxOutputTokens(8192)を超えて途中で切れJSONが壊れる。小分けにして各回の
  // 出力を短く保つ(id は out 全体の添字なので分割してもパッチは正しく当たる)。
  const blockOf = ({ c, i }: { c: GeneratedCard; i: number }) => {
    const page = pageByUrl.get(c.sourceUrl!);
    if (!page || !page.ok || !page.md) return "";
    const text = stripMarkdownNoise(page.md).slice(0, ENRICH_PAGE_TEXT_LIMIT);
    return `<カード id="${i}" title="${c.title}"${c.isInfo ? ' 情報カード="true"' : ""}>\n<現在のbody>${c.body}</現在のbody>\n<個別ページ>\n${text}\n</個別ページ>\n</カード>`;
  };
  const chunks: { c: GeneratedCard; i: number }[][] = [];
  for (let s = 0; s < withUrl.length; s += ENRICH_BATCH) chunks.push(withUrl.slice(s, s + ENRICH_BATCH));
  const results = await Promise.all(
    chunks.map((chunk) => {
      const blocks = chunk.map(blockOf).filter(Boolean).join("\n");
      if (!blocks) return Promise.resolve(null);
      return callGemini(key, SYSTEM_ENRICH_BODY, userEnrich(todayJp, profileText, blocks), true, 8192);
    }),
  );
  let usage = ZERO_USAGE;
  for (const r of results) {
    if (!r || !r.ok) continue;
    usage = addUsage(usage, r.usage);
    const rewritten = extractJsonArray<{ id?: number; body?: string; detail?: string }>(r.text) ?? [];
    for (const item of rewritten) {
      if (typeof item.id !== "number" || !out[item.id]) continue;
      const patch: Partial<GeneratedCard> = {};
      if (typeof item.body === "string" && item.body.trim()) patch.body = item.body.trim();
      if (typeof item.detail === "string" && item.detail.trim()) patch.detail = item.detail.trim();
      if (Object.keys(patch).length) out[item.id] = { ...out[item.id], ...patch };
    }
  }
  return { cards: out, usage, pagesRead };
}

// ---- 取得: 情報源をJinaで取得し、Markdownと実在URL集合を返す ----------------
type SiteFetch = { trace: SiteTrace; url: string; md: string; allow: Map<string, string>; fetched: boolean };
async function fetchSite(sourceUrl: string): Promise<SiteFetch> {
  const page = await fetchViaJina(sourceUrl);
  if (!page.ok || !page.md) {
    return { trace: { source: sourceUrl, fetched: false, linkCount: 0 }, url: sourceUrl, md: "", allow: new Map(), fetched: false };
  }
  const md = stripMarkdownNoise(page.md);
  const allow = markdownUrlMap(md, page.url);
  return { trace: { source: sourceUrl, fetched: true, linkCount: allow.size }, url: page.url, md, allow, fetched: true };
}

// ---- 補充検索: Jinaの検索API(s.jina.ai)でSERPをMarkdownとして取得 -----------
// 登録情報源だけで候補が足りない日に、興味キーワードで新着を拾うための補完
// (ユーザー指定)。返るのは実在する検索結果(タイトル・URL・抜粋)なので、
// URLを捏造される心配が無い(Geminiの検索グラウンディングを使わない理由)。
// 取得できたSERPのMarkdownは、そのまま層1の抽出プロンプトへ渡す。
async function fetchJinaSearch(query: string): Promise<{ ok: boolean; url: string; md: string; allow: Map<string, string> }> {
  const jinaKey = process.env.JINA_API_KEY;
  const headers: Record<string, string> = { Accept: "text/plain", "X-Return-Format": "markdown" };
  if (jinaKey) headers["Authorization"] = `Bearer ${jinaKey}`;
  const url = JINA_SEARCH_BASE + encodeURIComponent(query);
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!res.ok) return { ok: false, url, md: "", allow: new Map() };
    const raw = (await res.text()).trim();
    if (!raw) return { ok: false, url, md: "", allow: new Map() };
    const md = stripMarkdownNoise(raw);
    return { ok: true, url, md, allow: markdownUrlMap(md, url) };
  } catch {
    return { ok: false, url, md: "", allow: new Map() };
  }
}

// ---- 本体: taste + sources → デッキ ---------------------------------------
// exclude: 既に作った/KEEP済みのカードのURL・タイトル。これに一致する候補は
//   除外し「前に作ったカードと同じもの」を作らない(Q2 重複防止)。
// digests: 前回取得した各情報源の内容ハッシュ(normUrl→hash)。今回の取得結果と
//   一致する(=更新が無い)サイトは抽出をスキップしてトークンを節約する(Q3)。
export async function buildDeck(input: {
  taste: TasteInput;
  sources: string[];
  count: number;
  exclude?: { urls?: string[]; names?: string[] };
  digests?: Record<string, string>;
  forceFresh?: boolean; // 真なら「更新なしスキップ」を無効化し取得できた全サイトを抽出する
  // ゴール関連カードを今回いくつまで入れてよいか(ユーザー方針: 週に1〜2枚)。
  // 直近7日に出した枚数から呼び出し側(Cron)が算出して渡す。既定0=入れない。
  goalQuota?: number;
}): Promise<BuildResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: "no_key" };

  const excludeUrlSet = new Set((input.exclude?.urls ?? []).filter((u) => typeof u === "string").map(normUrl));
  const excludeNames = (input.exclude?.names ?? []).filter((n) => typeof n === "string" && n.trim());
  const prevDigests = input.digests ?? {};
  const isExcludedName = (name?: string) => !!name && excludeNames.some((e) => sameEvent(e, name));

  const sources = (input.sources ?? [])
    .filter((u) => typeof u === "string" && /^https?:\/\//.test(u.trim()))
    .map((u) => u.trim())
    .slice(0, SOURCE_LIMIT);
  if (sources.length === 0) return { ok: false, reason: "no_sources" };

  const count = Math.min(Math.max(input.count ?? 3, 1), 20);
  const wishes: WishInput[] = (input.taste.wishes ?? [])
    .map((w): WishInput | null => {
      if (typeof w === "string") return w.trim() ? { title: w.trim() } : null;
      if (w && typeof w.title === "string" && w.title.trim()) {
        return {
          title: w.title.trim(),
          domain: typeof w.domain === "string" ? w.domain : undefined,
          id: typeof w.id === "string" ? w.id : undefined,
        };
      }
      return null;
    })
    .filter((w): w is WishInput => w !== null)
    .slice(0, 20);
  // 「興味・好み」=strong判定(直接合致)の材料、「興味・好みの関連キーワード」=
  // moderate判定(地続きの広がり)の材料。好み/興味は概念が重なり重複しやすいので
  // 1リストへ統合した(HANDOFF §8.14 優先度3)。
  const tasteSignals = (input.taste.taste ?? []).filter((i) => i && typeof i.label === "string" && i.label.trim()).slice(0, 30);
  const relatedSignals = (input.taste.related ?? []).filter((i) => i && typeof i.label === "string" && i.label.trim()).slice(0, 20);
  const livingArea = (input.taste.livingArea ?? "").trim() || DEFAULT_LIVING_AREA;

  // 願いのドメイン(Wish.category)が分かる場合は [ドメイン: …] を添えて渡す。
  // 層Cがこれを見て、その願いに応えるカードのkindをドメインに沿わせる
  // (HANDOFF-CURRENT.md §8.14 Issue 3)。ドメイン注記はsourceWishTitleの
  // 一致判定(BriefTab側、Wish.titleとの完全一致)を壊さないよう、願いの
  // 内容(title)そのものには含めない。
  const domainLabelOf = (id?: string) => ITEM_DOMAINS.find((d) => d.id === id)?.label;
  // 各願いに行頭で id を添える。層Cはこの id を sourceWishId として返し、
  // KEEP時の紐づけを文字一致でなく id で行う(言い換えに強い)。
  const wishIdSet = new Set(wishes.map((w) => w.id).filter((x): x is string => !!x));
  const wishesLine = wishes.length
    ? `願望リスト:\n${wishes
        .map((w) => {
          const label = domainLabelOf(w.domain);
          const idPart = w.id ? `(id: ${w.id}) ` : "";
          return label ? `- ${idPart}${w.title} [ドメイン: ${label}]` : `- ${idPart}${w.title}`;
        })
        .join("\n")}`
    : "願望リスト: なし";
  const tasteLine = `興味・好み: ${tasteSignals.length ? tasteSignals.map((i) => i.label).join(" / ") : "なし"}`;
  const relatedLine = `興味・好みの関連キーワード: ${relatedSignals.length ? relatedSignals.map((i) => i.label).join(" / ") : "なし"}`;
  // ゴール(と達成に効くキーワード)。層1はこれを見て goalId を返す。願いと同じく
  // 行頭にidを添え、返ってきたidは渡したidに一致する時だけ採用する(捏造を弾く)。
  const goals = (input.taste.goals ?? []).filter((g) => g && typeof g.title === "string" && g.title.trim()).slice(0, 10);
  const goalIdSet = new Set(goals.map((g) => g.id).filter((x): x is string => !!x));
  const goalTitleById = new Map(goals.filter((g) => g.id).map((g) => [g.id as string, g.title]));
  const goalsLine = goals.length
    ? `ゴール:\n${goals
        .map((g) => `- ${g.id ? `(id: ${g.id}) ` : ""}${g.title}${g.keywords.length ? ` ／ 効くキーワード: ${g.keywords.join(" / ")}` : ""}`)
        .join("\n")}`
    : "ゴール: なし";
  const tasteBlockClassify = `${wishesLine}\n${tasteLine}\n${relatedLine}\n${goalsLine}`;
  // 層E(本文詳細化)の「誘い1文」の根拠に使う。ウィッシュは含めず興味・好み・関連キーワードだけ。
  const tasteBlockEnrich = `${tasteLine}\n${relatedLine}`;

  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayJp = `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;

  try {
    // 情報源の取得は同時数を絞る(全部一度に投げるとJina無料枠の429で多数が
    // 失敗し、候補が激減する)。SITE_FETCH_CONCURRENCY ずつ + fetchViaJinaの再試行で
    // 取得成功率を上げる。
    const siteFetches = await mapWithConcurrency(sources, SITE_FETCH_CONCURRENCY, (s) => fetchSite(s));
    let tokens = ZERO_USAGE;

    // Q3: 取得できた各サイトの内容ハッシュを計算し、前回(input.digests)と一致する
    // サイトは「更新なし」とみなして抽出対象から外す(Geminiに渡さない=トークン節約)。
    // digests は今回取得できた全サイトの最新ハッシュを返す(Cronが保存し次回渡す)。
    const forceFresh = !!input.forceFresh;
    const digests: Record<string, string> = {};
    const unchangedKeys = new Set<string>();
    for (const r of siteFetches) {
      if (!r.fetched || !r.md) continue;
      const k = normUrl(r.url);
      const h = contentHash(r.md);
      digests[k] = h;
      // forceFresh(手動生成)のときは更新なし判定自体をしない=全部抽出する。
      if (!forceFresh && prevDigests[k] && prevDigests[k] === h) unchangedKeys.add(k);
    }
    const sites: SiteTrace[] = siteFetches.map((r) => ({
      ...r.trace,
      unchanged: r.fetched && !!r.md && unchangedKeys.has(normUrl(r.url)),
    }));
    const pagesRead: PageReadTrace[] = siteFetches.map((r) => ({ url: r.url, ok: r.fetched }));

    // 更新の無いサイト(前回とダイジェスト一致)は抽出対象から外す(Geminiに
    // 渡さない=トークン節約)。ただし**全サイトが更新なしでも0枚にはしない**:
    // その場合は取得できた全サイトを抽出対象にフォールバックする(トークンより
    // 「デッキが空にならない」ことを優先。展覧会・雑誌の一覧は日々ほぼ同内容で、
    // 更新なしスキップだけだと容易に0枚になっていた=ユーザー報告の主因)。
    const fetchedSites = siteFetches.filter((r) => r.fetched && r.md);
    let usable = fetchedSites.filter((r) => !unchangedKeys.has(normUrl(r.url)));
    if (usable.length === 0) usable = fetchedSites;
    if (usable.length === 0) {
      return {
        ok: true, cards: [], candidateCount: 0, records: [], sites, pagesRead,
        dropped: ZERO_DROPS, tokens, digests,
        note: "情報源ページを取得できませんでした。",
      };
    }

    const validUrlSet = new Set<string>();
    for (const s of usable) {
      validUrlSet.add(normUrl(s.url));
      for (const k of s.allow.keys()) validUrlSet.add(k);
    }
    // ---- 層1: サイトごとに1回ずつ並列で抽出＋関連度付け ----------------------
    // 1サイトあたり LISTING_TEXT_LIMIT(12,000字)までたっぷり渡し、そのサイトから
    // EXTRACT_LIMIT_PER_SITE(10)件まで拾わせる。全サイトを1回にまとめていた頃は
    // 1サイト約3,300字・全体で10件程度しか返らなかった(§8.19)。
    const nowMs = Date.now();
    let dropSourceInvalid = 0, dropExpired = 0, dropDup = 0, dropOutOfArea = 0;
    const candidates: CandidateRecord[] = [];
    const seenCandidate = new Set<string>();

    // 抽出した生候補を検証してcandidatesへ入れる(層1の呼び出し元から共通で使う)。
    // validUrls は「そのページで実在が確認できたURLの集合」(捏造URLを弾く)。
    const acceptRaw = (raw: ExtractedCandidate[], site: string, validUrls: Set<string>) => {
      for (const c of raw) {
        const name = (c.name ?? "").trim();
        const su = (c.sourceUrl ?? "").trim();
        if (!name) continue;
        if (!su || !validUrls.has(normUrl(su))) { dropSourceInvalid++; continue; }
        if (c.end) {
          const t = Date.parse(c.end);
          if (!Number.isNaN(t) && t < nowMs) { dropExpired++; continue; }
        }
        if (c.inLivingArea === false) { dropOutOfArea++; continue; }
        // 既に作った/KEEP済みのカードと同じもの(URL・名称)は作らない。
        if (excludeUrlSet.has(normUrl(su)) || isExcludedName(name)) { dropDup++; continue; }
        const k = `${normUrl(su)}|${name.toLowerCase()}`;
        if (seenCandidate.has(k)) { dropDup++; continue; }
        // 表記ゆれ(会場・年などの付帯情報の有無)で同じ事物が複数返ることがある。
        // サイトを跨いでも名称が実質同じなら1件にまとめる。
        if (candidates.some((x) => x.name && sameEvent(x.name, name))) { dropDup++; continue; }
        seenCandidate.add(k);
        candidates.push({
          name, summary: c.summary, venue: c.venue, area: c.area,
          start: c.start, end: c.end, price: c.price, sourceUrl: su, site,
          relevance: typeof c.relevance === "number" ? Math.max(0, Math.min(100, Math.round(c.relevance))) : 0,
          kind: typeof c.kind === "string" ? c.kind : undefined,
          inLivingArea: c.inLivingArea,
          sourceWishId: typeof c.sourceWishId === "string" ? c.sourceWishId : undefined,
          // AIが返したゴールidは、渡したidに一致する時だけ採用する(捏造を弾く)。
          goalId: typeof c.goalId === "string" && goalIdSet.has(c.goalId) ? c.goalId : undefined,
        });
      }
    };

    const extractResults = await mapWithConcurrency(usable, EXTRACT_CONCURRENCY, async (s) => {
      const r = await callGemini(
        key, SYSTEM_EXTRACT,
        userExtract(todayJp, livingArea, tasteBlockClassify, EXTRACT_LIMIT_PER_SITE, s.url, s.md.slice(0, LISTING_TEXT_LIMIT)),
        true, 8192,
      );
      if (!r.ok) return { site: s.url, usage: ZERO_USAGE, raw: [] as ExtractedCandidate[], valid: s.allow };
      return { site: s.url, usage: r.usage, raw: extractJsonArray<ExtractedCandidate>(r.text) ?? [], valid: s.allow };
    });
    for (let i = 0; i < extractResults.length; i++) {
      const res = extractResults[i];
      tokens = addUsage(tokens, res.usage);
      // そのサイトのページ自身のURLと、本文中に実在したリンクだけを許す。
      const valid = new Set<string>([normUrl(usable[i].url), ...res.valid.keys()]);
      acceptRaw(res.raw, sources.find((x) => normUrl(x) === normUrl(res.site)) ?? res.site, valid);
    }

    // ---- 補充検索: 候補が少ない日は興味キーワードでJina検索して足す ----------
    // 登録情報源が主で、これは足りない時だけの補完(ユーザー指定)。検索結果(SERP)の
    // Markdownを同じ層1プロンプトへ渡すので、追加のプロンプトは要らない。
    let searched = 0;
    if (candidates.length < SEARCH_TOPUP_THRESHOLD && tasteSignals.length) {
      const queries = tasteSignals.slice(0, SEARCH_QUERY_LIMIT).map((t) => t.label);
      const serps = await mapWithConcurrency(queries, 2, (q) => fetchJinaSearch(q));
      const serpUsable = serps.filter((s) => s.ok && s.md);
      searched = serpUsable.length;
      const serpResults = await mapWithConcurrency(serpUsable, EXTRACT_CONCURRENCY, async (s) => {
        const r = await callGemini(
          key, SYSTEM_EXTRACT,
          userExtract(todayJp, livingArea, tasteBlockClassify, EXTRACT_LIMIT_PER_SITE, s.url, s.md.slice(0, LISTING_TEXT_LIMIT)),
          true, 8192,
        );
        if (!r.ok) return { usage: ZERO_USAGE, raw: [] as ExtractedCandidate[], allow: s.allow };
        return { usage: r.usage, raw: extractJsonArray<ExtractedCandidate>(r.text) ?? [], allow: s.allow };
      });
      for (const res of serpResults) {
        tokens = addUsage(tokens, res.usage);
        acceptRaw(res.raw, "検索", new Set<string>(res.allow.keys()));
      }
    }

    // 可観測性: サイト別に抽出できた候補数を各トレースへ入れる。
    const candCountBySite = new Map<string, number>();
    for (const c of candidates) { if (c.site) candCountBySite.set(c.site, (candCountBySite.get(c.site) ?? 0) + 1); }
    for (const s of sites) { s.candidates = candCountBySite.get(s.source) ?? 0; }
    if (candidates.length === 0) {
      return {
        ok: true, cards: [], candidateCount: 0, records: [], sites, pagesRead, digests,
        dropped: { ...ZERO_DROPS, sourceInvalid: dropSourceInvalid, expired: dropExpired, duplicateCandidate: dropDup, outOfArea: dropOutOfArea },
        tokens, note: "候補が抽出できませんでした。",
      };
    }

    // ---- 選抜(コードのみ): 関連度順・サイト横断のラウンドロビンで上位 count 枚 ----
    // AIに「落とす」判断はさせない。関連度の高い順に、1サイトから偏らないよう
    // ラウンドロビンで採る。提案優先(relevance>=50)で埋め、余った枠を情報カード
    // (<50)で満たす。この構造上、候補が1件でもあれば0枚にはならない。
    type PoolItem = { card: GeneratedCard; site?: string; geoQuery?: string; relevance: number };
    const toPoolItem = (c: CandidateRecord): PoolItem => {
      const relevance = c.relevance ?? 0;
      // ゴールに効く候補は「提案カード」として扱う(関連度が低くても情報カードには
      // しない。目標の達成に役立つこと自体が提案の理由になるため)。
      const isGoal = !!c.goalId;
      const isInfo = !isGoal && relevance < PROPOSAL_MIN_RELEVANCE;
      const isDerived = !isGoal && !isInfo && relevance < STRONG_MIN_RELEVANCE;
      const geoParts = [c.venue, c.area].map((s) => (s ?? "").trim()).filter(Boolean);
      const geoQuery = Array.from(new Set(geoParts)).join(" ").trim();
      return {
        relevance, site: c.site, geoQuery: geoQuery || undefined,
        card: {
          title: c.name, body: c.summary ?? "", kind: c.kind ?? "info",
          // triggerはコードが決める(AIに書かせない=ぶれない)。
          trigger: isGoal ? GOAL_TRIGGER : isInfo ? "新着" : isDerived ? DERIVED_TRIGGER : "興味との一致",
          area: c.area, sourceUrl: c.sourceUrl, expiresAt: c.end,
          isDerived, isInfo,
          // AIが返した願いのidは、渡したidに一致する時だけ採用する(捏造を弾く)。
          sourceWishId: !isInfo && c.sourceWishId && wishIdSet.has(c.sourceWishId) ? c.sourceWishId : undefined,
          // ゴールidは検証済み。表示用のゴール名はコード側で引く(AIに書かせない)。
          goalId: c.goalId,
          goalTitle: c.goalId ? goalTitleById.get(c.goalId) : undefined,
        },
      };
    };
    const byRelevanceDesc = (a: PoolItem, b: PoolItem) => b.relevance - a.relevance;
    const pool = candidates.filter((c) => c.name && (c.summary ?? "").trim()).map(toPoolItem).sort(byRelevanceDesc);
    const groupBySite = (items: PoolItem[]): PoolItem[][] => {
      const bySite = new Map<string, PoolItem[]>();
      for (const item of items) {
        const k = item.site ?? "__unknown__";
        if (!bySite.has(k)) bySite.set(k, []);
        const g = bySite.get(k)!;
        if (g.length < SITE_CARD_LIMIT) g.push(item); // 1サイト上限
      }
      return Array.from(bySite.values());
    };
    const roundRobin = (groups: PoolItem[][], limit: number): PoolItem[] => {
      const out: PoolItem[] = [];
      let progressed = true;
      while (out.length < limit && progressed) {
        progressed = false;
        for (const g of groups) {
          if (g.length === 0) continue;
          out.push(g.shift()!);
          progressed = true;
          if (out.length >= limit) break;
        }
      }
      return out;
    };
    // ゴール関連カードは「週に1〜2枚」の方針(ユーザー指定)。呼び出し側が直近7日の
    // 実績から算出した goalQuota の枚数だけ、他と競争させずに先に確保する。
    // 1ゴールにつき1枚まで(同じゴールのカードで枠を埋めない)。
    const goalQuota = Math.max(0, Math.min(input.goalQuota ?? 0, count));
    const goalItems: PoolItem[] = [];
    if (goalQuota > 0) {
      const usedGoals = new Set<string>();
      for (const p of pool) {
        if (goalItems.length >= goalQuota) break;
        const gid = p.card.goalId;
        if (!gid || usedGoals.has(gid)) continue;
        usedGoals.add(gid);
        goalItems.push(p);
      }
    }
    const goalPicked = new Set(goalItems);
    const rest = pool.filter((p) => !goalPicked.has(p));
    const proposals = rest.filter((p) => !p.card.isInfo);
    const infos = rest.filter((p) => p.card.isInfo);
    let finalItems: PoolItem[] = [...goalItems];
    if (finalItems.length < count) {
      finalItems = [...finalItems, ...roundRobin(groupBySite(proposals), count - finalItems.length)];
    }
    if (finalItems.length < count) {
      finalItems = [...finalItems, ...roundRobin(groupBySite(infos), count - finalItems.length)];
    }
    // 提案・情報を合わせてもサイト上限で埋まらない場合は、上限を無視して
    // 関連度順に足す(枚数を優先。0枚・極端な少数を避けるための最後の手当て)。
    if (finalItems.length < count) {
      const used = new Set(finalItems.map((f) => f.card.sourceUrl ?? f.card.title));
      for (const p of pool) {
        if (finalItems.length >= count) break;
        const k = p.card.sourceUrl ?? p.card.title;
        if (used.has(k)) continue;
        used.add(k);
        finalItems.push(p);
      }
    }
    // トレース用: 採用しきれずに落ちた総数。
    const dropOverQuota = Math.max(0, pool.length - finalItems.length);
    const irrelevant = 0; // 関連度で落とす方式に変えたため「無関係で除外」は無い

    // 会場/エリアを持つカードにPlacesで実座標を付ける(展覧会など「行く場所」の
    // カードが、AREA_LATLNGに無いエリアでも地図にピンとして出るように)。
    // GOOGLE_PLACES_API_KEY未設定なら何もしない(=座標なし=従来どおり)。最終
    // 採用分だけ・並列で名寄せするのでコストと待ち時間を抑える。
    await mapWithConcurrency(finalItems, 4, async (it) => {
      if (!it.geoQuery || typeof it.card.lat === "number") return;
      const g = await geocodePlace(it.geoQuery);
      if (g) { it.card.lat = g.lat; it.card.lng = g.lng; if (g.placeId) it.card.placeId = g.placeId; }
    });
    const cards: GeneratedCard[] = finalItems.map((x) => x.card);

    // 層E: 採用が確定したカードだけ、個別ページを追加取得して本文を詳細化する
    // (全候補ではなく最終的にデッキへ入る分だけなのでコストを抑えられる)。
    const enrich = await enrichCardBodies(key, todayJp, tasteBlockEnrich, cards);
    tokens = addUsage(tokens, enrich.usage);

    return {
      ok: true, cards: enrich.cards, candidateCount: candidates.length, records: candidates,
      sites, pagesRead: [...pagesRead, ...enrich.pagesRead], digests,
      dropped: {
        sourceInvalid: dropSourceInvalid,
        expired: dropExpired,
        duplicateCandidate: dropDup,
        outOfArea: dropOutOfArea,
        irrelevant,
        overQuota: dropOverQuota,
      },
      tokens,
      // 補充検索が働いた回・枚数が目標に届かなかった回は、その事実を残す
      // (実機で「なぜ少ないのか」を状況表示から追えるようにする)。
      note: [
        searched ? `補充検索${searched}件を使用` : "",
        finalItems.length < count ? `候補が足りず${finalItems.length}枚` : "",
      ].filter(Boolean).join(" / ") || undefined,
    };
  } catch (e) {
    return { ok: false, reason: "fetch_failed", detail: e instanceof Error ? e.message : String(e) };
  }
}

// (KEEP/SKIP分析はGeminiでなく Cowork の週次タスクが days/*/feedback.md を読んで
//  推論込みで行う(精度が要る分析はCowork側・ユーザー指定)。以前ここに置いた
//  夜間Gemini分析(analyzeTaste)は撤回した。夜間Cronは分析せず、Coworkが書いた
//  taste-state.md をチップへ毎晩コピーするだけ。)
