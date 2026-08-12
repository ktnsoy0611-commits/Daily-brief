"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Body, Engine } from "matter-js";
import { Masthead } from "@/components/common";
import { DemoSeedButton, TaskAddButton } from "@/components/tasks/TaskAddButton";
import { TaskNet, type NetData } from "@/components/tasks/TaskNet";
import { appTitle } from "@/lib/apps";
import { TAB_PAD_TOP } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { assignFaces, baseOutline } from "@/lib/prism";
import { tagColor } from "@/lib/taskTags";
import { demoTasks } from "@/lib/taskDemo";
import { sideOf } from "@/lib/taskSize";
import type { AppState, TabProps, Task } from "@/lib/types";

// ★タスクタブ(GRAVITY)。確定したタスクが上から落ちてきて積み上がる。
// 物体の大きさ = 重要度 × 切迫度(lib/taskSize.ts)。何が差し迫っているかを
// 日付の文字ではなく、山の高さと物の大きさで直感的に見せる。
//
// ★見えるのは**底面の形そのもの**(柱を倒してこちらへ向けた姿)。
// 円柱=円 / 半円柱=半円 / 三角柱=三角 / 四角柱=四角。バウハウスの基本図形が
// そのまま積み上がり、面の数(=情報の揃い具合)も図形の違いとして読める。
// 色はタグ(仕事・買い物…)。物理は matter.js に計算だけさせ、描画は自前の canvas。
//
// ★rAF は「このアプリが表示されている(appActive)」かつ「起きている物体が
// ある」ときだけ回す。全部が寝たら止める(matter.js の enableSleeping)。
// matter.js は effect の中で dynamic import する(leaflet と同じ手)。
// 他の2アプリの初回読み込みを重くしないため。

/** 完了したときに飛び散る破片。 */
interface Shard { x: number; y: number; vx: number; vy: number; r: number; life: number; fill: string }
const SHARD_MS = 620;

interface Piece { id: string; body: Body; side: number; faceCount: number; color: string }

export function GravityTab({ appState, persist, profileButton, showToast, appActive }: TabProps & { appActive?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const matterRef = useRef<typeof import("matter-js") | null>(null);
  const piecesRef = useRef<Piece[]>([]);
  const shardsRef = useRef<Shard[]>([]);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const activeRef = useRef(!!appActive);
  const sizeRef = useRef({ w: 0, h: 0 });
  const [openId, setOpenId] = useState<string | null>(null);
  // ＋で作ったばかりのもの。題が空のまま閉じたら捨てる。
  const [draftId, setDraftId] = useState<string | null>(null);
  // 物理の世界ができたかどうか。matter.js は非同期に読み込むので、
  // これが立つまでタスクを落とし込めない(立った時点で下の同期をやり直す)。
  const [ready, setReady] = useState(false);

  const tasks = useMemo(() => (appState.tasks ?? []).filter((t) => !t.done), [appState.tasks]);
  const open = (appState.tasks ?? []).find((t) => t.id === openId) ?? null;

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    const { w, h } = sizeRef.current;
    if (!cv || !w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // ★描くのは**底面の形そのもの**(柱を倒してこちらへ向けた姿)。
    // 円柱=円 / 半円柱=半円 / 三角柱=三角 / 四角柱=四角 なので、面の数
    // (=情報の揃い具合)が図形の違いとしてそのまま山の中に見える。
    // 形は body の実際の頂点から引く。物理の当たり判定と絵が必ず一致する
    // (自前の輪郭を別に持つと、重心のずれで絵だけ浮いてしまう)。
    for (const p of piecesRef.current) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      if (p.body.circleRadius) {
        ctx.arc(p.body.position.x, p.body.position.y, p.body.circleRadius, 0, Math.PI * 2);
      } else {
        p.body.vertices.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)));
        ctx.closePath();
      }
      ctx.fill();
    }

    for (const s of shardsRef.current) {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.fill;
      ctx.fillRect(s.x - s.r / 2, s.y - s.r / 2, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }, []);

  // ★rAF のループは ref 越しに回す。React の再レンダーとは無関係に、
  // 触るのは ref だけ(毎フレームの state 更新はしない)。
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const loopRef = useRef<() => void>(() => {});

  const wake = useCallback(() => {
    if (runningRef.current || !activeRef.current) return;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(() => loopRef.current());
  }, []);

  useEffect(() => {
    loopRef.current = () => {
      const M = matterRef.current;
      const engine = engineRef.current;
      if (!M || !engine) { runningRef.current = false; return; }
      M.Engine.update(engine, 1000 / 60);

      // 粉砕の破片。物理には乗せず、自分で落として消す。
      shardsRef.current = shardsRef.current
        .map((s) => ({ ...s, x: s.x + s.vx, y: s.y + s.vy, vy: s.vy + 0.6, life: s.life - 1000 / 60 / SHARD_MS }))
        .filter((s) => s.life > 0);

      drawRef.current();

      // 全部が寝て、破片も消えたら止める。次に何か起きたら再開する。
      const awake = piecesRef.current.some((p) => !p.body.isSleeping);
      if (!awake && shardsRef.current.length === 0) {
        runningRef.current = false;
        return;
      }
      rafRef.current = requestAnimationFrame(() => loopRef.current());
    };
  }, []);

  // このアプリを見ていない間は回さない。
  useEffect(() => {
    activeRef.current = !!appActive;
    if (appActive) wake();
    else {
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
    }
  }, [appActive, wake]);

  // 物理の世界を作る。器の大きさが決まってから。
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let disposed = false;

    const setup = async () => {
      const M = await import("matter-js");
      if (disposed) return;
      matterRef.current = M;
      const r = el.getBoundingClientRect();
      sizeRef.current = { w: r.width, h: r.height };
      const engine = M.Engine.create({ enableSleeping: true });
      engine.gravity.y = 1.4;
      engineRef.current = engine;
      rebuildWalls(M, engine, r.width, r.height);
      draw();
      setReady(true);
    };
    setup();

    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (Math.abs(r.width - sizeRef.current.w) < 0.5 && Math.abs(r.height - sizeRef.current.h) < 0.5) return;
      sizeRef.current = { w: r.width, h: r.height };
      const M = matterRef.current;
      const engine = engineRef.current;
      if (M && engine) { rebuildWalls(M, engine, r.width, r.height); wake(); }
    });
    ro.observe(el);
    return () => {
      disposed = true;
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // タスクの増減に物理の世界を合わせる。新しいものは上から落とす。
  useEffect(() => {
    const M = matterRef.current;
    const engine = engineRef.current;
    const { w } = sizeRef.current;
    if (!M || !engine || !w) return;
    const today = new Date();
    const alive = new Set(tasks.map((t) => t.id));

    // 消えたもの(完了・削除)は世界からも外す。
    for (const p of piecesRef.current) {
      if (!alive.has(p.id)) M.Composite.remove(engine.world, p.body);
    }
    // 残るものは、タグの色を今の値に合わせ直す(展開図で変えたら山にも効く)。
    piecesRef.current = piecesRef.current
      .filter((p) => alive.has(p.id))
      .map((p) => {
        const t = tasks.find((x) => x.id === p.id);
        const color = tagColor(t?.tag);
        return color === p.color ? p : { ...p, color };
      });

    const have = new Set(piecesRef.current.map((p) => p.id));
    const added: Piece[] = [];
    tasks.forEach((t, i) => {
      if (have.has(t.id)) return;
      const side = sideOf(t, today);
      const faceCount = assignFaces(
        { when: t.when, where: t.where, who: t.who, why: t.why, how: t.how }, t.faces, t.title,
      ).faceCount;
      // 落ちてくる位置は id から決める(開くたびに散らばり方が変わらない)。
      const x = w * 0.16 + frac(t.id) * w * 0.68;
      const y = -side - i * (side + 20);
      const opts = { restitution: 0.05, friction: 0.5, frictionStatic: 0.9, frictionAir: 0.01 };
      // ★底面の形をそのまま物理の形にする。丸いものは転がり、角のあるものは
      // 止まりやすい、という差が積み方に出る(回転もさせる。絵が平面図形に
      // なったので、body ごと回っても形が破綻しない)。
      const body = faceCount === 3
        ? M.Bodies.circle(x, y, side / 2, opts)
        : M.Bodies.fromVertices(x, y, [baseOutline(faceCount).map((q) => ({ x: q.x * side, y: q.y * side }))], opts);
      added.push({ id: t.id, body, side, faceCount, color: tagColor(t.tag) });
    });
    if (added.length) {
      M.Composite.add(engine.world, added.map((p) => p.body));
      piecesRef.current = [...piecesRef.current, ...added];
    }
    wake();
  }, [tasks, wake, ready]);

  const patch = (id: string, p: Partial<NetData>) => {
    const next: AppState = structuredClone(appState);
    const t = next.tasks.find((x) => x.id === id);
    if (t) Object.assign(t, p);
    persist(next);
  };

  // ★完了 = 粉砕。物体を消し、その場に破片を飛ばす。上に乗っていたものは
  // 起きて沈むので、山が実際に低くなる。
  const complete = (t: Task) => {
    haptic(18);
    const piece = piecesRef.current.find((p) => p.id === t.id);
    if (piece) {
      const { x, y } = piece.body.position;
      const fills = [piece.color];
      for (let i = 0; i < 14; i++) {
        const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
        const sp = 2 + Math.random() * 4;
        shardsRef.current.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
          r: piece.side * (0.08 + Math.random() * 0.1),
          life: 1, fill: fills[i % fills.length],
        });
      }
      // 上に乗っていたものを起こす(支えが消えたので崩れる)。
      const M = matterRef.current;
      if (M) for (const p of piecesRef.current) M.Sleeping.set(p.body, false);
      wake();
    }
    const next: AppState = structuredClone(appState);
    const task = next.tasks.find((x) => x.id === t.id);
    if (task) { task.done = true; task.doneAt = new Date().toISOString(); }
    persist(next);
    setOpenId(null);
    showToast("完了しました");
  };

  const remove = (id: string) => {
    const next: AppState = structuredClone(appState);
    next.tasks = next.tasks.filter((x) => x.id !== id);
    persist(next);
    setOpenId(null);
  };

  // 手でタスクを足す。空のまま作って開き、題を書いてもらう。
  const addTask = () => {
    const id = `task-${Date.now()}`;
    const next: AppState = structuredClone(appState);
    next.tasks = [{ id, title: "", done: false, createdAt: new Date().toISOString(), weight: 2 }, ...(next.tasks ?? [])];
    persist(next);
    setDraftId(id);
    setOpenId(id);
  };

  // 題が空のまま閉じたら、作りかけを消す。
  const closeNet = (id: string) => {
    setOpenId(null);
    if (draftId !== id) return;
    setDraftId(null);
    const t = (appState.tasks ?? []).find((x) => x.id === id);
    if (t && !t.title.trim()) remove(id);
  };

  const seedDemo = () => {
    const next: AppState = structuredClone(appState);
    next.tasks = [...demoTasks(), ...(next.tasks ?? [])];
    persist(next);
    showToast("デモのタスクを入れました");
  };

  // 積んである物体をタップして開く。
  const onTap = (e: React.PointerEvent) => {
    const M = matterRef.current;
    const engine = engineRef.current;
    const cv = canvasRef.current;
    if (!M || !engine || !cv) return;
    const r = cv.getBoundingClientRect();
    const pt = { x: e.clientX - r.left, y: e.clientY - r.top };
    const hits = M.Query.point(piecesRef.current.map((p) => p.body), pt);
    if (!hits.length) return;
    const piece = piecesRef.current.find((p) => p.body === hits[hits.length - 1]);
    if (piece) { haptic(8); setOpenId(piece.id); }
  };

  return (
    <main className="full-bleed" style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <div ref={wrapRef} style={{ position: "absolute", inset: 0 }}>
        <canvas
          ref={canvasRef}
          onPointerUp={onTap}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", willChange: "transform", touchAction: "manipulation" }}
        />
      </div>
      <div style={{ position: "absolute", top: TAB_PAD_TOP, left: 16, right: 16, pointerEvents: "none", zIndex: 2 }}>
        <Masthead title={appTitle("tasks")} corner={<span style={{ pointerEvents: "auto" }}>{profileButton}</span>} />
      </div>
      {/* full-bleed(タブバーの下まで敷く)なので、ボタンはタブバーのぶん持ち上げる。 */}
      <TaskAddButton onAdd={addTask} lifted />
      {tasks.length === 0 && <DemoSeedButton label="デモのタスクを入れる" onSeed={seedDemo} lifted />}
      {open && (
        <TaskNet
          key={open.id}
          data={open}
          mode="task"
          autoEdit={draftId === open.id}
          onChange={(p) => patch(open.id, p)}
          onConfirm={() => complete(open)}
          onDelete={() => remove(open.id)}
          onClose={() => closeNet(open.id)}
        />
      )}
    </main>
  );
}

/** 器の左右と床。器の大きさが変わるたびに作り直す。
 *  床はタブバーの下ではなく、その少し上に置く(タブバーの裏に積まれると
 *  何が積まれているのか見えなくなるため)。 */
function rebuildWalls(M: typeof import("matter-js"), engine: Engine, w: number, h: number) {
  const old = M.Composite.allBodies(engine.world).filter((b) => b.isStatic);
  M.Composite.remove(engine.world, old);
  const T = 200;
  const floorY = h - navHeightPx();
  M.Composite.add(engine.world, [
    M.Bodies.rectangle(w / 2, floorY + T / 2, w + T * 2, T, { isStatic: true, friction: 0.6 }),
    M.Bodies.rectangle(-T / 2, h / 2, T, h * 3, { isStatic: true, friction: 0.4 }),
    M.Bodies.rectangle(w + T / 2, h / 2, T, h * 3, { isStatic: true, friction: 0.4 }),
  ]);
}

/** タブバーの高さ(px)。CSS変数から読む — 数字を二重に持たない(§50)。 */
function navHeightPx(): number {
  if (typeof window === "undefined") return 96;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--nav-h").trim();
  if (!v) return 96;
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;height:${v}`;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px || 96;
}

/** id → 0〜1 のばらけた値。
 *  ★素の hash をそのまま使ってはいけない。"t1","t2",… のように連番の id は
 *  hash も連番になり、剰余を取っても値がほとんど動かないため、全部が同じ
 *  x に落ちて1本の塔になる(実際になった)。黄金比の定数を掛けて桁を混ぜる。 */
function frac(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (Math.imul(h, 2654435761) >>> 0) / 4294967296;
}


