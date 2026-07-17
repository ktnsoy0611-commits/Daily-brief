import { NextResponse } from "next/server";

// ブリーフ生成の実験用サーバー関数(フェーズC-0「プロンプト実験場」)。
// SYSTEM-DESIGN.md §3-1/§3-2 のプロンプト設計を実際にGeminiへ投げ、
// **渡した情報源URLのページだけ**を読ませて(Google全体の検索ではなく)、
// そこに実際に載っている情報からブリーフカードのJSONを返す。
//
// これは本番の流れ(Coworkが厳選した情報源リスト→Geminiがそのソースから
// 新着を抽出、§3-2・§8)を小さく再現したもの。全Google検索(google_search)
// ではなく、指定URLだけを読む url_context ツールを使うのがポイント。
//
// 今はまだ本番のブリーフタブのデッキには繋がない。設定画面の「生成を試す」
// ボタンから叩き、返ってきたカードを目視で品質確認するための実験台。
//
// GEMINI_API_KEY は NEXT_PUBLIC_ を付けずサーバー側だけが読む。未設定なら
// (この開発環境のように)静かに reason:"no_key" を返す。

export const runtime = "nodejs";
export const maxDuration = 60; // 複数URLの読み込み込みの生成は数十秒かかりうる

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
    // 画像/音声/埋め込み専用や推論の重いthinking系は除外し、flash系だけに絞る。
    const flash = models.filter((m) => /flash/i.test(nm(m)) && !/vision|embedding|aqa|imagen|tts|audio|thinking/i.test(nm(m)));
    const pick =
      flash.find((m) => /flash-lite-latest/i.test(nm(m))) ?? // 最安・安定
      flash.find((m) => /flash-lite/i.test(nm(m))) ??        // 最安
      flash.find((m) => /flash-latest/i.test(nm(m))) ??      // 次点・安定
      flash[flash.length - 1] ??                             // 何かしらのflash
      models[0];                                             // 最後の砦
    return pick?.name ?? null; // 例: "models/gemini-flash-lite-latest"
  } catch {
    return null;
  }
}

// §3-1/§3-2 の「大原則」をシステムプロンプトに明記する。事実の創作禁止・
// 存在しないデータ(動線/予定/貯金/運動)への言及禁止・参照元URL必須、に加え、
// 「渡された情報源ページに実際に載っている情報だけを使う(抽出であって
// 検索ではない)」という§3-2の規律を最上位に置く。
const SYSTEM_PROMPT = `あなたは私専属の編集者です。私の願い(ウィッシュ)と興味を知り尽くし、私が信頼して登録した情報源から、質の高い情報を雑誌の号のように届けます。生活圏は東京23区です。

絶対に守る原則:
1. 私が渡す「情報源URL」のページを実際に読み、そのページに載っている情報だけを使う。ページに書かれていないことは書かない。一般的な知識やGoogle検索で補完しない(抽出であって検索ではない)。
2. 事実を創作しない。実在しないイベント・店・作品・日付を書かない。
3. 動線・予定・貯金額・運動記録には一切言及しない。それらのデータは存在しない。「仕事帰りに」「明日の予定の途中で」のような私の行動予定を知っている前提の文言は禁止。
4. **sourceUrlは、その項目そのものの個別ページのURL**(一覧ページに並んだリンクの飛び先)にする。一覧ページ・トップページのURLをsourceUrlにしない。渡された情報源が一覧・インデックスの場合は、そこに並ぶ個別項目のリンク先URLを使うこと。可能ならその個別ページも読んで、会期・場所・料金などの詳細を正確に書く。個別ページのURLが特定できない項目は、無理にカードにしない(一覧URLで埋めない)。
5. **生活圏は東京23区。通常のカードは、東京23区および電車で日常的に行ける範囲の情報に限る。** 生活圏から大きく離れた遠方(他県・泊まりがけが必要な場所)の情報は通常カードにしない。そうした非日常的な提案をしたい場合だけ、**セレンディピティ枠として最大1枚**、serendipity:true と trigger:"セレンディピティ" を付けて出す(合うものが無ければ0枚でよい)。
6. 簡潔・具体的に書く。「なぜ今それを勧めるのか」が一行で分かるように。誇張しない。私の願い・興味に関連する項目を優先する。関連する項目が情報源に無ければ、無理にカードを作らず枚数を減らしてよい。

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

type RetrievedUrl = { url: string; status: string };

type GenResult =
  | { ok: true; cards: GeneratedCard[]; raw: string; retrieved: RetrievedUrl[] }
  | { ok: false; reason: string; detail?: string };

// モデルの返答(```json ...``` で囲まれていたり前後にプロローグが付いたり
// する)から、JSON配列だけを頑健に取り出す。
function extractJsonArray(text: string): GeneratedCard[] | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);
  try {
    const parsed = JSON.parse(t);
    return Array.isArray(parsed) ? (parsed as GeneratedCard[]) : null;
  } catch {
    return null;
  }
}

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
  // 情報源URL。url_contextで読める上限に配慮し最大10件に絞る。
  const sources = (body.sources ?? [])
    .filter((u) => typeof u === "string" && /^https?:\/\//.test(u.trim()))
    .map((u) => u.trim())
    .slice(0, 10);
  const count = Math.min(Math.max(body.count ?? 3, 1), 6);

  if (sources.length === 0) {
    return NextResponse.json({ ok: false, reason: "no_sources" } satisfies GenResult);
  }

  const userPrompt = `私の情報です。

【今、特に気になっていること】
${focus || "(未記入)"}

【叶えたい願い(ウィッシュ)】
${wishes.length ? wishes.map((w) => `- ${w}`).join("\n") : "(まだありません)"}

【興味・好み】
${interests.length ? interests.join(" / ") : "(まだありません)"}

【情報源(このページを実際に読んでください)】
${sources.map((u) => `- ${u}`).join("\n")}

上の情報源ページを実際に読み、そこに載っている情報の中から、私の願い・興味に合うものを最大${count}枚のブリーフカードにしてください。情報源ページに載っていないことは一切書かないでください。合うものが少なければ枚数を減らして構いません。

重要:
- sourceUrl は、その項目の個別ページのURL(一覧上のリンクの飛び先)にすること。一覧・トップページのURLにしない。
- 通常カードは東京23区(および日常的に電車で行ける範囲)に限る。遠方の非日常的な提案は最大1枚だけ、serendipity:true と trigger:"セレンディピティ" を付けて出す。

出力は次の形式のJSON配列だけを返してください(前後に説明文やmarkdownのコードフェンスを付けない)。各要素のフィールド:
- title: 見出し(20字前後、簡潔に)
- body: 本文(2〜3文。なぜ今かが分かるように)
- kind: 次のいずれか一つ "place"(場所) "exhibition"(展覧会) "live"(ライブ・コンサート) "activity"(体験・習い事) "food"(グルメ) "movie"(映画) "book"(本) "album"(音楽) "info"(知識・記事) "thing"(モノ)
- trigger: このカードを今勧める理由の分類。"タイムリー" "興味との一致" "ロケーション" "セレンディピティ" のいずれか
- area: 場所が関わる場合、東京23区内のエリア名(例「蔵前」「神保町」)。無ければ省略
- sourceUrl: 根拠にした実在ページのURL(必須。情報源ページ、またはその中で見つけた個別ページ)
- sourceLabel: sourceUrlのリンク文言(例「公式サイトを見る」「地図で見る」)
- meta: 補足の短い箇条書き(会場・時間・価格など)を2〜3個の文字列配列で。無ければ省略
- expiresAt: 会期末・締切がある場合のみ ISO8601(例 "2026-08-31T23:59:59+09:00")
- sourceWishTitle: 特定のウィッシュに応えたカードなら、そのウィッシュのタイトルを完全一致で`;

  const reqBody = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    // url_context: プロンプト中のURLを実際に取得して読む。Google全体の
    // 検索(google_search)は使わない=登録した情報源からの抽出に限定する。
    // tools使用時はresponseSchema(JSONモード)が併用不可のため、JSONは
    // プロンプト指示で出させサーバー側でパースする。
    tools: [{ url_context: {} }],
    // 出力トークンの上限を絞ってコストを抑える(必要なのは最大6枚の
    // コンパクトなJSONだけで長文は要らない)。入力側もsources最大10件・
    // count最大6で抑えている。
    generationConfig: { temperature: 0.6, maxOutputTokens: 3072 },
  });
  const callModel = (model: string) =>
    fetch(endpointFor(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: reqBody,
    });

  try {
    let res = await callModel(DEFAULT_MODEL);
    // モデル名が無効(404 = 新規ユーザーに提供停止 等)なら、このキーで
    // 実際に使えるflashモデルを問い合わせて1回だけ再試行する。
    if (res.status === 404) {
      const alt = await listFlashModel(key);
      if (alt) res = await callModel(alt);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json({ ok: false, reason: `gemini_${res.status}`, detail: detail.slice(0, 500) } satisfies GenResult, { status: 502 });
    }

    const data = await res.json();
    const cand = data?.candidates?.[0];
    const parts = cand?.content?.parts ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = parts.map((p: any) => p?.text ?? "").join("").trim();
    const cards = extractJsonArray(raw) ?? [];

    // url_context が実際に取得したURLとそのステータス(成功/失敗)。実験画面で
    // 「どのソースを読めたか」を確認できるよう返す。
    const meta = cand?.urlContextMetadata?.urlMetadata ?? cand?.url_context_metadata?.url_metadata ?? [];
    const retrieved: RetrievedUrl[] = meta
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((m: any) => ({ url: m?.retrievedUrl ?? m?.retrieved_url ?? "", status: m?.urlRetrievalStatus ?? m?.url_retrieval_status ?? "" }))
      .filter((m: RetrievedUrl) => m.url);

    return NextResponse.json({ ok: true, cards, raw, retrieved } satisfies GenResult);
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: "fetch_failed", detail: e instanceof Error ? e.message : String(e) } satisfies GenResult,
      { status: 502 },
    );
  }
}
