"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PAPER, SOFT_SHADOW_LG } from "@/lib/constants";

interface BottomSheetProps {
  onClose: () => void;
  children: ReactNode | ((requestClose: () => void) => ReactNode);
  maxHeight?: string;
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

  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const requestClose = () => {
    setOpen(false);
    setTimeout(onClose, 220);
  };

  return (
    <div onClick={requestClose} style={{
      position: "fixed", inset: 0, zIndex: 45, display: "flex", alignItems: "flex-end", justifyContent: "center",
      background: open ? "rgba(16,16,20,0.4)" : "rgba(16,16,20,0)",
      backdropFilter: open ? "blur(20px) saturate(1.5)" : "blur(0px)",
      WebkitBackdropFilter: open ? "blur(20px) saturate(1.5)" : "blur(0px)",
      transition: "background 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "calc(100% - 24px)", maxWidth: 400, marginBottom: 14, maxHeight,
        display: "flex", flexDirection: "column", overflow: "hidden",
        transform: open ? "translateY(0) scale(1)" : "translateY(26px) scale(0.94)",
        opacity: open ? 1 : 0,
        transformOrigin: "50% 100%",
        transition: "transform 0.32s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease",
      }}>
        <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "4px 2px 0", paddingBottom: "max(18px, env(safe-area-inset-bottom))" }}>
          {typeof children === "function" ? children(requestClose) : children}
        </div>
      </div>
    </div>
  );
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
