"use client";

import { PlaneFill } from "@/components/Binder";
import { APPS } from "@/lib/apps";
import { SHADE } from "@/lib/constants";

// ★アプリごとの背景シンボル。3アプリの地の色を「ほんとに薄いグレー」1色へ
// 統一した代わりに、どのアプリにいるかを **大きな図形ひとつ** で伝える
// (ネオバウハウス化、2026-08-02のユーザー指定)。
//
// 設計上の決めごと:
//   - 図形の語彙は新しく作らず、バインダー(Binder.tsx の PlaneShape /
//     PlaneFill)をそのまま借りる。置き場所も、バインダーが「帯の位置で種別を
//     分ける」のと同じ考えを画面に写している(lib/apps.ts の symbol を参照)。
//   - 色は SHADE 1色だけ。地(BG)との明度差しか持たない「地に溶ける透かし」に
//     する(ユーザー選択)。ここを濃くすると主張が強くなりすぎるので、
//     constants.ts の SHADE を触るとき以外はこのファイルで色を作らない。
//   - 3アプリぶんを横一列のトラックとして並べ、AppShellのページングと同じ
//     オフセットで動かす。ただし PARALLAX を掛けて中身よりゆっくり流す。
//     背景が中身と同じ速さで動くと「1枚の板が滑っている」だけに見えるが、
//     遅らせると奥行きが出る。
//   - pointerEvents:none。ここは絶対に触れない層。

// 中身に対する背景の移動比。1で完全に同じ速さ、0で固定。
const PARALLAX = 0.55;

export function AppBackdrop({ index, dragRatio, animate }: {
  // いま何番目のアプリを見ているか(APPSの添字)。
  index: number;
  // 指で引いている量。画面幅に対する比(右へ引くと正)。
  dragRatio: number;
  // 指を離したあとの落ち着きにトランジションを掛けるか(ドラッグ中はfalse)。
  animate: boolean;
}) {
  const offset = (-index + dragRatio) * PARALLAX;
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      <div style={{
        position: "absolute", inset: 0, width: `${APPS.length * 100}%`,
        transform: `translateX(${(offset * 100) / APPS.length}%)`,
        transition: animate ? "transform 0.38s cubic-bezier(0.32,0.72,0,1)" : "none",
        willChange: "transform",
      }}>
        {APPS.map((a, i) => (
          <div key={a.id} style={{
            position: "absolute", top: 0, bottom: 0,
            left: `${(i * 100) / APPS.length}%`, width: `${100 / APPS.length}%`,
            overflow: "hidden",
          }}>
            {/* 一辺を画面幅基準の正方形にして、円・四半円・半円が常に真円
                ベースになるようにする(PlaneFillの前提。Binder.tsxの
                SquareCellと同じ理由)。 */}
            <div style={{
              position: "absolute", width: `${a.symbol.size * 100}%`, aspectRatio: "1 / 1",
              left: `${a.symbol.x * 100}%`, top: `${a.symbol.y * 100}%`,
              transform: "translate(-50%, -50%)",
            }}>
              <PlaneFill shape={a.symbol.shape} color={SHADE} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
