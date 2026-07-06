"use client";

import { Star } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { BLUE, GREEN, HAIRLINE, INK, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";
import { img } from "@/lib/helpers";
import { BottomSheet } from "./BottomSheet";

// 「My Trails」参考のような、太いサンセリフの大見出し+柔らかいグレーの
// サブテキストという構成。以前は新聞の輪転罫線(2px罫線)で下線を引いて
// いたが、ミニマルなデザインへの刷新でその区切り線は撤廃した。
export function Masthead({ title, en, statValue, statLabel, dateline, right }: {
  title: string;
  en: string;
  statValue?: ReactNode;
  statLabel?: ReactNode;
  dateline?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header style={{ padding: "18px 4px 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 28, letterSpacing: "-0.01em", lineHeight: 1.15, color: INK }}>{title}</div>
          <div style={{ fontSize: 13, color: "#9A988E", marginTop: 4 }}>{en}</div>
        </div>
        {right ? right : (
          <div style={{ textAlign: "right", background: PAPER, borderRadius: 14, padding: "8px 14px", boxShadow: SOFT_SHADOW }}>
            <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 20, lineHeight: 1, color: INK }}>{statValue}</div>
            <div style={{ fontSize: 9, color: "#9A988E", letterSpacing: "0.04em", marginTop: 3 }}>{statLabel}</div>
          </div>
        )}
      </div>
      {dateline && <div style={{ fontSize: 12, color: "#9A988E", marginTop: 10 }}>{dateline}</div>}
    </header>
  );
}

export function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 9, color, fontWeight: 700, letterSpacing: "0.05em" }}>{label}</span>
    </span>
  );
}

export function rowBtn(bg: string, color: string, border?: string): CSSProperties {
  return { background: bg, color, cursor: "pointer", border: `1px solid ${border ?? bg}`, borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", padding: "7px 12px", fontFamily: SANS };
}

export function keepStatus(k: { status: string }) {
  if (k.status === "planned") return { label: "マガジン掲載中", color: BLUE };
  if (k.status === "done") return { label: "実行済み", color: "#9A988E" };
  return { label: "候補", color: GREEN };
}

// アプリ内で繰り返し使う「ポスター」カード。メディア/エリア/願望で共通。
// sizeを省略すると親グリッドに合わせて広がる。
export function PosterCard({ image, color, title, sub, label, good, onToggleGood, action, onClick, size }: {
  image?: string | null;
  color?: string;
  title: string;
  sub?: string;
  label?: string;
  good?: boolean;
  onToggleGood?: () => void;
  action?: { label: string; onClick: () => void };
  onClick?: () => void;
  size?: number | string;
}) {
  return (
    <div onClick={onClick} style={{ position: "relative", flexShrink: 0, width: size ?? "100%", aspectRatio: "2 / 3", borderRadius: 18, overflow: "hidden", boxShadow: SOFT_SHADOW, cursor: onClick ? "pointer" : "default" }}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img(image, 340, 510)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", background: color ?? "#5A5A54", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, color: PAPER, textAlign: "center", lineHeight: 1.45 }}>{title}</span>
        </div>
      )}
      {image && (
        <>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 48%, rgba(0,0,0,0.78) 100%)" }} />
          <div style={{ position: "absolute", bottom: 10, left: 10, right: 10 }}>
            {label && <div style={{ fontSize: 8, letterSpacing: "0.16em", color: "rgba(255,255,255,0.7)", marginBottom: 3 }}>{label}</div>}
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: "#fff", lineHeight: 1.3 }}>{title}</div>
            {sub && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>{sub}</div>}
          </div>
        </>
      )}
      {!image && (
        <div style={{ position: "absolute", bottom: 10, left: 12, right: 12, textAlign: "center" }}>
          {label && <div style={{ fontSize: 8, letterSpacing: "0.16em", color: "rgba(251,250,247,0.6)", marginBottom: 2 }}>{label}</div>}
          {sub && <div style={{ fontSize: 9, color: "rgba(251,250,247,0.75)" }}>{sub}</div>}
        </div>
      )}
      {onToggleGood && (
        <button onClick={(e) => { e.stopPropagation(); onToggleGood(); }} aria-label="良かった" style={{
          position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", border: "none", cursor: "pointer",
          background: good ? "#D9A441" : "rgba(23,23,21,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}>
          <Star size={14} fill={good ? "#fff" : "none"} color="#fff" strokeWidth={2} />
        </button>
      )}
      {action && (
        <button onClick={(e) => { e.stopPropagation(); action.onClick(); }} style={{
          position: "absolute", top: 8, right: 8, padding: "6px 11px", borderRadius: 999, border: "none", cursor: "pointer",
          background: INK, color: PAPER, fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.02em",
        }}>{action.label}</button>
      )}
    </div>
  );
}

export function Thumb({ seed, onOpen, size = 44 }: { seed: string; onOpen: () => void; size?: number }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onOpen(); }} style={{ padding: 0, border: "none", background: "none", cursor: "pointer", flexShrink: 0, borderRadius: 8, overflow: "hidden", width: size, height: size }}>
      <img src={img(seed, size * 2, size * 2)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </button>
  );
}

export interface BinderItem {
  title: string;
  category?: string;
  categoryJp?: string;
  images?: string[];
  meta?: string[];
  sourceUrl?: string;
  sourceLabel?: string;
}

export function BinderModal({ item, onClose, actionSlot }: {
  item: BinderItem | null;
  onClose: () => void;
  actionSlot?: (requestClose: () => void) => ReactNode;
}) {
  if (!item) return null;
  const rotations = [-7, 3, 9];

  return (
    <BottomSheet onClose={onClose} maxHeight="82vh">
      {(requestClose) => (
        <>
          <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#9A988E", marginBottom: 4 }}>{item.category ?? item.categoryJp}</div>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: actionSlot ? 12 : 16 }}>{item.title}</div>
          {actionSlot && <div style={{ marginBottom: 16 }}>{actionSlot(requestClose)}</div>}
          <div style={{ display: "flex", justifyContent: "center", padding: "4px 0 22px" }}>
            {(item.images ?? []).map((seed, i) => (
              <img key={seed} src={img(seed, 300, 380)} alt="" style={{ width: "32%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: 6, border: "4px solid #fff", boxShadow: "0 8px 20px rgba(23,23,21,0.3)", transform: `rotate(${rotations[i % 3]}deg)`, marginLeft: i === 0 ? 0 : -18, position: "relative", zIndex: i }} />
            ))}
          </div>
          {item.meta && item.meta.length > 0 && (
            <div style={{ borderTop: `1px solid ${HAIRLINE}`, borderBottom: `1px solid ${HAIRLINE}`, padding: "12px 2px", margin: "0 0 18px", display: "flex", flexDirection: "column", gap: 7 }}>
              {item.meta.map((m, i) => (
                <div key={i} style={{ fontSize: 12.5, color: "#4A4A44", fontFamily: SANS }}>{m}</div>
              ))}
            </div>
          )}
          {item.sourceUrl && (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", padding: "13px 0", background: INK, color: PAPER, borderRadius: 999, textDecoration: "none", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>
              {item.sourceLabel ?? "情報ソースを見る"} ↗
            </a>
          )}
        </>
      )}
    </BottomSheet>
  );
}
