"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BAND_BEZEL, INK, LATIN, RUST, SANS, SWISS_XL } from "@/lib/constants";
import { ACCENT_TEST, accentOf } from "@/lib/appAccent";
import { haptic, img, pad } from "@/lib/helpers";
import { bodyInkOn, colorOfKind } from "@/lib/palette";
import { glyphOfKind } from "@/lib/deckStyle";
import { areaOf, specOf, weightArea } from "@/lib/taskSize";
import { resolveTag, tagColor, tagFace, tagInk, tagPatternOf } from "@/lib/taskTags";
import { tagFill } from "@/lib/tagPattern";
import { canvasFont, drawFitted, ensureGlyphs, fitText } from "@/lib/textFit";
import { paperize } from "@/lib/paperTexture";
import { PILE_INSET, floorYOf } from "@/lib/pileBox";
import { RADIUS, WEIGHT } from "@/lib/tokens";
import {
  WD_FULL, drawWordPlate, makeWordBody, measureWordPlate, wordFontSize,
  type WordPlate,
} from "@/lib/wordPlate";

import type { Body, Engine } from "matter-js";
import type { Item, TabId, TagPattern, Task } from "@/lib/types";

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
 *  ★2026-09-09 に 0.22 → **0.28**（ユーザー指定「タスクはもう少し大きく」）。
 *  ★2026-09-10 に **0.36** ―― **文字の板と未読の図形を予算に数えるようにした**ので、
 *  同じ 0.28 のままだと図形の取り分が半分になる。総量の目安は変えていない。 */
const FILL = 0.36;
/** ★★**1つの図形が器に対して取ってよい上限**（`GravityTab` の `FIT_W`/`FIT_H` と
 *  同じ考え方）。面積の予算だけだと、重要度の高い1枚が器の半分を覆ってしまう
 *  ―― 実機で「大きすぎるやつがある」と言われたのがこれ。
 *  ★★★2026-09-11 に **0.68/0.38 → 0.52/0.28**。**面積の予算は「横に2つ並ぶ」を
 *  前提にしている**のに、1枚が器の幅の 68% まで取れたので**1行に1枚しか載らず、
 *  山ではなく塔になった**（実測 … いちばん広い行が器の幅の 89%／山の高さが器の
 *  74%／上端が 178px で帯の裏まで届いていた）。幅を半分に抑えると横に2つ並び、
 *  **山の高さ 54%・上端 305px** になる（同じ山で実測）。
 *  ★GRAVITY で塔にならないのは器が画面まるごとで**倍の高さがある**から。 */
const FIT_W = 0.52;
const FIT_H = 0.28;
/** ★提案の円の大きさ。**いちばん重いタスク × これ**（2026-09-08 に 1 → 1.6）。 */
const OFFER_K = 1.6;
/** 未読のトゲトゲの円。★12頂点・内半径 0.40（`docs/home-spec.md` §5-b）。 */
const ZIG_N = 12;
const ZIG_IN = 0.4;
/** ★未読の数の図形。**数字を読ませる図形**なので、タスクより大きく取る。 */
const BADGE_R = 44;
/**
 * ★★★**トゲトゲの円の輪郭**（2026-09-09）。**絵と物理でここ1つを共有する。**
 * 前は絵がトゲトゲ・物理が**まん丸**で、①掴もうとしても円の当たり判定と
 * ずれる ②トゲが床に引っかからず**玉のように滑る**、の2つが起きていた。
 */
function zigVerts(r: number): { x: number; y: number }[] {
  return Array.from({ length: ZIG_N * 2 }, (_, i) => {
    const a = (i / (ZIG_N * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = r * (i % 2 === 0 ? 1 : ZIG_IN + 0.5);
    return { x: Math.cos(a) * rr, y: Math.sin(a) * rr };
  });
}
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
/**
 * ★★★**山の器（左右の内寸と床）は `lib/pileBox.ts`**（2026-09-11・第91巡）。
 * それまでは `INSET = 16` と生の数字を持ち、しかも**列のパディングの内側**に
 * 居たので、図形の壁は**画面の端から 32px**（タブバーは 16px）だった。
 * ★器は `.bleed-x` で列のパディングの外へ出し、壁を `PILE_INSET` にすることで
 * **タブバーの左右と揃う**。床も GRAVITY と同じ `floorYOf`（タブバーの上から
 * `GROUND_LIFT` 浮かせる）にする。
 */
const INSET = PILE_INSET;
/**
 * ★★★**落とす間隔は「時間」で取る**（2026-09-09。それまでは「高さ」で取っていた）。
 *
 * ★★★高さで取ると、**山が大きいほど出どころが空の彼方へ行く** ―― 実測（器 573px）…
 *   9個で最上段が **-1571px ＝ 器の 2.7 枚ぶん上**。そこから落ちてくるので
 *   ①最後の1個が着くまで **2.98秒**かかり ②着地の瞬間の速さが **1410 px/秒**に
 *   達して叩きつけになり ③画面の外で長く待たされる（「落ちる速度がおかしい」）。
 * ★時間で取れば、**どれも器のすぐ上から同じ速さで落ちる**。実測（同じ山）…
 *   出どころ **-57〜-99px** ／ 最高速 **812 px/秒** ／ 全部が落ち着くまで **1.70秒**。
 * ★★間隔は 80／110／160ms を測って **110ms**（80 は 2.13秒・160 は 2.02秒かかる。
 *   詰めすぎても空けすぎても遅くなる ―― 空中でぶつかるか、順番待ちになるから）。
 */
const DROP_EVERY_MS = 60;
/**
 * 出どころの高さ＝**自分の背丈の半分 ＋ これ ＋ 0〜`DROP_SCATTER`**。
 * ★★★**高さをばらす**（2026-09-11）。等間隔に1つずつ落とすと、どれも同じ速さで
 * 同じ距離を落ちるので、**一列に並んで順番に降りてくる**（コンベアに見えた）。
 * GRAVITY は全部を一度に落とすので**降ってくる**ように見える ―― 高さを散らせば、
 * 出どころを空の彼方へ持ち上げずに同じ見え方になる。
 */
const DROP_ABOVE = 24;
const DROP_SCATTER = 200;
/**
 * ★★★**文字の板の作り方は `lib/wordPlate.ts`**（2026-09-10・第89巡）。
 * それまでは DOM の `<div>` に可変フォントの `wdth 62` で組み、当たり判定を
 * 近似していた ―― **板だけが物理とは別の座標系に居た**ので、板まわりだけ
 * GRAVITY と挙動が違い、直すたびに新しい破綻が出た（宙で固まる／壁に噛む／
 * 当たり判定が字から離れる）。**GRAVITY と同じ部品に戻したので、もう食い違わない。**
 * ★ユーザー確定（2026-09-10）… 「gravity と同じ姿にして」＝ **日付と曜日は2枚**。
 */
/** 板の字を組む幅（山の**内寸**に対する割合）。★GRAVITY は 0.66、ホームは大きめ。 */
const WORD_W = 0.84;

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
  /** ★★タグの柄（べた塗り／網点）。**見分けの本体**。`lib/tagPattern.ts`。 */
  pat?: TagPattern;
  photo?: string;
  /** ★写真が無い提案の顔（「展」「場」）。 */
  glyph?: string;
  count?: number;
  /** 文字の板（日付・曜日）だけが持つ。★寸法も描き方も `lib/wordPlate.ts`。 */
  plate?: WordPlate;
  /** ★★**押すと行き先がある図形**（未読の数＝ブリーフ／ジャーナル＝レコード）。 */
  nav?: TabId;
}


/**
 * ★★★**タスクの図形は1枚に焼いてから貼る**。`paperize`（紙の目）は canvas 全面を
 * 合成し直すので、**画面の canvas に毎フレーム掛けてはいけない**（そう書いてある）。
 * 焼いた絵は body.angle で回して貼るだけ ―― 2D の回転しかしないので厳密に正しい。
 */
const bakeCache = new Map<string, HTMLCanvasElement>();
function taskBitmap(p: Piece, dpr: number): HTMLCanvasElement | undefined {
  if (!p.w || !p.h || p.face_ === undefined || !p.title) return undefined;
  const key = [p.id, Math.round(p.w), Math.round(p.h), p.face, p.title, dpr.toFixed(2), p.pat ?? "solid"].join("|");
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
  // ★★★**塗りは「柄」**（2026-09-11）。GRAVITY の図形（`lib/solidPaint.ts`）と
  //   同じ部品を通す ―― タグの見分けは色ではなく柄が持つ。
  ctx.fillStyle = tagFill(ctx, p.pat ?? "solid", p.face, dpr);
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
   *  1px 揺れるたびに React が作り直し、**山が落ち直して震え続ける**。
   *  `GravityTab` と同じ ―― あちらは**壁だけ作り直して、山はそのまま**。 */
  const sizeRef = useRef({ w: 0, h: 0 });
  /** 最初に測れたら1度だけ真になる（山を組む合図）。以後は動かさない。 */
  const [measured, setMeasured] = useState(false);
  const [holding, setHolding] = useState(false);
  const dragRef = useRef<{ piece: Piece; x: number; y: number } | null>(null);

  // ★器の寸法は**測ってから**使う（iOS は起動直後やツールバーの伸縮で変わる）。
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const read = () => {
      sizeRef.current = { w: box.clientWidth, h: box.clientHeight };
      if (box.clientWidth > 0 && box.clientHeight > 0) setMeasured(true);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const redraw = useCallback(() => { /* 次のフレームで拾う */ }, []);

  // ★★★**山を組み直す合図は「中身」だけ**（2026-09-10）。配列の同一性で見ていた
  //   ので、保存や同期のたびに `appState` が作り直されると**山ごと落ち直して
  //   いた**。中身が同じなら文字列も同じになるので、組み直しは起こらない。
  const sig = [
    tasks.map((t) => `${t.id}:${t.weight ?? 2}:${t.dueDate ?? ""}:${t.tag ?? ""}:${t.title}`).join("|"),
    offers.map((o) => `${o.id}:${o.kind}`).join("|"),
    unread, journal?.title ?? "", today.toDateString(),
  ].join("#");

  useEffect(() => {
    const cv = cvRef.current;
    const { w, h } = sizeRef.current;
    if (!cv || !measured || w <= 0 || h <= 0) return;
    let stop = false;
    const cleanup: (() => void)[] = [];

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

      // ★★★**落ちているあいだは眠らせない**（2026-09-10）。matter.js は、支えて
      //   いた物体が転がって**居なくなっても、眠っている物体を起こさない**
      //   （起きるのは新しい衝突が起きたときだけ）。落下中に眠りに入ると、
      //   **宙に浮いたまま固まる** ―― 実際に日付の板が空中で止まった。
      //   全部を落とし終えて落ち着いてから眠りを許す（下の `settleAt`）。
      const engine = M.Engine.create({ enableSleeping: false });
      engine.gravity.y = GRAVITY_Y;
      engineRef.current = engine;

      // ★★★**壁は器の内側**（`GravityTab` の `PILE_INSET` と同じ）。器の縁ぴったりに
      //   置くと、出どころ（`INSET` の内側）と壁がずれて**壁際で押し合う**。
      // ★★★**器が伸び縮みしたら、壁だけ作り直す**（山は落とし直さない）。
      //   `GravityTab` がやっているのと同じ ―― iOS はツールバーや安全域で器の
      //   高さが常に少し動くので、そのたびに山を組み直すと**震え続ける**。
      let walls: Body[] = [];
      const buildWalls = (bw: number, bh: number) => {
        if (walls.length) M.Composite.remove(engine.world, walls);
        // ★★床は**タブバーの上から `GROUND_LIFT` 浮かせる**（`GravityTab` と同じ式）。
        //   器の下端に置くと、図形がタブバーの下へ潜って読めなくなる。
        const floorY = floorYOf(bh);
        walls = [
          M.Bodies.rectangle(bw / 2, floorY + WALL_T / 2, bw + WALL_T * 2, WALL_T, { isStatic: true, friction: 0.6 }),
          M.Bodies.rectangle(INSET - WALL_T / 2, bh / 2, WALL_T, bh * 3, { isStatic: true, friction: 0.4 }),
          M.Bodies.rectangle(bw - INSET + WALL_T / 2, bh / 2, WALL_T, bh * 3, { isStatic: true, friction: 0.4 }),
        ];
        M.Composite.add(engine.world, walls);
      };
      buildWalls(w, h);
      const ro = new ResizeObserver(() => {
        const box = boxRef.current;
        if (!box) return;
        const nw = box.clientWidth; const nh = box.clientHeight;
        // ★0.5px 未満のゆらぎは無視（`GravityTab` と同じ番人）。
        if (Math.abs(nw - sizeRef.current.w) < 0.5 && Math.abs(nh - sizeRef.current.h) < 0.5) return;
        sizeRef.current = { w: nw, h: nh };
        cv.width = Math.round(nw * dpr); cv.height = Math.round(nh * dpr);
        cv.style.width = `${nw}px`; cv.style.height = `${nh}px`;
        buildWalls(nw, nh);
        for (const p of piecesRef.current) M.Sleeping.set(p.body, false);
      });
      if (boxRef.current) ro.observe(boxRef.current);
      cleanup.push(() => ro.disconnect());

      // ★★★**その日まだ声を録っていなければ、JOURNAL の図形も落とす**
      //   （2026-09-09 ユーザー指定）。形は**角丸の四角**＝タスクと同じ ――
      //   `docs/home-spec.md` の「形に意味を足さない。増えたら色で分ける」に従い、
      //   **見分けは色**（JOURNAL の家族のメイン）が担う。「今日やること」である
      //   点でタスクと同じ種類のものなので、形を増やす理由が無い。
      //   ★録ってあればこの図形は**そもそも出ない**（済んだことを画面に残さない）。
      const jDue = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      const jTask = journal ? { title: journal.title, weight: 2 as const, dueDate: jDue } : null;
      const jSpec = jTask ? specOf(jTask, today) : null;

      // ★★★**文字の板は先に決めて、器の予算から差し引く**（2026-09-10）。
      //   板は器の幅の `WORD_W` を取る**いちばん大きな塊**なのに、予算に数えて
      //   いなかった ―― 実測で器の 29% を1枚で占め、山の総面積が **80%** に
      //   なっていた（`FILL` は 0.28 のつもり）。詰まった山は解けずに
      //   **押し合って震える**し、上へあふれる（実測 … 4個が器の上に積み上がった）。
      // ★★★**GRAVITY と同じ2枚**（`lib/wordPlate.ts`。ユーザー確定 2026-09-10）。
      //   ★★字の大きさは**長いほう（曜日）で決めた1つの値**を両方に使う
      //   （GRAVITY が第67巡に直した通り ―― 別々に決めると、並んだ2枚の
      //   キャップラインもベースラインも食い違って見える）。
      const words = [`${today.getMonth() + 1}/${today.getDate()}`, WD_FULL[today.getDay()]];
      const room = (w - INSET * 2) * WORD_W;
      const wordFs = wordFontSize(words, room, LATIN, SWISS_XL);
      const plates = words.map((wd) => measureWordPlate(wd, wordFs, room, INK, LATIN));

      // ★★山に収まるよう**一括で**縮める。1つずつ縮めない ―― 図形どうしの
      //   大きさの比がそのまま重要度なので、比を保ったまま全体を縮める。
      const areas = [
        ...tasks.map((t) => areaOf(t, today)),
        ...offers.map(() => weightArea(3) * OFFER_K),
        ...(jSpec ? [jSpec.area] : []),
      ];
      const total = areas.reduce((a, b) => a + b, 0) || 1;
      // ★残りの予算 ＝ 器 × `FILL` −（板 ＋ 未読の図形）。0 にはしない。
      // ★★★**予算は「図形が居られる高さ」で取る**（2026-09-11）。床を
      //   `GROUND_LIFT` ぶん上げたので、器の高さ `h` で取ると**入り切らない**
      //   （実測 … 9件で山が器の天井まで届いた）。使えるのは**床まで**。
      const usableH = Math.max(120, floorYOf(h));
      const fixed = plates.reduce((a, pl) => a + pl.w * pl.h, 0)
        + (unread > 0 ? Math.PI * BADGE_R * BADGE_R : 0);
      const budget = Math.max(w * usableH * FILL * 0.25, w * usableH * FILL - fixed);
      // ★★★**下限で予算を破らない**。以前は 16 を床にしていたので、件数が多い日は
      //   予算を無視して大きいまま出て、器に入り切らなかった。
      let unit = Math.min(UNIT, Math.sqrt(budget / total));
      // ★★いちばん大きな図形が器からはみ出さないところまで、**全体を**縮める。
      //   1枚だけ縮めない ―― 図形どうしの大きさの比がそのまま重要度なので。
      for (const sp of [...tasks.map((t) => specOf(t, today)), ...(jSpec ? [jSpec] : [])]) {
        unit = Math.min(unit, (w * FIT_W) / Math.max(1, sp.w), (usableH * FIT_H) / Math.max(1, sp.h));
      }
      unit = Math.max(10, unit);

      const pieces: Piece[] = [];
      // ★★落とし方は `GravityTab` と同じ ―― **どこへ・どの高さから落ちるか**で
      //   ばらつきを作り、傾きと回りは控えめに添える。
      const spawnX = (bw: number, r1: number) => {
        const half = bw / 2;
        const lo = INSET + half + 4;
        const hi = Math.max(lo, w - INSET - half - 4);
        return Math.min(hi, Math.max(lo, INSET + (w - INSET * 2) * (0.08 + r1 * 0.84)));
      };
      // ★★★**間隔は高さではなく時間で取る**（2026-09-09。理由と実測は `DROP_EVERY_MS`）。
      //   ここでは**出どころを器のすぐ上に置くだけ**で、順番は下の `release` が
      //   フレームごとに世界へ入れることで作る。
      let nth = 0;
      const toss = (body: Body, seed: string, bh: number) => {
        const r1 = frac(seed); const r2 = frac(`${seed}y`); const r3 = frac(`${seed}a`);
        const up = bh / 2 + DROP_ABOVE + r2 * DROP_SCATTER;
        body.plugin = { ...(body.plugin ?? {}), releaseAt: nth++ * DROP_EVERY_MS };
        M.Body.setPosition(body, { x: spawnX(body.bounds.max.x - body.bounds.min.x, r1), y: -up });
        M.Body.setAngle(body, (r3 - 0.5) * SPAWN_TILT);
        // ★★**回りは形の大小で加減しない**（2026-09-09）。大きさで割ると、小さい
        //   ものだけ空中で止まって見える。同じ初速を与えて、あとは形が決めた
        //   慣性に任せる ―― ひっくり返るなら、それが自然な落ち方。
        M.Body.setAngularVelocity(body, (r3 - 0.5) * SPAWN_SPIN);
        M.Body.setVelocity(body, { x: (r1 - 0.5) * SPAWN_VX, y: 0 });
      };

      // ★★★**その日の日付と曜日も一緒に落とす**（2026-09-07 ユーザー指定。
      //   `GravityTab` と同じ ―― 枠の無い、文字だけの黒い板）。
      // ★★★**作り方は `lib/wordPlate.ts`。GRAVITY とまったく同じ部品**（第89巡）。
      //   canvas に焼いて貼り、当たり判定は**塗りの実測**、横の細さは `ctx.scale`。
      //   ★DOM で組んでいたのをやめた ―― 板だけが物理と別の座標系に居たせいで、
      //   板まわりだけ挙動が違っていた（ユーザー「特に日付と曜日がおかしい」）。
      // ★★★**いちばん先に落とす**（2026-09-09）。最後に落とすと、板は山の
      //   **凸凹の上**へ着地して 59° 傾いた（実測。3回とも同じ）。日付は読ませる
      //   字なので、**平らな床の上**に先に置き、図形をその上に積む。
      plates.forEach((plate, i) => {
        const body = makeWordBody(M, plate, 0, 0);
        toss(body, `word${i}`, plate.bh);
        // ★初速の回りは与えない（傾くのは着地の弾みぶんだけ）。
        M.Body.setAngle(body, (frac(`word${i}a`) - 0.5) * 0.16);
        M.Body.setAngularVelocity(body, 0);
        pieces.push({
          id: `word${i}`, body, kind: "word", w: plate.bw, h: plate.bh,
          face: INK, ink: INK, title: plate.word, plate,
        });
      });

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
          pat: tagPatternOf(tag),
        });
      });

      if (jTask && jSpec) {
        const pw = Math.max(28, jSpec.w * unit);
        const ph = Math.max(24, jSpec.h * unit);
        const body = M.Bodies.rectangle(0, 0, pw, ph, BODY);
        M.Body.setMass(body, jSpec.area * MASS_K);
        toss(body, "journal", ph);
        // ★色は **JOURNAL の家族のメイン**（`ACCENT_TEST` を切ったときは録音の赤）。
        const face = ACCENT_TEST ? accentOf("journal").main : RUST;
        pieces.push({
          id: "journal", body, kind: "task", w: pw, h: ph,
          face, ink: bodyInkOn(face), title: jTask.title, face_: 1,
          nav: "journal-record",
        });
      }

      offers.forEach((it) => {
        // ★★提案は重さを持たないので、**いちばん重いタスクと同じ**として置く
        //   （2026-09-08 ユーザー指定「提案の図形はもっと大きく」）。山の中で
        //   **今日行くと決めた1件**は、済ませる細かなタスクより大きくてよい。
        const area = weightArea(3) * OFFER_K;
        const r = Math.max(28, Math.sqrt((area * unit * unit) / Math.PI));
        const body = M.Bodies.circle(0, 0, r, BODY);
        M.Body.setMass(body, area * MASS_K);
        toss(body, it.id, r * 2);
        // ★★**焼き込まれた色を信じない**（帯の `cardFace` と同じ理由）。生成した夜の
        //   パレットが残っているので、**いま生きている表から引き直す**。
        const face = ACCENT_TEST ? colorOfKind(it.kind) : (it.color ?? colorOfKind(it.kind));
        pieces.push({
          id: it.id, body, kind: "offer", r,
          face, ink: bodyInkOn(face),
          photo: it.images?.[0], title: it.title,
          // ★写真が無い提案の顔＝**字面**（ブリーフのカードと同じ規則）。
          glyph: glyphOfKind(it.kind),
        });
      });

      if (unread > 0) {
        // ★★★**トゲの外側の12点を結んだ多角形**で作る（2026-09-09に作り直し）。
        //   ★★`Bodies.fromVertices` に**凹んだ星をそのまま渡してはいけない** ――
        //   `poly-decomp` を積んでいないので分解に失敗し、**凹んだ形を1つの凸形と
        //   して**扱う（実測 `parts=1` ＋ 警告）。当たり判定が破綻して、山の中で
        //   引っかかる。**凸なら SAT が正しく効く。**
        //   ★まん丸に戻さないのは、玉のように滑らず**角で止まる**ため（12角形は
        //   トゲの先を通る ―― 絵の外周とぴったり一致する）。
        const body = M.Bodies.polygon(0, 0, ZIG_N, BADGE_R, BODY);
        M.Body.setMass(body, weightArea(3) * MASS_K);
        toss(body, "unread", BADGE_R * 2);
        // ★★色は **EXPLORE の家族のメイン**（2026-09-09 ユーザー指定）。
        //   数えているのが Explore の未読なので、**行き先と同じ色**を着る。
        const face = ACCENT_TEST ? accentOf("life").main : RUST;
        pieces.push({
          id: "unread", body, kind: "badge", r: BADGE_R,
          face, ink: bodyInkOn(face), count: unread,
          // ★押すと EXPLORE のブリーフへ（そこで実際に読める）。
          nav: "brief",
        });
      }

      // ★★★**世界へは1つずつ入れる**（2026-09-09）。まとめて入れると全部が同時に
      //   落ち始めるので、順番を作るために出どころを空の彼方まで持ち上げる羽目に
      //   なる。**入れる時刻をずらせば、出どころは器のすぐ上でよい。**
      piecesRef.current = pieces;
      const startedAt = performance.now();
      const inWorld = new Set<string>();
      const release = (now: number) => {
        for (const p of pieces) {
          if (inWorld.has(p.id)) continue;
          const at = (p.body.plugin as { releaseAt?: number } | undefined)?.releaseAt ?? 0;
          if (now - startedAt < at) continue;
          inWorld.add(p.id);
          M.Composite.add(engine.world, p.body);
        }
      };
      release(startedAt);

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
            // ★★文字の板は **GRAVITY と同じ焼いた絵**（`lib/wordPlate.ts`）。
            //   ★ここは既に translate/rotate 済みなので、原点に置くだけ。
            if (p.plate) drawWordPlate(ctx, p.plate, 0, 0, 0, dpr);
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
            // ★輪郭は物理と同じ `zigVerts`（絵と当たり判定を1つの出どころに）。
            ctx.beginPath();
            zigVerts(p.r).forEach((v, i) => { if (i === 0) ctx.moveTo(v.x, v.y); else ctx.lineTo(v.x, v.y); });
            ctx.closePath();
            ctx.fill();
            // ★★★**数字も一緒に回す**（2026-09-09 ユーザー指定「そのまま図形に
            //   焼き付けて落として」）。回転を打ち消していたのをやめた ――
            //   図形は転がるのに中身だけ据わっていると、**面に描いてあるのではなく
            //   上に浮いている**ように見えて、物として読めない。
            ctx.fillStyle = p.ink;
            ctx.font = canvasFont(900, p.r * 0.9, LATIN);
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(String(p.count ?? 0), 0, 0);
          }
          ctx.restore();
        }
      };

      // ★全部を落とし終えてから眠りを許すまでの猶予。★目盛りの外（物理の場）。
      const settleAt = startedAt + pieces.length * DROP_EVERY_MS + 2500;
      const loop = () => {
        if (stop) return;
        const now = performance.now();
        release(now);
        if (!engine.enableSleeping && now > settleAt) engine.enableSleeping = true;
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
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      stop = true;
      cancelAnimationFrame(rafRef.current);
      for (const fn of cleanup) fn();
      piecesRef.current = [];
      engineRef.current = null;
    };
    // ★★★deps は**中身の署名だけ**。`size` を入れると器が 1px 動くたびに
    //   山ごと落ち直して**震え続ける**（`GravityTab` は壁だけ作り直している）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, measured, redraw]);

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
   * ★★★**トゲトゲの円も見る**（2026-09-09 ユーザー指摘）。押すと行き先がある
   *   図形になったので、**掴めないから見ない**では触れなくなる。トゲの谷まで
   *   絞らず**外側の半径**で見る ―― 数字を押したつもりで谷に入って外れるほうが
   *   ずっと悪い。**見ないのは文字の板だけ。**
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

  const onDown = (e: React.PointerEvent) => {
    if (press.current) return;
    const timer = window.setTimeout(() => {
      const p = pickAt(e.clientX, e.clientY);
      // ★文字の板は掴めない（`GravityTab` と同じ）。
      if (!p || p.kind === "word") return;
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
      <canvas ref={cvRef} style={{ position: "absolute", inset: 0, display: "block" }} />
    </div>
  );
}
