"use client";

import { SPACE, TYPE, TRACK, WEIGHT, LEAD } from "@/lib/tokens";
import {
  ITEM_DOMAINS, LATIN, SANS, TICKET_DECK, TICKET_DOMAIN_COLOR, WHITE,
} from "@/lib/constants";
import { PunchGlyph } from "@/components/explore/PunchMark";
import { Nipper } from "@/components/explore/Nipper";
import { Ticket, type TicketData, type TicketPunch } from "@/components/explore/Ticket";

// ★開発用。券・切り欠き・鋏を並べて目で確かめるだけの画面。
//   本番の導線からは辿れない（/dev/explore を直接開く）。完成したら撤去する。

// 写真の代わりの面。外部に取りに行かず、その場で作る。
function fakePhoto(a: string, b: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="240">`
    + `<defs><radialGradient id="g" cx="28%" cy="18%" r="88%">`
    + `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>`
    + `</radialGradient></defs>`
    + `<rect width="300" height="240" fill="url(#g)"/>`
    + `<rect x="30" y="120" width="42" height="120" fill="${a}" opacity="0.5"/>`
    + `<rect x="196" y="30" width="30" height="210" fill="${b}" opacity="0.45"/>`
    + `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SAMPLES: { data: TicketData; punch?: TicketPunch }[] = [
  {
    data: {
      kind: "exhibition", glyph: "展", title: "見えないものたちの庭",
      summary: "音と光だけで構成された9つの部屋を、順路を決めずに歩く。図録は会期後半に出る。",
      venue: "東京都現代美術館", area: "清澄白河", date: "12.02", until: "03.16", soon: true,
      image: fakePhoto("#FFE58A", "#101B3A"), serial: 143, // ★目盛りの外（ダミー画像の色）
    },
    punch: { edge: "right", t: 0.42 },
  },
  {
    data: {
      kind: "book", glyph: "本", title: "建築家の日記",
      summary: "図面の余白に書かれた覚え書きだけを集めた一冊。生活の言葉で書かれている。",
      venue: "みすず書房", date: "09.20", until: "09.20", serial: 142,
    },
    punch: { edge: "bottom", t: 0.66 },
  },
  {
    data: {
      kind: "food", glyph: "食", title: "灯りだけの喫茶室",
      summary: "照明の設計だけを変えた喫茶室。夕方から席の半分が暗くなる。",
      venue: "喫茶ソワレ分室", area: "蔵前", date: "09.01", until: "03.31",
      image: fakePhoto("#FFB27A", "#1A0E0A"), serial: 141, // ★目盛りの外（ダミー画像の色）
    },
    punch: { edge: "left", t: 0.3 },
  },
  {
    data: {
      kind: "thing", glyph: "物", title: "鉄と紙の文具",
      summary: "工場の端材から作られた定規と留め具。毎月わずかな数だけ棚に並ぶ。",
      venue: "つくし文具店", area: "国分寺", date: "10.01", until: "10.31",
      handwritten: true, serial: 140,
    },
    punch: { edge: "top", t: 0.72 },
  },
];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      margin: 0, fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: WEIGHT.bold,
      letterSpacing: TRACK.wide, lineHeight: LEAD.flat, color: WHITE, opacity: 0.6,
      textTransform: "uppercase",
    }}>{children}</h2>
  );
}

export default function DevExplore() {
  return (
    <main style={{
      minHeight: "100dvh", background: TICKET_DECK, color: WHITE,
      fontFamily: SANS, padding: `${SPACE.xl}px ${SPACE.lg}px ${SPACE.xxl}px`,
      display: "flex", flexDirection: "column", gap: SPACE.xl,
    }}>
      <h1 style={{
        margin: 0, fontFamily: LATIN, fontSize: TYPE.head, fontWeight: WEIGHT.bold,
        letterSpacing: TRACK.wide, lineHeight: LEAD.snug,
      }}>TICKET</h1>

      {/* 切り欠きの4つ */}
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <Label>Punch marks</Label>
        <div style={{ display: "flex", gap: SPACE.lg, alignItems: "flex-start" }}>
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
      </div>

      {/* 鋏 */}
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <Label>Nipper</Label>
        <div style={{ display: "flex", gap: SPACE.xl, alignItems: "flex-start" }}>
          <span style={{ width: 200 }}><Nipper open={1} /></span>
          <span style={{ width: 200 }}><Nipper open={0} closing /></span>
        </div>
      </div>

      {/* 券 */}
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <Label>Tickets</Label>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: SPACE.xl,
        }}>
          {SAMPLES.map((s) => (
            <Ticket key={s.data.serial} data={s.data} punch={s.punch} deck={TICKET_DECK} />
          ))}
        </div>
      </div>
    </main>
  );
}
