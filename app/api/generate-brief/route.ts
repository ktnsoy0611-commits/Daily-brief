import { NextResponse } from "next/server";

// ブリーフ生成の実験用サーバー関数(フェーズC-0「プロンプト実験場」)。
//
// ★アーキテクチャ(2026-07-18 再設計): 「ストレート」と「派生」を別ルートに
// せず、同じ候補プールに対する分類の違いとして扱う。両者は取得元(Coworkが
// 集める・または登録した良質なURL)を完全に共有し、違いは「その候補が
// 自分の興味とどれくらいの距離にあるか」の一点だけ。
//
//   層A(サイトごと・並列): 一覧ページのリンクから、読む価値のある個別
//     ページURLを選ぶ。まずコード側で出典ページと同じパス階層のリンクに
//     絞り込み(構造的な足切り)、その上でテーマ・時期の粗い足切りだけを
//     AIにやらせる(質の判断はしない)。一覧構造を持たないサイト(単体記事等)
//     はコード側の型判定でこの層をスキップし、ページ自体を直接次の層へ渡す。
//   層B(全サイトまとめて1回): 個別ページの本文から、評価を含まない中立な
//     「候補レコード」(名称・要約・場所・期間・出典)を抽出する。
//   層C(1回): 候補を1件ずつプロファイルと照合し、"strong"(ストレートな
//     一致)/"moderate"(まだ弱い関心に触れる・興味の広がり)/"none"(無関係)
//     に分類するだけ。何件残すか・除外するかは判断させない。
//   層D(コード): 出典URLは候補から直接引く(AIの出力は信用しない)・生活圏
//     判定・期限切れ除外・同一事物の統合(URL一致+名称の緩い一致)を行った
//     上で、"strong"→ストレート枠・"moderate"→派生枠それぞれにコードが
//     決めた上限(件数配分)で機械的に枚数を割り当てる。
//
// プロンプトはAIに与える必要のある指示のみで構成し、設計の経緯や会話の
// 文脈は含めない。
//
// GEMINI_API_KEY は NEXT_PUBLIC_ を付けずサーバー側だけが読む。未設定なら
// (この開発環境のように)静かに reason:"no_key" を返す。

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const LIVING_AREA = "東京23区(および電車で日常的に行ける範囲)";
const DERIVED_TRIGGER = "興味の広がり"; // matchStrength:"moderate" に付けるtrigger

// ---- 上限(トークン・件数の制御) ------------------------------------------
const LISTING_MIN_LINKS = 4;    // 同一ホストへのリンクがこれ以上なら「一覧型」
const LINKS_LIMIT_PER_SITE = 150; // 1サイトから層Aへ渡すリンクの最大数
const SELECT_LIMIT_PER_SITE = 4; // 層Aが1サイトから選ぶ個別URLの最大数
const MAX_CANDIDATE_PAGES = 8;   // 層Bで実際に取得する個別ページの合計上限
const EXTRACT_LIMIT_PER_PAGE = 2; // 層Bが1ページから作る候補レコードの最大数
const PAGE_TEXT_LIMIT = 4000;    // 層Bに渡す1ページあたりの本文上限(文字数)
const TOTAL_TEXT_LIMIT = 12000;  // 層Bに渡す本文合計の上限(文字数)
const LINK_CTX_LIMIT = 150;      // リンク1件あたりの周辺テキスト上限(文字数)

// ---- HTML → テキスト(コード側の機械的処理、LLM不使用) --------------------
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}
// 本文と無関係な定型部分(ナビ・フッター・サイドバー・フォーム等)を先に除去する。
// 入力トークンの節約と、抽出リンクからナビ項目を減らす目的を兼ねる。
function stripBoilerplate(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}
function htmlToText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function normUrl(u: string): string {
  try {
    const x = new URL(u);
    return (x.origin + x.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return u.trim().replace(/\/+$/, "").toLowerCase();
  }
}

// 名称の緩い一致判定(サイト横断の重複統合用)。全角/半角・空白・記号の
// ゆらぎを吸収した上で、完全一致、または一方がもう一方を包含する場合
// (「○○展」と「○○展覧会」等の表記ゆれ)を同一事物とみなす。短すぎる
// 名称(4文字未満)は誤爆を避けるため包含判定の対象にしない。
function normName(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[「」『』【】()（）・,、.。!！?？:：;；\-—–]/g, "");
}
function namesLikelyMatch(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return shorter.length >= 4 && longer.includes(shorter);
}

// リンクごとに「そのリンク自身のテキスト+次のリンクが始まる手前までの区間」を
// 周辺情報として添える。一覧ページでは会期・会場等の付帯情報がリンクの直後
// (次のリンクの手前まで)に置かれるのが通例のため、この区切り方で前後の別項目の
// 情報が混入することを構造的に避けられる。
function extractLinksWithContext(html: string, baseUrl: string): { url: string; ctx: string }[] {
  type Anchor = { attrs: string; href: string; inner: string; start: number; end: number };
  const anchors: Anchor[] = [];
  const re = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    anchors.push({ attrs: m[1] + m[3], href: m[2].trim(), inner: m[4], start: m.index, end: re.lastIndex });
  }
  const out: { url: string; ctx: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (/^(#|javascript:|mailto:|tel:|data:)/i.test(a.href)) continue;
    let abs: string;
    try { abs = new URL(a.href, baseUrl).toString(); } catch { continue; }
    if (!/^https?:/i.test(abs)) continue;
    const key = normUrl(abs);
    if (seen.has(key)) continue;
    seen.add(key);
    const altText = [...a.inner.matchAll(/<img\b[^>]*?alt=["']([^"']*)["']/gi)].map((x) => x[1]).join(" ");
    const titleAttr = (a.attrs.match(/title=["']([^"']*)["']/i) ?? [])[1] ?? "";
    const innerText = htmlToText(a.inner);
    const nextStart = i + 1 < anchors.length ? anchors[i + 1].start : Math.min(a.end + 600, html.length);
    const between = htmlToText(html.slice(a.end, nextStart));
    const ctx = [innerText, altText, titleAttr, between].filter(Boolean).join(" ").slice(0, LINK_CTX_LIMIT);
    out.push({ url: abs, ctx });
  }
  return out;
}

// 「YYYY年M月D日 〜 [YYYY年]M月D日」という確信の持てる範囲表記からのみ終了日を
// 読み取る。2つ目の日付の年が省略される慣用表記(例: 2026年7月1日〜9月23日)は
// 開始年を継承する。単発の日付1つだけ・年の無い日付は判断保留(除外しない)にし、
// 開始日を終了日と誤認するような事故を避ける。日付直後の曜日括弧書き(例「(水)」)
// を許容し、区切り文字は波ダッシュ(〜 U+301C)と全角チルダ(～ U+FF5E、実サイトで
// よく使われ見た目が近いが別文字)の両方に対応する。
function extractDateRangeEnd(text: string): number | null {
  const re = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(?:\([^)]{0,6}\))?\s*[~〜～\-–—]\s*(?:(\d{4})年\s*)?(\d{1,2})月\s*(\d{1,2})日\s*(?:\([^)]{0,6}\))?/g;
  const ends: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const startY = +m[1];
    const endY = m[4] ? +m[4] : startY;
    ends.push(Date.UTC(endY, +m[5] - 1, +m[6]));
  }
  return ends.length ? Math.max(...ends) : null;
}
function isClearlyExpired(ctxText: string, nowMs: number): boolean {
  const end = extractDateRangeEnd(ctxText);
  return end !== null && end < nowMs - 24 * 3600 * 1000;
}

type FetchedPage = { url: string; ok: boolean; text: string; html: string };
async function fetchPage(url: string): Promise<FetchedPage> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA, "Accept-Language": "ja,en;q=0.8", Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { url, ok: false, text: "", html: "" };
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain/i.test(ct)) return { url, ok: false, text: "", html: "" };
    const stripped = stripBoilerplate(await res.text());
    return { url: res.url || url, ok: true, text: htmlToText(stripped), html: stripped };
  } catch {
    return { url, ok: false, text: "", html: "" };
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

type TokenUsage = { promptTokens: number; candidateTokens: number; totalTokens: number; calls: number };
const ZERO_USAGE: TokenUsage = { promptTokens: 0, candidateTokens: 0, totalTokens: 0, calls: 0 };
function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    candidateTokens: a.candidateTokens + b.candidateTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    calls: a.calls + b.calls,
  };
}

async function callGemini(
  key: string,
  systemText: string,
  userText: string,
  jsonMode: boolean,
): Promise<{ ok: true; text: string; usage: TokenUsage } | { ok: false; status: number; detail: string }> {
  const reqBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 3072,
      ...(jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  });
  const callModel = (model: string) =>
    fetch(endpointFor(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: reqBody,
    });
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
  const usage: TokenUsage = {
    promptTokens: um.promptTokenCount ?? 0,
    candidateTokens: um.candidatesTokenCount ?? 0,
    totalTokens: um.totalTokenCount ?? 0,
    calls: 1,
  };
  return { ok: true, text, usage };
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

// ---- プロンプト(システム=役割・入力仕様・ルール・出力契約の固定文書) -----
// AIの動作に必要な指示のみで構成する。設計の経緯・会話の文脈は含めない。

const SYSTEM_SELECT = `あなたは情報収集パイプラインのURL選定モジュールです。構造化された入力データだけを根拠に、詳細抽出の対象とするページのURLを選定します。

# 入力仕様
<基準日>: 判断の基準となる本日の日付
<プロファイル>: ユーザーの関心を表す3つの信号
  短期的関心: いま最も汲むべき関心事。選定の最優先の手がかりとする
  願望リスト: 具体的な願い。これに直接関連する候補は最優先で選定する
  長期的傾向: 恒常的な好み。候補が同程度のときの順位付けに使う
<選定上限>: 出力するURLの最大件数
<リンク一覧>: 一覧ページのHTMLから機械的に抽出された実在リンク。各行は「参考情報 | URL」の形式

# 選定ルール
1. 出力するURLは<リンク一覧>に含まれるものに限る。URLの生成・改変・補完は行わない。
2. 単一の事物の詳細を述べるページへのリンクのみを選ぶ。複数の事物を並べる一覧・索引・ナビゲーション・サイト案内へのリンクは選ばない。
3. 参考情報中の日付が<基準日>より前で、既に終了していると判断できる候補は選ばない。
4. 参考情報からテーマへの関連が否定できない候補は選定に含める。該当がなければ0件とする。

# 出力契約
選定したURLのみを1行1件で出力する。URL以外の文字は一切出力しない。該当がない場合は何も出力しない。`;

const SYSTEM_CANDIDATES = `あなたは情報抽出パイプラインの候補抽出モジュールです。入力されるWebページ本文だけを情報源として、候補レコードをJSON配列で出力します。

# 入力仕様
<基準日>: 判断の基準となる本日の日付
<抽出上限>: 1ページから作るレコードの最大件数
<ページ群>: 各ページのURLと本文テキスト

# 抽出ルール
1. レコードの全記述は、そのページ本文に明記された情報のみを根拠とする。本文に無い情報の補完・推測・一般知識の使用は禁止。事物の名称が本文から特定できないページはレコードにしない。
2. 1レコードは1つの事物を表す。ページの主題である事物を優先する。
3. <基準日>時点で既に終了している事物はレコードにしない。開始日・終了日が本文から特定できる場合のみ start / end に記す。
4. sourceUrl はそのページのURLをそのまま用いる。変更・短縮・補完は禁止。
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
   body: 選定理由が一読で分かる1〜3文。ユーザーの予定・行動の推測は含めない
   kind: "place" | "exhibition" | "live" | "activity" | "food" | "movie" | "book" | "album" | "info" | "thing"
   trigger: matchStrength が "strong" のとき、時期が理由なら "タイムリー"、長期的傾向(強い)が理由なら "興味との一致"、場所・地域性が理由なら "ロケーション"。matchStrength が "moderate" のときは "興味の広がり"。
   sourceWishTitle: 願望リストのいずれかに直接応える場合のみ、その願いを一字一句同じ文字列で記す(任意)
   area・sourceLabel・meta・expiresAt: 候補レコードに情報があれば記す(任意)
6. matchStrength が "strong" どうし・"moderate" どうしは、それぞれの集合の中でプロファイルとの合致度が高い順に並べて出力する。

# 出力契約
下記フィールドのJSON配列のみを出力する。該当候補が無い場合は [] を出力する。
id / matchStrength / inLivingArea(任意) / title(任意) / body(任意) / kind(任意) / trigger(任意) / sourceWishTitle(任意) / area(任意) / sourceLabel(任意) / meta(任意,文字列配列) / expiresAt(任意,ISO8601)`;

function userSelect(todayJp: string, tasteBlock: string, selectLimit: number, lines: string): string {
  return `<基準日>${todayJp}</基準日>\n<プロファイル>\n${tasteBlock}\n</プロファイル>\n<選定上限>${selectLimit}</選定上限>\n<リンク一覧>\n${lines}\n</リンク一覧>`;
}
function userCandidates(todayJp: string, extractLimit: number, pageBlocks: string): string {
  return `<基準日>${todayJp}</基準日>\n<抽出上限>${extractLimit}</抽出上限>\n<ページ群>\n${pageBlocks}\n</ページ群>`;
}
function userClassify(todayJp: string, livingArea: string, tasteBlock: string, candidatesJson: string): string {
  return `<基準日>${todayJp}</基準日>\n<生活圏>${livingArea}</生活圏>\n<プロファイル>\n${tasteBlock}\n</プロファイル>\n<候補一覧>\n${candidatesJson}\n</候補一覧>`;
}

// ---- 型 -------------------------------------------------------------------
type CandidateRecord = {
  name: string; summary?: string; venue?: string; area?: string;
  start?: string; end?: string; price?: string; sourceUrl?: string;
};
type GeneratedCard = {
  title: string; body: string; kind: string; trigger: string;
  area?: string; sourceUrl?: string; sourceLabel?: string; meta?: string[];
  expiresAt?: string; isDerived?: boolean; sourceWishTitle?: string;
};
type ClassifiedCandidate = {
  id?: number; matchStrength?: string; inLivingArea?: boolean;
  title?: string; body?: string; kind?: string; trigger?: string;
  sourceWishTitle?: string; area?: string; sourceLabel?: string;
  meta?: string[]; expiresAt?: string;
};
type SiteTrace = {
  source: string;
  fetched: boolean;
  pageType?: "listing" | "single";
  sameHostLinkCount: number;
  pathScoped: boolean;
  scopedLinkCount: number;
  excludedByDate: number;
  sentToSelectionCount: number;
  selectedCount: number;
  droppedNotInLinkSet: number;
};
type PageReadTrace = { url: string; ok: boolean };
type DropSummary = { sourceInvalid: number; expired: number; duplicateCandidate: number; outOfArea: number; irrelevant: number; overQuota: number };
const ZERO_DROPS: DropSummary = { sourceInvalid: 0, expired: 0, duplicateCandidate: 0, outOfArea: 0, irrelevant: 0, overQuota: 0 };

type GenResult =
  | {
      ok: true; cards: GeneratedCard[]; candidateCount: number;
      sites: SiteTrace[]; pagesRead: PageReadTrace[];
      dropped: DropSummary; tokens: TokenUsage; note?: string;
    }
  | { ok: false; reason: string; detail?: string };

// ---- 層A: サイトごとのURL選定(並列実行) ----------------------------------
async function processSite(
  sourceUrl: string,
  key: string,
  todayJp: string,
  tasteBlock: string,
): Promise<{ trace: SiteTrace; candidateUrls: string[]; usage: TokenUsage }> {
  const page = await fetchPage(sourceUrl);
  if (!page.ok || !page.text) {
    return {
      trace: { source: sourceUrl, fetched: false, sameHostLinkCount: 0, pathScoped: false, scopedLinkCount: 0, excludedByDate: 0, sentToSelectionCount: 0, selectedCount: 0, droppedNotInLinkSet: 0 },
      candidateUrls: [],
      usage: ZERO_USAGE,
    };
  }
  let host = "";
  let sourceDir = "";
  try {
    const u = new URL(page.url);
    host = u.host;
    sourceDir = u.pathname.replace(/[^/]*$/, ""); // 末尾のファイル名を除いたディレクトリ部分
  } catch { /* noop */ }
  const sameHostLinks = extractLinksWithContext(page.html, page.url).filter((l) => {
    let lh = "";
    try { lh = new URL(l.url).host; } catch { return false; }
    return lh === host && normUrl(l.url) !== normUrl(sourceUrl) && normUrl(l.url) !== normUrl(page.url);
  });
  const sameHostLinkCount = sameHostLinks.length;
  // 出典ページと同じディレクトリ配下(=同じ主題の一覧に属する)のリンクだけに
  // 絞り込む。これが無いと、周辺テキストがどれだけ豊富でも別セクションの記事
  // (例: 観光地ガイド)が「テーマに合致する」という理由だけで紛れ込む(gotokyo.org
  // の展覧会一覧から無関係なエリアガイドが選ばれた実例)。絞り込みが0件になる
  // サイト(一覧と詳細でパス構造が違う等)では、絞り込みをせず全同一ホスト
  // リンクへフォールバックする。
  const scopedLinks = sourceDir
    ? sameHostLinks.filter((l) => {
        try { return new URL(l.url).pathname.startsWith(sourceDir); } catch { return false; }
      })
    : [];
  const pathScoped = scopedLinks.length > 0;
  const rawLinks = pathScoped ? scopedLinks : sameHostLinks;

  const nowMs = Date.now();
  let excludedByDate = 0;
  // リンク数が上限を超える場合、DOM順(先頭から)で切ると、周辺テキストが
  // 乏しいナビゲーション・関連リンクが先に残り、情報の濃い一覧項目(会期・
  // 会場等が書かれている)が後方にあるせいで弾かれることがある。周辺テキスト
  // の長さ(=情報量)で降順に並べ替えてから切ることで、内容の薄いリンクより
  // 一覧項目を優先して層Aへ渡す。
  const keptLinks = rawLinks
    .filter((l) => {
      if (isClearlyExpired(l.ctx, nowMs)) { excludedByDate++; return false; }
      return true;
    })
    .sort((a, b) => b.ctx.length - a.ctx.length)
    .slice(0, LINKS_LIMIT_PER_SITE);

  const pageType: "listing" | "single" = rawLinks.length >= LISTING_MIN_LINKS ? "listing" : "single";

  const selectedUrls: string[] = [];
  let droppedNotInLinkSet = 0;
  let usage = ZERO_USAGE;

  if (pageType === "listing" && keptLinks.length > 0) {
    const lines = keptLinks.map((l) => `${l.ctx || "(情報なし)"} | ${l.url}`).join("\n");
    const r = await callGemini(key, SYSTEM_SELECT, userSelect(todayJp, tasteBlock, SELECT_LIMIT_PER_SITE, lines), false);
    if (r.ok) {
      usage = addUsage(usage, r.usage);
      const allowed = new Map(keptLinks.map((l) => [normUrl(l.url), l.url]));
      for (const raw of r.text.split(/\r?\n/)) {
        const u = raw.trim().replace(/^[-*・\d.\s]+/, "");
        if (!u) continue;
        if (!/^https?:\/\//.test(u)) continue;
        const k = normUrl(u);
        if (allowed.has(k)) {
          const canon = allowed.get(k)!;
          if (!selectedUrls.includes(canon)) selectedUrls.push(canon);
        } else {
          droppedNotInLinkSet++;
        }
        if (selectedUrls.length >= SELECT_LIMIT_PER_SITE) break;
      }
    }
  }

  // 個別URLを選べなかった場合(単体型・一覧型で該当なし)は、ページ自身を
  // 候補抽出へ直接渡す。実テキストなので捏造にはならず、単に浅い結果になる。
  const candidateUrls = selectedUrls.length > 0 ? selectedUrls : [page.url];

  return {
    trace: {
      source: sourceUrl, fetched: true, pageType,
      sameHostLinkCount, pathScoped, scopedLinkCount: rawLinks.length,
      excludedByDate,
      sentToSelectionCount: keptLinks.length,
      selectedCount: selectedUrls.length,
      droppedNotInLinkSet,
    },
    candidateUrls,
    usage,
  };
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "no_key" } satisfies GenResult);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: { wishes?: string[]; interests?: any[]; focus?: string; sources?: string[]; count?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" } satisfies GenResult, { status: 400 });
  }

  const wishes = (body.wishes ?? []).filter((w) => typeof w === "string" && w.trim()).slice(0, 20);
  // interests は {label, weight} を受け取る(重みで「強い/弱い」を分けるため)。
  // 文字列のみが来た場合(weight不明)は互換のため weight:0 として扱う。
  type InterestInput = { label: string; weight: number };
  const interests: InterestInput[] = (body.interests ?? [])
    .map((i): InterestInput | null => {
      if (typeof i === "string") return i.trim() ? { label: i.trim(), weight: 0 } : null;
      if (i && typeof i === "object" && typeof i.label === "string" && i.label.trim()) {
        return { label: i.label.trim(), weight: typeof i.weight === "number" ? i.weight : 0 };
      }
      return null;
    })
    .filter((i): i is InterestInput => i !== null)
    .slice(0, 20);
  const focus = (body.focus ?? "").trim();
  const sources = (body.sources ?? [])
    .filter((u) => typeof u === "string" && /^https?:\/\//.test(u.trim()))
    .map((u) => u.trim())
    .slice(0, 3);
  const count = Math.min(Math.max(body.count ?? 3, 1), 6);
  if (sources.length === 0) return NextResponse.json({ ok: false, reason: "no_sources" } satisfies GenResult);

  // 興味タグを重み順に並べ、上位半分を「強い(=ストレート一致の材料)」、
  // 残りを「弱い(=まだ広がりつつある関心。派生枠の材料)」に分ける。
  // 層A(サイトごとの粗い足切り)にはこの区別は不要なので3信号のまま渡し、
  // 層C(分類)にだけ4信号で渡す(層Aのプロンプトを変えずに済ませるため)。
  const sortedInterests = interests.slice().sort((a, b) => b.weight - a.weight);
  const strongCount = sortedInterests.length ? Math.max(1, Math.ceil(sortedInterests.length / 2)) : 0;
  const strongInterests = sortedInterests.slice(0, strongCount).map((i) => i.label);
  const weakInterests = sortedInterests.slice(strongCount).map((i) => i.label);

  const wishesLine = `願望リスト: ${wishes.length ? wishes.join(" / ") : "なし"}`;
  const focusLine = `短期的関心: ${focus || "なし"}`;
  const tasteBlockCoarse = `${focusLine}\n${wishesLine}\n長期的傾向: ${sortedInterests.length ? sortedInterests.map((i) => i.label).join(" / ") : "なし"}`;
  const tasteBlockClassify = `${focusLine}\n${wishesLine}\n長期的傾向(強い): ${strongInterests.length ? strongInterests.join(" / ") : "なし"}\n長期的傾向(弱い): ${weakInterests.length ? weakInterests.join(" / ") : "なし"}`;

  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayJp = `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;

  try {
    // === 層A: サイトごとに並列でURL選定 ===
    const siteResults = await Promise.all(sources.map((s) => processSite(s, key, todayJp, tasteBlockCoarse)));
    const sites = siteResults.map((r) => r.trace);
    let tokens = siteResults.reduce((acc, r) => addUsage(acc, r.usage), ZERO_USAGE);

    // サイト横断で重複除去し、合計取得件数に上限を設ける。
    const seenPageUrl = new Set<string>();
    const candidatePageUrls: string[] = [];
    outer: for (const r of siteResults) {
      for (const u of r.candidateUrls) {
        const k = normUrl(u);
        if (seenPageUrl.has(k)) continue;
        seenPageUrl.add(k);
        candidatePageUrls.push(u);
        if (candidatePageUrls.length >= MAX_CANDIDATE_PAGES) break outer;
      }
    }
    if (candidatePageUrls.length === 0) {
      return NextResponse.json({ ok: true, cards: [], candidateCount: 0, sites, pagesRead: [], dropped: ZERO_DROPS, tokens } satisfies GenResult);
    }

    // === 層B: 個別ページを実取得し、まとめて1回で候補レコード抽出 ===
    const fetchedPages = await Promise.all(candidatePageUrls.map(fetchPage));
    const pagesRead: PageReadTrace[] = fetchedPages.map((p) => ({ url: p.url, ok: p.ok && !!p.text }));
    const usablePages = fetchedPages.filter((p) => p.ok && p.text);
    if (usablePages.length === 0) {
      return NextResponse.json({ ok: true, cards: [], candidateCount: 0, sites, pagesRead, dropped: ZERO_DROPS, tokens, note: "候補ページの本文を取得できませんでした。" } satisfies GenResult);
    }

    let budget = TOTAL_TEXT_LIMIT;
    const pageBlocks = usablePages
      .map((p) => {
        if (budget <= 0) return "";
        const slice = p.text.slice(0, Math.min(PAGE_TEXT_LIMIT, budget));
        budget -= slice.length;
        return `<ページ url="${p.url}">\n${slice}\n</ページ>`;
      })
      .filter(Boolean)
      .join("\n");

    const rB = await callGemini(key, SYSTEM_CANDIDATES, userCandidates(todayJp, EXTRACT_LIMIT_PER_PAGE, pageBlocks), true);
    if (!rB.ok) {
      return NextResponse.json({ ok: false, reason: `gemini_${rB.status}`, detail: rB.detail } satisfies GenResult, { status: 502 });
    }
    tokens = addUsage(tokens, rB.usage);
    const rawCandidates = extractJsonArray<CandidateRecord>(rB.text) ?? [];

    // 検証: 出典が実取得URLに一致するもの・終了済みでないもの・重複でないものだけ通す。
    const fetchedNorms = new Set(usablePages.map((p) => normUrl(p.url)));
    const nowMs = Date.now();
    const seenCandidate = new Set<string>();
    let dropSourceInvalid = 0, dropExpired = 0, dropDup = 0;
    const candidates: CandidateRecord[] = [];
    for (const c of rawCandidates) {
      const su = (c.sourceUrl ?? "").trim();
      if (!su || !fetchedNorms.has(normUrl(su))) { dropSourceInvalid++; continue; }
      if (c.end) {
        const t = Date.parse(c.end);
        if (!Number.isNaN(t) && t < nowMs) { dropExpired++; continue; }
      }
      // 重複判定は「出典URL+名称」の組み合わせで行う。URLだけで判定すると、
      // 1ページから複数の異なる事物を抽出する場合(EXTRACT_LIMIT_PER_PAGE>1)に、
      // 同じページに書かれた別々の事物まで誤って「重複」と見なしてしまう。
      const k = `${normUrl(su)}|${(c.name ?? "").trim().toLowerCase()}`;
      if (seenCandidate.has(k)) { dropDup++; continue; }
      seenCandidate.add(k);
      candidates.push(c);
    }
    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true, cards: [], candidateCount: 0, sites, pagesRead,
        dropped: { ...ZERO_DROPS, sourceInvalid: dropSourceInvalid, expired: dropExpired, duplicateCandidate: dropDup },
        tokens, note: "候補が抽出できませんでした。",
      } satisfies GenResult);
    }

    // === 層C: 候補を1件ずつプロファイルと照合して分類するだけ(除外・件数は判断させない) ===
    const idxCandidates = candidates.map((c, id) => ({ id, ...c }));
    const rC = await callGemini(
      key, SYSTEM_CLASSIFY,
      userClassify(todayJp, LIVING_AREA, tasteBlockClassify, JSON.stringify(idxCandidates)),
      true,
    );
    if (!rC.ok) {
      return NextResponse.json({ ok: false, reason: `gemini_${rC.status}`, detail: rC.detail } satisfies GenResult, { status: 502 });
    }
    tokens = addUsage(tokens, rC.usage);
    const rawClassified = extractJsonArray<ClassifiedCandidate>(rC.text) ?? [];

    // 層D: ここで初めて「載せる/載せないか」「何件か」をコードが機械的に決める。
    // 出典URLはAIの出力を信用せず、idで引いた候補レコード自身のURLを使う。
    let dropExpired2 = 0, dropOutOfArea = 0, irrelevant = 0;
    const strongPool: GeneratedCard[] = [];
    const moderatePool: GeneratedCard[] = [];
    for (const r of rawClassified) {
      const src = typeof r.id === "number" ? candidates[r.id] : undefined;
      if (!src) continue; // idが候補一覧に無い=無効。サイレントに無視する。
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
        meta: r.meta, expiresAt: r.expiresAt, isDerived,
        sourceWishTitle: r.sourceWishTitle,
      };
      (isDerived ? moderatePool : strongPool).push(card);
    }

    // サイト横断で同一事物を指す候補が複数残っていれば統合する(URL一致 or
    // 名称の緩い一致)。strong→moderateの順に見るため、重複時はstrong側の
    // 分類を優先して残す。
    let dropDupClassified = 0;
    const acceptedStrong: GeneratedCard[] = [];
    const acceptedModerate: GeneratedCard[] = [];
    for (const pool of [{ list: strongPool, bucket: acceptedStrong }, { list: moderatePool, bucket: acceptedModerate }]) {
      for (const c of pool.list) {
        const dup =
          acceptedStrong.some((a) => normUrl(a.sourceUrl ?? "") === normUrl(c.sourceUrl ?? "") || namesLikelyMatch(a.title, c.title)) ||
          acceptedModerate.some((a) => normUrl(a.sourceUrl ?? "") === normUrl(c.sourceUrl ?? "") || namesLikelyMatch(a.title, c.title));
        if (dup) { dropDupClassified++; continue; }
        pool.bucket.push(c);
      }
    }

    // 枚数配分はコードが決める(AIには渡さない・判断させない)。派生枠は
    // <編成上限>が3枚以上の日だけ1枚だけ確保する(枚数の下限保証はしない=
    // 良い候補が無ければ0枚のままでよい)。
    const derivedQuota = count >= 3 ? Math.min(1, acceptedModerate.length) : 0;
    const straightQuota = count - derivedQuota;
    const pickedStrong = acceptedStrong.slice(0, straightQuota);
    const pickedModerate = acceptedModerate.slice(0, derivedQuota);
    const dropOverQuota =
      Math.max(0, acceptedStrong.length - pickedStrong.length) + Math.max(0, acceptedModerate.length - pickedModerate.length);

    const cards: GeneratedCard[] = [...pickedStrong, ...pickedModerate];

    return NextResponse.json({
      ok: true, cards, candidateCount: candidates.length, sites, pagesRead,
      dropped: {
        sourceInvalid: dropSourceInvalid,
        expired: dropExpired + dropExpired2,
        duplicateCandidate: dropDup + dropDupClassified,
        outOfArea: dropOutOfArea,
        irrelevant,
        overQuota: dropOverQuota,
      },
      tokens,
    } satisfies GenResult);
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: "fetch_failed", detail: e instanceof Error ? e.message : String(e) } satisfies GenResult,
      { status: 502 },
    );
  }
}
