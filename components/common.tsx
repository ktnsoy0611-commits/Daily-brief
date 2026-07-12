"use client";

import { Bookmark, Check, Plus, Sparkles, Star } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { BLUE, GREEN, HAIRLINE, HEADER_CHIP_SIZE, INK, ITEM_CARD_ASPECT, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";
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
          {/* 件数チップを左、設定(corner)を右端に固定する。以前はcornerを
              件数チップより先(左)に置いており、設定アイコンが常に画面の
              最も右端ではなかった。設定を常に一番右に置くことで、全タブで
              位置を固定する。 */}
          {right ? right : (
            <div style={{ display: "flex", alignItems: "center", gap: 5, height: HEADER_CHIP_SIZE, background: PAPER, borderRadius: 999, padding: "0 16px", boxShadow: SOFT_SHADOW }}>
              <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 16, lineHeight: 1, color: INK }}>{statValue}</span>
              <span style={{ fontSize: 10, color: "#9A988E", lineHeight: 1 }}>{statLabel}</span>
            </div>
          )}
          {corner}
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

// カードの左端に開ける、「バインダーに綴じられている」ことを示すパンチ穴。
// PosterCard・ブリーフのカード・実行タブの確定カードなど、アプリ内の
// 「1枚もの」アイテムカードすべてでこの穴を共有し、位置・見た目を統一
// する。本物の透過ではなく、どんな下地(写真/グラデーション/色面)の上でも
// 同じ見た目で「窪んで見える」よう、内側シャドウ付きの生成りの円で表現
// している。カード側は、キャプションやバッジをこの穴の右
// (目安HOLE_CLEARpx)から置くことで、穴と文字が重ならないようにする。
export const HOLE_CLEAR = 33;
export const HOLE_YS = ["24%", "76%"];

export function PunchHoles() {
  return (
    <>
      {HOLE_YS.map((y) => (
        <div key={y} style={{
          position: "absolute", left: 12, top: y, transform: "translateY(-50%)", width: 10, height: 10, borderRadius: "50%",
          background: "rgba(253,251,245,0.92)",
          boxShadow: "inset 0 1.5px 2px rgba(0,0,0,0.38), inset 0 -1px 1.5px rgba(0,0,0,0.12), 0 1px 1px rgba(255,255,255,0.3)",
          pointerEvents: "none",
        }} />
      ))}
    </>
  );
}

// アプリ全体で統一する「アイテムカード」。写真付き(場所のKeepなど)も、
// 文字だけ(作品など)もこの1つのデザインに揃える。写真が無い場合は
// ただの色面にせず、アイコン(または絵文字グリフ)を薄く敷いた上に
// 写真ありのときと同じ下部キャプション(グラデーション+タイトル)を
// 乗せることで、どちらも同じ見た目のリズムになるようにしている。
// sizeを省略すると親グリッドに合わせて広がる。
export function PosterCard({ image, color, title, sub, label, icon: Icon, glyph, badge, good, onToggleGood, action, onClick, size, planSelected, onTogglePlanSelect }: {
  image?: string | null;
  color?: string;
  title: string;
  sub?: string;
  label?: string;
  icon?: IconType;
  glyph?: string;
  // 左上の出自バッジ。keep=ブリーフのKEEP由来 / wish=ウィッシュが形に
  // なったもの。手動追加はバッジ無し(undefined)。
  badge?: "keep" | "wish";
  good?: boolean;
  onToggleGood?: () => void;
  action?: { label: string; onClick: () => void };
  onClick?: () => void;
  size?: number | string;
  // プランへのバインド候補として選べる場合の、選択トグル。カード本体の
  // タップ(onClick、詳細を開く)とは独立した操作にするため、専用の丸い
  // ボタンを右下(左上=KEEP、右上=action/goodと被らない唯一の空き角)に
  // 別途置く。選択中はカード全体にも薄い縁取りを足して、一覧をざっと
  // 眺めただけでどれを選んでいるか分かるようにする。
  planSelected?: boolean;
  onTogglePlanSelect?: () => void;
}) {
  const fill = color ?? "#5A5A54";
  return (
    <div onClick={onClick} style={{
      position: "relative", flexShrink: 0, width: size ?? "100%", aspectRatio: ITEM_CARD_ASPECT, borderRadius: 18, overflow: "hidden",
      boxShadow: SOFT_SHADOW, cursor: onClick ? "pointer" : "default", background: image ? fill : `linear-gradient(135deg, ${shade(fill, 14)} 0%, ${fill} 45%, ${shade(fill, -18)} 100%)`,
      outline: planSelected ? `2.5px solid ${BLUE}` : "none", outlineOffset: planSelected ? -2.5 : 0,
    }}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img(image, 340, 450)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ position: "absolute", bottom: "-16%", right: "-14%", width: "64%", aspectRatio: "1 / 1", transform: "rotate(-16deg)", opacity: 0.15 }}>
          {Icon ? <Icon size="100%" strokeWidth={1} color="#fff" /> : glyph ? <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: "220%", color: "#fff" }}>{glyph}</span> : null}
        </div>
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 42%, rgba(0,0,0,0.8) 100%)" }} />
      <PunchHoles />
      {badge && (
        <span style={{ position: "absolute", top: 8, left: HOLE_CLEAR, display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(255,255,255,0.94)", color: INK, fontSize: 8, fontWeight: 800, letterSpacing: "0.04em", borderRadius: 999, padding: "3px 8px 3px 6px" }}>
          {badge === "wish" ? <Sparkles size={9} color={INK} strokeWidth={2.4} /> : <Bookmark size={9} fill={INK} strokeWidth={0} />} {badge === "wish" ? "WISH" : "KEEP"}
        </span>
      )}
      <div style={{ position: "absolute", bottom: 10, left: HOLE_CLEAR, right: 10 }}>
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
      {/* onTogglePlanSelectが右上(KEEPバッジの鏡合わせの位置)を使うため、
          actionは元々の右上から下段(bottom:8)へ移して衝突を避けている。 */}
      {action && (
        <button onClick={(e) => { e.stopPropagation(); action.onClick(); }} style={{
          position: "absolute", bottom: 8, right: 8, padding: "6px 11px", borderRadius: 999, border: "none", cursor: "pointer",
          background: INK, color: PAPER, fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.02em",
        }}>{action.label}</button>
      )}
      {/* KEEPバッジ(左上、白いピル+アイコン)と対になるよう、同じ白backgroundの
          丸バッジを右上に置く。以前は右下の独立した丸ボタンだったため、
          カード上のバッジの語彙(左上=KEEP)と噛み合っていなかった。 */}
      {onTogglePlanSelect && (
        <button onClick={(e) => { e.stopPropagation(); onTogglePlanSelect(); }} aria-label={planSelected ? "プランの選択から外す" : "プランの候補に選ぶ"} style={{
          position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", border: "none", cursor: "pointer",
          background: planSelected ? BLUE : "rgba(255,255,255,0.94)", color: planSelected ? PAPER : INK,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 0, boxShadow: "0 2px 6px rgba(23,23,21,0.3)",
        }}>
          {planSelected ? <Check size={12} strokeWidth={3} /> : <Plus size={13} strokeWidth={2.6} />}
        </button>
      )}
    </div>
  );
}

// PosterCardに選択状態のオーバーレイを乗せたもの。プランタブの地図/一覧
// (KEEP一覧・メディア)と、ストックタブの「作品」「場所」オーバーレイの
// どちらも、同じこのカードでプランへのバインド候補を選ぶ。タップは常に
// 選択のトグルで、詳細を見る専用の導線はここには持たない(選ぶこと自体が
// 目的の画面のため)。
export function SelectablePosterCard({ selected, onToggle, size = 132, ...cardProps }: {
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
      border: "1.5px dashed rgba(23,23,21,0.22)", background: PAPER,
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

  // ＋タイルは元の大きさ(cardWidthそのまま)で右端に固定する。カード自体は
  // 枚数が増えるほど重なって詰まっていって構わないが、＋タイルとだけは
  // 「＋タイルの左1/4くらいだけに重なる」という決まった量に抑えたいので、
  // 両者の配置計算を分離した: ＋タイルは常にコンテナ右端、カードの間隔は
  // 「最後のカードの右端が、＋タイルの左から25%の位置にちょうど来る」
  // ように逆算する(枚数が少なければ0.82倍キャップの方が効いて、＋タイルの
  // 手前でもっと手前寄りに収まる=隙間が空くだけで重なりすぎない)。
  const addTileWidth = cardWidth;
  const addLeft = Math.max(0, containerWidth - addTileWidth);
  const targetLastCardLeft = addLeft + addTileWidth * 0.25 - cardWidth;
  const rawStep = shown.length > 1 ? targetLastCardLeft / (shown.length - 1) : 0;
  const offsetStep = Math.max(0, Math.min(rawStep, cardWidth * 0.82));

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
      {/* zIndex:0でカード全員より奥に置く。カードは常にzIndex>=1(タッチ中は
          20)なので、拡大されたカードが被さってきても＋タイルが手前に
          出てくることはない。 */}
      <div style={{ position: "absolute", left: addLeft, top: 8, width: addTileWidth, zIndex: 0 }}>
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
