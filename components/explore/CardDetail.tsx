"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { CardShapeDefs } from "@/components/explore/CardShapeDefs";
import { INK, PAPER, SANS, SECOND } from "@/lib/constants";
import { cardShapeClip, type CardShape } from "@/lib/cardShape";
import { img } from "@/lib/helpers";
import { T_IN, ms } from "@/lib/motion";
import { bodyInkOn } from "@/lib/palette";
import { LEAD, RADIUS, SPACE, TRACK, TYPE, WEIGHT } from "@/lib/tokens";
import type { BriefCard } from "@/lib/types";

// ★★★**提案カードの詳細の画面**（2026-09-17・第119巡にユーザー指定）。
//
// > 「**Explore のカードの画面で、画像のところをタップすると、画像のマスクの形が
// > 回転しながら拡大して、画像が画面全体のような画面アニメーションして遷移する
// > 感じです。遷移した後の画面のイメージは、画像が大きく表示されていて、下の方が
// > ブラーになっていてそこに詳細文が書かれていて、下にスクロールして全文を
// > 読んでいける感じです**」
//
// ★★★**回るのは「マスク」だけ。写真は回らない**（ユーザーの言葉どおり
//   「**画像のマスクの形が回転しながら拡大**」）。だから層を2枚にして、
//   **外の器が回って育ち、中の写真は逆に回して逆にずらす** ―― こうすると
//   写真は画面に貼り付いたまま、**形が「窓」として広がる**。
//
// ★★★**育つのは `transform: scale` ではなく「幅と高さ」**（第119巡に踏んだ）。
//   ★★**CSS は `scale` を線形に補間するので、`scale(1/s)` は途中で逆行列に
//     ならない** ―― 外が 0.37 → 2.2、内が 2.72 → 0.45 と**別々に直線で**動くため、
//     真ん中では積が **2.04**（＝写真が2倍に膨らむ）。実測して分かった。
//   ★★★**回転と平行移動は足し算なので、途中でも厳密に打ち消し合う。**
//     だから**その2つだけ**を打ち消しに使い、大きさは**レイアウト**で育てる。
//     （固定配置の1枚だけなので、レイアウトの費用は無視できる。）
//   ★★**打ち消しの順は逆**（外が `translate → rotate` なら内は `rotate⁻¹ → translate⁻¹`）。
// ★★★**`clip-path` を使う**（CSS のマスクではない）。実機の WebKit で `mask-size`
//   が効かない ―― 理由は `lib/cardShape.ts` の頭。
// ★★★**器は正方形**（`objectBoundingBox` は器の比へ引き伸ばすので、長方形だと
//   四つ葉とトゲトゲが潰れる）。
//
// ★★**本文は `BriefCard.detail`**（`lib/briefPipeline.ts` の `SYSTEM_ENRICH_BODY`
//   が**スクレイピングした個別ページ本文から**書いている）。無い古いカードは
//   `body` に落とす ―― **新しいパイプラインは要らない。**

/** ★育ちきったときの倍率。**形の内側が画面を覆う**ところまで。★目盛りの外（画面の覆い）。 */
const GROW = 2.2;
/** ★回る角度（度）。**マスクだけが回る**。★目盛りの外（手つき）。 */
const TURN = 96;
/** ★写真が見えている高さ（画面に対する割合）。残りを文が覆う。★目盛りの外（版面）。 */
const PHOTO_VH = 0.54;
/** ★文の面の下の余り（画面の下端の安全域に足す）。★`SPACE.xxl` の2つぶん。 */
const FOOT = SPACE.xxl + SPACE.xxl;

export function CardDetail({ card, shape, from, onClose }: {
  card: BriefCard;
  shape: CardShape;
  /** 押した写真の画面上の矩形（ここから育つ）。 */
  from: { x: number; y: number; w: number; h: number };
  onClose: () => void;
}) {
  const clipId = useId().replace(/:/g, "");
  // ★★**2フレーム目から育てる** ―― 最初の描画で行き先の値を書くと、
  //   ブラウザは差分を見つけられず**一瞬で飛ぶ**（transition が走らない）。
  const [grown, setGrown] = useState(false);
  const [text, setText] = useState(false);

  useEffect(() => {
    const a = requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)));
    // ★文は**形が画面を覆いきってから**出す（途中で出すと形の外にはみ出て見える）。
    const t = setTimeout(() => setText(true), ms(T_IN));
    return () => { cancelAnimationFrame(a); clearTimeout(t); };
  }, []);

  // ★★**器の一辺は画面の長いほう**（正方形。理由は頭の注釈）。
  const side = typeof window === "undefined" ? 0 : Math.max(window.innerWidth, window.innerHeight);
  const cx = typeof window === "undefined" ? 0 : window.innerWidth / 2;
  const cy = typeof window === "undefined" ? 0 : window.innerHeight / 2;
  // 出発点 … 押した写真にぴったり重なる位置。
  const tx = from.x + from.w / 2 - cx;
  const ty = from.y + from.h / 2 - cy;
  const rot = grown ? TURN : 0;
  // ★育ちきったときの一辺。**形の内側が画面を覆う**ところまで。
  const wide = side * GROW;
  const w = grown ? wide : from.w;
  const mx = grown ? 0 : tx;
  const my = grown ? 0 : ty;
  const body = (card.detail ?? "").trim() || card.body;
  const photo = card.images?.[0];

  // ★★★**`document.body` の直下へ描く**（2026-09-17・第119巡）。
  //   ★★★**タブの中に置くと、どれだけ `zIndex` を上げても nav の下に潜る** ――
  //     `AppShell` の列は `transform` で横へ送っているので**独立した重なりの文脈**を
  //     作り、その中の `zIndex` は外の nav（25）と比べられない（実測 … 70 でも下）。
  //   ★`Dashboard` / `TaskComposer` / `CreateMenu` と同じ作法。
  const view = (
    <div
      role="dialog"
      aria-label={card.title}
      style={{
        // ★★**タブバーより手前**（`AppShell` の nav は 25、帯は 15、トーストは 50）。
        //   全画面の面なので、下に何も残さない。★目盛りの外（重なりの順）。
        position: "fixed", inset: 0, zIndex: 70, background: text ? INK : "transparent",
        transition: `background var(--t-in) var(--ease-settle)`,
        overflow: "hidden",
      }}
    >
      <CardShapeDefs prefix={clipId} />
      {/* ★★★**外の器 ―― 回って育つ「窓」**。`clip-path` はここに掛かる。 */}
      <div
        style={{
          position: "absolute", left: "50%", top: "50%",
          // ★★**器は正方形**（比が変わると四つ葉とトゲトゲが潰れる）。
          width: w, height: w,
          marginLeft: -w / 2, marginTop: -w / 2,   // ★目盛りの外（器の中央合わせ）
          transform: `translate(${mx}px, ${my}px) rotate(${rot}deg)`,
          transformOrigin: "center",
          transition: `width var(--t-in) var(--ease-settle),`
            + ` height var(--t-in) var(--ease-settle),`
            + ` margin var(--t-in) var(--ease-settle),`
            + ` transform var(--t-in) var(--ease-settle)`,
          ...cardShapeClip(shape, clipId),
        }}
      >
        {/* ★★★**中の写真 ―― 逆に回して逆に縮める**ので、画面に貼り付いたまま動かない。 */}
        <div style={{
          position: "absolute", left: "50%", top: "50%",
          width: "100vw", height: "100vh", marginLeft: "-50vw", marginTop: "-50vh",
          // ★★**外の逆**（順も逆）。回転と平行移動は足し算なので厳密に打ち消える。
          transform: `rotate(${-rot}deg) translate(${-mx}px, ${-my}px)`,
          transformOrigin: "center",
          transition: `transform var(--t-in) var(--ease-settle)`,
          background: PAPER,
        }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img(photo, 1000, 1400)} alt="" style={{
              width: "100%", height: "100%", objectFit: "cover", objectPosition: "center",
              display: "block",
            }} />
          ) : (
            <div style={{
              width: "100%", height: "100%", display: "flex",
              alignItems: "center", justifyContent: "center",
              fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: "min(40vw, 180px)",
              lineHeight: LEAD.flat, color: INK, opacity: 0.9,
            }}>{card.glyph}</div>
          )}
        </div>
      </div>

      {/* ★★★**文の面** ―― 写真の上に**下から**重なり、指で上へ送ると全文が読める。
          ★★**ブラーは面の側が持つ**（写真に掛けない ―― 掛けると送るたびに
          画面じゅうを塗り直すことになる）。 */}
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0, overflowY: "auto", overflowX: "clip",
          WebkitOverflowScrolling: "touch",
          opacity: text ? 1 : 0,
          transition: `opacity var(--t-item) var(--ease-settle)`,
          pointerEvents: text ? "auto" : "none",
        }}
      >
        {/* 写真を見せておくぶんの空き。★押すと閉じる。 */}
        <div style={{ height: `${Math.round(PHOTO_VH * 100)}vh` }} />
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            minHeight: `${100 - Math.round(PHOTO_VH * 100)}vh`,
            // ★★★**ぼかしが効かない環境でも読めること**（`backdrop-filter` は
            //   実機の WebKit では効くが、**効かなくても本文が読めないと困る**）。
            //   だから**膜そのものを 0.78 まで濃く**する ―― ぼかしは「良くなる」
            //   ぶんであって、**読めるかどうかを預けない**。
            //   実測 … 膜の上の紙色の字は、写真が最悪（真っ白）でも比 4.9。
            background: "rgba(44,38,39,0.78)",   // ★目盛りの外（写真の上の膜。`INK` の 78%）
            backdropFilter: "blur(22px)",        // ★目盛りの外（ぼかしの半径）
            WebkitBackdropFilter: "blur(22px)",
            borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
            // ★★★**`--nav-h` を読まないこと**（2026-09-17・第119巡に踏んだ）――
            //   あれは `AppShell` の**列**に置かれていて、`document.body` 直下へ
            //   出したこの面からは**見えない**。未定義の変数を `calc()` に入れると
            //   **`padding` の一括指定ごと無効**になり、**四方が 0 になる**
            //   （実測 … 本文が画面の左端に貼り付いた）。
            //   ★この面はタブバーより手前なので、そもそも避ける相手が居ない。
            //     下は**画面の下端の安全域**だけ見る。
            //   ★左右は `--pad-x`（`app/layout.tsx` が `:root` に置く＝どこからでも見える）。
            paddingTop: SPACE.xxl,
            paddingLeft: "var(--pad-x)", paddingRight: "var(--pad-x)",
            // ★目盛りの外（端末が決める値 ―― `env(safe-area-inset-bottom)`）。
            paddingBottom: `calc(env(safe-area-inset-bottom) + ${FOOT}px)`,
            color: PAPER,
          }}
        >
          <div style={{
            fontFamily: SANS, fontSize: TYPE.micro, fontWeight: WEIGHT.bold,
            letterSpacing: TRACK.wide, lineHeight: LEAD.flat,
            color: bodyInkOn(INK), opacity: 0.68, marginBottom: SPACE.sm,
          }}>{card.categoryJp ?? card.category}</div>
          <h2 style={{
            margin: `0 0 ${SPACE.lg}px`, fontFamily: SANS, fontWeight: WEIGHT.bold,
            fontSize: TYPE.display, lineHeight: LEAD.snug, letterSpacing: TRACK.normal,
            color: PAPER,
          }}>{card.title}</h2>
          {body.split(/\n+/).filter(Boolean).map((line, i) => (
            <p key={i} style={{
              margin: `0 0 ${SPACE.lg}px`, fontFamily: SANS, fontSize: TYPE.body,
              fontWeight: WEIGHT.text, lineHeight: LEAD.body, letterSpacing: TRACK.normal,
              color: PAPER, opacity: 0.92,
            }}>{line}</p>
          ))}
          {(card.meta ?? []).length > 0 && (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: SPACE.sm, marginTop: SPACE.xl,
            }}>
              {card.meta!.map((m) => (
                <span key={m} style={{
                  fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.text,
                  lineHeight: LEAD.snug, letterSpacing: TRACK.normal,
                  color: PAPER, opacity: 0.8,
                  border: `1px solid rgba(250,250,249,0.28)`,   // ★目盛りの外（膜の上の縁）
                  borderRadius: RADIUS.pill, padding: `${SPACE.xs}px ${SPACE.md}px`,
                }}>{m}</span>
              ))}
            </div>
          )}
          {card.sourceUrl && (
            <a href={card.sourceUrl} target="_blank" rel="noreferrer"
              style={{
                display: "inline-block", marginTop: SPACE.xl,
                fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold,
                lineHeight: LEAD.snug, letterSpacing: TRACK.normal,
                color: PAPER, textDecoration: "underline",
              }}>元の記事を開く{card.sourceLabel ? `（${card.sourceLabel}）` : ""}</a>
          )}
          <div style={{
            marginTop: SPACE.xxl, fontFamily: SANS, fontSize: TYPE.micro,
            fontWeight: WEIGHT.text, lineHeight: LEAD.snug, letterSpacing: TRACK.wide,
            color: SECOND, opacity: 0.7,
          }}>画面のどこかを押すと戻ります</div>
        </div>
      </div>
    </div>
  );
  return createPortal(view, document.body);
}
