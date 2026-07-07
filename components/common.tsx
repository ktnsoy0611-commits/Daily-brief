"use client";

import { Bookmark, Plus, Sprout, Star } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { BLUE, GOAL_CARD_ASPECT, GREEN, HAIRLINE, HEADER_CHIP_SIZE, INK, ITEM_CARD_ASPECT, PAPER, POSTER_PALETTE, SANS, SOFT_SHADOW, SOFT_SHADOW_LG } from "@/lib/constants";
import { hashStr, img, shade } from "@/lib/helpers";
import { BottomSheet, OverlayCard } from "./BottomSheet";

export type IconType = ComponentType<{ size?: number | string; strokeWidth?: number; color?: string }>;

// 「My Trails」参考のような、太いサンセリフの大見出し+柔らかいグレーの
// サブテキストという構成。以前は新聞の輪転罫線(2px罫線)で下線を引いて
// いたが、ミニマルなデザインへの刷新でその区切り線は撤廃した。
export function Masthead({ title, statValue, statLabel, dateline, right, corner }: {
  title: string;
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
  // ルーズリーフとカードの中間のような見た目にするため、左端に縦の
  // 余白列(穴+切り取り線)を確保し、バッジ/キャプションはその右側から
  // 始まるようにインセットを右へずらしている。穴は本物の透過ではなく、
  // どんな下地(写真/グラデーション/掲示板テクスチャ)の上でも同じ見た目
  // で「窪んで見える」よう、内側シャドウ付きの生成りの円で表現している。
  const holeYs = ["24%", "76%"];
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
      {holeYs.map((y) => (
        <div key={y} style={{
          position: "absolute", left: 12, top: y, transform: "translateY(-50%)", width: 10, height: 10, borderRadius: "50%",
          background: "rgba(253,251,245,0.92)",
          boxShadow: "inset 0 1.5px 2px rgba(0,0,0,0.38), inset 0 -1px 1.5px rgba(0,0,0,0.12), 0 1px 1px rgba(255,255,255,0.3)",
        }} />
      ))}
      <div style={{
        position: "absolute", left: 26, top: 8, bottom: 8, width: 1,
        backgroundImage: "repeating-linear-gradient(to bottom, rgba(253,251,245,0.85) 0 4px, transparent 4px 9px)",
      }} />
      {kept && (
        <span style={{ position: "absolute", top: 8, left: 33, display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(255,255,255,0.94)", color: INK, fontSize: 8, fontWeight: 800, letterSpacing: "0.04em", borderRadius: 999, padding: "3px 8px 3px 6px" }}>
          <Bookmark size={9} fill={INK} strokeWidth={0} /> KEEP
        </span>
      )}
      <div style={{ position: "absolute", bottom: 10, left: 33, right: 10 }}>
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

// 目標カードは「中にルーズリーフがバインドされたバインダー」として見せる。
// 前バージョンは表紙面を白紙(PAPER)にしていたため、背後に覗くページと
// 見分けがつかず「ルーズリーフの一枚」に見えてしまっていた。表紙そのものを
// 布張り/レザー張りのような不透明な色面にし、中央にラベル(名札)を貼った
// ような別素材のプレートを乗せることで、「閉じた表紙付きバインダー」だと
// 一目でわかるようにしている。背後には、記録が貯まるほど右下にページの
// 束がわずかにはみ出して重なっていく(枚数は上限を設け、それ以上は
// 一番外側の束の厚みだけがわずかに増す扱いにして破綻を防ぐ)。
const GOAL_STACK_CAP = 4;

export function GoalCard({ title, recentCheckIns, checkInCount, onClick, size }: {
  title: string;
  recentCheckIns: { text: string; at: string }[];
  checkInCount: number;
  onClick: () => void;
  size?: number | string;
}) {
  const latest = recentCheckIns[0];
  const stackCount = Math.min(checkInCount, GOAL_STACK_CAP);
  const seed = hashStr(title);
  const fill = POSTER_PALETTE[seed % POSTER_PALETTE.length];

  return (
    <button onClick={onClick} style={{
      width: size ?? "100%", aspectRatio: GOAL_CARD_ASPECT, flexShrink: 0, textAlign: "left", cursor: "pointer",
      border: "none", padding: 0, background: "none", color: INK, position: "relative",
    }}>
      {Array.from({ length: stackCount }).map((_, i) => {
        // 一番奥(表紙から遠い=zが低い)のページほど大きくはみ出させ、
        // 表紙のすぐ下の層ほどはみ出しを小さくする。逆にすると外側の層が
        // 内側の層を覆い隠して「1枚しか無い」ように見えてしまうため。
        const depth = stackCount - i;
        const layerSeed = seed + i * 37;
        const dx = 3 + depth * 3.2 + ((layerSeed % 5) - 2) * 0.4;
        const dy = 3 + depth * 2.8 + (((layerSeed >> 2) % 5) - 2) * 0.4;
        const rot = ((layerSeed >> 4) % 7) - 3;
        return (
          <div key={i} style={{
            position: "absolute", inset: 0, borderRadius: 16, background: "#FBF8EF",
            border: "1px solid rgba(28,28,30,0.08)",
            boxShadow: "0 1px 3px rgba(28,28,30,0.16)",
            transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`,
            zIndex: i,
          }} />
        );
      })}
      {/* 表紙: スパイン(リング金具を持つ帯)と、色のついた不透明な表紙面を
          はっきり分け、「バインダーという物体そのもの」に見えるようにしている。 */}
      <div style={{
        position: "absolute", inset: 0, zIndex: GOAL_STACK_CAP + 1, borderRadius: 18,
        display: "flex", boxShadow: SOFT_SHADOW_LG, overflow: "hidden",
      }}>
        <div style={{ width: "17%", minWidth: 21, flexShrink: 0, position: "relative", background: `linear-gradient(180deg, ${shade(fill, -4)} 0%, ${shade(fill, -26)} 100%)`, boxShadow: "inset -2px 0 3px rgba(0,0,0,0.28)" }}>
          {[0.16, 0.5, 0.84].map((y) => (
            <div key={y} style={{
              position: "absolute", left: "50%", top: `${y * 100}%`, transform: "translate(-50%, -50%)", width: 11, height: 11, borderRadius: "50%",
              background: "linear-gradient(135deg, #E2DFD3 0%, #B8B4A6 100%)",
              boxShadow: "inset 0 1px 1.5px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.4)",
            }}>
              <div style={{ position: "absolute", inset: 2.3, borderRadius: "50%", background: shade(fill, -26) }} />
            </div>
          ))}
        </div>
        <div style={{
          flex: 1, minWidth: 0, position: "relative", display: "flex", flexDirection: "column",
          background: `linear-gradient(135deg, ${shade(fill, 16)} 0%, ${fill} 45%, ${shade(fill, -18)} 100%)`,
        }}>
          <div style={{ position: "absolute", inset: 0, opacity: 0.07, backgroundImage: "repeating-linear-gradient(45deg, #fff 0 1px, transparent 1px 6px)" }} />
          <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -14px 18px -14px rgba(0,0,0,0.35)" }} />
          <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 10px 6px" }}>
            <div style={{ width: "100%", background: PAPER, borderRadius: 6, padding: "9px 9px 8px", textAlign: "center", boxShadow: "0 3px 7px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 5 }}>
                <Sprout size={10} color={GREEN} strokeWidth={2} />
                <span style={{ fontSize: 7.5, letterSpacing: "0.16em", color: GREEN, fontWeight: 700 }}>GOAL</span>
              </div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12.5, lineHeight: 1.32, color: INK, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
            </div>
          </div>
          <div style={{ position: "relative", padding: "0 11px 11px" }}>
            {latest && (
              <p style={{ fontSize: 9.5, lineHeight: 1.42, color: "rgba(255,255,255,0.88)", margin: "0 0 7px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{latest.text}</p>
            )}
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.78)", fontWeight: 700, letterSpacing: "0.03em", borderTop: "1px solid rgba(255,255,255,0.24)", paddingTop: 7 }}>
              {checkInCount > 0 ? `記録 ${checkInCount}件・つづきを見る` : "まだ記録がありません"}
            </div>
          </div>
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
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startIdx: 0, moved: false });
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

  // ＋タイルも「束の最後の1枚」として同じ等間隔の並びに含めることで、
  // 行の幅をカード+＋タイル全体でめいっぱい使う。以前は＋タイルだけ右端に
  // 固定していたため、カード同士の間隔がかなり狭くなり(重なりが深く)、
  // 触れているカード以外の「自分の指で押せる余白」がとても細くなって、
  // 実機では狙った1枚を選びにくい原因になっていた。
  const totalSlots = shown.length + 1;
  const rawStep = totalSlots > 1 ? (containerWidth - cardWidth) / (totalSlots - 1) : 0;
  const offsetStep = Math.min(rawStep, cardWidth * 0.85);
  const addLeft = shown.length * offsetStep;
  // カード枚数が多いとoffsetStepが目一杯詰まり、＋タイルが最後のカードと
  // ぴったりくっついてしまう(特に触れて1.3倍に拡大した最後のカードが
  // 被さる)。＋タイル自体を一回り小さく描き、元の枠内で中央寄せすることで、
  // 全体の配置計算(コンテナ幅への収まり)を変えずに左右へ均等な隙間を作る。
  const addTileWidth = Math.max(Math.round(cardWidth * 0.82), 60);
  const addTileLeft = addLeft + (cardWidth - addTileWidth) / 2;

  // 触れているカードより左は全部さらに左へ、右は全部さらに右へ逃がす。
  // 隣接1枚だけでなく、触れているカードからの距離に比例して逃げ幅を
  // 積み増していく(遠いカードほど大きく逃げる)ので、画面外に出るカードが
  // あっても構わない前提で、主役をはっきり手前に見せる。
  const neighborSpread = Math.round(cardWidth * 0.34);

  return (
    <div ref={containerRef} style={{ position: "relative", height: Math.round(cardHeight * 1.16) + 8, width: "100%" }}>
      {shown.map((it, i) => {
        const seed = hashStr(it.key);
        const rotation = ((seed % 9) - 4) * 1.3;
        const jitterY = ((seed >> 3) % 11) - 5;
        const isTouched = i === touchedIdx;
        const spread = touchedIdx >= 0 && !isTouched ? (i - touchedIdx) * neighborSpread : 0;
        const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
          setTouchedKey(it.key);
          dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, startIdx: i, moved: false };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        };
        // 拡大表示のまま左右に指を動かすと、その位置に応じて隣のカードへ
        // 追従して主役が切り替わる(スワイプでプレビューが移り変わる動き)。
        const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
          if (!dragRef.current.active) return;
          const dx = e.clientX - dragRef.current.startX;
          const dy = e.clientY - dragRef.current.startY;
          if (Math.abs(dx) > 6 || Math.abs(dy) > 6) dragRef.current.moved = true;
          const shift = Math.round(dx / offsetStep);
          const newIdx = Math.min(shown.length - 1, Math.max(0, dragRef.current.startIdx + shift));
          const newKey = shown[newIdx]?.key;
          if (newKey && newKey !== touchedKey) setTouchedKey(newKey);
        };
        // pointerCaptureのおかげで指がどれだけ動いてもpointerupはこの
        // (最初に触れた)要素で発火し続けるため、以前はここにonClickを
        // 素直に付けていただけだと、隣のカードへスワイプして指を離した
        // 場合でも「タップ」とみなされてonOpenが発火してしまっていた。
        // 実際に動いた距離(moved)を見て、動いていなければタップとして
        // 扱い、動いていればプレビューの切り替えだけで終わらせる。
        const onUp = () => {
          const wasTap = dragRef.current.active && !dragRef.current.moved;
          release();
          if (wasTap) onOpen();
        };
        return (
          <div
            key={it.key}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={release}
            style={{
              position: "absolute", left: i * offsetStep + spread, top: (isTouched ? jitterY - 8 : jitterY) + 8,
              width: cardWidth, zIndex: isTouched ? 20 : shown.length - i, cursor: "pointer",
              transform: `rotate(${isTouched ? 0 : rotation}deg) scale(${isTouched ? 1.3 : 1})`,
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
      <div style={{ position: "absolute", left: addTileLeft, top: 8, width: addTileWidth, zIndex: shown.length + 1 }}>
        <AddCardTile aspect={aspect} size={addTileWidth} onClick={onAdd} label={addLabel} />
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
