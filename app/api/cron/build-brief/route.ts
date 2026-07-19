import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildDeck, type InterestSignal, type TasteInput } from "@/lib/briefPipeline";
import { loadMyBrain } from "@/lib/myBrain";
import { syncMyBrain } from "@/lib/myBrainWrite";
import { generatedToBriefCard } from "@/lib/deckStyle";
import type { BriefCard } from "@/lib/types";

// 夜間のブリーフ生成Cron。GitHub Actions のスケジュール実行(build-brief.yml)から
// CRON_SECRET 付きで叩かれる。処理:
//   1. taste(気になっていること・興味・願い)は app_state(アプリの設定画面が
//      唯一の編集場所)を正とする。情報源は「お気に入り(app_state)」と
//      「my-brainのそれ以外の欄(将来Coworkが書き足す発掘URL)」を合わせて使う
//      (どちらも対等に扱う。今はCoworkが動いていないのでmy-brain側は空のことが多い)。
//   2. buildDeck() で単ホップ抽出→分類→編成(アプリ側Gemini無料枠)
//   3. 抽出レコードを content_cache へ蓄積(url重複は除外・非致命)
//   4. デッキ(BriefCard[])を app_state.generatedDecks[editionKey] へ書く
//   5. 使ったtasteをmy-brainへ書き戻す(鏡を最新化。設定画面から編集した時にも
//      同期しているが、興味は自動検出のため都度は同期しておらず、夜間1回で
//      追いつかせる)。
// クライアントはこのキーを読むが上書きしない(dataStore の SERVER_OWNED_KEYS)。
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

  // 1. taste は app_state(アプリの設定画面)を正として組み立てる。
  const { data } = await supa.from("app_state").select("key,value").eq("user_id", ownerId).in("key", ["sources", "profile", "wishes"]);
  const byKey: Record<string, unknown> = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const rawSources = Array.isArray(byKey.sources) ? (byKey.sources as unknown[]) : [];
  const appFavoriteSources: { url: string; label?: string }[] = rawSources
    .filter((s): s is { url: string; label?: string } => !!s && typeof s === "object" && typeof (s as { url?: unknown }).url === "string")
    .map((s) => ({ url: s.url, label: s.label }));
  const profile = byKey.profile as { interests?: unknown; currentFocus?: string } | undefined;
  const rawInterests = Array.isArray(profile?.interests) ? (profile!.interests as unknown[]) : [];
  const interests: InterestSignal[] = rawInterests
    .filter((i): i is { label: string; weight?: number } => !!i && typeof i === "object" && typeof (i as { label?: unknown }).label === "string")
    .map((i) => ({ label: i.label, weight: i.weight ?? 0 }));
  const rawWishes = Array.isArray(byKey.wishes) ? (byKey.wishes as unknown[]) : [];
  const wishes: string[] = rawWishes
    .filter((w): w is { status?: string; title: string } => !!w && typeof w === "object" && (w as { status?: unknown }).status === "stock")
    .map((w) => w.title);
  const focus: string | undefined = profile?.currentFocus || undefined;

  // 情報源はお気に入り(app_state)とmy-brainのその他の欄(将来Coworkが発掘した
  // URLを書き足す場所)を対等に合わせて使う。生活圏はmy-brain側にしか
  // 入力欄が無いのでそちらから読む。
  const brain = await loadMyBrain();
  const sources = Array.from(new Set([...appFavoriteSources.map((s) => s.url), ...brain.sources.map((s) => s.url)]));
  const taste: TasteInput = { focus, interests, wishes, livingArea: brain.taste.livingArea };

  if (!sources.length) return NextResponse.json({ ok: false, reason: "no_sources", brainFiles: brain.filesRead });

  // 2. 生成。countは「全体で最大何枚まで」という安全弁で、埋めにいく目標では
  // ない。実際の枚数は1情報源あたり最大3枚(buildDeckのSITE_CARD_LIMIT)で
  // 決まるので、情報源が少ない今は自然に数枚程度になる。
  const result = await buildDeck({ taste, sources, count: 20 });
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

  // 5. my-brainへ書き戻す(鏡を最新化)。興味は自動検出で頻繁に変わるため
  // 設定画面の編集時には都度同期していない。夜間にここで一度だけ追いつかせる。
  // 失敗しても(未設定・権限不足等)デッキ生成自体は成功として扱う。
  const mybrainSync = await syncMyBrain({ focus, livingArea: brain.taste.livingArea, interests, wishes, sources: appFavoriteSources });

  return NextResponse.json({
    ok: true, editionKey, cardCount: cards.length, pooled,
    // 診断用: 実際に採番したカードidを出す。Date.now()ベースの大きな数値に
    // なる。もし1,2,3のような小さい値のままなら、この保護ルートを叩いている
    // デプロイが古い(APP_BASE_URL がデプロイ固定URL等)ことを意味する。
    cardIds: cards.map((c) => c.id),
    brainFiles: brain.filesRead, sourceCount: sources.length,
    sites: result.sites, dropped: result.dropped, tokens: result.tokens,
    mybrainSync,
  });
}
