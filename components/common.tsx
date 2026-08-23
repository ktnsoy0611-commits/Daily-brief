"use client";

import { Bookmark, Check, ExternalLink, Plus, Sparkles, Star } from "lucide-react";
import { memo, useEffect, useRef, useState, type ComponentType, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { BLUE, GOLD, GREEN, HAIRLINE, INK, ITEM_CARD_ASPECT, MUTED, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";
import { hashStr, img, shade } from "@/lib/helpers";
import { GeoText } from "./GeoType";
import { BottomSheet, OverlayCard } from "./BottomSheet";

export type IconType = ComponentType<{ size?: number | string; strokeWidth?: number; color?: string }>;

// ★各タブの見出し(2026-08-03)。名前は**英語＋幾何アルファベット**
// (components/GeoType.tsx)で大きく置く。以前ここに出していた「〇件」の
// 数字は、情報としてほとんど意味を成していなかったので撤去した。
export function Masthead({ title, dateline, right, corner }: {
  /** 見出しの英語表記。幾何アルファベットで描くのでA-Z・0-9のみ。 */
  title: string;
  dateline?: ReactNode;
  right?: ReactNode;
  corner?: ReactNode;
}) {
  return (
    <header style={{ padding: "10px 4px 18px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <GeoText text={title} size={30} color={INK} />
          {dateline && <div style={{ fontSize: 11, color: MUTED, marginTop: 10 }}>{dateline}</div>}
        </div>
        {/* 設定(corner)は常に画面の右端。 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {right}
          {corner}
        </div>
      </div>
    </header>
  );
}

// ★セクションの見出し(2026-08-03)。棚の名前(バショ/モノ/…)・やったこと・
// 記録など、要所の短いラベル。一度これも幾何アルファベットで置いたが、
// 「下の文字に戻して、デザインに調和するよう大きさとフォントを調節して」という
// 指定で本文と同じ書体へ戻した。幾何アルファベットで残すのは Masthead の
// 見出し(各タブの名前)だけ。
// 大きさ・字間・太さはここ1箇所で決め、全タブ・全アプリで揃える
// (以前は 9/10/11px と字間がタブごとにばらばらだった)。
export function SectionLabel({ text, style }: { text: string; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", color: MUTED, lineHeight: 1.2, ...style }}>
      {text}
    </div>
  );
}

// ★空状態には何も置かない(2026-08-02)。第1弾では地に溶ける図形ひとつ(84px)を
// 中央に置いていたが、実機で「背景の小さい図形が画面の中央に残っている」と
// 指摘され撤去した。

export function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 9, color, fontWeight: 700, letterSpacing: "0.05em" }}>{label}</span>
    </span>
  );
}

export function keepStatus(k: { status: string }) {
  if (k.status === "planned") return { label: "マガジン掲載中", color: BLUE };
  if (k.status === "done") return { label: "実行済み", color: MUTED };
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
          background: "rgba(250,250,249,0.92)",
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
// ★memo化してある: ストックタブは最大40枚のPosterCardを並べるので、親が
// 再レンダーされるたびに全部を作り直すと実機で目に見えて重くなる(2026-08-02)。
export const PosterCard = memo(function PosterCard({ image, color, title, sub, label, icon: Icon, glyph, badge, good, onToggleGood, action, onClick, size, planSelected, onTogglePlanSelect }: {
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
        <img src={img(image, 340, 450)} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ position: "absolute", bottom: "-16%", right: "-14%", width: "64%", aspectRatio: "1 / 1", transform: "rotate(-16deg)", opacity: 0.15 }}>
          {Icon ? <Icon size="100%" strokeWidth={1} color="#fff" /> : glyph ? <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: "220%", color: "#fff" }}>{glyph}</span> : null}
        </div>
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 42%, rgba(0,0,0,0.8) 100%)" }} />
      <PunchHoles />
      {/* KEEPバッジ・「行った」等のaction(チェックのアイコンボタン)・
          プラン選択トグル・良かった(星)を、右上に1本の横並びflexで
          まとめて詰めている。以前はバッジだけ左上に独立配置し、actionは
          文字ラベルのボタンだった。「バッジは基本右上に」「actionは＋と
          同じ大きさのアイコンでコンパクトに、右側に詰める」という指定を
          受け、4要素すべてを同じ右詰めの列にまとめ、actionもチェック
          アイコンのみの20px円ボタン(＋トグルと同寸)に統一した
          (2026-07-12)。goodだけ元々top:8,right:8の独立配置だったが、
          バッジが右上へ移ったことで重なるようになったため、この列に
          合流させた(合流させないとバッジと良かったボタンが同じ場所に
          描画されて衝突する)。 */}
      {(badge || action || onTogglePlanSelect || onToggleGood) && (
        <div style={{ position: "absolute", top: 8, left: 8, right: 8, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
          {/* カードのタグは本文と同じ書体(2026-08-03に幾何アルファベットから
              戻した)。棚の見出し(SectionLabel)と同じ字間で揃えている。 */}
          {badge && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(255,255,255,0.94)", color: INK, fontSize: 8, fontWeight: 800, letterSpacing: "0.14em", borderRadius: 999, padding: "3px 7px 3px 6px", flexShrink: 0 }}>
              {badge === "wish" ? <Sparkles size={8} color={INK} strokeWidth={2.4} /> : <Bookmark size={8} fill={INK} strokeWidth={0} />}
              <span style={{ marginRight: "-0.14em" }}>{badge === "wish" ? "WISH" : "KEEP"}</span>
            </span>
          )}
          {action && (
            <button onClick={(e) => { e.stopPropagation(); action.onClick(); }} aria-label={action.label} style={{
              flexShrink: 0, width: 20, height: 20, borderRadius: "50%", border: "none", cursor: "pointer",
              background: "rgba(255,255,255,0.94)", color: INK, display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
            }}>
              <Check size={11} strokeWidth={3} />
            </button>
          )}
          {onTogglePlanSelect && (
            <button onClick={(e) => { e.stopPropagation(); onTogglePlanSelect(); }} aria-label={planSelected ? "プランの選択から外す" : "プランの候補に選ぶ"} style={{
              width: 20, height: 20, borderRadius: "50%", border: "none", cursor: "pointer", flexShrink: 0,
              background: planSelected ? BLUE : "rgba(255,255,255,0.94)", color: planSelected ? PAPER : INK,
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0, boxShadow: "0 2px 6px rgba(26,26,24,0.3)",
            }}>
              {planSelected ? <Check size={11} strokeWidth={3} /> : <Plus size={12} strokeWidth={2.6} />}
            </button>
          )}
          {onToggleGood && (
            <button onClick={(e) => { e.stopPropagation(); onToggleGood(); }} aria-label="良かった" style={{
              width: 28, height: 28, borderRadius: "50%", border: "none", cursor: "pointer", flexShrink: 0,
              background: good ? GOLD : "rgba(26,26,24,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
            }}>
              <Star size={14} fill={good ? "#fff" : "none"} color="#fff" strokeWidth={2} />
            </button>
          )}
        </div>
      )}
      <div style={{ position: "absolute", bottom: 10, left: HOLE_CLEAR, right: 10 }}>
        {label && <div style={{ fontSize: 8, letterSpacing: "0.14em", color: "rgba(255,255,255,0.7)", marginBottom: 3 }}>{label}</div>}
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: "#fff", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
        {sub && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
});

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
        // ★沈むのは即座に、戻りは時間をかけて静かに(第33巡。跳ね返りは撤去)。
        transition: pressed ? "transform var(--t-press) var(--ease-press)" : "transform var(--t-out) var(--ease-settle)",
        transform: pressed ? "scale(0.92)" : selected ? "scale(0.96)" : "scale(1)",
      }}
    >
      <PosterCard {...cardProps} size={size} onClick={onToggle} />
      {selected && (
        <div style={{ position: "absolute", inset: 0, borderRadius: 18, background: "rgba(43,63,191,0.28)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: BLUE, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(26,26,24,0.3)" }}>
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
      border: "1.5px dashed rgba(26,26,24,0.22)", background: PAPER,
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
// 1行ぶんの束(ずらして重ねたカードの1段)。CardStackがrowCapごとにこれを
// 縦に積む。＋タイルは「showAdd=一番下の行」のときだけ右端に出す。
function StackRow({ items, aspect, cardWidth, cardHeight, onOpen, onAdd, addLabel, showAdd }: {
  items: { key: string; node: ReactNode }[];
  aspect?: string;
  cardWidth: number;
  cardHeight: number;
  onOpen: () => void;
  onAdd: () => void;
  addLabel: string;
  showAdd: boolean;
}) {
  const [touchedKey, setTouchedKey] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const shown = items;
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
  const addLeft = showAdd ? Math.max(0, containerWidth - addTileWidth) : containerWidth;
  const targetLastCardLeft = (showAdd ? addLeft + addTileWidth * 0.25 : containerWidth) - cardWidth;
  const rawStep = shown.length > 1 ? targetLastCardLeft / (shown.length - 1) : 0;
  const offsetStep = Math.max(0, Math.min(rawStep, cardWidth * 0.82));

  // 触れているカードより左は全部さらに左へ、右は全部さらに右へ逃がす。
  // 隣接1枚だけでなく、触れているカードからの距離に比例して逃げ幅を
  // 積み増していく(遠いカードほど大きく逃げる)ので、画面外に出るカードが
  // あっても構わない前提で、主役をはっきり手前に見せる。
  const neighborSpread = Math.round(cardWidth * 0.34);

  return (
    // ★幅を実測するまでは描かない(visibility:hidden)。ResizeObserverが幅を
    // 返すまで offsetStep が0で、全カードが左端に重なった「まだ正しくない
    // 配置」を一度描いてから、測り終えて正しい位置へ描き直すことになる。
    // 束が10枚あるとこの捨てレイアウトの塗りだけで無視できない時間になり、
    // ストックタブを開くたびに効いていた。レイアウトは保ったまま塗りだけ
    // 飛ばすので、位置がガクッと直る見え方も同時に消える。
    <div ref={containerRef} style={{ position: "relative", height: Math.round(cardHeight * 1.16) + 8, width: "100%", visibility: containerWidth > 0 ? "visible" : "hidden" }}>
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
          const shift = offsetStep > 0 ? Math.round(dx / offsetStep) : 0;
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
              transition: "transform var(--t-item) var(--ease-sheet), left var(--t-item) var(--ease-sheet), top var(--t-item) var(--ease-sheet)",
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
          出てくることはない。＋タイルは一番下の行だけに出す。 */}
      {showAdd && (
        <div style={{ position: "absolute", left: addLeft, top: 8, width: addTileWidth, zIndex: 0 }}>
          <AddCardTile aspect={aspect} size={addTileWidth} onClick={onAdd} label={addLabel} />
        </div>
      )}
    </div>
  );
}

// 1行に収める最大枚数。これを超えたぶんは次の行(下)へ折り返す。
const STACK_ROW_CAP = 5;

// ストック等で使う「カードの束」。rowCapごとに行(StackRow)へ分割して縦に積む。
// 先頭=古い/末尾=新しい前提で渡されるので、一番下の行に最新のカードと＋タイルが
// 来る。枚数がrowCap以下なら1行だけ(＝従来と同じ見た目)。
export function CardStack({ items, aspect, cardWidth = 108, onOpen, onAdd, addLabel, rowCap = STACK_ROW_CAP }: {
  items: { key: string; node: ReactNode }[];
  aspect?: string;
  cardWidth?: number;
  onOpen: () => void;
  onAdd: () => void;
  addLabel: string;
  rowCap?: number;
}) {
  const [num, den] = (aspect ?? ITEM_CARD_ASPECT).split("/").map((s) => parseFloat(s.trim()));
  const cardHeight = Math.round((cardWidth * den) / num);
  const rows: { key: string; node: ReactNode }[][] = [];
  for (let i = 0; i < items.length; i += rowCap) rows.push(items.slice(i, i + rowCap));
  if (rows.length === 0) rows.push([]); // カードが無くても＋タイルの行を1つ出す
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((row, ri) => (
        <StackRow key={ri} items={row} aspect={aspect} cardWidth={cardWidth} cardHeight={cardHeight}
          onOpen={onOpen} onAdd={onAdd} addLabel={addLabel} showAdd={ri === rows.length - 1} />
      ))}
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
  // 説明文。詳細オーバーレイには detail(長文) を優先して表示し、無ければ
  // body/summary(短文)にフォールバックする。ブリーフのカードは body(短)と
  // detail(長)を両方持つので、詳細では detail が出る。
  body?: string;
  summary?: string;
  detail?: string;
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
          {(item.images ?? []).length === 1 ? (
            // 写真が1枚(OGP画像は横長)のときは、傾けた小さいスタックにせず
            // 大きく1枚を見せる。読み込めなければ隠す(色ベタのまま)。
            <div style={{ padding: "2px 0 16px" }}>
              <img
                src={img(item.images![0], 720, 450)} alt=""
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                style={{ width: "100%", aspectRatio: "16 / 10", objectFit: "cover", borderRadius: 14, boxShadow: "0 10px 26px rgba(26,26,24,0.18)", display: "block" }}
              />
            </div>
          ) : (item.images ?? []).length > 1 ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 18px" }}>
              {(item.images ?? []).map((seed, i) => (
                <img key={seed} src={img(seed, 300, 380)} alt="" style={{ width: "40%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: 8, border: "4px solid #fff", boxShadow: "0 8px 20px rgba(26,26,24,0.3)", transform: `rotate(${rotations[i % 3]}deg)`, marginLeft: i === 0 ? 0 : -22, position: "relative", zIndex: i }} />
              ))}
            </div>
          ) : null}
          <OverlayCard>
            <div style={{ fontSize: 9, letterSpacing: "0.2em", color: MUTED, marginBottom: 4 }}>{item.category ?? item.categoryJp}</div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: (item.detail ?? item.body ?? item.summary) ? 10 : actionSlot ? 12 : 16 }}>{item.title}</div>
            {(item.detail ?? item.body ?? item.summary) && (
              <p style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.85, color: "#4A4A44", margin: `0 0 ${actionSlot ? 12 : 16}px`, whiteSpace: "pre-wrap" }}>{item.detail ?? item.body ?? item.summary}</p>
            )}
            {actionSlot && <div style={{ marginBottom: 16 }}>{actionSlot(requestClose)}</div>}
            {item.meta && item.meta.length > 0 && (
              <div style={{ borderTop: `1px solid ${HAIRLINE}`, borderBottom: `1px solid ${HAIRLINE}`, padding: "12px 2px", margin: "0 0 18px", display: "flex", flexDirection: "column", gap: 7 }}>
                {item.meta.map((m, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: "#4A4A44", fontFamily: SANS }}>{m}</div>
                ))}
              </div>
            )}
            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "13px 0", background: INK, color: PAPER, borderRadius: 999, textDecoration: "none", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em" }}>
                {item.sourceLabel ?? "出典を見る"}
                <ExternalLink size={13} strokeWidth={2.2} />
              </a>
            )}
          </OverlayCard>
        </>
      )}
    </BottomSheet>
  );
}
