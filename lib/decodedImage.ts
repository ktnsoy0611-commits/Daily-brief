"use client";

import { useEffect, useSyncExternalStore } from "react";

// ★★★**写真は「解き終わってから」描く（DOM／SVG 用）**（2026-09-30・第135巡。ユーザー報告「**stock でスクロールすると
//   まだ画面がかくつく**」の真因）。
//   ★★★SVG の `<image>` は**初めて描かれる瞬間にその場で（主の糸で）画素を解く**。ストックの写真は他所のサイトの
//     OGP 画像（1000〜2000px 級）をそのまま使うので、束や RECENTLY ADDED が**送りで画面に入るたびに**1枚 数十 ms の
//     解きがそのフレームに入っていた（`<img>` の `decoding="async"` は SVG の `<image>` には無い）。
//   → `Image.decode()`（別の糸で解く）で解き終わった URL だけを返す。それまでは面の色だけ（山の提案と同じ作法 ――
//     `components/home/pilePaint.ts` の `photoOf`）。
//   ★★解いた `Image` は**手放さない**（`kept`）―― 手放すと WebKit は解いた画素を捨て、次に描くときにまた解く。
//   ★上限 `KEEP_MAX` を超えたら古いものから手放す（解いた画素は 1枚 数 MB）。

const KEEP_MAX = 60;
type State = "wait" | "ok" | "bad";
const state = new Map<string, State>();
const kept = new Map<string, HTMLImageElement>();
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

function start(url: string) {
  if (state.has(url) || typeof Image === "undefined") return;
  state.set(url, "wait");
  const el = new Image();
  const done = (s: State) => {
    state.set(url, s);
    if (s === "ok") {
      kept.set(url, el);
      if (kept.size > KEEP_MAX) {
        const old = kept.keys().next().value as string;
        kept.delete(old);
        state.delete(old);
      }
    }
    notify();
  };
  el.onload = () => {
    if (typeof el.decode === "function") el.decode().then(() => done("ok"), () => done("ok"));
    else done("ok");
  };
  el.onerror = () => done("bad");
  el.src = url;
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** 解き終わった写真の URL（まだなら `undefined`）。★読み込みに失敗したものも `undefined`。 */
export function useDecodedSrc(url: string | undefined): string | undefined {
  const s = useSyncExternalStore(
    subscribe,
    () => (url ? state.get(url) : undefined),
    () => undefined,
  );
  useEffect(() => { if (url) start(url); }, [url]);
  return url && s === "ok" ? url : undefined;
}
