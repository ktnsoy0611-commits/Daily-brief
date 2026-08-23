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

/** ＋を押した瞬間に、その丸の場所を控える。 */
export function setSurfaceOrigin(el: Element | null): void {
  if (!el) { origin = null; return; }
  const r = el.getBoundingClientRect();
  origin = { x: r.left, y: r.top, w: r.width, h: r.height };
}

/**
 * 円が広がる中心(＝閉じるときに吸い込まれる先)。★控えが無いとき
 * (＋以外から開いた・別のタブに居る)は **画面下端の中央**を終点にする —
 * どこへ帰るか分からないより、一貫した場所へ吸い込まれる方が落ち着いて見える。
 */
export function surfaceOrigin(): SurfaceOrigin {
  if (origin) return origin;
  const w = typeof window === "undefined" ? 390 : window.innerWidth;
  const h = typeof window === "undefined" ? 844 : window.innerHeight;
  return { x: w / 2 - 27, y: h - 96, w: 54, h: 54 };
}
