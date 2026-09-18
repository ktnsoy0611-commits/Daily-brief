import type { SideKey } from "./types";

// ★タスクの図形。**純粋関数だけ**。単体テストで検証する。
//
// ★3D は持たない(2026-08-13にユーザー確定)。投影・陰影・凸包の類は撤去済み。
//
// ★★★**形は「角丸四角」ひとつ**（2026-09-19・第123巡にユーザー指定
//   「**タスクの図形は、いまピルの段になっていますが、文字数に応じて段が増える
//   仕組みとかは維持して、形だけ角丸の四角にしてください（元のピルを元にした
//   大きさとかを維持して）**」）。
//   ★★**段の数（`rowsOf`。最大3段）も、箱の寸法（`rowSpecOf`）も変えていない**
//     ―― 変えたのは**縁の式（`rectEdge`）だけ**。角丸は `RECT_R × 段の高さ`。
//   ★★★**第99〜122巡の「ピルの積み」は削除した。復活させない**
//     （第115巡の S 字も同様）。
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
 * ★★★**図形が外接箱のうち何割を塗るか**（予算の割り当てと重要度の物差し）。
 * ★★★**第123巡に形が角丸四角へ変わっても、この値は動かさない**
 *   ―― ユーザー指定が「**元のピルを元にした大きさとかを維持して**」なので、
 *   **予算の式を触ると全部の図形の大きさが動く**（`unit ∝ 1/√Σarea`）。
 *   ★角丸四角の本当の塗り率は `1 − (4 − π)R²/(w·h)` ＝ **0.99 前後**だが、
 *     ここは**比の物差し**であって面積の実測値ではない（全部の図形が同じ式を
 *     読むので、揃ってさえいれば大小関係は正しい）。
 * ★参考（旧・ピルの積み）… 1段 3:1 で 0.928、2:1 で 0.893。
 */
export const STACK_INK = 0.93;

/** 段の数を 1..MAX_ROWS に丸める。 */
export const clampRows = (n: number): number =>
  Math.max(1, Math.min(MAX_ROWS, Math.round(n || 1)));

/** スラブとスラブの間の切れ目。軸方向の長さに対する割合。 */
export const SLIT = 0.055;

/**
 * ★★★**角丸四角の角の半径 ÷ 段の高さ**（2026-09-19・第123巡）。
 * ★★**段の高さは px でどの図形も同じ**（`rowSpecOf`）なので、**この比1つで
 *   全部の図形の角の丸みが px で揃う**。★★0.5 にするとピルに戻る。
 * ★目盛りの外（図形の座標系）。
 */
export const RECT_R = 0.32;

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


// ── 形（角丸四角） ────────────────────────────────────────────
// ★時計回りの多角形（画面の座標。y は下向き）。y の刻みは段ごとの半円（両端に密）。

/**
 * ★★★**図形の輪郭**（**角丸四角**。第123巡）を **縦横とも -0.5〜0.5 に正規化**して返す。
 *
 * 箱 `w × h`、段数 `rows`、`rowH = h / rows`、**角丸 `RECT_R × rowH`**。
 * 上辺 → 右側 → 下辺 → 左側の順に、**段ごとの半円で y を刻んで**点を出す。
 *
 * ★★★**点の刻み方は「ピルの積み」の頃のまま**（2026-09-14・第102巡の約束）――
 *   `waist` でピルと混ぜるので、**点の数も y の並びも変えてはいけない**
 *   （変えると再標本化が要る）。★半円の刻みは**両端に密**なので、角丸四角でも
 *   **角のところに点が集まる**＝そのまま使って滑らかに出る。
 * ★★`ar`（＝ `w / h`）が要る ―― 角丸は**絶対寸法**なので、正規化した形は箱の比に依る。
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
 * ★★★**その形の、高さ `y` での「左（`side=-1`）／右（`side=1`）の縁の x」**
 * （`stackOutline` と同じ -0.5〜0.5 の座標系。y は下向き）。
 *
 * ★★★**形は「角丸四角」**（2026-09-19・第123巡にユーザー指定
 *   「**タスクの図形は、いまピルの段になっていますが、文字数に応じて段が増える
 *   仕組みとかは維持して、形だけ角丸の四角にしてください**」）。
 *   ・**段の数は題の文字数**（`rowsOf`）―― 変えていない。**箱の寸法も変えていない。**
 *   ・角丸は **`RECT_R × 段の高さ`**（px では全図形で同じ）。
 * ★★**左右は対称**。だから `halfWidthAtStack` は `stackEdge` の値そのもので、
 *   **追加の包絡を取る必要が無い**。
 * ★★★**第99〜122巡の「ピルの積み」（`edgeRaw`）も、第115巡の S 字
 *   （`foldsAt`／`sideFolds`）も削除した。復活させない。**
 */
export function stackEdge(rows: number, ar: number, y: number, side: 1 | -1, waist = 1): number {
  const n = clampRows(rows);
  const full = rectEdge(n, ar, y, side);
  if (waist >= 1) return full;
  // ★★★**`waist` は「ピル ⇄ 図形」の1つの摘み**（2026-09-14・第102巡）。
  //   0 ＝ **帯のピルの形そのもの**（角丸 ＝ 高さの半分）／1 ＝ 山での形。
  //   ★★帯のピルを引き下ろすと図形へ変わる、あの連続変形のための1つの摘み。
  //   ★★★**`n === 1` の近道は削除した**（第123巡）―― 形が角丸四角になったので、
  //     **1段でもピルとは別の形**。近道が残っていると 1段のタスクだけ変形しない。
  const pill = pillEdge(ar, y, side);
  return pill + (full - pill) * Math.max(0, waist);
}

/**
 * ★★★**角丸四角の、高さ `y` での縁**（2026-09-19・第123巡にユーザー指定
 * 「**タスクの図形は、いまピルの段になっていますが、文字数に応じて段が増える
 * 仕組みとかは維持して、形だけ角丸の四角にしてください（元のピルを元にした
 * 大きさとかを維持して）**」）。
 *
 * ★★★**変えたのは「縁の式」だけ。** 段の数（`rowsOf`）も、箱の寸法（`rowSpecOf`）も、
 *   文字の折り返し（`halfWidthAtStack` を読む `textFit`）も、物理の体も、
 *   **同じ関数を読んでいるのでそのまま付いてくる**。
 * ★★★**角丸の半径は「段の高さの `RECT_R` 倍」** ―― 段の高さは px では
 *   **どの図形でも同じ**（第116巡の `rowSpecOf`）なので、**1段でも3段でも
 *   角の丸みが px で揃う**。比で持たないと、3段の図形だけ角が大きく見える。
 * ★★**第116巡の「ピルの積み」は削除した**（`edgeRaw`。段と段の境目で縁が
 *   一度 `straight` まで戻る、あの式）。**復活させない。**
 */
function rectEdge(n: number, ar: number, y: number, side: 1 | -1): number {
  const t = Math.max(-0.5, Math.min(0.5, y));
  /** 角丸の半径（y の単位 ＝ 箱の高さを 1 とした長さ）。 */
  const ry = Math.min(RECT_R / n, 0.5);
  /** 同じ長さを x の単位へ（`ar = w / h` なので割る）。 */
  const rx = Math.min(ry / ar, 0.5);
  /** 直線部の端（角丸の中心）。 */
  const straight = Math.max(0, 0.5 - rx);
  /** 角丸に掛かっているぶん（0 なら直線部）。 */
  const dy = Math.max(0, Math.abs(t) - (0.5 - ry));
  return side * (straight + Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)) * rx);
}

/** ★**1段のピル**（角丸 ＝ 高さの半分）。`waist = 0` の端＝帯のピルの形。 */
function pillEdge(ar: number, y: number, side: 1 | -1): number {
  const t = Math.max(-0.5, Math.min(0.5, y));
  const u = Math.min(0.5 / ar, 0.5);
  const straight = Math.max(0, 0.5 - u);
  const dy = Math.min(Math.abs(t), 0.5);
  return side * (straight + Math.sqrt(Math.max(0, 1 - (dy / 0.5) ** 2)) * u);
}

/**
 * ★その形の、**高さ y での半幅**（`stackOutline` と同じ -0.5〜0.5 の座標系。
 * y は下向き）。文字を「形に合わせて折り返す」ために要る。
 *
 * ★★角丸四角なので、**上下の角に掛かるところ以外は 0.5（箱いっぱい）**。
 *   ＝どの段の行も**同じ幅**が使える（ピルの積みの頃は段の境目で細くなっていた）。
 */
export function halfWidthAtStack(rows: number, ar: number, y: number, waist = 1): number {
  // ★積みは左右対称なので、片側の縁がそのまま半幅。
  return stackEdge(rows, ar, y, 1, waist);
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
