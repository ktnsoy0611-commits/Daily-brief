"use client";

import { SPACE, TYPE, TRACK, WEIGHT, LEAD } from "@/lib/tokens";
import {
  BG, INK, ITEM_DOMAINS, KIND_DOMAIN, LATIN, SANS, TICKET_DECK, TICKET_H_PER_W, WHITE,
} from "@/lib/constants";
import { DOMAIN_COLOR } from "@/lib/palette";
import { PunchGlyph } from "@/components/explore/PunchMark";
import { Nipper, NIPPER_ASPECT, NIPPER_NOSE } from "@/components/explore/Nipper";
import { NipperTriView } from "@/components/explore/NipperViews";
import { Ticket, type TicketData, type TicketPunch } from "@/components/explore/Ticket";
import { TicketStage } from "@/components/explore/TicketStage";

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
const STAGE_NIPPER = 300;           // 鋏の幅
/** 鋏の器の高さ。★`NIPPER_NOSE` は器の左上からの**割合**なので、これが要る。 */
const NIPPER_H = STAGE_NIPPER / NIPPER_ASPECT;
/** ★カメラの高さ（画面と同じ px の尺度）。消失点は画面の中心。 */
// ★目標画像では奥の腕が手前から**幅の3割ほど**ずれて見える。待機位置で
// その見え方になるようカメラの高さを合わせた。仕組みは変えていない。
const CAM = 380;
/** 高さ1あたりの画面上のずれ。**中心から離れているほど、高いところが外へ逃げる**。 */
const awayAt = (x: number, y: number) => ({
  x: (x - STAGE.w / 2) / CAM,
  y: (y - STAGE.h / 2) / CAM,
});
/** 先端（口）を画面のどこへ置くかで、鋏の器の場所が決まる。 */
const originFor = (nose: { x: number; y: number }) => {
  const left = nose.x - NIPPER_NOSE.x * STAGE_NIPPER;
  const top = nose.y - NIPPER_NOSE.y * NIPPER_H;
  return {
    left: Math.round(left), top: Math.round(top),
    // パースは**器の中心**がどこにあるかで決まる。
    at: { x: left + STAGE_NIPPER / 2, y: top + NIPPER_H / 2 },
  };
};
/** 待機 … 口は券のすぐ下。柄は画面の右下へ抜ける（そこに手がある）。 */
const IDLE = originFor({ x: 314, y: 556 });
/** 入鋏 … 口を券の右の縁の鋏痕へ合わせる。 */
const BITE = originFor({ x: 322, y: 372 });

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

/**
 * ★3D の場に置く券。**ステージのど真ん中**に置く ―― カメラの焦点（＝消失点）は
 * 画面の中心なので、こうすると「券の真正面から見ている」ことになる。
 */
const CARD_H = Math.round(STAGE_TICKET * TICKET_H_PER_W);
const CARD = {
  x: Math.round((STAGE.w - STAGE_TICKET) / 2),
  y: Math.round((STAGE.h - CARD_H) / 2),
  w: STAGE_TICKET, h: CARD_H,
  paper: DOMAIN_COLOR[KIND_DOMAIN[SAMPLES[0].data.kind]],
};
/** 3D の場では**図そのものの幅**を渡す（`STAGE_NIPPER` は余白こみの器の幅）。 */
const STAGE_NIPPER_FIG = 260;
/**
 * ★鋏の**定位置は券の右下で、券に被らない**（第70巡・ユーザー確定）。
 * 頭が画面の中に入り、**柄は下の画面外へ抜ける**。頭は上・柄は下のまま、
 * **平らな面だけを左（券のほう）へ回す**（`yaw`）。★80° はユーザー指定。
 */
const NIPPER_YAW = 80;      // ★ユーザー指定（第70巡）
const NIPPER_TILT = 22;     // 頭が左へ倒れる角
const STAGE_SHOTS = [
  { label: "定位置（券に被らない右下）",
    nipper: { nose: { x: 312, y: 726 }, w: STAGE_NIPPER_FIG, open: 1, z: 60,
      yaw: NIPPER_YAW, tilt: NIPPER_TILT } },
  { label: "券の縁へ寄せたところ",
    nipper: { nose: { x: 330, y: 470 }, w: STAGE_NIPPER_FIG, open: 0, closing: true, z: 0,
      yaw: NIPPER_YAW, tilt: NIPPER_TILT } },
];

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
              <div style={{
                position: "absolute",
                left: biting ? BITE.left : IDLE.left,
                top: biting ? BITE.top : IDLE.top,
                width: STAGE_NIPPER,
              }}>
                <Nipper
                  open={biting ? 0 : 1}
                  closing={biting}
                  away={awayAt(biting ? BITE.at.x : IDLE.at.x, biting ? BITE.at.y : IDLE.at.y)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ★★3D の場。券と鋏が**同じ空間**に居る（束・小口・影つき）。 */}
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <Label>Today — 3D の場（券1枚と鋏）</Label>
        <div style={{ display: "flex", gap: SPACE.xl, alignItems: "flex-start" }}>
          {STAGE_SHOTS.map((shot) => (
            <div key={shot.label} style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
              <Label>{shot.label}</Label>
              <div style={{ background: BG, flex: "none" }}>
                <TicketStage w={STAGE.w} h={STAGE.h} card={CARD} nipper={shot.nipper}>
                  <Ticket data={SAMPLES[0].data} punch={null} deck={BG} width={STAGE_TICKET} />
                </TicketStage>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 切り欠きの4つ */}
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <Label>Punch marks</Label>
        <div style={{ display: "flex", gap: SPACE.lg, alignItems: "flex-start" }}>
          {ITEM_DOMAINS.map((d) => (
            <span key={d.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE.xs }}>
              <PunchGlyph domain={d.id} size={SPACE.xl} color={DOMAIN_COLOR[d.id]} />
              <span style={{
                fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
                letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: WHITE,
              }}>{d.en}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ★★三面図。形を言葉で詰めるための検証用（本番には出ない）。同じ縮尺で並ぶ。 */}
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <Label>Nipper — 三面図（同じ縮尺）</Label>
        <div style={{ display: "flex", gap: SPACE.xl, alignItems: "flex-end", background: BG,
          padding: `${SPACE.lg}px ${SPACE.xl}px` }}>
          <NipperTriView label={(v) => (
            <span style={{
              display: "block", fontFamily: LATIN, fontSize: TYPE.micro, fontWeight: WEIGHT.bold,
              letterSpacing: TRACK.caps, lineHeight: LEAD.flat, color: INK,
              textTransform: "uppercase", paddingBottom: SPACE.xs,
            }}>{v.id} — {v.ja}</span>
          )} />
        </div>
      </div>

      {/* 鋏 */}
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <Label>Nipper</Label>
        {/* ★★参考画像と同じ画角（ほぼ真上から・わずかに右）。**形の合否はここで見る**。
            四隅の4体は「掴んで動かすとパースが変わる」ことの確認用で、画角が違う。 */}
        <div style={{ width: 300 }}>
          <Nipper open={1} away={{ x: 0.22, y: 0.62 }} />
        </div>
        {/* ★一点透視の確認。左へ置くと右面、右へ置くと左面が見える。 */}
        <div style={{ display: "flex", gap: SPACE.xl, alignItems: "flex-start" }}>
          {/* ★掴んで動かしたときの検証。画面のどこに置いたかでパースが変わる。 */}
          {[[60, 180], [330, 180], [60, 720], [330, 720]].map(([x, y]) => (
            <div key={`${x}-${y}`} style={{ width: 176 }}>
              <Nipper open={1} away={awayAt(x, y)} />
            </div>
          ))}
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
