import { NextResponse } from "next/server";

// ★★★**ニュースの見出しを取ってくる唯一の場所**（2026-09-18・第122巡にユーザー指定
//   「**上の帯にもう一列追加して、API とか無料のもので、ニュースを取ってこれるような
//   ものを探して組み込んで、私が確認するべきニュースみたいなものを表示するように**」）。
//
// ★★★**出どころは Yahoo!ニュースの「主要」トピックスの RSS**（2026-09-27・第133巡に
//   Google ニュースから替えた）。ユーザー指定「**ニュースは普通にその日の最新のものを
//   出してくれればよく、できれば写真を一緒にとってきて、提案のピルとデザインを統一**」。
//   ★★Google ニュースの RSS は**写真を持たず**、記事の URL も JS でしか解けない転送なので、
//     写真を取る道が無かった。Yahoo!ニュースは**題が 13字前後**（ピルの2段に収まる）で、
//     各記事の頁が **`og:image` と `og:description`** を持つ ―― 写真と札の本文がそこから取れる。
//   ★★**鍵が要らない**（登録も課金も無い）。★好みで寄せるのはやめた（「普通にその日の最新」）。
//
// ★★★**サーバーで取る**（ブラウザから直接ではない）―― 他所のサイトは
//   `Access-Control-Allow-Origin` を返さないので、**ブラウザからは原理的に読めない**。
//   ★★ここを通せば**キャッシュも1か所**で持てる（下の `revalidate`）。
//
// ★★★**AI を通さない** ―― 見出しはもう人が書いた1行なので、**書き換えると嘘が混じるだけ**。

export const runtime = "nodejs";
/**
 * ★★**30分ごとに取り直す**。★目盛りの外（外の世界の更新の速さ）。
 * ニュースは分単位で変わるものではなく、帯は1周 26秒で回るので、
 * これ以上速くしても**同じ見出しを取り直すだけ**。
 */
export const revalidate = 1800;

/** 1回に返す件数。★帯の1段はこれで一周する。 */
const LIMIT = 8;
/** ★出どころ（主要のトピックス）。 */
const FEED = "https://news.yahoo.co.jp/rss/topics/top-picks.xml";
/** ★記事の頁を待つ締切（ms）。★目盛りの外（外の世界の遅さ）。遅い1件で全部を待たせない。 */
const PAGE_MS = 4000;
const UA = { "user-agent": "Mozilla/5.0 (compatible; daily-brief/1.0)" };

export interface NewsHeadline {
  /** ★RSS の `guid`（無ければリンク）。**帯の id になる**ので一意であること。 */
  id: string;
  title: string;
  /** 出典（いまは「Yahoo!ニュース」だけ）。 */
  source: string;
  /** ★写真（記事の頁の `og:image`）。取れなければ無い。 */
  image?: string;
  /** ★札の本文（記事の頁の `og:description`）。取れなければ無い。 */
  summary?: string;
  link: string;
  /** ISO の文字列（`<pubDate>`）。 */
  at: string;
}

/** `<tag>…</tag>` の中身を1つ取る。★RSS はここでしか読まないので、正規表現で足りる。 */
function tagOf(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : "";
}

/** `<![CDATA[…]]>` と実体参照をほどく。 */
function plain(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function parse(xml: string): NewsHeadline[] {
  const out: NewsHeadline[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const title = plain(tagOf(it, "title"));
    const link = plain(tagOf(it, "link"));
    if (!title || !link) continue;
    const at = plain(tagOf(it, "pubDate"));
    out.push({
      id: (link.match(/pickup\/(\d+)/)?.[1]) ?? link,
      title, source: "Yahoo!ニュース", link,
      at: at ? new Date(at).toISOString() : "",
    });
    if (out.length >= LIMIT) break;
  }
  return out;
}

/** `<meta property="og:…" content="…">` を1つ読む。 */
function ogOf(html: string, prop: string): string {
  const m = html.match(new RegExp(`<meta[^>]+property="og:${prop}"[^>]+content="([^"]*)"`));
  return m ? plain(m[1]) : "";
}

/**
 * ★★記事の頁から写真と本文を取る。**落ちても見出しは出す**（写真と札の本文が無いだけ）。
 * ★★締切 `PAGE_MS` ―― 1件が遅いと帯の段ごと遅れる。
 */
async function enrich(h: NewsHeadline): Promise<NewsHeadline> {
  try {
    const res = await fetch(h.link, {
      headers: UA, next: { revalidate }, signal: AbortSignal.timeout(PAGE_MS),
    });
    if (!res.ok) return h;
    const html = await res.text();
    const image = ogOf(html, "image");
    const summary = ogOf(html, "description");
    return { ...h, image: image || undefined, summary: summary || undefined };
  } catch {
    return h;
  }
}

export async function GET() {
  try {
    const res = await fetch(FEED, { headers: UA, next: { revalidate } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // ★★**頁は同時に取る**（直列だと 8 倍待つ。どれも 30分キャッシュ）。
    const items = await Promise.all(parse(await res.text()).map(enrich));
    if (!items.length) return NextResponse.json({ items: [], error: "empty" });
    return NextResponse.json({ items });
  } catch (e) {
    // ★★**落ちても画面は動く**（帯はこの段だけ消える）。理由は返す。
    return NextResponse.json({ items: [], error: String(e) });
  }
}
