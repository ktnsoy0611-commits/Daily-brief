// ★★★第18〜23巡の「ずれの補正」。**第24巡で既定は切った。次巡で撤去する。**
//
// 何をするものだったか … `visualViewport.offsetTop` のぶんだけ、入力画面の
// 中身(`[data-fit]`)を下へ動かす。「iOS は見えている矩形を下へずらすことが
// あり、`position: fixed` の器はそれを追わないから、中身の側で追う」という
// 読みに基づいていた。
//
// なぜ捨てたか … **その読みが実機で成り立っていなかった**(第24巡)。iPhone は
// `offsetTop` にキーボードの高さ K を返すが、器はずれていない。だから補正が
// まるごと余分になり、中身が K だけ下へ落ちる。上のバーが画面の真ん中に来て、
// 帯と図形がキーボードの裏に隠れる — 報告された崩れ方と数字が3か所とも合う。
// 経緯と検証は `docs/archive/ui-binder-*.md` の §7.24。
//
// ここに残してあるのは**実機で見比べるため**だけ(設定→「ずれの補正を試す
// (旧方式)」)。既定は呼ばれない。次の巡でこのファイルごと消すこと。

/** ずれを書き換える最小の段。1〜2px の往復で動きが走らないように。 */
const SHIFT_MIN_STEP = 8;
/** ずれの上限(見えている上端からの余分)。★基準が `offsetTop` 自身なので、
 *  疑っている値そのものが大きいときは素通りする(第23巡に判明)。 */
const SHIFT_CAP = 160;
/** ずれ残りを直す最小の段(px)。`SHIFT_MIN_STEP` と同じ値にすること。 */
const CORRECT_MIN_STEP = SHIFT_MIN_STEP;
/** 1回の落ち着きにつき、直しにいく回数の上限。 */
const CORRECT_MAX = 2;
/** 動きが落ち着くまでの待ち(ms)。 */
const CORRECT_WAIT_MS = 320;
/** キーボードに追いつくときの動き。 */
const KB_EASE = "transform 280ms cubic-bezier(0.32,0.72,0,1)";

/**
 * 旧方式を器に取り付ける。返り値を呼べば元へ戻る。
 *
 * ★★**ずれ残りの測り方は循環している**(第24巡に判明。残す以上は書いておく)。
 *   `印の rect.top − vv.offsetTop` は、`--vvtop = offsetTop` を当てた瞬間に
 *   **必ず 0** になる。疑っている値そのものを物差しにしているので、
 *   「`offsetTop` が当てにならない」という誤りだけは構造的に検出できない。
 */
export function attachLegacyShift(shell: HTMLElement): () => void {
  const fit = shell.querySelector<HTMLElement>("[data-fit]");
  if (!fit) return () => {};

  // 中身の上端の印(0 高)。JSX には戻さず、ここで差し込む。
  const mark = document.createElement("span");
  mark.setAttribute("aria-hidden", "true");
  mark.dataset.fitTop = "";
  mark.style.display = "block";
  mark.style.height = "0";
  fit.insertBefore(mark, fit.firstChild);
  fit.style.transform = "translateY(var(--vvtop, 0px))";
  fit.style.transition = KB_EASE;

  let vvTop = 0;
  let left = CORRECT_MAX;
  let timer = 0;

  const writeShift = (v: number) => {
    const vv = window.visualViewport;
    const cap = Math.round((vv?.offsetTop ?? 0) + SHIFT_CAP);
    const next = Math.max(0, Math.min(cap, Math.round(v)));
    if (next === vvTop) return;
    vvTop = next;
    shell.style.setProperty("--vvtop", `${next}px`);
  };

  const correct = () => {
    const vv = window.visualViewport;
    if (!vv || !shell.isConnected) return;
    if (left <= 0) return;
    const resid = Math.round(mark.getBoundingClientRect().top - vv.offsetTop);
    if (Math.abs(resid) < CORRECT_MIN_STEP) return;
    left -= 1;
    writeShift(vvTop - resid);
    schedule();
  };

  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(correct, CORRECT_WAIT_MS);
  };

  const apply = () => {
    if (!shell.isConnected) return;
    const v = Math.max(0, Math.round(window.visualViewport?.offsetTop ?? 0));
    if (Math.abs(v - vvTop) >= SHIFT_MIN_STEP) {
      left = CORRECT_MAX;
      writeShift(v);
    }
    schedule();
  };

  const vv = window.visualViewport;
  vv?.addEventListener("resize", apply);
  vv?.addEventListener("scroll", apply);
  window.addEventListener("resize", apply);
  window.addEventListener("scroll", apply, { passive: true });
  apply();

  return () => {
    window.clearTimeout(timer);
    vv?.removeEventListener("resize", apply);
    vv?.removeEventListener("scroll", apply);
    window.removeEventListener("resize", apply);
    window.removeEventListener("scroll", apply);
    mark.remove();
    fit.style.transform = "";
    fit.style.transition = "";
    shell.style.removeProperty("--vvtop");
  };
}
