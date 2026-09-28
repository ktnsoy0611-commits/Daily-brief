"use client";

import { Plus } from "lucide-react";
import { ShapeCard } from "@/components/explore/ShapeCard";
import { INK, MUTED, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";
import { cardShapeOf } from "@/lib/cardShape";
import { categoryOfKind } from "@/lib/deckStyle";
import { img } from "@/lib/helpers";
import { bodyInkOn, colorOfKind, DOMAIN_COLOR } from "@/lib/palette";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
import type { Item, ItemDomain } from "@/lib/types";

// ★★★**ストックの「束」**（2026-09-28・第134巡にユーザー指定「**貼った UI の画像が良いので、ストックの UI を
//   洗練して、画像のような UI に**」）。参照 … 写真の札が**少しずつ傾いて横に重なり**、最後の1枚は**ぼかして
//   「+N」**、束の下に**題と日付を中央揃え**、右上に白い丸の「＋」。
// ★1枚ずつは**ホームの山の提案と同じ形**（`ShapeCard`）。束 ＝ ドメイン（形もドメインが決める）。
// ★押すと束の中身（ドメインの一覧）が開く。＋は そのドメインへ追加。
// ★目盛りの外（札の傾き・重なりの見せ方）。

/** 束に並べる枚数（これを超えたら最後の1枚を「+N」に）。 */
const FAN = 4;
/** 傾き（度）と上下のずれ（札の一辺に対する比）。★手で置いた散らばりに見えるよう、決まった値で揺らす。 */
const TILT = [-5, 3, -2, 4];
const LIFT = [0.03, -0.015, 0.045, 0];
/** 札の一辺（束の幅に対する比）。4枚で幅いっぱいに重なる大きさ。 */
export const STOCK_CARD = 0.37;

const dateOf = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}.${d.getDate()}`; };

export function StockGroup({ title, domain, items, width, onOpen, onAdd }: {
  title: string;
  domain: ItemDomain;
  items: Item[];
  /** 束の幅（px）。 */
  width: number;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const shape = cardShapeOf(domain);
  const size = Math.round(width * STOCK_CARD);
  const extra = items.length > FAN ? items.length - (FAN - 1) : 0;
  const shown = items.slice(0, FAN);
  const n = Math.max(1, shown.length);
  const step = n > 1 ? (width - size) / (FAN - 1) : 0;
  // ★枚数が少ない束は中央に寄せる（左に偏らせない）。
  const x0 = (width - (size + step * (n - 1))) / 2;
  const newest = items[0]?.addedAt;
  return (
    <section style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        role="button" tabIndex={0} aria-label={`${title}を開く`}
        onClick={items.length ? onOpen : onAdd}
        style={{ position: "relative", width, height: Math.round(size * 1.12), cursor: "pointer" }}
      >
        {items.length === 0 ? (
          <div style={{ position: "absolute", left: (width - size) / 2, top: 0, filter: `drop-shadow(${SOFT_SHADOW})` }}>
            <ShapeCard shape={shape} face={DOMAIN_COLOR[domain]} ink={bodyInkOn(DOMAIN_COLOR[domain])} label="" size={size} />
            {/* ★空の束 ＝ 形そのものが「追加」の入口。字（Anton の＋）は小さすぎたので線の＋。 */}
            <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: bodyInkOn(DOMAIN_COLOR[domain]) }}>
              <Plus size={Math.round(size * 0.28)} strokeWidth={2} />
            </span>
          </div>
        ) : shown.map((it, i) => {
          const face = colorOfKind(it.kind);
          const last = extra > 0 && i === FAN - 1;
          return (
            <div key={it.id} style={{
              position: "absolute", left: x0 + step * i, top: size * (0.05 + LIFT[i % LIFT.length]),
              transform: `rotate(${TILT[i % TILT.length]}deg)`, filter: `drop-shadow(${SOFT_SHADOW})`,
            }}>
              <ShapeCard shape={shape} face={face} ink={bodyInkOn(face)} size={size}
                photo={it.images?.[0] ? img(it.images[0], 400, 400) : undefined}
                label={categoryOfKind(it.kind)} more={last ? extra : undefined} />
            </div>
          );
        })}
        {items.length > 0 && (
          <button
            type="button" aria-label={`${title}を追加`}
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            style={{
              position: "absolute", right: 0, top: 0, width: SPACE.xxl + SPACE.sm, height: SPACE.xxl + SPACE.sm,
              borderRadius: RADIUS.circle, border: "none", background: PAPER, boxShadow: SOFT_SHADOW, color: INK,
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
            }}
          ><Plus size={18} strokeWidth={2} /></button>
        )}
      </div>
      <div style={{ marginTop: SPACE.lg, fontFamily: SANS, fontSize: TYPE.head, fontWeight: WEIGHT.bold, lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: INK }}>
        {title}
      </div>
      <div style={{ marginTop: SPACE.xs, fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.text, lineHeight: LEAD.flat, letterSpacing: TRACK.normal, color: MUTED }}>
        {items.length ? `${items.length}件${newest ? ` ・ ${dateOf(newest)}` : ""}` : "まだありません"}
      </div>
    </section>
  );
}
