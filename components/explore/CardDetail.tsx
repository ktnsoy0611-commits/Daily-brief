"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SANS } from "@/lib/constants";
import type { CardShape } from "@/lib/cardShape";
import { cardMorph } from "@/lib/cardMorph";
import { img } from "@/lib/helpers";
import { EASE_SETTLE, T_IN, T_OUT, easeAt, ms } from "@/lib/motion";
import { bodyInkOn } from "@/lib/palette";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
import type { BriefCard } from "@/lib/types";

// ★★★**提案カードの詳細の画面**（2026-09-17・第119巡／**第120巡に作り直し**）。
//
// > 「**写真部分をタップすると、マスクの枠だけが回りながらアニメーションし、画像の
// > 表示領域が大きくなっていきます。広がるのですが最終的に、画像の周りに色のついた
// > ベゼルが残るようにし、画面的には画面全体そのジャンルのベタ塗りに、角丸の四角で
// > マスクされた写真が画面上半分より大きいくらいに大きく表示され、下に詳細文が
// > かかるような形です。（…）画像を大きくしすぎると粗が目立つのでそれの対策でも
// > ある変更です**」
//
// ★★★**第119巡の「画面いっぱいへ広げる」はやめた**（ユーザー撤回）。**復活させない。**
//   ★理由は版面ではなく**素材** ―― 元の写真は `img()` 越しの 1000px 級なので、
//     390×844 の実機（dpr 3）で全画面にすると**足りない**。ベゼルを残すと
//     写真は 358×490 ＝ デバイス 1074×1470 で、いま取っている大きさと釣り合う。
//
// ★★★**変形は `lib/cardMorph.ts` の1か所**（札の形 → 角丸四角）。
//   ★★**毎フレーム `d` を書く** ―― CSS の `clip-path` の補間には頼らない。
//   ★★**曲線は `EASE_SETTLE`**（`lib/motion.ts` の `easeAt`）。**曲線を写経しない。**
//   ★★**回るのは枠だけ。写真は回らない**（ユーザーの言葉どおり）。写真の器は
//     出発の正方形から行き先の角丸四角へ**まっすぐ育つ**だけ。
//
// ★★★**着いたら「ただの角丸四角」に戻す**（`landed`）―― 最後のフレームの
//   `clip-path` は行き先の角丸四角そのものなので、**`border-radius` の `<img>` と
//   入れ替えても継ぎ目が出ない**。入れ替えたあとは**普通に流れる版面**なので、
//   指で送れば写真ごと上へ抜ける（`position: fixed` のままだと写真だけ残る）。
//
// ★★★**`createPortal` で `document.body` 直下へ**（第119巡に踏んだ）――
//   `AppShell` の列は `transform` で独立した重なりの文脈を作るので、
//   タブの中に置くと `zIndex` をいくつにしてもタブバーの下に潜る。
// ★★★**`--nav-h` を読まない**（列にしか無い。未定義の変数を `calc()` に入れると
//   **`padding` の一括指定ごと無効になり四方が 0**）。
//
// ★★**本文は `BriefCard.detail`**（`lib/briefPipeline.ts` の `SYSTEM_ENRICH_BODY`
//   が**スクレイピングした個別ページ本文から**書いている）。無い古いカードは `body`。

/** ★写真のまわりに残る色のベゼル。★上と左右で同じ。 */
const BEZEL = SPACE.lg;
/** ★写真の高さ（画面に対する割合）。「上半分より大きいくらい」。★目盛りの外（版面）。 */
const PHOTO_VH = 0.58;
/** ★本文の下の余り（画面の下端の安全域に足す）。★`SPACE.xxl` の2つぶん。 */
const FOOT = SPACE.xxl + SPACE.xxl;

interface Box { x: number; y: number; w: number; h: number }

export function CardDetail({ card, shape, face, from, onClose }: {
  card: BriefCard;
  shape: CardShape;
  /** そのジャンルの色（画面いっぱいのベタ塗り ＝ 写真のベゼル）。 */
  face: string;
  /** 押した写真の画面上の矩形（ここから育つ）。 */
  from: Box;
  onClose: () => void;
}) {
  const clipId = useId().replace(/:/g, "");
  const pathRef = useRef<SVGPathElement>(null);
  const holeRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  /** 変形が終わって、ただの角丸四角になったか。 */
  const [landed, setLanded] = useState(false);
  /** 閉じている最中（本文を先に消す）。 */
  const [going, setGoing] = useState(false);

  // ★★**行き先の矩形は1か所で出す**（絵も版面の空きも同じ数を読む）。
  const vw = typeof window === "undefined" ? 0 : window.innerWidth;
  const vh = typeof window === "undefined" ? 0 : window.innerHeight;
  const to: Box = { x: BEZEL, y: BEZEL, w: vw - BEZEL * 2, h: Math.round(vh * PHOTO_VH) };
  // ★★このジェスチャのあいだ動かない2つ（rAF の中から読むので ref で凍らせる）。
  const toRef = useRef(to);
  const fromRef = useRef(from);

  const ink = bodyInkOn(face);
  const body = (card.detail ?? "").trim() || card.body;
  const photo = card.images?.[0];

  /**
   * ★★★**開くのも閉じるのも同じ1本**（`dir` が向きだけ変える）。**2度書かない。**
   * ★★**出発の正方形はいつも「押した写真」**。行き先 `box` だけが変わる ――
   *   閉じるときは**いま画面に在る写真の矩形**（指で送ったあとでも繋がる）。
   */
  const run = useRef((dir: 1 | -1, box: Box, from0: Box, done: () => void) => {
    const morph = cardMorph(shape,
      { cx: from0.x + from0.w / 2, cy: from0.y + from0.h / 2, size: from0.w },
      { cx: box.x + box.w / 2, cy: box.y + box.h / 2, w: box.w, h: box.h, r: RADIUS.sheet });
    const span = ms(dir > 0 ? T_IN : T_OUT);
    const draw = (p: number) => {
      pathRef.current?.setAttribute("d", morph(p));
      const hole = holeRef.current;
      if (hole) {
        // ★★写真の器は**回らずにまっすぐ育つ**（回るのは枠だけ）。
        hole.style.left = `${from0.x + (box.x - from0.x) * p}px`;
        hole.style.top = `${from0.y + (box.y - from0.y) * p}px`;
        hole.style.width = `${from0.w + (box.w - from0.w) * p}px`;
        hole.style.height = `${from0.h + (box.h - from0.h) * p}px`;
      }
      if (bgRef.current) bgRef.current.style.opacity = String(p);
    };
    // ★★★**最初のフレームを「今すぐ」書く**（2026-09-18・第120巡）――
    //   閉じるときは**版面の写真を外した直後**なので、rAF を1つ待つと
    //   **写真がどこにも無い1フレーム**が挟まって光る。
    draw(dir > 0 ? 0 : 1);
    const t0 = performance.now();
    const step = (now: number) => {
      const raw = Math.min(1, (now - t0) / span);
      const e = easeAt(EASE_SETTLE, raw);
      draw(dir > 0 ? e : 1 - e);
      if (raw < 1) { rafRef.current = requestAnimationFrame(step); return; }
      done();
    };
    rafRef.current = requestAnimationFrame(step);
  });

  useEffect(() => {
    const go = run.current;
    go(1, toRef.current, fromRef.current, () => setLanded(true));
    return () => cancelAnimationFrame(rafRef.current);
    // ★★**1回だけ**（行き先は画面の寸法、出発点は押した瞬間の矩形。どちらも
    //   このジェスチャのあいだ動かないので、ref で凍らせている）。
  }, []);

  /** 閉じるときの行き先（＝いま画面に在る写真）。`useLayoutEffect` が走らせる。 */
  const outRef = useRef<Box | null>(null);
  const close = () => {
    if (going) return;
    // ★★**いま画面に在る写真から戻す**（送ったあとでも出発点が嘘にならない）。
    const r = document.getElementById(`${clipId}-photo`)?.getBoundingClientRect();
    outRef.current = r ? { x: r.x, y: r.y, w: r.width, h: r.height } : toRef.current;
    setLanded(false);
    setGoing(true);
  };
  // ★★★**「窓」が戻ったそのフレームのうちに描く**（`useLayoutEffect` ＝ 塗る前）。
  useLayoutEffect(() => {
    const box = outRef.current;
    if (!going || !box) return;
    run.current(-1, box, fromRef.current, onClose);
    return () => cancelAnimationFrame(rafRef.current);
  }, [going, onClose]);

  const picture = (style: React.CSSProperties) => (photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={img(photo, 900, 1200)} alt="" style={{
      width: "100%", height: "100%", objectFit: "cover", objectPosition: "center",
      display: "block", ...style,
    }} />
  ) : (
    <div style={{
      width: "100%", height: "100%", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: "min(36vw, 160px)",
      lineHeight: LEAD.flat, color: ink, opacity: 0.85, ...style,
    }}>{card.glyph}</div>
  ));

  const view = (
    <div
      role="dialog"
      aria-label={card.title}
      style={{
        // ★★**タブバーより手前**（`AppShell` の nav は 25、帯は 15、トーストは 50）。
        //   ★目盛りの外（重なりの順）。
        position: "fixed", inset: 0, zIndex: 70, overflow: "hidden",
      }}
    >
      {/* ★★★**画面いっぱいのベタ塗り**（そのジャンルの色）。変形と一緒に濃くなる。 */}
      <div ref={bgRef} style={{
        position: "absolute", inset: 0, background: face, opacity: 0,
      }} />

      {/* ★★★**変形している最中だけ在る「窓」**。着いたら下の版面へ譲る。 */}
      {!landed && (
        <>
          <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse"><path ref={pathRef} d="" /></clipPath>
          </svg>
          <div style={{
            position: "fixed", inset: 0, pointerEvents: "none",
            clipPath: `url(#${clipId})`, WebkitClipPath: `url(#${clipId})`,
          }}>
            <div ref={holeRef} style={{ position: "absolute", overflow: "hidden" }}>
              {picture({})}
            </div>
          </div>
        </>
      )}

      {/* ★★★**着いたあとの版面** ―― 写真も本文も同じ流れに居るので、指で送れば
          写真ごと上へ抜ける。★押すと閉じる。
          ★★★**器そのものは透けさせない**（2026-09-18・第120巡）―― ここに
            `opacity` を掛けると**写真まで一緒に透ける**ので、変形が終わった瞬間に
            写真が地の色と混ざって見えた（実測 … 濃紺の空が地の緑に寄った）。
            **薄れてよいのは本文だけ。写真は「入れ替わる」のであって現れない。** */}
      <div
        onClick={close}
        style={{
          position: "absolute", inset: 0,
          overflowY: landed && !going ? "auto" : "hidden", overflowX: "clip",
          WebkitOverflowScrolling: "touch",
          pointerEvents: landed && !going ? "auto" : "none",
          color: ink,
        }}
      >
        <div
          id={`${clipId}-photo`}
          style={{
            position: "relative", marginLeft: to.x, marginTop: to.y,
            width: to.w, height: to.h,
            borderRadius: RADIUS.sheet, overflow: "hidden",
          }}
        >{landed ? picture({}) : null}</div>
        <div style={{
          opacity: landed && !going ? 1 : 0,
          transition: `opacity var(--t-item) var(--ease-settle)`,
          paddingTop: SPACE.xl,
          // ★左右は写真と同じベゼル（`--pad-x` ではなく、この画面の器の値）。
          paddingLeft: BEZEL, paddingRight: BEZEL,
          // ★目盛りの外（端末が決める値 ―― `env(safe-area-inset-bottom)`）。
          paddingBottom: `calc(env(safe-area-inset-bottom) + ${FOOT}px)`,
        }}>
          <div style={{
            fontFamily: SANS, fontSize: TYPE.micro, fontWeight: WEIGHT.bold,
            letterSpacing: TRACK.wide, lineHeight: LEAD.flat,
            opacity: 0.7, marginBottom: SPACE.sm,
          }}>{card.categoryJp ?? card.category}</div>
          <h2 style={{
            margin: `0 0 ${SPACE.lg}px`, fontFamily: SANS, fontWeight: WEIGHT.bold,
            fontSize: TYPE.display, lineHeight: LEAD.snug, letterSpacing: TRACK.normal,
          }}>{card.title}</h2>
          {body.split(/\n+/).filter(Boolean).map((line, i) => (
            <p key={i} style={{
              margin: `0 0 ${SPACE.lg}px`, fontFamily: SANS, fontSize: TYPE.body,
              fontWeight: WEIGHT.text, lineHeight: LEAD.body, letterSpacing: TRACK.normal,
              opacity: 0.92,
            }}>{line}</p>
          ))}
          {(card.meta ?? []).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.sm, marginTop: SPACE.xl }}>
              {card.meta!.map((m) => (
                <span key={m} style={{
                  fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.text,
                  lineHeight: LEAD.snug, letterSpacing: TRACK.normal, opacity: 0.85,
                  border: `1px solid currentColor`,
                  borderRadius: RADIUS.pill, padding: `${SPACE.xs}px ${SPACE.md}px`,
                }}>{m}</span>
              ))}
            </div>
          )}
          {card.sourceUrl && (
            <a href={card.sourceUrl} target="_blank" rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "inline-block", marginTop: SPACE.xl,
                fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold,
                lineHeight: LEAD.snug, letterSpacing: TRACK.normal,
                color: "inherit", textDecoration: "underline",
              }}>元の記事を開く{card.sourceLabel ? `（${card.sourceLabel}）` : ""}</a>
          )}
          <div style={{
            marginTop: SPACE.xxl, fontFamily: SANS, fontSize: TYPE.micro,
            fontWeight: WEIGHT.text, lineHeight: LEAD.snug, letterSpacing: TRACK.wide,
            opacity: 0.6,
          }}>画面のどこかを押すと戻ります</div>
        </div>
      </div>
    </div>
  );
  return createPortal(view, document.body);
}
