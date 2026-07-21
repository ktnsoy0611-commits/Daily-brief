"use client";

import { Activity, BookOpen, Film, MapPin, Music, Music2, Newspaper, Package, Palette, UtensilsCrossed } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { BottomSheet, closeOnSelfClick, OverlayCard } from "@/components/BottomSheet";
import { BinderModal, CardStack, type IconType, Masthead, PosterCard, rowBtn } from "@/components/common";
import { BLUE, INK, ITEM_DOMAINS, PAPER, POSTER_PALETTE, RUST, SANS, domainDefOf, itemKindOf, kindsOfDomain } from "@/lib/constants";
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

// GoogleマップのURLかどうか(表示ラベルの出し分け用の軽い判定)。座標・名前の
// 実際の解決はサーバー関数(/api/resolve-place)が担う。
const isMapsUrl = (url: string) => /google\.[^/]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/.test(url);

// 追加シートの入力欄スタイル(4ドメインで統一)。
const FIELD_LABEL: CSSProperties = { fontSize: 9, letterSpacing: "0.15em", color: "#9A988E", display: "block", marginBottom: 3 };
const FIELD_INPUT: CSSProperties = { width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", background: "transparent" };

// サーバー関数に座標解決を依頼する。url(マップURLからの抽出+名前補完)と
// query(店名の名寄せ)のどちらか/両方を渡す。失敗時はsource:"none"。
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

type AddItemData = {
  kind: ItemKind;
  title: string;
  note: string;
  mapUrl: string;
  isMaps: boolean;
  lat?: number;
  lng?: number;
  placeId?: string;
};

// モノ・バショ・タイケン・ジョウホウで共通の追加シート。以前はドメインごとに
// 別々のシート(バショ=URL解析2ステップ / タイケン・ジョウホウ=作者+エリア /
// モノ=価格+エリア+リンク)でUIがバラバラだったのを1つに統一した。共通の
// 入力は「種類(複数kindを持つドメインのみ)＋名前＋GoogleマップのURL(場所を
// 認識して座標と名前を補完)＋自由記述」。自由入力の「エリア」欄は廃止し、
// 位置はマップURLの読み込み(または名前からの名寄せ)だけで与える。
function AddItemSheet({ domain, sheetTitle, onAdd, onClose }: {
  domain: ItemDomain;
  sheetTitle: string;
  onAdd: (data: AddItemData) => void;
  onClose: () => void;
}) {
  const kinds = kindsOfDomain(domain);
  const multiKind = kinds.length > 1;
  const [kind, setKind] = useState<ItemKind>(kinds[0].id);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [resolving, setResolving] = useState(false);
  const [place, setPlace] = useState<{ lat?: number; lng?: number; placeId?: string; name?: string; source: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // マップURLから場所を読み込む: 座標＋(可能なら)名前を取得。名前がまだ空なら
  // 取得した名前を差し込む(URLだけ貼れば名前が入る、という挙動)。
  const loadPlace = async () => {
    const u = mapUrl.trim();
    if (!u || resolving) return;
    setResolving(true);
    const r = await resolvePlace({ url: u });
    setPlace(r);
    if (r.name && !title.trim()) setTitle(r.name);
    setResolving(false);
  };

  const commit = async (requestClose: () => void) => {
    if (!title.trim() || saving) return;
    setSaving(true);
    const u = mapUrl.trim();
    let r = place;
    // マップURLがあってまだ座標が無ければ、ここで読み込む(読み込みボタンを
    // 押さずに追加した場合の保険)。
    if (u && (!r || typeof r.lat !== "number")) r = await resolvePlace({ url: u });
    // マップURLが無くても、バショは名前からPlaces名寄せして地図に出せるように
    // する(「東京都美術館」等の名前だけでピンが立つ挙動を維持)。
    if ((!r || typeof r.lat !== "number") && domain === "place") r = await resolvePlace({ query: title.trim() });
    onAdd({
      kind, title: title.trim(), note: note.trim(),
      mapUrl: u, isMaps: !!u && isMapsUrl(u),
      lat: r?.lat, lng: r?.lng, placeId: r?.placeId,
    });
    requestClose();
  };

  const hasCoords = place && typeof place.lat === "number";

  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <OverlayCard>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>{sheetTitle}</div>

          {multiKind && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {kinds.map((k) => (
                <button key={k.id} onClick={() => setKind(k.id)} style={{
                  flex: "1 1 40%", padding: "9px 0", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700,
                  background: kind === k.id ? INK : "transparent", color: kind === k.id ? PAPER : "#5A5A54",
                  border: `1.5px solid ${kind === k.id ? INK : "rgba(23,23,21,0.2)"}`,
                }}>{k.label}</button>
              ))}
            </div>
          )}

          <label style={FIELD_LABEL}>名前</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!multiKind}
            style={{ ...FIELD_INPUT, fontSize: 15, marginBottom: 16 }} />

          <label style={FIELD_LABEL}>GoogleマップのURL（任意・場所を認識します）</label>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: place ? 4 : 16 }}>
            <input value={mapUrl} onChange={(e) => { setMapUrl(e.target.value); setPlace(null); }} placeholder="https://maps.app.goo.gl/..."
              style={{ ...FIELD_INPUT, flex: 1 }} />
            <button onClick={loadPlace} disabled={!mapUrl.trim() || resolving} style={{
              flexShrink: 0, padding: "8px 14px", borderRadius: 999, border: `1.5px solid ${INK}`,
              background: mapUrl.trim() && !resolving ? INK : "transparent", color: mapUrl.trim() && !resolving ? PAPER : "#9A988E",
              fontFamily: SANS, fontSize: 11, fontWeight: 700, cursor: mapUrl.trim() && !resolving ? "pointer" : "default", whiteSpace: "nowrap",
            }}>{resolving ? "読込中…" : "読み込む"}</button>
          </div>
          {place && (
            <div style={{ fontSize: 10.5, color: hasCoords ? INK : RUST, marginBottom: 16, lineHeight: 1.6 }}>
              {hasCoords
                ? `地図の位置を取得しました${place.name ? `（${place.name}）` : ""}。`
                : "このURLからは場所を取得できませんでした。名前を入れて追加できます。"}
            </div>
          )}

          <label style={FIELD_LABEL}>自由記述（任意）</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="メモ・作者・価格の目安など"
            style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid rgba(23,23,21,0.2)", borderRadius: 10, padding: "10px 12px", fontFamily: SANS, fontSize: 13, outline: "none", resize: "none", lineHeight: 1.6, background: "transparent", marginBottom: 20 }} />

          <button onClick={() => commit(requestClose)} disabled={!title.trim() || saving} style={{
            width: "100%", padding: "13px 0", background: title.trim() && !saving ? INK : "rgba(23,23,21,0.2)", color: PAPER, border: "none",
            borderRadius: 999, cursor: title.trim() && !saving ? "pointer" : "default", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
          }}>{saving ? "追加中…" : "ストックする"}</button>
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
// ジョウホウ)ごとに「カードのグリッド」で並べる。カードが増えると行が下へ
// 増えていき(以前は最大4枚を重ねる束だった)、各ドメインの＋タイルは常に
// 一番下の行の右端に来る。ウィッシュはここには入らない(タブバー横の＋から
// 書く自由文の受信箱で、ブリーフが形にして返したカードだけがここに並ぶ)。
// ブリーフのKEEP由来のカードにはKEEP、ウィッシュが形になったカードには
// WISHのバッジが付き、手動追加したものと見分けられる。
export function StockTab({ appState, persist, showToast, profileButton, selection, toggleItemSelection }: TabProps) {
  const [openDomain, setOpenDomain] = useState<ItemDomain | null>(null);
  const [adding, setAdding] = useState<ItemDomain | null>(null);
  const [itemDetail, setItemDetail] = useState<Item | null>(null);

  // plannedは既に今日のプラン(バインド済み)に入っているItem。ここでは
  // 「これから選べる候補」だけを見せたいので、doneだけでなくplannedも除く。
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
      sub={i.area && i.area !== "—" ? i.area : (i.creator || i.category || i.price || i.summary || shortDate(i.addedAt))}
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
              onAdd={() => { haptic(); setAdding(d.id); }}
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

      {adding && (
        <AddItemSheet
          domain={adding}
          sheetTitle={`${domainDefOf(adding).label}をストックに追加`}
          onClose={() => setAdding(null)}
          onAdd={(data) => {
            addItem({
              id: `manual-${Date.now()}`, kind: data.kind, title: data.title,
              summary: data.note || undefined,
              status: "candidate", addedAt: new Date().toISOString(),
              lat: data.lat, lng: data.lng, placeId: data.placeId,
              sourceUrl: data.mapUrl || undefined,
              sourceLabel: data.mapUrl ? (data.isMaps ? "地図で見る" : "リンクを見る") : undefined,
              color: POSTER_PALETTE[hashStr(data.title) % POSTER_PALETTE.length],
              origin: "manual",
            }, `${domainDefOf(adding).label}をストックしました`);
          }}
        />
      )}

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
