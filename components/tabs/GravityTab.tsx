"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Body, Engine } from "matter-js";
import { LayerName } from "@/components/tasks/LayerName";
import { DemoSeedButton } from "@/components/tasks/TaskAddButton";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { ViewToggle } from "@/components/tasks/ViewToggle";
import { ymd } from "@/components/tasks/WhenSheet";
import { haptic } from "@/lib/helpers";
import { rectOf, sectionOutline, type SolidSpec } from "@/lib/solid";
import { clearSolidBitmaps, peekSolidBitmap, shapeBounds, shapeGlyphsReady, solidBitmap, warmShapeGlyphs, type SolidPaint, type SolidView } from "@/lib/solidPaint";
import { onFontsReady, primeAdvances } from "@/lib/textFit";
import { allTagFaces, allTagLabels, resolveTag, tagColor } from "@/lib/taskTags";
import { demoTasks } from "@/lib/taskDemo";
import { areaOf, daysUntil, dropOrder, massOf, specOf } from "@/lib/taskSize";
import { INK, LATIN, MUTED, PAPER, RUST, SANS, SWISS_LG, SWISS_MD, SWISS_XL } from "@/lib/constants";
import { SPACE, TYPE } from "@/lib/tokens";
import type { AppState, TabProps, Task } from "@/lib/types";

// ★タスクタブ(GRAVITY)。確定したタスクが上から落ちてきて積み上がる。
//
// ★★**タスク図形は常にこの空間にだけ在る**(第52巡に TOP/UNDER を破棄)。別画面へ
// 遷移せず、スワイプで**この空間の物理法則を一時的に変える**ことで、詳細リスト
// (ALIGN)とスケジュールの俯瞰(TIMELINE)を見せる。
//   ・pile     … 既定。重力で落ちて積まれる。
//   ・align    … 画面左端から右へ払う。**左に円弧**で図形が並び、右に詳細の文字。
//   ・timeline … 下から上へ払う。**地面から曜日の巨大な文字が伸び**、図形が日付の
//                レーンへ下から詰めて積まれる。
//
// ★★★**描き方の要(第53巡)** … align/timeline では **matter の body の位置で
// 描かない**。レイアウトが決めた**スロット `{x,y,s,a}` へ、焼いた絵の中心をそのまま
// 置く**。第52巡は body の**重心**へ寄せて `ox/oy`(重心と絵の中心のズレ)で補正して
// いたため、`ox` の大きい形(半円・三角)が行から外れ、画面の左端で切れていた。
// さらに `unit` を変えて焼き直していたので、焼き上がるまで**実寸の多角形**が出て
// 二重にズレた。いまは:
//   ・絵の中心＝スロット(`ox/oy` を使わない)。どの形でも必ず行に揃う。
//   ・大小は `ctx.scale`(1枚の絵を拡大縮小する。焦点だけ大きくできる)。
//   ・焼き上がる前は**山の絵**を倍率だけ合わせて流用する(空白にしない)。
//   ・当たり判定もスロットの矩形で見る(body は画面上に居ないため)。
//
// 図形の寸法がそのままタスクの中身になっている(lib/taskSize.ts):
//   塗られる面積 = 重要度 / 形 = 埋まっている側面の数 / 縦横比 = 四角だけ題の長さ
//   スラブの枚数 = 残っている手順 / 色と書体 = タグ

/** 図形の1単位を何pxで描くか。 */
const UNIT = 64;
/** 物理の重さの倍率。 */
const MASS_K = 1.6;
/** 図形の合計面積を、床から上の領域のどれだけに収めるか。 */
const FILL = 0.58;
/** ★どこまで縮めてよいか。これ以上は縮めず、代わりに間引く。 */
const SCALE_MIN = 0.70;
/** 見出し(アプリ名の札 + 層の名前 + ビュー切替)が占める高さ。 */
const MASTHEAD_H = 124;
/** いちばん大きい1枚が、画面の幅・高さのどこまでを占めてよいか。 */
const FIT_W = 0.86;
const FIT_H = 0.62;
/** どこまで大きくしてよいか。 */
const SCALE_MAX = 1.6;
/** 縮尺がこれ以上変わったら山を作り直す。 */
const SCALE_EPS = 0.02;
/** 当たり判定の多角形の頂点の上限。 */
const PHYS_VERTS = 12;
/** 1フレームに焼いてよい図形の絵の枚数。 */
const BAKE_BUDGET = 1;
/** 1フレームに用意してよいグリフの枚数。 */
const GLYPH_BUDGET = 4;
/** これ未満の代表寸法(px)になる図形は山に入れない。 */
const CULL_PX = 30;

// ── モードの語彙 ──────────────────────────────────────────────
// ★ここから下の数字は**図形とレイアウトの座標系**(px・rad)。`lib/tokens.ts` の
//   例外2(図形の座標系)に当たる。文字の大きさは必ず `TYPE`/`SWISS_*` から引く。
type Mode = "pile" | "align" | "timeline";
/** 左端とみなす始点の幅(px)。ここから右へ払うと ALIGN。 */
const EDGE_PX = 30;
/** モードを切り替えるのに要る払いの距離(px)。 */
const SWIPE_PX = 44;
/** タップとみなす動きの上限(px)。 */
const TAP_MOVE = 8;
/** 軸を決めるしきい(px)。 */
const AXIS_PX = 8;
/** モードの出入りを進める割合(毎フレーム)。 */
const ENTER_K = 0.16;

// ALIGN … 左の円弧
/** 円弧の半径(px)。画面の使える高さの半分ほどにすると、上下の端で図形が
 *  左へ回り込んで自然に消える(観覧車の見え方)。 */
const ARC_R = 290;
/** 円弧の頂点(いちばん右へ出る点)の x。 */
const ARC_APEX_X = 88;
/** 中央付近の行の縦の間隔(px)。角度の刻みはこれと半径から出す。 */
const ROW_H = 112;
/** いちばん大きい図形の高さ・幅の目標(px)。★全件を画面に詰めない。 */
const ALIGN_MAX_H = 92;
const ALIGN_MAX_W = 132;
/** 焦点(中央)をどれだけ大きくするか。 */
const FOCUS_BOOST = 0.34;
/** 文字の左端(円弧の右)。 */
const TEXT_LEFT = 160;
/** 慣性の減衰と、最寄りへ吸着する割合。 */
const SCROLL_DECAY = 0.92;
const SNAP_K = 0.18;
/** 指を離したときの慣性の強さ(px → 行数)。 */
const FLICK_K = 0.9;

// TIMELINE … 地面から立つ曜日と、下から詰まる図形
/** 同時に見えるレーンの数。 */
const LANES_VISIBLE = 3;
/** 何日先まで並べるか。 */
const HORIZON = 14;
/** レーンの中で図形を積む縦の間隔(px)。 */
const LANE_PITCH = 62;
/** 巨大な曜日ラベルの帯の高さ(px)。 */
const LANE_HEAD_H = 92;
/** レーンに入る図形の最大の高さ(px)。 */
const TL_MAX_H = 50;
/** 指で引き上げ切るまでの距離(px)。 */
const TL_SPAN = 240;
/** 潰れている曜日の縦の倍率(完全な0にすると消えて見える)。 */
const TL_FLAT = 0.04;
/** 横スワイプの追従 … **下(k=0)がいちばん速く、上ほど遅れて付いてくる**。 */
const LAG_BASE = 0.34;
const LAG_DECAY = 0.82;

/** 曜日の英字3文字(`Date.getDay()` の添字。日曜=0)。 */
const WD3 = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

/** 完了したときに飛び散る破片。 */
interface Shard { x: number; y: number; vx: number; vy: number; r: number; life: number; fill: string }
const SHARD_MS = 620;

/** 山(pile)の物理の1つ。 */
interface Piece {
  id: string;
  body: Body;
  spec: SolidSpec;
  paint: SolidPaint;
  girth: number;
  ox: number;
  oy: number;
}

/** align/timeline が並べる1つ。**未完了の全タスク**が対象(山は間引くが一覧は全部)。 */
interface Item { id: string; task: Task; paint: SolidPaint; spec: SolidSpec; tag: string }

/** 絵を置く場所。x/y は**絵の中心**、s は倍率、a は角度、o は濃さ。
 *  ★円弧の端では**切り落とさずに淡くして消す**(o)。画面の縁で図形が真っ二つに
 *  切れると事故に見えるため。 */
interface Slot { x: number; y: number; s: number; a: number; o: number }

const paintOf = (t: Task, view: SolidView): SolidPaint => ({
  spec: specOf(t), view, title: t.title,
  tag: resolveTag(t.tag, t.id, t.title, t.context, t.belongings, t.note),
});

const sameShape = (a: SolidSpec, b: SolidSpec) =>
  a.sides.length === b.sides.length
  && Math.abs(a.w - b.w) < 1e-6 && Math.abs(a.h - b.h) < 1e-6;

/**
 * ★残り日数の見せ方。**文字数ではなく「種類」で大きさを決める**(第53巡)。
 * 第52巡は `big.length > 3` で判定していたため、期日なしの `"—"`(1文字)が
 * `SWISS_XL`(72) に落ちて**巨大な黒い棒**になっていた(実機で発覚)。
 *   num  … 数字。大きく出す(焦点 `SWISS_LG` / それ以外 `SWISS_MD`)。
 *   word … `OVER`(過ぎている) / `SOMEDAY`(期日なし)。小さく薄く出す。
 */
function daysLabel(dueDate: string | undefined, today: Date): { text: string; sub: string; kind: "num" | "word" } {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { text: "SOMEDAY", sub: "", kind: "word" };
  const d = daysUntil(dueDate, today);
  if (d < 0) return { text: "OVER", sub: "", kind: "word" };
  if (d === 0) return { text: "0", sub: "TODAY", kind: "num" };
  return { text: String(d), sub: d === 1 ? "DAY" : "DAYS", kind: "num" };
}

/** 曜日の3文字。 */
function weekdayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return WD3[new Date(y, m - 1, d).getDay()];
}

/** 出入りの緩急(初速が高い減速。CSS の `--ease-settle` と同じ性格)。 */
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function GravityTab({ appState, persist, showToast, appActive, active = true, dragged }: TabProps & {
  appActive?: boolean;
  /** この層(GRAVITY タブ)が画面に出ているか。DRIFT タブに切り替わると false に
   *  なり、ループとジェスチャーを止める(山はマウントしたまま保つ)。 */
  active?: boolean;
  dragged?: React.MutableRefObject<boolean>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pendingBakeRef = useRef(false);
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
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<SolidView>("name");
  const viewRef = useRef<SolidView>("name");

  // ── モード ──
  const [mode, setMode] = useState<Mode>("pile");
  const modeRef = useRef<Mode>("pile");
  /** 物理を止めているか(モードに居る間・指で引いている間)。 */
  const frozenRef = useRef(false);
  /** モードへの入り具合 0..1(指追従・またはトゥイーン)。 */
  const enterRef = useRef(0);
  const enterTargetRef = useRef(0);
  /** 指で timeline を引き上げている最中か。 */
  const tlDragRef = useRef(false);

  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const slotRef = useRef<Map<string, Slot>>(new Map());
  const curRef = useRef<Map<string, Slot>>(new Map());
  const fromRef = useRef<Map<string, Slot>>(new Map());
  /** レーンの中の段(0 = いちばん下)。横スワイプの遅れに使う。 */
  const stackRef = useRef<Map<string, number>>(new Map());
  /** 焼く単位(px)。倍率は ctx.scale で作るので、焼くのはこの1つだけ。 */
  const bakeUnitRef = useRef(UNIT);

  // ALIGN
  const scrollRef = useRef(0);
  const scrollVRef = useRef(0);
  const aDragRef = useRef(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const focusRef = useRef(0);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // TIMELINE
  const worldRef = useRef(0);
  const daysRef = useRef<string[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const bandRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  const dropAllRef = useRef<() => void>(() => {});
  const scaleRef = useRef(1);

  const tasks = useMemo(() => (appState.tasks ?? []).filter((t) => !t.done), [appState.tasks]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const open = (appState.tasks ?? []).find((t) => t.id === openId) ?? null;

  // ── 描く ───────────────────────────────────────────────────
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    const { w, h } = sizeRef.current;
    if (!cv || !w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

    let budget = BAKE_BUDGET;
    let glyphBudget = GLYPH_BUDGET;
    const pileUnit = UNIT * scaleRef.current;
    const want = (paint: SolidPaint, unit: number) => {
      let bmp = peekSolidBitmap(paint, unit, bakeDpr);
      if (!bmp) {
        if (glyphBudget > 0) glyphBudget -= warmShapeGlyphs(paint, glyphBudget, unit, bakeDpr);
        if (budget > 0 && shapeGlyphsReady(paint, unit, bakeDpr)) { bmp = solidBitmap(paint, unit, bakeDpr); budget--; }
      }
      return bmp;
    };

    if (modeRef.current === "pile") {
      // 山 … body の位置と角度で描く(重心と絵のズレ ox/oy を戻す)。
      for (const p of piecesRef.current) {
        const bmp = want(p.paint, pileUnit);
        ctx.save();
        ctx.translate(p.body.position.x, p.body.position.y);
        ctx.rotate(p.body.angle);
        if (bmp) {
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
      pendingBakeRef.current = budget === 0 || glyphBudget === 0
        || piecesRef.current.some((p) => !peekSolidBitmap(p.paint, pileUnit, bakeDpr));
    } else {
      // ★★スロットへ**絵の中心**を置く。ox/oy は使わない(ズレの根治)。
      const bakeUnit = bakeUnitRef.current;
      for (const it of itemsRef.current) {
        const cu = curRef.current.get(it.id);
        if (!cu) continue;
        let bmp = want(it.paint, bakeUnit);
        let s = cu.s;
        if (!bmp) {
          // まだ焼けていなければ**山の絵**を倍率だけ合わせて流用する。
          const pb = peekSolidBitmap(it.paint, pileUnit, bakeDpr);
          if (pb) { bmp = pb; s = (cu.s * bakeUnit) / pileUnit; }
        }
        ctx.save();
        ctx.globalAlpha = cu.o;
        ctx.translate(cu.x, cu.y);
        ctx.rotate(cu.a);
        ctx.scale(s, s);
        if (bmp) {
          ctx.drawImage(bmp.canvas, -bmp.w / 2, -bmp.h / 2, bmp.w, bmp.h);
        } else {
          // どちらも無い1〜2フレームだけの仮置き(必ず**スロットの大きさ**で)。
          const b = shapeBounds(it.paint);
          const bw = (b.maxX - b.minX) * bakeUnit;
          const bh = (b.maxY - b.minY) * bakeUnit;
          ctx.globalAlpha = cu.o * 0.22;
          ctx.fillStyle = tagColor(it.paint.tag);
          ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
        }
        ctx.restore();
      }
      pendingBakeRef.current = budget === 0 || glyphBudget === 0
        || itemsRef.current.some((it) => !peekSolidBitmap(it.paint, bakeUnit, bakeDpr));
    }
    if (pendingBakeRef.current) wakeRef.current();

    for (const s of shardsRef.current) {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.fill;
      ctx.fillRect(s.x - s.r / 2, s.y - s.r / 2, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }, []);

  const drawRef = useRef(draw);
  drawRef.current = draw;
  const loopRef = useRef<() => void>(() => {});

  const wake = useCallback(() => {
    if (runningRef.current || !activeRef.current) return;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(() => loopRef.current());
  }, []);
  wakeRef.current = wake;

  /** 使える縦の範囲(見出しの下 〜 タブバーの上)。 */
  const fieldOf = useCallback(() => {
    const { h } = sizeRef.current;
    const floor = h - navHeightPx();
    return { top: MASTHEAD_H, floor, mid: (MASTHEAD_H + floor) / 2 };
  }, []);

  // ── ALIGN のレイアウト(左の円弧) ──────────────────────────
  const layoutAlign = useCallback(() => {
    const list = itemsRef.current;
    if (!list.length) return;
    const { mid } = fieldOf();
    const cx = ARC_APEX_X - ARC_R;
    const step = ROW_H / ARC_R;
    const unit = bakeUnitRef.current / (1 + FOCUS_BOOST);
    void unit;
    const slots = slotRef.current;
    for (let i = 0; i < list.length; i += 1) {
      const d = i - scrollRef.current;
      const th = d * step;
      const f = Math.max(0, 1 - Math.abs(d));
      slots.set(list[i].id, {
        x: cx + ARC_R * Math.cos(th),
        y: mid + ARC_R * Math.sin(th),
        // 焦点で 1.0(＝焼いた絵の実寸)、離れるほど小さく。
        s: (1 + FOCUS_BOOST * f) / (1 + FOCUS_BOOST),
        a: th,
        o: Math.max(0, Math.min(1, 1.25 - Math.abs(d) / 2.2)),
      });
    }
  }, [fieldOf]);

  // ── TIMELINE のレイアウト(地面の曜日と、下から詰まる図形) ──
  const layoutTimeline = useCallback(() => {
    const list = itemsRef.current;
    const { w } = sizeRef.current;
    const { top, floor } = fieldOf();
    const laneW = w / LANES_VISIBLE;
    const ds = daysRef.current;
    const world = worldRef.current;
    const slots = slotRef.current;
    const stack = stackRef.current;
    const count = new Array(ds.length).fill(0);
    // 図形が積み始める線 … 曜日の帯の**上**。
    const base = floor - LANE_HEAD_H - SPACE.md;
    for (const it of list) {
      const li = it.task.dueDate ? ds.indexOf(it.task.dueDate) : -1;
      if (li < 0) {
        // ★曜日が割り当てられていないものは**上に浮遊**させる(ユーザー指定)。
        //   位置は id から決める(開くたびに散らばり方が変わらない)。
        stack.set(it.id, 0);
        slots.set(it.id, {
          x: w * (0.16 + 0.68 * frac(it.id)),
          y: top + SPACE.xl + frac(`${it.id}#y`) * 96,
          s: 0.72, a: 0, o: 0.7,
        });
        continue;
      }
      const k = count[li];
      count[li] += 1;
      stack.set(it.id, k);
      slots.set(it.id, {
        x: laneW * li + laneW / 2 - world,
        y: base - (k * LANE_PITCH + LANE_PITCH / 2),
        s: 1, a: 0, o: 1,
      });
    }
  }, [fieldOf]);

  const layoutRef = useRef(() => {});
  layoutRef.current = () => {
    if (modeRef.current === "align") layoutAlign();
    else if (modeRef.current === "timeline") layoutTimeline();
  };

  /** 焦点(中央の行)が変わったときだけ再レンダーする。 */
  const syncFocus = useCallback(() => {
    const n = Math.max(0, Math.min(itemsRef.current.length - 1, Math.round(scrollRef.current)));
    if (n !== focusRef.current) { focusRef.current = n; setFocusIdx(n); }
  }, []);

  /** 毎フレームの前進。動いていれば true。 */
  const advance = useCallback((): boolean => {
    const m = modeRef.current;
    if (m === "pile") return false;
    let moving = false;

    // 出入りの進み具合(指で引いている間はジェスチャーが書く)。
    if (!tlDragRef.current) {
      const t = enterTargetRef.current;
      if (Math.abs(t - enterRef.current) > 0.002) { enterRef.current += (t - enterRef.current) * ENTER_K; moving = true; }
      else enterRef.current = t;
    }

    // ALIGN … 慣性 → 最寄りへ吸着。
    if (m === "align" && !aDragRef.current && enterRef.current > 0.99) {
      const last = itemsRef.current.length - 1;
      if (Math.abs(scrollVRef.current) > 0.0015) {
        scrollRef.current += scrollVRef.current;
        scrollVRef.current *= SCROLL_DECAY;
        moving = true;
      } else {
        scrollVRef.current = 0;
        const n = Math.max(0, Math.min(last, Math.round(scrollRef.current)));
        const d = n - scrollRef.current;
        if (Math.abs(d) > 0.002) { scrollRef.current += d * SNAP_K; moving = true; }
        else scrollRef.current = n;
      }
      scrollRef.current = Math.max(-0.4, Math.min(last + 0.4, scrollRef.current));
      syncFocus();
    }

    layoutRef.current();

    // スロットへ寄せる。
    const e = enterRef.current;
    const ez = ease(e);
    const cur = curRef.current;
    const from = fromRef.current;
    const slots = slotRef.current;
    for (const it of itemsRef.current) {
      const sl = slots.get(it.id);
      const fr = from.get(it.id);
      if (!sl || !fr) continue;
      if (e < 0.999) {
        cur.set(it.id, {
          x: lerp(fr.x, sl.x, ez), y: lerp(fr.y, sl.y, ez),
          s: lerp(fr.s, sl.s, ez), a: lerp(fr.a, sl.a, ez), o: lerp(fr.o, sl.o, ez),
        });
        moving = true;
      } else if (m === "timeline") {
        // ★横スワイプは**下の段ほど速く**追う(曜日が先に動き、上ほど遅れる)。
        const c = cur.get(it.id) ?? sl;
        const k = stackRef.current.get(it.id) ?? 0;
        const rate = LAG_BASE * Math.pow(LAG_DECAY, k);
        const nx = c.x + (sl.x - c.x) * rate;
        const ny = c.y + (sl.y - c.y) * 0.3;
        cur.set(it.id, { x: nx, y: ny, s: sl.s, a: sl.a, o: sl.o });
        if (Math.abs(sl.x - nx) > 0.4 || Math.abs(sl.y - ny) > 0.4) moving = true;
      } else {
        cur.set(it.id, sl);
      }
    }

    // DOM 側(文字・曜日の帯)を ref 越しに動かす — 再レンダーしない。
    if (m === "align") {
      const rows = rowRefs.current;
      for (let i = 0; i < itemsRef.current.length; i += 1) {
        const el = rows[i];
        const c = cur.get(itemsRef.current[i].id);
        if (!el || !c) continue;
        const d = i - scrollRef.current;
        el.style.transform = `translateY(${(c.y - ROW_H / 2).toFixed(1)}px)`;
        el.style.opacity = String(Math.max(0, Math.min(1, 1.25 - Math.abs(d) / 2.2)));
      }
    } else {
      const band = bandRef.current;
      const strip = stripRef.current;
      // ★地面でぺたんこに潰れていた文字が、指に連れて伸びてくる。
      if (band) band.style.setProperty("--tl", String(TL_FLAT + (1 - TL_FLAT) * ez));
      if (strip) strip.style.transform = `translateX(${(-worldRef.current).toFixed(1)}px)`;
    }
    return moving;
  }, [syncFocus]);

  useEffect(() => {
    loopRef.current = () => {
      const M = matterRef.current;
      const engine = engineRef.current;
      if (!M || !engine) { runningRef.current = false; return; }

      if (!frozenRef.current) M.Engine.update(engine, 1000 / 60);
      const moving = advance();

      shardsRef.current = shardsRef.current
        .map((s) => ({ ...s, x: s.x + s.vx, y: s.y + s.vy, vy: s.vy + 0.6, life: s.life - 1000 / 60 / SHARD_MS }))
        .filter((s) => s.life > 0);

      drawRef.current();

      if (modeRef.current === "pile") {
        const awake = piecesRef.current.some((p) => !p.body.isSleeping);
        if (!awake && shardsRef.current.length === 0 && !pendingBakeRef.current) { runningRef.current = false; return; }
      } else if (!moving && shardsRef.current.length === 0 && !pendingBakeRef.current) {
        runningRef.current = false; return;
      }
      rafRef.current = requestAnimationFrame(() => loopRef.current());
    };
  }, [advance]);

  useEffect(() => onFontsReady(() => {
    clearSolidBitmaps(); primeTagMetrics(); wake(); drawRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  useEffect(() => { primeTagMetrics(); }, []);

  const visibleRef = useRef(active);
  useEffect(() => {
    const on = !!appActive && active && !openId;
    visibleRef.current = !!appActive && active;
    activeRef.current = on;
    if (on) wake();
    else {
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
    }
  }, [appActive, active, openId, wake]);

  const planPile = useCallback((list: Task[]) => {
    const { w, h } = sizeRef.current;
    return pileOf(list, new Date(), w, h - navHeightPx() - MASTHEAD_H);
  }, []);

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

  useEffect(() => {
    viewRef.current = view;
    piecesRef.current = piecesRef.current.map((p) => ({ ...p, paint: { ...p.paint, view } }));
    wake();
    drawRef.current();
  }, [view, wake]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let disposed = false;

    const setup = async () => {
      const M = await import("matter-js");
      if (disposed) return;
      matterRef.current = M;
      sizeRef.current = { w: el.offsetWidth, h: el.offsetHeight };
      const engine = M.Engine.create({ enableSleeping: true });
      engine.gravity.y = 1.4;
      engineRef.current = engine;
      rebuildWalls(M, engine, sizeRef.current.w, sizeRef.current.h);
      draw();
      setReady(true);
    };
    setup();

    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (Math.abs(w - sizeRef.current.w) < 0.5 && Math.abs(h - sizeRef.current.h) < 0.5) return;
      sizeRef.current = { w, h };
      const M = matterRef.current;
      const engine = engineRef.current;
      if (M && engine) { rebuildWalls(M, engine, w, h); wake(); }
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

  // タスクの増減・中身の変化に山を合わせる。★モード中は触らない。
  useEffect(() => {
    if (modeRef.current !== "pile") return;
    const M = matterRef.current;
    const engine = engineRef.current;
    const { w } = sizeRef.current;
    if (!M || !engine || !w) return;

    const { keep, scale } = planPile(tasks);
    const keepIds = new Set(keep.map((t) => t.id));
    const shownIds = new Set(piecesRef.current.map((p) => p.id));
    const aliveIds = new Set(tasks.map((t) => t.id));
    const pushedOut = [...shownIds].some((id) => !keepIds.has(id) && aliveIds.has(id));
    if (piecesRef.current.length && pushedOut) { dropAll(); return; }
    const rescale = piecesRef.current.length > 0 && Math.abs(scale - scaleRef.current) > SCALE_EPS;
    scaleRef.current = scale;
    const unit = UNIT * scale;
    const alive = new Map(keep.map((t) => [t.id, t]));

    for (const p of piecesRef.current) {
      if (!alive.has(p.id)) M.Composite.remove(engine.world, p.body);
    }

    piecesRef.current = piecesRef.current
      .filter((p) => alive.has(p.id))
      .map((p) => {
        const t = alive.get(p.id) as Task;
        const paint = paintOf(t, viewRef.current);
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
    const added = dropOrder(keep, new Date())
      .filter((t) => !have.has(t.id))
      .map((t, i) => makePiece(M, t, viewRef.current, w, i, unit));
    if (added.length) {
      M.Composite.add(engine.world, added.map((p) => p.body));
      piecesRef.current = [...piecesRef.current, ...added];
    }
    wake();
  }, [tasks, wake, ready, planPile, dropAll]);

  // ── モードの出入り ─────────────────────────────────────────
  /** ★一覧は**未完了の全タスク**から作る(山は読めるように間引くが、一覧・俯瞰は
   *  全部見えないと用を成さない)。並びはモードごとに決める。 */
  const buildItems = useCallback((m: Mode): Item[] => {
    const today = new Date();
    const src = m === "align"
      ? [...tasksRef.current].sort((a, b) => areaOf(b, today) - areaOf(a, today))   // 優先度(面積)の降順
      : dropOrder(tasksRef.current, today);
    return src.map((t) => {
      const paint = paintOf(t, viewRef.current);
      return { id: t.id, task: t, paint, spec: paint.spec, tag: paint.tag ?? "" };
    });
  }, []);

  /** いまの見え方を出発点として控える(モードへ入る・出る動きの起点)。 */
  const snapshot = useCallback((list: Item[]) => {
    const M = matterRef.current;
    const { w, h } = sizeRef.current;
    const pileUnit = UNIT * scaleRef.current;
    const from = new Map<string, Slot>();
    const byId = new Map(piecesRef.current.map((p) => [p.id, p]));
    for (const it of list) {
      const p = byId.get(it.id);
      if (p) from.set(it.id, { x: p.body.position.x, y: p.body.position.y, s: pileUnit / bakeUnitRef.current, a: p.body.angle, o: 1 });
      // 山に居ない(間引かれた)ものは画面の下から入ってくる。
      else from.set(it.id, { x: w * (0.2 + 0.6 * frac(it.id)), y: h + 140, s: pileUnit / bakeUnitRef.current, a: 0, o: 1 });
    }
    void M;
    fromRef.current = from;
    curRef.current = new Map(from);
  }, []);

  /** 焼く単位を決める … いちばん大きい図形が目標の寸法になるように。 */
  const bakeUnitFor = useCallback((list: Item[], maxH: number, maxW: number, boost: number) => {
    let mh = 1; let mw = 1;
    for (const it of list) {
      const b = shapeBounds(it.paint);
      mh = Math.max(mh, b.maxY - b.minY);
      mw = Math.max(mw, b.maxX - b.minX);
    }
    return Math.min(maxH / mh, maxW / mw) * boost;
  }, []);

  const freeze = useCallback((on: boolean) => {
    const engine = engineRef.current;
    frozenRef.current = on;
    if (engine) engine.gravity.y = on ? 0 : 1.4;
  }, []);

  const enterAlign = useCallback(() => {
    const list = buildItems("align");
    if (!list.length) return;
    // 焦点は 1.0 で焼いた絵の実寸になるので、焼く単位に焦点ぶんを掛けておく。
    bakeUnitRef.current = bakeUnitFor(list, ALIGN_MAX_H, ALIGN_MAX_W, 1 + FOCUS_BOOST);
    itemsRef.current = list;
    setItems(list);
    scrollRef.current = 0; scrollVRef.current = 0;
    focusRef.current = 0; setFocusIdx(0);
    slotRef.current = new Map();
    snapshot(list);
    layoutAlign();
    modeRef.current = "align"; setMode("align");
    enterRef.current = 0; enterTargetRef.current = 1;
    freeze(true);
    haptic(10);
    wake();
  }, [buildItems, bakeUnitFor, snapshot, layoutAlign, freeze, wake]);

  const enterTimeline = useCallback((byDrag: boolean) => {
    const list = buildItems("timeline");
    if (!list.length) return;
    const today = new Date();
    const ds: string[] = [];
    for (let i = 0; i < HORIZON; i += 1) {
      const d = new Date(today); d.setDate(today.getDate() + i); ds.push(ymd(d));
    }
    daysRef.current = ds; setDays(ds);
    bakeUnitRef.current = bakeUnitFor(list, TL_MAX_H, (sizeRef.current.w / LANES_VISIBLE) * 0.66, 1);
    itemsRef.current = list;
    setItems(list);
    worldRef.current = 0;
    slotRef.current = new Map();
    stackRef.current = new Map();
    snapshot(list);
    layoutTimeline();
    modeRef.current = "timeline"; setMode("timeline");
    enterRef.current = 0;
    enterTargetRef.current = byDrag ? 0 : 1;   // 指で引くときは指が進める
    freeze(true);
    if (!byDrag) haptic(10);
    wake();
  }, [buildItems, bakeUnitFor, snapshot, layoutTimeline, freeze, wake]);

  /** 山へ戻す … いま見えている位置を body へ書き戻し、重力を返す(そこから落ちる)。 */
  const enterPile = useCallback(() => {
    const M = matterRef.current;
    if (M) {
      const byId = new Map(piecesRef.current.map((p) => [p.id, p]));
      for (const [id, c] of curRef.current) {
        const p = byId.get(id);
        if (!p) continue;
        M.Body.setPosition(p.body, { x: c.x, y: c.y });
        M.Body.setAngle(p.body, c.a);
        M.Body.setVelocity(p.body, { x: 0, y: 0 });
        M.Sleeping.set(p.body, false);
      }
    }
    modeRef.current = "pile"; setMode("pile");
    itemsRef.current = []; setItems([]);
    enterRef.current = 0; enterTargetRef.current = 0;
    tlDragRef.current = false;
    freeze(false);
    haptic(8);
    wake();
  }, [freeze, wake]);

  const patch = (id: string, p: Partial<ComposerData>) => {
    const next: AppState = structuredClone(appState);
    const t = next.tasks.find((x) => x.id === id);
    if (t) Object.assign(t, p);
    persist(next);
  };

  const complete = (t: Task, final: ComposerData) => {
    haptic(18);
    const piece = piecesRef.current.find((p) => p.id === t.id);
    if (piece && modeRef.current === "pile") {
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
      const M = matterRef.current;
      if (M) for (const p of piecesRef.current) M.Sleeping.set(p.body, false);
      wake();
    }
    const next: AppState = structuredClone(appState);
    const task = next.tasks.find((x) => x.id === t.id);
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

  // 図形をタップして開く。★モード中は**スロットの矩形**で当てる(body は画面に居ない)。
  const tapAt = (clientX: number, clientY: number) => {
    if (dragged?.current) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const px = clientX - r.left;
    const py = clientY - r.top;
    if (modeRef.current === "pile") {
      const M = matterRef.current;
      if (!M) return;
      const hits = M.Query.point(piecesRef.current.map((p) => p.body), { x: px, y: py });
      if (!hits.length) return;
      const piece = piecesRef.current.find((p) => p.body === hits[hits.length - 1]);
      if (piece) { haptic(8); setOpenId(piece.id); }
      return;
    }
    const bakeUnit = bakeUnitRef.current;
    for (let i = itemsRef.current.length - 1; i >= 0; i -= 1) {
      const it = itemsRef.current[i];
      const c = curRef.current.get(it.id);
      if (!c) continue;
      const b = shapeBounds(it.paint);
      const hw = ((b.maxX - b.minX) * bakeUnit * c.s) / 2;
      const hh = ((b.maxY - b.minY) * bakeUnit * c.s) / 2;
      if (px >= c.x - hw && px <= c.x + hw && py >= c.y - hh && py <= c.y + hh) {
        haptic(8); setOpenId(it.id); return;
      }
    }
  };

  // ── ジェスチャー ───────────────────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let g: {
      id: number; x: number; y: number; edge: boolean; axis: "" | "x" | "y";
      moved: boolean; lastX: number; lastY: number; vy: number;
    } | null = null;

    const down = (e: PointerEvent) => {
      if (g) return;
      if (!visibleRef.current) return;
      if (document.documentElement.hasAttribute("data-overlay")) return;
      if (dragged) dragged.current = false;
      const left = wrap.getBoundingClientRect().left;
      g = {
        id: e.pointerId, x: e.clientX, y: e.clientY, edge: e.clientX - left < EDGE_PX,
        axis: "", moved: false, lastX: e.clientX, lastY: e.clientY, vy: 0,
      };
      if (modeRef.current === "align") { aDragRef.current = true; scrollVRef.current = 0; }
    };

    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.axis) {
        if (Math.abs(dx) < AXIS_PX && Math.abs(dy) < AXIS_PX) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (Math.hypot(dx, dy) > TAP_MOVE) { g.moved = true; if (dragged) dragged.current = true; }
      const m = modeRef.current;

      if (m === "pile" && g.axis === "y" && dy < 0) {
        // ★下から上へ … 指に連れて曜日が地面から伸びてくる。
        if (!tlDragRef.current) { tlDragRef.current = true; enterTimeline(true); }
        enterRef.current = Math.max(0, Math.min(1, -dy / TL_SPAN));
        wake();
      } else if (m === "timeline" && tlDragRef.current && g.axis === "y") {
        enterRef.current = Math.max(0, Math.min(1, -dy / TL_SPAN));
        wake();
      } else if (m === "align" && g.axis === "y") {
        const d = e.clientY - g.lastY;
        scrollRef.current -= d / ROW_H;
        g.vy = d;
        syncFocus();
        wake();
      } else if (m === "timeline" && !tlDragRef.current && g.axis === "x") {
        const { w } = sizeRef.current;
        const laneW = w / LANES_VISIBLE;
        const max = Math.max(0, laneW * (daysRef.current.length - LANES_VISIBLE));
        worldRef.current = Math.max(0, Math.min(max, worldRef.current - (e.clientX - g.lastX)));
        wake();
      }
      g.lastX = e.clientX;
      g.lastY = e.clientY;
    };

    const up = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const d = g; g = null;
      aDragRef.current = false;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const m = modeRef.current;

      if (tlDragRef.current) {
        // 引き上げ切ったか？ 半分未満なら文字が倒れて山へ戻る。
        tlDragRef.current = false;
        if (enterRef.current > 0.42) { enterTargetRef.current = 1; haptic(10); }
        else { enterPile(); }
        wake();
        return;
      }
      if (!d.moved) { tapAt(e.clientX, e.clientY); return; }

      if (m === "pile") {
        if (d.edge && d.axis === "x" && dx > SWIPE_PX) enterAlign();
      } else if (m === "align") {
        if (d.axis === "x" && dx < -SWIPE_PX) enterPile();
        else if (d.axis === "y") { scrollVRef.current = -(d.vy * FLICK_K) / ROW_H; wake(); }
      } else if (m === "timeline") {
        if (d.axis === "y" && dy > SWIPE_PX) enterPile();
        else if (d.axis === "x") {
          const { w } = sizeRef.current;
          const laneW = w / LANES_VISIBLE;
          const max = Math.max(0, laneW * (daysRef.current.length - LANES_VISIBLE));
          worldRef.current = Math.max(0, Math.min(max, Math.round(worldRef.current / laneW) * laneW));
          wake();
        }
      }
    };

    wrap.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      wrap.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enterAlign, enterTimeline, enterPile, syncFocus, wake]);

  const today = new Date();
  const { w: sw } = sizeRef.current;
  const laneW = (sw || 390) / LANES_VISIBLE;
  // 曜日は全レーン同じ大きさ。3文字がレーンに収まるところまでで頭打ちにする。
  // ★1文字ぶんの送りは Archivo(太字・幅88%)で概ね 0.70em。3文字がレーンに必ず
  //   収まる大きさで頭打ちにする(第53巡: 実機で MON が左へはみ出していた)。
  const laneFs = Math.min(SWISS_XL, Math.floor((laneW * 0.92) / (3 * 0.70)));
  const layerName = mode === "align" ? "ALIGN" : mode === "timeline" ? "TIMELINE" : "GRAVITY";

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div ref={wrapRef} style={{ position: "absolute", inset: 0, touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", willChange: "transform" }}
        />
      </div>

      <LayerName text={layerName} right={mode === "pile" ? <ViewToggle view={view} onChange={setView} /> : undefined} />

      {/* ALIGN … 円弧の右に、残り日数・題・タグ。**文字は水平を保つ**(回さない)。 */}
      {mode === "align" && (
        <div className="mode-panel" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {items.map((it, i) => {
            const dl = daysLabel(it.task.dueDate, today);
            const focus = i === focusIdx;
            const numSize = focus ? SWISS_LG : SWISS_MD;
            return (
              <div
                key={it.id}
                ref={(el) => { rowRefs.current[i] = el; }}
                className="mode-row" data-id={it.id}
                style={{
                  position: "absolute", top: 0, left: TEXT_LEFT, right: SPACE.lg, height: ROW_H,
                  display: "flex", flexDirection: "column", justifyContent: "center", willChange: "transform",
                }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.sm }}>
                  <span style={{
                    fontFamily: LATIN, fontWeight: 800, letterSpacing: "-0.03em", color: INK,
                    fontSize: dl.kind === "num" ? numSize : TYPE.head, lineHeight: 0.9,
                    opacity: dl.kind === "num" ? 1 : 0.55,
                  }}>{dl.text}</span>
                  {dl.sub && (
                    <span style={{
                      fontFamily: LATIN, fontWeight: 700, fontSize: TYPE.micro, letterSpacing: "0.18em", color: MUTED,
                    }}>{dl.sub}</span>
                  )}
                </div>
                <div style={{
                  fontFamily: SANS, fontWeight: 600, color: INK, marginTop: SPACE.xs,
                  fontSize: focus ? TYPE.head : TYPE.lead,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{it.task.title || "無題"}</div>
                <div style={{
                  fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: 700, letterSpacing: "0.14em",
                  color: tagColor(it.paint.tag), marginTop: SPACE.hair,
                }}>#{it.tag.toUpperCase()}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* TIMELINE … 地面に立つ巨大な曜日。指に連れて下から伸びる(--tl)。 */}
      {mode === "timeline" && (
        <div
          ref={bandRef}
          className="tl-band"
          style={{
            // ★タブバーと**ページの点**の上へ逃がす(点と曜日が重なっていた)。
            position: "absolute", left: 0, right: 0, bottom: `calc(${navCssH()} + ${SPACE.xl}px)`,
            height: LANE_HEAD_H, overflow: "hidden", pointerEvents: "none",
          }}>
          <div ref={stripRef} style={{ position: "absolute", left: 0, bottom: 0, display: "flex", willChange: "transform" }}>
            {days.map((d, i) => (
              <div key={d} style={{ width: laneW, flex: "0 0 auto", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                <span style={{
                  fontFamily: LATIN, fontWeight: 800, fontSize: laneFs, lineHeight: 0.86,
                  letterSpacing: "-0.04em", whiteSpace: "nowrap", paddingBottom: SPACE.xs,
                  // ★今日は**赤**。語(TODAY)ではなく、その日の曜日を出す(第53巡)。
                  color: i === 0 ? RUST : gradeInk(i),
                }}>{weekdayOf(d)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === "pile" && tasks.length === 0 && <DemoSeedButton label="デモのタスクを入れる" onSeed={seedDemo} lifted />}

      {open && (
        <TaskComposer
          key={open.id}
          data={open}
          mode="task"
          onCommit={(d) => patch(open.id, d)}
          onConfirm={(d) => complete(open, d)}
          onDelete={() => remove(open.id)}
          onClose={(d) => { patch(open.id, d); setOpenId(null); }}
        />
      )}
    </div>
  );
}

/** タブバーの高さ(CSS の式のまま)。 */
const navCssH = () => "var(--nav-h, 96px)";

/** 手前のレーンほど濃く、先のレーンほど薄く沈める(遠近の気配)。 */
function gradeInk(i: number): string {
  const a = Math.max(0.14, 0.46 - i * 0.11);
  return `color-mix(in srgb, ${INK} ${Math.round(a * 100)}%, ${PAPER})`;
}

function primeTagMetrics() {
  if (typeof window === "undefined") return;
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 32));
  const step = () => {
    if (primeAdvances(allTagLabels(), allTagFaces(), 4) > 0) idle(step as never);
  };
  idle(step as never);
}

function makePiece(
  M: typeof import("matter-js"), t: Task, view: SolidView, w: number, i: number, unit: number,
): Piece {
  const paint = paintOf(t, view);
  const b = shapeBounds(paint);
  const hw = ((b.maxX - b.minX) * unit) / 2;
  const x = Math.max(hw + 6, Math.min(Math.max(w - hw - 6, hw + 6), w * 0.14 + frac(t.id) * w * 0.72));
  const y = -((b.maxY - b.minY) * unit) - i * (110 + 100 * unit / UNIT);
  const { body, ox, oy } = makeBody(M, paint, x, y, unit);
  return { id: t.id, body, spec: paint.spec, paint, girth: girthOf(paint, unit), ox, oy };
}

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
    body = M.Bodies.circle(x, y, (w * unit) / 2, opts);
  } else {
    const src = sectionOutline(n);
    const step = Math.max(1, Math.ceil(src.length / PHYS_VERTS));
    const verts = src
      .filter((_, k) => k % step === 0)
      .map((q) => ({ x: q.x * w * unit, y: q.y * h * unit }));
    body = M.Bodies.fromVertices(x, y, [verts], opts);
    const c = M.Vertices.centre(verts);
    ox = -c.x;
    oy = -c.y;
  }
  M.Body.setMass(body, massOf(paint.spec) * MASS_K);
  return { body, ox, oy };
}

function girthOf(paint: SolidPaint, unit: number): number {
  const b = shapeBounds(paint);
  return Math.min(b.maxX - b.minX, b.maxY - b.minY) * unit;
}

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
    if (n > 0 && (scale < SCALE_MIN || Math.sqrt(row.area) * UNIT * scale < CULL_PX)) break;
    total = next;
    n++;
  }
  const keep = sorted.slice(0, n).map((r) => r.t);
  let scale = Math.max(SCALE_MIN, scaleFor(total));
  for (const t of keep) {
    const { w: bw, h: bh } = rectOf(specOf(t, today));
    scale = Math.min(scale, (w * FIT_W) / (bw * UNIT), (usableH * FIT_H) / (bh * UNIT));
  }
  return { keep, scale: Math.max(0.12, scale) };
}

function rebuildWalls(M: typeof import("matter-js"), engine: Engine, w: number, h: number, withFloor = true) {
  const old = M.Composite.allBodies(engine.world).filter((b) => b.isStatic);
  M.Composite.remove(engine.world, old);
  const T = 200;
  const floorY = h - navHeightPx();
  M.Composite.add(engine.world, [
    ...(withFloor ? [M.Bodies.rectangle(w / 2, floorY + T / 2, w + T * 2, T, { isStatic: true, friction: 0.6 })] : []),
    M.Bodies.rectangle(-T / 2, h / 2, T, h * 3, { isStatic: true, friction: 0.4 }),
    M.Bodies.rectangle(w + T / 2, h / 2, T, h * 3, { isStatic: true, friction: 0.4 }),
  ]);
}

function navHeightPx(): number {
  if (typeof window === "undefined") return 96;
  const shell = document.querySelector("[data-app-shell]") ?? document.documentElement;
  const v = getComputedStyle(shell).getPropertyValue("--nav-h").trim();
  if (!v) return 96;
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;height:${v}`;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px || 96;
}

function frac(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (Math.imul(h, 2654435761) >>> 0) / 4294967296;
}
