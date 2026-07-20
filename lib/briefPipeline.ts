// ブリーフ生成の共通パイプライン。実験ルート(app/api/generate-brief)と
// 夜間Cron(app/api/cron/build-brief)の両方がこの buildDeck() を使う。
//
// retrieval は Jina Reader(https://r.jina.ai/<URL>)経由のクリーンMarkdown。
// 単ホップ: 情報源(一覧)ページ1枚のMarkdownから直接レコードを抽出し、各レコードの
// sourceUrl は一覧中の実在リンク(=個別ページの実URL)を使う。個別ページは取得しない
// (トークン節約)。段階:
//   取得(コード): 各情報源をJinaで取得し、実在URLの集合を機械抽出(捏造防止allowlist)。
//   層B(1回): 一覧Markdownから中立な候補レコードを抽出。sourceUrlはallowlistで検証。
//   層C(1回): 候補を strong/moderate/none に分類(除外・件数は判断させない)。
//   層D(コード): 生活圏/期限切れ/重複を検証し、strong→ストレート枠・moderate→派生枠に
//     コードが枚数を割り当てる。
//
// GEMINI_API_KEY / JINA_API_KEY は NEXT_PUBLIC_ を付けずサーバー側だけが読む。

import { ITEM_DOMAINS, kindsOfDomain } from "./constants";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const JINA_BASE = "https://r.jina.ai/";
const DEFAULT_LIVING_AREA = "東京23区(および電車で日常的に行ける範囲)";
const DERIVED_TRIGGER = "興味の広がり";

const EXTRACT_LIMIT_PER_LISTING = 10; // 層Bが1つの一覧から作る候補レコードの最大数
const LISTING_TEXT_LIMIT = 10000;     // 層Bに渡す1つの一覧Markdownの上限(文字数)
const TOTAL_TEXT_LIMIT = 30000;       // 層Bに渡す本文合計の上限(文字数、SOURCE_LIMIT分の一覧を賄う)
const SOURCE_LIMIT = 6;               // 1回の生成で読みに行く情報源(一覧)の最大数
const SITE_CARD_LIMIT = 3;            // 層Dで1つの情報源から採用するカードの最大数
const ENRICH_PAGE_TEXT_LIMIT = 6000;  // 層E(本文詳細化)で1個別ページに使う本文の上限(文字数)
const ENRICH_CONCURRENCY = 6;         // 層Eで個別ページを同時取得する数

// ---- 型 -------------------------------------------------------------------
export type InterestSignal = { label: string; weight: number };
// ウィッシュ(願望)は文字列(タイトルのみ)でも、Wish.category(ItemDomain)を
// 添えたオブジェクトでも受け取れる。domainがあれば層Cがそのウィッシュに
// 応えるカードのkindを、対応するドメインに沿った値へ優先的に揃える
// (HANDOFF-CURRENT.md §8.14 Issue 3)。
export type WishInput = { title: string; domain?: string };
export type TasteInput = {
  wishes?: (string | WishInput)[];
  taste?: InterestSignal[];    // 好み(比較的安定したジャンル・カルチャーの好み)
  interest?: InterestSignal[]; // 興味(時期によって変わる、今関心を持っていること)
  livingArea?: string;
};
export type TokenUsage = { promptTokens: number; candidateTokens: number; totalTokens: number; calls: number };
// unchanged: 前回のダイジェスト(内容ハッシュ)と一致し、抽出をスキップしたサイト。
export type SiteTrace = { source: string; fetched: boolean; linkCount: number; unchanged?: boolean };
export type PageReadTrace = { url: string; ok: boolean };
export type DropSummary = { sourceInvalid: number; expired: number; duplicateCandidate: number; outOfArea: number; irrelevant: number; overQuota: number };
export type GeneratedCard = {
  title: string; body: string; kind: string; trigger: string;
  area?: string; sourceUrl?: string; sourceLabel?: string; meta?: string[];
  expiresAt?: string; isDerived?: boolean; sourceWishTitle?: string;
  images?: string[]; // OGP画像(og:image)。無ければ未設定=色ベタ表示
};
export type CandidateRecord = {
  name: string; summary?: string; venue?: string; area?: string;
  start?: string; end?: string; price?: string; sourceUrl?: string;
  site?: string; // 由来する情報源(入力sources[]の1つ)。層Dのサイト別上限に使う
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
type ClassifiedCandidate = {
  id?: number; matchStrength?: string; inLivingArea?: boolean;
  title?: string; body?: string; kind?: string; trigger?: string;
  sourceWishTitle?: string; area?: string; sourceLabel?: string;
  meta?: string[]; expiresAt?: string;
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
async function fetchViaJina(url: string): Promise<FetchedPage> {
  try {
    const jinaKey = process.env.JINA_API_KEY;
    const headers: Record<string, string> = { Accept: "text/plain", "X-Return-Format": "markdown" };
    if (jinaKey) headers["Authorization"] = `Bearer ${jinaKey}`;
    const res = await fetch(JINA_BASE + url, { headers, signal: AbortSignal.timeout(30000) });
    if (!res.ok) return { url, ok: false, md: "" };
    const md = (await res.text()).trim();
    if (!md) return { url, ok: false, md: "" };
    return { url, ok: true, md };
  } catch {
    return { url, ok: false, md: "" };
  }
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
async function callGemini(
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
function extractJsonArray<T>(text: string): T[] | null {
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
const SYSTEM_CANDIDATES = `あなたは情報抽出パイプラインの候補抽出モジュールです。入力されるページのMarkdown本文だけを情報源として、そこに並ぶ個別の事物を候補レコードとしてJSON配列で出力します。

# 入力仕様
<基準日>: 判断の基準となる本日の日付
<抽出上限>: 1ページから作るレコードの最大件数
<ページ群>: 各ページのURLとMarkdown本文。本文には個別の催し・作品への [表示文](URL) 形式のリンクが含まれる

# 抽出ルール
1. レコードの全記述は、そのページ本文に明記された情報のみを根拠とする。本文に無い情報の補完・推測・一般知識の使用は禁止。名称が本文から特定できない事物はレコードにしない。
2. 1レコードは1つの事物を表す。ページ本文に並ぶ個別の催し・作品を、上限まで拾う。ナビゲーション・サイト案内・広告は事物ではない。
3. <基準日>時点で既に終了している事物はレコードにしない。開始日・終了日が本文から特定できる場合のみ start / end に記す。
4. sourceUrl は、その事物の個別ページを指す、本文中に実在するリンクのURLをそのまま用いる。URLの生成・改変・補完は禁止。個別リンクが本文に無い事物は、そのページ自体のURLを用いる。
5. 評価・推薦・誇張はしない。事実の要約のみを記す。
6. 下記スキーマのJSON配列のみを出力する。該当がなければ [] を出力する。

# 出力スキーマ
name / summary / venue(任意) / area(任意) / start(任意,ISO8601) / end(任意,ISO8601) / price(任意) / sourceUrl`;

// 願望の4ドメイン(Wish.category)→kindの対応表。願いに直接応えるカードの
// kindを揃えるための固定テーブルで、constants.ts(ITEM_DOMAINS/kindsOfDomain)
// から動的に生成する(プロンプトとコードのドメイン定義が食い違わないように)。
const DOMAIN_KIND_TABLE = ITEM_DOMAINS
  .map((d) => {
    const kinds = kindsOfDomain(d.id).map((k) => k.id);
    return `  ${d.label} → ${kinds.join("・")}${kinds.length > 1 ? " のいずれか" : ""}`;
  })
  .join("\n");

const SYSTEM_CLASSIFY = `あなたは情報編成パイプラインの候補分類モジュールです。候補レコードを1件ずつプロファイルと照合し、分類結果をJSON配列で出力します。候補を残すか除外するか、何件にするかの判断はしません。

# 入力仕様
<基準日>: 判断の基準となる本日の日付
<生活圏>: 提案対象とする地理的範囲
<プロファイル>: ユーザーの関心を表す3つの信号
  願望リスト: 具体的な願い。各行は「- 内容」または「- 内容 [ドメイン: …]」の形式(ドメインが分かる場合のみ付与)
  好み: 比較的安定した、ジャンル・カルチャーの好み
  興味: 今、関心を持っている物事(時期によって変わる)
<候補一覧>: 候補レコード(JSON配列)。各要素は id を持つ

# ドメインとkindの対応表(願いに応えるカードのkind選択に使う)
${DOMAIN_KIND_TABLE}

# 分類ルール
1. 記述は候補レコードに含まれる情報のみを根拠とする。レコードに無い情報の補完・推測は禁止。
2. 入力された候補は1件も省略せず、すべてについて分類結果を出力する。
3. matchStrength は候補とプロファイルとの関係で判定する。
   "strong": 願望リスト・好みのいずれかに直接合致する候補
   "moderate": 興味に合致する、または好みに近接するが一致はしない候補
   "none": プロファイルのいずれとも関連が無い候補
4. matchStrength が "none" の候補は id と matchStrength のみを出力する。他のフィールドは出力しない。
5. matchStrength が "strong" または "moderate" の候補は、id・matchStrength に加えて以下も出力する。
   inLivingArea: 候補の所在地が<生活圏>内かどうか。所在地の記述が無い候補は true とする。
   title: 事物が分かる短い見出し
   body: 事物そのものの内容を1〜3文で要約する(何が・どこで・いつ等、候補レコードに書かれた事実に基づく)。プロファイルとの合致理由や「〜に関心がある人にとって」等のユーザーへの言及・意義づけは書かない
   kind: "place" | "exhibition" | "live" | "activity" | "food" | "movie" | "book" | "album" | "info" | "thing"。sourceWishTitleを付ける場合は、対応する願いのドメインがあれば上記対応表に沿ったkindを優先する
   trigger: matchStrength が "strong" のとき、時期が理由なら "タイムリー"、好みが理由なら "興味との一致"、場所・地域性が理由なら "ロケーション"。matchStrength が "moderate" のときは "興味の広がり"。
   sourceWishTitle: 願望リストのいずれかに直接応える場合のみ、その願いの内容部分([ドメイン: …]を含まない)を一字一句同じ文字列で記す(任意)
   area・sourceLabel・meta・expiresAt: 候補レコードに情報があれば記す(任意)
6. matchStrength が "strong" どうし・"moderate" どうしは、それぞれの集合の中でプロファイルとの合致度が高い順に並べて出力する。

# 出力契約
下記フィールドのJSON配列のみを出力する。該当候補が無い場合は [] を出力する。
id / matchStrength / inLivingArea(任意) / title(任意) / body(任意) / kind(任意) / trigger(任意) / sourceWishTitle(任意) / area(任意) / sourceLabel(任意) / meta(任意,文字列配列) / expiresAt(任意,ISO8601)`;

const SYSTEM_ENRICH_BODY = `あなたは情報編成パイプラインの本文詳細化モジュールです。既に選ばれたカードごとに、
その事物の個別ページ本文を読み、カードの本文(body)をより具体的な内容要約に書き直します。

# 入力仕様
<基準日>: 本日の日付
<カード群>: 各カードの id・title・現在の body・sourcePage(その事物の個別ページのMarkdown本文)

# 書き直しルール
1. body は sourcePage 本文に明記された情報のみを根拠とする。本文に無い情報の補完・
   推測・一般知識の使用は禁止。
2. body は3〜5文(120〜200字程度)で、その事物そのものの内容を具体的に述べる。
   何の展示・作品か、誰(作家・出演者・監督等)によるものか、テーマや背景、
   何が見どころか、会場・会期・料金など、本文から読み取れる具体的な事実を
   できるだけ盛り込む。固有名や数字を省略せず、内容が薄い一般論で終わらせない。
3. ユーザーへの言及・意義づけ(「〜に関心がある人にとって」等)・評価・誇張は
   書かない。事実の要約のみ。
4. sourcePage から書き直す情報が読み取れない場合は、現在の body をそのまま返す。
5. title は変更しない。

# 出力契約
下記フィールドのJSON配列のみを出力する。入力カードは1件も省略しない。
id / body`;

function userCandidates(todayJp: string, extractLimit: number, pageBlocks: string): string {
  return `<基準日>${todayJp}</基準日>\n<抽出上限>${extractLimit}</抽出上限>\n<ページ群>\n${pageBlocks}\n</ページ群>`;
}
function userClassify(todayJp: string, livingArea: string, tasteBlock: string, candidatesJson: string): string {
  return `<基準日>${todayJp}</基準日>\n<生活圏>${livingArea}</生活圏>\n<プロファイル>\n${tasteBlock}\n</プロファイル>\n<候補一覧>\n${candidatesJson}\n</候補一覧>`;
}
function userEnrich(todayJp: string, blocks: string): string {
  return `<基準日>${todayJp}</基準日>\n<カード群>\n${blocks}\n</カード群>`;
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
  key: string, todayJp: string, cards: GeneratedCard[],
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

  const blocks = withUrl
    .map(({ c, i }) => {
      const page = pageByUrl.get(c.sourceUrl!);
      if (!page || !page.ok || !page.md) return "";
      const text = stripMarkdownNoise(page.md).slice(0, ENRICH_PAGE_TEXT_LIMIT);
      return `<カード id="${i}" title="${c.title}">\n<現在のbody>${c.body}</現在のbody>\n<個別ページ>\n${text}\n</個別ページ>\n</カード>`;
    })
    .filter(Boolean)
    .join("\n");
  if (!blocks) return { cards: out, usage: ZERO_USAGE, pagesRead };

  const r = await callGemini(key, SYSTEM_ENRICH_BODY, userEnrich(todayJp, blocks), true, 8192);
  if (!r.ok) return { cards: out, usage: ZERO_USAGE, pagesRead };

  const rewritten = extractJsonArray<{ id?: number; body?: string }>(r.text) ?? [];
  for (const item of rewritten) {
    if (typeof item.id !== "number" || !out[item.id]) continue;
    if (typeof item.body === "string" && item.body.trim()) out[item.id] = { ...out[item.id], body: item.body.trim() };
  }
  return { cards: out, usage: r.usage, pagesRead };
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
}): Promise<BuildResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: "no_key" };

  const excludeUrlSet = new Set((input.exclude?.urls ?? []).filter((u) => typeof u === "string").map(normUrl));
  const excludeNames = (input.exclude?.names ?? []).filter((n) => typeof n === "string" && n.trim());
  const prevDigests = input.digests ?? {};
  const isExcludedName = (name?: string) => !!name && excludeNames.some((e) => namesLikelyMatch(e, name));

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
        return { title: w.title.trim(), domain: typeof w.domain === "string" ? w.domain : undefined };
      }
      return null;
    })
    .filter((w): w is WishInput => w !== null)
    .slice(0, 20);
  // 好み(taste)=strong判定、興味(interest)=moderate判定の材料。以前は単一の
  // 興味リストを重み順で上下半分に割って強い/弱いを作っていたが、好み/興味を
  // 明示的な別カテゴリとして扱うようになったため、その区分をそのまま使う。
  const tasteSignals = (input.taste.taste ?? []).filter((i) => i && typeof i.label === "string" && i.label.trim()).slice(0, 20);
  const interestSignals = (input.taste.interest ?? []).filter((i) => i && typeof i.label === "string" && i.label.trim()).slice(0, 20);
  const livingArea = (input.taste.livingArea ?? "").trim() || DEFAULT_LIVING_AREA;

  // 願いのドメイン(Wish.category)が分かる場合は [ドメイン: …] を添えて渡す。
  // 層Cがこれを見て、その願いに応えるカードのkindをドメインに沿わせる
  // (HANDOFF-CURRENT.md §8.14 Issue 3)。ドメイン注記はsourceWishTitleの
  // 一致判定(BriefTab側、Wish.titleとの完全一致)を壊さないよう、願いの
  // 内容(title)そのものには含めない。
  const domainLabelOf = (id?: string) => ITEM_DOMAINS.find((d) => d.id === id)?.label;
  const wishesLine = wishes.length
    ? `願望リスト:\n${wishes
        .map((w) => {
          const label = domainLabelOf(w.domain);
          return label ? `- ${w.title} [ドメイン: ${label}]` : `- ${w.title}`;
        })
        .join("\n")}`
    : "願望リスト: なし";
  const tasteLine = `好み: ${tasteSignals.length ? tasteSignals.map((i) => i.label).join(" / ") : "なし"}`;
  const interestLine = `興味: ${interestSignals.length ? interestSignals.map((i) => i.label).join(" / ") : "なし"}`;
  const tasteBlockClassify = `${wishesLine}\n${tasteLine}\n${interestLine}`;

  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayJp = `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;

  try {
    const siteFetches = await Promise.all(sources.map((s) => fetchSite(s)));
    let tokens = ZERO_USAGE;

    // Q3: 取得できた各サイトの内容ハッシュを計算し、前回(input.digests)と一致する
    // サイトは「更新なし」とみなして抽出対象から外す(Geminiに渡さない=トークン節約)。
    // digests は今回取得できた全サイトの最新ハッシュを返す(Cronが保存し次回渡す)。
    const digests: Record<string, string> = {};
    const unchangedKeys = new Set<string>();
    for (const r of siteFetches) {
      if (!r.fetched || !r.md) continue;
      const k = normUrl(r.url);
      const h = contentHash(r.md);
      digests[k] = h;
      if (prevDigests[k] && prevDigests[k] === h) unchangedKeys.add(k);
    }
    const sites: SiteTrace[] = siteFetches.map((r) => ({
      ...r.trace,
      unchanged: r.fetched && !!r.md && unchangedKeys.has(normUrl(r.url)),
    }));
    const pagesRead: PageReadTrace[] = siteFetches.map((r) => ({ url: r.url, ok: r.fetched }));

    const usable = siteFetches.filter((r) => r.fetched && r.md && !unchangedKeys.has(normUrl(r.url)));
    if (usable.length === 0) {
      const anyFetched = siteFetches.some((r) => r.fetched && r.md);
      return {
        ok: true, cards: [], candidateCount: 0, records: [], sites, pagesRead,
        dropped: ZERO_DROPS, tokens, digests,
        note: anyFetched ? "取得できた情報源に前回からの更新がありませんでした。" : "情報源ページを取得できませんでした。",
      };
    }

    const validUrlSet = new Set<string>();
    for (const s of usable) {
      validUrlSet.add(normUrl(s.url));
      for (const k of s.allow.keys()) validUrlSet.add(k);
    }
    // 候補のURLがどの情報源(サイト)に由来するかを調べる(層Dのサイト別上限用)。
    // 入力sources[]の順にsiteFetchesと対応しているのでインデックスで引ける。
    function originSiteFor(url: string): string | undefined {
      const k = normUrl(url);
      for (let i = 0; i < siteFetches.length; i++) {
        const s = siteFetches[i];
        if (!s.fetched) continue;
        if (normUrl(s.url) === k || s.allow.has(k)) return sources[i];
      }
      return undefined;
    }

    // 層B: 一覧Markdownから直接、候補レコードをまとめて1回で抽出(単ホップ)。
    let budget = TOTAL_TEXT_LIMIT;
    const pageBlocks = usable
      .map((s) => {
        if (budget <= 0) return "";
        const slice = s.md.slice(0, Math.min(LISTING_TEXT_LIMIT, budget));
        budget -= slice.length;
        return `<ページ url="${s.url}">\n${slice}\n</ページ>`;
      })
      .filter(Boolean)
      .join("\n");

    const rB = await callGemini(key, SYSTEM_CANDIDATES, userCandidates(todayJp, EXTRACT_LIMIT_PER_LISTING, pageBlocks), true, 8192);
    if (!rB.ok) return { ok: false, reason: `gemini_${rB.status}`, detail: rB.detail };
    tokens = addUsage(tokens, rB.usage);
    const rawCandidates = extractJsonArray<CandidateRecord>(rB.text) ?? [];

    const nowMs = Date.now();
    const seenCandidate = new Set<string>();
    let dropSourceInvalid = 0, dropExpired = 0, dropDup = 0;
    const candidates: CandidateRecord[] = [];
    for (const c of rawCandidates) {
      const su = (c.sourceUrl ?? "").trim();
      if (!su || !validUrlSet.has(normUrl(su))) { dropSourceInvalid++; continue; }
      if (c.end) {
        const t = Date.parse(c.end);
        if (!Number.isNaN(t) && t < nowMs) { dropExpired++; continue; }
      }
      // Q2: 前回までに既に作った/KEEP済みのカードと同じもの(同じURL・同じ名称)は
      // 作らない。dropDup(重複)に集計する。
      if (excludeUrlSet.has(normUrl(su)) || isExcludedName(c.name)) { dropDup++; continue; }
      const k = `${normUrl(su)}|${(c.name ?? "").trim().toLowerCase()}`;
      if (seenCandidate.has(k)) { dropDup++; continue; }
      // 同じ一覧から同一の事物が名称の表記ゆれ(会場・年などの付帯情報の
      // 有無)で複数レコードとして抽出されることがある。URLが違っても
      // 名称が実質同じなら、この段階で1件にまとめておく(そのまま層C・層Dへ
      // 進むと、Geminiが分類のたびに独自の言い回しでtitleを書き直すため、
      // 最終的な重複除去(名称の緩い一致)をすり抜けやすくなる)。
      if (c.name && candidates.some((x) => x.name && namesLikelyMatch(x.name, c.name!))) { dropDup++; continue; }
      seenCandidate.add(k);
      candidates.push({ ...c, site: originSiteFor(su) });
    }
    if (candidates.length === 0) {
      return {
        ok: true, cards: [], candidateCount: 0, records: [], sites, pagesRead, digests,
        dropped: { ...ZERO_DROPS, sourceInvalid: dropSourceInvalid, expired: dropExpired, duplicateCandidate: dropDup },
        tokens, note: "候補が抽出できませんでした。",
      };
    }

    // 層C: 候補を1件ずつ分類するだけ。
    const idxCandidates = candidates.map((c, id) => ({ id, ...c }));
    const rC = await callGemini(key, SYSTEM_CLASSIFY, userClassify(todayJp, livingArea, tasteBlockClassify, JSON.stringify(idxCandidates)), true, 8192);
    if (!rC.ok) return { ok: false, reason: `gemini_${rC.status}`, detail: rC.detail };
    tokens = addUsage(tokens, rC.usage);
    const rawClassified = extractJsonArray<ClassifiedCandidate>(rC.text) ?? [];

    // 層D: コードが「載せる/何件か」を決める。出典URLはidで候補から引く。
    type PoolItem = { card: GeneratedCard; site?: string };
    let dropExpired2 = 0, dropOutOfArea = 0, irrelevant = 0;
    const strongPool: PoolItem[] = [];
    const moderatePool: PoolItem[] = [];
    for (const r of rawClassified) {
      const src = typeof r.id === "number" ? candidates[r.id] : undefined;
      if (!src) continue;
      if (!r.matchStrength || r.matchStrength === "none") { irrelevant++; continue; }
      if (r.matchStrength !== "strong" && r.matchStrength !== "moderate") continue;
      if (r.inLivingArea === false) { dropOutOfArea++; continue; }
      if (r.expiresAt) {
        const t = Date.parse(r.expiresAt);
        if (!Number.isNaN(t) && t < Date.now()) { dropExpired2++; continue; }
      }
      if (!r.title || !r.body || !r.kind) continue;
      const isDerived = r.matchStrength === "moderate";
      const card: GeneratedCard = {
        title: r.title, body: r.body, kind: r.kind,
        trigger: r.trigger ?? (isDerived ? DERIVED_TRIGGER : "興味との一致"),
        area: r.area, sourceUrl: src.sourceUrl, sourceLabel: r.sourceLabel,
        meta: r.meta, expiresAt: r.expiresAt, isDerived, sourceWishTitle: r.sourceWishTitle,
      };
      (isDerived ? moderatePool : strongPool).push({ card, site: src.site });
    }

    // サイト横断の重複統合(名称の緩い一致のみ。strong優先)。
    let dropDupClassified = 0;
    const acceptedStrong: PoolItem[] = [];
    const acceptedModerate: PoolItem[] = [];
    for (const pool of [{ list: strongPool, bucket: acceptedStrong }, { list: moderatePool, bucket: acceptedModerate }]) {
      for (const item of pool.list) {
        // 層Cがタイトルを言い換えるため、層Bの名称では拾えなかった既出カードとの
        // 重複を、最終タイトルで改めて弾く(Q2)。
        if (isExcludedName(item.card.title) || (item.card.sourceUrl && excludeUrlSet.has(normUrl(item.card.sourceUrl)))) {
          dropDupClassified++; continue;
        }
        const dup =
          acceptedStrong.some((a) => namesLikelyMatch(a.card.title, item.card.title)) ||
          acceptedModerate.some((a) => namesLikelyMatch(a.card.title, item.card.title));
        if (dup) { dropDupClassified++; continue; }
        pool.bucket.push(item);
      }
    }

    // 枚数配分(コードが決める)。1つの情報源(サイト)から採用するのは最大
    // SITE_CARD_LIMIT件まで(1サイトが一覧を丸ごと占有しないための上限。
    // gotokyoのような巨大ポータル1つに偏るのを防いだ経緯そのもの)。
    // 派生(興味の広がり)は全体で最大1枚のみ、サイトを問わない。
    // count は全体の安全弁(上限)であって、埋めにいく目標ではない。
    const bySite = new Map<string, PoolItem[]>();
    for (const item of acceptedStrong) {
      const key = item.site ?? "__unknown__";
      if (!bySite.has(key)) bySite.set(key, []);
      bySite.get(key)!.push(item);
    }
    let dropOverQuota = 0;
    const straightCards: GeneratedCard[] = [];
    for (const items of bySite.values()) {
      const take = items.slice(0, SITE_CARD_LIMIT);
      dropOverQuota += items.length - take.length;
      straightCards.push(...take.map((x) => x.card));
    }
    const derivedTake = acceptedModerate.slice(0, 1);
    dropOverQuota += Math.max(0, acceptedModerate.length - derivedTake.length);
    let cards: GeneratedCard[] = [...straightCards, ...derivedTake.map((x) => x.card)];
    if (cards.length > count) {
      dropOverQuota += cards.length - count;
      cards = cards.slice(0, count);
    }

    // 層E: 採用が確定したカードだけ、個別ページを追加取得して本文を詳細化する
    // (全候補ではなく最終的にデッキへ入る分だけなのでコストを抑えられる)。
    const enrich = await enrichCardBodies(key, todayJp, cards);
    tokens = addUsage(tokens, enrich.usage);

    return {
      ok: true, cards: enrich.cards, candidateCount: candidates.length, records: candidates,
      sites, pagesRead: [...pagesRead, ...enrich.pagesRead], digests,
      dropped: {
        sourceInvalid: dropSourceInvalid,
        expired: dropExpired + dropExpired2,
        duplicateCandidate: dropDup + dropDupClassified,
        outOfArea: dropOutOfArea,
        irrelevant,
        overQuota: dropOverQuota,
      },
      tokens,
    };
  } catch (e) {
    return { ok: false, reason: "fetch_failed", detail: e instanceof Error ? e.message : String(e) };
  }
}

// (KEEP/SKIP分析はGeminiでなくCoworkの週次タスクが logs/feedback-*.md を読んで
//  推論込みで行う方式に変更したため、ここにあった題材抽出関数は撤去した。)
