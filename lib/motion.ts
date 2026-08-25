// ★★モーションの語彙(JS 側)。CSS 側は `app/globals.css` の :root と対。
// **数字を増やさないこと** — 曲線は4本、時間は5つだけ。
//
// 考え方(2026-08-19・第26巡にユーザー確定): 初速を高く、終点へ向けて長く
// 滑らかに収束させる**非対称な減速**。対称な ease-in-out は使わない
// (動き出しと止まりに機械的な硬さが出る)。

/** 主役。定位置への吸着を優雅に見せる。CSS の `--ease-settle` と同じ値。 */
export const EASE_SETTLE = [0.16, 1, 0.3, 1] as const;
/** 面が出入りする(iOS のシート)。CSS の `--ease-sheet` と同じ値。 */
export const EASE_SHEET = [0.32, 0.72, 0, 1] as const;

/** 大きな面が開く / 閉じる(秒)。CSS の `--t-in` / `--t-out` と同じ値。 */
export const T_IN = 0.7;
/**
 * 閉じる。★2026-08-23・第33巡にユーザー確定で **0.35 → 0.6**。
 * 第27巡で「きびきび」として 0.6 → 0.35 にした判断を、シネマティックな
 * 手ざわりを優先して**戻した**。開く 0.7 / 閉じる 0.6 の非対称は残る。
 * ★今回いちばん体感の変わる数字。戻すときは `app/globals.css` の
 * `--t-out` と**必ず両方**直すこと。
 */
export const T_OUT = 0.6;
/** 中の要素ひとつ / 時間差。CSS の `--t-item` / `--t-step` と同じ値。 */
export const T_ITEM = 0.42;
export const T_STEP = 0.05;

// ★第52巡に**カメラ専用の語彙 `T_CAM` / `EASE_CAM` を撤去**した。縦のカメラを
//   やめ、GRAVITY の物理モード(ALIGN/TIMELINE)へ作り替えたため、乗り物の
//   ための長い対称カーブは要らなくなった。曲線4本・時間5つに戻る。

/**
 * ★**JS のタイマーが CSS の動きと噛み合うため**のミリ秒版(第33巡)。
 * 「閉じ終わってからアンマウントする」ような待ちは、CSS の時間を変えたら
 * 必ず一緒に変わらないと**閉じ切る前に消える**。数字を書き写さず、ここを見る。
 */
export const ms = (seconds: number) => Math.round(seconds * 1000);

// ★★**共有要素(Framer Motion の `layoutId`)は撤去した**(2026-08-19・第27巡)。
// `SURFACE_ID` / `SURFACE_IN` / `SURFACE_OUT` はもう無い。
//
// 理由 … layout animation は「測った矩形へ合わせる transform」を要素に
// **焼き付ける**。入力画面の器は `place()` が `visualViewport` に合わせて
// 高さを書き換え続けるので、**焼き付いた値がすぐ古くなる**。実機では
//   ・キーボードが出た後、地の面だけが古い矩形のまま取り残される
//     (「キーボードの後ろに何も無い」。アイコンを何度か叩くと直る＝測り直し)
//   ・開き終わりに本物の矩形へ飛ぶ(「最後に背景がパッと出てくる」)
//   ・閉じるときに要素が3つリレーされて「2段階ガクッ、ガクッ」
// が出た。**寸法の持ち主を二重にしない**という約束を、`inset: 0` で器に
// 貼り付けた時点で自分から破っていた。
//
// いまは器を**円で切り抜く**(`clip-path`)。切り抜きは寸法を持たないので、
// 器がどう動いても面と中身は常に器そのもの。要素の受け渡しもゼロ。

/** ★＋ボタンの位置。閉じるときの行き先に使う。 */
export interface SurfaceOrigin { x: number; y: number; w: number; h: number }
let origin: SurfaceOrigin | null = null;

/**
 * ★右下の「作る」の丸(`[data-create-anchor]`)の矩形。**3アプリぶん DOM に居る**ので、
 * **画面の中に見えている**ものを選ぶ。全画面の面の帰り先(`surfaceOrigin`)と、
 * 掴んだときに出る口/ブラックホールの**出どころ**(`DropTargets`)が共有する。
 */
export function createAnchorRect(): DOMRect | null {
  if (typeof document === "undefined") return null;
  const w = window.innerWidth;
  for (const el of Array.from(document.querySelectorAll("[data-create-anchor]"))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.left >= -1 && r.right <= w + 1) return r;
  }
  return null;
}

/** ＋を押した瞬間に、その丸の場所を控える。 */
export function setSurfaceOrigin(el: Element | null): void {
  if (!el) { origin = null; return; }
  const r = el.getBoundingClientRect();
  origin = { x: r.left, y: r.top, w: r.width, h: r.height };
}

/**
 * 円が広がる中心(＝閉じるときに吸い込まれる先)。
 *
 * ★★控えが無いとき(図形を直接たたいて開いたとき)は **右下の「作る」の丸**
 * (`[data-create-anchor]`)へ帰す(2026-08-24にユーザー指定「毎回右下の
 * アイコンにアニメーションして戻っていくように」)。
 *
 * ★以前は「画面下端の中央」を終点にしていたが、そこには**何も無い**。
 * 吸い込みは円の半径をボタンの大きさまで縮めて終わる(0 にはしない)ので、
 * 帰り先に黒い丸が無いと **入力画面の地の色をした 54px の円がぽつんと
 * 残って見えた**(実機で報告)。丸は「黒いボタンの上に重なって消える」ことで
 * 初めて消えて見える。**行き先は必ず実在する丸にすること。**
 */
export function surfaceOrigin(): SurfaceOrigin {
  if (origin) return origin;
  const r = createAnchorRect();
  if (r) return { x: r.left, y: r.top, w: r.width, h: r.height };
  // どうしても見つからないときだけ、右下のおおよその場所。
  const w = typeof window === "undefined" ? 390 : window.innerWidth;
  const h = typeof window === "undefined" ? 844 : window.innerHeight;
  return { x: w - 78, y: h - 96, w: 52, h: 52 };
}
