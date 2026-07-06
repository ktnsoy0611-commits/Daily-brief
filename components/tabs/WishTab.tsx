"use client";

import { ChevronDown, Sprout } from "lucide-react";
import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Dot, Masthead, rowBtn } from "@/components/common";
import { BG, BLUE, CATEGORIES, DISPLAY, GREEN, HAIRLINE, INK, PAPER, POSTER_PALETTE, RUST, SANS, SERIF, catOf } from "@/lib/constants";
import { hashStr, haptic, ratingLabel, shortDate } from "@/lib/helpers";
import type { CategoryId, Goal, TabProps, Wish } from "@/lib/types";

// URLから場所を追加するシート。
// GoogleマップのURLは無料のPlaces APIで解析(安価)、それ以外のURL(展覧会の
// 公式サイトなど)はGeminiでの読み取りが必要になる(わずかに課金が発生し
// うる)、という使い分けを見せている。この環境には実際のAPIがないため、
// 解析結果はモック。実装ではここをサーバー側の関数呼び出しに置き換える。
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
              <div style={{ fontSize: 10, color: parsed?.parseMethod === "gemini" ? RUST : BLUE, marginBottom: 14, lineHeight: 1.7 }}>
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

type FilterId = "all" | "goal" | CategoryId;
type FeedItem = { kind: "wish"; data: Wish } | { kind: "goal"; data: Goal };

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
          <div style={{ display: "flex", gap: 8, padding: "2px 2px 12px 38px" }}>
            <button onClick={onFulfill} style={rowBtn(INK, PAPER)}>叶えた！</button>
            <button onClick={onRemove} style={rowBtn("transparent", RUST, "rgba(168,85,47,0.4)")}>削除</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoalRow({ item, index, isOpen, onToggle, onRemove, draft, onDraftChange, onManualAdd }: {
  item: Goal; index: number; isOpen: boolean; onToggle: () => void; onRemove: () => void;
  draft: string; onDraftChange: (v: string) => void; onManualAdd: () => void;
}) {
  const latest = item.checkIns?.[0];
  return (
    <div style={{ borderTop: index === 0 ? "none" : `1px solid ${HAIRLINE}`, padding: "12px 2px" }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "baseline", gap: 12, cursor: "pointer" }}>
        <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 700, fontSize: 15, color: GREEN, minWidth: 26, textAlign: "right" }}>{String(index + 1).padStart(2, "0")}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Sprout size={13} color={GREEN} style={{ flexShrink: 0 }} />
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 14.5, lineHeight: 1.5 }}>{item.title}</div>
          </div>
          <p style={{ fontSize: 12, color: latest ? "#4A4A44" : "#9A988E", lineHeight: 1.6, margin: "5px 0 0", fontStyle: latest ? "normal" : "italic" }}>
            {latest ? latest.text : "まだ記録がありません。"}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Dot color={GREEN} label={`目標 ・ ${shortDate(latest?.at ?? item.addedAt)}`} />
            {latest?.kind === "milestone" && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.05em", color: PAPER, background: RUST, borderRadius: 999, padding: "2px 7px" }}>{ratingLabel(latest.rating)}</span>}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, marginLeft: 38 }}>
        <button onClick={onToggle} style={{ ...rowBtn("transparent", "#5A5A54", "rgba(23,23,21,0.2)"), display: "inline-flex", alignItems: "center", gap: 5 }}>
          これまでの記録（{item.checkIns?.length ?? 0}）
          <ChevronDown size={12} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </button>
        <button onClick={onRemove} style={{ background: "none", border: "none", color: "#9A988E", fontSize: 11, cursor: "pointer" }}>削除</button>
      </div>

      <div style={{ display: "grid", gridTemplateRows: isOpen ? "1fr" : "0fr", transition: "grid-template-rows 0.26s cubic-bezier(0.32,0.72,0,1)" }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ marginTop: 12, marginLeft: 38 }}>
            {(item.checkIns ?? []).length === 0 ? (
              <p style={{ fontSize: 11.5, color: "#9A988E" }}>まだ記録がありません。</p>
            ) : item.checkIns.map((ci) => (
              <div key={ci.id} style={{ padding: "8px 0", borderTop: `1px solid ${HAIRLINE}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 9.5, color: "#9A988E" }}>{shortDate(ci.at)}{ci.source === "prompted" && " ・ ブリーフより"}</span>
                  {ci.kind === "milestone" && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.05em", color: PAPER, background: RUST, borderRadius: 999, padding: "2px 7px" }}>{ratingLabel(ci.rating)}</span>}
                </div>
                <div style={{ fontSize: 12, color: "#4A4A44", lineHeight: 1.6 }}>{ci.text}</div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input value={draft} onChange={(e) => onDraftChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onManualAdd()}
                placeholder="今の様子を書き足す" style={{ flex: 1, border: "none", borderBottom: `1px solid ${INK}`, background: "transparent", fontFamily: SANS, fontSize: 12.5, padding: "6px 2px", outline: "none" }} />
              <button onClick={onManualAdd} style={rowBtn(INK, PAPER)}>記録</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 願望タブ: 「単発の願望」(カテゴリ付き・叶えたら完了)と「目標」(カテゴリなし・
// 終わりがなくチェックインが積み上がる)を1つのフィードに統合する。データは
// wishes/goalsそれぞれ別配列のまま持ち、タブのUI層だけをまとめている
// (ブリーフの育成カード生成など、goals配列に依存する既存ロジックへの影響を避けるため)。
export function WishTab({ appState, persist, showToast }: TabProps) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [addMode, setAddMode] = useState<"wish" | "goal">("wish");
  const [input, setInput] = useState("");
  const [inputCat, setInputCat] = useState<CategoryId>("do");
  const [openId, setOpenId] = useState<string | null>(null);
  const [addingUrl, setAddingUrl] = useState(false);
  const [manualDraft, setManualDraft] = useState<Record<string, string>>({});

  const addWish = () => {
    if (!input.trim()) return;
    haptic();
    const next = structuredClone(appState);
    next.wishes.unshift({ id: `wish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: input.trim(), category: catOf(inputCat).label, categoryId: inputCat, status: "stock", addedAt: new Date().toISOString() });
    persist(next);
    showToast("願望をストックしました");
    setInput("");
  };
  const addGoal = () => {
    if (!input.trim()) return;
    haptic();
    const next = structuredClone(appState);
    next.goals = next.goals ?? [];
    next.goals.push({ id: `goal-${Date.now()}`, title: input.trim(), addedAt: new Date().toISOString(), checkIns: [] });
    persist(next);
    showToast("目標を登録しました");
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
  const removeGoal = (id: string) => {
    const next = structuredClone(appState);
    next.goals = next.goals.filter((g) => g.id !== id);
    persist(next);
  };
  const addManualCheckIn = (goalId: string) => {
    const text = (manualDraft[goalId] ?? "").trim();
    if (!text) return;
    haptic();
    const next = structuredClone(appState);
    const g = next.goals.find((x) => x.id === goalId);
    if (!g) return;
    g.checkIns = g.checkIns ?? [];
    g.checkIns.unshift({ id: `ci-${Date.now()}`, at: new Date().toISOString(), text, source: "manual" });
    persist(next);
    setManualDraft((d) => ({ ...d, [goalId]: "" }));
  };
  const addPlaceFromUrl = (data: ParsedPlace) => {
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
    showToast("週末の地図に追加しました");
  };

  const wishItems = appState.wishes.filter((w) => w.status === "stock");
  const goalItems = appState.goals ?? [];
  const recencyOf = (item: FeedItem) => new Date(item.kind === "goal" ? (item.data.checkIns?.[0]?.at ?? item.data.addedAt) : item.data.addedAt).getTime();

  let feed: FeedItem[];
  if (filter === "goal") {
    feed = goalItems.map((g) => ({ kind: "goal", data: g }));
  } else if (filter === "all") {
    feed = [
      ...wishItems.map((w) => ({ kind: "wish", data: w }) as FeedItem),
      ...goalItems.map((g) => ({ kind: "goal", data: g }) as FeedItem),
    ];
  } else {
    feed = wishItems.filter((w) => (w.categoryId ?? "do") === filter).map((w) => ({ kind: "wish", data: w }));
  }
  feed = feed.slice().sort((a, b) => recencyOf(b) - recencyOf(a));

  return (
    <>
      <Masthead title="願望" en="WISHES" statValue={feed.length} statLabel={filter === "goal" ? "件の目標" : "件"} />
      <nav style={{ display: "flex", gap: 6, padding: "14px 0 4px", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {([{ id: "all" as const, label: "すべて" }, { id: "goal" as const, label: "目標" }, ...CATEGORIES]).map((c) => (
          <button key={c.id} onClick={() => setFilter(c.id)} style={{ flexShrink: 0, padding: "6px 13px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, background: filter === c.id ? INK : "transparent", color: filter === c.id ? PAPER : "#5A5A54", border: filter === c.id ? `1.5px solid ${INK}` : "1.5px solid rgba(23,23,21,0.2)" }}>{c.label}</button>
        ))}
      </nav>
      <button onClick={() => setAddingUrl(true)} style={{ margin: "10px 0 4px", width: "100%", padding: "10px 0", background: "transparent", border: "1.5px dashed rgba(23,23,21,0.3)", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#5A5A54" }}>＋ URLから行きたい場所を追加</button>
      <main style={{ flex: 1, paddingTop: 8, paddingBottom: 190 }}>
        {filter === "goal" && (
          <p style={{ fontSize: 11.5, color: "#9A988E", lineHeight: 1.8, margin: "8px 2px 14px" }}>
            ギターや読書のように、終わりのない自己研鑽のための場所です。ブリーフでときどき「最近どうですか？」と聞かれるので、答えるだけで記録が積み上がります。
          </p>
        )}
        {feed.length === 0 ? (
          <div style={{ padding: "40px 4px", textAlign: "center" }}>
            <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
              {filter === "goal" ? "まだ目標がありません。" : "まだ何もありません。"}
            </div>
            <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>
              {filter === "goal" ? "終わりのない目標を、下から登録できます。" : "ふと思った願望を、大小問わず。"}
            </p>
          </div>
        ) : feed.map((item, i) =>
          item.kind === "wish" ? (
            <WishRow key={item.data.id} item={item.data} index={i} isOpen={openId === item.data.id}
              onToggle={() => setOpenId(openId === item.data.id ? null : item.data.id)}
              onFulfill={() => updateWish(item.data.id, { status: "fulfilled", fulfilledAt: new Date().toISOString() })}
              onRemove={() => removeWish(item.data.id)} />
          ) : (
            <GoalRow key={item.data.id} item={item.data} index={i} isOpen={openId === item.data.id}
              onToggle={() => setOpenId(openId === item.data.id ? null : item.data.id)}
              onRemove={() => removeGoal(item.data.id)}
              draft={manualDraft[item.data.id] ?? ""} onDraftChange={(v) => setManualDraft((d) => ({ ...d, [item.data.id]: v }))}
              onManualAdd={() => addManualCheckIn(item.data.id)} />
          )
        )}
      </main>
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 60, zIndex: 20, display: "flex", justifyContent: "center", background: `linear-gradient(to top, ${BG} 75%, rgba(239,237,230,0))`, paddingTop: 16 }}>
        <div style={{ width: "100%", maxWidth: 420, padding: "0 16px 10px" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {([{ id: "wish" as const, label: "単発の願望" }, { id: "goal" as const, label: "目標" }]).map((m) => (
              <button key={m.id} onClick={() => setAddMode(m.id)} style={{
                flex: 1, padding: "7px 0", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700,
                background: addMode === m.id ? INK : "transparent", color: addMode === m.id ? PAPER : "#7A7A72",
                border: `1px solid ${addMode === m.id ? INK : "rgba(23,23,21,0.2)"}`,
              }}>{m.label}</button>
            ))}
          </div>
          {addMode === "wish" && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              {CATEGORIES.map((c) => (
                <button key={c.id} onClick={() => setInputCat(c.id)} style={{ flexShrink: 0, fontSize: 10, padding: "4px 10px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontWeight: 700, background: inputCat === c.id ? c.color : "transparent", color: inputCat === c.id ? PAPER : "#7A7A72", border: `1px solid ${inputCat === c.id ? c.color : "rgba(23,23,21,0.2)"}` }}>{c.label}</button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, background: PAPER, border: `1.5px solid ${INK}`, borderRadius: 999, padding: "4px 4px 4px 18px", boxShadow: "0 6px 20px rgba(23,23,21,0.1)" }}>
            <input
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (addMode === "wish" ? addWish() : addGoal())}
              placeholder={addMode === "wish" ? "ふと思った願望を、なんでも" : "ギター、読書、筋トレ…終わりのない目標を"}
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: SANS, fontSize: 13, color: INK, minWidth: 0 }} />
            <button onClick={addMode === "wish" ? addWish : addGoal} style={{ background: INK, color: PAPER, border: "none", borderRadius: 999, padding: "10px 18px", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>追加</button>
          </div>
        </div>
      </div>
      {addingUrl && <AddPlaceSheet onAdd={addPlaceFromUrl} onClose={() => setAddingUrl(false)} />}
    </>
  );
}
