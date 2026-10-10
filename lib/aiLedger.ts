import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "@supabase/supabase-js";
import { setMeterSource, type AiJob, type Meter } from "./aiMeter";

export type { AiJob, Meter } from "./aiMeter";

// ★★★**Gemini の「1日の回数」の台帳**（2026-10-10・第137巡。ユーザー指定「gemini は使いすぎると上限に達するので」
//   「持続的に成立するならそれで良い」）。サーバーだけが読む（service role）。
//   ★Gemini の上限（RPM・TPM・RPD）は**数字が公開されていない**（AI Studio の画面にしか無い）うえ、無料枠は
//     予告なく減る。だから**上限の数字を前提にせず、アプリの側で仕事ごとに1日の回数を決めて数え、越えたら呼ばない**。
//   ★1日は**太平洋時間の0時**で切り替わる（Gemini の1日の回数が戻る時刻に合わせる）。
//   ★台帳は `app_state` の `aiLedger`（クライアントは上書きしない ―― `lib/dataStore.ts` の `SERVER_OWNED_KEYS`）。
//     直近 `KEEP_DAYS` 日ぶんを残す（断られた回数と理由も ―― 第136巡までは 429 を捨てていて、上限に当たったのか
//     情報源が空なのか区別できなかった）。
//   ★呼び出しの数え方 … `withBudget(job, fn)` の中で走る `callGemini`（`lib/briefPipeline.ts`）が、
//     `currentMeter()`（`lib/aiMeter.ts`）から自分の仕事の残りを読む（AsyncLocalStorage。ブリーフの奥まで引数で回さない）。

/** 仕事ごとの1日の上限（回）。★`transcribe` は 0 ＝ 数えるだけで止めない（止めると録った声が失われる）。★目盛りの外（回数）。 */
export const AI_CAPS: Record<AiJob, number> = { brief: 40, curate: 8, suggest: 15, plan: 6, transcribe: 0 };
/** 全部の合計の上限（回）。止めるのは数える仕事だけ。★目盛りの外（回数）。 */
export const AI_TOTAL_CAP = 80;
const KEY = "aiLedger";
const KEEP_DAYS = 14;

export type LedgerDay = {
  day: string;
  counts: Partial<Record<AiJob, number>>;
  /** 仕事ごとの、断られた（または失敗した）HTTP の状態ごとの回数。"budget" ＝ 台帳が止めた。 */
  errors: Partial<Record<AiJob, Record<string, number>>>;
};
type Ledger = { days: LedgerDay[] };

const store = new AsyncLocalStorage<Meter>();
setMeterSource(() => store.getStore());

/** 太平洋時間の日付（YYYY-MM-DD）。 */
export const ptDay = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const owner = process.env.OWNER_USER_ID;
  if (!url || !key || !owner) return null;
  return { supa: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), owner };
}

async function readLedger(): Promise<Ledger | null> {
  const a = admin();
  if (!a) return null;
  try {
    const { data } = await a.supa.from("app_state").select("value").eq("user_id", a.owner).eq("key", KEY).maybeSingle();
    const v = data?.value as Ledger | undefined;
    return v && Array.isArray(v.days) ? v : { days: [] };
  } catch {
    return null;
  }
}

async function writeLedger(l: Ledger): Promise<void> {
  const a = admin();
  if (!a) return;
  try {
    await a.supa.from("app_state").upsert(
      { user_id: a.owner, key: KEY, value: l, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" },
    );
  } catch { /* 台帳の失敗は仕事を止めない */ }
}

const todayOf = (l: Ledger): LedgerDay => {
  const day = ptDay();
  let d = l.days.find((x) => x.day === day);
  if (!d) { d = { day, counts: {}, errors: {} }; l.days.push(d); }
  return d;
};
const total = (d: LedgerDay) => Object.values(d.counts).reduce((a, b) => a + (b ?? 0), 0);

/** 今日の残りを読んで、この仕事の計量器を作る。台帳が読めない（未構成）なら上限の数だけ許す。 */
export async function openMeter(job: AiJob): Promise<Meter> {
  const l = await readLedger();
  const cap = AI_CAPS[job];
  if (!cap) return { job, left: Infinity, used: 0, errors: {} };
  if (!l) return { job, left: cap, used: 0, errors: {} };
  const d = todayOf(l);
  const left = Math.max(0, Math.min(cap - (d.counts[job] ?? 0), AI_TOTAL_CAP - total(d)));
  return { job, left, used: 0, errors: {} };
}

/** 使った回数と断られた理由を台帳へ足す（読み直してから足す ―― 同じ日の別の仕事の数を消さない）。 */
export async function closeMeter(m: Meter): Promise<void> {
  if (!m.used && !Object.keys(m.errors).length) return;
  const l = await readLedger();
  if (!l) return;
  const d = todayOf(l);
  d.counts[m.job] = (d.counts[m.job] ?? 0) + m.used;
  const e = (d.errors[m.job] ??= {});
  for (const [k, n] of Object.entries(m.errors)) e[k] = (e[k] ?? 0) + n;
  l.days = l.days.sort((a, b) => a.day.localeCompare(b.day)).slice(-KEEP_DAYS);
  await writeLedger(l);
}

/** `fn` の中の Gemini の呼び出しを、この仕事の1日の上限で数えて止める。 */
export async function withBudget<T>(job: AiJob, fn: (m: Meter) => Promise<T>): Promise<T> {
  const m = await openMeter(job);
  try {
    return await store.run(m, () => fn(m));
  } finally {
    await closeMeter(m);
  }
}
