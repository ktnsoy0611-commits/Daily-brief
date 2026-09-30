"use client";

import { useSyncExternalStore } from "react";

// ★★★**タブバーを小さく畳むかどうか**（第135巡にユーザー指定「下にスクロールした時に滑らかにアニメーションして
//   小さくなるように」）。モジュールの送り（`ModuleRail`）が「下へ送った／上へ戻した」を知らせ、バー（`AppNav`）が読む。
//   ★アプリを替えたら広げる（`AppShell`）。

let compact = false;
const subs = new Set<() => void>();

export function setNavCompact(on: boolean) {
  if (on === compact) return;
  compact = on;
  subs.forEach((f) => f());
}

const onChange = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export function useNavCompact(): boolean {
  return useSyncExternalStore(onChange, () => compact, () => false);
}
