// ★Gemini の呼び出しを数える「計量器」の型と操作（Node の部品を持たない軽い入れ物）。
//   `lib/briefPipeline.ts` はクライアントの束にも入る（`PlanGenerateSheet` → `planPipeline` → `briefPipeline`）ので、
//   `node:async_hooks` を抱える `lib/aiLedger.ts` を直接は読まない。台帳がここへ「いまの計量器の出どころ」を登録する。

export type AiJob = "brief" | "curate" | "suggest" | "plan" | "transcribe";
export type Meter = { job: AiJob; left: number; used: number; errors: Record<string, number> };

let source: () => Meter | undefined = () => undefined;
export const setMeterSource = (f: () => Meter | undefined) => { source = f; };
/** いま走っている仕事の計量器（`withBudget` の外では undefined ＝ 数えない）。 */
export const currentMeter = () => source();

/** 1回ぶんを取る（取れなければ false ＝ 台帳が止めた）。 */
export function takeOne(m: Meter | undefined): boolean {
  if (!m) return true;
  if (m.left <= 0) { m.errors.budget = (m.errors.budget ?? 0) + 1; return false; }
  m.left -= 1;
  m.used += 1;
  return true;
}

export function noteError(m: Meter | undefined, status: number | string) {
  if (!m) return;
  const k = String(status);
  m.errors[k] = (m.errors[k] ?? 0) + 1;
}
