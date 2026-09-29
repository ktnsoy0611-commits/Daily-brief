// ★★★**起動直後の「山が落ちている間」を知らせる合図**（2026-09-29・第134巡。ユーザー指摘「**やはり起動直後に
//   ホームに図形が落ちてくる時にフレームレートが低下する**」）。
// ★山（`components/home/Pile.tsx`）が最初に図形を落とし始めたら `pileDropping()`、全員が眠ってループが止まったら
//   `pileSettled()`。重い「ついでの仕事」（他のアプリの先読みなど）は `whenPileSettled()` で**落ち終わるまで待つ**。
// ★★締切を必ず持つ（山が何かで止まらなくても、ついでの仕事が永久に来ないのは困る）。
// ★`performance.mark` も打つ（計測の目印。本番でも害は無い）。

let state: "idle" | "dropping" | "settled" = "idle";
const waiters = new Set<() => void>();

export function pileDropping(): void {
  if (state !== "idle") return;
  state = "dropping";
  try { performance.mark("pile-drop"); } catch { /* 計測できない環境 */ }
}

export function pileSettled(): void {
  if (state === "settled") return;
  state = "settled";
  try { performance.mark("pile-settled"); } catch { /* 計測できない環境 */ }
  const ws = [...waiters]; waiters.clear();
  ws.forEach((w) => w());
}

/** 山が落ち終わったら（または `limitMs` 経ったら）1度だけ呼ぶ。戻り値で取り消せる。 */
export function whenPileSettled(cb: () => void, limitMs: number): () => void {
  if (state === "settled") { cb(); return () => {}; }
  let done = false;
  const fire = () => { if (done) return; done = true; waiters.delete(fire); window.clearTimeout(timer); cb(); };
  const timer = window.setTimeout(fire, limitMs);
  waiters.add(fire);
  return () => { done = true; waiters.delete(fire); window.clearTimeout(timer); };
}
