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
//   トゲトゲ・角丸四角・いびつな塊」。★★第131巡に案①（円とカプセルの文法）で
//   六角形とトゲトゲを外した（下の表）。
//
// | ドメイン | 鋏痕の性格 | 札の外形 | 参照のどれ |
// |---|---|---|---|
// | バショ place | 弧（arch） | **四つ葉** … 輪郭が全部円弧 | GenChess / Say What You See |
// | タイケン experience | 斜め（trapezoid） | **アーチ** … 半円と直線（第131巡。前は六角形） | ― |
// | ジョウホウ info | 直角（square） | **波打つ四角** … 角は立ち縁だけ揺れる | Gen AI in Chrome |
// | モノ thing | 切れ込み（fork） | **三つ葉** … 円3つ（第131巡。前はトゲトゲ） | ― |
//
// ★★★**第131巡に「円とカプセルの文法」へ揃えた**（ユーザー承認「**案1で進めて**」）。
//   部品は**単位円（タスクの段の高さを半径とする円）と直線だけ**。山では提案の直径が
//   4 段なので、箱の 0.25 ＝ 1 段。**円から組めない六角形（直線の多角形）と
//   トゲトゲ（ロゼット）をやめた**。未読の数のトゲトゲも同じ巡に円になった。
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

export type CardShape = "clover" | "arch" | "wave" | "trefoil";

/** ★★★**手で書かない表**。券の鋏痕の性格と1対1で対応させる。 */
const SHAPE_BY_PUNCH: Record<PunchShape, CardShape> = {
  arch: "clover",
  trapezoid: "arch",
  square: "wave",
  fork: "trefoil",
};

export const CARD_SHAPES: CardShape[] = ["clover", "arch", "wave", "trefoil"];

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
/**
 * ★★★**アーチの下の角の半径**（0〜1 の器の目盛り）。**0.25 ＝ 山で 1 段**（提案の
 * 直径が 4 段なので）。上は**器の幅いっぱいの半円**（半径 0.5 ＝ 2 段）。
 * ★★★**第123〜130巡の正六角形（`HEX_IN`/`HEX_H`/`HEX_R`）は第131巡に削除した**
 *   ―― 円から組めない唯一の直線の多角形だった。★目盛りの外（形の座標系）。
 */
const ARCH_FOOT = 0.25;
/** 円弧を何本の直線に割るか（半円ぶん。四分円はその半分）。 */
const ARC_SEG = 72;

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
 * ★★★**半径 1.0s**（第131巡に 0.95s から。案①）。正規化後の曲率 `r / (2(s+r))` ＝
 *   **ちょうど 0.25 ＝ 山で 1 段**（単位円）。
 * ★★★**第123巡までは 0.42s × 16個 で 0.148** ―― **ピルの角（0.5）の 1/3** しか
 *   無く、並べると「小さな刻みの集まり」に見えた（＝ユーザーの「カーブが合っていない」）。
 * ★谷 ÷ 峰は 0.942 → **0.927**（ほとんど変わらない＝性格は保つ）。
 */
const SCALLOP_R = SCALLOP_S;
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
/**
 * ★★★**三つ葉 … 円3つを互いに重ねる**（第131巡。トゲトゲのロゼットの代わり）。
 * ★重なりの比は**四つ葉と同じ 1.25**（隣どうしの中心の距離の半分に対して）――
 *   1 だと接して尖る。正規化後の曲率は四つ葉と同じ **0.278 ＝ 山で 1.1 段**。
 */
const TREFOIL_D = 0.2;
const TREFOIL_R = TREFOIL_D * (Math.sqrt(3) / 2) * 1.25;

/** 0〜1 の器の中の点。 */
export type Pt = [number, number];

// ★★★**`polar` と `superR`（極座標の正弦波）は第98巡に消した。復活させない。**
//   「超楕円 × cos(Nθ)」で円の並びに似せようとしたのが第94〜97巡で、
//   **角では振幅が √2 倍に伸び、山が辺に揃わない**ので参照のどれにも似なかった。
//   円の並びが要るなら `unionOfCircles` を使う。

/** 円弧を**点の列**へ（`a0` → `a1`。終点は含めない ―― 次の弧の始点と重ねない）。 */
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n: number): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt;
  });
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
 * ★★**形の性格の目盛り（`ARCH_FOOT` など）は触らない** ―― 正規化は最後の一手。
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
const POINTS = new Map<CardShape, Pt[]>();
export function cardShapePoints(shape: CardShape): Pt[] {
  // ★★覚える（第131巡）。点 288 × 円の数を毎フレーム解き直していた（山の塗りと指）。
  let pts = POINTS.get(shape);
  if (!pts) { pts = fitBox(rawShapePoints(shape)); POINTS.set(shape, pts); }
  return pts;
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
    // 斜め … **上は器の幅いっぱいの半円、下は角を単位円で丸めた四角**（第131巡）。
    // ★円と直線だけ（案①）。★点対称ではない ―― `lib/cardMorph.ts` は半径の列を
    //   lerp するだけなので、行き先（角丸四角）が対称なら困らない。
    case "arch": {
      const f = ARCH_FOOT;
      return [
        ...arcPts(0.5, 0.5, 0.5, -Math.PI / 2, 0, ARC_SEG / 2),   // 上の半円（右半分）
        ...arcPts(1 - f, 1 - f, f, 0, Math.PI / 2, ARC_SEG / 4),  // 右下の角
        ...arcPts(f, 1 - f, f, Math.PI / 2, Math.PI, ARC_SEG / 4), // 左下の角
        ...arcPts(0.5, 0.5, 0.5, Math.PI, Math.PI * 1.5, ARC_SEG / 2), // 上の半円（左半分）
      ];
    }
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
    // 切れ込み … **円3つ**（第131巡）。葉と葉のあいだの切れ込みが鋏痕の性格。
    case "trefoil":
    default:
      return unionOfCircles(ring(3, TREFOIL_D, TREFOIL_R));
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
