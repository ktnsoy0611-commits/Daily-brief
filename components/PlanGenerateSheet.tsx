"use client";

import { Sparkles } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BottomSheet, OverlayCard } from "@/components/BottomSheet";
import { KIND_ICON } from "@/components/tabs/StockTab";
import { BLUE, GOLD, GREEN, INK, MUTED, PAPER, RUST, SANS, itemKindOf } from "@/lib/constants";
import { haptic, img } from "@/lib/helpers";
import type { GeneratedPlan, PlanWeight } from "@/lib/planPipeline";
import { PLAN_WEIGHTS } from "@/lib/planPipeline";
import type { Item } from "@/lib/types";

// 重さ(かける時間)の表示語彙。3案はこの軸だけで分かれる。
const WEIGHT_DEF: Record<PlanWeight, { label: string; hint: string }> = {
  full: { label: "1日たっぷり", hint: "一日かけて" },
  half: { label: "半日で", hint: "半日ほど" },
  light: { label: "さくっと", hint: "1〜2時間" },
};

// 生成に渡す候補は「場所のある候補」だけ(回る順序・距離を扱うため)。
export function planCandidatePayload(items: Item[]) {
  return items.map((i) => ({
    id: i.id, title: i.title, kind: i.kind,
    area: i.area && i.area !== "—" ? i.area : undefined,
    lat: i.lat, lng: i.lng,
    summary: i.summary,
    // 会期の終わり。終わった候補はサーバー側(dropExpired)で落とす。
    expiresAt: i.expiresAt,
  }));
}

// エラー理由 → 画面に出す文言。サーバーの reason をそのまま出さない。
function reasonMessage(reason: string): string {
  if (reason === "no_key") return "AIの設定(GEMINI_API_KEY)がまだ有効になっていません。";
  if (reason === "no_candidates") return "組み合わせる候補が足りません。ストックに場所のあるカードを増やしてください。";
  if (reason === "empty" || reason === "parse_failed") return "うまくまとまりませんでした。もう一度お試しください。";
  return "生成に失敗しました。時間をおいてもう一度お試しください。";
}

const spanLabel = (spanKm: number | null) =>
  spanKm === null ? null : spanKm <= 1.2 ? "徒歩圏" : `約${spanKm}km圏`;

function chipStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: "9px 0", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700,
    background: active ? INK : "transparent", color: active ? PAPER : "#5A5A54",
    border: `1.5px solid ${active ? INK : "rgba(26,26,24,0.2)"}`,
  };
}

// 生成中の待機表示。ロード画面(AppShell)と同じ幾何学図形が転がる語彙を、
// シートの中に収まる小さいサイズで再利用する。
function GeneratingIndicator() {
  const base: React.CSSProperties = { position: "absolute", top: "50%", left: 0, willChange: "transform" };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "26px 0 10px" }}>
      <div style={{ position: "relative", width: 200, height: 28, overflow: "hidden" }}>
        <span className="brief-roll-shape" style={{ ...base, marginTop: -8, width: 16, height: 16, borderRadius: "50%", background: RUST, animationDelay: "0s" }} />
        <span className="brief-roll-shape" style={{ ...base, marginTop: -8, width: 16, height: 16, background: BLUE, animationDelay: "0.6s" }} />
        <span className="brief-roll-shape" style={{ ...base, marginTop: -7, width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: `14px solid ${GOLD}`, animationDelay: "1.2s" }} />
        <span className="brief-roll-shape" style={{ ...base, marginTop: -5, width: 20, height: 10, borderRadius: 2, background: GREEN, animationDelay: "1.8s" }} />
      </div>
      <div style={{ color: MUTED, fontSize: 11.5, letterSpacing: "0.08em" }}>プランを考えています…</div>
    </div>
  );
}

// 生成された1案の中身(見出し・要約・回る順のリスト)。
function PlanDetail({ plan, byId }: { plan: GeneratedPlan; byId: Map<string, Item> }) {
  const span = spanLabel(plan.spanKm);
  const metaBits = [`${plan.stops.length}件`, WEIGHT_DEF[plan.weight].hint, ...(plan.areas.length ? [plan.areas.slice(0, 2).join("・")] : []), ...(span ? [span] : [])];
  return (
    <div>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, lineHeight: 1.35, marginBottom: 6 }}>{plan.title}</div>
      <div style={{ fontSize: 9.5, letterSpacing: "0.14em", color: MUTED, fontWeight: 700, marginBottom: 10 }}>{metaBits.join(" ・ ")}</div>
      {plan.summary && (
        <p style={{ fontSize: 12.5, lineHeight: 1.85, color: "#5A5A54", marginBottom: 16 }}>{plan.summary}</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
        {plan.stops.map((stop, idx) => {
          const item = byId.get(stop.id);
          if (!item) return null;
          const IconComp = KIND_ICON[item.kind];
          const hasArea = item.area && item.area !== "—";
          return (
            <div key={stop.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* 回る順番。プランの中身は「順序のある道のり」なので番号を振る。 */}
              <div style={{ width: 16, flexShrink: 0, fontFamily: SANS, fontWeight: 700, fontSize: 11, color: "#B8B4A6", textAlign: "center" }}>{idx + 1}</div>
              <div style={{ position: "relative", width: 46, height: 46, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: item.color ?? "#5A5A54" }}>
                {item.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img(item.images[0], 100, 100)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <IconComp size="46%" strokeWidth={1} color="rgba(255,255,255,0.85)" />
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: INK, fontFamily: SANS, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                <div style={{ fontSize: 10, color: MUTED, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {stop.note ? stop.note : `${itemKindOf(item.kind).label}${hasArea ? ` ・ ${item.area}` : ""}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* 3案は次に生成し直すまで残るので、あいだにバインドされて
          ストックから消えた行き先がありうる。その分は静かに落とし、
          全部消えた案だけはその旨を出す(空白のまま置かない)。 */}
      {plan.stops.every((s) => !byId.has(s.id)) && (
        <p style={{ fontSize: 11.5, lineHeight: 1.8, color: MUTED, marginBottom: 16 }}>
          この案の行き先は、もうストックにありません。作り直してください。
        </p>
      )}
    </div>
  );
}

// プラン生成シート。1枚のシートの中で「エリアを選ぶ → 生成中 → 3案を見比べる」
// まで完結させる(画面遷移を挟まない)。3案は重さ(1日/半日/さくっと)のチップで
// 切り替えて1案ずつ詳しく見る形にした。3枚を同時に並べると1案あたりの情報量が
// 削られ、どれも似て見えて選べなくなるため。
export function PlanGenerateSheet({ pool, plans, area, interests, onGenerated, onApply, onClose }: {
  pool: Item[];
  plans: GeneratedPlan[] | null;
  area: string | null;
  // 興味・好み(設定画面のチップ)。「なぜこの組み合わせか」をAIが書けるよう、
  // 候補一覧だけでなくこれも渡す(ブリーフ生成と同じ信号)。
  interests: { label: string; weight: number }[];
  onGenerated: (plans: GeneratedPlan[] | null, area: string | null) => void;
  onApply: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [selectedArea, setSelectedArea] = useState<string | null>(area);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeWeight, setActiveWeight] = useState<PlanWeight>("full");
  // 横スワイプで案を切り替えるためのドラッグ量(px)。指を離すと0へ戻す。
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const swipeRef = useRef<{ id: number; x: number; y: number; axis: "" | "x" | "y" } | null>(null);

  const byId = new Map(pool.map((i) => [i.id, i]));
  // エリアの選択肢は候補が実際に持っているエリアだけ(件数の多い順)。
  const areaCounts = new Map<string, number>();
  pool.forEach((i) => {
    if (i.area && i.area !== "—") areaCounts.set(i.area, (areaCounts.get(i.area) ?? 0) + 1);
  });
  const areas = Array.from(areaCounts.entries()).sort((a, b) => b[1] - a[1]).map(([a]) => a);
  const target = selectedArea ? pool.filter((i) => i.area === selectedArea) : pool;

  const generate = async () => {
    if (loading || target.length === 0) return;
    haptic(10);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: planCandidatePayload(target), area: selectedArea, interests }),
      });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.plans) && data.plans.length > 0) {
        const next = data.plans as GeneratedPlan[];
        onGenerated(next, selectedArea);
        setActiveWeight(next[0].weight);
      } else {
        setError(reasonMessage(typeof data?.reason === "string" ? data.reason : ""));
      }
    } catch {
      setError("通信に失敗しました。電波の良いところでもう一度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  const active = plans?.find((p) => p.weight === activeWeight) ?? plans?.[0] ?? null;
  // 実際に返ってきた案だけを、重さの順(1日→半日→さくっと)に並べたもの。
  // チップの並びとスワイプの順序はこれを共通の軸にする。
  const weights = plans ? PLAN_WEIGHTS.filter((w) => plans.some((p) => p.weight === w)) : [];
  const activeIdx = active ? weights.indexOf(active.weight) : -1;
  const goTo = (idx: number) => {
    if (idx < 0 || idx >= weights.length) return;
    haptic(6);
    setActiveWeight(weights[idx]);
  };

  // 横スワイプでの案の切り替え。縦スクロール(シートの中身は縦に長い)と
  // 取り合いにならないよう、最初の数pxでどちらの軸のジェスチャーかを判定し、
  // 縦だと分かった時点でこの要素は一切追従しない(touchAction:"pan-y"で
  // ブラウザ側の縦スクロールも生かしたまま)。
  const SWIPE_COMMIT = 52;
  const onSwipeDown = (e: ReactPointerEvent) => {
    if (weights.length < 2) return;
    swipeRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: "" };
  };
  const onSwipeMove = (e: ReactPointerEvent) => {
    const p = swipeRef.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      p.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (p.axis === "y") { swipeRef.current = null; return; }
      setDragging(true);
    }
    // 端(最初/最後の案)では引っぱりを1/3に弱め、これ以上先が無いことを体で示す。
    const atEdge = (dx > 0 && activeIdx <= 0) || (dx < 0 && activeIdx >= weights.length - 1);
    setDragX(atEdge ? dx / 3 : dx);
  };
  const endSwipe = () => {
    const p = swipeRef.current;
    swipeRef.current = null;
    setDragging(false);
    if (p?.axis === "x" && Math.abs(dragX) >= SWIPE_COMMIT) goTo(activeIdx + (dragX < 0 ? 1 : -1));
    setDragX(0);
  };

  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <OverlayCard>
          {loading ? (
            <>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: 2 }}>プランを生成</div>
              <GeneratingIndicator />
            </>
          ) : plans && active ? (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16 }}>
                  3つの案{selectedArea ? `（${selectedArea}）` : ""}
                </div>
                <button onClick={() => { onGenerated(null, selectedArea); }} style={{
                  border: "none", background: "transparent", cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: MUTED, padding: 0,
                }}>作り直す</button>
              </div>
              {/* 重さで切り替えるセグメント。3案の違いはここだけなので、
                  軸そのものを操作子にしている。 */}
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                {weights.map((w) => (
                  <button key={w} onClick={() => { haptic(6); setActiveWeight(w); }} style={chipStyle(active.weight === w)}>
                    {WEIGHT_DEF[w].label}
                  </button>
                ))}
              </div>
              {/* 案の中身は横スワイプでも切り替えられる(チップはその軸を示す
                  操作子として残す)。縦スクロールはブラウザに任せたいので
                  touchAction は "pan-y"。 */}
              <div
                onPointerDown={onSwipeDown}
                onPointerMove={onSwipeMove}
                onPointerUp={endSwipe}
                onPointerCancel={endSwipe}
                style={{
                  touchAction: "pan-y",
                  transform: `translateX(${dragX}px)`,
                  transition: dragging ? "none" : "transform 0.22s cubic-bezier(0.22,0.61,0.36,1)",
                }}
              >
                <PlanDetail key={active.weight} plan={active} byId={byId} />
              </div>
              {(() => {
                const liveIds = active.stops.map((s) => s.id).filter((id) => byId.has(id));
                return (
                  <button
                    onClick={() => { if (liveIds.length === 0) return; haptic(12); onApply(liveIds); requestClose(); }}
                    disabled={liveIds.length === 0}
                    style={{
                      width: "100%", padding: "13px 0", borderRadius: 999, border: "none",
                      cursor: liveIds.length === 0 ? "default" : "pointer",
                      fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
                      background: liveIds.length === 0 ? "rgba(26,26,24,0.2)" : INK, color: PAPER,
                    }}
                  >このプランを選ぶ</button>
                );
              })()}
            </>
          ) : (
            <>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>プランを生成</div>
              <p style={{ fontSize: 11.5, lineHeight: 1.8, color: MUTED, marginBottom: 16 }}>
                ストックの候補から、重さの違う3つの案をつくります。エリアは選ばなくても大丈夫です。
              </p>
              <div style={{ fontSize: 9, letterSpacing: "0.15em", color: MUTED, marginBottom: 8 }}>エリア（任意）</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
                <button onClick={() => setSelectedArea(null)} style={{ ...chipStyle(selectedArea === null), flex: "0 0 auto", padding: "8px 14px" }}>すべて</button>
                {areas.map((a) => (
                  <button key={a} onClick={() => setSelectedArea(a)} style={{ ...chipStyle(selectedArea === a), flex: "0 0 auto", padding: "8px 14px" }}>
                    {a}
                    <span style={{ opacity: 0.6, marginLeft: 5, fontSize: 10 }}>{areaCounts.get(a)}</span>
                  </button>
                ))}
              </div>
              {error && (
                <p style={{ fontSize: 11.5, lineHeight: 1.7, color: RUST, marginBottom: 14 }}>{error}</p>
              )}
              <button onClick={generate} disabled={target.length === 0} style={{
                width: "100%", padding: "13px 0", borderRadius: 999, border: "none",
                cursor: target.length === 0 ? "default" : "pointer",
                fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
                background: target.length === 0 ? "rgba(26,26,24,0.2)" : INK, color: PAPER,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              }}>
                <Sparkles size={14} strokeWidth={2.4} />
                {target.length === 0 ? "対象の候補がありません" : `この${target.length}件から生成する`}
              </button>
            </>
          )}
        </OverlayCard>
      )}
    </BottomSheet>
  );
}
