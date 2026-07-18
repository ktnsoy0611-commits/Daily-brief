import { NextResponse } from "next/server";

// ブリーフ生成の実験用サーバー関数(フェーズC-0「プロンプト実験場」)。
//
// ★アーキテクチャ(2026-07-17 再設計): 「抽出」と「編成」を分離した3段階。
// 1サイトずつのURL選定・カード直接生成という以前の設計では、複数サイトを
// 扱うと各サイトが勝手にセレンディピティを出す・枚数を管理できない・
// サイト間の重複を検知できない、という問題があった。これを解消するため:
//
//   層A(サイトごと・並列): 一覧ページのリンクから、読む価値のある個別
//     ページURLを選ぶ。判断はテーマ・時期の粗い足切りのみ(質の判断はしない)。
//     一覧構造を持たないサイト(単体記事等)はコード側の型判定でこの層を
//     スキップし、ページ自体を直接次の層へ渡す。
//   層B(全サイトまとめて1回): 個別ページの本文から、評価を含まない中立な
//     「候補レコード」(名称・要約・場所・期間・出典)を抽出する。
//   層C(1回): 全候補を横並びで比較し、最終カードを選抜・編成する。
//     セレンディピティ枠(全体で最大1枚)・重複統合・枚数管理はここだけの仕事。
//
// 各層の間・後にコード側の検証を挟む(出典URLの実在確認・期限切れ除外・
// セレンディピティ超過除外・枚数クランプ)。プロンプトはAIに与える必要の
// ある指示のみで構成し、設計の経緯や会話の文脈は含めない。
//
// GEMINI_API_KEY は NEXT_PUBLIC_ を付けずサーバー側だけが読む。未設定なら
// (この開発環境のように)静かに reason:"no_key" を返す。

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const LIVING_AREA = "東京23区(および電車で日常的に行ける範囲)";

// ---- 上限(トークン・件数の制御) ------------------------------------------
const LISTING_MIN_LINKS = 4;    // 同一ホストへのリンクがこれ以上なら「一覧型」
const LINKS_LIMIT_PER_SITE = 50; // 1サイトから層Aへ渡すリンクの最大数
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

const SYSTEM_CURATE = `あなたは情報編成パイプラインのデッキ編成モジュールです。候補レコード群を比較し、提案カードをJSON配列で生成します。

# 入力仕様
<基準日>: 判断の基準となる本日の日付
<生活圏>: 提案対象とする地理的範囲
<プロファイル>: ユーザーの関心を表す3つの信号
  短期的関心: いま最も汲むべき関心事。選抜の最優先の手がかりとする
  願望リスト: 具体的な願い。これに直接応えるカードは最も価値が高い
  長期的傾向: 恒常的な好み。候補が同程度のときの順位付けに使う
<編成上限>: カードの最大枚数
<候補一覧>: 候補レコード(JSON配列)

# 編成ルール
1. カードの記述は候補レコードに含まれる情報のみを根拠とする。レコードに無い情報の補完・推測は禁止。
2. プロファイルとの合致度が高い候補から順に<編成上限>以内で選ぶ。合致する候補が無ければ少ない枚数または空でよい。
3. 明らかに同一の事物を指す候補が複数ある場合は1枚に統合し、情報が最も詳しい候補の sourceUrl を用いる。
4. 所在地が<生活圏>内の候補を選ぶ。圏外の候補は、願望リストまたは短期的関心に強く合致する場合に限り全体で最大1枚だけ選び、serendipity を true、trigger を "セレンディピティ" とする。
5. 各カードに主たる選定理由を1つ付ける。時期が理由なら "タイムリー"、長期的傾向が理由なら "興味との一致"、場所・地域性が理由なら "ロケーション"、ルール4の場合は "セレンディピティ"。
6. 願望リストのいずれかに直接応えるカードのみ、sourceWishTitle にその願いを一字一句同じ文字列で記す。
7. title は事物が分かる短い見出し、body は選定理由が一読で分かる1〜3文とする。ユーザーの予定・行動の推測は含めない。
8. 下記スキーマのJSON配列のみを出力する。該当がなければ [] を出力する。

# 出力スキーマ
title / body / kind("place"|"exhibition"|"live"|"activity"|"food"|"movie"|"book"|"album"|"info"|"thing") / trigger("タイムリー"|"興味との一致"|"ロケーション"|"セレンディピティ") / area(任意) / sourceUrl / sourceLabel / meta(任意,文字列配列) / expiresAt(任意,ISO8601) / serendipity(任意,真偽値) / sourceWishTitle(任意)`;

function userSelect(todayJp: string, tasteBlock: string, selectLimit: number, lines: string): string {
  return `<基準日>${todayJp}</基準日>\n<プロファイル>\n${tasteBlock}\n</プロファイル>\n<選定上限>${selectLimit}</選定上限>\n<リンク一覧>\n${lines}\n</リンク一覧>`;
}
function userCandidates(todayJp: string, extractLimit: number, pageBlocks: string): string {
  return `<基準日>${todayJp}</基準日>\n<抽出上限>${extractLimit}</抽出上限>\n<ページ群>\n${pageBlocks}\n</ページ群>`;
}
function userCurate(todayJp: string, livingArea: string, tasteBlock: string, count: number, candidatesJson: string): string {
  return `<基準日>${todayJp}</基準日>\n<生活圏>${livingArea}</生活圏>\n<プロファイル>\n${tasteBlock}\n</プロファイル>\n<編成上限>${count}</編成上限>\n<候補一覧>\n${candidatesJson}\n</候補一覧>`;
}

// ---- 型 -------------------------------------------------------------------
type CandidateRecord = {
  name: string; summary?: string; venue?: string; area?: string;
  start?: string; end?: string; price?: string; sourceUrl?: string;
};
type GeneratedCard = {
  title: string; body: string; kind: string; trigger: string;
  area?: string; sourceUrl?: string; sourceLabel?: string; meta?: string[];
  expiresAt?: string; serendipity?: boolean; sourceWishTitle?: string;
};
type SiteTrace = {
  source: string;
  fetched: boolean;
  pageType?: "listing" | "single";
  sameHostLinkCount: number;
  excludedByDate: number;
  sentToSelectionCount: number;
  selectedCount: number;
  droppedNotInLinkSet: number;
};
type PageReadTrace = { url: string; ok: boolean };
type DropSummary = { sourceInvalid: number; expired: number; duplicateCandidate: number; serendipityExtra: number; overCount: number };
const ZERO_DROPS: DropSummary = { sourceInvalid: 0, expired: 0, duplicateCandidate: 0, serendipityExtra: 0, overCount: 0 };

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
      trace: { source: sourceUrl, fetched: false, sameHostLinkCount: 0, excludedByDate: 0, sentToSelectionCount: 0, selectedCount: 0, droppedNotInLinkSet: 0 },
      candidateUrls: [],
      usage: ZERO_USAGE,
    };
  }
  let host = "";
  try { host = new URL(page.url).host; } catch { /* noop */ }
  const rawLinks = extractLinksWithContext(page.html, page.url).filter((l) => {
    let lh = "";
    try { lh = new URL(l.url).host; } catch { return false; }
    return lh === host && normUrl(l.url) !== normUrl(sourceUrl) && normUrl(l.url) !== normUrl(page.url);
  });
  const sameHostLinkCount = rawLinks.length;
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

  const pageType: "listing" | "single" = sameHostLinkCount >= LISTING_MIN_LINKS ? "listing" : "single";

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
      sameHostLinkCount, excludedByDate,
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

  let body: { wishes?: string[]; interests?: string[]; focus?: string; sources?: string[]; count?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" } satisfies GenResult, { status: 400 });
  }

  const wishes = (body.wishes ?? []).filter((w) => typeof w === "string" && w.trim()).slice(0, 20);
  const interests = (body.interests ?? []).filter((i) => typeof i === "string" && i.trim()).slice(0, 20);
  const focus = (body.focus ?? "").trim();
  const sources = (body.sources ?? [])
    .filter((u) => typeof u === "string" && /^https?:\/\//.test(u.trim()))
    .map((u) => u.trim())
    .slice(0, 3);
  const count = Math.min(Math.max(body.count ?? 3, 1), 6);
  if (sources.length === 0) return NextResponse.json({ ok: false, reason: "no_sources" } satisfies GenResult);

  const tasteBlock = `短期的関心: ${focus || "なし"}\n願望リスト: ${wishes.length ? wishes.join(" / ") : "なし"}\n長期的傾向: ${interests.length ? interests.join(" / ") : "なし"}`;

  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayJp = `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;

  try {
    // === 層A: サイトごとに並列でURL選定 ===
    const siteResults = await Promise.all(sources.map((s) => processSite(s, key, todayJp, tasteBlock)));
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

    // === 層C: 全候補を1回で比較・編成 ===
    const rC = await callGemini(key, SYSTEM_CURATE, userCurate(todayJp, LIVING_AREA, tasteBlock, count, JSON.stringify(candidates)), true);
    if (!rC.ok) {
      return NextResponse.json({ ok: false, reason: `gemini_${rC.status}`, detail: rC.detail } satisfies GenResult, { status: 502 });
    }
    tokens = addUsage(tokens, rC.usage);
    const rawCards = extractJsonArray<GeneratedCard>(rC.text) ?? [];

    // 層D: 出典検証・期限切れ除外・セレンディピティ超過除外・枚数クランプ。
    const candidateUrlSet = new Set(candidates.map((c) => normUrl((c.sourceUrl ?? "").trim())));
    let serendipitySeen = false;
    let dropSourceInvalid2 = 0, dropExpired2 = 0, dropSerendipity = 0, dropOverCount = 0;
    const cards: GeneratedCard[] = [];
    for (const c of rawCards) {
      const su = (c.sourceUrl ?? "").trim();
      if (!su || !candidateUrlSet.has(normUrl(su))) { dropSourceInvalid2++; continue; }
      if (c.expiresAt) {
        const t = Date.parse(c.expiresAt);
        if (!Number.isNaN(t) && t < Date.now()) { dropExpired2++; continue; }
      }
      if (c.serendipity) {
        if (serendipitySeen) { dropSerendipity++; continue; }
        serendipitySeen = true;
      }
      if (cards.length >= count) { dropOverCount++; continue; }
      cards.push(c);
    }

    return NextResponse.json({
      ok: true, cards, candidateCount: candidates.length, sites, pagesRead,
      dropped: {
        sourceInvalid: dropSourceInvalid + dropSourceInvalid2,
        expired: dropExpired + dropExpired2,
        duplicateCandidate: dropDup,
        serendipityExtra: dropSerendipity,
        overCount: dropOverCount,
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
