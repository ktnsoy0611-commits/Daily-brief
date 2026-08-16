"use client";

import { useEffect, useRef, useState } from "react";
import { paintKey, paintShape, shapeBounds, type SolidPaint } from "@/lib/solidPaint";
import { onFontsReady } from "@/lib/textFit";

// ★図形を1つ描くだけの部品。候補タブの円環と、設定画面のプレビューが使う。
// 3D は持たない — 真横から見た立面をベタ塗りするだけ。

export function SolidCanvas({ paint, w, h, opacity = 1, unit: fixedUnit }: {
  paint: SolidPaint; w: number; h: number; opacity?: number;
  /** 1単位を何pxで描くか。★渡すと「器に目一杯」ではなく**この倍率**で描く。
   *  入力画面のプレビューが使う — 器に合わせて拡大すると、重要度を上げても
   *  絵の大きさが変わらず「大きさ = 重要度」が見えなくなるため。 */
  unit?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // 書体が揃ったら一度だけ描き直す(最初の描画は fallback の書体のため)。
  const [fontsTick, setFontsTick] = useState(0);
  // 分割配信の断片が届くたびに焼き直す(初回は fallback の書体で描かれる)。
  useEffect(() => onFontsReady(() => setFontsTick((t) => t + 1)), []);
  // 中身が変わったときだけ描き直す。毎レンダーで焼き直すと、円環のドラッグ中に
  // 何度も描き直すことになる。
  const key = `${paintKey(paint, 1)}|${fontsTick}|${fixedUnit ?? 0}`;

  useEffect(() => {
    const cv = ref.current;
    if (!cv || w <= 0 || h <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // 器の中央に、はみ出さない倍率で収める。
    const box = shapeBounds(paint);
    const pad = Math.min(w, h) * 0.04;
    const fit = Math.min(
      (w - pad * 2) / Math.max(box.maxX - box.minX, 1e-6),
      (h - pad * 2) / Math.max(box.maxY - box.minY, 1e-6),
    );
    // 倍率を渡されたときは、それを使う(器からはみ出す分だけは詰める)。
    const unit = fixedUnit ? Math.min(fixedUnit, fit) : fit;
    ctx.translate(w / 2, h / 2);
    paintShape(ctx, paint, unit, dpr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, w, h]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ display: "block", width: w, height: h, opacity, pointerEvents: "none" }}
    />
  );
}
