import { NextResponse } from "next/server";

// 場所の座標解決サーバー関数(フェーズB)。
// SYSTEM-DESIGN.md §8.1 / docs/archive/brief-pipeline-2026-07.md §8.1-1 の多段フォールバック:
//   (1) GoogleマップURLに埋まった座標を正規表現で抽出(API呼び出し0・無料)。
//       店名は、まず URL の /place/店名/ から、取れなければマップのページを
//       1回だけ取得して og:title / <title>(=その場所の名前が入っている)から
//       拾う。**Places の Nearby Search は使わない**(Places API(New) にその
//       メソッドが無い/有効化できない環境があるため。ユーザー報告 2026-07)。
//       ページ取得はHTTPのみで課金ゼロ。
//   (2) 座標が取れなければ Places API(New) の Text Search で名寄せ(店名+エリア)
//   (3) それも取れなければ null を返し、クライアント側でareaのAREA_COORDS
//       中心へフォールバックする
// Places APIキー(GOOGLE_PLACES_API_KEY)は NEXT_PUBLIC_ を付けずサーバー側
// だけが読む。ブラウザには座標の結果だけを返し、キーは決して露出しない。

export const runtime = "nodejs";

type Resolved = {
  lat?: number;
  lng?: number;
  placeId?: string;
  name?: string;
  source: "url" | "places" | "none";
};

// GoogleマップのURL各種形式から緯度経度を抜く。API呼び出しは一切しない。
function coordsFromMapsUrl(url: string): { lat: number; lng: number } | null {
  // 例: .../@35.6895,139.6917,17z/...
  let m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  // 例: ...!3d35.6895!4d139.6917...(place URLの内部表現)
  m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  // 例: ...?q=35.6895,139.6917 / ...&query=35.6895,139.6917
  m = url.match(/[?&](?:q|query|ll|sll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}

const isMapsUrl = (url: string) => /google\.[^/]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/.test(url);

// マップURLの /place/店名/ セグメントから店名を抜く(下書きの名前用)。
function nameFromMapsUrl(url: string): string | undefined {
  try {
    const m = decodeURIComponent(new URL(url).pathname).match(/\/place\/([^/@]+)/);
    if (m) return m[1].replace(/\+/g, " ").trim() || undefined;
  } catch {
    /* 無視 */
  }
  return undefined;
}

// HTMLエンティティの最小デコード(og:title/title に含まれる &amp; 等)。
function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// タイトル文字列から「場所の名前」だけを取り出す。Googleマップのタイトルは
// 「店名 · 住所」「店名 - Google マップ」等の形なので、先頭の名前部分だけ残す。
function cleanPlaceName(raw: string): string | undefined {
  let s = decodeHtml(raw).trim();
  if (!s) return undefined;
  // 「店名 · 〒110-… 住所」→ 中黒(·/・)の手前まで
  s = s.split(/\s[·・]\s/)[0].trim();
  // 「… - Google マップ / Google Maps」等のサイト名接尾辞を落とす
  s = s.replace(/\s*[-–—|]\s*Google\s*(?:マップ|Maps)\b.*$/i, "").trim();
  s = s.replace(/\s*[-–—|]\s*Google\b.*$/i, "").trim();
  if (!s || /^google\s*(?:マップ|maps)?$/i.test(s)) return undefined;
  return s;
}

// マップのページHTMLから場所名を拾う(og:title → twitter:title → <title>)。
function nameFromHtml(html: string): string | undefined {
  if (!html) return undefined;
  const meta = (prop: string): string | undefined => {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*\\scontent=["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${prop}["']`, "i"),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1].trim()) return m[1];
    }
    return undefined;
  };
  for (const cand of [meta("og:title"), meta("twitter:title")]) {
    if (cand) { const c = cleanPlaceName(cand); if (c) return c; }
  }
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (t) { const c = cleanPlaceName(t[1]); if (c) return c; }
  return undefined;
}

// マップURL(短縮URL含む)を1回だけ取得し、展開後の最終URLとページHTMLを返す。
// 短縮URL(maps.app.goo.gl)はリダイレクトを辿ると /place/店名/@座標 付きの
// 最終URLになることが多く、そこから座標も名前も取れる。取れない場合の名前は
// HTML本文(og:title等)から拾う。
async function fetchMapsPage(url: string): Promise<{ finalUrl: string; html: string }> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      // UAを付けないとGoogleが同意ページ等の別レスポンスを返すことがあるため、
      // 一般的なモバイルブラウザのUAを名乗る。
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text().catch(() => "");
    return { finalUrl: res.url || url, html };
  } catch {
    return { finalUrl: url, html: "" };
  }
}

// Places API(New) Text Search。店名(+エリア)から実在の1件を名寄せする。
async function placesTextSearch(query: string): Promise<Resolved | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null; // 未設定(この環境等)なら静かに諦める→フォールバック
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // 課金は要求するフィールドで決まる。座標・id・名前だけに絞って最小コストにする。
        "X-Goog-FieldMask": "places.id,places.location,places.displayName",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "ja", regionCode: "JP", maxResultCount: 1 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.places?.[0];
    if (!p?.location) return null;
    return {
      lat: p.location.latitude,
      lng: p.location.longitude,
      placeId: p.id,
      name: p.displayName?.text,
      source: "places",
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: { url?: string; query?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ source: "none" } satisfies Resolved, { status: 400 });
  }
  const url = body.url?.trim();
  const query = body.query?.trim();

  // (1) マップURLからの座標・名前の抽出(API呼び出し0)。座標か名前のどちらかが
  // 欠けていれば1回だけページを取得して、展開後URLとHTMLの両方から補う。
  if (url && isMapsUrl(url)) {
    let coords = coordsFromMapsUrl(url);
    let name = nameFromMapsUrl(url);
    if (!coords || !name) {
      const { finalUrl, html } = await fetchMapsPage(url);
      coords = coords ?? coordsFromMapsUrl(finalUrl);
      // 名前は (a)展開後URLの /place/ →(b)ページの og:title/<title> の順で拾う。
      name = name ?? nameFromMapsUrl(finalUrl) ?? nameFromHtml(html);
    }
    if (coords) {
      return NextResponse.json({ ...coords, name, source: "url" } satisfies Resolved);
    }
    // 座標は取れなかったが名前が拾えた場合、その名前で Places 名寄せを試す
    // (短縮URLで座標が埋まっていないケースの救済)。
    if (name) {
      const resolved = await placesTextSearch(name);
      if (resolved) return NextResponse.json({ ...resolved, name: resolved.name ?? name });
    }
  }

  // (2) 名寄せ(Places Text Search)。店名+エリアのqueryがあれば試す。
  if (query) {
    const resolved = await placesTextSearch(query);
    if (resolved) return NextResponse.json(resolved);
  }

  // (3) 何も取れず。クライアントがareaのAREA_COORDSへフォールバックする。
  return NextResponse.json({ source: "none" } satisfies Resolved);
}
