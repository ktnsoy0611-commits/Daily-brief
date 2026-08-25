"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Body, Engine } from "matter-js";
import { LayerName } from "@/components/tasks/LayerName";
import { DemoSeedButton } from "@/components/tasks/TaskAddButton";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { DropTargets, fireTarget, targetAt, type DropTarget } from "@/components/tasks/DropTargets";
import { MUTED, NAV_H, navHeightPx } from "@/lib/constants";
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

/** 図形の一律の幅。器の幅に対する割合と上限。★第54巡に大きく(画面に対して
 *  小さすぎるというユーザー指摘)。 */
const W_RATIO = 0.34;
const W_MAX = 150;
/** ★★**投げたら減速して止まる**(第54巡にユーザー指定)。以前は `clampDrift` で
 *  速さの**下限**を保って永久に漂わせていたが、「勢いで動いてくれて良いが減速して
 *  止まってほしい」という指定なので、下限をやめ**空気抵抗**で静かに止める。
 *  最初のひと押しだけ与えて、あとは指の投げ(`FLING`)に任せる。 */
const DRIFT_MAX = 1.0;
/** 湧いた直後のごく弱いひと押し。 */
const DRIFT_SEED = 0.35;
/** 空気抵抗(大きいほど早く止まる)。 */
const DRIFT_AIR = 0.016;
/** 使える範囲の上端(アプリ名の札＋層の名前のぶん)。 */
const FIELD_TOP = 124;
/** この件数までは目一杯の大きさ。これを超えたら件数の平方根で縮める。 */
const FIT_N = 6;
/** タップとホールドの境目。 */
const HOLD_MS = 150;
const TAP_MOVE = 8;
/** 離した指の速さを物体へ渡す倍率(投げ)。 */
const FLING = 0.9;
/** 消える演出の速さ(0→1)。 */
const GONE_STEP = 0.09;

interface Piece { id: string; body: Body; paint: SolidPaint; ox: number; oy: number; unit: number; gone: number; gx: number; gy: number }
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
  const [hover, setHover] = useState<DropTarget>(null);
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

    /** 使える範囲(**canvas の座標**)。★★器は `full-bleed` なので、canvas は画面より
     *  上下左右へはみ出している(実測 422×894 @ -16,-16)。`size.h` をそのまま床に
     *  すると**タブバーの裏まで**器が広がり、図形が潜り込む(第54巡のユーザー指摘)。
     *  画面の座標を canvas の座標へ**必ず変換**してから壁を置く。 */
    const fieldOf = () => {
      const r = wrap.getBoundingClientRect();
      return {
        left: -r.left,
        right: window.innerWidth - r.left,
        top: FIELD_TOP - r.top,
        bottom: (window.innerHeight - navHeightPx()) - r.top,
      };
    };
    const walls = () => {
      if (!M || !engine) return;
      const { left, right, top, bottom } = fieldOf();
      const old = M.Composite.allBodies(engine.world).filter((b) => b.isStatic);
      M.Composite.remove(engine.world, old);
      const T = 80;
      const o = { isStatic: true, restitution: 0.9, friction: 0 };
      const cx = (left + right) / 2, cy = (top + bottom) / 2;
      const ww = right - left, hh = bottom - top;
      M.Composite.add(engine.world, [
        M.Bodies.rectangle(cx, top - T / 2, ww + T * 2, T, o),
        M.Bodies.rectangle(cx, bottom + T / 2, ww + T * 2, T, o),
        M.Bodies.rectangle(left - T / 2, cy, T, hh + T * 2, o),
        M.Bodies.rectangle(right + T / 2, cy, T, hh + T * 2, o),
      ]);
    };

    const addPiece = (c: InboxCandidate, idx = 0, total = 1) => {
      if (!M || !engine) return;
      const paint = paintOf(c);
      const b = shapeBounds(paint);
      const wu = Math.max(1e-3, b.maxX - b.minX);
      // ★大きさは**画面の幅**から決める(canvas は full-bleed で 32px 広い)。
      //   ★★件数が多いときは**その分だけ縮める**。大きいまま詰め込むと、無重力で
      //   押し合って壁をすり抜け、画面の外へ出てしまう(第54巡に実測)。少数のときは
      //   目一杯大きいままなので、「小さすぎる」という指摘には応えられている。
      const crowd = Math.min(1, Math.sqrt(FIT_N / Math.max(1, total)));
      const unit = (Math.min(W_MAX, window.innerWidth * W_RATIO) * crowd) / wu;
      const hw = ((b.maxX - b.minX) * unit) / 2;
      const hh = ((b.maxY - b.minY) * unit) / 2;
      // ★★湧くのは**画面の真ん中あたり**(第54巡にユーザー指定)。四隅から始めると
      //   端に貼り付いたまま気づかれない。★ただし**同じ点に重ねない** — 大きな図形が
      //   重なって湧くと、物理が押し合って壁をすり抜け画面の外へ飛ぶ(実測)。
      //   中心を囲む**ひまわり配置**(黄金角)で、真ん中に寄せつつ均等にばらす。
      const { left, right, top, bottom } = fieldOf();
      const midX = (left + right) / 2, midY = (top + bottom) / 2;
      const rx = Math.max(0, (right - left) / 2 - hw - 8);
      const ry = Math.max(0, (bottom - top) / 2 - hh - 8);
      const t = Math.sqrt((idx + 0.5) / Math.max(1, total));
      const ang = idx * 2.399963 + frac(c.id) * 0.6;
      const x = Math.max(left + hw + 6, Math.min(right - hw - 6, midX + Math.cos(ang) * rx * t * 0.9));
      const y = Math.max(top + hh + 6, Math.min(bottom - hh - 6, midY + Math.sin(ang) * ry * t * 0.9));
      const { body, ox, oy } = makeBody(M, paint, x, y, unit);
      const a = frac(c.id + "v") * Math.PI * 2;
      const sp = DRIFT_SEED * (0.4 + frac(c.id + "s") * 0.6);
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
      list.forEach((c, i) => { if (!have.has(c.id)) addPiece(c, i, list.length); });
      wake();
    };

    /** 速すぎるものだけ抑える。★**下限は持たない** — 空気抵抗で静かに止まるのが
     *  第54巡の指定(投げた勢いは残しつつ、やがて止まる)。 */
    const clampDrift = () => {
      if (!M) return;
      for (const p of pieces) {
        if ((grab && grab.piece === p) || p.gone > 0 || p.body.isStatic) continue;
        const v = p.body.velocity;
        const sp = Math.hypot(v.x, v.y);
        if (sp > DRIFT_MAX) M.Body.setVelocity(p.body, { x: (v.x / sp) * DRIFT_MAX, y: (v.y / sp) * DRIFT_MAX });
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
      // ★全部が止まって、消える演出も無く、焼き待ちも無ければループを止める
      //   (減速して止まる作りになったので、止まったら本当に静かになる)。
      const moving = pieces.some((p) => p.gone > 0 || p.body.isStatic
        || Math.hypot(p.body.velocity.x, p.body.velocity.y) > 0.04
        || Math.abs(p.body.angularVelocity) > 0.002);
      if (running && live && (moving || pending || !!grab)) raf = requestAnimationFrame(step);
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
    const targetHit = (cx: number, cy: number): DropTarget => {
      return targetAt(mouthRef.current, trashRef.current, cx, cy);
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
      const t = targetHit(e.clientX, e.clientY);
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
      const t = targetHit(e.clientX, e.clientY);
      setHolding(false); setHover(null);
      if (t) {
        const cr = cv.getBoundingClientRect();
        const el = t === "mouth" ? mouthRef.current : trashRef.current;
        const rr = el?.getBoundingClientRect();
        if (rr) { p.gx = rr.left + rr.width / 2 - cr.left; p.gy = rr.top + rr.height / 2 - cr.top; }
        p.gone = 0.001;
        haptic(t === "trash" ? 14 : 20);
        fireTarget(el);
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

      {/* ゴミ箱と口。掴んでいるあいだ、右下から出てくる(共通部品)。 */}
      <DropTargets show={holding} hover={hover} mouthRef={mouthRef} trashRef={trashRef} />

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

/** id → 0〜1 のばらけた値(黄金比で桁を混ぜる)。 */
function frac(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (Math.imul(h, 2654435761) >>> 0) / 4294967296;
}

function makeBody(
  M: typeof import("matter-js"), paint: SolidPaint, x: number, y: number, unit: number,
): { body: Body; ox: number; oy: number } {
  const opts = { restitution: 0.9, friction: 0, frictionAir: DRIFT_AIR, frictionStatic: 0 };
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
