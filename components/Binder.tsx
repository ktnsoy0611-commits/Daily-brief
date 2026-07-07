"use client";

// アプリ全体で「バインダー」という物体の見た目・動きを1つに揃えるための
// 共通モデル。以前はRecordsTabの棚(平らな背表紙テクスチャをrotateYで
// 軽く傾けるだけ)とExecuteTabの確定バインダー(独自のページめくり)が、
// それぞれ別々に似て非なる見た目/動きを持っていた。ここでは
//   - 穴+リング金具(HOLE_MASK/HoleRings/BinderRings): 全バインダー共通で2つ穴
//   - 表紙面(BinderCoverFace)と背表紙面(BinderSpineFace): 同じ色面+ラベル
//     プレートの語彙を共有する2つの「面」
//   - Binder3D: 上の2面を実際に厚みを持った3D箱として組み立て、rotateYで
//     「背から見る⇄表紙から見る」を連続的に行き来できる物体
//   - BinderCoverflowRow: Binder3Dを横に並べ、中央に来たものほど表紙が
//     こちらを向くコンベア(本棚を斜めから覗き込むような見た目)
//   - BinderFlipDeck: 表紙が正面を向いた1冊を、スワイプでページ単位に
//     めくって開いていく共通のリーダー
// という部品に分けて提供する。RecordsTabの棚とExecuteTabの確定画面は
// どちらもこれらの部品を組み合わせて作られており、「同じバインダーという
// 物体を、違う状況で見ている」という一貫性を保っている。

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { INK, ITEM_CARD_ASPECT, PAPER, SANS, SOFT_SHADOW, SOFT_SHADOW_LG } from "@/lib/constants";
import { haptic, shade } from "@/lib/helpers";
import type { IconType } from "@/components/common";

// ---- 穴+リング金具(2穴で統一) -------------------------------------------

export const HOLE_MASK = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 347"><rect width="260" height="347" fill="white"/><circle cx="15" cy="83" r="5.5" fill="black"/><circle cx="15" cy="264" r="5.5" fill="black"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();
export const holeMaskStyle: CSSProperties = {
  WebkitMaskImage: HOLE_MASK, maskImage: HOLE_MASK,
  WebkitMaskSize: "100% 100%", maskSize: "100% 100%",
  WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
};

// ページ側の穴の縁取り(ページと一緒に回転し、奥行きの陰影を出す)。
export function HoleRings() {
  return (
    <>
      {["24%", "76%"].map((y) => (
        <div key={y} style={{
          position: "absolute", left: "5.8%", top: y, transform: "translate(-50%, -50%)",
          width: 12, height: 12, borderRadius: "50%", pointerEvents: "none", zIndex: 5,
          boxShadow: "inset 0 1.5px 2px rgba(28,28,30,0.22), inset 0 -1px 1px rgba(255,255,255,0.4), 0 0 0 1px rgba(28,28,30,0.05)",
        }} />
      ))}
    </>
  );
}

// バインダーを綴じる実際のリング金具(静止していて、ページや表紙だけが
// その周りを動く)。
export function BinderRings() {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 20, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: "3.2%", top: 10, bottom: 10, width: 7, borderRadius: 4, background: "linear-gradient(to right, rgba(28,28,30,0.24), rgba(28,28,30,0.04) 75%, transparent)" }} />
      {["24%", "76%"].map((y) => (
        <div key={y} style={{
          position: "absolute", left: "5.8%", top: y, width: 30, height: 16, transform: "translate(-64%, -50%)",
          borderRadius: 999, border: "3px solid #AEA78F",
          background: "linear-gradient(135deg, rgba(255,255,255,0.62), rgba(118,111,92,0.32))",
          boxShadow: "0 2px 5px rgba(28,28,30,0.38), inset 0 1px 1px rgba(255,255,255,0.7), inset 0 -1.5px 1.5px rgba(28,28,30,0.4)",
        }} />
      ))}
    </div>
  );
}

// ---- 表紙面・背表紙面 -----------------------------------------------------

interface CoverContent {
  color: string;
  EyebrowIcon?: IconType;
  eyebrowLabel?: string;
  eyebrowColor?: string;
  title: string;
  footer?: ReactNode;
}

// 布張り/レザー張りのような不透明な色面+中央の白いラベルプレート、という
// GoalCardで確立した「表紙が付いたバインダー」の語彙をそのまま共通化した表紙面。
export function BinderCoverFace({ color, EyebrowIcon, eyebrowLabel, eyebrowColor, title, footer }: CoverContent) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      background: `linear-gradient(135deg, ${shade(color, 16)} 0%, ${color} 45%, ${shade(color, -18)} 100%)`,
    }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.07, backgroundImage: "repeating-linear-gradient(45deg, #fff 0 1px, transparent 1px 6px)" }} />
      <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -14px 18px -14px rgba(0,0,0,0.35)" }} />
      <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 12px 6px" }}>
        <div style={{ width: "100%", background: PAPER, borderRadius: 6, padding: "9px 9px 8px", textAlign: "center", boxShadow: "0 3px 7px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.05)" }}>
          {(EyebrowIcon || eyebrowLabel) && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 5 }}>
              {EyebrowIcon && <EyebrowIcon size={10} color={eyebrowColor ?? color} strokeWidth={2} />}
              {eyebrowLabel && <span style={{ fontSize: 7.5, letterSpacing: "0.16em", color: eyebrowColor ?? color, fontWeight: 700 }}>{eyebrowLabel}</span>}
            </div>
          )}
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12.5, lineHeight: 1.32, color: INK, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
        </div>
      </div>
      {footer && <div style={{ position: "relative", padding: "0 11px 11px" }}>{footer}</div>}
    </div>
  );
}

// 背表紙面: 縦書きのタイトル+件数バッジ+リング金具。棚に並んだ時に
// 主に目に入る面。
export function BinderSpineFace({ color, title, count }: { color: string; title: string; count?: number }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
      background: `linear-gradient(180deg, ${shade(color, -4)} 0%, ${shade(color, -26)} 100%)`,
    }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "38%", background: "rgba(0,0,0,0.14)" }} />
      <span style={{
        writingMode: "vertical-rl", textOrientation: "mixed", fontFamily: SANS, fontWeight: 700, fontSize: 11,
        color: "#fff", letterSpacing: "0.04em", maxHeight: "78%", overflow: "hidden", textShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }}>{title}</span>
      {typeof count === "number" && (
        <span style={{ position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center", fontSize: 8.5, fontWeight: 700, color: "rgba(255,255,255,0.72)" }}>{count}</span>
      )}
    </div>
  );
}

// ---- 3D箱としてのバインダー ------------------------------------------------

// rotateYが0(表紙が正面)から離れるほど、遠いものは背表紙側の角度へ寄せる。
// dは中心からの符号付き距離(コンベア上の位置)。
export function binderTiltAngle(d: number, rest = 80, focused = 0) {
  if (d === 0) return focused;
  const amt = Math.max(0, 1 - Math.min(1, Math.abs(d)));
  const angle = rest - (rest - focused) * amt;
  return Math.sign(d) * angle;
}

export function Binder3D({ width, aspect = ITEM_CARD_ASPECT, depth = 20, rotateY, transitionMs, color, EyebrowIcon, eyebrowLabel, eyebrowColor, title, footer, spineTitle, count, onClick }: CoverContent & {
  width: number | string;
  aspect?: string;
  depth?: number;
  rotateY: number;
  transitionMs?: number;
  spineTitle?: string;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <div onClick={onClick} style={{ width, aspectRatio: aspect, perspective: 900, cursor: onClick ? "pointer" : "default" }}>
      <div style={{
        position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d",
        transform: `rotateY(${rotateY}deg)`,
        transition: transitionMs ? `transform ${transitionMs}ms cubic-bezier(0.22,0.9,0.32,1)` : "none",
      }}>
        {/* 表紙面(正面) */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: 14, overflow: "hidden", boxShadow: SOFT_SHADOW_LG,
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: `translateZ(${depth / 2}px)`,
        }}>
          <BinderCoverFace color={color} EyebrowIcon={EyebrowIcon} eyebrowLabel={eyebrowLabel} eyebrowColor={eyebrowColor} title={title} footer={footer} />
        </div>
        {/* 背表紙面(左端の側面) */}
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: depth, borderRadius: "14px 0 0 14px", overflow: "hidden",
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(-90deg) translateZ(" + depth / 2 + "px)",
        }}>
          <BinderSpineFace color={color} title={spineTitle ?? title} count={count} />
        </div>
      </div>
    </div>
  );
}

// ---- コンベア状の棚(RecordsTab) -------------------------------------------

export interface BinderShelfItem extends CoverContent {
  key: string;
  spineTitle?: string;
  count?: number;
  onOpen: () => void;
}

// ネイティブの横スクロール+スナップを使うことで、「タップ」と「スワイプで
// 送る」の判定をブラウザの標準挙動に任せられる(自前でpointer dragを
// 実装したCardStack/ExecuteTabの経験から、この手の判定を手で書くと
// タップ判定の事故が起きやすいことが分かっているため)。スクロール位置
// から各アイテムの中心からの距離を算出し、Binder3Dのrotateyへ直接反映する。
export function BinderCoverflowRow({ items, itemWidth = 118, aspect = ITEM_CARD_ASPECT, gap = 26 }: {
  items: BinderShelfItem[];
  itemWidth?: number;
  aspect?: string;
  gap?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const centerRef = useRef(0);
  const step = itemWidth + gap;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    centerRef.current = el.scrollLeft / step;
    setTick((t) => t + 1);
  };

  const sidePad = Math.max(0, (containerWidth - itemWidth) / 2);

  return (
    <div
      ref={scrollRef} onScroll={onScroll} className="no-scrollbar"
      style={{ display: "flex", overflowX: "auto", scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch", padding: "10px 0 6px" }}
    >
      <div style={{ flex: "0 0 auto", width: sidePad }} />
      {items.map((it, i) => {
        const d = i - centerRef.current;
        const angle = binderTiltAngle(d);
        return (
          <div key={it.key} style={{ flex: "0 0 auto", width: itemWidth, marginRight: i === items.length - 1 ? 0 : gap, scrollSnapAlign: "center" }}>
            <Binder3D
              width={itemWidth} aspect={aspect} rotateY={angle} transitionMs={60}
              color={it.color} EyebrowIcon={it.EyebrowIcon} eyebrowLabel={it.eyebrowLabel} eyebrowColor={it.eyebrowColor}
              title={it.title} spineTitle={it.spineTitle} count={it.count} onClick={it.onOpen}
            />
          </div>
        );
      })}
      <div style={{ flex: "0 0 auto", width: sidePad }} />
    </div>
  );
}

// ---- 開いてページをめくるリーダー(ExecuteTabなど) --------------------------

// 表紙が正面を向いた状態(pageIndex=0が表紙ページ)から、スワイプでページを
// 1枚ずつめくって開いていく共通のリーダー。ページの中身(表紙/本文/裏表紙)
// はrenderPageに委ねるので、ExecuteTabのようにマーク済み/外すボタンを
// 持つ本文ページを自由に組み込める。指の動きに1:1で追従し、離した位置に
// 応じてめくり切る/元に戻るがスナップで決まる(ボタン操作は持たない)。
export function BinderFlipDeck({ pageCount, renderPage, maxWidth = 260, aspect = ITEM_CARD_ASPECT, extraOverlay, disabled }: {
  pageCount: number;
  renderPage: (index: number) => ReactNode;
  maxWidth?: number;
  aspect?: string;
  extraOverlay?: (pageIndex: number) => ReactNode;
  disabled?: boolean;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [drag, setDrag] = useState<{ dir: "next" | "prev"; progress: number; settling: boolean } | null>(null);
  const animating = useRef(false);
  const dragRef = useRef({ startX: 0, startY: 0, startTime: 0, active: false, dir: null as "next" | "prev" | null, width: maxWidth });
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageIndex((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const settle = (dir: "next" | "prev", commit: boolean) => {
    animating.current = true;
    haptic(commit ? 10 : 4);
    setDrag({ dir, progress: commit ? 1 : 0, settling: true });
    setTimeout(() => {
      if (commit) setPageIndex((p) => (dir === "next" ? p + 1 : p - 1));
      setDrag(null);
      animating.current = false;
    }, 230);
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || animating.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTime: performance.now(), active: true, dir: null, width: cardRef.current?.offsetWidth ?? maxWidth };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    if (!d.dir) {
      const dy = e.clientY - d.startY;
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) { d.active = false; return; }
      const wantNext = dx < 0;
      const boundary = wantNext ? pageIndex >= pageCount - 1 : pageIndex <= 0;
      if (boundary) { d.active = false; return; }
      d.dir = wantNext ? "next" : "prev";
    }
    const progress = Math.min(1, Math.abs(dx) / (d.width * 0.55));
    setDrag({ dir: d.dir, progress, settling: false });
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active || !d.dir) { d.active = false; return; }
    d.active = false;
    const dx = e.clientX - d.startX;
    const dt = Math.max(1, performance.now() - d.startTime);
    const velocity = Math.abs(dx) / dt;
    const progress = Math.min(1, Math.abs(dx) / (d.width * 0.55));
    settle(d.dir, progress > 0.24 || velocity > 0.5);
  };
  const onCancel = () => {
    const d = dragRef.current;
    if (d.active && d.dir) settle(d.dir, false);
    d.active = false;
  };

  const baseIndex = drag ? (drag.dir === "next" ? pageIndex + 1 : pageIndex) : pageIndex;
  const leafIndex = drag ? (drag.dir === "next" ? pageIndex : pageIndex - 1) : null;
  const progress = drag ? drag.progress : 0;
  const dragAngle = !drag ? 0 : drag.dir === "next" ? -180 * progress : -180 * (1 - progress);
  const liftZ = 44 * Math.sin(Math.min(progress, 1) * Math.PI);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <div
        ref={cardRef}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}
        style={{
          position: "relative", width: "100%", maxWidth, aspectRatio: aspect, perspective: 700,
          touchAction: "pan-y", filter: "drop-shadow(0 12px 26px rgba(28,28,30,0.2))",
        }}
      >
        {[10, 5].map((inset, i) => (
          <div key={inset} style={{ position: "absolute", right: -inset * 0.6, top: 7 + i * 2, bottom: 7 + i * 2, width: inset, borderRadius: "0 4px 4px 0", background: "#EDE7D6", boxShadow: "1px 0 2px rgba(28,28,30,0.1)" }} />
        ))}
        {renderPage(baseIndex)}
        {extraOverlay?.(pageIndex)}
        {drag && leafIndex !== null && leafIndex >= 0 && leafIndex < pageCount && (
          <div style={{
            position: "absolute", inset: 0, transformStyle: "preserve-3d", transformOrigin: "0% 50%",
            transform: `rotateY(${dragAngle}deg) translateZ(${liftZ}px) scale(${1 + 0.045 * Math.sin(Math.min(progress, 1) * Math.PI)})`,
            transition: drag.settling ? "transform 0.22s cubic-bezier(0.16,1,0.3,1)" : "none",
            WebkitBackfaceVisibility: "hidden", backfaceVisibility: "hidden",
            filter: `drop-shadow(0 ${10 + liftZ * 0.3}px ${16 + liftZ * 0.4}px rgba(28,28,30,${0.16 + Math.sin(Math.min(progress, 1) * Math.PI) * 0.14}))`,
          }}>
            {renderPage(leafIndex)}
          </div>
        )}
        <BinderRings />
      </div>
      <div style={{ marginTop: 14, padding: "5px 13px", borderRadius: 999, background: PAPER, boxShadow: SOFT_SHADOW, fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: "#8A8778" }}>
        {pageIndex + 1} / {pageCount}
      </div>
    </div>
  );
}
