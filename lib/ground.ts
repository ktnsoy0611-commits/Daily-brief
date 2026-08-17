// ★★**画面の地色を知っている場所はここだけ**(2026-08-17)。
//
// 「背景がキーボードの手前で途切れる」「全タブの下端で途切れる」の原因は2つ。
//
//  1. `<meta name="theme-color">` が **#1A1A18 に固定**されていた。
//     ホーム画面へ追加した PWA では、**iOS が自分で塗る領域**
//     (キーボードの手前の帯・画面のいちばん下・セーフエリア)にこの色を使う。
//     だから地色と合っていないと、そこだけ暗いグレーの帯として見える。
//  2. `html` の背景色を **2箇所が書いていた**(AppBackdrop と TaskComposer)。
//     どちらが最後に書いたかで色が変わり、閉じたあとに戻らないことがあった。
//
// なので **html の背景色と theme-color を必ずセットで、1つの窓口から**書く。
// 積み重ね式にして、いちばん上に積んだ色が勝つ(全画面のオーバーレイが
// 開いている間はその色、閉じたらアプリの地色へ自然に戻る)。
//
// ★新しく全画面の面を作るときは、必ず pushGround を呼ぶこと。
// 呼び忘れると、また「下端に別の色の帯」が出る。

interface Layer { id: number; color: string }

let stack: Layer[] = [];
let seq = 0;

function apply() {
  if (typeof document === "undefined") return;
  const color = stack.length ? stack[stack.length - 1].color : "";
  document.documentElement.style.backgroundColor = color;
  // theme-color は無ければ作る(layout.tsx の metadata が出したものを使い回す)。
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  if (color) meta.content = color;
}

/**
 * 地色を積む。**返り値を呼ぶと元へ戻る**(useEffect の後始末で必ず呼ぶこと)。
 * 同じ層の色を変えたいときは、いったん戻してから積み直す。
 */
export function pushGround(color: string): () => void {
  const layer = { id: ++seq, color };
  stack.push(layer);
  apply();
  return () => {
    stack = stack.filter((l) => l.id !== layer.id);
    apply();
  };
}
