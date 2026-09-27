// ★★★**2行に割るときの「読める切れ目」はここ1か所**（2026-09-27・第133巡）。
//   帯のピル（`lib/homeBand.ts` の `bandLines`）と、山の2行のタスク（`lib/taskSize.ts` の
//   `taskCellsOf` ＋ `components/home/pilePaint.ts` の `fitTask`）が同じ規則を読む。
//   ★第128〜133巡は帯だけがこの規則を持ち、山は字数で真ん中を切っていた（「名刺を刷／り直す」）。
// ★★切れ目は**真ん中にいちばん近い「読める所」**（句読点・閉じ括弧・助詞の直後／開き括弧の前）。
//   **英単語・数字・時刻（11:54）・小数（6.5）の途中では折らない。**

const BREAK_AFTER = new Set([
  " ", "　", "、", "。", "・", "」", "』", "）", ")", "／", "—", "─", "―", "–", "：", ":",
  "の", "が", "を", "に", "と", "で", "へ", "は", "も",
]);
/** ★★**開き括弧の「前」でも折ってよい**（「スズキユウリ」／「Music As…」）。 */
const BREAK_BEFORE = new Set(["「", "『", "（", "(", "“", "【", "〈"]);
const isWord = (c: string | undefined) => !!c && /[A-Za-z0-9]/.test(c);
const isDigit = (c: string | undefined) => !!c && /[0-9０-９]/.test(c);
const JOIN = new Set([":", "：", ".", "．", ",", "，"]);

/** ★`i` の前で折ると、語・数（時刻・小数を含む）を割ってしまうか。 */
function glued(chars: string[], i: number): boolean {
  const a = chars[i - 1]; const b = chars[i];
  if (isWord(a) && isWord(b)) return true;
  if (JOIN.has(a) && isDigit(chars[i - 2]) && isDigit(b)) return true;
  if (JOIN.has(b) && isDigit(a) && isDigit(chars[i + 1])) return true;
  return false;
}

/**
 * ★★2行に割る位置（1行目の字数）。`maxFirst` は1行目の上限、`slack` は真ん中からずれてよい割合。
 * 読める切れ目が無ければ真ん中で割り、**語・数の途中なら前（無理なら後ろ）へずらす**。
 */
export function breakIndex(chars: string[], maxFirst = Infinity, slack = 0.25): number {
  const n = chars.length;
  const target = Math.min(Math.ceil(n / 2), maxFirst);
  let cut = target;
  let best = Infinity;
  for (let i = 1; i <= Math.min(n - 1, maxFirst); i++) {
    if (!BREAK_AFTER.has(chars[i - 1]) && !BREAK_BEFORE.has(chars[i])) continue;
    if (glued(chars, i)) continue;
    const d = Math.abs(i - target);
    if (d < best && d <= Math.max(1, n * slack)) { best = d; cut = i; }
  }
  if (best !== Infinity) return cut;
  let k = cut;
  while (k > 1 && glued(chars, k)) k--;
  if (k > 1 && !glued(chars, k)) return k;
  k = cut;
  while (k < n - 1 && glued(chars, k)) k++;
  return glued(chars, k) ? cut : k;
}

/** ★★文を2行に割る（1行で足りれば1行）。 */
export function splitReadable(text: string, slack = 0.25): string[] {
  const chars = [...(text ?? "").trim()];
  if (chars.length < 2) return [chars.join("")];
  const cut = breakIndex(chars, Infinity, slack);
  const a = chars.slice(0, cut).join("").trim();
  const b = chars.slice(cut).join("").trim();
  return b ? [a, b] : [a];
}
