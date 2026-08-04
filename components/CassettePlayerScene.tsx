"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { PlayerMode } from "@/components/CassettePlayer";

// ★カセットプレイヤーの3Dモデル(React Three Fiber)。
//
// 平らな箱にテクスチャを貼るのはやめ、実機(SONY WM-FS191)と同じ**膨らみのある
// シェル**として組む。方針:
//   - 黄色いフロントシェルは ExtrudeGeometry。角丸長方形のShapeに大きめの
//     bevel(bevelThickness/bevelSize)を掛けることで、縁が丸く回り込んだ
//     三次曲面的な膨らみを作る。bevelSegmentsは4に抑えてポリゴン数を稼がない。
//   - 窓は Shape の **hole** として開ける。穴の縁にも同じbevelが掛かるので、
//     窓枠が自然に丸くなる。
//   - 質感はベタ塗り＋光の反射で見せる。筐体は MeshStandardMaterial(roughnessを
//     高めにしてマットな樹脂)、窓だけ MeshPhysicalMaterial(transmission)。
//   - 環境光は Lightformer で**その場で組む**(drei の preset は外部から HDRI を
//     取りに行くので、オフラインで動くPWAでは使わない)。
//
// 単位は 1 = 10cm 程度のつもり。実機の 91×116×36mm をそのまま比率にしている。

const W = 0.91;
const H = 1.16;
const D = 0.36;
const R = 0.15;      // 本体の角丸

// 窓(スモークの青いアクリル)。前面の右寄り。
const WIN = { x: 0.17, y: 0.02, w: 0.38, h: 0.64, r: 0.11 };

const YELLOW = "#E9A31B";
const GREY = "#7C7A73";
const GREY_DEEP = "#5D5B56";
const GREY_DARK = "#3E3D3A";
const BLUE = "#2B5B96";
const ORANGE = "#D9531E";
const TAPE_BODY = "#26262A";
const TAPE_DEEP = "#141416";
const HUB = "#CFCFC8";
const LABEL_PAPER = "#EFEDE6";

// 角丸長方形の Shape。中心が原点。
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

// 角丸長方形の Path(穴として使う)。
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

// ★膨らみのある殻を作る。bevel を大きく取ることで、平らな板ではなく
// 「縁が回り込んだ丸い塊」になる。steps=1・bevelSegments=4 なので、
// この形でも三角形は数百枚しかない。
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
          <boxGeometry args={[0.19, 0.016, 0.008]} />
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
      {/* 紙のラベル(長辺に沿った帯) */}
      <mesh position={[-0.19, 0, 0.042]}>
        <boxGeometry args={[0.15, 0.74, 0.006]} />
        <meshStandardMaterial color={LABEL_PAPER} roughness={0.9} />
      </mesh>
      <Reel y={0.21} spinning={spinning} />
      <Reel y={-0.21} spinning={spinning} />
    </group>
  );
}

// ---- 蓋(黄色いフロントシェル)------------------------------------------------

function FrontShell() {
  const geo = useMemo(() => shellGeometry({
    w: W, h: H, r: R, depth: 0.02,
    // ★ここが「膨らみ」の正体。厚み方向にも横方向にも大きく面取りする。
    bevel: 0.055, thickness: 0.062, segments: 4,
    hole: roundedHole(WIN.x, WIN.y, WIN.w, WIN.h, WIN.r),
  }), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} castShadow>
      <meshStandardMaterial color={YELLOW} roughness={0.52} metalness={0.02} />
    </mesh>
  );
}

// 蓋の表(青いラベル・目盛り・オレンジのロゴ・左のくぼみ)。すべて薄い板で、
// ポリゴンを使わない。
function DoorGraphics() {
  const labelGeo = useMemo(() => shellGeometry({ w: 0.27, h: 0.68, r: 0.03, depth: 0.004, bevel: 0.004, thickness: 0.003, segments: 2 }), []);
  useEffect(() => () => labelGeo.dispose(), [labelGeo]);
  return (
    <group>
      {/* 青いラベル(窓の左)。角丸の薄い板。 */}
      <mesh geometry={labelGeo} position={[-0.13, 0.0, 0.079]}>
        <meshStandardMaterial color={BLUE} roughness={0.65} />
      </mesh>
      {/* 縦のチューニング目盛りとつまみ */}
      <mesh position={[-0.16, 0.05, 0.087]}>
        <boxGeometry args={[0.035, 0.44, 0.004]} />
        <meshStandardMaterial color="#12161A" roughness={0.7} />
      </mesh>
      <mesh position={[-0.16, -0.02, 0.091]}>
        <boxGeometry args={[0.05, 0.03, 0.006]} />
        <meshStandardMaterial color="#B9C4C9" roughness={0.5} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={`t${i}`} position={[-0.215, 0.2 - i * 0.09, 0.086]}>
          <boxGeometry args={[0.04, 0.006, 0.003]} />
          <meshStandardMaterial color="#E7EAEC" roughness={0.7} />
        </mesh>
      ))}
      {/* オレンジのロゴ */}
      <mesh position={[-0.12, -0.26, 0.087]}>
        <boxGeometry args={[0.22, 0.04, 0.004]} />
        <meshStandardMaterial color={ORANGE} roughness={0.55} />
      </mesh>
      {/* 左のくぼみ(滑り止め) */}
      <mesh position={[-0.35, 0.0, 0.079]}>
        <boxGeometry args={[0.13, 0.72, 0.02]} />
        <meshStandardMaterial color={GREY_DEEP} roughness={0.85} />
      </mesh>
    </group>
  );
}

// 窓。★ここだけ重い MeshPhysicalMaterial を使い、分厚いアクリルとして
// 中のテープを透かす。
function Window() {
  const geo = useMemo(() => shellGeometry({
    w: WIN.w + 0.03, h: WIN.h + 0.03, r: WIN.r + 0.01,
    depth: 0.03, bevel: 0.018, thickness: 0.02, segments: 3,
  }), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position={[WIN.x, WIN.y, 0.012]}>
      <meshPhysicalMaterial
        color="#C3D8E8"
        transmission={1}
        thickness={0.04}
        roughness={0.1}
        ior={1.5}
        metalness={0}
        clearcoat={0.25}
        clearcoatRoughness={0.25}
        attenuationColor="#5C8FBE"
        attenuationDistance={3}
      />
    </mesh>
  );
}

// ---- 筐体(灰色のバックシェル)------------------------------------------------

function BackShell() {
  // ★中を空にした「受け皿」にする。塊のまま押し出すと前面が塞がってしまい、
  // 窓ごしにも蓋を開けても、中のテープが一切見えない(最初これで見えなかった)。
  // Shape に穴を開けると、その内壁がそのまま窪みの側面になる。
  const geo = useMemo(() => shellGeometry({
    w: W, h: H, r: R, depth: D - 0.16, bevel: 0.05, thickness: 0.055, segments: 4,
    hole: roundedHole(0, 0, W - 0.2, H - 0.22, 0.07),
  }), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group>
      <mesh geometry={geo} position={[0, 0, -(D - 0.16) - 0.055]}>
        <meshStandardMaterial color={GREY} roughness={0.82} metalness={0.02} />
      </mesh>
      {/* 窪みの底 */}
      <mesh position={[0, 0, -0.2]}>
        <boxGeometry args={[W - 0.16, H - 0.18, 0.02]} />
        <meshStandardMaterial color={GREY_DARK} roughness={0.95} />
      </mesh>
      {/* 天面の操作ボタン4つ */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[-0.24 + i * 0.16, H / 2 - 0.004, -0.1]}>
          <boxGeometry args={[0.12, 0.036, 0.08]} />
          <meshStandardMaterial color="#1D1D1E" roughness={0.55} />
        </mesh>
      ))}
      {/* 右の側面の通気の溝 */}
      {[0, 1, 2].map((i) => (
        <mesh key={`v${i}`} position={[W / 2 - 0.012, 0.16 - i * 0.16, -0.1]}>
          <boxGeometry args={[0.03, 0.045, 0.12]} />
          <meshStandardMaterial color={GREY_DARK} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

// ---- 動き -------------------------------------------------------------------

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

// 送信(sending)に入ってからの時刻で、蓋が開く→テープが押し出される→
// そのまま上へ送られていく、を順に進める。
const DOOR_MS = 0.42;
const PUSH_AT = 0.34;
const PUSH_MS = 0.46;
const FLY_AT = 0.86;
const FLY_MS = 0.62;

function Player({ mode }: { mode: PlayerMode }) {
  const door = useRef<THREE.Group>(null);
  const tape = useRef<THREE.Group>(null);
  const t = useRef(0);
  const sending = mode === "sending";

  // 待機・録音へ戻ったときは、その場で元の姿勢へ戻す(demandモードでも
  // 確実に描き直されるよう、ここで直接いじる)。
  useEffect(() => {
    if (sending) return;
    t.current = 0;
    if (door.current) door.current.rotation.y = 0;
    if (tape.current) {
      tape.current.position.set(0, 0, -0.075);
      tape.current.scale.setScalar(1);
      tape.current.visible = true;
    }
  }, [sending]);

  useFrame((_, dt) => {
    if (!sending) return;
    t.current += dt;
    const p = t.current;
    if (door.current) door.current.rotation.y = -easeOut(clamp01(p / DOOR_MS)) * 1.55;
    if (tape.current) {
      const push = easeOut(clamp01((p - PUSH_AT) / PUSH_MS));
      const fly = easeIn(clamp01((p - FLY_AT) / FLY_MS));
      tape.current.position.set(0, fly * 1.5, -0.075 + push * 0.42);
      tape.current.scale.setScalar(1 - fly * 0.55);
      tape.current.visible = fly < 0.999;
          }
  });

  return (
    <group rotation={[0, -0.34, 0]}>
      <BackShell />
      {/* 中のテープ */}
      <group ref={tape} position={[0, 0, -0.075]}>
        <Tape spinning={mode === "recording"} />
      </group>
      {/* ★蓋。左端(蝶番)を軸に回すため、その位置にピボットのGroupを置く。 */}
      <group ref={door} position={[-W / 2, 0, 0]}>
        {/* ★蓋のジオメトリは bevelThickness のぶん手前と奥へ張り出すので、
            背面がちょうど z=0(筐体の前面)に載るよう前へずらす。ここを
            合わせないと、蓋の内側と中のテープが同じ深さで交差する。 */}
        <group position={[W / 2, 0, 0.062]}>
          <FrontShell />
          <DoorGraphics />
          <Window />
        </group>
      </group>
    </group>
  );
}

export default function CassettePlayerScene({ mode, active = true }: { mode: PlayerMode; active?: boolean }) {
  return (
    <Canvas
      // ★`flat`(トーンマッピング無し)にして、ベタ塗りの色がそのまま出るように
      // する。写実に寄せるより、色面と反射で見せる方がこのアプリの語彙に合う。
      flat
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0.94, 1.02, 2.28], fov: 30 }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      // ★描き直す条件。画面に出ていなければ1フレームも回さない("never")。
      // 出ていても、待機中は必要なときだけ("demand")。回し続けるのは
      // 録音中と送信中だけ。
      frameloop={!active ? "never" : mode === "idle" ? "demand" : "always"}
      style={{ width: "100%", height: "100%", touchAction: "manipulation" }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[2.4, 3.2, 3.0]} intensity={1.5} />
      <directionalLight position={[-2.6, 0.6, 1.2]} intensity={0.5} />
      {/* 窪みの中を照らす小さな光。これが無いと窓ごしのテープが暗くなる。
          ★窓より**奥**に置くこと。手前に置くと窓の表面で強く光って
          白飛びし、中が何も見えなくなる。 */}
      <pointLight position={[0.16, 0.05, -0.16]} intensity={0.35} distance={1.1} decay={2} />
      {/* 環境光。外部のHDRIは取りに行かず、板状の光源をその場で並べて作る
          (オフラインでも動く・容量も増えない)。窓のtransmissionはこの
          反射を拾う。 */}
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
