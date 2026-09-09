"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BAND_BEZEL, INK, LATIN, PAPER, RUST, SANS } from "@/lib/constants";
import { img } from "@/lib/helpers";
import { bodyInkOn, colorOfKind } from "@/lib/palette";
import { glyphOfKind } from "@/lib/deckStyle";
import { areaOf, specOf, weightArea } from "@/lib/taskSize";
import { resolveTag, tagColor, tagFace, tagInk } from "@/lib/taskTags";
import { canvasFont, drawFitted, ensureGlyphs, fitText } from "@/lib/textFit";
import { paperize } from "@/lib/paperTexture";
import { RADIUS, TRACK, WEIGHT } from "@/lib/tokens";

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
/** ★指の太さぶんの余裕（当たり判定を外へ広げる）。★目盛りの外（触りごこち）。 */
const TOUCH_SLOP = 10;
/** 掴んだ図形が指へ寄る強さと、離れてよい上限。★同上。 */
const GRAB_K = 0.34;
const GRAB_MAX = 34;
/** 山が器に占める割合。★目盛りの外（詰め込み具合）。0.42 → 0.30 → **0.22**。
 *  ★★**帯が厚いほど山の取り分が減る**ので、帯の厚み（`BAND_H`）とセットで決める。
 *  ★2026-09-09 に 0.22 → **0.28**（ユーザー指定「タスクはもう少し大きく」）。 */
const FILL = 0.28;
/** ★★**1つの図形が器に対して取ってよい上限**（`GravityTab` の `FIT_W`/`FIT_H` と
 *  同じ考え方）。面積の予算だけだと、重要度の高い1枚が器の半分を覆ってしまう
 *  ―― 実機で「大きすぎるやつがある」と言われたのがこれ。 */
const FIT_W = 0.68;
const FIT_H = 0.38;
/** ★提案の円の大きさ。**いちばん重いタスク × これ**（2026-09-08 に 1 → 1.6）。 */
const OFFER_K = 1.6;
/** 未読のトゲトゲの円。★12頂点・内半径 0.40（`docs/home-spec.md` §5-b）。 */
const ZIG_N = 12;
const ZIG_IN = 0.4;
/** ★未読の数の図形。**数字を読ませる図形**なので、タスクより大きく取る。 */
const BADGE_R = 44;
/** ★★★落とし方は `GravityTab` と**同じ**（傾き・回り・横の初速）。
 *  「傾きは 3〜6°」「回さない」は**やめた**（2026-09-07 ユーザー指定
 *  「回転しても良いです。普通に落としてください」）―― 回転を止めると
 *  角度が変わらないまま降りてきて、物体に見えない。
 *  ★★★2026-09-09 に**回り慣性の細工を全部やめた**（ユーザー指定「ひっくり返っても
 *  なんでもいいので自然に落としてください」）。`setInertia` で回りにくくしたり、
 *  背丈で回りの強さを割ったりすると、**質量と形から決まる本来の慣性と食い違う**
 *  ―― 落ちるあいだは重そうなのに、ぶつかった瞬間だけ勝手に向きが戻る、という
 *  物体に見えない動きになっていた。**形が決めた慣性のまま落とすのが自然。** */
const SPAWN_TILT = 0.5;      // 初期の傾き（±0.25 rad ≒ ±14°）
const SPAWN_SPIN = 0.05;     // 初期の回り
const SPAWN_VX = 1.2;        // 横の初速
/** 山の左右の余白。★`GravityTab` の `PILE_INSET` と同じ考え方（壁と出どころを揃える）。 */
const INSET = 16;
/** 文字の板（曜日・日付）の縁。★`GravityTab` の `PILE_WORD_PAD` と同じ。 */
const WORD_PAD = 4;
const WORD_PAD_Y = 2;
/** 文字の板が使ってよい幅の割合。★2026-09-09 に 0.48 → **0.66**（もっと大きく）。 */
const WORD_W = 0.66;
/** ★★**字の幅**（Archivo の可変の軸）。既定は画面ぜんぶが 88 だが、
 *  この板だけ **62（いちばん縦長）**にする（ユーザー指定「縦長で…もっと太い」）。
 *  ★太さと縦長は別の軸 ―― 太さ 900 のまま幅だけ絞ると、線は太いのに姿は縦長になる。 */
const WORD_WDTH = 62;
/** ★★**行間を詰める**。2行を1つの塊として読ませるので、行間は字面より狭く取る。 */
const WORD_LEAD = 0.82;
/** 測るときの基準の大きさ。★幅は文字サイズに比例するので、1回測れば次が直接出る。 */
const WORD_BASE = 100;

const frac = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (Math.imul(h, 2654435761) >>> 0) / 4294967296;
};

interface Piece {
  id: string;
  body: Body;
  kind: "task" | "offer" | "badge" | "word";
  /** 角丸の四角の外接箱（タスク）。円は `r`。 */
  w?: number; h?: number; r?: number;
  face: string;
  ink: string;
  title?: string;
  face_?: number;      // 書体の番号（タグが決める）
  photo?: string;
  /** ★写真が無い提案の顔（「展」「場」）。 */
  glyph?: string;
  count?: number;
  /** 文字の板（日付・曜日）だけが持つ。 */
  wordFs?: number;
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

/**
 * ★★**日付と曜日の組み方はここ1つ**（測るときと描くときで必ず同じにする）。
 * Archivo の 900。★幅の軸は画面のほかの英語と同じ `wdth 88`。
 * ★字間は大きな欧文の規則どおり `tight`（`design.md` §1）。
 */
const wordStyle = (fs: number): React.CSSProperties => ({
  fontFamily: LATIN, fontSize: fs, fontWeight: WEIGHT.black,
  letterSpacing: TRACK.tight, lineHeight: WORD_LEAD,
  fontVariationSettings: `"wdth" ${WORD_WDTH}`,
  whiteSpace: "pre",          // ★2行を改行で持つ（\n をそのまま効かせる）
});

/** ★組んだ字の箱を**実測**する。canvas では幅の軸が効かないので DOM で測る。 */
function measureWord(text: string, fs: number): { w: number; h: number } {
  const el = document.createElement("span");
  Object.assign(el.style, {
    position: "absolute", visibility: "hidden",
    left: "0", top: "0",
  } as CSSStyleDeclaration);
  const st = wordStyle(fs);
  el.style.fontFamily = String(st.fontFamily);
  el.style.fontSize = `${fs}px`;
  el.style.fontWeight = String(st.fontWeight);
  el.style.letterSpacing = String(st.letterSpacing);
  el.style.lineHeight = String(st.lineHeight);
  el.style.setProperty("font-variation-settings", `"wdth" ${WORD_WDTH}`);
  el.style.whiteSpace = "pre";
  el.textContent = text;
  document.body.appendChild(el);
  const r = el.getBoundingClientRect();
  el.remove();
  return { w: r.width, h: r.height };
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

export function Pile({ tasks, offers, unread, today }: {
  tasks: Task[];
  offers: Item[];
  unread: number;
  today: Date;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const piecesRef = useRef<Piece[]>([]);
  const matterRef = useRef<typeof import("matter-js") | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** 落ちてくる文字の板（日付・曜日）。★字は DOM の幾何アルファベットで描く。 */
  const [words, setWords] = useState<{ id: string; text: string; size: number }[]>([]);
  const wordEls = useRef(new Map<string, HTMLDivElement>());
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
      // ★★★**書体が届くまで待つ**（2026-09-09）。日付の板は**実際に組んだ字を
      //   測って**大きさを決めるので、Archivo が届く前に測ると**代替の書体の幅**で
      //   決まってしまい、板が小さいまま出る（実測 155px／狙いは 236px）。
      await document.fonts?.ready;
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
        ...offers.map(() => weightArea(3) * OFFER_K),
      ];
      const total = areas.reduce((a, b) => a + b, 0) || 1;
      let unit = Math.max(16, Math.min(UNIT, Math.sqrt((w * h * FILL) / total)));
      // ★★いちばん大きな図形が器からはみ出さないところまで、**全体を**縮める。
      //   1枚だけ縮めない ―― 図形どうしの大きさの比がそのまま重要度なので。
      for (const t of tasks) {
        const sp = specOf(t, today);
        unit = Math.min(unit, (w * FIT_W) / Math.max(1, sp.w), (h * FIT_H) / Math.max(1, sp.h));
      }
      unit = Math.max(14, unit);

      const pieces: Piece[] = [];
      // ★★落とし方は `GravityTab` と同じ ―― **どこへ・どの高さから落ちるか**で
      //   ばらつきを作り、傾きと回りは控えめに添える。
      const spawnX = (bw: number, r1: number) => {
        const half = bw / 2;
        const lo = INSET + half + 4;
        const hi = Math.max(lo, w - INSET - half - 4);
        return Math.min(hi, Math.max(lo, INSET + (w - INSET * 2) * (0.08 + r1 * 0.84)));
      };
      // ★★★**落とす高さは「それまでに積んだぶん」を足していく**（2026-09-07）。
      //   一定の間隔で並べると、大きい図形どうしが**落ちている途中でぶつかって
      //   回り**、逆さまに積まれて名前が読めなくなった。自分の背丈ぶん空ければ、
      //   ぶつかるのは着地してからになる。
      let stack = 0;
      const toss = (body: Body, seed: string, bh: number) => {
        const r1 = frac(seed); const r2 = frac(`${seed}y`); const r3 = frac(`${seed}a`);
        stack += bh + 60 + r2 * 60;
        M.Body.setPosition(body, { x: spawnX(body.bounds.max.x - body.bounds.min.x, r1), y: -stack });
        M.Body.setAngle(body, (r3 - 0.5) * SPAWN_TILT);
        // ★★**回りは形の大小で加減しない**（2026-09-09）。大きさで割ると、小さい
        //   ものだけ空中で止まって見える。同じ初速を与えて、あとは形が決めた
        //   慣性に任せる ―― ひっくり返るなら、それが自然な落ち方。
        M.Body.setAngularVelocity(body, (r3 - 0.5) * SPAWN_SPIN);
        M.Body.setVelocity(body, { x: (r1 - 0.5) * SPAWN_VX, y: 0 });
      };

      // ★★★**その日の日付と曜日も一緒に落とす**（2026-09-07 ユーザー指定。
      //   `GravityTab` と同じ ―― 枠の無い、文字だけの黒い板）。
      // ★★★**字は Archivo の 900**（2026-09-08 ユーザー指定「ボールドの太くて
      //   美しいフォント」）。★canvas ではなく **DOM** で描くのが要点 ――
      //   canvas の `ctx.font` には `font-variation-settings` が乗らないので、
      //   Archivo が**素の幅（wdth 100）**で出て、画面のほかの英語（`wdth 88`）と
      //   字の太り方が食い違う。DOM なら幅の軸がそのまま効く。
      //   ★★これで日付を `9/8` と書ける（幾何アルファベットは A-Z と 0-9 しか
      //   持たないので `SEP08` にしていた）。
      // ★★★**板は1枚**（2026-09-09 ユーザー指定「もっと大きく、縦長で行間を詰めて」）。
      //   2枚に分けると、行間は**2つの板の隙間**になるので詰められない ――
      //   物理が決めてしまう。1枚の中の2行にすれば `WORD_LEAD` で詰められ、
      //   落ちるときも日付と曜日が離れ離れにならない。
      // ★短い行（日付）を上・長い行（曜日）を下に置く ―― 左揃えの2行は、
      //   下が長いほうが塊として安定して見える。
      const wd = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][today.getDay()];
      const word = `${today.getMonth() + 1}/${today.getDate()}\n${wd}`;
      // ★★大きさは**実際に組んだ字を測って**決める（`measureWord`）。器の `WORD_W`
      //   に**長いほうの行**が収まる大きさを出す。
      const base = measureWord(word, WORD_BASE);
      const wordFs = Math.max(18, (WORD_BASE * w * WORD_W) / Math.max(1, base.w));
      {
        const m = measureWord(word, wordFs);
        const bw = Math.max(8, m.w + WORD_PAD * 2);
        const bh = Math.max(8, m.h + WORD_PAD_Y * 2);
        const body = M.Bodies.rectangle(0, 0, bw, bh, BODY);
        // ★★2行になって板が**背の高い塊**になったので、薄い板のときのような
        //   細工（回り慣性を 20 倍）は要らない ―― 形が決めた慣性のまま落とす。
        // ★★★**いちばん先に落とす**（2026-09-09）。最後に落とすと、板は山の
        //   **凸凹の上**へ着地して 59° 傾いた（実測。3回とも同じ）。日付は読ませる
        //   字なので、**平らな床の上**に先に置き、図形をその上に積む。
        //   ★板は canvas の上の DOM なので、**上に積まれても字は隠れない**
        //   ―― 物理では山の底、絵では山の手前。
        // ★初速の回りは与えない（傾くのは着地の弾みぶんだけ）。
        toss(body, "word", bh);
        M.Body.setAngle(body, (frac("worda") - 0.5) * 0.16);
        M.Body.setAngularVelocity(body, 0);
        pieces.push({
          id: "word", body, kind: "word", w: bw, h: bh,
          face: INK, ink: INK, title: word, wordFs,
        });
        setWords([{ id: "word", text: word, size: wordFs }]);
      }

      tasks.forEach((t) => {
        const spec = specOf(t, today);
        const tag = resolveTag(t.tag, t.id, t.title, t.context, t.belongings);
        const pw = Math.max(28, spec.w * unit);
        const ph = Math.max(24, spec.h * unit);
        const body = M.Bodies.rectangle(0, 0, pw, ph, BODY);
        // ★★★**質量だけ与えて、回り慣性は触らない**（2026-09-09）。`setMass` は
        //   慣性も一緒に比例させるので、形と重さから正しい回りにくさが出る。
        M.Body.setMass(body, spec.area * MASS_K);
        toss(body, t.id, ph);
        pieces.push({
          id: t.id, body, kind: "task", w: pw, h: ph,
          face: tagColor(tag), ink: tagInk(tag), title: t.title, face_: tagFace(tag),
        });
      });

      offers.forEach((it) => {
        // ★★提案は重さを持たないので、**いちばん重いタスクと同じ**として置く
        //   （2026-09-08 ユーザー指定「提案の図形はもっと大きく」）。山の中で
        //   **今日行くと決めた1件**は、済ませる細かなタスクより大きくてよい。
        const area = weightArea(3) * OFFER_K;
        const r = Math.max(28, Math.sqrt((area * unit * unit) / Math.PI));
        const body = M.Bodies.circle(0, 0, r, BODY);
        M.Body.setMass(body, area * MASS_K);
        toss(body, it.id, r * 2);
        const face = it.color ?? colorOfKind(it.kind);
        pieces.push({
          id: it.id, body, kind: "offer", r,
          face, ink: bodyInkOn(face),
          photo: it.images?.[0], title: it.title,
          // ★写真が無い提案の顔＝**字面**（ブリーフのカードと同じ規則）。
          glyph: glyphOfKind(it.kind),
        });
      });

      if (unread > 0) {
        const body = M.Bodies.circle(0, 0, BADGE_R, BODY);
        toss(body, "unread", BADGE_R * 2);
        pieces.push({ id: "unread", body, kind: "badge", r: BADGE_R, face: RUST, ink: PAPER, count: unread });
      }

      M.Composite.add(engine.world, pieces.map((p) => p.body));
      piecesRef.current = pieces;

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
          } else if (p.kind === "word") {
            // ★★文字の板は **DOM（幾何アルファベット）**が描く。ここでは何もしない
            //   ―― 位置と角度だけ下の `wordEls` へ毎フレーム書き写す。
          } else if (p.kind === "offer" && p.r) {
            // ★★**写真の周りにベゼル**（2026-09-07 ユーザー指定）。円はその提案の色で、
            //   写真は**一回り小さい円**に収まる ―― 色の輪が縁として残る。
            ctx.beginPath();
            ctx.arc(0, 0, p.r, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fill();
            const im = p.photo ? photoOf(p.photo, redraw) : undefined;
            if (!im && p.glyph) {
              // ★★★**写真が無い提案の顔は「字面」**（2026-09-08）。ブリーフの
              //   カードが写真の無いときにやっていることと**同じ規則**なので、
              //   ホームと EXPLORE で同じものが同じ顔になる。
              //   ★帯のピルでは字面をやめた（小さい器では題より字面が強くなる）。
              //   山の円は**題を持たない大きな面**なので、ここでは字面が中身そのもの。
              ctx.rotate(-b.angle);          // ★読ませる字なので回さない
              ctx.fillStyle = p.ink;
              ctx.globalAlpha = 0.92;
              ctx.font = canvasFont(WEIGHT.bold, p.r * 1.15, SANS);
              ctx.textAlign = "center"; ctx.textBaseline = "middle";
              ctx.fillText(p.glyph, 0, 0);
              ctx.globalAlpha = 1;
            }
            if (im) {
              const inner = Math.max(4, p.r - BAND_BEZEL);
              ctx.save();
              ctx.beginPath();
              ctx.arc(0, 0, inner, 0, Math.PI * 2);
              ctx.closePath();
              ctx.clip();
              const s2 = Math.max((inner * 2) / im.naturalWidth, (inner * 2) / im.naturalHeight);
              const iw = im.naturalWidth * s2; const ih = im.naturalHeight * s2;
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
            // ★★**数字は回さない**（図形は回る）。読ませるための数字なので、
            //   逆さまになったら役に立たない。図形の回転だけを打ち消す。
            ctx.rotate(-b.angle);
            ctx.fillStyle = p.ink;
            ctx.font = canvasFont(900, p.r * 0.9, LATIN);
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(String(p.count ?? 0), 0, 0);
          }
          ctx.restore();
        }
      };

      const loop = () => {
        if (stop) return;
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
        draw();
        // ★文字の板（DOM）を物体の位置へ運ぶ。**React の再描画は起こさない**
        //   ―― 毎フレーム setState すると列ごと作り直しになる。
        for (const p of piecesRef.current) {
          if (p.kind !== "word") continue;
          const el = wordEls.current.get(p.id);
          if (!el) continue;
          el.style.transform =
            `translate(${p.body.position.x}px, ${p.body.position.y}px) translate(-50%, -50%) rotate(${p.body.angle}rad)`;
        }
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

  // ── 掴む ──────────────────────────────────────────────────
  /**
   * ★★★**当たり判定**（2026-09-09 に作り直した）。直す前は3つ外していた:
   *   1. **掴めないもの（数の図形・文字の板）が上に乗っていると、下の図形が
   *      掴めなかった** ―― 手前から順に見て最初に当たったものを返し、それが
   *      掴めない種類なら**そこで諦めて**いた。板は器の 2/3 の幅があるので、
   *      山の真ん中がまるごと反応しない。**掴めないものは初めから見ない。**
   *   2. **円を多角形として見ていた** ―― matter.js の円は 25 角形で、頂点は
   *      円周上にあるから**辺の内側が欠ける**。円は半径で見る。
   *   3. **指の太さぶんの余裕が無かった** ―― 縁のちょうど外を押すと外れる。
   *      `TOUCH_SLOP` ぶん広げ、**当たった中でいちばん近いもの**を採る。
   */
  const pickAt = (cx: number, cy: number): Piece | null => {
    const box = boxRef.current;
    const M = matterRef.current;
    if (!box || !M) return null;
    const r = box.getBoundingClientRect();
    const pt = { x: cx - r.left, y: cy - r.top };
    let best: Piece | null = null;
    let bestD = Infinity;
    for (const p of piecesRef.current) {
      if (p.kind === "badge" || p.kind === "word") continue;   // ★掴めないものは見ない
      const b = p.body;
      const dx = pt.x - b.position.x; const dy = pt.y - b.position.y;
      const d = Math.hypot(dx, dy);
      let inside: boolean;
      if (p.kind === "offer" && p.r) {
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

  const onDown = (e: React.PointerEvent) => {
    if (press.current) return;
    const timer = window.setTimeout(() => {
      const p = pickAt(e.clientX, e.clientY);
      // ★数だけの図形（バッジ）と文字の板は掴めない（`GravityTab` と同じ）。
      if (!p || p.kind === "badge" || p.kind === "word") return;
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
  };

  // ★★★**口とブラックホールは置かない**（2026-09-09 ユーザー指定で削除）。
  //   山で掴めるのは**運ぶこと**だけで、完了も削除もここでは起こさない
  //   ―― `components/tasks/DropTargets.tsx` は TASK 側がそのまま使っている。
  const onUp = () => {
    const pr = press.current;
    if (pr) window.clearTimeout(pr.timer);
    press.current = null;
    dragRef.current = null;
    setHolding(false);
  };

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
      {/* ★日付と曜日。**枠の無い、文字だけの板**として山と一緒に落ちる。
          位置と角度は毎フレーム物理から書き写す（React は再描画しない）。 */}
      {words.map((wd) => (
        <div
          key={wd.id}
          ref={(el) => { if (el) wordEls.current.set(wd.id, el); else wordEls.current.delete(wd.id); }}
          aria-hidden
          style={{
            position: "absolute", left: 0, top: 0, pointerEvents: "none", willChange: "transform",
            color: INK, textAlign: "left",
            ...wordStyle(wd.size),
          }}
        >{wd.text}</div>
      ))}
    </div>
  );
}
