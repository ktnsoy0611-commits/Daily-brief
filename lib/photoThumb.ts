"use client";

import { useEffect, useSyncExternalStore } from "react";

// ★★★**写真は「表示の大きさへ一度だけ縮めた絵」で持つ（DOM の札用）**（2026-10-03・第136巡。ユーザー報告「**stock を
//   スクロールしているとフレームレートが落ちる。画像が増えることでそうなっている**」の真因）。
//   ★★★ストックの写真は他所のサイトの OGP 画像を**原寸のまま**（1000〜2000px 級・解いた画素 1枚 3〜16MB）使っていた。
//     第135巡は「解き終わってから差し込む」にしたが、**解いた原寸を最大 60 枚抱え続け**（数百 MB）、SVG の `<image>` は
//     描くたびに原寸から縮め直し、札ごとに CSS の `drop-shadow` を掛けていた ―― **画像の数に比例して重くなる作り**。
//     WebKit はメモリが逼迫すると解いた画素を捨て、次に描くときにまた原寸から解く（＝枚数が増えるほどかくつく）。
//   → 写真は読み込んで `decode()`（別の糸）したら、**表示に要る大きさの正方形（中央を切り取る）へ1度だけ縮めて
//     canvas に写し、原寸は手放す**。札は その小さな絵を自分の canvas に描く（`components/explore/ShapeCard.tsx`）。
//   ★縮めるのは1フレームに `SHRINK_MS` まで（送りの最中に何枚も重ねない）。
//   ★大きさは `STEP` 刻みへ切り上げる（札ごとに半端な大きさで作り直さない）。上限 `MAX_PX`。
//   ★★`crossOrigin` は付けない（`components/home/pilePaint.ts` の `photoOf` と同じ理由 ―― 付けると読み込みが失敗する。
//     汚れた canvas は**描くだけなら問題ない**。このアプリは canvas を読み返さない）。

const STEP = 96;
const MAX_PX = 768;
/** 抱えておく縮めた絵の数（1枚 ≤ 768²×4 ≒ 2.4MB、ふつうは 288〜384px で 0.3〜0.6MB）。 */
const KEEP_MAX = 120;
/** 1フレームに縮める仕事へ使ってよい時間（ms）。★目盛りの外（フレームの予算）。 */
const SHRINK_MS = 4;

export const thumbPx = (cssPx: number, dpr: number) =>
  Math.min(MAX_PX, Math.max(STEP, Math.ceil((cssPx * Math.min(2, dpr)) / STEP) * STEP));

export type Thumb = HTMLCanvasElement | "bad" | undefined;

const thumbs = new Map<string, HTMLCanvasElement | "bad">();
const loading = new Map<string, Set<number>>();
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
const keyOf = (url: string, px: number) => `${url}|${px}`;

const jobs: (() => void)[] = [];
let pumping = false;
function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const t0 = performance.now();
    while (jobs.length && performance.now() - t0 < SHRINK_MS) jobs.shift()!();
    notify();
    if (jobs.length) requestAnimationFrame(step); else pumping = false;
  };
  requestAnimationFrame(step);
}

function keep(key: string, v: HTMLCanvasElement | "bad") {
  thumbs.delete(key);
  thumbs.set(key, v);
  if (thumbs.size > KEEP_MAX) thumbs.delete(thumbs.keys().next().value as string);
}

/** 原寸の写真から、中央の正方形を `px` 四方へ縮めた canvas を作る。 */
function shrink(im: HTMLImageElement, px: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = px; cv.height = px;
  const ctx = cv.getContext("2d");
  if (ctx) {
    const side = Math.min(im.naturalWidth, im.naturalHeight);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(im, (im.naturalWidth - side) / 2, (im.naturalHeight - side) / 2, side, side, 0, 0, px, px);
  }
  return cv;
}

function request(url: string, px: number) {
  if (thumbs.has(keyOf(url, px)) || typeof Image === "undefined") return;
  const wait = loading.get(url);
  if (wait) { wait.add(px); return; }
  const want = new Set([px]);
  loading.set(url, want);
  const el = new Image();
  const fail = () => {
    loading.delete(url);
    want.forEach((p) => keep(keyOf(url, p), "bad"));
    notify();
  };
  const ready = () => {
    if (!el.naturalWidth) { fail(); return; }
    // ★縮めるのは順番待ち（1フレームの予算の中）。済んだら原寸 `el` はどこからも参照されず手放される。
    jobs.push(() => {
      loading.delete(url);
      want.forEach((p) => keep(keyOf(url, p), shrink(el, p)));
    });
    pump();
  };
  el.onload = () => {
    if (typeof el.decode === "function") el.decode().then(ready, ready); else ready();
  };
  el.onerror = fail;
  el.src = url;
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** `url` の写真を `px` 四方へ縮めた canvas（まだなら `undefined`、来ないと分かったら `"bad"`）。 */
export function useThumb(url: string | undefined, px: number): Thumb {
  const key = url && px > 0 ? keyOf(url, px) : "";
  const t = useSyncExternalStore(subscribe, () => (key ? thumbs.get(key) : undefined), () => undefined);
  // ★`t` も見る ―― 抱えきれずに手放された絵は、次に要るとき取り直す。
  useEffect(() => { if (url && px > 0 && !t) request(url, px); }, [url, px, t]);
  return t;
}
