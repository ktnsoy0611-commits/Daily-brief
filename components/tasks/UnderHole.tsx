"use client";

import { useEffect, useRef } from "react";
import type { Body, Engine } from "matter-js";
import { HELV, PAPER } from "@/lib/constants";
import { rectOf, sectionOutline } from "@/lib/solid";
import { peekSolidBitmap, shapeBounds, shapeGlyphsReady, solidBitmap, warmShapeGlyphs, type SolidPaint } from "@/lib/solidPaint";
import { specOf } from "@/lib/taskSize";
import { resolveTag } from "@/lib/taskTags";
import type { Task } from "@/lib/types";

// ★穴の断面(第41巡→第42巡)。地表から地中へ通じる穴を**断面で抽象化**した
// グレーの縦の帯(上端は地表と繋がるので平ら)。選んだ日のタスクが図形になって
// 上から落ち、**一段に一個**ずつ積もる(図形の幅は穴の太さと同じ＝横に2つ
// 並べない)。最後に**曜日の文字**(枠なし・TUE 等)が降ってきて、穴に**蓋をする**。
//
// ★物理は真下向き。3D は使わない。毎フレームのコストは物体ごとに drawImage
// または塗り1回。物理と描画のループは**この1つの effect の閉包**に持つ。

/** 断面の帯の色(抽象的なグレー)。 */
const SHAFT = "#403F3B";
/** 図形が帯の幅のどれだけを占めるか。★穴の大きさ≒図形の幅(ユーザー指定)なので
 *  ほぼ 1。少しだけ余白を残して壁に噛まないようにする。 */
const FILL = 0.96;
/** 落とす間隔(ms)。1つずつ落ちてくるのが見えるように。 */
const DROP_EVERY = 150;
/** 穴に入れるタスクの上限(帯からあふれない数)。 */
const MAX_PIECES = 6;
/** 蓋(曜日)の高さ、帯の幅に対する比。 */
const LID_RATIO = 0.42;
/** ★穴の傾き。上端を左へ**少しだけ**ずらして傾ける(底は水平のまま＝平行)。 */
const SKEW = 0.10;

interface Piece {
  body: Body;
  /** タスクの図形 or 曜日の蓋。 */
  paint?: SolidPaint;
  lid?: string;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

interface Ctrl { update: (tasks: Task[], weekday: string, active: boolean, drop: boolean) => void }

const paintOf = (t: Task): SolidPaint => ({
  spec: specOf(t), view: "tag", title: t.title,
  tag: resolveTag(t.tag, t.id, t.title, t.context, t.belongings, t.note),
});

export function UnderHole({ tasks, weekday, active, drop }: {
  tasks: Task[];
  /** 蓋に降ってくる曜日(例 "TUE")。 */
  weekday: string;
  active: boolean;
  /** 図形を落とし始めてよいか。地面が画面に入ってくる位相で true(`TaskSpace`)。 */
  drop?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctrlRef = useRef<Ctrl | null>(null);
  const key = tasks.map((t) => t.id).join(",") + "|" + weekday;

  useEffect(() => {
    const wrap = wrapRef.current;
    const cv = canvasRef.current;
    if (!wrap || !cv) return;
    let disposed = false;
    let M: typeof import("matter-js") | null = null;
    let engine: Engine | null = null;
    let pieces: Piece[] = [];
    let queue: Task[] = [];
    let lidWord = "";
    let size = { w: 0, h: 0 };
    let running = false;
    let raf = 0;
    let dropTimer = 0;
    let live = false;
    let dropping = false;
    let lastKey = "";

    // 帯の幅(＝図形の一律の幅)と、器の中の左端。
    const shaftW = () => Math.min(size.w, size.h * 0.34);
    const shaftX = () => (size.w - shaftW()) / 2;

    const walls = () => {
      if (!M || !engine) return;
      const old = M.Composite.allBodies(engine.world).filter((b) => b.isStatic);
      M.Composite.remove(engine.world, old);
      const { h } = size;
      const sw = shaftW();
      const sx = shaftX();
      const dx = h * SKEW;               // 上端の左ずれ(平行四辺形の傾き)
      const th = Math.atan2(dx, h);      // 壁の傾き(鉛直から)
      const T = 200;
      const opts = { isStatic: true, friction: 0.5, frictionStatic: 0.7 };
      // ★左右の壁は平行四辺形の斜辺に沿わせる(傾いた矩形)。床は水平のまま。
      const left = M.Bodies.rectangle(sx - dx / 2 - T / 2, h / 2, T, h * 2.2, opts);
      M.Body.setAngle(left, th);
      const right = M.Bodies.rectangle(sx + sw - dx / 2 + T / 2, h / 2, T, h * 2.2, opts);
      M.Body.setAngle(right, th);
      M.Composite.add(engine.world, [
        M.Bodies.rectangle(sx + sw / 2, h + T / 2 - 1, sw + T, T, { isStatic: true, friction: 0.8 }),
        left, right,
      ]);
    };

    const draw = (): boolean => {
      const { w, h } = size;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const ctx = cv.getContext("2d");
      if (!ctx) return false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // ★断面の帯(抽象的なグレー)。**少し傾け・底は水平・角丸なし**。上端を
      //   左へ SKEW*h ずらした平行四辺形(左右の壁が傾き、上下は水平)。
      const sw = shaftW();
      const sx = shaftX();
      const dx = h * SKEW;
      ctx.fillStyle = SHAFT;
      ctx.beginPath();
      ctx.moveTo(sx - dx, 0);
      ctx.lineTo(sx + sw - dx, 0);
      ctx.lineTo(sx + sw, h);
      ctx.lineTo(sx, h);
      ctx.closePath();
      ctx.fill();
      let pending = false;
      for (const p of pieces) {
        ctx.save();
        ctx.translate(p.body.position.x, p.body.position.y);
        ctx.rotate(p.body.angle);
        if (p.lid !== undefined) {
          // ★曜日の蓋。**枠なし**でテキストそのもの(ユーザー指定)。当たり判定の
          //   箱は描かず、文字だけを白い Helvetica で置く。
          ctx.fillStyle = PAPER;
          ctx.font = `700 ${Math.round(p.h * 0.82)}px ${HELV}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.letterSpacing = "1px";
          ctx.fillText(p.lid, 0, 1);
        } else if (p.paint) {
          let bmp = peekSolidBitmap(p.paint, p.w, dpr);
          if (shapeGlyphsReady(p.paint, p.w, dpr)) bmp = solidBitmap(p.paint, p.w, dpr);
          else { warmShapeGlyphs(p.paint, 3, p.w, dpr); pending = true; }
          if (bmp) ctx.drawImage(bmp.canvas, p.ox - bmp.w / 2, p.oy - bmp.h / 2, bmp.w, bmp.h);
        }
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

    const dropShape = (t: Task) => {
      if (!M || !engine) return;
      const paint = paintOf(t);
      const b = shapeBounds(paint);
      const wUnits = Math.max(1e-3, b.maxX - b.minX);
      // ★幅を帯の太さに合わせる(一律)。unit = 目標幅 / 図形の横幅(単位)。
      const unit = (shaftW() * FILL) / wUnits;
      const bw = (b.maxX - b.minX) * unit;
      const bh = (b.maxY - b.minY) * unit;
      // 上の開口(左へ dx ずれている)の中央へ落とす。
      const dxTop = size.h * SKEW;
      const cx = shaftX() + shaftW() / 2 - dxTop;
      const { body, ox, oy } = makeBody(M, paint, cx, -bh - 8, unit);
      M.Composite.add(engine.world, body);
      pieces.push({ body, paint, ox, oy, w: unit, h: bh });
      void bw;
      wake();
    };
    const dropLid = () => {
      if (!M || !engine || !lidWord) return;
      const sw = shaftW();
      const lidW = sw * FILL;
      const lidH = sw * LID_RATIO;
      const cx = shaftX() + sw / 2;
      const body = M.Bodies.rectangle(cx, -lidH - 8, lidW, lidH, { restitution: 0.02, friction: 0.9, frictionStatic: 1 });
      M.Composite.add(engine.world, body);
      pieces.push({ body, lid: lidWord, ox: 0, oy: 0, w: lidW, h: lidH });
      wake();
    };
    const pump = () => {
      if (!M || !engine || !live || !dropping) return;
      const t = queue.shift();
      if (t) { dropShape(t); dropTimer = window.setTimeout(pump, DROP_EVERY); }
      else if (lidWord && !pieces.some((p) => p.lid !== undefined)) {
        // 図形を落とし切ったら、少し置いてから曜日の蓋を落とす。
        dropTimer = window.setTimeout(dropLid, DROP_EVERY * 2);
      }
    };

    const setDay = (dayTasks: Task[], wd: string) => {
      if (!M || !engine) return;
      M.Composite.remove(engine.world, pieces.map((p) => p.body));
      pieces = [];
      queue = dayTasks.slice(0, MAX_PIECES);
      lidWord = wd;
      window.clearTimeout(dropTimer);
    };

    let pendingDay: Task[] | null = null;
    let pendingWd = "";
    let pendingActive = false;
    let pendingDrop = false;
    ctrlRef.current = {
      update: (dayTasks, wd, on, dr) => {
        if (!M) { pendingDay = dayTasks; pendingWd = wd; pendingActive = on; pendingDrop = dr; return; }
        live = on;
        if (!on) { dropping = false; running = false; cancelAnimationFrame(raf); window.clearTimeout(dropTimer); return; }
        const k = dayTasks.map((t) => t.id).join(",");
        if (k !== lastKey) { setDay(dayTasks, wd); lastKey = k; }
        wake();   // 表示中は帯を描くために回す(まだ落とさなくても)
        // ★落とし始めの合図。地面が入ってくる位相で dr=true が来る。
        if (dr && !dropping) { dropping = true; pump(); }
        else if (!dr) { dropping = false; window.clearTimeout(dropTimer); }
      },
    };

    (async () => {
      M = await import("matter-js");
      if (disposed) return;
      size = { w: wrap.offsetWidth, h: wrap.offsetHeight };
      engine = M.Engine.create({ enableSleeping: true });
      engine.gravity.y = 1.6;
      walls();
      if (pendingDay) ctrlRef.current?.update(pendingDay, pendingWd, pendingActive, pendingDrop);
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

  useEffect(() => {
    ctrlRef.current?.update(tasks, weekday, active, drop !== false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active, drop]);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
  );
}


function makeBody(
  M: typeof import("matter-js"), paint: SolidPaint, x: number, y: number, unit: number,
): { body: Body; ox: number; oy: number } {
  const opts = { restitution: 0.03, friction: 0.7, frictionStatic: 1, frictionAir: 0.01 };
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
