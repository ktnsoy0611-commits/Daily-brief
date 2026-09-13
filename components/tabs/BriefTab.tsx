"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import { ExternalLink, Flag, Sprout } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
// ★`HOLE_CLEAR`/`PunchHoles` は**成長カードだけ**が使う（第94巡に提案カードからは
//   綴じ穴を外した。ユーザー確定 ―― 参照デザインに穴が無く、穴の逃げで左の余白が
//   34px に固定されて左右が非対称になっていた）。
import { BinderModal, HOLE_CLEAR, Masthead, PunchHoles, SectionLabel } from "@/components/common";
import { appTitle } from "@/lib/apps";
import { BRIEF_CARD_ASPECT, KIND_DOMAIN, BD_GREY, BLUE, CHECKIN_INTERVAL_DAYS, GREEN, GREEN_INK, HAIRLINE, INK, MILESTONE_INTERVAL_DAYS, MUTED, PAPER, RUST, SANS, SOFT_SHADOW_LG, SWIPE_THRESHOLD, CHARCOAL, SECOND, SHADE_DEEP } from "@/lib/constants";
import { daysBetween, haptic, img, ratingLabel, shade, todayKey } from "@/lib/helpers";
import { BRIEF_POOL_CAP } from "@/lib/homeBand";
import { accentOf } from "@/lib/appAccent";
import { bodyInkOn } from "@/lib/palette";
import { cardShapeClip, cardShapeOf } from "@/lib/cardShape";
import { CardShapeDefs } from "@/components/explore/CardShapeDefs";
import type { BriefCard, DeckCard, GrowthCard, TabProps } from "@/lib/types";
import { isGrowthCard } from "@/lib/types";

/**
 * 札の面。★★**見本帳（`DevStageTab` の「札」）も本番のこれをそのまま並べる**
 * ―― 見本用に別実装を作ると、形の割り当てが2か所になる（第94巡）。
 */
export function CardFace({ card, dx, isTop, onOpenBinder, checkinValue, onCheckinChange, milestoneText, onMilestoneTextChange, milestoneRating, onMilestoneRatingChange, flagged, onFlag, onRead }: {
  card: DeckCard;
  dx: number;
  isTop: boolean;
  onOpenBinder?: () => void;
  checkinValue: string;
  onCheckinChange: (v: string) => void;
  milestoneText: string;
  onMilestoneTextChange: (v: string) => void;
  milestoneRating: 1 | 2 | 3 | null;
  onMilestoneRatingChange: (r: 1 | 2 | 3) => void;
  flagged?: boolean;
  onFlag?: () => void;
  onRead?: () => void;
}) {
  // ★★★**切り抜きの id は札ごとに違う**（`AppShell` はタブを全部載せたまま
  //   横へ送るので、BRIEF の札と `DEV` の見本帳が同時に存在する）。
  //   ★フックなので**早期 return より前**で取る（育成カードの枝がある）。
  const clipId = useId().replace(/:/g, "");   /* ★目盛りの外（id に使えない文字を落とす） */
  const keepOpacity = isTop ? Math.min(Math.max(dx / SWIPE_THRESHOLD, 0), 1) : 0;
  const skipOpacity = isTop ? Math.min(Math.max(-dx / SWIPE_THRESHOLD, 0), 1) : 0;

  if (isGrowthCard(card)) {
    if (card.type === "checkin") {
      return (
        <div style={{
          width: "100%", height: "100%", background: PAPER, borderRadius: RADIUS.xl, overflow: "hidden",
          display: "flex", flexDirection: "column", boxShadow: SOFT_SHADOW_LG,
          border: `2px solid ${GREEN}`, position: "relative", userSelect: "none",
        }}>
          <div style={{ flex: "0 0 38%", background: GREEN, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SPACE.md, color: GREEN_INK }}>
            <Sprout size={32} strokeWidth={1.5} />
            <span style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.text, letterSpacing: TRACK.wide, opacity: 0.8 }}>CHECK-IN</span>
          </div>
          <div style={{ flex: 1, padding: `${SPACE.lg}px ${SPACE.xl}px ${SPACE.xl}px`, paddingLeft: HOLE_CLEAR, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.text, letterSpacing: TRACK.caps, color: MUTED, marginBottom: SPACE.sm }}>{card.goalTitle}</div>
            <h2 style={{ margin: `0 0 ${SPACE.md}px`, fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.head, lineHeight: LEAD.snug, color: INK }}>最近は、どうですか？</h2>
            <textarea
              value={checkinValue}
              onChange={(e) => onCheckinChange(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="今取り組んでいることを、ひとことで"
              style={{ flex: 1, resize: "none", border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS.lg, padding: SPACE.md, fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.text, outline: "none", background: PAPER, color: INK }}
            />
          </div>
          <PunchHoles />
        </div>
      );
    }

    return (
      <div style={{
        width: "100%", height: "100%", background: PAPER, borderRadius: RADIUS.xl, overflow: "hidden",
        display: "flex", flexDirection: "column", boxShadow: SOFT_SHADOW_LG,
        border: `2px solid ${RUST}`, position: "relative", userSelect: "none",
      }}>
        <div style={{ flex: "0 0 34%", background: RUST, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SPACE.md, color: PAPER }}>
          <Sprout size={30} strokeWidth={1.5} />
          <span style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.text, letterSpacing: TRACK.wide, opacity: 0.85 }}>MILESTONE</span>
        </div>
        <div style={{ flex: 1, padding: `${SPACE.lg}px ${SPACE.xl}px ${SPACE.xl}px`, paddingLeft: HOLE_CLEAR, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.text, letterSpacing: TRACK.caps, color: MUTED, marginBottom: SPACE.sm }}>{card.goalTitle}</div>
          <h2 style={{ margin: `0 0 ${SPACE.md}px`, fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.lead, lineHeight: LEAD.snug, color: INK }}>できるようになったこと、ありますか？</h2>
          <textarea
            value={milestoneText}
            onChange={(e) => onMilestoneTextChange(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="この1〜2ヶ月で、できるようになったこと"
            style={{ flex: 1, resize: "none", border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS.lg, padding: SPACE.md, fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.text, outline: "none", background: PAPER, color: INK, marginBottom: SPACE.md }}
          />
          <div style={{ display: "flex", gap: SPACE.sm }} onPointerDown={(e) => e.stopPropagation()}>
            {([1, 2, 3] as const).map((r) => (
              <button key={r} onClick={() => onMilestoneRatingChange(r)} style={{
                flex: 1, padding: `${SPACE.sm}px ${SPACE.xs}px`, borderRadius: RADIUS.lg, cursor: "pointer", fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold,
                background: milestoneRating === r ? RUST : "transparent", color: milestoneRating === r ? PAPER : SECOND,
                border: `1.5px solid ${milestoneRating === r ? RUST : "rgba(26,26,24,0.2)"}`,
              }}>{ratingLabel(r)}</button>
            ))}
          </div>
        </div>
        <PunchHoles />
      </div>
    );
  }

  const hasPhotos = (card.images?.length ?? 0) > 0;
  // ★★★**色は EXPLORE のメインカラー1色**（2026-09-13・第94巡にユーザー指定
  //   「色は Explore のメインカラーで統一し、各形はジャンルに対応させて」）。
  //   ★★**焼き込まれた `card.color`/`bg`/`fg` を信じない**（`lib/homeBand.ts` と
  //     同じ理由 ―― 生成した夜のパレットが残っている）。面に載る字は
  //     `bodyInkOn()` が面から導く。
  // ★★★**分類は色ではなく形が言う** ―― 写真を**ドメインの形で切り抜く**
  //   （`lib/cardShape.ts`。券の鋏痕と同じ性格を引き継いだ4つ）。
  //   だから**ジャンルの文字は置かない**（同じことを2つの言い方で言わない）。
  const face = accentOf("life").main;
  const ink = bodyInkOn(face);
  const shape = cardShapeOf(KIND_DOMAIN[card.kind ?? "place"] ?? "info");
  return (
    <div style={{
      width: "100%", height: "100%", background: face, borderRadius: RADIUS.sheet, overflow: "hidden",
      display: "flex", flexDirection: "column", boxShadow: SOFT_SHADOW_LG,
      // セレンディピティ枠も特別な縁取りを付けず、他のカードと同じ見た目に
      // 馴染ませる(「思いがけない提案」であることを声高にラベルしない方が
      // 体験として良い、というユーザー指定)。
      border: "none", position: "relative", userSelect: "none",
      // ★★**綴じ穴をやめたので左右が対称になった**（2026-09-13 ユーザー確定）。
      //   ★カードは「ページ最上位の器」ではなく部品なので、自分の内側の余白を持つ
      //   （`design.md` §2 の左右パディングの禁は器の入れ子の話）。
      // ★★★**ベゼルは参照画像の実測に合わせた**（2026-09-13・第96巡）――
      //   参照は **28px / カード幅 273 ＝ 10.3%**、`SPACE.lg` では **5.2%** で
      //   **半分しかなかった**。`SPACE.xxl` は 340 幅で **9.4%**。
      padding: CARD_PAD,
    }}>
      {/* ★この札だけの `<clipPath>`。**場所は取らない**（幅も高さも 0）。 */}
      <CardShapeDefs prefix={clipId} />
      {/* ★★写真を**形で切り抜く**。押すと写真の一覧（今までどおり）。
          ★★★**切るのは写真だけ。カードには掛けない** ―― 掛けると
          `box-shadow` が出なくなる（`design.md` §3-c）。
          ★★★**CSS のマスクは使わない**（実機で `mask-size` が効かなかった。
          理由は `lib/cardShape.ts` の頭）。`clip-path` は画像としての寸法計算が
          無いので、器の比へそのまま伸びる。 */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => isTop && onOpenBinder && onOpenBinder()}
        style={{
          // ★★★**器は正方形**（2026-09-13・第96巡）。`clipPathUnits="objectBoundingBox"`
          //   は 0〜1 のパスを**器の比へ引き伸ばす**ので、器が 308×275（比 1.12）
          //   だと四つ葉とトゲトゲが**横に 12% 潰れて**いた（ユーザー指摘）。
          //   ★★**参照画像の器を実測したら全部正方形だった**（218×218 / 218×217 /
          //   188×188）。幅は「札の幅 − ベゼル×2」なので、**高さは自動で同じ値**。
          flex: "0 0 auto", aspectRatio: "1 / 1", position: "relative", overflow: "hidden",
          // ★写真が無いときは紙色の面。**形は写真の有無によらず必ず見える**
          //   （形が分類を担うので、消えてはいけない）。
          background: PAPER,
          cursor: isTop && hasPhotos ? "pointer" : "default",
          ...cardShapeClip(shape, clipId),
        }}
      >
        {hasPhotos ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img(card.images![0], 500, 400)} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* ★字面は形の中に収まる大きさで（形が主役なので、はみ出させない）。 */}
            <span aria-hidden style={{ fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: "min(26vw, 104px)", lineHeight: LEAD.flat, color: INK, opacity: 0.9 }}>{card.glyph}</span>
          </div>
        )}
      </div>
      {/* ★★余白は**2値**（束の中は `xs`／束と束の間は `xl`）。`md` を使わない ――
          どこが束かが見えるようにするため（`design.md` §5-2）。 */}
      {/* ★★文の塊が**余りを取る**（器が正方形で固定になったので逆転した）。
          ★`overflow: hidden` … 題が2行になっても**器を押し出さない**。
          本文が1行減るだけで、写真の正方形は絶対に崩れない。 */}
      <div style={{ flex: "1 1 auto", minHeight: 0, overflow: "hidden", paddingTop: SPACE.xl, display: "flex", flexDirection: "column", gap: SPACE.xs }}>
        {/* ★★★役は**3つだけ**（題・要約・操作）。階層は**大きさと太さ**で作り、
            色は使わない（面が色なので、無彩色の段を混ぜると濁る）。 */}
        <h2 style={{ margin: 0, fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.head, lineHeight: LEAD.snug, letterSpacing: TRACK.normal, color: ink }}>{card.title}</h2>
        {/* paddingRightはisTopに関わらず常に一定にしている。以前はisTop&&
            onFlagの時だけ26pxを足していたため、peekだったカードがtopに
            切り替わる瞬間にpaddingが0→26へ非連続にジャンプし、transform
            のアニメーションと同時に本文の折り返し位置が一瞬ガクッとズレて
            見える不具合になっていた。
            ★★右下の黒い円のぶんも**常に**空けておく（同じ理由）。 */}
        {/* flex:1でwebkit-line-clampと組み合わせると、SafariでB本文が
            クランプされずカードの外(角丸の下)へそのまま溢れて見える
            不具合があった。flexに頼らず、行の高さから算出した固定の
            maxHeightで確実に頭打ちにする。 */}
        <p style={{ margin: 0, maxHeight: "calc(1.7em * 3)", fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.text, lineHeight: LEAD.body, letterSpacing: TRACK.normal, color: ink, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{card.body}</p>
      </div>
      {/* ★★★**操作は下の1列に集める**（第94巡）。
          ★★★**列の高さは `LINK_D` で固定** ―― 中身が `isTop` で増減しても
            **高さが動かない**（絶対配置にすると文と重なり、`flex` に任せると
            peek→top の瞬間に本文の折り返しがガクッとズレる。:136-146 の罠）。
          ★★アイコンは `BinderModal` の出典ボタンと**同じ `ExternalLink`**
            （同じ意味に同じ絵。新しい語彙を作らない）。
          ★★`onPointerDown` を止めないとスワイプ（KEEP/SKIP）と喧嘩する。 */}
      <div style={{ flex: "0 0 auto", height: LINK_D, marginTop: SPACE.xs, display: "flex", alignItems: "center", gap: SPACE.sm }}>
        {isTop && onFlag && (
          <button
            onClick={(e) => { e.stopPropagation(); onFlag(); }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="この情報の質をフィードバック"
            style={{ background: "none", border: "none", cursor: "pointer", padding: SPACE.sm, lineHeight: 0 }}
          >
            <Flag size={13} strokeWidth={2} color={flagged ? RUST : ink} fill={flagged ? RUST : "none"} opacity={flagged ? 1 : 0.45} />
          </button>
        )}
        {/* 情報カード(新着記事)は、タップすると記事の半分要約を全画面で読める。
            スワイプ(keep/skip)と衝突しないよう、pointerdownは親へ伝播させない。 */}
        {isTop && onRead && (
          <button
            onClick={(e) => { e.stopPropagation(); onRead(); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ background: INK, color: PAPER, border: "none", cursor: "pointer", borderRadius: RADIUS.pill, padding: `${SPACE.xs}px ${SPACE.md}px`, fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold, letterSpacing: TRACK.normal }}
          >記事を読む →</button>
        )}
        <span style={{ flex: 1 }} />
        {/* ★`sourceUrl` が無いカードには**出さない**（空の円を置かない）。 */}
        {card.sourceUrl && (
          <a
            href={card.sourceUrl} target="_blank" rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={card.sourceLabel ?? "出典を開く"}
            style={{
              width: LINK_D, height: LINK_D, borderRadius: RADIUS.circle,
              background: INK, color: PAPER, textDecoration: "none",
              display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto",
            }}
          >
            <ExternalLink size={16} strokeWidth={2.2} />
          </a>
        )}
      </div>
      <div style={{ position: "absolute", top: CARD_PAD, left: CARD_PAD, transform: "rotate(-12deg)", opacity: keepOpacity, border: `3px solid ${BLUE}`, color: BLUE, fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.display, letterSpacing: TRACK.caps, padding: `${SPACE.xs}px ${SPACE.md}px`, borderRadius: RADIUS.md, background: "rgba(250,250,249,0.85)", pointerEvents: "none" }}>KEEP</div>
      <div style={{ position: "absolute", top: CARD_PAD, right: CARD_PAD, transform: "rotate(12deg)", opacity: skipOpacity, border: `3px solid ${MUTED}`, color: MUTED, fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.display, letterSpacing: TRACK.caps, padding: `${SPACE.xs}px ${SPACE.md}px`, borderRadius: RADIUS.md, background: "rgba(250,250,249,0.85)", pointerEvents: "none" }}>SKIP</div>
    </div>
  );
}

type Decision = "keep" | "skip" | "answered" | "skipped";

// ★デッキが空のときに置く幾何学のしるし。背景・バインダーと同じ語彙
// (正方形のグリッドに四半円と円)で、2x2のマスに図形を並べただけのもの。
// 文字で説明を足さずに「まだ何も無い」ことを示す。
function WaitingMark() {
  const U = 34;
  const cells: React.CSSProperties[] = [
    { borderRadius: "0 0 100% 0" },   // 左上: 右下が丸い四半円
    { borderRadius: RADIUS.circle },          // 右上: 円
    { borderRadius: RADIUS.circle },          // 左下: 円
    { borderRadius: "100% 0 0 0" },   // 右下: 左上が丸い四半円
  ];
  return (
    <div aria-hidden style={{ display: "grid", gridTemplateColumns: `repeat(2, ${U}px)`, gridTemplateRows: `repeat(2, ${U}px)`, gap: SPACE.xs }}>
      {cells.map((c, i) => (
        <div key={i} style={{ ...c, background: i % 3 === 0 ? shade(BD_GREY, -16) : shade(BD_GREY, -8) }} />
      ))}
    </div>
  );
}

// ★★★未消化カードのプール上限は **`lib/homeBand.ts` の `BRIEF_POOL_CAP`**
// （2026-09-11）。以前はここに 30、夜間の生成に 40 と**2つあってずれていた**ので、
// ホームの数字（41）とこのデッキの枚数（30）が食い違っていた。**出どころは1つ。**

/** ★右下の黒い円（出典へ飛ぶ）の直径＝下の1列の高さ。★目盛りの外（部品の寸法）。 */
const LINK_D = 44;
/** 札の最大の幅（これ以上は広げない）。★目盛りの外（部品の寸法）。 */
const CARD_MAX_W = 340;
/** ★札の内側の余白（ベゼル）。参照画像の実測は幅の 10.3%、これは 9.4%。 */
const CARD_PAD = SPACE.xxl;
/** ★★★**札の比は数ではなく1つの割り算**（`BRIEF_CARD_ASPECT` ＝ 幅 ÷ 高さ）。 */
const BRIEF_AR = (() => {
  const [a, b] = BRIEF_CARD_ASPECT.split("/").map((n) => Number(n.trim()));
  return a / b;
})();

// 育成カード用フッター(あとで/記録する)の高さぶんの予約枠。isGrowthを
// 問わず常にこの高さを確保しておくことで、フッターの有無によって
// カードの実寸が変わる(=スワイプで昇格した瞬間にガクッと動く)ことが
// 構造的に起こらないようにする。
const GROWTH_FOOTER_SLOT = 58;

export function BriefTab({ appState, persist, goTab }: TabProps) {
  const [drag, setDrag] = useState({ dx: 0, dy: 0, active: false });
  const [exit, setExit] = useState<"keep" | "skip" | null>(null);
  const [binderItem, setBinderItem] = useState<BriefCard | null>(null);
  const [readItem, setReadItem] = useState<BriefCard | null>(null);
  const [checkinAnswer, setCheckinAnswer] = useState("");
  const [milestoneText, setMilestoneText] = useState("");
  const [milestoneRating, setMilestoneRating] = useState<1 | 2 | 3 | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  // commit()の二重発火を防ぐ同期ロックと、その保留中setTimeoutの参照。
  // タブを離れる等でこのコンポーネントがアンマウントされた場合、生の
  // setTimeoutはコンポーネントのライフサイクルと無関係に動き続けてしまう
  // (Reactは自動でクリアしない)ため、アンマウント時に明示的に破棄する。
  const committingRef = useRef(false);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (commitTimerRef.current != null) clearTimeout(commitTimerRef.current);
  }, []);
  // カードの実寸は、dvhベースの割合による推測ではなく、実際にレイアウト
  // された「カードを中央寄せする枠」のサイズを直接測って決める。以前は
  // `calc(Xdvh * 0.75)`という推測値を使っていたが、実機(特にSafari)では
  // 実際のビューポート/ヘッダー/フッターの実寸とズレることがあり、
  // 本文がカードの外へそのままはみ出す不具合の一因になっていた。
  const arenaRef = useRef<HTMLDivElement>(null);
  const [cardBox, setCardBox] = useState<{ w: number; h: number; lift: number } | null>(null);
  useEffect(() => {
    const el = arenaRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      // 枠自身の上下パディング（`SPACE.md` × 2）は余白として残す。
      const availH = rect.height - SPACE.md * 2;
      const availW = rect.width;
      if (availW <= 0 || availH <= 0) return;
      // ★★★**比は `BRIEF_CARD_ASPECT` の1か所から導く**（2026-09-13・第96巡）。
      //   前は `availH * 0.75` と `w * (4/3)` が**互いの逆数の生の数で2つ**書いて
      //   あり、片方だけ直すと札が枠からはみ出す仕掛けになっていた。
      //   ★`ITEM_CARD_ASPECT` とは**別物**（あちらを変えてもここは動かない）。
      const w = Math.min(availW, CARD_MAX_W, availH * BRIEF_AR);
      const h = w / BRIEF_AR;
      // ★★★**札を「画面の中心」へ寄せる**（2026-09-13・第97巡）。
      //   枠の下にはフッターの予約枠（`GROWTH_FOOTER_SLOT`）が**常に居る**ので、
      //   枠の中で中央に置くと、**画面の中では予約枠の半分だけ上へずれる**
      //   （実測 … 列の上から札の上 45 ／ 札の下から列の下 103）。
      //   ユーザー指摘「**下に変な隙間**」はこれ。
      //   ★★★**予約枠そのものは消さない** ―― 育成カードが先頭へ昇格した瞬間に
      //   札の実寸が変わる（本文の折り返しがガクッと動く）のを止めているのがこれ。
      //   ★★★**札を縮めてまで中心へは寄せない** ―― 余っている高さの範囲でだけ
      //   下げる。余りが無い（＝高さで頭打ちの）画面では札の大きさが最優先。
      const slack = Math.max(0, (availH - h) / 2);
      setCardBox({ w, h, lift: Math.min(slack, GROWTH_FOOTER_SLOT / 2) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);


  // ★「朝刊/夕刊」という区切りは廃止した(2026-08-03)。キーは日付だけで、
  // 1日に何度生成しても同じ日のデッキに積まれる。
  const editionKey = todayKey();
  const decisions: Record<string, Decision> = (appState.briefs?.[editionKey]?.decisions as Record<string, Decision>) ?? {};
  // ★未消化カードは日をまたいで貯まる。決定(keep/skip)・旗は日ごとの
  // briefs[*] に散って記録されるが、カードidは生成実行ごとにDate.nowベースで
  // 一意なので、全日ぶんをマージして引ける。
  const allDecisions: Record<string, Decision> = useMemo(() => {
    const m: Record<string, Decision> = {};
    for (const b of Object.values(appState.briefs ?? {})) {
      for (const [id, d] of Object.entries((b?.decisions ?? {}) as Record<string, Decision>)) m[id] = d;
    }
    return m;
  }, [appState.briefs]);
  const allFeedback: Record<string, boolean> = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const b of Object.values(appState.briefs ?? {})) {
      for (const [id, v] of Object.entries(b?.feedback ?? {})) if (v) m[id] = true;
    }
    return m;
  }, [appState.briefs]);
  // カードidから、それが属する日(editionKey)を引く。決定・旗をそのカードの
  // 元の日に記録するため(未消化プールは日をまたぐので、今日に記録すると
  // ログ焼き付け(日ごとにカードと決定を突き合わせる)が壊れる)。見つからない
  // 育成カード等は今日。
  const editionOfCard = (id: string | number): string => {
    const decks = appState.generatedDecks ?? {};
    for (const [ek, cards] of Object.entries(decks)) {
      if ((cards ?? []).some((c) => String(c.id) === String(id))) return ek;
    }
    return editionKey;
  };

  // カードの質が低かったときの控えめなフィードバック。本実装では
  // このカードを生成した情報源(source)のスコアを下げる材料になる。
  const toggleFlag = (cardId: string | number) => {
    haptic(6);
    const next = structuredClone(appState);
    const ed = editionOfCard(cardId);
    const brief = next.briefs[ed] ?? { decisions: {} };
    brief.feedback = brief.feedback ?? {};
    brief.feedback[cardId] = !brief.feedback[cardId];
    next.briefs[ed] = brief;
    persist(next);
  };

  // 目標には2種類の「育成カード」が届く: 軽い問いかけ(checkin, 14日毎)と、
  // 評価つきの振り返り(milestone, 45日毎)。同じ日に何件も届くと煩わしいので、
  // 全目標×両方の種類の中から「間隔に対してもっとも待たせている1件」だけを選ぶ。
  const dueCandidate = useMemo(() => {
    const goals = appState.goals ?? [];
    const candidates: { g: (typeof goals)[number]; kind: "checkin" | "milestone"; urgency: number }[] = [];
    // ★★「記録した」だけでなく「あとで(=skip)で流した」時刻からも数える
    //   (2026-08-26・第64巡にユーザー確定「あとでを押したら次の間隔まで出さない」)。
    //   第63巡までは skip で何も残らなかったので、そのゴールは**永久に期限到来のまま**
    //   になり、育成カードが毎日また差し込まれていた。
    const latest = (...xs: (string | undefined)[]) =>
      xs.filter((x): x is string => !!x).sort().pop();
    goals.forEach((g) => {
      const sinceCheckin = daysBetween(
        latest(g.checkIns?.[0]?.at, g.snoozedAt?.checkin) ?? g.addedAt);
      const lastMilestoneAt = latest(
        g.checkIns?.find((ci) => ci.kind === "milestone")?.at, g.snoozedAt?.milestone) ?? g.addedAt;
      const sinceMilestone = daysBetween(lastMilestoneAt);
      if (sinceCheckin >= CHECKIN_INTERVAL_DAYS) candidates.push({ g, kind: "checkin", urgency: sinceCheckin / CHECKIN_INTERVAL_DAYS });
      if (sinceMilestone >= MILESTONE_INTERVAL_DAYS) candidates.push({ g, kind: "milestone", urgency: sinceMilestone / MILESTONE_INTERVAL_DAYS });
    });
    candidates.sort((a, b) => b.urgency - a.urgency);
    return candidates[0] ?? null;
  }, [appState.goals]);

  // デッキは夜間Cronが生成した generatedDecks[editionKey] のみを使う。その号が
  // まだ無い間は空(休刊表示)にする。以前はダミー(CARDS)へフォールバックして
  // いたが、ダミーのカードid(1〜14)をスワイプするとその決定が残り、生成カードの
  // idと衝突して「もう見た」と誤判定される不具合の原因になっていたため撤去した
  // (SYSTEM-DESIGN §8 のサンプルデータ撤去にも沿う)。
  // 今日すでに育成カード(checkin/milestone)を1枚さばいたか。育成カードの
  // 決定キーは "checkin-..."/"milestone-..." で始まる。
  const growthDecidedThisEdition = Object.keys(decisions).some(
    (k) => k.startsWith("checkin-") || k.startsWith("milestone-"),
  );
  // このコンポーネントのマウント時点で「既に消化済み(keep/skip)」だったカードidを
  // 固定スナップショットしておく。プールからはこれらを除く(=既に片付けたカードは
  // 出さない)。一方、このビュー滞在中に消化したカードはスナップショットに含ま
  // れないためプールに残り、既存のスワイプ機構(indexが決定数ぶん進む)がそのまま
  // 働く。タブ切替でこのコンポーネントは key={tab} ごと作り直されるため、次に
  // ブリーフを開いた時には新しいスナップショットで片付け済みが除かれる。
  const decidedAtMountRef = useRef<Set<string> | null>(null);
  if (decidedAtMountRef.current === null) {
    decidedAtMountRef.current = new Set(Object.keys(allDecisions));
  }

  const deck: DeckCard[] = useMemo(() => {
    // デッキ=日をまたいだ「未消化カードのプール」。新しい日から順に、
    // 会期切れ・マウント時点で消化済みのものを除いて集め、最大 BRIEF_POOL_CAP 枚。
    // キー("YYYY-MM-DD")は文字列比較で新しい順に並ぶ。
    const nowMs = Date.now();
    const decks = appState.generatedDecks ?? {};
    const edKeys = Object.keys(decks).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    const seen = new Set<string>();
    const pool: BriefCard[] = [];
    for (const ek of edKeys) {
      for (const c of decks[ek] ?? []) {
        const id = String(c.id);
        if (seen.has(id)) continue;
        seen.add(id);
        if (decidedAtMountRef.current!.has(id)) continue; // 既に片付けたカードは出さない
        if (c.expiresAt) {
          const t = Date.parse(c.expiresAt);
          if (!Number.isNaN(t) && t < nowMs) continue; // 会期切れは出さない
        }
        pool.push(c);
        if (pool.length >= BRIEF_POOL_CAP) break;
      }
      if (pool.length >= BRIEF_POOL_CAP) break;
    }
    const base: DeckCard[] = [...pool];
    // 育成カードは1号につき最大1枚だけ差し込む。**既にこの号で育成カードを
    // 決定済み(記録 or あとで)なら差し込まない**。これが無いと、育成カードを
    // 「あとで」でスキップしても、そのゴールは依然「期限到来中」のままなので
    // dueCandidate が同じ育成カードを再計算で差し込み直し、同じチェックイン
    // カードが延々とループして先へ進めなくなっていた(実機で発見)。
    if (dueCandidate && !growthDecidedThisEdition) {
      const { g, kind } = dueCandidate;
      const growthCard: GrowthCard = { id: `${kind}-${g.id}`, type: kind, goalId: g.id, goalTitle: g.title };
      base.splice(3, 0, growthCard);
    }
    return base;
  }, [dueCandidate, appState.generatedDecks, growthDecidedThisEdition]);

  // ★★育成カードは**今日の号だけ**を見る(2026-08-26・第64巡)。育成カードの id は
  //   `checkin-<goalId>` で**日付を含まない＝日をまたいで同じ**なので、全号マージの
  //   `allDecisions` で数えると、過去の号の決定がそのまま「今日も消化済み」になる。
  //   差し込みの判定(`growthDecidedThisEdition`)は今日の号を見ているのに、数える方は
  //   全号 ― この食い違いで、プールが空なら `deck.length === 1 / index === 1` で
  //   いきなり「今日はここまで」、プールがあっても**先頭の1枚が黙って飛ばされて**いた。
  //   プールのカードは id が生成ごとに一意なので、いままでどおり全号マージでよい。
  const decidedOf = (c: DeckCard) => (isGrowthCard(c) ? decisions[c.id] : allDecisions[c.id]);
  const index = deck.filter((c) => decidedOf(c)).length;
  const done = index >= deck.length;
  // 安全網: 表示すべきカードが進んだ(=決定が保存された)のに、何らかの
  // 理由でexit/dragが定位置に戻っていなければ、ここで強制的にリセットする。
  // 通常のフローではcommit()のsetTimeout内で既に行っているため実質的には
  // 二重の保険だが、万一そこが正しく完了しなかった場合に「カードが画面上
  // 動かせない/めくれない」状態のまま固まるのを防ぐ。
  useEffect(() => {
    setExit(null);
    setDrag({ dx: 0, dy: 0, active: false });
    committingRef.current = false;
  }, [index]);
  // 育成カード(checkin/milestone)は「keep」判定にはならない(answered/skippedのみ)ため、
  // ここでBriefCardであることをTSにも保証する。
  const keptCards = deck.filter((c): c is BriefCard => !isGrowthCard(c) && allDecisions[c.id] === "keep");
  const currentCard = deck[index];
  const isCheckin = currentCard?.type === "checkin";
  const isMilestone = currentCard?.type === "milestone";
  const isGrowth = !!currentCard && isGrowthCard(currentCard);
  const canRecord = isCheckin ? !!checkinAnswer.trim() : isMilestone ? !!(milestoneText.trim() && milestoneRating) : true;

  const commit = (dir: "keep" | "skip") => {
    // exit(state)だけでの再入防止は、Reactの再レンダーが挟まるまでの間
    // (同じイベントtick内で複数回pointerupが発火した場合など)は効かない
    // ことがある。committingRefは即座に反映される同期フラグなので、その
    // 抜け道を塞ぐ。iOSで合成のpointerup/pointercancelが連続して届くと、
    // stateの反映が間に合わず同じカードへcommitが二重に走り、「keepの
    // 判定はストックされるのに画面のカードが進まない」ように見える不具合の
    // 芽になりうるため、二重の入り口(state+ref)で確実に1回だけに絞る。
    if (done || exit || committingRef.current) return;
    committingRef.current = true;
    const card = deck[index];
    haptic(dir === "keep" ? 18 : 8);
    setExit(dir);
    if (commitTimerRef.current != null) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      const next = structuredClone(appState);
      // 未消化プールは号横断のため、決定はカードの「元の号」に記録する
      // (今の号に記録するとログ焼き付けが号内でカードと決定を突き合わせられ
      // なくなる)。育成カードはプール外なので今の号に記録する。
      const ed = isGrowthCard(card) ? editionKey : editionOfCard(card.id);
      const brief = next.briefs[ed] ?? { decisions: {} };

      if (isGrowthCard(card)) {
        brief.decisions[card.id] = dir === "keep" ? "answered" : "skipped";
        if (dir === "skip") {
          // ★★「あとで」＝**次の間隔まで出さない**(第64巡にユーザー確定)。
          //   ここに時刻を残さないと、そのゴールは期限到来のままなので毎日また届く。
          const g = (next.goals ?? []).find((x) => x.id === card.goalId);
          if (g) {
            g.snoozedAt = { ...g.snoozedAt, [card.type]: new Date().toISOString() };
          }
        }
        if (dir === "keep") {
          const g = (next.goals ?? []).find((x) => x.id === card.goalId);
          if (g) {
            g.checkIns = g.checkIns ?? [];
            if (card.type === "checkin" && checkinAnswer.trim()) {
              g.checkIns.unshift({ id: `ci-${Date.now()}`, at: new Date().toISOString(), text: checkinAnswer.trim(), source: "prompted" });
            } else if (card.type === "milestone" && milestoneText.trim() && milestoneRating) {
              g.checkIns.unshift({ id: `ci-${Date.now()}`, at: new Date().toISOString(), text: milestoneText.trim(), rating: milestoneRating, kind: "milestone", source: "prompted" });
            }
          }
        }
      } else if (card.sourceProposal && card.sourceUrl) {
        // 情報源カード(§7-5): KEEPはお気に入り情報源へ登録(Itemは作らない)、
        // SKIPは除外リストへ入れて次回以降プールから外す。
        brief.decisions[card.id] = dir;
        const url = card.sourceUrl;
        if (dir === "keep") {
          next.sources = next.sources ?? [];
          if (!next.sources.some((s) => s.url === url)) {
            let label = url;
            try { label = new URL(url).hostname.replace(/^www\./, ""); } catch { /* そのまま */ }
            next.sources.unshift({ id: `src-${Date.now()}`, url, label, addedAt: new Date().toISOString() });
          }
        } else {
          next.profile = next.profile ?? { interests: [] };
          const d = next.profile.dismissedSources ?? [];
          if (!d.includes(url)) next.profile.dismissedSources = [...d, url];
        }
      } else {
        brief.decisions[card.id] = dir;
        if (dir === "keep") {
          // KEEPは常にItemを1件作るだけ(以前は「作品なら直接records.media、
          // それ以外はkeeps」という2経路の分岐があった)。種類はカード側の
          // kind(省略時は"place")、場所の有無はareaの有無がそのまま決める。
          // ウィッシュに応えたカードは origin:"wish" として紐付ける。まず
          // sourceWishId(Geminiが返した願いのid・言い換えに強い)で照合し、
          // 無い場合(旧デッキ)だけ従来の sourceWishTitle 文字一致にフォールバック。
          // どちらも「まだ叶えていない(status:"stock")願い」に限る。
          const wish =
            (card.sourceWishId
              ? next.wishes.find((w) => w.id === card.sourceWishId && w.status === "stock")
              : undefined) ??
            (card.sourceWishTitle
              ? next.wishes.find((w) => w.title === card.sourceWishTitle && w.status === "stock")
              : undefined);
          const nowIso = new Date().toISOString();
          // 情報カード(新着記事)は「提案」ではなく「読んで記録するもの」。KEEPしたら
          // ストック(候補)には出さず、その日の日付バインダーへ done として直接入れる
          // (別枠の流れ・ユーザー指定 HANDOFF §8.17)。detail に記事の半分要約が入って
          // おり、アーカイブでもそのまま読める。
          if (card.isInfo) {
            next.items.push({
              id: `brief-${ed}-${card.id}`, kind: card.kind ?? "info",
              title: card.title, category: card.categoryJp, summary: card.body, detail: card.detail,
              images: card.images, meta: card.meta, sourceUrl: card.sourceUrl, sourceLabel: card.sourceLabel, color: card.color,
              status: "done", addedAt: nowIso, doneAt: nowIso, origin: "info",
            });
          } else {
            next.items.push({
              id: `brief-${ed}-${card.id}`, kind: card.kind ?? "place",
              title: card.title, category: card.categoryJp, summary: card.body, detail: card.detail,
              area: card.area && card.area !== "—" ? card.area : undefined,
              lat: card.lat, lng: card.lng, placeId: card.placeId,
              images: card.images, meta: card.meta, sourceUrl: card.sourceUrl, sourceLabel: card.sourceLabel, color: card.color,
              status: "candidate", addedAt: nowIso, expiresAt: card.expiresAt,
              origin: wish ? "wish" : "brief", sourceWishId: wish?.id,
              // ゴール由来のカードは、どのゴールのためかを保持したままストックへ入る
              // (実在するゴールに限る・§8.21)。
              goalId: card.goalId && next.goals.some((g) => g.id === card.goalId) ? card.goalId : undefined,
            });
          }
        }
      }

      next.briefs[ed] = brief;
      setExit(null);
      setDrag({ dx: 0, dy: 0, active: false });
      setCheckinAnswer("");
      setMilestoneText("");
      setMilestoneRating(null);
      committingRef.current = false;
      persist(next);
    }, 320);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (exit || done || isGrowth) return; // 育成カードはテキスト入力と衝突するためドラッグ無効
    startRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ dx: 0, dy: 0, active: true });
    // 合成イベント(自動テスト)やごく稀なブラウザの状態では、有効な
    // ポインタが存在しないとして例外を投げることがある(Binder.tsxの
    // ドラッグ実装と同じ既知の事象)。ここで握りつぶしても、キャプチャに
    // 失敗するだけでドラッグ自体(pointermove/pointerupの追跡)は続行できる。
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.active || exit) return;
    setDrag({ dx: e.clientX - startRef.current.x, dy: (e.clientY - startRef.current.y) * 0.25, active: true });
  };
  const onPointerUp = () => {
    if (!drag.active || exit) return;
    if (drag.dx > SWIPE_THRESHOLD) commit("keep");
    else if (drag.dx < -SWIPE_THRESHOLD) commit("skip");
    else setDrag({ dx: 0, dy: 0, active: false });
  };

  const exitX = exit === "keep" ? window.innerWidth * 1.2 : exit === "skip" ? -window.innerWidth * 1.2 : 0;
  // topTransformとpeekTransformは、常に同じ関数の並び
  // (translate → scale → rotate)で組み立てている。決定直後にpeekだった
  // カードがtop側へ切り替わる瞬間、DOM要素自体は使い回される(下のコメント
  // 参照)ため、transformの値がscale()+translateY()の並びからtranslate()+
  // rotate()の並びへ非連続に変わっていると、ブラウザは単純な成分ごとの
  // 補間ができずマトリクス分解による補間にフォールバックし、意図しない
  // 拡縮・回転が混ざった「変な挙動」に見えていた。同じ並びに揃えることで
  // 各成分がそのまま滑らかに補間されるようにしている。
  const topTransform = exit
    ? `translate(${exitX}px, ${drag.dy - 40}px) scale(1) rotate(${exit === "keep" ? 22 : -22}deg)`
    : `translate(${drag.dx}px, ${drag.dy}px) scale(1) rotate(${drag.dx * 0.06}deg)`;
  const topTransition = exit ? "transform var(--t-out) var(--ease-sheet)" : drag.active ? "none" : "transform var(--t-item) var(--ease-sheet)";
  // peekの着地(translateY 8→0 / scale 0.95〜1→1)は、以前は「indexが進んで
  // このカードがtop役に切り替わる瞬間」に合わせて起こしていた。しかし
  // それだと『役割の切り替え』と『見た目の値が変わる』が同一のReact
  // コミットで同時に起こることになり、CSSトランジションが正しく発火する
  // 保証がない(スワイプ直後に一瞬で位置が飛ぶ=ガクつきの実体だった。
  // Chromiumでは大抵ごまかせても機種依存で再現したりしなかったりする
  // 不安定な挙動で、そもそもの設計として壊れていた)。
  // 正しい直し方は「いつ着地させるか」をindexの切り替わりから切り離すこと。
  // exitがセットされた瞬間(=手前のカードが飛び始める瞬間)に、peekの
  // 着地アニメーションも同じ長さ(0.32s)で同時に開始する。320ms後に
  // 実際にindexが進んでこのカードがtop役になる頃には、transformの値は
  // 既に定位置(0,0)・scale(1)に収まっているため、役割切り替えの瞬間には
  // 見た目上なにも変化しない=原理的にガクつきようがなくなる。
  const peekTransform = exit
    ? "translate(0, 0px) scale(1) rotate(0deg)"
    : `translate(0, 8px) scale(${0.95 + Math.min(Math.abs(drag.dx) / SWIPE_THRESHOLD, 1) * 0.05}) rotate(0deg)`;
  const peekTransition = exit
    ? "transform var(--t-out) var(--ease-sheet)"
    : drag.active ? "none" : "transform var(--t-item) var(--ease-sheet)";
  // top(手前)とpeek(次)を別々のDOM要素として固定していると、決定直後に
  // indexが進んだ瞬間、peekだったカードの要素が一旦消えてtop要素として
  // 新規マウントし直され、それまでのtransformが引き継がれずガクッと
  // スナップして見えていた。カードのidそのものをkeyにして同じ要素を
  // 使い回すことで、「peekの見た目→topの見た目」への変化を1枚の要素の
  // transformアニメーションとして連続させる(上のpeekTransform/exit連動と
  // 合わせて、役割が切り替わる瞬間には要素の位置もtransition設定も
  // 何一つ変化しない状態を作る)。
  const visibleCards: { card: DeckCard; isTop: boolean }[] = [
    ...(deck[index] ? [{ card: deck[index], isTop: true }] : []),
    ...(deck[index + 1] ? [{ card: deck[index + 1], isTop: false }] : []),
  ];

  return (
    <>
      <Masthead title={appTitle("life")} />
      <div style={{ display: "flex", gap: SPACE.xs, padding: `${SPACE.md}px ${SPACE.xs}px ${SPACE.lg}px` }}>
        {deck.map((c, i) => (
          <span key={c.id} style={{ flex: 1, height: 3, borderRadius: RADIUS.sm, background: allDecisions[c.id] === "keep" || allDecisions[c.id] === "answered" ? (c.type === "checkin" || c.type === "milestone" ? GREEN : BLUE) : allDecisions[c.id] ? SHADE_DEEP : i === index && !done ? INK : "rgba(26,26,24,0.1)", transition: "background var(--t-item) var(--ease-settle)" }} />
        ))}
      </div>

      {!done ? (
        // ページ本体はスクロールしない(AppShell側でこのタブの間だけ
        // overflow-yをhiddenにしている)ので、ここがそのまま「残りの
        // 高さいっぱい」になる。カードの実寸はarenaRefで実測したこの枠の
        // サイズから直接計算する(詳細はarenaRefの定義部のコメント参照)。
        // 育成カード(checkin/milestone)の「あとで/記録する」フッターは
        // isGrowthに関わらず常に同じ高さ(GROWTH_FOOTER_SLOT)の枠を確保して
        // おく。これにより、枠(=arenaRefが測る対象)の実寸がフッターの
        // 有無で変わらなくなり、スワイプで育成カードが先頭に昇格した瞬間に
        // カード全体(と本文の折り返し位置)がガクッと動く不具合が構造的に
        // 起こらなくなる。
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* overflowはvisibleのまま(以前はhiddenにしていた)。カードの
              SOFT_SHADOW_LGは要素の外側に描かれるため、hiddenだと左右・
              下側で途中から切れて見えていた。スワイプ確定後にカードを
              画面外まで大きくtranslateXさせるアニメーションがあるが、
              このタブは滞在中ずっとdocument.body.style.overflowを
              hiddenにロックしているため、ここをvisibleにしても実際に
              ページがスクロール/横に伸びることはない。 */}
          <div ref={arenaRef} style={{ flex: "1 1 auto", minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: `${SPACE.md}px 0` }}>
            <main style={{
              position: "relative",
              width: cardBox ? cardBox.w : "min(88vw, 340px)",
              height: cardBox ? cardBox.h : undefined,
              aspectRatio: cardBox ? undefined : BRIEF_CARD_ASPECT,
              /* ★下のフッターの予約枠のぶんだけ下げる（大きさは1pxも変えない）。 */
              transform: cardBox ? `translateY(${cardBox.lift}px)` : undefined,
            }}>
              {visibleCards.map(({ card, isTop }) => (
                <div
                  key={card.id}
                  {...(isTop ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } : {})}
                  style={isTop ? {
                    position: "absolute", inset: 0, zIndex: 2, transform: topTransform, transition: topTransition,
                    touchAction: isGrowth ? "auto" : "none", cursor: isGrowth ? "default" : drag.active ? "grabbing" : "grab",
                  } : {
                    position: "absolute", inset: 0, zIndex: 1, transform: peekTransform, transition: peekTransition,
                  }}
                >
                  <CardFace card={card} dx={isTop ? drag.dx : 0} isTop={isTop}
                    onOpenBinder={isTop ? () => setBinderItem(card as BriefCard) : undefined}
                    checkinValue={isTop ? checkinAnswer : ""} onCheckinChange={isTop ? setCheckinAnswer : () => {}}
                    milestoneText={isTop ? milestoneText : ""} onMilestoneTextChange={isTop ? setMilestoneText : () => {}}
                    milestoneRating={isTop ? milestoneRating : null} onMilestoneRatingChange={isTop ? setMilestoneRating : () => {}}
                    flagged={isTop ? !!allFeedback[card.id] : undefined} onFlag={isTop ? () => toggleFlag(card.id) : undefined}
                    onRead={isTop && !isGrowthCard(card) && (card as BriefCard).isInfo ? () => setReadItem(card as BriefCard) : undefined} />
                </div>
              ))}
            </main>
          </div>
          {/* 育成カード(テキスト入力を伴う)はドラッグを無効にしているため、
              代わりにボタンで決定させる必要がある。通常カードはスワイプだけで
              完結するため、下部にボタンは置かない。以前はSKIP/KEEPの控えめな
              ヒント文字を置いていたが、カードのドロップシャドウがその文字と
              重なる位置で境目のように見えてしまっていたため撤廃した。 */}
          {/* isGrowthに関わらず常にこの高さの枠を確保する(理由は上の
              コメント参照)。position+zIndexを明示しないと、この非配置
              (static)要素はAppShell側のnav手前のグラデーション
              (zIndex:15、画面下端に常駐)より低い描画レイヤーに置かれ、
              フッターがタブバーの直前でうっすら覆われて見づらくなる。
              バインド！ボタンと同じzIndex:26にして、常にグラデーション・
              navより手前に出す。
              ★zIndexを上げただけでは直りきらなかった: z-indexは「重なった
              時にどちらが手前か」を決めるだけで、要素の透明な部分(ボタン
              同士の隙間・下のpaddingの余白)まで裏を隠すわけではない。
              この枠自体がbackground:transparentのままだったため、隙間から
              下のグラデーション(zIndex:15)がそのまま透けて見え続けていた。
              育成カードでボタンが出ている間だけ、枠自体にページ背景色(BG)を
              敷き、矩形の範囲を丸ごと不透明にすることで、隙間からの透過を
              構造的に無くした(通常カードの時はこの枠は中身が無く見えない
              ため、透明のままにしてカードの影の抜けに影響しないようにする)。
              ★上記だけでは別の境目が生まれた: このフッターのすぐ上にある
              カード自体のSOFT_SHADOW_LG(ぼかしの効いたドロップシャドウ)は
              枠(arenaRef)の外まで滲み出て、本来は徐々にページ背景色へ
              溶け込んでいくはずだった。ところがフッターは矩形のまま一枚岩の
              不透明なBGで、かつzIndexがカードより高いため、影がまだ薄く
              残っている途中の位置でスパッと不透明な壁に切り取られてしまい、
              「影がここで終わっている」という直線的な境目に見えていた。
              フッターの上端を単色の壁ではなく、影の減衰と同じ向きに
              透明→不透明へ滲むグラデーションにすることで、影の自然な
              フェードアウトと視覚的に連続するようにした(境目そのものを
              無くすのではなく、境目が見えなくなるまで滑らかにする)。
              フェードは20pxで完了させ、下側の大部分(タブバー直前の
              もやが出る領域=26px分)は引き続き完全に不透明なままにして
              いるため、もやを隙間から通す構造的な穴は生まれない。 */}
          <footer style={{
            position: "relative", zIndex: 26, minHeight: GROWTH_FOOTER_SLOT, paddingBottom: isGrowth ? SPACE.sm : 0, flexShrink: 0,
            background: isGrowth ? `linear-gradient(to bottom, ${BD_GREY}00 0, ${BD_GREY} 20px, ${BD_GREY} 100%)` : "transparent",
          }}>
            {isGrowth && (
              <div style={{ display: "flex", gap: SPACE.md }}>
                <button onClick={() => commit("skip")} style={{ flex: 1, padding: `${SPACE.md}px 0`, background: "transparent", border: "1.5px solid rgba(26,26,24,0.3)", borderRadius: RADIUS.pill, fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold, letterSpacing: TRACK.caps, color: SECOND, cursor: "pointer" }}>あとで</button>
                <button onClick={() => commit("keep")} disabled={!canRecord} style={{ flex: 1.4, padding: `${SPACE.md}px 0`, background: isMilestone ? RUST : GREEN, border: "none", borderRadius: RADIUS.pill, fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold, letterSpacing: TRACK.caps, color: isMilestone ? PAPER : GREEN_INK, cursor: canRecord ? "pointer" : "default", opacity: canRecord ? 1 : 0.4 }}>記録する</button>
              </div>
            )}
          </footer>
        </div>
      ) : deck.length === 0 ? (
        // デッキがまだ無い(夜間Cronが未生成、または候補ゼロ)状態。クライアントには
        // 「生成中/失敗」を判別する信号が無い(Cronはサーバー側)ため、両方を
        // 正直に包む文言にし、幾何学のしるしを添える。
        <main className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: `${SPACE.xxl}px ${SPACE.xs}px`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: SPACE.xl }}>
          <WaitingMark />
          <div style={{ fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.lead, lineHeight: LEAD.body, color: MUTED, textAlign: "center" }}>
            まだ何も集まっていません。<br />見つかったらここに並びます。
          </div>
        </main>
      ) : (
        <main className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: `${SPACE.xxl}px ${SPACE.xs}px` }}>
          <SectionLabel text="今日はここまで" style={{ marginBottom: SPACE.lg }} />
          {keptCards.map((c, i) => (
            <div key={c.id} style={{ display: "flex", alignItems: "baseline", gap: SPACE.md, padding: `${SPACE.md}px 0`, borderTop: `1px solid ${HAIRLINE}` }}>
              <span style={{ fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.lead, color: INK, minWidth: 28 }}>{String(i + 1).padStart(2, "0")}</span>
              <div style={{ fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.lead }}>{c.title}</div>
            </div>
          ))}
          <button onClick={() => goTab("execute")} style={{ marginTop: SPACE.xl, width: "100%", padding: `${SPACE.md}px 0`, background: INK, border: "none", borderRadius: RADIUS.pill, cursor: "pointer", fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold, letterSpacing: TRACK.caps, color: PAPER }}>
            プランタブで地図を見る
          </button>
        </main>
      )}
      <BinderModal item={binderItem} onClose={() => setBinderItem(null)} />
      {readItem && (
        // 情報カードの「記事を読む」全画面ビュー。detail(記事の半分要約)を読む。
        // 生成時に作った要約なので、その場で取得せず即表示・オフラインでも読める。
        <div
          onClick={() => setReadItem(null)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(26,26,24,0.55)", display: "flex", justifyContent: "center", alignItems: "flex-end" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 640, maxHeight: "88vh", background: PAPER, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: `${SPACE.xl}px ${SPACE.xl}px calc(${SPACE.xxl}px + env(safe-area-inset-bottom))` }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: SPACE.md, marginBottom: SPACE.md }}>
              <span style={{ fontSize: TYPE.micro, color: MUTED, fontWeight: WEIGHT.bold, letterSpacing: TRACK.normal, paddingTop: SPACE.xs }}>{readItem.category}{readItem.trigger ? ` ・ ${readItem.trigger}` : ""}</span>
              <button onClick={() => setReadItem(null)} aria-label="閉じる" style={{ background: "rgba(26,26,24,0.06)", border: "none", borderRadius: RADIUS.pill, width: 30, height: 30, cursor: "pointer", fontSize: TYPE.lead, fontWeight: WEIGHT.text, color: INK, flexShrink: 0 }}>✕</button>
            </div>
            <h2 style={{ margin: `0 0 ${SPACE.lg}px`, fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.head, lineHeight: LEAD.snug, color: INK }}>{readItem.title}</h2>
            {(readItem.detail && readItem.detail.trim() ? readItem.detail : readItem.body)
              .split(/\n{2,}|\n/).filter((p) => p.trim())
              .map((para, i) => (
                <p key={i} style={{ margin: `0 0 ${SPACE.lg}px`, fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.text, lineHeight: LEAD.body, color: CHARCOAL }}>{para.trim()}</p>
              ))}
            {readItem.sourceUrl && (
              <a href={readItem.sourceUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                style={{ display: "inline-block", marginTop: SPACE.xs, fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold, color: INK, textDecoration: "none" }}>
                元の記事を開く →{readItem.sourceLabel ? ` (${readItem.sourceLabel})` : ""}
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}
