"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Body, Engine } from "matter-js";
import { Masthead } from "@/components/common";
import { DemoSeedButton, TaskAddButton } from "@/components/tasks/TaskAddButton";
import { TaskSheet, type SheetData } from "@/components/tasks/TaskSheet";
import { ViewToggle } from "@/components/tasks/ViewToggle";
import { appTitle } from "@/lib/apps";
import { TAB_PAD_TOP } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { frontRect, sectionOutline, type SolidSpec } from "@/lib/solid";
import { clearSolidBitmaps, peekSolidBitmap, shapeBounds, shapeGlyphsReady, solidBitmap, warmShapeGlyphs, type SolidPaint, type SolidView } from "@/lib/solidPaint";
import { clearGlyphs, onFontsReady } from "@/lib/textFit";
import { resolveTag, tagColor } from "@/lib/taskTags";
import { demoTasks } from "@/lib/taskDemo";
import { dropOrder, massOf, specOf } from "@/lib/taskSize";
import type { AppState, TabProps, Task } from "@/lib/types";

// ★タスクタブ(GRAVITY)。確定したタスクが上から落ちてきて積み上がる。
//
// 立体の寸法がそのままタスクの中身になっている(lib/taskSize.ts):
//   軸(横)の長さ = タイトルの文字数 × 手順の残り
//   断面の太さ   = 重要度(= 物理の重さ)
//   断面の形     = 埋まっている側面の数(円/半円/三角/四角)
//   スラブの枚数 = 残っている手順
//   上下の面の色 = タグ
//
// ★FRONT / BOTTOM の2つの見え方を切り替えられる(既定は FRONT)。
// **切り替えるたびに山を落とし直す**(2026-08-16にユーザー確定)。前は絵だけを
// 差し替えて山をそのまま残していたが、「ビューを変更するごとに落下させ直す
// こと」と指定された。切り替えると、いま画面にある図形が**縮みながら消え**
// (EXIT_MS・上のものから順に)、消え切ってから新しい見え方で落ちてくる。
// 消えている間は物理を止める(崩れる途中の絵が混ざらないように)。
//
// ★毎フレームのコストは物体ごとに drawImage 1回。立体の絵は
// lib/solidPaint.ts が1枚のビットマップに焼いてキャッシュしており、matter.js の
// 物体は画面内の2D回転しかしないので、それを body.angle で回すだけで厳密に正しい。
//
// ★rAF は「このアプリが表示されている(appActive)」かつ「起きている物体が
// ある」ときだけ回す。全部が寝たら止める(matter.js の enableSleeping)。
// matter.js は effect の中で dynamic import する(leaflet と同じ手)。

/** 図形の1単位を何pxで描くか。★2026-08-13にユーザー指定で2倍(32→64)。 */
const UNIT = 64;
/** 物理の重さの倍率。 */
const MASS_K = 1.6;
/** 1フレームに焼いてよい図形の絵の枚数。 */
const BAKE_BUDGET = 1;
/** 1フレームに用意してよいグリフの枚数。
 *  ★和文のWebフォントは1文字の fillText が数ms〜10msかかる。落下中に
 *  7個ぶんをまとめて焼くと数秒止まった(実測 fillText 合計2.4秒)ので、
 *  少しずつ配る。 */
const GLYPH_BUDGET = 1;

/** 完了したときに飛び散る破片。 */
interface Shard { x: number; y: number; vx: number; vy: number; r: number; life: number; fill: string }
const SHARD_MS = 620;

/** ビューを切り替えたとき、1つの図形が消えるのにかける時間(ms)。 */
const EXIT_MS = 260;
/** 消え始めをずらす間隔(ms)。上にあるものから順に消える。 */
const EXIT_STAGGER = 38;

interface Piece {
  id: string;
  body: Body;
  spec: SolidSpec;
  paint: SolidPaint;
  /** 長方形の短辺(破片の大きさに使う)。 */
  girth: number;
  /** 消えるアニメーションの開始をどれだけ遅らせるか(ms)。 */
  exitDelay: number;
  /** 絵の原点と物体の重心のズレ(px)。matter.js の多角形は**重心**が
   *  body.position になるが、絵は図形の原点を中心に焼いてあるため、
   *  三角形のように重心が原点と一致しない形ではこのぶん戻して描く。 */
  ox: number;
  oy: number;
}

// ★タグは必ず1つ入る(resolveTag)。決めていないタスクも、題や側面の言葉から
// 見立て、それでも決まらなければ id から決定的に割り当てる。
// **タグを持たない図形は作らない**(2026-08-16にユーザー確定)。
const paintOf = (t: Task, view: SolidView): SolidPaint => ({
  spec: specOf(t), view, title: t.title, seed: t.id,
  tag: resolveTag(t.tag, t.id, t.title, t.when, t.context, t.belongings, t.note),
});

/** 同じ立体か(形が変わったら body を作り直す必要がある)。 */
const sameShape = (a: SolidSpec, b: SolidSpec) =>
  a.sides.length === b.sides.length && Math.abs(a.len - b.len) < 1e-6 && Math.abs(a.radius - b.radius) < 1e-6;

export function GravityTab({ appState, persist, profileButton, showToast, appActive }: TabProps & { appActive?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // まだ焼けていない立体が残っているか。残っている間はループを止めない。
  const pendingBakeRef = useRef(false);
  // 描画から次のフレームを頼むための入口(draw より後に定義される wake を指す)。
  const wakeRef = useRef<() => void>(() => {});
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
  const [draftId, setDraftId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<SolidView>("front");
  const viewRef = useRef<SolidView>("front");

  // 消えるアニメーションの最中か。動いている間は物理を止める。
  const exitRef = useRef<{ start: number; until: number } | null>(null);
  const dropAllRef = useRef<() => void>(() => {});

  const tasks = useMemo(() => (appState.tasks ?? []).filter((t) => !t.done), [appState.tasks]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const open = (appState.tasks ?? []).find((t) => t.id === openId) ?? null;

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    const { w, h } = sizeRef.current;
    if (!cv || !w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // ★焼き込みは表示より低い解像度で持つ。UNIT を2倍(64)にしたぶん bitmap の
    // 面積が4倍になり、dpr2 のまま焼くと1枚 100ms 級で落下がガクついた(実測)。
    // 文字は太字のベタ塗りなので 1.25x で十分読める。
    const bakeDpr = Math.min(dpr, 1.25);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // 立体は1枚に焼いた絵を、物体の位置と角度で置くだけ。
    // ★焼くのは1フレームに BAKE_BUDGET 枚まで。7個いっぺんに落とすと、
    // 1フレームで7枚を焼くことになって数百ms止まる(実測300ms)。まだ焼けて
    // いないものはタグ色のベタ塗りで置いておく — どうせ画面の上の方を
    // 落ちてくる最中なので、1〜2フレームぶんは目に入らない。
    let budget = BAKE_BUDGET;
    let glyphBudget = GLYPH_BUDGET;
    // ビューを切り替えた直後は「消えていく」途中。0=そのまま、1=消え切り。
    const ex = exitRef.current;
    const now = ex ? performance.now() : 0;
    for (const p of piecesRef.current) {
      const k = ex ? clamp01((now - ex.start - p.exitDelay) / EXIT_MS) : 0;
      if (k >= 1) continue; // 消え切ったものは描かない
      let bmp = peekSolidBitmap(p.paint, UNIT, bakeDpr);
      if (!bmp) {
        // ★文字のグリフが揃ってから絵を焼く。揃っていないものは今フレームの
        // 予算のぶんだけ用意して、残りは次のフレームに回す。
        if (glyphBudget > 0) glyphBudget -= warmShapeGlyphs(p.paint, glyphBudget);
        if (budget > 0 && shapeGlyphsReady(p.paint)) { bmp = solidBitmap(p.paint, UNIT, bakeDpr); budget--; }
      }
      ctx.save();
      if (k > 0) {
        // 縮みながら薄くなり、わずかに傾く。塗りの色は変えない
        // (巨大な面の色を変えると合成レイヤーごと塗り直しになる)。
        const e = 1 - (1 - k) * (1 - k); // ease-out
        ctx.globalAlpha = 1 - e;
        ctx.translate(p.body.position.x, p.body.position.y);
        ctx.rotate(p.body.angle + e * 0.22);
        ctx.scale(1 - e * 0.85, 1 - e * 0.85);
        ctx.translate(-p.body.position.x, -p.body.position.y);
      }
      ctx.translate(p.body.position.x, p.body.position.y);
      ctx.rotate(p.body.angle);
      if (bmp) {
        // 重心と絵の原点のズレを戻す(回転したあとに効かせる)。
        ctx.drawImage(bmp.canvas, p.ox - bmp.w / 2, p.oy - bmp.h / 2, bmp.w, bmp.h);
      } else {
        ctx.rotate(-p.body.angle);
        ctx.translate(-p.body.position.x, -p.body.position.y);
        ctx.fillStyle = tagColor(p.paint.tag);
        ctx.beginPath();
        p.body.vertices.forEach((v, i) => (i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y)));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // まだ焼けていないものが残っていれば、次のフレームでも回す。
    // ★ループの中から wake() を呼んでも「もう回っている」と見なされて何もしない。
    // 止める判定の側で見るためのフラグにしておく。
    pendingBakeRef.current = budget === 0 || glyphBudget === 0
      || piecesRef.current.some((p) => !peekSolidBitmap(p.paint, UNIT, bakeDpr));
    if (pendingBakeRef.current) wakeRef.current();

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
  wakeRef.current = wake;

  useEffect(() => {
    loopRef.current = () => {
      const M = matterRef.current;
      const engine = engineRef.current;
      if (!M || !engine) { runningRef.current = false; return; }

      // ★ビューの切り替え中。物理は止めて、消えていく絵だけを描く。
      // 消え切ったらその場で落とし直し、次のフレームから普通に回る。
      const ex = exitRef.current;
      if (ex) {
        drawRef.current();
        if (performance.now() >= ex.until) { exitRef.current = null; dropAllRef.current(); }
        rafRef.current = requestAnimationFrame(() => loopRef.current());
        return;
      }

      M.Engine.update(engine, 1000 / 60);

      // 粉砕の破片。物理には乗せず、自分で落として消す。
      shardsRef.current = shardsRef.current
        .map((s) => ({ ...s, x: s.x + s.vx, y: s.y + s.vy, vy: s.vy + 0.6, life: s.life - 1000 / 60 / SHARD_MS }))
        .filter((s) => s.life > 0);

      drawRef.current();

      // 全部が寝て、破片も消えたら止める。次に何か起きたら再開する。
      const awake = piecesRef.current.some((p) => !p.body.isSleeping);
      if (!awake && shardsRef.current.length === 0 && !pendingBakeRef.current) {
        runningRef.current = false;
        return;
      }
      rafRef.current = requestAnimationFrame(() => loopRef.current());
    };
  }, []);

  // ★書体が揃ったら焼いた絵を捨てて描き直す。最初の数フレームは fallback の
  // 書体で焼かれているため(canvasのフォントは非同期に届く)。
  useEffect(() => {
    onFontsReady(() => { clearGlyphs(); clearSolidBitmaps(); wake(); drawRef.current(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ★山を丸ごと作り直して落とし直す。ビューの切り替えで使う。
  const dropAll = useCallback(() => {
    const M = matterRef.current;
    const engine = engineRef.current;
    const { w } = sizeRef.current;
    if (!M || !engine || !w) return;
    M.Composite.remove(engine.world, piecesRef.current.map((p) => p.body));
    shardsRef.current = [];
    const added = dropOrder(tasksRef.current, new Date())
      .map((t, i) => makePiece(M, t, viewRef.current, w, i));
    M.Composite.add(engine.world, added.map((p) => p.body));
    piecesRef.current = added;
    wake();
    drawRef.current();
  }, [wake]);
  dropAllRef.current = dropAll;

  // ★見え方を切り替えたら、**いまの山を消してから落とし直す**
  // (2026-08-16にユーザー確定)。消えている間の物理はループ側で止める。
  useEffect(() => {
    if (viewRef.current === view) return; // 初回のマウント
    viewRef.current = view;
    const n = piecesRef.current.length;
    if (!n) { dropAll(); return; }
    // 上にあるもの(y が小さい)から順に消す。
    const order = [...piecesRef.current].sort((a, b) => a.body.position.y - b.body.position.y);
    order.forEach((p, i) => { p.exitDelay = i * EXIT_STAGGER; });
    const start = performance.now();
    exitRef.current = { start, until: start + EXIT_MS + EXIT_STAGGER * (n - 1) };
    wake();
  }, [view, dropAll, wake]);

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

  // タスクの増減・中身の変化に物理の世界を合わせる。新しいものは上から落とす。
  useEffect(() => {
    const M = matterRef.current;
    const engine = engineRef.current;
    const { w } = sizeRef.current;
    if (!M || !engine || !w) return;
    const alive = new Map(tasks.map((t) => [t.id, t]));

    // 消えたもの(完了・削除)は世界からも外す。
    for (const p of piecesRef.current) {
      if (!alive.has(p.id)) M.Composite.remove(engine.world, p.body);
    }

    piecesRef.current = piecesRef.current
      .filter((p) => alive.has(p.id))
      .map((p) => {
        const t = alive.get(p.id) as Task;
        const paint = paintOf(t, viewRef.current);
        // ★形そのものが変わった(手順を済ませて短くなった等)ときだけ、
        // 位置と速度を引き継いだまま body を差し替える。
        if (!sameShape(p.spec, paint.spec)) {
          const { body, ox, oy } = makeBody(M, paint, p.body.position.x, p.body.position.y);
          M.Body.setAngle(body, p.body.angle);
          M.Body.setVelocity(body, p.body.velocity);
          M.Composite.remove(engine.world, p.body);
          M.Composite.add(engine.world, body);
          return { ...p, body, spec: paint.spec, paint, girth: girthOf(paint), ox, oy };
        }
        return { ...p, paint };
      });

    const have = new Set(piecesRef.current.map((p) => p.id));
    // 差し迫ったものから先に落として、山の下になるようにする。
    const added = dropOrder(tasks, new Date())
      .filter((t) => !have.has(t.id))
      .map((t, i) => makePiece(M, t, viewRef.current, w, i));
    if (added.length) {
      M.Composite.add(engine.world, added.map((p) => p.body));
      piecesRef.current = [...piecesRef.current, ...added];
    }
    wake();
  }, [tasks, wake, ready]);

  const patch = (id: string, p: Partial<SheetData>) => {
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
      const fill = tagColor(t.tag);
      for (let i = 0; i < 14; i++) {
        const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
        const sp = 2 + Math.random() * 4;
        shardsRef.current.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
          r: piece.girth * (0.1 + Math.random() * 0.12),
          life: 1, fill,
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
  const closeSheet = (id: string) => {
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
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>
      {/* full-bleed(タブバーの下まで敷く)なので、ボタンはタブバーのぶん持ち上げる。 */}
      <TaskAddButton onAdd={addTask} lifted />
      {tasks.length === 0 && <DemoSeedButton label="デモのタスクを入れる" onSeed={seedDemo} lifted />}
      {open && (
        <TaskSheet
          key={open.id}
          data={open}
          mode="task"
          from="bottom"
          autoEdit={draftId === open.id}
          onChange={(p) => patch(open.id, p)}
          onConfirm={() => complete(open)}
          onDelete={() => remove(open.id)}
          onClose={() => closeSheet(open.id)}
        />
      )}
    </main>
  );
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 落ちてくる図形を1つ作る。i は落とす順(大きいほど高いところから)。 */
function makePiece(
  M: typeof import("matter-js"), t: Task, view: SolidView, w: number, i: number,
): Piece {
  const paint = paintOf(t, view);
  const b = shapeBounds(paint);
  const hw = ((b.maxX - b.minX) * UNIT) / 2;
  // 落ちてくる位置は id から決める(開くたびに散らばり方が変わらない)。
  const x = Math.max(hw + 6, Math.min(Math.max(w - hw - 6, hw + 6), w * 0.14 + frac(t.id) * w * 0.72));
  const y = -((b.maxY - b.minY) * UNIT) - i * 210;
  const { body, ox, oy } = makeBody(M, paint, x, y);
  return { id: t.id, body, spec: paint.spec, paint, girth: girthOf(paint), exitDelay: 0, ox, oy };
}

/**
 * ★当たり判定は**そのビューで実際に描く形**。
 * FRONT は長方形、BOTTOM は断面の多角形(円/半円/三角/四角)。
 * 以前は BOTTOM でも FRONT の長方形で当てていたため、断面の周りの見えない
 * 余白どうしがぶつかって図形が宙に浮いて見えた。ビューを切り替えるたびに
 * 落とし直す設計になったので(2026-08-16確定)、物体を作り分けられる。
 */
function makeBody(
  M: typeof import("matter-js"), paint: SolidPaint, x: number, y: number,
): { body: Body; ox: number; oy: number } {
  const opts = { restitution: 0.04, friction: 0.55, frictionStatic: 0.9, frictionAir: 0.012 };
  let body: Body;
  let ox = 0;
  let oy = 0;
  if (paint.view === "bottom") {
    const size = 2 * paint.spec.radius * UNIT;
    const verts = sectionOutline(paint.spec.sides.length).map((q) => ({ x: q.x * size, y: q.y * size }));
    body = M.Bodies.fromVertices(x, y, [verts], opts);
    // fromVertices は**重心**を body.position に置く。絵は図形の原点を中心に
    // 焼いてあるので、そのズレを描画側で戻す。
    const c = M.Vertices.centre(verts);
    ox = -c.x;
    oy = -c.y;
  } else {
    const { w, h } = frontRect(paint.spec);
    body = M.Bodies.rectangle(x, y, w * UNIT, h * UNIT, opts);
  }
  M.Body.setMass(body, massOf(paint.spec) * MASS_K);
  return { body, ox, oy };
}

/** その絵の短辺(px)。破片の大きさに使う。 */
function girthOf(paint: SolidPaint): number {
  const b = shapeBounds(paint);
  return Math.min(b.maxX - b.minX, b.maxY - b.minY) * UNIT;
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
