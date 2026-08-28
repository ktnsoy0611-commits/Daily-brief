"use client";

import { NIPPER_PAINT as P } from "@/lib/constants";
import { orthoBounds, orthoOrder, type Face, type Ortho } from "@/lib/nipperSolid";
import { nipperSolids, NIPPER_DIM_FAR } from "@/components/explore/Nipper";

// ★★開発用の三面図。**形を言葉で詰めるための道具**で、本番には出ない。
//   パースの付いた1枚では「どの面がおかしいか」を指せない。正面・側面・上面を
//   素直な正射影で並べて、面ごとに指摘できるようにする。
// ★この道具の機構は x–y 面にある（腕はここで開く）ので、**正面図が実物の側面写真に
//   あたる**。側面図は厚み、上面図は頭の断面を見る。
// ★★★**3面は同じ縮尺で並べる**（製図と同じ）。面ごとに枠へ合わせて拡大すると、
//   厚みと幅の関係が読めなくなり、指摘のしようがなくなる。
// ★このファイルはまるごと図形の座標系（design.md §7）。数値は目盛りに乗せない。

const VIEWS: { id: Ortho; ja: string; note: string }[] = [
  { id: "front", ja: "正面", note: "機構の面。実物の「横から」の写真にあたる" },
  { id: "side", ja: "側面", note: "厚み。右から見ている" },
  { id: "top", ja: "上面", note: "真上から。画面の下が手前" },
];
/** 3面を収める高さ（px）。★目盛りの外（検証用の枠）。 */
const H = 460;
const PAD = 24;

export function NipperTriView({ label }: { label: (v: typeof VIEWS[number]) => React.ReactNode }) {
  const s = nipperSolids();
  const all: Face[] = [...s.frame, ...s.lever, ...s.coil, ...s.slot];
  const box = VIEWS.map((v) => ({ v, b: orthoBounds(all, v.id) }));
  const scale = H / Math.max(...box.map(({ b }) => b.h));

  return (
    <>
      {box.map(({ v, b }) => {
        const paint = (faces: Face[], dim = 0, flat?: string) =>
          orthoOrder(faces, v.id).map((f, i) => {
            const c = flat ?? P.ramp[Math.max(0, Math.min(P.ramp.length - 1, f.tone + dim))];
            return <path key={i} d={f.d} fill={c} stroke={c} strokeWidth={0.6} />;
          });
        return (
          <div key={v.id}>
            {label(v)}
            <svg
              viewBox={`${b.x - PAD} ${b.y - PAD} ${b.w + PAD * 2} ${b.h + PAD * 2}`}
              width={Math.round((b.w + PAD * 2) * scale)}
              height={Math.round((b.h + PAD * 2) * scale)}
              aria-hidden style={{ display: "block" }}
            >
              {/* ★描く順は本番と同じ（奥の梃子 → バネ → 頭と柄 → スリット）。 */}
              {paint(s.lever, NIPPER_DIM_FAR)}
              {paint(s.coil)}
              {paint(s.frame)}
              {paint(s.slot, 0, P.gap)}
            </svg>
          </div>
        );
      })}
    </>
  );
}
