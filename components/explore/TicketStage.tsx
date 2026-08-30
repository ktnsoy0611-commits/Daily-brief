"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BoxGeometry, Color, Mesh, MeshBasicMaterial, MeshToonMaterial, PCFSoftShadowMap,
  PerspectiveCamera, PlaneGeometry, Scene, ShadowMaterial, Vector3, WebGLRenderer,
} from "three";

import { NIPPER_PAINT as P } from "@/lib/constants";
import { appTone, applyAppTones, toneRamp } from "@/lib/nipperMesh";
import {
  buildNipperRig, nipperLights, poseNipper, NIPPER_CENTER, NIPPER_SUN,
} from "@/lib/nipperRig";
import { NIPPER_EXTENT, NIPPER_SLOT } from "@/lib/nipperShape";
import {
  spring, springTo, settled, K_TRAVEL, D_TRAVEL, K_SETTLE, D_SETTLE,
} from "@/lib/spring";

// 券と改札鋏が**同じ3D空間に居る**ための場（第70巡）。
//
// ★★★**券の面は「深さだけ書いて色は書かない」板**として置く（`colorWrite: false`）。
//   こうすると canvas は券のところだけ穴が空き、**下に敷いた DOM の券がそのまま
//   見える**ので、版面（`components/explore/Ticket.tsx`）は一切劣化しない。
//   それでいて深さは書かれているので、**鋏が券の奥へ回れば券に隠れる**。
//   券の絵を焼き付けて貼る案は採らない ―― 和文が857個に分割されていて
//   （Noto Sans JP のサブセット）埋め込みで版面が崩れる。
//
// ★★**券の面は z = 0 に置き、そこで「1単位 = ステージの 1px」になる距離に
//   カメラを置く**。だから **DOM の券は素の CSS の座標のまま置けば必ず一致する**
//   （投影の計算が要らない ＝ ずれようがない）。奥行きは束・小口・影が担う。
//
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。
// ★禁じられているのは **CSS の 3D 変形**であって WebGL ではない（design.md 冒頭）。

/** カメラ。★消失点は**ステージの中心**。券も鋏も、そこからの隔たりでパースが付く。 */
const FOV = 26;
/** 券の紙の厚み（＝小口の見える幅）。★実物どおりだと1px も無いので、読める厚みに。 */
const CARD_T = 5;
/**
 * 地（券と鋏が浮いている面）。★画面と平行な1枚。影はここへ落ちる。
 * ★遠くへ置くほど影が横へ流れる（横のずれ ＝ 深さ × 2.05）。近くに置いて
 *   「紙のすぐ下に敷いた面」にする。
 */
const GROUND_Z = -40;
/**
 * ★★**画面と平行な面に当たる段の色**。紙の色をこれで割ってから渡すと、
 * 正面を向いた面（＝束の見えている縁）が**券の紙そのものの色**になる。
 * これをしないと、束だけが階調のぶん暗く沈んで**黒い塊**に見える
 * （第70巡に実測 ―― DOM の券は素の CSS の色なので、階調が掛からない）。
 */
const FRONT_TONE = appTone(new Vector3(0, 0, 1), NIPPER_SUN);
/** 鋏の口（スリットの中心）の、図の座標。★`lib/nipperShape.ts` から引く。 */
const NOSE = {
  x: (NIPPER_SLOT.x0 + NIPPER_SLOT.x1) / 2,
  y: (NIPPER_SLOT.y0 + NIPPER_SLOT.y1) / 2,
};

export interface StageCard {
  /** ステージの左上からの CSS px。★DOM の券と同じ数値をそのまま渡す。 */
  x: number; y: number; w: number; h: number;
  /** 小口（紙の厚み）の色。★券の紙の色をそのまま渡す。 */
  paper: string;
}

export interface StageNipper {
  /** 口（先端）を置く場所。ステージの左上からの CSS px。 */
  nose: { x: number; y: number };
  /** 鋏の幅（CSS px）。 */
  w: number;
  /** 0=閉じ 1=開き。 */
  open: number;
  /** 噛んだ瞬間だけ真に。 */
  closing?: boolean;
  /**
   * 券の面（z=0）からの隔たり。**正なら手前（券を覆う）／負なら奥（券に隠れる）**。
   * ★入鋏のときは 0 ―― 券が鋏の厚みの真ん中を通る＝口にくわえた形になる。
   */
  z?: number;
}

export function TicketStage({
  w, h, card, nipper, ground = true, children,
}: {
  /** ステージの大きさ（CSS px）。 */
  w: number; h: number;
  card: StageCard;
  nipper: StageNipper;
  /** 地と影を敷くか。 */
  ground?: boolean;
  /** 券の DOM。★`card` の場所へそのまま置かれる。 */
  children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [pressed, setPressed] = useState(false);
  const want = pressed || nipper.closing ? 1 : 1 - nipper.open;
  const wantRef = useRef(want);
  wantRef.current = want;
  // 場所の類はレンダーをまたいで最新を読む（立体は組み直さない）。
  const poseRef = useRef({ card, nipper, w, h });
  poseRef.current = { card, nipper, w, h };
  const layRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const box = host.current;
    if (!box) return;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    const canvas = renderer.domElement;
    canvas.style.cssText = "display:block;width:100%;height:100%";
    box.appendChild(canvas);

    const scene = new Scene();
    const camera = new PerspectiveCamera(FOV, 1, 10, 20000);

    // 券の小口は**券の紙の色**で、鋏と同じ階調表を使う。
    const ramp = toneRamp(0);
    const paper = new MeshToonMaterial({ gradientMap: ramp });
    applyAppTones(paper);

    // 券の面 … **深さだけ書く板**（canvas に穴を空け、奥のものを隠す）。
    const hole = new MeshBasicMaterial();
    hole.colorWrite = false;
    const face = new Mesh(new PlaneGeometry(1, 1), hole);
    // ★★★**いちばん先に描く**。three.js は不透明な面を「材質の番号 → 奥行き」の順で
    //   並べるので、放っておくと**紙の色の面が先に描かれて DOM の券を塗り潰す**
    //   （第70巡に実測 ― 券が (212,92,129) から (81,29,39) へ沈み、比較 36450 件中
    //   一致は 11165 件しかなかった）。`renderOrder` は材質の番号より先に見られる。
    face.renderOrder = -1;
    // 券の小口（紙の厚み）。面のすぐ奥に、同じ大きさの薄い箱。
    const body = new Mesh(new BoxGeometry(1, 1, CARD_T), paper);
    body.castShadow = true;
    // 鋏の影を**券の上に**受ける面（券の面のすぐ手前）。
    const onCardMat = new ShadowMaterial({ color: P.cast, opacity: P.castAlpha });
    const onCard = new Mesh(new PlaneGeometry(1, 1), onCardMat);
    onCard.receiveShadow = true;
    // 地。★画面と平行な1枚（券も鋏もここへ影を落とす）。
    const groundMat = new ShadowMaterial({ color: P.cast, opacity: P.castAlpha });
    const floor = new Mesh(new PlaneGeometry(1, 1), groundMat);
    floor.receiveShadow = true;
    floor.visible = ground;
    scene.add(floor, body, face, onCard);

    const rig = buildNipperRig();
    scene.add(rig.root);
    const key = nipperLights();
    scene.add(key, key.target);

    /** 器の寸法と、渡された場所から、場を組み直す。 */
    const lay = () => {
      const bw = box.clientWidth, bh = box.clientHeight;
      if (!bw || !bh) return;
      renderer.setSize(bw, bh, false);
      const { card: c, nipper: n, w: sw, h: sh } = poseRef.current;
      // ★★z = 0 で「1単位 = ステージの 1px」になる距離。DOM の券と必ず一致する。
      camera.position.set(0, 0, sh / (2 * Math.tan((FOV * Math.PI) / 360)));
      camera.aspect = sw / sh;
      camera.updateProjectionMatrix();
      /** ステージの左上を原点にした CSS px → 場の座標（y は上向きが正）。 */
      const at = (x: number, y: number, z: number) => new Vector3(x - sw / 2, sh / 2 - y, z);

      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      face.position.copy(at(cx, cy, 0));
      face.scale.set(c.w, c.h, 1);
      // 小口の箱 … **面より 1 単位うしろ**へ置く。★three.js の既定の深さ比較は
      // `LessEqual` なので、**ぴったり同じ深さだと後から描いたほうが勝つ**。
      // 1 単位さげれば前面は落ち、**側面（小口）だけが残る**（消失点の側に見える）。
      body.position.copy(at(cx, cy, -CARD_T / 2 - 1));
      body.scale.set(c.w, c.h, 1);
      onCard.position.copy(at(cx, cy, 1));
      onCard.scale.set(c.w, c.h, 1);
      // ★小口（側面）は階調を掛ける面なので、**正面を向いた面が `c.paper` に
      //   なるよう**段のぶんを先に割っておく。
      const want = new Color(c.paper);
      paper.color.setRGB(
        Math.min(1, want.r / FRONT_TONE.r),
        Math.min(1, want.g / FRONT_TONE.g),
        Math.min(1, want.b / FRONT_TONE.b),
      );


      floor.position.copy(at(sw / 2, sh / 2, GROUND_Z));
      floor.scale.set(sw * 3, sh * 3, 1);

      // 鋏 … **口（スリットの中心）**を指定の場所へ。縮尺は幅で決める。
      const k = n.w / (NIPPER_EXTENT.x1 - NIPPER_EXTENT.x0);
      rig.root.scale.setScalar(k);
      rig.root.position.copy(at(n.nose.x, n.nose.y, n.z ?? 0))
        .sub(new Vector3(NOSE.x - NIPPER_CENTER.x, NOSE.y - NIPPER_CENTER.y, 0).multiplyScalar(k));
    };
    lay();
    layRef.current = lay;
    const ro = new ResizeObserver(lay);
    ro.observe(box);

    // 動き。★`lib/spring.ts` の減衰振動（`Nipper` と同じ）。
    const s = spring(wantRef.current);
    let id = 0;
    const tick = () => {
      const wv = wantRef.current;
      const shut = wv > s.p;
      springTo(s, wv, shut ? K_TRAVEL : K_SETTLE, shut ? D_TRAVEL : D_SETTLE);
      if (settled(s, wv)) { s.p = wv; s.v = 0; }
      poseNipper(rig, s.p);
      renderer.render(scene, camera);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);

    return () => {
      layRef.current = null;
      cancelAnimationFrame(id);
      ro.disconnect();
      rig.dispose();
      for (const m of [face, body, onCard, floor]) m.geometry.dispose();
      hole.dispose(); paper.dispose(); ramp.dispose();
      onCardMat.dispose(); groundMat.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [ground]);

  // 場所が変わったら組み直すだけ（立体は作り直さない）。
  useEffect(() => { layRef.current?.(); });

  return (
    <div style={{ position: "relative", width: w, height: h, overflow: "hidden" }}>
      {/* 券の版面（DOM のまま）。★canvas は券の面のところだけ穴が空いている。 */}
      <span style={{ position: "absolute", left: card.x, top: card.y, width: card.w }}>
        {children}
      </span>
      <div ref={host} aria-hidden
        style={{ position: "absolute", inset: 0, touchAction: "none"  }}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)} />
    </div>
  );
}
