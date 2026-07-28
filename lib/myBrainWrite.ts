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
  // taste-state.md 内の app-managed ゾーンへ書く「ユーザーの手編集」。
  // 分析結果(興味・好み本体・関連キーワード)は Cowork がゾーンの外に書き、
  // アプリはゾーンの中だけを差し替える(同じファイルを衝突なく共同編集する)。
  manualInterests?: { label: string }[]; // 設定画面で手動追加した興味・好み
  dismissed?: string[];                  // 設定画面で手動削除した(復活させない)
  sources?: { url: string; label?: string }[];
};
export type SyncResult = { ok: true; wrote: string[] } | { ok: false; reason: string };

const FAV_BEGIN = "<!-- BEGIN app-managed:favorites -->";
const FAV_END = "<!-- END app-managed:favorites -->";

// taste-state.md 内のアプリ管理ゾーン(手動追加・除外)。Coworkはこの内側を
// 触らず、アプリはこの内側だけを差し替える(sources.md のお気に入りと同型)。
const TASTE_BEGIN = "<!-- BEGIN app-managed:taste -->";
const TASTE_END = "<!-- END app-managed:taste -->";

function renderTasteZone(manualInterests: { label: string }[], dismissed: string[]): string {
  const adds = manualInterests.map((i) => i.label.trim()).filter(Boolean);
  const dism = dismissed.map((l) => l.trim()).filter(Boolean);
  return [
    TASTE_BEGIN,
    "## 手動で追加した興味・好み（アプリの設定画面が管理・Coworkは触らない）",
    adds.length ? adds.map((l) => `- ${l}`).join("\n") : "(まだありません)",
    "",
    "## 手動で除外（復活させない・アプリの設定画面が管理・Coworkは触らない）",
    dism.length ? dism.map((l) => `- ${l}`).join("\n") : "(まだありません)",
    TASTE_END,
  ].join("\n");
}

// 既存の taste-state.md のうち、app-managed ゾーン(手動追加・除外)だけを差し替える。
// マーカーが無ければ末尾に新設し、ファイル自体が無ければ最小の骨格を作る
// (興味・好み本体・関連キーワードは Cowork の分析が後で埋める)。ゾーンの外は
// 一切変更しない(=Coworkが書いた分析結果を消さない)。
export function mergeTasteStateMd(existing: string | null, manualInterests: { label: string }[], dismissed: string[]): string {
  const zone = renderTasteZone(manualInterests, dismissed);
  if (existing == null) {
    return [
      "# taste-state（興味・好みの真実源。Coworkの分析とアプリの手編集を同じファイルで同期します）",
      "",
      "## 生活圏",
      "- 東京23区(および電車で日常的に行ける範囲)",
      "",
      "## 興味・好み",
      "(Coworkの分析待ち)",
      "",
      "## 興味・好みの関連キーワード",
      "(Coworkの分析待ち)",
      "",
      zone,
      "",
      "## 願い",
      "(まだありません)",
      "",
    ].join("\n");
  }
  const b = existing.indexOf(TASTE_BEGIN);
  const e = existing.indexOf(TASTE_END);
  if (b === -1 || e === -1 || e < b) {
    return `${existing.replace(/\s*$/, "")}\n\n${zone}\n`;
  }
  return existing.slice(0, b) + zone + existing.slice(e + TASTE_END.length);
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

// 単一ファイルを my-brain のデフォルトブランチへ書く汎用関数。夜間Cronが
// 反応ログ(logs/feedback-*.md)・taste-user.md・sources-proposed.md 等を書き出す
// のに使う(既存と同じ内容なら書かない=無駄なコミットを避ける)。env未設定/失敗時は
// ok:false を返すだけ(呼び出し側は非致命)。
export async function writeMyBrainFile(path: string, content: string, message: string): Promise<SyncResult> {
  const repo = process.env.MYBRAIN_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) return { ok: false, reason: "no_repo" };
  if (!token) return { ok: false, reason: "no_token" };
  const ref = process.env.MYBRAIN_REF || undefined;
  try {
    const meta = await getFileMeta(repo, path, token, ref);
    if (meta && meta.content === content) return { ok: true, wrote: [] };
    await putFile(repo, path, content, meta?.sha, token, ref, message);
    return { ok: true, wrote: [path] };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

// my-brain の1ファイルを読む(無ければnull)。夜間Cronがログの月ファイルを
// 追記(既存に足す)するために、まず既存本文を読むのに使う。
export async function readMyBrainFile(path: string): Promise<string | null> {
  const repo = process.env.MYBRAIN_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) return null;
  const ref = process.env.MYBRAIN_REF || undefined;
  try {
    const meta = await getFileMeta(repo, path, token ?? "", ref);
    return meta?.content ?? null;
  } catch {
    return null;
  }
}

// my-brain の1ファイルを削除(無ければ何もしない)。ログの保持期間切れ月の掃除用。
export async function deleteMyBrainFile(path: string, message: string): Promise<SyncResult> {
  const repo = process.env.MYBRAIN_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) return { ok: false, reason: "no_repo" };
  if (!token) return { ok: false, reason: "no_token" };
  const ref = process.env.MYBRAIN_REF || undefined;
  try {
    const meta = await getFileMeta(repo, path, token, ref);
    if (!meta) return { ok: true, wrote: [] };
    await deleteFile(repo, path, meta.sha, token, ref, message);
    return { ok: true, wrote: [path] };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
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
    // taste-state.md は「興味・好みの真実源」で1ファイルに統合した(HANDOFF §8.16)。
    // Coworkの分析(興味・好み本体・関連キーワード)はゾーンの外に書き、アプリは
    // app-managed ゾーン(手動追加・除外)だけを差し替える。同じファイルを衝突なく
    // 共同編集する(以前は taste-user.md へ別ファイルで書き出していたのを廃止)。
    const tasteMeta = await getFileMeta(repo, "taste-state.md", token, ref);
    const tasteContent = mergeTasteStateMd(tasteMeta?.content ?? null, input.manualInterests ?? [], input.dismissed ?? []);
    if (tasteMeta === null || tasteMeta.content !== tasteContent) {
      await putFile(repo, "taste-state.md", tasteContent, tasteMeta?.sha, token, ref, "手動の興味・好み(追加・除外)を同期");
      wrote.push("taste-state.md");
    }

    const sourcesMeta = await getFileMeta(repo, "sources.md", token, ref);
    const sourcesContent = mergeSourcesMd(sourcesMeta?.content ?? null, input.sources ?? []);
    if (sourcesMeta === null || sourcesMeta.content !== sourcesContent) {
      await putFile(repo, "sources.md", sourcesContent, sourcesMeta?.sha, token, ref, "お気に入りの情報源を同期");
      wrote.push("sources.md");
    }

    // 孤児ファイルの掃除(ベストエフォート・失敗しても本体を止めない):
    // taste_state.md(アンダースコアの旧名)と、taste-user.md(taste-stateへ統合し
    // 廃止した旧ファイル)。放置すると同じ情報が複数ファイルにあるように見える。
    for (const stray of ["taste_state.md", "taste-user.md"]) {
      try {
        const m = await getFileMeta(repo, stray, token, ref);
        if (m) { await deleteFile(repo, stray, m.sha, token, ref, "統合により不要になったファイルを削除"); wrote.push(`${stray}(削除)`); }
      } catch { /* 消せなくても無視(次回の同期でまた試みる) */ }
    }
    return { ok: true, wrote };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
