"use client";

import { BookOpen, Film, MapPin, Music, Music2, Palette, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { BottomSheet, closeOnSelfClick, OverlayCard } from "@/components/BottomSheet";
import { BinderModal, type BinderItem, CardStack, type IconType, Masthead, PosterCard, rowBtn } from "@/components/common";
import { GREEN, HAIRLINE, INK, MEDIA_KINDS, PAPER, POSTER_PALETTE, RUST, SANS, mediaKindOf } from "@/lib/constants";
import { hashStr, haptic, keepMedia, shortDate } from "@/lib/helpers";
import type { Keep, MediaKindId, MediaRecord, TabProps, Wish } from "@/lib/types";

const MEDIA_ICON: Record<MediaKindId, IconType> = { movie: Film, exhibition: Palette, live: Music2, book: BookOpen, album: Music };
const MEDIA_LABEL: Record<MediaKindId, string> = { movie: "CINEMA", exhibition: "EXHIBITION", live: "LIVE", book: "BOOK", album: "MUSIC" };
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
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>URLから場所を追加</div>

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

function AddStockMediaSheet({ onAdd, onClose }: {
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
        <OverlayCard>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>作品をストックに追加</div>
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
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 15, outline: "none", marginBottom: 14, background: "transparent" }} />
          <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>{current.creatorPlaceholder}</label>
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

function AddWishSheet({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  return (
    <BottomSheet onClose={onClose}>
      {(requestClose) => (
        <OverlayCard>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>ウィッシュリストに追加</div>
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

// ストックタブ: 作品・場所・ウィッシュリストの3つの「カードの束」を積む。
// どの束もタップすると中身が一覧できるシートが開き、束の一番手前(右)の
// ＋タイルをタップすると新規追加シートが開く。KEEP由来のカードには
// 左上に小さなKEEPバッジを表示し、手動追加したものと見分けられるようにする。
export function StockTab({ appState, persist, showToast, profileButton, selection, toggleKeepSelection, toggleMediaSelection }: TabProps) {
  const [openStack, setOpenStack] = useState<"media" | "place" | "wish" | null>(null);
  const [addingUrl, setAddingUrl] = useState(false);
  const [addingMedia, setAddingMedia] = useState(false);
  const [addingWish, setAddingWish] = useState(false);
  const [mediaDetail, setMediaDetail] = useState<BinderItem | null>(null);
  const [placeDetail, setPlaceDetail] = useState<Keep | null>(null);
  const [wishDetail, setWishDetail] = useState<Wish | null>(null);

  // ---- 作品 ----
  const mediaItemsDesc = keepMedia(appState).slice().sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  const addMediaKeep = ({ kind, title, creator }: { kind: MediaKindId; title: string; creator: string }) => {
    haptic();
    const next = structuredClone(appState);
    next.records = next.records ?? { media: [] };
    next.records.media.unshift({ id: `media-${Date.now()}`, kind, title, creator, addedAt: new Date().toISOString(), status: "keep", color: POSTER_PALETTE[hashStr(title) % POSTER_PALETTE.length], origin: "manual" });
    persist(next);
    showToast("作品をストックしました");
  };
  // 作品の唯一の出口: 観た/読んだ/聴いたを押すと実際にやったログ(done)へ進み、アーカイブタブへ移る
  const markMediaDone = (id: string) => {
    haptic(10);
    const next = structuredClone(appState);
    const r = next.records.media.find((x) => x.id === id);
    if (r) {
      r.status = "done";
      r.doneAt = new Date().toISOString();
    }
    persist(next);
    showToast("アーカイブに移しました");
  };
  const mediaCard = (r: MediaRecord, size?: number) => (
    <PosterCard key={r.id} image={r.image} color={r.color} title={r.title} sub={r.creator || shortDate(r.addedAt)} label={MEDIA_LABEL[r.kind]}
      icon={MEDIA_ICON[r.kind]} kept={r.origin !== "manual"} size={size}
      action={size ? undefined : { label: mediaKindOf(r.kind).doneActionLabel, onClick: () => markMediaDone(r.id) }}
      onClick={size ? undefined : (r.image ? () => setMediaDetail({ title: r.title, category: mediaKindOf(r.kind).label, images: [r.image!], meta: r.creator ? [r.creator] : [] }) : undefined)}
      planSelected={size ? undefined : selection.mediaIds.includes(r.id)}
      onTogglePlanSelect={size ? undefined : () => toggleMediaSelection(r.id)} />
  );

  // ---- 場所 ----
  const placeItemsDesc = appState.keeps.filter((k) => k.status !== "done").sort((a, b) => new Date(b.keptAt).getTime() - new Date(a.keptAt).getTime());
  const removeKeep = (id: string) => {
    const next = structuredClone(appState);
    next.keeps = next.keeps.filter((x) => x.id !== id);
    persist(next);
  };
  const addPlaceFromUrl = (data: { title: string; category: string; area: string; sourceUrl: string; sourceLabel: string }) => {
    haptic(14);
    const next = structuredClone(appState);
    const seed = `url-${Date.now()}`;
    next.keeps.push({
      id: `manual-${Date.now()}`, title: data.title, category: data.category, area: data.area || undefined,
      status: "candidate", keptAt: new Date().toISOString(),
      images: [seed], color: POSTER_PALETTE[hashStr(data.title) % POSTER_PALETTE.length],
      sourceUrl: data.sourceUrl, sourceLabel: data.sourceLabel, origin: "manual",
    });
    persist(next);
    showToast("場所をストックしました");
  };
  const placeCard = (k: Keep, size?: number) => (
    <PosterCard key={k.id} image={k.images?.[0]} color={k.color} title={k.title} sub={k.area && k.area !== "—" ? k.area : k.category}
      icon={MapPin} kept={k.origin !== "manual"} size={size}
      onClick={size ? undefined : () => setPlaceDetail(k)}
      planSelected={size ? undefined : selection.keepIds.includes(k.id)}
      onTogglePlanSelect={size ? undefined : () => toggleKeepSelection(k.id)} />
  );

  // ---- ウィッシュリスト ----
  const wishItemsDesc = appState.wishes.filter((w) => w.status === "stock").sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  const addWish = (title: string) => {
    haptic();
    const next = structuredClone(appState);
    next.wishes.unshift({ id: `wish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, category: "やりたい", categoryId: "do", status: "stock", addedAt: new Date().toISOString() });
    persist(next);
    showToast("ウィッシュリストに追加しました");
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
  // ウィッシュリストの項目をゴールに格上げする: goalsへ追加し、wishesからは消す
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

  const totalCount = mediaItemsDesc.length + placeItemsDesc.length + wishItemsDesc.length;

  return (
    <>
      <Masthead title="ストック" statValue={totalCount} statLabel="件" corner={profileButton} />

      <main style={{ flex: 1, paddingTop: 18, paddingBottom: 32 }}>
        <StackSection title="作品" count={mediaItemsDesc.length}>
          <CardStack cardWidth={STACK_CARD_WIDTH}
            items={mediaItemsDesc.slice().reverse().map((r) => ({ key: r.id, node: mediaCard(r, STACK_CARD_WIDTH) }))}
            onOpen={() => setOpenStack("media")} onAdd={() => setAddingMedia(true)} addLabel="作品を追加" />
        </StackSection>

        <StackSection title="場所" count={placeItemsDesc.length}>
          <CardStack cardWidth={STACK_CARD_WIDTH}
            items={placeItemsDesc.slice().reverse().map((k) => ({ key: k.id, node: placeCard(k, STACK_CARD_WIDTH) }))}
            onOpen={() => setOpenStack("place")} onAdd={() => setAddingUrl(true)} addLabel="場所を追加" />
        </StackSection>

        <StackSection title="ウィッシュリスト" count={wishItemsDesc.length}>
          <CardStack cardWidth={STACK_CARD_WIDTH}
            items={wishItemsDesc.slice().reverse().map((w) => ({ key: w.id, node: wishCard(w, STACK_CARD_WIDTH) }))}
            onOpen={() => setOpenStack("wish")} onAdd={() => setAddingWish(true)} addLabel="ウィッシュリストに追加" />
        </StackSection>
      </main>

      {openStack === "media" && (
        <BottomSheet onClose={() => setOpenStack(null)} maxHeight="74vh">
          {(requestClose) => (
            <>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, color: "#fff", margin: "8px 4px 16px", textShadow: "0 2px 8px rgba(0,0,0,0.35)" }}>作品</div>
              <div onClick={closeOnSelfClick(requestClose)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "0 4px 8px" }}>
                {mediaItemsDesc.length === 0 ? <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)" }}>まだありません。</p> : mediaItemsDesc.map((r) => mediaCard(r))}
              </div>
            </>
          )}
        </BottomSheet>
      )}
      {openStack === "place" && (
        <BottomSheet onClose={() => setOpenStack(null)} maxHeight="74vh">
          {(requestClose) => (
            <>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, color: "#fff", margin: "8px 4px 16px", textShadow: "0 2px 8px rgba(0,0,0,0.35)" }}>場所</div>
              <div onClick={closeOnSelfClick(requestClose)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "0 4px 8px" }}>
                {placeItemsDesc.length === 0 ? <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)" }}>まだありません。</p> : placeItemsDesc.map((k) => placeCard(k))}
              </div>
            </>
          )}
        </BottomSheet>
      )}
      {openStack === "wish" && (
        <BottomSheet onClose={() => setOpenStack(null)} maxHeight="74vh">
          {(requestClose) => (
            <>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, color: "#fff", margin: "8px 4px 16px", textShadow: "0 2px 8px rgba(0,0,0,0.35)" }}>ウィッシュリスト</div>
              <div onClick={closeOnSelfClick(requestClose)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "0 4px 8px" }}>
                {wishItemsDesc.length === 0 ? <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)" }}>まだありません。</p> : wishItemsDesc.map((w) => wishCard(w))}
              </div>
            </>
          )}
        </BottomSheet>
      )}

      {addingUrl && <AddPlaceSheet onAdd={addPlaceFromUrl} onClose={() => setAddingUrl(false)} />}
      {addingMedia && <AddStockMediaSheet onAdd={addMediaKeep} onClose={() => setAddingMedia(false)} />}
      {addingWish && <AddWishSheet onAdd={addWish} onClose={() => setAddingWish(false)} />}

      <BinderModal item={mediaDetail} onClose={() => setMediaDetail(null)} />
      <BinderModal
        item={placeDetail ? { title: placeDetail.title, category: placeDetail.category, images: placeDetail.images, meta: placeDetail.meta, sourceUrl: placeDetail.sourceUrl, sourceLabel: placeDetail.sourceLabel } : null}
        onClose={() => setPlaceDetail(null)}
        actionSlot={(close) => (
          <button onClick={() => { removeKeep(placeDetail!.id); close(); }} style={rowBtn("transparent", RUST, "rgba(168,85,47,0.4)")}>削除</button>
        )} />
      <BinderModal
        item={wishDetail ? { title: wishDetail.title, category: "ウィッシュリスト" } : null}
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
