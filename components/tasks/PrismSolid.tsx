"use client";

import { useMemo } from "react";
import { PAPER } from "@/lib/constants";
import { shade } from "@/lib/helpers";
import { boundsOf, fitTo, prismDraw, toPath } from "@/lib/prism";

// ★閉じた柱体を SVG の**平行投影**で描く。面ごとにベタ塗り1色だけで、
// 線もグラデーションも使わない(§38 のデザイン言語)。円柱なら
// 「長方形 + 楕円」という、そのままバウハウスの円柱の絵になる。
//
// CSS の 3D 変形は一切使っていない。3D座標は lib/prism.ts が持ち、
// ここは投影済みの多角形を塗るだけ(§ このコードベースが Safari の 3D 合成で
// 何度も崩れた経緯があるため)。

/** 面の明るさ(0〜1)→ 塗りの色。
 *  いちばん明るい面(上の底面、light≒0.90)がちょうど PAPER になり、そこから
 *  暗い側へ大きく開く。地(BD_GREY)より確実に明るい面と暗い面の両方を持たせて、
 *  立体が地から浮いて見えるようにしてある。 */
export const faceFill = (light: number, base = PAPER) => shade(base, (light - 0.9) * 62);

export function PrismSolid({ faceCount, size, opacity = 1 }: { faceCount: number; size: number; opacity?: number }) {
  const paths = useMemo(() => {
    const faces = prismDraw(faceCount, 0);
    const { scale, dx, dy } = fitTo(boundsOf(faces), size, size, size * 0.06);
    return faces.map((f, i) => ({ key: `${f.slot}-${i}`, d: toPath(f.points, scale, dx, dy), fill: faceFill(f.light) }));
  }, [faceCount, size]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden focusable="false" style={{ display: "block", opacity }}>
      {/* 奥から順(prismDraw が depth 昇順で返す)。凸な立体なので、
          この順に塗るだけで裏の面は正しく隠れる。
          ★同じ色で縁取りもする。曲面は小片に割って描くので、隣り合う小片の
          継ぎ目にアンチエイリアスの隙間(細い明るい筋)が出る。塗りと同じ色の
          細い線で縁を太らせると、形を変えずにその筋だけが消える。 */}
      {paths.map((p) => (
        <path key={p.key} d={p.d} fill={p.fill} stroke={p.fill} strokeWidth={0.8} strokeLinejoin="round" />
      ))}
    </svg>
  );
}
