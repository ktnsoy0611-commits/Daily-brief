import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, DataTexture, type MeshToonMaterial,
  NearestFilter, RGBAFormat, ShapeUtils, SRGBColorSpace, TubeGeometry, Vector2, Vector3,
} from "three";

import { NIPPER_PAINT } from "@/lib/constants";
import type { NipperPiece, P2 } from "@/lib/nipperPath";

// 改札鋏の**立体**。★形（平面図）は `lib/nipperShape.ts` が正。ここは**厚みだけ**を足す。
//
// ★★★16巡目まで、立体は SVG へ自前で投影して描いていた（`lib/nipperSolid.ts`）。
//   17巡目に **three.js（WebGL）へ移した**（2026-08-29 にユーザーが確定）。
//   理由は「板に見える」ことで、原因は描き方ではなく**立体そのもの**だった ――
//   角の立った、上から下まで同じ厚みの角柱。本物の光と遮蔽を当てても、
//   角柱は角柱にしか見えない。だから**面取りと厚みの変化を立体に持たせる**。
//
// ★曲線は持たない（アプリ全体の語彙）。面取りは**1段**、管の断面は**8角形**。

/** 面取りの幅（＝角を落とす量）。★1段だけ。深いと明るい帯が広く走る（12巡目の教訓）。 */
export const CHAMFER = 11;
/** 面取りの段数。★**1 にすると1枚の平面**＝第69巡までと同じ（後方互換）。 */
const BEVEL_STEPS = 3;
/** その場所の狭さのうち、面取りに使ってよい割合。★狭いところを守る上限。 */
const BEVEL_ROOM = 0.34;

// ---- 多角形の内側へ寄せる ------------------------------------------------
/**
 * **反時計回りの**多角形を、点ごとの `dist(i)` だけ内側へ寄せる（面取りの縁を作る）。
 * ★角では**二等分線**に沿って寄せる。鋭い角では伸びが発散するので、
 *   伸びを 3 倍で頭打ちにする（スリットの奥で自分と交差させないため）。
 */
function inset(pts: P2[], dist: (i: number) => number): P2[] {
  const n = pts.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    // 各辺の内向き法線（反時計回りなら (-dy, dx) が内）
    const e0 = { x: c.x - p.x, y: c.y - p.y }, e1 = { x: q.x - c.x, y: q.y - c.y };
    const m0 = Math.hypot(e0.x, e0.y) || 1, m1 = Math.hypot(e1.x, e1.y) || 1;
    const n0 = { x: -e0.y / m0, y: e0.x / m0 }, n1 = { x: -e1.y / m1, y: e1.x / m1 };
    const d = dist(i);
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
 * ★★厚みは**片ごとに一定**。段は平面図の塗り分けが決めるので（`lib/nipperShape.ts` の
 * `NIPPER_*_PIECES`）、ここで高さの関数を持つ必要はない ―― 18巡目に捨てた。
 * 塗り分けは y の帯ではない（中と薄が y で重なる）ので、関数では表せなかった。
 */
export function buildPart(
  input: P2[], half: number, chamfer = CHAMFER, inner?: boolean[],
): BufferGeometry {
  // ★★**まず反時計回りに揃える**（+y が上）。巻きが逆だと側壁の法線が内を向き、
  //   面が裏になって落ち、**中が透けて見える**（17巡目に実測）。
  let a2 = 0;
  for (let i = 0; i < input.length; i++) {
    const p = input[i], q = input[(i + 1) % input.length];
    a2 += p.x * q.y - q.x * p.y;
  }
  const flip = a2 < 0;
  const poly = flip ? [...input].reverse() : input;
  const mark = inner && (flip ? [...inner].reverse() : inner);
  const n = poly.length;
  // ★★**面取りは頂点ごとに上限を持つ**（第70巡）。半径を上げるだけだと
  //   **狭いところが埋まる** ―― 紙のスリットは 20 しかないので、両側から 11 ずつ
  //   取ると溝が消える。その場所の狭さを測って `BEVEL_ROOM` 倍までに抑える。
  // ★★**段の境目は面取りしない**（0）。面取りを回すと段差が坂に見える ――
  //   段差は 17 しかないので、7 でも 41% が斜面になる（19巡目に指摘）。
  const wide = localWidth(poly);
  const cAt = poly.map((_, i) => (mark?.[i] ? 0 : Math.min(chamfer, BEVEL_ROOM * wide[i])));
  const z = Math.max(half, chamfer * 1.2);
  // ★★**四分円に沿った輪**にする（1枚の平面だと稜線が硬い）。
  //   θ = 90° · s/STEPS  →  寄せ = c(1 − cosθ)、z = ±(t − c + c·sinθ)
  //   ★`BEVEL_STEPS = 1` にすると**以前とまったく同じ**（後方互換）。
  const ringAt = (s: number, front: boolean): Ring => {
    const th = (Math.PI / 2) * (s / BEVEL_STEPS), co = 1 - Math.cos(th), si = Math.sin(th);
    return {
      pts: inset(poly, (i) => cAt[i] * co),
      z: poly.map((_, i) => (front ? 1 : -1) * (z - cAt[i] + cAt[i] * si)),
    };
  };
  const rings: Ring[] = [];
  for (let s = BEVEL_STEPS; s >= 0; s--) rings.push(ringAt(s, false));   // 奥の蓋 → 奥の本体
  for (let s = 0; s <= BEVEL_STEPS; s++) rings.push(ringAt(s, true));    // 手前の本体 → 手前の蓋

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
  const lipRing = rings[rings.length - 1];
  const flat = lipRing.pts.map((p) => new Vector2(p.x, p.y));
  const tris = ShapeUtils.triangulateShape(flat, []);
  const cap = (r: Ring, front: boolean) => {
    for (const t of tris) {
      const [a, b, c] = front ? t : [t[2], t[1], t[0]];
      for (const i of [a, b, c]) v.push(r.pts[i].x, r.pts[i].y, r.z[i]);
    }
  };
  cap(lipRing, true);
  cap(rings[0], false);

  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();   // 頂点を共有していないので**面ごとの法線**になる
  return g;
}

/**
 * ★各頂点の「局所の狭さ」＝**輪郭に沿って十分離れた点までの最短距離**。
 * 溝の壁なら向かいの壁まで、広い持ち手なら反対の縁までが返る。
 * これで面取りの上限を場所ごとに決められる。
 */
function localWidth(poly: P2[]): number[] {
  const n = poly.length;
  const apart = Math.max(4, Math.round(n * 0.06));   // これより近い隣どうしは見ない
  return poly.map((p, i) => {
    let m = Infinity;
    for (let j = 0; j < n; j++) {
      const d = Math.abs(i - j);
      if (Math.min(d, n - d) < apart) continue;
      const q = Math.hypot(p.x - poly[j].x, p.y - poly[j].y);
      if (q < m) m = q;
    }
    return m;
  });
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
 *
 * ★★`dim` は**段をいくつ下げるか**。このアプリの規則「陰の手当ては群にまとめて
 * 1度だけ段を下げる」を、表を焼くときに済ませる（uniform を足さないので、
 * シェーダーの差し替えは触らずに済む）。引っ込んだ面は光が届きにくいので暗い。
 * ★いちばん暗い段で止まるので、6段から外へ出ない。
 */
export function toneRamp(dim = 0): DataTexture {
  const ramp = NIPPER_PAINT.ramp.map((_, i) => NIPPER_PAINT.ramp[Math.max(0, i - dim)]);
  const data = new Uint8Array(ramp.length * 4);
  ramp.forEach((hex: string, i: number) => {
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
 * ★★★**金属らしさ**（第70巡・ユーザー指定「鈍い鉛色に、光沢とすり傷」）。
 *
 * 段（フラットな帯）は**アプリの語彙なので土台に残す**。その上へ2つ重ねる:
 * 1. **光沢** … 段とは別の、なめらかなハイライト。段だけだと平らな塗りに見える。
 * 2. **すり傷** … 段の境目を荒らし、光沢に筋を入れる。
 *
 * ★★**すり傷は「物の座標」で作る**（UV を張らない）。`buildPart` は押し出しで
 *   面を作るので UV が無く、張ると側面が伸びて汚れる。物の座標なら、面でも
 *   小口でも同じ密度の筋が入る。
 * ★向きは図の x へ 20° 寝かせた筋。工具は縦長なので、真横だと縞に見える。
 */
export interface SteelBounce {
  /** 券の紙の色。 */ uBounce: { value: Color };
  /** 券の中心（★**視点座標**）。 */ uBounceAt: { value: Vector3 };
  /** 強さ（0 で映り込み無し）。 */ uBounceAmt: { value: number };
}

/** 映り込みの入れ物を作る（既定は無し）。 */
export const steelBounce = (): SteelBounce => ({
  uBounce: { value: new Color(0xffffff) },
  uBounceAt: { value: new Vector3(0, 0, 1) },
  uBounceAmt: { value: 0 },
});

export function applySteel(m: MeshToonMaterial, u: SteelBounce = steelBounce()) {
  const P = NIPPER_PAINT;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "varying vec3 vObj;\nvarying vec3 vObjN;\nvarying vec3 vVpos;\nvoid main() {")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n\tvObjN = objectNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvObj = position;")
      .replace("#include <project_vertex>", "#include <project_vertex>\n\tvVpos = - mvPosition.xyz;");
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <gradientmap_pars_fragment>",
      `uniform sampler2D gradientMap;
       varying vec3 vObj;
       varying vec3 vObjN;
       varying vec3 vVpos;
       // ★normalMatrix は既定では**頂点側にしか宣言が無い**。値は three が毎回
       //   入れてくれるので、こちらで宣言すれば断片側でも使える。
       uniform mat3 normalMatrix;
       uniform vec3 uBounce;
       uniform vec3 uBounceAt;
       uniform float uBounceAmt;
       float nHash( float p ) { p = fract( p * 0.1031 ); p *= p + 33.33; p *= p + p; return fract( p ); }
       float nLine( float x ) { float i = floor( x ), f = fract( x );
         f = f * f * ( 3.0 - 2.0 * f );
         return mix( nHash( i ), nHash( i + 1.0 ), f ); }
       vec2 rot2( vec2 v, float a ) { float c = cos( a ), s = sin( a );
         return vec2( c * v.x - s * v.y, s * v.x + c * v.y ); }
       // ★★**すり傷は1層＝1つの向き＋1つの太さ**。層を重ねて多方向にする。
       //   seg が**線を短く切る** ―― これが無いと端から端まで走る筋になり、
       //   実物（1本1本が短く、太さがまちまち）とまるで違う（第70巡・写真が正）。
       float scLayer( vec3 o, float ang, float freq, float cut, float seed ) {
         vec2 q = rot2( o.xy, ang );
         float line = smoothstep( cut, 1.0, nLine( q.y * freq + o.z * 0.20 + seed ) );
         float seg  = smoothstep( 0.42, 0.88, nLine( q.x * freq * 0.13 + seed * 0.7 ) );
         return line * seg;
       }
       // ★向きは等間隔にしない（等間隔は格子に見える）。刻みが細かい層ほど細い線。
       float scratchAt( vec3 o ) {
         return scLayer( o, 0.30, 0.085, 0.78, 11.0 ) * 1.00
              + scLayer( o, 1.15, 0.170, 0.82, 37.0 ) * 0.85
              + scLayer( o, 2.06, 0.260, 0.85, 61.0 ) * 0.70
              + scLayer( o, 2.76, 0.420, 0.87, 89.0 ) * 0.55;
       }
       // ★**うねり** … 鍛えた面のゆるい濃淡（−0.5〜0.5）。周期は 100 単位ほど。
       //   ★2方向にする（1方向だと刷毛目に見える）。
       float sheenAt( vec3 o ) {
         vec2 a = rot2( o.xy, 0.55 ), b = rot2( o.xy, 2.30 );
         return nLine( a.y * 0.011 + a.x * 0.0016 ) * 0.40
              + nLine( b.y * 0.019 + b.x * 0.0024 ) * 0.34
              + nLine( a.y * 0.041 + o.z * 0.02 ) * 0.26 - 0.5;
       }
       // 場の傾き。★**うねりとすり傷は刻みが2桁違う**ので、別々に取って
       //   別々の強さで法線へ効かせる（1つにまとめると細かいほうが全部食う）。
       vec3 gradOf( vec3 o, float e, int kind ) {
         float f = kind == 0 ? sheenAt( o ) : scratchAt( o );
         vec3 d;
         d.x = ( kind == 0 ? sheenAt( o + vec3( e, 0.0, 0.0 ) ) : scratchAt( o + vec3( e, 0.0, 0.0 ) ) ) - f;
         d.y = ( kind == 0 ? sheenAt( o + vec3( 0.0, e, 0.0 ) ) : scratchAt( o + vec3( 0.0, e, 0.0 ) ) ) - f;
         d.z = ( kind == 0 ? sheenAt( o + vec3( 0.0, 0.0, e ) ) : scratchAt( o + vec3( 0.0, 0.0, e ) ) ) - f;
         return d / e;
       }
       vec3 tang( vec3 g, vec3 n ) { return g - dot( g, n ) * n; }
       vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
         float t = ( dot( normal, lightDirection ) + ${SKY.toFixed(3)} * normal.y
                   - ${LIT_LOW.toFixed(3)} ) / ${LIT_SPAN.toFixed(3)};
         return texture2D( gradientMap, vec2( clamp( t, 0.0, 1.0 ), 0.0 ) ).rgb;
       }`,
    ).replace(
      "#include <opaque_fragment>",
      `#if NUM_DIR_LIGHTS > 0
         // ★★★**平らな面は、そのままでは光沢も濃淡も一定になる**（法線も視線も
         //   変わらないので）。金属に見せるには2つ要る:
         //   ① 面のむら … 段を**通さず**に足すなめらかな濃淡（段は6つしか無いので、
         //      段のほうを揺らしても境目を越えず何も起きない ―― 第70巡に実測）。
         //   ② 光沢 … **うねりとすり傷で法線を傾けてから**当てる。
         // ★傾きは**物の座標での差分**で取る（画面微分だと縮尺で見え方が変わり、
         //   線が点線に切れる ―― 第70巡に実測）。
         vec3 nO = normalize( vObjN
                    - tang( gradOf( vObj, 40.0, 0 ), vObjN ) * 30.0    // うねり（ゆるい）
                    - tang( gradOf( vObj,  2.0, 1 ), vObjN ) * 0.10 ); // すり傷（細い）
         vec3 nB = normalize( normalMatrix * nO );
         vec3 sL = normalize( directionalLights[ 0 ].direction );
         vec3 sH = normalize( sL + normalize( vVpos ) );
         float dh = max( dot( nB, sH ), 0.0 );
         // ★山は2つ … 鋭い芯と、そのまわりの広い明るみ（実物の写真がそうなっている）。
         // ★広い山は**弱く**。強くすると面ぜんぶが持ち上がって白く飛び、
         //   「鈍い鉛色」ではなく銀色のプラスチックに見える（第70巡に実測）。
         float sp = pow( dh, ${P.shine.toFixed(1)} ) + pow( dh, ${(P.shine / 6).toFixed(2)} ) * 0.10;
         // ★★**券の色の映り込み** … 券のほうを向いた面にだけ乗せる。
         //   uBounceAt は視点座標、- vVpos が断片の視点座標なので、差が向き。
         vec3 bDir = normalize( uBounceAt + vVpos );
         float bq = max( dot( nB, bDir ), 0.0 );
         outgoingLight += vec3( sheenAt( vObj ) * ${(P.scratch * 0.16).toFixed(3)}   // 面のむら
                              + sp * ${P.gloss.toFixed(3)}                            // 光沢
                              + scratchAt( vObj ) * ${(P.gloss * 0.14).toFixed(3)} )  // すり傷の照り
                       + uBounce * bq * bq * uBounceAmt;
       #endif
       #include <opaque_fragment>`,
    );
  };
  // ★同じ差し替えをした材質どうしでシェーダーを使い回させる。
  m.customProgramCacheKey = () => "nipper-steel";
}

/**
 * ★**段の表のどこに当たるか**を JS 側でも引けるようにする（式は上の1つだけ）。
 * 画面と平行な面が何色になるかが分かるので、**その色をあらかじめ割っておけば
 * 「正面を向いた面が狙いの色そのものになる」**（`TicketStage` の紙がそれ）。
 */
export function appTone(n: Vector3, light: Vector3): Color {
  const t = (n.dot(light) + SKY * n.y - LIT_LOW) / LIT_SPAN;
  const ramp = NIPPER_PAINT.ramp;
  const i = Math.min(ramp.length - 1, Math.max(0, Math.floor(Math.min(Math.max(t, 0), 1) * ramp.length)));
  return new Color(ramp[i]);
}

/**
 * 光の強さ。★three は拡散を 1/π するので、**π を入れて 1 に戻す**。
 * こうすると画面に出る色が段の表の色そのものになる。
 */
export const LIGHT_INTENSITY = Math.PI;

// ---- 辺を点に開く --------------------------------------------------------
/**
 * ★★片の**辺の並び**（直線と円弧）を点に開く（`lib/nipperShape.ts` の `NipperPiece`）。
 * 20巡目に、なぞった点の羅列をやめて辺で持つようにした。立体を組むのは点なので、
 * ここで開く。**円弧は約4°刻み**。
 * ★段の境目の印は**辺ごと**なので、開いた点すべてにその辺の印を配る。
 */
export function flattenPiece(piece: NipperPiece): { poly: P2[]; inner: boolean[] } {
  const poly: P2[] = [];
  const inner: boolean[] = [];
  let cur = piece.start;
  for (const e of piece.edges) {
    const seg: P2[] = [];
    if (e.r && e.c) {
      const TAU = Math.PI * 2;
      const a0 = Math.atan2(cur.y - e.c.y, cur.x - e.c.x);
      const a1 = Math.atan2(e.to.y - e.c.y, e.to.x - e.c.x);
      const d = e.ccw ? ((a1 - a0) % TAU + TAU) % TAU : -(((a0 - a1) % TAU + TAU) % TAU);
      const n = Math.max(1, Math.ceil(Math.abs(d) / (Math.PI / 45)));
      for (let i = 1; i <= n; i++) {
        const t = a0 + (d * i) / n;
        seg.push({ x: e.c.x + Math.cos(t) * e.r, y: e.c.y + Math.sin(t) * e.r });
      }
    } else {
      seg.push(e.to);
    }
    for (const q of seg) { poly.push(q); inner.push(!!e.inner); }
    cur = seg[seg.length - 1];
  }
  return { poly, inner };
}
