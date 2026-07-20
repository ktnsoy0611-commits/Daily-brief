import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildDeck, type InterestSignal, type TasteInput } from "@/lib/briefPipeline";
import { loadMyBrain } from "@/lib/myBrain";
import { deleteMyBrainFile, readMyBrainFile, syncMyBrain, writeMyBrainFile } from "@/lib/myBrainWrite";
import { buildLogLines, groupByMonth, mergeMonthFile, oldLogPaths } from "@/lib/feedbackLog";
import { generatedToBriefCard } from "@/lib/deckStyle";
import type { BriefCard } from "@/lib/types";

// 夜間のブリーフ生成Cron。GitHub Actions のスケジュール実行(build-brief.yml)から
// CRON_SECRET 付きで叩かれる。処理:
//   1. taste(好み・興味・願い)は app_state(アプリの設定画面)とmy-brain
//      (Coworkや将来のジャーナル等、他アプリが直接書き足す可能性がある方)の
//      両方をラベル単位で合わせて使う(片方にしか無い項目も取りこぼさない)。
//      情報源も同様に「お気に入り(app_state)」と「my-brainのその他の欄」を
//      対等に合わせて使う。
//   2. buildDeck() で単ホップ抽出→分類→編成(アプリ側Gemini無料枠)
//   3. 抽出レコードを content_cache へ蓄積(url重複は除外・非致命)
//   4. デッキ(BriefCard[])を app_state.generatedDecks[editionKey] へ書く
//   5. 合わせた結果をmy-brainへ書き戻す(鏡を最新化)。app_stateへの書き戻しは
//      ここでは行わない(クライアントが所有するキーなので、同時に編集された
//      場合に上書きし合う競合を避けるため)。my-brain側の更新をアプリ画面へ
//      反映する経路は、クライアント起動時のpull(AppShell)が担う。
// クライアントはgeneratedDecksキーを読むが上書きしない(dataStore の
// SERVER_OWNED_KEYS)。
//
// 必要な環境変数(未設定なら 500/该当reason で静かに終わる):
//   CRON_SECRET / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OWNER_USER_ID
//   (taste源・書き戻し) MYBRAIN_REPO / GITHUB_TOKEN(書き込み権限必須) /
//   (生成) GEMINI_API_KEY / JINA_API_KEY(任意)

export const runtime = "nodejs";
export const maxDuration = 60;

const RETENTION_DAYS = 14;

function jstEditionKey(): string {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateKey = `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`;
  const edition = jst.getUTCHours() < 12 ? "am" : "pm";
  return `${dateKey}-${edition}`;
}

// editionKey("YYYY-MM-DD-am|pm")の日付が保持期間より古ければ true。
function isOldEdition(editionKey: string, cutoffMs: number): boolean {
  const m = editionKey.match(/^(\d{4})-(\d{2})-(\d{2})-/);
  if (!m) return false; // 読めないキーは安全側で残す
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return t < cutoffMs;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-cron-secret") ?? "";
  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerId = process.env.OWNER_USER_ID;
  if (!supaUrl || !serviceKey || !ownerId) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 500 });
  }
  const supa = createClient(supaUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. taste(好み・興味)は app_state(アプリの設定画面)とmy-brain(他アプリが
  // 直接書き足す可能性がある方)をラベル単位で合わせて使う。
  const { data } = await supa.from("app_state").select("key,value").eq("user_id", ownerId).in("key", ["sources", "profile", "wishes", "briefs", "generatedDecks", "items", "crawlState"]);
  const byKey: Record<string, unknown> = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const rawSources = Array.isArray(byKey.sources) ? (byKey.sources as unknown[]) : [];
  const appFavoriteSources: { url: string; label?: string }[] = rawSources
    .filter((s): s is { url: string; label?: string } => !!s && typeof s === "object" && typeof (s as { url?: unknown }).url === "string")
    .map((s) => ({ url: s.url, label: s.label }));
  const profile = byKey.profile as { interests?: unknown } | undefined;
  const rawInterests = Array.isArray(profile?.interests) ? (profile!.interests as unknown[]) : [];
  const isSignalLike = (i: unknown): i is { label: string; weight?: number; category?: string } =>
    !!i && typeof i === "object" && typeof (i as { label?: unknown }).label === "string";
  const appTaste: InterestSignal[] = rawInterests
    .filter((i): i is { label: string; weight?: number; category?: string } => isSignalLike(i) && i.category === "taste")
    .map((i) => ({ label: i.label, weight: i.weight ?? 0 }));
  const appInterest: InterestSignal[] = rawInterests
    .filter((i): i is { label: string; weight?: number; category?: string } => isSignalLike(i) && i.category === "interest")
    .map((i) => ({ label: i.label, weight: i.weight ?? 0 }));
  // ユーザーの手編集: 手動で足したラベル(source:"user")と、消したラベル(dismissed)。
  // taste-user.md へ書き出し、Coworkの分析がこれを尊重する。除外は生成からも外す。
  const userAddedLabels: string[] = rawInterests
    .filter((i): i is { label: string; source?: string } => !!i && typeof i === "object" && typeof (i as { label?: unknown }).label === "string" && (i as { source?: unknown }).source === "user")
    .map((i) => i.label);
  const dismissed: string[] = Array.isArray((profile as { dismissedInterests?: unknown } | undefined)?.dismissedInterests)
    ? ((profile as { dismissedInterests?: unknown[] }).dismissedInterests as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const dismissedSet = new Set(dismissed);
  const dismissedSources: string[] = Array.isArray((profile as { dismissedSources?: unknown } | undefined)?.dismissedSources)
    ? ((profile as { dismissedSources?: unknown[] }).dismissedSources as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const normSrc = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
  const dismissedSrcSet = new Set(dismissedSources.map(normSrc));
  const rawWishes = Array.isArray(byKey.wishes) ? (byKey.wishes as unknown[]) : [];
  const wishes: { title: string; domain?: string }[] = rawWishes
    .filter((w): w is { status?: string; title: string; category?: string } => !!w && typeof w === "object" && (w as { status?: unknown }).status === "stock")
    .map((w) => ({ title: w.title, domain: w.category }));

  // 情報源はお気に入り(app_state)とmy-brainのその他の欄(将来Coworkが発掘した
  // URLを書き足す場所)を対等に合わせて使う。生活圏はmy-brain側にしか
  // 入力欄が無いのでそちらから読む。
  const brain = await loadMyBrain();
  const allSources = Array.from(new Set([...appFavoriteSources.map((s) => s.url), ...brain.sources.map((s) => s.url)]))
    .filter((u) => !dismissedSrcSet.has(normSrc(u)));
  // 片方にしかないラベルも取りこぼさないよう、ラベル単位で合わせる
  // (重複はweightが大きい方を残す)。
  function mergeSignals(a: InterestSignal[], b: InterestSignal[]): InterestSignal[] {
    const map = new Map<string, InterestSignal>();
    for (const x of [...a, ...b]) {
      const existing = map.get(x.label);
      if (!existing || x.weight > existing.weight) map.set(x.label, x);
    }
    return Array.from(map.values());
  }
  const mergedTaste = mergeSignals(appTaste, brain.taste.taste ?? []).filter((s) => !dismissedSet.has(s.label));
  const mergedInterest = mergeSignals(appInterest, brain.taste.interest ?? []).filter((s) => !dismissedSet.has(s.label));
  // 「これから好みそうな傾向」は分析タスク(Cowork)が taste-state.md に書く
  // 予測信号で、アプリ側(app_state)には入力欄が無い。my-brain のものをそのまま使う。
  const taste: TasteInput = { taste: mergedTaste, interest: mergedInterest, emerging: brain.taste.emerging, wishes, livingArea: brain.taste.livingArea };

  if (!allSources.length) return NextResponse.json({ ok: false, reason: "no_sources", brainFiles: brain.filesRead });

  // Cron専有の巡回状態(crawlState): 情報源のローテーション位置(offset)と、
  // 各情報源の前回内容ハッシュ(digests)を保存する。クライアントはこのキーを
  // 一切触らない(AppStateに無いキーなので保存対象にならない)。
  const rawCrawl = (byKey.crawlState ?? {}) as { offset?: unknown; digests?: unknown };
  const prevOffset = typeof rawCrawl.offset === "number" && rawCrawl.offset >= 0 ? Math.floor(rawCrawl.offset) : 0;
  const prevDigests: Record<string, string> =
    rawCrawl.digests && typeof rawCrawl.digests === "object"
      ? Object.fromEntries(
          Object.entries(rawCrawl.digests as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][],
        )
      : {};

  // Q1: 情報源が SOURCE_WINDOW を超えて増えても、毎回先頭だけを読むのではなく、
  // offset を起点に窓をずらして読む(全ソースを順に巡る)。次回はこの続きから。
  const SOURCE_WINDOW = 6;
  const startOffset = allSources.length ? prevOffset % allSources.length : 0;
  const rotated = [...allSources.slice(startOffset), ...allSources.slice(0, startOffset)];
  const sources = rotated.slice(0, SOURCE_WINDOW);
  const nextOffset = allSources.length ? (startOffset + sources.length) % allSources.length : 0;

  // Q2: 既に作った/KEEP済みのカードと同じものを作らないための除外リスト。
  // 直近のデッキ(generatedDecks)とストックのItemから、URLとタイトルを集める。
  const excludeUrls: string[] = [];
  const excludeNames: string[] = [];
  const recentDecks = (byKey.generatedDecks ?? {}) as Record<string, { sourceUrl?: string; title?: string }[]>;
  for (const deck of Object.values(recentDecks)) {
    for (const c of deck ?? []) {
      if (typeof c?.sourceUrl === "string") excludeUrls.push(c.sourceUrl);
      if (typeof c?.title === "string") excludeNames.push(c.title);
    }
  }
  const excludeItems = Array.isArray(byKey.items) ? (byKey.items as { sourceUrl?: string; title?: string }[]) : [];
  for (const it of excludeItems) {
    if (typeof it?.sourceUrl === "string") excludeUrls.push(it.sourceUrl);
    if (typeof it?.title === "string") excludeNames.push(it.title);
  }

  // 2. 生成。countは「全体で最大何枚まで」という安全弁で、埋めにいく目標では
  // ない。実際の枚数は1情報源あたり最大3枚(buildDeckのSITE_CARD_LIMIT)で
  // 決まるので、情報源が少ない今は自然に数枚程度になる。
  const result = await buildDeck({
    taste, sources, count: 20,
    exclude: { urls: excludeUrls, names: excludeNames },
    digests: prevDigests,
  });
  if (!result.ok) {
    const status = result.reason.startsWith("gemini_") || result.reason === "fetch_failed" ? 502 : 200;
    return NextResponse.json({ ...result, brainFiles: brain.filesRead }, { status });
  }

  // 3. content_cache プール(url重複を除外して新規のみ挿入・非致命)
  let pooled = 0;
  try {
    if (result.records.length) {
      const { data: existing } = await supa.from("content_cache").select("payload").eq("user_id", ownerId);
      const seen = new Set<string>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (existing ?? []).map((r: any) => String(r?.payload?.url ?? "")).filter(Boolean),
      );
      const rows = result.records
        .filter((rec) => rec.sourceUrl && !seen.has(rec.sourceUrl))
        .map((rec) => ({
          user_id: ownerId,
          payload: {
            title: rec.name, url: rec.sourceUrl, date_start: rec.start, date_end: rec.end,
            area: rec.area, summary: rec.summary,
          },
        }));
      if (rows.length) {
        const { error } = await supa.from("content_cache").insert(rows);
        if (!error) pooled = rows.length;
      }
    }
  } catch {
    /* プール書き込みの失敗はデッキ生成を止めない */
  }

  // 4. デッキを generatedDecks[editionKey] へ(既存を読み、当該号を更新、古い号を掃除)
  const editionKey = jstEditionKey();
  // ★idは「生成の実行ごとに」重複しない値でなければならない。以前は固定値
  // (100000)を毎回のベースにしていたため、同じeditionKeyに対して生成が
  // 複数回走ると(手動でのworkflow再実行・スケジュールの再試行など)、
  // 前回と全く違う内容のカードに前回と同じid(例:100001)が割り当てられて
  // いた。ユーザーのbriefs[editionKey].decisionsはidをキーに記録されるため、
  // 「id:100001は決定済み」という古い記録が、中身が入れ替わった新しい
  // カードにもそのまま適用されてしまい、スワイプしてもカウンター
  // (deck.filter(c=>decisions[c.id]).length)が一向に進まないのに、
  // 各スワイプごとにItemはstatus:"candidate"で新規push()されるためストック
  // にはどんどん溜まっていく、という不具合になっていた(実機の画面録画を
  // ピクセル単位で解析して特定)。Date.now()を毎回のベースにすることで、
  // 生成の実行が変われば必ず別のid空間になり、古いdecisionsが新しい内容の
  // カードに誤って適用されることが構造的に無くなる。
  const GENERATED_ID_BASE = Date.now();
  const cards: BriefCard[] = result.cards.map((c, i) => generatedToBriefCard(c, GENERATED_ID_BASE + i));

  // 新しいカードが1枚も無い場合(全情報源が前回から更新なし=Q3、または候補が
  // 分類で全て落ちた場合)は、既存のデッキを空で上書きして消してしまわないよう、
  // デッキ書き込みと情報源カードの提案をスキップする。巡回状態(crawlState)・
  // ログ・同期は下で通常どおり行う。
  let proposedSource: string | null = null;
  let deckWritten = false;
  if (result.cards.length > 0) {
    // 情報源カード(§7-5): Coworkが発掘してプールに入った情報源のうち、まだ提案して
    // いない・お気に入りでも除外でもないものを1件だけ「新しい情報源」カードとして
    // デッキ先頭に混ぜ、KEEP/SKIPで採否を確認できるようにする。提案済みURLは
    // sources-proposed.md に記録して二度提案しない。非致命。
    try {
    const favSet = new Set(appFavoriteSources.map((s) => normSrc(s.url)));
    const proposedRaw = (await readMyBrainFile("sources-proposed.md")) ?? "";
    const proposedSet = new Set(
      proposedRaw.split(/\r?\n/).map((l) => l.match(/^-\s*(\S+)/)?.[1]).filter((u): u is string => !!u).map(normSrc),
    );
    const candidate = brain.sources
      .map((s) => s.url)
      .find((u) => !favSet.has(normSrc(u)) && !dismissedSrcSet.has(normSrc(u)) && !proposedSet.has(normSrc(u)));
    if (candidate) {
      let label = candidate;
      try { label = new URL(candidate).hostname.replace(/^www\./, ""); } catch { /* そのまま */ }
      cards.unshift({
        id: GENERATED_ID_BASE + 900000, category: "情報源", categoryJp: "情報源", trigger: "新しい情報源",
        title: `新しい情報源: ${label}`,
        body: `${label} を情報源に加えました。良ければ右へスワイプして残し、合わなければ左へ。`,
        bg: "#ECE9E1", fg: "#1C1C1E", accent: "#8A8578",
        sourceUrl: candidate, sourceLabel: label, sourceProposal: true,
      });
      proposedSource = candidate;
      const prevLines = proposedRaw.split(/\r?\n/).filter((l) => l.startsWith("- "));
      const nextProposed = `# sources-proposed（提案済みの情報源URL。二度提案しないための記録）\n\n${[...prevLines, `- ${candidate}`].join("\n")}\n`;
      await writeMyBrainFile("sources-proposed.md", nextProposed, "提案した情報源を記録");
    }
    } catch {
      /* 情報源カードの失敗はデッキ生成を止めない */
    }

    const { data: existingDeck } = await supa.from("app_state").select("value").eq("user_id", ownerId).eq("key", "generatedDecks").maybeSingle();
    const decks: Record<string, BriefCard[]> = (existingDeck?.value as Record<string, BriefCard[]>) ?? {};
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 3600 * 1000;
    for (const k of Object.keys(decks)) if (isOldEdition(k, cutoff)) delete decks[k];
    decks[editionKey] = cards;

    const { error: writeErr } = await supa.from("app_state").upsert(
      { user_id: ownerId, key: "generatedDecks", value: decks, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" },
    );
    if (writeErr) {
      return NextResponse.json({ ok: false, reason: "deck_write_failed", detail: writeErr.message }, { status: 502 });
    }
    deckWritten = true;
  }

  // Q1/Q3: 巡回状態を保存する。offset は次回の窓の開始位置、digests は今回取得
  // できた各情報源の最新ハッシュ(前回分にマージ)。クライアントは触らないキー。
  try {
    const mergedDigests = { ...prevDigests, ...result.digests };
    await supa.from("app_state").upsert(
      { user_id: ownerId, key: "crawlState", value: { offset: nextOffset, digests: mergedDigests }, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" },
    );
  } catch {
    /* 巡回状態の保存失敗はデッキ生成を止めない */
  }

  // 5. 反応の生ログを my-brain の logs/feedback-YYYY-MM.md へエクスポート。
  // briefs(決定)×generatedDecks(カード)＋items(KEEP後の実行・星)を、カードが
  // 14日でgeneratedDecksから消える前に月ごとのログへ焼き付ける(機械的・分析なし)。
  // これで恒久履歴は app_state でなく my-brain 側に貯まり(=stateを太らせない)、
  // 別のCoworkタスクがこのログを読んで推論・分析する。保持は12か月(古い月は削除)。非致命。
  const logWrote: string[] = [];
  try {
    const briefsVal = (byKey.briefs ?? {}) as Record<string, { decisions?: Record<string, string>; feedback?: Record<string, boolean> }>;
    const decksVal = (byKey.generatedDecks ?? {}) as Record<string, BriefCard[]>;
    const itemsVal = Array.isArray(byKey.items) ? (byKey.items as Parameters<typeof buildLogLines>[2]) : [];
    const lines = buildLogLines(briefsVal, decksVal, itemsVal);
    for (const [month, monthLines] of groupByMonth(lines)) {
      const path = `logs/feedback-${month}.md`;
      const existing = await readMyBrainFile(path);
      const content = mergeMonthFile(existing, monthLines);
      if (content !== (existing ?? "")) {
        const r = await writeMyBrainFile(path, content, `反応ログを更新(${month})`);
        if (r.ok) logWrote.push(...r.wrote);
      }
    }
    for (const p of oldLogPaths(new Date())) {
      await deleteMyBrainFile(p, "保持期間切れの反応ログを削除");
    }
  } catch {
    /* 反応ログの失敗はデッキ生成を止めない */
  }

  // 6. ユーザーの手編集(手動で足した好み・興味＝source:"user"、消した＝dismissed)を
  // taste-user.md へ書き出す。好み・興味チップ本体はCoworkが taste-state.md を
  // 所有するが、この taste-user.md を読んでユーザーの追加を残し・除外を尊重する。非致命。
  try {
    const bullet = (arr: string[]) => (arr.length ? arr.map((l) => `- ${l}`).join("\n") : "（なし）");
    const userMd = [
      "# taste-user（アプリでの手編集。分析タスクはこれを尊重する）",
      "",
      "## 追加（手動で足した好み・興味。消さないこと）",
      bullet(userAddedLabels),
      "",
      "## 除外（手動で消した。好み・興味に復活させないこと）",
      bullet(dismissed),
      "",
    ].join("\n");
    await writeMyBrainFile("taste-user.md", userMd, "手編集(追加・除外)を同期");
    const srcMd = [
      "# sources-user（アプリで削除した情報源。発掘タスクはこれを尊重する）",
      "",
      "## 除外（プールに入れない・cowork:discoveredから外す）",
      dismissedSources.length ? dismissedSources.map((u) => `- ${u}`).join("\n") : "（なし）",
      "",
    ].join("\n");
    await writeMyBrainFile("sources-user.md", srcMd, "削除した情報源を同期");
  } catch {
    /* taste-user.md/sources-user.mdの失敗はデッキ生成を止めない */
  }

  // 7. お気に入りの情報源(sources.md)を my-brain へ同期する(taste-state.md は
  // Coworkが所有するのでここでは書かない)。失敗してもデッキ生成は成功扱い。
  const mybrainSync = await syncMyBrain({ sources: appFavoriteSources });

  return NextResponse.json({
    ok: true, editionKey, cardCount: cards.length, pooled, deckWritten,
    // 診断用: 実際に採番したカードidを出す。Date.now()ベースの大きな数値に
    // なる。もし1,2,3のような小さい値のままなら、この保護ルートを叩いている
    // デプロイが古い(APP_BASE_URL がデプロイ固定URL等)ことを意味する。
    cardIds: cards.map((c) => c.id),
    brainFiles: brain.filesRead,
    // sourceCount=今回読んだ窓のサイズ / sourceTotal=プール全体 / offsetは巡回位置。
    sourceCount: sources.length, sourceTotal: allSources.length, offset: startOffset, nextOffset,
    note: result.note,
    sites: result.sites, dropped: result.dropped, tokens: result.tokens,
    logWrote, proposedSource, mybrainSync,
  });
}
