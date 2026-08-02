import { PATHS, dayPath } from "@/lib/myBrainPaths";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildDeck, type InterestSignal, type TasteInput } from "@/lib/briefPipeline";
import { loadMyBrain } from "@/lib/myBrain";
import { deleteMyBrainFile, readMyBrainFile, syncMyBrain, writeMyBrainFile } from "@/lib/myBrainWrite";
import { buildLogLines, groupByMonth, mergeMonthFile, oldLogPaths } from "@/lib/feedbackLog";
import { buildSourceStats, renderSourceStatsMd, type SourceStatRow } from "@/lib/sourceStats";
import { renderGoalsMd } from "@/lib/goalsExport";
import { generatedToBriefCard } from "@/lib/deckStyle";
import { FIXED_SOURCES } from "@/lib/constants";
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
// 枚数を増やした(GEN_TARGET=16)ぶん、取得+要約に時間がかかる。上限を長めに取る
// (Vercelのプラン上限まで有効。Hobbyは60秒で頭打ちだが指定しても害はない)。
export const maxDuration = 300;

// アプリを見ずスキップもキープもしなかった(=未消化の)カードは、この日数だけ
// ストックし続け、超えたら削除する(ユーザー指定: 3日を限度)。号の日付で判定。
const RETENTION_DAYS = 3;
const POOL_CAP = 40;         // 未消化(keep/skipされていない)カードのストック上限。40枚溜まっている間は追加生成しない(ユーザー指定)
const GEN_TARGET = 10;       // 1号(朝刊/夕刊)で出す目標枚数(ユーザー指定: 各10枚くらい。朝刊10+夕刊10=1日20枚)
const GOAL_CARDS_PER_WEEK = 2; // ゴール関連カードは週に1〜2枚まで(ユーザー指定・§8.21)

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

// 号を横断して「未消化(keep/skipされていない)カード」の枚数を数える。
// 決定(briefs.decisions)はカードidをキーに号ごとに散っているが、カードidは
// 生成実行ごとに一意なので、全号の決定をマージして「決定済みでない・会期
// 切れでもない」カードを数える。これが POOL_CAP(30)に達している間は新規生成
// しない(トークン節約)。ブリーフタブの未消化プール表示と同じ母数。
function countUndigested(decksVal: unknown, briefsVal: unknown): number {
  const decks = (decksVal ?? {}) as Record<string, { id?: unknown; expiresAt?: string }[]>;
  const briefs = (briefsVal ?? {}) as Record<string, { decisions?: Record<string, unknown> }>;
  const decided = new Set<string>();
  for (const b of Object.values(briefs)) for (const id of Object.keys(b?.decisions ?? {})) decided.add(id);
  const now = Date.now();
  const seen = new Set<string>(); // ブリーフタブのプールと同じく重複idは1回だけ数える
  let n = 0;
  for (const deck of Object.values(decks)) {
    for (const c of deck ?? []) {
      const id = String(c?.id);
      if (seen.has(id)) continue;
      seen.add(id);
      if (decided.has(id)) continue;
      const exp = c?.expiresAt;
      if (exp) { const t = Date.parse(exp); if (!Number.isNaN(t) && t < now) continue; }
      n++;
    }
  }
  return n;
}

type Signal = { label: string; weight: number };

// taste-state.md の「興味・好み」から、app_state.profile.interests(チップ)の次の値を
// 作る。好み/興味は1リストへ統合済み(HANDOFF §8.14 優先度3)。手動で足したチップ
// (source:"user")と手動削除(dismissedInterests)は保持する(AppShell起動時pullと同じ
// マージ規則)。実際の upsert は呼び出し側(supaが型付きで手元にある場所)で行う。
// これでチップが毎晩 taste-state と一致する。
function mergeChips(profileVal: unknown, taste: Signal[], dismissed: string[]): Record<string, unknown> {
  const prof = (profileVal && typeof profileVal === "object" ? profileVal : { interests: [] }) as {
    interests?: { id?: string; label: string; weight?: number; source?: string }[];
    dismissedInterests?: string[];
  };
  const dism = new Set([...(prof.dismissedInterests ?? []), ...dismissed]);
  const userManual = (prof.interests ?? []).filter((i) => i?.source === "user" && !dism.has(i.label));
  const pinned = new Set(userManual.map((i) => i.label));
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const fromCowork = taste
    .filter((s) => !dism.has(s.label) && !pinned.has(s.label))
    .filter((s) => (seen.has(s.label) ? false : (seen.add(s.label), true)))
    .map((s) => ({ id: `cowork-${s.label}`, label: s.label, weight: s.weight, source: "auto" as const, addedAt: now }));
  return { ...prof, interests: [...userManual, ...fromCowork] };
}

export async function GET(req: Request) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ownerId = process.env.OWNER_USER_ID;

  // 認可は2経路。(1)夜間のGitHub Actionsは CRON_SECRET で叩く。(2)本人(OWNER)が
  // アプリの設定画面から「今すぐ生成」した場合は、Supabaseのアクセストークンを
  // 検証し、そのユーザーIDが OWNER_USER_ID と一致すれば許可する(本人の
  // 自分のデータに対する手動実行なので安全)。
  const secret = process.env.CRON_SECRET;
  const provided = new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-cron-secret") ?? "";
  let authorized = !!secret && provided === secret;
  // 本人がアプリの「今すぐ生成」から叩いた手動実行か(=Bearerトークン認可)を覚えておく。
  // 手動実行は「更新の有無に関わらず今すぐ出したい」ので、更新なしスキップを無効化する
  // (forceFresh)。夜間のGitHub Actions(x-cron-secret)は従来どおりトークン節約を優先。
  let manualRun = false;
  if (!authorized) {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (token && anonKey && supaUrl && ownerId) {
      try {
        const authClient = createClient(supaUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data } = await authClient.auth.getUser(token);
        if (data?.user?.id === ownerId) { authorized = true; manualRun = true; }
      } catch { /* 無効トークンは未認可のまま */ }
    }
  }
  if (!authorized) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  if (!supaUrl || !serviceKey || !ownerId) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 500 });
  }
  const supa = createClient(supaUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. taste(好み・興味)は app_state(アプリの設定画面)とmy-brain(他アプリが
  // 直接書き足す可能性がある方)をラベル単位で合わせて使う。
  const { data } = await supa.from("app_state").select("key,value").eq("user_id", ownerId).in("key", ["sources", "profile", "wishes", "briefs", "generatedDecks", "items", "crawlState", "fixedSources", "sourceStats", "goals"]);
  const byKey: Record<string, unknown> = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const rawSources = Array.isArray(byKey.sources) ? (byKey.sources as unknown[]) : [];
  const appFavoriteSources: { url: string; label?: string }[] = rawSources
    .filter((s): s is { url: string; label?: string } => !!s && typeof s === "object" && typeof (s as { url?: unknown }).url === "string")
    .map((s) => ({ url: s.url, label: s.label }));
  const profile = byKey.profile as { interests?: unknown } | undefined;
  const rawInterests = Array.isArray(profile?.interests) ? (profile!.interests as unknown[]) : [];
  const isSignalLike = (i: unknown): i is { label: string; weight?: number } =>
    !!i && typeof i === "object" && typeof (i as { label?: unknown }).label === "string";
  // 好み/興味は「興味・好み」1リストへ統合済み(HANDOFF §8.14 優先度3)。
  const appTaste: InterestSignal[] = rawInterests
    .filter((i): i is { label: string; weight?: number } => isSignalLike(i))
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
  const wishes: { title: string; domain?: string; id?: string }[] = rawWishes
    .filter((w): w is { status?: string; title: string; category?: string; id?: string } => !!w && typeof w === "object" && (w as { status?: unknown }).status === "stock")
    .map((w) => ({ title: w.title, domain: w.category, id: typeof w.id === "string" ? w.id : undefined }));

  // 情報源はお気に入り(app_state)とmy-brainのその他の欄(将来Coworkが発掘した
  // URLを書き足す場所)を対等に合わせて使う。生活圏はmy-brain側にしか
  // 入力欄が無いのでそちらから読む。
  const brain = await loadMyBrain();
  // 規定(固定)情報源: ユーザーが設定画面で編集していれば app_state.fixedSources を、
  // 未編集なら内蔵の FIXED_SOURCES を使う。
  const effectiveFixed = Array.isArray(byKey.fixedSources)
    ? (byKey.fixedSources as unknown[]).filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u))
    : FIXED_SOURCES;
  // 固定＋お気に入り(app_state)＋発掘(my-brain sources.md)。
  // 発掘プールの並び順(打率順)はCoworkの発掘タスクが保つ前提。
  const brainSourceUrls = brain.sources.map((s) => s.url);
  const allSources = Array.from(new Set([...effectiveFixed, ...appFavoriteSources.map((s) => s.url), ...brainSourceUrls]))
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
  // 「興味・好みの関連キーワード」は分析タスク(Cowork)が taste-state.md に書く、
  // 興味・好みから派生する関連・隣接テーマで、アプリ側(app_state)には入力欄が
  // 無い。my-brain のものをそのまま使う(moderate=興味の広がり判定の材料)。
  // ゴール(§8.21): 本体は app_state にあり、達成に効くキーワードは Cowork の週次分析が
  // taste-state.md の「## ゴールに効くキーワード」へ書く。ここでゴール名を突き合わせて
  // idを付け、生成へ渡す(層1が goalId を返せるようにするため)。キーワードがまだ無い
  // ゴールも、タイトルだけで渡して拾える可能性を残す。
  const rawGoals = Array.isArray(byKey.goals) ? (byKey.goals as unknown[]) : [];
  const appGoals = rawGoals
    .filter((g): g is { id?: string; title: string } => !!g && typeof g === "object" && typeof (g as { title?: unknown }).title === "string")
    .map((g) => ({ id: typeof g.id === "string" ? g.id : undefined, title: g.title }));
  const normTitle = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
  const kwByTitle = new Map((brain.taste.goalKeywords ?? []).map((g) => [normTitle(g.title), g.keywords]));
  const goalsForGen = appGoals.map((g) => ({ id: g.id, title: g.title, keywords: kwByTitle.get(normTitle(g.title)) ?? [] }));

  const taste: TasteInput = {
    taste: mergedTaste, related: brain.taste.related, wishes,
    goals: goalsForGen, livingArea: brain.taste.livingArea,
  };

  if (!allSources.length) return NextResponse.json({ ok: false, reason: "no_sources", brainFiles: brain.filesRead });

  // Cron専有の巡回状態(crawlState): 各情報源の前回内容ハッシュ(digests)を保存し、
  // 更新のないサイトの抽出をスキップする(トークン節約)。クライアントはこのキーを
  // 一切触らない(AppStateに無いキーなので保存対象にならない)。
  const rawCrawl = (byKey.crawlState ?? {}) as { digests?: unknown };
  const prevDigests: Record<string, string> =
    rawCrawl.digests && typeof rawCrawl.digests === "object"
      ? Object.fromEntries(
          Object.entries(rawCrawl.digests as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][],
        )
      : {};

  // 巡回対象の選択: 1回の巡回は SITES_PER_RUN(10)サイトまでに抑える(Jina無料枠の
  // 1日上限対策・ユーザー指定)。固定(FIXED_SOURCES)は毎回必ず巡回し、残りの枠を
  // 「お気に入り＋発掘プール」から前寄せの重み付き非復元ランダムで選ぶ(=日替わりで
  // ローテーションし、数日かけて全情報源をカバーする)。1サイトあたりの抽出は
  // 層1で最大10件になったので、10サイトでも候補は最大100件と十分に多い。
  const SITES_PER_RUN = 10;
  const SELECT_BIAS = 0.6; // 前寄せの強さ(0=完全ランダム)。小さめ=「ほんの少し」。
  const pinnedSet = new Set(effectiveFixed.map(normSrc));
  const pinned = allSources.filter((u) => pinnedSet.has(normSrc(u)));
  const rotatePool = allSources.filter((u) => !pinnedSet.has(normSrc(u)));
  // 前寄せ重み付き非復元ランダム抽出。weight = 1 + BIAS*(1 - i/len)。
  function weightedSample(pool: string[], k: number): string[] {
    const items = pool.map((u, i) => ({ u, w: 1 + SELECT_BIAS * (pool.length > 1 ? 1 - i / (pool.length - 1) : 1) }));
    const picked: string[] = [];
    while (picked.length < k && items.length) {
      const total = items.reduce((s, x) => s + x.w, 0);
      let r = Math.random() * total;
      let idx = 0;
      for (let i = 0; i < items.length; i++) { r -= items[i].w; if (r <= 0) { idx = i; break; } }
      picked.push(items[idx].u);
      items.splice(idx, 1);
    }
    return picked;
  }
  const rotatePick = weightedSample(rotatePool, Math.max(0, SITES_PER_RUN - pinned.length));
  const sources = [...pinned, ...rotatePick];

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

  // 2. 未消化(keep/skipされていない)カードのバックログを数える。1ヶ月ぶん最大
  // POOL_CAP(30)枚まで貯めておき、これに達している間は新しく生成しない
  // (毎日生成→未消化のまま破棄を繰り返すとGeminiのトークンが無駄なため)。
  const undigested = countUndigested(byKey.generatedDecks, byKey.briefs);
  const genCount = Math.max(0, Math.min(GEN_TARGET, POOL_CAP - undigested));
  const skipGen = genCount === 0;

  // ゴール関連カードは「週に1〜2枚」(ユーザー指定)。直近7日の号に出したゴール
  // カードを数え、GOAL_CARDS_PER_WEEK に足りない分だけ今回の枠として渡す。
  // 1号ごとに枠を確保すると週14枚になってしまうため、この数え方にしている。
  const goalQuota = (() => {
    if (!goalsForGen.length) return 0;
    const decks = (byKey.generatedDecks ?? {}) as Record<string, { goalId?: unknown }[]>;
    const cutoff = Date.now() - 7 * 86400000;
    let recent = 0;
    for (const [ek, deck] of Object.entries(decks)) {
      const m = ek.match(/^(\d{4})-(\d{2})-(\d{2})-/);
      if (!m) continue;
      const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
      if (Number.isNaN(t) || t < cutoff) continue;
      for (const c of deck ?? []) if (typeof c?.goalId === "string" && c.goalId) recent++;
    }
    return Math.max(0, GOAL_CARDS_PER_WEEK - recent);
  })();

  // 3. 生成。countは「この号で最大何枚まで」(目標GEN_TARGET=10、ただし残り
  // 容量まで)。バックログが上限ならbuildDeckを呼ばない=トークンを使わない。
  const result = skipGen
    ? null
    : await buildDeck({
        taste, sources, count: genCount,
        exclude: { urls: excludeUrls, names: excludeNames },
        digests: prevDigests,
        forceFresh: manualRun, // 手動「今すぐ生成」は更新なしスキップを無効化して必ず抽出
        goalQuota,             // ゴール関連カードは週に1〜2枚だけ(§8.21)
      });
  if (result && !result.ok) {
    const status = result.reason.startsWith("gemini_") || result.reason === "fetch_failed" ? 502 : 200;
    return NextResponse.json({ ...result, brainFiles: brain.filesRead }, { status });
  }

  // 4. content_cache プール(url重複を除外して新規のみ挿入・非致命)
  let pooled = 0;
  try {
    if (result && result.records.length) {
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
  const cards: BriefCard[] = result ? result.cards.map((c, i) => generatedToBriefCard(c, GENERATED_ID_BASE + i)) : [];

  let proposedSource: string | null = null;
  let deckWritten = false;

  // 情報源カード(§7-5): 新しいカードを生成した号でだけ、Coworkが発掘してプールに
  // 入った情報源のうち、まだ提案していない・お気に入りでも除外でもないものを
  // 1件だけ「新しい情報源」カードとしてデッキ先頭に混ぜ、KEEP/SKIPで採否を
  // 確認できるようにする。提案済みURLは sources/proposed.md に記録して二度
  // 提案しない。非致命。生成を見送った号(cards空)では提案しない。
  if (cards.length > 0) {
    try {
      const favSet = new Set(appFavoriteSources.map((s) => normSrc(s.url)));
      const proposedRaw = (await readMyBrainFile(PATHS.proposed)) ?? "";
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
        const nextProposed = `# 提案済みの情報源URL（二度提案しないための記録）\n\n${[...prevLines, `- ${candidate}`].join("\n")}\n`;
        await writeMyBrainFile(PATHS.proposed, nextProposed, "提案した情報源を記録");
      }
    } catch {
      /* 情報源カードの失敗はデッキ生成を止めない */
    }
  }

  // デッキ書き込み。生成を見送った号でも、1ヶ月(RETENTION_DAYS)を過ぎた古い号の
  // 掃除だけは毎回行う(ユーザー指定「1ヶ月経ったカードは削除」)。新しいカードが
  // あれば当該号を追加する。カードが1枚も無い場合は既存デッキを空で上書きして
  // 消さない(掃除の結果だけ書き戻す)。
  {
    const { data: existingDeck } = await supa.from("app_state").select("value").eq("user_id", ownerId).eq("key", "generatedDecks").maybeSingle();
    const decks: Record<string, BriefCard[]> = (existingDeck?.value as Record<string, BriefCard[]>) ?? {};
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 3600 * 1000;
    let mutated = false;
    for (const k of Object.keys(decks)) if (isOldEdition(k, cutoff)) { delete decks[k]; mutated = true; }
    if (cards.length > 0) { decks[editionKey] = cards; mutated = true; }
    if (mutated) {
      const { error: writeErr } = await supa.from("app_state").upsert(
        { user_id: ownerId, key: "generatedDecks", value: decks, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" },
      );
      if (writeErr && cards.length > 0) {
        return NextResponse.json({ ok: false, reason: "deck_write_failed", detail: writeErr.message }, { status: 502 });
      }
    }
    deckWritten = cards.length > 0;
  }

  // Q3: 巡回状態を保存する。digests は今回取得できた各情報源の最新ハッシュ
  // (前回分にマージ)。更新の無いサイトを次回スキップするのに使う。生成を
  // 見送った号(result=null)は取得していないので更新しない。
  if (result) {
    try {
      const mergedDigests = { ...prevDigests, ...result.digests };
      await supa.from("app_state").upsert(
        { user_id: ownerId, key: "crawlState", value: { digests: mergedDigests }, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" },
      );
    } catch {
      /* 巡回状態の保存失敗はデッキ生成を止めない */
    }
  }

  // 直近の生成サマリを cronStatus へ保存する。ユーザーがVercelのログを見なくても
  // 設定画面で「いつ・何号を・何枚・何サイト巡回したか」を確認できるようにする。
  // クライアントは読むが上書きしない(SERVER_OWNED_KEYS)。非致命。
  try {
    await supa.from("app_state").upsert(
      {
        user_id: ownerId, key: "cronStatus",
        value: {
          at: new Date().toISOString(), editionKey,
          cardCount: cards.length, sourceCount: sources.length,
          // 切り分け用: 取得できたサイト数・抽出候補数・落ちた内訳。0枚のとき
          // 「取得できていない/候補が出ていない/既出で除外された」のどれかが分かる。
          sitesFetched: result?.sites.filter((s) => s.fetched).length,
          candidateCount: result?.candidateCount,
          dropped: result?.dropped,
          pooled, totalTokens: result?.tokens.totalTokens ?? 0,
          note: result?.note ?? (skipGen ? `未消化のカードが${undigested}枚あるため、今回は生成を見送りました。` : undefined),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,key" },
    );
  } catch {
    /* 生成サマリの保存失敗はデッキ生成を止めない */
  }

  // 5. 反応の生ログを my-brain の days/YYYY-MM/feedback.md へエクスポート。
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
      const path = dayPath(month, "feedback");
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

  // 5.5 情報源ごとの打率(出した数・残した数)を集計して my-brain へ書く。
  // 反応ログは前向きな反応だけを残す方針なので、打率の分母(=見せた数)がログから
  // 出せない。個別のスキップ記録を作らずに打率を出すため、**集計値だけ**をここで
  // 積み上げる(HANDOFF §8.20)。Coworkの発掘タスクがこれを読んで cowork:discovered の
  // 並べ替え・淘汰を行う。カードは3日でデッキから消えるので毎晩少しずつ積算し、
  // 既に数えたカードidを countedIds で持って二重計上を防ぐ。非致命。
  try {
    const prevStats = (byKey.sourceStats ?? {}) as { rows?: unknown; countedIds?: unknown };
    const prevRows = Array.isArray(prevStats.rows) ? (prevStats.rows as SourceStatRow[]) : [];
    const prevCounted = Array.isArray(prevStats.countedIds)
      ? (prevStats.countedIds as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const { rows, newlyCounted } = buildSourceStats(byKey.generatedDecks, byKey.briefs, prevRows, prevCounted);
    if (newlyCounted.length || prevRows.length) {
      // countedIds は「デッキに残っている間の二重計上」を防ぐだけなので直近ぶんで足りる。
      const nextCounted = [...prevCounted, ...newlyCounted].slice(-2000);
      await supa.from("app_state").upsert(
        { user_id: ownerId, key: "sourceStats", value: { rows, countedIds: nextCounted }, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" },
      );
      await writeMyBrainFile(PATHS.stats, renderSourceStatsMd(rows), "情報源ごとの打率を更新");
    }
  } catch {
    /* 打率集計の失敗はデッキ生成を止めない */
  }

  // 5.6 ゴール(と、そこに書き溜めたチェックインの記録)を me/goals.md へ書き出す。
  // ゴールは app_state にしか無くCoworkから見えないため、週次の分析タスクが
  // 「ゴールを分析して達成に効くキーワードを出す」ために共有する(§8.21)。
  // 記録(日付・本文・節目・満足度)は分析の主材料なのですべて載せる(ユーザー指定)。非致命。
  try {
    await writeMyBrainFile(PATHS.goals, renderGoalsMd(byKey.goals), "ゴールと記録を同期");
  } catch {
    /* ゴール同期の失敗はデッキ生成を止めない */
  }

  // 6. アプリで削除した情報源を sources/dismissed.md へ書き出す(発掘タスクが尊重する)。
  // ※ユーザーの手編集(手動追加した興味・好み＝source:"user"、除外＝dismissed)は
  // me/taste.md の app-managed ゾーンへ統合したので、下の syncMyBrain がまとめて
  // 書く(旧 taste-user.md は廃止・HANDOFF §8.16)。非致命。
  try {
    const srcMd = [
      "# アプリで削除した情報源（発掘タスクはこれを尊重する）",
      "",
      "## 除外（プールに入れない・cowork:discoveredから外す）",
      dismissedSources.length ? dismissedSources.map((u) => `- ${u}`).join("\n") : "（なし）",
      "",
    ].join("\n");
    await writeMyBrainFile(PATHS.dismissed, srcMd, "削除した情報源を同期");
  } catch {
    /* sources-user.mdの失敗はデッキ生成を止めない */
  }

  // 6.5 チップの毎晩同期。分析(好み・興味・関連キーワードの作成)は精度が要るので
  // Coworkの週次タスクが担い、taste-state.md を書く。ここではその taste-state の
  // 好み・興味を app_state.profile.interests(チップ)へコピーするだけ(Gemini不使用)。
  // これでアプリを開かなくても毎晩チップが taste-state と一致する(issue 5)。手動で
  // 足したチップ(source:"user")・手動削除(dismissedInterests)は保持する。非致命。
  let chipsSynced: { ok: boolean; note?: string; counts?: { taste: number } } = { ok: false };
  try {
    const bt = brain.taste;
    // 好み/興味は「興味・好み」1リストへ統合済み(HANDOFF §8.14 優先度3)。
    const tasteSigs = (bt.taste ?? []).map((s) => ({ label: s.label, weight: s.weight }));
    if (tasteSigs.length > 0) {
      const nextProfile = mergeChips(byKey.profile, tasteSigs, dismissed);
      await supa.from("app_state").upsert(
        { user_id: ownerId, key: "profile", value: nextProfile, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" },
      );
      chipsSynced = { ok: true, counts: { taste: tasteSigs.length } };
    } else {
      // taste-state.md がまだ空(Coworkが未実行)なら、既存チップを消さないよう触らない。
      chipsSynced = { ok: false, note: "me/taste.md が空(Cowork分析待ち)" };
    }
  } catch (e) {
    chipsSynced = { ok: false, note: e instanceof Error ? e.message : String(e) };
  }

  // 7. お気に入りの情報源(sources.md)＋ taste-state.md の app-managed ゾーン
  // (手動追加した興味・好み＝source:"user"、除外＝dismissed)を my-brain へ同期する
  // (夜間のバックストップ。分析結果=ゾーンの外はCoworkが所有し触らない)。失敗しても
  // デッキ生成は成功扱い。
  const mybrainSync = await syncMyBrain({
    sources: appFavoriteSources,
    manualInterests: userAddedLabels.map((label) => ({ label })),
    dismissed,
  });

  return NextResponse.json({
    ok: true, editionKey, cardCount: cards.length, pooled, deckWritten,
    // 診断用: 実際に採番したカードidを出す。Date.now()ベースの大きな数値に
    // なる。もし1,2,3のような小さい値のままなら、この保護ルートを叩いている
    // デプロイが古い(APP_BASE_URL がデプロイ固定URL等)ことを意味する。
    cardIds: cards.map((c) => c.id),
    brainFiles: brain.filesRead,
    // sourceCount=今晩巡回した数(固定＋抽選) / sourceTotal=プール全体 /
    // pinnedCount=固定＋お気に入り(毎晩) / rotatePoolSize=発掘プールの母数。
    sourceCount: sources.length, sourceTotal: allSources.length,
    pinnedCount: pinned.length, rotatePoolSize: rotatePool.length,
    note: result?.note ?? (skipGen ? `未消化のカードが${undigested}枚あるため、今回は生成を見送りました。` : undefined),
    skipped: skipGen, undigested,
    sites: result?.sites ?? [], dropped: result?.dropped, tokens: result?.tokens,
    logWrote, proposedSource, mybrainSync, chipsSynced,
  });
}
