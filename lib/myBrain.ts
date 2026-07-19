// my-brain リポジトリ(GitHub)から taste・情報源を読む。
//
// my-brain はユーザーが git で版管理する「自己モデルの真実源」。夜間の生成Cron
// (と実験ルート)は、アプリ内 app_state ではなくここを直接読んで taste 信号にする
// (AskUserQuestionで確定した方式)。
//
// ユーザーは非エンジニアで、YAMLのような書式は書けない。そのため taste-state.md /
// sources.md は「## 見出し + 箇条書き」という素のMarkdownで読めるようにする
// (parseSections/parseFocusSection/parseBulletSection)。YAML front-matter は
// 将来Coworkが自動更新する場合等に備えた上位互換のオプションとして残し、
// front-matterで埋まらなかった項目だけをMarkdown見出しから拾う(フォールバック)。
//
// 対象ファイル(いずれも任意。無ければその項目は空):
//   taste-state.md: 「## 気になっていること」「## 興味・リサーチ対象」
//     「## 願い」「## 生活圏」の見出し+箇条書き(またはYAML front-matter)
//   sources.md: 箇条書きのURL/Markdownリンク一覧(またはYAML front-matter)
//   profile.md: 読まない(ユーザーが手で管理する固定情報のため taste の源にしない)
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

// ---- 素のMarkdown(見出し+箇条書き)のparser。YAMLが書けないユーザー向け ----

// 「## 見出し」ごとに本文行を切り分ける。見出しの深さ(#の数)は問わない。
function parseSections(md: string): { heading: string; lines: string[] }[] {
  const lines = md.split(/\r?\n/);
  const sections: { heading: string; lines: string[] }[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  for (const line of lines) {
    const h = line.match(/^#{1,6}\s*(.+?)\s*$/);
    if (h) {
      current = { heading: h[1], lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return sections;
}
function findSection(sections: { heading: string; lines: string[] }[], keywordRe: RegExp): string[] | null {
  const s = sections.find((sec) => keywordRe.test(sec.heading));
  return s ? s.lines : null;
}
// 見出し直下の最初の空でない行(箇条書きの記号は取り除く)を1つの文として返す。
function firstLineOf(lines: string[]): string | undefined {
  for (const raw of lines) {
    const t = raw.replace(/^\s*[-*・]\s*/, "").replace(/<!--.*?-->/g, "").trim();
    if (t) return t;
  }
  return undefined;
}
// 「気になっていること」は複数の箇条書きになりうる(例: 別々の関心事を並べて
// 書く)ため、箇条書きがあれば全項目を " / " で連結した1つの短期的関心の文に
// まとめる。箇条書きが無い(1行だけ書かれた)場合はその行をそのまま使う。
function focusFromLines(lines: string[]): string | undefined {
  const bullets = bulletsOf(lines);
  if (bullets.length) return bullets.join(" / ");
  return firstLineOf(lines);
}
// 箇条書き行(- / * / ・ で始まる行)を配列で返す(コメント行・空行は無視)。
function bulletsOf(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    if (/^\s*<!--/.test(raw)) continue; // コメント行(例示など)は読まない
    const m = raw.match(/^\s*[-*・]\s*(.+)$/);
    if (!m) continue;
    const t = m[1].trim();
    if (t) out.push(t);
  }
  return out;
}
// Markdownリンク "[表示](URL)" または素のURL、"表示: URL" の3形式に対応。
function parseSourceBullets(bullets: string[]): SourceEntry[] {
  const out: SourceEntry[] = [];
  for (const b of bullets) {
    const link = b.match(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/);
    if (link) { out.push({ url: link[2], label: link[1].trim() || undefined }); continue; }
    const labeled = b.match(/^(.*?)[:：]\s*(https?:\/\/\S+)/);
    if (labeled && labeled[1].trim()) { out.push({ url: labeled[2].trim(), label: labeled[1].trim() }); continue; }
    const bare = b.match(/https?:\/\/\S+/);
    if (bare) out.push({ url: bare[0] });
  }
  return out;
}
// 見出し配下の箇条書きを興味タグにする。並び順が上ほど重要という前提で、
// 上から降順の重みを振る(先頭が最も強い興味)。
function interestsFromBullets(bullets: string[]): InterestSignal[] {
  const n = bullets.length;
  return bullets.map((label, i) => ({ label, weight: n - i }));
}

function tasteFromMarkdown(md: string): TasteInput {
  const sections = parseSections(md);
  const focus = focusFromLines(findSection(sections, /気になっ|focus/i) ?? []);
  const livingArea = firstLineOf(findSection(sections, /生活圏|エリア|living/i) ?? []);
  const interestBullets = bulletsOf(findSection(sections, /興味|リサーチ|関心|interest/i) ?? []);
  const wishBullets = bulletsOf(findSection(sections, /願い|ウィッシュ|wish/i) ?? []);
  return {
    focus,
    livingArea,
    interests: interestBullets.length ? interestsFromBullets(interestBullets) : undefined,
    wishes: wishBullets.length ? wishBullets : undefined,
  };
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

  // taste(興味/ウィッシュ/focus)の源は taste-state.md のみ。profile.md は
  // 「ほぼ固定の基礎情報」としてユーザーが手で管理する領域なので、ここでは読まない。
  const [tasteMd, sourcesMd] = await Promise.all([
    fetchFile(repo, "taste-state.md", token, ref),
    fetchFile(repo, "sources.md", token, ref),
  ]);
  const filesRead: string[] = [];
  const taste: TasteInput = {};
  let sources: SourceEntry[] = [];

  if (tasteMd) {
    filesRead.push("taste-state.md");
    const fm = parseFrontMatter(tasteMd);
    taste.focus = asString(fm.focus);
    taste.livingArea = asString(fm.living_area ?? fm.livingArea);
    taste.interests = parseInterests(fm.interests);
    taste.wishes = asStringArray(fm.wishes);
    // sources を taste-state.md に同居させている場合も拾う。
    const inline = parseSources(fm.sources);
    if (inline.length) sources = inline;

    // YAML front-matterで埋まらなかった項目は、素のMarkdown見出し+箇条書き
    // (## 気になっていること / ## 興味・リサーチ対象 / ## 願い / ## 生活圏)から補う。
    // ユーザーはYAMLを書けないため、こちらが主な書き方になる想定。
    const md = tasteFromMarkdown(tasteMd);
    taste.focus = taste.focus ?? md.focus;
    taste.livingArea = taste.livingArea ?? md.livingArea;
    if (!taste.interests?.length) taste.interests = md.interests;
    if (!taste.wishes?.length) taste.wishes = md.wishes;
  }
  if (sourcesMd) {
    filesRead.push("sources.md");
    const fm = parseFrontMatter(sourcesMd);
    let s = parseSources(fm.sources);
    if (!s.length) s = parseSourceBullets(bulletsOf(sourcesMd.split(/\r?\n/)));
    if (s.length) sources = s;
  }

  return { taste, sources, ok: filesRead.length > 0, filesRead };
}
