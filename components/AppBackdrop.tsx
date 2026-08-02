"use client";

import { PlaneFill } from "@/components/Binder";
import type { AppSymbol, AppTone } from "@/lib/apps";
import { SHADE } from "@/lib/constants";
import { shade } from "@/lib/helpers";

// ★アプリごとの背景。3アプリの地の色を「ほんとに薄いグレー」1色へ統一した
// 代わりに、どのアプリにいるかを背景の構図で伝える(2026-08-02)。
//
// 構図は **バインダーの表紙の geo(バショ) が持つ grid2x2**
// (components/Binder.tsx)と同じ文法にしてある:
//
//   正方形のブロックを真の2x2の正方形セルに割り、
//   セルごとに明度の段と、三角・円・扇形(四半円)・半円をひとつ置く
//
// バインダーが色相を持つのに対し、こちらはグレーの明度差だけで組む。
// 図形は Binder.tsx の PlaneFill をそのまま借り、新しい形は増やさない。
// 全セルを図形で埋める必要は無く(units 構図と同じ)、無地の色面や
// 下地のままの穴を混ぜてグリッドに間を作る。
//
// ★セルの大きさについて: ブロックは列の幅ちょうど(width:100%)で、それを
// grid で2x2に割るだけなので、セルは常に「画面幅の半分」を1辺とする真の
// 正方形になり、器からはみ出しようがない。以前は「帯の短辺を1辺とする
// 正方形」を並べていて、合計が帯の長辺を超えた分が切れていた(バインダーの
// タイケンで踏んだのと同じ轍。HANDOFF §7.28)。
//
// ★配置について: このコンポーネントは **各列(1画面ぶん)の中** に置く。
// 列は幅ちょうど1画面・overflow:hidden なので、はみ出した図形の切り取り線は
// 必ず画面の端と一致する = 「スワイプ中に画面の途中で図形が切れて見える」
// ことが構造的に起こらない。トラックのtransform1つで背景も中身も同時に
// 動くので、アプリ間の動きも繋がる。
//
// 奥行きは、レイヤーではなく **ブロックだけ** をわずかに遅らせて出す
// (globals.css の .app-backdrop-inner が --drag から算出する)。

// 明度の段。SHADE(#E9E9E6)を基準に振る。**幅を意図的に狭く取ってある**:
// 一度この幅を広げたところ(pale +7 / deep -11)、白に近い図形と濃い下地の
// 組み合わせができてしまい、地に溶ける透かしではなく画面の主役になって
// 本文が読めなくなった。3段の差はそれぞれ約13(255階調)に収め、地(BG
// #F0F0EE)から一番濃い段までの差も30以内に留める。
const TONE: Record<AppTone, number> = { pale: 1, mid: -4, deep: -9 };
const toneColor = (t: AppTone) => shade(SHADE, TONE[t]);

export function AppBackdrop({ symbol }: { symbol: AppSymbol }) {
  const align = symbol.anchor === "top" ? "flex-start" : symbol.anchor === "center" ? "center" : "flex-end";
  return (
    // ★zIndexは-1。position:absoluteでzIndex:0のままだと、CSSの描画順の
    // 規則により「位置指定されていない通常フローの中身」(=タブの本文)より
    // **後に**描かれ、背景が文字を覆ってしまう(実際にブリーフの見出しの
    // 2行目が消えていた)。呼び出し元の列に isolation:isolate を与えて
    // 独立した重なりの単位にしてあるので、-1にしてもこの列の外(下)へ
    // 抜け落ちることはなく、列の中で一番下に収まる。
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: -1 }}>
      <div className="app-backdrop-inner" style={{ position: "absolute", inset: 0, display: "flex", alignItems: align }}>
        <div style={{
          width: "100%", aspectRatio: "1 / 1", flexShrink: 0,
          display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr",
        }}>
          {symbol.cells.map((cell, i) => (
            cell === null ? <div key={i} /> : (
              <div key={i} style={{ position: "relative", background: toneColor(cell.bg), overflow: "hidden" }}>
                {cell.shape && <PlaneFill shape={cell.shape} color={toneColor(cell.fg ?? "deep")} />}
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  );
}
