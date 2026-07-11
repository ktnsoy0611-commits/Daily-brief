"use client";

import { useState } from "react";
import { BottomSheet, closeOnSelfClick } from "@/components/BottomSheet";
import { BinderCoverflowRow, dateAccent, goalAccent, GOAL_BASE, MEDIA_ACCENT, placeAccent, type Accent, type BinderShelfItem } from "@/components/Binder";
import { BinderModal, type BinderItem, Masthead, PosterCard } from "@/components/common";
import { KIND_ICON } from "@/components/tabs/StockTab";
import { GOLD, GREEN, INK, PAPER, RUST, SANS, SERIF, itemKindOf } from "@/lib/constants";
import { dayInfo, haptic, hasPlace, isWork, originBadge, shortDate } from "@/lib/helpers";
import type { Item, ItemKind, TabProps } from "@/lib/types";

// 表紙は常に白なので、この値は背表紙の単色フォールバック(accent未指定時)
// としてのみ使う。
const PLACE_BASE = "#CFCCC3";
const MEDIA_BASE = "#8C897F";
// ウィッシュのバインダー。願いが形になったカードを綴じる特別な1冊(以上)。
const WISH_BASE = GOLD;
const WISH_ACCENT: Accent = { kind: "target", color: GOLD };
// 1冊のバインダーに綴じるカードの上限。超えたぶんは同じデザインの
// 「続き」のバインダー(VOL.2, VOL.3, …)へ繰り越す。
const BINDER_CAPACITY = 30;

// タップしたバインダーの中身を見せる共通シート。カード自体が完結した
// ビジュアルを持つので、白い台紙には包まずブラー背景の上に直接浮かせる。
// タイトルはブラー越しでも読めるよう明るい色にしている。
function BinderContentsSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <BottomSheet onClose={onClose} maxHeight="74vh">
      {(requestClose) => (
        <>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 17, color: "#fff", margin: "8px 4px 16px", textShadow: "0 2px 8px rgba(0,0,0,0.35)" }}>{title}</div>
          <div onPointerDown={closeOnSelfClick(requestClose)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "0 4px 8px" }}>
            {children}
          </div>
        </>
      )}
    </BottomSheet>
  );
}

interface OpenFolder {
  title: string;
  content: React.ReactNode;
}

// 配列をn件ずつの束に分ける(ウィッシュバインダーの「続き」用)。
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ==================================================================
// アプリのホーム。「実際にやった/読んだ/叶えた」ことだけが積み上がる。
// KEEPしただけの未実行のものはストックタブ・ゴールタブが担当する。
// 棚の区分はストックタブ・プランタブと共通の語彙: 作品(種類ごと)・
// 行き先(エリアごと)・モノ・ゴール・ウィッシュ。1つのItemは複数の棚に
// 立ちうる(場所で観た展覧会は「行き先」のエリアの1冊にも「作品」の
// 展覧会の1冊にも綴じられる。同じ記録を「どこへ行ったか」と「何を観たか」
// の両方の索引から引けるようにするための意図的な重複)。
// ==================================================================
export function RecordsTab({ appState, persist, goTab, profileButton }: TabProps) {
  const [binderItem, setBinderItem] = useState<BinderItem | null>(null);
  const [openFolder, setOpenFolder] = useState<OpenFolder | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "date">("list");

  const doneItems = appState.items
    .filter((i) => i.status === "done")
    .sort((a, b) => new Date(b.doneAt ?? b.addedAt).getTime() - new Date(a.doneAt ?? a.addedAt).getTime());
  const fulfilledWishes = appState.wishes.filter((w) => w.status === "fulfilled").sort((a, b) => new Date(b.fulfilledAt ?? b.addedAt).getTime() - new Date(a.fulfilledAt ?? a.addedAt).getTime());
  const pendingItems = (appState.pendingReview ?? []).map((id) => appState.items.find((i) => i.id === id)).filter((i): i is Item => !!i);
  const goals = (appState.goals ?? []).slice().sort((a, b) => new Date(b.checkIns?.[0]?.at ?? b.addedAt).getTime() - new Date(a.checkIns?.[0]?.at ?? a.addedAt).getTime());

  // ウィッシュから生まれたカード(origin:"wish")は、実行の有無を問わず
  // すべて専用のバインダーに綴じる。「願いがどれだけ形になってきたか」の
  // 軌跡そのものを1冊(超えたら続き)として見せるため。古いものから順に
  // 綴じていき、あふれたぶんが新しい巻(VOL.2, …)になる。
  const wishBornAsc = appState.items
    .filter((i) => i.origin === "wish")
    .sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
  const wishVolumes = chunk(wishBornAsc, BINDER_CAPACITY);

  const totalCount = doneItems.length + fulfilledWishes.length;

  const itemDetail = (i: Item): BinderItem => ({
    title: i.title, category: i.category ?? itemKindOf(i.kind).label, images: i.images,
    meta: [...(i.meta ?? []), ...(i.creator ? [i.creator] : []), ...(i.price ? [i.price] : [])],
    sourceUrl: i.sourceUrl, sourceLabel: i.sourceLabel,
  });
  const itemCard = (i: Item, opts?: { sub?: string; withGood?: boolean }) => (
    <PosterCard key={i.id} image={i.images?.[0]} color={i.color} title={i.title}
      sub={opts?.sub ?? (i.area && i.area !== "—" ? i.area : (i.creator || shortDate(i.doneAt ?? i.addedAt)))}
      label={itemKindOf(i.kind).en} icon={KIND_ICON[i.kind]} badge={originBadge(i.origin)}
      good={opts?.withGood ? !!i.good : undefined}
      onToggleGood={opts?.withGood ? () => toggleGood(i.id) : undefined}
      onClick={i.images?.length || i.meta?.length ? () => setBinderItem(itemDetail(i)) : undefined} />
  );

  const toggleGood = (id: string) => {
    haptic(6);
    const next = structuredClone(appState);
    const item = next.items.find((x) => x.id === id);
    if (item) item.good = !item.good;
    persist(next);
  };
  // 「行きましたか？」の解決。行った=doneへ進めるだけでよい(Itemの統一に
  // より、以前あった「作品のコピーをrecords.mediaへ増やす」変換は不要)。
  const resolvePending = (id: string, went: boolean) => {
    haptic(10);
    const next = structuredClone(appState);
    next.pendingReview = (next.pendingReview ?? []).filter((x) => x !== id);
    const item = next.items.find((x) => x.id === id);
    if (item) {
      if (went) {
        item.status = "done";
        item.doneAt = new Date().toISOString();
      } else {
        item.status = "candidate";
      }
    }
    persist(next);
  };

  // ---- 作品: 種類(映画・展覧会・…)ごとに1冊 ----
  const workGroups = new Map<ItemKind, Item[]>();
  doneItems.filter(isWork).forEach((i) => {
    if (!workGroups.has(i.kind)) workGroups.set(i.kind, []);
    workGroups.get(i.kind)!.push(i);
  });
  const workRowItems: BinderShelfItem[] = Array.from(workGroups.entries())
    .map(([kind, items]) => ({ kind, items, lastAt: items[0].doneAt ?? items[0].addedAt }))
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
    .map((sec) => {
      const def = itemKindOf(sec.kind);
      return {
        key: sec.kind, color: MEDIA_BASE, eyebrowLabel: def.en, accent: MEDIA_ACCENT[sec.kind as keyof typeof MEDIA_ACCENT],
        title: def.label, count: sec.items.length,
        footer: <div style={{ fontSize: 9, color: "rgba(28,28,30,0.6)", fontWeight: 700, textAlign: "center" }}>{sec.items.length}件・タップで見る</div>,
        onOpen: () => setOpenFolder({
          title: def.label,
          content: sec.items.map((i) => itemCard(i, { sub: i.creator || shortDate(i.doneAt ?? i.addedAt), withGood: true })),
        }),
      };
    });

  // ---- 行き先: エリアごとに1冊 ----
  const areaGroups = new Map<string, Item[]>();
  doneItems.filter(hasPlace).forEach((i) => {
    const area = i.area!;
    if (!areaGroups.has(area)) areaGroups.set(area, []);
    areaGroups.get(area)!.push(i);
  });
  const destRowItems: BinderShelfItem[] = Array.from(areaGroups.entries())
    .map(([area, items]) => ({ area, items, lastAt: items[0].doneAt ?? items[0].addedAt }))
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
    .map((sec) => ({
      key: sec.area, color: PLACE_BASE, eyebrowLabel: "PLACE", accent: placeAccent(sec.area),
      title: sec.area, count: sec.items.length,
      footer: <div style={{ fontSize: 9, color: "rgba(28,28,30,0.6)", fontWeight: 700, textAlign: "center" }}>{sec.items.length}件・タップで見る</div>,
      onOpen: () => setOpenFolder({
        title: sec.area,
        content: sec.items.map((i) => itemCard(i, { sub: shortDate(i.doneAt ?? i.addedAt) })),
      }),
    }));

  // ---- モノ: 買ったものをまとめた1冊 ----
  const doneThings = doneItems.filter((i) => i.kind === "thing");
  const thingRowItems: BinderShelfItem[] = doneThings.length === 0 ? [] : [{
    key: "things", color: MEDIA_BASE, eyebrowLabel: "THING", accent: MEDIA_ACCENT.album,
    title: "買ったモノ", count: doneThings.length,
    footer: <div style={{ fontSize: 9, color: "rgba(28,28,30,0.6)", fontWeight: 700, textAlign: "center" }}>{doneThings.length}件・タップで見る</div>,
    onOpen: () => setOpenFolder({
      title: "買ったモノ",
      content: doneThings.map((i) => itemCard(i, { sub: i.price ?? shortDate(i.doneAt ?? i.addedAt) })),
    }),
  }];

  // ---- ゴール ----
  const goalRowItems: BinderShelfItem[] = goals.map((g) => ({
    key: g.id, color: GOAL_BASE, eyebrowLabel: "GOAL", accent: goalAccent(g.id),
    title: g.title, count: g.checkIns?.length ?? 0,
    footer: <div style={{ fontSize: 9, color: "rgba(253,251,245,0.7)", fontWeight: 700, textAlign: "center" }}>{g.checkIns?.length ? `記録${g.checkIns.length}件・タップで見る` : "タップで見る"}</div>,
    onOpen: () => goTab("goals"),
  }));

  // ---- ウィッシュ: 願いが形になったカードの巻(30枚ごとに続きの巻) ----
  // 棚には新しい巻から順に並べる(最新の動きが一番手前に来るように)。
  const wishRowItems: BinderShelfItem[] = wishVolumes
    .map((vol, idx) => ({ vol, volNo: idx + 1 }))
    .reverse()
    .map(({ vol, volNo }) => ({
      key: `wish-vol-${volNo}`, color: WISH_BASE, eyebrowLabel: "WISH", accent: WISH_ACCENT,
      title: volNo === 1 ? "ウィッシュ" : `ウィッシュ VOL.${volNo}`, count: vol.length,
      footer: <div style={{ fontSize: 9, color: "rgba(253,251,245,0.7)", fontWeight: 700, textAlign: "center" }}>{vol.length}件・タップで見る</div>,
      onOpen: () => setOpenFolder({
        title: volNo === 1 ? "ウィッシュ" : `ウィッシュ VOL.${volNo}`,
        // 巻の中では新しいカードが先頭に来るよう降順で見せる。
        content: vol.slice().reverse().map((i) => {
          const wish = appState.wishes.find((w) => w.id === i.sourceWishId);
          return itemCard(i, { sub: wish ? `「${wish.title}」より` : (i.status === "done" ? shortDate(i.doneAt ?? i.addedAt) : "まだこれから") });
        }),
      }),
    }));

  // ---- 日付ビュー: 実行した日ごとに1冊 ----
  interface DayGroup { label: string; items: Item[]; wishes: typeof fulfilledWishes; lastAt: string }
  const dayGroups = new Map<string, DayGroup>();
  const dayOf = (iso: string) => {
    const { key, label } = dayInfo(iso);
    if (!dayGroups.has(key)) dayGroups.set(key, { label, items: [], wishes: [], lastAt: iso });
    const g = dayGroups.get(key)!;
    if (new Date(iso).getTime() > new Date(g.lastAt).getTime()) g.lastAt = iso;
    return g;
  };
  doneItems.forEach((i) => { dayOf(i.doneAt ?? i.addedAt).items.push(i); });
  fulfilledWishes.forEach((w) => { dayOf(w.fulfilledAt ?? w.addedAt).wishes.push(w); });
  const dayRowItems: BinderShelfItem[] = Array.from(dayGroups.values())
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
    .map((sec) => ({
      key: sec.label, color: PLACE_BASE, eyebrowLabel: "DATE", accent: dateAccent(sec.label),
      title: sec.label, count: sec.items.length + sec.wishes.length,
      footer: <div style={{ fontSize: 9, color: "rgba(28,28,30,0.6)", fontWeight: 700, textAlign: "center" }}>{sec.items.length + sec.wishes.length}件・タップで見る</div>,
      onOpen: () => setOpenFolder({
        title: sec.label,
        content: [
          ...sec.items.map((i) => itemCard(i)),
          ...sec.wishes.map((w) => (
            <PosterCard key={`wish-${w.id}`} image={null} color={GOLD} title={w.title} sub={shortDate(w.fulfilledAt ?? w.addedAt)} label="WISH" />
          )),
        ],
      }),
    }));

  // 棚(行)のレイアウトは全行共通: 小さなラベル+BinderCoverflowRow。
  const shelfRow = (title: string, items: BinderShelfItem[]) => items.length > 0 && (
    <section style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 2 }}>{title}</div>
      <BinderCoverflowRow items={items} />
    </section>
  );

  return (
    <>
      <Masthead title="アーカイブ" statValue={totalCount} statLabel="件の記録" corner={profileButton} />
      <main style={{ flex: 1, paddingTop: 18, paddingBottom: 32 }}>

        {pendingItems.length > 0 && (
          <section style={{ marginBottom: 26 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.22em", color: RUST, marginBottom: 10 }}>行きましたか？</div>
            {pendingItems.map((i) => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#FBF3EC", border: "1px solid rgba(168,85,47,0.25)", borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ flex: 1, fontFamily: SERIF, fontWeight: 700, fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</div>
                <button onClick={() => resolvePending(i.id, true)} style={{ flexShrink: 0, padding: "8px 12px", background: GREEN, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>行った</button>
                <button onClick={() => resolvePending(i.id, false)} style={{ flexShrink: 0, padding: "8px 12px", background: "transparent", color: "#5A5A54", border: "1px solid rgba(23,23,21,0.2)", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>行かなかった</button>
              </div>
            ))}
          </section>
        )}

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", margin: "8px 2px 18px", paddingTop: pendingItems.length > 0 ? 20 : 0, borderTop: pendingItems.length > 0 ? `2px solid ${INK}` : "none" }}>
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
            {shelfRow("行き先", destRowItems)}
            {shelfRow("作品", workRowItems)}
            {shelfRow("モノ", thingRowItems)}
            {shelfRow("ゴール", goalRowItems)}
            {shelfRow("ウィッシュ", wishRowItems)}

            {fulfilledWishes.length > 0 && (
              <section style={{ margin: "28px 0 0" }}>
                <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 12 }}>叶えたウィッシュ</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {fulfilledWishes.map((w) => (
                    <PosterCard key={w.id} image={null} color={GOLD} title={w.title} sub={shortDate(w.fulfilledAt ?? w.addedAt)} label="WISH" />
                  ))}
                </div>
              </section>
            )}

            {destRowItems.length === 0 && workRowItems.length === 0 && thingRowItems.length === 0 && goalRowItems.length === 0 && wishRowItems.length === 0 && fulfilledWishes.length === 0 && pendingItems.length === 0 && (
              <div style={{ padding: "36px 4px", textAlign: "center" }}>
                <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>まだ記録がありません。</div>
                <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>プランタブで行動を記録すると、ここに積み上がります。</p>
              </div>
            )}
          </>
        ) : (
          <>
            {dayRowItems.length === 0 ? (
              <p style={{ fontSize: 11.5, color: "#9A988E", padding: "4px 2px" }}>まだ記録がありません。</p>
            ) : (
              <BinderCoverflowRow items={dayRowItems} />
            )}
          </>
        )}
      </main>

      {openFolder && <BinderContentsSheet title={openFolder.title} onClose={() => setOpenFolder(null)}>{openFolder.content}</BinderContentsSheet>}
      <BinderModal item={binderItem} onClose={() => setBinderItem(null)} />
    </>
  );
}
