"use client";

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
// 蓋は**右端**を蝶番にして、本のように手前へ開く(rotateY)。
//
// ■ ★構造(2026-08-04・追加の写真5枚で作り直し)
// 「側面が全く違う。側面はグレーの範囲が多い」という指摘のとおり、
// **黄色いのは前面の蓋(プレート)だけで、筐体は全部グレー**だった。
// 蓋は本体の輪郭より内側に収まっていて、上下左右にグレーの縁が見える。
//   左の面 … 一番広いグレー。STOP/PLAY/REW/FF の丸ボタン4つが細長い窪みに
//            並び、ネジ2本。滑り止めの窪み(2列×5段)はここから前面へ回り込む。
//   上の面 … VOL・TUNING のギザギザのホイール、PHONES、FUNCTION/AVLS、BATT。
//   右の面 … 蝶番側。細長い窪みが2つ。
// 文字は **sports WALKMAN だけ**残す(ユーザー指定)。SONY・型番・AM/FMの
// 目盛りの数字などはすべて削除した。
//
// ■ 見た目は**フラットなベクター(アイソメトリック)**(2026-08-04・ユーザー
// 指定の参考画像に合わせて作り直し)。写実に寄せるのをやめる:
//   ・カメラは**平行投影(orthographic)**。遠近で歪まないので、面が素直な
//     色面として読める(参考画像はすべてこの投影)。
//   ・材質は MeshLambertMaterial + 平行光1本＋環境光。反射も映り込みも
//     持たせない。面の向きごとに明るさが1段変わるだけの、塗り分けになる。
//   ・面取り(bevel)は輪郭が丸まらない程度まで小さくして、縁を立てる。
//   ・窓は透過ガラス(transmission)をやめ、暗い半透明の板1枚。中のリールが
//     うっすら透ける。重い材質を1つも使わない。
//   ・影は落とさず、本体の後ろにずらした平らな面を1枚置くだけ(ベクターの
//     イラストが影を面で描くのと同じやり方)。
//
// 単位は 1 ≒ 10cm のつもり。実機 96×116×39mm をそのまま比率にしている。

const W = 0.96;          // 本体(グレーの筐体)の幅
const H = 1.16;          // 高さ
const D = 0.39;          // 厚み
const R = 0.14;          // 筐体の角丸

// ★黄色い蓋は本体より内側。左は滑り止めのグレー、右は蝶番のグレーが見える。
const LID_L = 0.190;     // 本体の左端から蓋の左端まで(比率)
const LID_R = 0.927;     // 本体の左端から蓋の右端まで(比率)
const LID_T = 0.020;     // 上下の縁(比率)
const LID_W = (LID_R - LID_L) * W;
const LID_H = (1 - LID_T * 2) * H;
const LID_X = (-0.5 + (LID_L + LID_R) / 2) * W;
const HINGE_X = LID_X + LID_W / 2;   // 蝶番(蓋の右端)
const LID_Z = D / 2;                 // 筐体の前面
const LID_BEVEL = 0.016;
const LID_THICK = 0.020;

// 左の滑り止め(前面へ回り込んだグレー)。
const GRIP = { x0: 0.000, x1: LID_L, y0: 0.110, y1: 0.843 };

const YELLOW = "#F5B01B";
const GREY = "#8A8E95";
const GREY_DEEP = "#6A6E75";
const GREY_DARK = "#3A3A3D";
const TAPE_BODY = "#26262A";
const TAPE_DEEP = "#141416";
const HUB = "#CFCFC8";
const LABEL_PAPER = "#EFEDE6";

// 窓を蓋のローカル座標へ。
const WIN = {
  cx: ((0.212 + 0.752) / 2 - 0.5) * LID_W,
  cy: (0.5 - (0.181 + 0.806) / 2) * LID_H,
  w: (0.752 - 0.212) * LID_W,
  h: (0.806 - 0.181) * LID_H,
  r: 0.125 * LID_W,
};

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

// 蓋(黄色いプレート)の枠を 0〜1 とした、実測の配置。写真から測った本体
// 基準の値を、蓋の枠へ写し直したもの。
const F = {
  blue:   { x0: 0.000, x1: 0.812, y0: 0.108, y1: 0.853 },
  window: { x0: 0.212, x1: 0.752, y0: 0.181, y1: 0.806 },
  slot:   { x0: 0.135, x1: 0.178, y0: 0.240, y1: 0.575 },
  sports: { x0: 0.010, y: 0.760 },
  walk:   { x0: 0.100, y: 0.826 },
};

// sports / WALKMAN は**窓の上にも刷られている**(実機の写真で確認)。窓は
// ジオメトリでは穴なので、同じ絵を窓のガラスの上にもう一度だけ薄い板で
// 重ねる。そのために描画をこの関数へ切り出してある。
// ★位置の写像(X)と大きさの倍率(S)は必ず分けること。窓用のキャンバスでは
// X が「窓の左上からの相対位置」になるため、大きさに X を流用すると窓の
// 外にある値が負になり、文字が一切描かれない。
function drawLogos(c: CanvasRenderingContext2D, X: (v: number) => number, Y: (v: number) => number, S: (v: number) => number) {
  c.save();
  c.translate(X(F.sports.x0), Y(F.sports.y));
  c.transform(1, 0, -0.20, 1, 0, 0);
  c.fillStyle = "#E4551F";
  c.font = `italic 900 ${Math.round(S(0.185))}px sans-serif`;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.fillText("sports", 0, 0);
  c.restore();

  c.save();
  c.translate(X(F.walk.x0), Y(F.walk.y));
  c.transform(1, 0, -0.12, 1, 0, 0);
  c.fillStyle = "#F2F4F6";
  c.font = `900 ${Math.round(S(0.094))}px sans-serif`;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.fillText("WALKMAN", 0, 0);
  c.restore();
}

// 蓋の表の絵。★文字は sports / WALKMAN だけ(ユーザー指定)。SONY・型番・
// AM/FMの目盛りの数字などは全部やめた。
function makeFrontTexture(): THREE.CanvasTexture {
  const PX = 1024;
  const cv = document.createElement("canvas");
  cv.width = PX;
  cv.height = Math.round((PX * LID_H) / LID_W);
  const c = cv.getContext("2d")!;
  const X = (v: number) => v * cv.width;
  const Y = (v: number) => v * cv.height;

  c.fillStyle = YELLOW;
  c.fillRect(0, 0, cv.width, cv.height);

  // 青いパネル。左上が大きく丸い独特の輪郭。左端は蓋の外(グレーの下)まで
  // 続いているので、枠の外から描き始める。
  const B = F.blue;
  c.fillStyle = "#3468AE";
  roundRectPath(c, X(B.x0 - 0.08), Y(B.y0), X(B.x1 - B.x0 + 0.08), Y(B.y1 - B.y0),
    [X(0.40), X(0.24), X(0.14), X(0.05)]);
  c.fill();

  // スモークの窓(ジオメトリでは穴。ここは穴の縁より少し大きめの暗い面)。
  const N = F.window;
  c.fillStyle = "#1B2126";
  roundRectPath(c, X(N.x0), Y(N.y0), X(N.x1 - N.x0), Y(N.y1 - N.y0), X(0.125));
  c.fill();

  // チューニングの溝と、いまの位置(文字は置かない)。
  const T = F.slot;
  c.fillStyle = "#141A1F";
  roundRectPath(c, X(T.x0), Y(T.y0), X(T.x1 - T.x0), Y(T.y1 - T.y0), X(0.021));
  c.fill();
  c.fillStyle = "#9FC0AE";
  roundRectPath(c, X(T.x0 - 0.010), Y(0.330), X(T.x1 - T.x0 + 0.020), Y(0.018), X(0.006));
  c.fill();

  drawLogos(c, X, Y, X);

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
  cv.height = Math.round((PX * hN * LID_H) / (wN * LID_W));
  const c = cv.getContext("2d")!;
  const X = (v: number) => ((v - N.x0) / wN) * cv.width;
  const Y = (v: number) => ((v - N.y0) / hN) * cv.height;
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
        <cylinderGeometry args={[0.088, 0.088, 0.012, 20]} />
        <meshLambertMaterial color={HUB} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]} position={[0, 0, 0.008]}>
          <boxGeometry args={[0.062, 0.009, 0.008]} />
          <meshLambertMaterial color={TAPE_DEEP} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.014, 12]} />
        <meshLambertMaterial color={TAPE_DEEP} />
      </mesh>
    </group>
  );
}

function Tape({ spinning }: { spinning: boolean }) {
  const geo = useMemo(() => shellGeometry({ w: 0.62, h: 0.86, r: 0.03, depth: 0.03, bevel: 0.005, thickness: 0.005, segments: 1 }), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group>
      <mesh geometry={geo}>
        <meshLambertMaterial color={TAPE_BODY} />
      </mesh>
      <mesh position={[-0.19, 0, 0.042]}>
        <boxGeometry args={[0.15, 0.74, 0.006]} />
        <meshLambertMaterial color={LABEL_PAPER} />
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
      w: LID_W, h: LID_H, r: 0.11, depth: 0.02,
      bevel: LID_BEVEL, thickness: LID_THICK, segments: 2,
      hole: roundedHole(WIN.cx, WIN.cy, WIN.w, WIN.h, WIN.r),
    });
    applyPlanarUV(g, LID_W, LID_H);
    return g;
  }, []);
  const tex = useMemo(() => makeFrontTexture(), []);
  useEffect(() => () => { geo.dispose(); tex.dispose(); }, [geo, tex]);
  return (
    <mesh geometry={geo} castShadow>
      <meshLambertMaterial map={tex} />
    </mesh>
  );
}

// 左のグレーの部品。一段高い箱＋滑り止めの窪み(沈めた円)。
// 左の滑り止め(前面へ回り込んだグレー)。窪みを10個沈める。
function Grip() {
  const cx = ((GRIP.x0 + GRIP.x1) / 2 - 0.5) * W;
  const cy = (0.5 - (GRIP.y0 + GRIP.y1) / 2) * H;
  const geo = useMemo(() => shellGeometry({
    w: (GRIP.x1 - GRIP.x0) * W, h: (GRIP.y1 - GRIP.y0) * H, r: 0.05,
    depth: 0.012, bevel: 0.006, thickness: 0.008, segments: 2,
  }), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group position={[cx, cy, D / 2 + 0.004]}>
      <mesh geometry={geo}>
        <meshLambertMaterial color={GREY} />
      </mesh>
      {Array.from({ length: 10 }, (_, i) => {
        const col = i % 2, row = (i / 2) | 0;
        const px = (0.055 + col * 0.070 - (GRIP.x0 + GRIP.x1) / 2) * W;
        const py = ((GRIP.y0 + GRIP.y1) / 2 - (0.200 + row * 0.052)) * H;
        return (
          <mesh key={i} position={[px, py, 0.016]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.017, 0.017, 0.012, 10]} />
            <meshLambertMaterial color={GREY_DEEP} />
          </mesh>
        );
      })}
    </group>
  );
}

// 窓のスモーク板。蓋の面より奥に沈める。ロゴは窓の上にも刷られているので、
// ガラスの表面に薄い板を1枚重ねる。
function WindowGlass() {
  const geo = useMemo(() => shellGeometry({
    w: WIN.w + 0.006, h: WIN.h + 0.006, r: WIN.r + 0.003,
    depth: 0.014, bevel: 0.005, thickness: 0.006, segments: 2,
  }), []);
  const ink = useMemo(() => makeWindowInkTexture(), []);
  useEffect(() => () => { geo.dispose(); ink.dispose(); }, [geo, ink]);
  return (
    <group position={[WIN.cx, WIN.cy, -0.004]}>
      <mesh geometry={geo}>
        <meshBasicMaterial color="#151A1E" transparent opacity={0.72} />
      </mesh>
      <mesh position={[0, 0, 0.030]}>
        <planeGeometry args={[WIN.w, WIN.h]} />
        <meshBasicMaterial map={ink} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

// ---- 筐体(全部グレー)--------------------------------------------------------

// ★左の面。一番広いグレーで、STOP/PLAY/REW/FF の丸ボタン4つが細長い窪みに
// 並び、両端にネジ。写真(側面)のとおり。
function LeftControls() {
  const x = -W / 2;
  return (
    <group position={[x, 0.02, -D * 0.16]} rotation={[0, -Math.PI / 2, 0]}>
      {/* 細長い窪み */}
      <mesh position={[0, 0, 0.006]}>
        <boxGeometry args={[D * 0.42, 0.74, 0.02]} />
        <meshLambertMaterial color={GREY_DEEP} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, 0.27 - i * 0.18, 0.028]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.062, 0.062, 0.05, 14]} />
          <meshLambertMaterial color="#1B1C1F" />
        </mesh>
      ))}
      {[0.45, -0.45].map((y) => (
        <mesh key={y} position={[0, y, 0.014]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.02, 10]} />
          <meshLambertMaterial color="#9C9C9E" />
        </mesh>
      ))}
    </group>
  );
}

// 上の面。VOL・TUNING のホイール、FUNCTION、PHONES。
function TopControls() {
  return (
    <group position={[0, H / 2, -D * 0.18]}>
      <mesh position={[-0.20, -0.012, 0]}>
        <boxGeometry args={[0.30, 0.05, D * 0.5]} />
        <meshLambertMaterial color={GREY_DEEP} />
      </mesh>
      {[-0.27, -0.13].map((x) => (
        <mesh key={x} position={[x, 0.008, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.055, 0.055, 0.075, 12]} />
          <meshLambertMaterial color={GREY} />
        </mesh>
      ))}
      <mesh position={[0.08, -0.004, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.03, 12]} />
        <meshLambertMaterial color={GREY_DEEP} />
      </mesh>
      <mesh position={[0.28, -0.006, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.040, 0.040, 0.024, 12]} />
        <meshLambertMaterial color="#17181A" />
      </mesh>
    </group>
  );
}

// 右の面(蝶番側)。細長い窪みが2つ。
function RightSide() {
  return (
    <group position={[W / 2 - 0.004, 0, -D * 0.10]}>
      {[0.30, -0.30].map((y) => (
        <mesh key={y} position={[0, y * H, 0]}>
          <boxGeometry args={[0.014, 0.24 * H, D * 0.30]} />
          <meshLambertMaterial color={GREY_DARK} />
        </mesh>
      ))}
    </group>
  );
}

// 筐体。★全部グレー。黄色いのは前面の蓋だけ。
function Chassis() {
  const geo = useMemo(() => shellGeometry({
    w: W, h: H, r: R, depth: D - 0.06, bevel: 0.016, thickness: 0.020, segments: 2,
    hole: roundedHole(LID_X, 0, LID_W - 0.12, H - 0.20, 0.06),
  }), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group>
      <mesh geometry={geo} position={[0, 0, -(D - 0.06) / 2 - 0.02]}>
        <meshLambertMaterial color={GREY} />
      </mesh>
      {/* 窪みの底(メカの黒) */}
      <mesh position={[LID_X, 0, -D * 0.34]}>
        <boxGeometry args={[LID_W - 0.10, H - 0.18, 0.02]} />
        <meshLambertMaterial color={GREY_DARK} />
      </mesh>
      <LeftControls />
      <TopControls />
      <RightSide />
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
      tape.current.position.set(LID_X, 0, -0.02);
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
      tape.current.position.set(LID_X, fly * 1.5, -0.02 + push * 0.42);
      tape.current.scale.setScalar(1 - fly * 0.55);
      tape.current.visible = fly < 0.999;
    }
  });

  return (
    <group rotation={[0, -0.22, 0]}>
      {/* 平らな影。ベクターのイラストが影を「ずらした面」で描くのと同じで、
          光も影の計算も使わない(重い shadowMap を一切持たない)。 */}
      <mesh position={[0.16, -0.13, -D * 0.9]}>
        <planeGeometry args={[W * 1.02, H * 1.02]} />
        <meshBasicMaterial color="#1A1A18" transparent opacity={0.10} />
      </mesh>
      <Chassis />
      <Grip />
      <group ref={tape} position={[LID_X, 0, -0.02]}>
        <Tape spinning={mode === "recording"} />
      </group>
      {/* ★蓋。**右端**を軸に回すため、その位置にピボットのGroupを置く。 */}
      <group ref={door} position={[HINGE_X, 0, LID_Z]}>
        {/* 蓋のジオメトリは bevelThickness のぶん手前と奥へ張り出すので、
            背面がちょうど z=0(筐体の前面)に載るよう前へずらす。 */}
        <group position={[-LID_W / 2, 0, LID_THICK]}>
          <Lid />
          <WindowGlass />
        </group>
      </group>
    </group>
  );
}

export default function CassettePlayerScene({ mode, active = true }: { mode: PlayerMode; active?: boolean }) {
  return (
    <Canvas
      // ★平行投影(orthographic)。参考にしたベクターのイラストと同じで、
      // 遠近で歪まないぶん、面が素直な色面として読める。
      orthographic
      flat
      dpr={[1, 2]}
      // ★トーンマッピングを**明示的に切る**。有効なままだと色が圧縮されて、
      // 黄色はくすんだオリーブに、青は白っぽく寝てしまう(実測: テクスチャの
      // (245,176,27) が画面では (170,121,15) になっていた)。ベタ塗りの色を
      // そのまま出したいので、ここは必ず NoToneMapping。
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping }}
      camera={{ position: [0.92, 0.62, 3.0], zoom: 150, near: -10, far: 20 }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      frameloop={!active ? "never" : mode === "idle" ? "demand" : "always"}
      style={{ width: "100%", height: "100%", touchAction: "manipulation" }}
    >
      {/* 光は2本だけ。環境マップ(映り込み)は持たせない——面の向きごとに
          明るさが1段変わるだけの、塗り分けにするため。
          ★three r155以降は光の強さが物理単位(1/πが掛かる)になっている。
          実測で、合計 1.09 のつもりが画面では 0.37 倍(=1.09/π)になっていて、
          黄色がくすんだオリーブに見えていた。**π倍のオーダーで指定する**こと。
          いまは正面の面が およそ (2.2 + 1.7×0.66)/π ≒ 1.06 倍になり、
          テクスチャの色がほぼそのまま出る。 */}
      <ambientLight intensity={2.2} />
      <directionalLight position={[-1.0, 2.6, 2.4]} intensity={1.7} />
      <directionalLight position={[2.6, 0.2, 1.2]} intensity={0.45} />
      <Player mode={mode} />
    </Canvas>
  );
}
