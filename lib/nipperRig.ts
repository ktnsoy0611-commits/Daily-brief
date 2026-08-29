import {
  type BufferGeometry, DirectionalLight, Group, Mesh, MeshToonMaterial, type Object3D, Vector3,
} from "three";

import { buildPart, buildWire, toneRamp, applyAppTones, LIGHT_INTENSITY } from "@/lib/nipperMesh";
import {
  NIPPER_COIL, NIPPER_EXTENT, NIPPER_LEFT_PIECES, NIPPER_PIVOT, NIPPER_RIGHT_PIECES,
} from "@/lib/nipperShape";

// 改札鋏の**組み立て**。★本番の1体（`components/explore/Nipper.tsx`）と
//   検証用の三面図（`components/explore/NipperViews.tsx`）が**同じものを見る**ため、
//   立体と光はここ1か所で組む。別々に組んだら突き合わせる意味がない。

// 局所座標は **継ぎ目 × 頭の天が原点／+y が上／+x が右／+z が手前**。
// ★★形は `lib/nipperShape.ts` が正（平面図のトレース）。ここは**厚みと動き**だけ。

/**
 * ★★**半分の厚み**の表（0=厚 / 1=中 / 2=薄。2026-08-29 にユーザーが確定）。
 * **どこがどの段かは平面図の塗り分けが決める**（`lib/nipperShape.ts` の
 * `NIPPER_*_PIECES`）。ここは段に厚みを与えるだけ。
 *
 * ★18巡目まで「部品ごと＋肩から上だけ薄い」という **y の関数**で決めていたが、
 *   塗り分けは y の帯ではない（中と薄が y で重なる）ので表せなかった。
 */
export const HALF = [45, 40, 28];

/**
 * 押し切ったときの角（度）。★**正＝青の持ち手が右へ寄る**（＝開きが閉じる）。
 * ★16巡目までの SVG 版とは符号が逆 ―― SVG の `rotate()` は y が下向きなので
 *   時計回りが正、three.js は y が上向きなので反時計回りが正。
 */
export const THETA = 10;
/** 押し切ったときのバネの縮み（横へ詰まる）。 */
export const SQUEEZE = 0.34;

/** バネ。★輪の場所と大きさは図から拾う。脚だけは図の細い線を読めないので手で置く。 */
const COIL = {
  wire: 7,
  z: 26,
  legFar: [new Vector3(-20, -328, 24), new Vector3(120, -690, 26)],
  legNear: new Vector3(330, -640, 30),
};
export const COIL_ANCHOR_X = COIL.legNear.x;

/**
 * 光の向き（**カメラから見た**上・左・手前）。
 * ★ほぼ真横（左）から。正面寄りにすると正面も面取りも一緒に白く飛ぶ。
 * ★★三面図は**面ごとにこの向きへ光を置き直す**（世界に固定すると側面と上面が
 *   真っ黒になり、厚みを指摘できない ―― 17巡目に実測）。
 */
export const NIPPER_SUN = new Vector3(-0.86, 0.30, 0.42).normalize();
// ★★環境光は**入れない**。`MeshToonMaterial` の環境光は `gradientMap` を素通りして
//   暗部を持ち上げるので、段が潰れて絵が平たくなる（17巡目に実測）。
//   いちばん暗い段は `NIPPER_PAINT.ramp[0]` なので、黒く沈むことはない。

/** 図の広がりの中心。工具を原点まわりに置くのに使う。 */
export const NIPPER_CENTER = {
  x: (NIPPER_EXTENT.x0 + NIPPER_EXTENT.x1) / 2,
  y: (NIPPER_EXTENT.y0 + NIPPER_EXTENT.y1) / 2,
};

function coilPath(): Vector3[] {
  // ★★1周の折れ数。18巡目に 10 → 48（ユーザー指摘「リングがリングに見えない」）。
  //   ここだけは**滑らかにする** ― 輪は輪に見えないと道具に見えない。
  //   針金の**断面は8角形のまま**（アプリの語彙。太さも場所も変えない）。
  const N = 48;
  const pts = [...COIL.legFar];
  [{ r: NIPPER_COIL.r, dz: 0 }, { r: NIPPER_COIL.r - 3, dz: 4 }].forEach(({ r, dz }) => {
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2 - Math.PI * 0.75;
      pts.push(new Vector3(
        NIPPER_COIL.cx + Math.cos(t) * r, NIPPER_COIL.cy + Math.sin(t) * r, COIL.z + dz,
      ));
    }
  });
  pts.push(COIL.legNear);
  return pts;
}

export interface NipperRig {
  /** 図の中心が原点に来るようにずらした群。 */
  root: Group;
  /** 青の部品（支点まわりに回る）。 */
  lever: Group;
  /** バネ（押すと横へ詰まる）。 */
  coil: Group;
  dispose(): void;
}

/** 工具を組む。★立体は `lib/nipperMesh.ts`、形は `lib/nipperShape.ts`。 */
export function buildNipperRig(): NipperRig {
  const root = new Group();
  const tool = new Group();
  tool.position.set(-NIPPER_CENTER.x, -NIPPER_CENTER.y, 0);
  root.add(tool);

  const ramp = toneRamp();
  const steel = new MeshToonMaterial({ color: 0xffffff, gradientMap: ramp });
  applyAppTones(steel);
  const add = (g: BufferGeometry, parent: Group) => {
    const m = new Mesh(g, steel);
    m.castShadow = true;
    // ★自分の影は**受けない**。受けると影の中が真っ黒に落ちて、段が6つで収まらない。
    //   落ち影は床にだけ落とす（`components/explore/Nipper.tsx`）。
    m.receiveShadow = false;
    parent.add(m);
  };

  // 赤の部品（動かない）。★片は段ごとに分かれているが、**ひとつの部品**。
  for (const { poly, tier } of NIPPER_RIGHT_PIECES) add(buildPart(poly, HALF[tier]), tool);

  // 青の部品（支点まわりに回る）。
  // ★赤に挟まれているので正面では途中が隠れて切れて見えるが、**同じ群**＝ひとつの部品。
  const lever = new Group();
  lever.position.set(NIPPER_PIVOT.x, NIPPER_PIVOT.y, 0);
  tool.add(lever);
  for (const { poly, tier } of NIPPER_LEFT_PIECES) {
    const g = buildPart(poly, HALF[tier]);
    g.translate(-NIPPER_PIVOT.x, -NIPPER_PIVOT.y, 0);
    add(g, lever);
  }

  // バネ
  const coil = new Group();
  tool.add(coil);
  add(buildWire(coilPath(), COIL.wire), coil);

  return {
    root, lever, coil,
    dispose() {
      root.traverse((o: Object3D) => { if (o instanceof Mesh) o.geometry.dispose(); });
      steel.dispose();
      ramp.dispose();
    },
  };
}

/** 光。★向きだけが階調を決める（`gradientMap` の6段）。 */
export function nipperLights(): DirectionalLight {
  const key = new DirectionalLight(0xffffff, LIGHT_INTENSITY);
  key.position.copy(NIPPER_SUN).multiplyScalar(2000);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const c = key.shadow.camera;
  c.left = -900; c.right = 900; c.top = 1100; c.bottom = -1100;
  c.near = 100; c.far = 5000;
  return key;
}
