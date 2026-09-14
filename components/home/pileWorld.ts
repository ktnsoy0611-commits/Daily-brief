import { DISPLAY, INK, JOURNAL_FACE, KIND_DOMAIN, RUST, SHAPE_FACE, TASK_FACE } from "@/lib/constants";
import { cardShapeOf, cardShapePoints, type CardShape } from "@/lib/cardShape";
import { CASSETTE_ASPECT } from "@/lib/cassette";
import { ACCENT_TEST, accentOf } from "@/lib/appAccent";
import { pad } from "@/lib/helpers";
import { bodyInkOn, colorOfKind } from "@/lib/palette";
import { glyphOfKind } from "@/lib/deckStyle";
import { areaOf, massOf, rowsOf, specOf, weightArea } from "@/lib/taskSize";
import { PHYS_GAP, PHYS_VERTS, clampRows, stackOutline } from "@/lib/solid";
import { PILE_INSET, floorYOf, pileWOf } from "@/lib/pileBox";
import {
  WD_FULL, makeWordBody, measureWordPlate, wordFontSize, type WordPlate,
} from "@/lib/wordPlate";

import type { Body, Engine } from "matter-js";
import type { Item, TabId, Task } from "@/lib/types";
import type { Landing } from "@/lib/pullDrag";

// ★★★**山の「世界」**（2026-09-11・第92巡に `components/home/Pile.tsx` から分けた）。
// 物理の値・器の壁・図形の作り方だけがここに居る。**画面と指の扱いは `Pile.tsx`、
// 焼き方は `pilePaint.ts`。**
//
// ★★**物理は既存の GRAVITY と同じ**（重力・摩擦・跳ね・落下の速さ）。値は
//   `components/tabs/GravityTab.tsx` から**そのまま写してある** ―― あちらは
//   画面まるごとを占めるタブで、3つのモード・スワイプ・入力画面を内蔵して
//   いるので、帯の下の器としては使えない（ユーザー確定「gravity とホームは
//   別物。gravity の基本的な構造を使ってホームを作ったあと、task は全く別の
//   UI に変更する」）。★★**片方の値を触ったらもう片方も直すこと。**
//
// ★★**形は3つだけ**（意味づけはしない）:
//   ・**角丸の四角** … タスク。文字が組める唯一の形で、1件が1つ（まとめない）。
//   ・**円** … 提案。★**写真が入るのは円だけ**。
//   ・**トゲトゲの円** … まだ見ていない提案の残り数。数字を中に置き、0 で消える。
// ★★**色は帯から引き継ぐ** ―― 上でその色だったものが、下りても同じ色のまま
//   形だけ変わる（タスク＝タグの色／提案＝そのカードの色）。
// ★大きさ＝**重要度 × 締切の近さ**（既存の `areaOf`。GRAVITY と同じ式）。

type M = typeof import("matter-js");

// ── 物理（★`GravityTab` と同じ値。目盛りの外＝物理の場） ──────────────
export const GRAVITY_Y = 1.4;
/** 一括の倍率の上限（solid 座標 → px）。★引き下ろしの初期値にも使う。 */
export const UNIT = 64;
const MASS_K = 1.6;
const BODY = { restitution: 0.04, friction: 0.55, frictionStatic: 0.9, frictionAir: 0.012 };
const WALL_T = 200;
/** ★左右の壁の最低の長さ（器が低くても図形が抜けない）。★目盛りの外（物理の場）。 */
const WALL_MIN_H = 1200;
/** ★床よりこれだけ下まで行ったら「もう戻れない」＝上から落とし直す。★同上。 */
const LOST_BELOW = 900;
/** ★左右の壁よりこれだけ外に出たら「外へ出た」。★同上。 */
const LOST_SIDE = 120;
/** ★当たり判定の頂点どうしがこれより近ければ1つに畳む（px）。★目盛りの外（物理の場）。 */
const VERT_MIN = 2;
/** 山が器に占める割合。★目盛りの外（詰め込み具合）。
 *  ★★**帯が厚いほど山の取り分が減る**ので、帯の厚み（`BAND_H`）とセットで決める。
 *  ★2026-09-10 に **0.36** ―― 文字の板と未読の図形を予算に数えるようにしたぶん。 */
const FILL = 0.36;
/** ★★**1つの図形が器に対して取ってよい上限**（`GravityTab` の `FIT_W`/`FIT_H` と
 *  同じ考え方）。面積の予算だけだと、重要度の高い1枚が器の半分を覆ってしまう。
 *  ★★★**面積の予算は「横に2つ並ぶ」を前提にしている**ので、幅は半分あたりに
 *  抑える ―― 0.68 では1行に1枚しか載らず、山ではなく**塔**になった（第90巡に実測）。 */
const FIT_W = 0.52;
const FIT_H = 0.28;

/**
 * ★★★**1つの図形が器に対して取ってよい上限で倍率を抑える**（`buildPieces` と同じ式）。
 * 引き下ろしの行き先の大きさにも要る（第102巡）―― まだ山に居ないものは
 * `buildPieces` の `unit` の計算に**入っていない**ので、抑えないと器より大きく出る。
 */
export function fitUnit(unit: number, sw: number, sh: number, bw: number, bh: number): number {
  const usableH = Math.max(120, floorYOf(bh));
  return Math.max(10, Math.min(unit,
    (bw * FIT_W) / Math.max(1, sw), (usableH * FIT_H) / Math.max(1, sh)));
}
/** ★提案の円の大きさ。**いちばん重いタスク × これ**（2026-09-08 に 1 → 1.6）。 */
const OFFER_K = 1.6;
/** ★提案の半径（px）。★引き下ろしの行き先の大きさにも要るので **export**（第102巡）。 */
export const offerRadiusOf = (unit: number): number =>
  Math.max(28, Math.sqrt((weightArea(3) * OFFER_K * unit * unit) / Math.PI));
/** 未読のトゲトゲの円。★12の尖り。★**谷は `ZIG_IN + 0.5 = 0.9`**（浅い刻み）。 */
export const ZIG_N = 12;
const ZIG_IN = 0.4;
/** ★未読の数の図形。**数字を読ませる図形**なので、タスクより大きく取る。 */
const BADGE_R = 44;
/** ★★★落とし方は `GravityTab` と**同じ**（傾き・回り・横の初速）。
 *  ★★★2026-09-09 に**回り慣性の細工を全部やめた**（ユーザー指定「ひっくり返っても
 *  なんでもいいので自然に落としてください」）。`setInertia` で回りにくくすると、
 *  **質量と形から決まる本来の慣性と食い違う** ―― 落ちるあいだは重そうなのに、
 *  ぶつかった瞬間だけ勝手に向きが戻る、という物体に見えない動きになる。 */
const SPAWN_TILT = 0.5;      // 初期の傾き（±0.25 rad ≒ ±14°）
const SPAWN_SPIN = 0.05;     // 初期の回り
const SPAWN_VX = 1.2;        // 横の初速
/** ★★★**山の器（左右の内寸と床）は `lib/pileBox.ts`**（第91巡）。
 *  ★★**左右は対称**（第102巡に戻した。理由は `lib/pileBox.ts` の頭）。 */
const INSET = PILE_INSET;
/**
 * ★★★**落とす間隔は「時間」で取る**（2026-09-09。それまでは「高さ」で取っていた）。
 * 高さで取ると**山が大きいほど出どころが空の彼方へ行く** ―― 実測（器 573px）…
 * 9個で最上段が **-1571px ＝ 器の 2.7 枚ぶん上**。着地が叩きつけになった。
 */
export const DROP_EVERY_MS = 60;
/**
 * 出どころの高さ＝**自分の背丈の半分 ＋ `DROP_ABOVE` ＋ 0〜`DROP_SCATTER`**。
 * ★★★**高さをばらす**（2026-09-11）。等間隔に1つずつ落とすと、どれも同じ速さで
 * 同じ距離を落ちるので、**一列に並んで順番に降りてくる**（コンベアに見えた）。
 */
const DROP_ABOVE = 24;
const DROP_SCATTER = 200;
/** 板の字を組む幅（山の**内寸**に対する割合）。★GRAVITY は 0.66、ホームは大きめ。 */
const WORD_W = 0.84;
/**
 * ★★★**ホームの日付・曜日の大きさの上限**。
 *
 * ★★★**`SWISS_XL`(72) を下げてはいけない** ―― あれは TIMELINE の巨大な曜日と
 *   **共有**なので、下げると TASK 側も縮む。**ホームだけの上限をここに置く**
 *   （いまはたまたま同じ値だが、**別の摘み**。片方だけ動かせるように残す）。
 * ★★塗りの箱（`WEDNESDAY`・WebKit 390 幅）の移り変わり …
 *   第99巡 300.7×52（Archivo を横 63% に潰していた）→ 第100巡 192.7×44（49）→
 *   第101巡 240×54（61）→ **いま 283×64（72）**。
 *   ★第100巡に「縦が 0.85 倍」を狙って 49 にしたら**横が 0.64 倍まで縮み**、
 *   2度「小さすぎる」と差し戻された。**縦だけを見て決めないこと。**
 */
const PILE_WORD_MAX = 72;

/**
 * ★★★**未読の数のトゲトゲの輪郭（絵だけ）**（2026-09-09）。
 * ★★**物理はこれではない** ―― `Bodies.polygon(ZIG_N, BADGE_R)` の**凸の12角形**
 * （`poly-decomp` が無いので凹んだ形を体にできない。下の `badge` の注意書き）。
 * 当たり判定はさらに別で、**半径の円**（`Pile.tsx`）。**3つは別物。**
 * 前は絵がトゲトゲ・物理が**まん丸**で、①掴もうとしても当たり判定とずれる
 * ②トゲが床に引っかからず**玉のように滑る**、の2つが起きていた。
 */
export function zigVerts(r: number): { x: number; y: number }[] {
  return Array.from({ length: ZIG_N * 2 }, (_, i) => {
    const a = (i / (ZIG_N * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = r * (i % 2 === 0 ? 1 : ZIG_IN + 0.5);
    return { x: Math.cos(a) * rr, y: Math.sin(a) * rr };
  });
}

/**
 * ★★★**絵と同じ輪郭で体を作り、`PHYS_GAP` だけ外側へ出す**（2026-09-13・第101巡に
 * ユーザー指定「**各図形と文字の当たり判定がおかしい**。図形も**表示されている
 * 部分**に当たり判定を。その当たり判定は**1ピクセルだけ外側にオフセット**し、
 * **図形同士が隣り合った時にもそれぞれの形がはっきり分かる**ように」）。
 *
 * ★★★**第100巡までホームの山だけ体が「矩形」だった** ―― GRAVITY と DRIFT は
 *   第99巡から `stackOutline` を使っているのに、山は `Bodies.rectangle` のまま。
 *   ピルの丸い端のぶん**絵より広い箱**で当たるので、隣り合うと**離れて見え**、
 *   角では**重なって見えた**。
 * ★★**頂点は原点へ揃えてから渡す** ―― `fromVertices` は**重心**を (x,y) に置くが、
 *   絵は `body.position` を**箱の中心**として描く。間引きで重心がわずかに
 *   ずれるので、渡す前に引いておく（ずれを持ち回らない）。
 * ★★**くびれ・切れ込みは凸包に潰れる**（`poly-decomp` が無い）。**それでよい**
 *   ―― GRAVITY で確定済みの判断で、山として引っ掛からないほうが正しい。
 */
function bodyFromOutline(
  m: M, pts: { x: number; y: number }[], w: number, h: number, opts: object,
): Body {
  // ★★★**光線は「正規化した空間」で飛ばし、そのあと w/h を掛ける**
  //   （2026-09-16・第108巡）。
  //
  // ★★★**px の空間で等角に飛ばすと、横長の形は縁の点が足りなくなる** ――
  //   3:1 のピルだと 12本のうち大半が**長い上下の辺**に当たり（そこは直線なので
  //   凸包が捨てる）、**肝心の丸い端に 1〜2点しか残らない**。
  //   実測（180×60 の1段）… 頂点が **6個**まで潰れ、**体は絵より 10% 小さかった**
  //   （＝第101巡の「1ピクセルだけ外側」の約束が破れている）。端が1枚の平らな面に
  //   なるので、**角が面に乗る置き方**＝ゆらゆら揺れ続ける接触ができる。
  // ★★**正規化の空間ではどの形もほぼ円**なので、光線は縁を均等に拾う。
  //   実測（9形）… 体÷絵 **0.90〜1.02 → 0.96〜1.02**、180×60 の頂点 **6 → 16**。
  // ★★**大きさに依らなくなる**のも効く ―― `VERT_MIN` は px の閾値なので、
  //   px の空間だと**同じ形でも大きさで頂点の数が変わっていた**（実測 … 同じ1段の
  //   ピルが 180×60 で 6個、130×34 で 16個）。正規化すれば**形だけで決まる**。
  // ★★**左右の対称は保たれる**（縦横に拡大するだけ）ので、**重心と外接箱の中心は
  //   一致したまま**（実測 9形とも ずれ 0.0000px）。`pilePaint.drawPile` は絵の
  //   中心を `body.position` に描くので、ここがずれると絵と体が食い違う。
  //   ★参考 … `GravityTab` の「順番どおりの間引き」をそのまま持ってくると、
  //     **重心が最大 2.87px ずれる**（あちらは `ox/oy` を別に持ち回っている）。
  //     **借りないのが正しい。**
  /** 正規化の物差し（px の `VERT_MIN` がここでは「1%」の意味になる）。 */
  const REF = 100;
  const N = pts.map((q) => ({ x: q.x * REF, y: q.y * REF }));
  const nx = N.map((q) => q.x); const ny = N.map((q) => q.y);
  const cx = (Math.min(...nx) + Math.max(...nx)) / 2;
  const cy = (Math.min(...ny) + Math.max(...ny)) / 2;
  const C = radialVerts(N.map((q) => ({ x: q.x - cx, y: q.y - cy })), PHYS_VERTS)
    .map((q) => ({ x: (q.x / REF) * w, y: (q.y / REF) * h }));
  const body = m.Bodies.fromVertices(0, 0, [C], opts);
  if (w > 1 && h > 1) {
    m.Body.scale(body, 1 + (PHYS_GAP * 2) / w, 1 + (PHYS_GAP * 2) / h);
  }
  return body;
}

/**
 * ★★★**原点から角 `th` の光線と、閉じた輪郭との「いちばん遠い」交点**。
 * ★輪郭は原点について星形（どの向きにも縁が1つ）なので、これで必ず縁が取れる。
 */
function rayHit(C: { x: number; y: number }[], th: number): { x: number; y: number } | null {
  const dx = Math.cos(th); const dy = Math.sin(th);
  let best = -1;
  for (let i = 0; i < C.length; i++) {
    const a = C[i]; const b = C[(i + 1) % C.length];
    const ex = b.x - a.x; const ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (a.x * ey - a.y * ex) / den;
    const u = (a.x * dy - a.y * dx) / den;
    if (t >= 0 && u >= -1e-9 && u <= 1 + 1e-9 && t > best) best = t;
  }
  return best < 0 ? null : { x: dx * best, y: dy * best };
}

/**
 * ★★★**当たり判定の多角形は「等角に測り直す」**（2026-09-14・第105巡）。
 *
 * ★★★**第104巡の「添字で間引いて左右へ折り返す」は重すぎた** ―― 折り返した点は
 *   元の点と重ならないので**細かい辺が大量に生まれ**、SAT の費用
 *   （＝**軸の本数 × 頂点数**）が**1段のピルで 16倍**になった。
 *   **接触の対が一気に増える着地の瞬間**に効いて、フレームが落ちた
 *   （ユーザー報告「図形が地面にぶつかった時フレームレートが急に低下する」）。
 *
 * → **外接箱の中心から `n` 本の光線を等角に飛ばし、交点を頂点にする**
 *   （`lib/cardShape.ts` と同じ極座標の作法）。
 *   ★★**`n` が偶数なら左右の対称性は式が保証する** ―― 角 `θ` の相手が必ず
 *     `π − θ` に居るので、**折り返して倍にする必要が無い**。
 *     対称なら**重心と外接箱の中心が一致する**（`fromVertices` は重心を
 *     `body.position` に置き、絵は外接箱の中心に描く。ここがずれると絵と体が食い違う）。
 *   ★★★**輪郭のいちばん外の点は別に足す** ―― **2段の積みは真ん中がくびれ**なので、
 *     角 0 の光線は**いちばん広い点を通らない**（実測で幅が 0.93 倍になった）。
 *     外の点も左右対称な集合なので、足しても対称は崩れない。
 *
 * ★実測（費用＝軸×頂点。第103巡 → 第104巡 → いま）… 1段 ar3 で 66 → 288 → **18**、
 *   2段 ar1.5 で 81 → 280 → **72**、3段 ar1 で 64 → 176 → **50**（6件）。
 *   ★**第104巡の 2.2〜16.0 倍軽い。**
 * ★★**体÷絵は6件とも縦横 1.0000、重心のずれは 6件とも 0.0000px**
 *   （第103巡は絵より 0.98 倍しか無く、重心が最大 1.76px ずれていた）。
 */
function radialVerts(C: { x: number; y: number }[], n: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < n; k++) {
    const q = rayHit(C, (Math.PI * 2 * k) / n);
    if (q) out.push(q);
  }
  const mx = Math.max(...C.map((q) => Math.abs(q.x)));
  const my = Math.max(...C.map((q) => Math.abs(q.y)));
  for (const q of C) {
    if (Math.abs(Math.abs(q.x) - mx) < 1e-6 || Math.abs(Math.abs(q.y) - my) < 1e-6) out.push(q);
  }
  // ★★★**必ず角度の順に並べてから渡す**（2026-09-14・第105巡）。
  //   ★★★**並べ忘れると多角形が自己交差し、SAT が「当たっていない」と答える**
  //     ―― 実測で、小さい図形1つが**床をすり抜けて落ち続け、衝突の対が 0 のまま**
  //     だった（矩形の体に替えると 10個全部が眠った）。**ここが今回いちばん怖い罠。**
  //   ★`Bodies.fromVertices` は凸なら `clockwiseSort`、凹なら凸包を取る ―― どちらも
  //     並べ直してくれる**はず**だが、**交差した列は「凸」と誤判定され得る**ので、
  //     **渡す前にこちらで並べる**。
  // ★★**近すぎる点は捨てる**（当たり判定の費用は**軸の本数 × 頂点数**。同じ所に
  //   2点あると、辺が1本増えるだけで形は変わらない）。
  out.sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
  const keep: { x: number; y: number }[] = [];
  for (const q of out) {
    const last = keep[keep.length - 1];
    if (!last || Math.hypot(q.x - last.x, q.y - last.y) > VERT_MIN) keep.push(q);
  }
  if (keep.length > 2 && Math.hypot(keep[0].x - keep[keep.length - 1].x,
    keep[0].y - keep[keep.length - 1].y) <= VERT_MIN) keep.pop();
  return keep.length >= 3 ? keep : out;
}

const frac = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (Math.imul(h, 2654435761) >>> 0) / 4294967296;
};

/** 湧く x（器の内寸のどこへ落とすか）。★`buildPieces` と `respawn` が同じ式を読む。 */
const spawnXOf = (w: number, bw: number, r1: number): number => {
  const half = bw / 2;
  const lo = INSET + half + 4;
  const hi = Math.max(lo, w - INSET - half - 4);
  return Math.min(hi, Math.max(lo, INSET + pileWOf(w) * (0.08 + r1 * 0.84)));
};

/**
 * ★★★**器の上から落とす**（位置・傾き・初速）。**式はここ1つ**（2026-09-14・第103巡）
 * ―― `buildPieces` の最初の落下と、**器の外へ出た図形を拾い直す番人**
 * （`components/home/Pile.tsx`）が**同じ落ち方**をする。2度書くと片方だけ直る。
 * ★`bh` は**絵の高さ**（体の外接箱ではない）。渡されなければ外接箱から取る。
 */
export function respawn(m: M, body: Body, w: number, seed: string, bh?: number): void {
  const r1 = frac(seed); const r2 = frac(`${seed}y`); const r3 = frac(`${seed}a`);
  const bw = body.bounds.max.x - body.bounds.min.x;
  const up = (bh ?? body.bounds.max.y - body.bounds.min.y) / 2 + DROP_ABOVE + r2 * DROP_SCATTER;
  m.Body.setPosition(body, { x: spawnXOf(w, bw, r1), y: -up });
  m.Body.setAngle(body, (r3 - 0.5) * SPAWN_TILT);
  // ★★**回りは形の大小で加減しない**（2026-09-09）。大きさで割ると、小さい
  //   ものだけ空中で止まって見える。同じ初速を与えて、あとは形に任せる。
  m.Body.setAngularVelocity(body, (r3 - 0.5) * SPAWN_SPIN);
  m.Body.setVelocity(body, { x: (r1 - 0.5) * SPAWN_VX, y: 0 });
  m.Sleeping.set(body, false);
}

export interface Piece {
  id: string;
  body: Body;
  kind: "task" | "offer" | "badge" | "word" | "cassette";
  /**
   * ★★★**提案だけが持つ「ジャンルの形」**（2026-09-13・第96巡にユーザー指定
   * 「ホームに落とす図形も、このマスクの形にします」）。BRIEF の札と**同じ写真が
   * 同じ形**で出る。★★山に落ちる5種のうち**ジャンルを持てるのは提案だけ**
   * （タスク・未読の数・カセット・文字の板は `ItemDomain` を持たない。持たせると
   * 「形がジャンルを言う」約束が壊れて、同じ形が2つの意味を持つ）。
   */
  shape?: CardShape;
  /** 角丸の四角の外接箱（タスク）。円は `r`。 */
  w?: number; h?: number; r?: number;
  face: string;
  ink: string;
  title?: string;
  face_?: number;      // 書体の番号（タグが決める）
  /**
   * ★★★**日付が無い＝輪郭線だけ**（2026-09-12・第93巡）。中は地と同じ色で塗り、
   * 縁と字はメインカラー ―― **帯のピルとまったく同じ見え方**。
   */
  outlined?: boolean;
  photo?: string;
  /** ★写真が無い提案の顔（「展」「場」）。 */
  glyph?: string;
  count?: number;
  /** 文字の板（日付・曜日）だけが持つ。★寸法も描き方も `lib/wordPlate.ts`。 */
  plate?: WordPlate;
  /** ★★**押すと行き先がある図形**（未読の数＝ブリーフ／ジャーナル＝レコード）。 */
  nav?: TabId;
}

/**
 * ★★**壁は器の内側**（`lib/pileBox.ts`）。器の縁ぴったりに置くと、出どころ
 * （内寸の内側）と壁がずれて**壁際で押し合う**。
 * ★★★**左右は対称**（`PILE_INSET`）―― タブバーは**右下の丸まで含めて**
 * `[SPACE.lg, w − SPACE.lg]` なので、揃えるべきセーフエリアはこれ1つ。
 * ★★床は**タブバーの上から `GROUND_LIFT` 浮かせる**（`floorYOf`）。器は
 * `.bleed-x-b` で**画面の底まで**伸びているので、この式がそのまま正しい。
 */
export function makeWalls(m: M, bw: number, bh: number): Body[] {
  const floorY = floorYOf(bh);
  return [
    m.Bodies.rectangle(bw / 2, floorY + WALL_T / 2, bw + WALL_T * 2, WALL_T, { isStatic: true, friction: 0.6 }),
    // ★★**高さに下限を掛ける** ―― `bh` が 0 だと面積 0 の壁になり、重心が NaN に
    //   なって**当たらない壁**が出来る（第101巡に踏んだ「図形が出なくなる」の一因）。
    // ★★★**下限は `WALL_MIN_H`（2026-09-14・第103巡）** ―― `bh` に比例させて
    //   いたので、**横画面では器が低いぶん壁も短く**（250 × 3 ＝ 750）、
    //   縦画面で積まれていた図形が**壁の下端より下に居て横から抜けた**。
    //   壁は「器の高さ」ではなく「**図形が居得る範囲**」を覆うもの。
    m.Bodies.rectangle(INSET - WALL_T / 2, bh / 2, WALL_T, Math.max(bh, WALL_MIN_H) * 3, { isStatic: true, friction: 0.4 }),
    m.Bodies.rectangle(bw - INSET + WALL_T / 2, bh / 2, WALL_T, Math.max(bh, WALL_MIN_H) * 3, { isStatic: true, friction: 0.4 }),
  ];
}

/**
 * ★★★**器が変わったら、山を新しい器へ「合わせ直す」**（2026-09-14・第103巡）。
 *
 * ★★★**ユーザー報告「図形が地面の下に落ちる」「横画面にして戻すと図形が消える」の
 *   根治。** 器が縮むと床（`floorYOf`）は上がるが、**床の板は `WALL_T`(200px) と厚い**
 *   ので、床が上がった瞬間に山の図形は**板の中**に入る ―― matter.js は
 *   **いちばん浅い軸へ押し出す**ので、上面より下面が近ければ**下へ**抜ける。
 *   横画面では床が 444px も上がるため、図形は**板より下に取り残されて永遠に落ちる**
 *   （器に天井も底も無い）。戻しても山は空にならないので入れ直しの番人も撃たない。
 * → **床が動いたぶんだけ山ごと動かす。** 図形と床の相対の位置が変わらないので、
 *   **積み上がった形はそのまま**で、板の中に入ることも無い。
 *   ★★**床が下がるときは動かさない**（そのぶん落ちればよい。そのほうが自然）。
 * ★左右は**壁の内側へ押し戻す**（横画面の広い器で右に居た図形が、縦へ戻したとき
 *   壁の外側に取り残されるのを防ぐ）。
 */
export function refitPile(m: M, bodies: Body[], bw: number, dFloor: number): void {
  for (const b of bodies) {
    const halfW = (b.bounds.max.x - b.bounds.min.x) / 2;
    const lo = INSET + halfW;
    const hi = Math.max(lo, bw - INSET - halfW);
    const x = Math.min(hi, Math.max(lo, b.position.x));
    const y = b.position.y + Math.min(0, dFloor);
    if (x !== b.position.x || y !== b.position.y) {
      m.Body.setPosition(b, { x, y });
      m.Sleeping.set(b, false);
    }
  }
}

/**
 * ★★★**器の外へ出てしまった体か**（2026-09-14・第103巡）。真なら**上から落とし直す**。
 * ★`components/tabs/GravityTab.tsx` の `recycle`（下へ出た図形を畳む）と同じ考え方 ――
 *   **ホームの山にだけ、これが無かった。**
 *
 * ★★★**「沈んだだけ」はここに入れない**（2026-09-14・第104巡）。第103巡は床の
 *   80px 下で上から落とし直していたので、沈む原因が残っているかぎり
 *   **沈む → 上から降る → また沈む**を繰り返し、ユーザーには
 *   「**図形が何度も上から降ってくる**」と見えた。**沈んだだけなら `sink` で
 *   静かに戻す**（下）。ここが真になるのは**本当にもう戻れないとき**だけ。
 */
export function isLost(b: Body, bw: number, floorY: number): boolean {
  const { x, y } = b.position;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
  return y > floorY + LOST_BELOW || x < -LOST_SIDE || x > bw + LOST_SIDE;
}

/**
 * ★★★**床より下へ沈んだ体を、その場で床の上へ静かに戻す**（2026-09-14・第104巡）。
 *
 * ★★床の板は `WALL_T`(200px) と厚いので、**中心線より下まで沈むと下から
 *   吐き出される**（matter.js は**いちばん浅い軸**へ押し出す）。沈む原因
 *   （120Hz の2倍速・重すぎる板）は別に潰したが、**最後の砦としてここで止める**
 *   ―― 物理の都合で 1px でも下へ抜けたら、あとは落ちるだけで二度と戻らない。
 * ★★**上から落とし直さない**（目に見える＝「雨」になる）。**その場で持ち上げて、
 *   下向きの速さだけ捨てる** ―― 横へ滑る勢いは残すので、山の崩れ方は変わらない。
 * @returns 戻したか。
 */
export function sink(m: M, b: Body, floorY: number): boolean {
  // ★★★**体まるごとが床より下に居るときだけ**（2026-09-14・第105巡）。
  //   第104巡は「下の縁が床より 8px 下」で撃っていたが、**それは押し合いの
  //   ふつうのめり込みでも起きる** ―― 番人が持ち上げる → ソルバが押し戻す、の
  //   **無限の綱引き**になり、その1つが**永久に眠らない**。すると山全体の眠りが
  //   解禁されず、**canvas も毎フレーム塗り続ける**（＝着地でフレームが落ちて戻らない）。
  //   実測 … 7件の山で、小さい図形1つに **毎秒8〜9回・永久に**発火していた。
  //   ★**少しでも床に掛かっていれば放っておく。** 休んでいる体は必ず掛かっている。
  if (b.bounds.min.y <= floorY) return false;
  const half = (b.bounds.max.y - b.bounds.min.y) / 2;
  m.Body.setPosition(b, { x: b.position.x, y: floorY - half });
  m.Body.setVelocity(b, { x: b.velocity.x, y: Math.min(0, b.velocity.y) });
  m.Sleeping.set(b, false);
  return true;
}

export interface PileContent {
  tasks: Task[];
  offers: Item[];
  unread: number;
  today: Date;
  /** ★その日まだ声を録っていないか（真なら録音のダイヤルの円を落とす）。 */
  journal: boolean;
}

/**
 * ★★★**山の中身を1式作る**（世界には入れない ―― 入れるのは `Pile.tsx` の
 * ループが**時間をずらして1つずつ**やる。まとめて入れると全部が同時に落ち始め、
 * 順番を作るために出どころを空の彼方まで持ち上げる羽目になる）。
 */
export interface PileBuild {
  pieces: Piece[];
  /**
   * ★★★**一括の倍率**（solid 座標 → px）。**引き下ろしの行き先の大きさ**を知るのに要る
   *  （2026-09-14・第102巡）。帯のピルを引くと、そのタスクが山で持つ寸法
   *  **`specOf(t, today).w × unit`** へ向かって形が変わる。
   *  ★★★**ここでしか計算していない値なので、返して渡す**（2か所で計算すると、
   *  引いている最中の大きさと落ちたあとの大きさが食い違う）。
   */
  unit: number;
  /**
   * ★★**新しく落とすものが在ったか**（2026-09-14・第103巡）。**偽なら山は静かなまま**
   *  なので、`Pile.tsx` は眠りを解かない（全部据え置きのときに山を起こさない）。
   */
  dropped: boolean;
}

/**
 * @param prev    前の山の体（id → Body）。**同じ id は落とし直さず居場所を引き継ぐ**。
 * @param landing 引き下ろして指を離した所（1つだけ）。ここから落とす。
 */
export function buildPieces(
  m: M, c: PileContent, w: number, h: number,
  prev?: Map<string, Body>, landing?: Landing | null,
): PileBuild {
  const { tasks, offers, unread, today, journal } = c;

  // ★★★**その日まだ声を録っていなければ、JOURNAL の図形も落とす**（2026-09-09）。
  // ★★★**形は JOURNAL のタブのアイコン（カセット）そのもの**（2026-09-13・第94巡に
  //   ユーザー指定「現在の journal のタブのアイコンを図形にして落として。四角い
  //   部分がブルーで他が黒」）。第93巡の「録音の円」からさらに一歩 ――
  //   **行き先の顔をそのまま持ってくる**ので、何が起きるか説明が要らない。
  //   ★寸法は `lib/cassette.ts`（タブの SVG と同じ数を読む）。
  const jDue = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  // ★**面積は今までと同じ**（重要度 2 ＋ 今日が期限）。変えると山の詰まり具合が動く。
  const jArea = journal ? areaOf({ title: "", weight: 2, dueDate: jDue }, today) : 0;
  // カセットの外接箱（solid 座標）。★面積を保ったままアイコンの比にする。
  const jW = jArea > 0 ? Math.sqrt(jArea * CASSETTE_ASPECT) : 0;
  const jH = jArea > 0 ? Math.sqrt(jArea / CASSETTE_ASPECT) : 0;

  // ★★★**文字の板は先に決めて、器の予算から差し引く**（2026-09-10）。
  //   板は器の幅の `WORD_W` を取る**いちばん大きな塊**なので、予算に数えないと
  //   山の総面積が跳ね上がる（実測 80%）。詰まった山は解けずに押し合って震える。
  // ★★字の大きさは**長いほう（曜日）で決めた1つの値**を両方に使う（第67巡）。
  const words = [`${today.getMonth() + 1}/${today.getDate()}`, WD_FULL[today.getDay()]];
  const room = pileWOf(w) * WORD_W;
  // ★★大きな欧文は `DISPLAY`（Anton。第100巡）。canvas に焼くので可変の軸は届かない。
  const wordFs = wordFontSize(words, room, DISPLAY, PILE_WORD_MAX);
  const plates = words.map((wd) => measureWordPlate(wd, wordFs, room, INK, DISPLAY));

  // ★★★**予算は「図形が居られる高さ」で取る** ―― 器の高さ `h` ではなく**床まで**。
  const usableH = Math.max(120, floorYOf(h));
  const areas = [
    ...tasks.map((t) => areaOf(t, today)),
    ...offers.map(() => weightArea(3) * OFFER_K),
    ...(jArea > 0 ? [jArea] : []),
  ];
  const total = areas.reduce((a, b) => a + b, 0) || 1;
  const fixed = plates.reduce((a, pl) => a + pl.w * pl.h, 0)
    + (unread > 0 ? Math.PI * BADGE_R * BADGE_R : 0);
  const budget = Math.max(w * usableH * FILL * 0.25, w * usableH * FILL - fixed);
  // ★★★**下限で予算を破らない**。以前は 16 を床にしていたので、件数が多い日は
  //   予算を無視して大きいまま出て、器に入り切らなかった。
  let unit = Math.min(UNIT, Math.sqrt(budget / total));
  // ★★いちばん大きな図形が器からはみ出さないところまで、**全体を**縮める。
  //   1枚だけ縮めない ―― 図形どうしの大きさの比がそのまま重要度なので。
  for (const sp of [
    ...tasks.map((t) => specOf(t, today)),
    ...(jW > 0 ? [{ w: jW, h: jH }] : []),
  ]) {
    unit = Math.min(unit, (w * FIT_W) / Math.max(1, sp.w), (usableH * FIT_H) / Math.max(1, sp.h));
  }
  unit = Math.max(10, unit);

  const pieces: Piece[] = [];
  let nth = 0;
  /**
   * ★★★**すでに山に居たものは落とし直さない**（2026-09-14・第103巡にユーザー確定
   *   「いつでも落ち直さない」）。
   *
   * ★★★**体は作り直すしかない** ―― 一括の倍率 `unit` は**全体の面積の予算**から
   *   出るので、1つ増えれば全部の大きさが変わる。落ち直して見えていたのは
   *   「新しい体を**上から落とし直していた**」からで、そこだけをやめればよい。
   *   **前の体の位置・角度・速度・回りをそのまま写す**と、山は1px も崩れない。
   * ★**引き下ろして着地させたものは、上からではなく「指を離した所」から**落とす
   *   （`landing`。`lib/pullDrag.ts` の `pullBus` 経由で `HomeTab` が置く）。
   *
   * @returns 新しく落としたか（偽＝前の居場所を引き継いだ）。
   */
  const toss = (body: Body, seed: string, bh: number): boolean => {
    const keep = prev?.get(seed);
    if (keep) {
      m.Body.setPosition(body, { x: keep.position.x, y: keep.position.y });
      m.Body.setAngle(body, keep.angle);
      m.Body.setVelocity(body, keep.velocity);
      m.Body.setAngularVelocity(body, keep.angularVelocity);
      // ★据え置きは**すぐ世界へ入れる**（順番待ちの列に並ばせない）。
      body.plugin = { ...(body.plugin ?? {}), releaseAt: 0 };
      return false;
    }
    if (landing && landing.id === seed) {
      m.Body.setPosition(body, { x: landing.x, y: landing.y });
      m.Body.setAngle(body, landing.angle);
      m.Body.setVelocity(body, { x: landing.vx, y: landing.vy });
      m.Body.setAngularVelocity(body, 0);
      body.plugin = { ...(body.plugin ?? {}), releaseAt: 0 };
      return true;
    }
    // ★★落とし方は `GravityTab` と同じ ―― **どこへ・どの高さから落ちるか**で
    //   ばらつきを作り、傾きと回りは控えめに添える。★式は `respawn` の1か所。
    respawn(m, body, w, seed, bh);
    body.plugin = { ...(body.plugin ?? {}), releaseAt: nth++ * DROP_EVERY_MS };
    return true;
  };

  // ★★★**その日の日付と曜日も一緒に落とす**（2026-09-07 ユーザー指定。
  //   `GravityTab` と同じ ―― 枠の無い、文字だけの黒い板）。
  // ★★★**作り方は `lib/wordPlate.ts`。GRAVITY とまったく同じ部品**（第89巡）。
  //   ★DOM で組んでいたのをやめた ―― 板だけが物理と別の座標系に居たせいで、
  //   板まわりだけ挙動が違っていた（ユーザー「特に日付と曜日がおかしい」）。
  // ★★★**いちばん先に落とす**（2026-09-09）。最後に落とすと、板は山の
  //   **凸凹の上**へ着地して 59° 傾いた（実測。3回とも同じ）。
  plates.forEach((plate, i) => {
    const body = makeWordBody(m, plate, 0, 0);
    // ★★★**板にも `setMass` を呼ぶ**（2026-09-14・第104巡。**第103巡まで忘れていた**）。
    //   呼ばないと質量は matter の既定の密度（0.001 × **px²**）になり、
    //   **他の全部（`area`＝solid² の目盛り）と桁が違う**。
    //   実測の見積り … `MONDAY`(283×64) の板 **18.1** 対 タスクの図形 **12.7** ――
    //   **板のほうが重い**。重い板は軽い図形を床の板（`WALL_T` 200px）の中へ
    //   押し込み、**中心線を越えると下から吐き出されて落ちていく**
    //   （ユーザー報告「図形が何度もすり抜けて落ちてしまいます」）。
    //   ★★★**しかも板の重さは `fs²` で効く** ―― `PILE_WORD_MAX` を 49 → 61 → 72 と
    //   上げた2巡で板は 2.2倍重くなった。**症状が出はじめた時期と一致する。**
    //   ★★`components/tabs/GravityTab.tsx` は**同じ板に同じ式で呼んでいる**
    //   （`massOf(specOf({ title: word })) * MASS_K`）。**片方だけ直さない。**
    m.Body.setMass(body, massOf(specOf({ title: plate.word })) * MASS_K);
    // ★★**据え置きなら傾きも引き継ぐ**（第103巡）。落としたときだけ整える ――
    //   ここで上書きすると、前の山で寝ていた板が**起き上がって**見える。
    if (toss(body, `word${i}`, plate.bh)) {
      // ★初速の回りは与えない（傾くのは着地の弾みぶんだけ）。
      m.Body.setAngle(body, (frac(`word${i}a`) - 0.5) * 0.16);
      m.Body.setAngularVelocity(body, 0);
    }
    pieces.push({
      id: `word${i}`, body, kind: "word", w: plate.bw, h: plate.bh,
      face: INK, ink: INK, title: plate.word, plate,
    });
  });

  tasks.forEach((t) => {
    const spec = specOf(t, today);
    const pw = Math.max(28, spec.w * unit);
    const ph = Math.max(24, spec.h * unit);
    // ★★**絵と同じ「ピルの積み」で当たる**（第101巡。GRAVITY／DRIFT と同じ形）。
    const rows = clampRows(rowsOf(t.title));
    const body = bodyFromOutline(m, stackOutline(rows, pw / ph), pw, ph, BODY);
    // ★★★**質量だけ与えて、回り慣性は触らない**（2026-09-09）。`setMass` は
    //   慣性も一緒に比例させるので、形と重さから正しい回りにくさが出る。
    m.Body.setMass(body, spec.area * MASS_K);
    toss(body, t.id, ph);
    // ★★**日付が無ければ輪郭**（塗り／輪郭の1軸。字も縁と同じ色になる）。
    const outlined = !(t.dueDate ?? "").trim();
    pieces.push({
      id: t.id, body, kind: "task", w: pw, h: ph,
      face: TASK_FACE, ink: outlined ? TASK_FACE : bodyInkOn(TASK_FACE),
      title: t.title, face_: SHAPE_FACE, outlined,
    });
  });

  if (jArea > 0) {
    // ★★**タブのアイコンと同じカセット**。文字は載せない（ユーザー指定）。
    // ★★**体は四角**（円ではない）。当たり判定も `Pile.tsx` の四角の枝へ入る。
    const pw = Math.max(32, jW * unit);
    const ph = Math.max(24, jH * unit);
    // ★体は矩形（本体が矩形なので絵と合う）。★★**絵より `PHYS_GAP` 外側**（第101巡）。
    const body = m.Bodies.rectangle(0, 0, pw + PHYS_GAP * 2, ph + PHYS_GAP * 2, BODY);
    m.Body.setMass(body, jArea * MASS_K);
    toss(body, "journal", ph);
    pieces.push({
      id: "journal", body, kind: "cassette", w: pw, h: ph,
      // ★**本体の面が青／リールと帯が黒**（タブのアイコンの塗り分け）。
      face: JOURNAL_FACE, ink: INK,
      nav: "journal-record",
    });
  }

  offers.forEach((it) => {
    // ★★提案は重さを持たないので、**いちばん重いタスクと同じ**として置く
    //   （2026-09-08 ユーザー指定「提案の図形はもっと大きく」）。
    const area = weightArea(3) * OFFER_K;
    const r = offerRadiusOf(unit);
    // ★★★**まん丸をやめて12角形**（2026-09-13・第96巡に形を持たせたので）。
    //   ★★`Bodies.fromVertices` に**凹んだ形をそのまま渡してはいけない** ――
    //   `poly-decomp` を積んでいないので分解に失敗する（未読のトゲトゲで実測済み。
    //   下の `badge` の注意書きを見よ）。**凸の12角形**なら SAT が正しく効き、
    //   まん丸のように滑らず**角で止まる**。当たり判定は半径のまま。
    // ★★**絵と同じ札の形で当たる**（第101巡）。点の列は `lib/cardShape.ts` の1か所
    //   （＝ SVG のマスクと canvas の輪郭と同じ出どころ）。**器は正方形 2r × 2r**。
    const shape = cardShapeOf(KIND_DOMAIN[it.kind]);
    const body = bodyFromOutline(
      m, cardShapePoints(shape).map(([x, y]) => ({ x: x - 0.5, y: y - 0.5 })), r * 2, r * 2, BODY);
    m.Body.setMass(body, area * MASS_K);
    toss(body, it.id, r * 2);
    // ★★**焼き込まれた色を信じない**（帯の `cardFace` と同じ理由）。生成した夜の
    //   パレットが残っているので、**いま生きている表から引き直す**。
    const face = ACCENT_TEST ? colorOfKind(it.kind) : (it.color ?? colorOfKind(it.kind));
    pieces.push({
      id: it.id, body, kind: "offer", r,
      face, ink: bodyInkOn(face),
      photo: it.images?.[0], title: it.title,
      // ★★**形は券の鋏痕から導く**（`lib/cardShape.ts`。BRIEF の札と同じ1か所）。
      shape,
      // ★写真が無い提案の顔＝**字面**（ブリーフのカードと同じ規則）。
      glyph: glyphOfKind(it.kind),
    });
  });

  if (unread > 0) {
    // ★★★**トゲの外側の12点を結んだ多角形**で作る（2026-09-09に作り直し）。
    //   ★★`Bodies.fromVertices` に**凹んだ星をそのまま渡してはいけない** ――
    //   `poly-decomp` を積んでいないので分解に失敗し、**凹んだ形を1つの凸形と
    //   して**扱う（実測 `parts=1` ＋ 警告）。**凸なら SAT が正しく効く。**
    //   ★まん丸に戻さないのは、玉のように滑らず**角で止まる**ため。
    // ★★**絵より `PHYS_GAP` 外側**（第101巡）。形は凸の12角形のまま（上の注意書き）。
    const body = m.Bodies.polygon(0, 0, ZIG_N, BADGE_R + PHYS_GAP, BODY);
    m.Body.setMass(body, weightArea(3) * MASS_K);
    toss(body, "unread", BADGE_R * 2);
    // ★★色は **EXPLORE の家族のメイン**（2026-09-09 ユーザー指定）。
    //   数えているのが Explore の未読なので、**行き先と同じ色**を着る。
    const face = ACCENT_TEST ? accentOf("life").main : RUST;
    pieces.push({
      id: "unread", body, kind: "badge", r: BADGE_R,
      face, ink: bodyInkOn(face), count: unread,
      // ★押すと EXPLORE のブリーフへ（そこで実際に読める）。
      nav: "brief",
    });
  }

  return { pieces, unit, dropped: nth > 0 || !!landing };
}

export type { Engine };
