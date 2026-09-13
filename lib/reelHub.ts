// ★★★**リールの芯（3本の太い線）の形はここ1つ**（2026-09-13・第100巡）。
//
// ★★★**ユーザー指定** ―― 「**円の周囲の白い点は削除**して、別のデザインにします。
//   **円の中心から120度ずつの方向に、半径の1/3くらいの長さの、3本の線**を出します。
//   線は**とても太く、角が丸まっている**形です。**中心あたりでその三つが重なる
//   ところも曲線でスムーズに繋げた**ような形にしてください。」
//
// ★★★**「滑らかに繋ぐ」を目で作らない ―― 式で作る。**
//   3本を「丸い端の太線（カプセル）」の**距離場**として書き、`min`（硬い和）ではなく
//   **smooth-min**（二次のブレンド）で結ぶ。すると3本が重なる中心のまわりが
//   **ひとりでに曲線で繋がる**（隅を後から丸める作業が存在しない）。
//   ★角を手で丸めると、腕の太さや長さを変えるたびに丸めをやり直すことになる。
//
// ★★`lib/cardShape.ts` と**同じ作法** ―― 原点について星形なので**極で1点ずつ**
//   距離場の 0 を二分法で拾い、**点の列**にする。SVG のパス（録音画面）と
//   canvas の輪郭（ホームの山のカセット）が**同じ点の列から**出る。
// ★★★**`fitBox` で外接箱を揃えないこと**（`cardShape` との違い）―― 芯は
//   **リールの中に小さく在る**もので、器いっぱいに伸ばしてはいけない。
//
// ★★出す場所は**2つだけ**（ユーザー確定「ホームの山と record の UI」）。
//   **タブのアイコンには出さない** ―― タブは地が選択状態で変わるので、
//   芯の色を決め打ちできない（`components/TabIcons.tsx` の既存の但し書きと同じ理由）。
//
// ★★★**前身の `lib/dial.ts`（白い点5つ。`DIAL_TICKS`/`DIAL_VIEW`/`DIAL_TICK`）は
//   第100巡に削除した。復活させない。**

export type Pt = [number, number];

/**
 * 芯の比。**すべて「リールの半径」を 1 とした値**。★目盛りの外（部品の内部の比）。
 */
export const HUB = {
  /** 腕の長さ（中心から先端の丸の中心まで）。★ユーザー「半径の1/3くらい」。 */
  arm: 0.34,
  /** 腕の太さ（＝先端の丸の直径）。★ユーザー「とても太く」。長さの約 0.6 倍。 */
  thick: 0.20,
  /** 中心の繋ぎの丸み（smooth-min の幅）。★大きいほど3本が1つの塊に寄る。 */
  blend: 0.10,
} as const;

/** 輪郭を何点で拾うか。★画素の刻みではなく**曲線の近似**なので粗すぎなければよい。 */
const STEPS = 180;

/** 原点から点 b までの線分への距離（カプセルの芯線）。 */
function sdSegment(px: number, py: number, bx: number, by: number): number {
  const len2 = bx * bx + by * by || 1;
  const h = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  const dx = px - bx * h;
  const dy = py - by * h;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 滑らかな最小値（二次のブレンド）。`k` が 0 なら硬い `min`。 */
function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
}

/** 芯の距離場（リールの半径を 1 とした座標。負が内側・0 が輪郭）。 */
function sd(px: number, py: number): number {
  const r = HUB.thick / 2;
  let d = 0;
  for (let i = 0; i < 3; i++) {
    // ★最初の腕は**真上**（`cardShape.ts` の `ring` と同じ向きの決め方）。
    const t = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    const di = sdSegment(px, py, Math.cos(t) * HUB.arm, Math.sin(t) * HUB.arm) - r;
    d = i === 0 ? di : smin(d, di, HUB.blend);
  }
  return d;
}

let cached: Pt[] | null = null;

/**
 * ★★★**形の正はこの点の列**。単位は**リールの半径**（＝中心が原点、値は 0〜1 弱）。
 * ★一度作れば変わらないので覚えておく（二分法 40 回 × 180 点）。
 */
export function hubPoints(): Pt[] {
  if (cached) return cached;
  const pts: Pt[] = [];
  // ★必ず輪郭の外側にある半径（腕の先端 ＋ 太さの半分 ＋ 繋ぎの幅）。
  const far = HUB.arm + HUB.thick + HUB.blend;
  for (let i = 0; i < STEPS; i++) {
    const t = (i / STEPS) * Math.PI * 2 - Math.PI / 2;
    const dx = Math.cos(t);
    const dy = Math.sin(t);
    let lo = 0;
    let hi = far;
    for (let k = 0; k < 40; k++) {
      const m = (lo + hi) / 2;
      if (sd(dx * m, dy * m) < 0) lo = m; else hi = m;
    }
    const rr = (lo + hi) / 2;
    pts.push([dx * rr, dy * rr]);
  }
  cached = pts;
  return pts;
}

/** SVG のパス。`view` は `viewBox` の一辺（円の直径がこれに当たる）。 */
export function hubPath(view = 100): string {
  const c = view / 2;
  return `M${hubPoints()
    .map(([x, y]) => `${(c + x * c).toFixed(3)} ${(c + y * c).toFixed(3)}`)
    .join("L")}Z`;
}

/** canvas に芯の道を引く（**原点＝リールの中心**。`d` はリールの直径）。塗りは呼ぶ側。 */
export function traceHub(ctx: CanvasRenderingContext2D, d: number): void {
  const r = d / 2;
  ctx.beginPath();
  hubPoints().forEach(([x, y], i) => {
    const px = x * r;
    const py = y * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
}
