import { NextResponse } from "next/server";

// ★★★**ニュースの見出しを取ってくる唯一の場所**（2026-09-18・第122巡にユーザー指定
//   「**上の帯にもう一列追加して、API とか無料のもので、ニュースを取ってこれるような
//   ものを探して組み込んで、私が確認するべきニュースみたいなものを表示するように**」）。
//
// ★★★**出どころは Google ニュースの RSS**（2026-09-18 にユーザーが選んだ）。
//   ・**鍵が要らない**（登録も課金も無い＝止まる理由が1つも無い）。
//   ・**好みの語で絞れる**（`/rss/search?q=…`）ので「私が確認するべき」に寄せられる。
//   ・日本語・日本向けの見出しがそのまま返る（`hl=ja&gl=JP&ceid=JP:ja`）。
//   ★★**要約も本文も無い**（題と出典だけ）。帯に流すのは1行なので、それで足りる。
//
// ★★★**サーバーで取る**（ブラウザから直接ではない）―― Google ニュースは
//   `Access-Control-Allow-Origin` を返さないので、**ブラウザからは原理的に読めない**。
//   ★★ここを通せば**キャッシュも1か所**で持てる（下の `revalidate`）。
//
// ★★★**AI を通さない** ―― `lib/todayPick.ts`・`lib/offerPick.ts`・`lib/bandNotes.ts`
//   と同じ約束。見出しはもう人が書いた1行なので、**書き換えると嘘が混じるだけ**。

export const runtime = "nodejs";
/**
 * ★★**30分ごとに取り直す**。★目盛りの外（外の世界の更新の速さ）。
 * ニュースは分単位で変わるものではなく、帯は1周 26秒で回るので、
 * これ以上速くしても**同じ見出しを取り直すだけ**。
 */
export const revalidate = 1800;

/** 1回に返す件数。★帯の1段はこれで一周する（`BAND_LIMIT_NEWS` と揃える）。 */
const LIMIT = 8;
/** ★出どころ。**日本語・日本向け**で固定（このアプリは日本で使う）。 */
const LOCALE = "hl=ja&gl=JP&ceid=JP:ja";
/** ★好みの語を何語まで混ぜるか。★多すぎると検索が絞られすぎて 0 件になる。 */
const TOPIC_MAX = 3;

export interface NewsHeadline {
  /** ★RSS の `guid`（無ければリンク）。**帯の id になる**ので一意であること。 */
  id: string;
  title: string;
  /** 出典（「NHK」など）。RSS の `<source>`。 */
  source: string;
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

/**
 * ★★**題の末尾の「 - 出典」を落とす**。Google ニュースの `<title>` は
 *   「見出し - NHKニュース」の形で来るが、出典は `<source>` に別に在るので、
 *   **同じことを2回言わない**（帯は1行なので字数がそのまま効く）。
 */
function trimSource(title: string, source: string): string {
  const tail = ` - ${source}`;
  return source && title.endsWith(tail) ? title.slice(0, -tail.length).trim() : title;
}

function parse(xml: string): NewsHeadline[] {
  const out: NewsHeadline[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const source = plain(tagOf(it, "source"));
    const title = trimSource(plain(tagOf(it, "title")), source);
    const link = plain(tagOf(it, "link"));
    if (!title || !link) continue;
    const at = plain(tagOf(it, "pubDate"));
    out.push({
      id: plain(tagOf(it, "guid")) || link,
      title, source, link,
      at: at ? new Date(at).toISOString() : "",
    });
    if (out.length >= LIMIT) break;
  }
  return out;
}

/**
 * @param topics 好みの語（`profile.interests`）。**空なら主要ニュース**。
 *   ★★`OR` でつなぐ ―― `AND` だと1語でも外れた瞬間に 0 件になる。
 */
function feedUrl(topics: string[]): string {
  const q = topics.slice(0, TOPIC_MAX).map((t) => t.trim()).filter(Boolean);
  if (!q.length) return `https://news.google.com/rss?${LOCALE}`;
  const term = encodeURIComponent(q.map((t) => `"${t}"`).join(" OR "));
  // ★★**新しいものだけ**（`when:2d`）。帯に何日も前の見出しが混ざると嘘に近い。
  return `https://news.google.com/rss/search?q=${term}+when:2d&${LOCALE}`;
}

export async function GET(req: Request) {
  const topics = (new URL(req.url).searchParams.get("q") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const res = await fetch(feedUrl(topics), {
      headers: { "user-agent": "Mozilla/5.0 (compatible; daily-brief/1.0)" },
      next: { revalidate },
    });
    if (!res.ok) return NextResponse.json({ items: [], error: `HTTP ${res.status}` });
    let items = parse(await res.text());
    // ★★★**好みの語で 0 件なら、主要ニュースへ落とす**（`when:2d` で絞ると
    //   語によっては本当に 0 件になる）。**段が空のまま残るほうが悪い。**
    if (!items.length && topics.length) {
      const res2 = await fetch(feedUrl([]), {
        headers: { "user-agent": "Mozilla/5.0 (compatible; daily-brief/1.0)" },
        next: { revalidate },
      });
      if (res2.ok) items = parse(await res2.text());
    }
    return NextResponse.json({ items });
  } catch (e) {
    // ★★**落ちても画面は動く**（帯はこの段だけ消える）。理由は返す。
    return NextResponse.json({ items: [], error: String(e) });
  }
}
