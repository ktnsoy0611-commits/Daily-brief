"use client";

import { useEffect, useRef } from "react";
import {
  Box3, OrthographicCamera, Scene, Vector3, WebGLRenderer,
} from "three";

import { buildNipperRig, nipperLights, NIPPER_SUN } from "@/lib/nipperRig";

// ★★開発用の三面図。**形を言葉で詰めるための道具**で、本番には出ない。
//   パースの付いた1枚では「どの面がおかしいか」を指せない。正面・側面・上面を
//   素直な正射影で並べて、面ごとに指摘できるようにする。
// ★この道具の機構は x–y 面にある（腕はここで開く）ので、**正面図が実物の側面写真に
//   あたる**。側面図は厚み、上面図は頭の断面を見る。
// ★★★**3面は同じ縮尺で並べる**（製図と同じ）。面ごとに枠へ合わせて拡大すると、
//   厚みと幅の関係が読めなくなり、指摘のしようがなくなる。
// ★★立体と光は `lib/nipperRig.ts` から取る ―― **本番と同じものを見るため**。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。

export type Ortho = "front" | "side" | "top";
const VIEWS: { id: Ortho; ja: string; eye: Vector3; up: Vector3 }[] = [
  { id: "front", ja: "正面", eye: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0) },
  { id: "side", ja: "側面", eye: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0) },
  { id: "top", ja: "上面", eye: new Vector3(0, 1, 0), up: new Vector3(0, 0, -1) },
];

/** 3面を収める高さ（px）。★目盛りの外（検証用の枠）。 */
const H = 460;
/** 枠のまわりの余白（工具の高さに対する割合）。 */
const PAD = 0.06;

export function NipperTriView({ label }: {
  label: (v: { id: Ortho; ja: string }) => React.ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    const slots = [...box.querySelectorAll<HTMLDivElement>("[data-view]")];
    const rig = buildNipperRig();
    const key = nipperLights();
    key.castShadow = false;   // 製図なので落ち影は要らない

    // ★★工具の広がりを**一度だけ**測り、3面で**同じ縮尺**を使う。
    //   面ごとに枠へ合わせると、厚みと幅の関係が読めなくなる。
    const b = new Box3().setFromObject(rig.root);
    const size = b.getSize(new Vector3());
    const center = b.getCenter(new Vector3());
    const span = Math.max(size.x, size.y, size.z) * (1 + PAD * 2);
    const scale = H / (Math.max(size.y, size.z) * (1 + PAD * 2));

    const made = slots.map((slot) => {
      const renderer = new WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      const canvas = renderer.domElement;
      canvas.style.display = "block";
      slot.appendChild(canvas);
      return { slot, renderer, canvas };
    });

    // 面ごとの縮尺は同じで、枠の大きさだけ面によって変える。
    const dims: Record<Ortho, [number, number]> = {
      front: [size.x, size.y], side: [size.z, size.y], top: [size.x, size.z],
    };

    const scene = new Scene();
    scene.add(rig.root, key, key.target);

    made.forEach(({ renderer, canvas }, i) => {
      const v = VIEWS[i];
      const [dw, dh] = dims[v.id];
      const w = Math.round(dw * (1 + PAD * 2) * scale);
      const h = Math.round(dh * (1 + PAD * 2) * scale);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      renderer.setSize(w, h, false);
      const half = span / 2;
      const cam = new OrthographicCamera(-half * (w / h), half * (w / h), half, -half, 1, 8000);
      cam.position.copy(center).add(v.eye.clone().multiplyScalar(3000));
      cam.up.copy(v.up);
      cam.lookAt(center);
      // 枠を工具の広がりへ詰める（縮尺は共通のまま）
      cam.left = -(dw * (1 + PAD * 2)) / 2;
      cam.right = (dw * (1 + PAD * 2)) / 2;
      cam.top = (dh * (1 + PAD * 2)) / 2;
      cam.bottom = -(dh * (1 + PAD * 2)) / 2;
      cam.updateProjectionMatrix();
      // ★光は**カメラと一緒に回す**。世界に固定すると側面と上面が真っ黒になる。
      key.position.copy(NIPPER_SUN).applyQuaternion(cam.quaternion)
        .multiplyScalar(2000).add(center);
      key.target.position.copy(center);
      key.target.updateMatrixWorld();
      renderer.render(scene, cam);
    });

    return () => {
      made.forEach(({ renderer, canvas }) => { renderer.dispose(); canvas.remove(); });
      rig.dispose();
    };
  }, []);

  return (
    <div ref={host} style={{ display: "contents" }}>
      {VIEWS.map((v) => (
        <div key={v.id}>
          {label(v)}
          <div data-view={v.id} />
        </div>
      ))}
    </div>
  );
}
