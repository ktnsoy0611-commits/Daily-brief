"use client";

import { SPACE, TYPE, TRACK, WEIGHT, LEAD } from "@/lib/tokens";
import {
  BG, ITEM_DOMAINS, LATIN, SANS, TICKET_DECK, TICKET_DOMAIN_COLOR, WHITE,
} from "@/lib/constants";
import { PunchGlyph } from "@/components/explore/PunchMark";
import { Nipper, NIPPER_ORIGIN } from "@/components/explore/Nipper";
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

// ★以下は目盛りの外（実寸の枠と図形の座標）。
const STAGE = { w: 390, h: 844 };   // iPhone の見えている範囲
const STAGE_TICKET = 300;           // 提案の券の幅（本番と同じ）
const STAGE_NIPPER = 250;           // 鋏の幅
// 鋏は**原点（頭と柄の継ぎ目）の位置**で置く。頭は券の下、ループの柄は画面の
// 右下へ伸びる（＝そこに手がある）。券には重ねない（掴んで寄せるのは操作）。
/** 鋲を画面のどこへ置くか。頭は券のすぐ下、柄は画面の下端へ抜ける。 */
const NIPPER_AT = { x: 238, y: 638 };
const NIPPER_S = STAGE_NIPPER / 620;
const NIPPER_LEFT = Math.round(NIPPER_AT.x - NIPPER_ORIGIN.x * NIPPER_S);
const NIPPER_TOP = Math.round(NIPPER_AT.y - NIPPER_ORIGIN.y * NIPPER_S);
/** ★一点透視。鋏の原点が画面の中央からどれだけ右に居るかで、見える側面が決まる。 */
const lean = (x: number) => (x - STAGE.w / 2) / (STAGE.w / 2);
const NIPPER_LEAN = lean(NIPPER_AT.x);
/** 入鋏の瞬間。頭の口を券の右の縁へ寄せ、鋏を券の**上に**重ねる。 */
const BITE_AT = { x: 364, y: 441 };
const BITE_LEFT = Math.round(BITE_AT.x - NIPPER_ORIGIN.x * NIPPER_S);
const BITE_TOP = Math.round(BITE_AT.y - NIPPER_ORIGIN.y * NIPPER_S);
/** 鋏痕が落ちる高さ。 */
const PUNCH_T = 0.72;
/** 入鋏の傾き。★垂直に入らなくてよい。 */
const PUNCH_TILT = -14;

const SAMPLES: { data: TicketData; punch?: TicketPunch }[] = [
  {
    data: {
      kind: "exhibition", glyph: "展", title: "見えないものたちの庭",
      summary: "音と光だけで構成された9つの部屋を、順路を決めずに歩く。図録は会期後半に出る。",
      venue: "東京都現代美術館", area: "清澄白河", date: "12.02", until: "03.16", soon: true,
      image: fakePhoto("#FFE58A", "#101B3A"), serial: 143, // ★目盛りの外（ダミー画像の色）
    },
    punch: { edge: "right", t: PUNCH_T, tilt: PUNCH_TILT },
  },
  {
    data: {
      kind: "book", glyph: "本", title: "建築家の日記",
      summary: "図面の余白に書かれた覚え書きだけを集めた一冊。生活の言葉で書かれている。",
      venue: "みすず書房", date: "09.20", until: "09.20", serial: 142,
    },
    punch: { edge: "bottom", t: 0.34, tilt: 11 },
  },
  {
    data: {
      kind: "food", glyph: "食", title: "灯りだけの喫茶室",
      summary: "照明の設計だけを変えた喫茶室。夕方から席の半分が暗くなる。",
      venue: "喫茶ソワレ分室", area: "蔵前", date: "09.01", until: "03.31",
      image: fakePhoto("#FFB27A", "#1A0E0A"), serial: 141, // ★目盛りの外（ダミー画像の色）
    },
    punch: { edge: "left", t: 0.55, tilt: 17 },
  },
  {
    data: {
      kind: "thing", glyph: "物", title: "鉄と紙の文具",
      summary: "工場の端材から作られた定規と留め具。毎月わずかな数だけ棚に並ぶ。",
      venue: "つくし文具店", area: "国分寺", date: "10.01", until: "10.31",
      handwritten: true, serial: 140,
    },
    punch: { edge: "top", t: 0.62, tilt: -8 },
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

      {/* ★実寸の構図。ここが本番と同じ大きさで、写真・ゴールと突き合わせる対象。 */}
      <div style={{ display: "flex", gap: SPACE.xl, alignItems: "flex-start" }}>
        {[false, true].map((biting) => (
          <div key={String(biting)} style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
            <Label>{biting ? "Today — 入鋏の瞬間" : "Today — 待機"}</Label>
            <div style={{
              position: "relative", width: STAGE.w, height: STAGE.h,
              background: BG, overflow: "hidden", flex: "none",
            }}>
              <span style={{ position: "absolute", left: SPACE.lg, top: SPACE.xl }}>
                <Ticket
                  data={SAMPLES[0].data}
                  punch={biting ? SAMPLES[0].punch : null}
                  deck={BG}
                  width={STAGE_TICKET}
                />
              </span>
              {/* ★目盛りの外（図形の配置） */}
              <span style={{
                position: "absolute",
                left: biting ? BITE_LEFT : NIPPER_LEFT,
                top: biting ? BITE_TOP : NIPPER_TOP,
                width: STAGE_NIPPER,
              }}>
                <Nipper
                  open={biting ? 0 : 1}
                  closing={biting}
                  domain="experience"
                  lean={biting ? lean(BITE_AT.x) : NIPPER_LEAN}
                />
              </span>
            </div>
          </div>
        ))}
      </div>

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
        {/* ★一点透視の確認。左へ置くと右面、右へ置くと左面が見える。 */}
        <div style={{ display: "flex", gap: SPACE.xl, alignItems: "flex-start" }}>
          <span style={{ width: 220 }}><Nipper open={1} lean={-1} /></span>
          <span style={{ width: 220 }}><Nipper open={1} lean={0} /></span>
          <span style={{ width: 220 }}><Nipper open={1} lean={1} /></span>
          <span style={{ width: 220 }}><Nipper open={0} closing lean={0.6} /></span>
        </div>
      </div>

      {/* 券 */}
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <Label>Tickets</Label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.xl }}>
          {SAMPLES.map((s) => (
            <Ticket key={s.data.serial} data={s.data} punch={s.punch} deck={TICKET_DECK} width={STAGE_TICKET} />
          ))}
        </div>
      </div>
    </main>
  );
}
