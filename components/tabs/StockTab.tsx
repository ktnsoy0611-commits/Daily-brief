"use client";

import { Activity, BookOpen, Film, MapPin, Music, Music2, Newspaper, Package, Palette, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { BottomSheet, closeOnSelfClick, OverlayCard } from "@/components/BottomSheet";
import { BinderModal, CardStack, type IconType, Masthead, PosterCard, rowBtn } from "@/components/common";
import { BLUE, HAIRLINE, INK, ITEM_DOMAINS, PAPER, POSTER_PALETTE, RUST, SANS, domainDefOf, itemKindOf, kindsOfDomain } from "@/lib/constants";
import { domainOf, hashStr, haptic, originBadge, shortDate } from "@/lib/helpers";
import type { Item, ItemDomain, ItemKind, TabProps } from "@/lib/types";

// 種類ごとのアイコン。Itemの全kindをここで引ける。
export const KIND_ICON: Record<ItemKind, IconType> = {
  place: MapPin,
  exhibition: Palette, live: Music2, activity: Activity, food: UtensilsCrossed,
  movie: Film, book: BookOpen, album: Music, info: Newspaper,
  thing: Package,
};
// ルーズリーフの穴+切り取り線が小さすぎるカードだと窮屈に見えるため、
// スタック表示時の1枚幅を広めに確保する。
const STACK_CARD_WIDTH = 132;

// URLからタイトル・種類を推測する(名前欄の下書き用)。座標の解決はサーバー
// 関数(/api/resolve-place)が担うため、ここではクライアント側で軽く名前だけ
// 推測する。GoogleマップURLはplace名を、その他URLはホスト名を初期値にする。
function guessFromUrl(url: string) {
  const isMaps = /google\.[^/]+\/maps|maps\.app\.goo\.gl/.test(url);
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
  return { title: guessTitle, category: isMaps ? "登録した場所" : "展覧会・イベント", isMaps };
}

// サーバー関数に座標解決を依頼する。url(マップURLからの抽出)と
// query(店名+エリアの名寄せ)のどちらか/両方を渡す。失敗時はsource:"none"。
async function resolvePlace(input: { url?: string; query?: string }): Promise<{ lat?: number; lng?: number; placeId?: string; name?: string; source: string }> {
  try {
    const res = await fetch("/api/resolve-place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return { source: "none" };
    return await res.json();
  } catch {
    return { source: "none" };
  }
}

interface ParsedPlace {
  title: string;
  category: string;
  area: string;
  sourceUrl: string;
  sourceLabel: string;
  lat?: number;
  lng?: number;
  placeId?: string;
}

function AddPlaceSheet({ onAdd, onClose }: { onAdd: (data: ParsedPlace) => void; onClose: () => void }) {
  const [step, setStep] = useState<"input" | "loading" | "confirm">("input");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [area, setArea] = useState("");
  // 座標解決の結果(url抽出 or Places名寄せ or none)。analyze時にurl由来を試し、
  // 取れなければ追加時にquery(名前+エリア)で名寄せを試みる。
  const [coords, setCoords] = useState<{ lat?: number; lng?: number; placeId?: string; source: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const analyze = async () => {
    if (!url.trim()) return;
    setStep("loading");
    const guess = guessFromUrl(url.trim());
    setTitle(guess.title);
    setCategory(guess.category);
    // マップURLなら、まずURLに埋まった座標の抽出をサーバー関数に依頼(API呼び出し0)。
    const r = guess.isMaps ? await resolvePlace({ url: url.trim() }) : { source: "none" };
    setCoords(r);
    if (r.name) setTitle(r.name);
    setStep("confirm");
  };

  const commitAdd = async (requestClose: () => void) => {
    if (!title.trim() || saving) return;
    setSaving(true);
    // まだ座標が取れていなければ、名前+エリアでPlaces名寄せを試みる(取れなくても続行)。
    let c = coords;
    if (!c || typeof c.lat !== "number") {
      c = await resolvePlace({ query: `${title.trim()} ${area.trim()}`.trim() });
    }
    onAdd({
      title: title.trim(), category: category.trim() || "登録した場所", area: area.trim(),
      sourceUrl: url.trim(), sourceLabel: "登録したリンクを見る",
      lat: c?.lat, lng: c?.lng, placeId: c?.placeId,
    });
    requestClose();
  };

  const hasCoords = coords && typeof coords.lat === "number";

  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <OverlayCard>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>URLからバショを追加</div>

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
              <p style={{ fontSize: 12, color: "#9A988E" }}>URLを解析中…</p>
            </div>
          )}

          {step === "confirm" && (
            <>
              <div style={{ fontSize: 10, color: hasCoords ? INK : "#9A988E", marginBottom: 14, lineHeight: 1.7 }}>
                {hasCoords
                  ? "※ 地図の位置を取得しました。名前・エリアを確認して追加してください。"
                  : "※ 座標が取れなかった場合は、名前とエリアから地図に配置します（エリアの目安で表示）。"}
              </div>
              <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>名前</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 15, outline: "none", marginBottom: 12, background: "transparent" }} />
              <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>種類</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 12, background: "transparent" }} />
              <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>エリア（任意）</label>
              <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="例: 蔵前" style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 18, background: "transparent" }} />
              <button onClick={() => commitAdd(requestClose)} disabled={!title.trim() || saving} style={{ width: "100%", padding: "13px 0", background: title.trim() && !saving ? INK : "rgba(23,23,21,0.2)", color: PAPER, border: "none", borderRadius: 999, cursor: title.trim() && !saving ? "pointer" : "default", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>{saving ? "追加中…" : "この内容で追加"}</button>
            </>
          )}
        </OverlayCard>
      )}
    </BottomSheet>
  );
}

// タイケン・ジョウホウ共通の手動追加シート。種類(kind)をドメイン内から
// 選び、タイトル+作者/文脈(任意)+エリア(任意、そこでしか出来ない体験や
// 劇場公開の映画などのため)を入力する。位置情報の有無はドメインとは
// 別軸なので、ドメインを問わずareaは常に任意項目として持たせている。
function AddKindItemSheet({ domain, title: sheetTitle, onAdd, onClose }: {
  domain: ItemDomain;
  title: string;
  onAdd: (data: { kind: ItemKind; title: string; creator: string; area: string }) => void;
  onClose: () => void;
}) {
  const kinds = kindsOfDomain(domain);
  const [kind, setKind] = useState<ItemKind>(kinds[0].id);
  const [title, setTitle] = useState("");
  const [creator, setCreator] = useState("");
  const [area, setArea] = useState("");
  const current = itemKindOf(kind);

  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <OverlayCard>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>{sheetTitle}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {kinds.map((k) => (
              <button key={k.id} onClick={() => setKind(k.id)} style={{
                flex: "1 1 40%", padding: "9px 0", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700,
                background: kind === k.id ? INK : "transparent", color: kind === k.id ? PAPER : "#5A5A54",
                border: `1.5px solid ${kind === k.id ? INK : "rgba(23,23,21,0.2)"}`,
              }}>{k.label}</button>
            ))}
          </div>
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>タイトル</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 15, outline: "none", marginBottom: 12, background: "transparent" }} />
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>{current.creatorPlaceholder ?? "作者・文脈（任意）"}</label>
          <input value={creator} onChange={(e) => setCreator(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1px solid ${HAIRLINE}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 12, background: "transparent" }} />
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>エリア（任意・そこでしか出来ない/買えない場合）</label>
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="例: 蔵前" style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1px solid ${HAIRLINE}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 20, background: "transparent" }} />
          <button onClick={() => { if (!title.trim()) return; onAdd({ kind, title: title.trim(), creator: creator.trim(), area: area.trim() }); requestClose(); }} disabled={!title.trim()} style={{
            width: "100%", padding: "13px 0", background: title.trim() ? INK : "rgba(23,23,21,0.2)", color: PAPER, border: "none",
            borderRadius: 999, cursor: title.trim() ? "pointer" : "default", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
          }}>ストックする</button>
        </OverlayCard>
      )}
    </BottomSheet>
  );
}

// モノ(買いたいもの)の手動追加。名前+価格の目安+リンク+エリア(そこでしか
// 買えない場合)だけの軽い入力。
function AddThingSheet({ onAdd, onClose }: {
  onAdd: (data: { title: string; price: string; sourceUrl: string; area: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [url, setUrl] = useState("");
  const [area, setArea] = useState("");
  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <OverlayCard>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>モノをストックに追加</div>
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>名前</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 15, outline: "none", marginBottom: 14, background: "transparent" }} />
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>予算の目安（任意）</label>
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="例: ¥12,000前後" style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1px solid ${HAIRLINE}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 14, background: "transparent" }} />
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>エリア（任意・そこでしか買えない場合）</label>
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="例: 谷根千" style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1px solid ${HAIRLINE}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 14, background: "transparent" }} />
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>リンク（任意）</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1px solid ${HAIRLINE}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 20, background: "transparent" }} />
          <button onClick={() => { if (!title.trim()) return; onAdd({ title: title.trim(), price: price.trim(), sourceUrl: url.trim(), area: area.trim() }); requestClose(); }} disabled={!title.trim()} style={{
            width: "100%", padding: "13px 0", background: title.trim() ? INK : "rgba(23,23,21,0.2)", color: PAPER, border: "none",
            borderRadius: 999, cursor: title.trim() ? "pointer" : "default", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
          }}>ストックする</button>
        </OverlayCard>
      )}
    </BottomSheet>
  );
}

function StackSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.22em", color: "#9A988E" }}>{title}</span>
        <span style={{ fontSize: 10, color: "#9A988E" }}>{count}件</span>
      </div>
      {children}
    </section>
  );
}

// ストックタブ: 未実行のItemを、願望の4ドメイン(モノ・バショ・タイケン・
// ジョウホウ)の「カードの束」として積む。ウィッシュはここには入らない
// (タブバー横の＋から書く自由文の受信箱で、ブリーフが形にして返した
// カードだけがここに並ぶ)。この4区分の名称はプランタブの棚・アーカイブの
// 棚と共通の語彙にしている。どの束もタップすると中身が一覧できるシートが
// 開き、束の一番手前(右)の＋タイルをタップすると新規追加シートが開く。
// ブリーフのKEEP由来のカードにはKEEP、ウィッシュが形になったカードには
// WISHのバッジが左上に付き、手動追加したものと見分けられる。
export function StockTab({ appState, persist, showToast, profileButton, selection, toggleItemSelection }: TabProps) {
  const [openDomain, setOpenDomain] = useState<ItemDomain | null>(null);
  const [addingPlace, setAddingPlace] = useState(false);
  const [addingExperience, setAddingExperience] = useState(false);
  const [addingInfo, setAddingInfo] = useState(false);
  const [addingThing, setAddingThing] = useState(false);
  const [itemDetail, setItemDetail] = useState<Item | null>(null);

  // plannedは既に今日のプラン(バインド済み)に入っているItem。ここでは
  // 「これから選べる候補」だけを見せたいので、doneだけでなくplannedも除く
  // (バインド済みのカードがストックにまだ残って見える不具合の修正)。
  const stocked = appState.items
    .filter((i) => i.status === "candidate")
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  const byDomain = (d: ItemDomain) => stocked.filter((i) => domainOf(i) === d);
  const domainItems: Record<ItemDomain, Item[]> = {
    thing: byDomain("thing"), place: byDomain("place"), experience: byDomain("experience"), info: byDomain("info"),
  };

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
  // Itemの唯一の出口: 行った/観た/読んだ/聴いた/やった/買ったを押すと
  // 実際にやったログ(done)へ進み、アーカイブタブへ移る。
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
      label={domainDefOf(domainOf(i)).label}
      icon={KIND_ICON[i.kind]} badge={originBadge(i.origin)} size={size}
      action={size ? undefined : { label: itemKindOf(i.kind).doneActionLabel, onClick: () => markItemDone(i.id) }}
      onClick={size ? undefined : () => setItemDetail(i)}
      planSelected={size ? undefined : selection.itemIds.includes(i.id)}
      onTogglePlanSelect={size ? undefined : () => toggleItemSelection(i.id)} />
  );

  const totalCount = stocked.length;
  const openItems = openDomain ? domainItems[openDomain] : [];

  return (
    <>
      <Masthead title="ストック" statValue={totalCount} statLabel="件" corner={profileButton} />

      <main style={{ flex: 1, paddingTop: 18, paddingBottom: 32 }}>
        {ITEM_DOMAINS.map((d) => (
          <StackSection key={d.id} title={d.label} count={domainItems[d.id].length}>
            <CardStack cardWidth={STACK_CARD_WIDTH}
              items={domainItems[d.id].slice().reverse().map((i) => ({ key: i.id, node: itemCard(i, STACK_CARD_WIDTH) }))}
              onOpen={() => setOpenDomain(d.id)}
              onAdd={() => {
                if (d.id === "place") setAddingPlace(true);
                else if (d.id === "experience") setAddingExperience(true);
                else if (d.id === "info") setAddingInfo(true);
                else setAddingThing(true);
              }}
              addLabel={`${d.label}を追加`} />
          </StackSection>
        ))}
      </main>

      {openDomain && (
        <BottomSheet onClose={() => setOpenDomain(null)} maxHeight="74vh">
          {(requestClose) => (
            <>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, color: "#fff", margin: "8px 4px 16px", textShadow: "0 2px 8px rgba(0,0,0,0.35)" }}>{ITEM_DOMAINS.find((d) => d.id === openDomain)?.label}</div>
              <div onPointerDown={closeOnSelfClick(requestClose)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "0 4px 8px" }}>
                {openItems.length === 0 ? <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)" }}>まだありません。</p> : openItems.map((i) => itemCard(i))}
              </div>
            </>
          )}
        </BottomSheet>
      )}

      {addingPlace && <AddPlaceSheet onClose={() => setAddingPlace(false)} onAdd={(data) => {
        addItem({
          id: `manual-${Date.now()}`, kind: "place", title: data.title, category: data.category,
          area: data.area || undefined, status: "candidate", addedAt: new Date().toISOString(),
          lat: data.lat, lng: data.lng, placeId: data.placeId,
          images: [`url-${Date.now()}`], color: POSTER_PALETTE[hashStr(data.title) % POSTER_PALETTE.length],
          sourceUrl: data.sourceUrl, sourceLabel: data.sourceLabel, origin: "manual",
        }, "バショをストックしました");
      }} />}
      {addingExperience && <AddKindItemSheet domain="experience" title="タイケンをストックに追加" onClose={() => setAddingExperience(false)} onAdd={({ kind, title, creator, area }) => {
        addItem({
          id: `manual-${Date.now()}`, kind, title, creator: creator || undefined, area: area || undefined,
          status: "candidate", addedAt: new Date().toISOString(),
          color: POSTER_PALETTE[hashStr(title) % POSTER_PALETTE.length], origin: "manual",
        }, "タイケンをストックしました");
      }} />}
      {addingInfo && <AddKindItemSheet domain="info" title="ジョウホウをストックに追加" onClose={() => setAddingInfo(false)} onAdd={({ kind, title, creator, area }) => {
        addItem({
          id: `manual-${Date.now()}`, kind, title, creator: creator || undefined, area: area || undefined,
          status: "candidate", addedAt: new Date().toISOString(),
          color: POSTER_PALETTE[hashStr(title) % POSTER_PALETTE.length], origin: "manual",
        }, "ジョウホウをストックしました");
      }} />}
      {addingThing && <AddThingSheet onClose={() => setAddingThing(false)} onAdd={({ title, price, sourceUrl, area }) => {
        addItem({
          id: `manual-${Date.now()}`, kind: "thing", title, price: price || undefined, area: area || undefined,
          status: "candidate", addedAt: new Date().toISOString(),
          color: POSTER_PALETTE[hashStr(title) % POSTER_PALETTE.length],
          sourceUrl: sourceUrl || undefined, sourceLabel: sourceUrl ? "リンクを見る" : undefined, origin: "manual",
        }, "モノをストックしました");
      }} />}

      <BinderModal
        item={itemDetail ? {
          title: itemDetail.title, category: itemDetail.category ?? itemKindOf(itemDetail.kind).label,
          summary: itemDetail.summary, detail: itemDetail.detail, images: itemDetail.images,
          meta: [...(itemDetail.meta ?? []), ...(itemDetail.creator ? [itemDetail.creator] : []), ...(itemDetail.price ? [itemDetail.price] : [])],
          sourceUrl: itemDetail.sourceUrl, sourceLabel: itemDetail.sourceLabel,
        } : null}
        onClose={() => setItemDetail(null)}
        actionSlot={(close) => {
          const selected = selection.itemIds.includes(itemDetail!.id);
          return (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <button onClick={() => toggleItemSelection(itemDetail!.id)} style={selected ? rowBtn("transparent", BLUE, BLUE) : rowBtn(INK, PAPER)}>
                {selected ? "＋ 追加済み" : "＋ プランに追加"}
              </button>
              <button onClick={() => { markItemDone(itemDetail!.id); close(); }} style={rowBtn("transparent", INK, "rgba(23,23,21,0.3)")}>{itemKindOf(itemDetail!.kind).doneActionLabel}</button>
              <button onClick={() => { removeItem(itemDetail!.id); close(); }} style={rowBtn("transparent", RUST, "rgba(168,85,47,0.4)")}>削除</button>
            </div>
          );
        }} />
    </>
  );
}
