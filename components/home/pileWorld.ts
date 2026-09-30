import { BD_GREY, INK, KIND_DOMAIN, MUTED, PAPER, SHAPE_FACE, TASK_FACE } from "@/lib/constants";
import { cardShapeOf, cardShapePoints, inCardShape, type CardShape } from "@/lib/cardShape";
import { bodyInkOn, colorOfKind } from "@/lib/palette";
import { categoryOfKind } from "@/lib/deckStyle";
import { GRID_COLS, pillInk, taskCellsOf } from "@/lib/taskSize";
import { halfWidthAtStack, PHYS_GAP } from "@/lib/solid";
import { PILE_INSET, floorYOf, pileWOf } from "@/lib/pileBox";
import { badgePlate, type WordPlate } from "@/lib/wordPlate";

import type { Body, Engine } from "matter-js";
import type { BriefCard, Item, ItemKind, TabId, Task } from "@/lib/types";
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
//   ・**円** … まだ見ていない提案の残り数（第131巡にトゲトゲから単位円へ）。数字を中に置き、0 で消える。
// ★★**色は帯から引き継ぐ** ―― 上でその色だったものが、下りても同じ色のまま
//   形だけ変わる（タスク＝タグの色／提案＝そのカードの色）。
// ★★★**大きさは「段の高さ」1つ**（第116巡。`lib/taskSize.ts` の `rowSpecOf`）。
//   ★GRAVITY は今までどおり `specOf`（重要度 × 締切の近さ）。**別の読み方**。

type M = typeof import("matter-js");

// ── 物理（★`GravityTab` と同じ値。目盛りの外＝物理の場） ──────────────
export const GRAVITY_Y = 1.4;
/** 一括の倍率の上限（solid 座標 → px）。★引き下ろしの初期値にも使う。 */
export const UNIT = 64;
export const MASS_K = 1.6;
/**
 * ★★★**摩擦はホームだけ GRAVITY より低い**（2026-09-27・第133巡にユーザー指定「**もう少し摩擦を
 * 少なくして、下まで詰めて落ちるように。しかしいつまでも滑って止まらないのは避けたい**」）。
 * ★matter は組の摩擦を `min`（動）・`max`（静）で決めるので、**床と壁も一緒に下げないと効かない**。
 * ★実測（4/6/11/14件×4回）… 山の中の隙間 **24% → 15〜20%**・山の高さ 約 −10%／
 *   落ち着くまで 3.6〜5.6s → **3.2〜5.7s**（変わらない）。0.1 まで下げると 7.5s の回が出た。
 * ★★GRAVITY（`GravityTab`）は 0.55／0.9 のまま（別の画面。ユーザーの指定はホーム）。
 * ★目盛りの外（物理の場）。
 */
// ★★★**TASK の日付の列（`components/tasks/TimelineTab.tsx`）も同じ値を読む**（第135巡にユーザー指定
//   「**完全にホームと同じ仕組みを使って**」）。だから `export` している。片方だけの値を作らないこと。
export const BODY = { restitution: 0.04, friction: 0.15, frictionStatic: 0.25, frictionAir: 0.012 };
export const FLOOR_FRICTION = { friction: 0.15, frictionStatic: 0.2 };
export const WALL_FRICTION = { friction: 0.08, frictionStatic: 0.12 };
export const WALL_T = 200;
/** ★左右の壁の最低の長さ（器が低くても図形が抜けない）。★目盛りの外（物理の場）。 */
export const WALL_MIN_H = 1200;
/** ★床よりこれだけ下まで行ったら「もう戻れない」＝上から落とし直す。★同上。 */
const LOST_BELOW = 900;
/** ★左右の壁よりこれだけ外に出たら「外へ出た」。★同上。 */
const LOST_SIDE = 120;
/**
 * ★★★**体の輪郭を絵から間引くときの許し（px）**（2026-09-27・第133巡）。絵の輪郭の点を
 * この距離までなら飛ばしてよい ―― 飛ばしたぶんは**外側へ同じだけ押し出す**ので、体は必ず
 * 絵を包む。★小さいほど頂点が増える（ピル 1段で約 20・円で約 26）。★目盛りの外（物理の刻み）。
 */
const HULL_EPS = 0.5;
/** 山が器に占める割合。★目盛りの外（詰め込み具合）。
 *  ★★**帯が厚いほど山の取り分が減る**ので、帯の厚み（`BAND_H`）とセットで決める。
 *  ★2026-09-10 に **0.36** ―― 文字の板と未読の図形を予算に数えるようにしたぶん。 */
const FILL = 0.5;
/**
 * ★★★**1マスが器の高さに対して取ってよい上限**（横画面などの低い器の安全網）。
 * ★焦点のタスク（2 マスの高さ）でも器の 56% まで。★目盛りの外（詰め込み具合）。
 * ★★★**第124〜132巡の `FIT_W`/`fitUnit`（いちばん大きな図形が器に入るまで全体を縮める）は
 *   第133巡に削除した** ―― 格子ではタスクの幅が `TASK_COLS_MAX`(4) マス ＝ 器の 4/5 で
 *   頭打ちなので、横にはみ出す図形が原理的に無い。
 */
const FIT_H = 0.28;
/**
 * ★★★**格子のマス数**（2026-09-27・第133巡。規則の正は `lib/taskSize.ts` の `GRID_COLS`）。
 * 提案 2×2／JOURNAL の円 2×2／日付の板 2×1。タスクは `taskCellsOf`。
 * ★★★**第116〜132巡の物差し（提案の直径 `OFFER_D` 4 段・板の半分 ＝ 1段の `PLATE_ROWS`・
 *   JOURNAL の円 ＝ 板の高さ × `REEL_PER_PLATE`・焦点 × `FOCUS_K` 1.3・板の字の上限
 *   `PILE_WORD_MAX`/`WORD_W`）は全部削除した。復活させない** ―― 図形ごとに別の物差しで
 *   大きさを決めていたので、ユーザーの言う「**それぞれで勝手に調整**」になっていた。
 */
export const OFFER_CELLS = 2;
const REEL_CELLS = 2;
/** ★日付の板は 2×1（第133巡に 3 → 2。ユーザー指定「**右側があまり過ぎている。グリッド分狭めて**」）。 */
const PLATE_COLS = 2;
/**
 * ★★★**混み具合で全体を縮める**（2026-09-17・第118巡にユーザー指定
 * 「**図形が多すぎると操作しづらくなる（特にピルのあたりまで高さがくると
 * 操作できなくなる）ので、全体のスケールを多さによって調整して、図形全部の
 * スケールを一律で少しだけ小さくするなどの調整がかかるように**」）。
 *
 * ★★★**面積の予算だけでは足りない理由** ―― 予算は「器の何割を塗るか」なので、
 *   件数が増えても**塗る面積の合計は変わらない**。ところが**傾いた図形は隙間を
 *   多く作る**ので、件数が増えるほど**同じ面積でも山は高く積み上がる**。
 * ★★★**`crowd` は「長さ」の倍率**（面積ではない）。`unit ∝ √予算` なので、
 *   予算には `crowd²` を掛け、**日付と曜日の板の大きさには `crowd` をそのまま**
 *   掛ける ―― こうして初めて**全部が一律に**縮む。
 *   ★★**板だけ据え置くと、混むほど板が相対的に巨大になる**（第117巡の実機の写真）。
 *   ★★★**板は `room` と `PILE_WORD_MAX` の**両方**に掛けること**（第120巡）――
 *     字の大きさは `min(幅に収まる値, 上限)` なので、**上限が効いている間は
 *     `room` だけ縮めても 1px も変わらない**（実測 … 390 幅では上限 72 が
 *     効いていて、混んでも板だけが元の大きさで残った）。ユーザー報告
 *     「**日付だけ変わらない**」はこれ。両方に掛ければ、どちらが効いていても
 *     字は厳密に `crowd` 倍になる。
 *
 * ★★★**第120巡に大きく緩めた**（ユーザー「**山全体のスケールが効き過ぎています。
 *   小さすぎるようになってしまっているので緩めてください**」）。
 *   ★★**そもそも「混むほど山は高くなる」という第118巡の見立てが逆だった** ――
 *     実測（390×844・タスク 4／9／14 件）… **帯からの余裕は 100／140／160px** で、
 *     **件数が増えるほど山は低い**（小さい図形は密に積むので、同じ面積でも
 *     高さが要らない）。⑥を直したのは**帯の高さを予算から引いたこと**であって、
 *     この係数ではなかった。
 *   ★★だから**18体を超えるまでは 1 のまま**、超えても **0.94 止まり**にする
 *     （実測 … 4／9／14／22 件で余裕 104／164／168／220px・塗った面積はほぼ一定）。
 * ★目盛りの外（詰め込み具合）。
 */
const CROWD_N0 = 18;
const CROWD_MIN = 0.94;
/** ★落とす体の数 → 長さの倍率（1 以下）。 */
const crowdOf = (n: number): number =>
  Math.max(CROWD_MIN, Math.min(1, Math.sqrt(CROWD_N0 / Math.max(1, n))));
/**
 * ★★★**提案の面積**（マス²。提案は 2×2 マスの箱で、半径 1 マスの円と同じ重さ）。
 * ★**`HomeTab.seed` も代理の体もここを読む** ―― 重さの目盛りは1つ。
 * ★★**重さは全部の体で「塗る面積 ÷ マス²」**（密度を揃える。第109巡の理由）。
 */
export const OFFER_AREA = Math.PI * (OFFER_CELLS / 2) ** 2;
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
/** 焦点のタスク（時刻 `dueTime` が今以降でいちばん早い1件）。時刻のあるものが無ければ null。 */
export function focusOf(tasks: { id: string; dueTime?: string }[], now: number): string | null {
  const d = new Date(now); const cur = d.getHours() * 60 + d.getMinutes();
  let best: { id: string; m: number } | null = null;
  for (const t of tasks) {
    const hm = /^(\d{1,2}):(\d{2})/.exec(t.dueTime ?? "");
    if (!hm) continue;
    const m = Number(hm[1]) * 60 + Number(hm[2]);
    if (m >= cur && (!best || m < best.m)) best = { id: t.id, m };
  }
  return best?.id ?? null;
}
/** ★落とす順を決める前の印（`buildPieces` の最後で時刻に置き換わる）。 */
export const QUEUED = -1;
/**
 * 出どころの高さ＝**自分の背丈の半分 ＋ `DROP_ABOVE` ＋ 0〜`DROP_SCATTER`**。
 * ★★★**高さをばらす**（2026-09-11）。等間隔に1つずつ落とすと、どれも同じ速さで
 * 同じ距離を落ちるので、**一列に並んで順番に降りてくる**（コンベアに見えた）。
 */
export const DROP_ABOVE = 24;
export const DROP_SCATTER = 200;
type Pt = { x: number; y: number };

/**
 * ★★★**体は「絵の輪郭の凸包」を `PHYS_GAP` だけ外へ出したもの**（2026-09-27・第133巡に
 * ユーザー指摘「**当たり判定が不安定。ピルの平らな部分は普通だけどカーブの部分がおかしい**」
 * 「**見た目とヒットボックスを必ずずれないようにしてほしい**」）。
 *
 * ★★★**第101〜132巡の「中心から光線を等角に飛ばし、当たった点を頂点にする」
 *   （`bodyFromOutline`／`radialVerts`／`rayHit`・光線 `PHYS_VERTS` 12 本・提案だけ
 *   `OFFER_VERTS` 28 本）は削除した。復活させない。** 真因は2つ ――
 *   ① **光線の当たった点は絵の縁の上にあり、点と点のあいだは弦** ―― 横長のピルでは光線の
 *     大半が平らな辺に当たり、**丸い端には 0°・約 34°・90° の3点しか残らない**。弦は弧より
 *     **最大 4px 内側**（半径 35px のとき）なので、**カーブ同士がめり込んで見えた**。
 *   ② **`fromVertices` は重心を `body.position` に置くが、絵は外接箱の中心に描く** ――
 *     上下が対称でない形（アーチ・三つ葉）では**体が絵から最大 6px ずれていた**。
 * → ① **絵の輪郭の点を細かく取り、凸包を取り、`HULL_EPS` まで間引き、間引いた
 *     ぶん＋`PHYS_GAP` だけ各辺を外へ出す**（＝体は必ず絵を包み、はみ出しは 1〜1.5px）。
 *   ② **`Body.setCentre` で `position` を外接箱の中心へ戻す**（回る軸も絵の中心になる。
 *     重心との差は物理として見えない程度）。
 * ★★**くびれ・切れ込みは凸包に潰れる**（`poly-decomp` が無い）。**それでよい**
 *   ―― GRAVITY で確定済みの判断で、山として引っ掛からないほうが正しい。
 * @param pts 絵の輪郭（px・外接箱の中心が原点）。細かいほど正確（間引きはここでやる）。
 */
export function hullBody(m: M, pts: Pt[], opts: object): Body {
  const verts = hullOutline(pts);
  const body = m.Bodies.fromVertices(0, 0, [verts], opts);
  // ★`fromVertices` は重心を (0,0) に置く＝絵の中心（元の原点）は −重心 の所に居る。
  const c = m.Vertices.centre(verts);
  m.Body.setCentre(body, { x: -c.x, y: -c.y });
  return body;
}

/** 輪郭の点 → 体の頂点（凸包 → 間引き → 外へ出す）。★純粋な関数（検証がそのまま呼べる）。 */
export function hullOutline(pts: Pt[]): Pt[] {
  // ① 凸包（単調連鎖）。
  const P = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: Pt[] = []; const up: Pt[] = [];
  for (const q of P) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = P.length - 1; i >= 0; i--) {
    const q = P[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  const H = [...lo.slice(0, -1), ...up.slice(0, -1)];
  // ② 間引き … 飛ばす点が弦から `HULL_EPS` 以内なら飛ばす（凸なので点は弦の外側に居る）。
  const off = (a: Pt, b: Pt, q: Pt) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return Math.abs(cross(a, b, q)) / L;
  };
  const n = H.length;
  const keep: Pt[] = [];
  let i = 0;
  while (i < n) {
    keep.push(H[i]);
    let j = i + 1;
    while (j + 1 <= n) {
      const b = H[(j + 1) % n];
      let ok = true;
      for (let k = i + 1; k <= j; k++) if (off(H[i], b, H[k % n]) > HULL_EPS) { ok = false; break; }
      if (!ok) break;
      j++;
    }
    i = j;
  }
  // ③ 各辺を外へ `HULL_EPS + PHYS_GAP` 出し、隣どうしの交点を頂点にする。
  //   ★外向きの法線は並びの向き（符号付き面積）で決まる。
  const d = HULL_EPS + PHYS_GAP;
  const K = keep.length;
  let area2 = 0;
  for (let t = 0; t < K; t++) {
    const a = keep[t]; const b = keep[(t + 1) % K];
    area2 += a.x * b.y - b.x * a.y;
  }
  const sg = area2 > 0 ? 1 : -1;
  const lines = keep.map((a, t) => {
    const b = keep[(t + 1) % K];
    const dx = b.x - a.x; const dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    return { x: a.x + (sg * dy / L) * d, y: a.y + (-sg * dx / L) * d, dx, dy };
  });
  const out: Pt[] = [];
  for (let t = 0; t < K; t++) {
    const l1 = lines[(t + K - 1) % K]; const l2 = lines[t];
    const den = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(den) < 1e-9) { out.push({ x: l2.x, y: l2.y }); continue; }
    const u = ((l2.x - l1.x) * l2.dy - (l2.y - l1.y) * l2.dx) / den;
    out.push({ x: l1.x + l1.dx * u, y: l1.y + l1.dy * u });
  }
  return out;
}

/** ★ピル（角丸 ＝ 高さの半分）の輪郭の点（px・中心が原点）。端の半円は 2° 刻み。 */
export function pillPoints(w: number, h: number): Pt[] {
  const r = Math.min(w, h) / 2;
  const hx = w / 2 - r; const hy = h / 2 - r;
  const pts: Pt[] = [];
  for (let a = 0; a < 360; a += 2) {
    const t = (a * Math.PI) / 180;
    const cx = Math.cos(t) >= 0 ? hx : -hx;
    const cy = Math.sin(t) >= 0 ? hy : -hy;
    pts.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  }
  return pts;
}

/**
 * ★★★**ピルの体**（タスク・TASK の「自由」）。形は絵と同じピルの凸包、重さは「塗る面積 ÷ マス²」×`MASS_K`
 * （＝全部の体で同じ密度。第109巡の理由）。★★**質量だけ与えて、回り慣性は触らない**（2026-09-09。
 * `setMass` は慣性も一緒に比例させるので、形と重さから正しい回りにくさが出る）。
 * ★`unit` ＝ 1マスの一辺（px）。
 */
export function pillBody(m: M, w: number, h: number, unit: number): Body {
  const body = hullBody(m, pillPoints(w, h), BODY);
  m.Body.setMass(body, (w / unit) * (h / unit) * pillInk(w / h) * MASS_K);
  return body;
}
/** ★体を使い回してよいかの署名（寸法と行の数）。 */
export const pillSig = (w: number, h: number, lines = 0) => `task|${w.toFixed(2)}|${h.toFixed(2)}|${lines}`;

/** ★提案の札の形の輪郭の点（px・外接箱 `size` 四方の中心が原点）。点の列は `lib/cardShape.ts`。 */
const offerPoints = (shape: CardShape, size: number): Pt[] =>
  cardShapePoints(shape).map(([x, y]) => ({ x: (x - 0.5) * size, y: (y - 0.5) * size }));

export const frac = (s: string) => {
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
  const r1 = frac(seed); const r2 = frac(`${seed}y`);
  const bw = body.bounds.max.x - body.bounds.min.x;
  const up = (bh ?? body.bounds.max.y - body.bounds.min.y) / 2 + DROP_ABOVE + r2 * DROP_SCATTER;
  launch(m, body, spawnXOf(w, bw, r1), -up, seed);
}

/**
 * ★★★**そこから落とす**（位置・傾き・回り・横の初速）。ホームの山と TASK の日付の列が同じ1本を読む
 * （第135巡）。`respawn` は「どこから」を器の上に決めてここへ渡すだけ。
 */
export function launch(m: M, body: Body, x: number, y: number, seed: string): void {
  const r1 = frac(seed); const r3 = frac(`${seed}a`);
  m.Body.setPosition(body, { x, y });
  // ★★★**どの図形も傾いて落ち、自由に回る**（2026-09-19・第123巡にユーザー指定
  //   「**提案の図形も自由に回転したり動くようにしてください**」）。
  //   ★★**第121巡の「回らない体は傾けない」（`inverseInertia === 0` の枝）は
  //     撤回した。復活させない** ―― 歪んで見えた原因は回転ではなく
  //     **六角形の定義**だった（第123巡に正六角形へ直し、第131巡にアーチへ替えた）。
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
  kind: "task" | "offer" | "word" | "reel";
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
  /** ★タスクの字の行の数（1 か 2。`taskCellsOf`）。★字は必ず「高さ ÷ 2」の刻みで組む。 */
  lines?: number;
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
  /** ★写真が来なかった提案に組む**欧文のラベル**（「PLACE」「EXHIBITION」）。 */
  label?: string;
  /** 文字の板（日付・曜日）だけが持つ。★寸法も描き方も `lib/wordPlate.ts`。 */
  plate?: WordPlate;
  /** ★★**押すと行き先がある図形**（未読の数＝ブリーフ／ジャーナル＝レコード）。 */
  nav?: TabId;
  /**
   * ★★★**おすすめの提案だけが持つ**（2026-09-17・第119巡）。
   * `card` ＝ その `BriefCard.id`（**押すと Explore のそのカードへ飛ぶ**）／
   * `ed` ＝ 元の号のキー（**帯へ運ぶと KEEP する**ので `lib/keepCard.ts` が要る）。
   * ★★**まだ `Item` が無い**ので、`id` は `offer-<card.id>`（帯の id の作り方と同じ）。
   */
  card?: string;
  ed?: string;
  /**
   * ★★★**この巡で新しく湧いたか**（2026-09-15・第111巡）。
   * ★★★**`clearOverlap` を掛けてよいのはこれが真のものだけ** ―― あれは
   *   「器のすぐ上から湧いた体どうしを離す」ための道具で、**AABB で見て真上へ
   *   持ち上げる**。落ち着いた山は**傾いた図形どうしの AABB が必ず重なっている**
   *   ので、据え置きの体に掛けると**「AABB が1つも重ならない縦の塔」へ積み直され**、
   *   そこから落ち直す ―― ユーザー報告「**離すとリセットが入って落とし直しが
   *   発生する**」の正体。★着地の1枚（`landing`）にも掛けない。
   */
  fresh?: boolean;
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
    m.Bodies.rectangle(bw / 2, floorY + WALL_T / 2, bw + WALL_T * 2, WALL_T, { isStatic: true, ...FLOOR_FRICTION }),
    // ★★**高さに下限を掛ける** ―― `bh` が 0 だと面積 0 の壁になり、重心が NaN に
    //   なって**当たらない壁**が出来る（第101巡に踏んだ「図形が出なくなる」の一因）。
    // ★★★**下限は `WALL_MIN_H`（2026-09-14・第103巡）** ―― `bh` に比例させて
    //   いたので、**横画面では器が低いぶん壁も短く**（250 × 3 ＝ 750）、
    //   縦画面で積まれていた図形が**壁の下端より下に居て横から抜けた**。
    //   壁は「器の高さ」ではなく「**図形が居得る範囲**」を覆うもの。
    m.Bodies.rectangle(INSET - WALL_T / 2, bh / 2, WALL_T, Math.max(bh, WALL_MIN_H) * 3, { isStatic: true, ...WALL_FRICTION }),
    m.Bodies.rectangle(bw - INSET + WALL_T / 2, bh / 2, WALL_T, Math.max(bh, WALL_MIN_H) * 3, { isStatic: true, ...WALL_FRICTION }),
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
  /**
   * ★★★**その日の「好みそうな」提案**（2026-09-17・第119巡にユーザー指定
   * 「**Explore で溜まっている（もしくは新着の）もののうち最もおすすめなのを
   * 3件ほど抽出し、ホームに落とす**」）。選び方は `lib/offerPick.ts`。
   * ★**まだ KEEP していないカード**なので `Item` ではない。
   */
  picks: { ed: string; card: BriefCard }[];
  today: Date;
  /** ★★★**焦点のタスクの id**（`focusOf`。時刻が一番近い「これから」の1件。無ければ null）。 */
  focus?: string | null;
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
 * @param prev    前の山（id → `Piece`）。**同じ id は落とし直さず居場所を引き継ぐ**。
 *   ★★★**寸法まで同じなら、体そのものを使い回す**（2026-09-15・第111巡）――
 *   `unit` が据え置きなら同じ id は**1点の違いも無い体**になるので、作り直すのは
 *   純粋な無駄。**作り直すと `Composite` から出し入れすることになり、接触も眠りも
 *   切れて、山が落ち直す。**
 * @param landing 引き下ろして指を離した所（1つだけ）。ここから落とす。
 * @param hold    ★★★**前の倍率。渡されたら決め直さない**（2026-09-15・第110巡）。
 *   `unit` は**全体の面積の予算 ÷ 件数**なので、**1枚増えれば全員が別の大きさで
 *   作り直される**。位置は `prev` から丸写しなので、**大きくなった図形は隣へ
 *   めり込み、`clearOverlap` が真上へ持ち上げて山ごと浮き**、小さくなった図形は
 *   宙に浮く ―― ユーザー報告「**離した瞬間に画面が一気に変わる**」の正体。
 *   ★**着地した1枚も、幽霊は古い倍率・体は新しい倍率**なので大きさが飛んでいた。
 *   ★★決め直すのは**世界を作るとき**（＝タブを開いたとき）と**器が 15% 以上
 *   変わったとき**（`seedGen`）だけ。＝ユーザー確定「次に開いた時などに調整する」。
 */
export function buildPieces(
  m: M, c: PileContent, w: number, h: number,
  prev?: Map<string, Piece>, landing?: Landing | null, hold?: number,
  bandH = 0,
): PileBuild {
  const { tasks, offers, picks, today, journal, focus } = c;

  // ★★★**大きさは「格子の1マス」1つで決める**（2026-09-27・第133巡にユーザー指定「**正方形の
  //   グリッドを設定して、提案やジャーナルなどは2段2列、タスクは一段4列、日付は一段3列…
  //   そこら辺を統一してください**」）。★★**`unit` の意味は「1マスの一辺（px）」**。
  //   図形の外枠は全部 `unit` の整数倍 … 提案 2×2／JOURNAL の円 2×2／日付の板 2×1／
  //   タスク 2〜4×1（`taskCellsOf`）／焦点のタスク 4×2。
  // ★★★**1マス ＝ 山の内寸の幅 ÷ 5**（390 幅で 71.6px）。**混む日は1マスごと縮む**
  //   （面積の予算。第118巡の「一律で少しだけ小さく」と同じ作法）ので、**比はどの日も同じ**。
  // ★★★**第116〜132巡は図形ごとに物差しが違った** ―― タスク ＝ 段の高さ（板の半分）、
  //   提案 ＝ 段 × 4、JOURNAL の円 ＝ 板の高さ × 2（px 固定）、板 ＝ 器の幅 × 0.67 と字の上限。
  //   だから混んだ日の縮み方も図形ごとに違った。**物差しは1つにした。**
  const cells = tasks.map((t) => taskCellsOf(t.title ?? "", t.id === focus));
  // ★★★**予算は「図形が居られる高さ」で取る**（第118巡に**帯のぶんも引いた**）。
  //   帯は山の器へ `position: absolute; top: 0` で**重ねてある**（`HomeTab.tsx`）ので、
  //   その面積まで数えると**山が帯の裏へ伸びて指で触れなくなる**。
  // ★`bandH` は `Pile` が `bandBottom()`（DOM の実測）から渡す。0 なら今までどおり。
  const usableH = Math.max(120, floorYOf(h) - bandH);
  // ★★塗る面積（マス²）。★`crowd` は「長さ」の倍率なので、面積の予算には2乗で効かせる。
  const crowd = crowdOf(tasks.length + offers.length + picks.length + (journal ? 1 : 0) + 2);
  const inkCells = cells.reduce((a, c) => a + c.cols * c.rows * pillInk(c.cols / c.rows), 0)
    + (offers.length + picks.length) * OFFER_AREA
    + (journal ? Math.PI * (REEL_CELLS / 2) ** 2 : 0)
    + PLATE_COLS * pillInk(PLATE_COLS);
  // ★★★**据え置き（`hold`）なら決め直さない**（第110巡。1枚増えるたびに全員が作り直され、
  //   山が丸ごと浮くため）。
  const unit = hold && hold > 0 ? hold : Math.max(16, Math.min(
    pileWOf(w) / GRID_COLS,
    Math.sqrt((w * usableH * FILL * crowd * crowd) / Math.max(1, inkCells)),
    usableH * FIT_H,
  ));
  // ★★★**日付の板は「帯のピルと同じ作り」を 2×1 マスの箱に**（第133巡にユーザー承認「**B**」。
  //   左に墨の円 ＝ 日にち／右に2行 ＝ 曜日と月。版面は `lib/wordPlate.ts` の `badgePlate`）。
  //   ★箱は `PLATE_COLS`(2)×1 マス。
  const plates = [badgePlate(today, unit * PLATE_COLS, unit, BD_GREY, INK)];
  const jD = journal ? unit * REEL_CELLS : 0;

  const pieces: Piece[] = [];
  let nth = 0;
  /**
   * ★★★**寸法まで同じ体は使い回す**（2026-09-15・第111巡）。
   *
   * ★★★**作り直すと「落とし直し」が起きる** ―― 作り直せば `Composite` から
   *   出して入れ直すことになり、**接触も眠りも切れる**うえ、入れ直しの
   *   `clearOverlap` が**落ち着いた山を縦の塔へ積み直す**（`Piece.fresh` の注釈）。
   * ★★`unit` が据え置き（`hold`）なら、同じ id は**1点の違いも無い体**になる。
   *   だから**形の署名が一致したら、前の体をそのまま返す**。
   * ★★★**着地する1枚は使い回さない** ―― 「新しく置く」ことがその意味なので、
   *   万一 id が被っても新しく作る。
   * ★署名は `body.plugin.sig` に焼く（別の表を持ち回らない）。
   */
  const same = (seed: string, sig: string): Body | null => {
    if (landing && landing.id === seed) return null;
    const b = prev?.get(seed)?.body;
    if (!b) return null;
    return (b.plugin as { sig?: string } | undefined)?.sig === sig ? b : null;
  };
  const stamp = (body: Body, sig: string): void => {
    body.plugin = { ...(body.plugin ?? {}), sig };
  };
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
    const keep = prev?.get(seed)?.body;
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
    // ★★順番は最後に決める（下の `order`）。ここでは「並ぶ」印だけ付ける。
    body.plugin = { ...(body.plugin ?? {}), releaseAt: QUEUED };
    nth++;
    return true;
  };

  // ★★★**その日の日付と曜日も一緒に落とす**（2026-09-07 ユーザー指定。
  //   `GravityTab` と同じ ―― 枠の無い、文字だけの黒い板）。
  // ★★★**作り方は `lib/wordPlate.ts`。GRAVITY とまったく同じ部品**（第89巡）。
  //   ★DOM で組んでいたのをやめた ―― 板だけが物理と別の座標系に居たせいで、
  //   板まわりだけ挙動が違っていた（ユーザー「特に日付と曜日がおかしい」）。
  // ★★★**落とす順は最後に決める**（第131巡。板は**いちばん最後**。`buildPieces` の末尾）。
  plates.forEach((plate, i) => {
    const sig = `word|${plate.bw.toFixed(2)}|${plate.bh.toFixed(2)}|${plate.word}`;
    let fresh = false;
    const kept = same(`word${i}`, sig);
    // ★★★**板の体も「絵と同じピル」**（第133巡）。`makeWordBody` の矩形のままだと**丸い端の
    //   外の何も無い所で当たり、上の図形が宙に浮いて見えた**。回り慣性を重くするのは同じ。
    let body = kept;
    if (!body) {
      body = hullBody(m, pillPoints(plate.bw, plate.bh), BODY);
      m.Body.setInertia(body, body.inertia * 5);
    }
    // ★★★**板の重さも「実際の箱」から出す＝全部の体を同じ密度にする**
    //   （2026-09-15・第109巡）。
    //
    // ★★★**第104巡の「板にも `setMass` を呼ぶ」は、直しすぎだった。**
    //   呼んだ式が `massOf(specOf({ title: word })) * MASS_K` で、`specOf` に
    //   **重要度も期日も渡していない**ので、**板の実際の大きさと無関係な定数**
    //   （`3.6 × 0.55 × 1.6 = 3.168`）になっていた。板の箱は 283×64px、
    //   `unit ≈ 30.4` なので本来 **19.6 solid²** 相当＝約 31。**10倍 軽い。**
    // ★★★**そして `GravityTab` は板に `setMass` を呼んでいない**（`makeWordBody` は
    //   `setInertia` だけ）。**「GravityTab は呼んでいた」という第104巡の記録は誤り。**
    //   あちらは matter の既定の密度（0.001 × px²）のままなので**密度の幅は 1.6倍**、
    //   ホームだけ「修正」で **9.5倍**に広げてしまっていた。
    // ★★★**密度がばらつくと2つのソルバが毎ステップ食い違う** ―― matter の
    //   **位置ソルバは質量を見ない**（`positionDampen / totalContacts` で等分）が、
    //   **速度ソルバは見る**（`inverseMass` で配分）。10倍 軽い大きな板が重い図形の
    //   下に入ると、押し戻しと跳ね返しが噛み合わずに**震えの燃料**になる。
    // → **箱の面積 ÷ unit² を solid² とみなして、タスクとまったく同じ式へ通す。**
    // ★★**使い回した体は何も触らない**（質量も居場所も前のまま＝いま正しい）。
    if (!kept) {
      m.Body.setMass(body, (plate.bw * plate.bh) / (unit * unit) * MASS_K);
      // ★★**据え置きなら傾きも引き継ぐ**（第103巡）。落としたときだけ整える ――
      //   ここで上書きすると、前の山で寝ていた板が**起き上がって**見える。
      if (toss(body, `word${i}`, plate.bh)) {
        // ★初速の回りは与えない（傾くのは着地の弾みぶんだけ）。
        m.Body.setAngle(body, (frac(`word${i}a`) - 0.5) * 0.16);
        m.Body.setAngularVelocity(body, 0);
        fresh = true;
      }
      stamp(body, sig);
    }
    pieces.push({
      id: `word${i}`, body, kind: "word", w: plate.bw, h: plate.bh,
      face: INK, ink: PAPER, title: plate.word, plate, fresh,
    });
  });

  tasks.forEach((t, i) => {
    // ★★★**箱は格子のマス**（`taskCellsOf`。焦点は 4×2）。字の行の数も同じ1本から。
    const cl = cells[i];
    const pw = cl.cols * unit;
    const ph = cl.rows * unit;
    // ★★**絵と同じピルで当たる**（第101巡。GRAVITY／DRIFT と同じ `stackOutline`）。
    const sig = pillSig(pw, ph, cl.lines);
    const kept = same(t.id, sig);
    const body = kept ?? pillBody(m, pw, ph, unit);
    let fresh = false;
    if (!kept) {
      fresh = toss(body, t.id, ph);
      stamp(body, sig);
    }
    // ★★**日付が無ければ輪郭**（塗り／輪郭の1軸。字も縁と同じ色になる）。
    const outlined = !(t.dueDate ?? "").trim();
    pieces.push({
      id: t.id, body, kind: "task", w: pw, h: ph, lines: cl.lines,
      // ★★★**字は塗りでも輪郭でも黒**（第117巡にユーザー指定「グレーの塗りに黒の字」）。
      face: TASK_FACE, ink: bodyInkOn(TASK_FACE),
      title: t.title, face_: SHAPE_FACE, outlined, fresh,
    });
  });

  if (jD > 0) {
    // ★★**録音画面の回る円そのもの**（墨の面・`MUTED` の芯）。文字は載せない。
    // ★★体は円の輪郭の凸包（`hullBody`。頂点は許し `HULL_EPS` で決まる ―― 第131巡の
    //   `PHYS_VERTS` 角は 12 角形で、辺の中ほどが絵より 2.4px 内側だった）。
    const r = Math.max(16, jD / 2);
    const sig = `reel|${r.toFixed(2)}`;
    const kept = same("journal", sig);
    const body = kept ?? hullBody(m, pillPoints(r * 2, r * 2), BODY);
    let fresh = false;
    if (!kept) {
      // ★★**密度は全部の体で同じ**（面積 ÷ `unit²`）。
      m.Body.setMass(body, (Math.PI * r * r) / (unit * unit) * MASS_K);
      fresh = toss(body, "journal", r * 2);
      stamp(body, sig);
    }
    pieces.push({
      id: "journal", body, kind: "reel", w: r * 2, h: r * 2, r, fresh,
      face: INK, ink: MUTED,
      nav: "journal-record",
    });
  }

  /**
   * ★★★**提案の円を1つ作る**（2026-09-17・第119巡にくくり出した）。
   * ★★**ストックの `Item`（`plannedFor` が今日）と、まだ読んでいないおすすめの
   *   `BriefCard`（`picks`）が同じ絵**なので、**形と色と大きさの式を2度書かない**。
   * @param seed 体の使い回しの鍵（`Item.id` か `offer-<card.id>`）
   */
  const offerPiece = (
    seed: string, kind: ItemKind, title: string, photo: string | undefined,
    nav?: TabId, card?: string, ed?: string,
  ) => {
    const area = OFFER_AREA;
    // ★★★**2×2 マスの箱**（半径 ＝ 1 マス）。
    const r = (unit * OFFER_CELLS) / 2;
    const shape = cardShapeOf(KIND_DOMAIN[kind]);
    const sig = `offer|${r.toFixed(2)}|${shape}`;
    const kept = same(seed, sig);
    const body = kept ?? hullBody(m, offerPoints(shape, r * 2), BODY);
    let fresh = false;
    if (!kept) {
      m.Body.setMass(body, area * MASS_K);
      // ★★★**提案も自由に回る**（2026-09-19・第123巡にユーザー指定
      //   「**提案の図形も自由に回転したり動くようにしてください**」）。
      //   ★★★**第121巡の `setInertia(Infinity)`（正立で固定）は撤回。復活させない。**
      //     あのとき「歪んで見える」の犯人を回転だと見立てたが、**本当の犯人は
      //     六角形の定義**だった（正方形いっぱいに広げていたので縦に 1.155 倍。
      //     第123巡に直した。第131巡にアーチへ替えた）。**回してよい。**
      //   ★★**回りの目盛りはタスクと同じ**（`respawn` の `SPAWN_TILT`/`SPAWN_SPIN`）
      //     ―― 山の中で提案だけが別の物理法則に従っていると、物体に見えない。
      fresh = toss(body, seed, r * 2);
      stamp(body, sig);
    }
    // ★★**焼き込まれた色を信じない**（帯の `cardFace` と同じ理由）。生成した夜の
    //   パレットが残っているので、**いま生きている表から引き直す**。
    const face = colorOfKind(kind);
    pieces.push({
      id: seed, body, kind: "offer", r, fresh,
      face, ink: bodyInkOn(face),
      photo, title,
      // ★★**形は券の鋏痕から導く**（`lib/cardShape.ts`。BRIEF の札と同じ1か所）。
      shape,
      // ★★★**写真が来なかったときの受け皿は「欧文のラベル」**（2026-09-19・
      //   第124巡にユーザー指定「**写真がないときのデザインがダサいので、せめて
      //   英語にしてしっかりとレイアウトして**」）。★第122巡までは和文1字の
      //   「字面」だった。★**語は券と同じ `category`**（`lib/deckStyle.ts`）。
      //   ★絵の側（`pilePaint`）が「写真が無い／来ない」ときだけ組む。
      label: categoryOfKind(kind),
      nav, card, ed,
    });
  };

  // ★★★**おすすめの提案**（第119巡）。**押すと Explore のそのカードへ飛ぶ**ので
  //   `nav` と `card` を持つ。★id は帯と同じ作り方（`offer-<card.id>`）。
  picks.forEach(({ ed, card }) => {
    offerPiece(`offer-${card.id}`, card.kind ?? "place", card.title,
      card.images?.[0], "brief", String(card.id), ed);
  });

  // ★★★**すでにストックしてあって「今日行く」と決めた提案**（`Item.plannedFor`）。
  //   ★絵も形も色も `offerPiece` が1か所で決める（おすすめと同じ見た目）。
  offers.forEach((it) => {
    offerPiece(it.id, it.kind, it.title, it.images?.[0]);
  });

  // ★★★**未読の数は山に落とさない**（2026-09-24・第132巡にユーザー承認）。数は「今日やること」
  //   ではないので、EXPLORE のタブの角の小さな数字へ移した（`components/AppShell.tsx`）。

  // ★★★**落とす順は「ばらばら、日付の板は最後」**（2026-09-23・第131巡にユーザー指定
  //   「**ランダムにするか、せめて曜日とかは一番最後に落とした方がいい**」）。
  //   ★★第130巡までは組んだ順（板 → タスク → カセット → 提案 → 未読）で、毎日
  //     **同じ種類がかたまって**降りてきた。★★板を最後にするので、板は山の
  //     **凸凹の上**へ着地して傾く（2026-09-09 に「いちばん先」にした理由）――
  //     ユーザー確定「**回転するのは構わない**」（第130巡）の上での選択。
  //   ★★**塗る順と拾う順（`pieces` の並び）は変えない**。変えるのは入る時刻だけ。
  const queued = pieces.filter((p) =>
    (p.body.plugin as { releaseAt?: number } | undefined)?.releaseAt === QUEUED);
  const rest = queued.filter((p) => p.kind !== "word");
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  [...rest, ...queued.filter((p) => p.kind === "word")].forEach((p, i) => {
    p.body.plugin = { ...(p.body.plugin ?? {}), releaseAt: i * DROP_EVERY_MS };
  });

  return { pieces, unit, dropped: nth > 0 || !!landing };
}

export type { Engine };

/**
 * ★★★**世界へ入れる直前に、すでに居る体との重なりを解く**（2026-09-15・第109巡）。
 *
 * ★★★**「落とす順を時間で作る」だけでは、1px も引き離せていなかった。**
 *   `respawn` は**器のすぐ上**（`DROP_ABOVE` ＋ 0〜`DROP_SCATTER`）から落とす設計で、
 *   順番は `DROP_EVERY_MS`(60ms) ずつ遅らせて world へ入れることで作っている。
 *   ところが **60ms のあいだに落ちる距離は 2.5px** しかなく、**散らばりの幅は 200px**
 *   ＝ **79倍**。つまり**時間差は順番を作るだけで、位置を分けていない**。
 *   ★実測（実際の id をハッシュへ通し、**投入の瞬間**で判定）…
 *     **16 組が最大 82px めり込んだ状態で world に入っていた。**
 *   82px めり込んだ体は位置ソルバに叩き出されて弾け、隣を押し、
 *   **「落ちてきてぶつかった時に、めり込んで震える」そのもの**になる。
 *   ★★`GravityTab` は `i × (110 + …)` の**幾何のはしご**で落とすので **0 組**。
 *     ★**はしごへ替えると 2500px 上から降ってきて絵が変わる**ので替えない。
 *     **出どころはそのまま、入れる瞬間だけ持ち上げる。**
 * ★★**上へ逃がす**（横へ逃がすと壁と `spawnXOf` の散らばりを壊す）。
 * ★体は多くても14個・入れる瞬間だけなので、費用は無い。
 */
export function clearOverlap(m: M, body: Body, live: Body[]): void {
  // ★★重なりが解けるまで繰り返す（持ち上げた先に別の体が居ることがある）。
  //   ★回数は体の数で頭打ち（必ず終わる）。
  for (let pass = 0; pass <= live.length; pass++) {
    let lift = 0;
    for (const o of live) {
      if (o === body || o.isStatic) continue;
      const a = body.bounds; const b = o.bounds;
      // ★横が掛かっていなければ、縦がどれだけ重なっていても当たらない。
      if (a.max.x <= b.min.x || a.min.x >= b.max.x) continue;
      if (a.max.y <= b.min.y || a.min.y >= b.max.y) continue;
      // ★**自分の下端を相手の上端より上へ**。`PHYS_GAP` ぶんの隙間を足す。
      lift = Math.max(lift, a.max.y - b.min.y + PHYS_GAP * 2);
    }
    if (lift <= 0) return;
    m.Body.setPosition(body, { x: body.position.x, y: body.position.y - lift });
  }
}

/**
 * ★★★**引き下ろしている図形の「代理の体」**（2026-09-15・第110巡にユーザー指定
 * 「**図形を引き出して掴んでいるのですが、それに当たり判定がないです**」／確定
 * 「**山の図形を押しのける ＋ 壁と床にも当たる**」）。
 *
 * ★★★**形も重さも `buildPieces` と同じ1本から出す** ―― 2か所に書くと、
 *   `unit` を据え置いて「幽霊と本番の大きさを揃えた」意味が消える。
 * ★★★**大きさは変形の行き先（`w1`/`h1`）で1度だけ作る** ―― `g.w`/`g.h` は
 *   変形のばね（`K_SWING`。37% 行き過ぎる）で動き続けるので、追いかけると
 *   **体が脈打って山を押し広げては戻す**（第104巡の頂点爆発と同じ重さも付く）。
 * ★★★**回り慣性は無限**（`setMass` が慣性を書き換えるので**そのあとに**呼ぶ）――
 *   角度の持ち主は**振れのばね1つ**。摘ままれているものが接触で回らないのは
 *   物理としても正しい。**元の慣性は返り値で返す**（離したら戻す）。
 */
export function ghostBodyOf(
  m: M, g: { kind: "task" | "offer"; rows: number; shape?: CardShape; area: number },
  w: number, h: number,
): { body: Body; inertia: number } {
  // ★★山の本番と同じ輪郭（`hullBody`）。提案の絵は `max(w, h)` 四方の正方形（`drawGhost`）。
  const pts = g.kind === "offer" && g.shape
    ? offerPoints(g.shape, Math.max(w, h))
    : pillPoints(w, h);
  const body = hullBody(m, pts, BODY);
  m.Body.setMass(body, g.area * MASS_K);
  const inertia = body.inertia;
  m.Body.setInertia(body, Infinity);
  return { body, inertia };
}

/**
 * ★★★**指がその図形に触れているか**（絵と同じ形で見る）。ホームの山と TASK の日付の列が同じ1本を読む
 * （第135巡に `Pile.tsx` から持ち上げた）。`px`/`py` は世界の座標。
 */
export function hitPiece(p: Piece, px: number, py: number, slop: number): boolean {
  const b = p.body;
  const dx = px - b.position.x; const dy = py - b.position.y;
  // ★回っている図形は、**体の向きへ座標を戻してから**見る。
  const ca = Math.cos(-b.angle); const sa = Math.sin(-b.angle);
  const lx = dx * ca - dy * sa; const ly = dx * sa + dy * ca;
  // ★★★**円で描くものは半径で見る**（忘れると押しても飛ばない）。
  //   ★★JOURNAL の円（`reel`。第133巡）も半径で見る。
  if (p.kind === "offer" && p.r && p.shape) {
    // ★★★**提案は「絵と同じ形」で見る**（2026-09-18・第121巡）。絵は
    //   `traceCardShape(…, p.r * 2)` ＝ **2r 四方いっぱい**なので、`p.r` の円で
    //   見ると**出っ張りを押しても掴めず、へこみの何も無い所で掴めた**。
    // ★★**遊びは「形を太らせる」ことで入れる** ―― 器を `2r + 2·slop` と
    //   見なして正規化すれば、どの向きにもおよそ `slop` ぶん広がる。
    const k = p.r * 2 + slop * 2;
    return inCardShape(p.shape, lx / k, ly / k);
  }
  if ((p.kind === "offer" || p.kind === "reel") && p.r) {
    return Math.hypot(dx, dy) <= p.r + slop;
  }
  const pw = p.w ?? 0; const ph = p.h ?? 0;
  if (Math.abs(ly) > ph / 2 + slop) return false;
  // ★★★**タスクは「絵と同じ輪郭」で見る**（2026-09-14・第104巡）。
  //   ★★**式は `halfWidthAtStack`**（絵と物理と同じ1か所。`lib/solid.ts`）。
  if (p.kind === "task" && pw > 0 && ph > 0) {
    const hw = halfWidthAtStack(1, pw / ph, ly / ph);
    return Math.abs(lx) <= hw * pw + slop;
  }
  // ★★★**板も「絵と同じ形」で見る**（2026-09-18・第122巡）。板は**角丸が
  //   高さの半分のピル**（`lib/wordPlate.ts` の `roundRect`）なので、外接箱で
  //   当てると**四隅の外の何も描かれていない所が触れる**（箱の 4.9%）。
  if (p.kind === "word" && p.plate?.pill && pw > 0 && ph > 0) {
    const rad = ph / 2;
    const qx = Math.max(0, Math.abs(lx) - (pw / 2 - rad));
    const qy = Math.max(0, Math.abs(ly) - (ph / 2 - rad));
    return Math.abs(lx) <= pw / 2 + slop && Math.hypot(qx, qy) <= rad + slop;
  }
  return Math.abs(lx) <= pw / 2 + slop;
}
