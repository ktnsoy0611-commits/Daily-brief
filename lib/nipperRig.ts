import {
  type BufferGeometry, DirectionalLight, Group, Mesh, MeshToonMaterial, type Object3D, Vector3,
} from "three";

import {
  buildPart, buildWire, flattenPiece, toneRamp, applySteel, CHAMFER, LIGHT_INTENSITY,
} from "@/lib/nipperMesh";
import {
  NIPPER_COIL, NIPPER_EXTENT, NIPPER_LEFT_PIECES, NIPPER_PIVOT, NIPPER_RIGHT_PIECES,
  type NipperPiece,
} from "@/lib/nipperShape";

// 改札鋏の**組み立て**。★本番の1体（`components/explore/Nipper.tsx`）と
//   検証用の三面図（`components/explore/NipperViews.tsx`）が**同じものを見る**ため、
//   立体と光はここ1か所で組む。別々に組んだら突き合わせる意味がない。

// 局所座標は **継ぎ目 × 頭の天が原点／+y が上／+x が右／+z が手前**。
// ★★形は `lib/nipperShape.ts` が正（平面図のトレース）。ここは**厚みと動き**だけ。

/**
 * ★★**半分の厚み**の表（0=厚 / 1=薄。2026-08-29 にユーザーが確定）。
 * ★21巡目に段が3つから2つになった ―― 以前の「中 40」は、**2部品が重なった図の上で
 *   塗っていたための取り違え**だった。部品ごとの図をもらって解消した。
 *   右の部品は一定、左だけ持ち手が厚・先端が薄。
 * ★★第70巡に**ユーザー指定で 2 倍**にした（45／28 → 90／56。1.5 倍でも薄いと
 *   いう指摘で二度上げた）。厚みの**比**（45:28）は保ってある。
 *   バネの z（`COIL_Z`）も同じだけ動かす（26 → 52）。
 * **どこがどの段かは平面図の塗り分けが決める**（`lib/nipperShape.ts` の
 * `NIPPER_*_PIECES`）。ここは段に厚みを与えるだけ。
 *
 * ★18巡目まで「部品ごと＋肩から上だけ薄い」という **y の関数**で決めていたが、
 *   塗り分けは y の帯ではない（中と薄が y で重なる）ので表せなかった。
 */
export const HALF = [90, 56];
/** 段ごとに**色の段をいくつ下げるか**。 */
// ★★21巡目に **[0, 0]（＝塗り分けない）** へ戻した（ユーザー指定
//   「左の部品の塗り分けはやめて元の色に戻して全体が同じ色になるように」）。
//   段は**形**で見せる。色は道具ぜんぶで同じ。
const DIM = [0, 0];

/**
 * 押し切ったときの角（度）。★**正＝青の持ち手が右へ寄る**（＝開きが閉じる）。
 * ★16巡目までの SVG 版とは符号が逆 ―― SVG の `rotate()` は y が下向きなので
 *   時計回りが正、three.js は y が上向きなので反時計回りが正。
 */
export const THETA = 10;
/** 押し切ったときのバネの縮み（横へ詰まる）。 */
export const SQUEEZE = 0.34;

/**
 * バネ。★★**場所・大きさ・針金の太さ・脚の通り**すべて図から拾う（`NIPPER_COIL`）。
 * 19巡目まで脚の4点だけ手で置いていて、ユーザーに「リングの辺りの形が捉えられて
 * いない」と指摘された ―― 図が持っている情報を書き写していた。
 * ★z だけは平面図に無いので、ここで決める（バネは1枚の平たいねじりばね）。
 */
const COIL_Z = 52;
export const COIL_ANCHOR_X = NIPPER_COIL.legNear[1].x;

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

/**
 * ★★★**脚は輪の接線方向に伸びる**（21巡目にユーザー指定）。
 * 付け根 `P` から円へ引ける接線は2本ある。**図で実際に触れている側**を採る ――
 * トレースが「脚が輪のどこに当たっているか」を測っているので、その角にいちばん
 * 近い接点を選べば、向きの理屈をこねる必要がない。
 */
function tangentPoint(
  P: { x: number; y: number }, hint: { x: number; y: number },
): { x: number; y: number } {
  const { cx, cy, r } = NIPPER_COIL;
  const d = Math.hypot(P.x - cx, P.y - cy);
  if (d <= r * 1.001) return hint;
  const phi = Math.atan2(P.y - cy, P.x - cx), alpha = Math.acos(r / d);
  const hintA = Math.atan2(hint.y - cy, hint.x - cx);
  const TAU = Math.PI * 2;
  const gap = (a: number) => {
    const g = Math.abs(((a - hintA) % TAU + TAU) % TAU);
    return Math.min(g, TAU - g);
  };
  const a = gap(phi + alpha) <= gap(phi - alpha) ? phi + alpha : phi - alpha;
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}

/**
 * バネの針金。★★**輪は閉じた1本の丸**、脚はそこへ接線で入る ―― 3本に分けて作る。
 * 1本の管では枝分かれできないし、1周ぶん掃くと自分と重なる。
 * 接点は輪の面の中にあるので、繋ぎ目は針金の中へ隠れる。
 */
function coilPaths(): Vector3[][] {
  const { cx, cy, r } = NIPPER_COIL;
  const at = (p: { x: number; y: number }) => new Vector3(p.x, p.y, COIL_Z);
  const rootA = NIPPER_COIL.legFar[0], rootB = NIPPER_COIL.legNear[1];
  const TA = tangentPoint(rootA, NIPPER_COIL.legFar[1]);
  const TB = tangentPoint(rootB, NIPPER_COIL.legNear[0]);
  // 輪。★1周＋少しだけ重ねて閉じる（継ぎ目が出ない）。
  const N = 64;
  const a0 = Math.atan2(TA.y - cy, TA.x - cx);
  const ring: Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = a0 + (i / N) * (Math.PI * 2 + 0.12);
    ring.push(new Vector3(cx + Math.cos(t) * r, cy + Math.sin(t) * r, COIL_Z));
  }
  return [ring, [at(rootA), at(TA)], [at(TB), at(rootB)]];
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

  // 段ごとに材質を1つ（表を焼くときに段を下げてある。差し替えは同じ）。
  const ramps = DIM.map((d) => toneRamp(d));
  const steels = ramps.map((gradientMap) => {
    const m = new MeshToonMaterial({ color: 0xffffff, gradientMap });
    applySteel(m);   // ★段の上に光沢とすり傷を重ねる（`applyAppTones` は紙のほう）
    return m;
  });
  const add = (g: BufferGeometry, parent: Group, tier = 0) => {
    const m = new Mesh(g, steels[tier]);
    m.castShadow = true;
    // ★自分の影は**受けない**。受けると影の中が真っ黒に落ちて、段が6つで収まらない。
    //   落ち影は床にだけ落とす（`components/explore/Nipper.tsx`）。
    m.receiveShadow = false;
    parent.add(m);
  };

  const solidOf = (pc: NipperPiece) => {
    const { poly, inner } = flattenPiece(pc);
    return buildPart(poly, HALF[pc.tier], CHAMFER, inner);
  };

  // 赤の部品（動かない）。★片は段ごとに分かれているが、**ひとつの部品**。
  for (const pc of NIPPER_RIGHT_PIECES) add(solidOf(pc), tool, pc.tier);

  // 青の部品（支点まわりに回る）。
  // ★赤に挟まれているので正面では途中が隠れて切れて見えるが、**同じ群**＝ひとつの部品。
  const lever = new Group();
  lever.position.set(NIPPER_PIVOT.x, NIPPER_PIVOT.y, 0);
  tool.add(lever);
  for (const pc of NIPPER_LEFT_PIECES) {
    const g = solidOf(pc);
    g.translate(-NIPPER_PIVOT.x, -NIPPER_PIVOT.y, 0);
    add(g, lever, pc.tier);
  }

  // バネ
  const coil = new Group();
  tool.add(coil);
  for (const path of coilPaths()) add(buildWire(path, NIPPER_COIL.wire), coil);

  return {
    root, lever, coil,
    dispose() {
      root.traverse((o: Object3D) => { if (o instanceof Mesh) o.geometry.dispose(); });
      for (const m of steels) m.dispose();
      for (const t of ramps) t.dispose();
    },
  };
}

/**
 * 開き具合（0=閉じ 1=開き）を**姿勢へ落とす**。★腕・バネの3つは必ず一緒に動く
 * ので1か所にまとめる（`Nipper` と `TicketStage` の両方から呼ぶ）。
 */
export function poseNipper(rig: NipperRig, p: number) {
  rig.lever.rotation.z = (p * THETA * Math.PI) / 180;
  rig.coil.scale.x = 1 - p * SQUEEZE;
  rig.coil.position.x = COIL_ANCHOR_X * p * SQUEEZE;
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
