import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, DataTexture, type MeshToonMaterial,
  NearestFilter, RGBAFormat, ShapeUtils, SRGBColorSpace, TubeGeometry, Vector2, Vector3,
} from "three";

import { NIPPER_PAINT } from "@/lib/constants";
import type { P2 } from "@/lib/nipperShape";

// 改札鋏の**立体**。★形（平面図）は `lib/nipperShape.ts` が正。ここは**厚みだけ**を足す。
//
// ★★★16巡目まで、立体は SVG へ自前で投影して描いていた（`lib/nipperSolid.ts`）。
//   17巡目に **three.js（WebGL）へ移した**（2026-08-29 にユーザーが確定）。
//   理由は「板に見える」ことで、原因は描き方ではなく**立体そのもの**だった ――
//   角の立った、上から下まで同じ厚みの角柱。本物の光と遮蔽を当てても、
//   角柱は角柱にしか見えない。だから**面取りと厚みの変化を立体に持たせる**。
//
// ★曲線は持たない（アプリ全体の語彙）。面取りは**1段**、管の断面は**8角形**。

/** 厚みの決まり。`y` は局所座標（+y が上・頭の天が 0）。返すのは**半分の厚み**。 */
export type Thickness = (y: number) => number;

/** 面取りの幅（＝角を落とす量）。★1段だけ。深いと明るい帯が広く走る（12巡目の教訓）。 */
export const CHAMFER = 7;

// ---- 多角形の内側へ寄せる ------------------------------------------------
/**
 * **反時計回りの**多角形を `d` だけ内側へ寄せる（面取りの縁を作る）。
 * ★角では**二等分線**に沿って寄せる。鋭い角では伸びが発散するので、
 *   伸びを 3 倍で頭打ちにする（スリットの奥で自分と交差させないため）。
 */
function inset(pts: P2[], d: number): P2[] {
  const n = pts.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    // 各辺の内向き法線（反時計回りなら (-dy, dx) が内）
    const e0 = { x: c.x - p.x, y: c.y - p.y }, e1 = { x: q.x - c.x, y: q.y - c.y };
    const m0 = Math.hypot(e0.x, e0.y) || 1, m1 = Math.hypot(e1.x, e1.y) || 1;
    const n0 = { x: -e0.y / m0, y: e0.x / m0 }, n1 = { x: -e1.y / m1, y: e1.x / m1 };
    let bx = n0.x + n1.x, by = n0.y + n1.y;
    const bm = Math.hypot(bx, by);
    if (bm < 1e-6) { out.push({ x: c.x + n1.x * d, y: c.y + n1.y * d }); continue; }
    bx /= bm; by /= bm;
    // 二等分線に沿った伸び = d / cos(半角)
    const cos = bx * n1.x + by * n1.y;
    const k = Math.min(d / Math.max(cos, 1e-3), d * 3);
    out.push({ x: c.x + bx * k, y: c.y + by * k });
  }
  return out;
}

// ---- 立体を組む ----------------------------------------------------------
type Ring = { pts: P2[]; z: number[] };

/** 面を1枚（三角形2枚）足す。★**頂点を共有しない**ので法線は面ごとに立つ＝ローポリ。 */
function quad(v: number[], a: Vector3, b: Vector3, c: Vector3, d: Vector3) {
  for (const t of [a, b, c, a, c, d]) v.push(t.x, t.y, t.z);
}

/**
 * ★**平面図の多角形に、面取りと厚みを与えて立体にする**。
 *
 * 断面は z 方向に4つの輪でできている:
 * ```
 *      ─── 手前の蓋（内へ d 寄せた輪）      z = +t
 *     ╱                                     面取り
 *    │  ─── 本体（輪郭そのまま）            z = +t − c
 *    │
 *    │  ─── 本体                            z = −t + c
 *     ╲                                     面取り
 *      ─── 奥の蓋                           z = −t
 * ```
 * `half(y)` は高さごとの**半分の厚み**なので、持ち手を先へ絞ることができる。
 */
export function buildPart(input: P2[], half: Thickness, chamfer = CHAMFER): BufferGeometry {
  // ★★**まず反時計回りに揃える**（+y が上）。巻きが逆だと側壁の法線が内を向き、
  //   面が裏になって落ち、**中が透けて見える**（17巡目に実測）。
  let a2 = 0;
  for (let i = 0; i < input.length; i++) {
    const p = input[i], q = input[(i + 1) % input.length];
    a2 += p.x * q.y - q.x * p.y;
  }
  const poly = a2 >= 0 ? input : [...input].reverse();
  const n = poly.length;
  const body = poly;
  const lip = inset(poly, chamfer);
  const zOf = (p: P2) => Math.max(half(p.y), chamfer * 1.2);
  const rings: Ring[] = [
    { pts: lip, z: lip.map((_, i) => -zOf(poly[i])) },
    { pts: body, z: body.map((p) => -zOf(p) + chamfer) },
    { pts: body, z: body.map((p) => zOf(p) - chamfer) },
    { pts: lip, z: lip.map((_, i) => zOf(poly[i])) },
  ];
  const v: number[] = [];
  const at = (r: Ring, i: number) => new Vector3(r.pts[i].x, r.pts[i].y, r.z[i]);
  for (let k = 0; k + 1 < rings.length; k++) {
    const lo = rings[k], hi = rings[k + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      quad(v, at(lo, i), at(lo, j), at(hi, j), at(hi, i));
    }
  }
  // 蓋。★凹んだ多角形なので earcut（three が持っている）で三角に割る。
  const flat = lip.map((p) => new Vector2(p.x, p.y));
  const tris = ShapeUtils.triangulateShape(flat, []);
  const cap = (r: Ring, front: boolean) => {
    for (const t of tris) {
      const [a, b, c] = front ? t : [t[2], t[1], t[0]];
      for (const i of [a, b, c]) v.push(r.pts[i].x, r.pts[i].y, r.z[i]);
    }
  };
  cap(rings[3], true);
  cap(rings[0], false);

  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();   // 頂点を共有していないので**面ごとの法線**になる
  return g;
}

/** 直線で繋ぐ折れ線（★曲線にしない）。バネの針金の芯。 */
class Polyline extends CatmullRomCurve3 {
  getPoint(t: number, target = new Vector3()) {
    const p = this.points, s = t * (p.length - 1);
    const i = Math.min(p.length - 2, Math.floor(s));
    return target.copy(p[i]).lerp(p[i + 1], s - i);
  }
}

/** バネの針金。断面は8角形（アプリの語彙）。 */
export function buildWire(path: Vector3[], r: number): BufferGeometry {
  return new TubeGeometry(new Polyline(path), path.length - 1, r, 8, false);
}

// ---- 彩色 ----------------------------------------------------------------
/**
 * 段の表（`NIPPER_PAINT.ramp` の6色）。`MeshToonMaterial` の `gradientMap` に食わせる。
 * ★`NearestFilter` にしないと段のあいだが混ざって**なだらかな階調**になる。
 */
export function toneRamp(): DataTexture {
  const ramp = NIPPER_PAINT.ramp;
  const data = new Uint8Array(ramp.length * 4);
  ramp.forEach((hex, i) => {
    const c = new Color(hex);
    data[i * 4] = Math.round(c.r * 255);
    data[i * 4 + 1] = Math.round(c.g * 255);
    data[i * 4 + 2] = Math.round(c.b * 255);
    data[i * 4 + 3] = 255;
  });
  const t = new DataTexture(data, ramp.length, 1, RGBAFormat);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// ---- 段の当て方 ----------------------------------------------------------
/** 天からの拾い光。上を向いた面だけを持ち上げる（無いと塊の天が立たない）。 */
const SKY = 0.45;
/** 段を当てる範囲。★`n·光` は −1〜1 だが、**端まで使わない**ので狭めて中へ寄せる。 */
const LIT_LOW = -0.895;
const LIT_SPAN = 2.19;

/**
 * ★★★`MeshToonMaterial` の段の出し方を**アプリの語彙へ差し替える**。
 *
 * three の既定は2つの点で合わない:
 * 1. `n·光` を 0 で切る（光の裏側がぜんぶ最暗の1段に潰れて、絵が平たくなる）。
 * 2. 段の表の**赤だけ**を明るさとして読む（暖かい灰色が無彩色の灰になる）。
 *
 * 差し替え後は `lib/nipperSolid.ts`（16巡目まで自前で投影していた版）の
 * `toneOf` とまったく同じ式になる ―― **見た目の語彙を変えずに立体だけ本物にする**。
 */
export function applyAppTones(m: MeshToonMaterial) {
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <gradientmap_pars_fragment>",
      `uniform sampler2D gradientMap;
       vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
         float t = ( dot( normal, lightDirection ) + ${SKY.toFixed(3)} * normal.y
                   - ${LIT_LOW.toFixed(3)} ) / ${LIT_SPAN.toFixed(3)};
         return texture2D( gradientMap, vec2( clamp( t, 0.0, 1.0 ), 0.0 ) ).rgb;
       }`,
    );
  };
  // ★同じ差し替えをした材質どうしでシェーダーを使い回させる。
  m.customProgramCacheKey = () => "nipper-tones";
}

/**
 * 光の強さ。★three は拡散を 1/π するので、**π を入れて 1 に戻す**。
 * こうすると画面に出る色が段の表の色そのものになる。
 */
export const LIGHT_INTENSITY = Math.PI;
