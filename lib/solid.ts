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
export function stackOutline(rows: number, ar: number): Pt[] {
  const n = clampRows(rows);
  // 正規化した座標系（幅 1・高さ 1）での段の高さと角丸。
  const rowH = 1 / n;
  // 角丸は**幅の単位**で測る（横は 1、縦は 1 なので、比を掛けて横へ直す）。
  const rx = Math.min(rowH / 2 / ar, 0.5);
  const ry = rowH / 2;
  const half = Math.max(0, ARC_STEPS / 2);
  const pts: Pt[] = [];
  // 上辺（左上の角の終わり → 右上の角の始まり）。
  pts.push({ x: -0.5 + rx, y: -0.5 });
  pts.push({ x: 0.5 - rx, y: -0.5 });
  // 右側 … 段ごとに半円（上から下へ）。
  for (let i = 0; i < n; i++) {
    const cy = -0.5 + rowH * i + ry;
    for (let k = 0; k <= half; k++) {
      const a = -Math.PI / 2 + (Math.PI * k) / half;
      pts.push({ x: 0.5 - rx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
  }
  // 下辺。
  pts.push({ x: -0.5 + rx, y: 0.5 });
  // 左側 … 段ごとに半円（下から上へ）。
  for (let i = n - 1; i >= 0; i--) {
    const cy = -0.5 + rowH * i + ry;
    for (let k = 0; k <= half; k++) {
      const a = Math.PI / 2 + (Math.PI * k) / half;
      pts.push({ x: -0.5 + rx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
  }
  return pts;
}

/**
 * ★その形の、**高さ y での半幅**（`stackOutline` と同じ -0.5〜0.5 の座標系。
 * y は下向き）。文字を「形に合わせて折り返す」ために要る。
 *
 * ★段の中心でちょうど `0.5`（箱いっぱい）、縁へ向かって円で落ちる。
 * ★★行は段の中心に置かれるので**ほぼ箱いっぱい使える** ―― それが
 *   「ピルの中に1行」という見え方を作っている。
 */
export function halfWidthAtStack(rows: number, ar: number, y: number): number {
  const n = clampRows(rows);
  const t = Math.max(-0.5, Math.min(0.5, y));
  const rowH = 1 / n;
  const rx = Math.min(rowH / 2 / ar, 0.5);
  const ry = rowH / 2;
  // いる段（境界はどちらの段でも同じ値になるので端は丸めるだけ）。
  const i = Math.max(0, Math.min(n - 1, Math.floor((t + 0.5) / rowH)));
  const cy = -0.5 + rowH * i + ry;
  const dy = Math.min(Math.abs(t - cy), ry);
  return 0.5 - rx + Math.sqrt(Math.max(0, 1 - (dy / ry) * (dy / ry))) * rx;
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
