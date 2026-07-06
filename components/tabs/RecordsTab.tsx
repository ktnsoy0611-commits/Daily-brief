"use client";

import { ChevronDown, Sprout, Star } from "lucide-react";
import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { BinderModal, type BinderItem, Dot, Masthead, keepStatus, rowBtn, Thumb } from "@/components/common";
import { BLUE, GREEN, HAIRLINE, INK, MEDIA_KINDS, PAPER, POSTER_PALETTE, RUST, SANS, SERIF, catOf, mediaKindOf } from "@/lib/constants";
import { candidateMedia, dayInfo, daysBetween, hashStr, haptic, img, inferMediaKind, shortDate } from "@/lib/helpers";
import type { AppState, Keep, MediaKindId, TabProps } from "@/lib/types";

// 記録タブ内で繰り返し使う「ポスター」カード。メディア/エリア共通。
// sizeを省略すると親グリッドに合わせて広がる。
function PosterCard({ image, color, title, sub, label, good, onToggleGood, action, onClick, size }: {
  image?: string | null;
  color?: string;
  title: string;
  sub?: string;
  label?: string;
  good?: boolean;
  onToggleGood?: () => void;
  action?: { label: string; onClick: () => void };
  onClick?: () => void;
  size?: number | string;
}) {
  return (
    <div onClick={onClick} style={{ position: "relative", flexShrink: 0, width: size ?? "100%", aspectRatio: "2 / 3", borderRadius: 14, overflow: "hidden", boxShadow: "0 8px 20px rgba(23,23,21,0.16)", cursor: onClick ? "pointer" : "default" }}>
      {image ? (
        <img src={img(image, 340, 510)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", background: color ?? "#5A5A54", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 17, color: PAPER, textAlign: "center", lineHeight: 1.45 }}>{title}</span>
        </div>
      )}
      {image && (
        <>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 48%, rgba(0,0,0,0.78) 100%)" }} />
          <div style={{ position: "absolute", bottom: 10, left: 10, right: 10 }}>
            {label && <div style={{ fontSize: 8, letterSpacing: "0.16em", color: "rgba(255,255,255,0.7)", marginBottom: 3 }}>{label}</div>}
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 14, color: "#fff", lineHeight: 1.3 }}>{title}</div>
            {sub && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>{sub}</div>}
          </div>
        </>
      )}
      {!image && (
        <div style={{ position: "absolute", bottom: 10, left: 12, right: 12, textAlign: "center" }}>
          {label && <div style={{ fontSize: 8, letterSpacing: "0.16em", color: "rgba(251,250,247,0.6)", marginBottom: 2 }}>{label}</div>}
          {sub && <div style={{ fontSize: 9, color: "rgba(251,250,247,0.75)" }}>{sub}</div>}
        </div>
      )}
      {onToggleGood && (
        <button onClick={(e) => { e.stopPropagation(); onToggleGood(); }} aria-label="良かった" style={{
          position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", border: "none", cursor: "pointer",
          background: good ? "#D9A441" : "rgba(23,23,21,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}>
          <Star size={14} fill={good ? "#fff" : "none"} color="#fff" strokeWidth={2} />
        </button>
      )}
      {action && (
        <button onClick={(e) => { e.stopPropagation(); action.onClick(); }} style={{
          position: "absolute", top: 8, right: 8, padding: "6px 11px", borderRadius: 999, border: "none", cursor: "pointer",
          background: INK, color: PAPER, fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.02em",
        }}>{action.label}</button>
      )}
    </div>
  );
}

// 「バインダーフォルダー」。閉じているときは写真が重なった束、タップで
// 開くと中身のカードのグリッドが現れる。エリア別・日付別の両方で共用する。
function CollapsibleFolder({ title, count, coverImages, coverColor, children }: {
  title: string; count: number; coverImages: string[]; coverColor?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rotations = [-6, 4, -2];
  return (
    <section style={{ marginBottom: open ? 26 : 14 }}>
      <button onClick={() => { haptic(6); setOpen(!open); }} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 14, background: PAPER, border: `1px solid ${HAIRLINE}`,
        borderRadius: 16, padding: "14px 16px", cursor: "pointer", textAlign: "left", boxShadow: open ? "none" : "0 6px 16px rgba(23,23,21,0.08)",
      }}>
        <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
          {coverImages.length === 0 ? (
            <div style={{ width: 56, height: 56, borderRadius: 10, background: coverColor ?? "#5A5A54", margin: 4 }} />
          ) : coverImages.map((seed, i) => (
            <img key={seed} src={img(seed, 120, 120)} alt="" style={{
              position: "absolute", top: 4, left: 4, width: 54, height: 54, objectFit: "cover", borderRadius: 8,
              border: "2.5px solid #fff", boxShadow: "0 3px 8px rgba(23,23,21,0.25)",
              transform: `rotate(${rotations[i]}deg) translate(${i * 3}px, ${i * -2}px)`, zIndex: i,
            }} />
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 18 }}>{title}</div>
          <div style={{ fontSize: 10, color: "#9A988E", marginTop: 3 }}>{count}件の記録</div>
        </div>
        <ChevronDown size={16} color="#9A988E" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          {children}
        </div>
      )}
    </section>
  );
}

function AreaFolder({ area, keeps, onOpenItem }: { area: string; keeps: Keep[]; onOpenItem: (k: Keep) => void }) {
  const covers = keeps.filter((k) => k.images?.[0]).slice(0, 3).map((k) => k.images![0]);
  return (
    <CollapsibleFolder title={area} count={keeps.length} coverImages={covers} coverColor={keeps[0]?.color}>
      {keeps.map((k) => (
        <PosterCard key={k.id} image={k.images?.[0]} color={k.color} title={k.title} sub={shortDate(k.doneAt ?? k.keptAt)}
          onClick={k.images && k.images.length > 0 ? () => onOpenItem(k) : undefined} />
      ))}
    </CollapsibleFolder>
  );
}

interface DayEntry {
  key: string;
  title: string;
  image?: string;
  color?: string;
  label?: string;
  sub?: string;
  binderItem?: BinderItem;
}

function DayFolder({ label, entries, onOpenItem }: { label: string; entries: DayEntry[]; onOpenItem: (item: BinderItem) => void }) {
  const covers = entries.filter((e) => e.image).slice(0, 3).map((e) => e.image!);
  return (
    <CollapsibleFolder title={label} count={entries.length} coverImages={covers} coverColor={entries[0]?.color}>
      {entries.map((e) => (
        <PosterCard key={e.key} image={e.image} color={e.color} title={e.title} sub={e.sub} label={e.label}
          onClick={e.binderItem ? () => onOpenItem(e.binderItem!) : undefined} />
      ))}
    </CollapsibleFolder>
  );
}

function AddMediaSheet({ onAdd, onClose }: {
  onAdd: (data: { kind: MediaKindId; title: string; creator: string }) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<MediaKindId>("movie");
  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const current = mediaKindOf(kind);

  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>メディアを記録</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {MEDIA_KINDS.map((k) => (
              <button key={k.id} onClick={() => setKind(k.id)} style={{
                flex: "1 1 40%", padding: "9px 0", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700,
                background: kind === k.id ? INK : "transparent", color: kind === k.id ? PAPER : "#5A5A54",
                border: `1.5px solid ${kind === k.id ? INK : "rgba(23,23,21,0.2)"}`,
              }}>{k.label}</button>
            ))}
          </div>
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>タイトル</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SERIF, fontSize: 15, outline: "none", marginBottom: 14, background: "transparent" }} />
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>{current.creatorPlaceholder}</label>
          <input value={creator} onChange={(e) => setCreator(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1px solid ${HAIRLINE}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 20, background: "transparent" }} />
          <button onClick={() => { if (!title.trim()) return; onAdd({ kind, title: title.trim(), creator: creator.trim() }); requestClose(); }} disabled={!title.trim()} style={{
            width: "100%", padding: "13px 0", background: title.trim() ? INK : "rgba(23,23,21,0.2)", color: PAPER, border: "none",
            borderRadius: 999, cursor: title.trim() ? "pointer" : "default", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
          }}>記録する</button>
        </>
      )}
    </BottomSheet>
  );
}

function ShelfList({ appState, persist }: { appState: AppState; persist: (next: AppState) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [binderItem, setBinderItem] = useState<BinderItem | null>(null);
  const all = appState.keeps.filter((k) => k.status !== "done").sort((a, b) => new Date(b.keptAt).getTime() - new Date(a.keptAt).getTime());

  const removeKeep = (id: string) => {
    const next = structuredClone(appState);
    next.keeps = next.keeps.filter((x) => x.id !== id);
    persist(next);
    setSelectedId(null);
  };

  return (
    <main style={{ flex: 1, paddingBottom: 24, paddingTop: 14 }}>
      <p style={{ fontSize: 11, color: "#9A988E", lineHeight: 1.8, margin: "0 0 10px" }}>Keepは削除しない限り消えません。いつでも地図に呼び出せます。行った場所はマガジンの✓で「記録」タブに移ります。</p>
      {all.length === 0 ? (
        <div style={{ padding: "40px 4px", textAlign: "center" }}><div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>まだKeepがありません。</div></div>
      ) : all.map((k, i) => {
        const status = keepStatus(k);
        const isSel = selectedId === k.id;
        return (
          <div key={k.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 2px", borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}` }}>
              {k.images && k.images.length > 0 && <Thumb seed={k.images[0]} onOpen={() => setBinderItem(k)} />}
              <div onClick={() => setSelectedId(isSel ? null : k.id)} style={{ flex: 1, cursor: "pointer" }}>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 13.5, lineHeight: 1.5 }}>{k.title}</div>
                <div style={{ marginTop: 4 }}><Dot color={status.color} label={`${status.label} ・ ${k.category}${k.area && k.area !== "—" ? "・" + k.area : ""} ・ ${daysBetween(k.keptAt) === 0 ? "今日" : daysBetween(k.keptAt) + "日前"}`} /></div>
              </div>
            </div>
            {isSel && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 2px 14px" }}>
                <button onClick={() => removeKeep(k.id)} style={rowBtn("transparent", RUST, "rgba(168,85,47,0.4)")}>削除</button>
              </div>
            )}
          </div>
        );
      })}
      <BinderModal item={binderItem} onClose={() => setBinderItem(null)} />
    </main>
  );
}

// ==================================================================
// アプリのホーム。カード主体の大きなレイアウトで、目標・メディア・
// エリア(バインダーフォルダー)を構造化して見せる。
// ==================================================================
export function RecordsTab({ appState, persist, goTab }: TabProps) {
  const [binderItem, setBinderItem] = useState<BinderItem | null>(null);
  const [addingMedia, setAddingMedia] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "date">("list");

  const doneKeeps = appState.keeps.filter((k) => k.status === "done");
  // メディアは「KEEPしただけ(candidate)」と「実際にやった(done)」を分けて扱う。
  // status省略は既存の3経路(マガジン✓/行きましたか通知/手動+)由来でdone扱い。
  const doneMediaRecords = (appState.records?.media ?? [])
    .filter((r) => (r.status ?? "done") === "done")
    .sort((a, b) => new Date(b.doneAt ?? b.addedAt).getTime() - new Date(a.doneAt ?? a.addedAt).getTime());
  const candidateMediaRecords = candidateMedia(appState)
    .slice()
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  const fulfilledWishes = appState.wishes.filter((w) => w.status === "fulfilled").sort((a, b) => new Date(b.fulfilledAt ?? b.addedAt).getTime() - new Date(a.fulfilledAt ?? a.addedAt).getTime());
  const pendingItems = (appState.pendingReview ?? []).map((id) => appState.keeps.find((k) => k.id === id)).filter((k): k is Keep => !!k);
  const activeGoals = (appState.goals ?? []).slice().sort((a, b) => new Date(b.checkIns?.[0]?.at ?? b.addedAt).getTime() - new Date(a.checkIns?.[0]?.at ?? a.addedAt).getTime());

  // メディアは自動では増えない: マガジンで実行済みにしたもの／通知で「行った」を
  // 選んだもの／自分で+から手動記録したもの、の3経路だけがrecords.mediaに入る。
  const mediaLabel: Record<MediaKindId, string> = { movie: "CINEMA", exhibition: "EXHIBITION", live: "LIVE", book: "BOOK", album: "MUSIC" };

  // エリアを親、そのエリアで実行したKeepを子とするフォルダー構造
  const areaGroups = new Map<string, Keep[]>();
  doneKeeps.filter((k) => k.area && k.area !== "—").forEach((k) => {
    const area = k.area!;
    if (!areaGroups.has(area)) areaGroups.set(area, []);
    areaGroups.get(area)!.push(k);
  });
  const areaSections = Array.from(areaGroups.entries()).map(([area, keeps]) => {
    const sorted = keeps.slice().sort((a, b) => new Date(b.doneAt ?? b.keptAt).getTime() - new Date(a.doneAt ?? a.keptAt).getTime());
    return { area, keeps: sorted, lastAt: sorted[0].doneAt ?? sorted[0].keptAt };
  }).sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());

  const totalCount = doneKeeps.length + doneMediaRecords.length + fulfilledWishes.length;

  // 日付別ビュー: 実際にやった(done)ものを、実行した日ごとにまとめ直す。
  // 過去のマガジンを別途保存する仕組みは持たず、既存のdoneAt/fulfilledAtから
  // その場で日付ごとのバインダーを組み立てる。
  const dayGroups = new Map<string, { label: string; entries: DayEntry[]; lastAt: string }>();
  const pushToDay = (iso: string, entry: DayEntry) => {
    const { key, label } = dayInfo(iso);
    if (!dayGroups.has(key)) dayGroups.set(key, { label, entries: [], lastAt: iso });
    const g = dayGroups.get(key)!;
    g.entries.push(entry);
    if (new Date(iso).getTime() > new Date(g.lastAt).getTime()) g.lastAt = iso;
  };
  doneKeeps.forEach((k) => {
    const at = k.doneAt ?? k.keptAt;
    pushToDay(at, {
      key: `keep-${k.id}`, title: k.title, image: k.images?.[0], color: k.color,
      sub: k.area && k.area !== "—" ? k.area : k.category,
      binderItem: k.images && k.images.length > 0 ? { title: k.title, category: k.category, images: k.images, meta: k.meta, sourceUrl: k.sourceUrl, sourceLabel: k.sourceLabel } : undefined,
    });
  });
  doneMediaRecords.forEach((r) => {
    const at = r.doneAt ?? r.addedAt;
    pushToDay(at, {
      key: `media-${r.id}`, title: r.title, image: r.image, color: r.color, label: mediaLabel[r.kind],
      sub: r.creator || shortDate(at),
      binderItem: r.image ? { title: r.title, category: mediaKindOf(r.kind).label, images: [r.image], meta: r.creator ? [r.creator] : [] } : undefined,
    });
  });
  fulfilledWishes.forEach((w) => {
    const at = w.fulfilledAt ?? w.addedAt;
    pushToDay(at, { key: `wish-${w.id}`, title: w.title, color: catOf(w.categoryId).color, label: "WISH", sub: shortDate(at) });
  });
  const daySections = Array.from(dayGroups.values()).sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());

  const addMedia = ({ kind, title, creator }: { kind: MediaKindId; title: string; creator: string }) => {
    haptic();
    const next = structuredClone(appState);
    next.records = next.records ?? { media: [] };
    const now = new Date().toISOString();
    next.records.media.unshift({ id: `media-${Date.now()}`, kind, title, creator, addedAt: now, status: "done", doneAt: now, color: POSTER_PALETTE[hashStr(title) % POSTER_PALETTE.length] });
    persist(next);
  };
  const toggleGood = (id: string) => {
    haptic(6);
    const next = structuredClone(appState);
    const r = next.records.media.find((x) => x.id === id);
    if (r) r.good = !r.good;
    persist(next);
  };
  // KEEPしたメディア(candidate)を「読んだ/観た/聴いた」で実際にやったログ(done)へ進める
  const markMediaDone = (id: string) => {
    haptic(10);
    const next = structuredClone(appState);
    const r = next.records.media.find((x) => x.id === id);
    if (r) {
      r.status = "done";
      r.doneAt = new Date().toISOString();
    }
    persist(next);
  };
  const resolvePending = (id: string, went: boolean) => {
    haptic(10);
    const next = structuredClone(appState);
    next.pendingReview = (next.pendingReview ?? []).filter((x) => x !== id);
    const k = next.keeps.find((x) => x.id === id);
    if (k) {
      if (went) {
        k.status = "done";
        k.doneAt = new Date().toISOString();
        const mediaKind = inferMediaKind(k.category);
        if (mediaKind) {
          next.records = next.records ?? { media: [] };
          next.records.media.unshift({ id: `media-${Date.now()}`, kind: mediaKind, title: k.title, creator: "", addedAt: k.doneAt, status: "done", doneAt: k.doneAt, image: k.images?.[0], color: k.color, sourceKeepId: k.id });
        }
      } else {
        k.status = "candidate";
      }
    }
    persist(next);
  };

  return (
    <>
      <Masthead title="記録" en="YOUR STORY SO FAR" statValue={totalCount} statLabel="件の記録" />
      <main style={{ flex: 1, paddingTop: 18, paddingBottom: 32 }}>

        {pendingItems.length > 0 && (
          <section style={{ marginBottom: 26 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.22em", color: RUST, marginBottom: 10 }}>行きましたか？</div>
            {pendingItems.map((k) => (
              <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#FBF3EC", border: "1px solid rgba(168,85,47,0.25)", borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ flex: 1, fontFamily: SERIF, fontWeight: 700, fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.title}</div>
                <button onClick={() => resolvePending(k.id, true)} style={{ flexShrink: 0, padding: "8px 12px", background: GREEN, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>行った</button>
                <button onClick={() => resolvePending(k.id, false)} style={{ flexShrink: 0, padding: "8px 12px", background: "transparent", color: "#5A5A54", border: "1px solid rgba(23,23,21,0.2)", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>行かなかった</button>
              </div>
            ))}
          </section>
        )}

        {activeGoals.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E" }}>目標</span>
              <button onClick={() => goTab("wish")} style={{ background: "none", border: "none", color: BLUE, fontSize: 10.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>すべて見る</button>
            </div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}>
              {activeGoals.map((g) => {
                const latest = g.checkIns?.[0];
                return (
                  <button key={g.id} onClick={() => goTab("wish")} style={{ flexShrink: 0, width: 168, textAlign: "left", background: PAPER, border: `1px solid ${HAIRLINE}`, borderRadius: 14, padding: "13px 15px", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <Sprout size={13} color={GREEN} />
                      <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 13.5 }}>{g.title}</span>
                    </div>
                    <p style={{ fontSize: 10.5, color: latest ? "#5A5A54" : "#9A988E", lineHeight: 1.6, margin: 0, fontStyle: latest ? "normal" : "italic", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {latest ? latest.text : "まだ記録がありません"}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", margin: "8px 2px 18px", paddingTop: 20, borderTop: `2px solid ${INK}` }}>
          <div>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 17 }}>実際にやったログ</div>
            <div style={{ fontSize: 9, letterSpacing: "0.24em", color: "#9A988E", marginTop: 3 }}>THE LOG</div>
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {([{ id: "list" as const, label: "リスト" }, { id: "date" as const, label: "日付" }]).map((m) => (
              <button key={m.id} onClick={() => setViewMode(m.id)} style={{
                padding: "5px 12px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 10.5, fontWeight: 700,
                background: viewMode === m.id ? INK : "transparent", color: viewMode === m.id ? PAPER : "#7A7A72",
                border: `1px solid ${viewMode === m.id ? INK : "rgba(23,23,21,0.2)"}`,
              }}>{m.label}</button>
            ))}
          </div>
        </div>

        {viewMode === "list" ? (
          <>
            <section style={{ marginBottom: 30 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E" }}>メディア</span>
                <button onClick={() => setAddingMedia(true)} aria-label="メディアを記録" style={{
                  width: 28, height: 28, borderRadius: "50%", border: "1.5px solid rgba(23,23,21,0.25)", background: "transparent",
                  color: "#5A5A54", cursor: "pointer", fontSize: 15, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                }}>＋</button>
              </div>
              {doneMediaRecords.length === 0 ? (
                <p style={{ fontSize: 11.5, color: "#9A988E" }}>マガジンで✓にしたもの、通知で「行った」を選んだもの、＋から手動記録したものが並びます。</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {doneMediaRecords.map((r) => (
                    <PosterCard key={r.id} image={r.image} color={r.color} title={r.title} sub={r.creator || shortDate(r.doneAt ?? r.addedAt)} label={mediaLabel[r.kind]}
                      good={!!r.good} onToggleGood={() => toggleGood(r.id)}
                      onClick={r.image ? () => setBinderItem({ title: r.title, category: mediaKindOf(r.kind).label, images: [r.image!], meta: r.creator ? [r.creator] : [] }) : undefined} />
                  ))}
                </div>
              )}
            </section>

            {areaSections.length > 0 && (
              <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 12 }}>行った場所</div>
            )}
            {areaSections.map((sec) => (
              <AreaFolder key={sec.area} area={sec.area} keeps={sec.keeps} onOpenItem={setBinderItem} />
            ))}

            {fulfilledWishes.length > 0 && (
              <section style={{ margin: "28px 0 0" }}>
                <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 12 }}>叶えた願望</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {fulfilledWishes.map((w) => (
                    <PosterCard key={w.id} image={null} color={catOf(w.categoryId).color} title={w.title} sub={shortDate(w.fulfilledAt ?? w.addedAt)} label="WISH" />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            {daySections.length === 0 ? (
              <p style={{ fontSize: 11.5, color: "#9A988E", padding: "4px 2px" }}>まだ記録がありません。</p>
            ) : daySections.map((sec) => (
              <DayFolder key={sec.label} label={sec.label} entries={sec.entries} onOpenItem={setBinderItem} />
            ))}
          </>
        )}

        {viewMode === "list" && totalCount === 0 && pendingItems.length === 0 && (
          <div style={{ padding: "36px 4px", textAlign: "center" }}>
            <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>まだ記録がありません。</div>
            <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>実行タブのマガジンで✓にすると、行った場所が自動でここに並びます。メディアは＋から記録できます。</p>
          </div>
        )}

        <div style={{ margin: "36px 2px 18px", paddingTop: 20, borderTop: `2px solid ${INK}` }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 17 }}>KEEP</div>
          <div style={{ fontSize: 9, letterSpacing: "0.24em", color: "#9A988E", marginTop: 3 }}>STOCKED, NOT YET DONE</div>
        </div>

        {candidateMediaRecords.length > 0 && (
          <section style={{ marginBottom: 30 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 12 }}>KEEPしたメディア</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {candidateMediaRecords.map((r) => (
                <PosterCard key={r.id} image={r.image} color={r.color} title={r.title} sub={r.creator || shortDate(r.addedAt)} label={mediaLabel[r.kind]}
                  action={{ label: mediaKindOf(r.kind).doneActionLabel, onClick: () => markMediaDone(r.id) }}
                  onClick={r.image ? () => setBinderItem({ title: r.title, category: mediaKindOf(r.kind).label, images: [r.image!], meta: r.creator ? [r.creator] : [] }) : undefined} />
              ))}
            </div>
          </section>
        )}

        <section>
          <button onClick={() => setShelfOpen(!shelfOpen)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E" }}>候補中のKeep（{appState.keeps.filter((k) => k.status !== "done").length}）</span>
            <ChevronDown size={12} style={{ transform: shelfOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "#9A988E" }} />
          </button>
          {shelfOpen && <ShelfList appState={appState} persist={persist} />}
        </section>
      </main>

      {addingMedia && <AddMediaSheet onAdd={addMedia} onClose={() => setAddingMedia(false)} />}
      <BinderModal item={binderItem} onClose={() => setBinderItem(null)} />
    </>
  );
}
