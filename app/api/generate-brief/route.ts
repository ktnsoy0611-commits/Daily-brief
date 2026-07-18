import { NextResponse } from "next/server";

// ブリーフ生成の実験用サーバー関数(フェーズC-0「プロンプト実験場」)。
//
// ★アーキテクチャ(2026-07-18 再設計): retrieval(実在ページの取得)を、
// 生の fetch() + 正規表現による HTML 解析から、**LLM向けスクレイピングAPI
// (Jina Reader)経由のクリーンMarkdown取得**へ置き換えた。
//
// 旧方式(Vercelからの生fetch)は次の3点で構造的に脆く、実キーで繰り返し失敗した:
//   (1) データセンターIP・実ブラウザでないこと等でサーバー直fetchがブロックされる
//       (artscape.jp が取得段階で✗・トークン0になっていた)。
//   (2) JavaScript描画(SPA)のページは初期HTMLに中身が無く、素のfetchでは読めない。
//   (3) 生HTMLの<a href>から「どれが本物の項目か」を機械的に見分ける汎用ルールが無い。
//
// Jina Reader(https://r.jina.ai/<URL>)は対象ページを実際にレンダリングし、
// ナビ・広告・フッター等のノイズを除いたクリーンなMarkdownを返す。これにより
// (1)(2)が解消し、(3)も「クリーンなMarkdown上のリンクをGeminiが読んで選ぶ」形に
// なり、正規表現によるリンク選定を廃止できる。JINA_API_KEY があれば高レートで
// 使い、無ければキーレス(無料・レート制限あり)で動く。
//
// パイプライン(段階分けは維持しつつ、各段の入力がクリーンMarkdownになった):
//   層A(サイトごと・並列): 情報源ページのMarkdownをGeminiに渡し、詳細を読むべき
//     個別ページのURLを選ばせる。捏造防止のため、Markdown中に実在するURLの集合を
//     コード側で機械抽出し(選定ではなく検証のためのallowlist)、その中のURLしか
//     通さない。個別URLが選べないページはそのページ自体を次段へ渡す(単ホップ)。
//   層B(全サイトまとめて1回): 個別ページのMarkdownから、中立な候補レコード
//     (名称・要約・場所・期間・出典)を抽出する。
//   層C(1回): 候補を1件ずつプロファイルと照合し、strong/moderate/none に分類する。
//   層D(コード): 出典URLをidで候補から直接引く・生活圏/期限切れ/重複を検証し、
//     strong→ストレート枠・moderate→派生枠にコードが枚数を割り当てる。
//
// GEMINI_API_KEY は NEXT_PUBLIC_ を付けずサーバー側だけが読む。未設定なら
// (この開発環境のように)静かに reason:"no_key" を返す。

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const JINA_BASE = "https://r.jina.ai/";
const LIVING_AREA = "東京23区(および電車で日常的に行ける範囲)";
const DERIVED_TRIGGER = "興味の広がり"; // matchStrength:"moderate" に付けるtrigger

// ---- 上限(トークン・件数・レイテンシの制御) ------------------------------
const SELECT_LIMIT_PER_SITE = 6;  // 層Aが1サイトから選ぶ個別URLの最大数
const MAX_CANDIDATE_PAGES = 8;    // 層Bで実際に取得する個別ページの合計上限
const EXTRACT_LIMIT_PER_PAGE = 3; // 層Bが1ページから作る候補レコードの最大数
const SOURCE_MD_LIMIT = 12000;    // 層Aへ渡すMarkdownの上限(文字数)
const PAGE_TEXT_LIMIT = 6000;     // 層Bに渡す1ページMarkdownの上限(文字数)
const TOTAL_TEXT_LIMIT = 24000;   // 層Bに渡す本文合計の上限(文字数)

// ---- URL正規化・名称一致(コード側の機械的処理、LLM不使用) -----------------
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

// Markdown本文から実在するURLの集合を機械抽出する(捏造防止のallowlist)。
// markdownリンク [表示文](URL) と素のhttp(s) URLを拾い、正規化キー→生URLの
// Mapにする。**どのリンクが項目かの「選定」はGeminiが行う**。ここで作るのは
// 「Geminiが返したURLが本当にページ内に在ったか」を検証するための集合だけ。
function markdownUrlMap(md: string, sourceUrl: string): Map<string, string> {
  const map = new Map<string, string>();
  const srcKey = normUrl(sourceUrl);
  const add = (raw: string) => {
    const u = raw.replace(/[.,;>"']+$/, "").trim();
    if (!/^https?:\/\//i.test(u)) return;
    const k = normUrl(u);
    if (k === srcKey) return; // 情報源ページ自身は個別ページではない
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
    const headers: Record<string, string> = {
      Accept: "text/plain",
      "X-Return-Format": "markdown",
    };
    if (jinaKey) headers["Authorization"] = `Bearer ${jinaKey}`;
    const res = await fetch(JINA_BASE + url, {
      headers,
      signal: AbortSignal.timeout(30000),
    });
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

const SYSTEM_SELECT = `あなたは情報収集パイプラインのURL選定モジュールです。1つの情報源ページのMarkdown本文を読み、詳細を取得すべき個別ページのURLを選定します。

# 入力仕様
<基準日>: 判断の基準となる本日の日付
<プロファイル>: ユーザーの関心を表す3つの信号
  短期的関心: いま最も汲むべき関心事。選定の最優先の手がかりとする
  願望リスト: 具体的な願い。これに直接関連する候補は最優先で選定する
  長期的傾向: 恒常的な好み。候補が同程度のときの順位付けに使う
<選定上限>: 出力するURLの最大件数
<ページ>: 1つの情報源ページのMarkdown本文。リンクは [表示文](URL) の形式で含まれる

# 選定ルール
1. 出力するURLは<ページ>本文中に実在するものに限る。URLの生成・改変・補完は行わない。
2. 個別の催し・作品・イベントの詳細を述べるページへのリンクのみを選ぶ。一覧・索引・ナビゲーション・サイト案内・別テーマのガイド記事へのリンクは選ばない。
3. 本文中の日付が<基準日>より前で、既に終了していると判断できるものは選ばない。
4. プロファイルへの関連が否定できないものは選定に含める。該当がなければ0件とする。

# 出力契約
選定したURLのみを1行1件で出力する。URL以外の文字は一切出力しない。該当がない場合は何も出力しない。`;

const SYSTEM_CANDIDATES = `あなたは情報抽出パイプラインの候補抽出モジュールです。入力されるページのMarkdown本文だけを情報源として、候補レコードをJSON配列で出力します。

# 入力仕様
<基準日>: 判断の基準となる本日の日付
<抽出上限>: 1ページから作るレコードの最大件数
<ページ群>: 各ページのURLとMarkdown本文

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

function userSelect(todayJp: string, tasteBlock: string, selectLimit: number, md: string): string {
  return `<基準日>${todayJp}</基準日>\n<プロファイル>\n${tasteBlock}\n</プロファイル>\n<選定上限>${selectLimit}</選定上限>\n<ページ>\n${md}\n</ページ>`;
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
  fetched: boolean;         // Jinaでの取得に成功したか
  linkCount: number;        // Markdown中の実在リンク数(選定対象)
  selectedCount: number;    // 層Aが選んだ個別URL数
  droppedNotInPage: number; // 実在URL外としてGeminiの出力を破棄した数
  singleHop: boolean;       // 個別URLが選べずページ自体を使ったか
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
type SiteResult = {
  trace: SiteTrace;
  selectedUrls: string[];
  sourceUrl: string;
  sourceMd: string;
  fetched: boolean;
  usage: TokenUsage;
};
async function processSite(
  sourceUrl: string,
  key: string,
  todayJp: string,
  tasteBlock: string,
): Promise<SiteResult> {
  const page = await fetchViaJina(sourceUrl);
  if (!page.ok || !page.md) {
    return {
      trace: { source: sourceUrl, fetched: false, linkCount: 0, selectedCount: 0, droppedNotInPage: 0, singleHop: false },
      selectedUrls: [], sourceUrl, sourceMd: "", fetched: false, usage: ZERO_USAGE,
    };
  }
  const allow = markdownUrlMap(page.md, page.url);
  const linkCount = allow.size;

  const selectedUrls: string[] = [];
  let droppedNotInPage = 0;
  let usage = ZERO_USAGE;

  if (linkCount > 0) {
    const mdForA = page.md.slice(0, SOURCE_MD_LIMIT);
    const r = await callGemini(key, SYSTEM_SELECT, userSelect(todayJp, tasteBlock, SELECT_LIMIT_PER_SITE, mdForA), false);
    if (r.ok) {
      usage = addUsage(usage, r.usage);
      for (const raw of r.text.split(/\r?\n/)) {
        const u = raw.trim().replace(/^[-*・\d.\s]+/, "");
        if (!u || !/^https?:\/\//.test(u)) continue;
        const k = normUrl(u);
        if (allow.has(k)) {
          const canon = allow.get(k)!;
          if (!selectedUrls.includes(canon)) selectedUrls.push(canon);
        } else {
          droppedNotInPage++;
        }
        if (selectedUrls.length >= SELECT_LIMIT_PER_SITE) break;
      }
    }
  }

  const singleHop = selectedUrls.length === 0;
  return {
    trace: { source: sourceUrl, fetched: true, linkCount, selectedCount: selectedUrls.length, droppedNotInPage, singleHop },
    selectedUrls, sourceUrl, sourceMd: page.md, fetched: true, usage,
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
  // 層C(分類)にだけ4信号で渡す。
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

    // 層Bに渡すページ({url, md})を組み立てる。個別URLが選ばれたサイトはその
    // URLを取得対象に、選べなかったサイトは取得済みのソースMarkdownを単ホップで
    // そのまま使う(再取得しない)。
    const pages: { url: string; md: string }[] = [];
    const seen = new Set<string>();
    const toFetch: string[] = [];
    for (const r of siteResults) {
      if (!r.fetched) continue;
      if (r.selectedUrls.length > 0) {
        for (const u of r.selectedUrls) {
          const k = normUrl(u);
          if (seen.has(k)) continue;
          seen.add(k);
          toFetch.push(u);
        }
      } else {
        const k = normUrl(r.sourceUrl);
        if (!seen.has(k)) {
          seen.add(k);
          pages.push({ url: r.sourceUrl, md: r.sourceMd });
        }
      }
    }
    const room = Math.max(0, MAX_CANDIDATE_PAGES - pages.length);
    const fetchTargets = toFetch.slice(0, room);
    const fetched = await Promise.all(fetchTargets.map(fetchViaJina));
    const pagesRead: PageReadTrace[] = pages.map((p) => ({ url: p.url, ok: true }));
    for (const f of fetched) {
      pagesRead.push({ url: f.url, ok: f.ok && !!f.md });
      if (f.ok && f.md) pages.push({ url: f.url, md: f.md });
    }

    if (pages.length === 0) {
      return NextResponse.json({ ok: true, cards: [], candidateCount: 0, sites, pagesRead, dropped: ZERO_DROPS, tokens, note: "候補ページを取得できませんでした。" } satisfies GenResult);
    }

    // === 層B: 個別ページのMarkdownから、まとめて1回で候補レコード抽出 ===
    let budget = TOTAL_TEXT_LIMIT;
    const pageBlocks = pages
      .map((p) => {
        if (budget <= 0) return "";
        const slice = p.md.slice(0, Math.min(PAGE_TEXT_LIMIT, budget));
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
    const fetchedNorms = new Set(pages.map((p) => normUrl(p.url)));
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

    // サイト横断で同一事物を指す候補が複数残っていれば統合する(名称の緩い
    // 一致のみで判定する)。URL一致は使わない: 1ページから複数の異なる事物を
    // 抽出できる設計のため、URLが同じというだけで別々の事物を誤って統合して
    // しまうため。strong→moderateの順に見るため、重複時はstrong側を残す。
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
