"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Body, Engine } from "matter-js";
import { LayerName } from "@/components/tasks/LayerName";
import { DemoSeedButton } from "@/components/tasks/TaskAddButton";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { aimTargets, DropTargets, fireTarget, targetAt, type DropTarget } from "@/components/tasks/DropTargets";
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
 *  最初のひと押しだけ与えて、あとは指の投げに任せる。
 *  ★★第56巡 … このとき**上限(1.0)を残したまま**にしていたのが、「投げても慣性が
 *  かからない」の正体だった。1.0 は**毎秒 60px** — 投げは生まれた次のフレームで
 *  `clampDrift` に潰されていた。上限は**壁抜け止め**としてだけ残す(壁は `walls()` で
 *  厚み 80px なので、1ステップ 26px なら抜けない)。 */
const DRIFT_MAX = 26;
/** 湧いた直後のごく弱いひと押し。 */
const DRIFT_SEED = 0.35;
/** 空気抵抗(大きいほど早く止まる)。★上限の呪縛が解けたので、ここが本当に
 *  「減速して止まる」を決める唯一の係数になった(第56巡)。 */
const DRIFT_AIR = 0.016;
/** 使える範囲の上端(アプリ名の札＋層の名前のぶん)。 */
const FIELD_TOP = 124;
/** この件数までは目一杯の大きさ。これを超えたら件数の平方根で縮める。 */
const FIT_N = 6;
/** タップとホールドの境目。 */
const HOLD_MS = 150;
const TAP_MOVE = 8;
/** 離した指の速さを物体へ渡す倍率(投げ)。★速さは実測から出すので等倍。 */
const FLING = 1.0;
/** ★掴んだ図形を指へ運ぶ強さ(velocity 駆動)と速さの上限。GRAVITY と同じ作り。 */
const GRAB_K = 0.34;
const GRAB_MAX = 34;
/** 投げの速さを「直近に本当に動いていた値」で見る窓(ms)。これより古ければ
 *  **置いた**扱いにして投げない。 */
const FLICK_WINDOW = 90;
/** 消える演出の速さ(0→1)。 */
const GONE_STEP = 0.09;
/** ★★上へ払って **GRAVITY へ移る**(第61巡にユーザー指定)。GRAVITY の下スワイプ
 *  (DRIFT へ)の相方で、**往復できる**。★第62巡から、ここは**タブを変えるだけ** ―
 *  カメラのパン(上空 → 地上)と効果線は `components/tasks/TaskSpace.tsx` が持つ。 */
/** 縦の払いと見なす距離(GravityTab の `SWIPE_PX` と同じ数)。 */
const SWIPE_PX = 44;
/** 軸を決める距離(GravityTab の `AXIS_PX` と同じ数)。 */
const AXIS_PX = 10;

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
  const goTabRef = useRef(goTab);
  goTabRef.current = goTab;
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
      moved: boolean; held: boolean; lastX: number; lastY: number; lastT: number;
      vx: number; vy: number; vT: number; holdT: number;
    } | null = null;

    /** ★★★使える範囲(**canvas の座標**)。**自分の寸法だけで決める** — 画面の座標を
     *  測ってはいけない(第61巡に作り直し)。
     *
     *  第58・60巡はここで `wrap.getBoundingClientRect()` を読み、画面の座標を canvas の
     *  座標へ変換していた。ところが `AppShell` の列は**一周ループのために
     *  `translateX(±300%)` がアプリを切り替えた瞬間に飛ぶ**し、`mountedApps` は
     *  アイドルで後から増えるので、**測った瞬間と実際に見えている瞬間がずれる**。
     *  第58巡は「原点が動いたぶん図形を運ぶ」、第60巡は「流すのを matter が来てから」と
     *  タイミングを合わせにいったが、どちらも対症療法で実機では直らなかった
     *  （第61巡のユーザー報告「まだ直っていない」＋写真）。
     *
     *  ★GRAVITY は同じ器に居ながらこの症状が一度も出ていない ― `sizeRef`(自分の
     *  `offsetWidth/Height`)しか見ておらず、**列がどこに居ようと座標が変わらない**から。
     *  そちらに揃える。器は `full-bleed` なので canvas は画面より左右 16px ずつ広く、
     *  上下はちょうど画面ぶん(上の余白と下のタブを負のマージンで打ち消している)。
     *  だから横は**幅の差から**内側へ寄せ、縦は `FIELD_TOP` とタブの高さで挟む。 */
    const fieldOf = () => {
      const { w, h } = size;
      const pad = Math.max(0, (w - (window.innerWidth || w)) / 2);
      return { left: pad, right: w - pad, top: FIELD_TOP, bottom: h - navHeightPx() };
    };
    /** ★その回の湧かせ方の種。**表に出るたびに引き直す**(第63巡にユーザー指定
     *  「開くたびに真ん中ら辺でランダムに」)。DRIFT は第62巡から出しっぱなしなので、
     *  再マウントでは起きない ― `GravityTab` の `dropAll` と同じ作法で、見えるように
     *  なった立ち上がりに置き直す。 */
    let seed = "0";
    /** 空きを掴んだときの縦の払い(軸ロック付き)。 */
    let swipe: { id: number; x: number; y: number; axis: "" | "x" | "y" } | null = null;

    const walls = () => {
      if (!M || !engine || size.w < 1 || size.h < 1) return;
      const { left, right, top, bottom } = fieldOf();
      const old = M.Composite.allBodies(engine.world).filter((b) => b.isStatic);
      M.Composite.remove(engine.world, old);
      const T = 80;
      const o = { isStatic: true, restitution: 0.5, friction: 0 };
      const cx = (left + right) / 2, cy = (top + bottom) / 2;
      const ww = right - left, hh = bottom - top;
      M.Composite.add(engine.world, [
        M.Bodies.rectangle(cx, top - T / 2, ww + T * 2, T, o),
        M.Bodies.rectangle(cx, bottom + T / 2, ww + T * 2, T, o),
        M.Bodies.rectangle(left - T / 2, cy, T, hh + T * 2, o),
        M.Bodies.rectangle(right + T / 2, cy, T, hh + T * 2, o),
      ]);
    };

    /** ★湧く場所 ―**中心を囲むひまわり配置**(黄金角)に、その回の種で回転と半径を
     *  散らす。真ん中へ寄せつつ均等にばらすので、四隅に貼り付いて気づかれない
     *  ことも、同じ点に重なって壁をすり抜けることも起きない(第54巡に実測)。 */
    const spotOf = (id: string, idx: number, total: number, hw: number, hh: number) => {
      const { left, right, top, bottom } = fieldOf();
      const midX = (left + right) / 2, midY = (top + bottom) / 2;
      const rx = Math.max(0, (right - left) / 2 - hw - 8);
      const ry = Math.max(0, (bottom - top) / 2 - hh - 8);
      // 半径も種で少し散らす(毎回まったく同じ環にならないように)。
      const t = Math.sqrt((idx + 0.5) / Math.max(1, total)) * (0.82 + frac(id + seed + "r") * 0.26);
      const ang = idx * 2.399963 + frac(id + seed) * Math.PI * 2;
      return {
        x: Math.max(left + hw + 6, Math.min(right - hw - 6, midX + Math.cos(ang) * rx * t * 0.9)),
        y: Math.max(top + hh + 6, Math.min(bottom - hh - 6, midY + Math.sin(ang) * ry * t * 0.9)),
      };
    };

    const addPiece = (c: InboxCandidate, idx = 0, total = 1) => {
      if (!M || !engine) return;
      const paint = paintOf(c);
      const b = shapeBounds(paint);
      const wu = Math.max(1e-3, b.maxX - b.minX);
      const { left, right } = fieldOf();
      // ★大きさは**場の幅**から決める(第61巡。`window.innerWidth` を混ぜない ―
      //   場と大きさの出どころは1つにしておく)。
      //   ★★件数が多いときは**その分だけ縮める**。大きいまま詰め込むと、無重力で
      //   押し合って壁をすり抜け、画面の外へ出てしまう(第54巡に実測)。少数のときは
      //   目一杯大きいままなので、「小さすぎる」という指摘には応えられている。
      const crowd = Math.min(1, Math.sqrt(FIT_N / Math.max(1, total)));
      const unit = (Math.min(W_MAX, (right - left) * W_RATIO) * crowd) / wu;
      const hw = ((b.maxX - b.minX) * unit) / 2;
      const hh = ((b.maxY - b.minY) * unit) / 2;
      const { x, y } = spotOf(c.id, idx, total, hw, hh);
      const { body, ox, oy } = makeBody(M, paint, x, y, unit);
      const a = frac(c.id + seed + "v") * Math.PI * 2;
      const sp = DRIFT_SEED * (0.4 + frac(c.id + seed + "s") * 0.6);
      M.Body.setVelocity(body, { x: Math.cos(a) * sp, y: Math.sin(a) * sp });
      M.Body.setAngularVelocity(body, (frac(c.id + seed + "w") - 0.5) * 0.02);
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

    /** ★**壁抜け止めだけ**。下限は持たない(空気抵抗で静かに止まる)。
     *  ★★上限を投げの速さより低く置かないこと — 第55巡までの 1.0 は「毎秒 60px」で、
     *  投げを毎フレーム潰していた(第56巡にユーザー指摘)。 */
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
      const moving = pieces.some((p) => p.gone > 0
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
    /** 運んでいる間 ― 当たり判定に加えて**近さ**も的へ書く。 */
    const targetAim = (cx: number, cy: number): DropTarget => {
      return aimTargets(mouthRef.current, trashRef.current, cx, cy);
    };
    const enterHold = () => {
      if (!grab || !M) return;
      grab.held = true;
      swipe = null;                        // ★長押しが成立したら払いではない
      haptic(10);
      setHolding(true);
      // ★★`setStatic` にしないこと(第56巡)。静止物にすると当たり判定が消えて他の
      //   図形をすり抜けるうえ、離した瞬間の速度が**物理には無い**ので投げが死ぬ。
      //   動く物体のまま、毎フレーム指へ向かう速度を与える(GRAVITY と同じ)。
    };
    /** ★★上へ払って **GRAVITY へ移る**。★第62巡から、ここは**タブを変えるだけ**。
     *  カメラのパンと効果線は `components/tasks/TaskSpace.tsx` が持つ。 */
    const enterGravity = () => {
      haptic(12);
      goTabRef.current("tasks-gravity");
    };

    const onDown = (e: PointerEvent) => {
      if (document.documentElement.hasAttribute("data-overlay") || grab) return;
      const { x, y } = pointAt(e);
      const piece = hitPiece(x, y);
      // ★★**縦の払いはどこから始めてもよい**(第61巡)。図形の上でも、掴む前に
      //   動き出したら払いに変わる ― DRIFT は図形で埋まっているので、空きからしか
      //   払えないと上スワイプ(GRAVITY へ)が実質使えない。GRAVITY と同じ作法:
      //   **長押ししてから動かす**と運ぶ、**すぐ動かす**と空間の払い。
      swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: "" };
      if (!piece) return;                  // 空きは掴まない → 払いに任せる
      e.stopPropagation();                 // 図形の上ではカメラを動かさない
      grab = {
        id: e.pointerId, piece, ox: piece.body.position.x - x, oy: piece.body.position.y - y,
        downX: e.clientX, downY: e.clientY, moved: false, held: false,
        lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp,
        vx: 0, vy: 0, vT: 0, holdT: window.setTimeout(enterHold, HOLD_MS),
      };
    };
    const onMove = (e: PointerEvent) => {
      // ★まだ掴んでいない図形は、動き出した時点で手放して**払い**に譲る。
      if (grab && !grab.held && e.pointerId === grab.id
          && Math.hypot(e.clientX - grab.downX, e.clientY - grab.downY) > TAP_MOVE) {
        window.clearTimeout(grab.holdT); grab = null;
      }
      if (swipe && e.pointerId === swipe.id && !grab?.held) {
        const dx = e.clientX - swipe.x; const dy = e.clientY - swipe.y;
        if (!swipe.axis) {
          if (Math.abs(dx) < AXIS_PX && Math.abs(dy) < AXIS_PX) return;
          swipe.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        }
        if (swipe.axis === "y" && -dy > SWIPE_PX) { swipe = null; grab = null; enterGravity(); }
        return;
      }
      if (!grab || e.pointerId !== grab.id || !M) return;
      if (!grab.moved) grab.moved = true;
      if (!grab.held) return;
      if (dragged) dragged.current = true;
      const { x, y } = pointAt(e);
      // ★指へ向かう速度で運ぶ(動く物体のまま)。他の図形を押しのける。
      const b = grab.piece.body;
      const tx = x + grab.ox; const ty = y + grab.oy;
      let vx = (tx - b.position.x) * GRAB_K; let vy = (ty - b.position.y) * GRAB_K;
      const sp = Math.hypot(vx, vy);
      if (sp > GRAB_MAX) { vx = (vx / sp) * GRAB_MAX; vy = (vy / sp) * GRAB_MAX; }
      M.Body.setVelocity(b, { x: vx, y: vy });
      // ★★投げの速さは**時間で割って1ステップぶんへ揃える**(第56巡)。1イベントの
      //   差をそのまま使うと、120Hz の端末では 60fps の物理に対して半分になり、
      //   離す直前に指が止まると 0 になって投げが消える。直近の**動いていた**値を持つ。
      const dt = Math.max(8, e.timeStamp - grab.lastT);
      const nx = ((e.clientX - grab.lastX) / dt) * (1000 / 60);
      const ny = ((e.clientY - grab.lastY) / dt) * (1000 / 60);
      if (Math.hypot(nx, ny) > 0.4) { grab.vx = nx; grab.vy = ny; grab.vT = e.timeStamp; }
      grab.lastX = e.clientX; grab.lastY = e.clientY; grab.lastT = e.timeStamp;
      const t = targetAim(e.clientX, e.clientY);
      setHover((cur) => (cur === t ? cur : t));
    };
    const onUp = (e: PointerEvent) => {
      if (swipe && e.pointerId === swipe.id) swipe = null;
      if (!grab || e.pointerId !== grab.id) return;
      window.clearTimeout(grab.holdT);
      const g = grab; grab = null;
      const p = g.piece;
      if (!M) { setHolding(false); setHover(null); return; }
      if (!g.held) {
        if (!g.moved && !dragged?.current) { haptic(8); actRef.current.open(p.id); }
        return;
      }
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
        // 直近に本当に動いていたときだけ投げる(止めてから離したら「置いた」)。
        if (e.timeStamp - g.vT < FLICK_WINDOW) {
          M.Body.setVelocity(p.body, { x: g.vx * FLING, y: g.vy * FLING });
        }
        wake();
      }
    };

    const ro = new ResizeObserver(() => {
      const w = wrap.offsetWidth, h = wrap.offsetHeight;
      if (Math.abs(w - size.w) < 0.5 && Math.abs(h - size.h) < 0.5) return;
      size = { w, h };
      // ★最初に**有効な寸法**を拾ったところが、場を作れる最初の機会。壁だけでなく
      //   溜めていた候補も流すこと(寸法が 0 のうちは `flush` が何もできない)。
      if (M && engine) { walls(); flush(); wake(); }
    });
    ro.observe(wrap);

    let pending: InboxCandidate[] | null = null;
    let pendingLive = false;
    // ★★溜めた列を流すのは**matter が来ていて、かつ見えているとき**だけ(第60巡)。
    //   第58巡は `setActive` の中で無条件に `pending` を空にしてから `sync` を
    //   呼んでいた。DRIFT は**最初に開く既定のタブ**なので `setActive(true)` は
    //   `import("matter-js")` が返るより先に走る ― `sync` は `!M` で素通りし、
    //   列だけが捨てられて**画面に何も出ない**状態が固定していた(ユーザー報告)。
    /** ★★表に出るたびに**置き直す**(第63巡)。物体は作り直さず、位置・角度・初速だけ
     *  入れ直す ― 作り直すと焼いた絵のキャッシュも捨てることになる。 */
    const reseed = () => {
      if (!M || !engine || size.w < 1 || size.h < 1 || !pieces.length) return;
      seed = String(Date.now() % 100000);
      const total = pieces.length;
      pieces.forEach((p, idx) => {
        if (p.gone > 0) return;
        const b = shapeBounds(p.paint);
        const hw = ((b.maxX - b.minX) * p.unit) / 2;
        const hh = ((b.maxY - b.minY) * p.unit) / 2;
        const { x, y } = spotOf(p.id, idx, total, hw, hh);
        M!.Body.setPosition(p.body, { x, y });
        M!.Body.setAngle(p.body, frac(p.id + seed + "a") * Math.PI * 2);
        const a = frac(p.id + seed + "v") * Math.PI * 2;
        const sp = DRIFT_SEED * (0.4 + frac(p.id + seed + "s") * 0.6);
        M!.Body.setVelocity(p.body, { x: Math.cos(a) * sp, y: Math.sin(a) * sp });
        M!.Body.setAngularVelocity(p.body, (frac(p.id + seed + "w") - 0.5) * 0.02);
      });
    };

    const flush = () => {
      if (!M || !engine || !live || !pending) return;
      if (size.w < 1 || size.h < 1) return;   // ★寸法が来るまでは置き場所が決まらない
      const q = pending; pending = null; sync(q);
    };
    ctrlRef.current = {
      // ★見えていない間は**湧かせない**(まだ寸法が来ていないことがある)。
      //   溜めておいて、場が作れるようになってから流す。
      sync: (list) => { if (!M || !live) { pending = list; return; } sync(list); },
      setActive: (on) => {
        const rising = on && !pendingLive;
        pendingLive = on;
        live = on;
        if (on) {
          size = { w: wrap.offsetWidth, h: wrap.offsetHeight };
          if (M && engine) {
            walls(); flush();
            // ★表に出た**立ち上がり**でだけ置き直す(毎回ちがう散らばり)。
            if (rising) reseed();
            wake();
          }
        } else { running = false; cancelAnimationFrame(raf); }
      },
    };

    (async () => {
      M = await import("matter-js");
      if (disposed) return;
      size = { w: wrap.offsetWidth, h: wrap.offsetHeight };
      engine = M.Engine.create({ enableSleeping: false });
      engine.gravity.x = 0; engine.gravity.y = 0;
      live = pendingLive;
      walls();
      flush();
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
      {/* ★★★`full-bleed` を**ここで掛けないこと**(第63巡)。器の bleed は
          `TaskSpace` の `<main>` が持っている ―**出どころは1つ**。二重に掛けると
          `position:absolute; inset:0` に負のマージンが乗って**箱が外へ広がり**、
          canvas が「幅＋64px / 高さ＋pad-top＋nav-h」になる。その寸法で `fieldOf()`
          を出すので、場の下端が**ちょうどタブバーのぶん低く**なり、候補がタブの裏へ
          潜る(実機の写真で2度報告)。★GravityTab の器には付いていない ―
          **同じ器に居るのに片方だけ壊れるときは、片方だけ違うことをしていないか**。 */}
      <div ref={wrapRef} style={{ position: "absolute", inset: 0 }}>
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
  const opts = { restitution: 0.5, friction: 0, frictionAir: DRIFT_AIR, frictionStatic: 0 };
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
