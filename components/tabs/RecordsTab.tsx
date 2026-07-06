"use client";

import { BookOpen, Film, MapPin, Music, Music2, Palette, Sprout } from "lucide-react";
import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { BinderModal, type BinderItem, type IconType, Masthead, PosterCard } from "@/components/common";
import { BLUE, GREEN, INK, PAPER, RUST, SANS, SERIF, SOFT_SHADOW, catOf, mediaKindOf } from "@/lib/constants";
import { dayInfo, haptic, img, inferMediaKind, shortDate } from "@/lib/helpers";
import type { Keep, MediaKindId, MediaRecord, TabProps } from "@/lib/types";

const MEDIA_ICON: Record<MediaKindId, IconType> = { movie: Film, exhibition: Palette, live: Music2, book: BookOpen, album: Music };

// 「バインダー」タイル。正方形に近いタイルの中に写真が数枚重なった束を
// 見せ、タップで中身のカードグリップをシートで開く。エリア別・メディアの
// ジャンル別・日付別で共用し、デザインとサイズを統一している。
// (以前はタイルの直下に展開するアコーディオン式だったが、閉じた状態の
// 展開パネルがCSS Grid/flexboxどちらでも「幅ゼロでも1行分場所を使う」
// ため隣のタイルが2列に並ばなくなる問題があり、タップでシートを開く
// 方式に変更した。)
function BinderTile({ title, count, coverImages, coverColor, icon: Icon, onClick }: {
  title: string; count: number; coverImages: string[]; coverColor?: string; icon?: IconType; onClick: () => void;
}) {
  const rotations = [-8, 5, -3];
  return (
    <button onClick={onClick} style={{ minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
      <div style={{
        position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: 18, background: PAPER,
        border: "none", boxShadow: SOFT_SHADOW,
        overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {coverImages.length === 0 ? (
          <div style={{ width: "56%", height: "56%", borderRadius: 14, background: coverColor ?? "#5A5A54", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {Icon && <Icon size="46%" strokeWidth={1.1} color="rgba(255,255,255,0.85)" />}
          </div>
        ) : (
          <div style={{ position: "relative", width: "62%", height: "62%" }}>
            {coverImages.slice(0, 3).map((seed, i) => (
              <img key={seed} src={img(seed, 220, 220)} alt="" style={{
                position: "absolute", top: "50%", left: "50%", width: "82%", height: "82%", objectFit: "cover", borderRadius: 12,
                border: "3px solid #fff", boxShadow: "0 5px 14px rgba(23,23,21,0.25)",
                transform: `translate(-50%, -50%) rotate(${rotations[i]}deg) translate(${i * 7}px, ${i * -5}px)`, zIndex: i,
              }} />
            ))}
          </div>
        )}
        <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(23,23,21,0.6)", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "3px 9px" }}>{count}</div>
      </div>
      <div style={{ marginTop: 8, fontFamily: SERIF, fontWeight: 700, fontSize: 13.5, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
    </button>
  );
}

function BinderGrid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>;
}

// タップしたバインダーの中身を見せる共通シート。開くとスライドアップ
// アニメーションとともにカードグリッドが現れる(BottomSheet標準の動き)。
function BinderContentsSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <BottomSheet onClose={onClose} maxHeight="80vh">
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 17, margin: "4px 0 16px" }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingBottom: 8 }}>
        {children}
      </div>
    </BottomSheet>
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

interface OpenFolder {
  title: string;
  content: React.ReactNode;
}

// ==================================================================
// アプリのホーム。「実際にやった/読んだ/叶えた」ことだけが積み上がる。
// KEEPしただけの未実行のものはストックタブ・目標タブが担当する。
// ==================================================================
export function RecordsTab({ appState, persist, goTab }: TabProps) {
  const [binderItem, setBinderItem] = useState<BinderItem | null>(null);
  const [openFolder, setOpenFolder] = useState<OpenFolder | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "date">("list");

  const doneKeeps = appState.keeps.filter((k) => k.status === "done");
  // メディアは「KEEPしただけ(keep)」と「実際にやった(done)」を分けて扱う。
  // status省略は既存の3経路(マガジン✓/行きましたか通知/手動+)由来でdone扱い。
  const doneMediaRecords = (appState.records?.media ?? [])
    .filter((r) => (r.status ?? "done") === "done")
    .sort((a, b) => new Date(b.doneAt ?? b.addedAt).getTime() - new Date(a.doneAt ?? a.addedAt).getTime());
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

  // メディアをジャンル(kind)ごとにまとめ、エリアフォルダーと同じバインダー
  // タイルで統一して見せる。カードが大きすぎて画面を占有する問題への対応。
  const mediaGroups = new Map<MediaKindId, MediaRecord[]>();
  doneMediaRecords.forEach((r) => {
    if (!mediaGroups.has(r.kind)) mediaGroups.set(r.kind, []);
    mediaGroups.get(r.kind)!.push(r);
  });
  const mediaSections = Array.from(mediaGroups.entries()).map(([kind, records]) => {
    const sorted = records.slice().sort((a, b) => new Date(b.doneAt ?? b.addedAt).getTime() - new Date(a.doneAt ?? a.addedAt).getTime());
    return { kind, records: sorted, lastAt: sorted[0].doneAt ?? sorted[0].addedAt };
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

  const toggleGood = (id: string) => {
    haptic(6);
    const next = structuredClone(appState);
    const r = next.records.media.find((x) => x.id === id);
    if (r) r.good = !r.good;
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
      <Masthead title="記録" en="積み上がった、これまでの記録" statValue={totalCount} statLabel="件の記録" />
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
              <button onClick={() => goTab("goals")} style={{ background: "none", border: "none", color: BLUE, fontSize: 10.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>すべて見る</button>
            </div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}>
              {activeGoals.map((g) => {
                const latest = g.checkIns?.[0];
                return (
                  <button key={g.id} onClick={() => goTab("goals")} style={{ flexShrink: 0, width: 168, textAlign: "left", background: PAPER, border: "none", borderRadius: 16, padding: "13px 15px", cursor: "pointer", boxShadow: SOFT_SHADOW }}>
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
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 17 }}>実行済み</div>
            <div style={{ fontSize: 9, letterSpacing: "0.24em", color: "#9A988E", marginTop: 3 }}>DONE</div>
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
            {mediaSections.length > 0 && (
              <section style={{ marginBottom: 30 }}>
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E" }}>メディア</span>
                </div>
                <BinderGrid>
                  {mediaSections.map((sec) => {
                    const kindLabel = mediaKindOf(sec.kind).label;
                    const covers = sec.records.filter((r) => r.image).slice(0, 3).map((r) => r.image!);
                    return (
                      <BinderTile key={sec.kind} title={kindLabel} count={sec.records.length} coverImages={covers} coverColor={sec.records[0]?.color} icon={MEDIA_ICON[sec.kind]}
                        onClick={() => setOpenFolder({
                          title: kindLabel,
                          content: sec.records.map((r) => (
                            <PosterCard key={r.id} image={r.image} color={r.color} title={r.title} sub={r.creator || shortDate(r.doneAt ?? r.addedAt)} label={mediaLabel[r.kind]}
                              icon={MEDIA_ICON[r.kind]} kept={r.origin !== "manual"}
                              good={!!r.good} onToggleGood={() => toggleGood(r.id)}
                              onClick={r.image ? () => setBinderItem({ title: r.title, category: mediaKindOf(r.kind).label, images: [r.image!], meta: r.creator ? [r.creator] : [] }) : undefined} />
                          )),
                        })} />
                    );
                  })}
                </BinderGrid>
              </section>
            )}

            {areaSections.length > 0 && (
              <section style={{ marginBottom: 30 }}>
                <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 12 }}>行った場所</div>
                <BinderGrid>
                  {areaSections.map((sec) => {
                    const covers = sec.keeps.filter((k) => k.images?.[0]).slice(0, 3).map((k) => k.images![0]);
                    return (
                      <BinderTile key={sec.area} title={sec.area} count={sec.keeps.length} coverImages={covers} coverColor={sec.keeps[0]?.color} icon={MapPin}
                        onClick={() => setOpenFolder({
                          title: sec.area,
                          content: sec.keeps.map((k) => (
                            <PosterCard key={k.id} image={k.images?.[0]} color={k.color} title={k.title} sub={shortDate(k.doneAt ?? k.keptAt)}
                              icon={MapPin} kept={k.origin !== "manual"}
                              onClick={k.images && k.images.length > 0 ? () => setBinderItem(k) : undefined} />
                          )),
                        })} />
                    );
                  })}
                </BinderGrid>
              </section>
            )}

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
            ) : (
              <BinderGrid>
                {daySections.map((sec) => {
                  const covers = sec.entries.filter((e) => e.image).slice(0, 3).map((e) => e.image!);
                  return (
                    <BinderTile key={sec.label} title={sec.label} count={sec.entries.length} coverImages={covers} coverColor={sec.entries[0]?.color}
                      onClick={() => setOpenFolder({
                        title: sec.label,
                        content: sec.entries.map((e) => (
                          <PosterCard key={e.key} image={e.image} color={e.color} title={e.title} sub={e.sub} label={e.label}
                            onClick={e.binderItem ? () => setBinderItem(e.binderItem!) : undefined} />
                        )),
                      })} />
                  );
                })}
              </BinderGrid>
            )}
          </>
        )}

        {viewMode === "list" && totalCount === 0 && pendingItems.length === 0 && (
          <div style={{ padding: "36px 4px", textAlign: "center" }}>
            <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>まだ記録がありません。</div>
            <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>実行タブで行動を記録すると、ここに積み上がります。</p>
          </div>
        )}
      </main>

      {openFolder && <BinderContentsSheet title={openFolder.title} onClose={() => setOpenFolder(null)}>{openFolder.content}</BinderContentsSheet>}
      <BinderModal item={binderItem} onClose={() => setBinderItem(null)} />
    </>
  );
}
