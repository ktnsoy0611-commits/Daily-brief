"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mesh, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Scene, ShadowMaterial,
  WebGLRenderer,
} from "three";

import { NIPPER_PAINT as P } from "@/lib/constants";
import {
  spring, springTo, settled, K_TRAVEL, D_TRAVEL, K_SETTLE, D_SETTLE,
} from "@/lib/spring";
import {
  buildNipperRig, nipperLights, COIL_ANCHOR_X, NIPPER_CENTER, SQUEEZE, THETA,
} from "@/lib/nipperRig";
import { NIPPER_EXTENT, NIPPER_SLOT, type P2 } from "@/lib/nipperShape";

// 改札鋏。★★★17巡目に **three.js（WebGL）** へ移した（2026-08-29 にユーザーが確定）。
//   9〜16巡目は SVG へ自前で投影していた（`lib/nipperSolid.ts`。撤去した）。
//   「板に見える」原因は描き方ではなく**立体そのもの**だったので、立体を作り直し
//   （`lib/nipperMesh.ts`）、光と遮蔽と影は本物に任せる。
//
// ★禁じられているのは **CSS の 3D 変形**（design.md 冒頭・Safari の描画崩れ）。
//   WebGL はそれとは別件で、iOS でも問題ない。
// ★段は `NIPPER_PAINT.ramp` の6色のまま（`MeshToonMaterial` の `gradientMap`）。
//   本物のなだらかな階調にはしない ―― アプリの語彙を破らないため。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。

/** カメラ。★消失点は**画面の中心**。器の場所で見え方が変わるのはこれのおかげ。 */
const FOV = 26;
const CAM_Z = 3400;
/**
 * 器のなかで工具が占める割合（残りは余白）。★縦横**どちらにも同じだけ**空ける ――
 * 縦だけ空けると、パースで手前へ迫った持ち手が横の縁で切れる（17巡目に実測）。
 */
const FIT = 0.74;

export function Nipper({
  open = 1, closing = false, away = { x: 0.22, y: 0.62 }, width = "100%", ground = true,
}: {
  /** 0=閉じ 1=開き。 */
  open?: number;
  /** 噛んだ瞬間だけ真に。 */
  closing?: boolean;
  /**
   * **(鋏の位置 − 画面の中心) ÷ カメラの高さ**。高さ1あたりの画面上のずれ。
   * ★消失点は画面の中心。掴んで動かすと、これが変わってパースが付いてくる。
   *   カメラを**逆向きに**ずらし、`setViewOffset` で器の中央へ引き戻して作る。
   */
  away?: P2;
  width?: number | string;
  /** 影の落ちる床を敷くか。券に重ねるときは偽。 */
  ground?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const want = pressed || closing ? 1 : 1 - open;
  const wantRef = useRef(want);
  wantRef.current = want;

  const host = useRef<HTMLDivElement>(null);
  const awayRef = useRef(away);
  awayRef.current = away;
  const fitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const box = host.current;
    if (!box) return;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    box.appendChild(canvas);

    const scene = new Scene();
    const camera = new PerspectiveCamera(FOV, 1, 10, CAM_Z * 3);

    const rig = buildNipperRig();
    scene.add(rig.root);
    const key = nipperLights();
    scene.add(key, key.target);

    // 床。★影だけを受ける（地はアプリの背景のまま）。
    const floorMat = new ShadowMaterial({ color: P.cast, opacity: P.castAlpha });
    const floor = new Mesh(new PlaneGeometry(6000, 6000), floorMat);
    floor.receiveShadow = true;
    floor.position.y = NIPPER_EXTENT.y0 - NIPPER_CENTER.y;
    floor.rotation.x = -Math.PI / 2;
    floor.visible = ground;
    rig.root.add(floor);

    // 器に合わせる。★縮尺は**高さ**で決める（横は影がはみ出してよい）。
    const fit = () => {
      const w = box.clientWidth, h = box.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      // ★カメラを `away` の**逆へ**ずらすと、工具が画角の軸から外れて一点透視が付く。
      //   そのままだと器の外へ出るので、`setViewOffset` で真ん中へ引き戻す。
      const a = awayRef.current;
      camera.position.set(-a.x * CAM_Z, a.y * CAM_Z, CAM_Z);
      camera.aspect = w / h;
      const shift = h / (2 * Math.tan((FOV * Math.PI) / 360));
      camera.setViewOffset(w, h, a.x * shift, a.y * shift, w, h);
      camera.updateProjectionMatrix();
      const visible = 2 * CAM_Z * Math.tan((FOV * Math.PI) / 360);
      rig.root.scale.setScalar((visible * FIT) / (NIPPER_EXTENT.y1 - NIPPER_EXTENT.y0));
    };
    fit();
    fitRef.current = fit;
    const ro = new ResizeObserver(fit);
    ro.observe(box);

    // 動き。★`lib/spring.ts` の減衰振動。閉じるときだけ**わずかに行き過ぎる**（ガチャン）。
    const s = spring(wantRef.current);
    let id = 0;
    const tick = () => {
      const w = wantRef.current;
      const shut = w > s.p;
      springTo(s, w, shut ? K_TRAVEL : K_SETTLE, shut ? D_TRAVEL : D_SETTLE);
      if (settled(s, w)) { s.p = w; s.v = 0; }
      rig.lever.rotation.z = (s.p * THETA * Math.PI) / 180;
      rig.coil.scale.x = 1 - s.p * SQUEEZE;
      rig.coil.position.x = COIL_ANCHOR_X * s.p * SQUEEZE;
      renderer.render(scene, camera);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);

    return () => {
      fitRef.current = null;
      cancelAnimationFrame(id);
      ro.disconnect();
      rig.dispose();
      floor.geometry.dispose();
      floorMat.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [ground]);

  // ★`away` が変わったら画角だけ引き直す（立体は組み直さない）。
  useEffect(() => { fitRef.current?.(); }, [away.x, away.y]);

  const release = useCallback(() => setPressed(false), []);

  return (
    <div ref={host} aria-hidden
      style={{ width, aspectRatio: NIPPER_ASPECT, touchAction: "none" }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release} />
  );
}

/** 器の縦横比（`width` から高さが決まる）。★余白は縦横同じなので図の比と同じ。 */
export const NIPPER_ASPECT =
  (NIPPER_EXTENT.x1 - NIPPER_EXTENT.x0) / (NIPPER_EXTENT.y1 - NIPPER_EXTENT.y0);

/**
 * 口（＝紙が入るスリット）が器のどこに来るか（左上からの割合）。
 * ★券の縁へ噛ませるとき、鋏をどこへ置けばよいかはこれで決まる。
 */
export const NIPPER_NOSE = {
  x: (1 - FIT) / 2 + FIT * ((NIPPER_SLOT.x0 + NIPPER_SLOT.x1) / 2 - NIPPER_EXTENT.x0)
    / (NIPPER_EXTENT.x1 - NIPPER_EXTENT.x0),
  y: (1 - FIT) / 2 + FIT * (NIPPER_EXTENT.y1 - (NIPPER_SLOT.y0 + NIPPER_SLOT.y1) / 2)
    / (NIPPER_EXTENT.y1 - NIPPER_EXTENT.y0),
};
