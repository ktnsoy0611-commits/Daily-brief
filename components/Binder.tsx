"use client";

// アプリ全体で「バインダー」という物体の見た目・動きを1つに揃えるための
// 共通モデル。RecordsTabの棚(BinderCoverflowRow)とGoalsTabのグリッドは
// どちらもここで定義するBinder3Dを組み合わせて作られており、「同じ
// バインダーという物体を、違う状況で見ている」という一貫性を保っている。
//   - 表紙面(BinderCoverFace)と背表紙面(BinderSpineFace)・無地の側面
//     (BinderEdgeFace): 無地の下地の上に、ミッドセンチュリーのポスターを
//     思わせる大きな幾何学のワンポイント(AccentGlyph/BigAccentShape)だけで
//     ジャンルを伝える3つの「面」。
//   - Binder3D: 上の3面を実際に厚みを持った3D箱として組み立て、rotateYで
//     「表紙⇄背表紙(リング側)⇄無地の側面(反対側)」を連続的に行き来できる
//     物体。厚み(depth)は挟んでいる件数(count)から自動的に太くなる。
//   - BinderCoverflowRow: Binder3Dを横に並べ、中央に来たものほど表紙が
//     こちらを向くコンベア。中心より右は背表紙(リング側)、中心より左は
//     無地の側面が見えるよう回転の符号を左右で反転させ、実際に棚を正面
//     から覗き込んだ時のような、中心へ収束するパースを再現している。

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { INK, ITEM_CARD_ASPECT, RUST, SANS, SOFT_SHADOW } from "@/lib/constants";

// バインダー表紙・背表紙の見出し用、ミッドセンチュリーのポスターレタリング
// を思わせる太いディスプレイ書体(Anton)。ラテン文字専用のフォントだが、
// フォールバック先に和文書体を指定しているため、和文タイトルが来た場合は
// 文字単位で自動的にZen Kaku Gothic Newへ切り替わる。英字の見出し
// (PLACE/GOAL/CINEMAなど)だけにこの書体が効く形で共存する。
const POSTER_FONT = "var(--font-anton), var(--font-zen-kaku-gothic-new), sans-serif";

// ---- ワンポイントの図形+色(ジャンルなどの意味づけ) -------------------------

export type AccentShape = "square" | "triangle" | "circle" | "diamond";
export interface Accent {
  shape: AccentShape;
  color: string;
}

// 全バインダー共通の「目標」の下地色+ワンポイント(RecordsTabの棚・
// GoalsTabのグリッドどちらでも同じ組み合わせにして揃える)。
export const GOAL_BASE = "#EAE1C8";
export const GOAL_ACCENT: Accent = { shape: "square", color: RUST };

function AccentGlyph({ shape, color, size }: { shape: AccentShape; color: string; size: number }) {
  switch (shape) {
    case "circle":
      return <div style={{ width: size, height: size, borderRadius: "50%", background: color }} />;
    case "square":
      return <div style={{ width: size * 0.86, height: size * 0.86, background: color, borderRadius: 1.5 }} />;
    case "diamond":
      return <div style={{ width: size * 0.72, height: size * 0.72, background: color, borderRadius: 1.5, transform: "rotate(45deg)" }} />;
    case "triangle":
      return <div style={{ width: 0, height: 0, borderLeft: `${size * 0.52}px solid transparent`, borderRight: `${size * 0.52}px solid transparent`, borderBottom: `${size * 0.92}px solid ${color}` }} />;
  }
}

// 表紙の中央上寄りに大きく置く、ミッドセンチュリーのポスターを思わせる
// ワンポイントの幾何学。以前は右上の小さなバッジだったが、無地の下地の
// 上に大きく1つ置くほうがジャンルの判別性・デザイン性の両方で勝るため、
// カード幅の6割ほどを占める大きさに変えた。タイトルが乗る下側の余白は
// 侵さない高さに収めている。
function BigAccentShape({ shape, color }: Accent) {
  const base: CSSProperties = {
    position: "absolute", left: "50%", top: "9%", width: "60%", aspectRatio: "1 / 1", background: color, pointerEvents: "none",
  };
  if (shape === "circle") return <div style={{ ...base, borderRadius: "50%", transform: "translateX(-50%)" }} />;
  if (shape === "square") return <div style={{ ...base, borderRadius: 3, transform: "translateX(-50%)" }} />;
  if (shape === "diamond") return <div style={{ ...base, width: "50%", borderRadius: 3, transform: "translateX(-50%) rotate(45deg)" }} />;
  return <div style={{ ...base, transform: "translateX(-50%)", clipPath: "polygon(50% 2%, 4% 96%, 96% 96%)" }} />;
}

// ---- 表紙面・背表紙面・無地の側面 ------------------------------------------

interface CoverContent {
  color: string;
  eyebrowLabel?: string;
  title: string;
  footer?: ReactNode;
  accent?: Accent;
}

function isLightTone(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
}

// 表紙面。無地の下地(colorは種類ごとに固定: 目標=生成り、場所=グレー、
// メディア=チャコール)の上に、ジャンルのワンポイント(accent)を大きく
// 1つ置くだけの構成。以前はここに柄+穴のヒントも重ねていたが、「変な柄」
// という指摘で撤廃し、無地+ワンポイントだけのミニマルな構成にした。
export function BinderCoverFace({ color, eyebrowLabel, title, footer, accent }: CoverContent) {
  const light = isLightTone(color);
  const fg = light ? INK : "#fff";
  const fgMuted = light ? "rgba(28,28,30,0.62)" : "rgba(255,255,255,0.75)";
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: "14px 14px 12px", background: color, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 0 1px ${light ? "rgba(28,28,30,0.1)" : "rgba(255,255,255,0.08)"}`, pointerEvents: "none" }} />
      {accent && <BigAccentShape shape={accent.shape} color={accent.color} />}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {eyebrowLabel && (
          <span style={{ fontFamily: POSTER_FONT, fontSize: 10, letterSpacing: "0.14em", color: fgMuted, fontWeight: 400, flexShrink: 0 }}>{eyebrowLabel}</span>
        )}
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "flex-end" }}>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 14.5, lineHeight: 1.3, color: fg, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
        </div>
        {footer && <div style={{ marginTop: 8, flexShrink: 0, color: fgMuted }}>{footer}</div>}
      </div>
    </div>
  );
}

// 背表紙面(リング側=バインダーの左端)。実際のリング穴を上下に配置する
// ことで一目でリングバインダーだとわかるようにしている。棚がほぼ背表紙
// だけを見せる構図になるため、ワンポイント(accent)はここにも小さく置き、
// 遠目でもジャンルを判別できるようにする。
export function BinderSpineFace({ color, title, count, accent }: { color: string; title: string; count?: number; accent?: Accent }) {
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
      {accent && (
        <div style={{ position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)" }}>
          <AccentGlyph shape={accent.shape} color={accent.color} size={9} />
        </div>
      )}
      <span style={{
        position: "relative", writingMode: "vertical-rl", textOrientation: "mixed", fontFamily: POSTER_FONT, fontWeight: 400, fontSize: 11,
        color: fg, letterSpacing: "0.05em", flex: 1, overflow: "hidden", marginTop: accent ? 42 : 34,
      }}>{title}</span>
      {typeof count === "number" && (
        <span style={{ position: "relative", marginTop: 8, marginBottom: 10, fontFamily: POSTER_FONT, fontSize: 9, color: fgMuted }}>{count}</span>
      )}
    </div>
  );
}

// 無地の側面(リングの反対側=バインダーの右端)。実物のリングバインダーの
// この面には何も印字されないので、ラベルを持たない無地の面として作る。
// コンベア(BinderCoverflowRow)で中心より左側にある本を、その本の右側面
// から覗き込んでいるように見せるために使う。
function BinderEdgeFace({ color }: { color: string }) {
  const light = isLightTone(color);
  return (
    <div style={{ position: "absolute", inset: 0, background: color }}>
      <div style={{ position: "absolute", inset: 0, background: light ? "linear-gradient(90deg, rgba(0,0,0,0.12), rgba(0,0,0,0))" : "linear-gradient(90deg, rgba(0,0,0,0.26), rgba(0,0,0,0))" }} />
    </div>
  );
}

// ---- 3D箱としてのバインダー ------------------------------------------------

// rotateYが0(表紙が正面)から離れるほど、遠いものは側面側の角度へ寄せる。
// dは中心からの符号付き距離(コンベア上の位置)で、大きさ(絶対値)だけを
// 元に角度を計算する。符号(左右どちら向きに回すか)は呼び出し側で決める。
export function binderTiltAngle(d: number, rest = 80, focused = 0) {
  const amt = Math.max(0, 1 - Math.min(1, Math.abs(d)));
  return rest - (rest - focused) * amt;
}

// リングバインダーの実物写真を参考に、角丸を廃止して四角い箱にした
// (角丸カードは他の「カード」で使う語彙なので、バインダーはあえて
// 直角にして両者を視覚的に区別する)。表紙・背表紙(リング側)・無地の
// 側面(反対側)の3面を持つ箱として組み立てる。背表紙面はrotateY(-90deg)
// で、無地の側面はrotateY(+90deg)で構成しているため、外側のrotateYが
// プラスの時は背表紙、マイナスの時は無地の側面が正しく正面を向く
// (backface-visibilityの都合上、片方の面は常に反対の符号でしか正しく
// 見えない)。どちらの符号で呼んでも常にどちらかの面が正しく見えるので、
// 呼び出し側は「右にある本はプラス、左にある本はマイナス」で呼べば、
// 棚を正面から覗き込んだ時のように収束するパースになる。
// 厚み(depth)は明示的に渡さなければ挟んでいる件数(count)から自動的に
// 太く/細くなり、「中身が多いほど分厚く見える」という物理的な説得力を
// 持たせている。scaleは棚(BinderCoverflowRow)で中央に来たものだけを
// その場でひとまわり大きく見せるための上乗せで、レイアウト上の幅
// (width)自体は変えない。transformOriginを底辺中央にしているのは、
// 回転・拡大の中心を中央のままにするとscaleが変わるたびに上端だけでなく
// 下端も動いてしまい、スワイプ中に本棚全体が上下にガクガク揺れて見える
// 不具合があったため。棚に本の底が固定されているのと同じように、常に
// 下端を基準に伸び縮みさせる。
export function Binder3D({ width, aspect = ITEM_CARD_ASPECT, depth, rotateY, scale = 1, transitionMs, color, eyebrowLabel, title, footer, spineTitle, count, accent, onClick }: CoverContent & {
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
  const resolvedDepth = depth ?? Math.max(14, Math.min(46, 15 + (count ?? 0) * 2.1));
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
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: `translateZ(${resolvedDepth / 2}px)`,
        }}>
          <BinderCoverFace color={color} eyebrowLabel={eyebrowLabel} title={title} footer={footer} accent={accent} />
        </div>
        {/* 背表紙面(左端=リング側) */}
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: resolvedDepth, overflow: "hidden",
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(-90deg) translateZ(" + resolvedDepth / 2 + "px)",
        }}>
          <BinderSpineFace color={color} title={spineTitle ?? title} count={count} accent={accent} />
        </div>
        {/* 無地の側面(右端=リングの反対側) */}
        <div style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: resolvedDepth, overflow: "hidden",
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(90deg) translateZ(" + resolvedDepth / 2 + "px)",
        }}>
          <BinderEdgeFace color={color} />
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

const ROW_FOCUS_SCALE = 0.12;
// 表紙が正面を向いているフォーカス中の1冊の両脇に確保する、追加の
// 余白(px)。これがないと、フォーカス中の本(実寸で表示される)と、
// すぐ隣の背表紙だけの本(ピッチ上は近い)が重なって窮屈に見えてしまう。
// フォーカスが隣へ移るにつれて滑らかに0へ戻る(=フォーカス中の本自身は
// 余白を持たない)ようclampした符号付き距離で滲ませている。
const FOCUS_SPREAD = 30;

// ネイティブの横スクロール+スナップを使うことで、「タップ」と「スワイプで
// 送る」の判定をブラウザの標準挙動に任せられる。スクロール位置から各
// アイテムの中心からの距離を算出し、Binder3Dのrotateyへ直接反映する。
//
// 「本の見た目サイズ(itemWidth)」と「棚に並ぶピッチ(pitch)」をあえて
// 分離している: 本棚では1冊1冊の表紙は大きくても、並んでいる時に見える
// のはほぼ背表紙の薄い幅だけなので、ピッチ自体はその薄さに合わせて詰める。
// DOM上の各スロットはpitch幅の空箱にし、その中央にitemWidth幅のBinder3Dを
// 絶対配置で重ねて迫り出させることで、「表紙は大きいのに本棚としては
// ぎっしり詰まっている」という実物の本棚に近い密度を再現している
// (フォーカスした1冊がscaleでさらに一回り迫り出し、FOCUS_SPREADで
// 両隣との重なりを避ける)。
//
// スロット自体にもitemHeight相当の高さを明示している。以前はBinder3D側の
// scaleTransformが「見た目だけ」拡大縮小するもので、レイアウト上の高さには
// 影響しない前提だったが、スロットの中身を絶対配置にした結果スロット自体の
// 高さがフローから消えてしまい、行全体の高さがpadding分しか無くなって
// バインダーが上下の枠で見切れる不具合が起きた。スロットに素の(scale=1の)
// 高さを持たせつつ、フォーカス時の拡大ぶんはコンテナのpaddingで余白として
// 確保することで、スクロールコンテナ(overflow-x:autoによりoverflow-yも
// 実質autoになりクリップが効く)の中に常に収まるようにしている。
export function BinderCoverflowRow({ items, itemWidth = 172, pitch = 46, aspect = ITEM_CARD_ASPECT }: {
  items: BinderShelfItem[];
  itemWidth?: number;
  pitch?: number;
  aspect?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const centerRef = useRef(0);
  const step = pitch;

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

  const sidePad = Math.max(0, (containerWidth - pitch) / 2);
  const [aspNum, aspDen] = aspect.split("/").map((s) => parseFloat(s.trim()));
  const itemHeight = itemWidth * (aspDen / aspNum);
  const topPad = Math.ceil(itemHeight * ROW_FOCUS_SCALE) + 22;

  return (
    <div
      ref={scrollRef} onScroll={onScroll} className="no-scrollbar"
      style={{ display: "flex", alignItems: "flex-end", overflowX: "auto", scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch", padding: `${topPad}px 0 14px` }}
    >
      <div style={{ flex: "0 0 auto", width: sidePad }} />
      {items.map((it, i) => {
        const d = i - centerRef.current;
        // 中心より右(d>=0)は常にプラスの角度で背表紙(リング側)を、
        // 中心より左(d<0)は常にマイナスの角度で無地の側面を見せる。
        // これにより、フォーカス中の1冊を正面から見た時、その右は
        // 左側面越しに、左は右側面越しに覗き込んでいるような、実際に
        // 棚を正面から見た時と同じ収束するパースになる。
        const magnitude = binderTiltAngle(Math.abs(d));
        const angle = d >= 0 ? magnitude : -magnitude;
        const focus = Math.max(0, 1 - Math.min(1, Math.abs(d)));
        const scale = 1 + focus * ROW_FOCUS_SCALE;
        const spread = FOCUS_SPREAD * Math.max(-1, Math.min(1, d));
        return (
          <div key={it.key} style={{ position: "relative", flex: "0 0 auto", width: pitch, height: itemHeight, scrollSnapAlign: "center", zIndex: Math.round(focus * 100) }}>
            <div style={{ position: "absolute", left: "50%", bottom: 0, width: itemWidth, transform: `translateX(calc(-50% + ${spread}px))` }}>
              <Binder3D
                width={itemWidth} aspect={aspect} rotateY={angle} scale={scale} transitionMs={60}
                color={it.color} eyebrowLabel={it.eyebrowLabel} accent={it.accent}
                title={it.title} spineTitle={it.spineTitle} count={it.count} onClick={it.onOpen}
              />
            </div>
          </div>
        );
      })}
      <div style={{ flex: "0 0 auto", width: sidePad }} />
    </div>
  );
}
