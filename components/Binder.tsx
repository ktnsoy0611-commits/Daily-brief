"use client";

// アプリ全体で「バインダー」という物体の見た目・動きを1つに揃えるための
// 共通モデル。以前はRecordsTabの棚(平らな背表紙テクスチャをrotateYで
// 軽く傾けるだけ)とExecuteTabの確定バインダー(独自のページめくり)が、
// それぞれ別々に似て非なる見た目/動きを持っていた。ここでは
//   - 穴+リング金具(HOLE_MASK/HoleRings/BinderRings): 全バインダー共通で2つ穴
//   - 表紙面(BinderCoverFace)と背表紙面(BinderSpineFace): 同じ色面+ラベル
//     プレートの語彙を共有する2つの「面」
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
import { ITEM_CARD_ASPECT, PAPER, SANS, SOFT_SHADOW, SOFT_SHADOW_LG } from "@/lib/constants";
import { haptic, shade } from "@/lib/helpers";
import type { IconType } from "@/components/common";

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

// ページ側の穴の縁取り(ページと一緒に回転し、奥行きの陰影を出す)。
export function HoleRings() {
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

// バインダーを綴じる実際のリング金具(静止していて、ページや表紙だけが
// その周りを動く)。
export function BinderRings() {
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

// ---- 表紙面・背表紙面 -----------------------------------------------------

interface CoverContent {
  color: string;
  EyebrowIcon?: IconType;
  eyebrowLabel?: string;
  title: string;
  footer?: ReactNode;
}

// 表紙面。以前は色面の上に白いラベルプレートを乗せていたが、角丸のプレート
// +装飾的な斜め縞テクスチャが「学童文具っぽくてダサい」という指摘を受け、
// リングバインダーのモックアップ写真(布/紙の色面に、ロゴマークと太字の
// タイトルを直接置くだけ)に寄せてシンプルにした。プレートを廃止し、
// タイトルは色面に直接置く。全体は角丸なし(四角)で統一する。
export function BinderCoverFace({ color, EyebrowIcon, eyebrowLabel, title, footer }: CoverContent) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: "14px 14px 12px",
      background: `linear-gradient(160deg, ${shade(color, 14)} 0%, ${color} 55%, ${shade(color, -12)} 100%)`,
    }}>
      {/* スタジオ光のような柔らかい斜めのハイライトのみ。装飾的な縞は使わない。 */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 45%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)", pointerEvents: "none" }} />
      {/* 表紙が正面を向いている間(背表紙面が真横を向いて見えない間)も、
          リング穴が左端にちらっと見えることで「これはリングバインダーだ」
          と伝わるようにする、背表紙のリングと呼応する左端のヒント。 */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "9%", background: "rgba(0,0,0,0.1)", pointerEvents: "none" }} />
      {["18%", "82%"].map((y) => (
        <div key={y} style={{
          position: "absolute", left: "4.5%", top: y, transform: "translate(-50%, -50%)",
          width: 8, height: 8, borderRadius: "50%", border: "1.3px solid rgba(255,255,255,0.75)",
          boxShadow: "0 1px 1.5px rgba(0,0,0,0.35), inset 0 0.5px 1px rgba(0,0,0,0.28)", pointerEvents: "none",
        }} />
      ))}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0, marginLeft: "5%" }}>
        {(EyebrowIcon || eyebrowLabel) && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {EyebrowIcon && (
              <span style={{ width: 19, height: 19, borderRadius: "50%", border: "1.2px solid rgba(255,255,255,0.65)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <EyebrowIcon size={9.5} color="#fff" strokeWidth={2} />
              </span>
            )}
            {eyebrowLabel && <span style={{ fontSize: 8, letterSpacing: "0.17em", color: "rgba(255,255,255,0.82)", fontWeight: 700 }}>{eyebrowLabel}</span>}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "flex-end" }}>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 14.5, lineHeight: 1.3, color: "#fff", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
        </div>
        {footer && <div style={{ marginTop: 8, flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>
  );
}

// 背表紙面。以前は表紙と無関係などす黒い帯+縦書き文字だけの構成で、
// 表紙と背表紙が別デザインに見えてしまっていた。表紙と同じ色面・同じ
// ハイライトの向き・同じ丸バッジ(アイコン)を使い、1つの物体の2つの面
// として整合するようにしている。さらに、色のついた四角い箱というだけでは
// 「バインダーに見えない」という指摘を受けたため、実際のリング穴を上下に
// 配置して、一目でリングバインダーだとわかる決め手にしている。
export function BinderSpineFace({ color, title, count, EyebrowIcon }: { color: string; title: string; count?: number; EyebrowIcon?: IconType }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", overflow: "hidden", padding: "16px 0 14px",
      background: `linear-gradient(160deg, ${shade(color, 14)} 0%, ${color} 55%, ${shade(color, -12)} 100%)`,
    }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(120deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 55%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)", pointerEvents: "none" }} />
      {["13%", "87%"].map((y) => (
        <div key={y} style={{
          position: "absolute", left: "50%", top: y, transform: "translate(-50%, -50%)",
          width: 9, height: 9, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.92)",
          boxShadow: "0 1px 1.5px rgba(0,0,0,0.4), inset 0 0.5px 1px rgba(0,0,0,0.3)",
        }} />
      ))}
      {EyebrowIcon && (
        <span style={{ position: "relative", width: 15, height: 15, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 10, marginBottom: 8 }}>
          <EyebrowIcon size={7.5} color="#fff" strokeWidth={2} />
        </span>
      )}
      <span style={{
        position: "relative", writingMode: "vertical-rl", textOrientation: "mixed", fontFamily: SANS, fontWeight: 700, fontSize: 10.5,
        color: "#fff", letterSpacing: "0.05em", flex: 1, overflow: "hidden", textShadow: "0 1px 2px rgba(0,0,0,0.22)",
      }}>{title}</span>
      {typeof count === "number" && (
        <span style={{ position: "relative", marginTop: 8, marginBottom: 10, fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.78)" }}>{count}</span>
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
// スワイプのピッチはscaleの影響を受けない)。
export function Binder3D({ width, aspect = ITEM_CARD_ASPECT, depth = 18, rotateY, scale = 1, transitionMs, color, EyebrowIcon, eyebrowLabel, title, footer, spineTitle, count, onClick }: CoverContent & {
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
        position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d",
        transform: `scale(${scale}) rotateY(${rotateY}deg)`,
        transition: transitionMs ? `transform ${transitionMs}ms cubic-bezier(0.22,0.9,0.32,1)` : "none",
      }}>
        {/* 表紙面(正面) */}
        <div style={{
          position: "absolute", inset: 0, overflow: "hidden", boxShadow: SOFT_SHADOW_LG,
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: `translateZ(${depth / 2}px)`,
        }}>
          <BinderCoverFace color={color} EyebrowIcon={EyebrowIcon} eyebrowLabel={eyebrowLabel} title={title} footer={footer} />
        </div>
        {/* 背表紙面(左端の側面) */}
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: depth, overflow: "hidden",
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(-90deg) translateZ(" + depth / 2 + "px)",
        }}>
          <BinderSpineFace color={color} title={spineTitle ?? title} count={count} EyebrowIcon={EyebrowIcon} />
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
      style={{ display: "flex", overflowX: "auto", scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch", padding: "20px 0 10px" }}
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
              color={it.color} EyebrowIcon={it.EyebrowIcon} eyebrowLabel={it.eyebrowLabel}
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
  const [drag, setDrag] = useState<{ dir: "next" | "prev"; progress: number; settling: boolean } | null>(null);
  const animating = useRef(false);
  const dragRef = useRef({ startX: 0, startY: 0, startTime: 0, active: false, dir: null as "next" | "prev" | null, width: maxWidth });
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageIndex((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

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
    setDrag({ dir: d.dir, progress, settling: false });
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active || !d.dir) { d.active = false; return; }
    d.active = false;
    const dx = e.clientX - d.startX;
    const dt = Math.max(1, performance.now() - d.startTime);
    const velocity = Math.abs(dx) / dt;
    const progress = Math.min(1, Math.abs(dx) / (d.width * 0.55));
    settle(d.dir, progress > 0.24 || velocity > 0.5);
  };
  const onCancel = () => {
    const d = dragRef.current;
    if (d.active && d.dir) settle(d.dir, false);
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
        {pageIndex + 1} / {pageCount}
      </div>
    </div>
  );
}
