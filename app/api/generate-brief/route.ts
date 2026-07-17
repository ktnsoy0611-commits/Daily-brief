import { NextResponse } from "next/server";

// ブリーフ生成の実験用サーバー関数(フェーズC-0「プロンプト実験場」)。
// SYSTEM-DESIGN.md §3-1 のプロンプト設計を実際にGeminiへ投げ、本物のWeb
// 検索(Google Search Grounding)に基づくブリーフカードのJSONを返す。
//
// 今はまだ本番のブリーフタブのデッキには繋がない。設定画面の「生成を試す」
// ボタンから叩き、返ってきたカードを目視で品質確認するための実験台。
// 品質が確認できたら、次のステップで生成カードをBriefStateへ保存して
// デッキに載せる統合を行う(SYSTEM-DESIGN.md §8.3 のブリーフ永続化)。
//
// GEMINI_API_KEY は NEXT_PUBLIC_ を付けずサーバー側だけが読む。未設定なら
// (この開発環境のように)静かに reason:"no_key" を返し、クライアントは
// 「キー未設定」の案内を出す(Places APIと同じフォールバック方針)。

export const runtime = "nodejs";
export const maxDuration = 60; // Grounding込みの生成は数十秒かかりうる

const GEMINI_MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// §3-1 の「大原則」をシステムプロンプトに明記する。事実の創作禁止・
// 存在しないデータ(動線/予定/貯金/運動)への言及禁止・参照元URL必須・
// 既存一覧との重複禁止、の4点。ペルソナも同§より。
const SYSTEM_PROMPT = `あなたは私専属の編集者です。私の願い(ウィッシュ)と興味を知り尽くし、検索上位の浅い情報ではなく、自分では辿り着けないニッチで質の高い情報を、雑誌の号のように届けます。生活圏は東京23区です。

絶対に守る原則:
1. 事実を創作しない。Google検索で実際に確認できた事実だけを書く。実在しないイベント・店・作品を書かない。
2. 動線・予定・貯金額・運動記録には一切言及しない。それらのデータは存在しない。「仕事帰りに」「明日の予定の途中で」のような、私の行動予定を知っている前提の文言は禁止。
3. すべてのカードに、根拠となる実在の参照元URL(sourceUrl)を必ず付ける。検索で見つけた一次情報のURLを使う。
4. 簡潔・具体的に書く。「なぜ今それを勧めるのか」が一行で分かるように。誇張しない。

トーン参考(この簡潔さ・具体性を真似る):
- title:「単館上映のドキュメンタリー、今週が最終週」/ body:「建築をテーマにしたドキュメンタリーが両国のミニシアターで上映中。今週の金曜が最終日、その後の上映予定は未定です。」
- title:「谷根千の小さな雑貨店、一年に一度の陶器市」/ body:「普段は棚に並びきらない作家ものの器が、期間限定で店先に広がります。年に一度なので、今週を逃すと来年までお預けです。」`;

type GeneratedCard = {
  title: string;
  body: string;
  kind: string; // place | exhibition | live | activity | food | movie | book | album | info | thing
  trigger: string; // タイムリー / 興味との一致 / ロケーション / セレンディピティ など
  area?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  meta?: string[];
  expiresAt?: string;
  serendipity?: boolean;
  sourceWishTitle?: string;
};

type GroundingSource = { title: string; uri: string };

type GenResult =
  | { ok: true; cards: GeneratedCard[]; raw: string; sources: GroundingSource[] }
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

  let body: { wishes?: string[]; interests?: string[]; focus?: string; count?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" } satisfies GenResult, { status: 400 });
  }

  const wishes = (body.wishes ?? []).filter((w) => typeof w === "string" && w.trim()).slice(0, 20);
  const interests = (body.interests ?? []).filter((i) => typeof i === "string" && i.trim()).slice(0, 20);
  const focus = (body.focus ?? "").trim();
  // 実験なので枚数は控えめ(2〜4枚)に絞り、トークンと待ち時間を抑える。
  const count = Math.min(Math.max(body.count ?? 3, 1), 6);

  const userPrompt = `私の現在の情報です。

【今、特に気になっていること】
${focus || "(未記入)"}

【叶えたい願い(ウィッシュ)】
${wishes.length ? wishes.map((w) => `- ${w}`).join("\n") : "(まだありません)"}

【興味・好み】
${interests.length ? interests.join(" / ") : "(まだありません)"}

これらを踏まえ、今日から数日以内に楽しめる、実在する情報を Google検索で調べて、${count}枚のブリーフカードにしてください。ウィッシュに直接応えるものを優先しつつ、興味に沿った新しい発見も混ぜてください。

出力は次の形式のJSON配列だけを返してください(前後に説明文やmarkdownのコードフェンスを付けない)。各要素のフィールド:
- title: 見出し(20字前後、簡潔に)
- body: 本文(2〜3文。なぜ今かが分かるように)
- kind: 次のいずれか一つ "place"(場所) "exhibition"(展覧会) "live"(ライブ・コンサート) "activity"(体験・習い事) "food"(グルメ) "movie"(映画) "book"(本) "album"(音楽) "info"(知識・記事) "thing"(モノ)
- trigger: このカードを今勧める理由の分類。"タイムリー" "興味との一致" "ロケーション" "セレンディピティ" のいずれか
- area: 場所が関わる場合、東京23区内のエリア名(例「蔵前」「神保町」)。無ければ省略
- sourceUrl: 根拠にした実在ページのURL(必須)
- sourceLabel: sourceUrlのリンク文言(例「公式サイトを見る」「地図で見る」)
- meta: 補足の短い箇条書き(会場・時間・価格など)を2〜3個の文字列配列で。無ければ省略
- expiresAt: 会期末・締切がある場合のみ ISO8601(例 "2026-08-31T23:59:59+09:00")
- sourceWishTitle: 特定のウィッシュに応えたカードなら、そのウィッシュのタイトルを完全一致で`;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        // Google検索によるGrounding(実在の事実で裏取りさせる)。tools使用時は
        // responseSchema(JSONモード)が併用できないため、JSONはプロンプト指示で
        // 出させてサーバー側でパースする。
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.7 },
      }),
    });

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

    // Grounding で参照したページ(あれば)。実験画面で「どこを見て書いたか」を
    // 確認できるよう一緒に返す。
    const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
    const sources: GroundingSource[] = chunks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => ({ title: c?.web?.title ?? "", uri: c?.web?.uri ?? "" }))
      .filter((s: GroundingSource) => s.uri);

    return NextResponse.json({ ok: true, cards, raw, sources } satisfies GenResult);
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: "fetch_failed", detail: e instanceof Error ? e.message : String(e) } satisfies GenResult,
      { status: 502 },
    );
  }
}
