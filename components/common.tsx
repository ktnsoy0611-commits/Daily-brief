"use client";

import type { CSSProperties, ReactNode } from "react";
import { BLUE, DISPLAY, GREEN, HAIRLINE, INK, PAPER, SANS, SERIF } from "@/lib/constants";
import { img } from "@/lib/helpers";
import { BottomSheet } from "./BottomSheet";

export function Masthead({ title, en, statValue, statLabel, dateline, right }: {
  title: string;
  en: string;
  statValue?: ReactNode;
  statLabel?: ReactNode;
  dateline?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header style={{ padding: "16px 4px 12px", borderBottom: `2px solid ${INK}` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, letterSpacing: "0.02em", lineHeight: 1 }}>{title}</div>
          <div style={{ fontSize: 9, letterSpacing: "0.28em", color: "#9A988E", marginTop: 5 }}>{en}</div>
        </div>
        {right ? right : (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 700, fontSize: 22, lineHeight: 1, color: INK }}>{statValue}</div>
            <div style={{ fontSize: 9, color: "#9A988E", letterSpacing: "0.08em", marginTop: 3 }}>{statLabel}</div>
          </div>
        )}
      </div>
      {dateline && <div style={{ fontSize: 10, color: "#9A988E", letterSpacing: "0.06em", marginTop: 8 }}>{dateline}</div>}
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
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16, marginBottom: actionSlot ? 12 : 16 }}>{item.title}</div>
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
