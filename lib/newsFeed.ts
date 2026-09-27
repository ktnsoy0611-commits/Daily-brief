"use client";

import { useEffect, useState } from "react";
import { NEWS_FACE } from "./constants";
import type { BandItem } from "./homeBand";

// ★★★**ニュースの段の中身はここ1つ**（2026-09-18・第122巡）。
//   取ってくるのは `app/api/news/route.ts`（Yahoo!ニュースの主要トピックス。第133巡）。
//   **ここがやるのは「いつ取りに行くか」と「帯の1件に直すこと」だけ。**
//
// ★★★**`AppState` に入れない** ―― ニュースは
//   ① **自分のデータではない**（外の世界のもの。同期しても意味が無い）
//   ② **30分で古くなる**（`lib/dataStore.ts` に置くと端末をまたいで古い見出しが残る）
//   ③ **消えても何も壊れない**（段が1つ消えるだけ）。
//   だから**この module の中だけに置き、リロードで捨てる**。
//
// ★★**1回だけ取りに行く**（帯は1周 26秒で回るので、開いている間に取り直す意味が無い）。
//   ★取り直しは**ページを開き直したとき** ―― サーバー側が 30分キャッシュしている
//   ので、短い間に何度開いても外へは出て行かない。

interface Headline {
  id: string; title: string; source: string; link: string; at: string;
  image?: string; summary?: string;
}

/** ★★module のただ1つの入れ物（`pullBus`・`bandBus` と同じ作法）。 */
let cache: Headline[] | null = null;
let inflight: Promise<Headline[]> | null = null;

async function load(): Promise<Headline[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/api/news")
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((j) => (Array.isArray(j?.items) ? (j.items as Headline[]) : []))
    // ★★**落ちても空で返す**（帯のこの段が出ないだけ）。
    .catch(() => [])
    .then((items) => { cache = items; inflight = null; return items; });
  return inflight;
}

/** ★届いた時刻を「14:05」のように（札の小さな添え書き）。 */
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * ★★★**帯の上の段に流すニュース**（第133巡に上の段へ移した。`components/tabs/HomeTab.tsx` が呼ぶ）。
 * ★★★**その日の最新の主要ニュース**（ユーザー指定「**普通にその日の最新のもの**」）。
 *   第124巡の「好み 2割」はやめた。★写真と本文は記事の頁から（`app/api/news/route.ts`）。
 * ★★**絵と手つきは `components/home/NewsCard.tsx` の `NewsPill`** ―― 提案のピルと同じ形
 *   （写真の丸 ＋ 2行）で流れ、**下へ引くかタップで札に広がる**。
 */
export function useNewsBand(): BandItem[] {
  const [items, setItems] = useState<Headline[]>(cache ?? []);
  useEffect(() => {
    let live = true;
    load().then((got) => { if (live) setItems(got); });
    return () => { live = false; };
  }, []);
  return items.map((h) => ({
    id: `news-${h.id}`, kind: "news" as const, text: h.title,
    face: NEWS_FACE,
    photo: h.image,
    genre: h.source,
    link: h.link, at: h.at,
    why: [h.source, hhmm(h.at)].filter(Boolean).join(" ・ "),
    detail: h.summary,
  }));
}
