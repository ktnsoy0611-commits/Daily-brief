"use client";

import { useCallback, useEffect, useRef } from "react";
import { BAND_H, SANS } from "@/lib/constants";
import { BAND_FACE, type BandItem } from "@/lib/homeBand";
import { bodyInkOn } from "@/lib/palette";
import { RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";

// ★★★**帯**（2026-09-07）。AI が差し出したものが横に流れる列。
//
// ★★**動きは「ピル1つぶん動いて、止まって、また動く」**（ユーザー確定）。
//   等速で流し続けない ―― 動き続けるものは目を引き続け、下の山を見られなくする。
//   ★動き出しと止まりは既存の `--ease-settle`（すっと出てふわっと止まる）。
//   **新しい曲線は作っていない。**
// ★★★**1歩の量は「いま先頭にいるピルの幅」**なので、幅がまちまちだと CSS の
//   キーフレームでは書けない。だから **Web Animations API** で、測った幅から
//   キーフレームを組む。★時間と曲線は `app/globals.css` の `:root` から読む
//   （このファイルに数字を書かない）。
// ★★段ごとに向きが互い違い（上＝左へ／中＝右へ／下＝左へ）。
//   **止まって見える瞬間が無い**のは、隣の段が動いているから。
// ★★左右とも画面の外へ切れる（＝まだ続きがある、を形で言う）。器の左右の
//   パディングの外へ出すのは `.bleed-x`（既存の語彙。負の余白を書かない）。
// ★★**指が触れている間は止まる**。離すと続きから動く（位置は戻さない）。
// ★★**ピルに印（アイコン・矢印）を付けない。**

type Row = 0 | 1 | 2;

/** 段の厚み。★写真の丸が入る上の段だけ厚い（丸は高さいっぱい）。 */
const HEIGHT: Record<Row, number> = { 0: BAND_H.photo, 1: BAND_H.plain, 2: BAND_H.plain };

/** ピル1つ。★色は種類が決める（`BAND_FACE`）。文字はその面から導く。 */
function Pill({ item, row }: { item: BandItem; row: Row }) {
  const face = BAND_FACE[item.kind];
  const ink = bodyInkOn(face);
  const photo = row === 0 ? item.photo : undefined;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: SPACE.md, flexShrink: 0,
      height: HEIGHT[row], borderRadius: RADIUS.pill, background: face,
      // ★写真があるときは丸が左端に密着するので、左の余白は持たない。
      padding: photo ? `0 ${SPACE.xl}px 0 0` : `0 ${SPACE.xl}px`,
      maxWidth: "80vw",
    }}>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" style={{
          width: HEIGHT[row], height: HEIGHT[row], borderRadius: RADIUS.circle,
          objectFit: "cover", display: "block", flexShrink: 0,
        }} />
      )}
      <span style={{
        // ★★ROSE（フォローアップ）の面は墨との比が 4.05 で本文の 4.5 に届かない。
        //   **16px / 700 以上**にして「大きな文字 3.0」で通す（ユーザー確定）。
        //   ★帯は5種類とも同じ組で揃えるので、この1行が全部に効く。
        //   ★目盛りの外（ROSE の比 4.05。面としての役が要るため）
        fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.bold,
        letterSpacing: TRACK.normal, color: ink,
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
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    // ★1周のピルの幅を測る（隙間込み）。**1歩の量はこの幅**。
    const half = track.firstElementChild as HTMLElement | null;
    if (!half) return;
    const widths = [...half.children].map((c) => (c as HTMLElement).getBoundingClientRect().width);
    const lap = half.getBoundingClientRect().width;
    if (!lap || widths.length === 0) return;

    const css = getComputedStyle(document.documentElement);
    const num = (name: string, fallback: number) => {
      const v = css.getPropertyValue(name).trim();
      const n = parseFloat(v);
      if (!Number.isFinite(n)) return fallback;
      return v.endsWith("ms") ? n : n * 1000;
    };
    const step = num("--t-amb-band-step", 900);
    const hold = num("--t-amb-band-hold", 2500);
    const ease = css.getPropertyValue("--ease-settle").trim() || "ease-out";

    // ★1歩＝「動く」＋「止まる」。周の合計がそのまま一周の時間になる。
    const total = widths.length * (step + hold);
    const frames: Keyframe[] = [];
    let at = 0;      // 進んだ距離
    let t = 0;       // 進んだ時間
    for (const w of widths) {
      frames.push({ offset: t / total, transform: `translateX(${-at}px)`, easing: ease });
      t += step;
      at += w;
      frames.push({ offset: t / total, transform: `translateX(${-at}px)`, easing: "linear" });
      t += hold;     // ここから次の歩まで止まる（値が変わらない＝止まって見える）
    }
    frames.push({ offset: 1, transform: `translateX(${-lap}px)` });

    // ★中の段だけ**右へ**流す。2つ目のキーフレームを書かず、向きだけ逆にする。
    const anim = track.animate(frames, {
      duration: total, iterations: Infinity,
      direction: row === 1 ? "reverse" : "normal",
    });
    animRef.current = anim;
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
