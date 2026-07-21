// my-brain リポジトリ(GitHub)から taste・情報源を読む。
//
// my-brain はユーザーが git で版管理する「自己モデルの真実源」。夜間の生成Cron
// (と実験ルート)は、アプリ内 app_state ではなくここを直接読んで taste 信号にする
// (AskUserQuestionで確定した方式)。
//
// ユーザーは非エンジニアで、YAMLのような書式は書けない。そのため taste-state.md /
// sources.md は「## 見出し + 箇条書き」という素のMarkdownで読めるようにする
// (parseSections/parseBulletSection)。YAML front-matter は将来Coworkが自動
// 更新する場合等に備えた上位互換のオプションとして残し、front-matterで
// 埋まらなかった項目だけをMarkdown見出しから拾う(フォールバック)。
//
// 対象ファイル(いずれも任意。無ければその項目は空):
//   taste-state.md: 「## 好み」(比較的安定)「## 興味」(時期で変わる)
//     「## 興味の関連キーワード」(興味から派生する関連・隣接テーマ。旧「## これから
//     好みそうな傾向」も後方互換で読む)「## 願い」「## 生活圏」の見出し+箇条書き
//     (またはYAML front-matter)
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
// 見出し直下の最初の空でない行(箇条書きの記号は取り除く)を1つの文として返す。
function firstLineOf(lines: string[]): string | undefined {
  for (const raw of lines) {
    const t = raw.replace(/^\s*[-*・]\s*/, "").replace(/<!--.*?-->/g, "").trim();
    if (t) return t;
  }
  return undefined;
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
  // 見出しの判定は「## 見出し」の本文(Markdown)向け。英語エイリアス(taste等)は
  // 使わない(ファイル冒頭の "# taste-state" というタイトルが /taste/ に誤マッチ
  // して好みが空になる不具合があったため。英語表記はYAML front-matter側が担う)。
  // 「## 興味の関連キーワード」(新)・「## これから好みそうな傾向」(旧・後方互換)は
  // どちらも語中に「興味」「好み」を含むので、好み・興味の判定から必ず除外する
  // (この節を先に別扱いする)。
  const isRelated = (h: string) => /関連キーワード|関連|派生|これから好みそうな傾向|傾向|広がり|emerging|related/i.test(h);
  const livingArea = firstLineOf(sections.find((s) => /生活圏|エリア/.test(s.heading))?.lines ?? []);
  const relatedBullets = bulletsOf(sections.find((s) => isRelated(s.heading))?.lines ?? []);
  const tasteBullets = bulletsOf(sections.find((s) => /好み/.test(s.heading) && !isRelated(s.heading))?.lines ?? []);
  const interestBullets = bulletsOf(sections.find((s) => /興味|関心/.test(s.heading) && !isRelated(s.heading))?.lines ?? []);
  const wishBullets = bulletsOf(sections.find((s) => /願い|ウィッシュ/.test(s.heading))?.lines ?? []);
  return {
    livingArea,
    taste: tasteBullets.length ? interestsFromBullets(tasteBullets) : undefined,
    interest: interestBullets.length ? interestsFromBullets(interestBullets) : undefined,
    related: relatedBullets.length ? interestsFromBullets(relatedBullets) : undefined,
    wishes: wishBullets.length ? wishBullets : undefined,
  };
}

// ref未指定ならリポジトリのデフォルトブランチを使う("main"を決め打ちすると
// 既定ブランチ名がmaster等のリポジトリで404になるため指定が無い限り送らない)。
async function fetchFile(repo: string, path: string, token: string | undefined, ref?: string): Promise<string | null> {
  try {
    const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}${q}`, {
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
  const ref = process.env.MYBRAIN_REF || undefined;

  // taste(好み/興味/関連キーワード/生活圏)の源は taste-state.md のみ。profile.md は
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
    taste.livingArea = asString(fm.living_area ?? fm.livingArea);
    taste.taste = parseInterests(fm.taste);
    taste.interest = parseInterests(fm.interest);
    taste.related = parseInterests(fm.related ?? fm.emerging ?? fm.tendencies);
    taste.wishes = asStringArray(fm.wishes);
    // sources を taste-state.md に同居させている場合も拾う。
    const inline = parseSources(fm.sources);
    if (inline.length) sources = inline;

    // YAML front-matterで埋まらなかった項目は、素のMarkdown見出し+箇条書き
    // (## 好み / ## 興味 / ## 願い / ## 生活圏)から補う。ユーザーはYAMLを
    // 書けないため、こちらが主な書き方になる想定。
    const md = tasteFromMarkdown(tasteMd);
    taste.livingArea = taste.livingArea ?? md.livingArea;
    if (!taste.taste?.length) taste.taste = md.taste;
    if (!taste.interest?.length) taste.interest = md.interest;
    if (!taste.related?.length) taste.related = md.related;
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
