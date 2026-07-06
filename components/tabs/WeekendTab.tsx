"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { BinderModal, Masthead } from "@/components/common";
import { AREA_COORDS, BG, BLUE, DISPLAY, GREEN, HAIRLINE, INK, PAPER, RUST, SANS, SERIF } from "@/lib/constants";
import { haptic, img, inferMediaKind, mapsUrl, mostRecentThursday, pinPosition, todayKey } from "@/lib/helpers";
import type { Keep, TabProps } from "@/lib/types";

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
          }}>
            <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(45deg)", width: 7, height: 7, borderRadius: "50%", background: selected ? PAPER : (item.color ?? INK) }} />
          </button>
        );
      })}
    </div>
  );
}

function MapPlanner({ pool, draftSelection, onOpenPin, onPickBundle, onInjectDemo, bundlesAreNew }: {
  pool: Keep[];
  draftSelection: string[];
  onOpenPin: (item: Keep) => void;
  onPickBundle: (ids: string[]) => void;
  onInjectDemo: () => void;
  bundlesAreNew: boolean;
}) {
  const sorted = pool.slice().sort((a, b) => new Date(b.keptAt).getTime() - new Date(a.keptAt).getTime());
  const bundles = [
    { id: "light", label: "さらっと", tagline: "ひとつだけ、身軽に。", items: sorted.slice(0, 1) },
    { id: "easy", label: "ゆったり", tagline: "2〜3件、無理のない範囲で。", items: sorted.slice(0, 3) },
    { id: "full", label: "じっくり", tagline: "気になった分だけ、まとめて。", items: sorted.slice(0, 5) },
  ].filter((b) => b.items.length > 0);

  if (pool.length === 0) {
    return (
      <main style={{ padding: "48px 4px", textAlign: "center" }}>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 19, marginBottom: 10 }}>Keepが、まだありません。</div>
        <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.9, marginBottom: 22 }}>ブリーフでKeepしたカードや、願望タブでURLから追加した場所が、ここに地図として集まります。</p>
        <button onClick={onInjectDemo} style={{ padding: "13px 26px", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em" }}>デモ用データを投入</button>
      </main>
    );
  }

  return (
    <main style={{ paddingTop: 14, paddingBottom: draftSelection.length > 0 ? 108 : 24 }}>
      <MapCanvas items={pool} selectedIds={draftSelection} onOpenPin={onOpenPin} />
      <p style={{ fontSize: 10.5, color: "#9A988E", lineHeight: 1.8, margin: "10px 2px 20px" }}>ピンをタップして、今日行きたい場所を選んでください。</p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E" }}>今週のおすすめ</span>
        {bundlesAreNew && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.05em", color: PAPER, background: BLUE, borderRadius: 999, padding: "2px 7px" }}>NEW</span>}
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", WebkitOverflowScrolling: "touch", padding: "2px 0 4px", marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
        {bundles.map((b) => (
          <div key={b.id} style={{ flexShrink: 0, width: 180, background: PAPER, border: `1px solid ${HAIRLINE}`, borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16 }}>{b.label}</div>
            <div style={{ fontSize: 10.5, color: "#9A988E", margin: "3px 0 10px" }}>{b.tagline}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              {b.items.map((it) => (<div key={it.id} style={{ fontSize: 11, color: "#5A5A54", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>・{it.title}</div>))}
            </div>
            <button onClick={() => onPickBundle(b.items.map((it) => it.id))} style={{ width: "100%", padding: "9px 0", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700 }}>これにする</button>
          </div>
        ))}
      </div>
    </main>
  );
}

function CoverSpread({ items }: { items: Keep[] }) {
  return (
    <div style={{ flexShrink: 0, width: "78%", minWidth: 240, scrollSnapAlign: "center", height: 460, background: INK, color: PAPER, borderRadius: 18, padding: "26px 22px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 10px 30px rgba(23,23,21,0.25)" }}>
      <div>
        <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "rgba(251,250,247,0.55)" }}>TODAY&apos;S ISSUE</div>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 25, lineHeight: 1.45, margin: "14px 0 0" }}>今日のための<br />特集号。</div>
      </div>
      <div>
        <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 700, fontSize: 44, lineHeight: 1 }}>{items.length}</div>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "rgba(251,250,247,0.55)", marginTop: 4 }}>DESTINATIONS</div>
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflow: "hidden" }}>
          {items.map((it, i) => (
            <div key={it.id} style={{ fontSize: 11.5, color: "rgba(251,250,247,0.85)", display: "flex", gap: 8 }}>
              <span style={{ opacity: 0.5, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DestinationSpread({ item, index, total, onRemove, onMarkDone }: {
  item: Keep;
  index: number;
  total: number;
  onRemove: () => void;
  onMarkDone: () => void;
}) {
  const isMapsSource = item.sourceLabel === "地図で見る" && !!item.sourceUrl;
  return (
    <div style={{ flexShrink: 0, width: "78%", minWidth: 240, scrollSnapAlign: "center", height: 460, borderRadius: 18, overflow: "hidden", position: "relative", boxShadow: "0 10px 30px rgba(23,23,21,0.2)", background: PAPER, display: "flex", flexDirection: "column" }}>
      <div style={{ height: "56%", position: "relative", flexShrink: 0 }}>
        {item.images && item.images.length > 0 ? (
          <img src={img(item.images[0], 500, 500)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: item.color ?? "#5A5A54" }} />
        )}
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8 }}>
          <button onClick={onMarkDone} aria-label="行った" style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: GREEN, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(23,23,21,0.3)" }}><Check size={22} strokeWidth={2.5} /></button>
          <button onClick={onRemove} aria-label="行っていない" style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(23,23,21,0.55)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(23,23,21,0.3)" }}><X size={20} strokeWidth={2.5} /></button>
        </div>
        <div style={{ position: "absolute", top: 16, left: 14, fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 700, fontSize: 13, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
      </div>
      <div style={{ padding: "14px 18px 16px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.18em", color: "#9A988E" }}>{item.category}{item.area && item.area !== "—" ? ` ・ ${item.area}` : ""}</div>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16, lineHeight: 1.35, margin: "6px 0 6px" }}>{item.title}</div>
        {item.meta && item.meta.length > 0 && (
          <div style={{ fontSize: 10.5, color: "#7A7A72", lineHeight: 1.6, flex: 1, overflow: "hidden" }}>{item.meta.slice(0, 2).join(" ・ ")}</div>
        )}
        {/* 地図のURLと「Googleマップ」ボタンが同じ行き先を指す場合は、二重に出さず1つにまとめる */}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {isMapsSource ? (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: "center", padding: "10px 0", background: INK, color: PAPER, borderRadius: 999, textDecoration: "none", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>Googleマップで開く</a>
          ) : (
            <>
              <a href={mapsUrl(`${item.title} ${item.area && item.area !== "—" ? item.area : ""}`)} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: "center", padding: "10px 0", background: INK, color: PAPER, borderRadius: 999, textDecoration: "none", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>Googleマップ</a>
              {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: "center", padding: "10px 0", border: `1.5px solid ${INK}`, borderRadius: 999, textDecoration: "none", color: INK, fontFamily: SANS, fontSize: 10.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.sourceLabel ?? "詳細"}</a>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// マガジン編集モードで開く「候補から追加」シート
function AddToMagazineSheet({ pool, onAdd, onClose }: { pool: Keep[]; onAdd: (id: string) => void; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose} maxHeight="60vh">
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 15, marginBottom: 12 }}>候補から追加</div>
      {pool.length === 0 ? (
        <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>追加できる候補がありません。ブリーフや願望タブでKeepを増やしてみてください。</p>
      ) : pool.map((k, i) => (
        <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}` }}>
          {k.images && k.images.length > 0 ? (
            <img src={img(k.images[0], 90, 90)} alt="" style={{ width: 42, height: 42, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 42, height: 42, borderRadius: 8, background: k.color ?? "#5A5A54", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.title}</div>
            <div style={{ fontSize: 9.5, color: "#9A988E", marginTop: 2 }}>{k.category}{k.area && k.area !== "—" ? ` ・ ${k.area}` : ""}</div>
          </div>
          <button onClick={() => onAdd(k.id)} style={{ flexShrink: 0, padding: "8px 14px", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>追加</button>
        </div>
      ))}
    </BottomSheet>
  );
}

export function WeekendTab({ appState, persist }: TabProps) {
  const magazine = appState.magazine;
  const [mapMode, setMapMode] = useState(false); // マガジン確定後でも地図に戻って選び直すときtrue
  const [pinItem, setPinItem] = useState<Keep | null>(null);
  const [draftSelection, setDraftSelection] = useState<string[]>([]);
  const [editingMag, setEditingMag] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  const showMap = !magazine || mapMode;
  // 地図には実行済み以外の全Keepをピンとして出す(マガジン掲載中plannedも、選び直しのため含める)
  const pool = appState.keeps.filter((k) => k.status !== "done");
  const notInMagazine = pool.filter((k) => !(magazine?.itemIds ?? []).includes(k.id));
  const magItems = magazine ? magazine.itemIds.map((id) => appState.keeps.find((k) => k.id === id)).filter((k): k is Keep => !!k) : [];

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

  const toggleDraft = (item: Keep) => {
    haptic(8);
    setDraftSelection((prev) => prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id]);
  };
  // 地図での確定。新規作成と選び直し(更新)の両方に対応:
  // まず現在plannedのものを全て候補に戻し、選ばれたidだけをplannedにし直す。
  const confirmMagazine = (ids: string[]) => {
    if (!ids.length) return;
    haptic(16);
    const next = structuredClone(appState);
    next.keeps.forEach((k) => { if (k.status === "planned") k.status = "candidate"; });
    next.keeps.forEach((k) => { if (ids.includes(k.id)) k.status = "planned"; });
    next.magazine = { dateKey: todayKey(), decidedAt: new Date().toISOString(), itemIds: ids };
    persist(next);
    setDraftSelection([]);
    setMapMode(false);
    setEditingMag(false);
  };
  const addToMagazine = (id: string) => {
    haptic(10);
    const next = structuredClone(appState);
    const k = next.keeps.find((x) => x.id === id);
    if (k) k.status = "planned";
    next.magazine!.itemIds = [...next.magazine!.itemIds, id];
    persist(next);
  };
  const removeFromMagazine = (id: string) => {
    const next = structuredClone(appState);
    next.magazine!.itemIds = next.magazine!.itemIds.filter((x) => x !== id);
    const k = next.keeps.find((x) => x.id === id);
    if (k) k.status = "candidate";
    if (next.magazine!.itemIds.length === 0) { next.magazine = null; setEditingMag(false); }
    persist(next);
  };
  const markDoneInMagazine = (id: string) => {
    haptic(14);
    const next = structuredClone(appState);
    next.magazine!.itemIds = next.magazine!.itemIds.filter((x) => x !== id);
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
    if (next.magazine!.itemIds.length === 0) { next.magazine = null; setEditingMag(false); }
    persist(next);
  };
  const dissolveMagazine = () => {
    const next = structuredClone(appState);
    (next.magazine?.itemIds ?? []).forEach((id) => { const k = next.keeps.find((x) => x.id === id); if (k) k.status = "candidate"; });
    next.magazine = null;
    persist(next);
    setEditingMag(false);
    setMapMode(false);
  };
  const injectDemo = () => {
    const next = structuredClone(appState);
    const now = Date.now();
    ([
      { title: "「建築と自然」展を観る", category: "展覧会", area: "竹橋", images: ["momat-a", "momat-b"], sourceUrl: "https://www.momat.go.jp/", sourceLabel: "公式サイトを見る", color: "#20304A", meta: ["国立近代美術館", "10:00–17:00", "¥1,800"] },
      { title: "蔵前の焙煎所で豆を買う", category: "近所の発見", area: "蔵前", images: ["kuramae-a", "kuramae-b"], sourceUrl: mapsUrl("COFFEE WRIGHTS 蔵前"), sourceLabel: "地図で見る", color: "#3E4A3A", meta: ["COFFEE WRIGHTS", "9:00–18:00"] },
      { title: "高円寺の古着屋を覗く", category: "古着", area: "高円寺", images: ["vintage-a", "vintage-b"], sourceUrl: mapsUrl("高円寺 古着屋"), sourceLabel: "地図で見る", color: "#5C3A21", meta: ["高円寺北口エリア"] },
      { title: "神保町の古書店街を歩く", category: "近所の発見", area: "神保町", images: ["books-a", "books-b"], sourceUrl: mapsUrl("神保町 古書店街"), sourceLabel: "地図で見る", color: "#3E4A3A", meta: ["神保町"] },
      { title: "『大工の技術史』展を観る", category: "展覧会", area: "両国", images: ["carpentry-a", "carpentry-b"], sourceUrl: mapsUrl("江戸東京博物館"), sourceLabel: "公式サイトを見る", color: "#20304A", meta: ["江戸東京博物館"] },
      { title: "銭湯サウナを開拓する", category: "未知との遭遇", area: "蔵前", images: ["sauna-a", "sauna-b"], sourceUrl: mapsUrl("蔵前 銭湯"), sourceLabel: "地図で見る", color: "#2B3FBF", meta: ["蔵前"] },
    ]).forEach((d, i) => {
      next.keeps.push({ id: `demo-${now}-${i}`, title: d.title, category: d.category, area: d.area, status: "candidate", keptAt: new Date(now - i * 86400000).toISOString(), images: d.images, meta: d.meta, sourceUrl: d.sourceUrl, sourceLabel: d.sourceLabel, color: d.color });
    });
    persist(next);
  };

  return (
    <>
      <Masthead title="週末" en="WEEKEND" statValue={magazine && !showMap ? magItems.length : pool.length} statLabel={magazine && !showMap ? "件の目的地" : "件の候補"} />

      {showMap ? (
        <>
          {magazine && (
            <button onClick={() => { setMapMode(false); setDraftSelection([]); }} style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", padding: "12px 2px 0", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#9A988E" }}>← マガジンに戻る</button>
          )}
          <MapPlanner pool={pool} draftSelection={draftSelection} onOpenPin={setPinItem} onPickBundle={confirmMagazine} onInjectDemo={injectDemo} bundlesAreNew={bundlesAreNew} />
          {draftSelection.length > 0 && (
            <div style={{ position: "fixed", left: 0, right: 0, bottom: 60, zIndex: 20, display: "flex", justifyContent: "center", background: `linear-gradient(to top, ${BG} 75%, rgba(239,237,230,0))`, paddingTop: 16 }}>
              <div style={{ width: "100%", maxWidth: 420, padding: "0 16px 10px" }}>
                <button onClick={() => confirmMagazine(draftSelection)} style={{ width: "100%", padding: "14px 0", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", boxShadow: "0 8px 24px rgba(23,23,21,0.2)" }}>
                  {draftSelection.length}件で{magazine ? "マガジンを更新" : "マガジンを作る"}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <main style={{ paddingTop: 6, paddingBottom: 24 }}>
          {/* 編集への入り口は控えめに: 小さなテキストのみ */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 2px 10px" }}>
            <button onClick={() => { setDraftSelection(magazine!.itemIds); setMapMode(true); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#9A988E" }}>← 地図で選び直す</button>
            <button onClick={() => setEditingMag(!editingMag)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 11, fontWeight: 700, color: editingMag ? INK : "#9A988E" }}>{editingMag ? "完了" : "編集"}</button>
          </div>

          <div style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", gap: 14, padding: "4px 0 6px", WebkitOverflowScrolling: "touch", marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
            <CoverSpread items={magItems} />
            {magItems.map((item, i) => (
              <DestinationSpread key={item.id} item={item} index={i} total={magItems.length} onRemove={() => removeFromMagazine(item.id)} onMarkDone={() => markDoneInMagazine(item.id)} />
            ))}
            {editingMag && (
              <button onClick={() => setAddSheetOpen(true)} style={{
                flexShrink: 0, width: "78%", minWidth: 240, scrollSnapAlign: "center", height: 460, borderRadius: 18, cursor: "pointer",
                border: "2px dashed rgba(23,23,21,0.25)", background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
              }}>
                <span style={{ fontSize: 34, color: "#9A988E", lineHeight: 1 }}>＋</span>
                <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#9A988E", letterSpacing: "0.08em" }}>候補から追加</span>
              </button>
            )}
          </div>
          <p style={{ fontSize: 10.5, color: "#9A988E", lineHeight: 1.8, margin: "14px 2px 0" }}>横にスワイプすると、次の目的地がすぐ開きます。</p>

          {editingMag && (
            <button onClick={dissolveMagazine} style={{ marginTop: 20, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: RUST, letterSpacing: "0.04em" }}>このマガジンを解散する</button>
          )}
        </main>
      )}

      <BinderModal
        item={pinItem}
        onClose={() => setPinItem(null)}
        actionSlot={pinItem ? ((closeSheet) => (
          <button onClick={() => { toggleDraft(pinItem); closeSheet(); }} style={{
            width: "100%", padding: "12px 0", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
            background: draftSelection.includes(pinItem.id) ? "transparent" : INK,
            color: draftSelection.includes(pinItem.id) ? RUST : PAPER,
            border: draftSelection.includes(pinItem.id) ? `1.5px solid ${RUST}` : "none",
          }}>{draftSelection.includes(pinItem.id) ? "外す" : "＋ 今日に追加"}</button>
        )) : undefined}
      />
      {addSheetOpen && <AddToMagazineSheet pool={notInMagazine} onAdd={(id) => addToMagazine(id)} onClose={() => setAddSheetOpen(false)} />}
    </>
  );
}
