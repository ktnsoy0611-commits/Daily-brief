"use client";

import { PlaneFill } from "@/components/Binder";
import type { AppSymbol } from "@/lib/apps";
import { SHADE, SHADE_DEEP } from "@/lib/constants";

// ★アプリごとの背景。3アプリの地の色を「ほんとに薄いグレー」1色へ統一した
// 代わりに、どのアプリにいるかを背景の構図で伝える(2026-08-02)。
//
// 構図は **アーカイブのバインダーの表紙とまったく同じ文法**(ユーザー指定:
// 「既存の図形的なモチーフとグリッドは守りなさい。特にアーカイブの
// バインダーの表紙が良い例なので参考にしなさい」):
//
//   無地の下地  ＋  帯(位置が種別の印)  ＋  帯の中の正方形セルに図形
//
// 図形は Binder.tsx の PlaneFill をそのまま借り、セルの作り方も同じ
// 「帯の短辺を1辺とする正方形」にしてグリッドを守る。色はグレーの濃淡2段
// だけで、アクセント色は使わない。
//
// ★配置について: このコンポーネントは **各列(1画面ぶん)の中** に置く。
// 列は幅ちょうど1画面・overflow:hidden なので、はみ出した図形の切り取り線は
// 必ず画面の端と一致する = 「スワイプ中に画面の途中で図形が切れて見える」
// ことが構造的に起こらない。以前は背景だけを別のトラックにして視差でずらし、
// レイヤーごとに切り取っていたため、切り取り線が画面の真ん中に来ていた。
// トラックのtransform1つで背景も中身も同時に動くので、アプリ間の動きも繋がる。
//
// 奥行きは、レイヤーではなく **帯と図形だけ** をわずかに遅らせて出す
// (globals.css の .app-backdrop-inner が --drag から算出する)。

// ★セルの一辺の長さ。
// 素直に「帯の短辺」を一辺にすると、セルを count 個並べたときの合計が帯の
// 長辺を超えて最後の1個が切れる(実際に一度そうなった。バインダーのタイケンで
// 同じ轍を踏んだ記録が HANDOFF §7.28 にある)。**短辺と「長辺÷個数」の
// 小さい方**を採る。列は必ず1画面ぶんの大きさなので、vw/svh でそのまま書ける。
function cellSide(symbol: AppSymbol): string {
  const short = symbol.band === "left"
    ? `${symbol.thickness * 100}vw`   // 縦帯は幅が短辺
    : `${symbol.thickness * 100}svh`; // 横帯は高さが短辺
  const perCell = symbol.band === "left"
    ? `${100 / symbol.count}svh`
    : `${100 / symbol.count}vw`;
  return `min(${short}, ${perCell})`;
}

export function AppBackdrop({ symbol }: { symbol: AppSymbol }) {
  const vertical = symbol.band === "left";
  const side = cellSide(symbol);
  const cells = Array.from({ length: symbol.count }, (_, i) => (
    <div key={i} style={{ position: "relative", flexShrink: 0, width: side, height: side, overflow: "hidden" }}>
      <PlaneFill shape={symbol.shape} color={SHADE_DEEP} />
    </div>
  ));
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      <div className="app-backdrop-inner" style={{ position: "absolute", inset: 0 }}>
        <div style={{
          position: "absolute", background: SHADE, overflow: "hidden",
          display: "flex", flexDirection: vertical ? "column" : "row",
          // 帯の中でセルを均等に散らす(バインダーの side が総柄を
          // space-between で並べているのと同じ)。
          // 交差方向は flex-start = 帯の「内側の縁」に揃える。下端の帯
          // (ジャーナル)はこれでタブバーに隠れない位置に図形が並ぶ。
          justifyContent: "space-between", alignItems: "flex-start",
          ...(symbol.band === "left" ? { left: 0, top: 0, bottom: 0, width: `${symbol.thickness * 100}%` }
            : symbol.band === "top" ? { left: 0, right: 0, top: 0, height: `${symbol.thickness * 100}%` }
            : { left: 0, right: 0, bottom: 0, height: `${symbol.thickness * 100}%` }),
        }}>
          {cells}
        </div>
      </div>
    </div>
  );
}
