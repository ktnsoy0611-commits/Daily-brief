"use client";

import { Bookmark, BookOpen, Check, Film, MapPin, Music, Music2, Palette, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { COVER_RADIUS, MEDIA_ACCENT, placeAccent } from "@/components/Binder";
import { BinderModal, HOLE_CLEAR, HOLE_YS, type IconType, Masthead, PunchHoles, SelectablePosterCard } from "@/components/common";
import { AREA_COORDS, BLUE, GREEN, HAIRLINE, INK, ITEM_CARD_ASPECT, NAV_OFFSET, PAPER, RUST, SANS, SOFT_SHADOW_LG, catOf, mediaKindOf } from "@/lib/constants";
import { dayInfo, haptic, img, inferMediaKind, keepMedia, mapsUrl, mostRecentThursday, pinPosition, shade } from "@/lib/helpers";
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
// Keep(場所)同士をGemini風にまとめた「モデルプラン」の提案。pinPosition
// が返す地図座標(AREA_COORDSベース)同士の距離が近いものだけを束ねる
// ことで、実際に徒歩圏内でまとめて回れる組み合わせになるようにしている。
// メディア(作品)は地図上の位置を持たないため、この距離ベースの束ねには
// 含めない。
interface RecommendedPlan {
  key: string;
  keepIds: string[];
  label: string;
  itemsText: string;
  accent: string;
  items: { id: string; title: string; image?: string; color?: string }[];
}
const RECOMMENDED_COUNT = 5;
// 地図座標(0〜100のパーセント単位)上でこの距離以内なら「近い」とみなす。
const PLAN_CLUSTER_DIST = 16;
const PLAN_MAX_ITEMS = 4;

function buildRecommendedPlans(pool: Keep[]): RecommendedPlan[] {
  const withPos = pool.map((k) => ({ keep: k, pos: pinPosition(k) }));
  // 直近にKeepしたものを優先的にプランの起点(種)にする。
  const sorted = withPos.slice().sort((a, b) => new Date(b.keep.keptAt).getTime() - new Date(a.keep.keptAt).getTime());
  const used = new Set<string>();
  const clusters: (typeof withPos)[] = [];
  for (const seed of sorted) {
    if (used.has(seed.keep.id) || clusters.length >= RECOMMENDED_COUNT) continue;
    const group = [seed];
    used.add(seed.keep.id);
    for (const other of sorted) {
      if (group.length >= PLAN_MAX_ITEMS) break;
      if (used.has(other.keep.id)) continue;
      const d = Math.hypot(seed.pos.x - other.pos.x, seed.pos.y - other.pos.y);
      if (d <= PLAN_CLUSTER_DIST) { group.push(other); used.add(other.keep.id); }
    }
    // 単体では「組み合わせたプラン」にならないため、2件以上まとまった
    // 種だけを採用する(近くに何も無い1件だけの候補は諦めて捨てる)。
    if (group.length >= 2) clusters.push(group);
  }
  return clusters.slice(0, RECOMMENDED_COUNT).map((group) => {
    const areaCounts = new Map<string, number>();
    group.forEach((g) => {
      const a = g.keep.area && g.keep.area !== "—" ? g.keep.area : null;
      if (a) areaCounts.set(a, (areaCounts.get(a) ?? 0) + 1);
    });
    const areas = Array.from(areaCounts.entries()).sort((a, b) => b[1] - a[1]).map(([a]) => a);
    const label = areas.length === 0 ? "近場でめぐるプラン" : areas.length === 1 ? `${areas[0]}で過ごす` : `${areas[0]}・${areas[1]}をめぐる`;
    return {
      key: group.map((g) => g.keep.id).join("-"),
      keepIds: group.map((g) => g.keep.id),
      label,
      itemsText: group.map((g) => g.keep.title).join(" ・ "),
      accent: group[0].keep.color ?? placeAccent(areas[0] ?? group[0].keep.id).color,
      items: group.map((g) => ({ id: g.keep.id, title: g.keep.title, image: g.keep.images?.[0], color: g.keep.color })),
    };
  });
}

// 束ねたカードを、一回折った白い紙で左から包んだような見た目。右側は
// 紙で覆わず開けたままにし、中の場所カードが少しだけ覗くようにする
// (「右開きの白い紙で包んだ」の実装)。紙の右上角だけ小さく折り返して
// 影を落とし、「1枚の紙が巻かれて止まっている」ことを伝える。紙の面には
// 中身の羅列ではなく、時間帯ラベル(午前/午後/夕方/夜)付きのモデル
// プランとして1件ずつ印字する。以前は封筒+行き先の羅列だったが、
// プランの中身が読み取りづらいという指摘を受けて作り直した。
const WRAP_WIDTH = 224;
const WRAP_HEIGHT = 292;
const WRAP_PAPER_RATIO = 0.72;
const TIME_LABELS = ["午前", "午後", "夕方", "夜"];

function PlanEnvelope({ plan, selected, onToggle }: { plan: RecommendedPlan; selected: boolean; onToggle: () => void }) {
  const dark = shade(plan.accent, -20);
  const dogEar = 16;
  return (
    <button onClick={onToggle} aria-label={plan.label} style={{
      position: "relative", flexShrink: 0, width: WRAP_WIDTH, height: WRAP_HEIGHT, padding: 0, border: "none", cursor: "pointer",
      borderRadius: COVER_RADIUS, overflow: "hidden", background: dark, boxShadow: SOFT_SHADOW_LG,
      outline: selected ? `2.5px solid ${BLUE}` : "none", outlineOffset: selected ? -2.5 : 0,
    }}>
      {/* 紙の右から覗く、束ねたカードの小さな端 */}
      <div style={{ position: "absolute", right: 10, top: "8%", bottom: "8%", width: `${(1 - WRAP_PAPER_RATIO) * 100 + 16}%` }}>
        {plan.items.slice(0, 4).map((it, idx, arr) => (
          <div key={it.id} style={{
            position: "absolute", left: `${idx * 10}%`, top: `${idx * 7}%`, width: "70%", height: `${88 - idx * 5}%`,
            borderRadius: 6, overflow: "hidden", border: `2px solid ${PAPER}`, background: it.color ?? dark,
            boxShadow: "0 3px 7px rgba(23,23,21,0.32)", zIndex: arr.length - idx,
          }}>
            {it.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img(it.image, 90, 130)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            )}
          </div>
        ))}
      </div>
      {/* 左から巻いた白い紙。右上だけ折り返して、右側を開けたまま止める。 */}
      <div style={{
        position: "absolute", inset: 0, right: `${(1 - WRAP_PAPER_RATIO) * 100}%`, background: PAPER,
        clipPath: `polygon(0 0, calc(100% - ${dogEar}px) 0, 100% ${dogEar}px, 100% 100%, 0 100%)`,
        boxShadow: "5px 0 12px rgba(23,23,21,0.18)",
      }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: dogEar, height: dogEar, background: shade(PAPER, -12), clipPath: "polygon(0 0, 100% 0, 100% 100%)" }} />
        <div style={{ padding: "16px 14px 14px", height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 8.5, letterSpacing: "0.14em", color: "#9A988E", fontWeight: 700, marginBottom: 4, flexShrink: 0 }}>MODEL PLAN ・ {plan.items.length}件</div>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 14.5, color: INK, lineHeight: 1.3, marginBottom: 13, flexShrink: 0 }}>{plan.label}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflow: "hidden" }}>
            {plan.items.slice(0, 4).map((it, idx) => (
              <div key={it.id}>
                <div style={{ fontSize: 9, letterSpacing: "0.1em", color: plan.accent, fontWeight: 800, marginBottom: 2 }}>{TIME_LABELS[idx % TIME_LABELS.length]}</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{it.title}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{
        position: "absolute", right: 8, top: 8, width: 26, height: 26, borderRadius: "50%", zIndex: 4, pointerEvents: "none",
        background: selected ? BLUE : "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 2px 6px rgba(23,23,21,0.25)",
      }}>
        {selected ? <Check size={13} strokeWidth={3} color={PAPER} /> : <Plus size={13} strokeWidth={3} color={INK} />}
      </div>
    </button>
  );
}

function MapPlanner({ pool, mediaPool, draftSelection, draftMediaSelection, onOpenPin, onToggleKeep, onToggleMedia, onTogglePlan, onInjectDemo, bundlesAreNew }: {
  pool: Keep[];
  mediaPool: MediaRecord[];
  draftSelection: string[];
  draftMediaSelection: string[];
  onOpenPin: (item: Keep) => void;
  onToggleKeep: (item: Keep) => void;
  onToggleMedia: (item: MediaRecord) => void;
  onTogglePlan: (keepIds: string[]) => void;
  onInjectDemo: () => void;
  bundlesAreNew: boolean;
}) {
  const sorted = pool.slice().sort((a, b) => new Date(b.keptAt).getTime() - new Date(a.keptAt).getTime());
  const plans = buildRecommendedPlans(pool);

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

      {plans.length > 0 && (
        <HorizontalShelf title="今週のおすすめ" badge={bundlesAreNew ? "NEW" : undefined}>
          {plans.map((plan) => (
            <PlanEnvelope key={plan.key} plan={plan}
              selected={plan.keepIds.every((id) => draftSelection.includes(id))}
              onToggle={() => onTogglePlan(plan.keepIds)} />
          ))}
        </HorizontalShelf>
      )}
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

// バインダー本体。見開きで開いて置いた状態を、2枚の平らなパネルとして
// 組み立てる: 右側(裏表紙・リング側)はカードの束の真後ろに常に静止して
// おり、左側(表表紙)は登録前は画面の左へフラットに開いたまま(=画面の
// 外へ大きくはみ出して切れて見える)待機する。穴の装飾(PunchHoles)は
// 使わず、リング(RingHardware、呼び出し側で別途描画)だけのシンプルな
// 見開きにする。
// バインド！を押すと、束の一番上に来た表表紙が、自分の右端(=裏表紙側
// パネルに接する蝶番)を軸にrotateYで0度→180度まで回り込み、束の真上に
// ぴったり重なって閉じる。蝶番を右端に固定したまま回すことで、中間角度
// (90度前後)ではパネルの自由端(左端)がパースペクティブにより一瞬手前
// (視聴者側)へせり出して見え、「表紙が画面手前に飛び出してから束の上に
// パタンと閉じる」という動きになる。
// バインダーはカードより一回り大きい紙面を持つ実物と同じく、カードの
// 箱よりBINDER_MARGINぶんだけ全周に大きく作る(以前はカードとぴったり
// 同寸で、カード自体がバインダーそのものに見えてしまっていた)。
// wrapper自体をinset:-BINDER_MARGINで外側へ広げ、裏表紙側パネルはその
// wrapperにinset:0で重ねるだけで、追加の計算なしにカード比+全周
// BINDER_MARGIN分の大きさになる。
const BINDER_MARGIN = 9;

function BinderSpread({ closed, width, aspect }: { closed: boolean; width: number; aspect: string }) {
  const outerWidth = width + BINDER_MARGIN * 2;
  return (
    <div style={{ position: "absolute", inset: -BINDER_MARGIN, perspective: 900, pointerEvents: "none" }}>
      {/* 裏表紙側(リングが付く方)。束の真後ろに固定し、開閉では一切動かない。 */}
      <div style={{
        position: "absolute", inset: 0, background: PAPER, boxShadow: SOFT_SHADOW_LG,
        borderTopRightRadius: COVER_RADIUS, borderBottomRightRadius: COVER_RADIUS, overflow: "hidden", zIndex: 0,
      }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(100deg, rgba(28,28,30,0.07) 0%, rgba(28,28,30,0) 34%)" }} />
      </div>
      {/* 表表紙側。閉じるまでは画面左へフラットに開いたまま、右端(蝶番)を
          軸に回転して閉じる。backfaceVisibilityは意図的に指定しない
          (裏返る後半でも消えず、束の上に居座って覆い隠し続けるため)。
          perspectiveを浅くしているのは、閉じる途中(90度前後)で紙が
          画面手前へ迫り出す視差をはっきり感じさせるため。 */}
      <div style={{
        position: "absolute", top: 0, left: -outerWidth, width: outerWidth, aspectRatio: aspect,
        transformOrigin: "100% 50%",
        transform: `rotateY(${closed ? 180 : 0}deg)`,
        transition: "transform 0.34s cubic-bezier(0.45,0,0.2,1)",
        zIndex: closed ? 30 : 0,
      }}>
        <div style={{
          position: "absolute", inset: 0, background: PAPER, boxShadow: SOFT_SHADOW_LG,
          borderTopLeftRadius: COVER_RADIUS, borderBottomLeftRadius: COVER_RADIUS, overflow: "hidden",
          // PAPERと下地のBGがどちらも近いクリーム色のため、影だけでは
          // 画面へ大きくはみ出すこのパネルの輪郭が背景に溶けて見えなくなる。
          // ヘアラインの縁取りを足して、実際に紙が1枚そこにあることを
          // はっきり伝える。
          border: `1px solid ${HAIRLINE}`,
        }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(260deg, rgba(28,28,30,0.07) 0%, rgba(28,28,30,0) 34%)" }} />
        </div>
      </div>
    </div>
  );
}

// バインダーのリングが実際にカードの穴を通っているように見せる金具。
// 以前は1枚のリングをカードの手前(常に最前面)に置くだけだったため、
// ただカードの上に絵として貼り付けてあるだけに見えていた。実物のリングは
// 「裏表紙側パネルの左端(蝶番)から生えて、カードの穴を貫いて手前へ
// 戻ってくる」形をしているため、ここでもリングを2つの部品に分けて
// 「カードの下に潜る奥側」と「穴から顔を出す手前側」をそれぞれ別の
// 重なり順で描く。
//   - RingHardwareBack: リングの全形。カードより奥(zIndex指定なし=auto、
//     カードより前のDOM順)に置くことで、カードの実寸に重なる部分は
//     カードの下に隠れ、カードの左端からはみ出した部分だけが見える。
//     これが「バインダーの背に固定され、カードの下へ潜り込んでいく」側。
//   - RingHardwareFront: PunchHoles(common.tsx)と同じY位置(HOLE_YS)の
//     穴の真上だけに、リングと同じ意匠の小さな輪をもう一度重ねる。
//     カードより手前(zIndex高)に置くことで、「穴から金具の輪が顔を
//     出している」ように見せる。
// どちらもカード1枚1枚が持つものでも、開閉するBinderSpreadの表表紙
// パネルにくっついて動くものでもないため、呼び出し側(ConfirmedStack)で
// ドラッグで動くConfirmedCardの内側にも、開閉するBinderSpreadの内側にも
// 置かず、常に先頭カードの穴の位置に静止したまま描く。
const RING_STYLE: React.CSSProperties = {
  position: "absolute", inset: 0, borderRadius: "50%",
  border: "3px solid #D3CFC4",
  boxShadow: "0 1px 2px rgba(23,23,21,0.3), inset 0 1px 1px rgba(255,255,255,0.55)",
};

function RingHardwareBack() {
  return (
    <>
      {HOLE_YS.map((y) => (
        <div key={y} style={{ position: "absolute", left: -6, top: y, transform: "translateY(-50%)", width: 34, height: 12, pointerEvents: "none" }}>
          <div style={RING_STYLE} />
        </div>
      ))}
    </>
  );
}

function RingHardwareFront() {
  return (
    <>
      {HOLE_YS.map((y) => (
        <div key={y} style={{ position: "absolute", left: 9, top: y, transform: "translateY(-50%)", width: 16, height: 12, zIndex: 4, pointerEvents: "none" }}>
          <div style={RING_STYLE} />
        </div>
      ))}
    </>
  );
}

// ブリーフタブのカード(上部が写真、下部が白背景の説明)と統一したデザイン。
// 角丸も他のタブのカード(PosterCardなど)と同じく四隅とも丸める。以前は
// バインダーの表紙面に合わせて開く側(右)だけを丸めていたが、「カードの
// デザインは他のタブと共通にしてほしい、以前の方が良かった」という指摘を
// 受けて元の四隅丸めに戻した。バインダー側の角丸は変えず(BinderSpread、
// 開く側だけを丸めた表紙らしい形のまま)、あくまでカード自体だけを他の
// アイテムカードと揃える。パンチ穴は他のタブと同じPunchHoles(common.tsx)
// を使い、位置・見た目を揃えている。穴はカード全体の左端を通しで貫くため、
// 下の白い説明エリアの文字はHOLE_CLEAR分だけ右にずらして穴と重ならない
// ようにしている。下部には地図と(あれば)公式サイトへのリンクを置く。
// 地図リンクは、情報ソースが既にGoogleマップへのURLならそれをそのまま
// 使い、そうでなければ場所名からその場で生成する。
function ExecCardFace({ item, onMarkDone }: { item: ExecItem; onMarkDone: () => void }) {
  const IconComp = item.type === "keep" ? MapPin : (item.kind ? MEDIA_ICON[item.kind] : undefined);
  const fill = item.color ?? "#5A5A54";
  const hasPhoto = (item.images?.length ?? 0) > 0;
  const isMapsSource = !!item.sourceUrl && item.sourceUrl.includes("google.com/maps");
  const mapsHref = item.type === "keep"
    ? (isMapsSource ? item.sourceUrl : mapsUrl(item.area && item.area !== "—" ? `${item.area} ${item.title}` : item.title))
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
        {item.kept && (
          <span style={{ position: "absolute", top: 10, left: HOLE_CLEAR, display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(255,255,255,0.94)", color: INK, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.04em", borderRadius: 999, padding: "3.5px 9px 3.5px 7px" }}>
            <Bookmark size={10} fill={INK} strokeWidth={0} /> KEEP
          </span>
        )}
        <button onClick={(e) => { e.stopPropagation(); if (!item.done) onMarkDone(); }} aria-label={item.done ? "完了ずみ" : item.doneActionLabel} style={{
          position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: "50%", border: "none", cursor: item.done ? "default" : "pointer", padding: 0,
          background: item.done ? GREEN : "rgba(255,255,255,0.92)", color: item.done ? "#fff" : "#3A3A36",
          display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 8px rgba(28,28,30,0.28)",
        }}><Check size={15} strokeWidth={3} /></button>
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
              <a href={mapsHref} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} style={{ flex: 1, textAlign: "center", padding: "7px 0", borderRadius: 999, background: "#F3ECDD", color: "#3A2E22", textDecoration: "none", fontSize: 9.5, fontWeight: 700, fontFamily: SANS }}>地図 ↗</a>
            )}
            {officialHref && (
              <a href={officialHref} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} style={{ flex: 1, textAlign: "center", padding: "7px 0", borderRadius: 999, background: "#F3ECDD", color: "#3A2E22", textDecoration: "none", fontSize: 9.5, fontWeight: 700, fontFamily: SANS }}>サイト ↗</a>
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
// 大きすぎるという指摘を受け、1枚1枚をぐっと小さくした。パンチ穴・リング・
// KEEPバッジのサイズはこのCARD_WIDTHを基準に決めているため、ここを変えれば
// バインダー(BinderSpread、widthをそのまま渡している)も含めて一括で
// 比率が揃う。
const CARD_WIDTH = 220;
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // この確定ビューは、自分自身の中(scrollRef)ではなく外側のAppShellの
  // タブ用スクロールコンテナ([data-tab-scroll-root])が先にスクロール
  // している状態から表示されることがある(地図でブックマークを探して
  // 下の方までスクロールしてから「作る」を押した場合など)。地図の画面
  // ではAppShell側のコンテナ自体がスクロールを担っているが、この確定
  // ビューでは自分のリストが専用のスクロール領域を持つため、外側は本来
  // スクロール不要になる。ただし前の画面で付いていたscrollTopが残った
  // まま表示されてしまうことがあるため、この画面がマウントされた瞬間に
  // 両方(外側・内側)をまとめて先頭へ戻しておく。
  useEffect(() => {
    killMomentumScroll(scrollRef.current);
    killMomentumScroll(document.querySelector<HTMLElement>("[data-tab-scroll-root]"));
  }, []);

  // バインドボタンはどこからでも押せる固定位置にあるため、リストを
  // 下の方までスクロールした状態で押すと、スタック先である先頭カードが
  // 画面外(上)にあり、以降のスタック/閉じる/落ちるのアニメーションが
  // すべて見えない場所で起きてしまっていた。押した瞬間にまずリストを
  // 先頭へ戻し(「カメラ」を追従させ)、そのあとで各カードの位置を
  // 測ってアニメーションを組み立てる。内側(scrollRef)だけでなく、
  // 上のuseEffectと同じ理由で外側のタブスクロールコンテナも念のため
  // 一緒に戻す。
  const handleRegister = () => {
    if (registerPhase || items.length === 0) return;
    haptic(16);
    killMomentumScroll(scrollRef.current);
    killMomentumScroll(document.querySelector<HTMLElement>("[data-tab-scroll-root]"));
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
        ref={scrollRef} className="no-scrollbar"
        style={{
          flex: 1, minHeight: 0, overflowY: falling ? "hidden" : "auto",
          // overflowXは明示していないとoverflowYがvisible以外の値を持つ
          // せいで暗黙にautoへ計算され、画面の左へはみ出す表表紙パネル
          // (BinderSpread)がスクロールで引っかかったり中途半端に見切れたり
          // する。hiddenを明示し、画面の端できれいに切れるだけにする。
          overflowX: "hidden", WebkitOverflowScrolling: "touch",
          ...(falling ? { transform: "translateY(60%)", opacity: 0, transition: `transform ${FALL_MS}ms cubic-bezier(0.55,0,1,0.45), opacity ${FALL_MS - 40}ms ease-in` } : {}),
        }}
      >
        <div style={{ width: "100%", maxWidth: CONFIRMED_MAX_WIDTH, margin: "0 auto", padding: `6px 16px calc(${NAV_OFFSET} + 92px)` }}>
          <div style={{ fontSize: 10, letterSpacing: "0.16em", color: "#9A988E", fontWeight: 700, margin: "8px 2px 16px" }}>{dateLabel} ・ {items.length}件</div>
          {/* カード自身はスタック先の座標へ移動するだけで、回転はさせない。
              「閉じる」動きはカードではなく、常に先頭カードの背後にいる
              BinderSpread(=見開きバインダー)の表表紙パネルが担う。
              スタックが揃ったところへ表表紙がclosed=trueで束の真上へ
              回り込みながら閉じてくることで、「画面左に開いていた表紙が、
              積み上がったカードの上にパタンと閉じてくる」動きになる。 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            {items.map((it, i) => (
              // zIndexを明示するのは、スタック中に後ろのカードが先頭カード
              // (リング・表紙を持つi===0)の上に乗って見えてしまわないようにする
              // ため。指定しないとflexの子はDOM順で後勝ちになり、スタックで
              // 重なった瞬間に後方のカードが先頭カードを覆い隠してしまっていた。
              <div key={it.id} style={{ position: "relative", width: CARD_WIDTH, zIndex: items.length - i }}>
                {i === 0 && <BinderSpread closed={closed} width={CARD_WIDTH} aspect={ITEM_CARD_ASPECT} />}
                {/* リングの奥側(バインダーの背に固定、カードより先にDOM上へ
                    置くことでカードの下に潜る)。カードの実寸に重なる部分は
                    カードそのものに隠れ、左端からはみ出た部分だけが見える。 */}
                {i === 0 && <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}><RingHardwareBack /></div>}
                <ConfirmedCard
                  item={it} elRef={(el) => { cardEls.current[it.id] = el; }}
                  stackTransform={stacking ? `translateY(${stackOffsets[it.id] ?? 0}px) scale(${i === 0 ? 1 : 0.92})` : undefined}
                  hide={falling}
                  disabled={stacking}
                  onMarkDone={() => onMarkDone(it)}
                  onRemove={() => onDrop(it)}
                />
                {/* リングの手前側(カードより前面、穴の真上だけに小さく重ねて
                    「穴から輪が顔を出している」ように見せる)。常に先頭カードの
                    穴の位置に静止したままここに1つだけ描く(=一番上のカードだけが
                    今リングに通っているように見える)。 */}
                {i === 0 && <div style={{ position: "absolute", inset: 0, zIndex: 25, pointerEvents: "none" }}><RingHardwareFront /></div>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* 以前はリスト末尾に普通に流れる要素として置いていたが、それだと
          一番下までスクロールしないと押せず「どこでも押せるように」という
          要望に反していた。画面下に常時浮かせる固定ボタンに戻す。 */}
      {!stacking && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ width: "100%", maxWidth: CONFIRMED_MAX_WIDTH, padding: `0 16px calc(${NAV_OFFSET} + 8px)`, pointerEvents: "auto" }}>
            <button onClick={handleRegister} style={{
              width: "100%", padding: "15px 0", background: INK, color: PAPER, border: "none", borderRadius: 999,
              cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", boxShadow: SOFT_SHADOW_LG,
            }}>
              バインド！
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function ExecuteTab({ appState, persist, goTab, profileButton, selection, toggleKeepSelection, toggleMediaSelection, addKeepIds, setSelection }: TabProps) {
  const magazine = appState.magazine;
  const [mapMode, setMapMode] = useState(false); // バインダー確定後でも地図に戻って選び直すときtrue
  const [pinItem, setPinItem] = useState<Keep | null>(null);
  // 選択状態はAppShellへ引き上げ、ストックタブと共有している(タブを
  // 跨いでバインド候補を選べるようにするため)。draftSelection/
  // draftMediaSelectionという名前はこのタブ内での既存コードとの差分を
  // 最小にするため残しているが、実体はlib配下から渡される共有state。
  const draftSelection = selection.keepIds;
  const draftMediaSelection = selection.mediaIds;

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

  const toggleDraftKeep = (item: Keep) => toggleKeepSelection(item.id);
  const toggleDraftMedia = (item: MediaRecord) => toggleMediaSelection(item.id);
  // モデルプラン(複数のKeepをまとめたエンベロープ)は、中の全件がすでに
  // 選択済みなら丸ごと外し、そうでなければ丸ごと追加する。1件ずつの
  // toggleKeepSelectionではなく「全部入り/全部無し」の2状態だけを扱う。
  const toggleDraftPlan = (keepIds: string[]) => {
    const allSelected = keepIds.every((id) => draftSelection.includes(id));
    if (allSelected) {
      setSelection({ keepIds: draftSelection.filter((id) => !keepIds.includes(id)), mediaIds: draftMediaSelection });
    } else {
      addKeepIds(keepIds);
    }
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
  // Keepはそのまま候補に戻し、そのままアーカイブタブへ向かう。
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
  // まとめて投入する。地図(場所)だけ投入してもストック/ゴールタブは
  // 空のままでテストしづらいため、アプリ全体を一度に試せる分量にしている。
  // アーカイブタブの棚は「実行済み(done)」しか並ばないため、バインダーが
  // 何冊も、しかも厚みの違いも含めて並んだ様子を最初から見られるよう、
  // ほとんどの場所・メディアをdone状態(日付をずらして)で投入し、
  // 地図での選び直しを試せる分だけ候補(candidate/keep)を残す。
  const injectDemo = () => {
    const next = structuredClone(appState);
    const now = Date.now();
    ([
      { title: "「建築と自然」展を観る", category: "展覧会", area: "竹橋", images: ["momat-a", "momat-b"], sourceUrl: "https://www.momat.go.jp/", sourceLabel: "公式サイトを見る", meta: ["国立近代美術館", "10:00–17:00", "¥1,800"], done: true },
      { title: "竹橋のギャラリーで版画展を観る", category: "展覧会", area: "竹橋", images: ["print-a", "print-b"], sourceUrl: mapsUrl("竹橋 ギャラリー"), sourceLabel: "地図で見る", meta: ["竹橋"], done: true },
      { title: "神保町の古書店街を歩く", category: "近所の発見", area: "神保町", images: ["books-a", "books-b"], sourceUrl: mapsUrl("神保町 古書店街"), sourceLabel: "地図で見る", meta: ["神保町"], done: true },
      { title: "神保町の器店、作家の個展", category: "雑貨", area: "神保町", images: ["books-c"], sourceUrl: mapsUrl("神保町 器 個展"), sourceLabel: "地図で見る", meta: ["神保町", "会期は今月いっぱい"], done: true },
      { title: "喫茶店でゆっくり読書する", category: "近所の発見", area: "神保町", images: ["kissa-a"], sourceUrl: mapsUrl("神保町 純喫茶"), sourceLabel: "地図で見る", meta: ["神保町"], done: false },
      { title: "日比谷公園を散歩する", category: "身体", area: "日比谷", images: ["hibiya-park-a"], sourceUrl: mapsUrl("日比谷公園"), sourceLabel: "地図で見る", meta: ["日比谷公園"], done: true },
      { title: "日比谷のミッドセンチュリー家具店", category: "雑貨", area: "日比谷", images: ["furniture-a"], sourceUrl: mapsUrl("日比谷 家具店"), sourceLabel: "地図で見る", meta: ["日比谷"], done: false },
      { title: "谷根千の坂道を散歩する", category: "身体", area: "谷根千", images: ["zakka-a", "zakka-b"], sourceUrl: mapsUrl("谷根千 散歩コース"), sourceLabel: "地図で見る", meta: ["谷根千エリア"], done: true },
      { title: "谷中の陶器市を覗く", category: "雑貨", area: "谷根千", images: ["zakka-c"], sourceUrl: mapsUrl("谷中 陶器市"), sourceLabel: "地図で見る", meta: ["谷中エリア", "会期は今週末まで"], done: true },
      { title: "谷根千の純喫茶でひと休み", category: "近所の発見", area: "谷根千", images: ["kissa-b"], sourceUrl: mapsUrl("谷根千 純喫茶"), sourceLabel: "地図で見る", meta: ["谷根千エリア"], done: true },
      { title: "浅草橋のボルダリングジムへ", category: "身体", area: "浅草橋", images: ["climb-a", "climb-b"], sourceUrl: mapsUrl("浅草橋 ボルダリングジム"), sourceLabel: "地図で見る", meta: ["浅草橋駅から徒歩6分"], done: true },
      { title: "浅草橋の手芸問屋街を歩く", category: "雑貨", area: "浅草橋", images: ["zakka-d"], sourceUrl: mapsUrl("浅草橋 問屋街"), sourceLabel: "地図で見る", meta: ["浅草橋"], done: false },
      { title: "蔵前の焙煎所で豆を買う", category: "近所の発見", area: "蔵前", images: ["kuramae-a", "kuramae-b"], sourceUrl: mapsUrl("COFFEE WRIGHTS 蔵前"), sourceLabel: "地図で見る", meta: ["COFFEE WRIGHTS", "9:00–18:00"], done: true },
      { title: "銭湯サウナを開拓する", category: "未知との遭遇", area: "蔵前", images: ["sauna-a", "sauna-b"], sourceUrl: mapsUrl("蔵前 銭湯"), sourceLabel: "地図で見る", meta: ["蔵前"], done: true },
      { title: "蔵前のレザー工房を覗く", category: "雑貨", area: "蔵前", images: ["leather-a"], sourceUrl: mapsUrl("蔵前 レザー工房"), sourceLabel: "地図で見る", meta: ["蔵前"], done: true },
      { title: "『大工の技術史』展を観る", category: "展覧会", area: "両国", images: ["carpentry-a", "carpentry-b"], sourceUrl: mapsUrl("江戸東京博物館"), sourceLabel: "公式サイトを見る", meta: ["江戸東京博物館"], done: true },
      { title: "両国国技館のまわりを歩く", category: "身体", area: "両国", images: ["ryogoku-a"], sourceUrl: mapsUrl("両国国技館"), sourceLabel: "地図で見る", meta: ["両国"], done: false },
      { title: "清澄白河で陶芸体験をする", category: "未知との遭遇", area: "清澄白河", images: ["pottery-a", "pottery-b"], sourceUrl: mapsUrl("清澄白河 陶芸体験"), sourceLabel: "地図で見る", meta: ["清澄白河・陶房"], done: true },
      { title: "清澄白河のロースタリー巡り", category: "近所の発見", area: "清澄白河", images: ["kiyosumi-a"], sourceUrl: mapsUrl("清澄白河 ロースタリー"), sourceLabel: "地図で見る", meta: ["清澄白河"], done: true },
      { title: "高円寺の古着屋を覗く", category: "古着", area: "高円寺", images: ["vintage-a", "vintage-b"], sourceUrl: mapsUrl("高円寺 古着屋"), sourceLabel: "地図で見る", meta: ["高円寺北口エリア"], done: true },
      { title: "高円寺の古着市、大型セール", category: "古着", area: "高円寺", images: ["vintage-c"], sourceUrl: mapsUrl("高円寺 古着 セール"), sourceLabel: "地図で見る", meta: ["高円寺北口一帯", "セールは3日間"], done: true },
      { title: "高円寺の小さなレコード店", category: "音楽", area: "高円寺", images: ["record-a"], sourceUrl: mapsUrl("高円寺 レコード店"), sourceLabel: "地図で見る", meta: ["高円寺"], done: false },
      // アーカイブタブのバインダー柄(グリッド構図・色相)のバリエーションを
      // 一覧で見比べられるよう、行った場所のエリア数を大きく増やしている
      // (バインダー1冊=エリア1つのため、エリア数=バインダー数になる)。
      { title: "中目黒の川沿いを散歩する", category: "身体", area: "中目黒", images: ["nakameguro-a"], sourceUrl: mapsUrl("中目黒 目黒川"), sourceLabel: "地図で見る", meta: ["中目黒"], done: true },
      { title: "代官山の独立系書店を覗く", category: "近所の発見", area: "代官山", images: ["daikanyama-a"], sourceUrl: mapsUrl("代官山 書店"), sourceLabel: "地図で見る", meta: ["代官山"], done: true },
      { title: "荻窪のラーメン店に並ぶ", category: "近所の発見", area: "荻窪", images: ["ogikubo-a"], sourceUrl: mapsUrl("荻窪 ラーメン"), sourceLabel: "地図で見る", meta: ["荻窪"], done: true },
      { title: "吉祥寺の雑貨店めぐり", category: "雑貨", area: "吉祥寺", images: ["kichijoji-a"], sourceUrl: mapsUrl("吉祥寺 雑貨店"), sourceLabel: "地図で見る", meta: ["吉祥寺"], done: true },
      { title: "三軒茶屋の小劇場で芝居を観る", category: "未知との遭遇", area: "三軒茶屋", images: ["sangenjaya-a"], sourceUrl: mapsUrl("三軒茶屋 小劇場"), sourceLabel: "地図で見る", meta: ["三軒茶屋"], done: true },
      { title: "下北沢の古着屋めぐり", category: "古着", area: "下北沢", images: ["shimokita-a"], sourceUrl: mapsUrl("下北沢 古着屋"), sourceLabel: "地図で見る", meta: ["下北沢"], done: false },
      { title: "自由が丘のスイーツ店めぐり", category: "近所の発見", area: "自由が丘", images: ["jiyugaoka-a"], sourceUrl: mapsUrl("自由が丘 スイーツ"), sourceLabel: "地図で見る", meta: ["自由が丘"], done: true },
      { title: "経堂の商店街を歩く", category: "身体", area: "経堂", images: ["kyodo-a"], sourceUrl: mapsUrl("経堂 商店街"), sourceLabel: "地図で見る", meta: ["経堂"], done: true },
      { title: "東小金井の古本市に寄る", category: "近所の発見", area: "東小金井", images: ["higashikoganei-a"], sourceUrl: mapsUrl("東小金井 古本市"), sourceLabel: "地図で見る", meta: ["東小金井"], done: false },
      { title: "早稲田のカレー屋を開拓する", category: "近所の発見", area: "早稲田", images: ["waseda-a"], sourceUrl: mapsUrl("早稲田 カレー"), sourceLabel: "地図で見る", meta: ["早稲田"], done: true },
      { title: "根津神社の参道を歩く", category: "身体", area: "根津", images: ["nezu-a"], sourceUrl: mapsUrl("根津神社"), sourceLabel: "地図で見る", meta: ["根津"], done: true },
      { title: "千駄木の路地裏カフェへ", category: "近所の発見", area: "千駄木", images: ["sendagi-a"], sourceUrl: mapsUrl("千駄木 カフェ"), sourceLabel: "地図で見る", meta: ["千駄木"], done: true },
      { title: "巣鴨の商店街で買い物", category: "雑貨", area: "巣鴨", images: ["sugamo-a"], sourceUrl: mapsUrl("巣鴨 商店街"), sourceLabel: "地図で見る", meta: ["巣鴨"], done: false },
      { title: "十条の立ち飲み屋を覗く", category: "未知との遭遇", area: "十条", images: ["jujo-a"], sourceUrl: mapsUrl("十条 立ち飲み"), sourceLabel: "地図で見る", meta: ["十条"], done: true },
    ]).forEach((d, i) => {
      // 場所カードの色は、バインダー側の「行った場所」棚が同じエリア名から
      // 生成する色(placeAccent)と揃え、カードとバインダーが同一のエリアを
      // 指していることが色でもわかるようにしている。
      next.keeps.push({
        id: `demo-${now}-${i}`, title: d.title, category: d.category, area: d.area,
        status: d.done ? "done" : "candidate",
        keptAt: new Date(now - (i + 3) * 30 * 3600 * 1000).toISOString(),
        doneAt: d.done ? new Date(now - i * 22 * 3600 * 1000).toISOString() : undefined,
        images: d.images, meta: d.meta, sourceUrl: d.sourceUrl, sourceLabel: d.sourceLabel, color: placeAccent(d.area).color,
      });
    });
    ([
      { kind: "movie" as const, title: "Perfect Days 2", creator: "", done: true },
      { kind: "movie" as const, title: "単館上映のドキュメンタリー", creator: "", done: true },
      { kind: "movie" as const, title: "深夜のホラー特集上映", creator: "", done: false },
      { kind: "exhibition" as const, title: "「建築と自然」展", creator: "国立近代美術館", done: true },
      { kind: "exhibition" as const, title: "谷根千の器作家、個展", creator: "個人ギャラリー", done: true },
      { kind: "exhibition" as const, title: "写真家の回顧展", creator: "損保ジャパン美術館", done: false },
      { kind: "live" as const, title: "下北沢の対バンライブ", creator: "", done: true },
      { kind: "live" as const, title: "高円寺の弾き語りナイト", creator: "", done: true },
      { kind: "live" as const, title: "野外音楽フェス", creator: "", done: false },
      { kind: "book" as const, title: "建築家のエッセイ集", creator: "", done: true },
      { kind: "book" as const, title: "書評サイトで話題の短編集", creator: "", done: true },
      { kind: "book" as const, title: "積読中の長編小説", creator: "", done: false },
      { kind: "album" as const, title: "通勤で聴き切る一枚", creator: "", done: true },
      { kind: "album" as const, title: "学生時代によく聴いたアルバム", creator: "", done: true },
      { kind: "album" as const, title: "評判の新譜", creator: "", done: false },
    ]).forEach((d, i) => {
      // メディアカードの色はジャンルのバインダー色(MEDIA_ACCENT)を基準に、
      // 同じジャンル内でも一枚一枚が識別できるよう明暗を振った近似色にする。
      next.records.media.unshift({
        id: `demo-media-${now}-${i}`, kind: d.kind, title: d.title, creator: d.creator,
        addedAt: new Date(now - (i + 2) * 20 * 3600 * 1000).toISOString(), color: shade(MEDIA_ACCENT[d.kind].color, ((i % 3) - 1) * 13),
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
  return (
    <>
      <Masthead title="プラン" statValue={magazine && !showMap ? magItems.length : pool.length + mediaPool.length} statLabel={magazine && !showMap ? "件の目的地" : "件の候補"} corner={profileButton} />

      {showMap ? (
        <>
          {magazine && (
            <button onClick={() => { setMapMode(false); setSelection({ keepIds: [], mediaIds: [] }); }} style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", padding: "12px 2px 0", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#9A988E" }}>← バインダーに戻る</button>
          )}
          <MapPlanner
            pool={pool} mediaPool={mediaPool} draftSelection={draftSelection} draftMediaSelection={draftMediaSelection}
            onOpenPin={setPinItem} onToggleKeep={toggleDraftKeep} onToggleMedia={toggleDraftMedia} onTogglePlan={toggleDraftPlan}
            onInjectDemo={injectDemo} bundlesAreNew={bundlesAreNew}
          />
          {/* 選択中のカードを確定する操作は、タブを跨いで共有するAppShellの
              フローティングUI(画面右下、スタックアイコン+取り消し+
              バインド！)に一本化した。以前はここに地図専用の確定バーを
              別途置いていたが、ストックタブからも同じ選択に追加できる
              ようになったため、確定の入口も1つにまとめている。 */}
        </>
      ) : magazine && (
        // 確定後は選んだカードが縦一列に大きく並ぶリストになり、その上に
        // 開いたバインダーが覗く。「選び直す」で地図に戻れるのは以前と同じ。
        <>
          <button onClick={() => {
            setSelection({
              keepIds: magazine.itemIds.filter((r) => r.type === "keep").map((r) => r.id),
              mediaIds: magazine.itemIds.filter((r) => r.type === "media").map((r) => r.id),
            });
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
