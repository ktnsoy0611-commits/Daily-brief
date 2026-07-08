"use client";

// アプリ全体で「バインダー」という物体の見た目・動きを1つに揃えるための
// 共通モデル。以前はRecordsTabの棚(平らな背表紙テクスチャをrotateYで
// 軽く傾けるだけ)とExecuteTabの確定バインダー(独自のページめくり)が、
// それぞれ別々に似て非なる見た目/動きを持っていた。ここでは
//   - 穴+リング金具(HOLE_MASK/HoleRings/BinderRings): 全バインダー共通で2つ穴
//   - 表紙面(BinderCoverFace)と背表紙面(BinderSpineFace): 白・黒・グレーの
//     単色+ミッドセンチュリー風の簡素な幾何学模様を共有する2つの「面」
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
import { INK, ITEM_CARD_ASPECT, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";
import { hashStr, haptic } from "@/lib/helpers";

// ---- バインダーの色(白・黒・グレーの無彩色のみ) ---------------------------
// 映画/音楽アイコンのような装飾に頼らず、面積の大きい濃淡の違いだけで
// バインダーごとの見分けをつける。文字列(タイトルなど)からハッシュで
// 決定的に1色を選ぶことで、同じバインダーは常に同じ色になる。
export const BINDER_TONES = ["#1C1C1E", "#3B3B39", "#5C5952", "#8B8780", "#B7B3A7", "#D9D6CB"];
export function binderTone(seed: string) {
  return BINDER_TONES[hashStr(seed) % BINDER_TONES.length];
}

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

// 穴の位置・大きさをHoleRings/BinderRings/表紙面のヒントで揃えるための
// 共通定数。
const RING_X = "5.8%";
const RING_YS = ["24%", "76%"];

// ページ側の穴の縁取り(ページと一緒に回転し、奥行きの陰影を出す)。
export function HoleRings() {
  return (
    <>
      {RING_YS.map((y) => (
        <div key={y} style={{
          position: "absolute", left: RING_X, top: y, transform: "translate(-50%, -50%)",
          width: 12, height: 12, borderRadius: "50%", pointerEvents: "none", zIndex: 5,
          boxShadow: "inset 0 1.5px 2px rgba(28,28,30,0.22), inset 0 -1px 1px rgba(255,255,255,0.4), 0 0 0 1px rgba(28,28,30,0.05)",
        }} />
      ))}
    </>
  );
}

// バインダーを綴じる実際のリング金具(静止していて、ページや表紙だけが
// その周りを動く)。以前は金色っぽいメタリックな縁取りリングで、他の
// バインダー面が使う「穴」の語彙と食い違う独自パーツに見えてしまって
// いた(「変なクリップ」)。HoleRingsと全く同じ「窪んだ穴」の見た目に
// 揃えることで、ページの穴と地続きの1つのリング穴に見えるようにする。
export function BinderRings() {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 20, pointerEvents: "none" }}>
      {RING_YS.map((y) => (
        <div key={y} style={{
          position: "absolute", left: RING_X, top: y, transform: "translate(-50%, -50%)",
          width: 12, height: 12, borderRadius: "50%", background: "rgba(253,251,245,0.95)",
          boxShadow: "inset 0 1.5px 2px rgba(0,0,0,0.35), inset 0 -1px 1.5px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.28)",
        }} />
      ))}
    </div>
  );
}

// ---- 表紙面・背表紙面 -----------------------------------------------------

interface CoverContent {
  color: string;
  eyebrowLabel?: string;
  title: string;
  footer?: ReactNode;
  showRingHint?: boolean;
}

function isLightTone(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
}

// ミッドセンチュリーのポスター/装丁を参考にした、色面の上の簡素な幾何学
// 模様。派手な色は使わず、地の色よりわずかに明/暗いだけの円+線の2種類を
// タイトルの文字列から決定論的に切り替える。
function BinderPattern({ seed, tint }: { seed: number; tint: string }) {
  if (seed % 2 === 0) {
    return <div style={{ position: "absolute", right: "-20%", bottom: "-16%", width: "68%", aspectRatio: "1 / 1", borderRadius: "50%", background: tint, pointerEvents: "none" }} />;
  }
  return (
    <>
      <div style={{ position: "absolute", left: "12%", right: "12%", top: "40%", height: 1.5, background: tint, pointerEvents: "none" }} />
      <div style={{ position: "absolute", right: "16%", bottom: "18%", width: "20%", aspectRatio: "1 / 1", borderRadius: "50%", background: tint, pointerEvents: "none" }} />
    </>
  );
}

// 表紙面。白・黒・グレーの単色(colorはBINDER_TONESから渡される)に、
// ミッドセンチュリー風の簡素な幾何学模様を薄く重ねるだけの構成。以前は
// アイコンバッジ+彩度の高い色面(紺・レンガ色などの「濁った和風」の
// トーン)を使っていたが、アプリ全体のミニマルなトーンと不一致で
// ダサいという指摘を受け、白黒グレーのみ+テキストだけで種類を伝える
// デザインに変更した。アイコンは一切使わない。
export function BinderCoverFace({ color, eyebrowLabel, title, footer, showRingHint = true }: CoverContent) {
  const light = isLightTone(color);
  const fg = light ? INK : "#fff";
  const fgMuted = light ? "rgba(28,28,30,0.62)" : "rgba(255,255,255,0.75)";
  const tint = light ? "rgba(28,28,30,0.06)" : "rgba(255,255,255,0.07)";
  const ringBorder = light ? "rgba(28,28,30,0.5)" : "rgba(255,255,255,0.75)";
  const seed = title.length + title.charCodeAt(0);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: "14px 14px 12px", background: color, overflow: "hidden" }}>
      <BinderPattern seed={seed} tint={tint} />
      <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 0 1px ${light ? "rgba(28,28,30,0.1)" : "rgba(255,255,255,0.08)"}`, pointerEvents: "none" }} />
      {showRingHint && (
        <>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "9%", background: light ? "rgba(0,0,0,0.05)" : "rgba(0,0,0,0.12)", pointerEvents: "none" }} />
          {RING_YS.map((y) => (
            <div key={y} style={{
              position: "absolute", left: RING_X, top: y, transform: "translate(-50%, -50%)",
              width: 8, height: 8, borderRadius: "50%", border: `1.3px solid ${ringBorder}`, pointerEvents: "none",
            }} />
          ))}
        </>
      )}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0, marginLeft: showRingHint ? "5%" : 0 }}>
        {eyebrowLabel && (
          <span style={{ fontSize: 8, letterSpacing: "0.17em", color: fgMuted, fontWeight: 700, flexShrink: 0 }}>{eyebrowLabel}</span>
        )}
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "flex-end" }}>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 14.5, lineHeight: 1.3, color: fg, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
        </div>
        {footer && <div style={{ marginTop: 8, flexShrink: 0, color: fgMuted }}>{footer}</div>}
      </div>
    </div>
  );
}

// 背表紙面。表紙と同じ単色+パターンの語彙を使い、実際のリング穴を上下に
// 配置することで一目でリングバインダーだとわかるようにしている。
export function BinderSpineFace({ color, title, count }: { color: string; title: string; count?: number }) {
  const light = isLightTone(color);
  const fg = light ? INK : "#fff";
  const fgMuted = light ? "rgba(28,28,30,0.62)" : "rgba(255,255,255,0.75)";
  const ringBorder = light ? "rgba(28,28,30,0.55)" : "rgba(255,255,255,0.85)";
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", overflow: "hidden", padding: "16px 0 14px", background: color }}>
      <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 0 1px ${light ? "rgba(28,28,30,0.1)" : "rgba(255,255,255,0.08)"}`, pointerEvents: "none" }} />
      {["13%", "87%"].map((y) => (
        <div key={y} style={{
          position: "absolute", left: "50%", top: y, transform: "translate(-50%, -50%)",
          width: 9, height: 9, borderRadius: "50%", border: `1.5px solid ${ringBorder}`,
        }} />
      ))}
      <span style={{
        position: "relative", writingMode: "vertical-rl", textOrientation: "mixed", fontFamily: SANS, fontWeight: 700, fontSize: 10.5,
        color: fg, letterSpacing: "0.05em", flex: 1, overflow: "hidden", marginTop: 34,
      }}>{title}</span>
      {typeof count === "number" && (
        <span style={{ position: "relative", marginTop: 8, marginBottom: 10, fontSize: 8, fontWeight: 700, color: fgMuted }}>{count}</span>
      )}
    </div>
  );
}

// ---- 3D箱としてのバインダー ------------------------------------------------

// rotateYが0(表紙が正面)から離れるほど、遠いものは背表紙側の角度へ寄せる。
// dは中心からの符号付き距離(コンベア上の位置)。
// 背表紙面(BinderSpineFace)はrotateY(-90deg)で組み立てているため、外側の
// 箱をプラスの角度で回した時だけ正しく正面を向く(マイナス側は逆に背表紙の
// 裏側が向いてしまいbackface-visibility:hiddenで消え、表紙もほぼ真横を
// 向いた薄いスライバーしか見えなくなる)。以前はMath.sign(d)で中心の左右に
// 符号付きの角度を与えていたため、左隣だけが「薄っぺらく」壊れて見える
// 非対称なバグになっていた。距離の絶対値だけを見て常に同じ符号(プラス)の
// 角度を返すことで、左右どちらの隣も同じように正しく背表紙を向くようにする。
export function binderTiltAngle(d: number, rest = 80, focused = 0) {
  const amt = Math.max(0, 1 - Math.min(1, Math.abs(d)));
  return rest - (rest - focused) * amt;
}

// リングバインダーの実物写真を参考に、角丸を廃止して四角い箱にした
// (角丸カードは他の「カード」で使う語彙なので、バインダーはあえて
// 直角にして両者を視覚的に区別する)。scaleは棚(BinderCoverflowRow)で
// 中央に来たものだけをその場でひとまわり大きく見せるための上乗せで、
// レイアウト上の幅(width)自体は変えない(隣接アイテムの詰まり方=
// スワイプのピッチはscaleの影響を受けない)。transformOriginを底辺
// 中央にしているのは、回転・拡大の中心を中央(50% 50%)のままにすると
// scaleが変わるたびに上端だけでなく下端も動いてしまい、スワイプ中に
// 本棚全体が上下にガクガク揺れて見える不具合があったため。棚に本の
// 底が固定されているのと同じように、常に下端を基準に伸び縮みさせる。
export function Binder3D({ width, aspect = ITEM_CARD_ASPECT, depth = 18, rotateY, scale = 1, transitionMs, color, eyebrowLabel, title, footer, spineTitle, count, onClick }: CoverContent & {
  width: number | string;
  aspect?: string;
  depth?: number;
  rotateY: number;
  scale?: number;
  transitionMs?: number;
  spineTitle?: string;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <div onClick={onClick} style={{ width, aspectRatio: aspect, perspective: 900, cursor: onClick ? "pointer" : "default" }}>
      <div style={{
        position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transformOrigin: "50% 100%",
        transform: `scale(${scale}) rotateY(${rotateY}deg)`,
        transition: transitionMs ? `transform ${transitionMs}ms cubic-bezier(0.22,0.9,0.32,1)` : "none",
      }}>
        {/* 表紙面(正面) */}
        <div style={{
          position: "absolute", inset: 0, overflow: "hidden", boxShadow: SOFT_SHADOW,
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: `translateZ(${depth / 2}px)`,
        }}>
          <BinderCoverFace color={color} eyebrowLabel={eyebrowLabel} title={title} footer={footer} />
        </div>
        {/* 背表紙面(左端の側面) */}
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: depth, overflow: "hidden",
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
// 以前はitemWidth/gapが大きく、本と本の間がスカスカで「遠い」印象だった。
// 実物の本棚に近い詰まったピッチにしつつ、中心に来たものだけをscaleで
// ひとまわり持ち上げて主役をはっきりさせる(レイアウト幅自体は変えない
// ので、詰まったピッチのままスワイプできる)。
export function BinderCoverflowRow({ items, itemWidth = 128, aspect = ITEM_CARD_ASPECT, gap = 5 }: {
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
      style={{ display: "flex", alignItems: "flex-end", overflowX: "auto", scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch", padding: "20px 0 10px" }}
    >
      <div style={{ flex: "0 0 auto", width: sidePad }} />
      {items.map((it, i) => {
        const d = i - centerRef.current;
        const angle = binderTiltAngle(d);
        const focus = Math.max(0, 1 - Math.min(1, Math.abs(d)));
        const scale = 1 + focus * 0.14;
        return (
          <div key={it.key} style={{ position: "relative", flex: "0 0 auto", width: itemWidth, marginRight: i === items.length - 1 ? 0 : gap, scrollSnapAlign: "center", zIndex: Math.round(focus * 100) }}>
            <Binder3D
              width={itemWidth} aspect={aspect} rotateY={angle} scale={scale} transitionMs={60}
              color={it.color} eyebrowLabel={it.eyebrowLabel}
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
  const [drag, setDrag] = useState<{ dir: "next" | "prev"; progress: number; settling: boolean; settleMs: number } | null>(null);
  const animating = useRef(false);
  const dragRef = useRef({ startX: 0, startY: 0, startTime: 0, active: false, dir: null as "next" | "prev" | null, width: maxWidth });
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageIndex((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  // 素早く軽くはじいた場合、進捗(progress)がまだ小さいうちにコミットが
  // 決まる。以前はここから常に固定230msでめくり切っていたため、進捗が
  // 小さいほど「短い時間で大きな角度を一気に動かす」ことになり、
  // ガクッとした早回しに見えていた。残りの角度に比例して所要時間を
  // 決めることで、どの進捗から離しても体感速度が揃うようにする。
  const settle = (dir: "next" | "prev", commit: boolean, fromProgress: number) => {
    animating.current = true;
    haptic(commit ? 10 : 4);
    const remaining = commit ? 1 - fromProgress : fromProgress;
    const ms = Math.round(150 + remaining * 220);
    setDrag({ dir, progress: commit ? 1 : 0, settling: true, settleMs: ms });
    setTimeout(() => {
      if (commit) setPageIndex((p) => (dir === "next" ? p + 1 : p - 1));
      setDrag(null);
      animating.current = false;
    }, ms);
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
    setDrag({ dir: d.dir, progress, settling: false, settleMs: 0 });
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active || !d.dir) { d.active = false; return; }
    d.active = false;
    const dx = e.clientX - d.startX;
    const dt = Math.max(1, performance.now() - d.startTime);
    const velocity = Math.abs(dx) / dt;
    const progress = Math.min(1, Math.abs(dx) / (d.width * 0.55));
    settle(d.dir, progress > 0.24 || velocity > 0.5, progress);
  };
  const onCancel = () => {
    const d = dragRef.current;
    if (d.active && d.dir) settle(d.dir, false, drag?.progress ?? 0);
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
          <div key={inset} style={{ position: "absolute", right: -inset * 0.6, top: 7 + i * 2, bottom: 7 + i * 2, width: inset, background: "#EDE7D6", boxShadow: "1px 0 2px rgba(28,28,30,0.1)" }} />
        ))}
        {renderPage(baseIndex)}
        {extraOverlay?.(pageIndex)}
        {drag && leafIndex !== null && leafIndex >= 0 && leafIndex < pageCount && (
          <div style={{
            position: "absolute", inset: 0, transformStyle: "preserve-3d", transformOrigin: "0% 50%",
            transform: `rotateY(${dragAngle}deg) translateZ(${liftZ}px) scale(${1 + 0.045 * Math.sin(Math.min(progress, 1) * Math.PI)})`,
            transition: drag.settling ? `transform ${drag.settleMs}ms cubic-bezier(0.16,1,0.3,1)` : "none",
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
