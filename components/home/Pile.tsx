"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { INK, LATIN, PAPER, RUST, SWISS_XL } from "@/lib/constants";
import { img } from "@/lib/helpers";
import { colorOfKind } from "@/lib/palette";
import { areaOf, specOf, weightArea } from "@/lib/taskSize";
import { resolveTag, tagColor, tagFace, tagInk } from "@/lib/taskTags";
import { canvasFont, drawFitted, ensureGlyphs, fitText } from "@/lib/textFit";
import { paperize } from "@/lib/paperTexture";
import { RADIUS } from "@/lib/tokens";
import { aimTargets, DropTargets, fireTarget, targetAt } from "@/components/tasks/DropTargets";
import type { Body, Engine } from "matter-js";
import type { Item, Task } from "@/lib/types";

// ★★★**山**（2026-09-07）。**今日やると決めたもの**が積もる場所。
//
// ★★**物理は既存の GRAVITY と同じ**（重力・摩擦・跳ね・落下の速さ）。値は
//   `components/tabs/GravityTab.tsx` から**そのまま写してある** ―― あちらは
//   画面まるごとを占めるタブで、3つのモード・スワイプ・入力画面を内蔵して
//   いるので、帯の下の器としては使えない（ユーザー確定「gravity とホームは
//   別物。gravity の基本的な構造を使ってホームを作ったあと、task は全く別の
//   UI に変更する」）。★★**片方の値を触ったらもう片方も直すこと。**
//
// ★★**形は3つだけ**（意味づけはしない）:
//   ・**角丸の四角** … タスク。文字が組める唯一の形で、1件が1つ（まとめない）。
//   ・**円** … 提案。★**写真が入るのは円だけ**。
//   ・**トゲトゲの円** … まだ見ていない提案の残り数。数字を中に置き、0 で消える。
// ★★**色は帯から引き継ぐ** ―― 上でその色だったものが、下りても同じ色のまま
//   形だけ変わる（タスク＝タグの色／提案＝そのカードの色）。
// ★大きさ＝**重要度 × 締切の近さ**（既存の `areaOf`。GRAVITY と同じ式）。

// ── 物理（★`GravityTab` と同じ値。目盛りの外＝物理の場） ──────────────
const GRAVITY_Y = 1.4;
const UNIT = 64;
const MASS_K = 1.6;
const BODY = { restitution: 0.04, friction: 0.55, frictionStatic: 0.9, frictionAir: 0.012 };
const WALL_T = 200;
/** 掴むまでの長押し。★`GravityTab` と同じ（動かすとスワイプ扱い）。 */
const HOLD_MS = 150;
const TAP_MOVE = 8;
/** 掴んだ図形が指へ寄る強さと、離れてよい上限。★同上。 */
const GRAB_K = 0.34;
const GRAB_MAX = 34;
/** 山が器に占める割合。★目盛りの外（詰め込み具合）。 */
const FILL = 0.42;
/** 未読のトゲトゲの円。★12頂点・内半径 0.40（`docs/home-spec.md` §5-b）。 */
const ZIG_N = 12;
const ZIG_IN = 0.4;
const BADGE_R = 26;
/** 傾き 3〜6°。★0°だと格子になって「積もった」に見えず、10°超は漫画になる。 */
const TILT_MIN = (3 * Math.PI) / 180;
const TILT_MAX = (6 * Math.PI) / 180;

const frac = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (Math.imul(h, 2654435761) >>> 0) / 4294967296;
};
const tiltOf = (seed: string) =>
  (frac(seed) < 0.5 ? -1 : 1) * (TILT_MIN + frac(`${seed}!`) * (TILT_MAX - TILT_MIN));

interface Piece {
  id: string;
  body: Body;
  kind: "task" | "offer" | "badge";
  /** 角丸の四角の外接箱（タスク）。円は `r`。 */
  w?: number; h?: number; r?: number;
  face: string;
  ink: string;
  title?: string;
  face_?: number;      // 書体の番号（タグが決める）
  photo?: string;
  count?: number;
}

/**
 * ★★★**タスクの図形は1枚に焼いてから貼る**。`paperize`（紙の目）は canvas 全面を
 * 合成し直すので、**画面の canvas に毎フレーム掛けてはいけない**（そう書いてある）。
 * 焼いた絵は body.angle で回して貼るだけ ―― 2D の回転しかしないので厳密に正しい。
 */
const bakeCache = new Map<string, HTMLCanvasElement>();
function taskBitmap(p: Piece, dpr: number): HTMLCanvasElement | undefined {
  if (!p.w || !p.h || p.face_ === undefined || !p.title) return undefined;
  const key = [p.id, Math.round(p.w), Math.round(p.h), p.face, p.title, dpr.toFixed(2)].join("|");
  const hit = bakeCache.get(key);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = Math.max(2, Math.round(p.w * dpr));
  cv.height = Math.max(2, Math.round(p.h * dpr));
  const ctx = cv.getContext("2d");
  if (!ctx) return undefined;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = Math.min(RADIUS.lg, p.w / 2, p.h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(0, 0, p.w, p.h, r);
  else ctx.rect(0, 0, p.w, p.h);
  ctx.closePath();
  ctx.fillStyle = p.face;
  ctx.fill();
  // ★紙の目。★色のすぐ上・文字の下（`design.md` §3-b）。
  paperize(ctx, p.w, p.h, dpr, key);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(0, 0, p.w, p.h, r);
  else ctx.rect(0, 0, p.w, p.h);
  ctx.clip();
  ensureGlyphs(p.face_, p.title);
  const fit = fitText(p.title, p.face_, p.w * 0.82, p.h * 0.7, 3);
  if (fit) drawFitted(ctx, fit, p.face_, p.w / 2, p.h / 2, p.ink, fit.size * dpr);
  ctx.restore();
  if (bakeCache.size > 80) bakeCache.clear();
  bakeCache.set(key, cv);
  return cv;
}

/** 写真は1度だけ読み込んで使い回す。★読み終わるまでは色ベタの円。 */
const photoCache = new Map<string, HTMLImageElement>();
function photoOf(url: string, onLoad: () => void): HTMLImageElement | undefined {
  const hit = photoCache.get(url);
  if (hit) return hit.complete && hit.naturalWidth > 0 ? hit : undefined;
  const el = new Image();
  el.crossOrigin = "anonymous";
  el.onload = onLoad;
  el.src = img(url, 240, 240);
  photoCache.set(url, el);
  return undefined;
}

export function Pile({ tasks, offers, unread, today, onComplete, onDelete }: {
  tasks: Task[];
  offers: Item[];
  unread: number;
  today: Date;
  onComplete: (p: { kind: "task" | "offer"; id: string }) => void;
  onDelete: (p: { kind: "task" | "offer"; id: string }) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const piecesRef = useRef<Piece[]>([]);
  const matterRef = useRef<typeof import("matter-js") | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [holding, setHolding] = useState(false);
  const dragRef = useRef<{ piece: Piece; x: number; y: number } | null>(null);

  // ★器の寸法は**測ってから**使う（iOS は起動直後やツールバーの伸縮で変わる）。
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => {
      const w = box.clientWidth; const h = box.clientHeight;
      setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const redraw = useCallback(() => { /* 次のフレームで拾う */ }, []);

  useEffect(() => {
    const cv = cvRef.current;
    const { w, h } = size;
    if (!cv || w <= 0 || h <= 0) return;
    let stop = false;

    (async () => {
      const M = (await import("matter-js")).default ?? (await import("matter-js"));
      if (stop) return;
      matterRef.current = M;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      const ctx = cv.getContext("2d");
      if (!ctx) return;

      const engine = M.Engine.create({ enableSleeping: true });
      engine.gravity.y = GRAVITY_Y;
      engineRef.current = engine;
      M.Composite.add(engine.world, [
        M.Bodies.rectangle(w / 2, h + WALL_T / 2, w + WALL_T * 2, WALL_T, { isStatic: true, friction: 0.6 }),
        M.Bodies.rectangle(-WALL_T / 2, h / 2, WALL_T, h * 3, { isStatic: true, friction: 0.4 }),
        M.Bodies.rectangle(w + WALL_T / 2, h / 2, WALL_T, h * 3, { isStatic: true, friction: 0.4 }),
      ]);

      // ★★山に収まるよう**一括で**縮める。1つずつ縮めない ―― 図形どうしの
      //   大きさの比がそのまま重要度なので、比を保ったまま全体を縮める。
      const areas = [
        ...tasks.map((t) => areaOf(t, today)),
        ...offers.map(() => weightArea(2)),
      ];
      const total = areas.reduce((a, b) => a + b, 0) || 1;
      const unit = Math.max(16, Math.min(UNIT, Math.sqrt((w * h * FILL) / total)));

      const pieces: Piece[] = [];
      const drop = (i: number) => -80 - i * 60;   // ★上から順に落ちてくる

      tasks.forEach((t, i) => {
        const spec = specOf(t, today);
        const tag = resolveTag(t.tag, t.id, t.title, t.context, t.belongings);
        const pw = Math.max(28, spec.w * unit);
        const ph = Math.max(24, spec.h * unit);
        const x = Math.min(w - pw / 2, Math.max(pw / 2, w * (0.12 + frac(t.id) * 0.76)));
        const body = M.Bodies.rectangle(x, drop(i), pw, ph, { ...BODY, angle: tiltOf(t.id) });
        M.Body.setMass(body, spec.area * MASS_K);
        // ★★★**転がらせない**（`inertia` を無限に）。自由に回る物体は積まれる
        //   うちに 60°まで倒れ、戻そうとすると衝突の解決と綱引きになって固まる。
        //   回転を止めれば最初に与えた 3〜6°が最後まで残る ―― 紙が少しずつ
        //   ずれて積まれた見た目そのもの。★落下と横滑りはそのまま効く。
        M.Body.setInertia(body, Infinity);
        pieces.push({
          id: t.id, body, kind: "task", w: pw, h: ph,
          face: tagColor(tag), ink: tagInk(tag), title: t.title, face_: tagFace(tag),
        });
      });

      offers.forEach((it, i) => {
        // ★提案は重さを持たないので、**重要度は「中」**として置く。
        const r = Math.max(22, Math.sqrt((weightArea(2) * unit * unit) / Math.PI));
        const x = Math.min(w - r, Math.max(r, w * (0.18 + frac(it.id) * 0.64)));
        const body = M.Bodies.circle(x, drop(tasks.length + i), r, BODY);
        M.Body.setMass(body, weightArea(2) * MASS_K);
        pieces.push({
          id: it.id, body, kind: "offer", r,
          face: it.color ?? colorOfKind(it.kind), ink: PAPER,
          photo: it.images?.[0], title: it.title,
        });
      });

      if (unread > 0) {
        const body = M.Bodies.circle(w * 0.5, drop(tasks.length + offers.length), BADGE_R, BODY);
        pieces.push({ id: "unread", body, kind: "badge", r: BADGE_R, face: RUST, ink: PAPER, count: unread });
      }

      M.Composite.add(engine.world, pieces.map((p) => p.body));
      piecesRef.current = pieces;

      // ★大きな英語（今日の曜日）。★**版面の柱**なので物理に参加しない。
      //   **画面に1つだけ**の大きな英語で、色は墨（ユーザー確定）。
      const word = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][today.getDay()];
      // ★★**段から選ばず、版面の幅に合わせて組む** ―― 大きさを固定すると
      //   SUNDAY と WEDNESDAY で柱の太さが変わる。★目盛りの外（幾何から決まる）。
      ctx.font = canvasFont(900, SWISS_XL, LATIN);
      const wordFs = SWISS_XL * (w / Math.max(1, ctx.measureText(word).width));

      const roundRect = (x: number, y: number, bw: number, bh: number) => {
        const r = Math.min(RADIUS.lg, bw / 2, bh / 2);
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, bw, bh, r);
        else ctx.rect(x, y, bw, bh);
        ctx.closePath();
      };

      const draw = () => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        // 版面の柱。★山の後ろ、地の上。
        ctx.save();
        ctx.font = canvasFont(900, wordFs, LATIN);
        ctx.fillStyle = INK;
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        ctx.fillText(word, 0, h);
        ctx.restore();

        for (const p of piecesRef.current) {
          const b = p.body;
          ctx.save();
          ctx.translate(b.position.x, b.position.y);
          ctx.rotate(b.angle);
          ctx.fillStyle = p.face;

          if (p.kind === "task" && p.w && p.h) {
            const bmp = taskBitmap(p, dpr);
            if (bmp) ctx.drawImage(bmp, -p.w / 2, -p.h / 2, p.w, p.h);
            else { roundRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.fill(); }
          } else if (p.kind === "offer" && p.r) {
            ctx.beginPath();
            ctx.arc(0, 0, p.r, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fill();
            const im = p.photo ? photoOf(p.photo, redraw) : undefined;
            if (im) {
              ctx.save();
              ctx.clip();
              const s = Math.max((p.r * 2) / im.naturalWidth, (p.r * 2) / im.naturalHeight);
              const iw = im.naturalWidth * s; const ih = im.naturalHeight * s;
              ctx.drawImage(im, -iw / 2, -ih / 2, iw, ih);
              ctx.restore();
            }
          } else if (p.kind === "badge" && p.r) {
            ctx.beginPath();
            for (let i = 0; i < ZIG_N * 2; i++) {
              const a = (i / (ZIG_N * 2)) * Math.PI * 2 - Math.PI / 2;
              const rr = p.r * (i % 2 === 0 ? 1 : ZIG_IN + 0.5);
              const x = Math.cos(a) * rr; const y = Math.sin(a) * rr;
              if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = p.ink;
            ctx.font = canvasFont(900, p.r * 0.9, LATIN);
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(String(p.count ?? 0), 0, 0);
          }
          ctx.restore();
        }
      };

      let last = performance.now();
      const loop = () => {
        if (stop) return;
        const now = performance.now();
        M.Engine.update(engine, Math.min(32, now - last));
        last = now;
        // 掴んでいる図形は、指の方へバネで寄せる（`GravityTab` と同じ作法）。
        const d = dragRef.current;
        if (d) {
          const b = d.piece.body;
          const dx = d.x - b.position.x; const dy = d.y - b.position.y;
          const k = Math.min(1, GRAB_MAX / (Math.hypot(dx, dy) || 1));
          M.Body.setVelocity(b, { x: dx * GRAB_K * k, y: dy * GRAB_K * k });
        }
        draw();
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      stop = true;
      cancelAnimationFrame(rafRef.current);
      piecesRef.current = [];
      engineRef.current = null;
    };
  }, [tasks, offers, unread, today, size, redraw]);

  // ── 掴む・完了・削除 ────────────────────────────────────────
  const pickAt = (cx: number, cy: number): Piece | null => {
    const box = boxRef.current;
    const M = matterRef.current;
    if (!box || !M) return null;
    const r = box.getBoundingClientRect();
    const pt = { x: cx - r.left, y: cy - r.top };
    for (let i = piecesRef.current.length - 1; i >= 0; i--) {
      const p = piecesRef.current[i];
      if (M.Bounds.contains(p.body.bounds, pt) && M.Vertices.contains(p.body.vertices, pt)) return p;
    }
    return null;
  };

  const press = useRef<{ id: number; x: number; y: number; timer: number } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    if (press.current) return;
    const timer = window.setTimeout(() => {
      const p = pickAt(e.clientX, e.clientY);
      if (!p || p.kind === "badge") return;         // ★バッジは掴めない（数だけの図形）
      const box = boxRef.current!.getBoundingClientRect();
      dragRef.current = { piece: p, x: e.clientX - box.left, y: e.clientY - box.top };
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
    const box = boxRef.current!.getBoundingClientRect();
    dragRef.current.x = e.clientX - box.left;
    dragRef.current.y = e.clientY - box.top;
    aimRef.current?.(e.clientX, e.clientY);
  };

  const onUp = (e: React.PointerEvent) => {
    const pr = press.current;
    if (pr) window.clearTimeout(pr.timer);
    press.current = null;
    const d = dragRef.current;
    dragRef.current = null;
    setHolding(false);
    if (!d) return;
    const hit = dropRef.current?.(e.clientX, e.clientY);
    if (hit === "mouth") onComplete({ kind: d.piece.kind as "task" | "offer", id: d.piece.id });
    else if (hit === "trash") onDelete({ kind: d.piece.kind as "task" | "offer", id: d.piece.id });
  };

  /** 的の当たり判定は器（`HomeTab`）が持つ。ここは呼ぶだけ。 */
  const aimRef = useRef<((x: number, y: number) => void) | null>(null);
  const dropRef = useRef<((x: number, y: number) => "mouth" | "trash" | null) | null>(null);

  return (
    <div
      ref={boxRef}
      data-pile
      style={{ position: "relative", flex: 1, minHeight: 0, touchAction: holding ? "none" : "pan-x" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <canvas ref={cvRef} style={{ position: "absolute", inset: 0, display: "block" }} />
      <PileTargets holding={holding} aimRef={aimRef} dropRef={dropRef} />
    </div>
  );
}

/** 掴んでいるあいだだけ出る「口＝完了」と「ゴミ箱＝削除」。★既存の共通部品。 */
function PileTargets({ holding, aimRef, dropRef }: {
  holding: boolean;
  aimRef: React.MutableRefObject<((x: number, y: number) => void) | null>;
  dropRef: React.MutableRefObject<((x: number, y: number) => "mouth" | "trash" | null) | null>;
}) {
  const mouthRef = useRef<HTMLDivElement>(null);
  const trashRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<"mouth" | "trash" | null>(null);

  useEffect(() => {
    aimRef.current = (x, y) => setHover(aimTargets(mouthRef.current, trashRef.current, x, y));
    dropRef.current = (x, y) => {
      const t = targetAt(mouthRef.current, trashRef.current, x, y);
      if (t === "mouth") fireTarget(mouthRef.current);
      if (t === "trash") fireTarget(trashRef.current);
      return t;
    };
    return () => { aimRef.current = null; dropRef.current = null; };
  }, [aimRef, dropRef]);

  return <DropTargets show={holding} hover={hover} mouthRef={mouthRef} trashRef={trashRef} />;
}
