"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PAPER } from "@/lib/constants";

interface BottomSheetProps {
  onClose: () => void;
  children: ReactNode | ((requestClose: () => void) => ReactNode);
  maxHeight?: string;
}

// 全オーバーレイ共通のポップアップ。以前は上端に掴んで下にドラッグして
// 閉じるハンドルを持つ「下部シート」だったが、片手操作だと上端まで指が
// 届きにくく閉じづらいという指摘を受けて撤廃した。今はスタックやバインダー
// をタップした先で、背景にブラーがかかると同時にカードの束がパッと手前に
// 浮いて展開するような1つのポップアニメーションに統一し、閉じる操作は
// 常に「カード(パネル)以外の場所をタップ」だけにしている。
// children は "そのままの要素" か "requestClose を受け取る関数" のどちらでも
// 良い(内部の確定ボタンなどからも同じ演出で閉じたい場合に使う)。
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
        width: "calc(100% - 20px)", maxWidth: 400, marginBottom: 10, background: PAPER, borderRadius: 24, maxHeight,
        display: "flex", flexDirection: "column", overflow: "hidden",
        transform: open ? "translateY(0) scale(1)" : "translateY(26px) scale(0.94)",
        opacity: open ? 1 : 0,
        transformOrigin: "50% 100%",
        transition: "transform 0.32s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease",
        boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
      }}>
        <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "20px 20px 0", paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
          {typeof children === "function" ? children(requestClose) : children}
        </div>
      </div>
    </div>
  );
}
