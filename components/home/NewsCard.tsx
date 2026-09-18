"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { groundOf } from "@/components/AppBackdrop";
import { INK, PAPER, SANS, SOFT_SHADOW_LG } from "@/lib/constants";
import { EASE_SETTLE, T_ITEM, easeAt, ms } from "@/lib/motion";
import { bodyInkOn } from "@/lib/palette";
import { rubber } from "@/lib/spring";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";

// ★★★**ニュースのピルを引き出すと、角丸の四角に広がって詳細が出る**
//   （2026-09-19・第123巡にユーザー指定「**ニュースもピルにしてください。そして
//   引き出した時にそのピルが画面上で広がって角丸の四角になって展開し、ニュースの
//   詳細が見れるようにして**」）。
//
// ★★★**絵は「1枚の箱」だけ**（`lib/cardMorph.ts` のような形の補間は要らない）――
//   両端が**どちらも角丸の四角**（ピル ＝ 角丸が高さの半分の四角）なので、
//   **矩形と角丸を lerp すれば済む**。形の点の列を作る理由が無い。
// ★★★**`createPortal` で `document.body` 直下へ**（第119巡に踏んだ）――
//   タブの列は `transform` を持つので、**独立した重なりの文脈**を作る。
//   その中に置くと `zIndex` をいくつにしてもタブバーの下へ潜る。
// ★★★**`--nav-h` を読まない**（同）。画面いっぱいに置いて、中身の余白で逃がす。
//
// ★★**進みは1つ（`t`）** … 0 ＝ 帯のピルそのもの／1 ＝ 画面の角丸四角。
//   指で引いているあいだは**指が `t` を動かし**、離したら**曲線で 0 か 1 へ**。
//   ★曲線は `easeAt(EASE_SETTLE, t)`（`lib/motion.ts`。**写経しない**）。

/** 引き切ったと見なす距離（px）。★目盛りの外（手ざわり）。 */
const PULL_OPEN = 64;
/** ★これを越えて離したら開く（越えなければ戻る）。 */
const PULL_TRIP = 0.45;
/** ★開いた札の高さの上限（画面の高さに対する割合）。★目盛りの外（版面の寸法）。 */
const CARD_MAX = 0.6;
/** ★ピルの輪郭の太さ（`components/home/Band.tsx` の `PILL_EDGE` と同じ引き方）。 */
const NEWS_EDGE = 1;

export interface NewsDetail {
  id: string;
  title: string;
  source: string;
  link: string;
  at: string;
}

/** ピルの画面上の矩形（`getBoundingClientRect` そのもの）。 */
export interface NewsFrom { x: number; y: number; w: number; h: number }

/** ★2つの矩形を混ぜる（`t` は 0〜1）。 */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function NewsCard({ item, from, grab, autoOpen, onClose }: {
  item: NewsDetail;
  from: NewsFrom;
  /**
   * ★★**指が引いている距離（px）。`null` ＝ もう指は離れている。**
   * 引いているあいだは `t` を指が決め、離したら曲線が引き取る。
   */
  grab: number | null;
  /** ★★**引かずに開いた**（ただのタップ）。★指の距離は見ずに、曲線で開くだけ。 */
  autoOpen?: boolean;
  onClose: () => void;
}) {
  const [t, setT] = useState(0);
  const raf = useRef(0);
  const tRef = useRef(0);
  tRef.current = t;
  /** ★★開き切ったか（中身を触れるようにするのはここから）。 */
  const open = t >= 1;

  /** ★曲線で `to` まで運ぶ。**着いたら `done`**。 */
  const run = useCallback((to: number, done?: () => void) => {
    cancelAnimationFrame(raf.current);
    const from0 = tRef.current;
    const t0 = performance.now();
    const span = ms(T_ITEM);
    const step = () => {
      const u = Math.min(1, (performance.now() - t0) / span);
      const v = from0 + (to - from0) * easeAt(EASE_SETTLE, u);
      setT(v);
      if (u < 1) raf.current = requestAnimationFrame(step);
      else done?.();
    };
    raf.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // ★★指が引いているあいだ … **ゴムの手ざわり**（`rubber`。`lib/spring.ts` の1本）。
  //   ★離した瞬間（`grab` が `null` になる）に、**越えていれば開き、そうでなければ戻る**。
  const wasGrab = useRef<number | null>(grab);
  useLayoutEffect(() => {
    if (autoOpen) { if (tRef.current < 1) run(1); return; }
    if (grab !== null) {
      cancelAnimationFrame(raf.current);
      setT(Math.min(1, rubber(Math.max(0, grab) / PULL_OPEN, 1.2)));
    } else if (wasGrab.current !== null) {
      if (tRef.current >= PULL_TRIP) run(1);
      else run(0, onClose);
    }
    wasGrab.current = grab;
  }, [grab, autoOpen, run, onClose]);

  const vw = typeof window === "undefined" ? 390 : window.innerWidth;
  const vh = typeof window === "undefined" ? 844 : window.innerHeight;
  const ground = groundOf("home");
  const ink = bodyInkOn(ground);

  // ★★★**開いた札の高さは「中身の高さ」**（2026-09-19・第123巡）。
  //   ★★★**決め打ちの高さにしない** ―― ニュースは**題と出典しか無い**ので、
  //     画面の半分を決め打ちで取ると**下半分が空っぽの札**になる（実測で確認）。
  //   ★★**測るのは「開いたときの幅」で組んだ写し**（`measRef`）―― 本物は
  //     開く途中でピルの幅しか無いので、そこで測ると折り返しが違って嘘になる。
  const measRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0);
  const toW = vw - SPACE.lg * 2;
  useLayoutEffect(() => { setFit(measRef.current?.offsetHeight ?? 0); }, []);
  const toH = Math.max(from.h, Math.min(vh * CARD_MAX, fit + SPACE.xl * 2));
  const to = { x: SPACE.lg, y: (vh - toH) / 2, w: toW, h: toH };

  // ★★★**ここで曲線を掛けない**（2026-09-19・第123巡に実測して直した）――
  //   `t` は**指が直に動かす値**か、`run()` が**すでに曲線を通して**作った値。
  //   ここでもう一度掛けると**二重に効く**（実測 … 6px 引いただけで 45% 開いた
  //   ―― `EASE_SETTLE` は出だしの傾きが大きいので、0.094 が 0.45 になる）。
  const e = Math.max(0, Math.min(1, t));
  const box = {
    x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e),
    w: lerp(from.w, to.w, e), h: lerp(from.h, to.h, e),
  };
  // ★★角丸は「ピル（高さの半分）」から `RADIUS.sheet` へ。
  const rad = lerp(from.h / 2, RADIUS.sheet, e);

  /** ★札の中身（**本物と、高さを測る写しが同じものを読む**）。 */
  const body = (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
      <span style={{
        fontFamily: SANS, fontSize: TYPE.nano, fontWeight: WEIGHT.bold,
        letterSpacing: TRACK.wide, lineHeight: LEAD.flat, color: ink, opacity: 0.62,
      }}>{[item.source, whenText(item.at)].filter(Boolean).join("  ")}</span>
      <span style={{
        fontFamily: SANS, fontSize: TYPE.head, fontWeight: WEIGHT.bold,
        letterSpacing: TRACK.normal, lineHeight: LEAD.snug, color: ink,
      }}>{item.title}</span>
      {item.link && (
        <span style={{
          marginTop: SPACE.sm,
          fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold,
          letterSpacing: TRACK.normal, lineHeight: LEAD.snug,
          color: bodyInkOn(INK), background: INK,
          borderRadius: RADIUS.pill, padding: `${SPACE.md}px ${SPACE.xl}px`,
          alignSelf: "flex-start",
        }}>記事を読む</span>
      )}
    </div>
  );

  const view = (
    <div
      aria-hidden={!open}
      data-news-card
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {/* ★★高さを測るための写し（**見えない・触れない**）。 */}
      <div
        ref={measRef} aria-hidden
        style={{
          position: "absolute", left: 0, top: 0, width: toW - SPACE.xl * 2,
          visibility: "hidden", pointerEvents: "none",
        }}
      >{body}</div>
      {/* ★地を覆う幕。**開き切るまでは薄い**（後ろの帯が見えていてほしい）。 */}
      <div
        onClick={() => run(0, onClose)}
        style={{
          position: "absolute", inset: 0, background: INK,
          opacity: e * 0.5, transition: "none",
        }}
      />
      <div data-news-sheet style={{
        position: "absolute",
        left: box.x, top: box.y, width: box.w, height: box.h,
        borderRadius: rad, background: PAPER, overflow: "hidden",
        padding: `${SPACE.xl}px ${SPACE.xl}px`,
        // ★★**縁を引かない**（`design.md`。押せるものにだけ縁）。面と影で浮かせる。
        //   ★影は既存の1つ（`SOFT_SHADOW_LG`）。**新しい影を作らない。**
        boxShadow: SOFT_SHADOW_LG,
      }}>
        {/* ★★**中身は開くほど現れる**（版面が崩れたまま見えない）。
            ★★**幅は開いたときの幅で固定**（途中で折り返しが変わらない）。 */}
        <div style={{ width: toW - SPACE.xl * 2, opacity: Math.max(0, (e - 0.45) / 0.55) }}>
          {open && item.link
            ? <a href={item.link} target="_blank" rel="noreferrer"
                style={{ textDecoration: "none", color: "inherit" }}>{body}</a>
            : body}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(view, document.body);
}

/** ★「3時間前」。★出どころが空なら何も出さない（嘘を書かない）。 */
function whenText(at: string): string {
  const ts = Date.parse(at);
  if (Number.isNaN(ts)) return "";
  const min = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (min < 60) return `${min}分前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}時間前`;
  return `${Math.round(hr / 24)}日前`;
}

/**
 * ★★★**帯の3段目に流れる、ニュースのピル**（2026-09-19・第123巡）。
 *
 * ★★**見た目は「輪郭だけのピル」**（`lib/homeBand.ts` の `isOutlined`）――
 *   **面を持たない**ので、上の2段（自分に関わるもの）より一段 静かに見える。
 * ★★★**下へ引くと開く**（ユーザー指定）。★★**ただのタップでも開く** ――
 *   帯は流れているので、「引く」だけを入口にすると取りこぼす。
 * ★★**縦の指を段に取られない**ように `touchAction: "none"`（段は `pan-y`）。
 * ★★★**後始末は3重**（`lostpointercapture` ／ unmount ／ `window` の `pointerup`）
 *   ―― 帯のピル（`components/home/Band.tsx`）で同じ罠を3度踏んでいる。
 */
export function NewsPill({ item, h }: { item: NewsDetail; h: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<{ from: NewsFrom; tap: boolean } | null>(null);
  const [grab, setGrab] = useState<number | null>(null);
  const hold = useRef<{ id: number; y: number; moved: boolean } | null>(null);
  const ground = groundOf("home");
  const ink = bodyInkOn(ground);

  /** ★指を離した（引き切っていれば `NewsCard` が開き、足りなければ閉じる）。 */
  const end = useCallback(() => {
    const g = hold.current;
    hold.current = null;
    if (!g) return;
    // ★★**動かさずに離した ＝ タップ**。札がまだ無ければ出して、曲線で開く。
    if (!g.moved) { openTap(); return; }
    setGrab(null);
    function openTap() {
      const r = ref.current?.getBoundingClientRect();
      if (r) setCard({ from: { x: r.x, y: r.y, w: r.width, h: r.height }, tap: true });
    }
  }, []);

  useEffect(() => {
    const up = () => end();
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointerup", up); hold.current = null; };
  }, [end]);

  const onDown = (e: React.PointerEvent) => {
    if (card) return;
    hold.current = { id: e.pointerId, y: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const g = hold.current;
    if (!g || g.id !== e.pointerId) return;
    const dy = e.clientY - g.y;
    // ★★**4px 引くまでは「まだ引いていない」**（指の震えで札を出さない）。
    if (!g.moved && dy < 4) return;
    if (!g.moved) {
      g.moved = true;
      const r = ref.current?.getBoundingClientRect();
      if (r) setCard({ from: { x: r.x, y: r.y, w: r.width, h: r.height }, tap: false });
    }
    setGrab(Math.max(0, dy));
  };

  return (
    <>
      <div
        ref={ref}
        data-news-pill={item.id}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => end()}
        onPointerCancel={() => end()}
        onLostPointerCapture={() => end()}
        style={{
          display: "flex", alignItems: "center", flexShrink: 0,
          height: h, borderRadius: RADIUS.pill,
          padding: `0 ${SPACE.xl}px`, maxWidth: "84vw",
          // ★地と同じ色で塗る（後ろを落ちてくる図形が透けない）。
          background: ground, border: `${NEWS_EDGE}px solid ${ink}`,
          touchAction: "none", pointerEvents: "auto",
          // ★引いているあいだは元のピルを消す（札と二重に見えない）。
          opacity: card ? 0 : 1,
        }}
      >
        <span style={{
          fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.text,
          letterSpacing: TRACK.normal, lineHeight: LEAD.snug, color: ink,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{item.title}</span>
      </div>
      {card && (
        <NewsCard
          item={item} from={card.from}
          grab={card.tap ? null : grab} autoOpen={card.tap}
          onClose={() => { setCard(null); setGrab(null); }}
        />
      )}
    </>
  );
}
