"use client";

import { useEffect, useRef, useState } from "react";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import {
  BG, INK, LATIN, MUTED, PAPER, SANS, SECOND, TICKET_H_PER_W, navHeightPx,
} from "@/lib/constants";
import { TicketStage } from "@/components/explore/TicketStage";
import { TICKET_SAMPLES } from "@/components/explore/samples";
import type { TicketData } from "@/components/explore/Ticket";

// ★★**確認用のタブ**（第70巡）。刷新した券と鋏を**実機で**見るためだけに在る。
//   Explore の刷新（提案 TODAY）が本物になったら、このファイルごと消す
//   ―― あわせて `lib/apps.ts` の `life-dev` の行、`lib/types.ts` の
//   `LifeTabId`、`components/TabIcons.tsx` の `ticket`、そして
//   `components/explore/samples/` を**まとめて**消すこと。
//
// 見るものは2つ … 「券」＝版面の見本帳（第71巡の主役）／「場」＝券と鋏の3D。

type Mode = "sheet" | "stage";

/** 見本帳の券の幅（画面の幅に対する割合）。★本番の提案と同じ寸法で見る。 */
const BOOK_W = 300 / 390;

/** 鋏の姿勢。★`/dev/explore` の「3D の場・定位置」と同じ値（ユーザー指定）。 */
const YAW = 80;
const TILT = 22;
/** 券の面からの隔たり（正＝手前）。 */
const TOOL_Z = 60;
/** 鋏の幅（画面の幅に対する割合）。★**図そのものの幅**。 */
const TOOL_W = 260 / 390;
/**
 * ★★構図は**見えている範囲**（＝タブバーより上）に対する割合で決める。
 * 第70巡は 300/390・券の中心 0.5・口 726/844 だったが、実機ではタブバーに
 * 被った（ユーザー報告）。**券を小さくし、全体を上へ**寄せた。
 */
const CARD_W = 0.66;
/** 券の中心を、見えている範囲のどこに置くか。★0.5 より上。 */
const CARD_MID = 0.44;
/** 鋏の口の場所（見えている範囲に対する割合）。 */
const NOSE = { x: 0.80, y: 0.80 };

/**
 * 写真の代わりの面。★外に取りに行かず、その場で作る（`app/dev/explore` と同じ）。
 *
 * ★★★第81巡に**調子を持たせた**。券の写真は**デュオトーン**（明暗だけにして、
 *   影を色・光を紙へ押し込む）なので、**明暗の幅がそのまま見え方になる**。
 *   前のダミーは 2色の放射グラデーションで、明度が 0.58〜0.98 に固まっていた
 *   （実測・中央値 0.70）ため、どのドメインでも「淡い色の靄」にしかならなかった。
 * ★★色は要らない（デュオトーンが最初に捨てる）。**要るのは暗部・中間・明部**。
 * ★`seed` で構図を振る（見本4枚が同じ絵にならないように）。
 */
/** ダミー写真の階調。★目盛りの外（写真の代わりの明暗であって、UI の色ではない） */
const TONE = { black: "#0B0B0B", mid: "#4A4A4A", pale: "#9C9C9C", wall: "#D8D8D8", ink: "#050505", ink2: "#0C0C0C", cast: "#0A0A0A", light: "#FFFFFF" };  // ★目盛りの外（ダミー写真の階調）

function fakePhoto(seed: number) {
  const r = (n: number) => (Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1;
  const at = (n: number, lo: number, hi: number) => Math.round(lo + Math.abs(r(n)) * (hi - lo));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400">'
    // 地 … 斜めに沈む（逆光の室内）。★**中央値を 0.45 前後**に置く ―― 明るすぎると
    //    デュオトーンの帯の上半分にしか乗らず、「淡い靄」にしかならない（第81巡に実測）。
    + '<defs><linearGradient id="g" x1="0.15" y1="0" x2="0.85" y2="1">'
    + '<stop offset="0" stop-color="' + TONE.black + '"/><stop offset="0.5" stop-color="' + TONE.mid + '"/>'
    + '<stop offset="1" stop-color="' + TONE.pale + '"/></linearGradient>'
    + '<radialGradient id="s" cx="' + at(1, 24, 74) + '%" cy="' + at(2, 14, 38) + '%" r="30%">'
    + '<stop offset="0" stop-color="' + TONE.light + '" stop-opacity="0.92"/>'
    + '<stop offset="1" stop-color="' + TONE.light + '" stop-opacity="0"/></radialGradient></defs>'
    + '<rect width="300" height="400" fill="url(#g)"/>'
    // 明るい面 … 光の当たった壁
    + '<rect x="' + at(3, 120, 210) + '" y="0" width="' + at(4, 54, 110) + '" height="400" fill="' + TONE.wall + '" opacity="0.55"/>'
    // 暗い塊 … 前景のもの
    + '<rect x="' + at(5, 6, 70) + '" y="' + at(6, 130, 230) + '" width="' + at(7, 46, 104) + '" height="270" fill="' + TONE.ink + '" opacity="0.92"/>'
    + '<rect x="' + at(8, 190, 250) + '" y="' + at(9, 30, 120) + '" width="46" height="300" fill="' + TONE.ink2 + '" opacity="0.8"/>'
    // 影の帯
    + '<rect x="0" y="' + at(10, 280, 340) + '" width="300" height="120" fill="' + TONE.cast + '" opacity="0.45"/>'
    // 光
    + '<rect width="300" height="400" fill="url(#s)"/></svg>';
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ★★★見本は**4枚**（第79巡）。**ドメインが4つ＝紙の色が4つ**なので、
//   1枚ずつ用意して見本帳で**巡らせる**（案4つ × ドメイン4つが1対1で並ぶ）。
//   ★★★第80巡から**紙は白1色**。変わるのは**大きな英語の色**だけ
//   （ユーザー指定「色は背景として使うのではなく、大きな文字のアクセントに」）。
const SAMPLES: TicketData[] = [
  {
    kind: "exhibition", glyph: "展", title: "見えないものたちの庭",   // タイケン＝朱
    summary: "音と光だけで構成された9つの部屋を、順路を決めずに歩く。図録は会期後半に出る。",
    venue: "東京都現代美術館", area: "清澄白河", date: "12.02", until: "03.16", soon: true,
    image: fakePhoto(1), serial: 143, // ★目盛りの外（ダミー画像の構図）
  },
  {
    kind: "place", glyph: "場", title: "崖の上の無人駅",              // バショ＝杏
    summary: "1日に4本しか止まらない。ホームの先が切れていて、そのまま海へ落ちている。",
    venue: "下灘駅", area: "伊予市", date: "通年",
    image: fakePhoto(2), serial: 7,   // ★目盛りの外（ダミー画像の構図）
  },
  {
    kind: "movie", glyph: "映", title: "夜だけが正しかった",           // ジョウホウ＝水
    summary: "同じ一日を、街灯の下からだけ撮り続けた記録映画。台詞は最後の8分にしかない。",
    venue: "ユーロスペース", area: "渋谷", date: "01.10", until: "02.07",
    image: fakePhoto(3), serial: 62,  // ★目盛りの外（ダミー画像の構図）
  },
  {
    kind: "thing", glyph: "物", title: "四角い土鍋",                   // モノ＝若草
    summary: "角があるぶん、火の当たり方が変わる。20年ぶんの型をそのまま使っている。",
    venue: "工房 かまど", area: "益子", date: "受注",
    image: fakePhoto(4), serial: 88,  // ★目盛りの外（ダミー画像の構図）
  },
];
/** 「場」（3D）が使う1枚。★券の色を1つに決めないと、鋏の見え方が比べられない。 */
const SAMPLE: TicketData = SAMPLES[0];

/** 「券」／「場」の切り替え。★開発用なので `Button` の語彙は借りない（消す部品）。 */
function ModeSwitch({ mode, onPick, style }: {
  mode: Mode; onPick: (m: Mode) => void; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      display: "flex", gap: SPACE.xs, padding: SPACE.xs,
      background: PAPER, borderRadius: RADIUS.pill, ...style,
    }}>
      {([["sheet", "券"], ["stage", "場"]] as const).map(([id, label]) => (
        <button key={id} type="button" onClick={() => onPick(id)} style={{
          appearance: "none", border: 0, cursor: "pointer",
          padding: `${SPACE.xs}px ${SPACE.md}px`, borderRadius: RADIUS.pill,
          background: mode === id ? INK : "transparent",
          color: mode === id ? PAPER : SECOND,
          fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold,
          lineHeight: LEAD.flat, letterSpacing: TRACK.normal,
        }}>{label}</button>
      ))}
    </div>
  );
}

/** 券の見本帳。★縦に1枚ずつ並べる（横スワイプはアプリの横送りと喧嘩する）。 */
function SampleBook() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xxl, paddingBottom: SPACE.xxl }}>
      {TICKET_SAMPLES.map((s, i) => (
        <section key={s.id} data-sample={s.id}
          style={{ display: "flex", flexDirection: "column", gap: SPACE.sm, alignItems: "flex-start" }}>
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span style={{
              fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold,
              lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: INK,
            }}>{s.id}　{s.name}</span>
            <span style={{
              fontFamily: SANS, fontSize: TYPE.micro, fontWeight: WEIGHT.bold,
              lineHeight: LEAD.flat, letterSpacing: TRACK.normal, color: MUTED,
            }}>{s.from}</span>
          </span>
          {/* ★案ごとにドメインを替える（紙は白のまま、大きな英語の色だけが変わる）。 */}
          <s.Render data={SAMPLES[i % SAMPLES.length]} punch={null} width={`${BOOK_W * 100}%`} />
        </section>
      ))}
    </div>
  );
}

/** 実機の数値（★直ったら消す）。 */
function Readout({ v }: { v: Record<string, number> }) {
  return (
    <span style={{
      position: "absolute", zIndex: 20, top: 0, left: 0,
      padding: `${SPACE.xs}px ${SPACE.sm}px`, background: PAPER, borderRadius: RADIUS.sm,
      fontFamily: LATIN, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
      lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: INK,
      whiteSpace: "pre",
    }}>{Object.entries(v).map(([k, n]) => `${k} ${n}`).join("\n")}</span>
  );
}

/**
 * 3D の場に載せる券。★**案が決まったらここの id を差し替える**。
 */
const STAGE_SAMPLE = "P1";
const Baseline = (TICKET_SAMPLES.find((s) => s.id === STAGE_SAMPLE) ?? TICKET_SAMPLES[0]).Render;

/** 券と鋏の3D。★**器そのものを画面にする**（`full-bleed` ＋ `100dvh`）。 */
function Stage() {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [nav, setNav] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
      // ★★★タブバーの高さは **`navHeightPx()`** から引く。これが唯一の出どころで、
      //   `GravityTab` の床も `DriftTab` の場もここを通している。
      //   第70巡は `.app-nav` の矩形を測っていた ―― `NAV_H` は
      //   `77px + max(4px, safe-area-bottom × 2.382 − 26px)` なので、
      //   Chromium では 81px、実機では 132px。**開発機では気づけない**ずれだった。
      setNav(Math.round(navHeightPx()));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ★器のはみ出しを内側へ寄せる（`DriftTab.fieldOf` と同じ作法）。
  //   `full-bleed` は親の左右 16px を打ち消すだけなので、普通は 0 になる。
  const inset = size ? Math.max(0, (size.w - (window.innerWidth || size.w)) / 2) : 0;
  const sw = size ? size.w - inset * 2 : 0;
  const cardW = Math.round(sw * CARD_W);
  const cardH = Math.round(cardW * TICKET_H_PER_W);
  /** ★タブバーの裏を数に入れない ―― 券も鋏も**見えている範囲**の中に置く。 */
  const view = size ? size.h - nav : 0;
  const cardY = Math.round(view * CARD_MID - cardH / 2);

  return (
    <div ref={box} className="full-bleed" style={{
      position: "relative", height: "100dvh", overflow: "clip", background: BG,
    }}>
      {size && (
        <TicketStage
          w={size.w} h={size.h}
          card={{
            x: inset + Math.round((sw - cardW) / 2), y: cardY,
            w: cardW, h: cardH,
            // ★第80巡から紙は白1色（券の色は大きな英語だけが持つ）。
            paper: PAPER,
          }}
          nipper={{
            nose: { x: inset + Math.round(sw * NOSE.x), y: Math.round(view * NOSE.y) },
            w: Math.round(sw * TOOL_W), open: 1, z: TOOL_Z, yaw: YAW, tilt: TILT,
          }}
        >
          <Baseline data={SAMPLE} punch={null} width={cardW} />
        </TicketStage>
      )}
      {size && (
        <Readout v={{
          器: size.w, 高: size.h, 窓: window.innerWidth, 窓高: window.innerHeight,
          帯: nav, 見: view, 券上: cardY, 券下: cardY + cardH, 帯上: size.h - nav,
        }} />
      )}
    </div>
  );
}

export function DevStageTab() {
  const [mode, setMode] = useState<Mode>("sheet");

  if (mode === "stage") {
    return (
      <div style={{ position: "relative" }}>
        <Stage />
        <ModeSwitch mode={mode} onPick={setMode} style={{
          position: "absolute", zIndex: 20, right: 0, top: "var(--pad-top)",
        }} />
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}>
      <ModeSwitch mode={mode} onPick={setMode} style={{ alignSelf: "flex-end" }} />
      <SampleBook />
    </div>
  );
}
