"use client";

import { Bookmark, Plus, Sprout, Star } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { BLUE, GOAL_CARD_ASPECT, GREEN, HAIRLINE, HEADER_CHIP_SIZE, INK, ITEM_CARD_ASPECT, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";
import { hashStr, img, shade } from "@/lib/helpers";
import { BottomSheet, OverlayCard } from "./BottomSheet";

export type IconType = ComponentType<{ size?: number | string; strokeWidth?: number; color?: string }>;

// 「My Trails」参考のような、太いサンセリフの大見出し+柔らかいグレーの
// サブテキストという構成。以前は新聞の輪転罫線(2px罫線)で下線を引いて
// いたが、ミニマルなデザインへの刷新でその区切り線は撤廃した。
export function Masthead({ title, en, statValue, statLabel, dateline, right, corner }: {
  title: string;
  en: string;
  statValue?: ReactNode;
  statLabel?: ReactNode;
  dateline?: ReactNode;
  right?: ReactNode;
  corner?: ReactNode;
}) {
  return (
    <header style={{ padding: "10px 4px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 28, letterSpacing: "-0.01em", lineHeight: 1.15, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
          <div style={{ fontSize: 13, color: "#9A988E", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{en}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {corner}
          {right ? right : (
            <div style={{ display: "flex", alignItems: "center", gap: 5, height: HEADER_CHIP_SIZE, background: PAPER, borderRadius: 999, padding: "0 16px", boxShadow: SOFT_SHADOW }}>
              <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 16, lineHeight: 1, color: INK }}>{statValue}</span>
              <span style={{ fontSize: 10, color: "#9A988E", lineHeight: 1 }}>{statLabel}</span>
            </div>
          )}
        </div>
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

// アプリ全体で統一する「アイテムカード」。写真付き(場所のKeepなど)も、
// 文字だけ(作品など)もこの1つのデザインに揃える。写真が無い場合は
// ただの色面にせず、アイコン(または絵文字グリフ)を薄く敷いた上に
// 写真ありのときと同じ下部キャプション(グラデーション+タイトル)を
// 乗せることで、どちらも同じ見た目のリズムになるようにしている。
// sizeを省略すると親グリッドに合わせて広がる。
export function PosterCard({ image, color, title, sub, label, icon: Icon, glyph, kept, good, onToggleGood, action, onClick, size }: {
  image?: string | null;
  color?: string;
  title: string;
  sub?: string;
  label?: string;
  icon?: IconType;
  glyph?: string;
  kept?: boolean;
  good?: boolean;
  onToggleGood?: () => void;
  action?: { label: string; onClick: () => void };
  onClick?: () => void;
  size?: number | string;
}) {
  const fill = color ?? "#5A5A54";
  return (
    <div onClick={onClick} style={{ position: "relative", flexShrink: 0, width: size ?? "100%", aspectRatio: ITEM_CARD_ASPECT, borderRadius: 18, overflow: "hidden", boxShadow: SOFT_SHADOW, cursor: onClick ? "pointer" : "default", background: image ? fill : `linear-gradient(135deg, ${shade(fill, 14)} 0%, ${fill} 45%, ${shade(fill, -18)} 100%)` }}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img(image, 340, 450)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ position: "absolute", bottom: "-16%", right: "-14%", width: "64%", aspectRatio: "1 / 1", transform: "rotate(-16deg)", opacity: 0.15 }}>
          {Icon ? <Icon size="100%" strokeWidth={1} color="#fff" /> : glyph ? <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: "220%", color: "#fff" }}>{glyph}</span> : null}
        </div>
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 42%, rgba(0,0,0,0.8) 100%)" }} />
      {kept && (
        <span style={{ position: "absolute", top: 8, left: 8, display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(255,255,255,0.94)", color: INK, fontSize: 8, fontWeight: 800, letterSpacing: "0.04em", borderRadius: 999, padding: "3px 8px 3px 6px" }}>
          <Bookmark size={9} fill={INK} strokeWidth={0} /> KEEP
        </span>
      )}
      <div style={{ position: "absolute", bottom: 10, left: 10, right: 10 }}>
        {label && <div style={{ fontSize: 8, letterSpacing: "0.14em", color: "rgba(255,255,255,0.7)", marginBottom: 3 }}>{label}</div>}
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: "#fff", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
        {sub && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>{sub}</div>}
      </div>
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

// 目標カードだけは意図的に少し違うデザイン(比率3:5)にして、アイテム
// カードと視覚的に区別できるようにしている。上2/3は普通のフラットな
// カードとしてタイトルと直近の記録を見せ、下1/3だけロール紙のように
// 巻かれた見た目にして、「この下にまだ記録が巻き込まれている」ことを
// 示す。タップすると詳細シートが開き、巻かれた記録の続きを最後まで見れる。
export function GoalCard({ title, recentCheckIns, checkInCount, onClick, size }: {
  title: string;
  recentCheckIns: { text: string; at: string }[];
  checkInCount: number;
  onClick: () => void;
  size?: number | string;
}) {
  const latest = recentCheckIns[0];
  return (
    <button onClick={onClick} style={{
      width: size ?? "100%", aspectRatio: GOAL_CARD_ASPECT, flexShrink: 0, textAlign: "left", cursor: "pointer",
      border: "none", borderRadius: 18, padding: 0, background: PAPER, color: INK,
      display: "flex", flexDirection: "column", boxShadow: SOFT_SHADOW, position: "relative", overflow: "hidden",
    }}>
      {/* 上側: 普通のカード部分 */}
      <div style={{ flex: "1 1 64%", padding: "13px 14px 8px", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Sprout size={11} color={GREEN} strokeWidth={2} />
          <span style={{ fontSize: 8, letterSpacing: "0.14em", color: GREEN, fontWeight: 700 }}>GOAL</span>
        </div>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, lineHeight: 1.3, marginTop: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
        {latest && (
          <p style={{ fontSize: 10.5, lineHeight: 1.5, color: "#7A7A72", margin: "6px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{latest.text}</p>
        )}
      </div>
      {/* 下側: 巻かれたロール紙。楕円の頂部で「筒」のような丸みを出す */}
      <div style={{ flex: "0 0 36%", position: "relative" }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50% 50% 0 0 / 22px 22px 0 0",
          background: "linear-gradient(180deg, #FDFBF5 0%, #EEE6D3 40%, #E1D7C0 58%, #ECE3D0 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
        }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 10 }}>
          <span style={{ fontSize: 8.5, color: "#8A8477", fontWeight: 700, letterSpacing: "0.03em" }}>
            {checkInCount > 0 ? `記録 ${checkInCount}件・つづきを見る` : "まだ記録がありません"}
          </span>
        </div>
      </div>
    </button>
  );
}

// 追加専用の「＋」タイル。アイテムカード/目標カードどちらの比率でも使う。
export function AddCardTile({ onClick, aspect = ITEM_CARD_ASPECT, size, label }: {
  onClick: () => void;
  aspect?: string;
  size?: number | string;
  label: string;
}) {
  return (
    <button onClick={onClick} aria-label={label} style={{
      width: size ?? "100%", aspectRatio: aspect, flexShrink: 0, borderRadius: 18, cursor: "pointer",
      border: "1.5px dashed rgba(23,23,21,0.22)", background: "rgba(255,255,255,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
    }}>
      <Plus size={26} strokeWidth={1.6} color="#8A8A82" />
    </button>
  );
}

// ストック等で使う「カードの束」。左から右に少しずつずらして重ねるが、
// 一番手前(最前面)は左端のカード。＋タイルは束の右端に常に置く。
// ＋以外の束をタップすると中身の一覧がシートで開く。カード自体は
// PosterCard/GoalCardをそのまま渡す。
// 単に横一列にずらすだけだと機械的に見えるため、カードごとに小さな回転と
// 上下のズレ(idから決定論的に導出。再レンダーでガタつかない)を与えて、
// 実際に紙の束を軽く広げたような自然さを出す。さらに指で触れているカードは
// 一回り拡大し、その両隣のカードは逃げるように少しずれる、というプレミア
// アプリでよく見る「押した手応え」のアニメーションを加えている。
export function CardStack({ items, aspect, cardWidth = 108, onOpen, onAdd, addLabel }: {
  items: { key: string; node: ReactNode }[];
  aspect?: string;
  cardWidth?: number;
  onOpen: () => void;
  onAdd: () => void;
  addLabel: string;
}) {
  const [touchedKey, setTouchedKey] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const shown = items.slice(-4);
  const [num, den] = (aspect ?? ITEM_CARD_ASPECT).split("/").map((s) => parseFloat(s.trim()));
  const cardHeight = Math.round((cardWidth * den) / num);
  const touchedIdx = shown.findIndex((it) => it.key === touchedKey);
  const dragRef = useRef({ active: false, startX: 0, startIdx: 0 });
  const release = () => { dragRef.current.active = false; setTouchedKey(null); };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ＋タイルは常にこの束の右端に固定する。スタックしたカードは左端から
  // ＋タイルの手前までの範囲に均等に重ねて配置し、行の幅いっぱいを使う。
  // カード枚数が少ない時でも重なりが失われないよう、間隔には上限を設ける。
  const addLeft = Math.max(0, containerWidth - cardWidth);
  const fanRightBound = Math.max(0, addLeft - 14);
  const rawStep = shown.length > 1 ? fanRightBound / (shown.length - 1) : 0;
  const offsetStep = Math.min(rawStep, cardWidth * 0.75);

  return (
    <div ref={containerRef} style={{ position: "relative", height: Math.round(cardHeight * 1.16) + 8, width: "100%" }}>
      {shown.map((it, i) => {
        const seed = hashStr(it.key);
        const rotation = ((seed % 9) - 4) * 1.3;
        const jitterY = ((seed >> 3) % 11) - 5;
        const isTouched = i === touchedIdx;
        const spread = touchedIdx >= 0 && !isTouched ? (i < touchedIdx ? -9 : 9) : 0;
        const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
          setTouchedKey(it.key);
          dragRef.current = { active: true, startX: e.clientX, startIdx: i };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        };
        // 拡大表示のまま左右に指を動かすと、その位置に応じて隣のカードへ
        // 追従して主役が切り替わる(スワイプでプレビューが移り変わる動き)。
        const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
          if (!dragRef.current.active) return;
          const dx = e.clientX - dragRef.current.startX;
          const shift = Math.round(dx / offsetStep);
          const newIdx = Math.min(shown.length - 1, Math.max(0, dragRef.current.startIdx + shift));
          const newKey = shown[newIdx]?.key;
          if (newKey && newKey !== touchedKey) setTouchedKey(newKey);
        };
        return (
          <div
            key={it.key}
            onClick={onOpen}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={release}
            onPointerCancel={release}
            style={{
              position: "absolute", left: i * offsetStep + spread, top: (isTouched ? jitterY - 8 : jitterY) + 8,
              width: cardWidth, zIndex: isTouched ? 20 : shown.length - i, cursor: "pointer",
              transform: `rotate(${isTouched ? 0 : rotation}deg) scale(${isTouched ? 1.16 : 1})`,
              transformOrigin: "50% 100%",
              transition: "transform 0.28s cubic-bezier(0.32,0.72,0,1), left 0.28s cubic-bezier(0.32,0.72,0,1), top 0.28s cubic-bezier(0.32,0.72,0,1)",
              filter: isTouched ? "drop-shadow(0 14px 22px rgba(28,28,30,0.22))" : "none",
              touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
            }}
          >
            {it.node}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: addLeft, top: 8, width: cardWidth, zIndex: shown.length + 1 }}>
        <AddCardTile aspect={aspect} size={cardWidth} onClick={onAdd} label={addLabel} />
      </div>
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
    <BottomSheet onClose={onClose} maxHeight="76vh">
      {(requestClose) => (
        <>
          {(item.images ?? []).length > 0 && (
            <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 18px" }}>
              {(item.images ?? []).map((seed, i) => (
                <img key={seed} src={img(seed, 300, 380)} alt="" style={{ width: "32%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: 6, border: "4px solid #fff", boxShadow: "0 8px 20px rgba(23,23,21,0.3)", transform: `rotate(${rotations[i % 3]}deg)`, marginLeft: i === 0 ? 0 : -18, position: "relative", zIndex: i }} />
              ))}
            </div>
          )}
          <OverlayCard>
            <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#9A988E", marginBottom: 4 }}>{item.category ?? item.categoryJp}</div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: actionSlot ? 12 : 16 }}>{item.title}</div>
            {actionSlot && <div style={{ marginBottom: 16 }}>{actionSlot(requestClose)}</div>}
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
          </OverlayCard>
        </>
      )}
    </BottomSheet>
  );
}
