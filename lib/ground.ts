// ★★**画面の地色を知っている場所はここだけ**(2026-08-17)。
//
// 「背景がキーボードの手前で途切れる」「全タブの下端で途切れる」の原因は2つ。
//
//  1. `<meta name="theme-color">` が固定されていた。ホーム画面へ追加した PWA
//     では、**iOS が自分で塗る領域**(キーボードの手前の帯・画面のいちばん下・
//     セーフエリア)にこの色を使う。だから地色と合っていないと、そこだけ
//     別の色の帯として見える。
//  2. `html` の背景色を複数箇所が書いていた。どちらが最後に書いたかで色が
//     変わり、閉じたあとに戻らないことがあった。
//
// なので **html の背景色と theme-color を必ずセットで、1つの窓口から**書く。
//
// ★★★**「後勝ち」をやめた**(2026-08-19・第26巡)。
//
// 以前は「最後に積んだ層が勝つ」だった。ところが**積む順は重なり順とは無関係**
// なので、こうなっていた:
//
//     stack = [アプリ(BD_GREY), 入力画面(LIFT)]
//       → アプリ側の地色が変わる(AppBackdrop の effect が積み直す)
//     stack = [入力画面(LIFT), アプリ(JOURNAL_BG)]   ← アプリが勝ってしまう
//
// **画面のいちばん上に何が出ていようと、あとから積んだ方が地色を持っていく。**
// 「画面の一番下だけ背景が適応されない」が何度も再発したのはこの構造のせい。
// いまは**層に高さ(level)を持たせ、いちばん高い層が勝つ**。同じ高さなら
// 後から積んだ方。アプリ側がいつ積み直しても、オーバーレイの地色は奪えない。
//
// ★★新しく全画面の面を作るときは、必ず `pushGround(色, "overlay")` を呼ぶこと。
//   呼び忘れると、また「下端に別の色の帯」が出る。
//   **地色を塗る人をこれ以上増やさないこと。**増やすなら必ずこの関数を通す。

/** 層の高さ。オーバーレイはアプリより必ず上。 */
export type GroundLevel = "app" | "overlay";
const RANK: Record<GroundLevel, number> = { app: 0, overlay: 1 };

/** 地色が動く時間。★`.app-track`(列の横スライド)と**必ず同じ**にすること。 */
export const GROUND_MS = 380;
export const GROUND_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

interface Layer { id: number; color: string; level: GroundLevel }

let stack: Layer[] = [];
let seq = 0;
let themeTimer = 0;
/** 勝っている色を受け取る人たち(帆布 = AppBackdrop)。 */
const watchers = new Set<(color: string) => void>();

/** いま勝っている色。いちばん高い層の、その中で最後に積んだもの。 */
function top(): string {
  let best: Layer | null = null;
  for (const l of stack) if (!best || RANK[l.level] >= RANK[best.level]) best = l;
  return best ? best.color : "";
}

function apply() {
  if (typeof document === "undefined") return;
  const color = top();
  const root = document.documentElement;
  // ★列と同じ時間・同じ曲線で移す(2026-08-19・第26巡)。以前は html が即座に、
  //   帆布が 420ms で変わっていたので、**画面の一番下だけ先に切り替わって**
  //   いた(実機で報告)。
  root.style.transition = `background-color ${GROUND_MS}ms ${GROUND_EASE}`;
  root.style.backgroundColor = color;

  // ★★**帆布も同じ瞬間に同じ色を受け取る**(2026-08-19・第27巡)。
  //   以前は帆布(zIndex -1)だけが `groundOf(appId)` を直に見ていたので、
  //   入力画面が開いているあいだ **html は暗いのに帆布はアプリの明るい色**
  //   という状態になっていた。帆布は html の上にあるから、html の色は
  //   **帆布の外側 — 画面のいちばん下 — にしか出られない**。
  //   「一番下だけ背景が適応されない」の残り半分がこれ。
  for (const w of watchers) w(color);

  // theme-color は CSS で補間できない。**滑りの折り返しで1回だけ差し替える** —
  // 即座に書くと「下だけ先に変わる」、終わりに書くと「下だけ遅れて変わる」。
  // 折り返しなら、ずれは最大でも半分で済む。
  window.clearTimeout(themeTimer);
  const write = () => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    if (color) meta.content = color;
  };
  // 最初の1回(まだ何も塗っていない)は待たずに書く。
  if (!stack.length || seq <= 1) write();
  else themeTimer = window.setTimeout(write, GROUND_MS / 2);
}

/**
 * 勝っている色を受け取る。**返り値を呼ぶと購読をやめる**。
 * ★全画面に色を塗る面(帆布)は、自分でアプリの色を決めずに必ずここから貰うこと。
 */
export function onGround(cb: (color: string) => void): () => void {
  watchers.add(cb);
  const now = top();
  if (now) cb(now);
  return () => { watchers.delete(cb); };
}

/**
 * 地色を積む。**返り値を呼ぶと元へ戻る**(useEffect の後始末で必ず呼ぶこと)。
 * `level` は重なり順 — 全画面のオーバーレイは必ず `"overlay"`。
 */
export function pushGround(color: string, level: GroundLevel = "app"): () => void {
  const layer = { id: ++seq, color, level };
  stack.push(layer);
  apply();
  return () => {
    stack = stack.filter((l) => l.id !== layer.id);
    apply();
  };
}
