"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { PlayerMode } from "@/components/CassettePlayer";

// ★カセットプレイヤーの3Dモデル(SONY Sports Walkman WM-FS191)。
//
// ■ 寸法と配置は**写真を画像解析して測った値**を使う(2026-08-04)。
// ユーザー提供の正面写真をEXIFの向きに合わせて起こし(SONYが右上・本体は縦長)、
// 色でマスクを取って各要素の枠を実測した。本体の縦横比は 0.83。
// 以下の数値はすべて「蓋(黄色い前面)の枠を 0〜1 に正規化した比率」。
//   左のグレーの部品(スライドする蓋の留め具) x 0.00〜0.21 / y 0.11〜0.84
//   青いパネル                                x 0.21〜0.84 / y 0.12〜0.83
//   スモークの窓                              x 0.40〜0.77 / y 0.19〜0.76
//   SONY(右上)・sports(オレンジ)・WALKMAN FM/AM(白)・ラジオの目盛り
// 本体の右端には別部品のグレーの帯(蝶番側)があり、蓋はその手前で終わる。
//
// ■ 表面の文字・ロゴ・目盛りは **CanvasTexture** で描く。
// 板や箱を並べて字を表すより、実測した比率をそのまま2Dで描く方が正確で軽い。
// ExtrudeGeometry の既定のUVは使えない(ワールド座標がそのまま入る)ので、
// 前面の枠を 0〜1 に写す平面投影のUVを自分で作り直している(applyPlanarUV)。
//
// ■ 凹凸はジオメトリで作る(ユーザー指定「のっぺりしている」)。
//   ・蓋は大きな bevel を持つ ExtrudeGeometry = 縁が回り込んだ膨らみ
//   ・窓は shape の hole で開けた**本物の窪み**。奥にスモークの板を沈める
//   ・左のグレー部品は一段高い箱。滑り止めの窪みは小さな円柱を沈めて表現
//   ・下端に STOP/PLAY/REW/FF の丸ボタン4つ(細長い窪みの中)とネジ2本
//   ・上端に VOL/TUNING のギザギザのホイール2つ・PHONES・FUNCTIONのつまみ
//
// ■ 開き方(動画のとおり)
// 蓋は**右端**を蝶番にして、本のように手前へ開く(rotateY)。以前は左端を
// 軸にしていたが、実機は右開きだった。
//
// 単位は 1 ≒ 10cm のつもり。実機 96×116×39mm をそのまま比率にしている。

const W = 0.96;          // 本体の幅
const H = 1.16;          // 本体の高さ
const D = 0.39;          // 本体の厚み
const R = 0.15;          // 本体の角丸

const BAND = 0.070;      // 右端のグレーの帯(蝶番側)の幅
const LID_W = W - BAND;  // 蓋の幅
const LID_X = -BAND / 2; // 蓋の中心(本体の中心より少し左)
const HINGE_X = LID_X + LID_W / 2; // 蝶番(蓋の右端)

// 蓋の膨らみ(bevel)。前面の平らな部分はこのぶん内側になる。
const LID_BEVEL = 0.055;
const LID_THICK = 0.062;

// 蓋の枠を 0〜1 とした、実測の配置(すべて画像解析で測った値)。
const F = {
  latch:  { x0: 0.000, x1: 0.209, y0: 0.110, y1: 0.843 },
  blue:   { x0: 0.141, x1: 0.850, y0: 0.124, y1: 0.839 },
  window: { x0: 0.402, x1: 0.803, y0: 0.194, y1: 0.794 },
  sports: { x0: 0.197, y: 0.752 },
  walk:   { x0: 0.285, y: 0.815 },
  sony:   { x0: 0.546, y: 0.062 },
};

// 窓。蓋の枠を 0〜1 とした比率から、蓋のローカル座標へ直したもの。
const win = (x0: number, x1: number, y0: number, y1: number) => ({
  cx: ((x0 + x1) / 2 - 0.5) * LID_W,
  cy: (0.5 - (y0 + y1) / 2) * H,
  w: (x1 - x0) * LID_W,
  h: (y1 - y0) * H,
});
// 穴の位置は必ずテクスチャ側(F.window)と同じ値から作る。
const WIN = { ...win(F.window.x0, F.window.x1, F.window.y0, F.window.y1), r: 0.115 * LID_W };

const YELLOW = "#E8A00F";
const GREY = "#6E7176";
const GREY_DEEP = "#5C5C61";
const GREY_DARK = "#3A3A3D";
const TAPE_BODY = "#26262A";
const TAPE_DEEP = "#141416";
const HUB = "#CFCFC8";
const LABEL_PAPER = "#EFEDE6";

// ---- 前面の絵(実測した比率でそのまま描く)------------------------------------

function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  const rr = Array.isArray(r) ? r : [r, r, r, r]; // [TL, TR, BR, BL]
  c.beginPath();
  c.moveTo(x + rr[0], y);
  c.lineTo(x + w - rr[1], y);
  c.quadraticCurveTo(x + w, y, x + w, y + rr[1]);
  c.lineTo(x + w, y + h - rr[2]);
  c.quadraticCurveTo(x + w, y + h, x + w - rr[2], y + h);
  c.lineTo(x + rr[3], y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - rr[3]);
  c.lineTo(x, y + rr[0]);
  c.quadraticCurveTo(x, y, x + rr[0], y);
  c.closePath();
}

// sports / WALKMAN は**窓の上にも刷られている**(実機の写真で確認)。窓は
// 実際には穴が開いているので、同じ絵を窓のガラスの上にもう一度だけ薄い板で
// 重ねる。そのために描画をこの関数へ切り出してある。
function drawLogos(c: CanvasRenderingContext2D, X: (v: number) => number, Y: (v: number) => number, S: (v: number) => number) {
  c.save();
  c.translate(X(F.sports.x0), Y(F.sports.y));
  c.transform(1, 0, -0.20, 1, 0, 0);
  c.fillStyle = "#E4551F";
  c.font = `italic 900 ${Math.round(S(0.165))}px sans-serif`;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.fillText("sports", 0, 0);
  c.restore();

  c.save();
  c.translate(X(F.walk.x0), Y(F.walk.y));
  c.transform(1, 0, -0.12, 1, 0, 0);
  c.fillStyle = "#F2F4F6";
  c.font = `900 ${Math.round(S(0.084))}px sans-serif`;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.fillText("WALKMAN", 0, 0);
  c.font = `700 ${Math.round(S(0.048))}px sans-serif`;
  c.fillText("FM/AM", S(0.425), S(-0.010));
  c.restore();
}

function makeFrontTexture(): THREE.CanvasTexture {
  const PX = 1024;
  const cv = document.createElement("canvas");
  cv.width = PX;
  cv.height = Math.round((PX * H) / LID_W);
  const c = cv.getContext("2d")!;
  const X = (v: number) => v * cv.width;
  const Y = (v: number) => v * cv.height;

  c.fillStyle = YELLOW;
  c.fillRect(0, 0, cv.width, cv.height);

  // 青いパネル。左上が大きく丸い独特の輪郭(実測: 左端が上へ行くほど右へ寄る)。
  const B = F.blue;
  c.fillStyle = "#2C5D9B";
  roundRectPath(c, X(B.x0), Y(B.y0), X(B.x1 - B.x0), Y(B.y1 - B.y0),
    [X(0.36), X(0.22), X(0.13), X(0.05)]);
  c.fill();
  const g = c.createLinearGradient(0, Y(B.y0), 0, Y(B.y1));
  g.addColorStop(0, "rgba(255,255,255,0.14)");
  g.addColorStop(0.45, "rgba(255,255,255,0.02)");
  g.addColorStop(1, "rgba(0,0,0,0.12)");
  c.fillStyle = g;
  c.fill();

  // スモークの窓(ジオメトリでは穴。ここは穴の縁より少し大きめの暗い面)。
  const N = F.window;
  c.fillStyle = "#1B2126";
  roundRectPath(c, X(N.x0), Y(N.y0), X(N.x1 - N.x0), Y(N.y1 - N.y0), X(0.115));
  c.fill();

  // ラジオの目盛り。
  c.textBaseline = "middle";
  c.strokeStyle = "#DCE6EE";
  c.lineWidth = Math.max(1, X(0.004));
  c.beginPath();
  c.ellipse(X(0.268), Y(0.183), X(0.032), Y(0.014), 0, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = "#DCE6EE";
  c.font = `${Math.round(X(0.030))}px sans-serif`;
  c.textAlign = "center";
  c.fillText("AVLS", X(0.268), Y(0.183));
  c.font = `600 ${Math.round(X(0.054))}px sans-serif`;
  c.textAlign = "left";
  c.fillText("WM-FS191", X(0.253), Y(0.213));
  c.font = `600 ${Math.round(X(0.052))}px sans-serif`;
  c.fillText("AM", X(0.266), Y(0.245));
  c.fillText("FM", X(0.404), Y(0.245));

  // つまみが走る縦の溝と、いまの位置。
  c.fillStyle = "#141A1F";
  roundRectPath(c, X(0.328), Y(0.253), X(0.033), Y(0.318), X(0.016));
  c.fill();
  c.fillStyle = "#9FC0AE";
  roundRectPath(c, X(0.320), Y(0.347), X(0.049), Y(0.017), X(0.006));
  c.fill();

  // 目盛りの細い線と数字(AMは溝の左・FMは右)。
  c.fillStyle = "rgba(214,196,224,0.7)";
  for (let i = 0; i < 6; i++) c.fillRect(X(0.244), Y(0.270 + i * 0.047), X(0.062), Math.max(1, Y(0.0022)));
  for (let i = 0; i < 6; i++) c.fillRect(X(0.366), Y(0.278 + i * 0.044), X(0.052), Math.max(1, Y(0.0022)));
  c.fillStyle = "#E4ECF3";
  c.font = `600 ${Math.round(X(0.052))}px sans-serif`;
  const am: [string, number][] = [["170", 0.274], ["140", 0.301], ["120", 0.325], ["100", 0.348], ["70", 0.436], ["53", 0.505]];
  const fm: [string, number][] = [["108", 0.286], ["104", 0.313], ["100", 0.340], ["96", 0.383], ["92", 0.437], ["88", 0.492]];
  c.textAlign = "right";
  for (const [t, y] of am) c.fillText(t, X(0.318), Y(y));
  c.textAlign = "left";
  for (const [t, y] of fm) c.fillText(t, X(0.362), Y(y));
  c.fillStyle = "#DCE6EE";
  c.font = `600 ${Math.round(X(0.044))}px sans-serif`;
  c.textAlign = "left";
  c.fillText("×10", X(0.216), Y(0.560));
  c.fillText("kHz", X(0.216), Y(0.592));
  c.fillText("MHz", X(0.356), Y(0.576));

  // 窓の左端に沿った小さな刷り文字。
  c.save();
  c.translate(X(0.520), Y(0.305));
  c.rotate(Math.PI / 2);
  c.fillStyle = "rgba(150,175,195,0.8)";
  c.font = `${Math.round(X(0.034))}px sans-serif`;
  c.textAlign = "left";
  c.fillText("Mastered in New York City", 0, 0);
  c.restore();

  drawLogos(c, X, Y, X);

  // SONY(右上)。字間を広めに。
  c.fillStyle = "#3C4650";
  c.font = `700 ${Math.round(X(0.068))}px serif`;
  c.textAlign = "left";
  c.textBaseline = "middle";
  let sx = X(F.sony.x0);
  for (const ch of "SONY") {
    c.fillText(ch, sx, Y(F.sony.y));
    sx += c.measureText(ch).width + X(0.014);
  }

  // 左のグレーの部品(ジオメトリでも作ってあるが、下地にも同じ形を置いて
  // 縁がずれて見えないようにする)。
  const L = F.latch;
  c.fillStyle = GREY;
  roundRectPath(c, X(L.x0 - 0.06), Y(L.y0), X(L.x1 - L.x0 + 0.06), Y(L.y1 - L.y0),
    [X(0.06), X(0.10), X(0.10), X(0.06)]);
  c.fill();
  c.fillStyle = "rgba(0,0,0,0.24)";
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 5; row++) {
      c.beginPath();
      c.ellipse(X(0.062 + col * 0.082), Y(0.198 + row * 0.0535), X(0.021), Y(0.0125), 0, 0, Math.PI * 2);
      c.fill();
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 窓の上に刷られたロゴだけを描いた、背景が透明なテクスチャ。
function makeWindowInkTexture(): THREE.CanvasTexture {
  const N = F.window;
  const PX = 512;
  const cv = document.createElement("canvas");
  const wN = N.x1 - N.x0;
  const hN = N.y1 - N.y0;
  cv.width = PX;
  cv.height = Math.round((PX * hN * H) / (wN * LID_W));
  const c = cv.getContext("2d")!;
  // 蓋の枠を基準にした座標へ合わせる(窓の左上ぶんだけずらす)。
  const X = (v: number) => ((v - N.x0) / wN) * cv.width;
  const Y = (v: number) => ((v - N.y0) / hN) * cv.height;
  // ★大きさは「蓋の幅に対する比率」なので、位置の写像とは別の倍率を使う。
  // ここをXで代用すると、窓の外にある値(0.165など)が負になり、文字の
  // 大きさが負になって一切描かれない。
  const S = (v: number) => (v / wN) * cv.width;
  drawLogos(c, X, Y, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- 形 ---------------------------------------------------------------------

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function roundedHole(cx: number, cy: number, w: number, h: number, r: number): THREE.Path {
  const p = new THREE.Path();
  const x = cx - w / 2;
  const y = cy - h / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  p.lineTo(x + w, y + h - r);
  p.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  p.lineTo(x + r, y + h);
  p.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  p.lineTo(x, y + r);
  p.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return p;
}

function shellGeometry(opts: {
  w: number; h: number; r: number; depth: number;
  bevel: number; thickness: number; segments?: number; hole?: THREE.Path;
}) {
  const shape = roundedRect(opts.w, opts.h, opts.r);
  if (opts.hole) shape.holes.push(opts.hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: opts.depth,
    bevelEnabled: true,
    bevelThickness: opts.thickness,
    bevelSize: opts.bevel,
    bevelOffset: 0,
    bevelSegments: opts.segments ?? 4,
    curveSegments: 10,
  });
  geo.computeVertexNormals();
  return geo;
}

// ★前面の絵を貼るためのUVを作り直す。ExtrudeGeometry の既定のUVには
// ワールド座標がそのまま入っていて 0〜1 にならないため、蓋の枠を 0〜1 に
// 写す平面投影を自分で入れる。側面・面取りの部分は縁の色が引き伸ばされる
// だけなので、黄色が自然に回り込む。
function applyPlanarUV(geo: THREE.BufferGeometry, w: number, h: number) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + w / 2) / w;
    uv[i * 2 + 1] = (pos.getY(i) + h / 2) / h;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

// ---- 中のテープ -------------------------------------------------------------

function Reel({ y, spinning }: { y: number; spinning: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spinning && ref.current) ref.current.rotation.z -= dt * 2.1;
  });
  return (
    <group ref={ref} position={[0.07, y, 0.031]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.115, 0.115, 0.012, 20]} />
        <meshStandardMaterial color={HUB} roughness={0.7} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]} position={[0, 0, 0.008]}>
          <boxGeometry args={[0.085, 0.010, 0.008]} />
          <meshStandardMaterial color={TAPE_DEEP} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.034, 0.034, 0.014, 12]} />
        <meshStandardMaterial color={TAPE_DEEP} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Tape({ spinning }: { spinning: boolean }) {
  const geo = useMemo(() => shellGeometry({ w: 0.62, h: 0.86, r: 0.03, depth: 0.03, bevel: 0.008, thickness: 0.008, segments: 2 }), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial color={TAPE_BODY} roughness={0.62} />
      </mesh>
      <mesh position={[-0.19, 0, 0.042]}>
        <boxGeometry args={[0.15, 0.74, 0.006]} />
        <meshStandardMaterial color={LABEL_PAPER} roughness={0.9} />
      </mesh>
      <Reel y={0.21} spinning={spinning} />
      <Reel y={-0.21} spinning={spinning} />
    </group>
  );
}

// ---- 蓋 ---------------------------------------------------------------------

// 蓋の本体。窓は shape の hole で開けた本物の窪み。前面の絵はテクスチャ。
function Lid() {
  const geo = useMemo(() => {
    const g = shellGeometry({
      w: LID_W, h: H, r: R, depth: 0.02,
      bevel: LID_BEVEL, thickness: LID_THICK, segments: 4,
      hole: roundedHole(WIN.cx, WIN.cy, WIN.w, WIN.h, WIN.r),
    });
    applyPlanarUV(g, LID_W, H);
    return g;
  }, []);
  const tex = useMemo(() => makeFrontTexture(), []);
  useEffect(() => () => { geo.dispose(); tex.dispose(); }, [geo, tex]);
  return (
    <mesh geometry={geo} castShadow>
      <meshStandardMaterial map={tex} roughness={0.42} metalness={0.02} />
    </mesh>
  );
}

// 左のグレーの部品。一段高い箱＋滑り止めの窪み(沈めた円)。
function Latch() {
  const { x0, x1, y0, y1 } = F.latch;
  const cx = ((x0 - 0.06 + x1) / 2 - 0.5) * LID_W;
  const cy = (0.5 - (y0 + y1) / 2) * H;
  const geo = useMemo(() => shellGeometry({
    w: (F.latch.x1 - F.latch.x0 + 0.06) * LID_W, h: (F.latch.y1 - F.latch.y0) * H, r: 0.055,
    depth: 0.010, bevel: 0.014, thickness: 0.016, segments: 3,
  }), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group position={[cx, cy, 0.052]}>
      <mesh geometry={geo}>
        <meshStandardMaterial color={GREY} roughness={0.86} />
      </mesh>
      {/* 滑り止め。円を少し沈めて、影で凹んで見えるようにする。 */}
      {Array.from({ length: 10 }, (_, i) => {
        const col = i % 2, row = (i / 2) | 0;
        const px = (0.062 + col * 0.082 - (x0 - 0.06 + x1) / 2) * LID_W;
        const py = ((y0 + y1) / 2 - (0.198 + row * 0.0535)) * H;
        return (
          <mesh key={i} position={[px, py, 0.016]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.019, 0.019, 0.012, 12]} />
            <meshStandardMaterial color={GREY_DEEP} roughness={0.95} />
          </mesh>
        );
      })}
    </group>
  );
}

// 窓のスモーク板。蓋の面より**奥**に沈める(窪みとして読ませる)。実機では
// sports / WALKMAN のロゴが窓の上にも刷られているので、ガラスの表面に
// 同じ絵の薄い板を1枚だけ重ねる(穴を開けた蓋のテクスチャでは消えてしまうため)。
function WindowGlass() {
  const geo = useMemo(() => shellGeometry({
    w: WIN.w + 0.006, h: WIN.h + 0.006, r: WIN.r + 0.003,
    depth: 0.020, bevel: 0.008, thickness: 0.010, segments: 3,
  }), []);
  const ink = useMemo(() => makeWindowInkTexture(), []);
  useEffect(() => () => { geo.dispose(); ink.dispose(); }, [geo, ink]);
  return (
    <group position={[WIN.cx, WIN.cy, -0.004]}>
      <mesh geometry={geo}>
        <meshPhysicalMaterial
          color="#B9CEDF"
          transmission={1}
          thickness={0.04}
          roughness={0.12}
          ior={1.5}
          metalness={0}
          clearcoat={0.3}
          clearcoatRoughness={0.2}
          attenuationColor="#4E7EA8"
          attenuationDistance={2.4}
        />
      </mesh>
      <mesh position={[0, 0, 0.038]}>
        <planeGeometry args={[WIN.w, WIN.h]} />
        <meshBasicMaterial map={ink} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

// ---- 筐体 -------------------------------------------------------------------

// 下端の操作ボタン(STOP / PLAY / REW / FF)。細長い窪みの中に丸ボタンが4つ、
// 両端にネジ。写真(側面)のとおり。
function TransportButtons() {
  const y = -H / 2 + 0.012;
  const z = -D * 0.42;
  return (
    <group position={[0, y, z]}>
      {/* 窪んだ受け皿 */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.60, 0.10, 0.17]} />
        <meshStandardMaterial color={GREY_DEEP} roughness={0.9} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[-0.21 + i * 0.14, 0.028, 0]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.05, 16]} />
          <meshStandardMaterial color="#191A1C" roughness={0.5} />
        </mesh>
      ))}
      {/* ネジ */}
      {[-0.33, 0.33].map((x) => (
        <mesh key={x} position={[x, 0.02, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.03, 10]} />
          <meshStandardMaterial color="#9C9C9E" roughness={0.45} metalness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

// 上端のつまみ類(VOL / TUNING のホイール・PHONES・FUNCTION)。
function TopControls() {
  const y = H / 2;
  const z = -D * 0.42;
  return (
    <group position={[0, y, z]}>
      {/* ホイールが収まるグレーの受け */}
      <mesh position={[-0.20, -0.02, 0]}>
        <boxGeometry args={[0.30, 0.10, 0.20]} />
        <meshStandardMaterial color={GREY_DEEP} roughness={0.88} />
      </mesh>
      {/* ギザギザのホイール2つ。円柱の分割数を粗くして刻みを出す。 */}
      {[-0.27, -0.13].map((x) => (
        <mesh key={x} position={[x, -0.030, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.062, 0.062, 0.085, 14]} />
          <meshStandardMaterial color={GREY} roughness={0.75} />
        </mesh>
      ))}
      {/* FUNCTION のつまみ */}
      <mesh position={[0.06, -0.014, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.035, 14]} />
        <meshStandardMaterial color={GREY_DEEP} roughness={0.8} />
      </mesh>
      {/* PHONES の穴 */}
      <mesh position={[0.26, -0.004, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.03, 14]} />
        <meshStandardMaterial color="#17181A" roughness={0.6} />
      </mesh>
    </group>
  );
}

// 右端のグレーの帯(蝶番側)。2か所に窪みがある。
function HingeBand() {
  return (
    <group position={[W / 2 - BAND / 2, 0, -D * 0.30]}>
      <mesh>
        <boxGeometry args={[BAND, H - 0.10, D * 0.72]} />
        <meshStandardMaterial color={GREY} roughness={0.85} />
      </mesh>
      {[0.30, -0.30].map((y) => (
        <mesh key={y} position={[BAND / 2 - 0.004, y * H, 0]}>
          <boxGeometry args={[0.016, 0.22 * H, D * 0.34]} />
          <meshStandardMaterial color={GREY_DARK} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function BackShell() {
  const geo = useMemo(() => shellGeometry({
    w: W, h: H, r: R, depth: D - 0.16, bevel: 0.05, thickness: 0.055, segments: 4,
    hole: roundedHole(LID_X, 0, LID_W - 0.20, H - 0.22, 0.07),
  }), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group>
      <mesh geometry={geo} position={[0, 0, -(D - 0.16) - 0.055]}>
        <meshStandardMaterial color={YELLOW} roughness={0.5} metalness={0.02} />
      </mesh>
      {/* 窪みの底(メカの黒) */}
      <mesh position={[LID_X, 0, -0.2]}>
        <boxGeometry args={[LID_W - 0.16, H - 0.18, 0.02]} />
        <meshStandardMaterial color={GREY_DARK} roughness={0.95} />
      </mesh>
      <HingeBand />
      <TransportButtons />
      <TopControls />
    </group>
  );
}

// ---- 動き -------------------------------------------------------------------

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const DOOR_MS = 0.42;
const PUSH_AT = 0.34;
const PUSH_MS = 0.46;
const FLY_AT = 0.86;
const FLY_MS = 0.62;
// 開き切る角度。動画では本のように大きく開く。
const DOOR_OPEN = 2.05;

function Player({ mode }: { mode: PlayerMode }) {
  const door = useRef<THREE.Group>(null);
  const tape = useRef<THREE.Group>(null);
  const t = useRef(0);
  const sending = mode === "sending";

  useEffect(() => {
    if (sending) return;
    t.current = 0;
    if (door.current) door.current.rotation.y = 0;
    if (tape.current) {
      tape.current.position.set(LID_X, 0, -0.075);
      tape.current.scale.setScalar(1);
      tape.current.visible = true;
    }
  }, [sending]);

  useFrame((_, dt) => {
    if (!sending) return;
    t.current += dt;
    const p = t.current;
    // ★右端の蝶番。正の回転で、蓋の左端(自由な側)が手前へ開く。
    if (door.current) door.current.rotation.y = easeOut(clamp01(p / DOOR_MS)) * DOOR_OPEN;
    if (tape.current) {
      const push = easeOut(clamp01((p - PUSH_AT) / PUSH_MS));
      const fly = easeIn(clamp01((p - FLY_AT) / FLY_MS));
      tape.current.position.set(LID_X, fly * 1.5, -0.075 + push * 0.42);
      tape.current.scale.setScalar(1 - fly * 0.55);
      tape.current.visible = fly < 0.999;
    }
  });

  return (
    <group rotation={[0, -0.22, 0]}>
      <BackShell />
      <group ref={tape} position={[LID_X, 0, -0.075]}>
        <Tape spinning={mode === "recording"} />
      </group>
      {/* ★蓋。**右端**を軸に回すため、その位置にピボットのGroupを置く。 */}
      <group ref={door} position={[HINGE_X, 0, 0]}>
        {/* 蓋のジオメトリは bevelThickness のぶん手前と奥へ張り出すので、
            背面がちょうど z=0(筐体の前面)に載るよう前へずらす。 */}
        <group position={[-LID_W / 2, 0, LID_THICK]}>
          <Lid />
          <Latch />
          <WindowGlass />
        </group>
      </group>
    </group>
  );
}

export default function CassettePlayerScene({ mode, active = true }: { mode: PlayerMode; active?: boolean }) {
  return (
    <Canvas
      flat
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0.66, 0.60, 3.25], fov: 26 }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      frameloop={!active ? "never" : mode === "idle" ? "demand" : "always"}
      style={{ width: "100%", height: "100%", touchAction: "manipulation" }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[2.4, 3.2, 3.0]} intensity={1.5} />
      <directionalLight position={[-2.6, 0.6, 1.2]} intensity={0.5} />
      <pointLight position={[0.16, 0.05, -0.16]} intensity={0.35} distance={1.1} decay={2} />
      <Environment resolution={64} frames={1}>
        <Lightformer intensity={2.6} position={[0, 2.4, 1.4]} scale={[3, 1.4, 1]} />
        <Lightformer intensity={1.1} position={[-2.2, 0.4, 1.0]} scale={[1.4, 3, 1]} />
        <Lightformer intensity={0.7} position={[2.4, -0.6, 0.6]} scale={[1.4, 3, 1]} />
        <Lightformer intensity={0.5} form="ring" position={[0, 0, -3]} scale={4} />
      </Environment>
      <Player mode={mode} />
    </Canvas>
  );
}
