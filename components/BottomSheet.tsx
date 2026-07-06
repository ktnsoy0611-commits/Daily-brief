"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { PAPER } from "@/lib/constants";

interface BottomSheetProps {
  onClose: () => void;
  children: ReactNode | ((requestClose: () => void) => ReactNode);
  maxHeight?: string;
}

// 全オーバーレイ共通の下部シート。エントランス(下から滑り上がる)・ドラッグで
// 閉じる・背景タップで閉じる・閉じる際のスライドダウンを、すべて同じ動きで
// 統一する。children は "そのままの要素" か "requestClose を受け取る関数"
// のどちらでも良い(内部の確定ボタンなどからも同じ演出で閉じたい場合に使う)。
export function BottomSheet({ onClose, children, maxHeight = "82vh" }: BottomSheetProps) {
  const [dragY, setDragY] = useState(500);
  const dragRef = useRef({ startY: 0, active: false, base: 0 });

  useEffect(() => {
    const raf = requestAnimationFrame(() => setDragY(0));
    return () => cancelAnimationFrame(raf);
  }, []);

  const requestClose = () => {
    dragRef.current.active = false;
    setDragY(560);
    setTimeout(onClose, 220);
  };
  const onHandleDown = (e: PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startY: e.clientY, active: true, base: dragY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onHandleMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    setDragY(Math.max(0, dragRef.current.base + (e.clientY - dragRef.current.startY)));
  };
  const onHandleUp = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    if (dragY > 90) requestClose();
    else setDragY(0);
  };

  return (
    <div onClick={requestClose} style={{ position: "fixed", inset: 0, zIndex: 45, background: "rgba(23,23,21,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 420, background: PAPER, borderRadius: "20px 20px 0 0", maxHeight,
        display: "flex", flexDirection: "column", overflow: "hidden",
        transform: `translateY(${dragY}px)`,
        transition: dragRef.current.active ? "none" : "transform 0.24s cubic-bezier(0.32,0.72,0,1)",
      }}>
        <div
          onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
          style={{ touchAction: "none", cursor: "grab", padding: "12px 0 6px", display: "flex", justifyContent: "center", flexShrink: 0 }}
        >
          <div style={{ width: 32, height: 4, borderRadius: 2, background: "rgba(23,23,21,0.15)" }} />
        </div>
        <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 20px", paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
          {typeof children === "function" ? children(requestClose) : children}
        </div>
      </div>
    </div>
  );
}
