"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import { ms, T_OUT, T_STEP } from "@/lib/motion";
import { drawPixelScreen, waveCols, type Tone } from "@/lib/pixelScreen";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { claimFromRail } from "@/lib/moduleRail";
import { CARD_RADIUS, CHARCOAL, INK, JOURNAL_FACE, MUTED, SANS, SCHEME, SOFT_SHADOW_LG, STUDIO, STUDIO_KEY, navHeightPx } from "@/lib/constants";
import { hubPath } from "@/lib/reelHub";
import { RECORDER_AR, RECORDER_BEZEL_PER_W, RECORDER_DECK_GAP_PER_H, RECORDER_DECK_H_PER_W, RECORDER_DECK_Y_PER_W, RECORDER_INNER_W_PER_W, RECORDER_KEY_LIP_PER_H, RECORDER_REEL_CY_PER_W, RECORDER_REEL_D_PER_W, RECORDER_SCREEN_H_PER_W, RECORDER_SCREEN_Y_PER_W } from "@/lib/recorder";
import { PILE_INSET } from "@/lib/pileBox";
import { bodyInkOn } from "@/lib/palette";
import { LEVEL_MS } from "@/components/VoiceRecorder";
import { pushGround } from "@/lib/ground";
import { haptic } from "@/lib/helpers";
import type { VoiceControls, VoiceTrim } from "@/lib/types";

// ★声の記録の画面(2026-08-11)。純粋幾何学ミニマリズム。
//
// ■ 構図（★★★第133巡に組み直した）
//   ・**縦長の角丸の四角（録音機の本体）に、回る円が1つ**。比・ベゼル・角丸は
//     Explore の札と同じ（`lib/recorder.ts`）。札の写真の場所に円、題と本文の場所に
//     「数字 → 波形」、下の1列の場所に「キーの段（左の円＝REC・右のバー＝3キー）」。
//   ・録音中は赤い線が立ち、録れた棒がその左へ流れる(線の右は点線=まだ録っていない)。
//     止めても**帯の大きさは変えず**、中心の線が左右2本へ分かれて全体表示
//     (トリミング)になる。
//   ・切り出しは**円の左半分を回すと頭、右半分を回すと尻**（第132巡までの
//     「左の円・右の円」の役を、1つの円の左右へ移した）。
//
// ■ 数字の扱い(ユーザー指定)
//   ・**どれも強調しない**。録音中の経過も、録音後の長さも、細く小さく
//     字間を広げて置くだけ。
//   ・切り出し中の秒数は、**触っている半分の側にだけ**出す。
//
// ■ 手触り
//   ・この画面が**ほぼ完全に見えた**ときに、本体と円が浮かび上がる
//     (★録音の開始では流さない。半分見えた時点で流すと、遷移の途中で
//     円が既に定位置に見えているのに外へ飛んで入り直すことになる)。
//   ・録音の開始/停止は **REC キーか円をタップしたときだけ**。余白は無反応。
//   ・録音中は円がゆっくり回る。縁の目盛りで回転が読める。
//   ・円を掴むと**少しふくらむ**(縁の線の色は変えない)。
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

/** ダイヤル1回転で動かす割合。小さいほど「重い」。 */
const TURN_RATIO = 0.5;
/** 手応えを返す刻み(rad)。15度ごと。 */
const NOTCH = (15 * Math.PI) / 180;
/** これ以下しか回っていなければ「タップ」とみなす(rad)。 */
const TAP_SLOP = 0.05;
/** 開始と終了が潰れないよう、最低これだけは残す。 */
const MIN_SPAN = 0.04;
// ★★★**円の大きさも位置も、ここには無い**（第96巡・第133巡）。録音機の比は
//   `lib/recorder.ts`（Explore の札と同じ比・ベゼル・角丸）から導く。
/** 録音中の赤い線を帯のどこに立てるか(左からの割合)。左が録れた分、
 *  右がまだ録っていない分(点線)。真ん中より右に置いて履歴を長く見せる。 */
const REC_LINE_AT = 0.66;
/** 録音を止めたとき、帯が広がり中心の線が左右へ分かれるまでの時間(ms)。 */
const SPLIT_MS = 420;
/** ★左上のタイトル(Masthead)の下端。**本体の上の縁がここより上へ行かないための
 *  見張り**に使う(第95巡までは円の中心をここから決めていた)。
 *  Masthead の高さを変えたら測り直すこと(実測: top 16 + 高さ 68 = 84)。 */
const BAND_TOP = 84;
/** ★本体の下の縁をタブバーの上端からどれだけ浮かせるか。 */
const DECK_LIFT = SPACE.xl;
// ★★★**`KEY_LABEL_H` は第97巡に消した。復活させない。**
//   第96巡は `const KEY_LABEL_H = 12` で、コメントには「`TYPE.nano` × `LEAD.flat`」
//   ＝ **7** と書いてあった。**コメントと値が食い違った定数**の余り 5px が
//   `justifyContent: "flex-start"` で下に捨てられ、**キーの列がまるごと 5px
//   上へずれていた**（ユーザー指摘「ボタンの位置がバーの中心とアラインされていない」）。
//   → いまラベルは**キーと同じ中心の x へ絶対配置**（`bottom: calc(100% + …)`）なので、
//   **ラベルの高さを誰も知らなくていい**。知らなければ食い違えない。
// ★リールの芯（3本の太い線）の形は `lib/reelHub.ts`（ホームの山と共有）。
// ★★★**キーが段の中に空ける黒い縁（`KEY_LIP`）も、径も、`lib/recorder.ts` から
//   導く**（第98巡）。`RECORDER_KEY_LIP_PER_H` ＝ 段の高さの 1/8。
//   ★★**この1つの値が四方に回る** … バーの上下の縁・バーの端の丸のまわり・
//   REC の穴のまわりが全部同じ値になる。
/** キーが沈む深さ。★出っ張り(depth)ぶん浮いて見える。 */
const KEY_DEPTH = 4;
/** ★★キーの中の部品は**すべてキーの径に対する割合**（2026-09-13・第97巡）。
 *  第96巡までは 42px のキーを前提にした生の px だったので、径を `deckH` から
 *  導くようにした途端に比が崩れた（窓が 52% → 43%）。★分母の 42 は
 *  **第96巡までのキーの径**＝この比を測った元の寸法。★目盛りの外（部品の比）。 */
const SOCKET_PER_KEY = 22 / 42;
const LAMP_PER_KEY = 8 / 42;
const BAR_W_PER_KEY = 3 / 42;
const BAR_H_PER_KEY = 11 / 42;
const CROSS_PER_KEY = 12 / 42;
const CROSS_LINE_PER_KEY = 1.5 / 42;
/** ★★キーの輪郭は**沈む穴の影だけ**で見せる（縁取りを足さない・ユーザー確定）。
 *  白い面がクリームの地とほぼ同じ明るさ（比 1.0）なので、穴をキーより
 *  **この幅だけ外へ広げて**、四方に影が回るようにする。下に三日月が出るだけでは
 *  実機で物として読めない。 */
const WELL_LIP = 3;   // ★目盛りの外（部品の座標系）
/** 閉じるアニメーションの長さ(globals.css の vs-plate-out と揃える)。 */
const DIAL_OUT_MS = ms(T_OUT);
/** ★これ未満の音は棒として描かない。小さい点が並ぶと汚く見えるため
 *  (ユーザー指定)。 */
const LEVEL_FLOOR = 0.1;
/** 全画面のオーバーレイの地。★出どころは lib/constants.ts の CHARCOAL 1つ
 *  (タスクの入力画面も同じ地)。html の地色にも同じ値を書く(下記 VoiceOverlay)。 */
const DIM_GROUND = CHARCOAL;
/** ランプの色。トリミングの縦線もこの赤を使う。 */
/** 指を離したあとの惰性。1フレームごとに速度へ掛ける摩擦と、止まる閾値。 */
const COAST_FRICTION = 0.94;
/** ★窓の合図の1拍（点く／消える）と拍の数（点く3回 ＝ 6拍）。時間の語彙の `T_STEP` の倍数。 */
const FLASH_BEAT = ms(T_STEP) * 3;
const FLASH_BEATS = 6;
/** ★録音中の赤い丸・一時停止の字の明滅（1拍）。 */
const BLINK_MS = ms(T_STEP) * 10;
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

export function VoiceStudio({ voice, dim, onClose, active: appActive = true, fit }: {
  voice: VoiceControls;
  /** ★★モジュールの中に置くとき（第134巡）。見出しもタブバーも器の外なので、器いっぱいに組む。 */
  fit?: boolean;
  /** オーバーレイとして幕の上に出すか。 */
  dim?: boolean;
  /** 幕を閉じる(オーバーレイのときだけ)。CANCEL・送信の完了で呼ぶ。 */
  onClose?: () => void;
  /** ★この画面がいま表示されているか。円の入場アニメーションの合図に使う。
   *  タブの中では AppShell が「このアプリが表示中か」を渡す(3つのアプリの列は
   *  常にマウントされたままなので、mount では判定できない)。オーバーレイは
   *  開いたときに新しくマウントされるので省略(既定 true)。 */
  active?: boolean;
}) {
  // ★地色は**列(AppColumn)が持つ**。ここでは塗らない(タブの中では
  // `background` を指定せず、列の色をそのまま透かす)。出どころを2つにすると、
  // アプリの遷移中にどちらかがズレて必ず境目が出る。
  // 全画面のオーバーレイだけは列の外なので、自分で暗い地を塗る。
  const ground = dim ? DIM_GROUND : undefined;
  // ★★★**本体は青・回る円は墨**（第94巡の塗り分けを第133巡の録音機でも保つ）。
  //   墨の円と地の比は **11.25**。・キーの面 `cap` … **どちらの画面でも白**。
  const dial = INK;
  const cap = STUDIO.cap;
  // ★★★**縁の目盛りは円の面から導く**（`bodyInkOn`）。**半透明にしないこと** ――
  //   第93巡に実測 … `rgba(44,38,39,0.38)` を面に合成すると**比 1.94 で消える**。
  //   ベタなら黒い円の上で紙色が **11.89** 出る。
  // ★★★**リールの芯はグレー**（2026-09-13・第101巡にユーザー指定「円の中の線は
  //   白ではなくグレーにしてあまり目立たないように」）。★★**ここだけ `bodyInkOn`
  //   から外れる** ―― 芯は「面の上で読ませる文字」ではなく**控えめに在る部品**。
  //   ★ホームの山の円（`pilePaint.ts` の `reelBitmap`）と**同じ色**。
  const tick = MUTED;
  // ★★★**ラベルは「青い本体」の上に載る**（2026-09-13・第96巡にラベルを段の外へ
  //   出した）。★面から導く ―― 地から決めていた `fg` も、第95巡に墨の段から
  //   決めていた `deckInk` も、もう面が違う。実測 … 青の上の墨は **7.12**。
  const plateInk = bodyInkOn(JOURNAL_FACE);

  // ★★★第79巡から**キーまわりは画面で変わらない**（面が両方とも白なので、
  //   穴も窓もランプも1つで足りる）。分岐が減ったぶん、ズレようがない。
  // ★★★**キーの穴は下の段（黒い円とバー）が作る**ので、キーは自分で穴を
  //   描かない（第95巡）。`STUDIO.well` はもうここでは使わない。
  const socket = STUDIO.socket;
  const lampOff = STUDIO.lampOff;
  // ★★記号は**キーの面ではなく、面に開いた墨の窓**の中に灯る。白い面の上では
  //   盤の色が 1.2〜1.8 しか出ないが、窓の上なら 4.7 以上出る（第79巡の実測）。
  const acc = STUDIO_KEY;
  // ★★★REC の輪は**キーの面の上**にいるので、白い面から決まる。
  //   待機＝墨 14.41／録音中＝**危険の色**（第128巡からオレンジ。参照画像に赤が無い）。
  const ringIdle = bodyInkOn(cap);
  const ringRec = SCHEME.danger;

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** ★回る円の芯の層（第133巡に円は1つになった）。 */
  const reelL = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // ★波形のcanvasの実寸は **ref に控えておく**。draw() の中で clientWidth /
  // clientHeight を読むと、その瞬間に同期レイアウトが走る。ダイヤルの
  // transform を書いた直後の毎フレームでこれをやると、巨大な円を含む
  // ページ全体のレイアウトを毎回やり直すことになり、実測(4倍スロットリング)で
  // 1ドラッグあたり clientWidth の取得だけで 374ms 使っていた。
  const cvSizeRef = useRef({ w: 0, h: 0 });
  /** ★いまの描き方（寸法を測った所から呼ぶ）。 */
  const drawRef = useRef<() => void>(() => {});
  // ★切り出しの位置は **ref**。ダイヤルを回すたびに setState すると
  // 1ジェスチャーで数十回の再レンダーになる(§14)。
  const trimRef = useRef<VoiceTrim>({ start: 0, end: 1 });
  /** ★止めた直後、中心の1本が左右2本へ分かれていく進み具合(0→1)。
   *  ここも ref。毎フレーム setState すると再レンダーの嵐になる。 */
  const splitRef = useRef(1);
  const [splitting, setSplitting] = useState(false);
  // ★★★**窓の合図**（第133巡にユーザー指定「**stop などのボタンを押すと、その文字が画面に中央揃えで表示され
  //   3回点滅する**」）。★時刻は ref（描くのは rAF）、回すかどうかだけ state。
  const flashRef = useRef<{ text: string; t0: number } | null>(null);
  const [flashing, setFlashing] = useState(false);
  const flashTimer = useRef(0);
  const flash = useCallback((text: string) => {
    flashRef.current = { text, t0: performance.now() };
    setFlashing(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => { flashRef.current = null; setFlashing(false); }, FLASH_BEAT * FLASH_BEATS);
  }, []);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
  /** いま掴んでいる円。掴んでいなければ null。 */
  const [active, setActive] = useState<"L" | "R" | null>(null);
  /** 円が左右から入ってくるアニメーションの再生キー。 */
  const [enterKey, setEnterKey] = useState(0);
  /** 指を離したあとの惰性。回っているrAFのidを持つ。 */
  const coastRef = useRef<{ raf: number } | null>(null);
  const [coasting, setCoasting] = useState(false);
  /** ★オーバーレイが閉じていく最中。円が左右へ出ていく間だけ true。 */
  const [leaving, setLeaving] = useState(false);

  const { state, durationMs, levelsRef, timesRef, elapsedMs, paused } = voice;
  const recording = state === "recording";
  const review = state === "review";
  const sending = state === "sending";
  // window に張ったリスナーから最新の状態を見るための控え。
  const reviewRef = useRef(review);
  reviewRef.current = review;

  useEffect(() => {
    if (state === "recording" || state === "idle") trimRef.current = { start: 0, end: 1 };
  }, [state, durationMs]);

  // ★円の入場は「この画面が見えるようになった瞬間」に流す。
  // 録音の開始では流さない(getUserMedia の許可待ちのぶん遅れて再生され、
  // 回転と同時に走るため「録音し始めると円が変な挙動をする」と言われた)。
  // ★マウント時の1回だけにしてはいけない。3つのアプリの列は**常に
  // マウントされたまま**(§14)なので、アプリを切り替えて戻ってきても
  // 再マウントされず、入場が二度と再生されない(実機で報告された症状)。
  // 列は画面外へ translate されるだけなので、IntersectionObserver で
  // 「見えた/見えなくなった」を拾えば、切り替えのたびに流せる。
  // ★このアプリが表示されている間だけ円を出し、表示になった瞬間に入場を流す。
  // 遷移の途中で流すと、**円が既に定位置に見えているのに、そこから外へ飛んで
  // 入り直す**というおかしな見え方になる(実機で指摘された)。見えていない間は
  // 円をそもそも描かないので、地だけが流れてきて、収まってから円が入ってくる。
  // ★合図は **AppShell から渡される prop**。以前は IntersectionObserver で
  // 見え方から推測していたが、実機では一度も閾値に達せず「円が出てこない」
  // 不具合になった。どのアプリを表示しているかは AppShell が知っているので、
  // 推測せずそれをそのまま使う。
  // ★★★**モジュールの中（`fit`）では出しっぱなし・入場もしない**（第134巡の2度目にユーザー指摘「**タブを切り替えた
  //   時に要素が一瞬消える**」）。アプリの切り替えは列の不透明度で現れる（`AppShell`）ので、ここで円を消して
  //   入り直させると、**列が現れる途中で録音機だけが抜けて、あとから入ってくる**。出るときも同じで、
  //   `appActive` が偽になった瞬間に消えていた（古い列はまだ見えている）。
  const shown = fit ? true : appActive;
  useEffect(() => {
    if (appActive && !fit) setEnterKey((n) => n + 1);
  }, [appActive, fit]);

  // ★★★**見えていない間は寸法を測らない**（2026-09-16・第115巡）。
  //   ★★★**`AppShell` はタブを全部載せたまま横へ送る**ので、ホームを見ている間も
  //     JOURNAL の `RecordTab` はマウントされたまま生きている。`ResizeObserver` は
  //     **どこかのレイアウトが変わるたびに鳴り**、`read()` の `clientWidth` が
  //     **文書ぜんたいのレイアウトを強制**する ―― ホームの山が落ちてくる最中は
  //     帯の器も canvas も毎フレーム動くので、**その強制が毎フレーム掛かる**。
  //   ★★★実測（CPU×4・12体）… この関数だけで **524ms**（全体の 12.8%）。
  //     「最初に図形が落ちてくる時に重い」の**いちばん大きな1つ**がこれだった。
  //   ★見えていないあいだ寸法は変わらないので、**戻ってきたときに測り直せば足りる**
  //     （`appActive` が真になった瞬間に `read()` が1度走る）。
  const watching = !!fit || appActive;
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
      const was = cvSizeRef.current;
      cvSizeRef.current = { w: cv.clientWidth, h: cv.clientHeight };
      // ★★窓の寸法が決まった／変わったら描き直す（止まっている間は rAF が回っていないので、
      //   測る前の寸法で描いた絵が残る ―― 実測で待機中の字が拡大されて重なっていた）。
      if (was.w !== cv.clientWidth || was.h !== cv.clientHeight) drawRef.current();
    };
    // ★★モジュールの中（`fit`）は器の寸法が決まっている（送りの1枚）ので、**見張りを付けっぱなしにして、
    //   表示中の切り替えでは何もしない**（第135巡。切り替えのたびに `read()` がレイアウトを強制していた ――
    //   実測 CPU×4 で出入りのたびに 20〜23ms）。`ResizeObserver` は寸法が本当に変わったときしか鳴らない。
    //   ★全画面の録音（`fit` でない）は第115巡のまま、見えているあいだだけ見張る。
    if (!watching) return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [watching]);

  // ---- 円の配置 --------------------------------------------------------------
  const w = size.w || 390;
  const h = size.h || 620;

  // ---- 録音機 ── **縦長の角丸の四角に、回る円が1つ**（2026-09-27・第133巡） ----
  // ★★★ユーザー指定「**今ある二つの円を一つにして、その分横幅を狭めて、Explore の
  //   カードとデザインを統一し、縦長の角丸の四角に、回転する円が付いているデバイス**」。
  //   ★比・ベゼル・角丸は**札と同じ**（`lib/recorder.ts`）。札の写真の正方形の場所に
  //   回る円、写真の下の「題・本文・下の1列」の場所に「数字・波形・キーの段」。
  // ★★第94〜132巡のカセット（横長の本体・リール2つ・突起）は削除した。復活させない。
  // ★★大きさは**札と同じ決め方** … 幅は列の内寸（左右 `SPACE.lg`）、高さが足りなければ
  //   高さから幅を決める。余った高さは上下に等分する。
  // ★`navHeightPx()` を使う ―― `.app-nav` の矩形は `NAV_H` と一致しない。自分で測らない。
  const bodyBottom = fit ? h : h - navHeightPx() - DECK_LIFT;
  const topLimit = fit ? 0 : BAND_TOP + SPACE.lg;
  const availH = Math.max(200, bodyBottom - topLimit);
  const bodyW = Math.min(Math.max(120, w - PILE_INSET * 2), availH * RECORDER_AR);
  const bodyH = bodyW / RECORDER_AR;
  const bodyTop = topLimit + Math.max(0, (availH - bodyH) / 2);
  const bodyLeft = (w - bodyW) / 2;
  const bezel = bodyW * RECORDER_BEZEL_PER_W;

  // 回る円（1つ）。★直径 ＝ 札の写真の正方形（幅 − ベゼル×2）。
  const RD = bodyW * RECORDER_REEL_D_PER_W;
  const cx = w / 2;
  const cy = bodyTop + bodyW * RECORDER_REEL_CY_PER_W;

  // キーの段（左の円＝REC の穴／右のバー＝残り3つの穴）。★幅は円の直径と同じ。
  const deckH = bodyW * RECORDER_DECK_H_PER_W;
  const deckW = bodyW * RECORDER_INNER_W_PER_W;
  const deckLeft = bodyLeft + bezel;
  const deckTop = bodyTop + bodyW * RECORDER_DECK_Y_PER_W;
  const keyLip = deckH * RECORDER_KEY_LIP_PER_H;
  const knobD = deckH;
  const barLeft = deckLeft + knobD + deckH * RECORDER_DECK_GAP_PER_H;
  const barW = deckLeft + deckW - barLeft;
  // ★★★**キーの径は段の高さから導く**（第97巡）。四方の黒い縁が `keyLip` で揃う。
  const keyD = Math.max(24, deckH - keyLip * 2);
  // ★★★**3つのキーはバーの「端の丸」と「中心」に同心で置く**（第97巡）。
  const barX = barLeft - deckLeft;
  const keyCx = {
    rec: knobD / 2,                       // 左の円（REC の穴）の中心
    pause: barX + deckH / 2,              // バーの左の端の丸の中心
    send: barX + barW / 2,                // バーの中心
    cancel: barX + barW - deckH / 2,      // バーの右の端の丸の中心
  };

  // ---- 窓 ── 円と段のあいだ（札の「題と本文」の場所） ------------------------------
  // ★★★**ドット表示の窓**（第133巡にユーザー指定「**円盤とボタンの間に黒い、ドット絵が表示されるような
  //   スクリーン**」）。幅は段と同じ（円の直径）。上は円から `SPACE.sm`、下はキーのラベルの上に `SPACE.sm`。
  //   ★中身（時間・状態・波形・合図）は全部この窓の点が描く（`lib/pixelScreen.ts`）。
  const scrTop = bodyTop + bodyW * RECORDER_SCREEN_Y_PER_W;
  // ★★キーのラベル（段の上 `SPACE.xs`・字高 `TYPE.nano`）とは必ず `SPACE.xs` 空ける（小さい画面の安全網）。
  const scrH = Math.max(SPACE.xxl, Math.min(bodyW * RECORDER_SCREEN_H_PER_W,
    deckTop - SPACE.xs * 2 - TYPE.nano * LEAD.flat - scrTop));
  // ★★★**窓の角は本体の角と同心**（第133巡にユーザー指定「**窓の角のカーブを外側の枠の角丸の四角と合わせて**」）
  //   ＝ 本体の角丸 − 左右のベゼル（358 幅で 32 − 24 ＝ 8）。同じ中心の弧になるので、縁の幅がどこでも揃う。
  const scrR = Math.max(RADIUS.sm, CARD_RADIUS - bezel);

  // ---- 波形を描く ------------------------------------------------------------
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    // ★実寸は ref から。ここで clientWidth を読むと毎フレーム同期レイアウトが走る。
    const { w: cw, h: ch } = cvSizeRef.current;
    if (cw === 0 || ch === 0) return;
    const now = performance.now();
    const n = waveCols(cw);
    const all = levelsRef.current;
    const t = trimRef.current;
    // ★★合図（ボタンの1語）… `FLASH_BEAT` ごとに点く／消えるを3回。
    const fl = flashRef.current;
    const beat = Math.floor((now - (fl?.t0 ?? 0)) / FLASH_BEAT);
    const flash = fl && beat < FLASH_BEATS ? fl.text : null;
    let bars: number[] = [];
    let barTone: (i: number) => Tone = () => 2;
    let marks: number[] = [];
    let left = "READY"; let right = mmss(0);
    let leftTone: Tone = 2; let rightTone: Tone = 1; let dot = false;
    if (recording) {
      // ★録音中 … 新しい音ほど右。列は**測った時刻**から決める（間隔の揺れで飛ばない）。
      bars = new Array(n).fill(0);
      const times = timesRef.current;
      const tNow = elapsedMs();
      for (let k = all.length - 1; k >= 0; k--) {
        const at = times[k];
        if (at == null) continue;
        const col = n - 1 - Math.floor((tNow - at) / LEVEL_MS);
        if (col < 0) break;
        if (col < n) bars[col] = Math.max(bars[col], all[k] < LEVEL_FLOOR ? 0 : all[k]);
      }
      const blinkOn = Math.floor(now / BLINK_MS) % 2 === 0;
      left = paused ? "PAUSE" : "REC";
      leftTone = paused && !blinkOn ? 1 : 2;
      dot = !paused && blinkOn;
      right = mmss(tNow); rightTone = 2;
    } else if (all.length > 0 && (review || sending)) {
      // ★止めたあと … 全体を1画面に。切り出した内側は点灯、外側は控えめ、端は赤い縦線。
      bars = resample(all, n).map((v) => (v < LEVEL_FLOOR ? 0 : v));
      barTone = (i) => { const r = n <= 1 ? 0 : i / (n - 1); return r >= t.start && r <= t.end ? 2 : 1; };
      const sp = splitRef.current;
      marks = [REC_LINE_AT + (t.start - REC_LINE_AT) * sp, REC_LINE_AT + (t.end - REC_LINE_AT) * sp]
        .map((r) => Math.round(r * (n - 1)));
      left = mmss(durationMs * t.start); right = mmss(durationMs * t.end);
      // ★回している側だけ明るく（頭 ＝ 左半分・尻 ＝ 右半分）。
      leftTone = active === "R" ? 1 : 2; rightTone = active === "L" ? 1 : 2;
      if (sending) { left = "SENDING"; right = mmss(durationMs * Math.max(0, t.end - t.start)); leftTone = 2; rightTone = 2; }
    }
    drawPixelScreen(cv, cw, ch, {
      flash, flashOn: beat % 2 === 0, left, leftTone, dot, right, rightTone, bars, barTone, marks,
    });
  }, [recording, review, sending, paused, active, levelsRef, timesRef, elapsedMs, durationMs]);

  const drawAll = draw;
  useLayoutEffect(() => { drawRef.current = draw; });

  // rAF を回すのは「録音中」「ダイヤルを回している間」「線が分かれる間」だけ。
  useEffect(() => {
    let raf = 0;
    const loop = () => { drawAll(); raf = requestAnimationFrame(loop); };
    if (recording || active || coasting || splitting || flashing) raf = requestAnimationFrame(loop);
    else drawAll();
    return () => cancelAnimationFrame(raf);
  // ★state を依存に入れること。取り消して idle へ戻ったとき、drawAll の
  // 参照が変わらないと effect が動かず、**前の録音の波形が残ったまま**になる。
  }, [drawAll, state, recording, active, coasting, splitting, flashing, size.w, size.h]);

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
  const dragRef = useRef<{ id: number; side: "L" | "R"; ang: number; notch: number; moved: number; rot: number; vel: number; t: number } | null>(null);
  /** 直前のジェスチャーが「回した」か「タップ」か。回したなら click を無視する。 */
  const draggedRef = useRef(false);
  /** 直前に指を下ろした場所が円の上だったか。円の外のタップは何もしない。 */
  const onDialRef = useRef(false);

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
    const el = reelL.current;
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

  /** ★★★指が円の**どちらの半分**の上にあるか（第133巡。円は1つになった）。
   *  **左半分を回すと頭（start）、右半分を回すと尻（end）**を切り出す ――
   *  第132巡までの「左の円・右の円」の役を、1つの円の左右へそのまま移した。
   *  ★矩形ではなく円の式で判定すること。 */
  const dialAt = useCallback((clientX: number, clientY: number): "L" | "R" | null => {
    const box = boxRef.current;
    if (!box) return null;
    const r = box.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    const rr = RD / 2;
    if ((x - cx) ** 2 + (y - cy) ** 2 > rr * rr) return null;
    return x < cx ? "L" : "R";
  }, [RD, cx, cy]);

  /** ★円の上で指を下ろしたとき。**録音していなくても回して遊べる**
   *  (ユーザー指定)。切り出しに反映するのは review のときだけで、
   *  それ以外はただ回るだけ。動かさずに離したらタップとして扱い、
   *  下の舞台の「タップで録音」に譲る(tappedRef)。 */
  const onDialDown = useCallback((e: React.PointerEvent, side: "L" | "R") => {
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    const ox = r.left + cx;
    const oy = r.top + cy;
    const el = reelL.current;
    stopCoast();
    dragRef.current = {
      id: e.pointerId, side, ang: Math.atan2(e.clientY - oy, e.clientX - ox),
      notch: 0, moved: 0, rot: Number(el?.dataset.rot ?? 0), vel: 0, t: performance.now(),
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
      d.moved += Math.abs(delta);
      applyDial(reelL.current, d.rot);
      // 切り出しに効くのは review のときだけ。それ以外はただ回るだけ。
      if (reviewRef.current) advanceTrim(d.side, delta);
    };
    const up = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (d && ev.pointerId !== d.id) return;
      if (d) {
        const el = reelL.current;
        if (el) el.dataset.rot = String(d.rot);
      }
      dragRef.current = null;
      setActive(null);
      // ほとんど動かさずに離したら「タップ」。回転として扱わず、
      // 下の舞台の click(録音の開始/停止)をそのまま通す。
      draggedRef.current = !!d && d.moved > TAP_SLOP;
      // ★離した勢いが残っていれば、惰性で回し続ける。
      if (d && d.moved > TAP_SLOP && Math.abs(d.vel) > COAST_STOP * 3) startCoast(d.side, d.rot, d.vel);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [cx, cy, advanceTrim, startCoast, stopCoast]);

  // ★いつでも押せる取り消し。録音中でも切り出し中でも、その録音を捨てて
  // 最初の状態へ戻す(hook 側の cancel が状態に応じて処理を分ける)。
  const cancelAll = useCallback(() => {
    stopCoast();
    trimRef.current = { start: 0, end: 1 };
    for (const el of [reelL.current]) {
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
    flash("CANCEL");
    if (onClose) { beginExit(); return; }
    cancelAll();
  }, [onClose, beginExit, cancelAll, flash]);

  const canToggle = recording || state === "idle";

  return (
    <div ref={boxRef} style={{
      // ★幕の中では割合の高さを使わず inset で埋め切る(端末によって
      // 親の高さの解決が揺れても、下端に隙間が残らないように)。
      ...(dim
        ? { position: "absolute" as const, inset: 0 }
        // ★タブの中も同じ。器は `.full-bleed` を付けた親(RecordTab)が
        // 既に画面いっぱいなので、ここは 100% を埋めるだけでよい。
        // タブバーのぶんの計算はこの部品では**一切しない**。
        : { position: "relative" as const, width: "100%", height: "100%" }),
      overflow: "hidden", background: ground,
      // 閉じていく間は、円が出ていくのに少し遅れて地も消える。
      ...(onClose ? {
        opacity: leaving ? 0 : 1,
        transition: `opacity ${DIAL_OUT_MS}ms var(--ease-press)`,
        pointerEvents: leaving ? "none" as const : undefined,
      } : null),
    }}>
      {/* ★★★**録音機の本体**（2026-09-27・第133巡）。**縦長の角丸の四角** ――
          Explore の札と同じ比・同じ角丸（`lib/recorder.ts`）。面は JOURNAL の青。
          ★★**円の `div` の中に入れないこと** ―― 録音中は円の芯が回るので、中に
          入れると一緒に回る。★`pointerEvents: none` … 掴めるのは**円だけ**。 */}
      {shown && (
        <div
          key={`plate-${enterKey}`}
          className={leaving ? "vs-plate-out" : "vs-plate-in"}
          aria-hidden
          style={{
            position: "absolute", zIndex: 0, pointerEvents: "none",
            left: bodyLeft, top: bodyTop, width: bodyW, height: bodyH,
            background: JOURNAL_FACE,
            borderRadius: CARD_RADIUS,   /* ★札と同じ角（タブバーのピルの半径） */
            boxShadow: SOFT_SHADOW_LG,   /* ★★Explore の札と同じ影（第133巡にユーザー指定） */
          }}
        />
      )}
      {/* ★★★**キーの段 ―― 左の円とバー**（第95巡）。**これがそのまま「キーの穴」**。
          ★幅は**回る円の直径と同じ**（札の下の1列が写真の幅に収まるのと同じ）。 */}
      {shown && (
        <div
          key={`deck-${enterKey}`}
          className={leaving ? "vs-plate-out" : "vs-plate-in"}
          aria-hidden
          style={{
            position: "absolute", zIndex: 0, pointerEvents: "none",
            left: deckLeft, top: deckTop, width: deckW, height: deckH,
          }}
        >
          <div style={{
            position: "absolute", left: 0, top: 0, width: knobD, height: knobD,
            borderRadius: RADIUS.circle, background: INK,
          }} />
          <div style={{
            position: "absolute", left: barLeft - deckLeft, top: 0,
            width: barW, height: deckH,
            borderRadius: deckH / 2,   /* ★目盛りの外（図形の座標系＝段の高さの半分） */
            background: INK,
          }} />
        </div>
      )}

      {/* ★★★**回る円は1つ**（第133巡）。直径は札の写真と同じ。**左半分を回すと頭、
          右半分を回すと尻**を切り出す（`dialAt`）。
          ★指を受けるのはこの円ではなく**上にある舞台**（円の式で振り分ける）。 */}
      {shown && (
        <div
          key={`reel-${enterKey}`}
          className={leaving ? "vs-plate-out" : "vs-plate-in"}
          style={{
            position: "absolute", width: RD, height: RD, borderRadius: RADIUS.circle,
            background: dial,
            left: cx - RD / 2, top: cy - RD / 2,
            zIndex: 1, pointerEvents: "none",
            willChange: "transform",
            transform: active ? "scale(1.028)" : "scale(1)",
            transition: "transform var(--t-item) var(--ease-settle)",
          }}
        >
          {/* ★回るのはこの層だけ。芯は `lib/reelHub.ts` の1か所（ホームの山の円と共有）。 */}
          <svg
            ref={reelL}
            data-rot="0"
            className={recording ? "vs-reel-spin" : undefined}
            viewBox="0 0 100 100"
            aria-hidden
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              willChange: "transform", transform: "translateZ(0)",
            }}
          >
            <path d={hubPath()} fill={tick} />
          </svg>
        </div>
      )}

      {/* ★★★**ドット表示の窓**（第133巡）。墨の窓の中に点の格子（`lib/pixelScreen.ts`）。
          ★時間・状態・波形・ボタンの合図は全部ここ。★触らない（指は下の舞台が受ける）。
          ★canvas は**いつも置いておく**（寸法を測る `ResizeObserver` が見ている）。 */}
      <div aria-hidden style={{
        position: "absolute", zIndex: 2, pointerEvents: "none",
        left: deckLeft, top: scrTop, width: deckW, height: scrH,
        background: INK, borderRadius: scrR,
        opacity: shown && !leaving ? 1 : 0,
        transition: "opacity var(--t-item) var(--ease-settle)",
      }}>
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute", inset: SPACE.xs, width: `calc(100% - ${SPACE.xs * 2}px)`,
            height: `calc(100% - ${SPACE.xs * 2}px)`, display: "block",
          }}
        />
      </div>

      {/* 舞台。指を受ける唯一の面。円の上なら回転、それ以外(と、円の上でも
          ほとんど動かさなかったとき)はタップとして録音の開始/停止。 */}
      <div
        onPointerDown={(e) => {
          draggedRef.current = false;
          const side = dialAt(e.clientX, e.clientY);
          onDialRef.current = !!side;
          // ★★円の上の指はモジュールの送りへ渡さない（回すのと送るのを取り合わない）。
          if (side) { claimFromRail(e.pointerId); onDialDown(e, side); }
        }}
        onClick={() => {
          // 回した直後の click は無視する(マウスでは drag のあとにも来る)。
          if (draggedRef.current) { draggedRef.current = false; return; }
          // ★録音の開始/停止は **REC キーか円をタップしたときだけ**
          // (ユーザー指定)。それ以外の余白は何も反応しない。
          if (onDialRef.current && canToggle) { flash(recording ? "STOP" : "REC"); voice.toggle(); }
        }}
        role={canToggle ? "button" : undefined}
        aria-label={recording ? "録音を停止" : "録音を開始"}
        // 反応するのは円の上だけなので、それ以外はカーソルも変えない。
        style={{
          position: "absolute", inset: 0, zIndex: 2,
          cursor: "default",
          touchAction: "none",
          pointerEvents: leaving ? "none" : "auto",
          userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
        }}
      />

      {/* ★★★**操作キーは「下の段」の中に置く**（2026-09-13・第95巡にユーザー指定
          「**ボタン類をバーに当てはめる**。その際ボタンの大きさや形もバーに
          合わせて調整」「**左の円＝REC、バーの中に残り3つ**」）。
          ★★★**穴はキーが自分で描かない** ―― 下の段（黒い円とバー）が穴なので、
          `well` に `"transparent"` を渡す。二重に穴を描くと縁が濁る。
          ★★ラベルは**墨の面の上**にいるので、色は `bodyInkOn(下の段)` が導く
          （地から決めていた `fg` は使わない。面が変わったのだから）。
          ★この帯は素通し（`pointerEvents: none`）。指を受けるのはキーだけ ――
          空いている所で指を吸うと、その下のダイヤルが回せなくなる。 */}
      {/* ★★★**器は「下の段」そのもの**（2026-09-13・第97巡）。キーは flex で
          積まずに、**穴の中心の x へ絶対配置する** ―― 第96巡は
          「ラベル → キー」を縦に積んでいたので、ラベルの高さの誤り（12 と書いて
          実際は 7）がそのまま**キーの縦位置のずれ**になっていた。
          ★**中心を数で持つと、ずれようがない。** */}
      <div style={{
        position: "absolute", left: deckLeft, top: deckTop,
        width: deckW, height: deckH,
        zIndex: 3, pointerEvents: "none",
      }}>
        <TransportKey
          label="REC" ring={ringRec} ringOff={ringIdle}
          pressed={recording} enabled={!sending}
          onPress={() => { flash(recording ? "STOP" : "REC"); voice.toggle(); }}
          fg={plateInk} cap={cap} well="transparent" socket={socket} lampOff={lampOff}
          cx={keyCx.rec} keyD={keyD} deckH={deckH}
        />
        {/* ★PAUSE。録音中だけ押せる。押すとその場で止まり、もう一度押すと
            そのまま続きから録れる(MediaRecorder の pause/resume)。 */}
        <TransportKey
          label="PAUSE" lamp={acc.pause} bars
          pressed={paused} enabled={recording}
          onPress={() => { flash(paused ? "PLAY" : "PAUSE"); voice.togglePause(); }}
          fg={plateInk} cap={cap} well="transparent" socket={socket} lampOff={lampOff}
          cx={keyCx.pause} keyD={keyD} deckH={deckH}
        />
        <TransportKey
          label="SEND" lamp={acc.send}
          pressed={sending} enabled={review}
          onPress={() => { flash("SEND"); voice.send(trimRef.current); }}
          fg={plateInk} cap={cap} well="transparent" socket={socket} lampOff={lampOff}
          cx={keyCx.send} keyD={keyD} deckH={deckH}
        />
        {/* ★CANCEL はいつでも押せて、録音を捨てて最初の状態へ戻す。
            オーバーレイでは、これがそのまま「元の画面へ戻る」になる
            (右上の閉じるボタンは廃止した)。 */}
        <TransportKey
          label="CANCEL" cross lamp={acc.cancel}
          pressed={false} enabled={!sending && !leaving}
          onPress={onCancelKey}
          fg={plateInk} cap={cap} well="transparent" socket={socket} lampOff={lampOff}
          cx={keyCx.cancel} keyD={keyD} deckH={deckH}
        />
      </div>

      {/* ★右上の閉じるボタンは廃止(2026-08-11)。オーバーレイを閉じるのは
          CANCEL キー。物理キーの列に操作を一本化した。 */}

    </div>
  );
}

/**
 * 録音機の操作キー。出っ張り(KEY_DEPTH)を持ち、押されると沈む。
 *
 * ★★★第79巡に**グレーアウトをやめた**（ユーザー指定）。押せる／押せないを
 * 面の色で言うのをやめ、**2つの語彙**だけで表す:
 *   ・**沈んでいるか出ているか**（形）… その機能が**いま働いている**
 *     （録音中の REC・停止中の PAUSE・送信中の SEND）＋指で押している間。
 *   ・**ランプが灯っているか**（光）… **いま押せるか**。消えていれば押せない。
 * ★だから面の色 `cap` はどの状態でも同じ。**キーは死んで見えない。灯りが消える。**
 *
 * ★★記号（2本線・✕・丸）は面の上ではなく、面に開いた**墨の窓**(`socket`)の
 * 中に置く。白い面の上では盤の色が 1.2〜1.8 しか出ないが、墨の上なら
 * 4.7 以上出る ―― これが「アクセントカラーの点灯」を成立させている唯一の理由。
 * REC の輪だけは窓ではなく**面の縁**に沿う（ユーザー指定の見え方）。
 */
function TransportKey({ label, lamp, ring, ringOff, cross, bars, pressed, enabled, onPress, fg, cap, well, socket, lampOff, cx, keyD, deckH }: {
  label: string;
  /** 窓の中で灯る色。★押せるときだけ灯る。 */
  lamp?: string;
  /** REC の輪の色(録音中)。 */
  ring?: string;
  /** REC の輪の色(待機)。★消灯ではなく**黒い輪**（ユーザー指定）。 */
  ringOff?: string;
  /** CANCEL の ✕。 */
  cross?: boolean;
  /** PAUSE の2本線。 */
  bars?: boolean;
  /** ★**その機能がいま働いているか**。沈んだままになる。 */
  pressed: boolean;
  enabled: boolean;
  onPress: () => void;
  fg: string;
  /** キーの面。★状態で変えない。 */
  cap: string;
  /** キーが沈む穴。★半透明にしないこと。明るい円の上と地の上とで
   *  見え方が変わり、物として読めなくなる。 */
  well: string;
  /** 記号が灯る窓。 */
  socket: string;
  /** 消えているランプ。 */
  lampOff: string;
  /** ★★**穴の中心の x**（下の段の左端からの距離）。キーの円をここに同心で置く。 */
  cx: number;
  /** ★★**キーの円の直径**。呼ぶ側が `deckH − KEY_LIP × 2` で導く。 */
  keyD: number;
  /** ★下の段（キーの穴）の高さ。円の中心を `deckH / 2` へ置くために使う。 */
  deckH: number;
}) {
  const [held, setHeld] = useState(false);
  // 沈んで見えるか。★**押せない**は含めない（それはランプが言う）。
  const down = pressed || held;
  const ink = enabled ? (lamp ?? fg) : lampOff;
  const socketD = keyD * SOCKET_PER_KEY;
  return (
    <>
      {/* ★★★**ラベルは段の外・キーの上**（2026-09-13・第96巡にユーザー確定）。
          段が薄いので、キーとラベルの両方は段の中に入らない ―― 文字だけ段の外へ出す。
          ★★★**キーと同じ中心の x に絶対配置する**（第97巡）。積み上げをやめたので、
          ラベルの高さが変わってもキーの縦位置は1pxも動かない。
          ★面は**青い本体**なので、色は呼ぶ側が面から導いて渡す（`fg`）。 */}
      <span style={{
        position: "absolute", /* ★目盛りの外（穴の中心から置く＝図形の座標系） */ left: cx,
        bottom: `calc(100% + ${SPACE.xs}px)`, transform: "translateX(-50%)", whiteSpace: "nowrap",
        fontFamily: SANS, fontSize: TYPE.nano, fontWeight: WEIGHT.bold, letterSpacing: TRACK.caps,
        color: fg, marginRight: `-${TRACK.caps}`, lineHeight: LEAD.flat,
      }}>{label}</span>
      {/* ★★★**円の光学的な中心を段の中心線へ置く**（2026-09-13・第97巡）。
          箱の高さは `keyD + KEY_DEPTH`（下の `KEY_DEPTH` は沈むための溝）で、
          **浮いているときの円は箱の上端から `keyD`** ―― だから箱の上を
          `deckH/2 − keyD/2` に置けば、**待機の円がちょうど中心線に乗る**。
          ★第96巡は箱ごと `alignItems: "center"` で中央に置いていたので、
          溝のぶん **2px 上**（＋ラベルの誤りで 5px、合わせて 7px 上）へずれ、
          **押しても一度も中心線を通らなかった**。 */}
      <div style={{
        position: "absolute", /* ★目盛りの外（穴の中心から置く＝図形の座標系） */ left: cx - keyD / 2,
        /* ★目盛りの外（同上） */ top: deckH / 2 - keyD / 2,
        width: keyD, height: keyD + KEY_DEPTH, pointerEvents: "auto",
      }}>
        {/* キーが沈む「穴」。★キーより WELL_LIP だけ広く、四方に影が回る。 */}
        <div style={{
          position: "absolute", left: -WELL_LIP, bottom: -WELL_LIP,
          width: keyD + WELL_LIP * 2, height: keyD + WELL_LIP * 2,
          borderRadius: RADIUS.circle, background: well,
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
            position: "absolute", left: 0, bottom: 0, width: keyD, height: keyD,
            borderRadius: RADIUS.circle, border: "none", padding: 0,
            background: cap,
            transform: `translateY(${down ? 0 : -KEY_DEPTH}px)`,
            transition: "transform var(--t-press) var(--ease-press)",
            cursor: enabled ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
          }}
        >
          {ring ? (
            // ★REC の赤い線は、**ボタンの丸い面の内側の縁に沿わせる**
            // (ユーザー指定)。待機は黒い輪、録音を始めると赤く光る。
            <span style={{
              position: "absolute", inset: SPACE.xs, borderRadius: RADIUS.circle,
              border: `1.5px solid ${pressed ? ring : ringOff}`,
              transition: "border-color var(--t-item) var(--ease-settle)",
            }} />
          ) : (
            // ★記号の窓。この中でだけ盤の色が読める。
            <span style={{
              width: socketD, height: socketD, borderRadius: RADIUS.circle,
              background: socket, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {bars ? (
                <span style={{ display: "flex", gap: SPACE.xs }}>
                  {[0, 1].map((i) => (
                    <span key={i} style={{
                      /* ★目盛りの外（記号の線＝図形の座標系） */ width: keyD * BAR_W_PER_KEY, height: keyD * BAR_H_PER_KEY,
                      background: ink,
                      transition: "background var(--t-item) var(--ease-settle)",
                    }} />
                  ))}
                </span>
              ) : cross ? (
                <span style={{ position: "relative", width: keyD * CROSS_PER_KEY, height: keyD * CROSS_PER_KEY }}>
                  {[45, -45].map((deg) => (
                    <span key={deg} style={{
                      position: "absolute", /* ★目盛りの外（✕印の2本の線の交点＝図形の座標系） */
                      top: keyD * (CROSS_PER_KEY - CROSS_LINE_PER_KEY) / 2, left: 0,
                      width: keyD * CROSS_PER_KEY, height: keyD * CROSS_LINE_PER_KEY,
                      background: ink, transform: `rotate(${deg}deg)`,
                    }} />
                  ))}
                </span>
              ) : (
                <span style={{
                  /* ★目盛りの外（ランプの丸＝図形の座標系） */ width: keyD * LAMP_PER_KEY, height: keyD * LAMP_PER_KEY, borderRadius: RADIUS.circle,
                  background: ink,
                  transition: "background var(--t-item) var(--ease-settle)",
                }} />
              )}
            </span>
          )}
        </button>
      </div>
    </>
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
  // ★開いている間は **html の地色も幕の色に**する。実機(iPhone)で、幕の下端と
  // 画面の下端のあいだに明るい帯が残ると報告された。position:fixed の要素が
  // どこまで届くかは端末の事情(セーフエリア・ツールバー)で変わりうるので、
  // 「届かなかった所に何色が出るか」を合わせて、隙間そのものを見えなくする。
  // タブの中で気づかなかったのは、そちらの地色が html と同じだったから。
  // ★地色は lib/ground.ts が唯一の窓口(html の背景 + theme-color)。
  // 自前で prev を覚えるのはやめた — 書き手が複数あると戻らなくなる。
  useEffect(() => (open ? pushGround(DIM_GROUND, "overlay") : undefined), [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="vs-in" data-paint style={{
      position: "fixed", left: 0, top: 0, right: 0, bottom: 0,
      // 高さも明示しておく(inset だけに頼らない)。
      width: "100vw", height: "100lvh", minHeight: "100%",
      zIndex: 58, background: DIM_GROUND,
    }}>
      {/* ★器の高さは画面いっぱい。タブの中の器も bleed でここと同じ高さに
          揃えてあるので、円の大きさ・位置が両者で必ず一致する。 */}
      <VoiceStudio voice={voice} dim onClose={onClose} />
    </div>,
    document.body,
  );
}
