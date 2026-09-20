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
/**
 * 加速してから減速する**唯一の形**。CSS の `--ease-exit` と同じ値。
 * ★★★**曲線を増やしたのではない** ―― `app/globals.css` には第26巡から在る4本目で、
 *   JS 側に写しが無かっただけ（`design.md` §4 の表に載っている）。
 * ★★★**始端も終端も速さが 0** ―― だから「**止まっている所から動き出す**」段を
 *   繋ぐのはこれしかない（`twoStage` の2段目）。
 */
export const EASE_EXIT = [0.4, 0, 0.2, 1] as const;

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
 * ★★★**2段階で開く**（2026-09-19・第125巡にユーザー指定／**第126巡に作り直した**）。
 *
 * > 【第125巡】「**最初にふわっとちょっと早く、回転しながら1／3くらい広がって、
 * >   そこで一回ゆっくりに回転しながらほんの少しだけとどまって、そこから一気に
 * >   また広がる。また途中で止まる時もちょっといき過ぎて戻るような慣性を**」
 * > 【第126巡】「**全然優雅な感じがせず、ただガクガクバグのように動いているだけ**」
 *
 * ★★★**「ガクガク」の真因は2つ**（どちらも第125巡の作りが持っていた）――
 *   ① **行き過ぎて戻る慣性が、回転を逆へ回していた**。`lib/cardMorph.ts` は
 *      **進み `p` から測る向きを回す**ので、`p` が一度でも減ると**形が逆回転する**
 *      （実測 … 74° → 66° → 180°）。「バグのよう」はこれ。
 *      → **`p` は単調にした**（行き過ぎも戻りも無い）。
 *   ② **繋ぎ目で速さが飛んでいた**。1段目は `EASE_SETTLE`（終端の速さ 0）、
 *      とどまりは等速（速さ一定）、2段目も `EASE_SETTLE`（**始端の速さが最大**）。
 *      **止まっていたものが最高速で動き出す**ので、そこで必ずガクッとなる。
 *      → **繋ぎ目の両側で速さを 0 に揃える。**
 *
 * ★★★**やり方** … 2段目を **`EASE_EXIT`（加速してから減速する唯一の形）**にする。
 *   `EASE_EXIT`（＝ CSS の `--ease-exit`）は**始端も終端も速さが 0**なので、
 *   1段目の終わり（`EASE_SETTLE` の終端＝速さ 0）と**滑らかに繋がる**。
 *   ★1段目は `EASE_SETTLE` のまま ―― `design.md` の「**初速を高く**」を守る
 *   （押した瞬間に動き出す）。その**長い尾**が、そのまま「ゆっくりとどまる」になる。
 *
 * ★★★**曲線も時間も増やしていない** ―― 曲線は既存の2本（`EASE_SETTLE` と
 *   `EASE_EXIT`）、時間は `T_IN` 1つ。**その中の割り振りだけ**がここに在る。
 * ★★**使うのは canvas と毎フレーム組み直すパスだけ**（`easeAt` と同じ約束）。
 */
/** 1段目で広がる量（＝「1／3くらい」）。★目盛りの外（振り付け）。 */
const STAGE_P = 1 / 3;
/**
 * 1段目に使う時間の割合。★目盛りの外（振り付け）。
 * ★★**`EASE_SETTLE` は前のめり**（区間の 20% で 75% 進む）なので、ここを長く取ると
 *   **残りがそのまま「ゆっくりとどまる」**になる。**別に「とどまる区間」を作らない。**
 */
const STAGE_A = 0.46;

export function twoStage(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  // ① ふわっと、ちょっと早く広がって、そのまま長い尾でゆっくりになる。
  if (t < STAGE_A) return STAGE_P * easeAt(EASE_SETTLE, t / STAGE_A);
  // ② そこから一気に。★**始端の速さが 0 の曲線**なので、①の終わりと継ぎ目が無い。
  const u = (t - STAGE_A) / (1 - STAGE_A);
  return STAGE_P + (1 - STAGE_P) * easeAt(EASE_EXIT, u);
}

/**
 * ★**JS のタイマーが CSS の動きと噛み合うため**のミリ秒版(第33巡)。
 * 「閉じ終わってからアンマウントする」ような待ちは、CSS の時間を変えたら
 * 必ず一緒に変わらないと**閉じ切る前に消える**。数字を書き写さず、ここを見る。
 */
export const ms = (seconds: number) => Math.round(seconds * 1000);

/**
 * ★★★**曲線を JS で引く**（2026-09-18・第120巡）。★**数字は増えない** ――
 * 上の `EASE_*` をそのまま読むだけ。
 *
 * ★★**要るのは「CSS に任せられない絵」だけ** ―― canvas や、毎フレーム
 *   パスを組み直す遷移（`lib/cardMorph.ts`）。**CSS の transition では
 *   ここを呼ばない**（あちらは `var(--ease-*)` を書く）。
 * ★★★**曲線を写経しないこと** ―― 値を別の場所に書くと、`app/globals.css` の
 *   `:root` と3か所目ができる。**引数で `EASE_SETTLE` を渡す。**
 * ★ニュートン法。x(t) は単調なので4回で 1e-6 に入る（実測 最大誤差 2.4e-7）。
 */
export function easeAt(curve: readonly number[], x: number): number {
  const t = Math.max(0, Math.min(1, x));
  const [x1, y1, x2, y2] = curve;
  const cx = 3 * x1; const bx = 3 * (x2 - x1) - cx; const ax = 1 - cx - bx;
  const cy = 3 * y1; const by = 3 * (y2 - y1) - cy; const ay = 1 - cy - by;
  const fx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  let u = t;
  for (let i = 0; i < 5; i++) {
    const e = fx(u) - t;
    const d = dx(u);
    if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break;
    u = Math.max(0, Math.min(1, u - e / d));
  }
  return ((ay * u + by) * u + cy) * u;
}

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

/**
 * 円が広がる中心(＝閉じるときに吸い込まれる先)。
 *
 * ★★★**行き先はいつでも右下の「作る」の丸**(`[data-create-anchor]`)
 * (2026-08-24にユーザー指定「毎回右下のアイコンにアニメーションして戻っていく
 * ように」、2026-08-25・第62巡に「**必ず**右下のアイコンに戻るように」で徹底)。
 *
 * ★★第61巡まではここに `setSurfaceOrigin` で控えた矩形を**溜め続けて**いて、
 * 一度も消えなかった。輪(`CreateMenu`)の TASK は**丸から扇状に開いた先**に居るので、
 * そこが帰り先として焼き付き、以後は図形をたたいて開いたときも**そこへ帰って**
 * いた(第62巡のユーザー指摘)。**控えを持たない**のが直し方 ―
 * 出どころは1つ(画面に見えている丸)しかない。
 *
 * ★以前は「画面下端の中央」を終点にしていたが、そこには**何も無い**。
 * 吸い込みは円の半径をボタンの大きさまで縮めて終わる(0 にはしない)ので、
 * 帰り先に黒い丸が無いと **入力画面の地の色をした 54px の円がぽつんと
 * 残って見えた**(実機で報告)。丸は「黒いボタンの上に重なって消える」ことで
 * 初めて消えて見える。**行き先は必ず実在する丸にすること。**
 */
export function surfaceOrigin(): SurfaceOrigin {
  const r = createAnchorRect();
  if (r) return { x: r.left, y: r.top, w: r.width, h: r.height };
  // どうしても見つからないときだけ、右下のおおよその場所。
  const w = typeof window === "undefined" ? 390 : window.innerWidth;
  const h = typeof window === "undefined" ? 844 : window.innerHeight;
  return { x: w - 78, y: h - 96, w: 52, h: 52 };
}
