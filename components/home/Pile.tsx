"use client";

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/helpers";
import { onFontsReady } from "@/lib/textFit";
import { clearSolidBitmaps } from "@/lib/solidPaint";
import {
  DROP_EVERY_MS, GRAVITY_Y, buildPieces, makeWalls, type Piece,
} from "./pileWorld";
import { clearPileBitmaps, drawPile } from "./pilePaint";

import type { Body, Engine } from "matter-js";
import type { Item, TabId, Task } from "@/lib/types";

// ★★★**山**（2026-09-07）。**今日やると決めたもの**が積もる場所。
// 物理と図形の作り方は `./pileWorld.ts`、焼き方と描き方は `./pilePaint.ts`。
// **ここに居るのは「器・世界の寿命・指」だけ。**
//
// ★★★**2026-09-11（第92巡）に土台から組み直した。** それまでの作りには、
// 「少し直すたびにホームだけ不安定になる」原因が3つ**構造として**入っていた:
//
//  1. ★★★**canvas の実解像度が最初の1回しか合っていなかった**（＝ぼやけの正体）。
//     **同じ器に ResizeObserver を2つ**付けていて、①が先に `sizeRef` を新しい値へ
//     書き換え、②（実解像度と壁を直す唯一の場所）は「差 0」を見て毎回 return して
//     いた。仕様上 observer は**作った順**に呼ばれるので、これは必ず起きる。
//     結果、CSS の箱だけが器を追い、**古い実解像度の絵をブラウザが引き伸ばす**。
//     iOS は起動直後に器の高さが必ず動くので、実機では山まるごとがぼやけていた。
//     → **器を見る observer は1つ**にし、さらに **`draw()` の頭で毎フレーム
//       照合する**（`GravityTab` と同じ）。取りこぼしても次のフレームで直る。
//
//  2. ★★★**中身が1文字変わるたび matter.js の世界ごと作り直していた**。
//     約370行が1本の async effect で、deps は中身の署名。タスクの題・未読の枚数・
//     声を録ったか、どれが動いても **import → 書体待ち → engine → 壁 → 予算 →
//     全図形 → rAF** を丸ごとやり直していた。しかも `stop` の確認が1か所しか
//     無かったので、**前の走行が後の走行の ref を上書きする**ことがあった
//     （＝当たり判定と絵が別の世界を見る）。
//     → **effect を2本に割った**。世界（engine・壁・ループ）は `[measured]` で
//       1度だけ。中身は `[sig, worldGen]` で**図形だけ**を差し替える。
//       中身の側に `await` が無いので、**競合しようがない**。
//
//  3. ★★**画面の細かさが端末の 2/3 しか使われていなかった**（`Math.min(2, dpr)`）。
//     → 実機の倍率（3）をそのまま使う。★`lib/textFit.ts` の焼き段に 192 を足して
//       あるので、大きな題が**拡大されて滲む**ことも無い。
//
// ★★書体が遅れて届いたら**焼き直す**（`onFontsReady`）。和文の Web フォントは
//   unicode-range で 100 以上に分かれて届くので、`document.fonts.ready` の
//   あとに本物が来る ―― 購読していなかったので、代替書体のまま固まり得た。

/** 掴むまでの長押し。★`GravityTab` と同じ（動かすとスワイプ扱い）。 */
const HOLD_MS = 150;
const TAP_MOVE = 8;
/** ★指の太さぶんの余裕（当たり判定を外へ広げる）。★目盛りの外（触りごこち）。 */
const TOUCH_SLOP = 10;
/** 掴んだ図形が指へ寄る強さと、離れてよい上限。★同上。 */
const GRAB_K = 0.34;
const GRAB_MAX = 34;
/**
 * ★★★**画面の細かさの上限**。★目盛りの外（絵の寸法）。
 * 実機（iPhone）は 3。2 で頭打ちにすると **1.5倍に引き伸ばされて**貼られる。
 * ★これ以上（4 以上の端末）は面積が倍々になるので、3 で止める。
 */
const DPR_MAX = 3;
/** 全部を落とし終えてから眠りを**考え始める**までの猶予。★目盛りの外（物理の場）。 */
const SETTLE_MS = 2500;
/** 「もう止まっている」と見なす速さ。★目盛りの外（物理の場）。 */
const CALM_V = 0.35;
const CALM_W = 0.03;

export function Pile({ tasks, offers, unread, today, journal, onOpen }: {
  tasks: Task[];
  offers: Item[];
  unread: number;
  today: Date;
  /** ★その日まだ声を録っていないときだけ来る（録っていれば `null`）。 */
  journal: { title: string } | null;
  /** ★図形を**軽く押した**ときの行き先。長押しは掴むほうなので走らない。 */
  onOpen: (tab: TabId) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const piecesRef = useRef<Piece[]>([]);
  const matterRef = useRef<typeof import("matter-js") | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef(0);
  /** ★★★器の寸法は**ref で持つ**（state ではない）。state にすると、iOS で器が
   *  1px 揺れるたびに React が作り直し、**山が落ち直して震え続ける**。 */
  const sizeRef = useRef({ w: 0, h: 0 });
  /** ★★★**器の伸び縮みに応えるのはこの1本だけ。** 世界の effect がここへ
   *  「canvas と壁を直す」を置き、器を見る observer がそれを呼ぶ。
   *  **observer を2つ付けない**（付けると先に走ったほうが番人を黙らせる）。 */
  const onResizeRef = useRef<((w: number, h: number) => void) | null>(null);
  /** 落とし始めの時刻と、もう世界へ入れた図形。★中身を差し替えるたびに作り直す。 */
  const releaseRef = useRef<{ at: number; done: Set<string>; settleAt: number }>(
    { at: 0, done: new Set(), settleAt: 0 },
  );
  /** 最初に測れたら1度だけ真になる（世界を組む合図）。以後は動かさない。 */
  const [measured, setMeasured] = useState(false);
  /** ★世界ができた合図（中身の effect はこれを待つ）。 */
  const [worldGen, setWorldGen] = useState(0);
  const [holding, setHolding] = useState(false);
  const dragRef = useRef<{ piece: Piece; x: number; y: number } | null>(null);

  // ── 器を測る（★observer はこの1つだけ） ──────────────────────
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const read = () => {
      const w = box.clientWidth; const h = box.clientHeight;
      // ★0.5px 未満のゆらぎは無視（`GravityTab` と同じ番人）。
      const same = Math.abs(w - sizeRef.current.w) < 0.5 && Math.abs(h - sizeRef.current.h) < 0.5;
      sizeRef.current = { w, h };
      if (w > 0 && h > 0) setMeasured(true);
      if (!same) onResizeRef.current?.(w, h);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // ── 世界（engine・壁・ループ）。★`measured` で1度だけ ────────────
  useEffect(() => {
    const cv = cvRef.current;
    if (!measured || !cv) return;
    let stop = false;

    (async () => {
      const M = (await import("matter-js")).default ?? (await import("matter-js"));
      if (stop) return;
      // ★★★**書体が届くまで待つ**（2026-09-09）。日付の板は**実際に組んだ字を
      //   測って**大きさを決めるので、Archivo が届く前に測ると**代替の書体の幅**で
      //   決まってしまい、板が小さいまま出る（実測 155px／狙いは 236px）。
      await document.fonts?.ready;
      if (stop) return;
      matterRef.current = M;

      // ★★★**落ちているあいだは眠らせない**（2026-09-10）。matter.js は、支えて
      //   いた物体が転がって**居なくなっても、眠っている物体を起こさない**
      //   （起きるのは新しい衝突が起きたときだけ）。落下中に眠りに入ると、
      //   **宙に浮いたまま固まる**。落とし終えてから眠りを許す（`settleAt`）。
      const engine = M.Engine.create({ enableSleeping: false });
      engine.gravity.y = GRAVITY_Y;
      engineRef.current = engine;

      let walls: Body[] = [];
      const buildWalls = (bw: number, bh: number) => {
        if (walls.length) M.Composite.remove(engine.world, walls);
        walls = makeWalls(M, bw, bh);
        M.Composite.add(engine.world, walls);
      };
      buildWalls(sizeRef.current.w, sizeRef.current.h);

      // ★★**器が伸び縮みしたら、壁だけ作り直す**（山は落とし直さない）。
      //   iOS はツールバーや安全域で器の高さが常に少し動くので、そのたびに
      //   山を組み直すと**震え続ける**。
      onResizeRef.current = (nw, nh) => {
        buildWalls(nw, nh);
        for (const p of piecesRef.current) M.Sleeping.set(p.body, false);
      };

      const ctx = cv.getContext("2d");
      if (!ctx) return;

      /** ★★★**実解像度は毎フレーム照合する**（`GravityTab` と同じ2行）。
       *  倍率も毎回読む ―― 端末の表示設定やウィンドウの移動で変わり得る。 */
      const sync = () => {
        const { w, h } = sizeRef.current;
        const dpr = Math.min(DPR_MAX, window.devicePixelRatio || 1);
        const cw = Math.round(w * dpr); const ch = Math.round(h * dpr);
        if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
        return { w, h, dpr };
      };

      const loop = () => {
        if (stop) return;
        const now = performance.now();
        const rel = releaseRef.current;
        // ★★★**世界へは1つずつ入れる**（2026-09-09）。まとめて入れると全部が同時に
        //   落ち始めるので、順番を作るために出どころを空の彼方まで持ち上げる羽目に
        //   なる。**入れる時刻をずらせば、出どころは器のすぐ上でよい。**
        for (const p of piecesRef.current) {
          if (rel.done.has(p.id)) continue;
          const at = (p.body.plugin as { releaseAt?: number } | undefined)?.releaseAt ?? 0;
          if (now - rel.at < at) continue;
          rel.done.add(p.id);
          M.Composite.add(engine.world, p.body);
        }
        // ★★★**眠りを許すのは「時間」ではなく「みんな止まったら」**（第92巡）。
        //   時間だけで決めると、**まだ落ちている最中に眠りが解禁**される ――
        //   matter.js は支えていた物体が転がって居なくなっても眠っている物体を
        //   起こさないので、**宙に浮いたまま固まる**（第90巡に踏んだ形）。
        //   ★床を下げて落ちる距離が伸びたぶん、時間の見積もりはもう当たらない。
        if (!engine.enableSleeping && rel.settleAt > 0 && now > rel.settleAt
          && piecesRef.current.every((p) => p.body.speed < CALM_V && p.body.angularSpeed < CALM_W)) {
          engine.enableSleeping = true;
        }
        // ★★★**刻みは固定**（`GravityTab` と同じ 1000/60）。実時間の差分を渡すと、
        //   フレームが落ちた瞬間に刻みが伸びて**貫通・弾け・震え**が起きる
        //   ―― 「落ちる動作が不安定」の直接の原因だった（2026-09-07）。
        M.Engine.update(engine, 1000 / 60);
        // 掴んでいる図形は、指の方へバネで寄せる（`GravityTab` と同じ作法）。
        const d = dragRef.current;
        if (d) {
          const b = d.piece.body;
          const dx = d.x - b.position.x; const dy = d.y - b.position.y;
          const k = Math.min(1, GRAB_MAX / (Math.hypot(dx, dy) || 1));
          M.Body.setVelocity(b, { x: dx * GRAB_K * k, y: dy * GRAB_K * k });
        }
        const { w, h, dpr } = sync();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // ★★回した絵を貼るので、再標本化の質を上げる（`GravityTab` と同じ）。
        ctx.imageSmoothingQuality = "high";
        ctx.clearRect(0, 0, w, h);
        drawPile(ctx, piecesRef.current, dpr, () => { /* 次のフレームで拾う */ });
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      if (!stop) setWorldGen((n) => n + 1);
    })();

    return () => {
      stop = true;
      cancelAnimationFrame(rafRef.current);
      onResizeRef.current = null;
      piecesRef.current = [];
      engineRef.current = null;
      matterRef.current = null;
    };
  }, [measured]);

  // ── 中身（図形）。★世界はそのまま、図形だけ差し替える ─────────────
  // ★★★**組み直す合図は「中身」だけ**（2026-09-10）。配列の同一性で見ていた
  //   ので、保存や同期のたびに `appState` が作り直されると**山ごと落ち直して
  //   いた**。中身が同じなら文字列も同じになるので、組み直しは起こらない。
  const sig = [
    tasks.map((t) => `${t.id}:${t.weight ?? 2}:${t.dueDate ?? ""}:${t.tag ?? ""}:${t.title}`).join("|"),
    offers.map((o) => `${o.id}:${o.kind}`).join("|"),
    unread, journal?.title ?? "", today.toDateString(),
  ].join("#");

  useEffect(() => {
    const M = matterRef.current;
    const engine = engineRef.current;
    const { w, h } = sizeRef.current;
    if (!M || !engine || w <= 0 || h <= 0) return;
    for (const p of piecesRef.current) M.Composite.remove(engine.world, p.body);
    const pieces = buildPieces(M, { tasks, offers, unread, today, journal }, w, h);
    piecesRef.current = pieces;
    dragRef.current = null;
    engine.enableSleeping = false;
    releaseRef.current = {
      at: performance.now(), done: new Set(),
      settleAt: performance.now() + pieces.length * DROP_EVERY_MS + SETTLE_MS,
    };
    // ★deps は**署名と世界の世代**だけ。`tasks` などの配列の同一性では見ない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, worldGen]);

  // ★★書体が遅れて届いたら焼き直す（購読していなかったので、和文が代替書体の
  //   まま固まり得た）。★板は `lib/solidPaint.ts` の側のキャッシュに居る。
  useEffect(() => onFontsReady(() => { clearPileBitmaps(); clearSolidBitmaps(); }), []);

  // ── 掴む ──────────────────────────────────────────────────
  /**
   * ★★★**当たり判定**（2026-09-09 に作り直した）。直す前は3つ外していた:
   *   1. **掴めないもの（数の図形・文字の板）が上に乗っていると、下の図形が
   *      掴めなかった** ―― **掴めないものは初めから見ない。**
   *   2. **円を多角形として見ていた** ―― matter.js の円は 25 角形で、頂点は
   *      円周上にあるから**辺の内側が欠ける**。円は半径で見る。
   *   3. **指の太さぶんの余裕が無かった** ―― `TOUCH_SLOP` ぶん広げ、
   *      **当たった中でいちばん近いもの**を採る。
   * ★★★**トゲトゲの円も見る**（押すと行き先があるので、見ないと触れない）。
   *   **見ないのは文字の板だけ。**
   */
  const pickAt = (cx: number, cy: number): Piece | null => {
    const box = boxRef.current;
    if (!box) return null;
    const r = box.getBoundingClientRect();
    const pt = { x: cx - r.left, y: cy - r.top };
    let best: Piece | null = null;
    let bestD = Infinity;
    for (const p of piecesRef.current) {
      if (p.kind === "word") continue;   // ★文字の板は触れない（下の図形に譲る）
      const b = p.body;
      const dx = pt.x - b.position.x; const dy = pt.y - b.position.y;
      const d = Math.hypot(dx, dy);
      let inside: boolean;
      if ((p.kind === "offer" || p.kind === "badge") && p.r) {
        inside = d <= p.r + TOUCH_SLOP;
      } else {
        // ★回っている四角は、**体の向きへ座標を戻してから**箱で見る。
        const ca = Math.cos(-b.angle); const sa = Math.sin(-b.angle);
        const lx = dx * ca - dy * sa; const ly = dx * sa + dy * ca;
        inside = Math.abs(lx) <= (p.w ?? 0) / 2 + TOUCH_SLOP
              && Math.abs(ly) <= (p.h ?? 0) / 2 + TOUCH_SLOP;
      }
      if (inside && d < bestD) { best = p; bestD = d; }
    }
    return best;
  };

  const press = useRef<{ id: number; x: number; y: number; timer: number } | null>(null);
  // ★長押しの途中で外れたら、タイマーを必ず落とす（消えた画面へ触りに行かない）。
  useEffect(() => () => { if (press.current) window.clearTimeout(press.current.timer); }, []);

  const onDown = (e: React.PointerEvent) => {
    if (press.current) return;
    const timer = window.setTimeout(() => {
      const p = pickAt(e.clientX, e.clientY);
      // ★文字の板は掴めない（`GravityTab` と同じ）。
      if (!p || p.kind === "word") return;
      const box = boxRef.current;
      if (!box) return;
      const r = box.getBoundingClientRect();
      dragRef.current = { piece: p, x: e.clientX - r.left, y: e.clientY - r.top };
      setHolding(true);
    }, HOLD_MS);
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, timer };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const pr = press.current;
    if (!pr) return;
    if (!dragRef.current) {
      // ★掴む前に動いたら、それはスワイプ（ホームは横スワイプで隣のアプリへ）。
      if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > TAP_MOVE) {
        window.clearTimeout(pr.timer);
        press.current = null;
      }
      return;
    }
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    dragRef.current.x = e.clientX - r.left;
    dragRef.current.y = e.clientY - r.top;
  };

  // ★★★**口とブラックホールは置かない**（2026-09-09 ユーザー指定で削除）。
  //   山で掴めるのは**運ぶこと**だけで、完了も削除もここでは起こらない
  //   ―― `components/tasks/DropTargets.tsx` は TASK 側がそのまま使っている。
  // ★★**軽く押したら開く**（2026-09-09）。長押し（`HOLD_MS`）を過ぎる前に、
  //   `TAP_MOVE` より動かさずに離したときだけ。**掴んだあとは走らない**
  //   ―― 運んで戻しただけで画面が飛ぶのは事故になる。
  const onUp = (e: React.PointerEvent) => {
    const pr = press.current;
    if (pr) window.clearTimeout(pr.timer);
    press.current = null;
    const dragged = dragRef.current;
    dragRef.current = null;
    setHolding(false);
    if (dragged || !pr) return;
    if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > TAP_MOVE) return;
    const p = pickAt(e.clientX, e.clientY);
    if (p?.nav) { haptic(6); onOpen(p.nav); }
  };

  return (
    <div
      ref={boxRef}
      data-pile
      style={{ position: "absolute", inset: 0, touchAction: holding ? "none" : "pan-x" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {/* ★★**CSS の大きさは器そのもの**（`width/height: 100%`）。canvas は
          置換要素なので、`inset: 0` だけだと**内在の 300×150 のまま**になり得る
          ―― 実解像度（`width`/`height` 属性）と食い違うと絵が伸びる。 */}
      <canvas ref={cvRef} style={{
        position: "absolute", inset: 0, width: "100%", height: "100%", display: "block",
      }} />
    </div>
  );
}
