"use client";

import { SPACE, TYPE, TRACK, WEIGHT, LEAD } from "@/lib/tokens";
import { LATIN, SANS, TICKET_DECK, TICKET_DOMAIN_COLOR, WHITE } from "@/lib/constants";
import { PunchGlyph } from "@/components/explore/PunchMark";
import { Ticket, type TicketData } from "@/components/explore/Ticket";
import { ITEM_DOMAINS } from "@/lib/constants";

// ★開発用。券の部品を並べて目で確かめるだけの画面。
//   本番の導線からは辿れない（/dev/explore を直接開く）。完成したら撤去する。

// 写真の代わりの面。外部に取りに行かず、その場で作る。
function fakePhoto(a: string, b: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">`
    + `<defs><radialGradient id="g" cx="25%" cy="20%" r="85%">`
    + `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>`
    + `</radialGradient></defs>`
    + `<rect width="240" height="240" fill="url(#g)"/>`
    + `<rect x="24" y="120" width="34" height="120" fill="${a}" opacity="0.5"/>`
    + `<rect x="150" y="40" width="26" height="200" fill="${b}" opacity="0.45"/>`
    + `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SAMPLES: { data: TicketData; punch?: { x: number; y: number } }[] = [
  {
    data: {
      kind: "exhibition", glyph: "展", title: "見えないものたちの庭",
      summary: "音と光だけで構成された9つの部屋を、順路を決めずに歩く。図録は会期後半に出る。",
      venue: "東京都現代美術館", area: "清澄白河", term: "12.02 — 03.16", soon: true,
      image: fakePhoto("#FFE58A", "#101B3A"), serial: 143, // ★目盛りの外（ダミー画像の色）
    },
    punch: { x: 0.72, y: 0.34 },
  },
  {
    data: {
      kind: "book", glyph: "本", title: "建築家の日記",
      summary: "図面の余白に書かれた覚え書きだけを集めた一冊。生活の言葉で書かれている。",
      venue: "みすず書房", term: "09.20 刊行", serial: 142,
    },
  },
  {
    data: {
      kind: "food", glyph: "食", title: "灯りだけの喫茶室",
      summary: "照明の設計だけを変えた喫茶室。夕方から席の半分が暗くなる。",
      venue: "喫茶ソワレ分室", area: "蔵前", term: "09.01 — 03.31",
      image: fakePhoto("#FFB27A", "#1A0E0A"), serial: 141, // ★目盛りの外（ダミー画像の色）
    },
    punch: { x: 0.28, y: 0.66 },
  },
  {
    data: {
      kind: "thing", glyph: "物", title: "鉄と紙の文具",
      summary: "工場の端材から作られた定規と留め具。毎月わずかな数だけ棚に並ぶ。",
      venue: "つくし文具店", area: "国分寺", term: "10.01 — 10.31",
      handwritten: true, serial: 140,
    },
    punch: { x: 0.5, y: 0.24 },
  },
];

export default function DevExplore() {
  return (
    <main style={{
      minHeight: "100dvh", background: TICKET_DECK, color: WHITE,
      fontFamily: SANS, padding: `${SPACE.xl}px ${SPACE.lg}px ${SPACE.xxl}px`,
    }}>
      <h1 style={{
        margin: 0, fontFamily: LATIN, fontSize: TYPE.head, fontWeight: WEIGHT.bold,
        letterSpacing: TRACK.wide, lineHeight: LEAD.snug,
      }}>TICKET</h1>

      {/* 鋏痕の4つ */}
      <div style={{ display: "flex", gap: SPACE.lg, marginTop: SPACE.lg, marginBottom: SPACE.xl, alignItems: "baseline" }}>
        {ITEM_DOMAINS.map((d) => (
          <span key={d.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE.xs }}>
            <PunchGlyph domain={d.id} size={SPACE.xl} color={TICKET_DOMAIN_COLOR[d.id]} />
            <span style={{
              fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
              letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: WHITE,
            }}>{d.en}</span>
          </span>
        ))}
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: SPACE.xl,
      }}>
        {SAMPLES.map((s) => (
          <Ticket key={s.data.serial} data={s.data} punch={s.punch} deck={TICKET_DECK} />
        ))}
      </div>
    </main>
  );
}
