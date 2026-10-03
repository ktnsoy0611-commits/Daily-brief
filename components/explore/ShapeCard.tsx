"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { DISPLAY, INK, OFFER_BEZEL, OFFER_LABEL_CAP, OFFER_LABEL_W, PAPER, TITLE } from "@/lib/constants";
import { traceCardShape, type CardShape } from "@/lib/cardShape";
import { thumbPx, useThumb } from "@/lib/photoThumb";
import { LEAD, SPACE, TRACK, WEIGHT } from "@/lib/tokens";

// ★★★**ホームの山の「提案の図形」と同じ見え方の札（DOM 版）**（2026-09-28・第134巡にユーザー指定
//   「**ストックのカードが現状のデザインになっていないので、既存のストックも含めて、ホームの図形と同じに**」）。
// ★作りは `components/home/pilePaint.ts` の提案と同じ … 形は `lib/cardShape.ts`（ドメインの形）、面はドメインの色、
//   写真は**形いっぱいに切り抜き**、同じ輪郭を**縁の2倍の太さで引いて内側の半分だけ残す**（＝ 輪郭から一定の幅の
//   ベゼル。拡大縮小で作らない ―― 出っ張りで太く・へこみで細くなる）。縁の幅は `OFFER_BEZEL`（山と同じ1つ）。
// ★写真が無ければ英語の1語（`DISPLAY`）を真ん中に。★`more` を渡すと写真をぼかして「+N」を載せる（束の最後の1枚）。
// ★★★**絵は canvas 1枚に焼く**（2026-10-03・第136巡。ユーザー報告「**stock をスクロールするとフレームレートが落ちる。
//   画像が増えることで**」）。第134〜135巡は SVG の `<image>` に**原寸の写真**を渡し、束の札ごとに CSS の `drop-shadow` を
//   掛けていた ―― 解いた原寸を抱え（実測 28枚で 105MB）、影は札ごとに別の面で塗っていたので、**画像の数に比例して重い**。
//   → 写真は `lib/photoThumb.ts` が**表示の大きさへ1度だけ**縮め、ここは面・写真・縁・影を**1度だけ**焼く。
//   以後の送りは焼いた絵を動かすだけ（描き直すのは大きさか写真が変わったときだけ）。

/** 影（`SOFT_SHADOW` ＝ 0 2px 6px rgba(28,28,30,0.08) と同じ値を canvas の言葉で）。★目盛りの外（影の値の写し）。 */
const SHADOW = { y: 2, blur: 6, color: "rgba(28,28,30,0.08)" };
/** 影のぶんだけ canvas を外へ広げる量。 */
const BLEED = SPACE.sm;
/** 「+N」のぼかし ＝ 写真をこの比まで縮めてから引き伸ばす（SVG の `stdDeviation` 0.035 相当）。★目盛りの外（見え方の写し）。 */
const BLUR_DOWN = 1 / 14;
/** 「+N」の写真に重ねる紙の濃さ。★目盛りの外（見え方の写し）。 */
const VEIL = 0.35;

function paint(cv: HTMLCanvasElement, o: {
  size: number; dpr: number; shape: CardShape; face: string;
  photo?: HTMLCanvasElement; more: boolean; shadow: boolean;
}) {
  const { size, dpr, shape, face, photo, more, shadow } = o;
  const pad = shadow ? BLEED : 0;
  const W = Math.max(1, Math.round((size + pad * 2) * dpr));
  if (cv.width !== W || cv.height !== W) { cv.width = W; cv.height = W; }
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, W);
  const c = (pad + size / 2) * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, c, c);
  ctx.imageSmoothingQuality = "high";
  // ★面（と影）。★`shadowOffset`・`shadowBlur` は変換を受けないので装置の画素で渡す。
  if (shadow) {
    ctx.shadowColor = SHADOW.color;
    ctx.shadowBlur = SHADOW.blur * dpr;
    ctx.shadowOffsetY = SHADOW.y * dpr;
  }
  ctx.fillStyle = face;
  traceCardShape(ctx, shape, size);
  ctx.fill();
  ctx.shadowColor = "transparent";
  if (!photo) return;
  ctx.save();
  traceCardShape(ctx, shape, size);
  ctx.clip();
  if (more) {
    // ★ぼかしは「小さく縮めて引き伸ばす」（`ctx.filter` は iOS の Safari に無い）。
    const s = Math.max(2, Math.round(photo.width * BLUR_DOWN));
    const tiny = document.createElement("canvas");
    tiny.width = s; tiny.height = s;
    tiny.getContext("2d")?.drawImage(photo, 0, 0, s, s);
    ctx.drawImage(tiny, -size / 2, -size / 2, size, size);
    ctx.globalAlpha = VEIL;
    ctx.fillStyle = PAPER;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.globalAlpha = 1;
  } else {
    ctx.drawImage(photo, -size / 2, -size / 2, size, size);
  }
  // ★縁 ＝ 同じ輪郭を `2 × 幅` で引き、切り抜きの内側の半分だけ残す。
  ctx.lineWidth = size * OFFER_BEZEL;
  ctx.lineJoin = "round";
  ctx.strokeStyle = face;
  traceCardShape(ctx, shape, size);
  ctx.stroke();
  ctx.restore();
}

export function ShapeCard({ shape, face, ink, photo, label, more, size, shadow = false }: {
  shape: CardShape;
  face: string;
  ink: string;
  photo?: string;
  label: string;
  /** 束の最後の1枚に載せる「+N」。 */
  more?: number;
  /** 一辺（px）。★渡さなければ**器の幅いっぱいの正方形**（字の大きさは器の幅に対する `cqw` で決まる）。 */
  size?: number;
  /** 柔らかい影を焼き込む（束の札）。 */
  shadow?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  // ★大きさを渡されないときは器の幅を測る（2列の一覧・検索の結果）。
  const [measured, setMeasured] = useState(0);
  useLayoutEffect(() => {
    if (size) return;
    const el = boxRef.current;
    if (!el) return;
    const read = () => setMeasured(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);
  const side = size ?? measured;
  // ★画面の細かさの上限は 2（ホームの山と同じ）。
  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const thumb = useThumb(photo, side > 0 ? thumbPx(side, dpr) : 0);
  const pic = thumb instanceof HTMLCanvasElement ? thumb : undefined;
  // ★一度写真を描いたら、抱えきれずに手放された（`undefined` に戻った）ときも面だけに描き戻さない。
  const drewPhoto = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const cv = cvRef.current;
    if (!cv || side <= 0) return;
    if (!pic && photo && drewPhoto.current === photo) return;
    paint(cv, { size: side, dpr, shape, face, photo: pic, more: more !== undefined, shadow });
    drewPhoto.current = pic ? photo : undefined;
  }, [side, dpr, shape, face, pic, photo, more, shadow]);

  // ★字の大きさは「一辺に対する比」で持ち、px（一辺が分かるとき）か cqw（器の幅に合わせるとき）で渡す。
  //   ★Anton の1字の幅は字の大きさの約 0.46 倍 ―― 語の長さから一度で解ける。★目盛りの外（書体の実測）。
  const k = Math.min(OFFER_LABEL_CAP, OFFER_LABEL_W / Math.max(1, label.length * 0.46));
  const len = (r: number) => (size ? size * r : `${r * 100}cqw`);
  const pad = shadow ? BLEED : 0;
  // ★写真が来ないと分かったら英語の語へ落とす（来る途中は面だけ ―― 字が一瞬出て消えるのを避ける）。
  const showLabel = !photo || thumb === "bad" || (more !== undefined && !!pic);
  return (
    <div ref={boxRef} style={size ? { position: "relative", width: size, height: size } : { position: "relative", width: "100%", aspectRatio: 1, containerType: "inline-size" }}>
      <canvas ref={cvRef} aria-hidden style={{
        position: "absolute", left: -pad, top: -pad, width: `calc(100% + ${pad * 2}px)`, height: `calc(100% + ${pad * 2}px)`,
        display: "block", pointerEvents: "none",
      }} />
      {showLabel && (
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
