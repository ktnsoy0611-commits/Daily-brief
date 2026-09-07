"use client";

import { useCallback, useEffect, useRef } from "react";
import { BAND_H, SANS } from "@/lib/constants";
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
 * ★★★**提案の丸は、Explore と同じ規則**（2026-09-07・ユーザー指摘「写真もないし、
 *   現状の Explore と繋がっていない」）―― 写真があればその写真、無ければ
 *   **色ベタの上に巨大な字面**（「展」「本」）。だから列には必ず「顔」が並ぶ。
 */
function Pill({ item, row }: { item: BandItem; row: Row }) {
  const face = item.face;
  const ink = bodyInkOn(face);
  const h = HEIGHT[row];
  const head = row === 0;                    // 提案の段だけ、丸と大きな題を持つ
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: SPACE.md, flexShrink: 0,
      height: h, borderRadius: RADIUS.pill, background: face,
      // ★丸は左端に密着するので、そのときだけ左の余白を持たない。
      padding: head ? `0 ${SPACE.xl}px 0 0` : `0 ${SPACE.xl}px`,
      maxWidth: "84vw",
    }}>
      {head && (
        <div style={{
          width: h, height: h, borderRadius: RADIUS.circle, flexShrink: 0,
          overflow: "hidden", position: "relative",
          // ★写真が無いときの地。★Explore のカードと同じ「色ベタ＋字面」。
          background: face, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {item.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img(item.photo, 200, 200)} alt=""
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <span aria-hidden style={{
              // ★★字面は**丸いっぱい**に。`TYPE` の段から選ばない＝目盛りの外
              //   （器の直径から決まる寸法。Explore の `min(42vw,170px)` と同じ考え方）。
              fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: h * 0.72,
              lineHeight: LEAD.flat, color: ink, opacity: 0.92,
            }}>{item.glyph ?? ""}</span>
          )}
        </div>
      )}
      <span style={{
        // ★★提案は `head`(20) ―― 帯の中で主役をひとつ作る（ユーザー指摘
        //   「パンチが足りない」）。★候補・期日未割当は `lead`(16)。
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
