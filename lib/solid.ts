import type { SideKey } from "./types";

// ★タスクの図形。**純粋関数だけ**。単体テストで検証する。
//
// ★3D は持たない(2026-08-13にユーザー確定)。投影・陰影・凸包の類は撤去済み。
//
// ★★★**形は「ピルの積み」ひとつ**（2026-09-13・第99巡にユーザー指定
//   「**ピルを積んだような形**にし、**行数によって段の数が変わる**ように。
//   **最大3段**」）。参照画像の実測 … 399 × 392 の中に **3段**、1段 131
//   （＝段は隙間なく接する）、上辺 277・くびれ 286・最大 399。
//   → **幅の等しいピル（角丸＝段の高さ/2）を縦に積んだ union**。
//
// ★★★**「辺の数（1〜4）＝どれだけ埋まっているか」はやめた**（第99巡にユーザー確定）。
//   円・半円・三角・四角の語彙は消えた。**復活させない。**
//   いま図形が言うのは2つだけ ――
//     ・**塗り／輪郭** … 日付があるか（`isDated`。`sides` はこのためだけに残る）
//     ・**大きさ**     … 重要度（`area`）
//   ★段の数が言うのは**題の行数**であって、埋まり具合ではない。
//
// 寸法の対応(lib/taskSize.ts):
//   area  = **塗られる**面積 = 重要度(WEIGHT × 期限の切迫度)。
//           大きさに効くのはこれだけ。塗り率(STACK_INK)で外接箱を広げる。
//   w / h = 外接箱。**1段の比 ÷ 段の数**(`ratioOf`)。1段なら横長、3段でほぼ正方形。
//   rows  = 段の数(1..3)。**文字を組んでみて初めて決まる**ので `SolidSpec` には
//           入れない ―― `lib/solidPaint.ts` の `plan()` が2段構えで解く。
//   slabs = 残っている手順 → 何枚に割れるか(大きさには効かない)

/** 段の数の上限（ユーザー確定）。 */
export const MAX_ROWS = 3;

/** 曲線をいくつの線分で近似するか。 */
export const ARC_STEPS = 36;

/** ★★物理の体の頂点の数（**等角に測り直す**本数。`components/home/pileWorld.ts`）。
 *  ★**偶数**であること ―― 左右の対称性を式に保証させるため。
 *  ★★当たり判定の費用は**軸の本数 × 頂点数**。増やすと**着地でフレームが落ちる**
 *  （第104巡に 20 ＋ 左右の折り返しで **最大 16倍**にして、実機で落ちた。実測 …
 *  6倍遅の Chromium で**落ち着いたあとですら 32ms 超が 106/106 枚**だった）。 */
export const PHYS_VERTS = 12;

/**
 * ★★★**当たり判定を絵より何 px 外側へ出すか**（2026-09-13・第101巡にユーザー確定
 * 「その当たり判定は、**図形や文字から1ピクセルだけ外側にオフセット**し、
 * **図形同士が隣り合った時にもそれぞれの図形の形がはっきり分かる**ように」）。
 *
 * ★第63巡にユーザー指定「ほんの 0.1 ミリくらい外側に」で `GravityTab` に
 * `HAIR = 1.5` として入り、**GRAVITY にしか居なかった**。第101巡に
 * **ホームの山と文字の板へも広げ、数を 1 に揃えて**ここ1か所へ移した。
 * ★文字の板は `lib/wordPlate.ts` の `PLATE_PAD`／`PLATE_PAD_Y`（どちらも 1）。
 * ★目盛りの外（物理の場）。
 */
export const PHYS_GAP = 1;

/**
 * ★★★**ピルの積みが外接箱のうち何割を塗るか**。
 * 1段が `w × rowH`・角丸 `rowH/2` のとき `1 − (rowH/w)(1 − π/4)`。
 * 参照の 1段 3:1 なら 0.928、2:1 でも 0.893 ―― **段数でほとんど動かない**ので
 * 定数で持つ。★これで「同じ重要度なら色の量が同じ」が保たれる。
 */
export const STACK_INK = 0.93;

/** 段の数を 1..MAX_ROWS に丸める。 */
export const clampRows = (n: number): number =>
  Math.max(1, Math.min(MAX_ROWS, Math.round(n || 1)));

/** スラブとスラブの間の切れ目。軸方向の長さに対する割合。 */
export const SLIT = 0.055;

export interface Pt { x: number; y: number }

export interface SolidSpec {
  /** 埋まっている側面。★★★**もう形を選ばない**（第99巡）。
   *  残しているのは **`isDated`（"due" が入っているか）** のためだけ。 */
  sides: SideKey[];
  /** ★**塗られる**面積(=重要度)。solid²。
   *  文字の大きさ・物理の重さ・LOD・間引きの基準はすべてここから引く。 */
  area: number;
  /** 外接箱。ビューによらず1つ。 */
  w: number;
  h: number;
  /** スラブの枚数(1以上)。 */
  slabs: number;
}


// ── 形（ピルの積み） ──────────────────────────────────────────
// ★時計回りの多角形（画面の座標。y は下向き）。段ごとの半円は ARC_STEPS/2 本の弦で。

/**
 * ★★★**ピルの積みの輪郭**を **縦横とも -0.5〜0.5 に正規化**して返す。
 *
 * 箱 `w × h`、段数 `rows`、`rowH = h / rows`、**角丸 `r = rowH / 2`（＝真のピル）**、
 * 段は**隙間なく接する**。上辺 → 右側を段ごとの半円 → 下辺 → 左側を段ごとの半円。
 *
 * ★★`ar`（＝ `w / h`）が要る ―― `r` は**絶対寸法**（段の高さの半分）なので、
 *   正規化した形は箱の比に依る（第98巡までの断面の輪郭には無かった引数）。
 * ★呼ぶ側が `(w, h)` を掛ければ、外接箱はちょうど `w × h` になる。
 */
export function stackOutline(rows: number, ar: number, waist = 1): Pt[] {
  const n = clampRows(rows);
  // 正規化した座標系（幅 1・高さ 1）での段の高さと角丸。
  const rowH = 1 / n;
  const ry = rowH / 2;
  const half = Math.max(0, ARC_STEPS / 2);
  // ★★**点の y は段ごとの半円から取り、x は `stackEdge` から引く。**
  //   こうしておくと `waist` を混ぜても**点の数も y の並びも変わらない**ので、
  //   ピル（1段）と積み（n段）のあいだを**再標本化せずに**補間できる（第102巡）。
  //   ★★★**折り返しの弧は2段ぶんの y にまたがる**（第115巡）が、**その2段の
  //     標本を合わせればちょうどその範囲を覆う**ので、ここは1行も変わらない。
  const pts: Pt[] = [];
  // 上辺（左上の角の終わり → 右上の角の始まり）。
  pts.push({ x: stackEdge(n, ar, -0.5, -1, waist), y: -0.5 });
  pts.push({ x: stackEdge(n, ar, -0.5, 1, waist), y: -0.5 });
  // 右側 … 段ごとに半円（上から下へ）。
  for (let i = 0; i < n; i++) {
    const cy = -0.5 + rowH * i + ry;
    for (let k = 0; k <= half; k++) {
      const a = -Math.PI / 2 + (Math.PI * k) / half;
      const y = cy + Math.sin(a) * ry;
      pts.push({ x: stackEdge(n, ar, y, 1, waist), y });
    }
  }
  // 下辺。
  pts.push({ x: stackEdge(n, ar, 0.5, -1, waist), y: 0.5 });
  // 左側 … 段ごとに半円（下から上へ）。
  for (let i = n - 1; i >= 0; i--) {
    const cy = -0.5 + rowH * i + ry;
    for (let k = 0; k <= half; k++) {
      const a = Math.PI / 2 + (Math.PI * k) / half;
      const y = cy + Math.sin(a) * ry;
      pts.push({ x: stackEdge(n, ar, y, -1, waist), y });
    }
  }
  return pts;
}

/**
 * ★★★**その側で、段 `i` と段 `i+1` が折り返しで繋がっているか**
 * （2026-09-16・第115巡にユーザー指定「**一本の長いピルを S 字に折りたたんだ
 * ような形に。例えば1段目と2段目の右側のところを、曲がって繋がっているような形**」）。
 *
 * ★**右で 0-1、左で 1-2、右で 2-3 …** と互い違いに折る ―― これが「S 字」。
 */
const foldsAt = (n: number, i: number, side: 1 | -1): boolean =>
  i >= 0 && i < n - 1 && (side > 0 ? i % 2 === 0 : i % 2 === 1);

/** その側に折り返しが1つでもあるか（＝その側がどこまで膨らむか）。 */
const sideFolds = (n: number, side: 1 | -1): boolean =>
  side > 0 ? n >= 2 : n >= 3;

/**
 * ★★★**その形の、高さ `y` での「左（`side=-1`）／右（`side=1`）の縁の x」**
 * （`stackOutline` と同じ -0.5〜0.5 の座標系。y は下向き）。
 *
 * ★★★**形は「幅 `rowH` の帯を S 字に折りたたんだもの」**（第115巡）。
 *   帯の中心線は各段の中心を走り、**折り返す側では半径 `rowH/2` で U ターン**する。
 *   縁はその中心線から半分の厚みだけ外へ出るので:
 *   ・**折り返し** … 中心が2段の境目・半径 **`rowH`** の半円（＝2段ぶんを1つの弧が覆う）。
 *   ・**端（キャップ）** … 中心が段の中心・半径 **`rowH/2`** の半円（＝今までと同じ）。
 * ★★**直線部の端は、その側のいちばん膨らむ弧が箱の縁に接するように置く**ので、
 *   外接箱はきっちり `1 × 1` のまま（＝**大きさは変わらない**）。
 * ★★★**左右で式が違う**（折り返しのある側だけ深く入る）ので、**半幅では書けない**。
 *   だから `halfWidthAtStack` はこの関数から**内側の包絡**として導く。
 */
export function stackEdge(rows: number, ar: number, y: number, side: 1 | -1, waist = 1): number {
  const n = clampRows(rows);
  const full = edgeRaw(n, ar, y, side);
  if (waist >= 1 || n === 1) return full;
  // ★★★**`waist` は「くびれの深さ」**（2026-09-14・第102巡）。
  //   0 ＝ **段が1つ＝ただのピル**（帯のピルの形そのもの）／1 ＝ n 段の S 字。
  //   ★★帯のピルを引き下ろすと図形へ変わる、あの連続変形のための1つの摘み。
  const pill = edgeRaw(1, ar, y, side);
  return pill + (full - pill) * Math.max(0, waist);
}

/** 段数 `n` の S 字の、高さ `y` での縁（`waist` を混ぜる前の素の値）。 */
function edgeRaw(n: number, ar: number, y: number, side: 1 | -1): number {
  const t = Math.max(-0.5, Math.min(0.5, y));
  const rowH = 1 / n;
  /** 段の厚みの半分を、x の単位へ直したもの（＝キャップの半径）。 */
  const u = Math.min(rowH / 2 / ar, 0.5);
  /** その側のいちばん膨らむ弧の半径（折り返しがあれば倍）。 */
  const deep = sideFolds(n, side) ? u * 2 : u;
  /** 直線部の端（中心線の折り返し点／端点）。 */
  const straight = Math.max(0, 0.5 - deep);
  const i = Math.max(0, Math.min(n - 1, Math.floor((t + 0.5) / rowH)));
  // この段のこちら側は、折り返しの弧に属するか（自分が上の段／下の段のどちらでも）。
  const up = foldsAt(n, i, side);        // i と i+1 が繋がる（自分は上の段）
  const down = foldsAt(n, i - 1, side);  // i-1 と i が繋がる（自分は下の段）
  if (up || down) {
    const j = up ? i : i - 1;            // 折り返しの上の段
    const cy = -0.5 + rowH * (j + 1);    // 2段の境目
    const dy = Math.min(Math.abs(t - cy), rowH);
    return side * (straight + Math.sqrt(Math.max(0, 1 - (dy / rowH) ** 2)) * u * 2);
  }
  const cy = -0.5 + rowH * i + rowH / 2;
  const dy = Math.min(Math.abs(t - cy), rowH / 2);
  return side * (straight + Math.sqrt(Math.max(0, 1 - (dy / (rowH / 2)) ** 2)) * u);
}

/**
 * ★その形の、**高さ y での半幅**（`stackOutline` と同じ -0.5〜0.5 の座標系。
 * y は下向き）。文字を「形に合わせて折り返す」ために要る。
 *
 * ★段の中心でちょうど `0.5`（箱いっぱい）、縁へ向かって円で落ちる。
 * ★★行は段の中心に置かれるので**ほぼ箱いっぱい使える** ―― それが
 *   「ピルの中に1行」という見え方を作っている。
 */
export function halfWidthAtStack(rows: number, ar: number, y: number, waist = 1): number {
  // ★★★**S 字は左右で膨らみ方が違う**（第115巡）ので、**内側の包絡**を返す。
  //   ★文字も指の当たり判定も「どちら側にも収まる幅」で考えればよい ―― 折り返しで
  //     深く膨らんだ側だけを使うと、**反対側の縁から字がはみ出す**。
  const r = stackEdge(rows, ar, y, 1, waist);
  const l = -stackEdge(rows, ar, y, -1, waist);
  return Math.min(r, l);
}

// ── 立面 ────────────────────────────────────────────────────

/** 外接箱。単位は solid 座標。 */
export const rectOf = (spec: SolidSpec): { w: number; h: number } =>
  ({ w: spec.w, h: spec.h });

/**
 * FRONT の長方形を、スラブの枚数だけ横に割ったもの。中央を 0 とした座標。
 * 間には SLIT ぶんの切れ目が入る(残っている手順の数だけ層に見える)。
 */
export function slabRects(spec: SolidSpec): { x0: number; x1: number }[] {
  const n = Math.max(1, Math.round(spec.slabs || 1));
  const L = spec.w;
  if (n === 1) return [{ x0: -L / 2, x1: L / 2 }];
  const gap = (SLIT * L) / n;
  const step = L / n;
  return Array.from({ length: n }, (_, i) => ({
    x0: -L / 2 + i * step + (i === 0 ? 0 : gap / 2),
    x1: -L / 2 + (i + 1) * step - (i === n - 1 ? 0 : gap / 2),
  }));
}

// ── 器に収める ──────────────────────────────────────────────

export interface Box { minX: number; minY: number; maxX: number; maxY: number }

export function boundsOf(points: Pt[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
