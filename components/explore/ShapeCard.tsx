"use client";

import { useId } from "react";
import { DISPLAY, INK, OFFER_BEZEL, OFFER_LABEL_CAP, OFFER_LABEL_W, PAPER, TITLE } from "@/lib/constants";
import { cardShapePath, type CardShape } from "@/lib/cardShape";
import { LEAD, TRACK, WEIGHT } from "@/lib/tokens";

// ★★★**ホームの山の「提案の図形」と同じ見え方の札（DOM／SVG 版）**（2026-09-28・第134巡にユーザー指定
//   「**ストックのカードが現状のデザインになっていないので、既存のストックも含めて、ホームの図形と同じに**」）。
// ★作りは `components/home/pilePaint.ts` の提案と同じ … 形は `lib/cardShape.ts`（ドメインの形）、面はドメインの色、
//   写真は**形いっぱいに切り抜き**、同じ輪郭を**縁の2倍の太さで引いて内側の半分だけ残す**（＝ 輪郭から一定の幅の
//   ベゼル。拡大縮小で作らない ―― 出っ張りで太く・へこみで細くなる）。縁の幅は `OFFER_BEZEL`（山と同じ1つ）。
// ★写真が無ければ英語の1語（`DISPLAY`）を真ん中に。★`more` を渡すと写真をぼかして「+N」を載せる（束の最後の1枚）。
// ★形は 0〜1 の器で書いてあるので、SVG の `viewBox` を 0〜1 にすれば**器の寸法の計算が要らない**。

export function ShapeCard({ shape, face, ink, photo, label, more, size }: {
  shape: CardShape;
  face: string;
  ink: string;
  photo?: string;
  label: string;
  /** 束の最後の1枚に載せる「+N」。 */
  more?: number;
  /** 一辺（px）。★渡さなければ**器の幅いっぱいの正方形**（字の大きさは器の幅に対する `cqw` で決まる）。 */
  size?: number;
}) {
  const id = useId().replace(/:/g, "");   /* ★目盛りの外（id に使えない文字を落とす） */
  const d = cardShapePath(shape);
  // ★縁は「半径 × OFFER_BEZEL」。器の一辺 ＝ 直径 ＝ 1 なので、半径 0.5 × 比 × 2（線の内側の半分だけ残る）。
  const stroke = OFFER_BEZEL;
  // ★字の大きさは「一辺に対する比」で持ち、px（一辺が分かるとき）か cqw（器の幅に合わせるとき）で渡す。
  //   ★Anton の1字の幅は字の大きさの約 0.46 倍 ―― 語の長さから一度で解ける。★目盛りの外（書体の実測）。
  const k = Math.min(OFFER_LABEL_CAP, OFFER_LABEL_W / Math.max(1, label.length * 0.46));
  const len = (r: number) => (size ? size * r : `${r * 100}cqw`);
  return (
    <div style={size ? { position: "relative", width: size, height: size } : { position: "relative", width: "100%", aspectRatio: 1, containerType: "inline-size" }}>
      <svg viewBox="0 0 1 1" width="100%" height="100%" style={{ display: "block", overflow: "visible" }} aria-hidden>
        <defs>
          <clipPath id={`c${id}`}><path d={d} /></clipPath>
          {more !== undefined && (
            <filter id={`b${id}`} x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="0.035" />
            </filter>
          )}
        </defs>
        <path d={d} fill={face} />
        {photo && (
          <g clipPath={`url(#c${id})`}>
            <image href={photo} x="0" y="0" width="1" height="1" preserveAspectRatio="xMidYMid slice"
              filter={more !== undefined ? `url(#b${id})` : undefined} />
            {more !== undefined && <rect x="0" y="0" width="1" height="1" fill={PAPER} opacity="0.35" />}
            <path d={d} fill="none" stroke={face} strokeWidth={stroke} strokeLinejoin="round" />
          </g>
        )}
      </svg>
      {(!photo || more !== undefined) && (
        <span style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: more !== undefined ? TITLE : DISPLAY, fontSize: len(more !== undefined ? OFFER_LABEL_CAP : k),
          fontWeight: more !== undefined ? WEIGHT.bold : WEIGHT.text, lineHeight: LEAD.flat, letterSpacing: TRACK.tight,
          color: more !== undefined ? INK : ink, pointerEvents: "none",
        }}>{more !== undefined ? `+${more}` : label}</span>
      )}
    </div>
  );
}
