"use client";

import { BookOpen, Check, ChevronLeft, ChevronRight, Film, MapPin, Music, Music2, Palette, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BottomSheet, OverlayCard } from "@/components/BottomSheet";
import { BinderModal, type IconType, Masthead, PosterCard } from "@/components/common";
import { AREA_COORDS, BG, BLUE, GREEN, HAIRLINE, INK, NAV_OFFSET, PAPER, RUST, SANS, SOFT_SHADOW, SOFT_SHADOW_LG, mediaKindOf } from "@/lib/constants";
import { hashStr, haptic, img, inferMediaKind, keepMedia, mapsUrl, mostRecentThursday, pinPosition, shade, todayKey } from "@/lib/helpers";
import type { Keep, MagazineItemRef, MediaKindId, MediaRecord, TabProps } from "@/lib/types";

const MEDIA_ICON: Record<MediaKindId, IconType> = { movie: Film, exhibition: Palette, live: Music2, book: BookOpen, album: Music };

function MapCanvas({ items, selectedIds, onOpenPin }: {
  items: Keep[];
  selectedIds: string[];
  onOpenPin: (item: Keep) => void;
}) {
  return (
    <div style={{
      position: "relative", width: "100%", aspectRatio: "4 / 3", borderRadius: 16, overflow: "hidden",
      background: "#F1EEE5",
      backgroundImage: "repeating-linear-gradient(0deg, rgba(23,23,21,0.05) 0, rgba(23,23,21,0.05) 1px, transparent 1px, transparent 32px), repeating-linear-gradient(90deg, rgba(23,23,21,0.05) 0, rgba(23,23,21,0.05) 1px, transparent 1px, transparent 32px)",
      border: `1px solid ${HAIRLINE}`,
    }}>
      {Object.entries(AREA_COORDS).map(([name, pos]) => (
        <span key={name} style={{ position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)", fontSize: 8.5, letterSpacing: "0.06em", color: "rgba(23,23,21,0.28)", fontFamily: SANS, whiteSpace: "nowrap", pointerEvents: "none" }}>{name}</span>
      ))}
      {items.map((item) => {
        const pos = pinPosition(item);
        const selected = selectedIds.includes(item.id);
        return (
          <button key={item.id} onClick={() => onOpenPin(item)} aria-label={item.title} style={{
            position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, width: 24, height: 24, marginLeft: -12, marginTop: -24,
            borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", cursor: "pointer", padding: 0,
            background: selected ? BLUE : PAPER, border: `2px solid ${selected ? BLUE : (item.color ?? INK)}`,
            boxShadow: "0 3px 7px rgba(23,23,21,0.3)", zIndex: selected ? 6 : 2,
            transition: "transform 0.15s, background 0.15s",
          }}>
            <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(45deg)", width: 7, height: 7, borderRadius: "50%", background: selected ? PAPER : (item.color ?? INK) }} />
          </button>
        );
      })}
    </div>
  );
}

// 地図の下に横スクロールで並ぶ棚。場所のKeep一覧・メディア一覧で共用する、
// アプリ全体で統一したPosterCardに選択状態のオーバーレイを乗せたもの。
function SelectablePosterCard({ selected, onToggle, size = 108, ...cardProps }: {
  selected: boolean; onToggle: () => void; size?: number;
} & Omit<Parameters<typeof PosterCard>[0], "onClick" | "size">) {
  return (
    <div style={{ position: "relative", flexShrink: 0, width: size, transition: "transform 0.15s", transform: selected ? "scale(0.96)" : "scale(1)" }}>
      <PosterCard {...cardProps} size={size} onClick={onToggle} />
      {selected && (
        <div style={{ position: "absolute", inset: 0, borderRadius: 18, background: "rgba(43,63,191,0.28)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: BLUE, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(23,23,21,0.3)" }}>
            <Check size={16} color={PAPER} strokeWidth={3} />
          </div>
        </div>
      )}
    </div>
  );
}

// 「今週のおすすめ」専用カード。ShelfCardの正方形サムネイルだけでは中身が
// 何もわからなくなるため、タグライン+件名リスト+明示的な選択ボタンを持つ、
// 統合前(round4以前)の情報量を復元したカード。
function BundleCard({ label, tagline, items, onPick }: {
  label: string; tagline: string; items: { id: string; title: string }[]; onPick: () => void;
}) {
  return (
    <div style={{ flexShrink: 0, width: 190, background: PAPER, border: "none", borderRadius: 18, padding: "16px 17px", boxShadow: SOFT_SHADOW }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17 }}>{label}</div>
      <div style={{ fontSize: 10.5, color: "#9A988E", margin: "3px 0 12px" }}>{tagline}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14, minHeight: 60 }}>
        {items.map((it) => (
          <div key={it.id} style={{ fontSize: 11, color: "#5A5A54", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>・{it.title}</div>
        ))}
      </div>
      <button onClick={onPick} style={{ width: "100%", padding: "10px 0", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11.5, fontWeight: 700 }}>これにする</button>
    </div>
  );
}

function HorizontalShelf({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E" }}>{title}</span>
        {badge && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.05em", color: PAPER, background: BLUE, borderRadius: 999, padding: "2px 7px" }}>{badge}</span>}
      </div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2, marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
        {children}
      </div>
    </section>
  );
}

// タップで追加したものが積み上がっていく様子を見せる「バインダー」。
// 束の写真をタップすると外せる。AreaFolder/BinderModalと同じ重なり写真の
// 表現を踏襲し、アプリ全体で一貫した「束ねる」ビジュアルにしている。
function DraftBinder({ items, onRemove }: {
  items: { id: string; type: MagazineItemRef["type"]; title: string; image?: string; color?: string }[];
  onRemove: (id: string, type: MagazineItemRef["type"]) => void;
}) {
  const shown = items.slice(-5);
  const rotations = [-9, 6, -4, 8, -6];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "2px 2px 14px" }}>
      <div style={{ position: "relative", width: 62, height: 62, flexShrink: 0 }}>
        {shown.map((it, i) => (
          <button key={`${it.type}-${it.id}`} onClick={() => onRemove(it.id, it.type)} aria-label={`${it.title}を外す`} style={{
            position: "absolute", top: 2, left: 2, width: 50, height: 50, borderRadius: 8, overflow: "hidden", padding: 0, cursor: "pointer",
            border: "2.5px solid #fff", boxShadow: "0 3px 8px rgba(23,23,21,0.3)", background: "none",
            transform: `rotate(${rotations[i % rotations.length]}deg) translate(${i * 2}px, ${i * -2}px)`, zIndex: i,
            transition: "transform 0.2s",
          }}>
            {it.image ? (
              <img src={img(it.image, 100, 100)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", background: it.color ?? "#5A5A54" }} />
            )}
          </button>
        ))}
      </div>
      <div>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14 }}>{items.length}件、たまってきました</div>
        <div style={{ fontSize: 9.5, color: "#9A988E", marginTop: 2 }}>タップで外せます</div>
      </div>
    </div>
  );
}

function MapPlanner({ pool, mediaPool, draftSelection, draftMediaSelection, onOpenPin, onToggleKeep, onToggleMedia, onPickBundle, onInjectDemo, bundlesAreNew }: {
  pool: Keep[];
  mediaPool: MediaRecord[];
  draftSelection: string[];
  draftMediaSelection: string[];
  onOpenPin: (item: Keep) => void;
  onToggleKeep: (item: Keep) => void;
  onToggleMedia: (item: MediaRecord) => void;
  onPickBundle: (ids: string[]) => void;
  onInjectDemo: () => void;
  bundlesAreNew: boolean;
}) {
  const sorted = pool.slice().sort((a, b) => new Date(b.keptAt).getTime() - new Date(a.keptAt).getTime());
  const bundles = [
    { id: "light", label: "さらっと", tagline: "ひとつだけ、身軽に。", items: sorted.slice(0, 1) },
    { id: "easy", label: "ゆったり", tagline: "2〜3件、無理のない範囲で。", items: sorted.slice(0, 3) },
    { id: "full", label: "じっくり", tagline: "気になった分だけ、まとめて。", items: sorted.slice(0, 5) },
  ].filter((b) => b.items.length > 0);

  if (pool.length === 0 && mediaPool.length === 0) {
    return (
      <main style={{ padding: "48px 4px", textAlign: "center" }}>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 19, marginBottom: 10 }}>Keepが、まだありません。</div>
        <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.9, marginBottom: 22 }}>ブリーフでKeepするか、ストックタブの「場所」「作品」から追加すると、ここに地図として集まります。</p>
        <button onClick={onInjectDemo} style={{ padding: "13px 26px", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em" }}>デモ用データを投入</button>
      </main>
    );
  }

  const bottomPadding = draftSelection.length + draftMediaSelection.length > 0 ? 168 : 24;

  return (
    <main style={{ paddingTop: 14, paddingBottom: bottomPadding }}>
      <MapCanvas items={pool} selectedIds={draftSelection} onOpenPin={onOpenPin} />
      <p style={{ fontSize: 10.5, color: "#9A988E", lineHeight: 1.8, margin: "10px 2px 22px" }}>ピンやカードをタップして、今日の行き先を選ぶ。</p>

      {pool.length > 0 && (
        <HorizontalShelf title="KEEP一覧">
          {sorted.map((k) => (
            <SelectablePosterCard key={k.id} title={k.title} image={k.images?.[0]} color={k.color}
              sub={k.area && k.area !== "—" ? k.area : k.category} icon={MapPin} kept={k.origin !== "manual"}
              selected={draftSelection.includes(k.id)} onToggle={() => onToggleKeep(k)} />
          ))}
        </HorizontalShelf>
      )}
      {mediaPool.length > 0 && (
        <HorizontalShelf title="メディア">
          {mediaPool.map((r) => (
            <SelectablePosterCard key={r.id} title={r.title} image={r.image} color={r.color}
              sub={mediaKindOf(r.kind).label} icon={MEDIA_ICON[r.kind]} kept={r.origin !== "manual"}
              selected={draftMediaSelection.includes(r.id)} onToggle={() => onToggleMedia(r)} />
          ))}
        </HorizontalShelf>
      )}
      {bundles.length > 0 && (
        <HorizontalShelf title="今週のおすすめ" badge={bundlesAreNew ? "NEW" : undefined}>
          {bundles.map((b) => (
            <BundleCard key={b.id} label={b.label} tagline={b.tagline} items={b.items} onPick={() => onPickBundle(b.items.map((it) => it.id))} />
          ))}
        </HorizontalShelf>
      )}
    </main>
  );
}

interface ExecItem {
  id: string;
  type: MagazineItemRef["type"];
  title: string;
  images?: string[];
  color?: string;
  categoryLabel: string;
  area?: string;
  meta?: string[];
  sourceUrl?: string;
  sourceLabel?: string;
  doneActionLabel: string;
  kind?: MediaKindId;
  kept?: boolean;
  done?: boolean;
}

// ボード(コルクボード風)に留められた写真、というイメージの1枚。idから
// 決定論的に少しだけ回転・上下にずらし、上端には画鋲を1本のせることで、
// 単なる散らしグリッドではなく「実際にピンで留めた」ような手触りを足す。
// 画鋲の色は1色に絞り、写真やカード自体の色が主役になるようにしている。
const PIN_COLOR = RUST;
function ScrapCard({ item, onClick }: { item: ExecItem; onClick: () => void }) {
  const seed = hashStr(`${item.type}-${item.id}`);
  const rotation = ((seed % 9) - 4) * 1.4;
  const lift = (seed >> 4) % 14;
  const pin = PIN_COLOR;
  const icon = item.type === "keep" ? MapPin : (item.kind ? MEDIA_ICON[item.kind] : undefined);
  return (
    <div onClick={onClick} style={{
      position: "relative", flex: "1 1 42%", maxWidth: 180, minWidth: 130, cursor: "pointer",
      transform: `rotate(${rotation}deg) translateY(${lift}px)`, filter: "drop-shadow(0 10px 16px rgba(0,0,0,0.35))",
    }}>
      <div style={{
        position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)", width: 13, height: 13, borderRadius: "50%", zIndex: 5,
        background: `radial-gradient(circle at 34% 30%, ${shade(pin, 45)}, ${pin} 55%, ${shade(pin, -30)} 100%)`,
        boxShadow: "0 3px 5px rgba(0,0,0,0.45)",
      }} />
      {/* 行った/観たにしたカードは、ボードから消さずグレーアウトして
          「済んだこと」がその場でわかるようにする。 */}
      <div style={{ filter: item.done ? "grayscale(0.85) opacity(0.55)" : "none" }}>
        <PosterCard image={item.images?.[0]} color={item.color} title={item.title} sub={item.area && item.area !== "—" ? item.area : undefined}
          label={item.categoryLabel} icon={icon} kept={item.kept} />
      </div>
      {item.done && (
        <div style={{
          position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: "rgba(28,28,30,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 6,
        }}>
          <Check size={12} color="#fff" strokeWidth={3} />
        </div>
      )}
    </div>
  );
}

// フルスクリーンの本1ページ分。バインダーの表紙/GoalCardと同じ左端の
// リング金具モチーフを踏襲し、「バインダーに閉じられたルーズリーフの束」
// であることが一目でわかるようにしている。
function BookPage({ item, index, total }: { item: ExecItem; index: number; total: number }) {
  const IconComp = item.type === "keep" ? MapPin : (item.kind ? MEDIA_ICON[item.kind] : undefined);
  const fill = item.color ?? "#5A5A54";
  return (
    <div style={{ position: "absolute", inset: 0, background: "#FBF8EF", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "inset 0 0 0 1px rgba(28,28,30,0.06)" }}>
      {[0.12, 0.5, 0.88].map((y) => (
        <div key={y} style={{
          position: "absolute", left: 14, top: `${y * 100}%`, transform: "translateY(-50%)", width: 13, height: 13, borderRadius: "50%", zIndex: 5,
          background: "linear-gradient(135deg, #E2DFD3 0%, #B8B4A6 100%)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.5)",
        }}>
          <div style={{ position: "absolute", inset: 2.5, borderRadius: "50%", background: "#F3F1EC" }} />
        </div>
      ))}
      <div style={{ position: "relative", flex: "0 0 46%", margin: "0 0 0 34px", overflow: "hidden", background: item.images?.[0] ? fill : `linear-gradient(135deg, ${shade(fill, 14)} 0%, ${fill} 45%, ${shade(fill, -18)} 100%)` }}>
        {item.images?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img(item.images[0], 500, 460)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : IconComp ? (
          <div style={{ position: "absolute", bottom: "-18%", right: "-10%", width: "56%", aspectRatio: "1 / 1", transform: "rotate(-14deg)", opacity: 0.16 }}>
            <IconComp size="100%" strokeWidth={1} color="#fff" />
          </div>
        ) : null}
      </div>
      <div style={{ flex: 1, padding: "18px 22px 16px 34px", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.16em", color: "#9A988E", fontWeight: 700 }}>{item.categoryLabel}{item.area && item.area !== "—" ? ` ・ ${item.area}` : ""}</div>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 19, lineHeight: 1.32, marginTop: 8 }}>{item.title}</div>
        {item.meta && item.meta.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {item.meta.map((m, i) => <div key={i} style={{ fontSize: 11.5, color: "#5A5A54" }}>{m}</div>)}
          </div>
        )}
        {item.done && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 10, fontSize: 10, fontWeight: 700, color: GREEN }}>
            <Check size={11} strokeWidth={3} />完了ずみ
          </div>
        )}
        <div style={{ marginTop: "auto", fontSize: 9.5, color: "#B7B4A6", letterSpacing: "0.06em" }}>{index + 1} / {total} ページ</div>
      </div>
    </div>
  );
}

// マガジン確定後の「今日の行き先リスト」を、バインダーに閉じられた1冊の本
// として画面いっぱいに展開するビュー。スワイプ(または左右の矢印)で
// ページが3D回転して捲れる。ヒンジは常に左端(リング金具側)に固定し、
// 現実の本のように「右のページ束が左へ倒れ込む」向きで統一している。
function BookReader({ items, onClose, onMarkDone, onOpenDetail }: {
  items: ExecItem[];
  onClose: () => void;
  onMarkDone: (item: ExecItem) => void;
  onOpenDetail: (item: ExecItem) => void;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [flip, setFlip] = useState<{ dir: "next" | "prev"; angle: number } | null>(null);
  const animating = useRef(false);
  const dragRef = useRef({ startX: 0, active: false });

  const turn = (dir: "next" | "prev") => {
    if (animating.current) return;
    const target = dir === "next" ? pageIndex + 1 : pageIndex - 1;
    if (target < 0 || target >= items.length) return;
    animating.current = true;
    haptic(8);
    setFlip({ dir, angle: dir === "next" ? 0 : -180 });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setFlip({ dir, angle: dir === "next" ? -180 : 0 });
    }));
    setTimeout(() => {
      setPageIndex(target);
      setFlip(null);
      animating.current = false;
    }, 460);
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => { dragRef.current = { startX: e.clientX, active: true }; };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    const dx = e.clientX - dragRef.current.startX;
    if (dx < -40) turn("next");
    else if (dx > 40) turn("prev");
  };

  const underIndex = flip ? (flip.dir === "next" ? pageIndex + 1 : pageIndex) : pageIndex;
  const leafIndex = flip ? (flip.dir === "next" ? pageIndex : pageIndex - 1) : null;
  const underItem = items[underIndex];
  const leafItem = leafIndex !== null ? items[leafIndex] : null;
  const current = items[pageIndex];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "linear-gradient(180deg, #16161c 0%, #201f26 100%)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "calc(env(safe-area-inset-top) + 14px) 18px 8px" }}>
        <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em" }}>{pageIndex + 1} / {items.length}</span>
        <button onClick={onClose} aria-label="閉じる" style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.14)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
          <X size={16} />
        </button>
      </div>

      <div onPointerDown={onDown} onPointerUp={onUp} style={{ flex: 1, position: "relative", margin: "6px 22px", perspective: 1800, touchAction: "pan-y" }}>
        {underItem && <BookPage item={underItem} index={underIndex} total={items.length} />}
        {flip && leafItem && (
          <div style={{
            position: "absolute", inset: 0, transformStyle: "preserve-3d", transformOrigin: "0% 50%",
            transform: `rotateY(${flip.angle}deg)`, transition: "transform 0.46s cubic-bezier(0.45,0,0.55,1)",
            WebkitBackfaceVisibility: "hidden", backfaceVisibility: "hidden",
            filter: "drop-shadow(0 22px 40px rgba(0,0,0,0.5))",
          }}>
            <BookPage item={leafItem} index={leafIndex ?? 0} total={items.length} />
          </div>
        )}
        <button onClick={() => turn("prev")} disabled={pageIndex === 0} aria-label="前のページ" style={{
          position: "absolute", left: -14, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, borderRadius: "50%",
          border: "none", background: "rgba(28,28,30,0.65)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.35)", cursor: pageIndex === 0 ? "default" : "pointer", opacity: pageIndex === 0 ? 0.3 : 1, padding: 0, zIndex: 10,
        }}><ChevronLeft size={18} /></button>
        <button onClick={() => turn("next")} disabled={pageIndex === items.length - 1} aria-label="次のページ" style={{
          position: "absolute", right: -14, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, borderRadius: "50%",
          border: "none", background: "rgba(28,28,30,0.65)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.35)", cursor: pageIndex === items.length - 1 ? "default" : "pointer", opacity: pageIndex === items.length - 1 ? 0.3 : 1, padding: 0, zIndex: 10,
        }}><ChevronRight size={18} /></button>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 10, padding: "10px 20px calc(env(safe-area-inset-bottom) + 18px)" }}>
        {current && !current.done && (
          <button onClick={() => onMarkDone(current)} style={{ flex: 1, maxWidth: 220, padding: "13px 0", borderRadius: 999, border: "none", background: GREEN, color: "#fff", fontFamily: SANS, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{current.doneActionLabel}</button>
        )}
        {current && (
          <button onClick={() => onOpenDetail(current)} style={{ flex: 1, maxWidth: 220, padding: "13px 0", borderRadius: 999, border: "1.5px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", fontFamily: SANS, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>くわしく見る</button>
        )}
      </div>
    </div>
  );
}

// マガジン編集モードで開く「候補から追加」シート(場所のKeepのみ)
function AddToMagazineSheet({ pool, onAdd, onClose }: { pool: Keep[]; onAdd: (id: string) => void; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose} maxHeight="56vh">
      <OverlayCard>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, marginBottom: 12 }}>候補から追加</div>
        {pool.length === 0 ? (
          <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>追加できる候補がありません。</p>
        ) : pool.map((k, i) => (
          <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}` }}>
            {k.images && k.images.length > 0 ? (
              <img src={img(k.images[0], 90, 90)} alt="" style={{ width: 42, height: 42, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 42, height: 42, borderRadius: 8, background: k.color ?? "#5A5A54", flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.title}</div>
              <div style={{ fontSize: 9.5, color: "#9A988E", marginTop: 2 }}>{k.category}{k.area && k.area !== "—" ? ` ・ ${k.area}` : ""}</div>
            </div>
            <button onClick={() => onAdd(k.id)} style={{ flexShrink: 0, padding: "8px 14px", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>追加</button>
          </div>
        ))}
      </OverlayCard>
    </BottomSheet>
  );
}

export function ExecuteTab({ appState, persist, profileButton }: TabProps) {
  const magazine = appState.magazine;
  const [mapMode, setMapMode] = useState(false); // マガジン確定後でも地図に戻って選び直すときtrue
  const [pinItem, setPinItem] = useState<Keep | null>(null);
  const [draftSelection, setDraftSelection] = useState<string[]>([]);
  const [draftMediaSelection, setDraftMediaSelection] = useState<string[]>([]);
  const [editingMag, setEditingMag] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<ExecItem | null>(null);
  const [bookOpen, setBookOpen] = useState(false);

  const showMap = !magazine || mapMode;
  // 地図には実行済み以外の全Keepをピンとして出す(マガジン掲載中plannedも、選び直しのため含める)
  const pool = appState.keeps.filter((k) => k.status !== "done");
  // 実行タブのメディア棚はストックタブ「作品」と同じ records.media を見るだけの
  // ビュー。ここでの「観た/読んだ/聴いた」もストック側と全く同じ状態遷移(status→done)
  // を起こす、唯一の出口を複数の入口から呼べるようにしているだけ。
  const mediaPool = keepMedia(appState);
  const notInMagazine = pool.filter((k) => !(magazine?.itemIds ?? []).some((r) => r.type === "keep" && r.id === k.id));
  const magItems: ExecItem[] = magazine ? magazine.itemIds
    .map((ref): ExecItem | null => {
      if (ref.type === "keep") {
        const k = appState.keeps.find((x) => x.id === ref.id);
        if (!k) return null;
        return {
          id: k.id, type: "keep", title: k.title, images: k.images, color: k.color,
          categoryLabel: k.category ?? "", area: k.area, meta: k.meta, sourceUrl: k.sourceUrl, sourceLabel: k.sourceLabel,
          doneActionLabel: "行った", kept: k.origin !== "manual", done: k.status === "done",
        };
      }
      const r = appState.records.media.find((x) => x.id === ref.id);
      if (!r) return null;
      return {
        id: r.id, type: "media", title: r.title, images: r.image ? [r.image] : undefined, color: r.color,
        categoryLabel: mediaKindOf(r.kind).label, meta: r.creator ? [r.creator] : undefined,
        sourceUrl: r.sourceUrl, sourceLabel: r.sourceLabel, doneActionLabel: mediaKindOf(r.kind).doneActionLabel,
        kind: r.kind, kept: r.origin !== "manual", done: (r.status ?? "done") === "done",
      };
    })
    .filter((x): x is ExecItem => !!x) : [];

  const currentBundleWeek = mostRecentThursday();
  const bundlesAreNew = (appState.weekendMeta?.lastSeenBundleWeek ?? null) !== currentBundleWeek;

  useEffect(() => {
    if (!showMap || !bundlesAreNew || pool.length === 0) return;
    const t = setTimeout(() => {
      const next = structuredClone(appState);
      next.weekendMeta = { ...(next.weekendMeta ?? {}), lastSeenBundleWeek: currentBundleWeek };
      persist(next);
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap, bundlesAreNew, currentBundleWeek, pool.length]);

  const toggleDraftKeep = (item: Keep) => {
    haptic(8);
    setDraftSelection((prev) => prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id]);
  };
  const toggleDraftMedia = (item: MediaRecord) => {
    haptic(8);
    setDraftMediaSelection((prev) => prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id]);
  };
  const removeDraftItem = (id: string, type: MagazineItemRef["type"]) => {
    if (type === "keep") setDraftSelection((prev) => prev.filter((x) => x !== id));
    else setDraftMediaSelection((prev) => prev.filter((x) => x !== id));
  };

  // 地図での確定。新規作成と選び直し(更新)の両方に対応:
  // まず現在plannedのものを全て候補に戻し、選ばれたidだけをplannedにし直す。
  const confirmMagazine = (keepIds: string[], mediaIds: string[] = []) => {
    if (!keepIds.length && !mediaIds.length) return;
    haptic(16);
    const next = structuredClone(appState);
    next.keeps.forEach((k) => { if (k.status === "planned") k.status = "candidate"; });
    next.keeps.forEach((k) => { if (keepIds.includes(k.id)) k.status = "planned"; });
    const itemIds: MagazineItemRef[] = [
      ...keepIds.map((id) => ({ id, type: "keep" as const })),
      ...mediaIds.map((id) => ({ id, type: "media" as const })),
    ];
    next.magazine = { dateKey: todayKey(), decidedAt: new Date().toISOString(), itemIds };
    persist(next);
    setDraftSelection([]);
    setDraftMediaSelection([]);
    setMapMode(false);
    setEditingMag(false);
  };
  const addToMagazine = (id: string) => {
    haptic(10);
    const next = structuredClone(appState);
    const k = next.keeps.find((x) => x.id === id);
    if (k) k.status = "planned";
    next.magazine!.itemIds = [...next.magazine!.itemIds, { id, type: "keep" }];
    persist(next);
  };
  const removeFromMagazine = (id: string, type: MagazineItemRef["type"]) => {
    const next = structuredClone(appState);
    next.magazine!.itemIds = next.magazine!.itemIds.filter((r) => !(r.id === id && r.type === type));
    if (type === "keep") {
      const k = next.keeps.find((x) => x.id === id);
      if (k) k.status = "candidate";
    }
    if (next.magazine!.itemIds.length === 0) { next.magazine = null; setEditingMag(false); }
    persist(next);
  };
  // 行った/観たにしても、ボードからはすぐには消さない。itemIdsはそのまま
  // 残し、状態をdoneにするだけにして、ScrapCard側でグレーアウト表示にする
  // ことで「今日やったこと」がその場に積み上がって見えるようにしている。
  const markDoneInMagazine = (id: string, type: MagazineItemRef["type"]) => {
    haptic(14);
    const next = structuredClone(appState);
    if (type === "keep") {
      const k = next.keeps.find((x) => x.id === id);
      if (k) {
        k.status = "done";
        k.doneAt = new Date().toISOString();
        const mediaKind = inferMediaKind(k.category);
        if (mediaKind) {
          next.records = next.records ?? { media: [] };
          next.records.media.unshift({ id: `media-${Date.now()}`, kind: mediaKind, title: k.title, creator: "", addedAt: k.doneAt, status: "done", doneAt: k.doneAt, image: k.images?.[0], color: k.color, sourceKeepId: k.id });
        }
      }
    } else {
      const r = next.records.media.find((x) => x.id === id);
      if (r) {
        r.status = "done";
        r.doneAt = new Date().toISOString();
      }
    }
    persist(next);
  };
  const dissolveMagazine = () => {
    const next = structuredClone(appState);
    (next.magazine?.itemIds ?? []).forEach((r) => {
      if (r.type === "keep") {
        const k = next.keeps.find((x) => x.id === r.id);
        if (k) k.status = "candidate";
      }
    });
    next.magazine = null;
    persist(next);
    setEditingMag(false);
    setMapMode(false);
  };
  const injectDemo = () => {
    const next = structuredClone(appState);
    const now = Date.now();
    ([
      { title: "「建築と自然」展を観る", category: "展覧会", area: "竹橋", images: ["momat-a", "momat-b"], sourceUrl: "https://www.momat.go.jp/", sourceLabel: "公式サイトを見る", color: "#33467C", meta: ["国立近代美術館", "10:00–17:00", "¥1,800"] },
      { title: "蔵前の焙煎所で豆を買う", category: "近所の発見", area: "蔵前", images: ["kuramae-a", "kuramae-b"], sourceUrl: mapsUrl("COFFEE WRIGHTS 蔵前"), sourceLabel: "地図で見る", color: "#3F6B4A", meta: ["COFFEE WRIGHTS", "9:00–18:00"] },
      { title: "高円寺の古着屋を覗く", category: "古着", area: "高円寺", images: ["vintage-a", "vintage-b"], sourceUrl: mapsUrl("高円寺 古着屋"), sourceLabel: "地図で見る", color: "#8B4A2E", meta: ["高円寺北口エリア"] },
      { title: "神保町の古書店街を歩く", category: "近所の発見", area: "神保町", images: ["books-a", "books-b"], sourceUrl: mapsUrl("神保町 古書店街"), sourceLabel: "地図で見る", color: "#3F6B4A", meta: ["神保町"] },
      { title: "『大工の技術史』展を観る", category: "展覧会", area: "両国", images: ["carpentry-a", "carpentry-b"], sourceUrl: mapsUrl("江戸東京博物館"), sourceLabel: "公式サイトを見る", color: "#33467C", meta: ["江戸東京博物館"] },
      { title: "銭湯サウナを開拓する", category: "未知との遭遇", area: "蔵前", images: ["sauna-a", "sauna-b"], sourceUrl: mapsUrl("蔵前 銭湯"), sourceLabel: "地図で見る", color: "#5C4B6B", meta: ["蔵前"] },
    ]).forEach((d, i) => {
      next.keeps.push({ id: `demo-${now}-${i}`, title: d.title, category: d.category, area: d.area, status: "candidate", keptAt: new Date(now - i * 86400000).toISOString(), images: d.images, meta: d.meta, sourceUrl: d.sourceUrl, sourceLabel: d.sourceLabel, color: d.color });
    });
    persist(next);
  };
  type DraftBinderEntry = { id: string; type: MagazineItemRef["type"]; title: string; image?: string; color?: string };
  const draftBinderItems: DraftBinderEntry[] = [
    ...draftSelection.map((id): DraftBinderEntry | null => {
      const k = appState.keeps.find((x) => x.id === id);
      return k ? { id, type: "keep", title: k.title, image: k.images?.[0], color: k.color } : null;
    }),
    ...draftMediaSelection.map((id): DraftBinderEntry | null => {
      const r = appState.records.media.find((x) => x.id === id);
      return r ? { id, type: "media", title: r.title, image: r.image, color: r.color } : null;
    }),
  ].filter((x): x is DraftBinderEntry => !!x);

  return (
    <>
      <Masthead title="実行" statValue={magazine && !showMap ? magItems.length : pool.length + mediaPool.length} statLabel={magazine && !showMap ? "件の目的地" : "件の候補"} corner={profileButton} />

      {showMap ? (
        <>
          {magazine && (
            <button onClick={() => { setMapMode(false); setDraftSelection([]); setDraftMediaSelection([]); }} style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", padding: "12px 2px 0", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#9A988E" }}>← マガジンに戻る</button>
          )}
          <MapPlanner
            pool={pool} mediaPool={mediaPool} draftSelection={draftSelection} draftMediaSelection={draftMediaSelection}
            onOpenPin={setPinItem} onToggleKeep={toggleDraftKeep} onToggleMedia={toggleDraftMedia}
            onPickBundle={(ids) => confirmMagazine(ids, [])} onInjectDemo={injectDemo} bundlesAreNew={bundlesAreNew}
          />
          {(draftSelection.length + draftMediaSelection.length) > 0 && (
            <div style={{ position: "fixed", left: 0, right: 0, bottom: NAV_OFFSET, zIndex: 20, display: "flex", justifyContent: "center", background: `linear-gradient(to top, ${BG} 75%, rgba(239,237,230,0))`, paddingTop: 16 }}>
              <div style={{ width: "100%", maxWidth: 420, padding: "0 16px 10px" }}>
                <DraftBinder items={draftBinderItems} onRemove={removeDraftItem} />
                <button onClick={() => confirmMagazine(draftSelection, draftMediaSelection)} style={{ width: "100%", padding: "14px 0", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", boxShadow: "0 8px 24px rgba(23,23,21,0.2)" }}>
                  {draftSelection.length + draftMediaSelection.length}件で{magazine ? "マガジンを更新" : "マガジンを作る"}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <main style={{ paddingTop: 6, paddingBottom: 24 }}>
          {/* 編集への入り口は控えめに: 小さなテキストのみ */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 2px 10px" }}>
            <button onClick={() => {
              setDraftSelection(magazine!.itemIds.filter((r) => r.type === "keep").map((r) => r.id));
              setDraftMediaSelection(magazine!.itemIds.filter((r) => r.type === "media").map((r) => r.id));
              setMapMode(true);
            }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#9A988E" }}>← 地図で選び直す</button>
            <button onClick={() => setEditingMag(!editingMag)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 11, fontWeight: 700, color: editingMag ? INK : "#9A988E" }}>{editingMag ? "完了" : "編集"}</button>
          </div>

          {/* 今日のマガジンは「バインダーに閉じられた1冊の本」として見せる。
              タップするとBookReaderが画面いっぱいに展開し、スワイプでページが
              捲れる。奥に控えめに重なる2枚の紙の縁で「束ねられた本」感を出す。 */}
          {magItems.length > 0 && (
            <button onClick={() => setBookOpen(true)} style={{ position: "relative", width: "100%", textAlign: "left", cursor: "pointer", border: "none", padding: 0, background: "none", display: "block", margin: "4px 0 18px" }}>
              <div style={{ position: "absolute", inset: "5px -3px -6px 3px", borderRadius: 16, background: "#F1ECDD", boxShadow: "0 6px 14px rgba(28,28,30,0.1)" }} />
              <div style={{ position: "absolute", inset: "2.5px -1.5px -3px 1.5px", borderRadius: 17, background: "#F7F3E7", boxShadow: "0 6px 12px rgba(28,28,30,0.08)" }} />
              <div style={{ position: "relative", background: PAPER, color: INK, borderRadius: 18, padding: "14px 18px 14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: SOFT_SHADOW_LG }}>
                {[0.24, 0.76].map((y) => (
                  <div key={y} style={{
                    position: "absolute", left: 9, top: `${y * 100}%`, transform: "translateY(-50%)", width: 11, height: 11, borderRadius: "50%",
                    background: "linear-gradient(135deg, #E2DFD3 0%, #B8B4A6 100%)", boxShadow: "inset 0 1px 1.5px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.5)",
                  }}>
                    <div style={{ position: "absolute", inset: 2.5, borderRadius: "50%", background: BG }} />
                  </div>
                ))}
                <div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#9A988E" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#9A988E", flexShrink: 0 }} />TODAY
                  </div>
                  <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 16, margin: "4px 0 0" }}>今日のための行き先リスト</div>
                  <div style={{ fontSize: 9.5, color: "#9A988E", marginTop: 3 }}>タップして開く</div>
                </div>
                <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 30, color: INK, flexShrink: 0, marginLeft: 12 }}>{magItems.length}</div>
              </div>
            </button>
          )}

          {/* 白いが質感のある板(リネン/キャンバス調)。細かい織り目のテクスチャと
              柔らかい陰影で「物理的な板」を演出し、その上にScrapCard(画鋲留めの
              写真)をスタイライズ+ちょっとリアルの中間くらいの見た目で配置する。 */}
          <div style={{
            position: "relative", borderRadius: 22, padding: "26px 16px 22px",
            background: "radial-gradient(rgba(28,28,30,0.035) 1px, transparent 1.6px) 0 0/14px 14px, #F0EBDD",
            boxShadow: "inset 0 2px 10px rgba(28,28,30,0.09), inset 0 -1px 0 rgba(255,255,255,0.6), 0 8px 22px rgba(28,28,30,0.1)",
          }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 18, rowGap: 32 }}>
              {magItems.map((item) => (
                <ScrapCard key={`${item.type}-${item.id}`} item={item} onClick={() => setDetailItem(item)} />
              ))}
              {editingMag && (
                <button onClick={() => setAddSheetOpen(true)} style={{
                  flex: "1 1 42%", maxWidth: 180, minWidth: 130, aspectRatio: "3 / 4", borderRadius: 18, cursor: "pointer",
                  border: "1.5px dashed rgba(28,28,30,0.22)", background: "rgba(255,255,255,0.4)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  <span style={{ fontSize: 28, color: "#9A988E", lineHeight: 1 }}>＋</span>
                  <span style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: "#9A988E", letterSpacing: "0.06em" }}>候補から追加</span>
                </button>
              )}
            </div>
          </div>

          {editingMag && (
            <button onClick={dissolveMagazine} style={{ marginTop: 12, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: RUST, letterSpacing: "0.04em" }}>このマガジンを解散する</button>
          )}
        </main>
      )}

      <BinderModal
        item={pinItem}
        onClose={() => setPinItem(null)}
        actionSlot={pinItem ? ((closeSheet) => (
          <button onClick={() => { toggleDraftKeep(pinItem); closeSheet(); }} style={{
            width: "100%", padding: "12px 0", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
            background: draftSelection.includes(pinItem.id) ? "transparent" : INK,
            color: draftSelection.includes(pinItem.id) ? RUST : PAPER,
            border: draftSelection.includes(pinItem.id) ? `1.5px solid ${RUST}` : "none",
          }}>{draftSelection.includes(pinItem.id) ? "外す" : "＋ 今日に追加"}</button>
        )) : undefined}
      />
      <BinderModal
        item={detailItem ? { title: detailItem.title, category: detailItem.categoryLabel, images: detailItem.images, meta: detailItem.meta, sourceUrl: detailItem.sourceUrl, sourceLabel: detailItem.sourceLabel } : null}
        onClose={() => setDetailItem(null)}
        actionSlot={detailItem ? ((closeSheet) => (
          detailItem.done ? (
            <button onClick={() => { removeFromMagazine(detailItem.id, detailItem.type); closeSheet(); }} style={{ width: "100%", padding: "12px 0", borderRadius: 999, border: `1.5px solid ${RUST}`, background: "transparent", color: RUST, fontFamily: SANS, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>ボードから外す</button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { markDoneInMagazine(detailItem.id, detailItem.type); closeSheet(); }} style={{ flex: 1, padding: "12px 0", borderRadius: 999, border: "none", background: GREEN, color: "#fff", fontFamily: SANS, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{detailItem.doneActionLabel}</button>
              <button onClick={() => { removeFromMagazine(detailItem.id, detailItem.type); closeSheet(); }} style={{ flex: 1, padding: "12px 0", borderRadius: 999, border: `1.5px solid ${RUST}`, background: "transparent", color: RUST, fontFamily: SANS, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>外す</button>
            </div>
          )
        )) : undefined}
      />
      {addSheetOpen && <AddToMagazineSheet pool={notInMagazine} onAdd={(id) => addToMagazine(id)} onClose={() => setAddSheetOpen(false)} />}
      {bookOpen && magItems.length > 0 && (
        <BookReader
          items={magItems}
          onClose={() => setBookOpen(false)}
          onMarkDone={(item) => markDoneInMagazine(item.id, item.type)}
          onOpenDetail={(item) => { setBookOpen(false); setDetailItem(item); }}
        />
      )}
    </>
  );
}
