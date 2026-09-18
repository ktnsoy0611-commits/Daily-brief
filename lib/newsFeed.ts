"use client";

import { useEffect, useState } from "react";
import { INK } from "./constants";
import type { BandItem } from "./homeBand";
import type { AppState } from "./types";

// ★★★**ニュースの段の中身はここ1つ**（2026-09-18・第122巡）。
//   取ってくるのは `app/api/news/route.ts`（Google ニュースの RSS）。
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

/** 好みの語を何語まで送るか。★サーバー側の `TOPIC_MAX` と同じ意味（向こうが正）。 */
const TOPIC_MAX = 3;

interface Headline { id: string; title: string; source: string; link: string; at: string }

/** ★★module のただ1つの入れ物（`pullBus`・`bandBus` と同じ作法）。 */
let cache: Headline[] | null = null;
let inflight: Promise<Headline[]> | null = null;

/** ★好みの語（2文字以上のものだけ。`lib/offerPick.ts` の `interestHit` と同じ門）。 */
const topicsOf = (state: AppState): string[] =>
  (state.profile?.interests ?? [])
    .map((i) => (i.label ?? "").trim())
    .filter((s) => s.length >= 2)
    .slice(0, TOPIC_MAX);

async function load(topics: string[]): Promise<Headline[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  const q = encodeURIComponent(topics.join(","));
  inflight = fetch(`/api/news?q=${q}`)
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((j) => (Array.isArray(j?.items) ? (j.items as Headline[]) : []))
    // ★★**落ちても空で返す**（帯のこの段が出ないだけ）。
    .catch(() => [])
    .then((items) => { cache = items; inflight = null; return items; });
  return inflight;
}

/**
 * ★★★**帯の3段目に流すニュース**（`components/tabs/HomeTab.tsx` が呼ぶ）。
 * ★★**押せない**（`components/home/Band.tsx` が `news` を面も縁も無しで描く）――
 *   帯は流れているので、狙って押させるものを置く場所ではない。
 */
export function useNewsBand(state: AppState): BandItem[] {
  const [items, setItems] = useState<Headline[]>(cache ?? []);
  // ★★**好みの語は「文字列1本」で見る** ―― 配列の同一性で見ると毎回取りに行く。
  const key = topicsOf(state).join(",");
  useEffect(() => {
    let live = true;
    load(key ? key.split(",") : []).then((got) => { if (live) setItems(got); });
    return () => { live = false; };
  }, [key]);
  return items.map((h) => ({
    id: `news-${h.id}`, kind: "news" as const, text: h.title,
    // ★`face` は使わない（字だけで描く）が、`BandItem` の形に合わせる。
    face: INK,
    // ★★**出典は `genre` の枠を借りる**（帯が「小さく添える語」として持っている枠）。
    genre: h.source,
  }));
}
