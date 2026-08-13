"use client";

import { useEffect, useRef } from "react";
import { boundsOf, silhouette } from "@/lib/solid";
import { paintKey, paintSolid, type SolidPaint } from "@/lib/solidPaint";

// ★立体を1つ描くだけの部品。候補タブの円環と、展開図のプレビューが使う。
// 描画は canvas(平行投影)。CSS の 3D 変形は使わない。

export function SolidCanvas({ paint, w, h, opacity = 1 }: {
  paint: SolidPaint; w: number; h: number; opacity?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // 中身が変わったときだけ描き直す。毎レンダーで焼き直すと、円環のドラッグ中に
  // 何度も描き直すことになる。
  const key = paintKey(paint, 1);

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
    const box = boundsOf(silhouette(paint.spec));
    const pad = Math.min(w, h) * 0.05;
    const unit = Math.min(
      (w - pad * 2) / Math.max(box.maxX - box.minX, 1e-6),
      (h - pad * 2) / Math.max(box.maxY - box.minY, 1e-6),
    );
    ctx.translate(w / 2 - ((box.minX + box.maxX) / 2) * unit, h / 2 - ((box.minY + box.maxY) / 2) * unit);
    paintSolid(ctx, paint, unit);
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
