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

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const JINA_BASE = "https://r.jina.ai/";
const DEFAULT_LIVING_AREA = "東京23区(および電車で日常的に行ける範囲)";
const DERIVED_TRIGGER = "興味の広がり";

const EXTRACT_LIMIT_PER_LISTING = 12; // 層Bが1つの一覧から作る候補レコードの最大数
const LISTING_TEXT_LIMIT = 10000;     // 層Bに渡す1つの一覧Markdownの上限(文字数)
const TOTAL_TEXT_LIMIT = 20000;       // 層Bに渡す本文合計の上限(文字数)

// ---- 型 -------------------------------------------------------------------
export type InterestSignal = { label: string; weight: number };
export type TasteInput = {
  focus?: string;
  wishes?: string[];
  interests?: InterestSignal[];
  livingArea?: string;
};
export type TokenUsage = { promptTokens: number; candidateTokens: number; totalTokens: number; calls: number };
export type SiteTrace = { source: string; fetched: boolean; linkCount: number };
export type PageReadTrace = { url: string; ok: boolean };
export type DropSummary = { sourceInvalid: number; expired: number; duplicateCandidate: number; outOfArea: number; irrelevant: number; overQuota: number };
export type GeneratedCard = {
  title: string; body: string; kind: string; trigger: string;
  area?: string; sourceUrl?: string; sourceLabel?: string; meta?: string[];
  expiresAt?: string; isDerived?: boolean; sourceWishTitle?: string;
};
export type CandidateRecord = {
  name: string; summary?: string; venue?: string; area?: string;
  start?: string; end?: string; price?: string; sourceUrl?: string;
};
export type BuildResult =
  | {
      ok: true; cards: GeneratedCard[]; candidateCount: number;
      records: CandidateRecord[]; // 検証を通った候補レコード(content_cacheプール用)
      sites: SiteTrace[]; pagesRead: PageReadTrace[];
      dropped: DropSummary; tokens: TokenUsage; note?: string;
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
export function namesLikelyMatch(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return shorter.length >= 4 && longer.includes(shorter);
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
  key: string, systemText: string, userText: string, jsonMode: boolean,
): Promise<{ ok: true; text: string; usage: TokenUsage } | { ok: false; status: number; detail: string }> {
  const reqBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 3072, ...(jsonMode ? { responseMimeType: "application/json" } : {}) },
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

const SYSTEM_CLASSIFY = `あなたは情報編成パイプラインの候補分類モジュールです。候補レコードを1件ずつプロファイルと照合し、分類結果をJSON配列で出力します。候補を残すか除外するか、何件にするかの判断はしません。

# 入力仕様
<基準日>: 判断の基準となる本日の日付
<生活圏>: 提案対象とする地理的範囲
<プロファイル>: ユーザーの関心を表す4つの信号
  短期的関心: いま最も汲むべき関心事
  願望リスト: 具体的な願い
  長期的傾向(強い): 確立した恒常的な好み
  長期的傾向(弱い): まだ弱く、広がりつつある関心の兆し
<候補一覧>: 候補レコード(JSON配列)。各要素は id を持つ

# 分類ルール
1. 記述は候補レコードに含まれる情報のみを根拠とする。レコードに無い情報の補完・推測は禁止。
2. 入力された候補は1件も省略せず、すべてについて分類結果を出力する。
3. matchStrength は候補とプロファイルとの関係で判定する。
   "strong": 短期的関心・願望リスト・長期的傾向(強い)のいずれかに直接合致する候補
   "moderate": 長期的傾向(弱い)に合致する、または長期的傾向(強い)に近接するが一致はしない候補
   "none": プロファイルのいずれとも関連が無い候補
4. matchStrength が "none" の候補は id と matchStrength のみを出力する。他のフィールドは出力しない。
5. matchStrength が "strong" または "moderate" の候補は、id・matchStrength に加えて以下も出力する。
   inLivingArea: 候補の所在地が<生活圏>内かどうか。所在地の記述が無い候補は true とする。
   title: 事物が分かる短い見出し
   body: 事物そのものの内容を1〜3文で要約する(何が・どこで・いつ等、候補レコードに書かれた事実に基づく)。プロファイルとの合致理由や「〜に関心がある人にとって」等のユーザーへの言及・意義づけは書かない
   kind: "place" | "exhibition" | "live" | "activity" | "food" | "movie" | "book" | "album" | "info" | "thing"
   trigger: matchStrength が "strong" のとき、時期が理由なら "タイムリー"、長期的傾向(強い)が理由なら "興味との一致"、場所・地域性が理由なら "ロケーション"。matchStrength が "moderate" のときは "興味の広がり"。
   sourceWishTitle: 願望リストのいずれかに直接応える場合のみ、その願いを一字一句同じ文字列で記す(任意)
   area・sourceLabel・meta・expiresAt: 候補レコードに情報があれば記す(任意)
6. matchStrength が "strong" どうし・"moderate" どうしは、それぞれの集合の中でプロファイルとの合致度が高い順に並べて出力する。

# 出力契約
下記フィールドのJSON配列のみを出力する。該当候補が無い場合は [] を出力する。
id / matchStrength / inLivingArea(任意) / title(任意) / body(任意) / kind(任意) / trigger(任意) / sourceWishTitle(任意) / area(任意) / sourceLabel(任意) / meta(任意,文字列配列) / expiresAt(任意,ISO8601)`;

function userCandidates(todayJp: string, extractLimit: number, pageBlocks: string): string {
  return `<基準日>${todayJp}</基準日>\n<抽出上限>${extractLimit}</抽出上限>\n<ページ群>\n${pageBlocks}\n</ページ群>`;
}
function userClassify(todayJp: string, livingArea: string, tasteBlock: string, candidatesJson: string): string {
  return `<基準日>${todayJp}</基準日>\n<生活圏>${livingArea}</生活圏>\n<プロファイル>\n${tasteBlock}\n</プロファイル>\n<候補一覧>\n${candidatesJson}\n</候補一覧>`;
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
export async function buildDeck(input: { taste: TasteInput; sources: string[]; count: number }): Promise<BuildResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: "no_key" };

  const sources = (input.sources ?? [])
    .filter((u) => typeof u === "string" && /^https?:\/\//.test(u.trim()))
    .map((u) => u.trim())
    .slice(0, 3);
  if (sources.length === 0) return { ok: false, reason: "no_sources" };

  const count = Math.min(Math.max(input.count ?? 3, 1), 6);
  const focus = (input.taste.focus ?? "").trim();
  const wishes = (input.taste.wishes ?? []).filter((w) => typeof w === "string" && w.trim()).slice(0, 20);
  const interests = (input.taste.interests ?? []).filter((i) => i && typeof i.label === "string" && i.label.trim()).slice(0, 20);
  const livingArea = (input.taste.livingArea ?? "").trim() || DEFAULT_LIVING_AREA;

  // 興味タグを重み順で強い/弱いに分ける(強い=strong判定、弱い=moderate判定の材料)。
  const sortedInterests = interests.slice().sort((a, b) => b.weight - a.weight);
  const strongCount = sortedInterests.length ? Math.max(1, Math.ceil(sortedInterests.length / 2)) : 0;
  const strongInterests = sortedInterests.slice(0, strongCount).map((i) => i.label);
  const weakInterests = sortedInterests.slice(strongCount).map((i) => i.label);
  const wishesLine = `願望リスト: ${wishes.length ? wishes.join(" / ") : "なし"}`;
  const focusLine = `短期的関心: ${focus || "なし"}`;
  const tasteBlockClassify = `${focusLine}\n${wishesLine}\n長期的傾向(強い): ${strongInterests.length ? strongInterests.join(" / ") : "なし"}\n長期的傾向(弱い): ${weakInterests.length ? weakInterests.join(" / ") : "なし"}`;

  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayJp = `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;

  try {
    const siteFetches = await Promise.all(sources.map((s) => fetchSite(s)));
    const sites = siteFetches.map((r) => r.trace);
    const pagesRead: PageReadTrace[] = siteFetches.map((r) => ({ url: r.url, ok: r.fetched }));
    let tokens = ZERO_USAGE;

    const usable = siteFetches.filter((r) => r.fetched && r.md);
    if (usable.length === 0) {
      return { ok: true, cards: [], candidateCount: 0, records: [], sites, pagesRead, dropped: ZERO_DROPS, tokens, note: "情報源ページを取得できませんでした。" };
    }

    const validUrlSet = new Set<string>();
    for (const s of usable) {
      validUrlSet.add(normUrl(s.url));
      for (const k of s.allow.keys()) validUrlSet.add(k);
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

    const rB = await callGemini(key, SYSTEM_CANDIDATES, userCandidates(todayJp, EXTRACT_LIMIT_PER_LISTING, pageBlocks), true);
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
      const k = `${normUrl(su)}|${(c.name ?? "").trim().toLowerCase()}`;
      if (seenCandidate.has(k)) { dropDup++; continue; }
      seenCandidate.add(k);
      candidates.push(c);
    }
    if (candidates.length === 0) {
      return {
        ok: true, cards: [], candidateCount: 0, records: [], sites, pagesRead,
        dropped: { ...ZERO_DROPS, sourceInvalid: dropSourceInvalid, expired: dropExpired, duplicateCandidate: dropDup },
        tokens, note: "候補が抽出できませんでした。",
      };
    }

    // 層C: 候補を1件ずつ分類するだけ。
    const idxCandidates = candidates.map((c, id) => ({ id, ...c }));
    const rC = await callGemini(key, SYSTEM_CLASSIFY, userClassify(todayJp, livingArea, tasteBlockClassify, JSON.stringify(idxCandidates)), true);
    if (!rC.ok) return { ok: false, reason: `gemini_${rC.status}`, detail: rC.detail };
    tokens = addUsage(tokens, rC.usage);
    const rawClassified = extractJsonArray<ClassifiedCandidate>(rC.text) ?? [];

    // 層D: コードが「載せる/何件か」を決める。出典URLはidで候補から引く。
    let dropExpired2 = 0, dropOutOfArea = 0, irrelevant = 0;
    const strongPool: GeneratedCard[] = [];
    const moderatePool: GeneratedCard[] = [];
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
      (isDerived ? moderatePool : strongPool).push({
        title: r.title, body: r.body, kind: r.kind,
        trigger: r.trigger ?? (isDerived ? DERIVED_TRIGGER : "興味との一致"),
        area: r.area, sourceUrl: src.sourceUrl, sourceLabel: r.sourceLabel,
        meta: r.meta, expiresAt: r.expiresAt, isDerived, sourceWishTitle: r.sourceWishTitle,
      });
    }

    // サイト横断の重複統合(名称の緩い一致のみ。strong優先)。
    let dropDupClassified = 0;
    const acceptedStrong: GeneratedCard[] = [];
    const acceptedModerate: GeneratedCard[] = [];
    for (const pool of [{ list: strongPool, bucket: acceptedStrong }, { list: moderatePool, bucket: acceptedModerate }]) {
      for (const c of pool.list) {
        const dup =
          acceptedStrong.some((a) => namesLikelyMatch(a.title, c.title)) ||
          acceptedModerate.some((a) => namesLikelyMatch(a.title, c.title));
        if (dup) { dropDupClassified++; continue; }
        pool.bucket.push(c);
      }
    }

    // 枚数配分(コードが決める)。派生枠は count>=3 の日だけ1枚。
    const derivedQuota = count >= 3 ? Math.min(1, acceptedModerate.length) : 0;
    const straightQuota = count - derivedQuota;
    const pickedStrong = acceptedStrong.slice(0, straightQuota);
    const pickedModerate = acceptedModerate.slice(0, derivedQuota);
    const dropOverQuota = Math.max(0, acceptedStrong.length - pickedStrong.length) + Math.max(0, acceptedModerate.length - pickedModerate.length);
    const cards: GeneratedCard[] = [...pickedStrong, ...pickedModerate];

    return {
      ok: true, cards, candidateCount: candidates.length, records: candidates, sites, pagesRead,
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
