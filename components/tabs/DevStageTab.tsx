"use client";

import { useEffect, useRef, useState } from "react";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import {
  BG, INK, KIND_DOMAIN, LATIN, MUTED, PAPER, SANS, SECOND, TICKET_H_PER_W, navHeightPx,
} from "@/lib/constants";
import { DOMAIN_COLOR } from "@/lib/palette";
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

/** 写真の代わりの面。★外に取りに行かず、その場で作る（`app/dev/explore` と同じ）。 */
function fakePhoto(a: string, b: string) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="240">'
    + '<defs><radialGradient id="g" cx="28%" cy="18%" r="88%">'
    + `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>`
    + '</radialGradient></defs><rect width="300" height="240" fill="url(#g)"/>'
    + `<rect x="30" y="120" width="42" height="120" fill="${a}" opacity="0.5"/>`
    + `<rect x="196" y="30" width="30" height="210" fill="${b}" opacity="0.45"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 見本の1枚。★本番はここが生成された券になる。
const SAMPLE: TicketData = {
  kind: "exhibition", glyph: "展", title: "見えないものたちの庭",
  summary: "音と光だけで構成された9つの部屋を、順路を決めずに歩く。図録は会期後半に出る。",
  venue: "東京都現代美術館", area: "清澄白河", date: "12.02", until: "03.16", soon: true,
  image: fakePhoto("#FFE58A", "#101B3A"), serial: 143, // ★目盛りの外（ダミー画像の色）
};

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
      {TICKET_SAMPLES.map((s) => (
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
          <s.Render data={SAMPLE} punch={null} width={`${BOOK_W * 100}%`} />
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
const STAGE_SAMPLE = "N1";
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
            paper: DOMAIN_COLOR[KIND_DOMAIN[SAMPLE.kind]],
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
