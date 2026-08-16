import type { SideKey } from "./types";

// ★タスクの図形。**純粋関数だけ**。単体テストで検証する。
//
// ★3D は持たない(2026-08-13にユーザー確定)。
// 「どちらのビューでも、アイソメではなく**各立面**を表示する。なのでシステム的に
// 3Dである必要はない」という指定により、投影・陰影・凸包の類はすべて撤去した。
// 描くのは真横から見た平らな図形2枚だけ:
//
//   FRONT  … 長方形(len × 2r)。スラブの切れ目が入る。タスクのタイトルが載る。
//   BOTTOM … 断面の形(円 / 半円 / 三角 / 四角)。**形は正しいまま**、足あとの
//            高さに合わせて中央へ置く。タグの英字が載る。
//
// 寸法の対応(lib/taskSize.ts。2026-08-16にユーザー確定):
//   面積    = 重要度(WEIGHT + 期限の切迫度)。**大きさに効くのはこれだけ**
//   len     = タイトルの長さ(LEN_MAX で頭打ち)
//   radius  = 面積 ÷ len ÷ 2
//   section = √面積 → BOTTOM の断面の大きさ
//   sides   = 埋まっている側面の数 → 断面の形
//   slabs   = 残っている手順 → 長方形が何枚に割れるか(大きさには効かない)

export const MIN_SIDES = 1;
export const MAX_SIDES = 4;

/** 曲線をいくつの線分で近似するか。 */
export const ARC_STEPS = 36;

/** スラブとスラブの間の切れ目。軸方向の長さに対する割合。 */
export const SLIT = 0.055;

export interface Pt { x: number; y: number }

export interface SolidSpec {
  /** 埋まっている側面。SIDE_KEYS の順。先頭は必ず "title"。1〜4枚。 */
  sides: SideKey[];
  /** 長方形の幅(横)。タイトルの長さで決まる。 */
  len: number;
  /** 長方形の高さの半分。面積 ÷ 幅 から出る。 */
  radius: number;
  /** ★BOTTOM の断面の外接箱の一辺。面積(=重要度)をそのまま持つので、
   *  FRONT が平たくても断面は痩せない。 */
  section: number;
  /** スラブの枚数(1以上)。 */
  slabs: number;
}

export const clampSides = (n: number): number =>
  Math.max(MIN_SIDES, Math.min(MAX_SIDES, Math.round(n || 0)));

/** 断面の形の名前(表示・テスト用)。 */
export const sectionName = (n: number): string =>
  ["円", "半円", "三角", "四角"][clampSides(n) - 1];

// ── 断面の形 ────────────────────────────────────────────────
// 反時計回りの多角形。円と半円の弧は ARC_STEPS 本の弦で近似する。

export function section(sides: number): Pt[] {
  const n = clampSides(sides);
  if (n === 1) {
    // 円。
    const pts: Pt[] = [];
    for (let i = 0; i < ARC_STEPS; i++) {
      const a = (2 * Math.PI * i) / ARC_STEPS;
      pts.push({ x: Math.cos(a), y: Math.sin(a) });
    }
    return pts;
  }
  if (n === 2) {
    // 半円。平らな面を下に、弧が上へふくらむ。
    const pts: Pt[] = [{ x: 1, y: 0 }];
    for (let i = 1; i <= ARC_STEPS; i++) {
      const a = (Math.PI * i) / ARC_STEPS;
      pts.push({ x: Math.cos(a), y: Math.sin(a) });
    }
    return pts;
  }
  // 正三角形・正方形。半径 1 の円に内接させる。
  // 三角は頂点が上、四角は辺が水平になる向き。
  const off = n === 3 ? Math.PI / 2 : Math.PI / 4;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = off + (2 * Math.PI * i) / n;
    pts.push({ x: Math.cos(a), y: Math.sin(a) });
  }
  return pts;
}

/**
 * 断面の輪郭を **-0.5〜0.5 に正規化**したもの(長い方の辺がちょうど 1)。
 * 画面の座標(y は下向き)に合わせてある。BOTTOM VIEW がそのまま使う。
 */
export function sectionOutline(sides: number): Pt[] {
  const pts = section(sides);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const s = 1 / Math.max(maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return pts.map((p) => ({ x: (p.x - cx) * s, y: -(p.y - cy) * s }));
}

/**
 * その断面の形の中で、文字を置ける矩形(-0.5〜0.5 の座標系)。
 * 形ごとに手で決めた値。曲線や斜辺に文字が食い込まないところまで。
 */
export function innerBox(sides: number): { x: number; y: number; w: number; h: number } {
  switch (clampSides(sides)) {
    // 円: 内接する正方形(半径0.5 → 一辺 0.707)。
    case 1: return { x: -0.35, y: -0.35, w: 0.70, h: 0.70 };
    // 半円: 幅1・高さ0.5(y ∈ -0.25..0.25、平らな辺が下)。弧の内側に収まる
    //   最大面積の矩形は dy = r/√2 のとき。
    case 2: return { x: -0.17, y: 0.07, w: 0.34, h: 0.17 };
    // 三角: 頂点が上(y ∈ -0.433..0.433)。底辺に寄せた内接矩形。
    case 3: return { x: -0.24, y: 0.0, w: 0.48, h: 0.41 };
    // 四角。
    default: return { x: -0.46, y: -0.43, w: 0.92, h: 0.86 };
  }
}

// ── 立面 ────────────────────────────────────────────────────

/** FRONT の長方形。単位は solid 座標。 */
export const frontRect = (spec: SolidSpec): { w: number; h: number } =>
  ({ w: spec.len, h: 2 * spec.radius });

/**
 * FRONT の長方形を、スラブの枚数だけ横に割ったもの。中央を 0 とした座標。
 * 間には SLIT ぶんの切れ目が入る(残っている手順の数だけ層に見える)。
 */
export function slabRects(spec: SolidSpec): { x0: number; x1: number }[] {
  const n = Math.max(1, Math.round(spec.slabs || 1));
  const L = spec.len;
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
