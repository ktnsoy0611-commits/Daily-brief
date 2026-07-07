"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { PAPER, SOFT_SHADOW_LG } from "@/lib/constants";

interface BottomSheetProps {
  onClose: () => void;
  children: ReactNode | ((requestClose: () => void) => ReactNode);
  maxHeight?: string;
}

// iOSでキーボードが開くと、レイアウト上のビューポート(inset:0の基準)は
// そのままなのに実際に見える領域(visualViewport)だけが狭くなり、下寄せの
// オーバーレイがキーボードの裏に隠れてしまう。visualViewportの高さを
// 追って、その高さぶんだけ器を狭めることで、常にキーボードの上に来る
// ようにする。
function useVisualViewportHeight() {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setHeight(vv.height);
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return height;
}

// 全オーバーレイ共通のポップアップ。以前は白い1枚のシート(下部シート)の
// 中にあらゆる中身を入れていたが、「背景がブラーになり、その上にカードが
// 浮いている」デザインに変更したため、この器自体はもう背景を持たない
// (スクロール領域とポップアニメーションだけを担当する透明な箱)。
// 中身がPosterCardのようなカード集合の場合はそのまま浮かせ、フォームや
// 一覧のような不透明な面が要る中身は、呼び出し側で下のOverlayCardに
// 包んでもらう。閉じる操作は常に「カード(パネル)以外の場所をタップ」だけ。
export function BottomSheet({ onClose, children, maxHeight = "82vh" }: BottomSheetProps) {
  const [open, setOpen] = useState(false);
  const vvHeight = useVisualViewportHeight();

  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const requestClose = () => {
    setOpen(false);
    setTimeout(onClose, 220);
  };

  // 中身は呼び出し側ごとに構造がバラバラ(フォームや複数カードのグリッドなど)
  // なので、子要素にstopPropagationを仕込む方式だと、見た目は背景(ブラー)
  // なのに実はスクロール領域の余白だった、という場所でタップしても閉じない
  // 事故が起きやすい。代わりに「クリックされた要素がこの判定対象そのもの
  // かどうか」だけで見る、より確実な方式にしている。
  const closeIfSelf = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) requestClose();
  };

  return (
    <div onClick={closeIfSelf} style={{
      position: "fixed", top: 0, left: 0, right: 0, height: vvHeight ? `${vvHeight}px` : "100dvh",
      zIndex: 45, display: "flex", alignItems: "flex-end", justifyContent: "center",
      background: open ? "rgba(16,16,20,0.4)" : "rgba(16,16,20,0)",
      backdropFilter: open ? "blur(20px) saturate(1.5)" : "blur(0px)",
      WebkitBackdropFilter: open ? "blur(20px) saturate(1.5)" : "blur(0px)",
      transition: "background 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease",
    }}>
      <div style={{
        width: "calc(100% - 48px)", maxWidth: 380, marginBottom: 20, maxHeight,
        display: "flex", flexDirection: "column", overflow: "hidden",
        transform: open ? "translateY(0) scale(1)" : "translateY(26px) scale(0.94)",
        opacity: open ? 1 : 0,
        transformOrigin: "50% 100%",
        transition: "transform 0.32s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease",
      }}>
        <div onClick={closeIfSelf} className="no-scrollbar" style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 4px 0", paddingBottom: "max(18px, env(safe-area-inset-bottom))" }}>
          {typeof children === "function" ? children(requestClose) : children}
        </div>
      </div>
    </div>
  );
}

// BottomSheetの中に置くグリッドなど、独自の入れ物(div)を挟む場合に、
// その入れ物の余白(カードが無い空セルなど)をタップしても閉じられるように
// するためのヘルパー。onClickに渡すだけで、そのdiv自身がクリックされた
// 時だけhandlerを呼ぶ(子要素のカードをタップした時は呼ばれない)。
export function closeOnSelfClick(handler: () => void) {
  return (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handler();
  };
}

// フォームや一覧など、ブラー背景の上でもそれ自体が読める不透明な面が
// 必要な中身を包むための、浮いた白いカード。PosterCardの集合のように
// それ自体が完結したビジュアルを持つ中身は、これを使わずそのまま浮かせる。
export function OverlayCard({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: PAPER, borderRadius: 22, padding: "18px 18px 20px", boxShadow: SOFT_SHADOW_LG }}>
      {children}
    </div>
  );
}
