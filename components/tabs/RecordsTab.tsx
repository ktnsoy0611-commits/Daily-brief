"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { BottomSheet, closeOnSelfClick } from "@/components/BottomSheet";
import { BinderCoverflowRow, dateAccent, EXPERIENCE_ACCENT, goalAccent, GOAL_BASE, MEDIA_ACCENT, placeAccent, thingVolumeAccent, THING_ITEMS_PER_VOLUME, type BinderShelfItem } from "@/components/Binder";
import { BinderModal, type BinderItem, Masthead, PosterCard, rowBtn } from "@/components/common";
import { KIND_ICON } from "@/components/tabs/StockTab";
import { GOLD, GREEN, HAIRLINE, INK, PAPER, RUST, SANS, SERIF, domainDefOf, itemKindOf } from "@/lib/constants";
import { dayInfo, domainOf, haptic, isWishBound, originBadge, pad, shortDate } from "@/lib/helpers";
import type { Item, ItemKind, TabProps, Wish } from "@/lib/types";

// 表紙は常に白なので、この値は背表紙の単色フォールバック(accent未指定時)
// としてのみ使う。
const PLACE_BASE = "#CFCCC3";
const MEDIA_BASE = "#8C897F";

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

// ==================================================================
// アプリのホーム。「実際にやった/読んだ/叶えた」ことだけが積み上がる。
// KEEPしただけの未実行のものはストックタブ・ゴールタブが担当する。
// 棚の区分はストックタブ・プランタブと共通の語彙: バショ(エリアごと)・
// タイケン(種類ごと)・ジョウホウ(種類ごと)・モノ・ゴール。ウィッシュだけは
// バインダー棚ではなく、末尾に「まだ形になっていない願い」も含めた
// 一覧(チェックリスト)として置く。
// ==================================================================
export function RecordsTab({ appState, persist, goTab, profileButton }: TabProps) {
  const [binderItem, setBinderItem] = useState<BinderItem | null>(null);
  const [openFolder, setOpenFolder] = useState<OpenFolder | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "date">("list");
  const [wishDetail, setWishDetail] = useState<Wish | null>(null);

  const doneItems = appState.items
    .filter((i) => i.status === "done")
    .sort((a, b) => new Date(b.doneAt ?? b.addedAt).getTime() - new Date(a.doneAt ?? a.addedAt).getTime());
  const fulfilledWishes = appState.wishes.filter((w) => w.status === "fulfilled");
  const pendingItems = (appState.pendingReview ?? []).map((id) => appState.items.find((i) => i.id === id)).filter((i): i is Item => !!i);
  const goals = (appState.goals ?? []).slice().sort((a, b) => new Date(b.checkIns?.[0]?.at ?? b.addedAt).getTime() - new Date(a.checkIns?.[0]?.at ?? a.addedAt).getTime());

  const totalCount = doneItems.length + fulfilledWishes.length;

  const itemDetail = (i: Item): BinderItem => ({
    title: i.title, category: i.category ?? itemKindOf(i.kind).label, images: i.images,
    meta: [...(i.meta ?? []), ...(i.creator ? [i.creator] : []), ...(i.price ? [i.price] : [])],
    sourceUrl: i.sourceUrl, sourceLabel: i.sourceLabel,
  });
  const itemCard = (i: Item, opts?: { sub?: string; withGood?: boolean }) => (
    <PosterCard key={i.id} image={i.images?.[0]} color={i.color} title={i.title}
      sub={opts?.sub ?? (i.area && i.area !== "—" ? i.area : (i.creator || shortDate(i.doneAt ?? i.addedAt)))}
      label={domainDefOf(domainOf(i)).label} icon={KIND_ICON[i.kind]} badge={originBadge(i.origin)}
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
  // 「行きましたか？」の解決。行った=doneへ進めるだけでよい。
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
  const updateWish = (id: string, patch: Partial<Wish>) => {
    const next = structuredClone(appState);
    const w = next.wishes.find((x) => x.id === id);
    if (w) Object.assign(w, patch);
    persist(next);
  };
  const removeWish = (id: string) => {
    const next = structuredClone(appState);
    next.wishes = next.wishes.filter((x) => x.id !== id);
    persist(next);
  };
  const makeGoal = (w: Wish) => {
    haptic(10);
    const next = structuredClone(appState);
    next.wishes = next.wishes.filter((x) => x.id !== w.id);
    next.goals = next.goals ?? [];
    next.goals.push({ id: `goal-${Date.now()}`, title: w.title, addedAt: new Date().toISOString(), checkIns: [] });
    persist(next);
  };

  // ---- バショ: エリアごとに1冊(domain==="place"のみ。他ドメインが
  // 持つareaはこの棚には出さず、あくまでドメインで分ける) ----
  const areaGroups = new Map<string, Item[]>();
  doneItems.filter((i) => domainOf(i) === "place").forEach((i) => {
    const area = i.area && i.area !== "—" ? i.area : "その他";
    if (!areaGroups.has(area)) areaGroups.set(area, []);
    areaGroups.get(area)!.push(i);
  });
  const placeRowItems: BinderShelfItem[] = Array.from(areaGroups.entries())
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

  // 種類(kind)ごとに1冊、というドメイン共通の組み立て(タイケン・ジョウホウ)。
  // アクセントのデザインコードはドメインごとに別物(タイケン=side、
  // ジョウホウ=media)なので、参照するマップをドメインで切り替える。
  const kindShelvesOf = (domain: "experience" | "info") => {
    const accentMap = domain === "experience" ? EXPERIENCE_ACCENT : MEDIA_ACCENT;
    const groups = new Map<ItemKind, Item[]>();
    doneItems.filter((i) => domainOf(i) === domain).forEach((i) => {
      if (!groups.has(i.kind)) groups.set(i.kind, []);
      groups.get(i.kind)!.push(i);
    });
    return Array.from(groups.entries())
      .map(([kind, items]) => ({ kind, items, lastAt: items[0].doneAt ?? items[0].addedAt }))
      .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
      .map((sec): BinderShelfItem => {
        const def = itemKindOf(sec.kind);
        return {
          key: sec.kind, color: MEDIA_BASE, eyebrowLabel: def.en, accent: accentMap[sec.kind as keyof typeof accentMap],
          title: def.label, count: sec.items.length,
          footer: <div style={{ fontSize: 9, color: "rgba(28,28,30,0.6)", fontWeight: 700, textAlign: "center" }}>{sec.items.length}件・タップで見る</div>,
          onOpen: () => setOpenFolder({
            title: def.label,
            content: sec.items.map((i) => itemCard(i, { sub: i.area && i.area !== "—" ? i.area : (i.creator || shortDate(i.doneAt ?? i.addedAt)), withGood: true })),
          }),
        };
      });
  };
  const experienceRowItems = kindShelvesOf("experience");
  const infoRowItems = kindShelvesOf("info");

  // ---- モノ: 買ったものをまとめた1冊。件数がTHING_ITEMS_PER_VOLUMEを
  // 超えたら、同じ意匠のまま色だけ変えて次の巻(Vol.2…)へ分かれる
  // (ユーザー指定:「vol2とかになっていったときに色だけ変更して別冊に
  // 行く感じ」)。バショ/タイケン/ジョウホウは個体(エリア名・kind)ごとに
  // ハッシュ/固定で色を振るが、モノだけは逆に「何巻目か」という連番だけ
  // から色を引く(thingVolumeAccent)。時系列に沿って古い方から巻が
  // 埋まっていくよう昇順に並べ替えてから等分し、表示は他の棚と同じく
  // 新しい巻(直近増えた分)を手前に出すため配列を反転する。 ----
  const doneThingsAsc = doneItems
    .filter((i) => domainOf(i) === "thing")
    .slice()
    .sort((a, b) => new Date(a.doneAt ?? a.addedAt).getTime() - new Date(b.doneAt ?? b.addedAt).getTime());
  const thingVolumeCount = Math.ceil(doneThingsAsc.length / THING_ITEMS_PER_VOLUME);
  const thingRowItems: BinderShelfItem[] = Array.from({ length: thingVolumeCount }, (_, vol) => ({
    vol, items: doneThingsAsc.slice(vol * THING_ITEMS_PER_VOLUME, (vol + 1) * THING_ITEMS_PER_VOLUME),
  }))
    .reverse()
    .map(({ vol, items }) => {
      const title = thingVolumeCount > 1 ? `買ったモノ Vol.${vol + 1}` : "買ったモノ";
      return {
        key: `things-${vol}`, color: MEDIA_BASE, eyebrowLabel: "THING", accent: thingVolumeAccent(vol),
        title, count: items.length,
        footer: <div style={{ fontSize: 9, color: "rgba(28,28,30,0.6)", fontWeight: 700, textAlign: "center" }}>{items.length}件・タップで見る</div>,
        onOpen: () => setOpenFolder({
          title,
          content: items.map((i) => itemCard(i, { sub: i.price ?? shortDate(i.doneAt ?? i.addedAt) })),
        }),
      };
    });

  // ---- ゴール ----
  const goalRowItems: BinderShelfItem[] = goals.map((g) => ({
    key: g.id, color: GOAL_BASE, eyebrowLabel: "GOAL", accent: goalAccent(g.id),
    title: g.title, count: g.checkIns?.length ?? 0,
    footer: <div style={{ fontSize: 9, color: "rgba(253,251,245,0.7)", fontWeight: 700, textAlign: "center" }}>{g.checkIns?.length ? `記録${g.checkIns.length}件・タップで見る` : "タップで見る"}</div>,
    onOpen: () => goTab("goals"),
  }));

  // ---- 日付ビュー: 実行した日ごとに1冊。月をまたぐと1本の棚に延々と
  // 並んでしまい見づらいため、月ごとに棚(行)を分ける。 ----
  interface DayGroup { key: string; label: string; items: Item[]; wishes: typeof fulfilledWishes; lastAt: string }
  const dayGroups = new Map<string, DayGroup>();
  const dayOf = (iso: string) => {
    const { key, label } = dayInfo(iso);
    if (!dayGroups.has(key)) dayGroups.set(key, { key, label, items: [], wishes: [], lastAt: iso });
    const g = dayGroups.get(key)!;
    if (new Date(iso).getTime() > new Date(g.lastAt).getTime()) g.lastAt = iso;
    return g;
  };
  doneItems.forEach((i) => { dayOf(i.doneAt ?? i.addedAt).items.push(i); });
  fulfilledWishes.forEach((w) => { dayOf(w.fulfilledAt ?? w.addedAt).wishes.push(w); });

  interface MonthGroup { label: string; days: DayGroup[]; lastAt: string }
  const monthGroups = new Map<string, MonthGroup>();
  dayGroups.forEach((sec) => {
    const d = new Date(sec.lastAt);
    const monthKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    if (!monthGroups.has(monthKey)) monthGroups.set(monthKey, { label: `${d.getFullYear()}年${d.getMonth() + 1}月`, days: [], lastAt: sec.lastAt });
    const mg = monthGroups.get(monthKey)!;
    mg.days.push(sec);
    if (new Date(sec.lastAt).getTime() > new Date(mg.lastAt).getTime()) mg.lastAt = sec.lastAt;
  });
  const monthRows: { label: string; items: BinderShelfItem[] }[] = Array.from(monthGroups.values())
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
    .map((mg) => ({
      label: mg.label,
      items: mg.days
        .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
        .map((sec): BinderShelfItem => ({
          key: sec.key, color: PLACE_BASE, eyebrowLabel: "DATE", accent: dateAccent(sec.label),
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
        })),
    }));

  // 棚の並び順(長押しドラッグで並べ替えた結果)はAppStateに永続化する。
  // キーは棚の識別子(place/experience/info/thing/goal)。
  const reorderShelf = (shelfKey: string, order: string[]) => {
    const next = structuredClone(appState);
    next.shelfOrder = { ...(next.shelfOrder ?? {}), [shelfKey]: order };
    persist(next);
  };

  // 棚(行)のレイアウトは全行共通: 小さなラベル+BinderCoverflowRow。
  const shelfRow = (title: string, shelfKey: string, items: BinderShelfItem[]) => items.length > 0 && (
    <section style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 2 }}>{title}</div>
      <BinderCoverflowRow items={items} initialOrder={appState.shelfOrder?.[shelfKey]} onReorder={(order) => reorderShelf(shelfKey, order)} />
    </section>
  );

  // ---- ウィッシュ一覧: バインダーではなく末尾の平たいリスト ----
  // 実行の有無・叶えたかどうかを問わず、書いたウィッシュすべてを新しい順に
  // 並べる。左のチェックは「派生カードがバインドされたか」の自動判定
  // (isWishBound)で、タップして手動でON/OFFする類のものではない。
  const allWishesDesc = appState.wishes.slice().sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  const wishChildren = wishDetail ? appState.items.filter((i) => i.sourceWishId === wishDetail.id) : [];
  const wishDetailBound = wishDetail ? isWishBound(wishDetail, appState.items) : false;

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
            {shelfRow("バショ", "place", placeRowItems)}
            {shelfRow("タイケン", "experience", experienceRowItems)}
            {shelfRow("ジョウホウ", "info", infoRowItems)}
            {shelfRow("モノ", "thing", thingRowItems)}
            {shelfRow("ゴール", "goal", goalRowItems)}

            {placeRowItems.length === 0 && experienceRowItems.length === 0 && infoRowItems.length === 0 && thingRowItems.length === 0 && goalRowItems.length === 0 && pendingItems.length === 0 && (
              <div style={{ padding: "36px 4px", textAlign: "center" }}>
                <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>まだ記録がありません。</div>
                <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>プランタブで行動を記録すると、ここに積み上がります。</p>
              </div>
            )}

            {/* ウィッシュは棚(バインダー)ではなく、書いたものすべてを追える
                平たいリストとして一番下に置く。左のチェックは「派生カードが
                実際にプランへバインドされたか」の自動判定で、タップでの
                手動トグルは持たない(状態そのものが手がかりだから)。 */}
            {allWishesDesc.length > 0 && (
              <section style={{ marginTop: 8 }}>
                <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 10 }}>ウィッシュ</div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {allWishesDesc.map((w) => {
                    const bound = isWishBound(w, appState.items);
                    return (
                      <button key={w.id} onClick={() => setWishDetail(w)} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 2px",
                        background: "none", border: "none", borderTop: `1px solid ${HAIRLINE}`, cursor: "pointer", textAlign: "left", width: "100%",
                      }}>
                        <span style={{
                          flexShrink: 0, width: 19, height: 19, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                          background: bound ? GOLD : "transparent", border: `1.5px solid ${bound ? GOLD : "rgba(23,23,21,0.25)"}`,
                        }}>
                          {bound && <Check size={11} strokeWidth={3} color={PAPER} />}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.title}</div>
                          <div style={{ fontSize: 9.5, color: "#9A988E", marginTop: 1 }}>{domainDefOf(w.category).label}{w.status === "fulfilled" ? " ・ 叶えた" : ""}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            {monthRows.length === 0 ? (
              <p style={{ fontSize: 11.5, color: "#9A988E", padding: "4px 2px" }}>まだ記録がありません。</p>
            ) : (
              monthRows.map((mg) => (
                <section key={mg.label} style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 2 }}>{mg.label}</div>
                  <BinderCoverflowRow items={mg.items} />
                </section>
              ))
            )}
          </>
        )}
      </main>

      {openFolder && <BinderContentsSheet title={openFolder.title} onClose={() => setOpenFolder(null)}>{openFolder.content}</BinderContentsSheet>}
      <BinderModal item={binderItem} onClose={() => setBinderItem(null)} />
      <BinderModal
        item={wishDetail ? {
          title: wishDetail.title, category: `ウィッシュ ・ ${domainDefOf(wishDetail.category).label}`,
          meta: wishChildren.length > 0 ? wishChildren.map((c) => `→ ${c.title}${c.status === "done" ? "（実行済み）" : c.status === "planned" ? "（プラン中）" : ""}`) : undefined,
        } : null}
        onClose={() => setWishDetail(null)}
        actionSlot={(close) => (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {!wishDetailBound && wishDetail?.status !== "fulfilled" && (
              <button onClick={() => { updateWish(wishDetail!.id, { status: "fulfilled", fulfilledAt: new Date().toISOString() }); close(); }} style={rowBtn(INK, PAPER)}>叶えた！</button>
            )}
            {!wishDetailBound && (
              <button onClick={() => { makeGoal(wishDetail!); close(); }} style={rowBtn("transparent", GREEN, GREEN)}>ゴールにする</button>
            )}
            <button onClick={() => { removeWish(wishDetail!.id); close(); }} style={rowBtn("transparent", RUST, "rgba(168,85,47,0.4)")}>削除</button>
          </div>
        )} />
    </>
  );
}
