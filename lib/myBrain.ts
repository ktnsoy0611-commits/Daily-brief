// my-brain リポジトリ(GitHub)から taste・情報源を読む。
//
// my-brain はユーザーが git で版管理する「自己モデルの真実源」。夜間の生成Cron
// (と実験ルート)は、アプリ内 app_state ではなくここを直接読んで taste 信号にする
// (AskUserQuestionで確定した方式)。人間可読と機械可読を両立させるため、各 .md の
// 先頭 YAML front-matter だけを機械が読み、その下は自由なメモ/ジャーナルにできる。
//
// 対象ファイル(いずれも任意。無ければその項目は空):
//   taste-state.md front-matter: focus / living_area / interests[] / wishes[]
//   sources.md     front-matter: sources[]
//   profile.md     front-matter: 補助(living_area 等。taste-state.md を優先)
//
// env: MYBRAIN_REPO="owner/repo"(必須) / GITHUB_TOKEN(private リポジトリ用・任意) /
//      MYBRAIN_REF(ブランチ。既定 main)。未設定/取得失敗時は静かに空を返す。

import yaml from "js-yaml";
import type { InterestSignal, TasteInput } from "@/lib/briefPipeline";

export type SourceEntry = { url: string; label?: string };
export type MyBrain = {
  taste: TasteInput;
  sources: SourceEntry[];
  ok: boolean;       // 何か1ファイルでも読めたか
  filesRead: string[];
};

const EMPTY: MyBrain = { taste: {}, sources: [], ok: false, filesRead: [] };

// front-matter(先頭の --- ... --- ブロック)を取り出して YAML として parse。
export function parseFrontMatter(text: string): Record<string, unknown> {
  const m = text.match(/^﻿?\s*---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!m) return {};
  try {
    const doc = yaml.load(m[1]);
    return doc && typeof doc === "object" ? (doc as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
}
// interests は [{label, weight}] を基本に、文字列配列も許容(weightは既定0)。
export function parseInterests(v: unknown): InterestSignal[] {
  if (!Array.isArray(v)) return [];
  const out: InterestSignal[] = [];
  for (const x of v) {
    if (typeof x === "string") {
      if (x.trim()) out.push({ label: x.trim(), weight: 0 });
    } else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const label = asString(o.label ?? o.name ?? o.tag);
      if (label) out.push({ label, weight: typeof o.weight === "number" ? o.weight : 0 });
    }
  }
  return out;
}
// sources は [{url, label}] を基本に、文字列(URLのみ)も許容。
export function parseSources(v: unknown): SourceEntry[] {
  if (!Array.isArray(v)) return [];
  const out: SourceEntry[] = [];
  for (const x of v) {
    if (typeof x === "string") {
      if (/^https?:\/\//.test(x.trim())) out.push({ url: x.trim() });
    } else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const url = asString(o.url ?? o.href);
      if (url && /^https?:\/\//.test(url)) out.push({ url, label: asString(o.label ?? o.name) });
    }
  }
  return out;
}

async function fetchFile(repo: string, path: string, token: string | undefined, ref: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, {
      headers: {
        Accept: "application/vnd.github.raw+json",
        "User-Agent": "daily-brief",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// my-brain を読んで taste・情報源を返す。呼び出し側は ok:false のとき別ソース
// (app_state 等)へフォールバックする。
export async function loadMyBrain(): Promise<MyBrain> {
  const repo = process.env.MYBRAIN_REPO;
  if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) return EMPTY;
  const token = process.env.GITHUB_TOKEN;
  const ref = process.env.MYBRAIN_REF || "main";

  const [tasteMd, sourcesMd, profileMd] = await Promise.all([
    fetchFile(repo, "taste-state.md", token, ref),
    fetchFile(repo, "sources.md", token, ref),
    fetchFile(repo, "profile.md", token, ref),
  ]);
  const filesRead: string[] = [];
  const taste: TasteInput = {};
  let sources: SourceEntry[] = [];

  if (profileMd) {
    filesRead.push("profile.md");
    const fm = parseFrontMatter(profileMd);
    taste.livingArea = asString(fm.living_area ?? fm.livingArea) ?? taste.livingArea;
    taste.focus = asString(fm.focus) ?? taste.focus;
  }
  if (tasteMd) {
    filesRead.push("taste-state.md");
    const fm = parseFrontMatter(tasteMd);
    // taste-state.md を profile.md より優先する。
    taste.focus = asString(fm.focus) ?? taste.focus;
    taste.livingArea = asString(fm.living_area ?? fm.livingArea) ?? taste.livingArea;
    taste.interests = parseInterests(fm.interests);
    taste.wishes = asStringArray(fm.wishes);
    // sources を taste-state.md に同居させている場合も拾う。
    const inline = parseSources(fm.sources);
    if (inline.length) sources = inline;
  }
  if (sourcesMd) {
    filesRead.push("sources.md");
    const fm = parseFrontMatter(sourcesMd);
    const s = parseSources(fm.sources);
    if (s.length) sources = s;
  }

  return { taste, sources, ok: filesRead.length > 0, filesRead };
}
