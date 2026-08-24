"use client";

import { useEffect, useRef } from "react";
import type { Body, Engine } from "matter-js";
import { rectOf, sectionOutline } from "@/lib/solid";
import { peekSolidBitmap, shapeBounds, shapeGlyphsReady, solidBitmap, warmShapeGlyphs, type SolidPaint } from "@/lib/solidPaint";
import { specOf } from "@/lib/taskSize";
import { resolveTag } from "@/lib/taskTags";
import type { Task } from "@/lib/types";

// ★地中のシリンダー(第40巡)。選んだ日のタスクが、穴の断面を模した**少しだけ
// 傾いた薄いグレーのシリンダー**の中へ、上から落ちて積もる。地上(GRAVITY)の
// 山を、1日ぶんに絞って穴の中へ持ち込んだもの ― 「この日にはこれだけ埋まって
// いる」が、落ちて積もる図形の量として一目で分かる。
//
// ★物理は真下向きのまま。シリンダーの傾きは**キャンバスごと CSS の 2D 回転**で
// 与える(3D 変形は使わない)。図形はキャンバスの中では真っ直ぐ積もり、器ごと
// 傾くので「傾いた筒に溜まった」ように見える。
//
// ★毎フレームのコストは物体ごとに drawImage 1回(地上の山と同じ手)。物理と
// 描画のループは**すべてこの1つの effect の中の閉包**に持つ ― 相互に呼び合う
// ので、外に出すと宣言順で ESLint に叱られ、ref 越しの取り回しも増える。

/** 図形の1単位を何pxで描くか。シリンダーが細いので地上よりかなり小さめ。
 *  ★大きいと数個で筒からあふれる(実測)。小さくして「何個ぶん埋まったか」が
 *  積もりで分かる方を採る。 */
const UNIT = 20;
/** シリンダーの内側の余白(壁の内法)。 */
const WALL = 6;
/** 落とす間隔(ms)。1つずつ落ちてくるのが見えるように。 */
const DROP_EVERY = 130;
/** シリンダーに入れる上限(これ以上は積んでも見えない)。 */
const MAX_PIECES = 10;

interface Piece { body: Body; paint: SolidPaint; ox: number; oy: number }

/** 器へ流し込む指示。main effect が受け口を ref に置き、下の effect が呼ぶ。 */
interface Ctrl { update: (tasks: Task[], active: boolean) => void }

const paintOf = (t: Task): SolidPaint => ({
  spec: specOf(t), view: "tag", title: t.title,
  tag: resolveTag(t.tag, t.id, t.title, t.context, t.belongings, t.note),
});

export function UnderCylinder({ tasks, active, tint }: {
  /** その日のタスク(未完了)。 */
  tasks: Task[];
  /** この層が画面を占めているか。物理はそのときだけ回す。 */
  active: boolean;
  /** シリンダーの地の色(薄いグレー)。 */
  tint: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctrlRef = useRef<Ctrl | null>(null);
  const tasksKey = tasks.map((t) => t.id).join(",");

  // 物理世界と描画。マウントの1回だけ組み立て、受け口(ctrl)を ref に置く。
  useEffect(() => {
    const wrap = wrapRef.current;
    const cv = canvasRef.current;
    if (!wrap || !cv) return;
    let disposed = false;
    let M: typeof import("matter-js") | null = null;
    let engine: Engine | null = null;
    let pieces: Piece[] = [];
    let queue: Task[] = [];
    let size = { w: 0, h: 0 };
    let running = false;
    let raf = 0;
    let dropTimer = 0;
    let live = false;

    const walls = () => {
      if (!M || !engine) return;
      const old = M.Composite.allBodies(engine.world).filter((b) => b.isStatic);
      M.Composite.remove(engine.world, old);
      const { w, h } = size;
      const T = 120;
      M.Composite.add(engine.world, [
        M.Bodies.rectangle(w / 2, h + T / 2 - 2, w + T * 2, T, { isStatic: true, friction: 0.7 }),
        M.Bodies.rectangle(-T / 2, h / 2, T, h * 3, { isStatic: true, friction: 0.5 }),
        M.Bodies.rectangle(w + T / 2, h / 2, T, h * 3, { isStatic: true, friction: 0.5 }),
      ]);
    };
    // ★戻り値 = **まだ書体が揃っていない図形が残っているか**。揃うまでループを
    //   止めない ― 止めると、図形が寝たあとに書体が届いても描き直されず、
    //   シリンダーが空のままになる(実際にそうなった)。
    const draw = (): boolean => {
      const { w, h } = size;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const ctx = cv.getContext("2d");
      if (!ctx) return false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      let pending = false;
      for (const p of pieces) {
        // 書体が揃っていれば焼く。まだなら**焼かずに**少しずつ用意し、
        // すでにある絵(色面だけでも)を出す ― 図形自体は必ず見える。
        let bmp = peekSolidBitmap(p.paint, UNIT, dpr);
        if (shapeGlyphsReady(p.paint, UNIT, dpr)) bmp = solidBitmap(p.paint, UNIT, dpr);
        else { warmShapeGlyphs(p.paint, 3, UNIT, dpr); pending = true; }
        if (!bmp) continue;
        ctx.save();
        ctx.translate(p.body.position.x, p.body.position.y);
        ctx.rotate(p.body.angle);
        ctx.drawImage(bmp.canvas, p.ox - bmp.w / 2, p.oy - bmp.h / 2, bmp.w, bmp.h);
        ctx.restore();
      }
      return pending;
    };
    const loop = () => {
      if (disposed || !M || !engine) { running = false; return; }
      M.Engine.update(engine, 1000 / 60);
      const pending = draw();
      const awake = pieces.some((p) => !p.body.isSleeping);
      if (running && (awake || pending)) raf = requestAnimationFrame(loop);
      else running = false;
    };
    const wake = () => {
      if (!M || !engine) return;
      for (const p of pieces) M.Sleeping.set(p.body, false);
      if (!running) { running = true; raf = requestAnimationFrame(loop); }
    };
    const pump = () => {
      if (!M || !engine || !live) return;
      const t = queue.shift();
      if (t) {
        const paint = paintOf(t);
        const b = shapeBounds(paint);
        const hw = ((b.maxX - b.minX) * UNIT) / 2;
        const { w } = size;
        const x = Math.max(WALL + hw + 2, Math.min(w - WALL - hw - 2, w * 0.5 + (Math.random() - 0.5) * (w * 0.4)));
        const yTop = -((b.maxY - b.minY) * UNIT) - 8;
        const { body, ox, oy } = makeBody(M, paint, x, yTop, UNIT);
        M.Composite.add(engine.world, body);
        pieces.push({ body, paint, ox, oy });
        wake();
      }
      if (queue.length > 0) dropTimer = window.setTimeout(pump, DROP_EVERY);
    };

    const setDay = (dayTasks: Task[]) => {
      if (!M || !engine) return;
      M.Composite.remove(engine.world, pieces.map((p) => p.body));
      pieces = [];
      queue = dayTasks.slice(0, MAX_PIECES);
      window.clearTimeout(dropTimer);
      if (live) pump();
    };

    let pendingDay: Task[] | null = null;
    let pendingActive = false;
    // 呼び側が [tasksKey, active] で絞るので、ここは素直に「積み直す/回す or
    // 止める」だけ。日が変わったか自前で見分ける必要は無い。
    ctrlRef.current = {
      update: (dayTasks, on) => {
        if (!M) { pendingDay = dayTasks; pendingActive = on; return; }
        live = on;
        if (on) { setDay(dayTasks); wake(); }
        else { running = false; cancelAnimationFrame(raf); window.clearTimeout(dropTimer); }
      },
    };

    (async () => {
      M = await import("matter-js");
      if (disposed) return;
      size = { w: wrap.offsetWidth, h: wrap.offsetHeight };
      engine = M.Engine.create({ enableSleeping: true });
      engine.gravity.y = 1.5;
      walls();
      if (pendingDay) ctrlRef.current?.update(pendingDay, pendingActive);
    })();

    const ro = new ResizeObserver(() => {
      const w = wrap.offsetWidth;
      const h = wrap.offsetHeight;
      if (Math.abs(w - size.w) < 0.5 && Math.abs(h - size.h) < 0.5) return;
      size = { w, h };
      walls();
    });
    ro.observe(wrap);

    return () => {
      disposed = true;
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(dropTimer);
      ctrlRef.current = null;
    };
  }, []);

  // 選んだ日 / 表示状態を器へ流す。
  useEffect(() => {
    ctrlRef.current?.update(tasks, active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksKey, active]);

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      // ★シリンダーごと少しだけ傾ける(穴を斜めに覗き込んでいる感じ)。
      transform: "rotate(-5deg)", transformOrigin: "50% 60%",
    }}>
      {/* 薄いグレーのシリンダー。上は開いていて、そこへ落ちてくる。 */}
      <div style={{
        position: "absolute", inset: 0, background: tint,
        borderRadius: "40% 40% 46% 46% / 7% 7% 5% 5%",
      }} />
      {/* 内側の影で筒の丸みを出す。 */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "40% 40% 46% 46% / 7% 7% 5% 5%", pointerEvents: "none",
        boxShadow: "inset 16px 0 22px -14px rgba(0,0,0,0.4), inset -16px 0 22px -14px rgba(0,0,0,0.4)",
      }} />
      {/* ★筒の形に**切り抜く**(2D の切り抜き。3D 変形は外側の rotate だけ)。
          あふれた図形が筒の縁の外へ出ず、「筒に溜まった」ように見える。 */}
      <div ref={wrapRef} style={{
        position: "absolute", inset: `0 ${WALL}px`, overflow: "hidden",
        borderRadius: "40% 40% 46% 46% / 7% 7% 5% 5%",
      }}>
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}

function makeBody(
  M: typeof import("matter-js"), paint: SolidPaint, x: number, y: number, unit: number,
): { body: Body; ox: number; oy: number } {
  const opts = { restitution: 0.05, friction: 0.6, frictionStatic: 0.9, frictionAir: 0.01 };
  const n = paint.spec.sides.length;
  const { w, h } = rectOf(paint.spec);
  let body: Body;
  let ox = 0;
  let oy = 0;
  if (n === 1) {
    body = M.Bodies.circle(x, y, (w * unit) / 2, opts);
  } else {
    const src = sectionOutline(n);
    const step = Math.max(1, Math.ceil(src.length / 10));
    const verts = src.filter((_, k) => k % step === 0).map((q) => ({ x: q.x * w * unit, y: q.y * h * unit }));
    body = M.Bodies.fromVertices(x, y, [verts], opts);
    const c = M.Vertices.centre(verts);
    ox = -c.x;
    oy = -c.y;
  }
  return { body, ox, oy };
}
