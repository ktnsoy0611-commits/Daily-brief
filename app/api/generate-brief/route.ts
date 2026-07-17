import { NextResponse } from "next/server";

// ブリーフ生成の実験用サーバー関数(フェーズC-0「プロンプト実験場」)。
// SYSTEM-DESIGN.md §3-1/§3-2 のプロンプト設計を実際にGeminiへ投げ、
// **渡した情報源URLのページだけ**を url_context で読ませて(Google全体の検索
// ではなく)、そこに実際に載っている情報からブリーフカードのJSONを返す。
//
// ★2段階トラバース(一覧→個別URLをLLMに抽出させる)は撤回した。LLMにURLを
// 「抽出」させると、実際にはURLを推測・創作し、その偽URLをurl_contextが読めず
// 内容ごと捏造する事故が起きたため(2026-07-17)。深いURLへの対応は、URLを
// LLMに作らせるのではなく「サーバーが実HTMLからリンクを抽出する」方式で
// 別途やる。ここは「実在ページを直接読む・読んだページのURLしか使わせない・
// 読めたURL以外は機械的に除外する」という、捏造を出さないことを最優先にした
// 単段階に戻してある。
//
// GEMINI_API_KEY は NEXT_PUBLIC_ を付けずサーバー側だけが読む。未設定なら
// (この開発環境のように)静かに reason:"no_key" を返す。

export const runtime = "nodejs";
export const maxDuration = 60;

// 既定のモデル。環境変数 GEMINI_MODEL で上書きできる。
// **モデル選定の根拠(コスト精査)**: この実験の中身は「渡した情報源ページを
// 読んでカードに整形・抜き出す」= ほぼ抽出タスク。深い推論は要らない。
// Gemini は Pro(高性能・高コスト) > Flash(低コスト) > Flash-Lite(最安) の3階層で、
// SYSTEM-DESIGN.md §3-2 も新着抽出は Flash-Lite と定めている。Flash-Lite でも
// url_context に対応しており能力面で不足しないため最安の Flash-Lite を既定に。
// 特定バージョンの決め打ちは「新規ユーザーにはもう使えない」等で404になる
// (実際 gemini-2.5-flash がそうなった)ため -latest エイリアスを使い、それでも
// 駄目なら listFlashModel() で実在モデルへ自動フォールバックする。
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function endpointFor(model: string) {
  const m = model.startsWith("models/") ? model.slice("models/".length) : model;
  return `${API_BASE}/models/${m}:generateContent`;
}

// このキーで実際に generateContent できる flash 系モデルを1つ探す。
// コスト優先で Flash-Lite → Flash の順に、かつ安定版(-latest)を優先して選ぶ。
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

type RetrievedUrl = { url: string; status: string };

// url_context 付きで1回 generateContent を呼ぶ。モデルの404は listFlashModel()
// で1回だけ再解決して再試行する。生テキストと、url_context が実際に取得した
// URL(+成功/失敗ステータス)を返す。
async function callGemini(
  key: string,
  systemText: string,
  userText: string,
): Promise<{ ok: true; text: string; retrieved: RetrievedUrl[] } | { ok: false; status: number; detail: string }> {
  const reqBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    tools: [{ url_context: {} }],
    // 温度は低め(創作より抽出寄り)。出力トークン上限でコストも抑える。
    generationConfig: { temperature: 0.3, maxOutputTokens: 3072 },
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
  const cand = data?.candidates?.[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = (cand?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("").trim();
  const meta = cand?.urlContextMetadata?.urlMetadata ?? cand?.url_context_metadata?.url_metadata ?? [];
  const retrieved: RetrievedUrl[] = meta
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => ({ url: m?.retrievedUrl ?? m?.retrieved_url ?? "", status: m?.urlRetrievalStatus ?? m?.url_retrieval_status ?? "" }))
    .filter((m: RetrievedUrl) => m.url);
  return { ok: true, text, retrieved };
}

// モデルの返答から JSON 配列だけを頑健に取り出す。
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

// URL正規化(origin+pathの末尾スラッシュとフラグメントを落として比較用に)。
function normUrl(u: string): string {
  try {
    const x = new URL(u);
    return (x.origin + x.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return u.trim().replace(/\/+$/, "").toLowerCase();
  }
}

// §3-1/§3-2 の大原則。捏造の停止を最優先にし、「読んだページのURLしか使わない・
// URLを推測創作しない・読み取れなければカードにしない(空配列を返す)」を最上位に。
const SYSTEM_PROMPT = `あなたは私専属の編集者です。私の願い(ウィッシュ)と興味を知り尽くし、私が信頼して登録した情報源から、質の高い情報を雑誌の号のように届けます。生活圏は東京23区です。

絶対に守る原則:
1. 私が渡す「情報源URL」のページを実際に読み、そのページに載っている情報だけを使う。ページに書かれていないことは書かない。一般的な知識で補完しない(抽出であって検索ではない)。
2. 事実を創作しない。実在しないイベント・店・作品・日付を書かない。ページから読み取れない項目はカードにしない。1枚も作れないなら空配列[]を返す。少ないのは全く問題ない。
3. URLを推測・創作しない。sourceUrlは、あなたが実際に読んだ上記の情報源ページのURLそのものにする。読んでいないページ・存在を確認していないURLは絶対に書かない。
4. 動線・予定・貯金額・運動記録には一切言及しない。それらのデータは存在しない。「仕事帰りに」等、私の行動予定を知っている前提の文言は禁止。
5. 生活圏は東京23区。通常のカードは東京23区および電車で日常的に行ける範囲に限る。遠方の非日常的な提案はセレンディピティ枠として最大1枚だけ、serendipity:true と trigger:"セレンディピティ" を付ける(無ければ0枚)。
6. 簡潔・具体的に。「なぜ今か」が一行で分かるように。誇張しない。

トーン参考(この簡潔さ・具体性を真似る):
- title:「単館上映のドキュメンタリー、今週が最終週」/ body:「建築をテーマにしたドキュメンタリーが両国のミニシアターで上映中。今週の金曜が最終日、その後の上映予定は未定です。」
- title:「谷根千の小さな雑貨店、一年に一度の陶器市」/ body:「普段は棚に並びきらない作家ものの器が、期間限定で店先に広がります。年に一度なので、今週を逃すと来年までお預けです。」`;

type GeneratedCard = {
  title: string;
  body: string;
  kind: string;
  trigger: string;
  area?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  meta?: string[];
  expiresAt?: string;
  serendipity?: boolean;
  sourceWishTitle?: string;
};

type GenResult =
  | { ok: true; cards: GeneratedCard[]; raw: string; retrieved: RetrievedUrl[]; dropped: number }
  | { ok: false; reason: string; detail?: string };

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, reason: "no_key" } satisfies GenResult);
  }

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
    .slice(0, 10);
  const count = Math.min(Math.max(body.count ?? 3, 1), 6);

  if (sources.length === 0) {
    return NextResponse.json({ ok: false, reason: "no_sources" } satisfies GenResult);
  }

  const userPrompt = `次のページを実際に読み、そこに載っている情報の中から、私の願い・興味に合うものを最大${count}枚のブリーフカードにしてください。ページに載っていないことは書かないでください。合うものが少なければ枚数を減らし、無ければ空配列[]を返してください。

【今、特に気になっていること】
${focus || "(未記入)"}

【叶えたい願い(ウィッシュ)】
${wishes.length ? wishes.map((w) => `- ${w}`).join("\n") : "(まだありません)"}

【興味・好み】
${interests.length ? interests.join(" / ") : "(まだありません)"}

【読むページ】
${sources.map((u) => `- ${u}`).join("\n")}

sourceUrl は、上に挙げた「実際に読んだページ」のURLにしてください(推測したURLは禁止)。

出力は次の形式のJSON配列だけ(前後に説明文やmarkdownのコードフェンス無し)。各要素:
- title: 見出し(20字前後、簡潔に)
- body: 本文(2〜3文。なぜ今かが分かるように)
- kind: "place"(場所) "exhibition"(展覧会) "live"(ライブ・コンサート) "activity"(体験・習い事) "food"(グルメ) "movie"(映画) "book"(本) "album"(音楽) "info"(知識・記事) "thing"(モノ) のいずれか
- trigger: "タイムリー" "興味との一致" "ロケーション" "セレンディピティ" のいずれか
- area: 場所が関わる場合、東京23区内のエリア名(例「蔵前」「神保町」)。無ければ省略
- sourceUrl: 上で実際に読んだページのURL(必須。推測URL禁止)
- sourceLabel: sourceUrlのリンク文言(例「公式サイトを見る」)
- meta: 補足の短い箇条書き(会場・時間・価格など)2〜3個の文字列配列。無ければ省略
- expiresAt: 会期末・締切があるときだけ ISO8601(例 "2026-08-31T23:59:59+09:00")
- sourceWishTitle: 特定のウィッシュに応えたカードなら、そのウィッシュのタイトルを完全一致で`;

  try {
    const r = await callGemini(key, SYSTEM_PROMPT, userPrompt);
    if (!r.ok) {
      return NextResponse.json({ ok: false, reason: `gemini_${r.status}`, detail: r.detail } satisfies GenResult, { status: 502 });
    }
    const rawCards = extractJsonArray<GeneratedCard>(r.text) ?? [];

    // ★捏造URLの最終防波堤: sourceUrl が「実際に取得成功したURL」または
    // 「渡した情報源URL」のどれかに一致するカードだけを通す。それ以外
    // (モデルが推測・創作したURL)は機械的に除外する。retrievedの情報が
    // まったく取れなかった場合のみ、同一ドメインを緩く許容する。
    const retrievedOk = new Set(r.retrieved.filter((x) => /success/i.test(x.status)).map((x) => normUrl(x.url)));
    const sourceNorms = new Set(sources.map(normUrl));
    const allow = new Set<string>([...retrievedOk, ...sourceNorms]);
    const hostOf = (u: string) => {
      try { return new URL(u).host.replace(/^www\./, ""); } catch { return ""; }
    };
    const sourceHosts = new Set(sources.map(hostOf));

    const cards = rawCards.filter((c) => {
      const su = (c.sourceUrl ?? "").trim();
      if (!su) return false;
      if (allow.has(normUrl(su))) return true;
      if (retrievedOk.size > 0) return false; // 取得成功URLがあるのにそれ以外=創作とみなし除外
      return sourceHosts.has(hostOf(su)); // retrieved不明時のみ同一ドメインを緩く許容
    });
    const dropped = rawCards.length - cards.length;

    return NextResponse.json({ ok: true, cards, raw: r.text, retrieved: r.retrieved, dropped } satisfies GenResult);
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: "fetch_failed", detail: e instanceof Error ? e.message : String(e) } satisfies GenResult,
      { status: 502 },
    );
  }
}
