"use client";

import { useState } from "react";
import { BAND_EDGE, BAND_EDGE_W, BAND_H, INK, SANS, SCHEME } from "@/lib/constants";
import { bodyInkOn } from "@/lib/palette";
import { RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
import type { BandItem } from "@/lib/homeBand";

// ★★★**帯**（2026-09-07・`docs/home-spec.md` §4）。
//
// 3段が**互い違いに逆方向へ流れ続ける** ―― 段1は左へ／段2は**右へ**／段3は左へ。
// ★互い違いなので**止まって見える瞬間が無い**。
// ★★**左右とも画面の外へ切れる**（＝まだ続きがある、を形で言う）。器の左右の
//   パディングの外へ出すのは `.bleed-x`（`app/globals.css`。既存の語彙で、
//   ここで負の余白を書かない）。
// ★★★**指が触れている間は止まる。離すと流れ出す**（位置は戻さない）。
// ★★**ピルに印（アイコン）を付けない** ―― 列に印が並ぶと、印が「模様」になって
//   印でなくなる（第33便で確定）。
//
// 動きの数字（44s / 58s / 72s）は `app/globals.css` の `--t-amb-band-*` だけが持つ。
// ★実機で速すぎたら**そこだけ**を直す。ここには時間を書かない。

type Row = 0 | 1 | 2;

const DUR = ["var(--t-amb-band-1)", "var(--t-amb-band-2)", "var(--t-amb-band-3)"];
const HEIGHT = [BAND_H.lead, BAND_H.mid, BAND_H.tail];

/** 段1のピル。★**写真を持つのは提案だけ**。急ぎは ROSE の面（写真なし）。 */
function LeadPill({ item }: { item: BandItem }) {
  const face = item.color ?? SCHEME.danger;
  const ink = bodyInkOn(face);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: SPACE.md,
      height: BAND_H.lead, borderRadius: RADIUS.pill, background: face,
      // ★写真があるときは左端に密着させるので、左の余白は写真が持つ。
      padding: item.photo ? `0 ${SPACE.xl}px 0 0` : `0 ${SPACE.xl}px`,
      flexShrink: 0, maxWidth: "78vw",
    }}>
      {item.photo && (
        // ★写真の丸は**カプセルの高さいっぱい**、左端に密着（§4-b）。
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photo} alt="" style={{
          width: BAND_H.lead, height: BAND_H.lead, borderRadius: RADIUS.circle,
          objectFit: "cover", flexShrink: 0, display: "block",
        }} />
      )}
      <span style={{
        // ★★ROSE（急ぎ）の面は地との比 4.05 で AA を割るので、**16px / 700 以上**で
        //   だけ文字を載せる（`docs/home-spec.md` §2-b）。段1は全部この組で揃える。
        fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.bold,
        letterSpacing: TRACK.normal, color: ink, whiteSpace: "nowrap",
      }}>{item.text}</span>
    </div>
  );
}

/** 段2のピル。★塗られている＝声から拾って自分のものにした、まで来ている。 */
function MidPill({ item }: { item: BandItem }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", height: BAND_H.mid, borderRadius: RADIUS.pill,
      background: SCHEME.wellness, padding: `0 ${SPACE.lg}px`, flexShrink: 0, maxWidth: "78vw",
    }}>
      <span style={{
        fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold,
        letterSpacing: TRACK.normal, color: bodyInkOn(SCHEME.wellness), whiteSpace: "nowrap",
      }}>{item.text}</span>
    </div>
  );
}

/** 段3のピル。★**塗られていない＝まだ時間を割り当てていない**。 */
function TailPill({ item }: { item: BandItem }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", height: BAND_H.tail, borderRadius: RADIUS.pill,
      border: `${BAND_EDGE_W}px solid ${BAND_EDGE}`, padding: `0 ${SPACE.lg}px`,
      flexShrink: 0, maxWidth: "78vw",
    }}>
      <span style={{
        fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold,
        letterSpacing: TRACK.normal, color: `var(--ink-on, ${INK})`, whiteSpace: "nowrap",
      }}>{item.text}</span>
    </div>
  );
}

function Pill({ row, item }: { row: Row; item: BandItem }) {
  if (row === 0) return <LeadPill item={item} />;
  if (row === 1) return <MidPill item={item} />;
  return <TailPill item={item} />;
}

/**
 * 1段ぶん。★**中身を2回並べて `translateX(-50%)`** ―― 半分ぶん送ると2周目の
 * 先頭が1周目の先頭と同じ位置に来るので、**継ぎ目が原理的に存在しない**。
 */
function BandRow({ row, items }: { row: Row; items: BandItem[] }) {
  const [hold, setHold] = useState(false);
  if (!items.length) return null;
  return (
    <div
      className="band-row bleed-x"
      data-band-hold={hold ? "1" : "0"}
      // ★指が触れている間だけ止める。離しても**位置は戻さない**（`paused` を解くだけ）。
      onPointerDown={() => setHold(true)}
      onPointerUp={() => setHold(false)}
      onPointerCancel={() => setHold(false)}
      style={{ height: HEIGHT[row], overflow: "hidden", touchAction: "pan-y" }}
    >
      <div
        className="band-track"
        data-reverse={row === 1 ? "1" : "0"}
        style={{ ["--band-dur" as string]: DUR[row] }}
      >
        {/* ★★★**2周とも「まったく同じ幅の半分」にすること。** 隙間を器の `gap` で
            作ると、半分と半分のあいだにも隙間が1つ入り、`-50%` が**隙間の半分だけ
            ずれる**（実際に 4px ずれる）。**隙間は半分の内側だけが持ち、
            末尾にも同じ隙間を置く**ので、半分の幅は必ず等しくなる。
            ★2周目は読み上げから外す。 */}
        {[0, 1].map((half) => (
          <div key={half} aria-hidden={half === 1 || undefined}
            style={{ display: "flex", gap: SPACE.sm }}>
            {items.map((it) => <Pill key={`${half}-${it.id}`} row={row} item={it} />)}
            {/* ★末尾の隙間。**器の左右のパディングにしない**（左右のパディングを
                持ってよいのはページ最上位の器だけ）。これは継ぎ目の隙間そのもの。 */}
            <div style={{ width: SPACE.sm, flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 帯（3段）。★段の順は上から「AI から／声から／いつか」で固定。 */
export function Band({ rows }: { rows: [BandItem[], BandItem[], BandItem[]] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
      <BandRow row={0} items={rows[0]} />
      <BandRow row={1} items={rows[1]} />
      <BandRow row={2} items={rows[2]} />
    </div>
  );
}
