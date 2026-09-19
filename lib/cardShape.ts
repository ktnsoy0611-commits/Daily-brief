import { PUNCH_BY_DOMAIN, type PunchShape } from "./ticket";
import type { ItemDomain } from "./types";

// ★★★**札の外形（写真を切り抜く形）はここ1つ**（2026-09-13・第94〜95巡）。
//
// ★★★**形の約束はアプリ全体で1つ。** `lib/ticket.ts` が既に
// 「4ドメイン ↔ 4つの形」を持っていて、そこにこう書いてある ――
//   > ★この形は3か所で同じ意味を持つ: 1. 券の縁の切り欠き 2. マップ上のノードの形
//   > 3. ストックの絞り込みアイコン。**どれか1つだけ形を変えると、文字を使わない
//   > 分類の約束が壊れる。**
// **札の外形はその4か所目**（2026-09-13 ユーザー確定「既存の性格を引き継ぐ」）。
// ★★★だから**割り当てを手で書かない。`PUNCH_BY_DOMAIN` から導く。**
//   そうすれば、片方だけ直すことが原理的にできない。
//
// ★★★**形は参照画像（Google Labs）に在るものだけを使う**（第95巡にユーザー指摘
//   「形が写真（＝参照）と違うものばかり」）。第94巡の**ドームと台形は参照に
//   1枚も無かった**ので捨てた。参照の語彙は「波打つ四角・六角形・四つ葉・
//   トゲトゲ・角丸四角・いびつな塊」。
//
// | ドメイン | 鋏痕の性格 | 札の外形 | 参照のどれ |
// |---|---|---|---|
// | バショ place | 弧（arch） | **四つ葉** … 輪郭が全部円弧 | GenChess / Say What You See |
// | タイケン experience | 斜め（trapezoid） | **六角形** … 直線の斜め4本 | Illuminate / GenType |
// | ジョウホウ info | 直角（square） | **波打つ四角** … 角は立ち縁だけ揺れる | Gen AI in Chrome |
// | モノ thing | 切れ込み（fork） | **トゲトゲ** … 尖りのあいだに切れ込み | MusicFX |
//
// ★★**トゲトゲはホームの山の EXPLORE のバッジ**（`zigVerts`。`ZIG_N`＝12）と
//   同じ性格を借りている。どちらも EXPLORE なので、語彙は割れない。
//
// ─────────────────────────────────────────────────────────────
// ★★★**CSS のマスクをやめ、SVG の `clipPath` で切る**（2026-09-13・第95巡）。
//
// ★★★**なぜ替えたか。** 実機（iOS）で写真が**指定した形とはまったく違う形**に
//   切り抜かれた（ユーザー報告 ＋ スクリーンショット）。実測すると、切り抜かれた
//   領域は**器の高さと同じ辺の正方形**で、器の幅（914 デバイス画素）より
//   **254px 狭かった** ―― つまり **`mask-size: 100% 100%` が効かず、SVG が
//   固有の 1:1 の比のまま置かれていた**。
//   ★★プロパティの書き漏らしではない（`maskImage`/`maskSize`/`maskRepeat`/
//     `maskPosition` を `Webkit` 付きと**対で8本**書いてあった）。
//   ★★Chromium でも、Playwright の WebKit でも**再現しない**。実機の WebKit
//     だけが違う ―― だから「Chromium で直るまで調整する」では永久に直らない。
//
// ★★★**`clipPathUnits="objectBoundingBox"` なら画像としての寸法計算が無い。**
//   パスを 0〜1 の器で書くと、**器の比へそのまま伸びる**（`preserveAspectRatio`
//   も、データURIの解析も、マスクの合成も、**全部いなくなる**）。
// ★★**`clipPath` と `WebkitClipPath` は必ず対で書く**（`TimeRange` と同じ作法）。
//   効かない環境では**ひとりでに素の矩形へ戻る**（マスクと同じ振る舞い）。
// ★★★**切るのは写真だけ。札そのものには掛けない** ―― 掛けると `box-shadow` が
//   出なくなる（`design.md` §3-c。第78〜80巡に3巡気づかなかった）。

export type CardShape = "clover" | "hexagon" | "wave" | "starburst";

/** ★★★**手で書かない表**。券の鋏痕の性格と1対1で対応させる。 */
const SHAPE_BY_PUNCH: Record<PunchShape, CardShape> = {
  arch: "clover",
  trapezoid: "hexagon",
  square: "wave",
  fork: "starburst",
};

export const CARD_SHAPES: CardShape[] = ["clover", "hexagon", "wave", "starburst"];

export const cardShapeOf = (domain: ItemDomain): CardShape =>
  SHAPE_BY_PUNCH[PUNCH_BY_DOMAIN[domain]];

// ── 輪郭 ────────────────────────────────────────────────────
// ★ここから下はすべて **0〜1 の器の中の座標**（★目盛りの外＝図形の座標系）。
//   `clipPathUnits="objectBoundingBox"` なので、器の比に合わせて縦横へ伸びる。

// ★★★**形は「円をつないだ形」で作る**（2026-09-13・第98巡）。
//
// ★★★ユーザー指摘「**添付した画像の形はないです。よくみてください。そして円を
//   組み合わせた形でもないし気持ちが悪いです**」。参照（Google Labs）の札を
//   切り出して**半径の profile を測った**ところ、3つとも**円の集まりの外縁**だった ――
//
//   | 参照 | 形 | 実測（谷 ÷ 峰） |
//   |---|---|---|
//   | Google Vids ／ /Code | スカラップ四角 | **0.743**（辺の中点は 0.772・角が峰） |
//   | MusicFX | ロゼット（**12山**） | **0.924**（浅い。円のふちの膨らみ） |
//   | GenChess | クアトレフォイル | **0.717**（角が峰・辺が谷） |
//
// ★★★**第97巡までの `wave` は超楕円 × cos(8θ)** ＝ 極座標の正弦波だった。
//   角では振幅が √2 倍に伸び、**山が辺に揃わない**（1辺あたり2山しかない）。
//   だから参照のどれにも似ず、うねりが不揃いに見えていた。
//   ★★**正弦波で円に似せない。円を置いて、その外縁をなぞる。**

/** 極座標で作る形の分割数（多いほど滑らか。パスの長さと引き換え）。 */
const STEPS = 288;
/** 角の丸みを何本の直線に割るか（`Q` を平らにする）。 */
const ROUND_SEG = 6;
/**
 * ★★★**六角形は「正六角形」**（2026-09-19・第123巡にユーザー指摘
 * 「**特に六角形の図形が縦に引き伸ばされているのを修正して**」）。
 *
 * ★★★**真因は `fitBox` ではなく、形の定義そのものだった** ―― 第95巡から
 *   六角形の頂点は `(0,0.5) (0.22,0) (0.78,0) (1,0.5) (0.78,1) (0.22,1)` で、
 *   **外接箱がちょうど 1×1**。つまり**正方形いっぱいに広げた六角形**を描いていた。
 *   左右が尖った六角形の自然な比は **高さ ÷ 幅 ＝ √3/2 ＝ 0.866** なので、
 *   **縦に 1.155 倍 引き伸ばされていた**（＝報告そのもの）。
 *   ★★他の3つ（四つ葉・波打つ四角・トゲトゲ）は**円の和で上下左右が対称**なので
 *     生の外接箱が最初から正方形。**歪んでいたのは六角形だけ**（実測で確認）。
 * ★★★**上辺の入りは 0.25** ―― 正六角形では上辺の長さが幅のちょうど半分になる。
 *   **選んだ数ではなく、正六角形の定義から出る値。手で振らない。**
 */
const HEX_IN = 0.25;
/** 正六角形の高さ ÷ 幅（＝ √3/2）。 */
const HEX_H = Math.sqrt(3) / 2;
/**
 * 六角形の角に食い込ませる長さ（0〜1 の器の目盛り。二次ベジェの端点までの距離）。
 * ★★★**第124巡に 0.07 → 0.154 へ大きくした**（ユーザー指定「**ピルのカーブに
 *   対して提案の図形のカーブが合っていない。凹凸の数を減らしてカーブを大きく**」）。
 * ★★**曲率の半径は `1.5 × この値`**（内角 120° の対称な二次ベジェの、頂点での解）。
 *   正規化後は `1.5d / (1 − 0.5d)` ＝ **0.250** ―― 他の3つと同じ帯に入る。
 * ★等方（`fitBox` が一様なので歪まない）。★目盛りの外（形の座標系）。
 */
const HEX_R = 0.154;

/** 円1つ（中心は**形の中心が原点**。半径ともに 0〜1 の器の目盛り）。 */
type Circle = { x: number; y: number; r: number };

/**
 * ★★★**円の集まりの「外側の縁」を極座標でなぞる**（＝円の和）。
 * 各 θ で「その向きの光線が交わる、いちばん遠い点」を取る。
 * ★★この置き方ではどの形も**中心から見て星形**（どの向きにも縁が1つ）なので、
 *   極座標で厳密に描ける。**凹みの中へ光線が2度入ることが無い。**
 */
function unionOfCircles(cs: readonly Circle[], steps = STEPS): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const dx = Math.cos(t); const dy = Math.sin(t);
    let far = 0;
    for (const c of cs) {
      // 原点から向き (dx,dy) の光線と円の交点。b は中心への射影、√d2 は半弦。
      const b = c.x * dx + c.y * dy;
      const d2 = c.r * c.r - (c.x * c.x + c.y * c.y - b * b);
      if (d2 <= 0) continue;
      const hit = b + Math.sqrt(d2);
      if (hit > far) far = hit;
    }
    pts.push([0.5 + dx * far, 0.5 + dy * far]);
  }
  return pts;
}

/** 円を N 個、半径 `d` の円周に等間隔で置く（最初の1つは**真上**）。 */
function ring(n: number, d: number, r: number): Circle[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(t) * d, y: Math.sin(t) * d, r };
  });
}

// ── 形ごとの円の置き方（★数はすべて参照の実測から逆算した。目で振っていない） ──

/** スカラップ四角 … 半辺 `s` の正方形の周に円を並べる。
 *  ★★**第124巡に 1辺4個（＝16個）→ 1辺2個（＝四隅＋辺の中点の 8個）**
 *    （カーブを大きくするため。下の `SCALLOP_N`）。
 *  ★**辺の中点は必ず膨らみの峰**（参照の見え方）―― 1辺 2個なら四隅と中点で
 *    ちょうど交互になるので、その性質は保たれる。 */
const SCALLOP_S = 0.27;
/**
 * ★★★**1辺に置く数**（四隅を含む）。**第124巡に 4 → 2**（＝16個 → **8個**）。
 * ★★**円の和の形は、曲率の半径が「円の半径そのもの」**なので、**カーブを
 *   大きくする唯一の道は、数を減らして半径を上げること**。
 */
const SCALLOP_N = 2;
/**
 * ★★★**半径 0.95s**（第124巡）。正規化後の曲率 `r / (2(s+r))` ＝ **0.244**。
 * ★★★**第123巡までは 0.42s × 16個 で 0.148** ―― **ピルの角（0.5）の 1/3** しか
 *   無く、並べると「小さな刻みの集まり」に見えた（＝ユーザーの「カーブが合っていない」）。
 * ★谷 ÷ 峰は 0.942 → **0.927**（ほとんど変わらない＝性格は保つ）。
 */
const SCALLOP_R = SCALLOP_S * 0.95;
/** クアトレフォイル … 四隅の円の中心までの距離。 */
const QUATREFOIL_A = 0.1746;
/**
 * ★★★**半径 1.25a**（第124巡。第123巡までは 1.45a）。
 * ★★正規化後の曲率は `k / (2(1+k))` で、**`k`（＝この係数）だけが効く**
 *   ―― `a` を変えても 1 も動かない。1.45 → **0.296**、1.25 → **0.278**。
 * ★★★**`k > 1` が必須**（1 では四隅の円が接して尖る）。だから四つ葉は
 *   **原理的に 0.25 より下へ行けない** ―― これが4つの形を完全に揃えられない理由。
 * ★谷 ÷ 峰は 0.837 → **0.778**（葉が少し深くなる）。
 */
const QUATREFOIL_R = QUATREFOIL_A * 1.25;
/** ロゼット … 中心の円の半径（＝谷の深さ）と、ふちの膨らみ。 */
const ROSETTE_S = 0.462;
/** ★★★**膨らみの数**。**第124巡に 12 → 5**（カーブを大きくするため）。 */
const ROSETTE_N = 5;
/**
 * ★峰 ＝ 1.082s（実測 0.924 の逆数）は**そのまま**（形の性格）。
 * ★★★**`D = R` に取る**（第124巡）と `R / (2(D+R))` ＝ **0.250** ―― 他と同じ帯。
 *   0.5412 は `(D+R) = 1.0823s` を半分ずつに割った値で、**選んだ数ではなく解**。
 */
const ROSETTE_D = ROSETTE_S * 0.5412;
const ROSETTE_R = ROSETTE_S * 0.5412;

/** 0〜1 の器の中の点。 */
export type Pt = [number, number];

// ★★★**`polar` と `superR`（極座標の正弦波）は第98巡に消した。復活させない。**
//   「超楕円 × cos(Nθ)」で円の並びに似せようとしたのが第94〜97巡で、
//   **角では振幅が √2 倍に伸び、山が辺に揃わない**ので参照のどれにも似なかった。
//   円の並びが要るなら `unionOfCircles` を使う。

/**
 * 角を丸めた多角形を**点の列**へ。★角は二次ベジェを `ROUND_SEG` に割って平らにする
 * （`A` も `Q` も `objectBoundingBox` では器の比で歪むし、canvas と分かれる）。
 */
function roundedPoly(corners: readonly Pt[], r: number): Pt[] {
  const n = corners.length;
  const out: Pt[] = [];
  const at = (i: number) => corners[(i + n) % n];
  const to = (a: Pt, b: Pt, d: number): Pt => {
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(d, len / 2) / len;
    return [a[0] + dx * k, a[1] + dy * k];
  };
  for (let i = 0; i < n; i++) {
    const c = at(i);
    const s0 = to(c, at(i - 1), r);
    const s1 = to(c, at(i + 1), r);
    out.push(s0);
    for (let k = 1; k <= ROUND_SEG; k++) {
      const u = k / ROUND_SEG; const v = 1 - u;
      out.push([
        v * v * s0[0] + 2 * v * u * c[0] + u * u * s1[0],
        v * v * s0[1] + 2 * v * u * c[1] + u * u * s1[1],
      ]);
    }
  }
  return out;
}

/**
 * ★★★**点の列の外接箱を 0〜1 へ引き伸ばす**（2026-09-13・第97巡）。
 *
 * ★★★**なぜ要るか。** `clipPathUnits="objectBoundingBox"` は 0〜1 のパスを器の
 *   寸法へ**そのまま掛ける**ので、**パスの外接箱が 0〜1 でないと、形ごとに
 *   見えるベゼルが変わる**。第96巡の実測（器 276・指定ベゼル 32）――
 *   四つ葉 80.5%（ベゼル **58.9**）／六角形 幅 97.2%（左右 **35.9**・上下 32）／
 *   波打つ四角 **107.5%**（器をはみ出して**切れていた**）／トゲトゲ 100%（32）。
 *   ユーザー指摘「図形が縦長」「四辺でばらばら」「ベゼルの太さと合っていない」は
 *   **全部ここ1点から出ていた**。
 * ★★★**倍率は縦横で同じ（＝一様）。長いほうを 1 に合わせて、短いほうは中央へ置く**
 *   （2026-09-19・第123巡）。★★★**両軸を別々に伸ばしてはいけない** ――
 *   **形の比をレイアウトの都合で変えることになる**。いまは六角形だけが正方形でない
 *   （√3/2）ので、別々に伸ばすと**縦に 1.155 倍 引き伸ばされる**
 *   （＝第123巡のユーザー報告）。★★角の丸みも**等方でなくなる**（楕円になる）。
 *   ★★**四つ葉・波打つ四角・トゲトゲは生の外接箱が正方形**なので、一様でも
 *     別々でも**1点も変わらない**（実測）。**失うものが無い。**
 * ★★**形の性格の目盛り（`HEX_IN` など）は触らない** ―― 正規化は最後の一手。
 *   葉の深さや揺れの数を変えずに、**長いほうの辺を**四辺へ届かせるだけ。
 */
function fitBox(pts: Pt[]): Pt[] {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const k = 1 / Math.max(w, h);
  // ★短いほうの軸は、余ったぶんの半分だけ内へ寄せる（＝中央）。
  const ox = (1 - w * k) / 2;
  const oy = (1 - h * k) / 2;
  return pts.map(([x, y]) => [(x - minX) * k + ox, (y - minY) * k + oy] as Pt);
}

/**
 * ★★★**形の正はこの点の列**（2026-09-13・第96巡）。
 * SVG のパス（札の `clip-path`）も canvas の輪郭（ホームの山）も**ここから導く**。
 * ★前は SVG の文字列しか返さなかったので、canvas から使えなかった。
 * **形を2度書かない**という約束を、技術をまたいでも守るための作り替え。
 * ★★★**返す前に `fitBox` で外接箱を 0〜1 へ揃える**（第97巡）。ここを通るので
 *   SVG の `clip-path` も canvas の輪郭も**同時に**四辺へ届く。
 */
export function cardShapePoints(shape: CardShape): Pt[] {
  return fitBox(rawShapePoints(shape));
}

/** 形そのもの（外接箱は揃っていない）。★呼ぶのは `cardShapePoints` だけ。 */
function rawShapePoints(shape: CardShape): Pt[] {
  switch (shape) {
    // 弧 … **四隅の大きな円4つ**。辺が内側へ弧を描く（券の `arch`／参照 GenChess）。
    case "clover":
      return unionOfCircles([
        { x: -QUATREFOIL_A, y: -QUATREFOIL_A, r: QUATREFOIL_R },
        { x: QUATREFOIL_A, y: -QUATREFOIL_A, r: QUATREFOIL_R },
        { x: QUATREFOIL_A, y: QUATREFOIL_A, r: QUATREFOIL_R },
        { x: -QUATREFOIL_A, y: QUATREFOIL_A, r: QUATREFOIL_R },
      ]);
    // 斜め … 左右が尖り上下が平ら。**直線の斜め4本**が鋏痕の性格（券の `trapezoid`）。
    // ★これだけ円ではない ―― 参照（GenType／Illuminate）が直線の多角形だから。
    case "hexagon":
      return roundedPoly([
        [0, HEX_H / 2], [HEX_IN, 0], [1 - HEX_IN, 0],
        [1, HEX_H / 2], [1 - HEX_IN, HEX_H], [HEX_IN, HEX_H],
      ], HEX_R);
    // 直角 … **四角のふちに同じ円が並ぶ**（券の `square`／参照 Vids・/Code）。
    // ★1辺に `SCALLOP_N` 個（四隅を含む）。隣どうしの中心は `2s / N` 離れる。
    case "wave": {
      const s = SCALLOP_S; const step = (s * 2) / SCALLOP_N;
      const cs: Circle[] = [];
      for (let k = 0; k < SCALLOP_N; k++) {
        const x = -s + step * k; // 上辺（左から）
        cs.push({ x, y: -s, r: SCALLOP_R });
        cs.push({ x: s, y: x, r: SCALLOP_R });   // 右辺（上から）
        cs.push({ x: -x, y: s, r: SCALLOP_R });  // 下辺（右から）
        cs.push({ x: -s, y: -x, r: SCALLOP_R }); // 左辺（下から）
      }
      return unionOfCircles(cs);
    }
    // 切れ込み … **円のふちに膨らみ `ROSETTE_N` 個**（券の `fork`／参照 MusicFX）。
    // ★中心の円が谷を作る。**尖った星にしない** ―― 参照の谷は 0.924 と浅い。
    case "starburst":
    default:
      return unionOfCircles([
        { x: 0, y: 0, r: ROSETTE_S },
        ...ring(ROSETTE_N, ROSETTE_D, ROSETTE_R),
      ]);
  }
}

/** 0〜1 の器の中の SVG のパス。★`clipPathUnits="objectBoundingBox"` がそのまま読む。 */
export function cardShapePath(shape: CardShape): string {
  const pts = cardShapePoints(shape);
  return `M${pts.map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join("L")}Z`;
}

/**
 * ★canvas に**中心が原点・外接箱が `size` 四方**の輪郭を引く（塗りも線も呼ぶ側）。
 * ★★**必ず正方形で渡すこと** ―― 横長の箱に入れると、札で潰れていたのと
 *   同じことが山でも起きる（山の提案は半径で作るので最初から正方形）。
 */
export function traceCardShape(
  ctx: CanvasRenderingContext2D, shape: CardShape, size: number,
): void {
  const pts = cardShapePoints(shape);
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const px = (x - 0.5) * size; const py = (y - 0.5) * size;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

/**
 * ★★その形で切り抜くスタイル。**写真の器に当てる**（札には当てない）。
 * `id` は `CardShapeDefs` が描いた `<clipPath>` の id。
 * ★`clipPath` と `WebkitClipPath` は**必ず対で**書く。
 */
export function cardShapeClip(shape: CardShape, prefix: string): React.CSSProperties {
  const url = `url(#${prefix}-${shape})`;
  return { clipPath: url, WebkitClipPath: url } as React.CSSProperties;
}

// ─────────────────────────────────────────────────────────────
// ★★★**「絵がどこまで届くか」と「その点は形の中か」**（2026-09-18・第121巡）。
//
// ★★★**なぜ要るか。** ホームの山の提案は **`p.r`（円の半径）を持ち歩き、絵は
//   `traceCardShape(ctx, shape, p.r * 2)`** で描く。ところが点の列は `fitBox` で
//   **外接箱を 0〜1 に正規化**してあるので、**絵は 2r 四方の正方形いっぱいに広がる**
//   ―― つまり**中心からいちばん遠い点は `p.r` ではない**。
//   実測（`reach`）… 四つ葉 **1.169**／六角形 **1.116**／波打つ四角 **1.292**／
//   トゲトゲ 1.000（★これだけ円に内接するので 1）。
//
//   これを `p.r` のまま使っていた2か所が、第120巡までのバグの正体だった:
//   ★★★**① 塗り直す箱**（`pilePaint.drawBoxOf`）… `p.r + PAINT_PAD`(4) しか
//     消していなかったので、**波打つ四角は四方 13px ぶん古い絵が残った**
//     ―― ユーザー報告「**端っこの部分が一部ずれて表示される**」「**図形が歪んで
//     いる**」は、歪んだ形を描いていたのではなく**前のフレームの拭き残し**。
//   ★★★**② 指の当たり判定**（`Pile.pickAt`）… 円で見ていたので、**出っ張りを
//     押しても掴めず、へこみの何も無い所で掴めた**。
//
// ★★**形を2度書かない**という約束のとおり、どちらも**点の列から導く**。

/** 形ごとの覚え書き（点の列から1度だけ出す）。 */
const REACH = new Map<CardShape, number>();
/**
 * ★**`traceCardShape(ctx, shape, size)` で描いた絵の最大半径 ÷ `size / 2`。**
 * ★塗り直す箱はこれを掛ける。1 より小さくはならない（外接箱が 0〜1 なので）。
 */
export function cardShapeReach(shape: CardShape): number {
  const hit = REACH.get(shape);
  if (hit !== undefined) return hit;
  let far = 0;
  for (const [x, y] of cardShapePoints(shape)) far = Math.max(far, Math.hypot(x - 0.5, y - 0.5));
  const out = far * 2;
  REACH.set(shape, out);
  return out;
}

/**
 * ★**その点は形の中か。** 座標は**中心を原点とし、外接箱の一辺を 1 とした空間**
 * （＝ `traceCardShape(…, size)` で描いたなら `x / size`・`y / size` を渡す）。
 * ★交差数で見る（`fitBox` の点の列は閉じた単純多角形）。
 */
export function inCardShape(shape: CardShape, x: number, y: number): boolean {
  const pts = cardShapePoints(shape);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0] - 0.5; const yi = pts[i][1] - 0.5;
    const xj = pts[j][0] - 0.5; const yj = pts[j][1] - 0.5;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
