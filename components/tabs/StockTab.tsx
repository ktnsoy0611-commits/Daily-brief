"use client";

import { CheckCircle2, MapPin, ShoppingBag, Trash2 } from "lucide-react";
import { useState, type ComponentType } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { BinderModal, type BinderItem, Dot, keepStatus, Masthead, PosterCard, rowBtn, Thumb } from "@/components/common";
import { BG, CATEGORIES, DISPLAY, HAIRLINE, INK, MEDIA_KINDS, PAPER, POSTER_PALETTE, RUST, SANS, SERIF, catOf, mediaKindOf } from "@/lib/constants";
import { daysBetween, hashStr, haptic, keepMedia, shortDate } from "@/lib/helpers";
import type { CategoryId, MediaKindId, TabProps, Wish } from "@/lib/types";

const CATEGORY_ICONS: Record<CategoryId, ComponentType<{ size?: number }>> = {
  do: CheckCircle2, buy: ShoppingBag, go: MapPin,
};

function WishRow({ item, index, isOpen, onToggle, onFulfill, onRemove }: {
  item: Wish; index: number; isOpen: boolean; onToggle: () => void; onFulfill: () => void; onRemove: () => void;
}) {
  const cat = catOf(item.categoryId ?? "do");
  return (
    <div>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "12px 2px", cursor: "pointer", borderTop: index === 0 ? "none" : `1px solid ${HAIRLINE}` }}>
        <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 700, fontSize: 15, color: cat.color, minWidth: 26, textAlign: "right" }}>{String(index + 1).padStart(2, "0")}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 14.5, lineHeight: 1.5 }}>{item.title}</div>
          <div style={{ marginTop: 4 }}><Dot color={cat.color} label={`${cat.label} ・ ${shortDate(item.addedAt)}`} /></div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateRows: isOpen ? "1fr" : "0fr", transition: "grid-template-rows 0.22s cubic-bezier(0.32,0.72,0,1)" }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 2px 12px 38px" }}>
            <button onClick={onFulfill} style={rowBtn(INK, PAPER)}>叶えた</button>
            <button onClick={onRemove} aria-label="削除" style={{ background: "none", border: "none", color: RUST, cursor: "pointer", padding: 6, display: "flex" }}><Trash2 size={15} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
        <>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>URLから場所を追加</div>

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
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SERIF, fontSize: 15, outline: "none", marginBottom: 12, background: "transparent" }} />
              <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>種類</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 12, background: "transparent" }} />
              <label style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E" }}>エリア（任意）</label>
              <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="例: 蔵前" style={{ width: "100%", boxSizing: "border-box", border: "none", borderBottom: `1.5px solid ${INK}`, padding: "8px 2px", fontFamily: SANS, fontSize: 13, outline: "none", marginBottom: 18, background: "transparent" }} />
              <button onClick={() => { if (!title.trim()) return; onAdd({ title: title.trim(), category: category.trim() || "登録した場所", area: area.trim(), sourceUrl: url.trim(), sourceLabel: "登録したリンクを見る" }); requestClose(); }} disabled={!title.trim()} style={{ width: "100%", padding: "13px 0", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>この内容で追加</button>
            </>
          )}
        </>
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
        <>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16, marginBottom: 14 }}>作品をストックに追加</div>
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
          }}>ストックする</button>
        </>
      )}
    </BottomSheet>
  );
}

type Segment = "memo" | "place" | "media";
const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "memo", label: "メモ" }, { id: "place", label: "場所" }, { id: "media", label: "作品" },
];

// ストックタブ: 「まだ実行していないもの」を3つの棚に分けて置く。
// メモ=単発の願望(カテゴリ付き・叶えたら完了)、場所=行き先のKeep(実行タブの
// 地図はこのデータのビューにすぎない)、作品=観る/読む/聴くメディアのKeep
// (唯一の出口は各カードの「観た/読んだ/聴いた」ボタン)。
export function StockTab({ appState, persist, showToast }: TabProps) {
  const [segment, setSegment] = useState<Segment>("memo");

  // ---- メモ ----
  const [categoryFilter, setCategoryFilter] = useState<"all" | CategoryId>("all");
  const [input, setInput] = useState("");
  const [inputCat, setInputCat] = useState<CategoryId>("do");
  const [openId, setOpenId] = useState<string | null>(null);

  const addWish = () => {
    if (!input.trim()) return;
    haptic();
    const next = structuredClone(appState);
    next.wishes.unshift({ id: `wish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: input.trim(), category: catOf(inputCat).label, categoryId: inputCat, status: "stock", addedAt: new Date().toISOString() });
    persist(next);
    showToast("願望をストックしました");
    setInput("");
  };
  const updateWish = (id: string, patch: Partial<Wish>) => {
    const next = structuredClone(appState);
    const w = next.wishes.find((x) => x.id === id);
    if (w) Object.assign(w, patch);
    persist(next);
    setOpenId(null);
  };
  const removeWish = (id: string) => {
    const next = structuredClone(appState);
    next.wishes = next.wishes.filter((x) => x.id !== id);
    persist(next);
    setOpenId(null);
  };
  const wishItems = appState.wishes.filter((w) => w.status === "stock" && (categoryFilter === "all" || (w.categoryId ?? "do") === categoryFilter));

  // ---- 場所 ----
  const [placeSelectedId, setPlaceSelectedId] = useState<string | null>(null);
  const [placeBinderItem, setPlaceBinderItem] = useState<BinderItem | null>(null);
  const [addingUrl, setAddingUrl] = useState(false);
  const placeItems = appState.keeps.filter((k) => k.status !== "done").sort((a, b) => new Date(b.keptAt).getTime() - new Date(a.keptAt).getTime());

  const removeKeep = (id: string) => {
    const next = structuredClone(appState);
    next.keeps = next.keeps.filter((x) => x.id !== id);
    persist(next);
    setPlaceSelectedId(null);
  };
  const addPlaceFromUrl = (data: { title: string; category: string; area: string; sourceUrl: string; sourceLabel: string }) => {
    haptic(14);
    const next = structuredClone(appState);
    const seed = `url-${Date.now()}`;
    next.keeps.push({
      id: `manual-${Date.now()}`, title: data.title, category: data.category, area: data.area || undefined,
      status: "candidate", keptAt: new Date().toISOString(),
      images: [seed], color: POSTER_PALETTE[hashStr(data.title) % POSTER_PALETTE.length],
      sourceUrl: data.sourceUrl, sourceLabel: data.sourceLabel,
    });
    persist(next);
    showToast("場所をストックしました");
  };

  // ---- 作品 ----
  const [addingMedia, setAddingMedia] = useState(false);
  const [mediaBinderItem, setMediaBinderItem] = useState<BinderItem | null>(null);
  const mediaLabel: Record<MediaKindId, string> = { movie: "CINEMA", exhibition: "EXHIBITION", live: "LIVE", book: "BOOK", album: "MUSIC" };
  const mediaItems = keepMedia(appState).slice().sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());

  const addMediaKeep = ({ kind, title, creator }: { kind: MediaKindId; title: string; creator: string }) => {
    haptic();
    const next = structuredClone(appState);
    next.records = next.records ?? { media: [] };
    next.records.media.unshift({ id: `media-${Date.now()}`, kind, title, creator, addedAt: new Date().toISOString(), status: "keep", color: POSTER_PALETTE[hashStr(title) % POSTER_PALETTE.length] });
    persist(next);
  };
  // 作品の唯一の出口: 観た/読んだ/聴いたを押すと実際にやったログ(done)へ進み、記録タブへ移る
  const markMediaDone = (id: string) => {
    haptic(10);
    const next = structuredClone(appState);
    const r = next.records.media.find((x) => x.id === id);
    if (r) {
      r.status = "done";
      r.doneAt = new Date().toISOString();
    }
    persist(next);
    showToast("記録に移しました");
  };

  const statValue = segment === "memo" ? wishItems.length : segment === "place" ? placeItems.length : mediaItems.length;

  return (
    <>
      <Masthead title="ストック" en="STOCK" statValue={statValue} statLabel="件" />

      <div style={{ display: "flex", gap: 4, padding: "14px 0 10px", background: "rgba(23,23,21,0.05)", borderRadius: 999, marginTop: 4 }}>
        {SEGMENTS.map((s) => (
          <button key={s.id} onClick={() => setSegment(s.id)} style={{
            flex: 1, padding: "9px 0", borderRadius: 999, cursor: "pointer", fontFamily: SERIF, fontSize: 13, fontWeight: 700,
            background: segment === s.id ? INK : "transparent", color: segment === s.id ? PAPER : "#5A5A54", border: "none",
            transition: "background 0.18s, color 0.18s",
          }}>{s.label}</button>
        ))}
      </div>

      {segment === "memo" && (
        <nav style={{ display: "flex", gap: 6, padding: "10px 0 4px", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {([{ id: "all" as const, label: "すべて", Icon: undefined }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, Icon: CATEGORY_ICONS[c.id] }))]).map((c) => (
            <button key={c.id} onClick={() => setCategoryFilter(c.id)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, background: categoryFilter === c.id ? INK : "transparent", color: categoryFilter === c.id ? PAPER : "#5A5A54", border: categoryFilter === c.id ? `1.5px solid ${INK}` : "1.5px solid rgba(23,23,21,0.2)" }}>
              {c.Icon && <c.Icon size={12} />}{c.label}
            </button>
          ))}
        </nav>
      )}

      {segment === "memo" && (
        <main style={{ flex: 1, paddingTop: 8, paddingBottom: 150 }}>
          {wishItems.length === 0 ? (
            <div style={{ padding: "40px 4px", textAlign: "center" }}>
              <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>まだ何もありません</div>
              <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>ふと思った願望を、大小問わず。</p>
            </div>
          ) : wishItems.map((w, i) => (
            <WishRow key={w.id} item={w} index={i} isOpen={openId === w.id}
              onToggle={() => setOpenId(openId === w.id ? null : w.id)}
              onFulfill={() => updateWish(w.id, { status: "fulfilled", fulfilledAt: new Date().toISOString() })}
              onRemove={() => removeWish(w.id)} />
          ))}
        </main>
      )}

      {segment === "place" && (
        <main style={{ flex: 1, paddingBottom: 24, paddingTop: 14 }}>
          <p style={{ fontSize: 11, color: "#9A988E", lineHeight: 1.8, margin: "0 0 10px" }}>削除しない限り消えません。実行タブの地図はこのデータのビューです。</p>
          <button onClick={() => setAddingUrl(true)} style={{ marginBottom: 16, width: "100%", padding: "10px 0", background: "transparent", border: "1.5px dashed rgba(23,23,21,0.3)", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#5A5A54" }}>＋ URLから場所を追加</button>
          {placeItems.length === 0 ? (
            <div style={{ padding: "40px 4px", textAlign: "center" }}><div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>まだKeepがありません。</div></div>
          ) : placeItems.map((k, i) => {
            const status = keepStatus(k);
            const isSel = placeSelectedId === k.id;
            return (
              <div key={k.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 2px", borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}` }}>
                  {k.images && k.images.length > 0 && <Thumb seed={k.images[0]} onOpen={() => setPlaceBinderItem(k)} />}
                  <div onClick={() => setPlaceSelectedId(isSel ? null : k.id)} style={{ flex: 1, cursor: "pointer" }}>
                    <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 13.5, lineHeight: 1.5 }}>{k.title}</div>
                    <div style={{ marginTop: 4 }}><Dot color={status.color} label={`${status.label} ・ ${k.category}${k.area && k.area !== "—" ? "・" + k.area : ""} ・ ${daysBetween(k.keptAt) === 0 ? "今日" : daysBetween(k.keptAt) + "日前"}`} /></div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateRows: isSel ? "1fr" : "0fr", transition: "grid-template-rows 0.22s cubic-bezier(0.32,0.72,0,1)" }}>
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 2px 14px" }}>
                      <button onClick={() => removeKeep(k.id)} style={rowBtn("transparent", RUST, "rgba(168,85,47,0.4)")}>削除</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <BinderModal item={placeBinderItem} onClose={() => setPlaceBinderItem(null)} />
        </main>
      )}

      {segment === "media" && (
        <main style={{ flex: 1, paddingBottom: 24, paddingTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <p style={{ fontSize: 11, color: "#9A988E", lineHeight: 1.8, margin: 0 }}>ブリーフでKeepした作品や、手動で追加した作品が並びます。</p>
            <button onClick={() => setAddingMedia(true)} aria-label="作品を追加" style={{
              flexShrink: 0, width: 28, height: 28, borderRadius: "50%", border: "1.5px solid rgba(23,23,21,0.25)", background: "transparent",
              color: "#5A5A54", cursor: "pointer", fontSize: 15, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, marginLeft: 10,
            }}>＋</button>
          </div>
          {mediaItems.length === 0 ? (
            <div style={{ padding: "40px 4px", textAlign: "center" }}><div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>まだ作品がありません。</div></div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {mediaItems.map((r) => (
                <PosterCard key={r.id} image={r.image} color={r.color} title={r.title} sub={r.creator || shortDate(r.addedAt)} label={mediaLabel[r.kind]}
                  action={{ label: mediaKindOf(r.kind).doneActionLabel, onClick: () => markMediaDone(r.id) }}
                  onClick={r.image ? () => setMediaBinderItem({ title: r.title, category: mediaKindOf(r.kind).label, images: [r.image!], meta: r.creator ? [r.creator] : [] }) : undefined} />
              ))}
            </div>
          )}
          <BinderModal item={mediaBinderItem} onClose={() => setMediaBinderItem(null)} />
        </main>
      )}

      {segment === "memo" && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 60, zIndex: 20, display: "flex", justifyContent: "center", background: `linear-gradient(to top, ${BG} 75%, rgba(239,237,230,0))`, paddingTop: 16 }}>
          <div style={{ width: "100%", maxWidth: 420, padding: "0 16px 10px" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              {CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICONS[c.id];
                return (
                  <button key={c.id} onClick={() => setInputCat(c.id)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, padding: "4px 10px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontWeight: 700, background: inputCat === c.id ? c.color : "transparent", color: inputCat === c.id ? PAPER : "#7A7A72", border: `1px solid ${inputCat === c.id ? c.color : "rgba(23,23,21,0.2)"}` }}>
                    <Icon size={11} />{c.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, background: PAPER, border: `1.5px solid ${INK}`, borderRadius: 999, padding: "4px 4px 4px 18px", boxShadow: "0 6px 20px rgba(23,23,21,0.1)" }}>
              <input
                value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addWish()}
                placeholder="ふと思った願望を、なんでも"
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: SANS, fontSize: 13, color: INK, minWidth: 0 }} />
              <button onClick={addWish} style={{ background: INK, color: PAPER, border: "none", borderRadius: 999, padding: "10px 18px", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>追加</button>
            </div>
          </div>
        </div>
      )}

      {addingUrl && <AddPlaceSheet onAdd={addPlaceFromUrl} onClose={() => setAddingUrl(false)} />}
      {addingMedia && <AddStockMediaSheet onAdd={addMediaKeep} onClose={() => setAddingMedia(false)} />}
    </>
  );
}
