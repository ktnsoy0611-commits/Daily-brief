"use client";

import { BookOpen, Check, Film, MapPin, Music, Music2, Palette, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BinderModal, type IconType, Masthead, PosterCard } from "@/components/common";
import { AREA_COORDS, BLUE, GREEN, HAIRLINE, INK, ITEM_CARD_ASPECT, NAV_OFFSET, PAPER, RUST, SANS, SOFT_SHADOW, SOFT_SHADOW_LG, catOf, mediaKindOf } from "@/lib/constants";
import { dayInfo, haptic, img, inferMediaKind, keepMedia, mapsUrl, mostRecentThursday, pinPosition, todayKey } from "@/lib/helpers";
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
      <button onClick={onPick} style={{ width: "100%", padding: "10px 0", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11.5, fontWeight: 700 }}>候補に追加</button>
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

// 開いた状態のバインダーを、一番上のカードの背後にだけ置く背景装飾。
// 背表紙はカードの下に隠れて見えず、表表紙だけが左手前へ開いてきた
// ような角度で覗く(perspective+rotateYで実際に奥行きのある紙として
// 傾ける)。カードよりひとまわり大きく、四隅からわずかにはみ出すことで
// 「カードはこのバインダーに挟まっている」という関係性を伝える。
// 登録アニメーションの後半でこの表紙が閉じる(closed=true)。
function OpenBinderBackdrop({ closed }: { closed: boolean }) {
  return (
    <div style={{ position: "absolute", left: "-15%", right: "-4%", top: "-6%", bottom: "-5%", perspective: 500, zIndex: 0, pointerEvents: "none" }}>
      <div style={{
        position: "absolute", inset: 0, background: PAPER, borderRadius: 6, boxShadow: SOFT_SHADOW_LG,
        transformOrigin: "6% 50%", transformStyle: "preserve-3d",
        transform: closed ? "rotateY(0deg) rotateZ(0deg)" : "rotateY(-36deg) rotateZ(-3deg)",
        transition: "transform 0.34s cubic-bezier(0.4,0,0.2,1)",
      }}>
        {/* 表紙の内側の面であることを示す、わずかな陰影 */}
        <div style={{ position: "absolute", inset: 0, borderRadius: 6, background: "linear-gradient(100deg, rgba(28,28,30,0.06) 0%, rgba(28,28,30,0) 30%)" }} />
        {/* リング穴のヒント(左端。実際のリングはカードの下に隠れる背表紙側にある) */}
        {["30%", "70%"].map((y) => (
          <div key={y} style={{ position: "absolute", left: "6%", top: y, transform: "translate(-50%, -50%)", width: 9, height: 9, borderRadius: "50%", background: "rgba(28,28,30,0.1)", boxShadow: "inset 0 1px 2px rgba(28,28,30,0.25)" }} />
        ))}
      </div>
    </div>
  );
}

// 実行タブの確定後の1枚のカード。他のタブと全く同じPosterCardをそのまま
// 使い、独自のカードデザインを持たない(以前は自前で組んだカードで、
// 見た目が他のタブのカードと食い違っていた)。右にスワイプすると背後に
// 「外す」の下地が現れ、閾値を超えて離すとカードが右へ飛んでリストから
// 外れる(以前のX ボタンに代わる操作)。行った/観たは従来通り右上の
// チェックで個別にマークでき、外すとは独立した状態として残る。
const CONFIRMED_REMOVE_THRESHOLD = 96;

function ConfirmedCard({ item, elRef, stackTransform, hide, onMarkDone, onRemove, disabled }: {
  item: ExecItem;
  elRef: (el: HTMLDivElement | null) => void;
  stackTransform?: string;
  hide?: boolean;
  onMarkDone: () => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, active: false, locked: false });
  const IconComp = item.type === "keep" ? MapPin : (item.kind ? MEDIA_ICON[item.kind] : undefined);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || removing) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, active: true, locked: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.locked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) { d.active = false; return; } // 縦方向はリストのスクロールに譲る
      d.locked = true;
      setDragging(true);
    }
    setDragX(Math.max(0, dx));
  };
  const finish = () => {
    const d = dragRef.current;
    if (!d.active) return;
    d.active = false;
    setDragging(false);
    if (dragX > CONFIRMED_REMOVE_THRESHOLD) {
      haptic(10);
      setRemoving(true);
      setTimeout(onRemove, 240);
    } else {
      setDragX(0);
    }
  };

  const transform = stackTransform ?? (removing ? "translateX(160%) rotate(10deg)" : `translateX(${dragX}px) rotate(${dragX * 0.045}deg)`);
  const opacity = hide || removing ? 0 : 1;
  const transition = stackTransform ? "transform 0.42s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease" : dragging ? "none" : "transform 0.26s cubic-bezier(0.32,0.72,0,1), opacity 0.2s ease";

  return (
    <div ref={elRef} style={{ position: "relative", width: "100%", aspectRatio: ITEM_CARD_ASPECT }}>
      {/* 右にスワイプすると下から現れる「外す」の下地 */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 20, background: RUST,
        display: "flex", alignItems: "center", paddingLeft: 22,
        opacity: Math.min(dragX / CONFIRMED_REMOVE_THRESHOLD, 1),
      }}>
        <span style={{ color: PAPER, fontFamily: SANS, fontWeight: 700, fontSize: 12, letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6 }}>
          <X size={16} strokeWidth={3} /> 外す
        </span>
      </div>
      <div
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={finish} onPointerCancel={finish}
        style={{ position: "absolute", inset: 0, touchAction: "pan-y", zIndex: 1, transform, opacity, transition }}
      >
        <PosterCard
          image={item.images?.[0]} color={item.color} title={item.title}
          sub={item.area && item.area !== "—" ? item.area : undefined}
          label={item.categoryLabel} icon={IconComp} kept={item.kept}
        />
        {item.done && <div style={{ position: "absolute", inset: 0, borderRadius: 18, background: "rgba(28,28,30,0.45)", pointerEvents: "none" }} />}
        <button onClick={(e) => { e.stopPropagation(); if (!item.done) onMarkDone(); }} aria-label={item.done ? "完了ずみ" : item.doneActionLabel} style={{
          position: "absolute", top: 12, right: 12, width: 34, height: 34, borderRadius: "50%", border: "none", cursor: item.done ? "default" : "pointer", padding: 0,
          background: item.done ? GREEN : "rgba(255,255,255,0.92)", color: item.done ? "#fff" : "#3A3A36",
          display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 8px rgba(28,28,30,0.28)",
        }}><Check size={16} strokeWidth={3} /></button>
      </div>
    </div>
  );
}

// 確定後の画面全体。以前はページをめくる本の形だったが、選んだカードが
// 縦一列に大きく並び、右スワイプで外していくシンプルなリストに変更した。
// 一番上のカードの下にだけ「開いたバインダー」を覗かせ、まだこのリストが
// バインダーに挟まっている途中である、という関係を伝える。登録を押すと
// (1)全カードが先頭カードの位置まで迫り上がってスタックし、
// (2)バインダーが閉じ、(3)閉じたバインダーごと下へ落ちる、という
// 3段階のアニメーションのあとに実際の登録処理を呼ぶ。
const CONFIRMED_MAX_WIDTH = 380;
const STACK_MS = 420;
const CLOSE_MS = 320;
const FALL_MS = 420;

function ConfirmedStack({ items, dateLabel, onMarkDone, onDrop, onRegister }: {
  items: ExecItem[];
  dateLabel: string;
  onMarkDone: (item: ExecItem) => void;
  onDrop: (item: ExecItem) => void;
  onRegister: () => void;
}) {
  const [registerPhase, setRegisterPhase] = useState<null | "stack" | "close" | "fall">(null);
  const [stackOffsets, setStackOffsets] = useState<Record<string, number>>({});
  const cardEls = useRef<Record<string, HTMLDivElement | null>>({});

  const handleRegister = () => {
    if (registerPhase || items.length === 0) return;
    haptic(16);
    const topEl = items[0] ? cardEls.current[items[0].id] : null;
    const topY = topEl?.getBoundingClientRect().top ?? 0;
    const offsets: Record<string, number> = {};
    items.forEach((it) => {
      const el = cardEls.current[it.id];
      offsets[it.id] = el ? topY - el.getBoundingClientRect().top : 0;
    });
    setStackOffsets(offsets);
    setRegisterPhase("stack");
    setTimeout(() => setRegisterPhase("close"), STACK_MS);
    setTimeout(() => setRegisterPhase("fall"), STACK_MS + CLOSE_MS);
    setTimeout(onRegister, STACK_MS + CLOSE_MS + FALL_MS);
  };

  const stacking = registerPhase !== null;
  const closed = registerPhase === "close" || registerPhase === "fall";
  const falling = registerPhase === "fall";

  return (
    <>
      <div
        className="no-scrollbar"
        style={{
          flex: 1, minHeight: 0, overflowY: falling ? "hidden" : "auto", WebkitOverflowScrolling: "touch",
          ...(falling ? { transform: "translateY(60%)", opacity: 0, transition: `transform ${FALL_MS}ms cubic-bezier(0.55,0,1,0.45), opacity ${FALL_MS - 40}ms ease-in` } : {}),
        }}
      >
        <div style={{ width: "100%", maxWidth: CONFIRMED_MAX_WIDTH, margin: "0 auto", padding: `6px 16px calc(${NAV_OFFSET} + 92px)` }}>
          <div style={{ fontSize: 10, letterSpacing: "0.16em", color: "#9A988E", fontWeight: 700, margin: "8px 2px 16px" }}>{dateLabel} ・ {items.length}件</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {items.map((it, i) => (
              <div key={it.id} style={{ position: "relative" }}>
                {i === 0 && <OpenBinderBackdrop closed={closed} />}
                <ConfirmedCard
                  item={it} elRef={(el) => { cardEls.current[it.id] = el; }}
                  stackTransform={stacking ? `translateY(${stackOffsets[it.id] ?? 0}px) scale(${i === 0 ? 1 : 0.92})` : undefined}
                  hide={closed}
                  disabled={stacking}
                  onMarkDone={() => onMarkDone(it)}
                  onRemove={() => onDrop(it)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {!stacking && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ width: "100%", maxWidth: CONFIRMED_MAX_WIDTH, padding: `0 16px calc(${NAV_OFFSET} + 8px)`, pointerEvents: "auto" }}>
            <button onClick={handleRegister} style={{
              width: "100%", padding: "15px 0", background: INK, color: PAPER, border: "none", borderRadius: 999,
              cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", boxShadow: SOFT_SHADOW_LG,
            }}>
              登録する
            </button>
          </div>
        </div>
      )}
    </>
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
  // 「今週のおすすめ」の「これにする」は、以前はそのまま確定してバインダー
  // 画面へ遷移していたが、他の選び方(ピン/カードのタップ)と同じく、
  // まず下書きの選択に加えるだけにする(ユーザーがまだ他のKeepも
  // 追加/除外してから自分のタイミングで確定できるようにするため)。
  const pickBundle = (ids: string[]) => {
    haptic(10);
    setDraftSelection((prev) => Array.from(new Set([...prev, ...ids])));
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
  // 記録タブの棚は「実行済み(done)」しか並ばないため、バインダーが
  // 何冊も、しかも厚みの違いも含めて並んだ様子を最初から見られるよう、
  // ほとんどの場所・メディアをdone状態(日付をずらして)で投入し、
  // 地図での選び直しを試せる分だけ候補(candidate/keep)を残す。
  const injectDemo = () => {
    const next = structuredClone(appState);
    const now = Date.now();
    ([
      { title: "「建築と自然」展を観る", category: "展覧会", area: "竹橋", images: ["momat-a", "momat-b"], sourceUrl: "https://www.momat.go.jp/", sourceLabel: "公式サイトを見る", color: "#33467C", meta: ["国立近代美術館", "10:00–17:00", "¥1,800"], done: true },
      { title: "竹橋のギャラリーで版画展を観る", category: "展覧会", area: "竹橋", images: ["print-a", "print-b"], sourceUrl: mapsUrl("竹橋 ギャラリー"), sourceLabel: "地図で見る", color: "#3A4A5C", meta: ["竹橋"], done: true },
      { title: "神保町の古書店街を歩く", category: "近所の発見", area: "神保町", images: ["books-a", "books-b"], sourceUrl: mapsUrl("神保町 古書店街"), sourceLabel: "地図で見る", color: "#3F6B4A", meta: ["神保町"], done: true },
      { title: "神保町の器店、作家の個展", category: "雑貨", area: "神保町", images: ["books-c"], sourceUrl: mapsUrl("神保町 器 個展"), sourceLabel: "地図で見る", color: "#6B5A3A", meta: ["神保町", "会期は今月いっぱい"], done: true },
      { title: "喫茶店でゆっくり読書する", category: "近所の発見", area: "神保町", images: ["kissa-a"], sourceUrl: mapsUrl("神保町 純喫茶"), sourceLabel: "地図で見る", color: "#5A3A2E", meta: ["神保町"], done: false },
      { title: "日比谷公園を散歩する", category: "身体", area: "日比谷", images: ["hibiya-park-a"], sourceUrl: mapsUrl("日比谷公園"), sourceLabel: "地図で見る", color: "#3A4A5C", meta: ["日比谷公園"], done: true },
      { title: "日比谷のミッドセンチュリー家具店", category: "雑貨", area: "日比谷", images: ["furniture-a"], sourceUrl: mapsUrl("日比谷 家具店"), sourceLabel: "地図で見る", color: "#6B5A3A", meta: ["日比谷"], done: false },
      { title: "谷根千の坂道を散歩する", category: "身体", area: "谷根千", images: ["zakka-a", "zakka-b"], sourceUrl: mapsUrl("谷根千 散歩コース"), sourceLabel: "地図で見る", color: "#5A3A2E", meta: ["谷根千エリア"], done: true },
      { title: "谷中の陶器市を覗く", category: "雑貨", area: "谷根千", images: ["zakka-c"], sourceUrl: mapsUrl("谷中 陶器市"), sourceLabel: "地図で見る", color: "#6B5A3A", meta: ["谷中エリア", "会期は今週末まで"], done: true },
      { title: "谷根千の純喫茶でひと休み", category: "近所の発見", area: "谷根千", images: ["kissa-b"], sourceUrl: mapsUrl("谷根千 純喫茶"), sourceLabel: "地図で見る", color: "#3F6B4A", meta: ["谷根千エリア"], done: true },
      { title: "浅草橋のボルダリングジムへ", category: "身体", area: "浅草橋", images: ["climb-a", "climb-b"], sourceUrl: mapsUrl("浅草橋 ボルダリングジム"), sourceLabel: "地図で見る", color: "#3A4A5C", meta: ["浅草橋駅から徒歩6分"], done: true },
      { title: "浅草橋の手芸問屋街を歩く", category: "雑貨", area: "浅草橋", images: ["zakka-d"], sourceUrl: mapsUrl("浅草橋 問屋街"), sourceLabel: "地図で見る", color: "#6B5A3A", meta: ["浅草橋"], done: false },
      { title: "蔵前の焙煎所で豆を買う", category: "近所の発見", area: "蔵前", images: ["kuramae-a", "kuramae-b"], sourceUrl: mapsUrl("COFFEE WRIGHTS 蔵前"), sourceLabel: "地図で見る", color: "#3F6B4A", meta: ["COFFEE WRIGHTS", "9:00–18:00"], done: true },
      { title: "銭湯サウナを開拓する", category: "未知との遭遇", area: "蔵前", images: ["sauna-a", "sauna-b"], sourceUrl: mapsUrl("蔵前 銭湯"), sourceLabel: "地図で見る", color: "#5C4B6B", meta: ["蔵前"], done: true },
      { title: "蔵前のレザー工房を覗く", category: "雑貨", area: "蔵前", images: ["leather-a"], sourceUrl: mapsUrl("蔵前 レザー工房"), sourceLabel: "地図で見る", color: "#6B5A3A", meta: ["蔵前"], done: true },
      { title: "『大工の技術史』展を観る", category: "展覧会", area: "両国", images: ["carpentry-a", "carpentry-b"], sourceUrl: mapsUrl("江戸東京博物館"), sourceLabel: "公式サイトを見る", color: "#33467C", meta: ["江戸東京博物館"], done: true },
      { title: "両国国技館のまわりを歩く", category: "身体", area: "両国", images: ["ryogoku-a"], sourceUrl: mapsUrl("両国国技館"), sourceLabel: "地図で見る", color: "#3A4A5C", meta: ["両国"], done: false },
      { title: "清澄白河で陶芸体験をする", category: "未知との遭遇", area: "清澄白河", images: ["pottery-a", "pottery-b"], sourceUrl: mapsUrl("清澄白河 陶芸体験"), sourceLabel: "地図で見る", color: "#5C4B6B", meta: ["清澄白河・陶房"], done: true },
      { title: "清澄白河のロースタリー巡り", category: "近所の発見", area: "清澄白河", images: ["kiyosumi-a"], sourceUrl: mapsUrl("清澄白河 ロースタリー"), sourceLabel: "地図で見る", color: "#3F6B4A", meta: ["清澄白河"], done: true },
      { title: "高円寺の古着屋を覗く", category: "古着", area: "高円寺", images: ["vintage-a", "vintage-b"], sourceUrl: mapsUrl("高円寺 古着屋"), sourceLabel: "地図で見る", color: "#8B4A2E", meta: ["高円寺北口エリア"], done: true },
      { title: "高円寺の古着市、大型セール", category: "古着", area: "高円寺", images: ["vintage-c"], sourceUrl: mapsUrl("高円寺 古着 セール"), sourceLabel: "地図で見る", color: "#6B3A4A", meta: ["高円寺北口一帯", "セールは3日間"], done: true },
      { title: "高円寺の小さなレコード店", category: "音楽", area: "高円寺", images: ["record-a"], sourceUrl: mapsUrl("高円寺 レコード店"), sourceLabel: "地図で見る", color: "#2E4A3F", meta: ["高円寺"], done: false },
    ]).forEach((d, i) => {
      next.keeps.push({
        id: `demo-${now}-${i}`, title: d.title, category: d.category, area: d.area,
        status: d.done ? "done" : "candidate",
        keptAt: new Date(now - (i + 3) * 30 * 3600 * 1000).toISOString(),
        doneAt: d.done ? new Date(now - i * 22 * 3600 * 1000).toISOString() : undefined,
        images: d.images, meta: d.meta, sourceUrl: d.sourceUrl, sourceLabel: d.sourceLabel, color: d.color,
      });
    });
    ([
      { kind: "movie" as const, title: "Perfect Days 2", creator: "", color: "#1C1B22", done: true },
      { kind: "movie" as const, title: "単館上映のドキュメンタリー", creator: "", color: "#3A2E4A", done: true },
      { kind: "movie" as const, title: "深夜のホラー特集上映", creator: "", color: "#22201F", done: false },
      { kind: "exhibition" as const, title: "「建築と自然」展", creator: "国立近代美術館", color: "#33467C", done: true },
      { kind: "exhibition" as const, title: "谷根千の器作家、個展", creator: "個人ギャラリー", color: "#6B5A3A", done: true },
      { kind: "exhibition" as const, title: "写真家の回顧展", creator: "損保ジャパン美術館", color: "#3A4A5C", done: false },
      { kind: "live" as const, title: "下北沢の対バンライブ", creator: "", color: "#2E4A3F", done: true },
      { kind: "live" as const, title: "高円寺の弾き語りナイト", creator: "", color: "#4A5A6B", done: true },
      { kind: "live" as const, title: "野外音楽フェス", creator: "", color: "#2E6B5C", done: false },
      { kind: "book" as const, title: "建築家のエッセイ集", creator: "", color: "#7A5636", done: true },
      { kind: "book" as const, title: "書評サイトで話題の短編集", creator: "", color: "#3A5A6B", done: true },
      { kind: "book" as const, title: "積読中の長編小説", creator: "", color: "#5A3A2E", done: false },
      { kind: "album" as const, title: "通勤で聴き切る一枚", creator: "", color: "#6B4558", done: true },
      { kind: "album" as const, title: "学生時代によく聴いたアルバム", creator: "", color: "#5C4B6B", done: true },
      { kind: "album" as const, title: "評判の新譜", creator: "", color: "#8B4A2E", done: false },
    ]).forEach((d, i) => {
      next.records.media.unshift({
        id: `demo-media-${now}-${i}`, kind: d.kind, title: d.title, creator: d.creator,
        addedAt: new Date(now - (i + 2) * 20 * 3600 * 1000).toISOString(), color: d.color,
        status: d.done ? "done" : "keep",
        doneAt: d.done ? new Date(now - i * 15 * 3600 * 1000).toISOString() : undefined,
      });
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
            onPickBundle={pickBundle} onInjectDemo={injectDemo} bundlesAreNew={bundlesAreNew}
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
        // 確定後は選んだカードが縦一列に大きく並ぶリストになり、その上に
        // 開いたバインダーが覗く。「選び直す」で地図に戻れるのは以前と同じ。
        <>
          <button onClick={() => {
            setDraftSelection(magazine.itemIds.filter((r) => r.type === "keep").map((r) => r.id));
            setDraftMediaSelection(magazine.itemIds.filter((r) => r.type === "media").map((r) => r.id));
            setMapMode(true);
          }} style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", padding: "12px 2px 0", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#9A988E" }}>← 選び直す</button>
          <ConfirmedStack
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
