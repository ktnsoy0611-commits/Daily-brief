// my-brain リポジトリ(GitHub)への書き込み。アプリの「設定」画面が
// taste(好み・興味・願い)と「お気に入りの情報源」の唯一の編集場所で
// あり続ける(ユーザーはGitHubを直接操作しない)。
// my-brainはその内容をそのまま映す「鏡」で、Coworkが読む側の実体になる。
// 一方向の書き込み(アプリ→my-brain)であり、逆方向(my-brainを人力で編集した
// 内容をアプリへ取り込む)は今は無い(taste-state.mdはこの関数が丸ごと
// 上書きする管理下ファイルという前提)。
//
// sources.md は例外: お気に入り欄(このファイルが書くのはここだけ)と、
// 将来Coworkが発掘したURLを書き足す欄を、マーカーコメントで区切って共存
// させる。お気に入り欄の外側は一切書き換えない(Coworkの追記を消さない)。
//
// env: MYBRAIN_REPO="owner/repo" / GITHUB_TOKEN(書き込み権限が必須) /
//      MYBRAIN_REF(既定 main)。未設定/失敗時はok:falseを返すだけで、
//      呼び出し側(設定画面・夜間Cron)の処理は止めない。

export type SyncTasteInput = {
  livingArea?: string;
  taste?: { label: string; weight: number }[];    // 好み(比較的安定)
  interest?: { label: string; weight: number }[]; // 興味(時期で変わる)
  wishes?: string[];
  sources?: { url: string; label?: string }[];
};
export type SyncResult = { ok: true; wrote: string[] } | { ok: false; reason: string };

const FAV_BEGIN = "<!-- BEGIN app-managed:favorites -->";
const FAV_END = "<!-- END app-managed:favorites -->";

function bullet(lines: string[]): string {
  return lines.length ? lines.map((l) => `- ${l}`).join("\n") : "";
}
function byWeightDesc(items: { label: string; weight: number }[]): string[] {
  return items.slice().sort((a, b) => b.weight - a.weight).map((i) => i.label);
}

// taste-state.md は全体を管理下に置く(自由メモ欄は持たせない。設定画面の
// 内容がそのまま反映される1枚の鏡)。
export function renderTasteStateMd(t: SyncTasteInput): string {
  return [
    "# taste-state（アプリの設定画面から自動同期・直接編集しても上書きされます）",
    "",
    "## 生活圏",
    bullet([t.livingArea?.trim() || "東京23区(および電車で日常的に行ける範囲)"]),
    "",
    "## 好み（比較的安定したジャンル・カルチャーの好み）",
    bullet(byWeightDesc(t.taste ?? [])) || "(まだありません)",
    "",
    "## 興味（今、関心を持っていること。時期によって変わる）",
    bullet(byWeightDesc(t.interest ?? [])) || "(まだありません)",
    "",
    "## 願い",
    bullet((t.wishes ?? []).filter((w) => w.trim())) || "(まだありません)",
    "",
  ].join("\n");
}

function renderFavoritesBlock(sources: { url: string; label?: string }[]): string {
  const lines = sources.map((s) => `- [${s.label || s.url}](${s.url})`);
  return [
    FAV_BEGIN,
    "## お気に入り（アプリの設定画面から同期・直接編集しても上書きされます）",
    lines.length ? lines.join("\n") : "(まだありません)",
    FAV_END,
  ].join("\n");
}

// 既存のsources.md本文のうち、お気に入り欄(マーカーの間)だけを差し替える。
// マーカーが無ければ先頭に新設する(それ以外の内容は一切変更しない=
// Coworkが将来書き足す別の見出しを消さない)。
export function mergeSourcesMd(existing: string | null, sources: { url: string; label?: string }[]): string {
  const block = renderFavoritesBlock(sources);
  if (existing == null) {
    return [
      block,
      "",
      "<!-- ここから下は自由に追記できます。例えばCoworkが発掘した情報源を",
      "     別の見出しでまとめておくと、次の生成でその情報源も使われます。 -->",
      "",
    ].join("\n");
  }
  const beginIdx = existing.indexOf(FAV_BEGIN);
  const endIdx = existing.indexOf(FAV_END);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    return `${block}\n\n${existing}`;
  }
  return existing.slice(0, beginIdx) + block + existing.slice(endIdx + FAV_END.length);
}

type FileMeta = { content: string; sha: string } | null;

// ref未指定(undefined)ならGitHub側がリポジトリのデフォルトブランチを
// 自動で使う(GET/PUTのcontents APIどちらも仕様上そう定義されている)。
// "main"を決め打ちしていると、既定ブランチ名がmaster等のリポジトリで
// 「Branch main not found」の404になるため、指定が無い限り一切送らない。
async function getFileMeta(repo: string, path: string, token: string, ref?: string): Promise<FileMeta> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}${q}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "daily-brief" },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get ${path} failed: ${res.status}`);
  const data = await res.json();
  const content = Buffer.from(data.content ?? "", data.encoding === "base64" ? "base64" : "utf-8").toString("utf-8");
  return { content, sha: data.sha as string };
}

async function putFile(repo: string, path: string, content: string, sha: string | undefined, token: string, ref: string | undefined, message: string): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "daily-brief", "Content-Type": "application/json" },
    // branchを省略(undefined)するとJSON.stringifyが自動でキー自体を除く
    // (GitHub側はそれをデフォルトブランチの指定として扱う)。
    body: JSON.stringify({ message, content: Buffer.from(content, "utf-8").toString("base64"), sha, branch: ref }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`put ${path} failed: ${res.status} ${detail.slice(0, 300)}`);
  }
}

// GitHubのcontents API(DELETE)でファイルを消す。putFileと同じくbranchは
// undefinedなら送らない(デフォルトブランチ扱い)。呼び出し側は失敗を握りつぶす。
async function deleteFile(repo: string, path: string, sha: string, token: string, ref: string | undefined, message: string): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "DELETE",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "daily-brief", "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha, branch: ref }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`delete ${path} failed: ${res.status} ${detail.slice(0, 300)}`);
  }
}

export async function syncMyBrain(input: SyncTasteInput): Promise<SyncResult> {
  const repo = process.env.MYBRAIN_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) return { ok: false, reason: "no_repo" };
  if (!token) return { ok: false, reason: "no_token" };
  const ref = process.env.MYBRAIN_REF || undefined;

  const wrote: string[] = [];
  try {
    const tasteContent = renderTasteStateMd(input);
    const tasteMeta = await getFileMeta(repo, "taste-state.md", token, ref);
    if (tasteMeta === null || tasteMeta.content !== tasteContent) {
      await putFile(repo, "taste-state.md", tasteContent, tasteMeta?.sha, token, ref, "設定画面の内容を同期");
      wrote.push("taste-state.md");
    }

    const sourcesMeta = await getFileMeta(repo, "sources.md", token, ref);
    const sourcesContent = mergeSourcesMd(sourcesMeta?.content ?? null, input.sources ?? []);
    if (sourcesMeta === null || sourcesMeta.content !== sourcesContent) {
      await putFile(repo, "sources.md", sourcesContent, sourcesMeta?.sha, token, ref, "お気に入りの情報源を同期");
      wrote.push("sources.md");
    }

    // 旧命名の孤児 taste_state.md(アンダースコア)が残っていたら消す。アプリは
    // 一貫してハイフンの taste-state.md だけを使うため、アンダースコア版は
    // 過去の残骸で、放置するとmy-brainにstateが2つあるように見える。削除の
    // 失敗は本体の同期を止めない(ベストエフォート)。
    try {
      const strayMeta = await getFileMeta(repo, "taste_state.md", token, ref);
      if (strayMeta) {
        await deleteFile(repo, "taste_state.md", strayMeta.sha, token, ref, "重複した旧stateファイルを削除");
        wrote.push("taste_state.md(削除)");
      }
    } catch {
      // 消せなくても無視(次回の同期でまた試みる)。
    }
    return { ok: true, wrote };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
