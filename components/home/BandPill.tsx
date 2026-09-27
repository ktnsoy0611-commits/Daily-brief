"use client";

import { groundOf } from "@/components/AppBackdrop";
import { BAND_BEZEL, INK, SANS } from "@/lib/constants";
import { img } from "@/lib/helpers";
import {
  BAND_DOT, BAND_EDGE, BAND_OFFER_LINE, BAND_OFFER_TEXT, bandLines,
} from "@/lib/homeBand";
import { PILL_EDGE, type PillLook } from "@/lib/pullDrag";
import { RADIUS, SPACE, TRACK, WEIGHT } from "@/lib/tokens";

// ★★★**帯のピルの版面はここ1つ**（2026-09-27・第133巡）。
//   ユーザー指定「**ニュースも写真を一緒にとってきて、提案のピルとデザインを統一**」
//   「**写真がない時は色付きの小さい丸をピルの左に少し置いておく**」＋ A3（墨の線）。
//   ★★読む手は3つ … 下の段のピル（`Band.tsx` の `Pill`）／ニュースのピル（`NewsCard.tsx`）／
//     札が閉じ切るときの写し（同）。**3つが同じ版面**なので、閉じた札とピルが画素まで揃う。
//   ★★引き下ろしの写し取り（canvas。`pillGhost.ts`）は `pillLook()` の数を読む。

/** ★丸の直径 ＝ ピルの高さ − 縁取り2つぶん。 */
export const photoDia = (h: number) => h - BAND_BEZEL * 2;

/** ★左の余白（写真なら縁取りだけ／色の丸なら `SPACE.md`）。★線のぶんは `border` が持つ。 */
const padLeft = (photo: boolean) => (photo ? BAND_BEZEL : SPACE.md);

/** ★ピルの器の見た目（DOM）。★縁は墨の1色（A3）・中は地の色（後ろの図形を透かさない）。 */
export function pillBoxStyle(h: number, photo: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: SPACE.sm, flexShrink: 0,
    height: h, borderRadius: RADIUS.pill, boxSizing: "border-box",
    backgroundColor: groundOf("home"),
    border: `${PILL_EDGE}px solid ${BAND_EDGE}`,
    padding: `0 ${SPACE.lg}px 0 ${padLeft(photo)}px`,
    maxWidth: "84vw",
  };
}

/** ★ピルの中身（写真の丸か種類の色の丸 ＋ 2段組の題）。 */
export function PillContent({ text, face, photo, h, onBadPhoto }: {
  text: string; face: string; photo?: string; h: number;
  onBadPhoto?: (url: string) => void;
}) {
  const dia = photoDia(h);
  return (
    <>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img(photo, 200, 200)} alt=""
          onError={() => onBadPhoto?.(photo)}
          style={{
            width: dia, height: dia, borderRadius: RADIUS.circle,
            objectFit: "cover", display: "block", flexShrink: 0,
          }} />
      ) : (
        <span aria-hidden style={{
          width: BAND_DOT, height: BAND_DOT, borderRadius: RADIUS.circle,
          background: face, flexShrink: 0,
        }} />
      )}
      {/* ★★行は `bandLines()` が切る（canvas の写し取りと同じ所で折るため）。 */}
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        {bandLines(text, true).map((ln, i) => (
          <span key={i} style={{
            fontFamily: SANS, fontSize: BAND_OFFER_TEXT, fontWeight: WEIGHT.heavy,
            letterSpacing: TRACK.normal, lineHeight: `${BAND_OFFER_LINE}px`, color: INK,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{ln}</span>
        ))}
      </div>
    </>
  );
}

/**
 * ★★★引き下ろしの写し取り（canvas）が読む版面の数。**DOM と同じトークンから**作る。
 * `w`/`h`/`press`/`photo`（`<img>`）は呼ぶ側が実測して足す。
 */
export function pillLook(text: string, face: string, photo: boolean, h: number):
  Omit<PillLook, "w" | "h" | "press" | "photo"> {
  return {
    face, ink: INK, outlined: true, ground: groundOf("home"),
    text, textSize: BAND_OFFER_TEXT, lines: bandLines(text, true),
    dia: photoDia(h), gap: SPACE.sm,
    padL: PILL_EDGE + padLeft(photo), padR: PILL_EDGE + SPACE.lg,
    edge: BAND_EDGE, dot: photo ? undefined : face, dotD: BAND_DOT,
  };
}
