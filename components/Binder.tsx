"use client";

// アプリ全体で「バインダー」という物体の見た目・動きを1つに揃えるための
// 共通モデル。RecordsTabの棚(BinderCoverflowRow)とGoalsTabのグリッドは
// どちらもここで定義するBinder3Dを組み合わせて作られている。
//   - 表紙面(BinderCoverFace): 白い下地の上部にアクセントカラーの帯を1つ
//     置き、そこに幾何学のワンポイント(AccentGlyph)を白抜きで載せる。
//     ブリーフタブの育成カード(色帯+アイコン+ラベル)と同じ語彙に揃えて
//     いる。下部はカテゴリのドット+ラベルとタイトルだけのミニマルな構成。
//   - 背表紙面(BinderSpineFace)・無地の側面(BinderEdgeFace): 厚みは
//     ごく薄く、文字は一切載せない。背表紙はアクセントカラーの単色で、
//     棚に並んだ時にそこだけが色の点になる。
//   - Binder3D: 上記4面(表紙・背表紙・裏表紙・無地の側面)を厚みを持った
//     3D箱として組み立てる。表紙と裏表紙は背表紙側(左端)を軸にほんの
//     少しだけ開いた扇形になるよう回転を加えており、上から見ると
//     ハの字に開いた形になる。rotateYで表紙⇄背表紙(リング側)を連続的に
//     行き来できる。厚み(depth)は挟んでいる件数(count)から自動で決まる。
//   - BinderCoverflowRow: Binder3Dを横に並べ、中央に来たものほど表紙が
//     こちらを向くコンベア。フォーカス中の1冊の両脇は、表紙の実際の
//     外側からすぐ背表紙が詰めて並ぶよう固定の隙間だけシフトする。
//     スワイプ中は棚全体がわずかにパカッと開く一瞬のアニメーションが付く。

import { useEffect, useRef, useState, type ReactNode } from "react";
import { INK, ITEM_CARD_ASPECT, PAPER, SANS, SOFT_SHADOW } from "@/lib/constants";

// ---- ワンポイントの図形+色(ジャンルなどの意味づけ) -------------------------

export type AccentShape = "square" | "triangle" | "circle" | "diamond";
export interface Accent {
  shape: AccentShape;
  color: string;
}

// 全バインダー共通の「目標」の下地色+ワンポイント(RecordsTabの棚・
// GoalsTabのグリッドどちらでも同じ組み合わせにして揃える)。表紙自体は
// 常に白なので、colorは背表紙の単色フォールバック(accent未指定時)としてのみ使う。
export const GOAL_BASE = "#F7F6F2";
export const GOAL_ACCENT: Accent = { shape: "square", color: "#9C7A68" };

function AccentGlyph({ shape, color, size }: { shape: AccentShape; color: string; size: number }) {
  switch (shape) {
    case "circle":
      return <div style={{ width: size, height: size, borderRadius: "50%", background: color }} />;
    case "square":
      return <div style={{ width: size * 0.86, height: size * 0.86, background: color, borderRadius: 2 }} />;
    case "diamond":
      return <div style={{ width: size * 0.72, height: size * 0.72, background: color, borderRadius: 2, transform: "rotate(45deg)" }} />;
    case "triangle":
      return <div style={{ width: 0, height: 0, borderLeft: `${size * 0.52}px solid transparent`, borderRight: `${size * 0.52}px solid transparent`, borderBottom: `${size * 0.92}px solid ${color}` }} />;
  }
}

// ---- 表紙面・背表紙面・無地の側面・裏表紙 -----------------------------------

interface CoverContent {
  color: string;
  eyebrowLabel?: string;
  title: string;
  footer?: ReactNode;
  accent?: Accent;
}

const COVER_RADIUS = 12;

// 表紙面。ブリーフタブの育成カード(色帯の中に白いアイコン+ラベル、
// 下は白地にカテゴリ+タイトル)と同じ構成に揃えたミニマルなデザイン。
// 色は下地(白)ではなく、上部の帯とドットに使うアクセント1色だけに絞る。
export function BinderCoverFace({ eyebrowLabel, title, footer, accent }: CoverContent) {
  const accentColor = accent?.color ?? INK;
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: PAPER, overflow: "hidden",
      borderTopRightRadius: COVER_RADIUS, borderBottomRightRadius: COVER_RADIUS,
    }}>
      {accent && (
        <div style={{ flex: "0 0 32%", background: accentColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AccentGlyph shape={accent.shape} color={PAPER} size={30} />
        </div>
      )}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: "12px 14px 12px" }}>
        {eyebrowLabel && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7, flexShrink: 0 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: accentColor, flexShrink: 0 }} />
            <span style={{ fontSize: 9, letterSpacing: "0.12em", color: accentColor, fontWeight: 700 }}>{eyebrowLabel}</span>
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "flex-end" }}>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 14.5, lineHeight: 1.3, color: INK, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
        </div>
        {footer && <div style={{ marginTop: 8, flexShrink: 0, color: "rgba(28,28,30,0.6)" }}>{footer}</div>}
      </div>
    </div>
  );
}

// 背表紙面(リング側=バインダーの左端)。厚みがごく薄いため、リング穴や
// タイトル文字は載せない。アクセントカラーの単色だけで、棚に並んだ時に
// そこだけが色の点として見える。
function BinderSpineFace({ color }: { color: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: color }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(255,255,255,0.16), rgba(0,0,0,0.1))" }} />
    </div>
  );
}

// 無地の側面(リングの反対側=バインダーの右端=開く側)。表紙が背表紙を
// 軸にわずかに開くため、ここは奥まった隙間の陰として見える程度でよく、
// 特定の色を持たせず影のグラデーションだけにしている。
function BinderEdgeFace() {
  return <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,0.18), rgba(0,0,0,0.04))" }} />;
}

// 裏表紙(表紙面の真裏)。実物のバインダーと同じく無地。表紙側の角丸(右端)
// とは逆に、こちらはローカル座標の左端が世界座標の開く側(右)にあたるため
// 左端を丸めている(詳細はBinder3Dのコメント参照)。
function BinderBackCoverFace() {
  return <div style={{ position: "absolute", inset: 0, background: PAPER, borderTopLeftRadius: COVER_RADIUS, borderBottomLeftRadius: COVER_RADIUS }} />;
}

// ---- 3D箱としてのバインダー ------------------------------------------------

// rotateYが0(表紙が正面)から離れるほど、遠いものは側面側の角度へ寄せる。
// dは中心からの符号付き距離(コンベア上の位置)で、大きさ(絶対値)だけを
// 元に角度を計算する。符号(左右どちら向きに回すか)は呼び出し側で決める。
export function binderTiltAngle(d: number, rest = 80, focused = 0) {
  const amt = Math.max(0, 1 - Math.min(1, Math.abs(d)));
  return rest - (rest - focused) * amt;
}

// 静止時に表紙が背表紙側を軸にわずかに開いている角度(上から見ると扇形)。
// 厚みがごく薄いため、角度を大きくしすぎると開いた側の辺が厚み以上に
// 迫り出し、面と面の間に隙間(背景が透けて見える穴)ができてしまう。
// 厚みに対してつり合う程度のごく小さい値に留めている。
const OPEN_DEG_REST = 2;
// スワイプ中に一瞬だけ開きを強める角度(パカッとめくれる演出)。
const OPEN_DEG_ACTIVE = 6;
const HINGE_TRANSITION = "transform 260ms cubic-bezier(0.34,1.56,0.64,1)";

// 角丸を持つ白い箱として、表紙・背表紙(リング側)・裏表紙・無地の側面
// (開く側)の4面を組み立てる。rotateYが0度→90度→180度→270度(=-90度)と
// 回るにつれ、表紙→背表紙→裏表紙→無地の側面→(元の表紙に戻る)の順に
// 正面を向く(同じ軸のrotateYは足し算で合成されるため、各面のローカル
// 回転+外側のrotateYの合計が-90〜90度の範囲に入っている時だけ
// backface-visibilityにより正しく見える)。
//
// 表紙・裏表紙は、それぞれ背表紙側の辺(=蝶番)を軸にopenDeg分だけ
// 逆向きに回転させ、閉じた箱ではなく上から見て扇形に開いた形にしている。
// 表紙は translateZ の後に transform-origin を左端(0%)にしてrotateYを
// 足すだけで蝶番の辺が固定される。裏表紙は180度回転で自身のローカル
// 右端が世界座標の左端(蝶番の位置、z=-depth/2)へ移るため、外側に
// もう1枚ラッパーを重ね、そのtransform-originのz成分をdepth/2ぶん
// ずらすことで蝶番の位置に正しく一致させている。
//
// 厚み(depth)は明示的に渡さなければ挟んでいる件数(count)から自動的に
// 太く/細くなる。scaleは棚(BinderCoverflowRow)で中央に来たものだけを
// その場でひとまわり大きく見せるための上乗せで、レイアウト上の幅
// (width)自体は変えない。transformOriginを底辺中央にしているのは、
// 回転・拡大の中心を中央のままにするとscaleが変わるたびに上端だけでなく
// 下端も動いてしまい、スワイプ中に本棚全体が上下にガクガク揺れて見える
// 不具合があったため。棚に本の底が固定されているのと同じように、常に
// 下端を基準に伸び縮みさせる。
export function Binder3D({ width, aspect = ITEM_CARD_ASPECT, depth, rotateY, scale = 1, transitionMs, color, eyebrowLabel, title, footer, count, accent, openDeg = OPEN_DEG_REST, onClick }: CoverContent & {
  width: number | string;
  aspect?: string;
  depth?: number;
  rotateY: number;
  scale?: number;
  transitionMs?: number;
  count?: number;
  openDeg?: number;
  onClick?: () => void;
}) {
  const resolvedDepth = depth ?? Math.max(5, Math.min(14, 6 + (count ?? 0) * 0.5));
  const spineColor = accent?.color ?? color;
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
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
          transformOrigin: "0% 50%",
          transform: `translateZ(${resolvedDepth / 2}px) rotateY(${-openDeg}deg)`,
          transition: HINGE_TRANSITION,
        }}>
          <BinderCoverFace color={color} eyebrowLabel={eyebrowLabel} title={title} footer={footer} accent={accent} />
        </div>
        {/* 背表紙面(左端=リング側=蝶番) */}
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: resolvedDepth, overflow: "hidden",
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: `rotateY(-90deg) translateZ(${resolvedDepth / 2}px)`,
        }}>
          <BinderSpineFace color={spineColor} />
        </div>
        {/* 無地の側面(右端=リングの反対側=開く側) */}
        <div style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: resolvedDepth, overflow: "hidden",
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: `rotateY(90deg) translateZ(${resolvedDepth / 2}px)`,
        }}>
          <BinderEdgeFace />
        </div>
        {/* 裏表紙(表紙の真裏)。蝶番位置に合わせたラッパーで開き角を加える。 */}
        <div style={{
          position: "absolute", inset: 0, transformStyle: "preserve-3d",
          transformOrigin: `0% 50% ${-resolvedDepth / 2}px`,
          transform: `rotateY(${openDeg}deg)`,
          transition: HINGE_TRANSITION,
        }}>
          <div style={{
            position: "absolute", inset: 0, overflow: "hidden",
            backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: `rotateY(180deg) translateZ(${resolvedDepth / 2}px)`,
          }}>
            <BinderBackCoverFace />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- コンベア状の棚(RecordsTab) -------------------------------------------

export interface BinderShelfItem extends CoverContent {
  key: string;
  count?: number;
  onOpen: () => void;
}

// フォーカスした本を手前に迫り出させる量。控えめな値に絞っている。
const ROW_FOCUS_SCALE = 0.04;

// 中心より右側の本を回す静止角。90度(背表紙が真正面)より少しだけ多く
// 回すことで、裏表紙がわずかに覗く(実際の棚を正面から見た時、右にある
// 本ほど裏表紙が見えるのと同じ理屈)。
const REST_RIGHT = 98;
// 中心より左側の本を回す静止角。90度より少しだけ小さく留めることで、
// 表紙がわずかに多めに覗く(左にある本ほど表紙が見えるのと同じ理屈)。
const REST_LEFT = 70;

// ネイティブの横スクロール+スナップを使うことで、「タップ」と「スワイプで
// 送る」の判定をブラウザの標準挙動に任せられる。スクロール位置から各
// アイテムの中心からの距離を算出し、Binder3Dのrotateyへ直接反映する。
// scrollイベントはrequestAnimationFrameで1フレームに1回へ間引き、
// 更新が飛び飛びになったり過剰に再描画されたりしないようにしている。
//
// 「本の見た目サイズ(itemWidth)」と「棚に並ぶピッチ(pitch)」をあえて
// 分離している: 本棚では1冊1冊の表紙は大きくても、並んでいる時に見える
// のはほぼ背表紙の薄い幅だけなので、ピッチ自体はその薄さに合わせて詰める。
// DOM上の各スロットはpitch幅の空箱にし、その中央にitemWidth幅のBinder3Dを
// 絶対配置で重ねて迫り出させることで、「表紙は大きいのに本棚としては
// ぎっしり詰まっている」という実物の本棚に近い密度を再現している。
// フォーカス中の本の両隣より先(|d|>=1)は、フォーカス中の表紙の実際の
// 右端/左端のすぐ外側から始まる固定の隙間(gap)だけシフトし、そこから
// 先は元のpitchのまま詰めて並べる(距離に比例して隙間が広がり続ける
// わけではない)。
export function BinderCoverflowRow({ items, itemWidth = 172, pitch = 46, aspect = ITEM_CARD_ASPECT }: {
  items: BinderShelfItem[];
  itemWidth?: number;
  pitch?: number;
  aspect?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [flap, setFlap] = useState(false);
  const centerRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const flapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (flapTimeoutRef.current) clearTimeout(flapTimeoutRef.current);
  }, []);

  const onScroll = () => {
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const el = scrollRef.current;
        if (!el) return;
        centerRef.current = el.scrollLeft / step;
        setTick((t) => t + 1);
      });
    }
    setFlap(true);
    if (flapTimeoutRef.current) clearTimeout(flapTimeoutRef.current);
    flapTimeoutRef.current = setTimeout(() => setFlap(false), 180);
  };

  const sidePad = Math.max(0, (containerWidth - pitch) / 2);
  const [aspNum, aspDen] = aspect.split("/").map((s) => parseFloat(s.trim()));
  const itemHeight = itemWidth * (aspDen / aspNum);
  const topPad = Math.ceil(itemHeight * ROW_FOCUS_SCALE) + 22;
  // フォーカス中の表紙の実際の半幅(拡大込み)から、隣のスロット自身の
  // 半幅を差し引き、余裕(隙間+背表紙の最大想定幅)を足した値。これだけ
  // 両隣をシフトすれば、表紙の外側ぴったりから背表紙の列が始まる。
  const coverHalfWidth = (itemWidth * (1 + ROW_FOCUS_SCALE)) / 2;
  const gap = Math.max(0, coverHalfWidth - pitch / 2) + 26;

  return (
    <div
      ref={scrollRef} onScroll={onScroll} className="no-scrollbar"
      style={{ display: "flex", alignItems: "flex-end", overflowX: "auto", scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch", padding: `${topPad}px 0 14px` }}
    >
      <div style={{ flex: "0 0 auto", width: sidePad }} />
      {items.map((it, i) => {
        const d = i - centerRef.current;
        // 左右どちらの隣も背表紙(リング側、ラベルが読める面)が正面を
        // 向くのは共通だが、静止角は左右で非対称にしている: 右側は90度を
        // 少し超えて裏表紙がわずかに覗き、左側は90度に届く前で止めて
        // 表紙がわずかに多めに覗く。実際に棚を正面から見た時の収束する
        // パースを再現している。
        const angle = d >= 0 ? binderTiltAngle(d, REST_RIGHT) : binderTiltAngle(-d, REST_LEFT);
        const focus = Math.max(0, 1 - Math.min(1, Math.abs(d)));
        const scale = 1 + focus * ROW_FOCUS_SCALE;
        // フォーカス中(d=0)は0、|d|>=1では固定のgapだけシフトし、その間は
        // 滑らかに補間する。
        const spread = gap * Math.max(-1, Math.min(1, d));
        return (
          <div key={it.key} style={{ position: "relative", flex: "0 0 auto", width: pitch, height: itemHeight, scrollSnapAlign: "center", zIndex: Math.round(focus * 100) }}>
            <div style={{ position: "absolute", left: "50%", bottom: 0, width: itemWidth, transform: `translateX(calc(-50% + ${spread}px))` }}>
              <Binder3D
                width={itemWidth} aspect={aspect} rotateY={angle} scale={scale} transitionMs={90}
                openDeg={flap ? OPEN_DEG_ACTIVE : OPEN_DEG_REST}
                color={it.color} eyebrowLabel={it.eyebrowLabel} accent={it.accent}
                title={it.title} count={it.count} onClick={it.onOpen}
              />
            </div>
          </div>
        );
      })}
      <div style={{ flex: "0 0 auto", width: sidePad }} />
    </div>
  );
}
