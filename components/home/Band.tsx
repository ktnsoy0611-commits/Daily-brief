"use client";

import { useCallback, useEffect, useRef } from "react";
import { BAND_BEZEL, BAND_H, SANS } from "@/lib/constants";
import { img } from "@/lib/helpers";
import { type BandItem } from "@/lib/homeBand";
import { bodyInkOn } from "@/lib/palette";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";

// ★★★**帯**（2026-09-07）。AI が差し出したものが横に流れる列。
//
// ★★**ゆっくり流れ続けて循環する**（2026-09-07 ユーザー確定）。等速（`linear`）
//   ―― 環境の動き（止まらずに回り続けるもの）は曲線4本の対象外で、等速でないと
//   繰り返しの継ぎ目で速さが飛ぶ。
// ★★★**速さは「画面の幅ぶん流れる時間」で持つ**（`--t-amb-band-lap`）。一周の
//   時間で持つと、並ぶ件数が変わるたびに速さが変わる（件数は日によって違う）。
//   幅で持てば何件並んでも速さは同じ。★数字はこのファイルに書かない。
// ★★段ごとに向きが互い違い（上＝左へ／中＝右へ／下＝左へ）。
//   **止まって見える瞬間が無い**のは、隣の段が動いているから。
// ★★左右とも画面の外へ切れる（＝まだ続きがある、を形で言う）。器の左右の
//   パディングの外へ出すのは `.bleed-x`（既存の語彙。負の余白を書かない）。
// ★★**指が触れている間は止まる**。離すと続きから動く（位置は戻さない）。
// ★★**ピルに印（アイコン・矢印）を付けない。**

type Row = 0 | 1 | 2;

/** 段の厚み。★写真の丸が入る上の段だけ厚い（丸は高さいっぱい）。 */
const HEIGHT: Record<Row, number> = { 0: BAND_H.photo, 1: BAND_H.plain, 2: BAND_H.plain };

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
function Pill({ item, row }: { item: BandItem; row: Row }) {
  const face = item.face;
  const ink = bodyInkOn(face);
  const h = HEIGHT[row];
  const head = row === 0;                              // 提案の段
  const photo = head ? item.photo : undefined;
  // ★丸の直径 ＝ ピルの高さ − 縁取り2つぶん。
  const dia = h - BAND_BEZEL * 2;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: SPACE.md, flexShrink: 0,
      height: h, borderRadius: RADIUS.pill, background: face,
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
      <span style={{
        // ★★提案は `head`(20) ―― 帯の中で主役をひとつ作る。
        //   候補・期日未割当は `lead`(16)。
        //   ★どちらも 700 以上なので、面の比が 4.5 に届かない色でも
        //   「大きな文字 3.0」で通る。
        fontFamily: SANS, fontSize: head ? TYPE.head : TYPE.lead, fontWeight: WEIGHT.bold,
        letterSpacing: TRACK.normal, lineHeight: LEAD.snug, color: ink,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{item.text}</span>
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
function BandRow({ row, items }: { row: Row; items: BandItem[] }) {
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
      className="band-row bleed-x"
      style={{ height: HEIGHT[row], touchAction: "pan-y" }}
      // ★指が触れている間だけ止める。離しても**位置は戻さない**。
      onPointerDown={() => animRef.current?.pause()}
      onPointerUp={() => animRef.current?.play()}
      onPointerCancel={() => animRef.current?.play()}
    >
      <div ref={trackRef} className="band-track">
        {[0, 1].map((lap) => (
          <div key={lap} aria-hidden={lap === 1 || undefined} style={{ display: "flex", gap: SPACE.sm }}>
            {items.map((it) => <Pill key={`${lap}-${it.id}`} item={it} row={row} />)}
            {/* ★周の末尾の隙間。**器の左右のパディングにしない**（左右のパディングを
                持ってよいのはページ最上位の器だけ）。これは継ぎ目そのもの。 */}
            <div style={{ width: SPACE.sm, flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 帯（3段）。★段の順は上から「提案／候補／いつか」で固定。 */
export function Band({ rows }: { rows: [BandItem[], BandItem[], BandItem[]] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
      <BandRow row={0} items={rows[0]} />
      <BandRow row={1} items={rows[1]} />
      <BandRow row={2} items={rows[2]} />
    </div>
  );
}
