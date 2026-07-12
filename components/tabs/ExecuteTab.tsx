"use client";

import { ArrowLeft, Bookmark, Check, Maximize2, Minimize2, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { COVER_RADIUS, KIND_ACCENT, placeAccent } from "@/components/Binder";
import { BottomSheet, OverlayCard } from "@/components/BottomSheet";
import { BinderModal, HOLE_CLEAR, Masthead, PunchHoles, SelectablePosterCard } from "@/components/common";
import { KIND_ICON } from "@/components/tabs/StockTab";
import { AREA_COORDS, BLUE, GREEN, HAIRLINE, INK, ITEM_CARD_ASPECT, ITEM_DOMAINS, NAV_OFFSET, PAPER, RUST, SANS, SOFT_SHADOW, SOFT_SHADOW_LG, itemKindOf } from "@/lib/constants";
import { dayInfo, domainOf, hasPlace, haptic, img, mapsUrl, mostRecentThursday, originBadge, pinPosition, shade } from "@/lib/helpers";
import type { Item, ItemDomain, ItemKind, TabProps } from "@/lib/types";

const MAP_BG_STYLE = {
  background: "#F1EEE5",
  backgroundImage: "repeating-linear-gradient(0deg, rgba(23,23,21,0.05) 0, rgba(23,23,21,0.05) 1px, transparent 1px, transparent 32px), repeating-linear-gradient(90deg, rgba(23,23,21,0.05) 0, rgba(23,23,21,0.05) 1px, transparent 1px, transparent 32px)",
} as const;

// 地図の中身(方眼背景・エリアラベル・ピン)。ドック表示(MapCanvas)と
// 全画面表示(MapFullscreenOverlay)の両方から共有する。
function MapPins({ items, selectedIds, onOpenPin }: {
  items: Item[];
  selectedIds: string[];
  onOpenPin: (item: Item) => void;
}) {
  return (
    <>
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
    </>
  );
}

// ドック表示の地図。stuck(=下の棚のスクロールでsticky状態に入った)の
// 間は幅を縮めるアニメーションを付ける。widthはレイアウトに実際に効く
// プロパティなので、縮んだ分だけ周りの余白も一緒に詰まり、
// transform:scaleでは起きる「縮んだ絵の周りに元のサイズ分の空白が
// 残る」不自然な空きができない。縮小時は中央寄せではなく右寄せ
// (margin-leftだけauto)にする。
function MapCanvas({ items, selectedIds, onOpenPin, stuck, onOpenFullscreen }: {
  items: Item[];
  selectedIds: string[];
  onOpenPin: (item: Item) => void;
  stuck: boolean;
  onOpenFullscreen: () => void;
}) {
  return (
    <div style={{
      position: "relative", width: stuck ? "72%" : "100%", aspectRatio: "4 / 3", borderRadius: 16, overflow: "hidden",
      margin: stuck ? "0 0 0 auto" : "0 auto", border: `1px solid ${HAIRLINE}`,
      transition: "width 0.32s cubic-bezier(0.32,0.72,0,1)",
      ...MAP_BG_STYLE,
    }}>
      <MapPins items={items} selectedIds={selectedIds} onOpenPin={onOpenPin} />
      {/* 地図右下の全画面トグル。地図単体をタブの他の内容(棚・帯)から
          切り離して大きく見たいという要望に応える。 */}
      <button onClick={onOpenFullscreen} aria-label="地図を全画面表示" style={{
        position: "absolute", right: 12, bottom: 12, width: 34, height: 34, borderRadius: "50%",
        background: PAPER, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: SOFT_SHADOW, color: INK, padding: 0, zIndex: 8,
      }}>
        <Maximize2 size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

// 全画面表示。BottomSheetと同じ「mountした直後にrAFでenteredをtrueにし、
// 閉じる時はまずenteredをfalseへ戻してトランジションを最後まで見せてから
// 実際にアンマウントする」パターンに揃えている(コード全体で開閉アニメーションの
// 作法を統一するため)。トグルボタンを押した瞬間ではなくズームしながら
// 開閉させたい、という要望に応える。
const MAP_FULLSCREEN_MS = 320;
function MapFullscreenOverlay({ items, selectedIds, onOpenPin, onRequestClose }: {
  items: Item[];
  selectedIds: string[];
  onOpenPin: (item: Item) => void;
  onRequestClose: () => void;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const requestClose = () => {
    setEntered(false);
    setTimeout(onRequestClose, MAP_FULLSCREEN_MS);
  };
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, overflow: "hidden",
      paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)",
      transform: entered ? "scale(1)" : "scale(0.4)", transformOrigin: "top center",
      opacity: entered ? 1 : 0,
      transition: `transform ${MAP_FULLSCREEN_MS}ms cubic-bezier(0.32,0.72,0,1), opacity ${MAP_FULLSCREEN_MS - 60}ms ease`,
      ...MAP_BG_STYLE,
    }}>
      <MapPins items={items} selectedIds={selectedIds} onOpenPin={onOpenPin} />
      <button onClick={requestClose} aria-label="地図の全画面表示を閉じる" style={{
        position: "absolute", right: 12, bottom: 12, width: 34, height: 34, borderRadius: "50%",
        background: PAPER, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: SOFT_SHADOW, color: INK, padding: 0, zIndex: 8,
      }}>
        <Minimize2 size={15} strokeWidth={2} />
      </button>
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
      <div className="no-scrollbar" style={{ display: "flex", gap: 12, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2, marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
        {children}
      </div>
    </section>
  );
}

// 「今週のおすすめ」は1件1件のカードではなく、地図上で近い距離にある
// 場所が絡むItem(ドメインを問わない。位置情報の有無はドメインとは別軸)
// 同士をGemini風にまとめた「モデルプラン」の提案。pinPositionが返す地図
// 座標(AREA_COORDSベース)同士の距離が近いものだけを束ねることで、実際に
// 徒歩圏内でまとめて回れる組み合わせになるようにしている。場所を持たない
// Itemは地図上の位置が無いため、この距離ベースの束ねには含めない。
interface RecommendedPlan {
  key: string;
  itemIds: string[];
  label: string;
  accent: string;
  items: { id: string; title: string; image?: string; color?: string; kind: ItemKind; area?: string }[];
}
const RECOMMENDED_COUNT = 5;
// 地図座標(0〜100のパーセント単位)上でこの距離以内なら「近い」とみなす。
const PLAN_CLUSTER_DIST = 16;
const PLAN_MAX_ITEMS = 4;

function buildRecommendedPlans(pool: Item[]): RecommendedPlan[] {
  const withPos = pool.map((item) => ({ item, pos: pinPosition(item) }));
  // 直近にストックしたものを優先的にプランの起点(種)にする。
  const sorted = withPos.slice().sort((a, b) => new Date(b.item.addedAt).getTime() - new Date(a.item.addedAt).getTime());
  const used = new Set<string>();
  const clusters: (typeof withPos)[] = [];
  for (const seed of sorted) {
    if (used.has(seed.item.id) || clusters.length >= RECOMMENDED_COUNT) continue;
    const group = [seed];
    used.add(seed.item.id);
    for (const other of sorted) {
      if (group.length >= PLAN_MAX_ITEMS) break;
      if (used.has(other.item.id)) continue;
      const d = Math.hypot(seed.pos.x - other.pos.x, seed.pos.y - other.pos.y);
      if (d <= PLAN_CLUSTER_DIST) { group.push(other); used.add(other.item.id); }
    }
    // 単体では「組み合わせたプラン」にならないため、2件以上まとまった
    // 種だけを採用する(近くに何も無い1件だけの候補は諦めて捨てる)。
    if (group.length >= 2) clusters.push(group);
  }
  return clusters.slice(0, RECOMMENDED_COUNT).map((group) => {
    const areaCounts = new Map<string, number>();
    group.forEach((g) => {
      const a = g.item.area && g.item.area !== "—" ? g.item.area : null;
      if (a) areaCounts.set(a, (areaCounts.get(a) ?? 0) + 1);
    });
    const areas = Array.from(areaCounts.entries()).sort((a, b) => b[1] - a[1]).map(([a]) => a);
    const label = areas.length === 0 ? "近場でめぐるプラン" : areas.length === 1 ? `${areas[0]}で過ごす` : `${areas[0]}・${areas[1]}をめぐる`;
    return {
      key: group.map((g) => g.item.id).join("-"),
      itemIds: group.map((g) => g.item.id),
      label,
      accent: group[0].item.color ?? placeAccent(areas[0] ?? group[0].item.id).color,
      items: group.map((g) => ({ id: g.item.id, title: g.item.title, image: g.item.images?.[0], color: g.item.color, kind: g.item.kind, area: g.item.area })),
    };
  });
}

// 封をしたエンベロープの見た目。以前は束ねた場所カードの小さな端を
// フラップの下から覗かせていたが、「カードは中に入っている体なので
// 表示しない、エンベロープだけを見せる」という指摘を受けて中身を透か
// さない設計にやり直した。フラップは封をした三角のまま(下地より暗い
// 色)残し、その上にモデルプランの中身(件数・テーマ・行き先の名前)を
// 直接印字するのはこれまでと同じ。タップすると、フラップが少しだけ
// 持ち上がって開く簡単なアニメーション(perspective+rotateX)を挟んで
// から、詳細をオーバーレイ(PlanDetailSheet)で開く。選択のON/OFF自体は
// このカード上ではなく、オーバーレイ内の「これにする」ボタンへ移した
// (エンベロープの役目は「開いて中身を見る」ことだけにする)。選択済み
// かどうかは枠線の色だけで示す。
const ENVELOPE_WIDTH = 240;
const ENVELOPE_HEIGHT = 212;
// 三角のフラップは「封をした証」がわかる程度の控えめな高さにとどめる。
// 以前は58%と大きく、下の文字(件数・テーマ・行き先名)と被ったり、
// 表示領域そのものを圧迫していた。
const ENVELOPE_FLAP_PCT = 34;
// フラップが開くふりをしてからオーバーレイを開くまでの遅延。短すぎると
// 「開いた」実感がなく、長すぎるとタップへの反応が鈍く感じる。
const ENVELOPE_OPEN_MS = 200;

function PlanEnvelope({ plan, selected, onOpen, onToggle }: { plan: RecommendedPlan; selected: boolean; onOpen: () => void; onToggle: () => void }) {
  const dark = shade(plan.accent, -24);
  const [opening, setOpening] = useState(false);

  const handleTap = () => {
    if (opening) return;
    haptic(6);
    setOpening(true);
    setTimeout(() => {
      onOpen();
      setOpening(false);
    }, ENVELOPE_OPEN_MS);
  };

  return (
    // ボタンの中にトグル用の丸ボタンをもう1つ入れ子にしたいため、外枠は
    // <button>ではなくrole="button"のdivにする(HTML仕様上、button要素は
    // インタラクティブな子要素を持てない)。キーボード操作もEnter/Spaceで
    // 同じタップ扱いにして、実質的にボタンと同じ振る舞いにしている。
    <div
      role="button" tabIndex={0} aria-label={plan.label}
      onClick={handleTap}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleTap(); } }}
      style={{
        position: "relative", flexShrink: 0, width: ENVELOPE_WIDTH, height: ENVELOPE_HEIGHT, padding: 0, border: "none", cursor: "pointer",
        borderRadius: COVER_RADIUS, overflow: "hidden", background: plan.accent, boxShadow: SOFT_SHADOW_LG, perspective: 500,
        outline: selected ? `2.5px solid ${BLUE}` : "none", outlineOffset: selected ? -2.5 : 0,
      }}>
      {/* 封をした三角のフラップ。タップすると上端(蝶番)を軸にわずかに
          持ち上がって奥へ開き、封を切ったことを一瞬だけ見せてから
          オーバーレイに引き継ぐ。下の文字と被らないよう、フラップは
          「封をした証」がわかる程度の控えめな高さにとどめる。 */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: `${ENVELOPE_FLAP_PCT}%`, background: dark,
        clipPath: "polygon(0 0, 100% 0, 50% 100%)", zIndex: 2, transformOrigin: "50% 0%",
        transform: opening ? "rotateX(-70deg)" : "rotateX(0deg)",
        transition: `transform ${ENVELOPE_OPEN_MS}ms cubic-bezier(0.45,0,0.2,1)`,
      }} />
      <div style={{ position: "absolute", left: 16, right: 16, bottom: 14, zIndex: 1 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.16em", color: "rgba(255,255,255,0.72)", fontWeight: 700, marginBottom: 5 }}>MODEL PLAN ・ {plan.items.length}件</div>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 15, color: PAPER, lineHeight: 1.3, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{plan.label}</div>
        {/* フラップの下からここまでの間が空きすぎないよう、要約文の代わりに
            行き先を1件1行の箇条書きで並べて、増えた表示領域ぶんの情報量を
            実際に埋める。 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {plan.items.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.55)", flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
            </div>
          ))}
        </div>
      </div>
      {/* 開かなくてもその場で選べるよう、タップ即トグルの丸ボタンを独立して
          置く(カード本体のタップ=開く、この丸だけ=選ぶ)。フラップの三角の
          斜辺がちょうどここを横切るため、フラップの内側(上)には置かず、
          必ずフラップより下の一段(平らな背景の上)に置いて、半透明の背景
          越しに斜辺の継ぎ目が透けて見えないようにしている。 */}
      <button onClick={(e) => { e.stopPropagation(); haptic(6); onToggle(); }} aria-label={selected ? "選択から外す" : "このプランを追加"} style={{
        position: "absolute", right: 10, top: `calc(${ENVELOPE_FLAP_PCT}% + 8px)`, width: 26, height: 26, borderRadius: "50%", zIndex: 3, border: "none", cursor: "pointer", padding: 0,
        background: selected ? BLUE : "rgba(255,255,255,0.92)", color: selected ? PAPER : INK,
        display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(23,23,21,0.25)",
      }}>
        {selected ? <Check size={13} strokeWidth={3} /> : <Plus size={14} strokeWidth={2.6} />}
      </button>
    </div>
  );
}

// エンベロープをタップして開いたときに出す、プラン詳細のオーバーレイ。
// 中身のカードは表示せず(封筒の中に入っている体のため)、行き先の名前
// だけをサムネイル付きのリストとして見せる。qol-app-v19.jsx時代の
// 「モデルプラン」バンドルカード(ラベル・小さな一言・件名の箇条書き・
// 「これにする」ボタン)の構成を、封筒を開けた先の詳細としてそのまま
// 踏襲している。
function PlanDetailSheet({ plan, selected, onToggle, onClose }: {
  plan: RecommendedPlan | null;
  selected: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  if (!plan) return null;
  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <OverlayCard>
          <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#9A988E", marginBottom: 4 }}>MODEL PLAN ・ {plan.items.length}件</div>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, marginBottom: 14 }}>{plan.label}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "0 0 18px" }}>
            {plan.items.map((it, idx) => {
              const IconComp = KIND_ICON[it.kind];
              const hasArea = it.area && it.area !== "—";
              return (
                <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* 徒歩でめぐる順番の目安として、束ねた順に番号を振る。 */}
                  <div style={{ width: 16, flexShrink: 0, fontFamily: SANS, fontWeight: 700, fontSize: 11, color: "#B8B4A6", textAlign: "center" }}>{idx + 1}</div>
                  <div style={{ position: "relative", width: 46, height: 46, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: it.color ?? "#5A5A54" }}>
                    {it.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img(it.image, 100, 100)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <IconComp size="46%" strokeWidth={1} color="rgba(255,255,255,0.85)" />
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: INK, fontFamily: SANS, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                    <div style={{ fontSize: 10, color: "#9A988E", marginTop: 2 }}>{itemKindOf(it.kind).label}{hasArea ? ` ・ ${it.area}` : ""}</div>
                  </div>
                  {hasArea && (
                    <a href={mapsUrl(`${it.area} ${it.title}`)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{
                      flexShrink: 0, padding: "6px 10px", borderRadius: 999, background: INK, color: PAPER, textDecoration: "none",
                      fontSize: 9.5, fontWeight: 700, fontFamily: SANS,
                    }}>地図</a>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={() => { onToggle(); requestClose(); }} style={{
            width: "100%", padding: "13px 0", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
            background: selected ? "transparent" : INK,
            color: selected ? RUST : PAPER,
            border: selected ? `1.5px solid ${RUST}` : "none",
          }}>{selected ? "選択を外す" : "これにする"}</button>
        </OverlayCard>
      )}
    </BottomSheet>
  );
}

// プランタブの選択画面。地図(場所が絡むItemのピン。ドメインを問わない)+
// 「今週のおすすめ・モノ・バショ・タイケン・ジョウホウ」の棚。棚の区分と
// 名称はストックタブ・アーカイブと共通の語彙(domainOf)にしている。
function MapPlanner({ stocked, draftSelection, onOpenPin, onToggleItem, onTogglePlan, onInjectDemo, bundlesAreNew }: {
  stocked: Item[];
  draftSelection: string[];
  onOpenPin: (item: Item) => void;
  onToggleItem: (item: Item) => void;
  onTogglePlan: (itemIds: string[]) => void;
  onInjectDemo: () => void;
  bundlesAreNew: boolean;
}) {
  const byNewest = (a: Item, b: Item) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
  // 地図に出るのは場所が絡むItemだけ(ドメインを問わない。位置情報の
  // 有無はドメインとは別軸)。
  const mapPool = stocked.filter(hasPlace);
  const byDomain = (d: ItemDomain) => stocked.filter((i) => domainOf(i) === d).slice().sort(byNewest);
  const plans = buildRecommendedPlans(mapPool);
  const [openPlanKey, setOpenPlanKey] = useState<string | null>(null);
  const openPlan = plans.find((p) => p.key === openPlanKey) ?? null;
  const [mapFullscreen, setMapFullscreen] = useState(false);
  // 地図がsticky状態(=上端に張り付いて止まっている)かどうかを、地図の
  // 直前に置いた高さ0のセンチネル要素で判定する。センチネルが
  // スクロールコンテナの上端から外へ出た瞬間=地図がまさにsticky top:0で
  // 張り付き始めた瞬間なので、そこで縮小アニメーションのトリガーにする
  // (センチネルとstickyの地図は隙間なく連続しているため、センチネルが
  // 見えなくなるタイミングと地図が止まるタイミングは一致する)。
  // useEffect+useRefではなくcallback refにしているのは、「Keepがまだ
  // ない」ときの早期returnがこのセンチネル自体をまだ描画しない(下の
  // stocked.length===0分岐)ため。useEffectを空配列依存にすると、
  // 最初のマウント時(センチネルがまだ存在しない=refがnull)の一度きりで
  // 観測を諦めてしまい、その後デモデータ投入等でセンチネルが実際に
  // 現れても二度と観測が始まらない不具合になっていた。callback refは
  // 依存配列を問わずDOMノードが実際にアタッチされた瞬間に呼ばれるため、
  // この早期returnの有無に関わらず確実に動く。
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [mapStuck, setMapStuck] = useState(false);
  const sentinelRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    const root = document.querySelector<HTMLElement>("[data-tab-scroll-root]");
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => setMapStuck(!entry.isIntersecting), { root, threshold: 0 });
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  if (stocked.length === 0) {
    return (
      <main style={{ padding: "48px 4px", textAlign: "center" }}>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 19, marginBottom: 10 }}>Keepが、まだありません。</div>
        <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.9, marginBottom: 22 }}>ブリーフでKeepするか、ストックタブの「モノ」「バショ」「タイケン」「ジョウホウ」から追加すると、ここに集まります。</p>
        <button onClick={onInjectDemo} style={{ padding: "13px 26px", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em" }}>デモ用データを投入</button>
      </main>
    );
  }

  const bottomPadding = draftSelection.length > 0 ? 96 : 24;
  const selectableCard = (i: Item) => (
    <SelectablePosterCard key={i.id} title={i.title} image={i.images?.[0]} color={i.color}
      sub={i.area && i.area !== "—" ? i.area : (i.creator || i.category || itemKindOf(i.kind).label)}
      icon={KIND_ICON[i.kind]} badge={originBadge(i.origin)}
      selected={draftSelection.includes(i.id)} onToggle={() => onToggleItem(i)} />
  );

  return (
    <main style={{ paddingTop: 14, paddingBottom: bottomPadding }}>
      {/* マップだけ画面上部に追従(sticky)させる。下の棚(今週のおすすめ・
          4ドメイン)をスクロールしても、地図は常に見える位置に留まり
          続けてほしいという要望に対応。topは0(=data-tab-scroll-rootの
          パディング内側の上端)でよい: スクロールコンテナ自体が既に
          安全域ぶんの上パディングを持っているため、地図はそこに正しく
          張り付く。zIndexは棚のカード(通常の書式優先度)より確実に手前に
          出るよう与えるが、nav(25)より低くして被らないようにする。
          全画面表示中は下のcreatePortalで別枠に描画するため、ここは
          非表示にする(sticky自身が新しい重なりコンテキストを作るため、
          中でposition:fixedにしてもnav(25)より手前に出せず、閉じる
          ボタンがnavに押されてクリックできなくなる不具合になっていた)。 */}
      <div ref={sentinelRef} style={{ height: 0 }} aria-hidden />
      <div style={{ position: "sticky", top: 0, zIndex: 4, visibility: mapFullscreen ? "hidden" : "visible" }}>
        <MapCanvas items={mapPool} selectedIds={draftSelection} onOpenPin={onOpenPin} stuck={mapStuck} onOpenFullscreen={() => setMapFullscreen(true)} />
      </div>
      {/* 全画面表示はAppShellの外(document.body直下)へPortalで描画し、
          祖先(sticky wrapper)の重なりコンテキストの影響を受けない、
          素のbodyレベルでのzIndex比較にする。開閉ともズームしながらの
          アニメーション付き(MapFullscreenOverlay内部)。 */}
      {mapFullscreen && typeof document !== "undefined" && createPortal(
        <MapFullscreenOverlay items={mapPool} selectedIds={draftSelection} onOpenPin={onOpenPin} onRequestClose={() => setMapFullscreen(false)} />,
        document.body
      )}
      <div style={{ height: 22 }} />
      {plans.length > 0 && (
        <HorizontalShelf title="今週のおすすめ" badge={bundlesAreNew ? "NEW" : undefined}>
          {plans.map((plan) => (
            <PlanEnvelope key={plan.key} plan={plan}
              selected={plan.itemIds.every((id) => draftSelection.includes(id))}
              onOpen={() => setOpenPlanKey(plan.key)}
              onToggle={() => onTogglePlan(plan.itemIds)} />
          ))}
        </HorizontalShelf>
      )}
      {ITEM_DOMAINS.map((d) => {
        const items = byDomain(d.id);
        return items.length > 0 && (
          <HorizontalShelf key={d.id} title={d.label}>
            {items.map(selectableCard)}
          </HorizontalShelf>
        );
      })}
      <PlanDetailSheet
        plan={openPlan}
        selected={openPlan ? openPlan.itemIds.every((id) => draftSelection.includes(id)) : false}
        onToggle={() => openPlan && onTogglePlan(openPlan.itemIds)}
        onClose={() => setOpenPlanKey(null)}
      />
    </main>
  );
}

interface ExecItem {
  id: string;
  kind: ItemKind;
  title: string;
  images?: string[];
  color?: string;
  categoryLabel: string;
  area?: string;
  meta?: string[];
  sourceUrl?: string;
  sourceLabel?: string;
  doneActionLabel: string;
  badge?: "keep" | "wish";
  done?: boolean;
}

// バインダー本体。見開きで開いて置いた状態を、2枚の平らなパネルとして
// 組み立てる: 右側(裏表紙側)はカードの束の真後ろに常に静止しており、
// 左側(表表紙)は登録前は画面の左へフラットに開いたまま(=画面の外へ
// 大きくはみ出して切れて見える)待機する。リング金具は実装してみたが
// 「無理そう」という判断で見送り、穴の装飾(PunchHoles)だけのシンプルな
// 見開きに戻した。そのため左右の余白は再び対称(BINDER_MARGIN)に戻している。
// バインド！を押すと、束の一番上に来た表表紙が、自分の右端(=裏表紙側
// パネルに接する蝶番)を軸にrotateYで0度→180度まで回り込み、束の真上に
// ぴったり重なって閉じる。蝶番を右端に固定したまま回すことで、中間角度
// (90度前後)ではパネルの自由端(左端)がパースペクティブにより一瞬手前
// (視聴者側)へせり出して見え、「表紙が画面手前に飛び出してから束の上に
// パタンと閉じる」という動きになる。
// 「奥まって見える/浮いて見える」という指摘を受け、パネル自体の
// box-shadowは廃止した(カード自身のSOFT_SHADOW_LGだけが束全体の
// 立体感を担う)。縁取り(ヘアライン)は、蝶番でぴったり接している辺
// (裏表紙側の左端・表表紙側の右端)には付けず、そこ以外の外周だけに
// 付けることで、2枚が継ぎ目なく1冊に繋がって見えるようにしている。
//
// 裏表紙(BinderBackPanel)と表表紙(BinderFrontCover)は、以前は1つの
// perspectiveラッパーの中の兄弟同士としてまとめ、表表紙側だけをzIndexで
// 上に乗せる作りだった。しかしperspectiveを持つ要素はそれ自体が新しい
// 重なりコンテキスト(stacking context)を作ってしまうため、その内側で
// 付けたzIndex:30は「兄弟のConfirmedCard」とは比較されず、DOM順で後に
// 来るConfirmedCardの方が常に手前に描かれてしまっていた
// (表紙が閉じるアニメーションは動くのに、カードが最前面に表示され続けて
// 「本が閉じた」ように見えない不具合の原因)。表表紙(BinderFrontCover)を
// ConfirmedCardより後のDOM順で描画される独立した要素に分離することで、
// 特別なzIndexの調整をしなくても自然に「開いている間はカードの外(左)に
// あるので隠れず、回転してカードの真上に重なる頃には既にDOM順で手前」
// という正しい重なりになる。
const BINDER_MARGIN_TB = 9;
const BINDER_MARGIN_RIGHT = 9;
const BINDER_MARGIN_LEFT = 9;

// 裏表紙側。束の真後ろに固定し、開閉では一切動かない。ConfirmedCardより
// 先にDOM上へ置くことで、常にカードの下に隠れる(余白の外周だけが覗く)。
function BinderBackPanel() {
  return (
    <div style={{
      position: "absolute", top: -BINDER_MARGIN_TB, right: -BINDER_MARGIN_RIGHT, bottom: -BINDER_MARGIN_TB, left: -BINDER_MARGIN_LEFT,
      background: PAPER, overflow: "hidden", pointerEvents: "none",
      borderTopRightRadius: COVER_RADIUS, borderBottomRightRadius: COVER_RADIUS,
      borderTop: `1px solid ${HAIRLINE}`, borderRight: `1px solid ${HAIRLINE}`, borderBottom: `1px solid ${HAIRLINE}`,
    }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(100deg, rgba(28,28,30,0.07) 0%, rgba(28,28,30,0) 34%)" }} />
    </div>
  );
}

// 表表紙側。閉じるまでは画面左へフラットに開いたまま、右端(蝶番)を軸に
// 回転して閉じる。backfaceVisibilityは意図的に指定しない(裏返る後半でも
// 消えず、束の上に居座って覆い隠し続けるため)。perspectiveを浅くしている
// のは、閉じる途中(90度前後)で紙が画面手前へ迫り出す視差をはっきり感じ
// させるため。ConfirmedCardより後のDOM順で描画することで、閉じ終わった
// ときに自然にカードの手前へ重なる(詳細は上のコメント参照)。
function BinderFrontCover({ closed, width, aspect }: { closed: boolean; width: number; aspect: string }) {
  const outerWidth = width + BINDER_MARGIN_LEFT + BINDER_MARGIN_RIGHT;
  // aspectRatioで高さを逆算せず、裏表紙側と必ず同じ高さになるよう明示的に
  // 計算する。以前はここもaspectRatioに任せていたが、表表紙の幅
  // (outerWidth、左右マージン込み)にaspect比をそのまま掛けると、上下
  // マージン(BINDER_MARGIN_TB)ぶんだけ裏表紙側の実際の高さとズレてしまい、
  // 閉じ終わったときに束の上端(または下端)がわずかに覆いきれず、カードが
  // 角にはみ出して見える不具合の原因になっていた。
  const [aspNum, aspDen] = aspect.split("/").map((s) => parseFloat(s.trim()));
  const cardHeight = width * (aspDen / aspNum);
  const outerHeight = cardHeight + BINDER_MARGIN_TB * 2;
  return (
    <div style={{
      position: "absolute", top: -BINDER_MARGIN_TB, left: -BINDER_MARGIN_LEFT - outerWidth, width: outerWidth, height: outerHeight,
      perspective: 900, pointerEvents: "none", zIndex: closed ? 30 : 0,
    }}>
      <div style={{
        position: "absolute", inset: 0, transformOrigin: "100% 50%",
        transform: `rotateY(${closed ? 180 : 0}deg)`,
        transition: "transform 0.34s cubic-bezier(0.45,0,0.2,1)",
      }}>
        <div style={{
          position: "absolute", inset: 0, background: PAPER, overflow: "hidden",
          borderTopLeftRadius: COVER_RADIUS, borderBottomLeftRadius: COVER_RADIUS,
          borderTop: `1px solid ${HAIRLINE}`, borderLeft: `1px solid ${HAIRLINE}`, borderBottom: `1px solid ${HAIRLINE}`,
        }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(260deg, rgba(28,28,30,0.07) 0%, rgba(28,28,30,0) 34%)" }} />
        </div>
      </div>
    </div>
  );
}

// ブリーフタブのカード(上部が写真、下部が白背景の説明)と統一したデザイン。
// 角丸も他のタブのカード(PosterCardなど)と同じく四隅とも丸める。以前は
// バインダーの表紙面に合わせて開く側(右)だけを丸めていたが、「カードの
// デザインは他のタブと共通にしてほしい、以前の方が良かった」という指摘を
// 受けて元の四隅丸めに戻した。バインダー側の角丸は変えず(BinderBackPanel/BinderFrontCover、
// 開く側だけを丸めた表紙らしい形のまま)、あくまでカード自体だけを他の
// アイテムカードと揃える。パンチ穴は他のタブと同じPunchHoles(common.tsx)
// を使い、位置・見た目を揃えている。穴はカード全体の左端を通しで貫くため、
// 下の白い説明エリアの文字はHOLE_CLEAR分だけ右にずらして穴と重ならない
// ようにしている。下部には地図と(あれば)公式サイトへのリンクを置く。
// 地図リンクは、情報ソースが既にGoogleマップへのURLならそれをそのまま
// 使い、そうでなければ場所名からその場で生成する。
function ExecCardFace({ item, onMarkDone }: { item: ExecItem; onMarkDone: () => void }) {
  const IconComp = KIND_ICON[item.kind];
  const fill = item.color ?? "#5A5A54";
  const hasPhoto = (item.images?.length ?? 0) > 0;
  const isMapsSource = !!item.sourceUrl && item.sourceUrl.includes("google.com/maps");
  // 地図リンクは「行く」が絡むもの(=エリアを持つもの)にだけ出す。場所を
  // 持たない作品・モノに地図を出しても行き先がない。
  const mapsHref = item.area && item.area !== "—"
    ? (isMapsSource ? item.sourceUrl : mapsUrl(`${item.area} ${item.title}`))
    : undefined;
  const officialHref = item.sourceUrl && !isMapsSource ? item.sourceUrl : undefined;

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%", background: PAPER, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: SOFT_SHADOW_LG,
      borderRadius: 18,
    }}>
      <div style={{ position: "relative", flex: "0 0 52%", overflow: "hidden", background: fill }}>
        {hasPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img(item.images![0], 400, 320)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : IconComp ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IconComp size="34%" strokeWidth={1} color="rgba(255,255,255,0.85)" />
          </div>
        ) : null}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0) 40%)", pointerEvents: "none" }} />
        {item.badge && (
          <span style={{ position: "absolute", top: 10, left: HOLE_CLEAR, display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(255,255,255,0.94)", color: INK, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.04em", borderRadius: 999, padding: "3.5px 9px 3.5px 7px" }}>
            <Bookmark size={10} fill={INK} strokeWidth={0} /> {item.badge === "wish" ? "WISH" : "KEEP"}
          </span>
        )}
        {/* サイズは左上のKEEP/WISHバッジの高さ(フォント8.5+上下パディング3.5px
            ずつ、目安22px)に揃えている。以前は32pxで、バッジより明らかに
            大きく見えていた。 */}
        <button onClick={(e) => { e.stopPropagation(); if (!item.done) onMarkDone(); }} aria-label={item.done ? "完了ずみ" : item.doneActionLabel} style={{
          position: "absolute", top: 10, right: 10, width: 22, height: 22, borderRadius: "50%", border: "none", cursor: item.done ? "default" : "pointer", padding: 0,
          background: item.done ? GREEN : "rgba(255,255,255,0.92)", color: item.done ? "#fff" : "#3A3A36",
          display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 8px rgba(28,28,30,0.28)",
        }}><Check size={12} strokeWidth={3} /></button>
        {item.done && <div style={{ position: "absolute", inset: 0, background: "rgba(28,28,30,0.4)", pointerEvents: "none" }} />}
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: "11px 14px 12px", paddingLeft: HOLE_CLEAR, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, flexShrink: 0 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#5A5A54", flexShrink: 0 }} />
          <span style={{ fontSize: 8.5, color: "#5A5A54", fontWeight: 700, letterSpacing: "0.05em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.categoryLabel}{item.area && item.area !== "—" ? ` ・ ${item.area}` : ""}</span>
        </div>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13, lineHeight: 1.35, color: INK, marginBottom: "auto", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title}</div>
        {(mapsHref || officialHref) && (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexShrink: 0 }}>
            {mapsHref && (
              <a href={mapsHref} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} style={{ flex: 1, textAlign: "center", padding: "7px 0", borderRadius: 999, background: INK, color: PAPER, textDecoration: "none", fontSize: 9.5, fontWeight: 700, fontFamily: SANS }}>地図</a>
            )}
            {officialHref && (
              <a href={officialHref} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} style={{ flex: 1, textAlign: "center", padding: "7px 0", borderRadius: 999, background: INK, color: PAPER, textDecoration: "none", fontSize: 9.5, fontWeight: 700, fontFamily: SANS }}>サイト</a>
            )}
          </div>
        )}
      </div>
      <PunchHoles />
    </div>
  );
}

// 実行タブの確定後の1枚のカード。右にスワイプすると背後に「外す」の下地が
// 現れ、閾値を超えて離すとカードが右へ飛んでリストから外れる。行った/観た
// は右上のチェックで個別にマークでき、外すとは独立した状態として残る。
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
  const dragRef = useRef({ startX: 0, active: false });

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || removing) return;
    dragRef.current = { startX: e.clientX, active: true };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  // touchAction:"pan-y"により、縦方向のドラッグはブラウザ標準のスクロールに
  // 任せ、横方向だけこのハンドラでdxを追う。以前は最初の数px移動が縦方向
  // 寄りだと判定した瞬間にdragRef.active=falseへ倒し、以後ずっとその
  // フラグを見て即returnしていたため、指が斜めに動き始めただけで残りの
  // 横スワイプが二度と拾われず「右スワイプで外せない」不具合になっていた。
  // pan-yがすでにブラウザ側で縦/横を仕分けているので、JS側では単純にdxだけ
  // 追えば十分。
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    if (!dragging && Math.abs(dx) > 4) setDragging(true);
    setDragX(Math.max(0, dx));
  };
  const finish = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
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
        position: "absolute", inset: 0, background: RUST, borderRadius: 18,
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
        <ExecCardFace item={item} onMarkDone={onMarkDone} />
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
// 確定カード自体の幅。以前はコンテナいっぱい(最大380px)に広げていたが、
// 大きすぎるという指摘を受け、1枚1枚をぐっと小さくした。パンチ穴・
// KEEPバッジのサイズはこのCARD_WIDTHを基準に決めているため、ここを変えれば
// バインダー(BinderFrontCover、widthをそのまま渡している)も含めて一括で
// 比率が揃う。
const CARD_WIDTH = 220;
// BinderBackPanel/BinderFrontCoverをカードの重なり順から切り離して
// 独立に絶対配置するための、item[0]と同じ高さ(下記参照)。
const [CONFIRMED_ASP_NUM, CONFIRMED_ASP_DEN] = ITEM_CARD_ASPECT.split("/").map((s) => parseFloat(s.trim()));
const CARD_HEIGHT = CARD_WIDTH * (CONFIRMED_ASP_DEN / CONFIRMED_ASP_NUM);
const STACK_MS = 420;
const CLOSE_MS = 320;
const FALL_MS = 420;

// 慣性スクロール中でも確実にscrollTopを0へ戻すヘルパー。overflow-yを
// 一瞬hiddenにしてから戻すことで、iOS Safariの慣性スクロール(momentum
// scroll)の物理演算を打ち切ってからscrollTopを書き換える。ただ
// scrollTo/scrollTopを呼ぶだけだと、指を離した直後の慣性が効いている
// 最中はブラウザ側がその直後に上書きしてしまい、結局スクロールした
// ままになる。
// 対象の要素はoverflowYをReactのstyle propで管理しているため、ここでは
// ショートハンドのstyle.overflowではなく、必ず同じロングハンドの
// style.overflowYだけを操作する。ショートハンドで一度hiddenにしてから
// 空文字で「戻した」つもりでも、ショートハンドの空文字代入はoverflow-x/
// overflow-yのインライン指定を丸ごと消してしまい、Reactは直前の
// レンダーと今回のstyleオブジェクトの値(例えば"auto")が変わっていない
// ため再設定をスキップする。結果、DOM上はoverflow-y:visible(初期値)の
// ままになり、以後そのコンテナが二度とスクロールできなくなる不具合に
// なっていた。戻す先を「空」ではなく、実際に静止状態で使われている値
// ("auto")へ明示的に戻すことで、Reactの差分検知に依存せず確実に
// 元の状態へ復元する。
function killMomentumScroll(el: HTMLElement | null) {
  if (!el) return;
  el.style.overflowY = "hidden";
  el.scrollTop = 0;
  el.style.overflowY = "auto";
}

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

  // バインドボタンはどこからでも押せる固定位置にあるため、リストを
  // 下の方までスクロールした状態で押すと、スタック先である先頭カードが
  // 画面外(上)にあり、以降のスタック/閉じる/落ちるのアニメーションが
  // すべて見えない場所で起きてしまっていた。押した瞬間にまずページを
  // 先頭へ戻し(「カメラ」を追従させ)、そのあとで各カードの位置を
  // 測ってアニメーションを組み立てる。このリストは他のタブと同じ
  // AppShellの共有スクロールコンテナ([data-tab-scroll-root])に乗って
  // いる(専用のスクロール領域は持たない)ため、対象はそちらになる。
  const handleRegister = () => {
    if (registerPhase || items.length === 0) return;
    haptic(16);
    const root = document.querySelector<HTMLElement>("[data-tab-scroll-root]");
    killMomentumScroll(root);
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
      {/* 以前はこのリスト自身が専用のoverflow-y:autoスクロール領域を持ち、
          外側(data-tab-scroll-root)をロックしてMasthead・「選び直す」を
          常時固定表示させていた。ユーザーからの指摘により撤回: 他のタブは
          すべてMasthead込みで外側の一枚のスクロールに乗っており、下まで
          スクロールすればカードが画面の一番上まで届く。この入れ子スクロール
          構成だけがその挙動と違い、ヘッダーの下で境目ができてカードが
          見切れて見える原因になっていた。他タブと同じくAppShellの共有
          スクロールに乗るだけの、ただのブロックにする。 */}
      <div
        style={{
          ...(falling ? { transform: "translateY(60%)", opacity: 0, transition: `transform ${FALL_MS}ms cubic-bezier(0.55,0,1,0.45), opacity ${FALL_MS - 40}ms ease-in` } : {}),
        }}
      >
        <div style={{ width: "100%", maxWidth: CONFIRMED_MAX_WIDTH, margin: "0 auto", padding: `6px 16px calc(${NAV_OFFSET} + 92px)` }}>
          <div style={{ fontSize: 10, letterSpacing: "0.16em", color: "#9A988E", fontWeight: 700, margin: "8px 2px 16px" }}>{dateLabel} ・ {items.length}件</div>
          {/* カード自身はスタック先の座標へ移動するだけで、回転はさせない。
              「閉じる」動きはカードではなく、常に先頭カードの背後・手前にいる
              裏表紙(BinderBackPanel)・表表紙(BinderFrontCover)が担う。
              スタックが揃ったところへ表表紙がclosed=trueで束の真上へ
              回り込みながら閉じてくることで、「画面左に開いていた表紙が、
              積み上がったカードの上にパタンと閉じてくる」動きになる。
              裏表紙・表表紙は、下記カードの重なり順(iに応じてスタック中
              どんどん手前に重なっていく)とは完全に独立させ、mapの外に
              絶対配置している。以前はi===0のカードと同じラッパーに同居
              させていたため、「表表紙は常に最前面でなければならない」
              という制約と「カードの重なり順はiに応じて決まる(かつては
              i===0を特別扱いしていた)」という制約が同じzIndexの値を
              取り合ってしまい、どちらか一方を満たすと他方が崩れる状態に
              なっていた。position:relativeにしたこの外側の入れ物を
              基準に、item[0](常に動かない=offset0の位置)と同じ大きさの
              箱をtop:0に絶対配置することで、カードの重なり順に一切
              左右されない専用のレイヤーにした。 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, position: "relative" }}>
            <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: CARD_WIDTH, height: CARD_HEIGHT, zIndex: 0, pointerEvents: "none" }}>
              <BinderBackPanel />
            </div>
            {items.map((it, i) => (
              // 下からスライドしてくるカードが、既にスタックされている
              // カード(先頭カードも含む)の上へどんどん重なっていくように、
              // iが大きい(元々リストの下の方にあった)ほど手前(高いzIndex)
              // にする。指定しないとflexの子はDOM順で後勝ちになり、意図と
              // 違う重なりになる。
              // stackTransformはtranslateYのみ(縮小=scaleはしない)。下の
              // カードが上のカードに隠れて見えなくなること自体は構わない、
              // という指定。
              <div key={it.id} style={{ position: "relative", width: CARD_WIDTH, zIndex: i + 1 }}>
                <ConfirmedCard
                  item={it} elRef={(el) => { cardEls.current[it.id] = el; }}
                  stackTransform={stacking ? `translateY(${stackOffsets[it.id] ?? 0}px)` : undefined}
                  hide={falling}
                  disabled={stacking}
                  onMarkDone={() => onMarkDone(it)}
                  onRemove={() => onDrop(it)}
                />
              </div>
            ))}
            <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: CARD_WIDTH, height: CARD_HEIGHT, zIndex: items.length + 2, pointerEvents: "none" }}>
              <BinderFrontCover closed={closed} width={CARD_WIDTH} aspect={ITEM_CARD_ASPECT} />
            </div>
          </div>
        </div>
      </div>
      {/* 以前はリスト末尾に普通に流れる要素として置いていたが、それだと
          一番下までスクロールしないと押せず「どこでも押せるように」という
          要望に反していた。画面下に常時浮かせる固定ボタンに戻す。 */}
      {!stacking && typeof document !== "undefined" && createPortal(
        // zIndexはnav(25)より高くしておく。以前は20(グラデーションの15より
        // 上)にしていたが、nav自体のピルの影(box-shadow)がわずかに滲んで
        // ボタンの下端にnavの半透明なマスクがかかったように見える不具合が
        // あった。バインド！はどこからでも押せる主要な操作なので、navより
        // 常に手前に出すことで境目のにじみごと解消する。
        // zIndexの数字を上げるだけでは実機Safariで直らなかった。このボタンは
        // AppShellの`key={tab}`配下(タブ切替のたびに作り直される内側の
        // コンテナ)に生えているため、その祖先のどこかが(想定していない
        // 形で)新しい重なりコンテキストを作ってしまうと、内側でzIndexを
        // どれだけ上げてもnav手前のグラデーションより手前に出せなくなる。
        // createPortalでdocument.body直下(=AppShellの外)へ描画先を移すことで、
        // 祖先の重なりコンテキストの影響を一切受けない、素のbodyレベルでの
        // zIndex比較にする。他のフローティングUI(PlanSelectionBarのバインド！等、
        // 元々AppShellの最上位に直接置かれているため今回の不具合が出ていない
        // もの)と同じ土俵に立たせる、というのがこの変更の意図。
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 26, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          {/* navより上に浮かせる分の余白はpaddingではなくmarginで確保する。
              pointerEvents:"auto"の要素はpadding込みのボーダーボックス全体が
              クリック判定の対象になるため、以前のようにpadding-bottomで
              navぶんの隙間を空けると、見た目には何も無いその余白部分が
              実はnavの上に覆いかぶさってクリックを奪ってしまっていた
              (zIndexの不具合修正でこのボタンが正しくnavより手前に出る
              ようになったことで、隠れていたこの重なりが顕在化した)。
              marginは判定対象に含まれないため、同じ見た目のままnavの
              タップを奪わなくなる。 */}
          <div style={{ width: "100%", maxWidth: CONFIRMED_MAX_WIDTH, padding: "0 16px", marginBottom: `calc(${NAV_OFFSET} + 8px)`, pointerEvents: "auto" }}>
            <button onClick={handleRegister} style={{
              width: "100%", padding: "15px 0", background: INK, color: PAPER, border: "none", borderRadius: 999,
              cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", boxShadow: SOFT_SHADOW_LG,
            }}>
              バインド！
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function ExecuteTab({ appState, persist, goTab, profileButton, selection, toggleItemSelection, addItemIds, setSelection, execMapMode: mapMode, setExecMapMode: setMapMode }: TabProps) {
  const magazine = appState.magazine;
  // mapMode(バインダー確定後でも地図に戻って選び直すときtrue)はAppShellへ
  // 引き上げた(execMapMode)。外側のタブスクロールコンテナをロックすべきか
  // どうかの判断にAppShell側でも必要になったため(AppShell.tsxの
  // scrollLockedのコメント参照)。このタブ内では従来どおりmapMode/
  // setMapModeという名前のまま使い、既存コードとの差分を最小にしている。
  const [pinItem, setPinItem] = useState<Item | null>(null);
  // 選択状態はAppShellへ引き上げ、ストックタブと共有している(タブを
  // 跨いでバインド候補を選べるようにするため)。draftSelectionという名前は
  // このタブ内での既存コードとの差分を最小にするため残しているが、実体は
  // lib配下から渡される共有state。
  const draftSelection = selection.itemIds;

  // 「選び直す」で地図に戻り、選択を編集してもう一度バインド！を押した
  // ときの不具合対策。バインド！(AppShellのbindSelection)はappStateを
  // 更新するだけで、既にexecuteタブにいる場合はsetTab("execute")が
  // no-opになりこのコンポーネントは再マウントされない。そのためmapMode
  // (このコンポーネント内のローカルstate)がtrueのまま残り、マガジンは
  // 裏で正しく更新されているのに画面はずっと地図のまま=「変更したのに
  // 何も起きていないように見える」不具合になっていた。マガジンが実際に
  // (再)確定された(decidedAtが変わった)ら、地図モードを強制的に閉じて
  // 更新後の確定ビューへ戻す。
  useEffect(() => {
    setMapMode(false);
  }, [magazine?.decidedAt, setMapMode]);

  const showMap = !magazine || mapMode;
  // 地図・棚に出すのはストックの候補(candidate)だけ。バインド！済み
  // (planned)のカードは「今日のバインダーに綴じた」ものなので、ストック
  // タブと同様ここにも出さない(以前はstatus !== "done"で絞っており、
  // planned=バインド済みのカードが地図と棚に残り続けていた。これは
  // 「実行済み＝バインドしたカードはプランからも消える」というユーザーの
  // 意図に反する誤実装だった。HANDOFF-CURRENT.md §7.8参照)。
  // 唯一の例外は「選び直す」で今日のバインダーを開き直している間:
  // 綴じてあるカード自体を地図上で外したり入れ替えたりする必要がある
  // ため、現在のmagazineに綴じられているものに限って表示する。
  // 棚の区分(モノ・バショ・タイケン・ジョウホウ)はMapPlanner側で
  // domainOfを使って振り分ける。
  const stocked = appState.items.filter((i) =>
    i.status === "candidate" || (i.status === "planned" && !!magazine && magazine.itemIds.includes(i.id)));
  const magItems: ExecItem[] = magazine ? magazine.itemIds
    .map((id): ExecItem | null => {
      const item = appState.items.find((x) => x.id === id);
      if (!item) return null;
      return {
        id: item.id, kind: item.kind, title: item.title, images: item.images, color: item.color,
        categoryLabel: item.category ?? itemKindOf(item.kind).label, area: item.area,
        meta: [...(item.meta ?? []), ...(item.creator ? [item.creator] : [])],
        sourceUrl: item.sourceUrl, sourceLabel: item.sourceLabel,
        doneActionLabel: itemKindOf(item.kind).doneActionLabel,
        badge: originBadge(item.origin), done: item.status === "done",
      };
    })
    .filter((x): x is ExecItem => !!x) : [];

  const currentBundleWeek = mostRecentThursday();
  const bundlesAreNew = (appState.weekendMeta?.lastSeenBundleWeek ?? null) !== currentBundleWeek;

  useEffect(() => {
    if (!showMap || !bundlesAreNew || stocked.length === 0) return;
    const t = setTimeout(() => {
      const next = structuredClone(appState);
      next.weekendMeta = { ...(next.weekendMeta ?? {}), lastSeenBundleWeek: currentBundleWeek };
      persist(next);
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap, bundlesAreNew, currentBundleWeek, stocked.length]);

  const toggleDraftItem = (item: Item) => toggleItemSelection(item.id);
  // モデルプラン(複数の行き先をまとめたエンベロープ)は、中の全件がすでに
  // 選択済みなら丸ごと外し、そうでなければ丸ごと追加する。1件ずつの
  // toggleItemSelectionではなく「全部入り/全部無し」の2状態だけを扱う。
  const toggleDraftPlan = (itemIds: string[]) => {
    const allSelected = itemIds.every((id) => draftSelection.includes(id));
    if (allSelected) {
      setSelection({ itemIds: draftSelection.filter((id) => !itemIds.includes(id)) });
    } else {
      addItemIds(itemIds);
    }
  };

  const removeFromMagazine = (id: string) => {
    const next = structuredClone(appState);
    next.magazine!.itemIds = next.magazine!.itemIds.filter((x) => x !== id);
    const item = next.items.find((x) => x.id === id);
    if (item && item.status === "planned") item.status = "candidate";
    if (next.magazine!.itemIds.length === 0) next.magazine = null;
    persist(next);
  };
  // 行った/観たにしても、ボードからはすぐには消さない。itemIdsはそのまま
  // 残し、状態をdoneにするだけにして、カード側でグレーアウト表示にする
  // ことで「今日やったこと」がその場に積み上がって見えるようにしている。
  // Itemの統一により、以前あった「場所のKeepを実行すると作品のコピーを
  // records.mediaへ複製する」変換は不要になった(1つのItemが種類と場所の
  // 両方を持つので、doneにするだけでアーカイブの作品棚にも行き先棚にも立つ)。
  const markDoneInMagazine = (id: string) => {
    haptic(14);
    const next = structuredClone(appState);
    const item = next.items.find((x) => x.id === id);
    if (item) {
      item.status = "done";
      item.doneAt = new Date().toISOString();
    }
    persist(next);
  };
  // 確定ビューの「バインド！」= 今日のバインダーを綴じて実行済みとして
  // 確定する操作。綴じられた全カードはdoneになり、アーカイブのバインダー
  // 棚・日付ビューへまとめて移る。doneになるのでストック/プランの候補
  // からは完全に消える。
  // 以前は正反対の実装(「まだdoneでないItemはcandidateへ戻す」)だった。
  // これは「バインダーに残った=行かなかった候補はストックへ差し戻す」
  // という誤った仕様理解によるもので、ユーザーの意図(バインド！=実行
  // 済みの確定。カードはアーカイブへ綴じられ、ストック/プランから消える)
  // と真逆の挙動になっており、「バインドしたカードがストックに何度でも
  // 復活する」という長引いた不具合の真の根本原因だった(HANDOFF-
  // CURRENT.md §7.8参照)。
  const registerBinder = () => {
    const next = structuredClone(appState);
    const boundAt = new Date().toISOString();
    // このバインドで実際にdoneへ変わったItemだけをログへ記録する
    // (プロフィール(設定)画面から確認・元に戻せるようにするため)。
    // タイトル等もスナップショットしておくので、後でItem自体が削除
    // されてもログの表示は壊れない。
    const boundItems: typeof next.bindLog[number]["items"] = [];
    (next.magazine?.itemIds ?? []).forEach((id) => {
      const item = next.items.find((x) => x.id === id);
      if (item && item.status !== "done") {
        item.status = "done";
        item.doneAt = boundAt;
        boundItems.push({ id: item.id, title: item.title, kind: item.kind, color: item.color, images: item.images });
      }
    });
    if (boundItems.length > 0) {
      next.bindLog = next.bindLog ?? [];
      next.bindLog.unshift({ id: `bindlog-${Date.now()}`, boundAt, items: boundItems, undone: false });
    }
    next.magazine = null;
    persist(next);
    setMapMode(false);
    goTab("records");
  };
  // 場所のKeepだけでなく、作品(メディア)・ウィッシュリスト・目標も
  // まとめて投入する。地図(場所)だけ投入してもストック/ゴールタブは
  // 空のままでテストしづらいため、アプリ全体を一度に試せる分量にしている。
  // アーカイブタブの棚は「実行済み(done)」しか並ばないため、バインダーが
  // 何冊も、しかも厚みの違いも含めて並んだ様子を最初から見られるよう、
  // ほとんどの場所・メディアをdone状態(日付をずらして)で投入し、
  // 地図での選び直しを試せる分だけ候補(candidate/keep)を残す。
  const injectDemo = () => {
    const next = structuredClone(appState);
    const now = Date.now();
    // まずウィッシュ(自由文の願い)を投入する。ブリーフのダミーカードの
    // sourceWishTitleと同じ文面を含めることで、ブリーフでKEEPした時に
    // origin:"wish"のItemが実際に生まれる流れを試せる。カテゴリーは
    // 願いの究極の対象物(モノ/バショ/タイケン/ジョウホウ)で振り分ける。
    const demoWishes = ([
      ["安藤忠雄の建築を観る", "experience"], ["浅煎りの豆を買う", "thing"], ["古着でジャケットを探す", "thing"],
      ["サウナを開拓する", "experience"], ["もっと歩く", "place"], ["フィルムカメラを買う", "thing"],
      ["陶芸をはじめる", "experience"], ["秋に一人旅へ行く", "place"],
    ] as [string, ItemDomain][]).map(([title, category], i) => ({
      id: `demo-wish-${now}-${i}`, title, category, status: "stock" as const, addedAt: new Date(now - i * 86400000).toISOString(),
    }));
    next.wishes.push(...demoWishes);

    // Itemは1つの配列に統一。kindで種類(place/作品系/thing)、areaの有無で
    // 「行くが絡むか」を表す(新作映画=movie+area、旧作映画=movieのみ、
    // そこでしか買えないモノ=thing+area、など)。
    const demo: { kind: ItemKind; title: string; category?: string; area?: string; creator?: string; price?: string; images?: string[]; sourceUrl?: string; sourceLabel?: string; meta?: string[]; done: boolean }[] = [
      { kind: "exhibition", title: "「建築と自然」展を観る", category: "展覧会", area: "竹橋", images: ["momat-a", "momat-b"], sourceUrl: "https://www.momat.go.jp/", sourceLabel: "公式サイトを見る", meta: ["国立近代美術館", "10:00–17:00", "¥1,800"], done: true },
      { kind: "exhibition", title: "竹橋のギャラリーで版画展を観る", category: "展覧会", area: "竹橋", images: ["print-a", "print-b"], sourceUrl: mapsUrl("竹橋 ギャラリー"), sourceLabel: "地図で見る", meta: ["竹橋"], done: true },
      { kind: "place", title: "神保町の古書店街を歩く", category: "近所の発見", area: "神保町", images: ["books-a", "books-b"], sourceUrl: mapsUrl("神保町 古書店街"), sourceLabel: "地図で見る", meta: ["神保町"], done: true },
      { kind: "exhibition", title: "神保町の器店、作家の個展", category: "雑貨", area: "神保町", images: ["books-c"], sourceUrl: mapsUrl("神保町 器 個展"), sourceLabel: "地図で見る", meta: ["神保町", "会期は今月いっぱい"], done: true },
      { kind: "place", title: "喫茶店でゆっくり読書する", category: "近所の発見", area: "神保町", images: ["kissa-a"], sourceUrl: mapsUrl("神保町 純喫茶"), sourceLabel: "地図で見る", meta: ["神保町"], done: false },
      { kind: "place", title: "日比谷公園を散歩する", category: "身体", area: "日比谷", images: ["hibiya-park-a"], sourceUrl: mapsUrl("日比谷公園"), sourceLabel: "地図で見る", meta: ["日比谷公園"], done: true },
      { kind: "place", title: "日比谷のミッドセンチュリー家具店", category: "雑貨", area: "日比谷", images: ["furniture-a"], sourceUrl: mapsUrl("日比谷 家具店"), sourceLabel: "地図で見る", meta: ["日比谷"], done: false },
      { kind: "place", title: "谷根千の坂道を散歩する", category: "身体", area: "谷根千", images: ["zakka-a", "zakka-b"], sourceUrl: mapsUrl("谷根千 散歩コース"), sourceLabel: "地図で見る", meta: ["谷根千エリア"], done: true },
      { kind: "place", title: "谷中の陶器市を覗く", category: "雑貨", area: "谷根千", images: ["zakka-c"], sourceUrl: mapsUrl("谷中 陶器市"), sourceLabel: "地図で見る", meta: ["谷中エリア", "会期は今週末まで"], done: true },
      { kind: "place", title: "谷根千の純喫茶でひと休み", category: "近所の発見", area: "谷根千", images: ["kissa-b"], sourceUrl: mapsUrl("谷根千 純喫茶"), sourceLabel: "地図で見る", meta: ["谷根千エリア"], done: true },
      { kind: "place", title: "浅草橋のボルダリングジムへ", category: "身体", area: "浅草橋", images: ["climb-a", "climb-b"], sourceUrl: mapsUrl("浅草橋 ボルダリングジム"), sourceLabel: "地図で見る", meta: ["浅草橋駅から徒歩6分"], done: true },
      { kind: "place", title: "浅草橋の手芸問屋街を歩く", category: "雑貨", area: "浅草橋", images: ["zakka-d"], sourceUrl: mapsUrl("浅草橋 問屋街"), sourceLabel: "地図で見る", meta: ["浅草橋"], done: false },
      { kind: "place", title: "蔵前の焙煎所で豆を買う", category: "近所の発見", area: "蔵前", images: ["kuramae-a", "kuramae-b"], sourceUrl: mapsUrl("COFFEE WRIGHTS 蔵前"), sourceLabel: "地図で見る", meta: ["COFFEE WRIGHTS", "9:00–18:00"], done: true },
      { kind: "place", title: "銭湯サウナを開拓する", category: "未知との遭遇", area: "蔵前", images: ["sauna-a", "sauna-b"], sourceUrl: mapsUrl("蔵前 銭湯"), sourceLabel: "地図で見る", meta: ["蔵前"], done: true },
      { kind: "place", title: "蔵前のレザー工房を覗く", category: "雑貨", area: "蔵前", images: ["leather-a"], sourceUrl: mapsUrl("蔵前 レザー工房"), sourceLabel: "地図で見る", meta: ["蔵前"], done: true },
      { kind: "exhibition", title: "『大工の技術史』展を観る", category: "展覧会", area: "両国", images: ["carpentry-a", "carpentry-b"], sourceUrl: mapsUrl("江戸東京博物館"), sourceLabel: "公式サイトを見る", meta: ["江戸東京博物館"], done: true },
      { kind: "place", title: "両国国技館のまわりを歩く", category: "身体", area: "両国", images: ["ryogoku-a"], sourceUrl: mapsUrl("両国国技館"), sourceLabel: "地図で見る", meta: ["両国"], done: false },
      { kind: "place", title: "清澄白河で陶芸体験をする", category: "未知との遭遇", area: "清澄白河", images: ["pottery-a", "pottery-b"], sourceUrl: mapsUrl("清澄白河 陶芸体験"), sourceLabel: "地図で見る", meta: ["清澄白河・陶房"], done: true },
      { kind: "place", title: "清澄白河のロースタリー巡り", category: "近所の発見", area: "清澄白河", images: ["kiyosumi-a"], sourceUrl: mapsUrl("清澄白河 ロースタリー"), sourceLabel: "地図で見る", meta: ["清澄白河"], done: true },
      { kind: "place", title: "高円寺の古着屋を覗く", category: "古着", area: "高円寺", images: ["vintage-a", "vintage-b"], sourceUrl: mapsUrl("高円寺 古着屋"), sourceLabel: "地図で見る", meta: ["高円寺北口エリア"], done: true },
      { kind: "place", title: "高円寺の古着市、大型セール", category: "古着", area: "高円寺", images: ["vintage-c"], sourceUrl: mapsUrl("高円寺 古着 セール"), sourceLabel: "地図で見る", meta: ["高円寺北口一帯", "セールは3日間"], done: true },
      { kind: "place", title: "高円寺の小さなレコード店", category: "音楽", area: "高円寺", images: ["record-a"], sourceUrl: mapsUrl("高円寺 レコード店"), sourceLabel: "地図で見る", meta: ["高円寺"], done: false },
      // アーカイブタブのバインダー柄(グリッド構図・色相)のバリエーションを
      // 一覧で見比べられるよう、行った場所のエリア数を大きく増やしている
      // (バインダー1冊=エリア1つのため、エリア数=バインダー数になる)。
      { kind: "place", title: "中目黒の川沿いを散歩する", category: "身体", area: "中目黒", images: ["nakameguro-a"], sourceUrl: mapsUrl("中目黒 目黒川"), sourceLabel: "地図で見る", meta: ["中目黒"], done: true },
      { kind: "place", title: "代官山の独立系書店を覗く", category: "近所の発見", area: "代官山", images: ["daikanyama-a"], sourceUrl: mapsUrl("代官山 書店"), sourceLabel: "地図で見る", meta: ["代官山"], done: true },
      { kind: "place", title: "荻窪のラーメン店に並ぶ", category: "近所の発見", area: "荻窪", images: ["ogikubo-a"], sourceUrl: mapsUrl("荻窪 ラーメン"), sourceLabel: "地図で見る", meta: ["荻窪"], done: true },
      { kind: "place", title: "吉祥寺の雑貨店めぐり", category: "雑貨", area: "吉祥寺", images: ["kichijoji-a"], sourceUrl: mapsUrl("吉祥寺 雑貨店"), sourceLabel: "地図で見る", meta: ["吉祥寺"], done: true },
      { kind: "live", title: "三軒茶屋の小劇場で芝居を観る", category: "未知との遭遇", area: "三軒茶屋", images: ["sangenjaya-a"], sourceUrl: mapsUrl("三軒茶屋 小劇場"), sourceLabel: "地図で見る", meta: ["三軒茶屋"], done: true },
      { kind: "place", title: "下北沢の古着屋めぐり", category: "古着", area: "下北沢", images: ["shimokita-a"], sourceUrl: mapsUrl("下北沢 古着屋"), sourceLabel: "地図で見る", meta: ["下北沢"], done: false },
      { kind: "place", title: "自由が丘のスイーツ店めぐり", category: "近所の発見", area: "自由が丘", images: ["jiyugaoka-a"], sourceUrl: mapsUrl("自由が丘 スイーツ"), sourceLabel: "地図で見る", meta: ["自由が丘"], done: true },
      { kind: "place", title: "経堂の商店街を歩く", category: "身体", area: "経堂", images: ["kyodo-a"], sourceUrl: mapsUrl("経堂 商店街"), sourceLabel: "地図で見る", meta: ["経堂"], done: true },
      { kind: "place", title: "東小金井の古本市に寄る", category: "近所の発見", area: "東小金井", images: ["higashikoganei-a"], sourceUrl: mapsUrl("東小金井 古本市"), sourceLabel: "地図で見る", meta: ["東小金井"], done: false },
      { kind: "place", title: "早稲田のカレー屋を開拓する", category: "近所の発見", area: "早稲田", images: ["waseda-a"], sourceUrl: mapsUrl("早稲田 カレー"), sourceLabel: "地図で見る", meta: ["早稲田"], done: true },
      { kind: "place", title: "根津神社の参道を歩く", category: "身体", area: "根津", images: ["nezu-a"], sourceUrl: mapsUrl("根津神社"), sourceLabel: "地図で見る", meta: ["根津"], done: true },
      { kind: "place", title: "千駄木の路地裏カフェへ", category: "近所の発見", area: "千駄木", images: ["sendagi-a"], sourceUrl: mapsUrl("千駄木 カフェ"), sourceLabel: "地図で見る", meta: ["千駄木"], done: true },
      { kind: "place", title: "巣鴨の商店街で買い物", category: "雑貨", area: "巣鴨", images: ["sugamo-a"], sourceUrl: mapsUrl("巣鴨 商店街"), sourceLabel: "地図で見る", meta: ["巣鴨"], done: false },
      { kind: "place", title: "十条の立ち飲み屋を覗く", category: "未知との遭遇", area: "十条", images: ["jujo-a"], sourceUrl: mapsUrl("十条 立ち飲み"), sourceLabel: "地図で見る", meta: ["十条"], done: true },
      // 場所を持つ作品(新作の劇場公開)と、場所を持たない作品(旧作を家で観る・
      // 本・アルバム)の両方を混ぜ、「作品か場所か」ではなく「種類×場所の有無」
      // というモデルをデモデータでも示す。
      { kind: "movie", title: "単館上映のドキュメンタリー", category: "映画", area: "両国", images: ["carpentry-a"], sourceUrl: mapsUrl("両国 ミニシアター"), sourceLabel: "地図で見る", meta: ["両国のミニシアター", "19:40の回"], done: true },
      { kind: "movie", title: "Perfect Days 2", done: true },
      { kind: "movie", title: "深夜のホラー特集上映", done: false },
      { kind: "exhibition", title: "写真家の回顧展", creator: "損保ジャパン美術館", done: false },
      { kind: "live", title: "下北沢の対バンライブ", done: true },
      { kind: "live", title: "高円寺の弾き語りナイト", done: true },
      { kind: "live", title: "野外音楽フェス", done: false },
      { kind: "book", title: "建築家のエッセイ集", done: true },
      { kind: "book", title: "書評サイトで話題の短編集", done: true },
      { kind: "book", title: "積読中の長編小説", done: false },
      { kind: "album", title: "通勤で聴き切る一枚", done: true },
      { kind: "album", title: "学生時代によく聴いたアルバム", done: true },
      { kind: "album", title: "評判の新譜", done: false },
      // モノ: 場所なし(オンラインで買う)と、場所あり(そこでしか買えない)の両方。
      { kind: "thing", title: "フィルムカメラ", price: "¥72,000", done: false },
      { kind: "thing", title: "作家ものの器", area: "谷根千", price: "¥6,000前後", sourceUrl: mapsUrl("谷中 器"), sourceLabel: "地図で見る", done: true },
      { kind: "thing", title: "浅煎りのコーヒー豆", area: "蔵前", price: "¥1,800", sourceUrl: mapsUrl("COFFEE WRIGHTS 蔵前"), sourceLabel: "地図で見る", done: true },
    ];
    demo.forEach((d, i) => {
      // 2/3のItemをウィッシュ由来(origin:"wish")にする。アーカイブの
      // ウィッシュバインダーが30枚を超えて2冊目(続き)に割れる様子まで
      // デモデータだけで確認できる分量になる。
      const wish = i % 3 !== 0 ? demoWishes[i % demoWishes.length] : undefined;
      // 場所カードの色は、バインダー側の「行き先」棚が同じエリア名から生成
      // する色(placeAccent)と揃え、作品はジャンルのバインダー色(KIND_ACCENT、
      // タイケン/ジョウホウ双方のマップを結合したもの)を基準に明暗を
      // 振った近似色にする。
      const color = d.area ? placeAccent(d.area).color
        : d.kind !== "place" && d.kind !== "thing" ? shade(KIND_ACCENT[d.kind as Exclude<ItemKind, "place" | "thing">].color, ((i % 3) - 1) * 13)
        : placeAccent(d.title).color;
      next.items.push({
        id: `demo-${now}-${i}`, kind: d.kind, title: d.title, category: d.category, area: d.area,
        creator: d.creator, price: d.price,
        status: d.done ? "done" : "candidate",
        addedAt: new Date(now - (i + 3) * 30 * 3600 * 1000).toISOString(),
        doneAt: d.done ? new Date(now - i * 22 * 3600 * 1000).toISOString() : undefined,
        images: d.images, meta: d.meta, sourceUrl: d.sourceUrl, sourceLabel: d.sourceLabel, color,
        origin: wish ? "wish" : "brief", sourceWishId: wish?.id,
      });
    });
    if ((next.goals ?? []).length === 0) {
      // 目標のバインダーはgoalAccentが名前のハッシュだけで色相を振る単色
      // べた塗りのため、色のバリエーションを見比べられるよう数を増やしている。
      next.goals = [
        { id: `demo-goal-${now}`, title: "毎週どこか知らない街を歩く", addedAt: new Date(now - 20 * 86400000).toISOString(), checkIns: [
          { id: `demo-ci-${now}-1`, at: new Date(now - 2 * 86400000).toISOString(), text: "神保町の路地を歩いた。古本の匂いが良かった。", source: "manual" },
          { id: `demo-ci-${now}-2`, at: new Date(now - 9 * 86400000).toISOString(), text: "蔵前をぶらぶら。焙煎所で豆を買った。", source: "manual" },
        ] },
        { id: `demo-goal-${now}-2`, title: "月に一度は展覧会へ行く", addedAt: new Date(now - 40 * 86400000).toISOString(), checkIns: [] },
        { id: `demo-goal-${now}-3`, title: "毎朝10分だけ日記を書く", addedAt: new Date(now - 55 * 86400000).toISOString(), checkIns: [
          { id: `demo-ci-${now}-3`, at: new Date(now - 1 * 86400000).toISOString(), text: "3行だけ書いて終わり。それでいい。", source: "manual" },
        ] },
        { id: `demo-goal-${now}-4`, title: "行ったことのない銭湯を開拓する", addedAt: new Date(now - 30 * 86400000).toISOString(), checkIns: [] },
        { id: `demo-goal-${now}-5`, title: "月に1冊は積読を崩す", addedAt: new Date(now - 70 * 86400000).toISOString(), checkIns: [
          { id: `demo-ci-${now}-4`, at: new Date(now - 5 * 86400000).toISOString(), text: "エッセイ集を読み終えた。", source: "manual" },
        ] },
        { id: `demo-goal-${now}-6`, title: "自炊の日を週3日にする", addedAt: new Date(now - 12 * 86400000).toISOString(), checkIns: [] },
        { id: `demo-goal-${now}-7`, title: "季節ごとに一人旅へ行く", addedAt: new Date(now - 90 * 86400000).toISOString(), checkIns: [] },
        { id: `demo-goal-${now}-8`, title: "近所の商店街の店を1つずつ回る", addedAt: new Date(now - 8 * 86400000).toISOString(), checkIns: [] },
      ];
    }
    persist(next);
  };
  // 以前は素のテキストリンク(背景なし)だったため、ページ全体が想定外に
  // スクロールした際に本文と見分けがつかず流れて消えて見えた
  // (globals.cssのoverflow修正が根本対応だが、それとは別にヘッダーとして
  // 視認・タップしやすい見た目に作り直す)。nav・statチップと同じ
  // 「PAPER地+SOFT_SHADOWで浮く丸ボタン」語彙に揃え、単なるインライン
  // リンクではなく明確な「戻る」チップとして独立させる。
  const backChipStyle: CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start",
    background: PAPER, border: "none", borderRadius: 999, padding: "8px 16px 8px 12px",
    cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: INK,
    boxShadow: SOFT_SHADOW, marginBottom: 12,
  };
  return (
    <>
      {/* Masthead+戻るチップは、他のタブと同じくAppShellの共有スクロール
          ([data-tab-scroll-root])に乗る普通のflow要素。以前はConfirmedStack
          専用の入れ子スクロール領域を作り、外側をロックしてこのヘッダーを
          常時固定表示させていたが、他タブと挙動が揃わず(スクロールしても
          カードが画面上端まで届かない)、ユーザーの指摘で撤回した。
          position:stickyも保険として試したが、「スクロール中のコンテンツが
          ヘッダーの下に潜り込む」挙動によりカード上端が不透明な背景で
          切り取られて見える不具合を生んだため、これも撤回済み。 */}
      <Masthead title="プラン" statValue={magazine && !showMap ? magItems.length : stocked.length} statLabel={magazine && !showMap ? "件の目的地" : "件の候補"} corner={profileButton} />
      {showMap && magazine && (
        <button onClick={() => { setMapMode(false); setSelection({ itemIds: [] }); }} style={backChipStyle}>
          <ArrowLeft size={13} strokeWidth={2.4} />
          バインダーに戻る
        </button>
      )}
      {!showMap && magazine && (
        // 確定後は選んだカードが縦一列に大きく並ぶリストになり、その上に
        // 開いたバインダーが覗く。「選び直す」で地図に戻れるのは以前と同じ。
        <button onClick={() => {
          setSelection({ itemIds: [...magazine.itemIds] });
          setMapMode(true);
        }} style={backChipStyle}>
          <ArrowLeft size={13} strokeWidth={2.4} />
          選び直す
        </button>
      )}

      {showMap ? (
        <>
          <MapPlanner
            stocked={stocked} draftSelection={draftSelection}
            onOpenPin={setPinItem} onToggleItem={toggleDraftItem} onTogglePlan={toggleDraftPlan}
            onInjectDemo={injectDemo} bundlesAreNew={bundlesAreNew}
          />
          {/* 選択中のカードを確定する操作は、タブを跨いで共有するAppShellの
              フローティングUI(画面右下、スタックアイコン+取り消し+
              バインド！)に一本化した。以前はここに地図専用の確定バーを
              別途置いていたが、ストックタブからも同じ選択に追加できる
              ようになったため、確定の入口も1つにまとめている。 */}
        </>
      ) : magazine && (
        <ConfirmedStack
          items={magItems}
          dateLabel={dayInfo(magazine.decidedAt).label}
          onMarkDone={(item) => markDoneInMagazine(item.id)}
          onDrop={(item) => removeFromMagazine(item.id)}
          onRegister={registerBinder}
        />
      )}

      <BinderModal
        item={pinItem}
        onClose={() => setPinItem(null)}
        actionSlot={pinItem ? ((closeSheet) => (
          <button onClick={() => { toggleDraftItem(pinItem); closeSheet(); }} style={{
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
