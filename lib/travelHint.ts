"use client";

import { useEffect, useRef, useState } from "react";
import type { AppState, Task, TaskSuggestion } from "./types";

// ★★★**準備タスクの「出発の目安」はここ1つ**（2026-09-27・第133巡）。
//   ユーザーの要望（第133巡）「**準備タスク … 当日の場所までの時間の確認**」。
//   **行き先（`Task.place`）と時刻（`dueTime`）があり、期日が今日か明日**のタスクに、
//   「**◯時◯分に出る**」を準備（`Task.suggestions` の `travel-<id>`）として足す。帯の下の段が
//   `follow-` として流す（`lib/homeBand.ts`。3日以内の準備は提案より前）。
//
// ★★★**AI を使わない・経路の API も使わない** ―― 経路の API は別の契約と課金が要る。
//   **現在地からの直線距離 × 道の曲がり（`ROUTE_K`）** を、歩き（近いとき）か電車・バス
//   （乗り場までの時間を足す）の速さで割った**目安**。札の「なぜ」に「目安」と必ず書く。
// ★★座標は `/api/resolve-place`（Google Places の名寄せ。マップのリンクも解ける）。
//   引けなければ `place.miss` を立てて頼み直さない（名前を直せば `miss` は消える）。
// ★★現在地は端末の位置（初回だけ iOS が許可を聞く）。**対象のタスクがあるときだけ**頼む。

/** ★道の曲がり（直線 → 道のり）。★目盛りの外（目安の係数）。 */
const ROUTE_K = 1.3;
/** ★これ以下の道のり（km）は歩く。 */
const WALK_KM = 1.5;
const WALK_KMH = 4.8;
/** ★電車・バスの平均の速さ（乗り換え込み）と、乗り場まで・待ちの時間（分）。 */
const TRANSIT_KMH = 25;
const ACCESS_MIN = 10;
/** ★着いてからの余裕（分）。出る時刻はここまで早める。 */
const MARGIN_MIN = 10;
/** ★目安は 5分刻みに切り上げる。 */
const ROUND_MIN = 5;
/** ★現在地を使い回す時間（ms）。 */
const HERE_MS = 30 * 60 * 1000;
/** ★出る時刻を測り直す間隔（ms。「すぐ出る」に切り替えるため）。 */
const TICK_MS = 5 * 60 * 1000;

type LatLng = { lat: number; lng: number };

/** 2点の直線距離（km）。 */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat); const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 直線距離（km）→ 移動の目安（分・5分刻み）と手段。 */
export function travelOf(km: number): { min: number; walk: boolean } {
  const road = km * ROUTE_K;
  const walk = road <= WALK_KM;
  const raw = walk ? (road / WALK_KMH) * 60 : ACCESS_MIN + (road / TRANSIT_KMH) * 60;
  return { min: Math.max(ROUND_MIN, Math.ceil(raw / ROUND_MIN) * ROUND_MIN), walk };
}

const hm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
const ymdOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** ★★その時刻の「出発の目安」の提案（出す必要が無ければ null）。純粋な関数。 */
export function travelSuggestion(t: Task, here: LatLng, now: Date): TaskSuggestion | null {
  const p = t.place;
  if (t.done || !p || p.lat === undefined || p.lng === undefined || !t.dueDate || !t.dueTime) return null;
  const today = ymdOf(now);
  const tomorrow = ymdOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  if (t.dueDate !== today && t.dueDate !== tomorrow) return null;
  const at = new Date(`${t.dueDate}T${t.dueTime.length === 4 ? `0${t.dueTime}` : t.dueTime}:00`);
  if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) return null;
  const km = distanceKm(here, { lat: p.lat, lng: p.lng });
  const { min, walk } = travelOf(km);
  const leave = new Date(at.getTime() - (min + MARGIN_MIN) * 60000);
  const day = t.dueDate === tomorrow ? "明日 " : "";
  const title = leave.getTime() <= now.getTime() ? "すぐ出る" : `${day}${hm(leave)}に出る`;
  return {
    id: `travel-${t.id}`,
    title,
    why: `「${p.name}」まで${walk ? "歩いて" : "電車・バスで"}約${min}分の目安（現在地から直線 ${km.toFixed(1)}km・着いて${MARGIN_MIN}分の余裕）`,
  };
}

/** ★module のただ1つの入れ物（同じ起動の中で2度引かない）。 */
const triedPlace = new Set<string>();
let hereCache: { at: number; p: LatLng } | null = null;

function askHere(): Promise<LatLng | null> {
  if (hereCache && Date.now() - hereCache.at < HERE_MS) return Promise.resolve(hereCache.p);
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((res) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        hereCache = { at: Date.now(), p: { lat: pos.coords.latitude, lng: pos.coords.longitude } };
        res(hereCache.p);
      },
      () => res(null),
      { maximumAge: HERE_MS, timeout: 10000, enableHighAccuracy: false },
    );
  });
}

export function useTravelHints(state: AppState | null, persist: (next: AppState) => void) {
  const latest = useRef(state);
  useEffect(() => { latest.current = state; });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // ① 行き先の座標を引く（名前だけのもの）。
  useEffect(() => {
    if (!state) return;
    const todo = (state.tasks ?? []).filter((t) => !t.done && t.place?.name.trim()
      && t.place.lat === undefined && !t.place.miss && !triedPlace.has(`${t.id}|${t.place.name}`));
    if (!todo.length) return;
    todo.forEach((t) => triedPlace.add(`${t.id}|${t.place?.name}`));
    (async () => {
      const got: Record<string, { lat?: number; lng?: number }> = {};
      for (const t of todo) {
        const q = (t.place?.name ?? "").trim();
        try {
          const res = await fetch("/api/resolve-place", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(/^https?:\/\//.test(q) ? { url: q } : { query: q }),
          });
          const j = await res.json();
          got[t.id] = typeof j?.lat === "number" && typeof j?.lng === "number" ? { lat: j.lat, lng: j.lng } : {};
        } catch { /* 次に開いたとき */ }
      }
      const cur = latest.current;
      if (!cur || !Object.keys(got).length) return;
      const next = structuredClone(cur);
      for (const t of next.tasks ?? []) {
        const g = got[t.id];
        if (!g || !t.place) continue;
        if (g.lat !== undefined && g.lng !== undefined) { t.place.lat = g.lat; t.place.lng = g.lng; } else t.place.miss = true;
      }
      persist(next);
    })();
  }, [state, persist]);

  // ② 出発の目安を書く・直す・消す。
  useEffect(() => {
    if (!state) return;
    const now = new Date();
    const cands = (state.tasks ?? []).filter((t) => t.place?.lat !== undefined && !!t.dueTime && !t.done);
    const stale = (state.tasks ?? []).filter((t) => (t.suggestions ?? []).some((s) => s.id.startsWith("travel-")));
    if (!cands.length && !stale.length) return;
    let off = false;
    (async () => {
      const here = cands.length ? await askHere() : null;
      if (off) return;
      const cur = latest.current;
      if (!cur) return;
      const next = structuredClone(cur);
      let changed = false;
      for (const t of next.tasks ?? []) {
        const want = here ? travelSuggestion(t, here, now) : null;
        const rest = (t.suggestions ?? []).filter((s) => !s.id.startsWith("travel-"));
        const had = (t.suggestions ?? []).find((s) => s.id.startsWith("travel-"));
        // ★現在地が取れないときは、すでにある目安は消さない（時刻が過ぎたものだけ消す）。
        if (!here && had && t.dueDate && t.dueTime && !t.done) continue;
        if (!want && !had) continue;
        if (want && had && want.title === had.title && want.why === had.why) continue;
        t.suggestions = want ? [want, ...rest] : rest;
        changed = true;
      }
      if (changed) persist(next);
    })();
    return () => { off = true; };
    // ★`tick` は「すぐ出る」への切り替えのため。
  }, [state, persist, tick]);
}
