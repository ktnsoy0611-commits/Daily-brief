"use client";

import { useEffect, useRef, useState } from "react";
import type { Body, Engine } from "matter-js";
import {
  DROP_ABOVE, DROP_SCATTER, DROP_EVERY_MS, FLOOR_FRICTION, GRAVITY_Y, WALL_FRICTION, WALL_MIN_H, WALL_T,
  clearOverlap, frac, hitPiece, launch, pillBody, pillSig, sink, type Piece,
} from "@/components/home/pileWorld";
import {
  beginPileFrame, bakeDeferred, drawPile, drawPileShadows, PILE_SHADOW, pileLookBusy, setPileLook, stepPileLook, warmPile,
} from "@/components/home/pilePaint";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { useAppActive } from "@/lib/appActive";
import { BD_GREY, INK, SHAPE_FACE, TASK_FACE, onNavHeight } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { bodyInkOn } from "@/lib/palette";
import { PILE_INSET, floorYOf, pileWOf } from "@/lib/pileBox";
import { ensureGlyphs, fontsSettled, onFontsReady } from "@/lib/textFit";
import { D_SETTLE, K_SETTLE, settled, spring, springTo } from "@/lib/spring";
import { taskCellsOf, TASK_COLS_MAX } from "@/lib/taskSize";
import { SPACE } from "@/lib/tokens";
import { badgePlate, labelCells, labelPlate } from "@/lib/wordPlate";
import type { AppState, TabProps, Task } from "@/lib/types";

// ★★★**TASK の最初の画面 ＝ 日付の列**（2026-09-30・第135巡にユーザー指定「**Task は gravity を削除して、
//   画像の画面を初期画面に。色や諸々のルールやデザインをホームなどを踏襲して合わせて。自由の文字もピルにして、
//   図形として落として。傾いたりしないようにホームの落下の動きや摩擦や重さと違っているらしいので、それをやめて、
//   完全にホームと同じ仕組みを使って**」）。
// ★★★**物理も絵もホームの山と同じ部品を読む**（`components/home/pileWorld.ts`・`pilePaint.ts`）… 重力・摩擦・
//   跳ね・密度（`BODY`・`pillBody`）・落とし方（`launch`・`DROP_EVERY_MS`・`clearOverlap`）・眠り・固定の刻み・
//   焼いた絵（`drawPile`）・影（`drawPileShadows`）・押した手ざわり（`setPileLook`）・当たり判定（`hitPiece`）。
//   ★★GRAVITY（`GravityTab`）の物理（摩擦 0.55/0.9・板だけ回りにくい）は**使わない**。
// ★★見た目の約束（ユーザー確定）… 列の見出しは**ホームの日付の板**（墨の円に日にち＋曜日と月）・**区切りの線は引かない**・
//   日付の無いタスクは出さない（ホームの帯の下の段に居る）・タスクが無い日は「自由」の語のピルが落ちる。
// ★★1画面に3日（`LANES`）・先は 14 日（`HORIZON`）。横に払うと1日ずつ止まる。
// ★★世界は**1度作ったら残す**（ホームと同じ。開くたびに落とし直さない）。中身が変わったら変わった図形だけ。

const LANES = 3;
const HORIZON = 14;
/** ★列と列のあいだの壁の半分の厚み（＝列の内側の余白）。★目盛りの外（物理の場）。 */
const LANE_PAD = SPACE.xs;
/** ★いちばん長いタスク（4マス）でも壁に挟まらない遊び（体は絵より 1〜1.5px 外にある）。★目盛りの外（物理の場）。 */
const FIT_SLACK = 4;
/** ★列の見出し（日付の板）の大きさ（マス）。★列の内寸いっぱい ＝ `TASK_COLS_MAX` マス。 */
const HEAD_ROWS = 2;
/** ★列が図形で埋まってよい割合（面積）。★目盛りの外（ホームの `FILL` と同じ考え方）。 */
const LANE_FILL = 0.5;
/** ★タップと払いの境目（px）。ホームの `TAP_MOVE` と同じ。 */
const TAP_MOVE = 8;
/** ★払いの勢いを何 ms 先まで見込むか。★目盛りの外（手ざわり）。 */
const FLING_MS = 160;
/** ★物理の刻み。ホームと同じ（120Hz の実機で2倍速にしない）。 */
const STEP_MS = 1000 / 60;
const MAX_STEPS = 2;
const DPR_MAX = 2;
/** ★床よりこれだけ下まで落ちたら、その列の上から落とし直す。 */
const LOST_BELOW = 600;
/** ★下焼きの1フレームの持ち時間と締切（ホームの `WARM_MS`／`WARM_LIMIT_MS` と同じ）。 */
const WARM_MS = 10;
const WARM_LIMIT_MS = 1500;

/** ★★タスクが無い日に落とす語（第56巡から同じ語彙）。 */
const FREE_WORDS = ["FREE", "自由", "LIBRE", "FREI", "LIBERO", "LIVRE", "VRIJ", "FRI", "VAPAA", "VOLNY"] as const;
const freeWordOf = (key: string) => FREE_WORDS[Math.floor(frac(`${key}free`) * FREE_WORDS.length) % FREE_WORDS.length];

const keyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function daysFrom(today: Date): { key: string; date: Date }[] {
  return Array.from({ length: HORIZON }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    return { key: keyOf(d), date: d };
  });
}

interface Lane { key: string; date: Date }
interface Slot { piece: Piece; lane: number }
interface Ctrl { sync: (tasks: Task[]) => void; show: () => void }

export function TimelineTab({ appState, persist, showToast, active }: TabProps & { active: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const shRef = useRef<HTMLCanvasElement>(null);
  const ctrlRef = useRef<Ctrl | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const openRef = useRef<(id: string) => void>(() => {});
  useEffect(() => { openRef.current = (id) => { haptic(8); setOpenId(id); }; });
  const appActive = useAppActive("tasks");
  const shown = appActive && active;
  // ★★★**世界と下焼きは載った時点で済ませ、落とすのは初めて見えたとき**（第135巡）。TASK はホームが落ち着いた
  //   あとの空き時間に先読みされるので、和文の書体を初めて使う一度きりの費用（1回の命令の中で 100〜250ms。
  //   分けられない）をそこで払っておく。開いたときには落とすだけ。
  const shownRef = useRef(shown);
  useEffect(() => { shownRef.current = shown; if (shown) ctrlRef.current?.show(); }, [shown]);

  const tasks = appState.tasks;
  const tasksRef = useRef(tasks);
  useEffect(() => { tasksRef.current = tasks; ctrlRef.current?.sync(tasks); }, [tasks]);

  // ── 世界（engine・壁・ループ・指）。1度だけ ─────────────────────
  useEffect(() => {
    const box = boxRef.current; const cv = cvRef.current; const sh = shRef.current;
    if (!box || !cv || !sh) return;
    let stop = false;
    let M: typeof import("matter-js") | null = null;
    let engine: Engine | null = null;
    let walls: Body[] = [];
    let size = { w: box.clientWidth, h: box.clientHeight };
    let lanes: Lane[] = daysFrom(new Date());
    let unit = 0;
    let slots = new Map<string, Slot>();
    let heads: Piece[] = [];
    /** ★世界へ入れる順番待ち（`releaseAt` の時刻になったら入れる）。 */
    let queue: { id: string; at: number }[] = [];
    const cam = spring(0);
    let camTo = 0;
    let dirty = true;
    let raf = 0;
    let acc = 0; let last = performance.now();
    let latest: Task[] = [];
    let warming: { ids: string[]; until: number } | null = null;
    /** ★落とす順（焼き終えた組の並び）。 */
    let order: string[] = [];
    let grab: { id: number; x0: number; y0: number; cam0: number; pan: boolean; hit: Piece | null; samples: { t: number; x: number }[] } | null = null;

    // ★★列は**左右の余白（`PILE_INSET`）の内側**に3本（ホームの山の器と同じ線）。4本目は右の余白に少し覗く。
    const laneW = () => pileWOf(size.w) / LANES;
    const x0 = PILE_INSET;
    const laneFloor = () => floorYOf(size.h) - unit * HEAD_ROWS - SPACE.md;
    const camMax = () => (HORIZON - LANES) * laneW();

    const wake = () => {
      if (raf || stop) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    /** ★1マスの一辺。列の内寸に「いちばん長いタスク（4マス）」が入り、どの列も床から溢れない大きさ。 */
    const unitFor = (list: Task[]) => {
      const inner = laneW() - LANE_PAD * 2;
      let u = (inner - FIT_SLACK) / TASK_COLS_MAX;
      const byLane = new Map<string, number>();
      for (const t of list) {
        const c = taskCellsOf(t.title ?? "");
        byLane.set(t.dueDate as string, (byLane.get(t.dueDate as string) ?? 0) + c.cols * c.rows);
      }
      const most = Math.max(0, ...byLane.values());
      const room = floorYOf(size.h) - SPACE.xxl * 3;
      // ★★混んだ日はマスごと縮む（ホームの面積の予算と同じ作法。比はどの日も同じ）。
      if (most > 0) u = Math.min(u, Math.sqrt((inner * room * LANE_FILL) / (most + HEAD_ROWS * TASK_COLS_MAX)));
      return Math.max(12, u);
    };

    const buildWalls = () => {
      if (!M || !engine) return;
      if (walls.length) M.Composite.remove(engine.world, walls);
      const lw = laneW(); const fy = laneFloor();
      const span = lw * HORIZON;
      const tall = Math.max(size.h, WALL_MIN_H) * 3;
      walls = [M.Bodies.rectangle(x0 + span / 2, fy + WALL_T / 2, span + WALL_T * 2, WALL_T, { isStatic: true, ...FLOOR_FRICTION })];
      // ★列のあいだの壁（厚み `LANE_PAD × 2`）。両端は外へ厚く。
      for (let k = 0; k <= HORIZON; k++) {
        const outer = k === 0 || k === HORIZON;
        const t = outer ? WALL_T : LANE_PAD * 2;
        const x = x0 + (k === 0 ? LANE_PAD - WALL_T / 2 : k === HORIZON ? span - LANE_PAD + WALL_T / 2 : k * lw);
        walls.push(M.Bodies.rectangle(x, fy - tall / 2 + WALL_T, t, tall, { isStatic: true, ...WALL_FRICTION }));
      }
      M.Composite.add(engine.world, walls);
      dirty = true;
    };

    /** ★列の見出し（ホームの日付の板。物理には入れない ―― 床の下の静かな札）。 */
    const buildHeads = () => {
      const lw = laneW();
      const W = unit * TASK_COLS_MAX; const H = unit * HEAD_ROWS;
      const y = floorYOf(size.h) - H / 2;
      heads = lanes.map((ln, i) => ({
        id: `head:${ln.key}`, kind: "word", w: W, h: H, face: INK, ink: BD_GREY,
        plate: badgePlate(ln.date, W, H, BD_GREY, INK),
        body: { position: { x: x0 + lw * i + lw / 2, y }, angle: 0, vertices: [] } as unknown as Body,
      }));
    };

    /** ★列の上から落とす（ホームの `respawn` と同じ高さの散らし方・`launch` の傾きと初速）。 */
    const dropInto = (b: Body, lane: number, seed: string, bw: number, bh: number) => {
      if (!M) return;
      const lw = laneW();
      const room = Math.max(0, lw - LANE_PAD * 2 - bw);
      const x = x0 + lw * lane + lw / 2 + (frac(seed) - 0.5) * room * 0.8;
      const up = bh / 2 + DROP_ABOVE + frac(`${seed}y`) * DROP_SCATTER;
      launch(M, b, x, -up, seed);
    };

    /** ★★中身を合わせる。**同じ id・同じ寸法の体は使い回す**（ホームの `same` と同じ ―― 山が落ち直さない）。 */
    const sync = (list: Task[], rebuild = false) => {
      latest = list;
      if (!M || !engine) return;
      const today = keyOf(new Date());
      if (lanes[0]?.key !== today) { lanes = daysFrom(new Date()); rebuild = true; }
      const keys = new Map(lanes.map((l, i) => [l.key, i]));
      const dated = list.filter((t) => !t.done && t.dueDate && keys.has(t.dueDate));
      const nu = unitFor(dated);
      // ★★大きさは**縮めないと入らないときだけ**決め直す（ホームの `hold` と同じ ―― 1枚増えるたびに全員を作り直すと
      //   山が丸ごと落ち直す）。決め直したら全員を落とし直す。
      if (rebuild || !unit || nu < unit - 0.5) {
        unit = nu;
        for (const s of slots.values()) M.Composite.remove(engine.world, s.piece.body);
        slots = new Map(); queue = [];
        buildWalls(); buildHeads();
      }
      // ★★★**書体は落とす前に頼む**（ホームの `ensureGlyphs` と同じ ―― 和文は字ごとに別の断片なので、描く最中に
      //   頼むと、届くまで代わりの書体の準備が大きさごとに走る）。「自由」の語も同じ書体の断片に在る。
      ensureGlyphs(SHAPE_FACE, dated.map((t) => t.title ?? "").join("") + FREE_WORDS.join(""));
      const want = new Map<string, { lane: number; make: () => Piece; sig: string; title: string }>();
      const busy = new Set<number>();
      for (const t of dated) {
        const lane = keys.get(t.dueDate as string) as number;
        busy.add(lane);
        const cl = taskCellsOf(t.title ?? "");
        const pw = cl.cols * unit; const ph = cl.rows * unit;
        const sig = pillSig(pw, ph, cl.lines);
        want.set(t.id, {
          lane, sig, title: t.title,
          make: () => ({
            id: t.id, body: pillBody(M as typeof import("matter-js"), pw, ph, unit), kind: "task", w: pw, h: ph, lines: cl.lines,
            face: TASK_FACE, ink: bodyInkOn(TASK_FACE), title: t.title, face_: SHAPE_FACE, outlined: false, fresh: true,
          }),
        });
      }
      lanes.forEach((ln, lane) => {
        if (busy.has(lane)) return;
        const word = freeWordOf(ln.key);
        const cells = labelCells(word, unit, [2, 3, 4]);
        const pw = cells * unit; const ph = unit;
        want.set(`free:${ln.key}`, {
          lane, sig: pillSig(pw, ph) + `|${word}`, title: word,
          make: () => ({
            id: `free:${ln.key}`, body: pillBody(M as typeof import("matter-js"), pw, ph, unit), kind: "word", w: pw, h: ph,
            face: BD_GREY, ink: INK, title: word, fresh: true,
            plate: labelPlate(word, pw, ph, BD_GREY, INK),
          }),
        });
      });
      // ★居なくなったものを外す。
      for (const [id, s] of slots) {
        const w = want.get(id);
        // ★題が変わっただけ（寸法は同じ）なら、体はそのまま・字だけ替える。
        if (w && (s.piece.body.plugin as { sig?: string }).sig === w.sig) s.piece.title = w.title;
        if (w && (s.piece.body.plugin as { sig?: string }).sig === w.sig && s.lane === w.lane) continue;
        if (w && (s.piece.body.plugin as { sig?: string }).sig === w.sig) {
          // ★★日付が変わった ＝ 行き先の列の上から落とし直す（体は同じ）。
          s.lane = w.lane;
          const bb = s.piece.body.bounds;
          dropInto(s.piece.body, w.lane, id, bb.max.x - bb.min.x, bb.max.y - bb.min.y);
          continue;
        }
        M.Composite.remove(engine.world, s.piece.body);
        slots.delete(id);
        queue = queue.filter((q) => q.id !== id);
      }
      // ★新しいものを並べて落とす（順番はばらばら。ホームと同じ `DROP_EVERY_MS` の間隔）。
      const fresh: string[] = [];
      for (const [id, w] of want) {
        if (slots.has(id)) continue;
        const piece = w.make();
        piece.body.plugin = { ...(piece.body.plugin ?? {}), sig: w.sig };
        dropInto(piece.body, w.lane, id, piece.w ?? 0, piece.h ?? 0);
        slots.set(id, { piece, lane: w.lane });
        fresh.push(id);
      }
      for (let i = fresh.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
      }
      // ★★★**焼き切ってから落とす**（ホームの `warmPile` と同じ。第134巡）。時刻はループが焼き終えたときに振る。
      fresh.forEach((id) => queue.push({ id, at: Infinity }));
      if (fresh.length) warming = { ids: fresh, until: performance.now() + WARM_LIMIT_MS };
      dirty = true;
      wake();
    };

    const visible = (): Piece[] => {
      const lw = laneW();
      const lo = cam.p - lw; const hi = cam.p + size.w + lw;
      const out: Piece[] = [];
      for (const s of slots.values()) {
        const x = s.piece.body.position.x;
        if (x >= lo && x <= hi) out.push(s.piece);
      }
      return out;
    };

    const draw = () => {
      const { w, h } = size;
      const dpr = Math.min(DPR_MAX, window.devicePixelRatio || 1);
      const cw = Math.round(w * dpr); const ch = Math.round(h * dpr);
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const live = visible().filter((p) => !queue.some((q) => q.id === p.id));
      const lw = laneW();
      const hs = heads.filter((p) => p.body.position.x > cam.p - lw && p.body.position.x < cam.p + w + lw);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(-cam.p, 0);
      beginPileFrame();
      drawPile(ctx, hs, dpr, () => { dirty = true; wake(); });
      drawPile(ctx, live, dpr, () => { dirty = true; wake(); });
      // ★接地の影は床だけ（列のあいだの壁は見えないので、壁の影は遠くへ置いて出さない）。
      drawPileShadows(sh, live, w, h, null, { floor: laneFloor(), left: -1e9, right: 1e9 }, cam.p); // ★目盛りの外（見えない壁の位置）
      if (bakeDeferred()) dirty = true;
    };

    const loop = () => {
      raf = 0;
      if (stop || !M || !engine) return;
      const now = performance.now();
      if (warming) {
        const dpr = Math.min(DPR_MAX, window.devicePixelRatio || 1);
        const ps = [...heads, ...warming.ids.map((id) => slots.get(id)?.piece).filter((p): p is Piece => !!p)];
        if ((warmPile(ps, dpr, WARM_MS) && fontsSettled()) || now > warming.until) {
          order = warming.ids;
          warming = null;
          dirty = true;
        }
      }
      // ★焼き終えて、見えていたら落とす（見えていなければ、見えたときの `show` で）。
      if (!warming && shownRef.current && queue.some((q) => q.at === Infinity)) {
        queue = queue.map((q) => (q.at === Infinity ? { id: q.id, at: now + Math.max(0, order.indexOf(q.id)) * DROP_EVERY_MS } : q));
        dirty = true;
      }
      // ★順番の来たものを世界へ（ホームと同じ ―― 入れる直前に新しい体どうしの重なりを解き、全員を起こす）。
      if (queue.length) {
        const due = queue.filter((q) => q.at <= now);
        if (due.length) {
          queue = queue.filter((q) => q.at > now);
          for (const q of due) {
            const s = slots.get(q.id);
            if (!s) continue;
            clearOverlap(M, s.piece.body, M.Composite.allBodies(engine.world));
            M.Composite.add(engine.world, s.piece.body);
          }
          for (const s of slots.values()) M.Sleeping.set(s.piece.body, false);
        }
      }
      acc = Math.min(acc + (now - last), STEP_MS * MAX_STEPS);
      last = now;
      let stepped = false;
      while (acc >= STEP_MS) {
        M.Engine.update(engine, STEP_MS);
        stepPileLook();
        if (!grab || !grab.pan) springTo(cam, camTo, K_SETTLE, D_SETTLE);
        acc -= STEP_MS;
        stepped = true;
      }
      // ★番人（ホームと同じ）… 床より下へ沈んだら床の上へ戻す・遠くへ落ちたら列の上から落とし直す。
      const fy = laneFloor();
      for (const s of slots.values()) {
        const b = s.piece.body;
        if (b.position.y > fy + LOST_BELOW || !Number.isFinite(b.position.x)) {
          dropInto(b, s.lane, `${s.piece.id}${now}`, s.piece.w ?? 0, s.piece.h ?? 0);
        } else sink(M, b, fy);
      }
      const moving = [...slots.values()].some((s) => !s.piece.body.isSleeping && !queue.some((q) => q.id === s.piece.id));
      const camBusy = !settled(cam, camTo, 0.05);
      if (stepped && shownRef.current && (moving || camBusy || dirty || pileLookBusy())) { dirty = false; draw(); }
      if (!camBusy && !grab?.pan) cam.p = camTo;
      const waiting = queue.length > 0 && (warming !== null || shownRef.current);
      // ★見えていない間は「描き直し待ち」で回し続けない（見えたときの `show` が起こす）。
      if (moving || camBusy || waiting || (dirty && shownRef.current) || pileLookBusy() || grab) raf = requestAnimationFrame(loop);
    };

    // ── 指 ───────────────────────────────────────────────
    const pick = (cx: number, cy: number): Piece | null => {
      const r = box.getBoundingClientRect();
      const px = cx - r.left + cam.p; const py = cy - r.top;
      const list = [...slots.values()].map((s) => s.piece);
      for (let i = list.length - 1; i >= 0; i--) if (hitPiece(list[i], px, py, 0)) return list[i];
      for (let i = list.length - 1; i >= 0; i--) if (hitPiece(list[i], px, py, SPACE.sm)) return list[i];
      return null;
    };
    const onDown = (e: PointerEvent) => {
      if (grab) return;
      const hit = pick(e.clientX, e.clientY);
      grab = { id: e.pointerId, x0: e.clientX, y0: e.clientY, cam0: cam.p, pan: false, hit, samples: [{ t: e.timeStamp, x: e.clientX }] };
      box.setPointerCapture?.(e.pointerId);
      // ★★押した手ざわりはホームと同じ（即座に潰れて沈む）。「自由」は押せるが開かない。
      if (hit) { setPileLook(hit.id, "press"); dirty = true; }
      wake();
    };
    const onMove = (e: PointerEvent) => {
      const g = grab;
      if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x0; const dy = e.clientY - g.y0;
      if (!g.pan && Math.abs(dx) > TAP_MOVE && Math.abs(dx) > Math.abs(dy)) {
        g.pan = true;
        if (g.hit) { setPileLook(g.hit.id, "rest"); g.hit = null; }
      }
      if (!g.pan && g.hit && Math.hypot(dx, dy) > TAP_MOVE) { setPileLook(g.hit.id, "rest"); g.hit = null; dirty = true; }
      if (!g.pan) return;
      // ★端では抵抗（指の半分しか動かない）。
      let p = g.cam0 - dx;
      if (p < 0) p *= 0.5; else if (p > camMax()) p = camMax() + (p - camMax()) * 0.5;
      cam.p = p; cam.v = 0;
      g.samples.push({ t: e.timeStamp, x: e.clientX });
      while (g.samples.length > 2 && e.timeStamp - g.samples[0].t > 90) g.samples.shift();
      dirty = true;
      wake();
    };
    const onUp = (e: PointerEvent) => {
      const g = grab;
      if (!g || g.id !== e.pointerId) return;
      grab = null;
      if (g.pan) {
        const s0 = g.samples[0]; const s1 = g.samples[g.samples.length - 1];
        const v = (s1.x - s0.x) / Math.max(1, s1.t - s0.t);
        const lw = laneW();
        const from = Math.round(g.cam0 / lw);
        let to = Math.round((cam.p - v * FLING_MS) / lw);
        to = Math.max(from - LANES, Math.min(from + LANES, to));
        camTo = Math.max(0, Math.min(HORIZON - LANES, to)) * lw;
        if (Math.round(camTo / lw) !== from) haptic(6);
      } else if (g.hit) {
        setPileLook(g.hit.id, "rest");
        if (g.hit.kind === "task") openRef.current(g.hit.id);
      }
      dirty = true;
      wake();
    };
    const onCancel = (e: PointerEvent) => {
      if (grab?.hit) setPileLook(grab.hit.id, "rest");
      if (grab && grab.id === e.pointerId) { grab = null; camTo = Math.round(cam.p / laneW()) * laneW(); camTo = Math.max(0, Math.min(camMax(), camTo)); }
      dirty = true; wake();
    };
    box.addEventListener("pointerdown", onDown);
    box.addEventListener("pointermove", onMove);
    box.addEventListener("pointerup", onUp);
    box.addEventListener("pointercancel", onCancel);

    // ── 器の寸法とタブバーの高さ ─────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = box.clientWidth; const h = box.clientHeight;
      if (w <= 0 || h <= 0) return;
      const wide = Math.abs(w - size.w) > 0.5;
      const tall = Math.abs(h - size.h) > 0.5;
      size = { w, h };
      if (wide) { camTo = Math.round(camTo / (laneW() || 1)) * laneW(); cam.p = camTo; sync(latest, true); return; }
      if (tall) { buildWalls(); buildHeads(); for (const s of slots.values()) M?.Sleeping.set(s.piece.body, false); wake(); }
    });
    ro.observe(box);
    // ★書体が遅れて届いたら描き直す（焼いた絵はホームの山が捨てる ―― 同じ入れ物）。
    const offFont = onFontsReady(() => { dirty = true; wake(); });
    const offNav = onNavHeight(() => { buildWalls(); buildHeads(); for (const s of slots.values()) M?.Sleeping.set(s.piece.body, false); wake(); });

    (async () => {
      const mod = await import("matter-js");
      if (stop) return;
      M = (mod.default ?? mod) as typeof import("matter-js");
      // ★★ホームと同じ世界（眠りを最初から許す・`positionIterations` は既定の 6・重力 `GRAVITY_Y`）。
      engine = M.Engine.create({ enableSleeping: true });
      engine.gravity.y = GRAVITY_Y;
      ctrlRef.current = { sync: (l) => sync(l), show: () => { dirty = true; wake(); } };
      sync(tasksRef.current, true);
    })();

    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      ro.disconnect(); offNav(); offFont?.();
      box.removeEventListener("pointerdown", onDown);
      box.removeEventListener("pointermove", onMove);
      box.removeEventListener("pointerup", onUp);
      box.removeEventListener("pointercancel", onCancel);
      ctrlRef.current = null;
    };
  }, []);
  // ── タスクを開いたあと（GRAVITY と同じ書き方） ─────────────────
  const open = (appState.tasks ?? []).find((t) => t.id === openId) ?? null;
  const patch = (id: string, p: Partial<ComposerData>) => {
    const next: AppState = structuredClone(appState);
    const t = next.tasks.find((x) => x.id === id);
    if (t) Object.assign(t, p);
    persist(next);
  };
  const complete = (t: Task, final: ComposerData) => {
    haptic(18);
    const next: AppState = structuredClone(appState);
    const task = next.tasks.find((x) => x.id === t.id);
    if (task) { Object.assign(task, final); task.done = true; task.doneAt = new Date().toISOString(); }
    persist(next); setOpenId(null); showToast("完了しました");
  };
  const remove = (id: string) => {
    setOpenId(null);
    const next: AppState = structuredClone(appState);
    next.tasks = next.tasks.filter((x) => x.id !== id);
    persist(next);
  };

  return (
    <div ref={boxRef} style={{ position: "absolute", inset: 0, touchAction: "none" }}>
      {/* ★★影の canvas（ホームと同じ。塗りはぼかさず、ぼかしは GPU）。 */}
      <canvas ref={shRef} aria-hidden style={{
        position: "absolute", inset: 0, width: "100%", height: "100%", display: "block",
        filter: `blur(${PILE_SHADOW.blur}px)`, pointerEvents: "none",
      }} />
      <canvas ref={cvRef} style={{
        position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none",
      }} />
      {open && (
        <TaskComposer key={open.id} data={open} mode="task"
          onCommit={(d) => patch(open.id, d)} onConfirm={(d) => complete(open, d)}
          onDelete={() => remove(open.id)} onClose={(d) => { patch(open.id, d); setOpenId(null); }} />
      )}
    </div>
  );
}
