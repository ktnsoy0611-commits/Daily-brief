"use client";

import { BookOpen, Check, Film, MapPin, Music, Music2, Palette, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { BinderModal, type IconType, Masthead, PosterCard } from "@/components/common";
import { AREA_COORDS, BLUE, GREEN, HAIRLINE, INK, ITEM_CARD_ASPECT, NAV_OFFSET, PAPER, RUST, SANS, SOFT_SHADOW, SOFT_SHADOW_LG, catOf, mediaKindOf } from "@/lib/constants";
import { dayInfo, haptic, img, inferMediaKind, keepMedia, mapsUrl, mostRecentThursday, pinPosition, shade, todayKey } from "@/lib/helpers";
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
function SelectablePosterCard({ selected, onToggle, size = 132, ...cardProps }: {
  selected: boolean; onToggle: () => void; size?: number;
} & Omit<Parameters<typeof PosterCard>[0], "onClick" | "size">) {
  const [pressed, setPressed] = useState(false);
  const release = () => setPressed(false);
  return (
    <div
      onPointerDown={() => setPressed(true)}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      style={{
        position: "relative", flexShrink: 0, width: size,
        transition: pressed ? "transform 0.06s" : "transform 0.2s cubic-bezier(0.34,1.56,0.64,1)",
        transform: pressed ? "scale(0.92)" : selected ? "scale(0.96)" : "scale(1)",
      }}
    >
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

// タップで追加したものが積み上がっていく様子を見せる、確定ボタンまで
// 一体化した1行のフローティングバー。以前はこの束(写真)と確定ボタンを
// 縦に2段重ねていたため、地図/一覧の下側をかなりの高さで占有してしまい、
// スクロールできる範囲や視認できる範囲を圧迫していた。1行に収めることで
// 画面占有を大きく減らしている。
function DraftBinder({ items, onRemove, onConfirm, confirmLabel }: {
  items: { id: string; type: MagazineItemRef["type"]; title: string; image?: string; color?: string }[];
  onRemove: (id: string, type: MagazineItemRef["type"]) => void;
  onConfirm: () => void;
  confirmLabel: string;
}) {
  const shown = items.slice(-3);
  const rotations = [-8, 6, -4];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 8px 12px", background: PAPER, borderRadius: 22, boxShadow: SOFT_SHADOW_LG }}>
      <div style={{ position: "relative", width: 38, height: 38, flexShrink: 0 }}>
        {shown.map((it, i) => (
          <button key={`${it.type}-${it.id}`} onClick={() => onRemove(it.id, it.type)} aria-label={`${it.title}を外す`} style={{
            position: "absolute", top: 0, left: 0, width: 32, height: 32, borderRadius: 7, overflow: "hidden", padding: 0, cursor: "pointer",
            border: "2px solid #fff", boxShadow: "0 2px 6px rgba(23,23,21,0.28)", background: "none",
            transform: `rotate(${rotations[i % rotations.length]}deg) translate(${i * 3}px, ${i * -3}px)`, zIndex: i,
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{items.length}件、たまってきました</div>
        <div style={{ fontSize: 8.5, color: "#9A988E", marginTop: 1 }}>タップで外せます</div>
      </div>
      <button onClick={onConfirm} style={{ flexShrink: 0, padding: "11px 16px", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
        {confirmLabel}
      </button>
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

  const bottomPadding = draftSelection.length + draftMediaSelection.length > 0 ? 96 : 24;

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

// PosterCardと同じ「ルーズリーフの穴+切り取り線」モチーフを、今度は
// mask-imageで本物の透過にして使う。バインダーは常にタブの地の色(BG)の
// 上に浮くだけなので、どんな背景の上でも安全な装飾円ではなく、実際に
// 下地が透けて見える本物の穴を開けられる。PosterCardと同じ2つ穴。
const HOLE_MASK = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 347"><rect width="260" height="347" fill="white"/><circle cx="15" cy="83" r="5.5" fill="black"/><circle cx="15" cy="264" r="5.5" fill="black"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();
const holeMaskStyle: CSSProperties = {
  WebkitMaskImage: HOLE_MASK, maskImage: HOLE_MASK,
  WebkitMaskSize: "100% 100%", maskSize: "100% 100%",
  WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
};
// バインダーの紙(#FBF8EF)とタブの地の色(BG、#F3F1EC)は非常に近い色なので、
// 穴を本物の透過にするだけでは下地がほぼ同化して見えなくなってしまう。
// マスクされた紙の「外側」に、穴の位置にだけ薄い縁取り(輪郭)を重ねて、
// 背景色に関わらず「穴が空いている」ことがちゃんと読めるようにしている。
function HoleRings() {
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

// バインダーを綴じている実際のリング金具。ページ側の穴(HoleRings)は
// ページと一緒に回転して見た目の奥行きを出すが、こちらは逆にリング自体は
// 常に静止していて、ページだけがその周りを回って捲れる…という現実の
// バインダーの機構を再現するため、BinderBook側で1回だけ描画する固定レイヤー。
function BinderRings() {
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

// バインダーの1ページ。PosterCard/GoalCardと同じ穴+切り取り線の余白列を
// 左端に確保し、行った/行ってないは本文を隠さない右上の2アイコンで
// 完結させる。
function BookPage({ item, index, total, falling, onMarkDone, onDrop }: {
  item: ExecItem; index: number; total: number; falling?: boolean;
  onMarkDone: () => void;
  onDrop: () => void;
}) {
  const IconComp = item.type === "keep" ? MapPin : (item.kind ? MEDIA_ICON[item.kind] : undefined);
  const fill = item.color ?? "#5A5A54";
  return (
    <div style={{
      position: "absolute", inset: 0,
      transform: falling ? "translateY(140%) rotate(10deg)" : "translateY(0) rotate(0deg)",
      opacity: falling ? 0 : 1,
      transition: falling ? "transform 0.42s cubic-bezier(0.55,0,1,0.45), opacity 0.42s ease-in" : "none",
    }}>
      <div style={{
        position: "absolute", inset: 0, background: "#FBF8EF", borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column",
        boxShadow: "0 1px 2px rgba(28,28,30,0.08)", ...holeMaskStyle,
      }}>
        <div style={{ position: "absolute", left: 23, top: 6, bottom: 6, width: 1, backgroundImage: "repeating-linear-gradient(to bottom, rgba(28,28,30,0.14) 0 3px, transparent 3px 7px)" }} />
        <div style={{ position: "relative", flex: "0 0 44%", margin: "0 0 0 30px", overflow: "hidden", background: item.images?.[0] ? fill : `linear-gradient(135deg, ${shade(fill, 14)} 0%, ${fill} 45%, ${shade(fill, -18)} 100%)` }}>
          {item.images?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img(item.images[0], 500, 460)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : IconComp ? (
            <div style={{ position: "absolute", bottom: "-18%", right: "-10%", width: "56%", aspectRatio: "1 / 1", transform: "rotate(-14deg)", opacity: 0.16 }}>
              <IconComp size="100%" strokeWidth={1} color="#fff" />
            </div>
          ) : null}
        </div>
        <div style={{ flex: 1, padding: "12px 16px 12px 30px", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ fontSize: 8, letterSpacing: "0.14em", color: "#9A988E", fontWeight: 700 }}>{item.categoryLabel}{item.area && item.area !== "—" ? ` ・ ${item.area}` : ""}</div>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 14, lineHeight: 1.28, marginTop: 5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title}</div>
          {item.meta && item.meta.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              {item.meta.slice(0, 2).map((m, i) => <div key={i} style={{ fontSize: 9.5, color: "#5A5A54", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m}</div>)}
            </div>
          )}
          <div style={{ marginTop: "auto", fontSize: 8, color: "#B7B4A6", letterSpacing: "0.06em" }}>{index + 1} / {total}</div>
        </div>
        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 5, zIndex: 6 }}>
          <button onClick={(e) => { e.stopPropagation(); if (!item.done) onMarkDone(); }} aria-label={item.done ? "完了ずみ" : item.doneActionLabel} style={{
            width: 25, height: 25, borderRadius: "50%", border: "none", cursor: item.done ? "default" : "pointer", padding: 0,
            background: item.done ? GREEN : "rgba(28,28,30,0.08)", color: item.done ? "#fff" : "#8A8A82",
            display: "flex", alignItems: "center", justifyContent: "center", boxShadow: item.done ? "0 3px 8px rgba(46,154,92,0.4)" : "none",
          }}><Check size={12} strokeWidth={3} /></button>
          <button onClick={(e) => { e.stopPropagation(); onDrop(); }} aria-label={item.done ? "外す" : "行ってない"} style={{
            width: 25, height: 25, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0,
            background: "rgba(193,90,52,0.12)", color: RUST, display: "flex", alignItems: "center", justifyContent: "center",
          }}><X size={12} strokeWidth={3} /></button>
        </div>
      </div>
      <HoleRings />
    </div>
  );
}

// 全ページを捲り終えた先にある裏表紙。ここに来て初めて「登録」が現れる、
// 本を閉じる最後の1ページという位置づけ。
function BackCoverPage({ dateLabel, count, onRegister }: { dateLabel: string; count: number; onRegister: () => void }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", inset: 0, background: "#FBF8EF", borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 2px rgba(28,28,30,0.08)", ...holeMaskStyle }}>
        <div style={{ position: "absolute", left: 23, top: 6, bottom: 6, width: 1, backgroundImage: "repeating-linear-gradient(to bottom, rgba(28,28,30,0.14) 0 3px, transparent 3px 7px)" }} />
        <div style={{ fontSize: 8, letterSpacing: "0.16em", color: "#9A988E", fontWeight: 700, marginLeft: 30 }}>{dateLabel}</div>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 13, margin: "6px 0 16px", textAlign: "center", padding: "0 26px" }}>{count}件、今日はここまで</div>
        <button onClick={(e) => { e.stopPropagation(); onRegister(); }} aria-label="登録" style={{
          width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0,
          background: INK, color: PAPER, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
          boxShadow: "0 8px 18px rgba(28,28,30,0.28)",
        }}>
          <Check size={16} strokeWidth={2.5} />
          <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.06em" }}>登録</span>
        </button>
      </div>
      <HoleRings />
    </div>
  );
}

// バインダー本体。他のタブと同じアイテムカード比率(3:4)のまま、
// 通常のカードよりふたまわりほど大きいサイズで、タブの中央にちょこんと
// 置く。全画面の演出や専用の背景は持たず、タブの地の色の上にそのまま
// 浮かべることで、他のタブと同じ「普通のタブの中に主役が1つ」という
// 見え方に揃えている。操作はスワイプのみ(矢印ボタンは廃止)で、指の
// 動きにページがその場で追従してから、指を離した位置に応じてめくり切る
// か元に戻るかがスナップで決まる。最後のアイテムページの先に裏表紙が
// あり、そこで「登録」を押すとバインダーごと下に落ちて記録タブへ向かう。
const BINDER_MAX_WIDTH = 260;

function BinderBook({ items, dateLabel, onMarkDone, onDrop, onRegister }: {
  items: ExecItem[];
  dateLabel: string;
  onMarkDone: (item: ExecItem) => void;
  onDrop: (item: ExecItem) => void;
  onRegister: () => void;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  // progress: 0(未着手)〜1(めくり切り)。settlingがfalseの間は指の動きに
  // 1:1で追従(transitionなし)、指を離した瞬間だけsettling=trueにして
  // 短いスナップ遷移で0か1に収束させる。ボタン起点のアニメーションを
  // 廃止し、ドラッグの続きとして常に同じレイヤーで完結させることで、
  // 「離した位置から不連続にジャンプする」違和感を無くしている。
  const [drag, setDrag] = useState<{ dir: "next" | "prev"; progress: number; settling: boolean } | null>(null);
  const [dropping, setDropping] = useState<{ item: ExecItem; fallen: boolean } | null>(null);
  const [registering, setRegistering] = useState(false);
  const animating = useRef(false);
  const dragRef = useRef({ startX: 0, startY: 0, startTime: 0, active: false, dir: null as "next" | "prev" | null, width: BINDER_MAX_WIDTH });
  const cardRef = useRef<HTMLDivElement>(null);
  const totalPages = items.length + 1; // +1: 裏表紙

  useEffect(() => {
    setPageIndex((p) => Math.min(p, totalPages - 1));
  }, [totalPages]);

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
    if (animating.current || dropping || registering) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTime: performance.now(), active: true, dir: null, width: cardRef.current?.offsetWidth ?? BINDER_MAX_WIDTH };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    if (!d.dir) {
      const dy = e.clientY - d.startY;
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) { d.active = false; return; } // 縦方向は素通しでスクロールに譲る
      const wantNext = dx < 0;
      const boundary = wantNext ? pageIndex >= totalPages - 1 : pageIndex <= 0;
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
    const velocity = Math.abs(dx) / dt; // px/ms、短い距離でも素早く弾けばめくれる
    const progress = Math.min(1, Math.abs(dx) / (d.width * 0.55));
    settle(d.dir, progress > 0.24 || velocity > 0.5);
  };
  const onCancel = () => {
    const d = dragRef.current;
    if (d.active && d.dir) settle(d.dir, false);
    d.active = false;
  };

  // 「行ってない」で外すと、そのページが下に落ちて消える。落ちている間
  // 下の層には次のページ(または裏表紙)をあらかじめ覗かせておき、
  // 落ち切った時に自然に切り替わって見えるようにする。まず静止状態で
  // マウントしてから次のフレームで「落下後」の見た目に切り替えることで、
  // トランジションが確実に発火するようにしている(フリップ演出と同じ手法)。
  const handleDrop = (item: ExecItem) => {
    if (dropping || animating.current) return;
    haptic(12);
    setDropping({ item, fallen: false });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setDropping((d) => (d ? { ...d, fallen: true } : d));
    }));
    setTimeout(() => {
      onDrop(item);
      setDropping(null);
    }, 420);
  };

  const handleRegister = () => {
    if (registering) return;
    haptic(18);
    setRegistering(true);
    setTimeout(onRegister, 420);
  };

  const baseIndex = dropping ? Math.min(pageIndex + 1, totalPages - 1) : drag ? (drag.dir === "next" ? pageIndex + 1 : pageIndex) : pageIndex;
  const leafIndex = drag ? (drag.dir === "next" ? pageIndex : pageIndex - 1) : null;
  const progress = drag ? drag.progress : 0;
  // 「next」は0度→-180度へ、「prev」は-180度(裏返って隠れている状態)から
  // 0度へ戻る向きなので、同じprogress(0〜1)でも回転の起点・終点が逆になる。
  const dragAngle = !drag ? 0 : drag.dir === "next" ? -180 * progress : -180 * (1 - progress);
  const liftZ = 44 * Math.sin(Math.min(progress, 1) * Math.PI);

  const renderPage = (idx: number) => {
    if (idx === items.length) return <BackCoverPage dateLabel={dateLabel} count={items.length} onRegister={handleRegister} />;
    const it = items[idx];
    if (!it) return null;
    return <BookPage item={it} index={idx} total={items.length} onMarkDone={() => onMarkDone(it)} onDrop={() => handleDrop(it)} />;
  };

  return (
    <div style={{
      flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      transform: registering ? "translateY(70%)" : "translateY(0)", opacity: registering ? 0 : 1,
      transition: registering ? "transform 0.42s cubic-bezier(0.5,0,1,0.5), opacity 0.36s ease-in" : "none",
    }}>
      <div
        ref={cardRef}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}
        style={{
          position: "relative", width: "100%", maxWidth: BINDER_MAX_WIDTH, aspectRatio: ITEM_CARD_ASPECT, perspective: 700,
          touchAction: "pan-y", filter: "drop-shadow(0 12px 26px rgba(28,28,30,0.2))",
        }}
      >
        {[10, 5].map((inset, i) => (
          <div key={inset} style={{ position: "absolute", right: -inset * 0.6, top: 7 + i * 2, bottom: 7 + i * 2, width: inset, borderRadius: "0 4px 4px 0", background: `#EDE7D6`, boxShadow: "1px 0 2px rgba(28,28,30,0.1)" }} />
        ))}
        {renderPage(baseIndex)}
        {dropping && (
          <BookPage item={dropping.item} index={pageIndex} total={items.length} falling={dropping.fallen} onMarkDone={() => {}} onDrop={() => {}} />
        )}
        {drag && leafIndex !== null && leafIndex >= 0 && leafIndex < totalPages && (
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
        {pageIndex + 1} / {totalPages}
      </div>
    </div>
  );
}

export function ExecuteTab({ appState, persist, goTab, profileButton }: TabProps) {
  const magazine = appState.magazine;
  const [mapMode, setMapMode] = useState(false); // バインダー確定後でも地図に戻って選び直すときtrue
  const [pinItem, setPinItem] = useState<Keep | null>(null);
  const [draftSelection, setDraftSelection] = useState<string[]>([]);
  const [draftMediaSelection, setDraftMediaSelection] = useState<string[]>([]);

  const showMap = !magazine || mapMode;
  // 地図には実行済み以外の全Keepをピンとして出す(マガジン掲載中plannedも、選び直しのため含める)
  const pool = appState.keeps.filter((k) => k.status !== "done");
  // 実行タブのメディア棚はストックタブ「作品」と同じ records.media を見るだけの
  // ビュー。ここでの「観た/読んだ/聴いた」もストック側と全く同じ状態遷移(status→done)
  // を起こす、唯一の出口を複数の入口から呼べるようにしているだけ。
  const mediaPool = keepMedia(appState);
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
  };
  const removeFromMagazine = (id: string, type: MagazineItemRef["type"]) => {
    const next = structuredClone(appState);
    next.magazine!.itemIds = next.magazine!.itemIds.filter((r) => !(r.id === id && r.type === type));
    if (type === "keep") {
      const k = next.keeps.find((x) => x.id === id);
      if (k) k.status = "candidate";
    }
    if (next.magazine!.itemIds.length === 0) next.magazine = null;
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
  // 裏表紙の「登録」。バインダーを閉じて今日を締めくくる操作。「行きましたか？」
  // のような追加の確認は挟まず、まだ行った/行ってないが付いていない場所の
  // Keepはそのまま候補に戻し、そのまま記録タブへ向かう。
  const registerBinder = () => {
    const next = structuredClone(appState);
    (next.magazine?.itemIds ?? []).forEach((r) => {
      if (r.type !== "keep") return;
      const k = next.keeps.find((x) => x.id === r.id);
      if (k && k.status !== "done") k.status = "candidate";
    });
    next.magazine = null;
    persist(next);
    setMapMode(false);
    goTab("records");
  };
  // 場所のKeepだけでなく、作品(メディア)・ウィッシュリスト・目標も
  // まとめて投入する。地図(場所)だけ投入してもストック/目標タブは
  // 空のままでテストしづらいため、アプリ全体を一度に試せる分量にしている。
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
      { title: "下北沢のライブハウスへ", category: "音楽", area: "下北沢", images: ["live-a", "live-b"], sourceUrl: mapsUrl("下北沢 ライブハウス"), sourceLabel: "地図で見る", color: "#2E4A3F", meta: ["下北沢"] },
      { title: "谷根千の坂道を散歩する", category: "身体", area: "谷根千", images: ["zakka-a", "zakka-b"], sourceUrl: mapsUrl("谷根千 散歩コース"), sourceLabel: "地図で見る", color: "#5A3A2E", meta: ["谷根千エリア"] },
    ]).forEach((d, i) => {
      next.keeps.push({ id: `demo-${now}-${i}`, title: d.title, category: d.category, area: d.area, status: "candidate", keptAt: new Date(now - i * 86400000).toISOString(), images: d.images, meta: d.meta, sourceUrl: d.sourceUrl, sourceLabel: d.sourceLabel, color: d.color });
    });
    ([
      { kind: "book" as const, title: "建築家のエッセイ集", creator: "", color: "#7A5636" },
      { kind: "album" as const, title: "通勤で聴き切る一枚", creator: "", color: "#6B4558" },
      { kind: "movie" as const, title: "Perfect Days 2", creator: "", color: "#1C1B22" },
      { kind: "exhibition" as const, title: "「建築と自然」展", creator: "国立近代美術館", color: "#33467C" },
    ]).forEach((d, i) => {
      next.records.media.unshift({ id: `demo-media-${now}-${i}`, kind: d.kind, title: d.title, creator: d.creator, addedAt: new Date(now - i * 43200000).toISOString(), color: d.color, status: i === 0 ? "keep" : "done", doneAt: i === 0 ? undefined : new Date(now - i * 43200000).toISOString() });
    });
    ([
      { title: "フィルムカメラを買う", categoryId: "buy" as const },
      { title: "陶芸をはじめる", categoryId: "do" as const },
      { title: "秋に一人旅へ行く", categoryId: "go" as const },
    ]).forEach((d, i) => {
      next.wishes.push({ id: `demo-wish-${now}-${i}`, title: d.title, category: catOf(d.categoryId).label, categoryId: d.categoryId, status: "stock", addedAt: new Date(now - i * 86400000).toISOString() });
    });
    if ((next.goals ?? []).length === 0) {
      next.goals = [
        { id: `demo-goal-${now}`, title: "毎週どこか知らない街を歩く", addedAt: new Date(now - 20 * 86400000).toISOString(), checkIns: [
          { id: `demo-ci-${now}-1`, at: new Date(now - 2 * 86400000).toISOString(), text: "神保町の路地を歩いた。古本の匂いが良かった。", source: "manual" },
          { id: `demo-ci-${now}-2`, at: new Date(now - 9 * 86400000).toISOString(), text: "蔵前をぶらぶら。焙煎所で豆を買った。", source: "manual" },
        ] },
        { id: `demo-goal-${now}-2`, title: "月に一度は展覧会へ行く", addedAt: new Date(now - 40 * 86400000).toISOString(), checkIns: [] },
      ];
    }
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
            <button onClick={() => { setMapMode(false); setDraftSelection([]); setDraftMediaSelection([]); }} style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", padding: "12px 2px 0", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#9A988E" }}>← バインダーに戻る</button>
          )}
          <MapPlanner
            pool={pool} mediaPool={mediaPool} draftSelection={draftSelection} draftMediaSelection={draftMediaSelection}
            onOpenPin={setPinItem} onToggleKeep={toggleDraftKeep} onToggleMedia={toggleDraftMedia}
            onPickBundle={(ids) => confirmMagazine(ids, [])} onInjectDemo={injectDemo} bundlesAreNew={bundlesAreNew}
          />
          {/* このバーはposition:fixedでタブバー(AppShellのnav)の真上に浮かせる。
              以前は写真の束と確定ボタンを縦2段+背景の下地グラデーションで
              構成しており、画面下部をかなりの高さで占有するうえ、その
              グラデーションがAppShellのnav側のグラデーション(zIndexが
              本UIより高いnavの子要素)と重なって、本UIの下側が白っぽく
              洗われて見えてしまっていた。1行の不透明なPAPERカードにした
              ことで、占有面積を大きく減らしつつ、下地を必要としない
              (カード自体が既に不透明なので、navのグラデーションと重なる
              問題も併せて解消される)。 */}
          {(draftSelection.length + draftMediaSelection.length) > 0 && (
            <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ position: "relative", width: "100%", maxWidth: 420, padding: `0 16px calc(${NAV_OFFSET} + 8px)`, pointerEvents: "auto" }}>
                <DraftBinder
                  items={draftBinderItems} onRemove={removeDraftItem}
                  onConfirm={() => confirmMagazine(draftSelection, draftMediaSelection)}
                  confirmLabel={magazine ? "更新する" : "作る"}
                />
              </div>
            </div>
          )}
        </>
      ) : magazine && (
        // 確定後は他のタブと同じ普通の構成(ヘッダー+地の色の背景)のまま、
        // タブの中央にバインダーが1つちょこんと乗るだけのミニマルな見た目。
        <>
          <button onClick={() => {
            setDraftSelection(magazine.itemIds.filter((r) => r.type === "keep").map((r) => r.id));
            setDraftMediaSelection(magazine.itemIds.filter((r) => r.type === "media").map((r) => r.id));
            setMapMode(true);
          }} style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", padding: "12px 2px 0", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#9A988E" }}>← 選び直す</button>
          <BinderBook
            items={magItems}
            dateLabel={dayInfo(magazine.decidedAt).label}
            onMarkDone={(item) => markDoneInMagazine(item.id, item.type)}
            onDrop={(item) => removeFromMagazine(item.id, item.type)}
            onRegister={registerBinder}
          />
        </>
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
    </>
  );
}
