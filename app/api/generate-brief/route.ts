import { NextResponse } from "next/server";

// ブリーフ生成の実験用サーバー関数(フェーズC-0「プロンプト実験場」)。
// SYSTEM-DESIGN.md §3-1/§3-2/§7-3 のプロンプト設計を実際にGeminiへ投げ、
// **渡した情報源URLのページだけ**を読ませて(Google全体の検索ではなく)、
// そこに実際に載っている情報からブリーフカードのJSONを返す。
//
// ★2段階のリンクトラバース(§7-3)を実装している:
//   段階1(探索): 渡された一覧/インデックスページを url_context で読み、
//                そこに並ぶ「個別項目ページのURL」を抜き出す。
//   段階2(抽出): 段階1で見つけた個別ページURLを url_context に渡して実際に
//                読ませ、詳細と正しい深いURLからカードを作る。
// url_context は「プロンプトに書かれたURL」を取得するので、段階2で個別URLを
// 渡すことで、一覧のトップページではなく個別ページの中身まで読ませられる。
// (段階1が個別URLを見つけられなければ、段階2は元の情報源URLをそのまま
//  読む従来動作にフォールバックする。)
//
// GEMINI_API_KEY は NEXT_PUBLIC_ を付けずサーバー側だけが読む。未設定なら
// (この開発環境のように)静かに reason:"no_key" を返す。

export const runtime = "nodejs";
export const maxDuration = 60; // 2段階+複数URL読み込みで数十秒かかりうる

// 既定のモデル。環境変数 GEMINI_MODEL で上書きできる。
// **モデル選定の根拠(コスト精査)**: この実験の中身は「渡した情報源ページを
// 読んで、カード形式に整形・抜き出す」= ほぼ抽出タスク。深い推論は要らない。
// Geminiは Pro(高性能・高コスト) > Flash(低コスト) > Flash-Lite(最安) の3階層で、
// SYSTEM-DESIGN.md §3-2 も新着抽出は Flash-Lite と定めている。Flash-Lite でも
// url_context(URL読み込み)は対応しており能力面で不足しないため、最安の
// Flash-Lite を既定にする(推論の重い "thinking" 系モデルは避ける)。特定
// バージョンの決め打ちは「新規ユーザーにはもう使えない」等で404になる
// (実際 gemini-2.5-flash がそうなった)ため、-latest エイリアスを使い、それでも
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

// url_context 付きで1回 generateContent を呼ぶ共通ヘルパー。モデルの404は
// listFlashModel() で1回だけ再解決して再試行する。返すのは生テキストと、
// url_context が実際に取得したURL(段階の可視化用)。
async function callGemini(
  key: string,
  systemText: string,
  userText: string,
): Promise<{ ok: true; text: string; retrieved: RetrievedUrl[] } | { ok: false; status: number; detail: string }> {
  const reqBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    tools: [{ url_context: {} }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 3072 },
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

// モデルの返答(```json ...``` で囲まれていたり前後にプロローグが付いたり
// する)から、JSON配列だけを頑健に取り出す。
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

// ---- 段階1: 探索(一覧ページ→個別項目ページのURL) ----------------------
const DISCOVER_SYSTEM = `あなたはWebページの構造を読むアシスタントです。渡された一覧・インデックスページを実際に読み、そこに並んでいる個別項目(展覧会・上映・イベント・記事など)の「個別ページへのリンク先URL」を抜き出します。一覧ページ自身のURL・トップページ・ナビゲーション・広告・SNSリンクは含めません。ページに実在するリンクだけを返し、URLを推測・創作しないこと。`;

type DiscoverItem = { url: string; title?: string };

async function discoverItemUrls(
  key: string,
  sources: string[],
  wishes: string[],
  interests: string[],
  focus: string,
  limit: number,
): Promise<{ items: DiscoverItem[]; retrieved: RetrievedUrl[] }> {
  const userText = `次のページを実際に読み、そこに並んでいる個別項目の「個別ページのURL」を最大${limit}件、私の興味に関連しそうなものを優先して抜き出してください。

【私の興味・願い(関連するものを優先)】
${focus ? `- ${focus}` : ""}
${wishes.map((w) => `- ${w}`).join("\n")}
${interests.length ? `- ${interests.join(" / ")}` : ""}

【読むページ(一覧)】
${sources.map((u) => `- ${u}`).join("\n")}

出力は次の形式のJSON配列だけ(説明文・コードフェンス無し)。ページに実在する個別ページのリンクだけを入れる。一覧・トップページのURLは入れない:
[{"url":"個別ページの完全なURL","title":"その項目の名前"}]`;

  const r = await callGemini(key, DISCOVER_SYSTEM, userText);
  if (!r.ok) return { items: [], retrieved: [] };
  const parsed = extractJsonArray<DiscoverItem>(r.text) ?? [];
  const seen = new Set<string>();
  const items: DiscoverItem[] = [];
  for (const it of parsed) {
    const url = (it?.url ?? "").trim();
    if (!/^https?:\/\//.test(url) || seen.has(url)) continue;
    // 一覧として渡した元URLそのものは個別ページではないので除外する。
    if (sources.includes(url)) continue;
    seen.add(url);
    items.push({ url, title: (it?.title ?? "").trim() || undefined });
    if (items.length >= limit) break;
  }
  return { items, retrieved: r.retrieved };
}

// ---- 段階2: 抽出(個別ページ→カード) -----------------------------------
const EXTRACT_SYSTEM = `あなたは私専属の編集者です。私の願い(ウィッシュ)と興味を知り尽くし、私が信頼して登録した情報源から、質の高い情報を雑誌の号のように届けます。生活圏は東京23区です。

絶対に守る原則:
1. 私が渡す「情報源URL」のページを実際に読み、そのページに載っている情報だけを使う。ページに書かれていないことは書かない。一般的な知識やGoogle検索で補完しない(抽出であって検索ではない)。
2. 事実を創作しない。実在しないイベント・店・作品・日付を書かない。
3. 動線・予定・貯金額・運動記録には一切言及しない。それらのデータは存在しない。「仕事帰りに」「明日の予定の途中で」のような私の行動予定を知っている前提の文言は禁止。
4. **sourceUrlは、実際に読んだその項目の個別ページのURL**にする。一覧ページ・トップページのURLをsourceUrlにしない。
5. **生活圏は東京23区。通常のカードは、東京23区および電車で日常的に行ける範囲の情報に限る。** 生活圏から大きく離れた遠方(他県・泊まりがけが必要な場所)の情報は通常カードにしない。そうした非日常的な提案をしたい場合だけ、**セレンディピティ枠として最大1枚**、serendipity:true と trigger:"セレンディピティ" を付けて出す(合うものが無ければ0枚でよい)。
6. 簡潔・具体的に書く。「なぜ今それを勧めるのか」が一行で分かるように。誇張しない。私の願い・興味に関連する項目を優先する。関連する項目が無ければ、無理にカードを作らず枚数を減らしてよい。

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
  | { ok: true; cards: GeneratedCard[]; raw: string; retrieved: RetrievedUrl[]; discovered: DiscoverItem[] }
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
    .slice(0, 5); // 一覧を読むので入口は少なめ(段階1で個別URLへ展開する)
  const count = Math.min(Math.max(body.count ?? 3, 1), 6);

  if (sources.length === 0) {
    return NextResponse.json({ ok: false, reason: "no_sources" } satisfies GenResult);
  }

  try {
    // 段階1: 一覧から個別ページURLを探索(見つからなければ元の情報源URLを使う)。
    const { items: discovered } = await discoverItemUrls(key, sources, wishes, interests, focus, Math.min(count * 2, 8));
    const pagesToRead = discovered.length > 0 ? discovered.map((d) => d.url) : sources;

    // 段階2: 個別ページ(段階1の成果)を実際に読ませてカード化。
    const userText = `次のページを実際に読み、そこに載っている情報の中から、私の願い・興味に合うものを最大${count}枚のブリーフカードにしてください。ページに載っていないことは書かないでください。合うものが少なければ枚数を減らして構いません。

【今、特に気になっていること】
${focus || "(未記入)"}

【叶えたい願い(ウィッシュ)】
${wishes.length ? wishes.map((w) => `- ${w}`).join("\n") : "(まだありません)"}

【興味・好み】
${interests.length ? interests.join(" / ") : "(まだありません)"}

【読むページ(それぞれの個別ページ)】
${pagesToRead.map((u) => `- ${u}`).join("\n")}

sourceUrl は、実際に読んだその項目の個別ページのURLにすること(一覧・トップページにしない)。

出力は次の形式のJSON配列だけ(前後に説明文やコードフェンスを付けない)。各要素:
- title: 見出し(20字前後、簡潔に)
- body: 本文(2〜3文。なぜ今かが分かるように)
- kind: "place"(場所) "exhibition"(展覧会) "live"(ライブ・コンサート) "activity"(体験・習い事) "food"(グルメ) "movie"(映画) "book"(本) "album"(音楽) "info"(知識・記事) "thing"(モノ) のいずれか
- trigger: "タイムリー" "興味との一致" "ロケーション" "セレンディピティ" のいずれか
- area: 場所が関わる場合、東京23区内のエリア名(例「蔵前」「神保町」)。無ければ省略
- sourceUrl: 実際に読んだ個別ページのURL(必須)
- sourceLabel: sourceUrlのリンク文言(例「公式サイトを見る」)
- meta: 補足の短い箇条書き(会場・時間・価格など)2〜3個の文字列配列。無ければ省略
- expiresAt: 会期末・締切があるときだけ ISO8601(例 "2026-08-31T23:59:59+09:00")
- sourceWishTitle: 特定のウィッシュに応えたカードなら、そのウィッシュのタイトルを完全一致で`;

    const r = await callGemini(key, EXTRACT_SYSTEM, userText);
    if (!r.ok) {
      return NextResponse.json({ ok: false, reason: `gemini_${r.status}`, detail: r.detail } satisfies GenResult, { status: 502 });
    }
    const cards = extractJsonArray<GeneratedCard>(r.text) ?? [];
    return NextResponse.json({ ok: true, cards, raw: r.text, retrieved: r.retrieved, discovered } satisfies GenResult);
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: "fetch_failed", detail: e instanceof Error ? e.message : String(e) } satisfies GenResult,
      { status: 502 },
    );
  }
}
