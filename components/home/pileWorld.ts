import { DISPLAY, INK, JOURNAL_FACE, KIND_DOMAIN, PAPER, SHAPE_FACE, TASK_FACE } from "@/lib/constants";
import { cardShapeOf, cardShapePoints, type CardShape } from "@/lib/cardShape";
import { CASSETTE_ASPECT } from "@/lib/cassette";
import { bodyInkOn, colorOfKind } from "@/lib/palette";
import { categoryOfKind } from "@/lib/deckStyle";
import { rowSpecOf, rowsOf } from "@/lib/taskSize";
import { PHYS_GAP, PHYS_VERTS, clampRows, stackOutline } from "@/lib/solid";
import { PILE_INSET, floorYOf, pileWOf } from "@/lib/pileBox";
import {
  WD_FULL, WD_SHORT, joinSplitPlate, makeWordBody, measureWordPlate, wordFontSize, type WordPlate,
} from "@/lib/wordPlate";

import type { Body, Engine } from "matter-js";
import type { BriefCard, Item, ItemKind, TabId, Task } from "@/lib/types";
import type { Landing } from "@/lib/pullDrag";

// ★★★**山の「世界」**（2026-09-11・第92巡に `components/home/Pile.tsx` から分けた）。
// 物理の値・器の壁・図形の作り方だけがここに居る。**画面と指の扱いは `Pile.tsx`、
// 焼き方は `pilePaint.ts`。**
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
//   ・**円** … まだ見ていない提案の残り数（第131巡にトゲトゲから単位円へ）。数字を中に置き、0 で消える。
// ★★**色は帯から引き継ぐ** ―― 上でその色だったものが、下りても同じ色のまま
//   形だけ変わる（タスク＝タグの色／提案＝そのカードの色）。
// ★★★**大きさは「段の高さ」1つ**（第116巡。`lib/taskSize.ts` の `rowSpecOf`）。
//   ★GRAVITY は今までどおり `specOf`（重要度 × 締切の近さ）。**別の読み方**。

type M = typeof import("matter-js");

// ── 物理（★`GravityTab` と同じ値。目盛りの外＝物理の場） ──────────────
export const GRAVITY_Y = 1.4;
/** 一括の倍率の上限（solid 座標 → px）。★引き下ろしの初期値にも使う。 */
export const UNIT = 64;
export const MASS_K = 1.6;
const BODY = { restitution: 0.04, friction: 0.55, frictionStatic: 0.9, frictionAir: 0.012 };
const WALL_T = 200;
/** ★左右の壁の最低の長さ（器が低くても図形が抜けない）。★目盛りの外（物理の場）。 */
const WALL_MIN_H = 1200;
/** ★床よりこれだけ下まで行ったら「もう戻れない」＝上から落とし直す。★同上。 */
const LOST_BELOW = 900;
/** ★左右の壁よりこれだけ外に出たら「外へ出た」。★同上。 */
const LOST_SIDE = 120;
/** ★当たり判定の頂点どうしがこれより近ければ1つに畳む（px）。★目盛りの外（物理の場）。 */
const VERT_MIN = 2;
/** 山が器に占める割合。★目盛りの外（詰め込み具合）。
 *  ★★**帯が厚いほど山の取り分が減る**ので、帯の厚み（`BAND_H`）とセットで決める。
 *  ★2026-09-10 に **0.36** ―― 文字の板と未読の図形を予算に数えるようにしたぶん。 */
const FILL = 0.5;
/** ★★**1つの図形が器に対して取ってよい上限**（`GravityTab` の `FIT_W`/`FIT_H` と
 *  同じ考え方）。面積の予算だけだと、重要度の高い1枚が器の半分を覆ってしまう。
 *  ★★★**第124巡に 0.52 → 0.86**（ユーザー指定「**横幅を今の2倍くらい大きく**」）。
 *  ★★★**幅を2倍にしたら、上限も同じだけ広げないと「上限のほうが先に効く」** ――
 *    0.52 のままだと `cap` が全体を 26.4 まで押し下げ、**タスクは大きくなるどころか
 *    小さくなった**（実測 … 4件で unit 26.4 ＝ 板の 37.0 に届かない）。
 *  ★★**0.86 は「いちばん幅を取る3段の題が器に収まる」上限**（実測 … 284px 対
 *    山の内寸 358px）。★第90巡の「0.68 では塔になる」は**幅が半分だった頃の話**で、
 *    いまは figure そのものが横長なので塔にはならない。
 *  ★★**高さの上限（`FIT_H`）は変えない** ―― 段の数は増やしていない。 */
const FIT_W = 0.86;
const FIT_H = 0.28;

/**
 * ★★★**1つの図形が器に対して取ってよい上限で倍率を抑える**（`buildPieces` と同じ式）。
 * 引き下ろしの行き先の大きさにも要る（第102巡）―― まだ山に居ないものは
 * `buildPieces` の `unit` の計算に**入っていない**ので、抑えないと器より大きく出る。
 */
export function fitUnit(unit: number, sw: number, sh: number, bw: number, bh: number): number {
  const usableH = Math.max(120, floorYOf(bh));
  return Math.max(10, Math.min(unit,
    (bw * FIT_W) / Math.max(1, sw), (usableH * FIT_H) / Math.max(1, sh)));
}
/**
 * ★★★**提案の直径は「段の高さの何倍か」**（2026-09-17・第116巡）。
 * ★★**`unit` の意味が「段の高さ」に変わった**（`rowSpecOf`）ので、重要度の目盛り
 *   （`weightArea(3) × 1.6`）からは引けない ―― **ホームの図形はもう重要度を持たない**。
 * ★3.2 は移行前の実測から … 旧 `unit` で提案の直径は `4.04 unit`、1段のタスクの
 *   段の高さは `1.49 unit` だったので **2.7倍**、3段だと 5.4倍。**その間を取る。**
 * ★★★**第124巡に「カーブから逆算する数」へ変わった**（ユーザー指定
 *   「**ピルの角のカーブを基準に形を構成できますか。ピルのカーブに対して提案の
 *   図形のカーブが合っていない。うまく調整し、図形で調和をとってください**」）。
 *
 * ★★★**札の形のカーブの半径は「形の箱に対する比」で決まる**（`lib/cardShape.ts`
 *   の実測 … 四つ葉 0.2778 ／ 六角形 0.2665 ／ 波打つ四角 0.2436 ／
 *   トゲトゲ 0.2563。**平均 0.2611**）。
 * ★★★**ピルの角の半径は「段の高さ」そのもの**（`lib/solid.ts` ―― 角丸 ＝
 *   高さの半分、2段 ＝ `2 × unit`）。**だから `OFFER_D = 1 / 0.2611` にすれば、
 *   提案のカーブとタスク・板・帯のカーブが px で一致する。**
 * ★★★**だからこの数を手で振らない** ―― 大きさを変えたいなら、変えるのは
 *   `lib/cardShape.ts` の凹凸の数（＝カーブの比）のほう。振ると調和が崩れる。
 * ★★**4つを完全に揃えることはできない** ―― 四つ葉は `k > 1` の制約で 0.25 より
 *   下へ行けない（`QUATREFOIL_R` の注釈）。幅は 1.14倍（第123巡は 2.55倍）。
 */
// ★★★**第128巡に「実機の写真の 1.5倍」へ**（ユーザー指定「**提案の図形は最大2個に
//   減らし、一つあたりの大きさを1.5倍くらいに**」）。
//   ★★★**3.83 × 1.5 ではない** ―― 同じ巡に**段の高さそのもの**も上がった
//     （予算の頭打ちを外して `unit` ＝ 板の半分。下の `raw`）ので、掛け算すると
//     **2.2倍**になる（試して実測 … 直径 212px で山が帯の裏まで積み上がった）。
//   ★★**写真から解いた** … 実機の写真で 提案の直径 ≒ **95px**・板の高さ ≒ 70.5px
//     （段の高さ 35.2px）。目標 95 × 1.5 ＝ 143px ÷ 35.2 ＝ **4.05 段**。
//   ★★**上の「カーブが一致する」は崩れる**（提案のカーブは約 1.06 unit）。
//     ユーザー指定の上での選択。**カーブの比（`lib/cardShape.ts`）は触っていない。**
// ★★★**第131巡に 4.05 → 4**（案①「円とカプセルの文法」… 大きさは段の 1・2・4 倍だけ）。
//   直径 4 段 ＝ **半径 2 段**。形の凹凸の半径は箱の 0.25〜0.28 なので、**1〜1.1 段**
//   ＝ タスクの角・板の角・未読の円と同じ「単位円」になる（`lib/cardShape.ts`）。
//   ★4.05 との差は 1.2%（写真から解いた大きさはほぼそのまま）。
const OFFER_D = 4;
/**
 * ★★★**提案の体だけ光線を増やす**（2026-09-18・第121巡にユーザー指摘
 * 「**他の図形と干渉してなんかめり込んでしまったり**」）。
 *
 * ★★★**タスクの `PHYS_VERTS`(12) は「ピルの積み」に合わせた本数** ―― 縁が
 *   なめらかな形なので 12 で足りる。ところが**札の4つの形は縁に山と谷がある**
 *   （波打つ四角は 16 個の円の外縁）ので、12 本では谷ばかり拾って**体が絵より
 *   小さくなる**。実測 体÷絵 … 四つ葉 0.988／六角形 0.973／**波打つ四角 0.900**／
 *   トゲトゲ 1.014 ―― 波打つ四角は **10% 小さい**ので、隣とめり込んで見えた。
 * ★**28 本にすると** 1.034／0.990／**1.011**／1.014 に収まる（頂点 16／21／12／20）。
 * ★★**偶数**であること（左右の対称性を式に保証させる。`PHYS_VERTS` と同じ約束）。
 * ★★**費用は「軸の本数 × 頂点数」**だが、提案は多くて数体なので効かない
 *   （タスクは 12 のまま ―― こちらは十数体あるので上げない）。
 * ★目盛りの外（物理の刻み）。
 */
const OFFER_VERTS = 28;
/**
 * ★★★**混み具合で全体を縮める**（2026-09-17・第118巡にユーザー指定
 * 「**図形が多すぎると操作しづらくなる（特にピルのあたりまで高さがくると
 * 操作できなくなる）ので、全体のスケールを多さによって調整して、図形全部の
 * スケールを一律で少しだけ小さくするなどの調整がかかるように**」）。
 *
 * ★★★**面積の予算だけでは足りない理由** ―― 予算は「器の何割を塗るか」なので、
 *   件数が増えても**塗る面積の合計は変わらない**。ところが**傾いた図形は隙間を
 *   多く作る**ので、件数が増えるほど**同じ面積でも山は高く積み上がる**。
 * ★★★**`crowd` は「長さ」の倍率**（面積ではない）。`unit ∝ √予算` なので、
 *   予算には `crowd²` を掛け、**日付と曜日の板の大きさには `crowd` をそのまま**
 *   掛ける ―― こうして初めて**全部が一律に**縮む。
 *   ★★**板だけ据え置くと、混むほど板が相対的に巨大になる**（第117巡の実機の写真）。
 *   ★★★**板は `room` と `PILE_WORD_MAX` の**両方**に掛けること**（第120巡）――
 *     字の大きさは `min(幅に収まる値, 上限)` なので、**上限が効いている間は
 *     `room` だけ縮めても 1px も変わらない**（実測 … 390 幅では上限 72 が
 *     効いていて、混んでも板だけが元の大きさで残った）。ユーザー報告
 *     「**日付だけ変わらない**」はこれ。両方に掛ければ、どちらが効いていても
 *     字は厳密に `crowd` 倍になる。
 *
 * ★★★**第120巡に大きく緩めた**（ユーザー「**山全体のスケールが効き過ぎています。
 *   小さすぎるようになってしまっているので緩めてください**」）。
 *   ★★**そもそも「混むほど山は高くなる」という第118巡の見立てが逆だった** ――
 *     実測（390×844・タスク 4／9／14 件）… **帯からの余裕は 100／140／160px** で、
 *     **件数が増えるほど山は低い**（小さい図形は密に積むので、同じ面積でも
 *     高さが要らない）。⑥を直したのは**帯の高さを予算から引いたこと**であって、
 *     この係数ではなかった。
 *   ★★だから**18体を超えるまでは 1 のまま**、超えても **0.94 止まり**にする
 *     （実測 … 4／9／14／22 件で余裕 104／164／168／220px・塗った面積はほぼ一定）。
 * ★目盛りの外（詰め込み具合）。
 */
/**
 * ★★★**日付と曜日の板の高さ ＝ 何段ぶんか**（2026-09-19・第124巡にユーザー指定
 * 「**2段の時の大きさを日付と曜日の図形の高さと合わせ**」）。
 * ★★**段の高さ（`unit`）はここから導く**ので、**画面側に数を置かない**。
 * ★目盛りの外（図形の座標系）。
 */
const PLATE_ROWS = 2;
const CROWD_N0 = 18;
const CROWD_MIN = 0.94;
/** ★落とす体の数 → 長さの倍率（1 以下）。 */
const crowdOf = (n: number): number =>
  Math.max(CROWD_MIN, Math.min(1, Math.sqrt(CROWD_N0 / Math.max(1, n))));
/**
 * ★★★**提案の面積**（段の高さ²。2026-09-15・第110巡に名前を付けた）。
 * ★**`HomeTab.seed` も代理の体もここを読む** ―― 重さの目盛りは1つ。
 */
export const OFFER_AREA = Math.PI * (OFFER_D / 2) ** 2;
/** ★提案の半径（px）。★引き下ろしの行き先の大きさにも要るので **export**（第102巡）。 */
export const offerRadiusOf = (unit: number): number =>
  Math.max(28, Math.sqrt((OFFER_AREA * unit * unit) / Math.PI));
/** ★★★落とし方は `GravityTab` と**同じ**（傾き・回り・横の初速）。
 *  ★★★2026-09-09 に**回り慣性の細工を全部やめた**（ユーザー指定「ひっくり返っても
 *  なんでもいいので自然に落としてください」）。`setInertia` で回りにくくすると、
 *  **質量と形から決まる本来の慣性と食い違う** ―― 落ちるあいだは重そうなのに、
 *  ぶつかった瞬間だけ勝手に向きが戻る、という物体に見えない動きになる。 */
const SPAWN_TILT = 0.5;      // 初期の傾き（±0.25 rad ≒ ±14°）
const SPAWN_SPIN = 0.05;     // 初期の回り
const SPAWN_VX = 1.2;        // 横の初速
/** ★★★**山の器（左右の内寸と床）は `lib/pileBox.ts`**（第91巡）。
 *  ★★**左右は対称**（第102巡に戻した。理由は `lib/pileBox.ts` の頭）。 */
const INSET = PILE_INSET;
/**
 * ★★★**落とす間隔は「時間」で取る**（2026-09-09。それまでは「高さ」で取っていた）。
 * 高さで取ると**山が大きいほど出どころが空の彼方へ行く** ―― 実測（器 573px）…
 * 9個で最上段が **-1571px ＝ 器の 2.7 枚ぶん上**。着地が叩きつけになった。
 */
export const DROP_EVERY_MS = 60;
/** ★カセットの本体の高さ ÷ 日付の板の高さ。★第131巡に 2 にしたのを第132巡に 1 へ戻した
 *  （形の規則の都合で大きくしただけで、意味から決めた大きさではなかった）。 */
const CASSETTE_PER_PLATE = 1;
/**
 * ★★★**焦点 … 時刻が一番近い「これから」のタスク1件だけを大きく落とす**（2026-09-24・第132巡に
 * ユーザー承認「**山に最初に見る場所を1つ作る**」）。★大きさは 1.3倍の1段だけ（中間を作らない）。
 */
const FOCUS_K = 1.3;
/** 焦点のタスク（時刻 `dueTime` が今以降でいちばん早い1件）。時刻のあるものが無ければ null。 */
export function focusOf(tasks: { id: string; dueTime?: string }[], now: number): string | null {
  const d = new Date(now); const cur = d.getHours() * 60 + d.getMinutes();
  let best: { id: string; m: number } | null = null;
  for (const t of tasks) {
    const hm = /^(\d{1,2}):(\d{2})/.exec(t.dueTime ?? "");
    if (!hm) continue;
    const m = Number(hm[1]) * 60 + Number(hm[2]);
    if (m >= cur && (!best || m < best.m)) best = { id: t.id, m };
  }
  return best?.id ?? null;
}
/** ★落とす順を決める前の印（`buildPieces` の最後で時刻に置き換わる）。 */
const QUEUED = -1;
/**
 * 出どころの高さ＝**自分の背丈の半分 ＋ `DROP_ABOVE` ＋ 0〜`DROP_SCATTER`**。
 * ★★★**高さをばらす**（2026-09-11）。等間隔に1つずつ落とすと、どれも同じ速さで
 * 同じ距離を落ちるので、**一列に並んで順番に降りてくる**（コンベアに見えた）。
 */
const DROP_ABOVE = 24;
const DROP_SCATTER = 200;
/**
 * 板の字を組む幅（山の**内寸**に対する割合）。★GRAVITY は 0.66。
 * ★★★**第122巡に 0.84 → 0.67**（ユーザー指定「**日付と曜日のもの自体も
 *   小さくしてください**」）。**上限（`PILE_WORD_MAX`）と同じ比で下げる** ――
 *   字は `min(幅に収まる値, 上限)` なので、**片方だけ下げるとその画面幅では
 *   1px も変わらない**（第120巡に踏んだ。あちらの注釈を参照）。
 */
const WORD_W = 0.67;
/**
 * ★★★**ホームの日付・曜日の大きさの上限**。
 *
 * ★★★**`SWISS_XL`(72) を下げてはいけない** ―― あれは TIMELINE の巨大な曜日と
 *   **共有**なので、下げると TASK 側も縮む。**ホームだけの上限をここに置く**
 *   （いまはたまたま同じ値だが、**別の摘み**。片方だけ動かせるように残す）。
 * ★★塗りの箱（`WEDNESDAY`・WebKit 390 幅）の移り変わり …
 *   第99巡 300.7×52（Archivo を横 63% に潰していた）→ 第100巡 192.7×44（49）→
 *   第101巡 240×54（61）→ **いま 283×64（72）**。
 *   ★第100巡に「縦が 0.85 倍」を狙って 49 にしたら**横が 0.64 倍まで縮み**、
 *   2度「小さすぎる」と差し戻された。**縦だけを見て決めないこと。**
 * ★★★**第122巡に 72 → 58**（ユーザー指定「**日付と曜日のもの自体も小さく**」）。
 *   **`WORD_W` と同じ 0.80 倍**（理由はあちらの注釈 ―― 片方だけでは効かない）。
 *   ★第100巡の失敗とは別件 ―― あのときは**横だけが 0.64 倍**になっていた。
 *     今回は**縦も横も揃って 0.80 倍**（`fs` を下げるだけなので比は変わらない）。
 */
const PILE_WORD_MAX = 58;
/**
 * ★★★**絵と同じ輪郭で体を作り、`PHYS_GAP` だけ外側へ出す**（2026-09-13・第101巡に
 * ユーザー指定「**各図形と文字の当たり判定がおかしい**。図形も**表示されている
 * 部分**に当たり判定を。その当たり判定は**1ピクセルだけ外側にオフセット**し、
 * **図形同士が隣り合った時にもそれぞれの形がはっきり分かる**ように」）。
 *
 * ★★★**第100巡までホームの山だけ体が「矩形」だった** ―― GRAVITY と DRIFT は
 *   第99巡から `stackOutline` を使っているのに、山は `Bodies.rectangle` のまま。
 *   ピルの丸い端のぶん**絵より広い箱**で当たるので、隣り合うと**離れて見え**、
 *   角では**重なって見えた**。
 * ★★**頂点は原点へ揃えてから渡す** ―― `fromVertices` は**重心**を (x,y) に置くが、
 *   絵は `body.position` を**箱の中心**として描く。間引きで重心がわずかに
 *   ずれるので、渡す前に引いておく（ずれを持ち回らない）。
 * ★★**くびれ・切れ込みは凸包に潰れる**（`poly-decomp` が無い）。**それでよい**
 *   ―― GRAVITY で確定済みの判断で、山として引っ掛からないほうが正しい。
 */
function bodyFromOutline(
  m: M, pts: { x: number; y: number }[], w: number, h: number, opts: object,
  rays = PHYS_VERTS,
): Body {
  // ★★★**光線は「正規化した空間」で飛ばし、そのあと w/h を掛ける**
  //   （2026-09-16・第108巡）。
  //
  // ★★★**px の空間で等角に飛ばすと、横長の形は縁の点が足りなくなる** ――
  //   3:1 のピルだと 12本のうち大半が**長い上下の辺**に当たり（そこは直線なので
  //   凸包が捨てる）、**肝心の丸い端に 1〜2点しか残らない**。
  //   実測（180×60 の1段）… 頂点が **6個**まで潰れ、**体は絵より 10% 小さかった**
  //   （＝第101巡の「1ピクセルだけ外側」の約束が破れている）。端が1枚の平らな面に
  //   なるので、**角が面に乗る置き方**＝ゆらゆら揺れ続ける接触ができる。
  // ★★**正規化の空間ではどの形もほぼ円**なので、光線は縁を均等に拾う。
  //   実測（9形）… 体÷絵 **0.90〜1.02 → 0.96〜1.02**、180×60 の頂点 **6 → 16**。
  // ★★**大きさに依らなくなる**のも効く ―― `VERT_MIN` は px の閾値なので、
  //   px の空間だと**同じ形でも大きさで頂点の数が変わっていた**（実測 … 同じ1段の
  //   ピルが 180×60 で 6個、130×34 で 16個）。正規化すれば**形だけで決まる**。
  // ★★**左右の対称は保たれる**（縦横に拡大するだけ）ので、**重心と外接箱の中心は
  //   一致したまま**（実測 9形とも ずれ 0.0000px）。`pilePaint.drawPile` は絵の
  //   中心を `body.position` に描くので、ここがずれると絵と体が食い違う。
  //   ★参考 … `GravityTab` の「順番どおりの間引き」をそのまま持ってくると、
  //     **重心が最大 2.87px ずれる**（あちらは `ox/oy` を別に持ち回っている）。
  //     **借りないのが正しい。**
  /** 正規化の物差し（px の `VERT_MIN` がここでは「1%」の意味になる）。 */
  const REF = 100;
  const N = pts.map((q) => ({ x: q.x * REF, y: q.y * REF }));
  const nx = N.map((q) => q.x); const ny = N.map((q) => q.y);
  const cx = (Math.min(...nx) + Math.max(...nx)) / 2;
  const cy = (Math.min(...ny) + Math.max(...ny)) / 2;
  const C = radialVerts(N.map((q) => ({ x: q.x - cx, y: q.y - cy })), rays)
    .map((q) => ({ x: (q.x / REF) * w, y: (q.y / REF) * h }));
  const body = m.Bodies.fromVertices(0, 0, [C], opts);
  if (w > 1 && h > 1) {
    m.Body.scale(body, 1 + (PHYS_GAP * 2) / w, 1 + (PHYS_GAP * 2) / h);
  }
  return body;
}

/**
 * ★★★**原点から角 `th` の光線と、閉じた輪郭との「いちばん遠い」交点**。
 * ★輪郭は原点について星形（どの向きにも縁が1つ）なので、これで必ず縁が取れる。
 */
function rayHit(C: { x: number; y: number }[], th: number): { x: number; y: number } | null {
  const dx = Math.cos(th); const dy = Math.sin(th);
  let best = -1;
  for (let i = 0; i < C.length; i++) {
    const a = C[i]; const b = C[(i + 1) % C.length];
    const ex = b.x - a.x; const ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (a.x * ey - a.y * ex) / den;
    const u = (a.x * dy - a.y * dx) / den;
    if (t >= 0 && u >= -1e-9 && u <= 1 + 1e-9 && t > best) best = t;
  }
  return best < 0 ? null : { x: dx * best, y: dy * best };
}

/**
 * ★★★**当たり判定の多角形は「等角に測り直す」**（2026-09-14・第105巡）。
 *
 * ★★★**第104巡の「添字で間引いて左右へ折り返す」は重すぎた** ―― 折り返した点は
 *   元の点と重ならないので**細かい辺が大量に生まれ**、SAT の費用
 *   （＝**軸の本数 × 頂点数**）が**1段のピルで 16倍**になった。
 *   **接触の対が一気に増える着地の瞬間**に効いて、フレームが落ちた
 *   （ユーザー報告「図形が地面にぶつかった時フレームレートが急に低下する」）。
 *
 * → **外接箱の中心から `n` 本の光線を等角に飛ばし、交点を頂点にする**
 *   （`lib/cardShape.ts` と同じ極座標の作法）。
 *   ★★**`n` が偶数なら左右の対称性は式が保証する** ―― 角 `θ` の相手が必ず
 *     `π − θ` に居るので、**折り返して倍にする必要が無い**。
 *     対称なら**重心と外接箱の中心が一致する**（`fromVertices` は重心を
 *     `body.position` に置き、絵は外接箱の中心に描く。ここがずれると絵と体が食い違う）。
 *   ★★★**輪郭のいちばん外の点は別に足す** ―― **2段の積みは真ん中がくびれ**なので、
 *     角 0 の光線は**いちばん広い点を通らない**（実測で幅が 0.93 倍になった）。
 *     外の点も左右対称な集合なので、足しても対称は崩れない。
 *
 * ★実測（費用＝軸×頂点。第103巡 → 第104巡 → いま）… 1段 ar3 で 66 → 288 → **18**、
 *   2段 ar1.5 で 81 → 280 → **72**、3段 ar1 で 64 → 176 → **50**（6件）。
 *   ★**第104巡の 2.2〜16.0 倍軽い。**
 * ★★**体÷絵は6件とも縦横 1.0000、重心のずれは 6件とも 0.0000px**
 *   （第103巡は絵より 0.98 倍しか無く、重心が最大 1.76px ずれていた）。
 */
function radialVerts(C: { x: number; y: number }[], n: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < n; k++) {
    const q = rayHit(C, (Math.PI * 2 * k) / n);
    if (q) out.push(q);
  }
  const mx = Math.max(...C.map((q) => Math.abs(q.x)));
  const my = Math.max(...C.map((q) => Math.abs(q.y)));
  for (const q of C) {
    if (Math.abs(Math.abs(q.x) - mx) < 1e-6 || Math.abs(Math.abs(q.y) - my) < 1e-6) out.push(q);
  }
  // ★★★**必ず角度の順に並べてから渡す**（2026-09-14・第105巡）。
  //   ★★★**並べ忘れると多角形が自己交差し、SAT が「当たっていない」と答える**
  //     ―― 実測で、小さい図形1つが**床をすり抜けて落ち続け、衝突の対が 0 のまま**
  //     だった（矩形の体に替えると 10個全部が眠った）。**ここが今回いちばん怖い罠。**
  //   ★`Bodies.fromVertices` は凸なら `clockwiseSort`、凹なら凸包を取る ―― どちらも
  //     並べ直してくれる**はず**だが、**交差した列は「凸」と誤判定され得る**ので、
  //     **渡す前にこちらで並べる**。
  // ★★**近すぎる点は捨てる**（当たり判定の費用は**軸の本数 × 頂点数**。同じ所に
  //   2点あると、辺が1本増えるだけで形は変わらない）。
  out.sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
  const keep: { x: number; y: number }[] = [];
  for (const q of out) {
    const last = keep[keep.length - 1];
    if (!last || Math.hypot(q.x - last.x, q.y - last.y) > VERT_MIN) keep.push(q);
  }
  if (keep.length > 2 && Math.hypot(keep[0].x - keep[keep.length - 1].x,
    keep[0].y - keep[keep.length - 1].y) <= VERT_MIN) keep.pop();
  return keep.length >= 3 ? keep : out;
}

const frac = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (Math.imul(h, 2654435761) >>> 0) / 4294967296;
};

/** 湧く x（器の内寸のどこへ落とすか）。★`buildPieces` と `respawn` が同じ式を読む。 */
const spawnXOf = (w: number, bw: number, r1: number): number => {
  const half = bw / 2;
  const lo = INSET + half + 4;
  const hi = Math.max(lo, w - INSET - half - 4);
  return Math.min(hi, Math.max(lo, INSET + pileWOf(w) * (0.08 + r1 * 0.84)));
};

/**
 * ★★★**器の上から落とす**（位置・傾き・初速）。**式はここ1つ**（2026-09-14・第103巡）
 * ―― `buildPieces` の最初の落下と、**器の外へ出た図形を拾い直す番人**
 * （`components/home/Pile.tsx`）が**同じ落ち方**をする。2度書くと片方だけ直る。
 * ★`bh` は**絵の高さ**（体の外接箱ではない）。渡されなければ外接箱から取る。
 */
export function respawn(m: M, body: Body, w: number, seed: string, bh?: number): void {
  const r1 = frac(seed); const r2 = frac(`${seed}y`); const r3 = frac(`${seed}a`);
  const bw = body.bounds.max.x - body.bounds.min.x;
  const up = (bh ?? body.bounds.max.y - body.bounds.min.y) / 2 + DROP_ABOVE + r2 * DROP_SCATTER;
  m.Body.setPosition(body, { x: spawnXOf(w, bw, r1), y: -up });
  // ★★★**どの図形も傾いて落ち、自由に回る**（2026-09-19・第123巡にユーザー指定
  //   「**提案の図形も自由に回転したり動くようにしてください**」）。
  //   ★★**第121巡の「回らない体は傾けない」（`inverseInertia === 0` の枝）は
  //     撤回した。復活させない** ―― 歪んで見えた原因は回転ではなく
  //     **六角形の定義**だった（第123巡に正六角形へ直し、第131巡にアーチへ替えた）。
  m.Body.setAngle(body, (r3 - 0.5) * SPAWN_TILT);
  // ★★**回りは形の大小で加減しない**（2026-09-09）。大きさで割ると、小さい
  //   ものだけ空中で止まって見える。同じ初速を与えて、あとは形に任せる。
  m.Body.setAngularVelocity(body, (r3 - 0.5) * SPAWN_SPIN);
  m.Body.setVelocity(body, { x: (r1 - 0.5) * SPAWN_VX, y: 0 });
  m.Sleeping.set(body, false);
}

export interface Piece {
  id: string;
  body: Body;
  kind: "task" | "offer" | "word" | "cassette";
  /**
   * ★★★**提案だけが持つ「ジャンルの形」**（2026-09-13・第96巡にユーザー指定
   * 「ホームに落とす図形も、このマスクの形にします」）。BRIEF の札と**同じ写真が
   * 同じ形**で出る。★★山に落ちる5種のうち**ジャンルを持てるのは提案だけ**
   * （タスク・未読の数・カセット・文字の板は `ItemDomain` を持たない。持たせると
   * 「形がジャンルを言う」約束が壊れて、同じ形が2つの意味を持つ）。
   */
  shape?: CardShape;
  /** 角丸の四角の外接箱（タスク）。円は `r`。 */
  w?: number; h?: number; r?: number;
  face: string;
  ink: string;
  title?: string;
  face_?: number;      // 書体の番号（タグが決める）
  /**
   * ★★★**日付が無い＝輪郭線だけ**（2026-09-12・第93巡）。中は地と同じ色で塗り、
   * 縁と字はメインカラー ―― **帯のピルとまったく同じ見え方**。
   */
  outlined?: boolean;
  photo?: string;
  /** ★写真が無い提案の顔（「展」「場」）。 */
  /** ★写真が来なかった提案に組む**欧文のラベル**（「PLACE」「EXHIBITION」）。 */
  label?: string;
  /** 文字の板（日付・曜日）だけが持つ。★寸法も描き方も `lib/wordPlate.ts`。 */
  plate?: WordPlate;
  /** ★★**押すと行き先がある図形**（未読の数＝ブリーフ／ジャーナル＝レコード）。 */
  nav?: TabId;
  /**
   * ★★★**おすすめの提案だけが持つ**（2026-09-17・第119巡）。
   * `card` ＝ その `BriefCard.id`（**押すと Explore のそのカードへ飛ぶ**）／
   * `ed` ＝ 元の号のキー（**帯へ運ぶと KEEP する**ので `lib/keepCard.ts` が要る）。
   * ★★**まだ `Item` が無い**ので、`id` は `offer-<card.id>`（帯の id の作り方と同じ）。
   */
  card?: string;
  ed?: string;
  /**
   * ★★★**この巡で新しく湧いたか**（2026-09-15・第111巡）。
   * ★★★**`clearOverlap` を掛けてよいのはこれが真のものだけ** ―― あれは
   *   「器のすぐ上から湧いた体どうしを離す」ための道具で、**AABB で見て真上へ
   *   持ち上げる**。落ち着いた山は**傾いた図形どうしの AABB が必ず重なっている**
   *   ので、据え置きの体に掛けると**「AABB が1つも重ならない縦の塔」へ積み直され**、
   *   そこから落ち直す ―― ユーザー報告「**離すとリセットが入って落とし直しが
   *   発生する**」の正体。★着地の1枚（`landing`）にも掛けない。
   */
  fresh?: boolean;
}

/**
 * ★★**壁は器の内側**（`lib/pileBox.ts`）。器の縁ぴったりに置くと、出どころ
 * （内寸の内側）と壁がずれて**壁際で押し合う**。
 * ★★★**左右は対称**（`PILE_INSET`）―― タブバーは**右下の丸まで含めて**
 * `[SPACE.lg, w − SPACE.lg]` なので、揃えるべきセーフエリアはこれ1つ。
 * ★★床は**タブバーの上から `GROUND_LIFT` 浮かせる**（`floorYOf`）。器は
 * `.bleed-x-b` で**画面の底まで**伸びているので、この式がそのまま正しい。
 */
export function makeWalls(m: M, bw: number, bh: number): Body[] {
  const floorY = floorYOf(bh);
  return [
    m.Bodies.rectangle(bw / 2, floorY + WALL_T / 2, bw + WALL_T * 2, WALL_T, { isStatic: true, friction: 0.6 }),
    // ★★**高さに下限を掛ける** ―― `bh` が 0 だと面積 0 の壁になり、重心が NaN に
    //   なって**当たらない壁**が出来る（第101巡に踏んだ「図形が出なくなる」の一因）。
    // ★★★**下限は `WALL_MIN_H`（2026-09-14・第103巡）** ―― `bh` に比例させて
    //   いたので、**横画面では器が低いぶん壁も短く**（250 × 3 ＝ 750）、
    //   縦画面で積まれていた図形が**壁の下端より下に居て横から抜けた**。
    //   壁は「器の高さ」ではなく「**図形が居得る範囲**」を覆うもの。
    m.Bodies.rectangle(INSET - WALL_T / 2, bh / 2, WALL_T, Math.max(bh, WALL_MIN_H) * 3, { isStatic: true, friction: 0.4 }),
    m.Bodies.rectangle(bw - INSET + WALL_T / 2, bh / 2, WALL_T, Math.max(bh, WALL_MIN_H) * 3, { isStatic: true, friction: 0.4 }),
  ];
}

/**
 * ★★★**器が変わったら、山を新しい器へ「合わせ直す」**（2026-09-14・第103巡）。
 *
 * ★★★**ユーザー報告「図形が地面の下に落ちる」「横画面にして戻すと図形が消える」の
 *   根治。** 器が縮むと床（`floorYOf`）は上がるが、**床の板は `WALL_T`(200px) と厚い**
 *   ので、床が上がった瞬間に山の図形は**板の中**に入る ―― matter.js は
 *   **いちばん浅い軸へ押し出す**ので、上面より下面が近ければ**下へ**抜ける。
 *   横画面では床が 444px も上がるため、図形は**板より下に取り残されて永遠に落ちる**
 *   （器に天井も底も無い）。戻しても山は空にならないので入れ直しの番人も撃たない。
 * → **床が動いたぶんだけ山ごと動かす。** 図形と床の相対の位置が変わらないので、
 *   **積み上がった形はそのまま**で、板の中に入ることも無い。
 *   ★★**床が下がるときは動かさない**（そのぶん落ちればよい。そのほうが自然）。
 * ★左右は**壁の内側へ押し戻す**（横画面の広い器で右に居た図形が、縦へ戻したとき
 *   壁の外側に取り残されるのを防ぐ）。
 */
export function refitPile(m: M, bodies: Body[], bw: number, dFloor: number): void {
  for (const b of bodies) {
    const halfW = (b.bounds.max.x - b.bounds.min.x) / 2;
    const lo = INSET + halfW;
    const hi = Math.max(lo, bw - INSET - halfW);
    const x = Math.min(hi, Math.max(lo, b.position.x));
    const y = b.position.y + Math.min(0, dFloor);
    if (x !== b.position.x || y !== b.position.y) {
      m.Body.setPosition(b, { x, y });
      m.Sleeping.set(b, false);
    }
  }
}

/**
 * ★★★**器の外へ出てしまった体か**（2026-09-14・第103巡）。真なら**上から落とし直す**。
 * ★`components/tabs/GravityTab.tsx` の `recycle`（下へ出た図形を畳む）と同じ考え方 ――
 *   **ホームの山にだけ、これが無かった。**
 *
 * ★★★**「沈んだだけ」はここに入れない**（2026-09-14・第104巡）。第103巡は床の
 *   80px 下で上から落とし直していたので、沈む原因が残っているかぎり
 *   **沈む → 上から降る → また沈む**を繰り返し、ユーザーには
 *   「**図形が何度も上から降ってくる**」と見えた。**沈んだだけなら `sink` で
 *   静かに戻す**（下）。ここが真になるのは**本当にもう戻れないとき**だけ。
 */
export function isLost(b: Body, bw: number, floorY: number): boolean {
  const { x, y } = b.position;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
  return y > floorY + LOST_BELOW || x < -LOST_SIDE || x > bw + LOST_SIDE;
}

/**
 * ★★★**床より下へ沈んだ体を、その場で床の上へ静かに戻す**（2026-09-14・第104巡）。
 *
 * ★★床の板は `WALL_T`(200px) と厚いので、**中心線より下まで沈むと下から
 *   吐き出される**（matter.js は**いちばん浅い軸**へ押し出す）。沈む原因
 *   （120Hz の2倍速・重すぎる板）は別に潰したが、**最後の砦としてここで止める**
 *   ―― 物理の都合で 1px でも下へ抜けたら、あとは落ちるだけで二度と戻らない。
 * ★★**上から落とし直さない**（目に見える＝「雨」になる）。**その場で持ち上げて、
 *   下向きの速さだけ捨てる** ―― 横へ滑る勢いは残すので、山の崩れ方は変わらない。
 * @returns 戻したか。
 */
export function sink(m: M, b: Body, floorY: number): boolean {
  // ★★★**体まるごとが床より下に居るときだけ**（2026-09-14・第105巡）。
  //   第104巡は「下の縁が床より 8px 下」で撃っていたが、**それは押し合いの
  //   ふつうのめり込みでも起きる** ―― 番人が持ち上げる → ソルバが押し戻す、の
  //   **無限の綱引き**になり、その1つが**永久に眠らない**。すると山全体の眠りが
  //   解禁されず、**canvas も毎フレーム塗り続ける**（＝着地でフレームが落ちて戻らない）。
  //   実測 … 7件の山で、小さい図形1つに **毎秒8〜9回・永久に**発火していた。
  //   ★**少しでも床に掛かっていれば放っておく。** 休んでいる体は必ず掛かっている。
  if (b.bounds.min.y <= floorY) return false;
  const half = (b.bounds.max.y - b.bounds.min.y) / 2;
  m.Body.setPosition(b, { x: b.position.x, y: floorY - half });
  m.Body.setVelocity(b, { x: b.velocity.x, y: Math.min(0, b.velocity.y) });
  m.Sleeping.set(b, false);
  return true;
}

export interface PileContent {
  tasks: Task[];
  offers: Item[];
  /**
   * ★★★**その日の「好みそうな」提案**（2026-09-17・第119巡にユーザー指定
   * 「**Explore で溜まっている（もしくは新着の）もののうち最もおすすめなのを
   * 3件ほど抽出し、ホームに落とす**」）。選び方は `lib/offerPick.ts`。
   * ★**まだ KEEP していないカード**なので `Item` ではない。
   */
  picks: { ed: string; card: BriefCard }[];
  today: Date;
  /** ★★★**焦点のタスクの id**（`focusOf`。時刻が一番近い「これから」の1件。無ければ null）。 */
  focus?: string | null;
  /** ★その日まだ声を録っていないか（真なら録音のダイヤルの円を落とす）。 */
  journal: boolean;
}

/**
 * ★★★**山の中身を1式作る**（世界には入れない ―― 入れるのは `Pile.tsx` の
 * ループが**時間をずらして1つずつ**やる。まとめて入れると全部が同時に落ち始め、
 * 順番を作るために出どころを空の彼方まで持ち上げる羽目になる）。
 */
export interface PileBuild {
  pieces: Piece[];
  /**
   * ★★★**一括の倍率**（solid 座標 → px）。**引き下ろしの行き先の大きさ**を知るのに要る
   *  （2026-09-14・第102巡）。帯のピルを引くと、そのタスクが山で持つ寸法
   *  **`specOf(t, today).w × unit`** へ向かって形が変わる。
   *  ★★★**ここでしか計算していない値なので、返して渡す**（2か所で計算すると、
   *  引いている最中の大きさと落ちたあとの大きさが食い違う）。
   */
  unit: number;
  /**
   * ★★**新しく落とすものが在ったか**（2026-09-14・第103巡）。**偽なら山は静かなまま**
   *  なので、`Pile.tsx` は眠りを解かない（全部据え置きのときに山を起こさない）。
   */
  dropped: boolean;
}

/**
 * @param prev    前の山（id → `Piece`）。**同じ id は落とし直さず居場所を引き継ぐ**。
 *   ★★★**寸法まで同じなら、体そのものを使い回す**（2026-09-15・第111巡）――
 *   `unit` が据え置きなら同じ id は**1点の違いも無い体**になるので、作り直すのは
 *   純粋な無駄。**作り直すと `Composite` から出し入れすることになり、接触も眠りも
 *   切れて、山が落ち直す。**
 * @param landing 引き下ろして指を離した所（1つだけ）。ここから落とす。
 * @param hold    ★★★**前の倍率。渡されたら決め直さない**（2026-09-15・第110巡）。
 *   `unit` は**全体の面積の予算 ÷ 件数**なので、**1枚増えれば全員が別の大きさで
 *   作り直される**。位置は `prev` から丸写しなので、**大きくなった図形は隣へ
 *   めり込み、`clearOverlap` が真上へ持ち上げて山ごと浮き**、小さくなった図形は
 *   宙に浮く ―― ユーザー報告「**離した瞬間に画面が一気に変わる**」の正体。
 *   ★**着地した1枚も、幽霊は古い倍率・体は新しい倍率**なので大きさが飛んでいた。
 *   ★★決め直すのは**世界を作るとき**（＝タブを開いたとき）と**器が 15% 以上
 *   変わったとき**（`seedGen`）だけ。＝ユーザー確定「次に開いた時などに調整する」。
 */
export function buildPieces(
  m: M, c: PileContent, w: number, h: number,
  prev?: Map<string, Piece>, landing?: Landing | null, hold?: number,
  bandH = 0,
): PileBuild {
  const { tasks, offers, picks, today, journal, focus } = c;
  const kOf = (t: { id: string }) => (t.id === focus ? FOCUS_K : 1);

  // ★★★**その日まだ声を録っていなければ、JOURNAL の図形も落とす**（2026-09-09）。
  // ★★★**形は JOURNAL のタブのアイコン（カセット）そのもの**（2026-09-13・第94巡に
  //   ユーザー指定「現在の journal のタブのアイコンを図形にして落として。四角い
  //   部分がブルーで他が黒」）。第93巡の「録音の円」からさらに一歩 ――
  //   **行き先の顔をそのまま持ってくる**ので、何が起きるか説明が要らない。
  //   ★寸法は `lib/cassette.ts`（タブの SVG と同じ数を読む）。
  // ★★★**大きさは「日付と曜日の板」に揃える**（2026-09-19・第123巡にユーザー指定
  //   「**Journal の図形の大きさは日付と曜日ぐらいにして**」）。
  //   ★★★**だから `unit` の倍数ではなく、板と同じ「px の固定の箱」**として扱う
  //     ―― 板も `wordFs` から px で決まるので、**同じ物差しに乗せるには、
  //     倍率の側ではなく px の側へ移すしかない**（`unit` は予算から出るので、
  //     混み具合や件数で板との比が毎回ずれる）。
  //   ★★**第116巡の `CASSETTE_ROWS`(2.2) は削除した。復活させない**
  //     （`lib/taskSize.ts` の注釈も同時に直した）。
  //   ★★高さは**板の高さそのもの**（`CASSETTE_PER_PLATE` 1）、幅は `CASSETTE_ASPECT` から導く。
  //   ★★予算では**板と同じ扱い**（`fixed` へ足す。`areas` には入れない）。

  // ★★★**文字の板は先に決めて、器の予算から差し引く**（2026-09-10）。
  //   板は器の幅の `WORD_W` を取る**いちばん大きな塊**なので、予算に数えないと
  //   山の総面積が跳ね上がる（実測 80%）。詰まった山は解けずに押し合って震える。
  // ★★字の大きさは**長いほう（曜日）で決めた1つの値**を両方に使う（第67巡）。
  // ★★★**日付は `9.15`・曜日は `WED`**（2026-09-16・第114巡にユーザー指定）。
  //   ★★**どちらも黒いピルに白い文字**（面 ＝ `INK` ／ 字 ＝ `PAPER`）。
  //     形は帯のピルとまったく同じ（角丸 ＝ 高さの半分）なので、**同じものが
  //     同じ形で居続ける**。遊びの比は `lib/wordPlate.ts` の `PILL_PAD`。
  //   ★★★**TASK（GRAVITY）の板は変えていない** ―― あちらは「文字そのものが
  //     図形」のままで、ユーザーの指定はホームの山についてのもの。
  // ★★★**混み具合の倍率は、板を測る前に出す**（第118巡）―― 板の大きさにも
  //   同じ倍率を掛けるため（掛けないと、混むほど板だけが相対的に巨大になる）。
  //   ★数えるのは**落とす体の全部**（タスク・提案・カセット・未読・板2枚）。
  const crowd = crowdOf(
    tasks.length + offers.length + picks.length
    + (journal ? 1 : 0) + 2);
  const words = [`${today.getMonth() + 1}.${today.getDate()}`, WD_SHORT[today.getDay()]];
  // ★★大きな欧文は `DISPLAY`（Anton。第100巡）。canvas に焼くので可変の軸は届かない。
  // ★★★**大きさの物差しは長いほうの綴り（`WD_FULL`）のまま**（ユーザー
  //   「**サイズは今の文字くらいでよく**」）―― 3文字で測ると器いっぱいまで
  //   太ってしまい、**今までの倍近い字**になる。物差しだけ据え置く。
  // ★★★**上限にも倍率を掛ける**（第120巡。理由は `CROWD_N0` の注釈）――
  //   掛けないと、上限が効いている幅（実測 390）では板だけが縮まない。
  // ★★★**板は「長さの倍率 c」の関数**（第128巡）―― 混んだ日は下の安全網が
  //   **板ごと**縮める（段の高さは板から導くので、板を縮めれば全員が同じ比で縮む）。
  // ★★★**第130巡から板は1枚 ―― 「割れたピル」**（ユーザー承認「**日付と曜日は C 案**」）。
  //   左 ＝ 曜日（墨の面・紙の字）／右 ＝ 日付（紙の面・墨の字）。**1つの物体**なので、
  //   2枚がばらばらに転がって離れることがもう無い。★寸法は2枚を測ってから繋ぐ
  //   （`joinSplitPlate`）ので、字の大きさ・遊び・段の高さの式（`PLATE_ROWS`）は変わらない。
  const platesAt = (c: number) => {
    const room = pileWOf(w) * WORD_W * c;
    const fs = wordFontSize([WD_FULL[today.getDay()]], room, DISPLAY, PILE_WORD_MAX * c);
    const [date, day] = words;
    return [joinSplitPlate(
      measureWordPlate(day, fs, room, PAPER, DISPLAY, undefined, undefined, INK),
      measureWordPlate(date, fs, room, INK, DISPLAY, undefined, undefined, INK),
    )];
  };
  let plates = platesAt(crowd);
  /** カセットの箱（px）。★**高さは板と同じ**（上の注釈）。0 ＝ 出さない。 */
  // ★★★**高さは板と同じ**（第123巡のユーザー指定「日付と曜日ぐらい」。第131巡の 2 倍は第132巡に撤回）。
  const cassetteOf = (pl: typeof plates) => {
    const jh = journal ? pl[0].bh * CASSETTE_PER_PLATE : 0;
    return { jH: jh, jW: jh * CASSETTE_ASPECT };
  };

  /**
   * ★★★**ホームの図形は、重要度でも切迫度でも大きさが変わらない**
   * （2026-09-16・第115巡にユーザー指定「**ホームでは今日に割り当てられている
   * タスクが集まっているから、重要度や優先度によって大きさが変わる機能はやめます**」）。
   *
   * ★★★**第116巡に「段の高さを固定する」へ作り直した**（ユーザー指定
   *   「**1段ごとのピルの大きさは同じで、2段の時はそれが2個、3段の時はそれが3個。
   *   文字の大きさを揃えてください**」）―― 第115巡は**面積**を1つにしていたので、
   *   段が増えるほど段が痩せ、**1段と3段で字が2倍違った**（`rowSpecOf` の注釈に実測）。
   * ★★**`unit` の意味が変わった** … solid 座標の倍率 → **段の高さ（px）**。
   *   `rowSpecOf` の `w`/`h` が段の高さを 1 とした箱なので、掛け算はそのままでよい。
   * ★★★**`specOf` は 1 行も変えない** ―― TASK（GRAVITY）は重要度で大きさが
   *   変わるまま。**変えるのはホームの読み方だけ。**
   * ★★おまけに**焼くのが速くなる** ―― 字の大きさが1つなので、焼いた字
   *   （`lib/textFit.ts` の `glyphCache`）が**全部の図形で使い回せる**。
   */
  const flat = (t: { title?: string }) => ({ title: t.title ?? "" });
  // ★★★**予算は「図形が居られる高さ」で取る**（第118巡に**帯のぶんも引いた**）。
  //
  // ★★★**帯は山の器へ `position: absolute; top: 0` で重ねてある**
  //   （`components/tabs/HomeTab.tsx`）。第117巡まではその帯状の面積まで
  //   「図形が居られる場所」として数えていたので、件数が増えると**山が帯の裏へ
  //   伸び**、そこは `pointerEvents` を帯に取られているため**指で触れなくなった**
  //   ―― ユーザー報告「**特にピルのあたりまで高さがくると操作できなくなる**」。
  // ★`bandH` は `Pile` が `bandBottom()`（DOM の実測）から渡す。0 なら今までどおり。
  const usableH = Math.max(120, floorYOf(h) - bandH);
  const areas = [
    ...tasks.map((t) => rowSpecOf(flat(t)).area * kOf(t) ** 2),
    ...offers.map(() => OFFER_AREA),
    ...picks.map(() => OFFER_AREA),
  ];
  const total = areas.reduce((a, b) => a + b, 0) || 1;
  // ★★**px で大きさが決まっているものは「固定」側**（板・未読の数・カセット）。
  // ★★**`crowd` は「長さ」の倍率なので、面積の予算には2乗で効かせる**（第118巡）。
  const budgetOf = (pl: typeof plates): number => {
    const { jH: jh, jW: jw } = cassetteOf(pl);
    const fixed = pl.reduce((a, x) => a + x.w * x.h, 0) + jw * jh;
    const room2 = w * usableH * FILL * crowd * crowd;
    return Math.max(room2 * 0.25, room2 - fixed);
  };
  // ★★★**段の高さは「日付と曜日の板の半分」**（2026-09-19・第124巡にユーザー指定
  //   「**2段の時の大きさを日付と曜日の図形の高さと合わせ**」）。
  //   ★★**タスクの箱は `h = 段の数`** なので、2段 ＝ `2 × unit` ＝ 板の高さ。
  //     角丸は高さの半分（`lib/solid.ts`）なので、**2段のタスクの角の半径と
  //     板の角の半径が px で厳密に一致する**（＝カーブが揃う）。
  //
  // ★★★**第128巡に「予算で段だけ小さくする」をやめた**（ユーザー指定「**何度も
  //   言っているのですが、タスクの図形の縦の高さと横幅が小さすぎます。高さは一段の
  //   時は、日付と曜日の図形の高さの半分にしてください**」）。
  //   ★★★**真因は `min(板の半分, 予算)`** ―― 件数が多い日は面積の予算が先に効き、
  //     **板はそのままで段だけが縮んでいた**（実機の写真で 段 ≒ 25px 対 板の半分
  //     ≒ 35px ＝ **7割**）。第124巡に「板の半分」を決めたのに、**安全網のほうが
  //     毎日効いていた**。
  //   ★★★**予算は捨てない。板ごと縮める** ―― 予算を外すだけだと 9件で山が帯の裏へ
  //     110px 伸びた（実測）。予算が足りない日だけ**板の倍率 c を下げて測り直す**
  //     ので、**どの件数でも「1段 ＝ 板の半分」**のまま、全部が一律に縮む
  //     （第118巡の「一律で少しだけ小さく」と同じ作法）。
  //   ★板の字は倍率に比例する（幅と上限の両方に掛けてある）ので、2〜3回で収まる。
  let plateUnit = plates[0].bh / PLATE_ROWS;
  if (hold && hold > 0) {
    // ★★据え置き（第110巡）… 段の高さは変えない。**板もその段に合わせて測り直す**
    //   （件数が変わって `crowd` が動いても、「1段 ＝ 板の半分」を崩さない）。
    if (Math.abs(hold - plateUnit) > 0.5) plates = platesAt(crowd * (hold / plateUnit));
    plateUnit = hold;
  } else {
    let c = crowd;
    for (let i = 0; i < 3; i++) {
      const fit = Math.min(UNIT, Math.sqrt(budgetOf(plates) / total));
      if (fit >= plateUnit * 0.99) break;
      c *= fit / plateUnit;
      plates = platesAt(c);
      plateUnit = plates[0].bh / PLATE_ROWS;
    }
  }
  const { jH, jW } = cassetteOf(plates);
  // ★★いちばん大きな図形が器からはみ出さないところまで、**全体を**縮める。
  //   ★★★**この頭打ちは予算とは別に出す**（第110巡）―― 据え置きのときも効かせる。
  //   ★★カセットは `unit` の倍数ではないので、**頭打ちの相手はタスクだけ**。
  let cap = UNIT;
  for (const t of tasks) {
    const sp = rowSpecOf(flat(t)); const k = kOf(t);
    cap = Math.min(cap, (w * FIT_W) / Math.max(1, sp.w * k), (usableH * FIT_H) / Math.max(1, sp.h * k));
  }
  // ★★★**安全網は `cap`（いちばん大きな図形が器に入るか）の1つだけ**。
  const unit = Math.max(10, Math.min(plateUnit, cap));

  const pieces: Piece[] = [];
  let nth = 0;
  /**
   * ★★★**寸法まで同じ体は使い回す**（2026-09-15・第111巡）。
   *
   * ★★★**作り直すと「落とし直し」が起きる** ―― 作り直せば `Composite` から
   *   出して入れ直すことになり、**接触も眠りも切れる**うえ、入れ直しの
   *   `clearOverlap` が**落ち着いた山を縦の塔へ積み直す**（`Piece.fresh` の注釈）。
   * ★★`unit` が据え置き（`hold`）なら、同じ id は**1点の違いも無い体**になる。
   *   だから**形の署名が一致したら、前の体をそのまま返す**。
   * ★★★**着地する1枚は使い回さない** ―― 「新しく置く」ことがその意味なので、
   *   万一 id が被っても新しく作る。
   * ★署名は `body.plugin.sig` に焼く（別の表を持ち回らない）。
   */
  const same = (seed: string, sig: string): Body | null => {
    if (landing && landing.id === seed) return null;
    const b = prev?.get(seed)?.body;
    if (!b) return null;
    return (b.plugin as { sig?: string } | undefined)?.sig === sig ? b : null;
  };
  const stamp = (body: Body, sig: string): void => {
    body.plugin = { ...(body.plugin ?? {}), sig };
  };
  /**
   * ★★★**すでに山に居たものは落とし直さない**（2026-09-14・第103巡にユーザー確定
   *   「いつでも落ち直さない」）。
   *
   * ★★★**体は作り直すしかない** ―― 一括の倍率 `unit` は**全体の面積の予算**から
   *   出るので、1つ増えれば全部の大きさが変わる。落ち直して見えていたのは
   *   「新しい体を**上から落とし直していた**」からで、そこだけをやめればよい。
   *   **前の体の位置・角度・速度・回りをそのまま写す**と、山は1px も崩れない。
   * ★**引き下ろして着地させたものは、上からではなく「指を離した所」から**落とす
   *   （`landing`。`lib/pullDrag.ts` の `pullBus` 経由で `HomeTab` が置く）。
   *
   * @returns 新しく落としたか（偽＝前の居場所を引き継いだ）。
   */
  const toss = (body: Body, seed: string, bh: number): boolean => {
    const keep = prev?.get(seed)?.body;
    if (keep) {
      m.Body.setPosition(body, { x: keep.position.x, y: keep.position.y });
      m.Body.setAngle(body, keep.angle);
      m.Body.setVelocity(body, keep.velocity);
      m.Body.setAngularVelocity(body, keep.angularVelocity);
      // ★据え置きは**すぐ世界へ入れる**（順番待ちの列に並ばせない）。
      body.plugin = { ...(body.plugin ?? {}), releaseAt: 0 };
      return false;
    }
    if (landing && landing.id === seed) {
      m.Body.setPosition(body, { x: landing.x, y: landing.y });
      m.Body.setAngle(body, landing.angle);
      m.Body.setVelocity(body, { x: landing.vx, y: landing.vy });
      m.Body.setAngularVelocity(body, 0);
      body.plugin = { ...(body.plugin ?? {}), releaseAt: 0 };
      return true;
    }
    // ★★落とし方は `GravityTab` と同じ ―― **どこへ・どの高さから落ちるか**で
    //   ばらつきを作り、傾きと回りは控えめに添える。★式は `respawn` の1か所。
    respawn(m, body, w, seed, bh);
    // ★★順番は最後に決める（下の `order`）。ここでは「並ぶ」印だけ付ける。
    body.plugin = { ...(body.plugin ?? {}), releaseAt: QUEUED };
    nth++;
    return true;
  };

  // ★★★**その日の日付と曜日も一緒に落とす**（2026-09-07 ユーザー指定。
  //   `GravityTab` と同じ ―― 枠の無い、文字だけの黒い板）。
  // ★★★**作り方は `lib/wordPlate.ts`。GRAVITY とまったく同じ部品**（第89巡）。
  //   ★DOM で組んでいたのをやめた ―― 板だけが物理と別の座標系に居たせいで、
  //   板まわりだけ挙動が違っていた（ユーザー「特に日付と曜日がおかしい」）。
  // ★★★**落とす順は最後に決める**（第131巡。板は**いちばん最後**。`buildPieces` の末尾）。
  plates.forEach((plate, i) => {
    const sig = `word|${plate.bw.toFixed(2)}|${plate.bh.toFixed(2)}|${plate.word}`;
    let fresh = false;
    const kept = same(`word${i}`, sig);
    const body = kept ?? makeWordBody(m, plate, 0, 0);
    // ★★★**板の重さも「実際の箱」から出す＝全部の体を同じ密度にする**
    //   （2026-09-15・第109巡）。
    //
    // ★★★**第104巡の「板にも `setMass` を呼ぶ」は、直しすぎだった。**
    //   呼んだ式が `massOf(specOf({ title: word })) * MASS_K` で、`specOf` に
    //   **重要度も期日も渡していない**ので、**板の実際の大きさと無関係な定数**
    //   （`3.6 × 0.55 × 1.6 = 3.168`）になっていた。板の箱は 283×64px、
    //   `unit ≈ 30.4` なので本来 **19.6 solid²** 相当＝約 31。**10倍 軽い。**
    // ★★★**そして `GravityTab` は板に `setMass` を呼んでいない**（`makeWordBody` は
    //   `setInertia` だけ）。**「GravityTab は呼んでいた」という第104巡の記録は誤り。**
    //   あちらは matter の既定の密度（0.001 × px²）のままなので**密度の幅は 1.6倍**、
    //   ホームだけ「修正」で **9.5倍**に広げてしまっていた。
    // ★★★**密度がばらつくと2つのソルバが毎ステップ食い違う** ―― matter の
    //   **位置ソルバは質量を見ない**（`positionDampen / totalContacts` で等分）が、
    //   **速度ソルバは見る**（`inverseMass` で配分）。10倍 軽い大きな板が重い図形の
    //   下に入ると、押し戻しと跳ね返しが噛み合わずに**震えの燃料**になる。
    // → **箱の面積 ÷ unit² を solid² とみなして、タスクとまったく同じ式へ通す。**
    // ★★**使い回した体は何も触らない**（質量も居場所も前のまま＝いま正しい）。
    if (!kept) {
      m.Body.setMass(body, (plate.bw * plate.bh) / (unit * unit) * MASS_K);
      // ★★**据え置きなら傾きも引き継ぐ**（第103巡）。落としたときだけ整える ――
      //   ここで上書きすると、前の山で寝ていた板が**起き上がって**見える。
      if (toss(body, `word${i}`, plate.bh)) {
        // ★初速の回りは与えない（傾くのは着地の弾みぶんだけ）。
        m.Body.setAngle(body, (frac(`word${i}a`) - 0.5) * 0.16);
        m.Body.setAngularVelocity(body, 0);
        fresh = true;
      }
      stamp(body, sig);
    }
    pieces.push({
      id: `word${i}`, body, kind: "word", w: plate.bw, h: plate.bh,
      face: INK, ink: PAPER, title: plate.word, plate, fresh,
    });
  });

  tasks.forEach((t) => {
    const spec = rowSpecOf(flat(t));
    // ★★★**焦点の1件だけ `FOCUS_K` 倍**（第132巡）。形・段の数・字の組み方は同じで、
    //   箱が一様に大きくなるだけ（字も同じ比で大きくなる）。
    const k = kOf(t);
    const pw = Math.max(28, spec.w * unit * k);
    const ph = Math.max(24, spec.h * unit * k);
    // ★★**絵と同じ「ピルの積み」で当たる**（第101巡。GRAVITY／DRIFT と同じ形）。
    const rows = clampRows(rowsOf(t.title));
    const sig = `task|${pw.toFixed(2)}|${ph.toFixed(2)}|${rows}`;
    const kept = same(t.id, sig);
    const body = kept ?? bodyFromOutline(m, stackOutline(rows, pw / ph), pw, ph, BODY);
    let fresh = false;
    if (!kept) {
      // ★★★**質量だけ与えて、回り慣性は触らない**（2026-09-09）。`setMass` は
      //   慣性も一緒に比例させるので、形と重さから正しい回りにくさが出る。
      m.Body.setMass(body, spec.area * k * k * MASS_K);
      fresh = toss(body, t.id, ph);
      stamp(body, sig);
    }
    // ★★**日付が無ければ輪郭**（塗り／輪郭の1軸。字も縁と同じ色になる）。
    const outlined = !(t.dueDate ?? "").trim();
    pieces.push({
      id: t.id, body, kind: "task", w: pw, h: ph,
      // ★★★**字は塗りでも輪郭でも黒**（第117巡にユーザー指定「グレーの塗りに黒の字」）。
      face: TASK_FACE, ink: bodyInkOn(TASK_FACE),
      title: t.title, face_: SHAPE_FACE, outlined, fresh,
    });
  });

  if (jH > 0) {
    // ★★**タブのアイコンと同じカセット**。文字は載せない（ユーザー指定）。
    // ★★**体は四角**（円ではない）。当たり判定も `Pile.tsx` の四角の枝へ入る。
    // ★★★**大きさは px で決まっている**（＝板と同じ高さ）。
    const pw = Math.max(32, jW);
    const ph = Math.max(24, jH);
    const sig = `cassette|${pw.toFixed(2)}|${ph.toFixed(2)}`;
    const kept = same("journal", sig);
    // ★体は矩形（本体が矩形なので絵と合う）。★★**絵より `PHYS_GAP` 外側**（第101巡）。
    const body = kept
      ?? m.Bodies.rectangle(0, 0, pw + PHYS_GAP * 2, ph + PHYS_GAP * 2, BODY);
    let fresh = false;
    if (!kept) {
      // ★★**密度は全部の体で同じ**（箱の面積 ÷ `unit²`）。板・未読と同じ式。
      m.Body.setMass(body, (pw * ph) / (unit * unit) * MASS_K);
      fresh = toss(body, "journal", ph);
      stamp(body, sig);
    }
    pieces.push({
      id: "journal", body, kind: "cassette", w: pw, h: ph, fresh,
      // ★**本体の面が青／リールと帯が黒**（タブのアイコンの塗り分け）。
      face: JOURNAL_FACE, ink: INK,
      nav: "journal-record",
    });
  }

  /**
   * ★★★**提案の円を1つ作る**（2026-09-17・第119巡にくくり出した）。
   * ★★**ストックの `Item`（`plannedFor` が今日）と、まだ読んでいないおすすめの
   *   `BriefCard`（`picks`）が同じ絵**なので、**形と色と大きさの式を2度書かない**。
   * @param seed 体の使い回しの鍵（`Item.id` か `offer-<card.id>`）
   */
  const offerPiece = (
    seed: string, kind: ItemKind, title: string, photo: string | undefined,
    nav?: TabId, card?: string, ed?: string,
  ) => {
    const area = OFFER_AREA;
    const r = offerRadiusOf(unit);
    const shape = cardShapeOf(KIND_DOMAIN[kind]);
    const sig = `offer|${r.toFixed(2)}|${shape}`;
    const kept = same(seed, sig);
    const body = kept ?? bodyFromOutline(
      m, cardShapePoints(shape).map(([x, y]) => ({ x: x - 0.5, y: y - 0.5 })),
      r * 2, r * 2, BODY, OFFER_VERTS);
    let fresh = false;
    if (!kept) {
      m.Body.setMass(body, area * MASS_K);
      // ★★★**提案も自由に回る**（2026-09-19・第123巡にユーザー指定
      //   「**提案の図形も自由に回転したり動くようにしてください**」）。
      //   ★★★**第121巡の `setInertia(Infinity)`（正立で固定）は撤回。復活させない。**
      //     あのとき「歪んで見える」の犯人を回転だと見立てたが、**本当の犯人は
      //     六角形の定義**だった（正方形いっぱいに広げていたので縦に 1.155 倍。
      //     第123巡に直した。第131巡にアーチへ替えた）。**回してよい。**
      //   ★★**回りの目盛りはタスクと同じ**（`respawn` の `SPAWN_TILT`/`SPAWN_SPIN`）
      //     ―― 山の中で提案だけが別の物理法則に従っていると、物体に見えない。
      fresh = toss(body, seed, r * 2);
      stamp(body, sig);
    }
    // ★★**焼き込まれた色を信じない**（帯の `cardFace` と同じ理由）。生成した夜の
    //   パレットが残っているので、**いま生きている表から引き直す**。
    const face = colorOfKind(kind);
    pieces.push({
      id: seed, body, kind: "offer", r, fresh,
      face, ink: bodyInkOn(face),
      photo, title,
      // ★★**形は券の鋏痕から導く**（`lib/cardShape.ts`。BRIEF の札と同じ1か所）。
      shape,
      // ★★★**写真が来なかったときの受け皿は「欧文のラベル」**（2026-09-19・
      //   第124巡にユーザー指定「**写真がないときのデザインがダサいので、せめて
      //   英語にしてしっかりとレイアウトして**」）。★第122巡までは和文1字の
      //   「字面」だった。★**語は券と同じ `category`**（`lib/deckStyle.ts`）。
      //   ★絵の側（`pilePaint`）が「写真が無い／来ない」ときだけ組む。
      label: categoryOfKind(kind),
      nav, card, ed,
    });
  };

  // ★★★**おすすめの提案**（第119巡）。**押すと Explore のそのカードへ飛ぶ**ので
  //   `nav` と `card` を持つ。★id は帯と同じ作り方（`offer-<card.id>`）。
  picks.forEach(({ ed, card }) => {
    offerPiece(`offer-${card.id}`, card.kind ?? "place", card.title,
      card.images?.[0], "brief", String(card.id), ed);
  });

  // ★★★**すでにストックしてあって「今日行く」と決めた提案**（`Item.plannedFor`）。
  //   ★絵も形も色も `offerPiece` が1か所で決める（おすすめと同じ見た目）。
  offers.forEach((it) => {
    offerPiece(it.id, it.kind, it.title, it.images?.[0]);
  });

  // ★★★**未読の数は山に落とさない**（2026-09-24・第132巡にユーザー承認）。数は「今日やること」
  //   ではないので、EXPLORE のタブの角の小さな数字へ移した（`components/AppShell.tsx`）。

  // ★★★**落とす順は「ばらばら、日付の板は最後」**（2026-09-23・第131巡にユーザー指定
  //   「**ランダムにするか、せめて曜日とかは一番最後に落とした方がいい**」）。
  //   ★★第130巡までは組んだ順（板 → タスク → カセット → 提案 → 未読）で、毎日
  //     **同じ種類がかたまって**降りてきた。★★板を最後にするので、板は山の
  //     **凸凹の上**へ着地して傾く（2026-09-09 に「いちばん先」にした理由）――
  //     ユーザー確定「**回転するのは構わない**」（第130巡）の上での選択。
  //   ★★**塗る順と拾う順（`pieces` の並び）は変えない**。変えるのは入る時刻だけ。
  const queued = pieces.filter((p) =>
    (p.body.plugin as { releaseAt?: number } | undefined)?.releaseAt === QUEUED);
  const rest = queued.filter((p) => p.kind !== "word");
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  [...rest, ...queued.filter((p) => p.kind === "word")].forEach((p, i) => {
    p.body.plugin = { ...(p.body.plugin ?? {}), releaseAt: i * DROP_EVERY_MS };
  });

  return { pieces, unit, dropped: nth > 0 || !!landing };
}

export type { Engine };

/**
 * ★★★**世界へ入れる直前に、すでに居る体との重なりを解く**（2026-09-15・第109巡）。
 *
 * ★★★**「落とす順を時間で作る」だけでは、1px も引き離せていなかった。**
 *   `respawn` は**器のすぐ上**（`DROP_ABOVE` ＋ 0〜`DROP_SCATTER`）から落とす設計で、
 *   順番は `DROP_EVERY_MS`(60ms) ずつ遅らせて world へ入れることで作っている。
 *   ところが **60ms のあいだに落ちる距離は 2.5px** しかなく、**散らばりの幅は 200px**
 *   ＝ **79倍**。つまり**時間差は順番を作るだけで、位置を分けていない**。
 *   ★実測（実際の id をハッシュへ通し、**投入の瞬間**で判定）…
 *     **16 組が最大 82px めり込んだ状態で world に入っていた。**
 *   82px めり込んだ体は位置ソルバに叩き出されて弾け、隣を押し、
 *   **「落ちてきてぶつかった時に、めり込んで震える」そのもの**になる。
 *   ★★`GravityTab` は `i × (110 + …)` の**幾何のはしご**で落とすので **0 組**。
 *     ★**はしごへ替えると 2500px 上から降ってきて絵が変わる**ので替えない。
 *     **出どころはそのまま、入れる瞬間だけ持ち上げる。**
 * ★★**上へ逃がす**（横へ逃がすと壁と `spawnXOf` の散らばりを壊す）。
 * ★体は多くても14個・入れる瞬間だけなので、費用は無い。
 */
export function clearOverlap(m: M, body: Body, live: Body[]): void {
  // ★★重なりが解けるまで繰り返す（持ち上げた先に別の体が居ることがある）。
  //   ★回数は体の数で頭打ち（必ず終わる）。
  for (let pass = 0; pass <= live.length; pass++) {
    let lift = 0;
    for (const o of live) {
      if (o === body || o.isStatic) continue;
      const a = body.bounds; const b = o.bounds;
      // ★横が掛かっていなければ、縦がどれだけ重なっていても当たらない。
      if (a.max.x <= b.min.x || a.min.x >= b.max.x) continue;
      if (a.max.y <= b.min.y || a.min.y >= b.max.y) continue;
      // ★**自分の下端を相手の上端より上へ**。`PHYS_GAP` ぶんの隙間を足す。
      lift = Math.max(lift, a.max.y - b.min.y + PHYS_GAP * 2);
    }
    if (lift <= 0) return;
    m.Body.setPosition(body, { x: body.position.x, y: body.position.y - lift });
  }
}

/**
 * ★★★**引き下ろしている図形の「代理の体」**（2026-09-15・第110巡にユーザー指定
 * 「**図形を引き出して掴んでいるのですが、それに当たり判定がないです**」／確定
 * 「**山の図形を押しのける ＋ 壁と床にも当たる**」）。
 *
 * ★★★**形も重さも `buildPieces` と同じ1本から出す** ―― 2か所に書くと、
 *   `unit` を据え置いて「幽霊と本番の大きさを揃えた」意味が消える。
 * ★★★**大きさは変形の行き先（`w1`/`h1`）で1度だけ作る** ―― `g.w`/`g.h` は
 *   変形のばね（`K_SWING`。37% 行き過ぎる）で動き続けるので、追いかけると
 *   **体が脈打って山を押し広げては戻す**（第104巡の頂点爆発と同じ重さも付く）。
 * ★★★**回り慣性は無限**（`setMass` が慣性を書き換えるので**そのあとに**呼ぶ）――
 *   角度の持ち主は**振れのばね1つ**。摘ままれているものが接触で回らないのは
 *   物理としても正しい。**元の慣性は返り値で返す**（離したら戻す）。
 */
export function ghostBodyOf(
  m: M, g: { kind: "task" | "offer"; rows: number; shape?: CardShape; area: number },
  w: number, h: number,
): { body: Body; inertia: number } {
  const pts = g.kind === "offer" && g.shape
    ? cardShapePoints(g.shape).map(([x, y]) => ({ x: x - 0.5, y: y - 0.5 }))
    : stackOutline(clampRows(g.rows), w / h);
  const body = bodyFromOutline(m, pts, w, h, BODY);
  m.Body.setMass(body, g.area * MASS_K);
  const inertia = body.inertia;
  m.Body.setInertia(body, Infinity);
  return { body, inertia };
}
