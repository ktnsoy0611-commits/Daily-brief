"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Body, Engine } from "matter-js";
import { Masthead } from "@/components/common";
import { DemoSeedButton } from "@/components/tasks/TaskAddButton";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { ViewToggle } from "@/components/tasks/ViewToggle";
import { appTitle } from "@/lib/apps";
import { TAB_PAD_TOP } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { rectOf, sectionOutline, type SolidSpec } from "@/lib/solid";
import { clearSolidBitmaps, peekSolidBitmap, shapeBounds, shapeGlyphsReady, solidBitmap, warmShapeGlyphs, type SolidPaint, type SolidView } from "@/lib/solidPaint";
import { onFontsReady, primeAdvances } from "@/lib/textFit";
import { allTagFaces, allTagLabels, resolveTag, tagColor } from "@/lib/taskTags";
import { demoTasks } from "@/lib/taskDemo";
import { areaOf, dropOrder, massOf, specOf } from "@/lib/taskSize";
import type { AppState, TabProps, Task } from "@/lib/types";

// ★タスクタブ(GRAVITY)。確定したタスクが上から落ちてきて積み上がる。
//
// 図形の寸法がそのままタスクの中身になっている(lib/taskSize.ts):
//   塗られる面積 = 重要度(WEIGHT × 期限の倍率)。**大きさに効くのはこれだけ**
//   形          = 埋まっている側面の数(円/半円/三角/四角)
//   縦横比      = **四角だけ**題の長さで横に伸びる(他は本来の比を保つ)
//   スラブの枚数 = 残っている手順
//   色と書体    = タグ
//
// ★ネームビュー / タグビューの切り替えは**載る文字が変わるだけ**
// (2026-08-16にユーザー確定)。形も位置も変わらないので、山は動かさない。
//
// ★山が画面からはみ出さないよう、**タスクの数に応じて全体を一括で縮める**。
// さらに、縮んだ結果 CULL_PX を割るものは**そもそも山に入れない**。
// これで「混雑しても切迫した数件は大きいまま残る」ようになる。
//
// ★毎フレームのコストは物体ごとに drawImage 1回。立体の絵は
// lib/solidPaint.ts が1枚のビットマップに焼いてキャッシュしており、matter.js の
// 物体は画面内の2D回転しかしないので、それを body.angle で回すだけで厳密に正しい。
//
// ★rAF は「このアプリが表示されている(appActive)」かつ「起きている物体が
// ある」ときだけ回す。全部が寝たら止める(matter.js の enableSleeping)。
// matter.js は effect の中で dynamic import する(leaflet と同じ手)。

/** 図形の1単位を何pxで描くか。★2026-08-13にユーザー指定で2倍(32→64)。
 *  実際に使うのはこれ × scale(下の fitScale)。 */
const UNIT = 64;
/** 物理の重さの倍率。 */
const MASS_K = 1.6;
/** 図形の合計面積を、床から上の領域のどれだけに収めるか。
 *  1.0 だと隙間なく敷き詰める計算になり、実際には積み方の隙間で溢れる。 */
const FILL = 0.58;
/** ★どこまで縮めてよいか。**これ以上は縮めず、代わりに間引く**
 *  (2026-08-16にユーザー確定)。0.28 まで縮めていた頃は、40件あると全部が
 *  入るかわりに いちばん大きい図形でも 93px しかなく、「混雑時に大きい図形が
 *  無くメリハリが消える」状態になっていた。
 *  0.70 だと 16件はそのまま全部出て、40件では10件に絞られて最大137px になる。 */
const SCALE_MIN = 0.70;
/** 見出し(Masthead + ビュー切替)が占める高さ。山はここまで積み上がらない。 */
const MASTHEAD_H = 108;
/** いちばん大きい1枚が、画面の幅・高さのどこまでを占めてよいか。 */
const FIT_W = 0.86;
const FIT_H = 0.62;
/** どこまで大きくしてよいか。数個しか無いときに画面の下で小さく固まらないよう、
 *  拡大側にも余地を持たせる(「なるべく画面全体に入り切る大きさ」)。 */
const SCALE_MAX = 1.6;
/** 縮尺がこれ以上変わったら山を作り直す(当たり判定が変わるため)。 */
const SCALE_EPS = 0.02;
/** 当たり判定の多角形の頂点の上限(見た目の輪郭は間引かない)。 */
const PHYS_VERTS = 12;
/** 1フレームに焼いてよい図形の絵の枚数。 */
const BAKE_BUDGET = 1;
/** 1フレームに用意してよいグリフの枚数。
 *  ★和文のWebフォントは1文字の fillText が数ms〜10msかかる。落下中に
 *  7個ぶんをまとめて焼くと数秒止まった(実測 fillText 合計2.4秒)ので、
 *  少しずつ配る。 */
// ★1フレームに焼くグリフの枚数。★1枚では足りない(2026-08-17)。
// 16個 × 8文字 ≒ 130枚を1枚/フレームで焼くと2秒以上かかり、そのあいだに
// 書体の断片が届いて振り出しに戻るため、**文字が一度も出ない**状態になった。
const GLYPH_BUDGET = 4;

/** 完了したときに飛び散る破片。 */
interface Shard { x: number; y: number; vx: number; vy: number; r: number; life: number; fill: string }
const SHARD_MS = 620;

/** ★これ未満の代表寸法(px)になる図形は山に入れない(2026-08-16にユーザー確定)。
 *  「どうせ読めない図形は表示しなくてよい」。間引いたぶん縮尺が上がるので、
 *  混雑時も切迫した数件が大きいまま残る。 */
const CULL_PX = 30;

interface Piece {
  id: string;
  body: Body;
  spec: SolidSpec;
  paint: SolidPaint;
  /** 長方形の短辺(破片の大きさに使う)。 */
  girth: number;
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
  spec: specOf(t), view, title: t.title,
  tag: resolveTag(t.tag, t.id, t.title, t.context, t.belongings, t.note),
});

/** 同じ立体か(形が変わったら body を作り直す必要がある)。 */
const sameShape = (a: SolidSpec, b: SolidSpec) =>
  a.sides.length === b.sides.length
  && Math.abs(a.w - b.w) < 1e-6 && Math.abs(a.h - b.h) < 1e-6;

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
  // ★★＋で作ったばかりのものは、**保存せずここだけで持つ**(2026-08-18・第15巡)。
  // 以前は作った瞬間に保存していたので、**押した時点で山が丸ごと落とし直って**
  // いた(実機で報告)。入力画面はレコードと同じただのオーバーレイであって、
  // 開け閉めで後ろが動いてはいけない。題が付いて閉じたときに初めて山へ入る。
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<SolidView>("name");
  const viewRef = useRef<SolidView>("name");

  const dropAllRef = useRef<() => void>(() => {});
  // いまの一括縮尺。図形の絵も当たり判定もこれを掛けた単位で作る。
  const scaleRef = useRef(1);

  const tasks = useMemo(() => (appState.tasks ?? []).filter((t) => !t.done), [appState.tasks]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const open = (appState.tasks ?? []).find((t) => t.id === openId) ?? null;

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    const { w, h } = sizeRef.current;
    if (!cv || !w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // ★焼き込みの解像度。1.25x では dpr2 の画面へ 1.6倍に拡大されて滲み、
    // 文字がジャギーに見えていた。かといって dpr(2.0) そのままにすると
    // 1枚の画素が 2.56倍になり、落下中に 800ms 級のひっかかりが出た(実測)。
    // 1.5 が折衷点 — 拡大は 1.33倍に収まり、コストは 1.44倍で済む。
    const bakeDpr = Math.min(dpr, 1.5);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, w, h);

    // 立体は1枚に焼いた絵を、物体の位置と角度で置くだけ。
    // ★焼くのは1フレームに BAKE_BUDGET 枚まで。7個いっぺんに落とすと、
    // 1フレームで7枚を焼くことになって数百ms止まる(実測300ms)。まだ焼けて
    // いないものはタグ色のベタ塗りで置いておく — どうせ画面の上の方を
    // 落ちてくる最中なので、1〜2フレームぶんは目に入らない。
    let budget = BAKE_BUDGET;
    let glyphBudget = GLYPH_BUDGET;
    const unit = UNIT * scaleRef.current;
    for (const p of piecesRef.current) {
      let bmp = peekSolidBitmap(p.paint, unit, bakeDpr);
      if (!bmp) {
        // ★文字のグリフが揃ってから絵を焼く。揃っていないものは今フレームの
        // 予算のぶんだけ用意して、残りは次のフレームに回す。
        if (glyphBudget > 0) glyphBudget -= warmShapeGlyphs(p.paint, glyphBudget, unit, bakeDpr);
        if (budget > 0 && shapeGlyphsReady(p.paint, unit, bakeDpr)) { bmp = solidBitmap(p.paint, unit, bakeDpr); budget--; }
      }
      ctx.save();
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
    // まだ焼けていないものが残っていれば、次のフレームでも回す。
    // ★ループの中から wake() を呼んでも「もう回っている」と見なされて何もしない。
    // 止める判定の側で見るためのフラグにしておく。
    pendingBakeRef.current = budget === 0 || glyphBudget === 0
      || piecesRef.current.some((p) => !peekSolidBitmap(p.paint, unit, bakeDpr));
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
  useEffect(() => onFontsReady(() => {
    // ★ここで clearGlyphs() は**呼ばない**。何を捨てるかは textFit が
    // 面ごとに決めている(全消しすると焼き終わらない・2026-08-17)。
    clearSolidBitmaps(); primeTagMetrics(); wake(); drawRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  // ★タグの英字の送り幅を、暇な時間に少しずつ測っておく。欧文は全角の近道が
  // 効かず1文字ずつ measureText が要るので、BOTTOM へ切り替えた瞬間に
  // 5書体ぶんがまとめて走ると 328ms 止まる(実測)。
  useEffect(() => { primeTagMetrics(); }, []);

  // このアプリを見ていない間は回さない。
  // ★入力画面が開いているあいだも回さない(2026-08-18)。オーバーレイの裏で
  //   山が動き続けると、閉じたときに開いたときと違う絵になってしまう。
  //   ユーザー指定「閉じたら背景もそのまま維持されていて欲しい」。
  useEffect(() => {
    const on = !!appActive && !openId;
    activeRef.current = on;
    if (on) wake();
    else {
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
    }
  }, [appActive, openId, wake]);

  /** いま山に入れるタスクと、その縮尺。小さすぎるものは間引く。
   *  ★見出し(TASK・歯車・ビュー切替)のぶんを引く。引かないと山が上へ
   *  溢れて見出しに重なる(2026-08-16に実機で報告された)。 */
  const planPile = useCallback((list: Task[]) => {
    const { w, h } = sizeRef.current;
    return pileOf(list, new Date(), w, h - navHeightPx() - MASTHEAD_H);
  }, []);

  // ★山を丸ごと作り直して落とし直す。**縮尺が変わったときだけ**使う
  // (ビューの切り替えでは呼ばない — 形も位置も変わらないので)。
  const dropAll = useCallback(() => {
    const M = matterRef.current;
    const engine = engineRef.current;
    const { w } = sizeRef.current;
    if (!M || !engine || !w) return;
    M.Composite.remove(engine.world, piecesRef.current.map((p) => p.body));
    shardsRef.current = [];
    const { keep, scale } = planPile(tasksRef.current);
    scaleRef.current = scale;
    const unit = UNIT * scale;
    const added = dropOrder(keep, new Date())
      .map((t, i) => makePiece(M, t, viewRef.current, w, i, unit));
    M.Composite.add(engine.world, added.map((p) => p.body));
    piecesRef.current = added;
    wake();
    drawRef.current();
  }, [wake, planPile]);
  dropAllRef.current = dropAll;

  // ★ネーム / タグの切り替えは**載る文字が変わるだけ**(2026-08-16にユーザー
  // 確定)。形も位置も同じなので、山は一切動かさず絵だけ差し替える。
  useEffect(() => {
    viewRef.current = view;
    piecesRef.current = piecesRef.current.map((p) => ({ ...p, paint: { ...p.paint, view } }));
    wake();
    drawRef.current();
  }, [view, wake]);

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

    // ★★**落とし直すのは「並ぶ顔ぶれが変わったとき」だけ**(2026-08-18・第14巡)。
    // 以前は縮尺が動いただけでも落とし直していたので、**入力画面で1文字直して
    // 閉じるたびに山が上から降ってきた**(実機で「閉じた瞬間に途中まで落ちて
    // いる絵が一瞬出て、もう一度落とし直す」と報告)。入力画面はオーバーレイ
    // なので、開け閉めで後ろが動いてはいけない。
    // 中身だけ変わって縮尺が動いたときは、**いまの位置のまま body を作り直す**
    // (位置・角度・速度を引き継ぐので山は崩れない)。
    const { keep, scale } = planPile(tasks);
    const keepIds = new Set(keep.map((t) => t.id));
    const shownIds = new Set(piecesRef.current.map((p) => p.id));
    // ★★**落とし直すのは「まだ在るのに山から押し出された」ときだけ**
    // (2026-08-18・第15巡)。以前は**件数が違うだけ**で落とし直していたので、
    // タスクが1件増えるだけで全部が上から降ってきた。純粋な追加なら、
    // 既存はその場のまま倍率だけ合わせ(`rescale`)、新しい1つだけが落ちる。
    // 完了・削除は下の `alive` の道で世界から外れるので、これも落とし直さない。
    const aliveIds = new Set(tasks.map((t) => t.id));
    const pushedOut = [...shownIds].some((id) => !keepIds.has(id) && aliveIds.has(id));
    if (piecesRef.current.length && pushedOut) {
      dropAll();
      return;
    }
    const rescale = piecesRef.current.length > 0 && Math.abs(scale - scaleRef.current) > SCALE_EPS;
    scaleRef.current = scale;
    const unit = UNIT * scale;
    const alive = new Map(keep.map((t) => [t.id, t]));

    // 消えたもの(完了・削除)は世界からも外す。
    for (const p of piecesRef.current) {
      if (!alive.has(p.id)) M.Composite.remove(engine.world, p.body);
    }

    piecesRef.current = piecesRef.current
      .filter((p) => alive.has(p.id))
      .map((p) => {
        const t = alive.get(p.id) as Task;
        const paint = paintOf(t, viewRef.current);
        // ★形そのものが変わった(手順を済ませて短くなった等)か、一括の縮尺が
        // 動いたときだけ、位置と速度を引き継いだまま body を差し替える。
        if (rescale || !sameShape(p.spec, paint.spec)) {
          const { body, ox, oy } = makeBody(M, paint, p.body.position.x, p.body.position.y, unit);
          M.Body.setAngle(body, p.body.angle);
          M.Body.setVelocity(body, p.body.velocity);
          M.Composite.remove(engine.world, p.body);
          M.Composite.add(engine.world, body);
          return { ...p, body, spec: paint.spec, paint, girth: girthOf(paint, unit), ox, oy };
        }
        return { ...p, paint };
      });

    const have = new Set(piecesRef.current.map((p) => p.id));
    // 差し迫ったものから先に落として、山の下になるようにする。
    const added = dropOrder(keep, new Date())
      .filter((t) => !have.has(t.id))
      .map((t, i) => makePiece(M, t, viewRef.current, w, i, unit));
    if (added.length) {
      M.Composite.add(engine.world, added.map((p) => p.body));
      piecesRef.current = [...piecesRef.current, ...added];
    }
    wake();
  }, [tasks, wake, ready, planPile, dropAll]);

  const patch = (id: string, p: Partial<ComposerData>) => {
    const next: AppState = structuredClone(appState);
    const t = next.tasks.find((x) => x.id === id);
    if (t) Object.assign(t, p);
    persist(next);
  };

  // ★完了 = 粉砕。物体を消し、その場に破片を飛ばす。上に乗っていたものは
  // 起きて沈むので、山が実際に低くなる。
  const complete = (t: Task, final: ComposerData) => {
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
    // 入力画面での書き足しごと確定してから閉じる(下書きは画面側が持っている)。
    if (task) { Object.assign(task, final); task.done = true; task.doneAt = new Date().toISOString(); }
    persist(next);
    setOpenId(null);
    showToast("完了しました");
  };

  const remove = (id: string) => {
    setOpenId(null);
    const next: AppState = structuredClone(appState);
    next.tasks = next.tasks.filter((x) => x.id !== id);
    persist(next);
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
      {tasks.length === 0 && <DemoSeedButton label="デモのタスクを入れる" onSeed={seedDemo} lifted />}
      {open && (
        <TaskComposer
          key={open.id}
          data={open}
          mode="task"
          onCommit={(d) => patch(open.id, d)}
          onConfirm={(d) => complete(open, d)}
          onDelete={() => remove(open.id)}
          onClose={(d) => patch(open.id, d)}
        />
      )}
    </main>
  );
}

/** タグの英字の送り幅を、requestIdleCallback で数組ずつ潰していく。 */
function primeTagMetrics() {
  if (typeof window === "undefined") return;
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 32));
  const step = () => {
    if (primeAdvances(allTagLabels(), allTagFaces(), 4) > 0) idle(step as never);
  };
  idle(step as never);
}

/** 落ちてくる図形を1つ作る。i は落とす順(大きいほど高いところから)。 */
function makePiece(
  M: typeof import("matter-js"), t: Task, view: SolidView, w: number, i: number, unit: number,
): Piece {
  const paint = paintOf(t, view);
  const b = shapeBounds(paint);
  const hw = ((b.maxX - b.minX) * unit) / 2;
  // 落ちてくる位置は id から決める(開くたびに散らばり方が変わらない)。
  const x = Math.max(hw + 6, Math.min(Math.max(w - hw - 6, hw + 6), w * 0.14 + frac(t.id) * w * 0.72));
  const y = -((b.maxY - b.minY) * unit) - i * (110 + 100 * unit / UNIT);
  const { body, ox, oy } = makeBody(M, paint, x, y, unit);
  return { id: t.id, body, spec: paint.spec, paint, girth: girthOf(paint, unit), ox, oy };
}

/**
 * ★当たり判定は**そのビューで実際に描く形**そのもの。どちらのビューも
 * 断面の形(円/半円/三角/四角)なので、輪郭をその箱の大きさへ拡大した多角形で
 * 作る。長方形で当てていた頃は、形の周りの見えない余白どうしがぶつかって
 * 図形が宙に浮いて見えた。
 */
function makeBody(
  M: typeof import("matter-js"), paint: SolidPaint, x: number, y: number, unit: number,
): { body: Body; ox: number; oy: number } {
  const opts = { restitution: 0.04, friction: 0.55, frictionStatic: 0.9, frictionAir: 0.012 };
  const n = paint.spec.sides.length;
  const { w, h } = rectOf(paint.spec);
  let body: Body;
  let ox = 0;
  let oy = 0;
  if (n === 1) {
    // ★丸は 36角形ではなく本物の円で作る。多角形にすると衝突判定が重く、
    // 転がりもカクつく(頂点の角で引っかかる)。
    body = M.Bodies.circle(x, y, (w * unit) / 2, opts);
  } else {
    // ★物理の頂点は**間引く**。半円は輪郭が37点あり、16個を一度に
    // fromVertices で作ると凸包の計算で 400ms 級のひっかかりが出た(実測)。
    // 当たり判定は12点もあれば見た目と区別が付かない。
    const src = sectionOutline(n);
    const step = Math.max(1, Math.ceil(src.length / PHYS_VERTS));
    const verts = src
      .filter((_, k) => k % step === 0)
      .map((q) => ({ x: q.x * w * unit, y: q.y * h * unit }));
    body = M.Bodies.fromVertices(x, y, [verts], opts);
    // fromVertices は**重心**を body.position に置く。絵は図形の原点を中心に
    // 焼いてあるので、そのズレを描画側で戻す。
    const c = M.Vertices.centre(verts);
    ox = -c.x;
    oy = -c.y;
  }
  M.Body.setMass(body, massOf(paint.spec) * MASS_K);
  return { body, ox, oy };
}

/** その絵の短辺(px)。破片の大きさに使う。 */
function girthOf(paint: SolidPaint, unit: number): number {
  const b = shapeBounds(paint);
  return Math.min(b.maxX - b.minX, b.maxY - b.minY) * unit;
}

/**
 * ★山に入れるタスクと、その一括の縮尺を決める(2026-08-16にユーザー確定)。
 *
 * 図形の**面積の合計**が、床から上の領域の FILL 倍に収まる大きさを出す。
 * 面積で見るので、タスクが増えても重要度の**比**は保たれたまま全体が縮む。
 *
 * ★そのうえで、縮んだ結果 CULL_PX を割るものは**山に入れない**。
 * 面積の降順に並べ、先頭 N 件だけで縮尺を出しながら N を増やしていき、
 * 「N 件目が CULL_PX を下回る」ところで止める。含める数を増やすほど縮尺は
 * 単調に下がるので、この走査は一意に決まる。
 *
 * これで「混雑しても切迫した数件は大きいまま残り、遠いものは消える」。
 * 数個しか無いときは縮尺が上限に張り付くので、何も間引かれない。
 */
export function pileOf(
  tasks: Task[], today: Date, w: number, usableH: number,
): { keep: Task[]; scale: number } {
  if (!tasks.length || w <= 0 || usableH <= 0) return { keep: tasks, scale: 1 };
  const sorted = [...tasks]
    .map((t) => ({ t, area: areaOf(t, today) }))
    .sort((a, b) => b.area - a.area);
  const budget = ((w * usableH) / (UNIT * UNIT)) * FILL;
  const scaleFor = (total: number) => Math.min(SCALE_MAX, Math.sqrt(budget / total));

  let total = 0;
  let n = 0;
  for (const row of sorted) {
    const next = total + row.area;
    const scale = scaleFor(next);
    // 2つの止めどき。どちらかに触れたら、そこから先は山に入れない。
    //   ・これ以上入れると全体を SCALE_MIN より縮めないと収まらない
    //     → 縮めるのではなく**間引く**(混雑時も大きい図形を残すため)
    //   ・その1件自身が CULL_PX を割る → どうせ読めないので入れない
    if (n > 0 && (scale < SCALE_MIN || Math.sqrt(row.area) * UNIT * scale < CULL_PX)) break;
    total = next;
    n++;
  }
  // 1件だけはどんなに大きくても必ず入れる(空の山にしない)。
  const keep = sorted.slice(0, n).map((r) => r.t);
  // ★**いちばん大きい1枚が画面に収まる**ところまで縮める(2026-08-16に
  // 実機で報告された「図形が見出しに重なって上へはみ出す」への対処)。
  // 面積の合計だけで決めていた頃は、数件しか無いと縮尺が上限に張り付き、
  // 重要度の高い1枚が画面より大きくなって壁に挟まったまま浮いていた。
  let scale = Math.max(SCALE_MIN, scaleFor(total));
  for (const t of keep) {
    const { w: bw, h: bh } = rectOf(specOf(t, today));
    scale = Math.min(scale, (w * FIT_W) / (bw * UNIT), (usableH * FIT_H) / (bh * UNIT));
  }
  return { keep, scale: Math.max(0.12, scale) };
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
