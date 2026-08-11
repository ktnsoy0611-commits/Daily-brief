"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GOLD, GREEN, INK, JOURNAL_BG, JOURNAL_FIG, JOURNAL_MUTED, NAV_BOTTOM_GAP, PAPER, SANS } from "@/lib/constants";
import { LEVEL_MS } from "@/components/VoiceRecorder";
import { haptic } from "@/lib/helpers";
import type { VoiceControls, VoiceTrim } from "@/lib/types";

// ★声の記録の画面(2026-08-11)。純粋幾何学ミニマリズム。
//
// ■ 構図
//   ・地は暖かみのある中間グレー。円はほぼ白で、地よりはっきり明るい
//     (差が小さいと「背景に見える」と言われた)。
//   ・画面の外に中心を置いた**巨大な円が2つ**、左右から寄ってくる。
//     2つの円のあいだに残る細い縦の帯(砂時計の腰)がテープの通り道。
//     腰の高さ=掴む高さ。タブの中では下寄り、全画面のオーバーレイでは
//     画面の真ん中あたりに置く。
//   ・波形は**円に重ならない**よう、腰の少し上に細く狭く置く。録音中は
//     赤い線が立ち、録れた棒がその左へ流れる(線の右は点線=まだ録っていない)。
//     止めると帯が広がり、線が左右2本へ分かれて全体表示(トリミング)になる。
//   ・最下部にカセットの操作キーが4つ。
//
// ■ 数字の扱い(ユーザー指定)
//   ・**どれも強調しない**。録音中の経過も、録音後の長さも、細く小さく
//     字間を広げて置くだけ。
//   ・切り出し中の秒数は、**触っている円にだけ**出す。
//
// ■ 手触り
//   ・画面を開いたときに、円が左右から入ってくる(★録音の開始では流さない)。
//   ・録音中は円がゆっくり回る。縁の目盛りで回転が読める。
//   ・円を掴むと**その円だけ少しふくらむ**(縁の線の色は変えない)。
//     iPhoneのWebアプリでは手応えが返らないので、目で分かる反応にしてある。
//   ・指を離すと**惰性**で回り続け、摩擦で止まる。止まったところで長さを確定。
//
// ■ 操作キー(下段)
//   REC … 録音の開始/停止。録音中は押し込まれたまま。録り直しにも使う。
//   PAUSE … 録音の一時停止/再開(録音中だけ点灯)。もう一度押すと続きから。
//   SEND … 文字起こしへ送る(録音後だけ点灯)。
//   CANCEL … 少し間を空けて右端。いつでも押せて、録音を捨てて最初へ戻す。
//
// ■ 性能
//   波形も切り出し位置も **ref** に持ち、canvas へ rAF で描く。指の動きで
//   React を再レンダーしない(§14で潰した性能の穴を踏まないため)。
//   ★毎フレームの textContent 代入・font-size の遷移は禁止。値が同じでも
//   レイアウトを汚し、巨大な円を含むページ全体のレイアウトをやり直す
//   (実測でこれだけで1ドラッグ508ms。§41参照)。
//   ★録音中に setState する仕掛けを置かないこと。以前は経過時間を100msごとに
//   state へ入れていて、そのたびに全体が再レンダーされ「画面がちらつく」
//   原因になっていた。時間は rAF から textContent で書く。
//
// ■ ハプティクスの限界(正直に書いておく)
//   haptic() は navigator.vibrate。**iOS Safari はこのAPIを持たない**ため、
//   実機(iPhone)では手応えは返らない。Androidと対応ブラウザでのみ効く。
//   → だから掴んだ合図は**視覚**(円がふくらむ)で持たせている。haptic の
//     呼び出しはAndroid向けの付け足しとして残してあるだけ。

/** 波形の棒の間隔と太さ(px)。録音中は細かく、止めたあと(全体表示)は太め。 */
const BAR_PITCH_REC = 5;
const BAR_W_REC = 3;
const BAR_PITCH_ALL = 9;
const BAR_W_ALL = 5;
/** ダイヤル1回転で動かす割合。小さいほど「重い」。 */
const TURN_RATIO = 0.5;
/** 手応えを返す刻み(rad)。15度ごと。 */
const NOTCH = (15 * Math.PI) / 180;
/** 開始と終了が潰れないよう、最低これだけは残す。 */
const MIN_SPAN = 0.04;
/** ダイヤルの直径(器の幅に対する比)。画面をはみ出す大きさ。 */
const DIAL_RATIO = 1.30;
/** 中心のx(器の幅に対する比)。左右へ大きくはみ出す。
 *  ★砂時計の腰の幅は `器の幅 x (1 + 2*DIAL_CX - DIAL_RATIO)` で決まる。
 *  直径を変えるときは、腰が同じ 0.30 になるよう DIAL_CX も一緒に動かすこと
 *  (直径だけ縮めると腰が広がって、砂時計の締まりが無くなる)。 */
const DIAL_CX = 0.30;
/** ★波形の帯の中心を、円の中心からどれだけ上へ置くか。
 *  「真ん中の少し上」(ユーザー指定)。 */
const WAVE_DY = -136;
/** 波形の帯の高さ。録音中は細く、止めると広がる。 */
const WAVE_H_REC = 58;
const WAVE_H_ALL = 104;
/** 録音中の帯は、円に**絶対に重ならない**幅までしか広げない。
 *  実際の幅はコードが円の式から計算する(WAVE_MARGIN は左右の余白)。 */
const WAVE_MARGIN = 6;
/** 止めたあと(全体表示)の左右の余白。 */
const WAVE_PAD_ALL = 26;
/** 録音中の赤い線を帯のどこに立てるか(左からの割合)。左が録れた分、
 *  右がまだ録っていない分(点線)。真ん中より右に置いて履歴を長く見せる。 */
const REC_LINE_AT = 0.66;
/** 録音を止めたとき、帯が広がり中心の線が左右へ分かれるまでの時間(ms)。 */
const SPLIT_MS = 420;
/** ★円を置く「帯」。上=左上のタイトル(Masthead)の下端、下=タブバーの上端。
 *  円の中心はこの帯のちょうど真ん中に来る(ユーザー指定)。
 *  タブの中でも全画面のオーバーレイでも**同じ値**を使うので、両者の円は
 *  必ず一致する。Masthead の高さを変えたら BAND_TOP を測り直すこと
 *  (実測: top 16 + 高さ 68 = 84)。 */
const BAND_TOP = 84;
const BAND_BOTTOM = 80;
/** 縁の目盛りの本数。 */
const TICKS = 5;
/** 物理キーの寸法。丸いキーで、出っ張り(depth)ぶん浮いて見える。 */
const KEY_D = 54;
const KEY_DEPTH = 6;
/** ★操作キーの列を器の下端からどれだけ上に置くか。タブバーの高さぶん。
 *  オーバーレイ(タブバーを覆う)でも同じ値を使い、見た目を揃える。 */
const KEY_BOTTOM = `calc(76px + ${NAV_BOTTOM_GAP})`;
/** ★タブの中で、器をタブバーの下へどれだけ潜らせるか。
 *  タブバーの高さ + 祖先(data-tab-scroll-root)の下パディング16px。
 *  これで器の下端がちょうど画面の下端に届く。 */
export const STUDIO_BLEED = `calc(92px + ${NAV_BOTTOM_GAP})`;
/** 円が外へ出ていくアニメーションの長さ(globals.css の vs-dial-out-* と揃える)。 */
const DIAL_OUT_MS = 380;
/** ★これ未満の音は棒として描かない。小さい点が並ぶと汚く見えるため
 *  (ユーザー指定)。 */
const LEVEL_FLOOR = 0.1;
/** ランプの色。トリミングの縦線もこの赤を使う。 */
const LAMP_REC = "#D0412B";
/** 指を離したあとの惰性。1フレームごとに速度へ掛ける摩擦と、止まる閾値。 */
const COAST_FRICTION = 0.94;
const COAST_STOP = 0.00035;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function mmss(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 波形の並びを、表示する本数へ均す(その区間の最大値を取る)。 */
function resample(levels: number[], n: number): number[] {
  if (n <= 0) return [];
  const out = new Array<number>(n).fill(0);
  if (levels.length === 0) return out;
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * levels.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * levels.length) / n));
    let m = 0;
    for (let k = a; k < b && k < levels.length; k++) m = Math.max(m, levels[k]);
    out[i] = m;
  }
  return out;
}

export function VoiceStudio({ voice, dim, onClose, bleed = "0px" }: {
  voice: VoiceControls;
  /** オーバーレイとして幕の上に出すか。 */
  dim?: boolean;
  /** 幕を閉じる(オーバーレイのときだけ)。CANCEL・送信の完了で呼ぶ。 */
  onClose?: () => void;
  /** ★器より下へどれだけはみ出すか(CSSの長さ)。
   *  タブの中ではタブバーのぶんだけ**下へ潜らせる**。こうしないと円が
   *  タブバーの上端でスパッと切れ、そこに横一直線の境目が出る(実機で
   *  「画面の下部がタブのところで切れている」と報告された症状)。
   *  ★これを入れることで、器の実高さが「タブの中」でも「全画面の
   *  オーバーレイ」でもほぼ画面いっぱいで揃う。 */
  bleed?: string;
}) {
  // 幕の上でも、地と図の関係(わずかな明度差)は同じにする。
  const ground = dim ? "#2A2A28" : JOURNAL_BG;
  const figure = dim ? "#3A3A37" : JOURNAL_FIG;
  const fg = dim ? PAPER : INK;
  const mute = dim ? "rgba(255,255,255,0.46)" : JOURNAL_MUTED;
  const tick = dim ? "rgba(255,255,255,0.40)" : "rgba(26,26,24,0.38)";
  // 物理キーの色。★どれも不透明にする(下が明るい円か地かで変わらないように)。
  const well = dim ? "#141417" : "#8F8F89";
  const capOff = dim ? "#383835" : "#A6A6A0";
  const lampOff = dim ? "#1F1F22" : "#8A8A84";

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reelL = useRef<SVGSVGElement>(null);
  const reelR = useRef<SVGSVGElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const markL = useRef<HTMLDivElement>(null);
  const markR = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // ★波形のcanvasの実寸は **ref に控えておく**。draw() の中で clientWidth /
  // clientHeight を読むと、その瞬間に同期レイアウトが走る。ダイヤルの
  // transform を書いた直後の毎フレームでこれをやると、巨大な円を含む
  // ページ全体のレイアウトを毎回やり直すことになり、実測(4倍スロットリング)で
  // 1ドラッグあたり clientWidth の取得だけで 374ms 使っていた。
  const cvSizeRef = useRef({ w: 0, h: 0 });
  // ★切り出しの位置は **ref**。ダイヤルを回すたびに setState すると
  // 1ジェスチャーで数十回の再レンダーになる(§14)。
  const trimRef = useRef<VoiceTrim>({ start: 0, end: 1 });
  /** ★止めた直後、中心の1本が左右2本へ分かれていく進み具合(0→1)。
   *  ここも ref。毎フレーム setState すると再レンダーの嵐になる。 */
  const splitRef = useRef(1);
  const [splitting, setSplitting] = useState(false);
  /** いま掴んでいる円。掴んでいなければ null。 */
  const [active, setActive] = useState<"L" | "R" | null>(null);
  /** 円が左右から入ってくるアニメーションの再生キー。 */
  const [enterKey, setEnterKey] = useState(0);
  /** 指を離したあとの惰性。回っているrAFのidを持つ。 */
  const coastRef = useRef<{ raf: number } | null>(null);
  const [coasting, setCoasting] = useState(false);
  /** ★オーバーレイが閉じていく最中。円が左右へ出ていく間だけ true。 */
  const [leaving, setLeaving] = useState(false);

  const { state, durationMs, levelsRef, elapsedMs, paused } = voice;
  const recording = state === "recording";
  const review = state === "review";
  const sending = state === "sending";

  useEffect(() => {
    if (state === "recording" || state === "idle") trimRef.current = { start: 0, end: 1 };
  }, [state, durationMs]);

  // ★円の入場は**画面が出たときだけ**。以前は録音を始めた瞬間にも流して
  // いたが、getUserMedia の許可待ちのぶん遅れて再生され、しかも同時に回転が
  // 始まるため「録音し始めると円が変な挙動をする」と報告された。
  // 入場は画面の初回表示に限る(remount しないので rot も保たれる)。
  useEffect(() => { setEnterKey(1); }, []);

  useLayoutEffect(() => {
    const el = boxRef.current;
    const cv = canvasRef.current;
    if (!el || !cv) return;
    const read = () => {
      // ★値が同じなら setState しない。ResizeObserver は波形の帯が広がる
      // 間ずっと発火するので、毎回新しいオブジェクトを入れると1フレームごとに
      // 全体が再レンダーされ、画面がちらつく。
      setSize((prev) => (prev.w === el.clientWidth && prev.h === el.clientHeight
        ? prev : { w: el.clientWidth, h: el.clientHeight }));
      cvSizeRef.current = { w: cv.clientWidth, h: cv.clientHeight };
    };
    const ro = new ResizeObserver(read);
    ro.observe(el);
    ro.observe(cv);
    read();
    return () => ro.disconnect();
  }, []);

  // ---- 円の配置 --------------------------------------------------------------
  const w = size.w || 390;
  const h = size.h || 620;
  const RD = w * DIAL_RATIO;                 // 直径
  // ★中心は「タイトルの下端 〜 タブバーの上端」のちょうど真ん中(ユーザー指定)。
  // 器の高さはタブでもオーバーレイでも画面いっぱいなので、両者で一致する。
  const cy = (BAND_TOP + (h - BAND_BOTTOM)) / 2;
  const cxL = -w * DIAL_CX;
  const cxR = w * (1 + DIAL_CX);

  // ---- 波形の帯の置き場 ------------------------------------------------------
  // ★録音中の帯は「真ん中の少し上」に置き、**円に重ならない幅**までしか
  // 広げない。円は中心が画面の外にあるので、外接矩形ではなく円の式で見ること。
  // 中心から dy 離れた高さでの左右の隙間 = (cxR - cxL) - 2*sqrt(R^2 - dy^2)。
  // 帯の上端/下端のうち、中心に近い方(=隙間が最小)で決まる。
  const waveCy = cy + WAVE_DY;
  const gapAt = (dy: number) => {
    const s = (RD / 2) * (RD / 2) - dy * dy;
    return (cxR - cxL) - 2 * (s > 0 ? Math.sqrt(s) : 0);
  };
  const nearDy = Math.max(0, Math.abs(WAVE_DY) - WAVE_H_REC / 2);
  const waveWRec = Math.max(90, Math.min(w - 2 * WAVE_PAD_ALL, gapAt(nearDy) - 2 * WAVE_MARGIN));
  const waveWAll = w - 2 * WAVE_PAD_ALL;
  // 数字は帯の下、腰のところへ。
  const timeTop = waveCy + WAVE_H_ALL / 2 + 10;

  // ---- 波形を描く ------------------------------------------------------------
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    // ★実寸は ref から。ここで clientWidth を読むと毎フレーム同期レイアウトが走る。
    const { w: cw, h: ch } = cvSizeRef.current;
    if (cw === 0 || ch === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
      cv.width = Math.round(cw * dpr);
      cv.height = Math.round(ch * dpr);
    }
    const c = cv.getContext("2d");
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);

    const all = levelsRef.current;
    const t = trimRef.current;
    const mid = ch / 2;
    const bar = (x: number, v: number, color: string, bw: number) => {
      // ★小さい音は棒にしない(ユーザー指定)。丸い端(lineCap:"round")の
      // せいで、短い線は**点**として描かれ、それが中心線に沿って数珠つなぎに
      // 並ぶと汚く見える。しきい値未満は中心線だけを残す。
      if (v < LEVEL_FLOOR) return;
      const hgt = Math.max(bw * 1.6, v * (ch - bw));
      c.lineWidth = bw;
      c.strokeStyle = color;
      c.beginPath();
      c.moveTo(x, mid - hgt / 2);
      c.lineTo(x, mid + hgt / 2);
      c.stroke();
    };

    if (recording) {
      // ── 録音中 ──────────────────────────────────────────────
      // 赤い線が真ん中に立ち、録れた棒はその左へ流れていく。線の右は
      // 「まだ録っていない」ので点線だけ(参考画像と同じ構え)。
      const lineX = Math.round(cw * REC_LINE_AT);
      // ★滑らかに流す。棒は LEVEL_MS ごとにしか増えないので、そのままだと
      // 1本ぶんずつ飛んで「カクカク」する。次の1本までの端数を px に直して
      // 全体をずらすと、60fps で連続して動く。
      const frac = (((elapsedMs() % LEVEL_MS) + LEVEL_MS) % LEVEL_MS) / LEVEL_MS;
      const shift = frac * BAR_PITCH_REC;
      // 中心線(左は実線、右は点線)。
      c.lineCap = "butt";
      c.lineWidth = 1;
      c.strokeStyle = mute;
      c.beginPath();
      c.moveTo(0, mid);
      c.lineTo(lineX, mid);
      c.stroke();
      c.save();
      c.setLineDash([2, 4]);
      c.beginPath();
      c.moveTo(lineX, mid);
      c.lineTo(cw, mid);
      c.stroke();
      c.restore();
      // 棒。線のところが「いま」で、左へ行くほど過去。
      c.lineCap = "round";
      const count = Math.ceil(lineX / BAR_PITCH_REC) + 1;
      for (let k = 0; k < count; k++) {
        const v = all[all.length - 1 - k];
        if (v == null) break;
        bar(lineX - k * BAR_PITCH_REC - shift, v, fg, BAR_W_REC);
      }
      // 赤い線。帯より少し高く出して、参考画像と同じく主役にする。
      c.lineCap = "round";
      c.lineWidth = 2.5;
      c.strokeStyle = LAMP_REC;
      c.beginPath();
      c.moveTo(lineX, 2);
      c.lineTo(lineX, ch - 2);
      c.stroke();
      return;
    }

    // ── 止めたあと(全体表示・トリミング) ─────────────────────
    const n = Math.max(1, Math.floor((cw - BAR_W_ALL) / BAR_PITCH_ALL) + 1);
    const bars = resample(all, n);
    c.lineCap = "butt";
    c.lineWidth = 1;
    c.strokeStyle = mute;
    c.beginPath();
    c.moveTo(0, mid);
    c.lineTo(cw, mid);
    c.stroke();
    c.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const r = n <= 1 ? 0 : i / (n - 1);
      bar(BAR_W_ALL / 2 + i * BAR_PITCH_ALL, bars[i], (r >= t.start && r <= t.end) ? fg : mute, BAR_W_ALL);
    }
    if (all.length > 0) {
      // ★切り出しの2本。止めた直後は真ん中で重なっていて、split が 0→1 に
      // 進むにつれて左右へ分かれていく(ユーザー指定の「線が2つに分離する」)。
      const s = splitRef.current;
      c.lineCap = "butt";
      c.lineWidth = 2.5;
      c.strokeStyle = LAMP_REC;
      for (const r of [REC_LINE_AT + (t.start - REC_LINE_AT) * s, REC_LINE_AT + (t.end - REC_LINE_AT) * s]) {
        const x = Math.min(cw - 1.5, Math.max(1.5, r * cw));
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, ch);
        c.stroke();
      }
    }
  }, [fg, mute, recording, levelsRef, elapsedMs]);

  // ★同じ文字列なら書かない。textContent への代入は、値が同じでもその
  // 要素のレイアウトを汚す。毎フレームやると、巨大な円を含むページの
  // レイアウトを繰り返すことになり、実測(4倍スロットリング)で1ドラッグ
  // あたり Layout だけで 508ms 使っていた。
  const setText = (el: HTMLElement | null, v: string) => {
    if (el && el.textContent !== v) el.textContent = v;
  };
  const drawAll = useCallback(() => {
    draw();
    const t = trimRef.current;
    // 録音中の経過時間だけ、この控えめな数字に出す。
    if (recording) setText(timeRef.current, mmss(elapsedMs()));
    else setText(timeRef.current, mmss(durationMs * Math.max(0, t.end - t.start)));
    // ★切り出し中は、それぞれの円の上にその位置の秒数を出す。
    setText(markL.current, mmss(durationMs * t.start));
    setText(markR.current, mmss(durationMs * t.end));
  }, [draw, recording, elapsedMs, durationMs]);

  // rAF を回すのは「録音中」「ダイヤルを回している間」「線が分かれる間」だけ。
  useEffect(() => {
    let raf = 0;
    const loop = () => { drawAll(); raf = requestAnimationFrame(loop); };
    if (recording || active || coasting || splitting) raf = requestAnimationFrame(loop);
    else drawAll();
    return () => cancelAnimationFrame(raf);
  }, [drawAll, recording, active, coasting, splitting, size.w, size.h]);

  // ★録音を止めた瞬間、帯が広がるのに合わせて中心の1本を左右2本へ分ける。
  // 進み具合は ref に書き、rAF が読んで描く(setState では毎フレーム
  // 全体が再レンダーされてしまう)。
  useEffect(() => {
    if (state !== "review") { splitRef.current = 1; return; }
    splitRef.current = 0;
    setSplitting(true);
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / SPLIT_MS);
      // 帯の広がり(CSSのトランジション)と同じ ease-out に合わせる。
      splitRef.current = 1 - Math.pow(1 - p, 3);
      if (p < 1) raf = requestAnimationFrame(step);
      else setSplitting(false);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); setSplitting(false); };
  }, [state]);

  // ---- ダイヤルを回す --------------------------------------------------------
  const dragRef = useRef<{ id: number; side: "L" | "R"; ang: number; notch: number; rot: number; vel: number; t: number } | null>(null);

  // ★回すのは**目盛りの層だけ**。塗りつぶしの円は回転対称なので動かす意味が
  // 無く、直径が画面幅の約2倍あるため毎フレーム塗り直すと非常に高くつく
  // (実測: 4倍スロットリングで1ドラッグあたりブラウザ側の描画に1237ms)。
  // 目盛りの層は透明な面に細い線が5本あるだけなので、同じ大きさでも安い。
  // ★transform だけを書く。data-rot は指を離したときに1回だけ書く
  // (属性の書き換えはスタイル再計算を誘うので、毎フレームやらない)。
  const applyDial = (el: SVGSVGElement | null, rot: number) => {
    if (!el) return;
    // translateZ(0) を必ず残す。外すと合成レイヤーから降りてしまう。
    el.style.transform = `translateZ(0) rotate(${rot}rad)`;
  };

  /** 回した角度を切り出しの位置へ反映する。掴んでいる間も惰性の間も同じ。 */
  const advanceTrim = useCallback((side: "L" | "R", delta: number) => {
    const dr = (delta / (Math.PI * 2)) * TURN_RATIO;
    const prev = trimRef.current;
    trimRef.current = side === "L"
      ? { ...prev, start: clamp01(Math.min(prev.end - MIN_SPAN, prev.start + dr)) }
      : { ...prev, end: clamp01(Math.max(prev.start + MIN_SPAN, prev.end + dr)) };
  }, []);

  const stopCoast = useCallback(() => {
    if (!coastRef.current) return;
    cancelAnimationFrame(coastRef.current.raf);
    coastRef.current = null;
    setCoasting(false);
  }, []);

  /** ★指を離したあとの惰性。摩擦で減速しながら回し続け、止まったら
   *  そこで長さを確定する。物理ダイヤルらしい手触りのため。 */
  const startCoast = useCallback((side: "L" | "R", rot0: number, vel0: number) => {
    let rot = rot0;
    let vel = vel0;
    let notch = 0;
    setCoasting(true);
    const el = side === "L" ? reelL.current : reelR.current;
    const step = () => {
      vel *= COAST_FRICTION;
      const delta = vel * 16;
      rot += delta;
      notch += delta;
      if (Math.abs(notch) >= NOTCH) { haptic(5); notch = 0; }
      applyDial(el, rot);
      const before = trimRef.current;
      advanceTrim(side, delta);
      const after = trimRef.current;
      // 端に当たったら、そこで止める(回り続けても何も変わらないため)。
      const stuck = side === "L" ? before.start === after.start : before.end === after.end;
      if (Math.abs(vel) < COAST_STOP || stuck) {
        if (el) el.dataset.rot = String(rot);
        coastRef.current = null;
        setCoasting(false);
        return;
      }
      coastRef.current = { raf: requestAnimationFrame(step) };
    };
    coastRef.current = { raf: requestAnimationFrame(step) };
  }, [advanceTrim]);

  useEffect(() => stopCoast, [stopCoast]);

  const onDialDown = useCallback((e: React.PointerEvent, side: "L" | "R") => {
    if (!review) return;
    e.stopPropagation();
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    const ox = r.left + (side === "L" ? cxL : cxR);
    const oy = r.top + cy;
    const el = side === "L" ? reelL.current : reelR.current;
    stopCoast();
    dragRef.current = {
      id: e.pointerId, side, ang: Math.atan2(e.clientY - oy, e.clientX - ox),
      notch: 0, rot: Number(el?.dataset.rot ?? 0), vel: 0, t: performance.now(),
    };
    setActive(side);
    // ★掴んだ瞬間の合図はこれだけ(縁の線の色は変えない・ユーザー指定)。
    haptic(8);

    // ★リスナーは window に張る。要素の setPointerCapture は、この
    // コードベースで何度も取りこぼしてきた(§7.26)。
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== d.id) return;
      const a = Math.atan2(ev.clientY - oy, ev.clientX - ox);
      let delta = a - d.ang;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      d.ang = a;
      d.rot += delta;
      d.notch += delta;
      // 角速度(rad/ms)。少しならして、離した瞬間の勢いに使う。
      const now = performance.now();
      const dt = Math.max(1, now - d.t);
      d.t = now;
      d.vel = d.vel * 0.6 + (delta / dt) * 0.4;
      if (Math.abs(d.notch) >= NOTCH) { haptic(9); d.notch = 0; }
      applyDial(d.side === "L" ? reelL.current : reelR.current, d.rot);
      advanceTrim(d.side, delta);
    };
    const up = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (d && ev.pointerId !== d.id) return;
      if (d) {
        const el = d.side === "L" ? reelL.current : reelR.current;
        if (el) el.dataset.rot = String(d.rot);
      }
      dragRef.current = null;
      setActive(null);
      // ★離した勢いが残っていれば、惰性で回し続ける。
      if (d && Math.abs(d.vel) > COAST_STOP * 3) startCoast(d.side, d.rot, d.vel);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [review, cxL, cxR, cy, advanceTrim, startCoast, stopCoast]);

  // 録音を始めるたびに、ダイヤルの角度も戻す。
  useEffect(() => {
    if (state !== "idle" && state !== "recording") return;
    for (const el of [reelL.current, reelR.current]) {
      if (!el) continue;
      el.dataset.rot = "0";
      el.style.transform = "";
    }
  }, [state, enterKey]);

  // ★いつでも押せる取り消し。録音中でも切り出し中でも、その録音を捨てて
  // 最初の状態へ戻す(hook 側の cancel が状態に応じて処理を分ける)。
  const cancelAll = useCallback(() => {
    stopCoast();
    trimRef.current = { start: 0, end: 1 };
    for (const el of [reelL.current, reelR.current]) {
      if (!el) continue;
      el.dataset.rot = "0";
      el.style.transform = "";
    }
    voice.cancel();
  }, [voice, stopCoast]);

  // ★オーバーレイを閉じる。円が左右へ出ていくアニメーション(入場の逆)を
  // 見せてから、実際に閉じる。onClose(AppShell の closeStudio)が
  // 録音中/確認中なら録音そのものも捨てる。
  // ★二重に走らせない見張りは ref で持つ(setState の更新関数の中で
  // setTimeout を張ると、StrictMode で2回呼ばれて閉じる処理が二重になる)。
  const leavingRef = useRef(false);
  const beginExit = useCallback(() => {
    if (!onClose || leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    window.setTimeout(onClose, DIAL_OUT_MS);
  }, [onClose]);

  // ★送信が**終わったとき**も同じ演出で閉じる。「いま idle なら閉じる」と
  // 書くと開いた瞬間(まだ録音していない=idle)に閉じてしまうので、
  // sending → idle という**遷移**を見ること。
  const prevStateRef = useRef(state);
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (onClose && prev === "sending" && state === "idle") beginExit();
  }, [state, onClose, beginExit]);

  // CANCEL キー。オーバーレイでは「元の画面へ戻る」も兼ねる(右上の閉じるは
  // もう置いていない)。タブの中では録音を捨てるだけ。
  const onCancelKey = useCallback(() => {
    if (onClose) { beginExit(); return; }
    cancelAll();
  }, [onClose, beginExit, cancelAll]);

  // ---- 文言 -------------------------------------------------------------------
  const centerLabel = paused ? "PAUSE 中。もう一度押すと続けられる"
    : recording ? "もう一度 REC で停止"
    : review ? "左右の円で切り出す"
      : sending ? "文字にしています"
        : "";

  const canToggle = recording || state === "idle";

  return (
    <div ref={boxRef} style={{
      position: "relative", width: "100%",
      // ★タブバーのぶんだけ下へはみ出す。はみ出した先は祖先
      // (data-tab-scroll-root)が画面の下端で切ってくれるので、円は
      // タブバーの下へ自然に潜り込んで消える。
      height: `calc(100% + ${bleed})`,
      overflow: "hidden", background: ground,
      // 閉じていく間は、円が出ていくのに少し遅れて地も消える。
      ...(onClose ? {
        opacity: leaving ? 0 : 1,
        transition: `opacity ${DIAL_OUT_MS}ms ease-in`,
        pointerEvents: leaving ? "none" as const : undefined,
      } : null),
    }}>
      {/* 巨大な円ふたつ。ただの塗り面＋縁の目盛り。
          ★重なり順とポインタの通し方に注意: 舞台(タップで録音)はこの上に
          あるので、review のときは舞台をポインタに対して透明にして、
          こちらが指を受け取る。これを忘れると円が一切操作できない。 */}
      {(["L", "R"] as const).map((side) => (
        <div
          key={`${side}-${enterKey}`}
          // ★出ていく側は入場の**逆**。`animation-direction: reverse` では
          // 再生し直されない(名前が変わったときだけ頭から走る)ので、専用の
          // キーフレームを別名で用意してある(§29.1 と同じ理由)。
          className={leaving
            ? (side === "L" ? "vs-dial-out-l" : "vs-dial-out-r")
            : (side === "L" ? "vs-dial-in-l" : "vs-dial-in-r")}
          onPointerDown={(e) => onDialDown(e, side)}
          style={{
            position: "absolute", width: RD, height: RD, borderRadius: "50%",
            // ★掴んだ反応で**塗りの色は変えない**。直径が画面幅の約2倍
            // あるため、背景色を変えるだけで巨大な面が塗り直され、
            // transition を付けるとそれが十数フレーム続く(実測でこれだけで
            // 1ドラッグ約500msのコスト)。
            background: figure,
            left: (side === "L" ? cxL : cxR) - RD / 2, top: cy - RD / 2,
            zIndex: 1, touchAction: "none",
            pointerEvents: review ? "auto" : "none",
            cursor: review ? "grab" : "default",
            // ★掴んだ合図は「一瞬ふくらむ」。iPhoneのWebアプリでは
            // navigator.vibrate が無く手応えが返らないため、目で分かる
            // 反応にする(ユーザー指定)。**transform だけ**を動かし、
            // will-change で合成レイヤーへ上げてあるので、塗り直しは
            // 起きず合成のやり直しだけで済む。
            // ★will-change は**掴める間(review)だけ**。常時付けると、
            // この巨大な面が2枚とも合成レイヤーに居座り続け、録音中の
            // 描画が実測で 60ms → 160ms(4倍スロットリング)まで重くなった。
            willChange: review ? "transform" : undefined,
            transform: active === side ? "scale(1.028)" : "scale(1)",
            transition: "transform 200ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {/* ★回るのはこの層だけ。塗りつぶしの円は回転対称なので静止させる。
              目盛りは div を10個入れ子にせず **SVG 1枚**にしてある(同じ
              大きさのレイヤーでも、ラスタライズが桁違いに安い)。 */}
          <svg
            ref={side === "L" ? reelL : reelR}
            data-rot="0"
            className={recording ? "vs-reel-spin" : undefined}
            viewBox="0 0 100 100"
            aria-hidden
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              // 合成レイヤーへ上げて、回転を「塗り直し」ではなく「合成」にする。
              willChange: "transform", transform: "translateZ(0)",
            }}
          >
            {/* 縁の目盛り。一番端に寄せた、短く太い線。角は丸めない。 */}
            {Array.from({ length: TICKS }, (_, i) => (
              <rect
                key={i}
                x={50 - 0.73} y={0.8} width={1.46} height={4.5}
                fill={tick}
                transform={`rotate(${(i * 360) / TICKS} 50 50)`}
              />
            ))}
          </svg>
        </div>
      ))}

      {/* 切り出し中の秒数。★触っている円にだけ出す(ユーザー指定)。 */}
      {review && (["L", "R"] as const).map((side) => (
        <div
          key={side}
          ref={side === "L" ? markL : markR}
          style={{
            position: "absolute", zIndex: 2, pointerEvents: "none",
            left: side === "L" ? w * 0.21 : w * 0.79, top: cy + 26,
            transform: "translate(-50%, 0)",
            fontFamily: SANS, fontVariantNumeric: "tabular-nums",
            // ★font-size は遷移させない(遷移中ずっとレイアウトが走る)。
            // 反応は色と太さだけで見せる。
            fontSize: 17, fontWeight: 700, letterSpacing: "0.02em", color: fg,
            opacity: active === side ? 1 : 0,
            transition: "opacity 140ms ease",
          }}
        >00:00</div>
      ))}

      {/* ★波形の帯。録音中は「真ん中の少し上」に細く狭く置き、円に重ならない。
          止めると幅も高さも広がり、全体表示(トリミング)へ移る。
          ★flex の並びには入れず**絶対配置**にしてある。幅を遷移させても
          周りをレイアウトし直さずに済むため。 */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute", zIndex: 2, pointerEvents: "none",
          left: "50%", transform: "translateX(-50%)",
          width: recording ? waveWRec : waveWAll,
          height: recording ? WAVE_H_REC : WAVE_H_ALL,
          top: waveCy - (recording ? WAVE_H_REC : WAVE_H_ALL) / 2,
          transition: `width ${SPLIT_MS}ms cubic-bezier(0.16,1,0.3,1), height ${SPLIT_MS}ms cubic-bezier(0.16,1,0.3,1), top ${SPLIT_MS}ms cubic-bezier(0.16,1,0.3,1)`,
          display: "block",
        }}
      />

      {/* 数字。録音中は経過、止めたあとは切り出した長さ。どちらも控えめに。
          ★中身は rAF から textContent で書く(再レンダーしない)。 */}
      <div ref={timeRef} style={{
        position: "absolute", zIndex: 2, pointerEvents: "none",
        left: 0, right: 0, top: timeTop, textAlign: "center",
        fontFamily: SANS, fontSize: 19, fontWeight: 500, lineHeight: 1,
        letterSpacing: "0.20em", color: mute, fontVariantNumeric: "tabular-nums",
        opacity: (recording || review || sending) ? 1 : 0,
        transition: "opacity 200ms ease",
      }}>{mmss(0)}</div>

      {/* 舞台。タップで録音の開始/停止。 */}
      <div
        onClick={() => { if (canToggle) voice.toggle(); }}
        role={canToggle ? "button" : undefined}
        aria-label={recording ? "録音を停止" : "録音を開始"}
        style={{
          position: "absolute", inset: 0, zIndex: 2,
          cursor: canToggle ? "pointer" : "default",
          // ★review のときは指を素通りさせ、下のダイヤルに渡す。
          pointerEvents: canToggle ? "auto" : "none",
          userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
        }}
      />

      {/* ★最下部は、カセットプレイヤーの操作キーを模した3つの物理ボタン。
          出っ張り(KEY_DEPTH)があり、押されると沈む。押せない間は沈んだまま
          暗く、押せるようになるとランプが灯る。
            REC   … 録音の開始/停止。録音中は押し込まれたまま。
            PAUSE … 録音の一時停止/再開。止めている間は押し込まれたまま。
            SEND  … 文字起こしへ送る。 */}
      <div style={{
        // ★高さは中身に任せる(下端が keyBottom)。以前は固定の96pxで中央寄せに
        // していたため、キーの下のラベル(REC/PAUSE/…)が枠からはみ出し、
        // タブバーに隠れて切れていた。
        position: "absolute", left: 0, right: 0, bottom: `calc(${KEY_BOTTOM} + 10px)`, zIndex: 3,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 9,
        // ★この帯は画面幅いっぱい・高さ96pxある。素通しにしておかないと、
        // 帯の空いている所(キーの左右・文言の行)で指を吸ってしまい、その下の
        // ダイヤルが回せなくなる。指を受けるのはキーそのものだけにする
        // (このコードベースで一度やらかした「円が一切操作できない」と同じ罠)。
        pointerEvents: "none",
      }}>
        <div style={{
          fontFamily: SANS, fontSize: 11.5, fontWeight: 500,
          letterSpacing: "0.02em", color: mute,
        }}>{centerLabel}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 9, pointerEvents: "auto" }}>
        <TransportKey
          label="REC" ring={LAMP_REC}
          pressed={recording} enabled={!sending}
          onPress={() => voice.toggle()}
          fg={fg} mute={mute} figure={figure} well={well} capOff={capOff} lampOff={lampOff}
        />
        {/* ★PAUSE。録音中だけ押せる。押すとその場で止まり、もう一度押すと
            そのまま続きから録れる(MediaRecorder の pause/resume)。 */}
        <TransportKey
          label="PAUSE" lamp={GOLD} bars
          pressed={paused} enabled={recording} lit={recording}
          onPress={voice.togglePause}
          fg={fg} mute={mute} figure={figure} well={well} capOff={capOff} lampOff={lampOff}
        />
        <TransportKey
          label="SEND" lamp={GREEN}
          pressed={sending} enabled={review} lit={review}
          onPress={() => voice.send(trimRef.current)}
          fg={fg} mute={mute} figure={figure} well={well} capOff={capOff} lampOff={lampOff}
        />
        {/* ★CANCEL だけは少し間を空けて置く。いつでも押せて、録音を捨てて
            最初の状態へ戻す(録音中でも、切り出し中でも)。
            オーバーレイでは、これがそのまま「元の画面へ戻る」になる
            (右上の閉じるボタンは廃止した)。 */}
        <div style={{ marginLeft: 18 }}>
          <TransportKey
            label="CANCEL" cross
            pressed={false} enabled={!sending && !leaving}
            onPress={onCancelKey}
            fg={fg} mute={mute} figure={figure} well={well} capOff={capOff} lampOff={lampOff}
          />
        </div>
        </div>
      </div>

      {/* ★右上の閉じるボタンは廃止(2026-08-11)。オーバーレイを閉じるのは
          CANCEL キー。物理キーの列に操作を一本化した。 */}

    </div>
  );
}

/** カセットプレイヤーの操作キー。出っ張り(KEY_DEPTH)を持ち、押されると沈む。
 *  ・enabled=false … 沈んだまま暗い。押せない。
 *  ・lit=true      … ランプが灯る(押せることの合図)。
 *  ・pressed=true  … 押し込まれたまま(録音中のRECなど)。 */
function TransportKey({ label, lamp, ring, cross, bars, pressed, enabled, lit, onPress, fg, mute, figure, well, capOff, lampOff }: {
  label: string;
  /** 丸いランプの色(点灯時)。 */
  lamp?: string;
  /** REC の赤い輪。 */
  ring?: string;
  /** CANCEL の ✕。 */
  cross?: boolean;
  /** PAUSE の2本線。灯っていれば lamp の色、消えていれば lampOff。 */
  bars?: boolean;
  pressed: boolean;
  enabled: boolean;
  lit?: boolean;
  onPress: () => void;
  fg: string;
  mute: string;
  /** 押せるときのキーの面(明るい)。 */
  figure: string;
  /** キーが沈む穴。★半透明にしないこと。明るい円の上と地の上とで
   *  見え方が変わり、物として読めなくなる。 */
  well: string;
  /** 押せないときのキーの面。 */
  capOff: string;
  /** 消えているランプ。 */
  lampOff: string;
}) {
  const [held, setHeld] = useState(false);
  // 押し込まれて見えるか。押している間・押されたままの状態・押せない状態。
  const down = pressed || held || !enabled;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <div style={{ position: "relative", width: KEY_D, height: KEY_D + KEY_DEPTH }}>
        {/* キーが沈む「穴」。出っ張っているときはここが影として見える。 */}
        <div style={{
          position: "absolute", left: 0, bottom: 0, width: KEY_D, height: KEY_D,
          borderRadius: "50%", background: well,
        }} />
        <button
          onPointerDown={() => { if (enabled) { setHeld(true); haptic(7); } }}
          onPointerUp={() => setHeld(false)}
          onPointerCancel={() => setHeld(false)}
          onPointerLeave={() => setHeld(false)}
          onClick={() => { if (enabled) onPress(); }}
          disabled={!enabled}
          aria-label={label}
          aria-pressed={pressed}
          style={{
            position: "absolute", left: 0, bottom: 0, width: KEY_D, height: KEY_D,
            borderRadius: "50%", border: "none", padding: 0,
            background: enabled ? figure : capOff,
            transform: `translateY(${down ? 0 : -KEY_DEPTH}px)`,
            transition: "transform 90ms cubic-bezier(0.32,0.72,0,1), background 160ms ease",
            cursor: enabled ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
          }}
        >
          {bars ? (
            // PAUSE の2本線。ランプと同じ扱いで、押せるときだけ色が付く。
            <span style={{ display: "flex", gap: 4 }}>
              {[0, 1].map((i) => (
                <span key={i} style={{
                  width: 4, height: 14, borderRadius: 1,
                  background: lit ? lamp : lampOff,
                  transition: "background 200ms ease",
                }} />
              ))}
            </span>
          ) : cross ? (
            // CANCEL の ✕。2本の直線で。
            <span style={{ position: "relative", width: 14, height: 14 }}>
              <span style={{ position: "absolute", top: 6, left: 0, width: 14, height: 2, background: enabled ? fg : mute, transform: "rotate(45deg)" }} />
              <span style={{ position: "absolute", top: 6, left: 0, width: 14, height: 2, background: enabled ? fg : mute, transform: "rotate(-45deg)" }} />
            </span>
          ) : ring ? (
            // REC の赤い輪。
            <span style={{
              width: 15, height: 15, borderRadius: "50%",
              border: `3px solid ${enabled ? ring : mute}`,
            }} />
          ) : (
            // ランプ。押せるようになると灯る。
            <span style={{
              width: 11, height: 11, borderRadius: "50%",
              background: lit ? lamp : lampOff,
              transition: "background 200ms ease",
            }} />
          )}
        </button>
      </div>
      <span style={{
        fontFamily: SANS, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.18em",
        color: enabled ? fg : mute, marginRight: "-0.18em",
      }}>{label}</span>
    </div>
  );
}

// ★どのアプリからでも録音できる全画面のオーバーレイ。タブバー右端の録音
// アイコンを押すと、いまの画面が暗くなり、その上に同じ VoiceStudio が出る。
// createPortal で body 直下へ描く(.app-track が transform を持つため、
// シェルの中に position:fixed を書くと画面ではなくトラック基準で解決されて
// 画面外へ飛ぶ。§26.1 で実際にそうなった)。
export function VoiceOverlay({ voice, open, onClose }: {
  voice: VoiceControls;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="vs-in" style={{ position: "fixed", inset: 0, zIndex: 58 }}>
      {/* ★器の高さは画面いっぱい。タブの中の器も bleed でここと同じ高さに
          揃えてあるので、円の大きさ・位置が両者で必ず一致する。 */}
      <VoiceStudio voice={voice} dim onClose={onClose} />
    </div>,
    document.body,
  );
}
