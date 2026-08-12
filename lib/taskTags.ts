import { BLUE, GOLD, GREEN, PLUM, RUST, SLATE } from "./constants";
import type { TaskTag } from "./types";

// ★タスクのタグ。**固定の6つ**から選ぶ(2026-08-12にユーザー確定)。
// 自由入力にすると似たタグが増えて色が似通い、山の中で見分けが付かなくなる。
// 色は既存のアクセント4色 + 同じ register の2色だけを使う。

export interface TagDef { id: TaskTag; label: string; color: string }

export const TASK_TAGS: TagDef[] = [
  { id: "work", label: "仕事", color: BLUE },
  { id: "shopping", label: "買い物", color: RUST },
  { id: "life", label: "暮らし", color: GREEN },
  { id: "body", label: "からだ", color: GOLD },
  { id: "people", label: "ひと", color: PLUM },
  { id: "learn", label: "まなび", color: SLATE },
];

export const tagDef = (id: TaskTag | undefined): TagDef | undefined =>
  TASK_TAGS.find((t) => t.id === id);

/** タグが無いものの色。地から浮くが主張しない中間のグレー。 */
export const NO_TAG_COLOR = "#9A9A94";

export const tagColor = (id: TaskTag | undefined): string => tagDef(id)?.color ?? NO_TAG_COLOR;
