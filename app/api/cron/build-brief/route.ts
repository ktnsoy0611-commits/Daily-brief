import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildDeck, type InterestSignal, type TasteInput } from "@/lib/briefPipeline";
import { loadMyBrain } from "@/lib/myBrain";
import { generatedToBriefCard } from "@/lib/deckStyle";
import type { BriefCard } from "@/lib/types";

// 夜間のブリーフ生成Cron。GitHub Actions のスケジュール実行(build-brief.yml)から
// CRON_SECRET 付きで叩かれる。処理:
//   1. my-brain(GitHub)から taste・情報源を読む(無ければ app_state をフォールバック)
//   2. buildDeck() で単ホップ抽出→分類→編成(アプリ側Gemini無料枠)
//   3. 抽出レコードを content_cache へ蓄積(url重複は除外・非致命)
//   4. デッキ(BriefCard[])を app_state.generatedDecks[editionKey] へ書く
// クライアントはこのキーを読むが上書きしない(dataStore の SERVER_OWNED_KEYS)。
//
// 必要な環境変数(未設定なら 500/该当reason で静かに終わる):
//   CRON_SECRET / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OWNER_USER_ID
//   (taste源) MYBRAIN_REPO / GITHUB_TOKEN(任意) / (生成) GEMINI_API_KEY / JINA_API_KEY(任意)

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

  // 1. taste + 情報源(my-brain 優先、無ければ app_state)
  const brain = await loadMyBrain();
  let taste: TasteInput = { ...brain.taste };
  let sources: string[] = brain.sources.map((s) => s.url);

  if (!sources.length || !(taste.interests && taste.interests.length)) {
    const { data } = await supa.from("app_state").select("key,value").eq("user_id", ownerId).in("key", ["sources", "profile", "wishes"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byKey: Record<string, any> = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
    if (!sources.length && Array.isArray(byKey.sources)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sources = byKey.sources.map((s: any) => s?.url).filter((u: unknown): u is string => typeof u === "string");
    }
    if (!(taste.interests && taste.interests.length) && byKey.profile) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const interests: InterestSignal[] = (byKey.profile.interests ?? []).map((i: any) => ({ label: i.label, weight: i.weight ?? 0 }));
      taste = { ...taste, focus: taste.focus ?? byKey.profile.currentFocus, interests };
    }
    if (!(taste.wishes && taste.wishes.length) && Array.isArray(byKey.wishes)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      taste = { ...taste, wishes: byKey.wishes.filter((w: any) => w.status === "stock").map((w: any) => w.title) };
    }
  }

  if (!sources.length) return NextResponse.json({ ok: false, reason: "no_sources", brainFiles: brain.filesRead });

  // 2. 生成
  const result = await buildDeck({ taste, sources, count: 6 });
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
  // idはダミーデータ(lib/constants.ts CARDS、id:1〜14)と衝突しない範囲から採番する。
  // 同じeditionKeyで先にダミーデッキを表示・スワイプ済みだった場合、briefs
  // [editionKey].decisions は小さい数値idで記録されている。生成カードのidが
  // それと重なると「もう決定済み」と誤判定され、実際には見せていないのに
  // カードが飛ばされてしまう(実機で発見)。
  const GENERATED_ID_BASE = 100000;
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

  return NextResponse.json({
    ok: true, editionKey, cardCount: cards.length, pooled,
    // 診断用: 実際に採番したカードidを出す。デプロイが最新なら100000番台に
    // なる。もし1,2,3のままなら、この保護ルートを叩いているデプロイが古い
    // (APP_BASE_URL がデプロイ固定URL等)ことを意味する。
    cardIds: cards.map((c) => c.id),
    brainFiles: brain.filesRead, sourceCount: sources.length,
    sites: result.sites, dropped: result.dropped, tokens: result.tokens,
  });
}
