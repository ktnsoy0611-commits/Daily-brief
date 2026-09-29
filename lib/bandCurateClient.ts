"use client";

import { useEffect, useMemo, useState } from "react";
import { whenPileSettled } from "@/lib/bootQuiet";
import type { CurateCandidate, CurateInput, CurateScore } from "./bandCurate";
import { genreOfKind } from "./deckStyle";
import { bandItems, type BandItem } from "./homeBand";
import type { AppState, ItemKind } from "./types";

// ★★★**帯の下の段の AI 評価を「いつ頼むか」と「材料の組み立て」**（2026-09-27・第133巡）。
//   プロンプトと順位は `lib/bandCurate.ts`、呼ぶ口は `app/api/curate-band/route.ts`。
//
// ★★**頼み直す時** … 次のどれか ―― 前回から `FRESH_MS`(60分) たった／時間帯（朝・昼・夕・夜）が
//   変わった／候補の顔ぶれが変わった（タスクを足した・済ませた等）。
// ★★**結果は端末に置く**（`localStorage`）。`AppState` に入れない ―― 自分のデータではなく、
//   古くなっても壊れない（ニュースと同じ理由）。
// ★★**失敗・鍵なし・通信なし** … `null` を返す ＝ 帯は規則の並びのまま（空にならない）。

const STORE = "band-curate-v1";
/** ★前回から何分で頼み直すか。★目盛りの外（仕様の数）。 */
const FRESH_MS = 60 * 60 * 1000;
/** ★材料の「最近」の幅（日）。プロンプトの「直近14日」と同じ数。 */
const RECENT_DAYS = 14;
/** ★予定を何日先まで渡すか。プロンプトの「この先7日」と同じ数。 */
const AHEAD_DAYS = 7;
/** ★顔ぶれが変わってから頼むまで待つ時間（ms）。★目盛りの外（呼ぶ回数を抑える）。 */
const SETTLE_MS = 1500;
/** ★山が落ち終わるのを待つ上限（ms。`lib/bootQuiet.ts`）。★目盛りの外（締切）。 */
const SETTLE_LIMIT_MS = 10000;
const WD = ["日", "月", "火", "水", "木", "金", "土"];

const KIND_LABEL: Record<string, string> = {
  today: "提案（今日行ける）", offer: "提案", followup: "準備タスク",
  voice: "声から出たタスクの候補", someday: "日付の無いタスク",
};

const slotOf = (h: number) => (h < 5 ? "夜" : h < 11 ? "朝" : h < 16 ? "昼" : h < 19 ? "夕" : "夜");
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const md = (s: string) => {
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? s : `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`;
};

/** ★材料を組む（`<傾向>` はサーバーが足す）。 */
function inputOf(state: AppState, items: BandItem[], now: Date): CurateInput {
  const today = ymd(now);
  const until = ymd(new Date(now.getTime() + AHEAD_DAYS * 86400000));
  const schedule = (state.tasks ?? [])
    .filter((t) => !t.done && t.dueDate && t.dueDate >= today && t.dueDate <= until)
    .sort((a, b) => `${a.dueDate}${a.dueTime ?? ""}`.localeCompare(`${b.dueDate}${b.dueTime ?? ""}`))
    .map((t) => `${md(t.dueDate!)}${t.dueTime ? ` ${t.dueTime}` : ""} ${t.title}`);
  const interests = (state.profile?.interests ?? []).map((i) => i.label).filter(Boolean);

  // ★最近の反応（種類ごとの数）… 提案は号ごとの決定、タスクは `doneAt`。
  const since = now.getTime() - RECENT_DAYS * 86400000;
  const react = new Map<string, { keep: number; skip: number; done: number }>();
  const bump = (k: string, f: "keep" | "skip" | "done") => {
    const r = react.get(k) ?? { keep: 0, skip: 0, done: 0 };
    r[f] += 1; react.set(k, r);
  };
  for (const [ed, b] of Object.entries(state.briefs ?? {})) {
    if (Date.parse(`${ed}T00:00:00`) < since) continue;
    const deck = state.generatedDecks?.[ed] ?? [];
    for (const [id, dec] of Object.entries(b?.decisions ?? {})) {
      const card = deck.find((c) => String(c.id) === id) as { kind?: ItemKind } | undefined;
      const k = `提案（${card?.kind ? genreOfKind(card.kind) : "その他"}）`;
      if (dec === "keep") bump(k, "keep"); else if (dec === "skip") bump(k, "skip");
    }
  }
  for (const t of state.tasks ?? []) {
    if (t.done && t.doneAt && Date.parse(t.doneAt) >= since) bump("タスク", "done");
  }
  const reactions = [...react.entries()].map(([k, r]) =>
    `${k}: 残した${r.keep}・飛ばした${r.skip}・済ませた${r.done}`);

  const candidates: CurateCandidate[] = items.map((it) => ({
    id: it.id, kind: KIND_LABEL[it.kind] ?? it.kind, title: it.text, facts: it.facts ?? "",
  }));
  return {
    now: `${md(today)} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    schedule, interests, reactions, candidates,
  };
}

interface Stored { sig: string; slot: string; at: number; scores: CurateScore[] }
const read = (): Stored | null => {
  try { return JSON.parse(localStorage.getItem(STORE) ?? "null") as Stored | null; } catch { return null; }
};
const write = (s: Stored) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* */ } };

/** ★★module のただ1つの入れ物（同じ署名で2度頼まない）。 */
let inflight: string | null = null;

/**
 * ★★★帯の下の段の AI の点（`bandRows` の4つ目の引数へ渡す）。無ければ `null`。
 */
export function useBandCuration(state: AppState | null): CurateScore[] | null {
  const items = useMemo(
    () => (state ? bandItems(state).filter((it) => it.kind !== "news").slice(0, 40) : []),
    [state]);
  // ★★顔ぶれの署名（並びではなく集合）。
  const sig = useMemo(() => items.map((it) => it.id).sort().join("|"), [items]);
  // ★★★**控えは「顔ぶれが同じとき」だけ使う** ―― 違う顔ぶれの点を当てると、点の無い新しい候補が
  //   帯から消える（`rankCurated` は点の無いものを選ばない）。古くても同じ顔ぶれなら先に出し、
  //   裏で頼み直す（出だしの1フレームで帯が組み直らないように）。
  const [held, setHeld] = useState<{ sig: string; scores: CurateScore[] } | null>(() => {
    if (typeof window === "undefined") return null;
    const s = read();
    return s ? { sig: s.sig, scores: s.scores } : null;
  });
  const scores = held && held.sig === sig ? held.scores : null;

  useEffect(() => {
    if (!state || !items.length) return;
    const now = new Date();
    const slot = slotOf(now.getHours());
    const s = read();
    if (s && s.sig === sig && s.slot === slot && now.getTime() - s.at < FRESH_MS) {
      setHeld({ sig, scores: s.scores });
      return;
    }
    if (inflight === sig) return;
    // ★★**顔ぶれが落ち着いてから頼む**（`SETTLE_MS`）―― 準備タスクが3件ずつ届くなど、
    //   続けざまに変わるたびに1回ずつ頼まない。
    // ★★★**起動直後は山が落ち終わってから頼む**（2026-09-29・第134巡）。頼む中身を組む（`inputOf`）だけで
    //   CPU×4 で 46ms あり、それが落下中のフレームに入っていた。★返事で帯が組み直るのも落下の後になる。
    let cancelWait = () => {};
    const timer = window.setTimeout(() => { cancelWait = whenPileSettled(send, SETTLE_LIMIT_MS); }, SETTLE_MS);
    const send = () => {
    inflight = sig;
    const body = inputOf(state, items, now);
    fetch("/api/curate-band", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok || !Array.isArray(j.scores)) return;
        const got = j.scores as CurateScore[];
        write({ sig, slot, at: Date.now(), scores: got });
        setHeld({ sig, scores: got });
      })
      .catch(() => { /* 規則の並びのまま */ })
      .finally(() => { if (inflight === sig) inflight = null; });
    };
    return () => { window.clearTimeout(timer); cancelWait(); };
  // ★`state` 全体ではなく顔ぶれの署名で頼み直す（題を1文字直すたびに頼まない）。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return scores;
}
