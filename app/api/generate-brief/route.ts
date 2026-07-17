import { NextResponse } from "next/server";

// ブリーフ生成の実験用サーバー関数(フェーズC-0「プロンプト実験場」)。
//
// ★設計(2026-07-17 全面リファクタ、ユーザー指定):
// Gemini API は「渡したURLに自動アクセスして中身を読む」機能を確実には持た
// ない(url_contextはあるが読めないと平然と内容を捏造する)。そこで
// **プログラム側で対象URLへ実際にアクセスしてHTML本文テキストを取得し、
// その実テキストをプロンプトに変数として直接埋め込む**方式にする。これで
// AIは「実在するテキスト」だけを材料にでき、URL・内容の捏造が構造的に
// 起きなくなる。処理は2段階:
//   1回目(個別URL抽出): 取得した一覧ページの本文テキストと、コードで抽出した
//     実在リンク一覧を渡し、興味に合う個別記事URLを最大N件"選ばせる"
//     (実在リンク集合に無いURLはサーバー側で機械的に除外)。
//   2回目(カード生成): 選ばれた各個別URLのHTML本文をコードで取得し、その
//     実テキストを渡してJSONカードを生成させる。sourceUrlは取得済みURLに
//     限る(それ以外は除外)。
// システムプロンプト(役割・ルール固定)とユーザープロンプト(動的データ)を分離。
//
// GEMINI_API_KEY は NEXT_PUBLIC_ を付けずサーバー側だけが読む。未設定なら
// (この開発環境のように)静かに reason:"no_key" を返す。

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
// ---- トークン節約のための上限(SYSTEM-DESIGN.md §3-8) ----
// プロンプトへ入れるテキスト量=入力トークンなので、ここを絞るのが節約の要。
// ・スクレイプ本文はstripBoilerplate+htmlToTextでナビ/フッター等の無駄を除去
// ・2段階(安いリンク選定→選ばれた個別ページだけ取得)で不要ページを読まない
// ・出力もmaxOutputTokensで上限。モデルは最安のFlash-Lite。
const PAGE_TEXT_LIMIT = 4000; // 1個別ページあたりプロンプトへ入れる本文の最大文字数
const TOTAL_TEXT_LIMIT = 12000; // 2回目に入れる本文の合計上限(ページ数×上限の暴走防止)
const LINKS_LIMIT = 50;       // 1回目に渡す実在リンクの最大数(アンカー→URL)

// ---- HTML → テキスト / リンク抽出(コード側の機械的処理) -----------------
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}
// トークン節約: 本文以外の反復的な定型部分(ナビ・フッター・サイドバー・
// フォーム・SVGアイコン等)を先に落とす。これらは記事本文と無関係な文字列で、
// そのままだと入力トークンを無駄に食う。記事タイトルが入りうる<header>は
// 消さない(article内の見出しを落とさないため)。
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
// HTMLの<a href>から実在リンクを機械的に抽出する(URLの推測創作を排除する要)。
function extractLinks(html: string, baseUrl: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const rawHref = m[1].trim();
    if (/^(#|javascript:|mailto:|tel:|data:)/i.test(rawHref)) continue;
    let abs: string;
    try { abs = new URL(rawHref, baseUrl).toString(); } catch { continue; }
    if (!/^https?:/i.test(abs)) continue;
    const key = normUrl(abs);
    if (seen.has(key)) continue;
    seen.add(key);
    const text = htmlToText(m[2]).slice(0, 100);
    out.push({ url: abs, text });
  }
  return out;
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
    // 定型部分(ナビ/フッター等)を先に除去してからテキスト化・リンク抽出する
    // (トークン節約 + 抽出リンクからナビ項目を減らす)。
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

// url_context は使わない(テキストは自前でプロンプトに埋め込む)。tools無しなので
// 2回目は responseMimeType:application/json のJSONモードを使い、パースを堅くする。
async function callGemini(
  key: string,
  systemText: string,
  userText: string,
  jsonMode: boolean,
): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
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
  return { ok: true, text };
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

// ---- プロンプト(システム=役割・ルール固定 / ユーザー=動的データ) --------
const SYSTEM_DISCOVER = `あなたは、ユーザーの関心に基づいて「次に読むべき個別ページ」を選ぶURL選定システムです。入力される「実在リンク一覧(アンカーテキスト → URL)」は、一覧ページのHTMLから機械的に抽出された実在リンクです。
厳守事項:
1. 出力するURLは、必ず入力の「実在リンク一覧」に含まれるものだけにする。URLの推測・改変・一部変更・創作は一切しない。
2. 一覧ページの主題(例: 展覧会一覧なら個々の展覧会)に沿う、個別の催し・作品・記事の詳細ページだけを選ぶ。トップ・カテゴリ索引・ナビゲーション・過去アーカイブの一覧など、個別の内容を指さないリンクは選ばない。
3. アンカーテキストから、既に終了した過去の催しだと明らかに判断できるものは選ばない。
4. ユーザーの関心に合致するものが無ければ、何も出力しない。`;

const SYSTEM_EXTRACT = `あなたは、与えられたWebページの本文からユーザー向けの提案カードをJSONで作る情報抽出システムです。
絶対原則:
1. 事実の厳格な抽出(No Hallucination): 各ページの本文テキストに実際に書かれている事実だけを使う。書かれていないことの補完・推測・創作は禁止。何が・どこで・いつ が読み取れないページはカードにしない。
2. 現在時刻の考慮: 与えられた「今日の日付」を基準に、開催中またはこれから始まる催し・情報だけを対象にする。既に終了した(会期や締切が今日より前の)ものはカードにしない。会期末・終了日・締切が本文から読み取れる場合は expiresAt にその日付(ISO8601)を入れる。
3. URLの正確性: sourceUrl は、そのカードの根拠にしたページとして入力で与えられたURLをそのまま使う。推測・改変・創作は禁止。
4. エリア: 提案は原則【生活圏】の範囲内に限る。生活圏外は、ユーザーの関心に極めて強く合致する非日常的なものに限り最大1件だけ許可し、その場合 serendipity:true と trigger:"セレンディピティ" を付ける。
5. 客観的かつ簡潔: ユーザー個人の予定や行動(例「仕事帰りに寄れる」)を前提にした表現は使わない。なぜ今それが良いのかが一読で伝わる、短く具体的な文にする。誇張しない。
6. 指定のJSON以外は一切出力しない。合致する情報が無ければ [] を返す。`;

type GeneratedCard = {
  title: string; body: string; kind: string; trigger: string;
  area?: string; sourceUrl?: string; sourceLabel?: string; meta?: string[];
  expiresAt?: string; serendipity?: boolean; sourceWishTitle?: string;
};
type PageStatus = { url: string; ok: boolean };
type GenResult =
  | { ok: true; cards: GeneratedCard[]; raw: string; pages: PageStatus[]; dropped: number; note?: string }
  | { ok: false; reason: string; detail?: string };

const LIVING_AREA = "東京23区(および電車で日常的に行ける範囲)";

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
    .slice(0, 3); // 一覧を実取得するので入口は絞る
  const count = Math.min(Math.max(body.count ?? 3, 1), 6);
  if (sources.length === 0) return NextResponse.json({ ok: false, reason: "no_sources" } satisfies GenResult);

  // 3種の関心を、役割を分けて渡す(無差別なタグの羅列にしない)。
  // focus=今の気分(最優先)、wishes=具体的な願い(直接応えると価値大)、
  // interests=長期の傾向(全体のバイアス)。
  const tasteBlock = [
    `- 今、特に気になっていること(今の気分。最優先で汲む): ${focus || "なし"}`,
    `- 叶えたい願い(これに直接応える情報は特に価値が高い): ${wishes.length ? wishes.join(" / ") : "なし"}`,
    `- 長期的な興味・好みの傾向(全体のバイアス): ${interests.length ? interests.join(" / ") : "なし"}`,
  ].join("\n");

  // 東京基準の今日の日付(過去の催しを除外する判断材料)。
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayJp = `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;

  try {
    // === 事前: 情報源(一覧)ページを実取得し、本文テキストと実在リンクを得る ===
    const indexPages = await Promise.all(sources.map(fetchPage));
    const readable = indexPages.filter((p) => p.ok && p.text);
    if (readable.length === 0) {
      return NextResponse.json({ ok: false, reason: "source_fetch_failed" } satisfies GenResult);
    }
    // 同一ホストの実在リンクだけを集約(ナビ等も混じるが、選定はLLM+検証に任せる)。
    const linkPool: { url: string; text: string }[] = [];
    const linkKeys = new Set<string>();
    for (const p of readable) {
      const host = (() => { try { return new URL(p.url).host; } catch { return ""; } })();
      for (const l of extractLinks(p.html, p.url)) {
        let lh = ""; try { lh = new URL(l.url).host; } catch { /* skip */ }
        if (lh !== host) continue;                 // 同一ドメインのみ
        if (sources.some((s) => normUrl(s) === normUrl(l.url))) continue; // 一覧自身は除外
        const k = normUrl(l.url);
        if (linkKeys.has(k)) continue;
        linkKeys.add(k);
        linkPool.push(l);
        if (linkPool.length >= LINKS_LIMIT) break;
      }
      if (linkPool.length >= LINKS_LIMIT) break;
    }

    // === 1回目: 一覧テキスト+実在リンクから、興味に合う個別URLを選ばせる ===
    const selected: string[] = [];
    if (linkPool.length > 0) {
      // トークン節約: 一覧本文そのものは冗長(定型が多い)なので渡さず、記事の
      // 見出し情報を担う「アンカーテキスト -> URL」の一覧だけを渡す。選定に
      // 必要な情報はこれで足りる。
      const listText = linkPool.map((l) => `${l.text || "(無題)"} -> ${l.url}`).join("\n");
      const discoverUser = `今日は${todayJp}です。
以下の「実在リンク一覧」から、下記ユーザーの関心に合致し、今読む価値のある個別ページのURLを最大${count}件選んでください。アンカーテキストから既に終了した過去の催しだと明らかに分かるものは選ばないでください。
出力は選んだURLのみを改行区切りで。説明文やコードフェンスは付けない。一覧に無いURLは出力しない。合致するものが無ければ何も出力しない。

【ユーザーの関心】
${tasteBlock}

【実在リンク一覧(アンカーテキスト -> URL)】
${listText}`;
      const r1 = await callGemini(key, SYSTEM_DISCOVER, discoverUser, false);
      if (r1.ok) {
        const allowed = new Set(linkPool.map((l) => normUrl(l.url)));
        const byNorm = new Map(linkPool.map((l) => [normUrl(l.url), l.url]));
        for (const line of r1.text.split(/\s*\n\s*/)) {
          const u = line.trim().replace(/^[-*・\d.\s]+/, "");
          if (!/^https?:\/\//.test(u)) continue;
          const k = normUrl(u);
          if (allowed.has(k) && !selected.includes(byNorm.get(k)!)) selected.push(byNorm.get(k)!);
          if (selected.length >= count) break;
        }
      }
    }

    // === 2回目: 個別ページ(選ばれたURL)を実取得して本文を渡し、カード生成 ===
    // 個別URLが選べなければ、一覧ページ自身の本文から生成する(実テキストなので
    // 捏造にはならない。sourceUrl=一覧URL の浅い結果になるだけ)。
    let note: string | undefined;
    let pagesToUse: FetchedPage[];
    if (selected.length > 0) {
      pagesToUse = await Promise.all(selected.map(fetchPage));
    } else {
      pagesToUse = readable;
      note = "興味に合う個別記事URLを特定できなかったため、一覧ページの内容から生成しました。";
    }
    const pages: PageStatus[] = pagesToUse.map((p) => ({ url: p.url, ok: p.ok && !!p.text }));
    const usable = pagesToUse.filter((p) => p.ok && p.text);
    if (usable.length === 0) {
      return NextResponse.json({ ok: true, cards: [], raw: "", pages, dropped: 0, note: "選ばれたページの本文を取得できませんでした。" } satisfies GenResult);
    }

    // トークン節約: 各ページはPAGE_TEXT_LIMITで切り、さらに合計がTOTAL_TEXT_LIMIT
    // を超えないよう前から詰める(ページ数が多いときの入力トークン暴走を防ぐ)。
    let budget = TOTAL_TEXT_LIMIT;
    const pageBlocks = usable
      .map((p) => {
        if (budget <= 0) return "";
        const slice = p.text.slice(0, Math.min(PAGE_TEXT_LIMIT, budget));
        budget -= slice.length;
        return `URL: ${p.url}\n内容: ${slice}`;
      })
      .filter(Boolean)
      .join("\n\n====\n\n");
    const extractUser = `今日は${todayJp}です。以下の各ページの本文から、下記ユーザーの関心に合う「開催中またはこれから始まる」情報を、最大${count}枚のカードにしてJSON配列で出力してください。既に終了した(会期・締切が今日より前の)ものは含めないでください。合うものが無ければ [] を返してください。

【生活圏】
${LIVING_AREA}

【ユーザーの関心】
${tasteBlock}

【ページ内容(それぞれ URL と本文)】
${pageBlocks}

【出力フォーマット】
JSONの配列のみ(マークダウンのコードフェンスや説明文は一切付けない)。各要素のキー:
- title: 短い見出し
- body: 短い説明(なぜ今おすすめかが一読で分かる)
- kind: "place"|"exhibition"|"live"|"activity"|"food"|"movie"|"book"|"album"|"info"|"thing" のいずれか
- trigger: "タイムリー"|"興味との一致"|"ロケーション"|"セレンディピティ" のいずれか
- area: 場所が関わる場合のみ、東京23区内のエリア名(例「蔵前」)
- sourceUrl: そのカードの根拠にした、上で与えられたページのURL
- sourceLabel: リンクの文言(例「公式サイトを見る」)
- meta: 会場・日時・料金などの短い補足の文字列配列(任意)
- expiresAt: 会期末・締切が読み取れる場合のみ ISO8601(任意)
- serendipity: 生活圏外の特別枠なら true(任意)
- sourceWishTitle: 特定の「叶えたい願い」に直接応える場合のみ、その願いのタイトルを完全一致で(任意)`;

    const r2 = await callGemini(key, SYSTEM_EXTRACT, extractUser, true);
    if (!r2.ok) {
      return NextResponse.json({ ok: false, reason: `gemini_${r2.status}`, detail: r2.detail } satisfies GenResult, { status: 502 });
    }
    const rawCards = extractJsonArray<GeneratedCard>(r2.text) ?? [];

    // 最終防波堤(2つ):
    // (1) sourceUrl が「実際に本文を取得できたURL」に一致するカードだけ通す
    //     (モデルが推測創作したURLを排除)。
    // (2) expiresAt が今日より過去のカードは除外(終了済みの催しを機械的に落とす。
    //     AIが原則2を守り損ねた場合の保険)。
    const fetchedNorms = new Set(usable.map((p) => normUrl(p.url)));
    const nowMs = Date.now();
    const cards = rawCards.filter((c) => {
      const su = (c.sourceUrl ?? "").trim();
      if (!su || !fetchedNorms.has(normUrl(su))) return false;
      if (c.expiresAt) {
        const t = Date.parse(c.expiresAt);
        if (!Number.isNaN(t) && t < nowMs) return false;
      }
      return true;
    });
    const dropped = rawCards.length - cards.length;

    return NextResponse.json({ ok: true, cards, raw: r2.text, pages, dropped, note } satisfies GenResult);
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: "fetch_failed", detail: e instanceof Error ? e.message : String(e) } satisfies GenResult,
      { status: 502 },
    );
  }
}
