"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import { Activity, BookOpen, Check, Film, MapPin, Music, Music2, Newspaper, Package, Palette, UtensilsCrossed } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { BottomSheet, closeOnSelfClick, OverlayCard } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { BinderModal, CardStack, type IconType, Masthead, PosterCard, SectionLabel } from "@/components/common";
import { TabIcon } from "@/components/TabIcons";
import { appTitle } from "@/lib/apps";
import { BLUE, GREEN, HAIRLINE, INK, ITEM_DOMAINS, MUTED, PAPER, RUST, SANS, domainDefOf, itemKindOf, kindsOfDomain, SECOND, WHITE } from "@/lib/constants";
import { domainOf, haptic, isWishBound, originBadge, shortDate } from "@/lib/helpers";
import { colorOfKind } from "@/lib/palette";
import type { Item, ItemDomain, ItemKind, TabProps, Wish } from "@/lib/types";

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
// 1行に重ねる枚数(ユーザー指定で10枚)。CardStackの既定(5)より深く重なるため、
// 1枚あたり見えるのは端の細い帯だけになるが、束としての厚みが出て行数も減る。
// これを超えたぶんは次の行へ折り返す。
const STACK_ROW_CAP = 10;

// GoogleマップのURLかどうか(表示ラベルの出し分け用の軽い判定)。座標・名前の
// 実際の解決はサーバー関数(/api/resolve-place)が担う。
const isMapsUrl = (url: string) => /google\.[^/]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/.test(url);

// 追加シートの入力欄スタイル(4ドメインで統一)。
const FIELD_LABEL: CSSProperties = { fontSize: TYPE.micro, letterSpacing: TRACK.caps, color: MUTED, display: "block", marginBottom: SPACE.xs };
// ★入力欄の文字は **TYPE.lead(16) 以上**。15 以下だと iOS Safari が
//   フォーカス時に画面を勝手に拡大し、以後レイアウトが崩れたまま戻らない。
const FIELD_INPUT: CSSProperties = { width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: `${SPACE.sm}px 0`, fontFamily: SANS, fontSize: TYPE.lead, outline: "none", background: "transparent" };

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
          <div style={{ fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.lead, marginBottom: SPACE.lg }}>{sheetTitle}</div>

          {multiKind && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.sm, marginBottom: SPACE.lg }}>
              {kinds.map((k) => (
                <button key={k.id} onClick={() => setKind(k.id)} style={{
                  flex: "1 1 40%", padding: `${SPACE.sm}px 0`, borderRadius: RADIUS.pill, cursor: "pointer", fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold,
                  background: kind === k.id ? INK : "transparent", color: kind === k.id ? PAPER : SECOND,
                  border: `1.5px solid ${kind === k.id ? INK : "rgba(26,26,24,0.2)"}`,
                }}>{k.label}</button>
              ))}
            </div>
          )}

          <label style={FIELD_LABEL}>名前</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus={!multiKind}
            style={{ ...FIELD_INPUT, marginBottom: SPACE.lg }} />

          <label style={FIELD_LABEL}>GoogleマップのURL（任意・場所を認識します）</label>
          <div style={{ display: "flex", gap: SPACE.sm, alignItems: "flex-end", marginBottom: place ? SPACE.xs : SPACE.lg }}>
            <input value={mapUrl} onChange={(e) => { setMapUrl(e.target.value); setPlace(null); }} placeholder="https://maps.app.goo.gl/..."
              style={{ ...FIELD_INPUT, flex: 1 }} />
            <button onClick={loadPlace} disabled={!mapUrl.trim() || resolving} style={{
              flexShrink: 0, padding: `${SPACE.sm}px ${SPACE.lg}px`, borderRadius: RADIUS.pill, border: `1.5px solid ${INK}`,
              background: mapUrl.trim() && !resolving ? INK : "transparent", color: mapUrl.trim() && !resolving ? PAPER : MUTED,
              fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold, cursor: mapUrl.trim() && !resolving ? "pointer" : "default", whiteSpace: "nowrap",
            }}>{resolving ? "読込中…" : "読み込む"}</button>
          </div>
          {place && (
            <div style={{ fontSize: TYPE.small, fontWeight: WEIGHT.text, color: hasCoords ? INK : RUST, marginBottom: SPACE.lg, lineHeight: LEAD.body }}>
              {hasCoords
                ? `地図の位置を取得しました${place.name ? `（${place.name}）` : ""}。`
                : "このURLからは場所を取得できませんでした。名前を入れて追加できます。"}
            </div>
          )}

          <label style={FIELD_LABEL}>自由記述（任意）</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="メモ・作者・価格の目安など"
            style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid rgba(26,26,24,0.2)", borderRadius: RADIUS.lg, padding: `${SPACE.md}px ${SPACE.md}px`, fontFamily: SANS, fontSize: TYPE.lead, fontWeight: WEIGHT.text, outline: "none", resize: "none", lineHeight: LEAD.body, background: "transparent", marginBottom: SPACE.xl }} />

          <button onClick={() => commit(requestClose)} disabled={!title.trim() || saving} style={{
            width: "100%", padding: `${SPACE.md}px 0`, background: title.trim() && !saving ? INK : "rgba(26,26,24,0.2)", color: PAPER, border: "none",
            borderRadius: RADIUS.pill, cursor: title.trim() && !saving ? "pointer" : "default", fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold, letterSpacing: TRACK.caps,
          }}>{saving ? "追加中…" : "ストックする"}</button>
        </OverlayCard>
      )}
    </BottomSheet>
  );
}

// 束1つぶんの棚。★content-visibility:auto を付けてある: 画面外にある棚は
// ブラウザがレイアウトとペイントを丸ごと省く。ストックはカード1枚が
// グラデーション＋影＋パンチ穴＋アイコンで構成されていて塗りが重く、
// 4つの棚を一度に全部描くと開くたびに数百msかかっていた(CPUプロファイルでも
// JSは40ms程度で、残りはすべてスタイル/レイアウト/ペイントだった)。
// contain-intrinsic-size で画面外の高さを見積もらせ、スクロールバーが
// 暴れないようにしている。未対応のブラウザでは単に無視されるだけ。
const SHELF_INTRINSIC = "1px 260px";

function StackSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: SPACE.xxl, contentVisibility: "auto", containIntrinsicSize: SHELF_INTRINSIC }}>
      {/* 棚の見出し。件数は情報として意味が薄いので出さない。 */}
      <SectionLabel text={title} style={{ marginBottom: SPACE.md }} />
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
export function StockTab({ appState, persist, showToast, selection, toggleItemSelection, openWishSheet }: TabProps) {
  const [openDomain, setOpenDomain] = useState<ItemDomain | null>(null);
  const [adding, setAdding] = useState<ItemDomain | null>(null);
  const [itemDetail, setItemDetail] = useState<Item | null>(null);
  // ★ウィッシュの一覧。以前はアーカイブタブの最下部にあったが、アーカイブを
  // ジャーナルへ統合(1日=1枚の記録)した際に居場所が無くなったため、同じ
  // 「まだ叶えていない願い」を扱うストックの末尾へ移した(HANDOFF §10)。
  const [wishDetail, setWishDetail] = useState<Wish | null>(null);

  // plannedは既に今日のプラン(バインド済み)に入っているItem。ここでは
  // 「これから選べる候補」だけを見せたいので、doneだけでなくplannedも除く。
  const stocked = appState.items
    .filter((i) => i.status === "candidate")
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  const byDomain = (d: ItemDomain) => stocked.filter((i) => domainOf(i) === d);
  const domainItems: Record<ItemDomain, Item[]> = {
    thing: byDomain("thing"), place: byDomain("place"), experience: byDomain("experience"), info: byDomain("info"),
  };

  const allWishesDesc = appState.wishes.slice().sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  const wishChildren = wishDetail ? appState.items.filter((i) => i.sourceWishId === wishDetail.id) : [];
  const wishDetailBound = wishDetail ? isWishBound(wishDetail, appState.items) : false;

  const addItem = (item: Item, toast: string) => {
    haptic();
    const next = structuredClone(appState);
    next.items.unshift(item);
    persist(next);
    showToast(toast);
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
    const next = structuredClone(appState);
    next.goals.unshift({ id: `goal-${Date.now()}`, title: w.title, addedAt: new Date().toISOString(), checkIns: [] });
    next.wishes = next.wishes.filter((x) => x.id !== w.id);
    persist(next);
    showToast("ゴールにしました");
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

  const openItems = openDomain ? domainItems[openDomain] : [];

  return (
    <>
      <Masthead title={appTitle("life")} />

      <main style={{ flex: 1, paddingTop: SPACE.lg, paddingBottom: SPACE.xxl }}>
        {ITEM_DOMAINS.map((d) => (
          <StackSection key={d.id} title={d.label}>
            <CardStack cardWidth={STACK_CARD_WIDTH} rowCap={STACK_ROW_CAP}
              items={domainItems[d.id].slice().reverse().map((i) => ({ key: i.id, node: itemCard(i, STACK_CARD_WIDTH) }))}
              onOpen={() => setOpenDomain(d.id)}
              onAdd={() => { haptic(); setAdding(d.id); }}
              addLabel={`${d.label}を追加`} />
          </StackSection>
        ))}

        {/* ★ウィッシュ。棚(4ドメイン)の下に、書いたものすべてを新しい順に
            並べる平たいリスト。左のチェックは「派生カードが実際に実行された
            か」の自動判定(isWishBound)で、タップでの手動トグルは持たない。 */}
        <section style={{ marginTop: SPACE.md }}>
          {/* ★ウィッシュを書く入口。タブバーの右端は録音に譲ったので、
              一覧のあるここに置いた(見出しの右の丸ボタン)。 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SPACE.md }}>
            <SectionLabel text="ウィッシュ" />
            <button onClick={openWishSheet} aria-label="ウィッシュを書く" style={{
              width: 30, height: 30, borderRadius: RADIUS.circle, background: INK, border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0,
            }}>
              <TabIcon name="sparkle" color={PAPER} size={15} />
            </button>
          </div>
        </section>
        {allWishesDesc.length > 0 && (
          <section>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {allWishesDesc.map((w) => {
                const bound = isWishBound(w, appState.items);
                return (
                  <button key={w.id} onClick={() => setWishDetail(w)} style={{
                    display: "flex", alignItems: "center", gap: SPACE.md, padding: `${SPACE.md}px 0`,
                    background: "none", border: "none", borderTop: `1px solid ${HAIRLINE}`, cursor: "pointer", textAlign: "left", width: "100%",
                  }}>
                    <span style={{
                      flexShrink: 0, width: 19, height: 19, borderRadius: RADIUS.circle, display: "flex", alignItems: "center", justifyContent: "center",
                      background: bound ? GREEN : "transparent", border: `1.5px solid ${bound ? GREEN : "rgba(26,26,24,0.25)"}`,
                    }}>
                      {bound && <Check size={11} strokeWidth={3} color={PAPER} />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.title}</div>
                      <div style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.text, color: MUTED, marginTop: SPACE.hair }}>{domainDefOf(w.category).label}{w.status === "fulfilled" ? " ・ 叶えた" : ""}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {openDomain && (
        <BottomSheet onClose={() => setOpenDomain(null)} maxHeight="74vh">
          {(requestClose) => (
            <>
              <div style={{ fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.lead, color: WHITE, margin: `${SPACE.sm}px ${SPACE.xs}px ${SPACE.lg}px`, textShadow: "0 2px 8px rgba(0,0,0,0.35)" }}>{ITEM_DOMAINS.find((d) => d.id === openDomain)?.label}</div>
              <div onPointerDown={closeOnSelfClick(requestClose)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.md, padding: `0 ${SPACE.xs}px ${SPACE.sm}px` }}>
                {openItems.length === 0 ? <p style={{ fontSize: TYPE.small, fontWeight: WEIGHT.text, color: "rgba(255,255,255,0.7)" }}>まだありません。</p> : openItems.map((i) => itemCard(i))}
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
              // ★色は**そのものの kind のドメイン**から引く（第73巡）。
              //   題のハッシュで散らすのをやめた ―― 同じものが開くたび違う色になっていた。
              color: colorOfKind(data.kind),
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
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SPACE.sm }}>
              <Button variant={selected ? "secondary" : "primary"} tone={selected ? BLUE : undefined} onClick={() => toggleItemSelection(itemDetail!.id)}>
                {selected ? "＋ 追加済み" : "＋ プランに追加"}
              </Button>
              <Button variant="secondary" tone={INK} onClick={() => { markItemDone(itemDetail!.id); close(); }}>{itemKindOf(itemDetail!.kind).doneActionLabel}</Button>
              <Button variant="secondary" tone={RUST} onClick={() => { removeItem(itemDetail!.id); close(); }}>削除</Button>
            </div>
          );
        }} />

      <BinderModal
        item={wishDetail ? {
          title: wishDetail.title, category: `ウィッシュ ・ ${domainDefOf(wishDetail.category).label}`,
          meta: wishChildren.length > 0 ? wishChildren.map((c) => `→ ${c.title}${c.status === "done" ? "（実行済み）" : ""}`) : undefined,
        } : null}
        onClose={() => setWishDetail(null)}
        actionSlot={(close) => (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SPACE.sm }}>
            {!wishDetailBound && wishDetail?.status !== "fulfilled" && (
              <Button variant="primary" onClick={() => { updateWish(wishDetail!.id, { status: "fulfilled", fulfilledAt: new Date().toISOString() }); close(); }}>叶えた！</Button>
            )}
            {!wishDetailBound && (
              <Button variant="secondary" tone={GREEN} onClick={() => { makeGoal(wishDetail!); close(); }}>ゴールにする</Button>
            )}
            <Button variant="secondary" tone={RUST} onClick={() => { removeWish(wishDetail!.id); close(); }}>削除</Button>
          </div>
        )} />
    </>
  );
}
