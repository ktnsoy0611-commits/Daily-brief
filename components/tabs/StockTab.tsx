"use client";

import { BookOpen, Film, MapPin, Music, Music2, Package, Palette, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { BottomSheet, closeOnSelfClick, OverlayCard } from "@/components/BottomSheet";
import { BinderModal, CardStack, type IconType, Masthead, PosterCard, rowBtn } from "@/components/common";
import { GREEN, HAIRLINE, INK, ITEM_KINDS, PAPER, POSTER_PALETTE, RUST, SANS, itemKindOf } from "@/lib/constants";
import { hashStr, haptic, originBadge, shelfOf, shortDate } from "@/lib/helpers";
import type { Item, ItemKind, TabProps, Wish } from "@/lib/types";
import { WORK_KINDS } from "@/lib/types";

// 種類ごとのアイコン。place/thingも含めItemの全種類をここで引ける。
export const KIND_ICON: Record<ItemKind, IconType> = {
  place: MapPin, movie: Film, exhibition: Palette, live: Music2, book: BookOpen, album: Music, thing: Package,
};
// ルーズリーフの穴+切り取り線が小さすぎるカードだと窮屈に見えるため、
// スタック表示時の1枚幅を広めに確保する。
const STACK_CARD_WIDTH = 132;

// URLから場所を追加するシート。GoogleマップのURLは無料のPlaces APIで解析
// (安価)、それ以外のURL(展覧会の公式サイトなど)はGeminiでの読み取りが
// 必要になる(わずかに課金が発生しうる)、という使い分けを見せている。
// この環境には実際のAPIがないため解析結果はモック。実装ではここを
// サーバー側の関数呼び出しに置き換える。
function mockParseUrl(url: string) {
  const isMaps = /google\.com\/maps|maps\.app\.goo\.gl/.test(url);
  let guessTitle = "新しい場所";
  try {
    const u = new URL(url);
    if (isMaps) {
      const m = decodeURIComponent(u.pathname).match(/\/place\/([^/@]+)/);
      if (m) guessTitle = m[1].replace(/\+/g, " ");
    } else {
      guessTitle = u.hostname.replace(/^www\./, "");
    }
  } catch {
    /* 不正なURLはデフォルトのまま */
  }
  return {
    title: guessTitle,
    category: isMaps ? "登録した場所" : "展覧会・イベント",
    parseMethod: isMaps ? "places" : "gemini",
  };
}

interface ParsedPlace {
  title: string;
  category: string;
  area: string;
  sourceUrl: string;
  sourceLabel: string;
}

function AddPlaceSheet({ onAdd, onClose }: { onAdd: (data: ParsedPlace) => void; onClose: () => void }) {
  const [step, setStep] = useState<"input" | "loading" | "confirm">("input");
  const [url, setUrl] = useState("");
  const [parsed, setParsed] = useState<ReturnType<typeof mockParseUrl> | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [area, setArea] = useState("");

  const analyze = () => {
    if (!url.trim()) return;
    setStep("loading");
    setTimeout(() => {
      const guess = mockParseUrl(url.trim());
      setParsed(guess);
      setTitle(guess.title);
      setCategory(guess.category);
      setStep("confirm");
    }, 700);
  };
  const isMapsUrl = /google\.com\/maps|maps\.app\.goo\.gl/.test(url);

  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <OverlayCard>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>URLから行き先を追加</div>

          {step === "input" && (
            <>
              <p style={{ fontSize: 11.5, color: "#9A988E", lineHeight: 1.7, margin: "0 0 14px" }}>
                GoogleマップのURL、または展覧会などのサイトURLを貼り付けてください。
              </p>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." style={{
                width: "100%", boxSizing: "border-box", border: `1.5px solid ${INK}`, borderRadius: 12, padding: "12px 14px",
                fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 14,
              }} />
              <button onClick={analyze} disabled={!url.trim()} style={{
                width: "100%", padding: "13px 0", background: url.trim() ? INK : "rgba(23,23,21,0.2)", color: PAPER, border: "none",
                borderRadius: 999, cursor: url.trim() ? "pointer" : "default", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
              }}>解析する</button>
            </>
          )}

          {step === "loading" && (
            <div style={{ padding: "28px 0", textAlign: "center" }}>
              <p style={{ fontSize: 12, color: "#9A988E" }}>{isMapsUrl ? "Places APIで解析中…" : "Geminiで内容を読み取り中…"}</p>
            </div>
          )}

          {step === "confirm" && (
            <>
              <div style={{ fontSize: 10, color: parsed?.parseMethod === "gemini" ? RUST : INK, marginBottom: 14, lineHeight: 1.7 }}>
                {parsed?.parseMethod === "gemini"
                  ? "※ Geminiで解析しました。内容を確認してください（わずかに課金が発生する場合があります）"
                  : "※ Places APIで解析しました（無料枠内）"}
              </div>
              <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>名前</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 15, outline: "none", marginBottom: 12, background: "transparent" }} />
              <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>種類</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 12, background: "transparent" }} />
              <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>エリア（任意）</label>
              <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="例: 蔵前" style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 18, background: "transparent" }} />
              <button onClick={() => { if (!title.trim()) return; onAdd({ title: title.trim(), category: category.trim() || "登録した場所", area: area.trim(), sourceUrl: url.trim(), sourceLabel: "登録したリンクを見る" }); requestClose(); }} disabled={!title.trim()} style={{ width: "100%", padding: "13px 0", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>この内容で追加</button>
            </>
          )}
        </OverlayCard>
      )}
    </BottomSheet>
  );
}

function AddWorkSheet({ onAdd, onClose }: {
  onAdd: (data: { kind: ItemKind; title: string; creator: string }) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ItemKind>("movie");
  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const current = itemKindOf(kind);

  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <OverlayCard>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>作品をストックに追加</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {ITEM_KINDS.filter((k) => WORK_KINDS.includes(k.id)).map((k) => (
              <button key={k.id} onClick={() => setKind(k.id)} style={{
                flex: "1 1 40%", padding: "9px 0", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700,
                background: kind === k.id ? INK : "transparent", color: kind === k.id ? PAPER : "#5A5A54",
                border: `1.5px solid ${kind === k.id ? INK : "rgba(23,23,21,0.2)"}`,
              }}>{k.label}</button>
            ))}
          </div>
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>タイトル</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 15, outline: "none", marginBottom: 14, background: "transparent" }} />
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>{current.creatorPlaceholder ?? "作者（任意）"}</label>
          <input value={creator} onChange={(e) => setCreator(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1px solid ${HAIRLINE}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 20, background: "transparent" }} />
          <button onClick={() => { if (!title.trim()) return; onAdd({ kind, title: title.trim(), creator: creator.trim() }); requestClose(); }} disabled={!title.trim()} style={{
            width: "100%", padding: "13px 0", background: title.trim() ? INK : "rgba(23,23,21,0.2)", color: PAPER, border: "none",
            borderRadius: 999, cursor: title.trim() ? "pointer" : "default", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
          }}>ストックする</button>
        </OverlayCard>
      )}
    </BottomSheet>
  );
}

// モノ(買いたいもの)の手動追加。名前+価格の目安+リンクだけの軽い入力。
function AddThingSheet({ onAdd, onClose }: {
  onAdd: (data: { title: string; price: string; sourceUrl: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [url, setUrl] = useState("");
  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <OverlayCard>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>モノをストックに追加</div>
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>名前</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 15, outline: "none", marginBottom: 14, background: "transparent" }} />
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>予算の目安（任意）</label>
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="例: ¥12,000前後" style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1px solid ${HAIRLINE}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 14, background: "transparent" }} />
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>リンク（任意）</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1px solid ${HAIRLINE}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 20, background: "transparent" }} />
          <button onClick={() => { if (!title.trim()) return; onAdd({ title: title.trim(), price: price.trim(), sourceUrl: url.trim() }); requestClose(); }} disabled={!title.trim()} style={{
            width: "100%", padding: "13px 0", background: title.trim() ? INK : "rgba(23,23,21,0.2)", color: PAPER, border: "none",
            borderRadius: 999, cursor: title.trim() ? "pointer" : "default", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
          }}>ストックする</button>
        </OverlayCard>
      )}
    </BottomSheet>
  );
}

function AddWishSheet({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <OverlayCard>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>ウィッシュを書く</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="ふと思ったことを、なんでも"
            style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 15, outline: "none", marginBottom: 20, background: "transparent" }} />
          <button onClick={() => { if (!title.trim()) return; onAdd(title.trim()); requestClose(); }} disabled={!title.trim()} style={{
            width: "100%", padding: "13px 0", background: title.trim() ? INK : "rgba(23,23,21,0.2)", color: PAPER, border: "none",
            borderRadius: 999, cursor: title.trim() ? "pointer" : "default", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
          }}>追加する</button>
        </OverlayCard>
      )}
    </BottomSheet>
  );
}

function StackSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E" }}>{title}</span>
        <span style={{ fontSize: 10, color: "#9A988E" }}>{count}件</span>
      </div>
      {children}
    </section>
  );
}

type StackId = "wish" | "dest" | "work" | "thing";

// ストックタブ: 未実行の収集物を「ウィッシュ・行き先・作品・モノ」の4つの
// 「カードの束」として積む。ウィッシュは自由文の願い(最上流)、残る3つは
// 統一されたItemをshelfOf(場所が絡む=行き先 / 場所なしの作品 / 場所なしの
// モノ)で振り分けたもの。この4区分の名称はプランタブの棚・アーカイブの棚と
// 共通の語彙にしている。どの束もタップすると中身が一覧できるシートが開き、
// 束の一番手前(右)の＋タイルをタップすると新規追加シートが開く。ブリーフの
// KEEP由来のカードにはKEEP、ウィッシュが形になったカードにはWISHのバッジが
// 左上に付き、手動追加したものと見分けられる。
export function StockTab({ appState, persist, showToast, profileButton, selection, toggleItemSelection }: TabProps) {
  const [openStack, setOpenStack] = useState<StackId | null>(null);
  const [addingPlace, setAddingPlace] = useState(false);
  const [addingWork, setAddingWork] = useState(false);
  const [addingThing, setAddingThing] = useState(false);
  const [addingWish, setAddingWish] = useState(false);
  const [itemDetail, setItemDetail] = useState<Item | null>(null);
  const [wishDetail, setWishDetail] = useState<Wish | null>(null);

  // ---- Item(行き先・作品・モノ) ----
  const stocked = appState.items
    .filter((i) => i.status !== "done")
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  const destItems = stocked.filter((i) => shelfOf(i) === "dest");
  const workItems = stocked.filter((i) => shelfOf(i) === "work");
  const thingItems = stocked.filter((i) => shelfOf(i) === "thing");

  const addItem = (item: Item, toast: string) => {
    haptic();
    const next = structuredClone(appState);
    next.items.unshift(item);
    persist(next);
    showToast(toast);
  };
  const removeItem = (id: string) => {
    const next = structuredClone(appState);
    next.items = next.items.filter((x) => x.id !== id);
    persist(next);
  };
  // Itemの唯一の出口: 行った/観た/読んだ/聴いた/買ったを押すと実際にやった
  // ログ(done)へ進み、アーカイブタブへ移る。
  const markItemDone = (id: string) => {
    haptic(10);
    const next = structuredClone(appState);
    const item = next.items.find((x) => x.id === id);
    if (item) {
      item.status = "done";
      item.doneAt = new Date().toISOString();
    }
    persist(next);
    showToast("アーカイブに移しました");
  };

  const itemCard = (i: Item, size?: number) => (
    <PosterCard key={i.id} image={i.images?.[0]} color={i.color} title={i.title}
      sub={i.area && i.area !== "—" ? i.area : (i.creator || i.category || (i.price ?? shortDate(i.addedAt)))}
      label={itemKindOf(i.kind).en}
      icon={KIND_ICON[i.kind]} badge={originBadge(i.origin)} size={size}
      action={size ? undefined : { label: itemKindOf(i.kind).doneActionLabel, onClick: () => markItemDone(i.id) }}
      onClick={size ? undefined : () => setItemDetail(i)}
      planSelected={size ? undefined : selection.itemIds.includes(i.id)}
      onTogglePlanSelect={size ? undefined : () => toggleItemSelection(i.id)} />
  );

  // ---- ウィッシュ ----
  const wishItemsDesc = appState.wishes.filter((w) => w.status === "stock").sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  const addWish = (title: string) => {
    haptic();
    const next = structuredClone(appState);
    next.wishes.unshift({ id: `wish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, status: "stock", addedAt: new Date().toISOString() });
    persist(next);
    showToast("ウィッシュに追加しました");
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
  // ウィッシュの項目をゴールに格上げする: goalsへ追加し、wishesからは消す
  const makeGoal = (w: Wish) => {
    haptic(10);
    const next = structuredClone(appState);
    next.wishes = next.wishes.filter((x) => x.id !== w.id);
    next.goals = next.goals ?? [];
    next.goals.push({ id: `goal-${Date.now()}`, title: w.title, addedAt: new Date().toISOString(), checkIns: [] });
    persist(next);
    showToast("ゴールにしました");
  };
  const wishCard = (w: Wish, size?: number) => (
    <PosterCard key={w.id} color={POSTER_PALETTE[hashStr(w.title) % POSTER_PALETTE.length]} title={w.title} sub={shortDate(w.addedAt)}
      icon={Sparkles} size={size} onClick={size ? undefined : () => setWishDetail(w)} />
  );

  const totalCount = stocked.length + wishItemsDesc.length;

  // 束シートの共通レイアウト。中身のカード集合とタイトルだけ差し替える。
  const stackSheets: { id: StackId; title: string; cards: React.ReactNode[] }[] = [
    { id: "wish", title: "ウィッシュ", cards: wishItemsDesc.map((w) => wishCard(w)) },
    { id: "dest", title: "行き先", cards: destItems.map((i) => itemCard(i)) },
    { id: "work", title: "作品", cards: workItems.map((i) => itemCard(i)) },
    { id: "thing", title: "モノ", cards: thingItems.map((i) => itemCard(i)) },
  ];
  const openSheet = stackSheets.find((s) => s.id === openStack);

  // このウィッシュから生まれたカード(origin:"wish"+sourceWishId)。詳細シートで
  // 「種と芽」の関係として見せる。
  const wishChildren = wishDetail ? appState.items.filter((i) => i.sourceWishId === wishDetail.id) : [];

  return (
    <>
      <Masthead title="ストック" statValue={totalCount} statLabel="件" corner={profileButton} />

      <main style={{ flex: 1, paddingTop: 18, paddingBottom: 32 }}>
        {/* ウィッシュは他の3つの束の最上流(ここから先のカードが生まれる種)
            なので先頭に置く。 */}
        <StackSection title="ウィッシュ" count={wishItemsDesc.length}>
          <CardStack cardWidth={STACK_CARD_WIDTH}
            items={wishItemsDesc.slice().reverse().map((w) => ({ key: w.id, node: wishCard(w, STACK_CARD_WIDTH) }))}
            onOpen={() => setOpenStack("wish")} onAdd={() => setAddingWish(true)} addLabel="ウィッシュを書く" />
        </StackSection>

        <StackSection title="行き先" count={destItems.length}>
          <CardStack cardWidth={STACK_CARD_WIDTH}
            items={destItems.slice().reverse().map((i) => ({ key: i.id, node: itemCard(i, STACK_CARD_WIDTH) }))}
            onOpen={() => setOpenStack("dest")} onAdd={() => setAddingPlace(true)} addLabel="行き先を追加" />
        </StackSection>

        <StackSection title="作品" count={workItems.length}>
          <CardStack cardWidth={STACK_CARD_WIDTH}
            items={workItems.slice().reverse().map((i) => ({ key: i.id, node: itemCard(i, STACK_CARD_WIDTH) }))}
            onOpen={() => setOpenStack("work")} onAdd={() => setAddingWork(true)} addLabel="作品を追加" />
        </StackSection>

        <StackSection title="モノ" count={thingItems.length}>
          <CardStack cardWidth={STACK_CARD_WIDTH}
            items={thingItems.slice().reverse().map((i) => ({ key: i.id, node: itemCard(i, STACK_CARD_WIDTH) }))}
            onOpen={() => setOpenStack("thing")} onAdd={() => setAddingThing(true)} addLabel="モノを追加" />
        </StackSection>
      </main>

      {openSheet && (
        <BottomSheet onClose={() => setOpenStack(null)} maxHeight="74vh">
          {(requestClose) => (
            <>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, color: "#fff", margin: "8px 4px 16px", textShadow: "0 2px 8px rgba(0,0,0,0.35)" }}>{openSheet.title}</div>
              <div onPointerDown={closeOnSelfClick(requestClose)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "0 4px 8px" }}>
                {openSheet.cards.length === 0 ? <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)" }}>まだありません。</p> : openSheet.cards}
              </div>
            </>
          )}
        </BottomSheet>
      )}

      {addingPlace && <AddPlaceSheet onClose={() => setAddingPlace(false)} onAdd={(data) => {
        addItem({
          id: `manual-${Date.now()}`, kind: "place", title: data.title, category: data.category,
          area: data.area || undefined, status: "candidate", addedAt: new Date().toISOString(),
          images: [`url-${Date.now()}`], color: POSTER_PALETTE[hashStr(data.title) % POSTER_PALETTE.length],
          sourceUrl: data.sourceUrl, sourceLabel: data.sourceLabel, origin: "manual",
        }, "行き先をストックしました");
      }} />}
      {addingWork && <AddWorkSheet onClose={() => setAddingWork(false)} onAdd={({ kind, title, creator }) => {
        addItem({
          id: `manual-${Date.now()}`, kind, title, creator: creator || undefined,
          status: "candidate", addedAt: new Date().toISOString(),
          color: POSTER_PALETTE[hashStr(title) % POSTER_PALETTE.length], origin: "manual",
        }, "作品をストックしました");
      }} />}
      {addingThing && <AddThingSheet onClose={() => setAddingThing(false)} onAdd={({ title, price, sourceUrl }) => {
        addItem({
          id: `manual-${Date.now()}`, kind: "thing", title, price: price || undefined,
          status: "candidate", addedAt: new Date().toISOString(),
          color: POSTER_PALETTE[hashStr(title) % POSTER_PALETTE.length],
          sourceUrl: sourceUrl || undefined, sourceLabel: sourceUrl ? "リンクを見る" : undefined, origin: "manual",
        }, "モノをストックしました");
      }} />}
      {addingWish && <AddWishSheet onAdd={addWish} onClose={() => setAddingWish(false)} />}

      <BinderModal
        item={itemDetail ? {
          title: itemDetail.title, category: itemDetail.category ?? itemKindOf(itemDetail.kind).label,
          images: itemDetail.images,
          meta: [...(itemDetail.meta ?? []), ...(itemDetail.creator ? [itemDetail.creator] : []), ...(itemDetail.price ? [itemDetail.price] : [])],
          sourceUrl: itemDetail.sourceUrl, sourceLabel: itemDetail.sourceLabel,
        } : null}
        onClose={() => setItemDetail(null)}
        actionSlot={(close) => (
          <button onClick={() => { removeItem(itemDetail!.id); close(); }} style={rowBtn("transparent", RUST, "rgba(168,85,47,0.4)")}>削除</button>
        )} />
      <BinderModal
        item={wishDetail ? {
          title: wishDetail.title, category: "ウィッシュ",
          // このウィッシュから生まれたカードを添えて、願いがどう形になって
          // いるかを1画面で辿れるようにする。
          meta: wishChildren.length > 0 ? wishChildren.map((c) => `→ ${c.title}${c.status === "done" ? "（実行済み）" : ""}`) : undefined,
        } : null}
        onClose={() => setWishDetail(null)}
        actionSlot={(close) => (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <button onClick={() => { updateWish(wishDetail!.id, { status: "fulfilled", fulfilledAt: new Date().toISOString() }); close(); }} style={rowBtn(INK, PAPER)}>叶えた！</button>
            <button onClick={() => { makeGoal(wishDetail!); close(); }} style={rowBtn("transparent", GREEN, GREEN)}>ゴールにする</button>
            <button onClick={() => { removeWish(wishDetail!.id); close(); }} aria-label="削除" style={{ background: "none", border: "none", color: RUST, cursor: "pointer", padding: 6, display: "flex" }}><Trash2 size={16} /></button>
          </div>
        )} />
    </>
  );
}
