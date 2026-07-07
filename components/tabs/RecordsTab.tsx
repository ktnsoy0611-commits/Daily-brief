"use client";

import { BookOpen, Film, MapPin, Music, Music2, Paperclip, Palette } from "lucide-react";
import { useState } from "react";
import { BottomSheet, closeOnSelfClick } from "@/components/BottomSheet";
import { BinderModal, type BinderItem, GoalCard, type IconType, Masthead, PosterCard } from "@/components/common";
import { BLUE, GREEN, INK, ITEM_CARD_ASPECT, PAPER, RUST, SANS, SERIF, catOf, mediaKindOf } from "@/lib/constants";
import { dayInfo, haptic, img, inferMediaKind, shade, shortDate } from "@/lib/helpers";
import type { Keep, MediaKindId, MediaRecord, TabProps } from "@/lib/types";

const MEDIA_ICON: Record<MediaKindId, IconType> = { movie: Film, exhibition: Palette, live: Music2, book: BookOpen, album: Music };

// カード本体の見た目だけをPosterCardから借りた、キャプションなしの
// 小さな縮小カード。バインダータイルの中で複数枚スタックして見せる用。
function MiniCard({ image, color, icon: Icon }: { image?: string; color?: string; icon?: IconType }) {
  const fill = color ?? "#5A5A54";
  return (
    <div style={{
      width: "100%", aspectRatio: ITEM_CARD_ASPECT, borderRadius: 10, overflow: "hidden", position: "relative",
      border: "2px solid #fff", boxShadow: "0 6px 14px rgba(28,28,30,0.22)",
      background: image ? fill : `linear-gradient(135deg, ${shade(fill, 14)} 0%, ${fill} 45%, ${shade(fill, -18)} 100%)`,
    }}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img(image, 200, 260)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        Icon && (
          <div style={{ position: "absolute", bottom: "-14%", right: "-12%", width: "60%", aspectRatio: "1 / 1", transform: "rotate(-16deg)", opacity: 0.18 }}>
            <Icon size="100%" strokeWidth={1} color="#fff" />
          </div>
        )
      )}
    </div>
  );
}

// バックの位置・フロントの位置・クリップの位置は常に固定(データに関わらず
// 同じ座標)。枚数によって並びが変わるとタイルごとに重心がズレてグリッドが
// 整列して見えなくなるため、常にこの2枚構成にしている。フロントのカードを
// 大きく取り、写真そのものが主役として見えるようにした。
// 数値はすべて「カードの縦横比(3:4)×タイルの縦横比(4:5)」から逆算した、
// タイルの内側(0〜100%)に確実に収まる値。以前はここが計算違いで、回転した
// フロントカードの下端がタイル枠の外(タイトル文字の位置)まではみ出して
// しまっていた。
const BINDER_FRONT = { left: "8%", top: "15%", width: "68%", rotate: -3 };
const BINDER_BACK = { left: "34%", top: "3%", width: "56%", rotate: 7 };

// 金属のクリップらしい厚み・立体感を出すため、暗いトーンのコピーを1枚
// 少しずらして下に敷き、明るいクリーム色のコピーを上に重ねる。lucideの
// アイコンをそのまま1色で置くだけだと安っぽく見えるための工夫。
function BinderClip({ size = 27, rotate = -22 }: { size?: number; rotate?: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size, transform: `rotate(${rotate}deg)`, filter: "drop-shadow(0 3px 4px rgba(28,28,30,0.4))" }}>
      <Paperclip size={size} strokeWidth={2.6} color="#9C9482" style={{ position: "absolute", top: 1.5, left: 1 }} />
      <Paperclip size={size} strokeWidth={2.1} color="#F5F1E4" style={{ position: "absolute", top: 0, left: 0 }} />
    </div>
  );
}

// 「バインダー」タイル。フォルダー型の入れ物は撤廃し、他タブのCardStackと
// 同じ視覚言語(スタックしたカード本体が主役)に揃えた上で、左上の角を
// クリップで留めたような見た目にしている。2列グリッドで、一画面に4枚ほど
// 収まるサイズ感。タップで中身のカードグリッドをシートで開く。エリア別・
// メディアのジャンル別・日付別で共用し、デザインとサイズを統一している。
// (以前はタイルの直下に展開するアコーディオン式だったが、閉じた状態の
// 展開パネルがCSS Grid/flexboxどちらでも「幅ゼロでも1行分場所を使う」
// ため隣のタイルが2列に並ばなくなる問題があり、タップでシートを開く
// 方式に変更した。)
function BinderTile({ title, count, coverImages, coverColor, icon: Icon, onClick }: {
  title: string; count: number; coverImages: string[]; coverColor?: string; icon?: IconType; onClick: () => void;
}) {
  const showBack = count > 1;
  return (
    <button onClick={onClick} style={{ minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 5" }}>
        {showBack && (
          <div style={{ position: "absolute", left: BINDER_BACK.left, top: BINDER_BACK.top, width: BINDER_BACK.width, transform: `rotate(${BINDER_BACK.rotate}deg)`, transformOrigin: "50% 100%", zIndex: 1, opacity: 0.85 }}>
            <MiniCard image={coverImages[1]} color={coverColor} icon={Icon} />
          </div>
        )}
        <div style={{ position: "absolute", left: BINDER_FRONT.left, top: BINDER_FRONT.top, width: BINDER_FRONT.width, transform: `rotate(${BINDER_FRONT.rotate}deg)`, transformOrigin: "50% 100%", zIndex: 2 }}>
          <MiniCard image={coverImages[0]} color={coverColor} icon={Icon} />
        </div>
        {/* フロントカードの左上の角をとめるクリップ */}
        <div style={{ position: "absolute", left: "4%", top: "8%", zIndex: 3 }}>
          <BinderClip />
        </div>
      </div>
      <div style={{ marginTop: 8, fontFamily: SERIF, fontWeight: 700, fontSize: 13.5, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
    </button>
  );
}

function BinderGrid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, rowGap: 22 }}>{children}</div>;
}

// タップしたバインダーの中身を見せる共通シート。カード自体が完結した
// ビジュアルを持つので、白い台紙には包まずブラー背景の上に直接浮かせる。
// タイトルはブラー越しでも読めるよう明るい色にしている。
function BinderContentsSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <BottomSheet onClose={onClose} maxHeight="74vh">
      {(requestClose) => (
        <>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 17, color: "#fff", margin: "8px 4px 16px", textShadow: "0 2px 8px rgba(0,0,0,0.35)" }}>{title}</div>
          <div onClick={closeOnSelfClick(requestClose)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "0 4px 8px" }}>
            {children}
          </div>
        </>
      )}
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
export function RecordsTab({ appState, persist, goTab, profileButton }: TabProps) {
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
      <Masthead title="記録" statValue={totalCount} statLabel="件の記録" corner={profileButton} />
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
              {activeGoals.map((g) => (
                <GoalCard key={g.id} title={g.title} recentCheckIns={g.checkIns ?? []} checkInCount={g.checkIns?.length ?? 0}
                  size={120} onClick={() => goTab("goals")} />
              ))}
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
