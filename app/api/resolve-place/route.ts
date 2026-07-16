import { NextResponse } from "next/server";

// 場所の座標解決サーバー関数(フェーズB)。
// SYSTEM-DESIGN.md §8.1 / HANDOFF-CURRENT.md §8.1-1 の多段フォールバック:
//   (1) GoogleマップURLに埋まった座標を正規表現で抽出(API呼び出し0・無料)。
//       座標はあるが店名が取れない(緯度経度だけのピンURL等)場合は、
//       Places API(New) の Nearby Search でその地点の直近の場所名を補完する。
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

// 短縮URL(maps.app.goo.gl等)はリダイレクト先を1回辿って展開してから座標を抜く。
async function expandUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      // UAを付けないとGoogleが同意ページ等の別レスポンスを返し座標が拾えない
      // ことがあるため、一般的なブラウザのUAを名乗る。
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" },
    });
    return res.url || url;
  } catch {
    return url;
  }
}

// Places API(New) Nearby Search。座標だけ分かっていて名前が無いとき(緯度経度
// だけのピンURL等)、その地点の直近の場所を1件引いて店名を補完する。半径を
// 小さく取り、距離順(DISTANCE)で最も近い1件だけを返す。キー未設定なら諦める。
async function placeNearby(lat: number, lng: number): Promise<{ name?: string; placeId?: string } | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null; // 未設定(この環境等)なら静かに諦める→名前はundefinedのまま
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // 課金最小化: id と表示名だけ要求する(座標は既に手元にある)。
        "X-Goog-FieldMask": "places.id,places.displayName",
      },
      body: JSON.stringify({
        maxResultCount: 1,
        rankPreference: "DISTANCE",
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 60 } },
        languageCode: "ja",
        regionCode: "JP",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.places?.[0];
    if (!p) return null;
    return { name: p.displayName?.text, placeId: p.id };
  } catch {
    return null;
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

  // (1) マップURLからの座標抽出(無料)。座標か名前のどちらかが欠けていれば
  // 1回だけURLを展開して再挑戦する(短縮URLの座標埋め込み・/place/店名/の救済)。
  if (url && isMapsUrl(url)) {
    let coords = coordsFromMapsUrl(url);
    let name = nameFromMapsUrl(url);
    let placeId: string | undefined;
    if (!coords || !name) {
      const expanded = await expandUrl(url);
      coords = coords ?? coordsFromMapsUrl(expanded);
      name = name ?? nameFromMapsUrl(expanded);
    }
    if (coords) {
      // 座標はあるが名前が取れない(緯度経度だけのピンURL等)場合、Places
      // Nearby Searchでその地点の直近の場所名を補完する。キー未設定なら
      // name は undefined のまま返り、従来どおりの挙動になる。
      if (!name) {
        const near = await placeNearby(coords.lat, coords.lng);
        if (near) {
          name = near.name;
          placeId = near.placeId;
        }
      }
      return NextResponse.json({ ...coords, name, placeId, source: "url" } satisfies Resolved);
    }
    // 座標は取れなかったが展開後URLから店名が拾えた場合、その名前で
    // Places名寄せを試す(短縮URLで座標が埋まっていないケースの救済)。
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
