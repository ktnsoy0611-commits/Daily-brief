"use client";

import { useEffect, useRef, useState } from "react";
import { HOME_WORD, LATIN, SCHEME, SWISS_XL } from "@/lib/constants";
import { bodyInkOn } from "@/lib/palette";
import { rectOf } from "@/lib/solid";
import { UNIT_PX, shapeGlyphsReady, solidBitmap, warmShapeGlyphs, type SolidPaint } from "@/lib/solidPaint";
import { areaOf, massOf, specOf } from "@/lib/taskSize";
import { canvasFont } from "@/lib/textFit";
import { resolveTag } from "@/lib/taskTags";
import { ms, T_STEP } from "@/lib/motion";
import type { Body, Engine } from "matter-js";
import type { Task } from "@/lib/types";

// ★★★**山**（2026-09-07・`docs/home-spec.md` §5）。
//
// > 上の帯 ＝ まだ自分の時間を割り当てていないもの
// > **下の山 ＝ 自分の時間を使うと決めたもの**
//
// ★★**山にいるものは全部「今日」**（2026-09-07 ユーザー確定「ホームには今日だけ
//   表示すれば良い」）。だから山は説明が要らない ―― 日付のラベルも、レーンも無い。
// ★★**形はジャンルの札で、意味づけはしない**（§5-b）。
//   ・**角丸の四角** … タスク。**文字が組める唯一の形**で、1件が1つ。
//   ・**ギザギザの円** … 未読の提案の枚数。**1画面に1つだけ**。0 になると消える。
//   ・**大きな英語** … 今日の曜日。★**図形ではない。版面の柱**なので物理に参加しない。
// ★★**大きさ＝重要度 × 締切の近さ**（既存の `areaOf` のまま。2026-09-07 に維持を確定）。
// ★★**傾きは 3〜6°だけ** ―― 0°だと格子になって「積もった」に見えず、
//   10°を超えると漫画になる。
//
// ★物理は matter.js。`GravityTab` と同じ語彙（重力・摩擦・跳ね）を使うが、
//   モード（ALIGN / TIMELINE）もカメラも持たない ―― ホームの山は**見るだけ**。

/** ★目盛りの外（物理の場）。`GravityTab` の値をそのまま使う。 */
const GRAVITY_Y = 1.4;
const WALL_T = 200;
/** ★目盛りの外（傾きの範囲。`docs/home-spec.md` §5-c）。 */
const TILT_MIN = (3 * Math.PI) / 180;
const TILT_MAX = (6 * Math.PI) / 180;
/** ★目盛りの外（未読のギザギザの円 … 12頂点・内半径 0.40）。 */
const ZIG_N = 12;
const ZIG_IN = 0.40;
/** ★目盛りの外（未読のバッジの直径は、いちばん小さいタスクと同じくらいに置く）。 */
const BADGE_R = 26;

const frac = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (Math.imul(h, 2654435761) >>> 0) / 4294967296;
};

/** ★その図形の傾き。**3〜6°の中だけ**で、左右どちらへ倒すかを id から決める。 */
function tiltOf(seed: string): number {
  const a = frac(seed);
  const b = frac(`${seed}!`);
  return (a < 0.5 ? -1 : 1) * (TILT_MIN + b * (TILT_MAX - TILT_MIN));
}

interface Piece { body: Body; paint?: SolidPaint; badge?: number; ox: number; oy: number }

export function Pile({ tasks, unread, today }: { tasks: Task[]; unread: number; today: Date }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const piecesRef = useRef<Piece[]>([]);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef(0);
  // ★器の寸法。iOS は起動直後やツールバーの伸縮で高さが変わるので、**測ってから**
  //   作る（`clientHeight` を1回読んだだけでは、変わったあとの床が古いままになる）。
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => {
      const w = box.clientWidth; const h = box.clientHeight;
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const box = boxRef.current; const cv = cvRef.current;
    if (!box || !cv) return;
    let stop = false;
    let M: typeof import("matter-js");

    (async () => {
      M = (await import("matter-js")).default ?? (await import("matter-js"));
      if (stop) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const { w, h } = size;
      if (w <= 0 || h <= 0) return;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      const ctx = cv.getContext("2d");
      if (!ctx) return;

      const engine = M.Engine.create({ enableSleeping: true });
      engine.gravity.y = GRAVITY_Y;
      engineRef.current = engine;

      // 器（床と左右の壁）。★山は器の中だけで完結する。
      M.Composite.add(engine.world, [
        M.Bodies.rectangle(w / 2, h + WALL_T / 2, w + WALL_T * 2, WALL_T, { isStatic: true, friction: 0.6 }),
        M.Bodies.rectangle(-WALL_T / 2, h / 2, WALL_T, h * 3, { isStatic: true, friction: 0.4 }),
        M.Bodies.rectangle(w + WALL_T / 2, h / 2, WALL_T, h * 3, { isStatic: true, friction: 0.4 }),
      ]);

      // ★山に収まる大きさへ一括で縮める。**1つずつ縮めない** ―― 相対の大きさが
      //   重要度そのものなので、比を保ったまま全体を縮める。
      const areas = tasks.map((t) => areaOf(t, today));
      const total = areas.reduce((a, b) => a + b, 0) || 1;
      // ★目盛りの外（詰め込み具合。器の面積の 42% を図形が占めるところまで）。
      const unit = Math.max(18, Math.min(UNIT_PX, Math.sqrt((w * h * 0.42) / total)));

      const pieces: Piece[] = [];
      tasks.forEach((t, i) => {
        const spec = specOf(t, today);
        const paint: SolidPaint = {
          spec, view: "name", title: t.title,
          tag: resolveTag(t.tag, t.id, t.title, t.context, t.belongings),
        };
        const { w: bw, h: bh } = rectOf(spec);
        const pw = bw * unit; const ph = bh * unit;
        const r = frac(t.id);
        const x = Math.min(w - pw / 2, Math.max(pw / 2, w * (0.12 + r * 0.76)));
        // ★★朝ひらいたとき、その日のものが**上から落ちてきて山になる**（§12-b #13）。
        const y = -ph / 2 - i * (ms(T_STEP) / 2);
        const body = M.Bodies.rectangle(x, y, pw, ph, {
          restitution: 0.04, friction: 0.55, frictionStatic: 0.9, frictionAir: 0.012,
          angle: tiltOf(t.id),
        });
        M.Body.setMass(body, massOf(spec));
        // ★★★**転がらせない**（2026-09-07）。仕様は「傾きは 3〜6°だけ」だが、
        //   自由に回る物体は積まれるうちに 60°まで倒れ、**戻そうとすると
        //   衝突の解決と綱引きになって固まる**（実際にそうなった）。
        //   回転を止めれば、最初に与えた 3〜6°が最後まで残る ―― 紙が少しずつ
        //   ずれて積まれた見た目そのもの。★横滑りと落下はそのまま効く。
        M.Body.setInertia(body, Infinity);
        pieces.push({ body, paint, ox: 0, oy: 0 });
      });

      if (unread > 0) {
        // ★未読の提案の枚数。**色を持つ数少ない図形**（§2-c）。
        const body = M.Bodies.circle(w * 0.5, -BADGE_R * 4, BADGE_R, {
          restitution: 0.04, friction: 0.55, frictionAir: 0.012,
        });
        pieces.push({ body, badge: unread, ox: 0, oy: 0 });
      }

      M.Composite.add(engine.world, pieces.map((p) => p.body));
      piecesRef.current = pieces;

      // ★大きな英語（曜日）。★**版面の柱**なので物理に参加せず、山の後ろに置く。
      const word = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][today.getDay()];
      // ★★★**段から選ばず、版面の幅に合わせて組む**（`design.md` §1・第81巡の
      //   `FitLine` と同じ理屈）。大きさを固定すると **SUNDAY と WEDNESDAY で
      //   柱の太さが変わる** ―― 曜日ごとに版面の重心が動いてしまう。
      //   幅は文字サイズに比例するので、1回測れば次の大きさが直接出る。
      //   ★この1行は目盛りの外（大きさが幾何から決まるため）。
      ctx.font = canvasFont(900, SWISS_XL, LATIN);
      const wordFs = SWISS_XL * (w / Math.max(1, ctx.measureText(word).width));

      const draw = () => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        // 版面の柱。★地より少し濃い灰なので、図形の下から支える帯として読める。
        ctx.save();
        ctx.font = canvasFont(900, wordFs, LATIN);
        ctx.fillStyle = HOME_WORD;
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        ctx.fillText(word, 0, h);
        ctx.restore();

        for (const p of piecesRef.current) {
          const b = p.body;
          ctx.save();
          ctx.translate(b.position.x, b.position.y);
          ctx.rotate(b.angle);
          if (p.badge !== undefined) {
            // ギザギザの円。★頂点は 12（内半径 0.40）。
            ctx.beginPath();
            for (let i = 0; i < ZIG_N * 2; i++) {
              const a = (i / (ZIG_N * 2)) * Math.PI * 2 - Math.PI / 2;
              const rr = BADGE_R * (i % 2 === 0 ? 1 : ZIG_IN + 0.5);
              const x = Math.cos(a) * rr; const y = Math.sin(a) * rr;
              if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fillStyle = SCHEME.danger;
            ctx.fill();
            ctx.fillStyle = bodyInkOn(SCHEME.danger);
            ctx.font = canvasFont(900, BADGE_R * 0.9, LATIN);
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(String(p.badge), 0, 0);
          } else if (p.paint) {
            const ready = shapeGlyphsReady(p.paint, unit, dpr);
            if (!ready) warmShapeGlyphs(p.paint, 1, unit, dpr);
            const bmp = solidBitmap(p.paint, unit, dpr);
            ctx.drawImage(bmp.canvas, -bmp.w / 2, -bmp.h / 2, bmp.w, bmp.h);
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
    // ★★寸法が変わったら**落とし直す**（山は表に出るたびに違う並びになる、と
    //   同じ考え方）。古い床のまま図形だけ残ると、画面の外へ抜けてしまう。
  }, [tasks, unread, today, size]);

  return (
    <div ref={boxRef} style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <canvas ref={cvRef} style={{ position: "absolute", inset: 0, display: "block" }} />
    </div>
  );
}
