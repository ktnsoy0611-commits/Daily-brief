"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { groundOf } from "@/components/AppBackdrop";
import { BAND_BEZEL, BAND_H, SANS } from "@/lib/constants";
import { img } from "@/lib/helpers";
import { type BandItem, isOutlined } from "@/lib/homeBand";
import { bodyInkOn } from "@/lib/palette";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
import {
  PILL_EDGE, PILL_PRESS, RAIL_NEAR, SNAP_POP, STEP_POP, pullBus, pullFrame, shownRows,
  type GhostSeed, type LandingAt, type PillLook, type PullHost,
} from "@/lib/pullDrag";
import { haptic } from "@/lib/helpers";

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

type Row = 0 | 1;

/** 段の厚み。★写真の丸が入る上の段だけ厚い（丸は高さいっぱい）。 */
const HEIGHT: Record<Row, number> = { 0: BAND_H.photo, 1: BAND_H.plain };

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
function Pill({ item, row, pull, taken, onTake }: {
  item: BandItem; row: Row; pull?: PullHost;
  /** ★★**同じ中身は2周ぶん DOM に居る**ので、隠すのは id で決める。 */
  taken: boolean;
  onTake: (id: string | null) => void;
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
  // ★★**字は線と同じ色**（同ユーザー指定）。★地の上で比 2.55 しかないので
  //   `design.md` の本文の下限は割る ―― **目盛りの外（ユーザー指定の配色）**。
  const ink = outline ? face : bodyInkOn(face);
  const h = HEIGHT[row];
  const head = row === 0;                              // 提案の段
  const photo = head ? item.photo : undefined;
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
    /** ★いま何段まで生えているか（増えた瞬間に弾ませる）。 */
    shown: number;
  } | null>(null);

  const end = useCallback((commit: boolean) => {
    const g = grab.current;
    grab.current = null;
    setPressed(false);
    onTake(null);
    if (!pull) return;
    if (g?.live) pull.lift(false);
    // ★★★**離した所と勢いを控えてから幽霊を消す**（2026-09-14・第103巡）。
    //   山はこの1つだけ**上からではなくここから**落とすので、手を離した瞬間と
    //   落ち始めのあいだに継ぎ目が無い。★速さは `stepGhost` が書いた値
    //   （**山のループが固定の刻みで測ったもの**）。
    const gh = pullBus.ghost;
    const at: LandingAt | null = gh
      ? { x: gh.dx, y: gh.dy, vx: gh.vx, vy: gh.vy, angle: gh.angle } : null;
    pullBus.ghost = null;
    pull.rail(false);
    if (g && commit && g.armed) pull.drop(item, g.rail, at);
  }, [item, pull, onTake]);

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
      armed: false, rail: false, live: false, shown: 1,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || !pull) return;
    const box = pull.box.current;
    if (!box) return;
    const br = box.getBoundingClientRect();
    const frame = () => pullFrame(
      e.clientX - br.left, e.clientY - br.top, g.sy,
      g.bx, g.by, g.w0, g.h0, g.seed.w, g.seed.h,
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
    if (f.armed && !g.armed) { haptic(12); pullBus.pop = SNAP_POP; }
    if (!f.armed && g.armed) g.shown = 1;
    g.armed = f.armed;
    // ★★★**段が1つ増えた瞬間に弾む**（同ユーザー確定「**段が増える瞬間弾んだり**」）。
    const shown = f.armed ? shownRows(f.t, g.seed.rows) : 1;
    if (shown !== g.shown) { if (shown > g.shown) pullBus.pop = STEP_POP; g.shown = shown; }
    // ★★**指のイベントが書くのは「目標」だけ** ―― 振れ・伸び・支点・速さは
    //   山のループが `stepGhost` で作る（`lib/pullDrag.ts`）。前のフレームの値を
    //   引き継いで、掴んでいる間の連なりを切らない。
    const was = pullBus.ghost;
    pullBus.ghost = live ? {
      phase: f.armed ? "solid" : "pill",
      kind: g.seed.kind, id: item.id, title: g.seed.title,
      cx: f.cx, cy: f.cy, w: f.w, h: f.h, t: f.t,
      // ★★**支点は前のフレームから引き継ぐ** ―― 弾けた瞬間、バネはここから
      //   走り出す（＝**ピルが居た所から指へ**）。引き継がないと左上から飛んでくる。
      hx: was?.hx ?? f.cx, hy: was?.hy ?? f.cy,
      bend: f.bend, gx: g.sx - g.bx, look: g.look,
      rows: g.seed.rows, outlined: g.seed.outlined,
      face: g.seed.face, ink: g.seed.ink, faceIdx: g.seed.faceIdx,
      shape: g.seed.shape, photo: g.seed.photo, glyph: g.seed.glyph,
      ax: was?.ax ?? 0, ay: was?.ay ?? 0, dx: was?.dx ?? f.cx, dy: was?.dy ?? f.cy,
      angle: was?.angle ?? 0,
      sx: was?.sx ?? 1, sy: was?.sy ?? 1,
      stretchDir: was?.stretchDir ?? Math.PI / 2, vx: was?.vx ?? 0, vy: was?.vy ?? 0,
      shown, pop: was?.pop ?? 0,
    } : null;
    const near = f.armed && e.clientX > window.innerWidth - RAIL_NEAR;
    if (near !== g.rail) { g.rail = near; pull.rail(near); }
  };

  return (
    <div
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => end(true)}
      onPointerCancel={() => end(false)}
      style={{
      display: "flex", alignItems: "center", gap: SPACE.md, flexShrink: 0,
      height: h, borderRadius: RADIUS.pill,
      // ★★引き下ろしのため、**縦も横もこちらで受ける**（段の `pan-y` を上書き）。
      touchAction: pull ? "none" : undefined,
      // ★★★**触ると少し沈む**（2026-09-14 ユーザー指定「少し柔らかいような感触」）。
      //   `design.md` … **押下だけが非対称**（即座に沈み、ゆっくり戻る）。
      // ★★縮みの数は `lib/pullDrag.ts`（写し取る canvas が**同じ数**を読む）。
      transform: pressed ? `scale(${PILL_PRESS})` : "scale(1)",
      transition: pressed
        ? "transform var(--t-press) var(--ease-press)"
        : "transform var(--t-item) var(--ease-settle)",
      // ★外れたら元のピルは消す（幽霊が山の canvas に居る）。
      visibility: taken ? "hidden" : undefined,
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
          onError={(e) => { e.currentTarget.style.display = "none"; }}
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
function BandRow({ row, items, pull, taken, onTake }: {
  row: Row; items: BandItem[]; pull?: PullHost;
  taken: string | null; onTake: (id: string | null) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);

  const build = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
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

    animRef.current = track.animate(
      [{ transform: "translateX(0)" }, { transform: `translateX(${-lap}px)` }],
      {
        duration, iterations: Infinity, easing: "linear",
        // ★中の段だけ**右へ**流す。2つ目のキーフレームを書かず、向きだけ逆にする。
        direction: row === 1 ? "reverse" : "normal",
      },
    );
  }, [row]);

  useEffect(() => {
    build();
    const track = trackRef.current;
    if (!track) return;
    // ★幅が変わったら組み直す（写真が遅れて届く・端末が回る）。
    const ro = new ResizeObserver(() => build());
    ro.observe(track);
    return () => { ro.disconnect(); animRef.current?.cancel(); animRef.current = null; };
  }, [build, items]);

  if (!items.length) return null;   // ★空の段は消す（無いものを説明しない）

  return (
    <div
      className="band-row"
      // ★★帯は山の上に重ねてある。**触れるのはこの段だけ**（外側の器は透かす）。
      style={{ height: HEIGHT[row], touchAction: "pan-y", pointerEvents: "auto" }}
      // ★指が触れている間だけ止める。離しても**位置は戻さない**。
      onPointerDown={() => animRef.current?.pause()}
      onPointerUp={() => animRef.current?.play()}
      onPointerCancel={() => animRef.current?.play()}
    >
      <div ref={trackRef} className="band-track">
        {[0, 1].map((lap) => (
          <div key={lap} aria-hidden={lap === 1 || undefined} style={{ display: "flex", gap: SPACE.sm }}>
            {items.map((it) => (
              <Pill key={`${lap}-${it.id}`} item={it} row={row} pull={pull}
                taken={taken === it.id} onTake={onTake} />
            ))}
            {/* ★周の末尾の隙間。**器の左右のパディングにしない**（左右のパディングを
                持ってよいのはページ最上位の器だけ）。これは継ぎ目そのもの。 */}
            <div style={{ width: SPACE.sm, flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 帯（★2段）。上＝提案／下＝タスク系（塗り＝まだ提案／線＝登録済み）。 */
export function Band({ rows, pull }: { rows: [BandItem[], BandItem[]]; pull?: PullHost }) {
  // ★★**引いている最中のピルは、2周ぶんとも消す**（幽霊と二重に見えないように）。
  //   ★掴むたびに1度だけ動くので、毎フレームの再描画にはならない。
  const [taken, setTaken] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
      <BandRow row={0} items={rows[0]} pull={pull} taken={taken} onTake={setTaken} />
      <BandRow row={1} items={rows[1]} pull={pull} taken={taken} onTake={setTaken} />
    </div>
  );
}
