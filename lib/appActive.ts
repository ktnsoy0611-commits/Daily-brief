"use client";

import { useSyncExternalStore } from "react";
import type { AppId } from "@/lib/types";

// ★★★**「いま表示中のアプリ」を知っている唯一の入れ物**（第135巡）。
// ★第134巡までは `AppShell` が `active` を props で列の中身へ渡していたので、バーを押すたびに
//   **出ていくアプリと入ってくるアプリの中身が丸ごと描き直されていた**（札の束・帯・送りの測り直し ――
//   実測 CPU×4 で切り替えの瞬間に 100〜220ms の長い仕事）。
// → 列の中身は `active` を受け取らない。表示中かどうかが要る部品だけが `useAppActive(id)` で購読し、
//   **その部品だけ**が描き直される。★非同期の仕事（帯の送り・山のループ）は `isAppActive` を読む。

let current: AppId = "home";
const subs = new Set<() => void>();

export function setActiveApp(id: AppId) {
  if (id === current) return;
  current = id;
  subs.forEach((f) => f());
}

export function isAppActive(id: AppId): boolean {
  return current === id;
}

/** ★表示中が替わったら呼ぶ（戻り値で外す）。 */
export function onActiveApp(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}

export function useAppActive(id: AppId): boolean {
  return useSyncExternalStore(onActiveApp, () => current === id, () => id === "home");
}
