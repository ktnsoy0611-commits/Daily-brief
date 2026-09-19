"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { groundOf } from "@/components/AppBackdrop";
import { BAND_BEZEL, BAND_H, SANS } from "@/lib/constants";
import { img } from "@/lib/helpers";
import { BAND_ROW, type BandItem, type BandRowId, isOutlined } from "@/lib/homeBand";
import { bodyInkOn } from "@/lib/palette";
import { NewsPill } from "./NewsCard";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
import {
  BAND_CATCH, PILL_EDGE, PILL_HINT, PILL_PRESS, RAIL_HYST, RAIL_NEAR,
  pullBus, pullFrame,
  type GhostSeed, type LandingAt, type PillLook, type PullHost,
} from "@/lib/pullDrag";
import { haptic } from "@/lib/helpers";
import {
  BAND_PAD, GAP_HYST, bandAim, bandBus, bandGapAt, bandGapClear, bandGapDone, bandHole,
  bandReverse,
  bandSettling,
  bandHoleDone, bandHoleRelease, bandResume, bandStop, stepBandMotion,
} from "./bandMotion";

// ★★★**帯**（2026-09-07）。AI が差し出したものが横に流れる列。
//
// ★★**ゆっくり流れ続けて循環する**（2026-09-07 ユーザー確定）。等速（`linear`）
//   ―― 環境の動き（止まらずに回り続けるもの）は曲線4本の対象外で、等速でないと
//   繰り返しの継ぎ目で速さが飛ぶ。
// ★★★**速さは「画面の幅ぶん流れる時間」で持つ**（`--t-amb-band-lap`）。一周の
//   時間で持つと、並ぶ件数が変わるたびに速さが変わる（件数は日によって違う）。
//   幅で持てば何件並んでも速さは同じ。★数字はこのファイルに書かない。
// ★★段ごとに向きが互い違い（上＝左へ／下＝右へ）。
//   **止まって見える瞬間が無い**のは、隣の段が逆へ動いているから。
// ★★左右とも画面の外へ切れる（＝まだ続きがある、を形で言う）。
//   ★★★**`.bleed-x` は器（`HomeTab` の山の器）が持つ**（2026-09-11）。
//   段が自分でも持つと**二重に外へ出て**、ピルが画面の外へ 16px 余計にずれる。
// ★★**指が触れている間は止まる**。離すと続きから動く（位置は戻さない）。
// ★★**ピルに印（アイコン・矢印）を付けない。**

type Row = BandRowId;

/**
 * 段の厚み。★写真の丸が入る上の段だけ厚い（丸は高さいっぱい）。
 * ★★**ニュースの段（2）は輪郭だけのピル**なので、いちばん薄い（第123巡）。
 */
const HEIGHT: Record<Row, number> = {
  0: BAND_H.photo, 1: BAND_H.plain, 2: BAND_H.news,
};

/**
 * ★★★**指で帯を左右に送り始めるまでの遊び**（px。2026-09-19・第124巡にユーザー指定
 *   「**ピルは自分で左右にスクロールできるようにもしてください**」）。
 * ★★**引き下ろし（縦）と食い合わない値**にする ―― ピルは `touchAction: "none"` で
 *   縦も横も JS が受けるので、遊びが小さいと**下へ引く指の横揺れで帯が送れる**。
 * ★★目盛りの外（指の遊び。`lib/pullDrag.ts` の `PULL_ARM` と同じ性質の数）。
 */
const PAN_SLOP = 10;

/**
 * ピル1つ。★色は**その中身が既存のアプリで持っている色**（`lib/homeBand.ts`）。
 * 面に載る字は `bodyInkOn()` が面から導く（表に持たない）。
 *
 * ★★★**写真がある提案だけが丸を持つ**（2026-09-07・ユーザー指定「画像がない時は
 *   なくて良い」）。写真の無い提案に字面を大きく置くのは**やめた** ―― 帯の中では
 *   字面が主役になってしまい、題より大きな塊が列に並ぶ。
 * ★★**丸はピルの中に収める**（縁とのあいだに `SPACE.sm` の縁取り）。高さいっぱいに
 *   すると、丸とピルの輪郭が接して「はめ込んだ」ではなく「はみ出した」に見える。
 */
function Pill({ item, row, pull, taken, onTake, onArm, onFlow, onHold }: {
  item: BandItem; row: Row; pull?: PullHost;
  /** ★★**同じ中身は2周ぶん DOM に居る**ので、隠すのは id で決める。 */
  taken: boolean;
  onTake: (id: string | null) => void;
  /**
   * ★★★**弾けた（＝完全に引き抜いた）かどうか**（2026-09-15・第110巡）。
   * 段はこれを合図に**帯の穴を閉じて流れを再開する**（`bandHole`）。
   * ★★**`taken`（1px 引いた時点）では早すぎる** ―― 輪ゴムの最中は
   *   「両端が帯に残っている」ので、席はまだ空いていない。
   */
  onArm: (id: string | null) => void;
  /** ★段の流れを止める／戻す（`animRef` は段が持っているので預ける）。 */
  onFlow: (on: boolean) => void;
  /** ★★段を「開いたまま」留める掛け金（ニュースの札の寿命に合わせる）。 */
  onHold: (on: boolean) => void;
}) {
  const face = item.face;
  // ★★★**線と文字だけのピル**（2026-09-09 ユーザー指定）。すでに登録してある
  //   タスクは「もう自分のもの」なので、**塗らずに輪郭だけ**にする ―― 塗りの
  //   ピル（AI がまだ差し出している最中のもの）と1段に混ざっても、
  //   **面の量**で受け取り済みかどうかが読める。
  const outline = isOutlined(item.kind);
  // ★★★**線だけのピルも中は塗る**（2026-09-11 ユーザー指定）。**地と同じ色**で
  //   塗るので見た目は「線だけ」のままだが、**後ろを落ちてくる図形が透けない**
  //   （帯は山の上に重ねてあるので、透明だと図形がピルの中を通って見える）。
  // ★★★**字は塗りでも輪郭でも黒**（2026-09-17・第117巡にユーザー指定
  //   「グレーの塗りに黒の字」）。第116巡までは輪郭のピルだけ**線と同じ色**の字に
  //   していたが、無彩色になると地の上で **3.2** しか出ず 13px の本文が読めない。
  //   ★`bodyInkOn(地)` は墨を返す（**15.5**）。
  const ink = outline ? bodyInkOn(groundOf("home")) : bodyInkOn(face);
  const h = HEIGHT[row];
  const head = row === 0;                              // 提案の段
  /**
   * ★★★**届かなかった写真は「無かったこと」にする**（2026-09-18・第122巡に
   * ユーザー指摘「**提案のピルの、写真がないものの見た目が崩れている。角に文字が
   * 左に寄ったりしていて崩れている**」）。
   *
   * ★★★**真因は `onError` が `display: none` しか書いていなかったこと** ――
   *   丸が消えても `photo` は真のままなので、**左のパディングは丸のための
   *   `BAND_BEZEL`(4) のまま**だった。だから題が**ピルの丸い角に食い込んで**
   *   左へ寄って見えた（写真のあるピルは丸が余白を持つので成立していた）。
   * ★★**落ちた URL を憶える**（`display: none` ではなく `photo` そのものを落とす）
   *   ―― こうすると `padding` も `gap` も `<img>` も**1つの条件から同時に**外れる。
   * ★★**憶えるのは URL** ―― 同じ `Pill` が別の中身で使い回されても、
   *   **URL が変われば自動で元に戻る**（真偽値だと落ちたまま固まる）。
   */
  const [badPhoto, setBadPhoto] = useState<string | null>(null);
  const photo = head && item.photo && item.photo !== badPhoto ? item.photo : undefined;
  // ★丸の直径 ＝ ピルの高さ − 縁取り2つぶん。
  const dia = h - BAND_BEZEL * 2;
  // ── 引き下ろし（2026-09-14・第102巡） ───────────────────────
  // ★★★**触る → 輪ゴム → ばちん → 図形へ**。算数は `lib/pullDrag.ts`、
  //   絵は山の canvas（`components/home/pillGhost.ts` と `pilePaint.ts`）。
  //   ★★★**ここが持つのは「指の記録」と「写し取る見た目」だけ。**
  //     曲げも伸びもこのファイルでは一切やらない（第104巡の `scaleY` は消した
  //     ―― DOM は `.band-row` の `overflow: hidden` の外へ垂れられない）。
  const [pressed, setPressed] = useState(false);
  const grab = useRef<{
    id: number; sx: number; sy: number; bx: number; by: number;
    w0: number; h0: number; seed: GhostSeed; look: PillLook;
    armed: boolean; rail: boolean; live: boolean;
    /** ★★いま帯の挿し口を狙っているか（第114巡）。 */
    aim: boolean;
  } | null>(null);

  /**
   * ★★★**幽霊の後始末はここ1つ。そして「必ず走る」ようにしてある**
   * （2026-09-15・第106巡。ユーザー報告「**戻したら元のピルが残り続けて増殖する**」）。
   *
   * ★★★**`pullBus.ghost` を消し忘れると2つのことが同時に起きる** ――
   *   ① 山の canvas が**帯の位置にピルを描き続ける**（＝残り続ける「元のピル」）。
   *   ② `Pile` の塗る条件が `... || g || ...` なので、**約300万画素を 120Hz で
   *      塗り続ける**（＝フレームレートが落ちたまま戻らない）。
   * ★★**第105巡までは `onPointerUp`/`onPointerCancel` の1本道しか無かった。**
   *   だが `onTake` は**捕捉している当の要素へ `visibility: hidden` を当てる**ので、
   *   WebKit で捕捉が外れると `pointerup` は別の要素へ行く。掴んだまま札が
   *   消えれば（背後の同期で `rows` が変われば）unmount して誰も呼ばない。
   *   → **3重にする**（`lostpointercapture` ／ unmount ／ `window` の `pointerup`）。
   * ★★**二度走っても無害**（`grab.current` を先に奪う）。
   */
  const end = useCallback((commit: boolean) => {
    const g = grab.current;
    grab.current = null;
    setPressed(false);
    onTake(null);
    // ★★★**指が指していた挿し口は、消す前に控える**（第114巡）。
    //   `bandAim(null)` は `bandBus.slot` も一緒に落とすので、**先に読む**。
    const into = g?.aim && bandBus.aim ? bandBus.slot?.after ?? "" : null;
    bandAim(null);
    if (!pull) return;
    if (g?.live) pull.lift(false);
    // ★★★**離した所と勢いを控えてから幽霊を消す**（2026-09-14・第103巡）。
    //   山はこの1つだけ**上からではなくここから**落とすので、手を離した瞬間と
    //   落ち始めのあいだに継ぎ目が無い。★速さは `stepGhost` が書いた値
    //   （**山のループが固定の刻みで測ったもの**）。
    // ★★**消してよいのは自分の指が出した幽霊だけ**（`owner`）。
    const gh = pullBus.ghost && g && pullBus.ghost.owner === g.id ? pullBus.ghost : null;
    // ★★★**渡すのは「絵の中心」（`hx`/`hy`）。支点（`dx`/`dy`）ではない**
    //   （2026-09-17・第118巡）。`pileWorld` は `landing.x/y` を**箱の中心**として
    //   体を置くので、支点を渡すと**ぶら下がっていた腕の長さだけ絵が跳ぶ**。
    //   ★理由と実測は `lib/pullDrag.ts` の `LandingAt` の注釈。
    const at: LandingAt | null = gh
      ? { x: gh.hx, y: gh.hy, vx: gh.vx, vy: gh.vy, angle: gh.angle } : null;
    if (gh) pullBus.ghost = null;
    pull.rail(false);
    // ★★★**段の流れを必ず戻す**（2026-09-15・第109巡）。段を止めているのは
    //   `.band-row` の `onPointerDown`（`pause()`）で、戻すのは同じ段の
    //   `onPointerUp`/`onPointerCancel` しか無かった ―― **捕捉が外れると
    //   そこへ来ないので、段が止まったままになり得た**。後始末はここ1つ。
    onFlow(true);
    // ★★★**帯の上で離した ＝ その場所へ入れ直す**（2026-09-16・第114巡）。
    //   **日付は付けない**（山へは落とさない）。並びだけを憶える。
    //   ★席は元に戻す（`onArm(null)`）―― 抜けた席が閉じたままにならないように。
    if (into !== null && commit) { onArm(null); pull.pin(item.id, into); return; }
    const drop = !!(g && commit && g.armed);
    // ★★★**穴を閉じたままにするのは「本当に落とすとき」だけ**（第110巡）。
    //   落とすなら `items` から消えるので、受け渡しは段の照合が引き取る。
    //   落とさない（引き戻した・取り消した）なら、**ここで穴を開け直す**。
    if (!drop) onArm(null);
    if (drop) pull.drop(item, g!.rail, at);
  }, [item, pull, onTake, onArm, onFlow]);

  // ★★★**最後の砦**（2026-09-15・第106巡）。`window` で指が離れたのを拾う ――
  //   捕捉が外れても、要素が消えても、**指が離れれば必ずここへ来る**。
  //   ★掴んだときだけ張り、1度で外れる（`once`）。
  const endRef = useRef(end);
  endRef.current = end;
  const guard = useCallback((id: number) => {
    const off = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      window.removeEventListener("pointerup", off);
      window.removeEventListener("pointercancel", off);
      if (grab.current) endRef.current(false);
    };
    window.addEventListener("pointerup", off);
    window.addEventListener("pointercancel", off);
  }, []);

  // ★★**掴んだまま消えたら片づける**（背後の同期で札が入れ替わると unmount する）。
  useEffect(() => () => { if (grab.current) endRef.current(false); }, []);

  const onDown = (e: React.PointerEvent) => {
    setPressed(true);
    if (!pull) return;
    const seed = pull.seed(item);
    const box = pull.box.current;
    if (!seed || !box) return;
    const br = box.getBoundingClientRect();
    // ★★**押下の縮みが当たる前に測る**（`setPressed` の描き直しはこのあと）。
    //   ＝ここで取れるのは**版面の寸法**で、縮みは写し取る側が同じ数から掛ける。
    const pr = (e.currentTarget as HTMLElement).getBoundingClientRect();
    grab.current = {
      id: e.pointerId, sx: e.clientX - br.left, sy: e.clientY - br.top,
      bx: pr.x + pr.width / 2 - br.left, by: pr.y + pr.height / 2 - br.top,
      w0: pr.width, h0: pr.height, seed,
      // ★★★**見た目を写し取る**（2026-09-14・第105巡）。**色と余白と書体は
      //   このピルが描くのに使ったものそのまま** ―― 数を二重に持たない。
      look: {
        w: pr.width, h: pr.height, press: PILL_PRESS,
        face, ink, outlined: outline, ground: groundOf("home"),
        text: item.text, textSize: head ? TYPE.lead : TYPE.body,
        genre: head ? item.genre : undefined,
        // ★★**線のぶんだけ中身が内へ寄る**（`border` は余白の外側に積まれる）。
        dia, gap: SPACE.md,
        padL: (outline ? PILL_EDGE : 0) + (photo ? BAND_BEZEL : SPACE.xl),
        padR: (outline ? PILL_EDGE : 0) + SPACE.xl,
      },
      armed: false, rail: false, live: false, aim: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    guard(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || !pull) return;
    const box = pull.box.current;
    if (!box) return;
    const br = box.getBoundingClientRect();
    const frame = () => pullFrame(
      e.clientX - br.left, e.clientY - br.top, g.sy, g.bx, g.by, g.armed,
    );
    let f = frame();
    // ★★★**1px でも下へ引いたら、そこから先は canvas の写し取り**
    //   （2026-09-14・第105巡にユーザー確定「**触った瞬間に canvas へ写し取る**」）。
    //   ★**ただのタップでは切り替えない**（ちらつかせない）。
    //   ★★山の canvas を帯の上へ上げる ―― 上げないと、上の段から引いたピルが
    //     **下の段のピルの後ろへ潜る**。★1ジェスチャに1回だけ。
    const live = f.pulled >= 1;
    if (live !== g.live) {
      g.live = live;
      pull.lift(live);
      // ★★★**写し取る矩形は「写し取る瞬間」に測り直す**（2026-09-14・第105巡）。
      //   掴んだ瞬間は帯がまだ流れていて（止まるのは段の `onPointerDown` ―― こちらの
      //   あとに走る）、**測った位置と実際に描かれている位置が 1.2px ずれていた**
      //   （実測。字の左端が 3 デバイス画素ずれる）。止まったあとに測れば 0 になる。
      //   ★★**`offsetWidth` は版面の寸法**（押下の縮みが乗らない）。中心は
      //     `getBoundingClientRect` ―― 中心を原点に縮むので**縮みでは動かない**。
      if (live) {
        const el = e.currentTarget as HTMLElement;
        const pr = el.getBoundingClientRect();
        // ★★**いま沈んでいる倍率で割り戻す**（`getComputedStyle` の行列から読む）。
        //   `offsetWidth` は整数へ丸まるので使えない ―― 0.02px 足りないだけで
        //   題が1文字ぶん切り詰められた。★中心は縮みでは動かない（原点が中心）。
        const t = getComputedStyle(el).transform;
        const k = t && t !== "none" ? new DOMMatrixReadOnly(t).a || 1 : 1;
        g.bx = pr.x + pr.width / 2 - br.left;
        g.by = pr.y + pr.height / 2 - br.top;
        g.w0 = pr.width / k; g.h0 = pr.height / k;
        // ★★★**写真は帯の `<img>` そのものを渡す**（URL を渡して取り直さない）。
        //   ★★落ちた（`onError` で `display: none`）・まだ届いていないときは出さない
        //     ―― DOM も出していないので、出すと**実際には無い丸が1つ増えて見える**。
        const im = el.querySelector("img");
        g.look = {
          ...g.look, w: g.w0, h: g.h0, press: k,
          photo: im && im.style.display !== "none" && im.complete && im.naturalWidth > 0
            ? im : undefined,
        };
        f = frame();               // ★測り直した矩形で組み直す（1フレームずらさない）
      }
    }
    if (live !== taken) onTake(live ? item.id : null);
    // ★★★**ばちん**（弾けた瞬間）… バネへ勢いを1発入れて手ごたえを返す。
    if (f.armed !== g.armed) {
      if (f.armed) haptic(12);
      // ★★段へ知らせる ―― 帯の穴を閉じるのは**ここが唯一の合図**（第110巡）。
      onArm(f.armed ? item.id : null);
    }
    g.armed = f.armed;
    // ★★★**段が生えるのは「時間」の仕事**（2026-09-15・第106巡）。ここは
    //   **行き先（`tTo`）を言うだけ** ―― 進めるのも弾ませるのも `stepGhost`。
    // ★★**指のイベントが書くのは「目標」だけ** ―― 振れ・伸び・支点・速さは
    //   山のループが `stepGhost` で作る（`lib/pullDrag.ts`）。前のフレームの値を
    //   引き継いで、掴んでいる間の連なりを切らない。
    // ★★★**引き抜いたピルも、帯の「別の場所」へ入れ直せる**（2026-09-16・第114巡に
    //   ユーザー指定「**引き出してそのまま別のところに入れようとしても元の場所に
    //   瞬間移動したり戻ってしまいます**」）。
    //   ★★★**第113巡まで、この道は存在しなかった** ―― 引き抜いたピルの指は
    //     この要素が捕捉しているので `Pile.onMove` は1度も走らず、**帯への狙いを
    //     出すコードがどこにも無かった**。だから戻せるのは元の席だけだった。
    //   ★★**狙いの出し方は山と同じ1本**（`bandAim` ＋ `PullHost.bandBottom`/
    //     `rowCenter`）。「どこから来たか」で手つきが変わってはいけない。
    //   ★境目の遊びは `RAIL_HYST`（1本の線だと指がその上で毎フレーム反転する）。
    const row = BAND_ROW[item.kind];
    const bandY = pull.bandBottom();
    const fy = e.clientY - br.top;
    const back = f.armed && bandY > 0
      && fy < bandY + BAND_CATCH + (g.aim ? RAIL_HYST : 0);
    // ★`rowCenter` は「その段が描かれているか」の確認にだけ使う（座標は渡さない）。
    const cy = back ? pull.rowCenter(row) : null;
    g.aim = back && cy !== null;
    bandAim(g.aim ? { row, x: e.clientX, w: g.w0 + SPACE.sm } : null);
    const was = pullBus.ghost;
    pullBus.ghost = live ? {
      kind: g.seed.kind, id: item.id, owner: g.id, title: g.seed.title,
      cx: f.cx, cy: f.cy,
      // ★★変形の両端と行き先。**弾けたら 1 へ向かって時間で進む。**
      w0: g.w0, h0: g.h0, w1: g.seed.w, h1: g.seed.h,
      // ★★★**狙っているあいだは「少しだけピルへ寄る」**（`PILL_HINT`。第118巡）。
      //   0 まで畳むのは**離したとき**。★理由は `lib/pullDrag.ts` の `PILL_HINT`。
      tTo: g.aim ? PILL_HINT : (f.armed ? 1 : 0),
      // ★★**帯を狙っているあいだは `home` の枝で動かす**（`stepGhost`）――
      //   支点が指に付く。山から戻す道と同じ1本。
      home: g.aim || undefined,
      // ★★★**`aim` は合図だけ。座標は渡さない**（第118巡にユーザー撤回）。
      aim: g.aim,
      w: was?.w ?? g.w0, h: was?.h ?? g.h0, t: was?.t ?? 0,
      // ★★**支点は前のフレームから引き継ぐ** ―― 弾けた瞬間、バネはここから
      //   走り出す（＝**ピルが居た所から指へ**）。引き継がないと左上から飛んでくる。
      hx: was?.hx ?? f.cx, hy: was?.hy ?? f.cy,
      bend: f.bend, gx: g.sx - g.bx, look: g.look,
      rows: g.seed.rows, outlined: g.seed.outlined, area: g.seed.area,
      face: g.seed.face, ink: g.seed.ink, faceIdx: g.seed.faceIdx,
      shape: g.seed.shape, photo: g.seed.photo, label: g.seed.label,
      ax: was?.ax ?? 0, ay: was?.ay ?? 0, dx: was?.dx ?? f.cx, dy: was?.dy ?? f.cy,
      angle: was?.angle ?? 0,
      sx: was?.sx ?? 1, sy: was?.sy ?? 1,
      stretchDir: was?.stretchDir ?? Math.PI / 2, vx: was?.vx ?? 0, vy: was?.vy ?? 0,
      waist: was?.waist ?? 0,
      // ★★掛け金も引き継ぐ（弾ける前は必ずピル。★`stepGhost` だけが書き換える）。
      pill: was?.pill ?? true,
    } : null;
    const near = f.armed && e.clientX > window.innerWidth - RAIL_NEAR;
    if (near !== g.rail) { g.rail = near; pull.rail(near); }
  };

  // ★★★**文章は「地の上の字」だけ**（2026-09-18・第121巡にユーザー指定
  //   「**ピル以外に文章みたいなのも一緒に流して**」）。
  //   ★★**面も縁も持たない** ―― `design.md` の「縁を付けてよいのは押せるものだけ」。
  //     ピルの列にそのまま字が流れるので、**雑誌の中見出しのように読める**。
  //   ★★**指のイベントは素通しする**（引き下ろす相手ではない）。
  //   ★★**幅は決めない** ―― 文は 20〜30 字あるので、`maxWidth` で切ると
  //     途中で `…` になる。帯は左右へ切れてよい場所（`docs/home-spec.md` §4-c）。
  //   ★中身は `lib/bandNotes.ts` の1か所。
  if (item.kind === "note") {
    return (
      <div style={{
        display: "flex", alignItems: "center", flexShrink: 0, height: h,
        pointerEvents: "none", padding: `0 ${SPACE.xl}px`,
      }}>
        <span style={{
          fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.text,
          letterSpacing: TRACK.normal, lineHeight: LEAD.snug,
          // ★地の上に直接いるので `bodyInkOn(地)`（墨。比 15.5）。
          color: bodyInkOn(groundOf("home")), whiteSpace: "nowrap",
        }}>{item.text}</span>
      </div>
    );
  }

  // ★★★**ニュースは「輪郭のピル」**（2026-09-19・第123巡にユーザー指定
  //   「**ニュースもピルにしてください。そして引き出した時にそのピルが画面上で
  //   広がって角丸の四角になって展開し、ニュースの詳細が見れるようにして**」）。
  //   ★★**絵も手つきも `components/home/NewsCard.tsx` の `NewsPill` が持つ** ――
  //     引き下ろし（日付の割り当て）とは**別の手つき**なので、`Pill` の
  //     `pull` の仕掛けには載せない。**ここは行き先を示すだけ。**
  if (item.kind === "news") {
    return (
      <NewsPill
        h={h}
        onHold={onHold}
        item={{
          id: item.id, title: item.text, source: item.genre ?? "",
          link: item.link ?? "", at: item.at ?? "",
        }}
      />
    );
  }

  return (
    <div
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => end(true)}
      onPointerCancel={() => end(false)}
      onLostPointerCapture={() => { if (grab.current) end(false); }}
      style={{
      display: "flex", alignItems: "center", gap: SPACE.md, flexShrink: 0,
      height: h, borderRadius: RADIUS.pill,
      // ★★引き下ろしのため、**縦も横もこちらで受ける**（段の `pan-y` を上書き）。
      touchAction: pull ? "none" : undefined,
      // ★★★**触ると少し沈む**（2026-09-14 ユーザー指定「少し柔らかいような感触」）。
      //   `design.md` … **押下だけが非対称**（即座に沈み、ゆっくり戻る）。
      // ★★縮みの数は `lib/pullDrag.ts`（写し取る canvas が**同じ数**を読む）。
      // ★★★**ずれはここが持たない**（2026-09-15・第110巡）。この `transform` には
      //   **押下の縮みと 420ms の transition** が居るので、毎フレーム書き換える
      //   ずれを混ぜると**バネと CSS の補間が二重に効く**。
      //   → ずれは外の包み `.band-slot` が持つ（`bandMotion.ts` の rAF が書く）。
      transform: pressed ? `scale(${PILL_PRESS})` : "scale(1)",
      transition: pressed
        ? "transform var(--t-press) var(--ease-press)"
        : "transform var(--t-item) var(--ease-settle)",
      // ★外れたら元のピルは消す（幽霊が山の canvas に居る）。
      // ★★★**`visibility` ではなく `opacity` で消す**（2026-09-15・第106巡）。
      //   `visibility: hidden` は**当たり判定から外れる**ので、WebKit では
      //   **捕捉している当の要素を消した瞬間に捕捉が外れ得る** ―― そうなると
      //   `pointerup` が別の要素へ行き、後始末が走らずに**幽霊が残る**。
      //   `opacity: 0` は当たり判定も捕捉もそのままで、見た目だけ消える。
      opacity: taken ? 0 : 1,
      // ★地と同じ色で塗る（透過させない）。★色の持ち主は `groundOf` の1か所。
      background: outline ? groundOf("home") : face,
      // ★輪郭は `Button` の secondary と同じ引き方（押せるものの縁）。
      border: outline ? `${PILL_EDGE}px solid ${face}` : "none",
      // ★丸があるときは、左の余白を縁取りぶんだけにする（丸が余白を持つ）。
      padding: photo ? `0 ${SPACE.xl}px 0 ${BAND_BEZEL}px` : `0 ${SPACE.xl}px`,
      maxWidth: "84vw",
    }}>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img(photo, 200, 200)} alt=""
          // ★★**丸だけを消さない。`photo` ごと落とす**（上の `badPhoto` の注釈）。
          onError={() => setBadPhoto(photo)}
          style={{
            width: dia, height: dia, borderRadius: RADIUS.circle,
            objectFit: "cover", display: "block", flexShrink: 0,
          }} />
      )}
      {/* ★★★**提案のピルは2行**（2026-09-09 ユーザー指定・参照画像）… 題の下に
          **ジャンル**を小さく置く。「何であるか」が読めないと、題だけでは
          展覧会なのか店なのか分からない。★2行目は**控えめな色**（`--muted-on`
          ではなく面から導いた字を薄める ―― 面の上なので地の変数は使えない）。 */}
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: SPACE.hair }}>
        <span style={{
          // ★★提案は `lead`(16)、候補・期日未割当は `body`(13)。
          //   ★実機で「ピルが全体的に大きすぎる」ため1段ずつ下げた（2026-09-08）。
          //   ★どちらも 700 なので、面の比が 4.5 に届かない色でも
          //   「大きな文字 3.0」で通る（`lead` は 16px＝太字の下限ちょうど）。
          fontFamily: SANS, fontSize: head ? TYPE.lead : TYPE.body, fontWeight: WEIGHT.bold,
          letterSpacing: TRACK.normal, lineHeight: LEAD.snug, color: ink,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{item.text}</span>
        {head && item.genre && (
          <span style={{
            fontFamily: SANS, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
            letterSpacing: TRACK.wide, lineHeight: LEAD.flat, color: ink, opacity: 0.62,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{item.genre}</span>
        )}
      </div>
    </div>
  );
}

/**
 * 1段ぶん。★**中身を2回並べる** ―― 1周ぶん送ると2周目の先頭が1周目の先頭と
 * 同じ位置に来るので、**継ぎ目が原理的に存在しない**。
 * ★★★**2つの周は「まったく同じ幅」でなければならない。** 隙間を器の `gap` で
 * 作ると周と周のあいだにも隙間が1つ入り、1周ぶん送っても**隙間の半分だけずれる**。
 * だから隙間は周の内側だけが持ち、**末尾にも同じ幅の隙間**を置く。
 */
function BandRow({ row, items, pull, taken, onTake, armed, onArm }: {
  row: Row; items: BandItem[]; pull?: PullHost;
  taken: string | null; onTake: (id: string | null) => void;
  armed: string | null; onArm: (id: string | null) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);
  const shiftRef = useRef<HTMLDivElement>(null);
  /**
   * ★組み直しをまたいで持ち越す、**送った距離（px）**。
   * ★★★**割合（0〜1）で持たない**（2026-09-15・第110巡）―― ピルが1枚増えると
   *   1周の幅が変わるので、**同じ割合は違う px** になり、**帯が丸ごと飛ぶ**
   *   （実測 … 中央値 254px）。px で持てば、1周の幅が変わっても**画面上の位置は
   *   動かない**（動くのは、挿し込まれた所より後ろのピルだけ）。
   * ★送りは1周で循環するので、`% lap` で読み替えられる。
   */
  const phaseRef = useRef(0);
  /** ★いま走っているアニメを組んだときの1周の幅（px）。★`snapPhase` が読む。 */
  const lapRef = useRef(0);
  /**
   * ★★★**受け渡しでいったん `transform` が預かる、一様なずれ**（px。第113巡）。
   *
   * 挿し込まれた瞬間、`lead` と「隙間の半分」は**レイアウトのほうへ移る**ので
   * `transform` からは消える。ところが**送り（流れの時計）を直せるのは
   * `build()`＝passive effect** で、そこは**塗ったあと**に走る。
   * → **その1フレームだけ帯が飛ぶ**（実測 72px）。
   * だから**いったんここが預かり**、`build()` が送りへ畳んだ瞬間に手放す。
   *
   * ★★★**時計（`currentTime`）を直接ずらしてはいけない** ―― 1周ぶんで
   *   折り返すので、**古い1周の幅で丸められた送りを、新しい1周の幅で
   *   読み直す**ことになる（実測 … 770.5px が 70.4px になって 156px 飛んだ）。
   *   **送りは px のまま、丸めずに持ち越す。**
   */
  const holdRef = useRef(0);

  /** ★★いまの送りを控える。**`cancel()` する前に必ず呼ぶ**（下の `build()` の注意書き）。 */
  const snapPhase = useCallback(() => {
    const a = animRef.current;
    const d = a?.effect ? (a.effect.getTiming().duration as number) || 0 : 0;
    // ★★★**1周の幅は「いま走っているアニメを組んだときの値」を使う**（第110巡）
    //   ―― React はクリーンアップを**DOM を新しくしたあと**に走らせるので、
    //   ここで測ると**もう新しい幅**になっている（＝控える意味が消える）。
    const lap = lapRef.current;
    if (!a || d <= 0 || lap <= 0) return;
    const ct = ((((a.currentTime as number) ?? 0) / d) % 1 + 1) % 1;
    // ★★★**下の段は `direction: "reverse"`**（2026-09-15・第110巡）。
    //   時計の値をそのまま持ち越すと、**送りが鏡になる** ―― 実測で
    //   1周の幅が 416 → 617 になったとき、送りが -302.6 → -502.8px へ飛んだ。
    //   **持ち越すのは「どれだけ送ったか」（進み）であって、時計ではない。**
    phaseRef.current = (bandReverse(row) ? 1 - ct : ct) * lap;
  }, [row]);

  /**
   * ★★★**ずれを DOM へ書く**（2026-09-15・第110巡）。
   * ★★★**受け渡し（`bandHoleCommit`/`bandGapCommit`）の直後にも呼ぶこと** ――
   *   受け渡しが直すのは**module の数**だけで、DOM に載るのは次の rAF。
   *   **レイアウトはもう変わっているので、そのあいだの1フレームだけ帯が飛ぶ**
   *   （実測 … ピル1枚ぶん 186.5px）。`useLayoutEffect` の中で塗れば 0 になる。
   */
  const paint = useCallback(() => {
    const m = bandBus.rows[row];
    const track = trackRef.current;
    const shift = shiftRef.current;
    if (!track) {
      if (shift) shift.style.transform = `translateX(${m.off.p.toFixed(2)}px)`;
      return;
    }
    // ★★★**隙間はレイアウトそのもの**（2026-09-16・第113巡）。ピルとピルのあいだの
    //   器（`.band-pad`）の幅を書き換える ―― **2周とも同じ列を描くので、
    //   隙間も穴も自動的に2周ぶん・同じ index に生まれる**＝継ぎ目の辻褄が
    //   原理的に合う。理由は `bandMotion.ts` の頭（`transform` では書けない）。
    // ★★**畳んでいる席は、そのピルと直前の器を同じ比で縮める**（合計 ＝
    //   レイアウトが失う幅とぴったり同じ）。
    const shrink = m.holeId ? 1 - m.hole.p : 1;
    let extra = 0; let lead = 0; let k = 0;
    for (const el of track.querySelectorAll<HTMLElement>("[data-pad]")) {
      const i = Number(el.dataset.pad);
      // ★★★**指のそばの1枚より前で開いたぶんを控える**（`bandMotion.ts` の `lead`）。
      if (k === m.pick) lead = extra;
      let w = BAND_PAD;
      if (i === m.open.at) { w += m.open.p; extra += m.open.p; }
      if (i === m.shut.at) { w += m.shut.p; extra += m.shut.p; }
      if (el.dataset.padFor === m.holeId) w *= shrink;
      el.style.width = `${Math.max(0, w).toFixed(2)}px`;
      k += 1;
    }
    m.lead = lead;
    for (const el of track.querySelectorAll<HTMLElement>("[data-pill-id]")) {
      el.style.width = el.dataset.pillId === m.holeId
        ? `${Math.max(0, m.holeW * shrink).toFixed(2)}px` : "";
    }
    // ★★★**帯ぜんたいを `lead` だけ左へ戻す** ―― 戻さないと、指が指していた
    //   境目が**1周目に開いた隙間に押されて画面の外へ逃げる**。
    // ★★★**さらに隙間の半分だけ寄せる** ―― 器は**左の縁が動かないまま右へ
    //   育つ**ので、寄せないと**指の右どなりに開く**。半分ずらせば
    //   **指を中心に左右へ開く**＝入る所が指の下に見える。
    // ★★どちらも一様なずれなので、挿し込まれた瞬間に**送り（位相）へ畳める**
    //   （`carryRef`）。だから受け渡しで 1px も飛ばない。
    if (shift) {
      const px = m.off.p - lead - m.open.p / 2 - holdRef.current;
      shift.style.transform = `translateX(${px.toFixed(2)}px)`;
    }
  }, [row]);

  const build = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    // ★★★**位相を引き継ぐ**（2026-09-15・第109巡）。
    //   ★★★**`cancel()` は `translateX(0)` へ戻す** ―― つまり組み直すたびに
    //     **帯が先頭へ飛んでいた**（実測 … ピルを1枚抜くと 8000ms → 283ms）。
    //   ★★★**控えるのは `build()` の中ではなく `snapPhase()`** ―― React は
    //     **効果のクリーンアップを新しい効果の本体より先に走らせる**ので、
    //     `build()` に入った時点では `animRef.current` はもう `null` にされている。
    //     **控える場所を間違えると、引き継いだつもりで 0 を書く。**
    //   ★**進んだ割合**で持ち越す（1周の幅も時間も組み直しで変わるので、
    //     生の `currentTime` ではなく 0〜1 の位相にする）。
    snapPhase();
    animRef.current?.cancel();
    animRef.current = null;
    if (typeof track.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    // ★1周ぶんの幅を測る。**送る量はこれ**（2周ぶん並べてあるので、1周ぶん
    //   送ると2周目の先頭が1周目の先頭と同じ位置に来て、継ぎ目が存在しない）。
    const lapEl = track.firstElementChild as HTMLElement | null;
    if (!lapEl) return;
    const lap = lapEl.getBoundingClientRect().width;
    const screen = track.parentElement?.getBoundingClientRect().width || window.innerWidth;
    if (!lap || !screen) return;

    // ★★速さは「画面の幅ぶん流れる時間」で持つ（`app/globals.css` の
    //   `--t-amb-band-lap`）。**一周の時間で持たない** ―― 並ぶ件数は日によって
    //   変わるので、一周で持つと日ごとに速さが変わってしまう。
    const v = getComputedStyle(document.documentElement).getPropertyValue("--t-amb-band-lap").trim();
    const n = parseFloat(v);
    const perScreen = Number.isFinite(n) ? (v.endsWith("ms") ? n : n * 1000) : 26000;
    const duration = (lap / screen) * perScreen;

    const anim = track.animate(
      [{ transform: "translateX(0)" }, { transform: `translateX(${-lap}px)` }],
      {
        duration, iterations: Infinity, easing: "linear",
        // ★中の段だけ**右へ**流す。2つ目のキーフレームを書かず、向きだけ逆にする。
        // ★★向きは `bandMotion.bandReverse` の1か所から（互い違い。第122巡に3段）。
        direction: bandReverse(row) ? "reverse" : "normal",
      },
    );
    // ★★組み直す前に**同じ px だけ送った所**から続ける（上の `phaseRef`）。
    // ★★★**預かっていたずれ（`holdRef`）はここで送りへ畳む**（上の注意書き）。
    //   ★組めたときだけ手放す ―― 組めなければ `transform` が持ち続けるのが正。
    phaseRef.current += holdRef.current;
    holdRef.current = 0;
    const gone = (((phaseRef.current % lap) + lap) % lap) / lap;
    anim.currentTime = (bandReverse(row) ? 1 - gone : gone) * duration;
    lapRef.current = lap;
    animRef.current = anim;
    // ★★**送りへ畳んだのと同じ瞬間に `transform` から外す**（別のフレームに
    //   分かれると、そのあいだ二重に効く／二重に抜ける）。
    paint();
  }, [row, snapPhase, paint]);

  // ★★★**組み直す引き金は「中身の署名」**（2026-09-15・第109巡）。
  //   ★★★`items` は `HomeTab` の `useMemo(() => bandRows(appState), [appState])` が
  //     返す配列で、**`appState` に何か書かれるたび新しい同一性**になる（中身が
  //     1つも変わっていなくても）。それを deps に置いていたので、**背後の同期や
  //     無関係なタブの操作のたびに帯が組み直されていた**。
  //   ★1周の幅に効くものだけ並べる（id・題・写真の有無）。
  const sig = items.map((it) => `${it.id}|${it.text}|${it.photo ? 1 : 0}`).join("\u0001");

  /**
   * ★★★**段の流れを止める／戻す**（2026-09-15・第109巡）。
   * ★★止めるときは**慣性を1発**入れる（`bandStop`）―― ユーザー指定
   *   「**少し行きすぎてから戻って止まる**」。
   * ★★★**後始末の口は1つ**（`Pill.end()` からも呼ぶ）。第108巡までは
   *   `.band-row` の `onPointerUp` しか戻す道が無く、**捕捉が外れると段が
   *   止まったまま**になり得た。
   */
  /**
   * ★★★**段を「開いたまま」留める掛け金**（2026-09-19・第124巡）。
   * ニュースの札が開いているあいだは段を止めておく ―― 流れたままだと
   * **札が戻る先（開いた瞬間のピルの矩形）がもう別の場所**なので、閉じるときに
   * 札が横へ飛ぶ。★数で持つのは、2周ぶんのピルが同時に掛けうるため。
   */
  const lockRef = useRef(0);
  const flow = useCallback((on: boolean, kick = true) => {
    const a = animRef.current;
    if (!a) return;
    if (on) { if (lockRef.current > 0) return; a.play(); return; }
    if (a.playState === "paused") return;    // ★二度入れない
    a.pause();
    // ★★`bandStop` は `bandBus.wakers` 経由で段のループを起こす（直に呼ばない）。
    if (kick) bandStop(row);
  }, [row]);
  /** ★掛け金の上げ下げ（`NewsPill` が札の寿命に合わせて呼ぶ）。 */
  const hold = useCallback((on: boolean) => {
    lockRef.current = Math.max(0, lockRef.current + (on ? 1 : -1));
    if (on) flow(false, false); else flow(true);
  }, [flow]);

  /**
   * ★★★**ずれのバネを回す rAF のループ**（2026-09-15・第109巡）。
   * ★★**動いているあいだだけ回す**（`stepBandMotion` が偽を返したら止める）。
   *   山のループ（`components/home/Pile.tsx`）とまったく同じ作法。
   * ★★★**絵は `transform` だけ**。ピルは**2周ぶん DOM に居る**ので、
   *   `data-pill-id` で引いて**両方に同じ値**を書く（周ごとにずれない）。
   */
  const rafRef = useRef(0);
  const runRef = useRef(false);

  /** ★段のループが読む「いまの中身」（`wake` の同一性を変えないため ref で持つ）。 */
  const itemsRef = useRef(items);
  itemsRef.current = items;
  /** ★★この段が「狙われているから」流れを止めているか（第112巡）。 */
  const heldRef = useRef(false);
  /** ★★いま引き抜かれているピルの id（挿し口の隣に選ばないため）。 */
  const armedRef = useRef<string | null>(armed);
  armedRef.current = armed;
  /** ★★この段でいま挿し口を開けているか（受け渡しの合図）。 */
  const aimedRef = useRef(false);
  const wake = useCallback(() => {
    if (runRef.current) return;
    runRef.current = true;
    const tick = () => {
      // ── ① 隙間を当てる ──────────────────────────────────────
      // ★★★**隙間は「指が指している所」に開く**（2026-09-16・第112巡にユーザー確定
      //   「**どんな時でも、任意のピルとピルの間に戻せるように。順番がいくら
      //   入れ替わっても問題ない**」）。**指のほうが正で、並びをあとから合わせる**
      //   （`HomeTab.unassign` が `reorderSomeday` で並べ替える）。
      // ★★★**境目は「器（`.band-pad`）の中心」で測る**（2026-09-16・第113巡）。
      //   ★★第112巡は**ピルの中心を探して左右どちらかを足していた**ので、
      //     ①「n 番目の後ろ」と「n+1 番目の前」が別の答えになり、
      //     ② 開いた隙間そのものは見ていなかった。
      //   ★★**開いた器の中心は指のすぐそば**なので、この測り方は**ひとりでに
      //     安定する**（開くほど中心が指へ寄る＝行ったり来たりしない）。
      // ★★**x → index はここでしかできない** ―― ピルの居場所は流れの
      //   `transform` が決めていて React 側は知らない。**結果は `bandBus.slot` へ返す**。
      const aim = bandBus.aim;
      const m = bandBus.rows[row];
      // ★★**中身は ref から読む**（`wake` の同一性を変えない）―― 変えると、
      //   走っている最中のループが**古い中身を掴んだまま**次のフレームを頼む。
      const list = itemsRef.current;
      const track = trackRef.current;
      if (aim && aim.row === row && track && list.length) {
        // ★★★**測るのは「まだ何も開いていなかったときの境目」**（第113巡）。
        //   ★★★**開いた器の中心で測ってはいけない** ―― 器は**左の縁が動かない
        //     まま右へ育つ**ので、**中心が指から逃げていく**。実測で、同じ指の
        //     位置なのに index が 1 → 0 へ飛んだ（隙間が行ったり来たりする）。
        //   ★開いているぶんを DOM の並び順に積んで引けば、**どれだけ開いていても
        //     同じ答え**になる（＝指が動かないかぎり挿し口も動かない）。
        let at = 0; let bestD = Infinity; let extra = 0; let pick = -1; let k = 0;
        // ★★★**いま開けている挿し口の「近さ」も一緒に測る**（第118巡）。
        //   乗り換えの遊び（`GAP_HYST`）を当てるのに要る。
        let curD = Infinity; let curPick = -1;
        for (const el of track.querySelectorAll<HTMLElement>("[data-pad]")) {
          const i = Number(el.dataset.pad);
          // ★★★**`lead` を足し戻す** ―― `paint` が帯ぜんたいを `lead` だけ
          //   左へ寄せているので、DOM の矩形はそのぶん左に居る。足し戻さないと
          //   **境目が開くほど左へ流れて、挿し口が勝手にとなりへ移る**。
          const d = Math.abs(el.getBoundingClientRect().x - extra + m.lead
            + m.open.p / 2 + BAND_PAD / 2 - aim.x);
          if (d < bestD) { bestD = d; at = i; pick = k; }
          // ★★**同じ index の器は2周ぶん居る**ので、**指に近いほう**を採る。
          if (i === m.open.at && d < curD) { curD = d; curPick = k; }
          if (i === m.open.at) extra += m.open.p;
          if (i === m.shut.at) extra += m.shut.p;
          k += 1;
        }
        // ★★★**乗り換えには「得」が要る**（2026-09-17・第118巡。真因は
        //   `components/home/bandMotion.ts` の `GAP_HYST` の注釈）。
        //   ★★① **`GAP_HYST` px 以上近くならなければ、いまの挿し口に留まる。**
        //      遊びが無いと**毎フレーム隣へ飛び、そのたび隙間が 0 へ戻る**＝
        //      「全然アニメーションしていない／ガクガク震える」。
        //   ★★② **閉じかけが残っているあいだも留まる**（受け皿は1本しか無く、
        //      上書きすると一度も閉じ切らない＝ピルが重なる）。
        if (m.open.at >= 0 && at !== m.open.at
          && (curD < bestD + GAP_HYST || bandSettling(row))) {
          at = m.open.at; pick = curPick >= 0 ? curPick : pick;
        }
        // ★★★**挿し口は「左どなりのピルの id」で返す**（第114巡）。index だと
        //   離した瞬間に `items` が組み替わって指した場所を指さなくなる。
        //   ★★**引き抜いている当のピルは飛ばす**（自分の次に自分は置けない）。
        let a = at - 1;
        while (a >= 0 && list[a].id === armedRef.current) a -= 1;
        bandBus.slot = { row, at, after: a >= 0 ? list[a].id : "" };
        // ★★★**狙われている段は流れを止める**（2026-09-16・第112巡）。
        //   ★★★**流れたままだと、指を止めていてもピルのほうが動いて挿し口が
        //     勝手に変わる**（実測 … 同じ x でも index が 3 → 1 へ飛んだ）。
        //   ★★★**第113巡はもう1つ理由が増えた** ―― 隙間はレイアウトなので
        //     **開いているあいだ1周の幅が変わる**。流れの WAAPI は組んだときの
        //     1周の幅で送るので、**止めていないと継ぎ目がずれる**。
        if (!heldRef.current) { heldRef.current = true; flow(false); }
        bandGapAt(row, at, aim.w, pick);
        aimedRef.current = true;
      } else if (aimedRef.current || heldRef.current) {
        // ★離れた・別の段へ移った → 隙間を閉じる。
        if (aimedRef.current) { bandGapClear(row); aimedRef.current = false; }
        // ★★狙いが外れたら流れを戻す（上の `flow(false)` と対）。
        if (heldRef.current) { heldRef.current = false; flow(true); }
      }
      // ── ② 進める ────────────────────────────────────────────
      // ★★**挿し口が出ているあいだは回し続ける**（次のフレームで index が変わり得る）。
      const live = stepBandMotion() || (!!bandBus.aim && bandBus.aim.row === row);
      // ── ③ 書く ──────────────────────────────────────────────
      paint();
      if (!live) { runRef.current = false; return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [row, paint, flow]);   // ★`flow` は `useCallback([row])` で不変
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
  // ★★**他の段や山から注文が入ったらすぐ起こす**（`bandBus.wakers` に預ける）。
  useEffect(() => {
    bandBus.wakers.add(wake);
    return () => { bandBus.wakers.delete(wake); };
  }, [wake]);

  /**
   * ★★★**① 帯の席を畳む**（2026-09-15・第110巡にユーザー指定「**完全にピルを
   * 引き抜いた瞬間に、後ろのものが動き始めて、またスクロールが始まる**」）。
   *
   * ★★★**出来事ではなく「照合」で書く** ―― 弾ける／弾けが外れる／`items` から
   *   消える、の3つが**同じコミットで起こり得る**（React はまとめる）ので、
   *   別々の effect に分けると順番が保証されない。**1本で状態を突き合わせる。**
   * ★★★**`useLayoutEffect`** ―― 受け渡しは**塗る前**でなければ1フレーム飛ぶ
   *   （passive effect は塗ったあと）。
   * ★★★**受け渡しの計算はもう無い**（2026-09-16・第113巡）―― 隙間も席も
   *   **レイアウトそのもの**なので、`items` が変わったフレームに**バネを 0 へ
   *   落とすだけ**で画面は 1px も動かない（理由は `bandMotion.ts` の頭）。
   */
  const holeRef = useRef<string | null>(null);
  const prevIdsRef = useRef<string[]>([]);
  useLayoutEffect(() => {
    const has = (id: string) => items.some((it) => it.id === id);
    const now = items.map((it) => it.id);
    const was = prevIdsRef.current;
    prevIdsRef.current = now;
    // ★★★**挿し口の受け渡し** … 開けて待っていた所へ本当にピルが挿し込まれた。
    //   レイアウトが増える幅（`pad + ピル`）は開けていた幅と厳密に同じなので、
    //   **掛け金を外して塗るだけ**。
    // ★★★**入れ直し（並べ替え）も同じ受け渡しに乗せる**（2026-09-16・第114巡）。
    //   引き抜いたピルを別の場所へ入れ直すと**件数は変わらない**ので、
    //   「増えたか」だけを見ていると受け渡しが走らず、**畳んでいた席が古い所で
    //   開き直し、新しい所の隙間が別に閉じる**＝1フレームで 139px 飛んだ（実測）。
    const moved = now.find((id) => !was.includes(id))
      ?? (holeRef.current && now.join("\u0001") !== was.join("\u0001")
        ? holeRef.current : undefined);
    if (aimedRef.current && was.length && moved) {
      // ★★★**`transform` の一様なずれを、流れの時計へ畳み替える**（第113巡）。
      //   挿し込まれるとレイアウトが `lead` ぶん右へ動き、`transform` の
      //   `lead` と「隙間の半分」はこのあと 0 になる ―― 畳み替えないと、
      //   **その瞬間に帯がピル1枚ぶん飛ぶ**（実測 72px）。
      holdRef.current += bandBus.rows[row].lead + bandBus.rows[row].open.p / 2;
      // ★★**新しく入ったピルは実測、入れ直したピルは「畳む前に測った幅」**
      //   （いま DOM には幅 0 が書かれているので、測り直しては 0 になる）。
      const el = moved === holeRef.current ? null
        : trackRef.current?.querySelector<HTMLElement>(`[data-pill-id="${CSS.escape(moved)}"]`);
      bandGapDone(row, now.indexOf(moved), moved, el?.getBoundingClientRect().width ?? 0);
      // ★★席の掛け金は `bandGapDone` が引き取った（新しい場所で素の幅へ育つ）。
      holeRef.current = null;
      aimedRef.current = false;
      paint();
    }
    const h = holeRef.current;
    // ① 畳んでいた席の主が `items` から消えた → **受け渡し**（レイアウトが詰む瞬間）。
    if (h && !has(h)) {
      bandHoleDone(row);
      paint();                            // ★塗ってから返す（上の `paint` の注意書き）
      holeRef.current = null;
      return;
    }
    // ② 弾けが外れた（引き戻した・取り消した）→ 席を戻す。
    if (h && armed !== h) {
      bandHoleRelease(row);
      holeRef.current = null;
    }
    // ③ 新しく弾けた → **まだ席が在るうちに**畳ませる。
    if (!armed || holeRef.current || !has(armed)) return;
    // ★★★**流れの再開と慣性の一発は、席より先に・無条件で撃つ**
    //   （2026-09-15・第111巡。ユーザー「**指を離す前でもスクロールが開始される
    //   ようにしてほしい**」）。
    //   ★★★**第110巡は「後ろにピルが無ければ return」の中に入れていた** ――
    //     **引き抜いたのが段の最後のピルだと、再開ごと落ちていた**（段に1〜2枚
    //     しか無い日は必ずこれ）。**席が畳まれるかとは無関係の合図**なので分ける。
    //   ★指はまだ触れているが、掴んでいるのは山の幽霊なので帯は動いてよい。
    animRef.current?.play();
    bandResume(row);
    // ★★畳む幅は**そのピルの実測**（`.band-slot` は押下の縮みを受けない）。
    //   ★★**畳んでいる最中は測り直さない**（自分が縮めた値を読んでしまう）。
    const track = trackRef.current;
    const el = track?.querySelector<HTMLElement>(`[data-pill-id="${CSS.escape(armed)}"]`);
    holeRef.current = armed;
    bandHole(row, armed, el?.getBoundingClientRect().width || BAND_H.plain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, sig, row, paint]);

  useEffect(() => {
    build();
    const track = trackRef.current;
    if (!track) return;
    // ★幅が変わったら組み直す（写真が遅れて届く・端末が回る）。
    // ★★★**自分が開けている隙間では組み直さない**（2026-09-16・第113巡）――
    //   隙間も穴も**レイアウトそのもの**なので、毎フレーム `ResizeObserver` が
    //   鳴る。組み直すと `track.animate` が**新しく作られて走り出す**ので、
    //   **止めていたはずの段が指の下で流れ始める**（実測 … `paused` のはずが
    //   `running`、離したあとに 19px ずれた）。中身が変われば `sig` の effect が
    //   組み直すので、ここで拾う必要はそもそも無い。
    const ro = new ResizeObserver(() => {
      const m = bandBus.rows[row];
      if (m.open.at >= 0 || m.shut.at >= 0 || m.holeId) return;
      build();
    });
    ro.observe(track);
    return () => {
      ro.disconnect();
      // ★★**消す前に位相を控える**（React はクリーンアップを先に走らせる）。
      snapPhase();
      animRef.current?.cancel(); animRef.current = null;
    };
  }, [build, sig, snapPhase, row]);

  /**
   * ★★★**指で帯を左右に送る**（2026-09-19・第124巡にユーザー指定
   *   「**ピルは自分で左右にスクロールできるようにもしてください**」）。
   *
   * ★★★**送りは `holdRef` が預かる** ―― 受け渡しの一様なずれと**同じ入れ物**。
   *   別に持つと `paint()` の式が2本になり、次に画素を直す人が片方しか直さない。
   *   ★`build()` が送り（`phaseRef`）へ畳むので、組み直しても位置は動かない。
   * ★★★**ピルの上から始めた指もここへ来る** ―― ピルが `setPointerCapture` しても
   *   **イベントは祖先へ上がる**ので、段はそのまま受け取れる（新しい口を増やさない）。
   * ★★**引き下ろしが始まったら手を引く**（`taken`）―― 縦と横で同じ指を奪い合わない。
   * ★★★**ニュースのピルの上では慣性の一発を出さない**（ユーザー指定「**ニュースを
   *   タップした時に、帯に流れているピルが不安定な動きをする**」）―― タップは
   *   「掴んで止めた」ではないので、`bandStop` の行き過ぎが**ただの跳ね**に見える。
   */
  const panRef = useRef<{ id: number; x: number; on: boolean } | null>(null);
  const onPanDown = (e: React.PointerEvent) => {
    const tap = (e.target as HTMLElement).closest?.("[data-news-pill]");
    flow(false, !tap);
    panRef.current = { id: e.pointerId, x: e.clientX, on: false };
  };
  const onPanMove = (e: React.PointerEvent) => {
    const p = panRef.current;
    if (!p || p.id !== e.pointerId) return;
    if (taken) { panRef.current = null; return; }   // ★引き下ろしに譲る
    const dx = e.clientX - p.x;
    if (!p.on) {
      if (Math.abs(dx) < PAN_SLOP) return;
      p.on = true; p.x = e.clientX; return;          // ★遊びのぶんは送らない
    }
    p.x = e.clientX;
    // ★`paint()` は `- holdRef` で書くので、**右へ引く ＝ 引く**（符号が逆）。
    holdRef.current -= dx;
    paint();
  };
  const onPanEnd = () => { panRef.current = null; flow(true); };

  if (!items.length) return null;   // ★空の段は消す（無いものを説明しない）

  return (
    <div
      className="band-row"
      // ★★★**段を名で引けるようにする**（第110巡）。空の段は描かれないので、
      //   「上が row0・下が row1」と決め打ちできない（`HomeTab.bandRowAt`）。
      data-band-row={row}
      // ★★帯は山の上に重ねてある。**触れるのはこの段だけ**（外側の器は透かす）。
      style={{ height: HEIGHT[row], touchAction: "pan-y", pointerEvents: "auto" }}
      // ★指が触れている間だけ止める。離しても**位置は戻さない**。
      onPointerDown={onPanDown}
      onPointerMove={onPanMove}
      onPointerUp={onPanEnd}
      onPointerCancel={onPanEnd}
    >
      {/* ★★★**ずれはここが持つ**（2026-09-15・第109巡）。`.band-track` の
          `transform` は**流れの WAAPI が占有している**（インラインの style は
          効かない）ので、**1枚外に重ねる**。★`display: block` で幅は段のまま
          なので、`build()` が測る `track.parentElement` の幅も変わらない。 */}
      <div ref={shiftRef} className="band-shift">
      <div ref={trackRef} className="band-track">
        {[0, 1].map((lap) => (
          <div key={lap} aria-hidden={lap === 1 || undefined} style={{ display: "flex" }}>
            {items.map((it, i) => (
              <Fragment key={`${lap}-${it.id}`}>
                {/* ★★★**ピルとピルのあいだの器**（2026-09-16・第113巡）。
                    素の幅は `BAND_PAD` で、**挿し口はここが広がる**。
                    ★★★**`gap` でも末尾の詰め物でもいけない** ―― 隙間を
                      `transform` のずれで作ると**継ぎ目で必ず破綻する**
                      （理由は `bandMotion.ts` の頭。実測 152px の飛び）。
                    ★★**どのピルの前にも1つずつ在る**ので、周と周のあいだの
                      間隔も周の内側と厳密に同じ（＝継ぎ目が存在しない）。 */}
                <div className="band-pad" data-pad={i} data-pad-for={it.id}
                  style={{ width: BAND_PAD, flexShrink: 0 }} />
                {/* ★★包み。**畳むときはここの幅が縮む**（中のピルは透明なので
                    はみ出しても見えない）。★`transform` は持たない。 */}
                <div className="band-slot" data-pill-id={it.id}
                  style={{ flexShrink: 0, overflow: "hidden" }}>
                  <Pill item={it} row={row} pull={pull}
                    taken={taken === it.id} onTake={onTake} onArm={onArm}
                    onFlow={flow} onHold={hold} />
                </div>
              </Fragment>
            ))}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

/**
 * 帯（★**3段**）。上＝提案／中＝タスク系（塗り＝まだ提案／線＝登録済み）／
 * **下＝ニュース**（2026-09-18・第122巡。字だけ・押せない）。
 */
export function Band({ rows, pull }: {
  rows: [BandItem[], BandItem[], BandItem[]]; pull?: PullHost;
}) {
  // ★★**引いている最中のピルは、2周ぶんとも消す**（幽霊と二重に見えないように）。
  //   ★掴むたびに1度だけ動くので、毎フレームの再描画にはならない。
  const [taken, setTaken] = useState<string | null>(null);
  // ★★★**弾けた（＝完全に引き抜いた）ピル**（2026-09-15・第110巡）。
  //   `taken`（1px 引いた時点）とは別物 ―― 輪ゴムの最中はまだ席が空いていない。
  const [armed, setArmed] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
      <BandRow row={0} items={rows[0]} pull={pull} taken={taken} onTake={setTaken}
        armed={armed} onArm={setArmed} />
      <BandRow row={1} items={rows[1]} pull={pull} taken={taken} onTake={setTaken}
        armed={armed} onArm={setArmed} />
      {/* ★★ニュースの段。**`pull` を渡さない** ―― 日付を割り当てる相手ではない。
          ★ニュースの手つき（下へ引くと広がる）は `NewsPill` が自分で持つ。 */}
      <BandRow row={2} items={rows[2]} taken={taken} onTake={setTaken}
        armed={armed} onArm={setArmed} />
    </div>
  );
}
