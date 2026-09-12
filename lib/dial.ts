// ★★★**録音のダイヤル（大きな円 ＋ 縁の目盛り）の寸法はここ1つ**（2026-09-12・第93巡）。
//
// ★★★**なぜ切り出したか。** 同じ円が**2つの技術**で描かれる ――
// `components/VoiceStudio.tsx` は **SVG**（`viewBox 0 0 100 100`）、
// ホームの山（`components/home/pilePaint.ts`）は **canvas**。
// **同じ数を2度書くと必ず食い違う**（`lib/wordPlate.ts` で学んだのと同じこと ――
// 板だけ DOM で組み直していたせいで、板まわりだけ挙動が違った）。
// ★だから**数は下の3つだけ**にし、SVG も canvas もここを読む。

/** 目盛りの本数。★目盛りの外（部品の寸法）。 */
export const DIAL_TICKS = 5;

/** 寸法を持つ座標系の一辺（＝SVG の `viewBox` と同じ 100）。直径がこれに当たる。 */
export const DIAL_VIEW = 100;

/**
 * 縁の目盛り1本。**直径 100 に対する比**で持つ（円の大きさが変わっても形が保たれる）。
 * ★**角は丸めない**（短く太い線。`VoiceStudio` の元の指定）。
 * ★目盛りの外（部品の寸法）。
 */
export const DIAL_TICK = { w: 1.46, h: 4.5, inset: 0.8 } as const;

/**
 * canvas に円と目盛りを描く（**原点が円の中心**。`ctx` の変形は呼ぶ側の責任）。
 * ★★**目盛りは体と一緒に回す** ―― 回らないと「面に描いてある」ではなく
 * 「上に浮いている」ように見える（山のバッジの数字と同じ理由）。
 */
export function drawDial(
  ctx: CanvasRenderingContext2D, r: number, face: string, ink: string,
): void {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = face;
  ctx.fill();
  // 直径 100 の座標系 → 実寸への倍率。
  const k = (r * 2) / DIAL_VIEW;
  ctx.fillStyle = ink;
  for (let i = 0; i < DIAL_TICKS; i++) {
    ctx.save();
    ctx.rotate((i / DIAL_TICKS) * Math.PI * 2);
    ctx.fillRect(
      -(DIAL_TICK.w * k) / 2, -r + DIAL_TICK.inset * k,
      DIAL_TICK.w * k, DIAL_TICK.h * k,
    );
    ctx.restore();
  }
}
