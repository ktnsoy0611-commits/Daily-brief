"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Body, Engine } from "matter-js";
import { LayerName } from "@/components/tasks/LayerName";
import { DemoSeedButton } from "@/components/tasks/TaskAddButton";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { MUTED, NAV_H, PAPER } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { rectOf, sectionOutline } from "@/lib/solid";
import { peekSolidBitmap, shapeBounds, shapeGlyphsReady, solidBitmap, warmShapeGlyphs, type SolidPaint } from "@/lib/solidPaint";
import { demoCandidates } from "@/lib/taskDemo";
import { specOf } from "@/lib/taskSize";
import { resolveTag } from "@/lib/taskTags";
import { TYPE } from "@/lib/tokens";
import type { InboxCandidate, TabProps } from "@/lib/types";

// ★候補の層(DRIFT。第44巡に無重力の物理へ)。まだ確定していない候補の図形が、
// **無重力の空間にふわふわ漂う**。掴んで動かしても無重力のように流れ、離すと
// その速さで漂い続ける。掴んでいるあいだ、右下から**ゴミ箱**と**口**が出てきて、
// ・ゴミ箱の上で離す → 候補を捨てる、・口の上で離す → 候補をタスクにする。
//
// ★CSS の 3D 変形は使わない。物理は matter.js(重力ゼロ)。毎フレームのコストは
// 物体ごとに drawImage 1回。物理と描画・ジェスチャーの閉包は**この1つの effect**
// に持ち、外(候補の増減・表示状態)からは ctrl(ref)越しに触る。

/** 図形の一律の幅。器の幅に対する割合と上限。 */
const W_RATIO = 0.30;
const W_MAX = 148;
/** 漂う速さ(px/フレーム)の下限・上限。無重力なので止まらず、暴れない。 */
const DRIFT_MIN = 0.16;
const DRIFT_MAX = 1.0;
/** タップとホールドの境目。 */
const HOLD_MS = 150;
const TAP_MOVE = 8;
/** 離した指の速さを物体へ渡す倍率(投げ)。 */
const FLING = 0.9;
/** 消える演出の速さ(0→1)。 */
const GONE_STEP = 0.09;

interface Piece { id: string; body: Body; paint: SolidPaint; ox: number; oy: number; unit: number; gone: number; gx: number; gy: number }
type Target = "trash" | "mouth" | null;
interface Ctrl { sync: (list: InboxCandidate[]) => void; setActive: (on: boolean) => void }

const paintOf = (c: InboxCandidate): SolidPaint => ({
  spec: specOf(c), view: "name", title: c.title,
  tag: resolveTag(c.tag, c.id, c.title, c.context, c.belongings, c.note),
});

export function DriftTab({ appState, persist, showToast, goTab, appActive, active, dragged }: TabProps & {
  appActive?: boolean;
  /** この層が画面に居るか(物理を回すのはそのときだけ)。 */
  active?: boolean;
  dragged?: React.MutableRefObject<boolean>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const [hover, setHover] = useState<Target>(null);
  const inbox = appState.inbox;
  const candidates = useMemo(() => (inbox ?? []).filter((c) => c.kind === "task"), [inbox]);
  const notes = (appState.voiceNotes ?? []).filter((n) => n.status === "new").length;
  const open = candidates.find((c) => c.id === openId) ?? null;
  const count = candidates.length;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trashRef = useRef<HTMLDivElement | null>(null);
  const mouthRef = useRef<HTMLDivElement | null>(null);
  const ctrlRef = useRef<Ctrl | null>(null);
  const listKey = candidates.map((c) => c.id).join(",");

  // データ操作を物理の閉包から最新の形で呼ぶための窓口。
  const actRef = useRef<{ reject: (id: string) => void; accept: (id: string) => void; open: (id: string) => void }>({ reject: () => {}, accept: () => {}, open: () => {} });

  const remember = (next: typeof appState, id: string) => {
    next.profile.handledInbox = Array.from(new Set([...(next.profile.handledInbox ?? []), id])).slice(-500);
  };
  const patch = (id: string, p: Partial<ComposerData>) => {
    const next = structuredClone(appState);
    const c = next.inbox.find((x) => x.id === id);
    if (c) Object.assign(c, p);
    persist(next);
  };
  const reject = useCallback((id: string) => {
    const next = structuredClone(appState);
    next.inbox = next.inbox.filter((x) => x.id !== id);
    remember(next, id);
    persist(next);
    showToast("候補を捨てました");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState, persist, showToast]);
  const accept = useCallback((id: string) => {
    const c = (appState.inbox ?? []).find((x) => x.id === id);
    if (!c) return;
    const next = structuredClone(appState);
    next.tasks.unshift({
      id: `task-${Date.now()}`, title: c.title,
      dueDate: c.dueDate, endDate: c.endDate, dueTime: c.dueTime, endTime: c.endTime,
      context: c.context, belongings: c.belongings,
      weight: c.weight ?? 2, tag: c.tag, note: c.note, done: false, createdAt: new Date().toISOString(),
    });
    next.inbox = next.inbox.filter((x) => x.id !== id);
    remember(next, id);
    persist(next);
    showToast("タスクにしました");
    goTab("tasks-gravity");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState, persist, showToast, goTab]);
  useEffect(() => { actRef.current = { reject, accept, open: (id) => setOpenId(id) }; }, [reject, accept]);

  // ── 物理・描画・ジェスチャー(マウント1回) ────────────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    const cv = canvasRef.current;
    if (!wrap || !cv) return;
    let disposed = false;
    let M: typeof import("matter-js") | null = null;
    let engine: Engine | null = null;
    let pieces: Piece[] = [];
    let size = { w: 0, h: 0 };
    let running = false;
    let raf = 0;
    let live = false;
    let grab: {
      id: number; piece: Piece; ox: number; oy: number; downX: number; downY: number;
      moved: boolean; held: boolean; lastX: number; lastY: number; vx: number; vy: number; holdT: number;
    } | null = null;

    const walls = () => {
      if (!M || !engine) return;
      const old = M.Composite.allBodies(engine.world).filter((b) => b.isStatic);
      M.Composite.remove(engine.world, old);
      const { w, h } = size;
      const T = 80;
      const o = { isStatic: true, restitution: 1, friction: 0 };
      M.Composite.add(engine.world, [
        M.Bodies.rectangle(w / 2, -T / 2, w + T * 2, T, o),
        M.Bodies.rectangle(w / 2, h + T / 2, w + T * 2, T, o),
        M.Bodies.rectangle(-T / 2, h / 2, T, h + T * 2, o),
        M.Bodies.rectangle(w + T / 2, h / 2, T, h + T * 2, o),
      ]);
    };

    const addPiece = (c: InboxCandidate) => {
      if (!M || !engine) return;
      const { w, h } = size;
      const paint = paintOf(c);
      const b = shapeBounds(paint);
      const wu = Math.max(1e-3, b.maxX - b.minX);
      const unit = Math.min(W_MAX, w * W_RATIO) / wu;
      const hw = ((b.maxX - b.minX) * unit) / 2;
      const hh = ((b.maxY - b.minY) * unit) / 2;
      const x = hw + 6 + frac(c.id) * Math.max(1, w - 2 * hw - 12);
      const y = hh + 6 + frac(c.id + "y") * Math.max(1, h - 2 * hh - 12);
      const { body, ox, oy } = makeBody(M, paint, x, y, unit);
      const a = frac(c.id + "v") * Math.PI * 2;
      const sp = DRIFT_MIN + frac(c.id + "s") * (DRIFT_MAX - DRIFT_MIN);
      M.Body.setVelocity(body, { x: Math.cos(a) * sp, y: Math.sin(a) * sp });
      M.Body.setAngularVelocity(body, (frac(c.id + "w") - 0.5) * 0.02);
      M.Composite.add(engine.world, body);
      pieces.push({ id: c.id, body, paint, ox, oy, unit, gone: 0, gx: 0, gy: 0 });
    };
    const sync = (list: InboxCandidate[]) => {
      if (!M || !engine) return;
      const alive = new Set(list.map((c) => c.id));
      pieces = pieces.filter((p) => {
        if (alive.has(p.id) || p.gone > 0) return true;
        M!.Composite.remove(engine!.world, p.body);
        return false;
      });
      const have = new Set(pieces.map((p) => p.id));
      for (const c of list) if (!have.has(c.id)) addPiece(c);
      wake();
    };

    const clampDrift = () => {
      if (!M) return;
      for (const p of pieces) {
        if ((grab && grab.piece === p) || p.gone > 0 || p.body.isStatic) continue;
        const v = p.body.velocity;
        const sp = Math.hypot(v.x, v.y);
        if (sp < DRIFT_MIN) {
          const a = sp < 1e-4 ? frac(p.id + "n") * Math.PI * 2 : Math.atan2(v.y, v.x);
          M.Body.setVelocity(p.body, { x: Math.cos(a) * DRIFT_MIN, y: Math.sin(a) * DRIFT_MIN });
        } else if (sp > DRIFT_MAX) {
          M.Body.setVelocity(p.body, { x: (v.x / sp) * DRIFT_MAX, y: (v.y / sp) * DRIFT_MAX });
        }
      }
    };

    const draw = () => {
      const { w, h } = size;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const ctx = cv.getContext("2d");
      if (!ctx) return false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      let pending = false;
      for (const p of pieces) {
        let bx = p.body.position.x, by = p.body.position.y, sc = 1, alpha = 1;
        if (p.gone > 0) { bx += (p.gx - bx) * p.gone; by += (p.gy - by) * p.gone; sc = 1 - p.gone; alpha = 1 - p.gone; }
        let bmp = peekSolidBitmap(p.paint, p.unit, dpr);
        if (shapeGlyphsReady(p.paint, p.unit, dpr)) bmp = solidBitmap(p.paint, p.unit, dpr);
        else { warmShapeGlyphs(p.paint, 3, p.unit, dpr); pending = true; }
        if (!bmp) continue;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(p.body.angle);
        ctx.scale(sc, sc);
        ctx.globalAlpha = alpha;
        ctx.drawImage(bmp.canvas, p.ox - bmp.w / 2, p.oy - bmp.h / 2, bmp.w, bmp.h);
        ctx.restore();
      }
      return pending;
    };

    const step = () => {
      if (disposed || !M || !engine) { running = false; return; }
      let removed = false;
      for (const p of pieces) if (p.gone > 0) { p.gone = Math.min(1, p.gone + GONE_STEP); if (p.gone >= 1) removed = true; }
      if (removed) {
        for (const p of pieces.filter((x) => x.gone >= 1)) M.Composite.remove(engine.world, p.body);
        pieces = pieces.filter((x) => x.gone < 1);
      }
      clampDrift();
      M.Engine.update(engine, 1000 / 60);
      const pending = draw();
      if (running && live && (pieces.length > 0 || pending)) raf = requestAnimationFrame(step);
      else running = false;
    };
    const wake = () => { if (!running && live && M) { running = true; raf = requestAnimationFrame(step); } };

    // ── ジェスチャー ──
    const pointAt = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const hitPiece = (px: number, py: number): Piece | null => {
      if (!M) return null;
      const hits = M.Query.point(pieces.filter((p) => p.gone === 0).map((p) => p.body), { x: px, y: py });
      if (!hits.length) return null;
      const body = hits[hits.length - 1];
      return pieces.find((p) => p.body === body) ?? null;
    };
    const targetAt = (cx: number, cy: number): Target => {
      const inR = (el: HTMLElement | null) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return cx >= r.left - 14 && cx <= r.right + 14 && cy >= r.top - 14 && cy <= r.bottom + 14;
      };
      if (inR(mouthRef.current)) return "mouth";
      if (inR(trashRef.current)) return "trash";
      return null;
    };
    const enterHold = () => {
      if (!grab || !M) return;
      grab.held = true;
      haptic(10);
      setHolding(true);
      M.Body.setStatic(grab.piece.body, true);
    };
    const onDown = (e: PointerEvent) => {
      if (document.documentElement.hasAttribute("data-overlay") || grab) return;
      const { x, y } = pointAt(e);
      const piece = hitPiece(x, y);
      if (!piece) return;                 // 空きは掴まない → カメラのパンに任せる
      e.stopPropagation();                 // 図形の上ではカメラを動かさない
      grab = {
        id: e.pointerId, piece, ox: piece.body.position.x - x, oy: piece.body.position.y - y,
        downX: e.clientX, downY: e.clientY, moved: false, held: false,
        lastX: e.clientX, lastY: e.clientY, vx: 0, vy: 0, holdT: window.setTimeout(enterHold, HOLD_MS),
      };
    };
    const onMove = (e: PointerEvent) => {
      if (!grab || e.pointerId !== grab.id || !M) return;
      if (!grab.moved && Math.hypot(e.clientX - grab.downX, e.clientY - grab.downY) > TAP_MOVE) {
        grab.moved = true;
        if (!grab.held) { window.clearTimeout(grab.holdT); enterHold(); }
      }
      if (!grab.held) return;
      if (dragged) dragged.current = true;
      const { x, y } = pointAt(e);
      M.Body.setPosition(grab.piece.body, { x: x + grab.ox, y: y + grab.oy });
      grab.vx = e.clientX - grab.lastX; grab.vy = e.clientY - grab.lastY;
      grab.lastX = e.clientX; grab.lastY = e.clientY;
      const t = targetAt(e.clientX, e.clientY);
      setHover((cur) => (cur === t ? cur : t));
    };
    const onUp = (e: PointerEvent) => {
      if (!grab || e.pointerId !== grab.id) return;
      window.clearTimeout(grab.holdT);
      const g = grab; grab = null;
      const p = g.piece;
      if (!M) { setHolding(false); setHover(null); return; }
      if (!g.held) {
        if (!g.moved && !dragged?.current) { haptic(8); actRef.current.open(p.id); }
        return;
      }
      M.Body.setStatic(p.body, false);
      const t = targetAt(e.clientX, e.clientY);
      setHolding(false); setHover(null);
      if (t) {
        const cr = cv.getBoundingClientRect();
        const el = t === "mouth" ? mouthRef.current : trashRef.current;
        const rr = el?.getBoundingClientRect();
        if (rr) { p.gx = rr.left + rr.width / 2 - cr.left; p.gy = rr.top + rr.height / 2 - cr.top; }
        p.gone = 0.001;
        haptic(t === "trash" ? 14 : 20);
        el?.setAttribute("data-fire", "");
        window.setTimeout(() => el?.removeAttribute("data-fire"), 460);
        window.setTimeout(() => { if (t === "trash") actRef.current.reject(p.id); else actRef.current.accept(p.id); }, 260);
        wake();
      } else {
        M.Body.setVelocity(p.body, { x: g.vx * FLING, y: g.vy * FLING });
        wake();
      }
    };

    const ro = new ResizeObserver(() => {
      const w = wrap.offsetWidth, h = wrap.offsetHeight;
      if (Math.abs(w - size.w) < 0.5 && Math.abs(h - size.h) < 0.5) return;
      size = { w, h };
      if (M && engine) { walls(); wake(); }
    });
    ro.observe(wrap);

    let pending: InboxCandidate[] | null = null;
    let pendingLive = false;
    ctrlRef.current = {
      sync: (list) => { if (!M) { pending = list; return; } sync(list); },
      setActive: (on) => {
        pendingLive = on;
        live = on;
        if (on) wake();
        else { running = false; cancelAnimationFrame(raf); }
      },
    };

    (async () => {
      M = await import("matter-js");
      if (disposed) return;
      size = { w: wrap.offsetWidth, h: wrap.offsetHeight };
      engine = M.Engine.create({ enableSleeping: false });
      engine.gravity.x = 0; engine.gravity.y = 0;
      walls();
      live = pendingLive;
      if (pending) sync(pending);
    })();

    cv.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      disposed = true;
      ro.disconnect();
      cancelAnimationFrame(raf);
      cv.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      ctrlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { ctrlRef.current?.sync(candidates); }, [listKey]);
  useEffect(() => { ctrlRef.current?.setActive(active !== false && appActive !== false); }, [active, appActive]);

  const seedDemo = () => {
    const next = structuredClone(appState);
    next.inbox = [...demoCandidates(), ...(next.inbox ?? [])];
    persist(next);
    showToast("デモの候補を入れました");
  };

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <LayerName text="DRIFT" />

      {/* 無重力の場。 */}
      <div ref={wrapRef} className="full-bleed" style={{ position: "absolute", inset: 0 }}>
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none" }} />
      </div>

      {/* ゴミ箱と口。掴んでいるあいだ、右下から出てくる。 */}
      <div style={{
        position: "absolute", right: 14, bottom: `calc(${NAV_H} + 12px)`, display: "flex", flexDirection: "column", gap: 14,
        pointerEvents: "none", zIndex: 4,
      }}>
        <div ref={mouthRef} className={`drift-target${holding ? " in" : ""}${hover === "mouth" ? " hot" : ""}`} data-kind="mouth">
          <MouthMark />
        </div>
        <div ref={trashRef} className={`drift-target${holding ? " in" : ""}${hover === "trash" ? " hot" : ""}`} data-kind="trash">
          <TrashMark />
        </div>
      </div>

      <div style={{ position: "absolute", left: 16, right: 16, bottom: `calc(${NAV_H} + 8px)`, textAlign: "center", pointerEvents: "none" }}>
        {notes > 0 && !holding && (
          <div style={{ fontSize: TYPE.small, color: MUTED }}>まだ読まれていない声のメモが{notes}件</div>
        )}
        {count === 0 && <div style={{ pointerEvents: "auto" }}><DemoSeedButton label="デモの候補を入れる" onSeed={seedDemo} /></div>}
      </div>

      {open && (
        <TaskComposer
          key={open.id}
          data={open}
          mode="candidate"
          onCommit={(d) => patch(open.id, d)}
          onConfirm={(d) => { patch(open.id, d); accept(open.id); setOpenId(null); }}
          onDelete={() => { reject(open.id); setOpenId(null); }}
          onClose={(d) => { patch(open.id, d); setOpenId(null); }}
        />
      )}
    </div>
  );
}

/** ★口。抽象的なレンズ状(閉じた口)。ホバーで開き、離すと噛む(CSS)。 */
function MouthMark() {
  return (
    <svg width={30} height={30} viewBox="0 0 30 30" aria-hidden focusable="false">
      <path className="mouth-lip" d="M3 15 Q15 8 27 15 Q15 22 3 15 Z" fill={PAPER} />
    </svg>
  );
}
/** ★ゴミ箱。抽象的な漏斗(逆三角)＋上の帯。ホバーで震える(CSS)。 */
function TrashMark() {
  return (
    <svg width={30} height={30} viewBox="0 0 30 30" aria-hidden focusable="false">
      <rect x={5} y={6} width={20} height={3.4} fill={PAPER} />
      <path d="M6 11 H24 L18 25 H12 Z" fill={PAPER} />
    </svg>
  );
}

/** id → 0〜1 のばらけた値(黄金比で桁を混ぜる)。 */
function frac(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (Math.imul(h, 2654435761) >>> 0) / 4294967296;
}

function makeBody(
  M: typeof import("matter-js"), paint: SolidPaint, x: number, y: number, unit: number,
): { body: Body; ox: number; oy: number } {
  const opts = { restitution: 0.98, friction: 0, frictionAir: 0, frictionStatic: 0 };
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
