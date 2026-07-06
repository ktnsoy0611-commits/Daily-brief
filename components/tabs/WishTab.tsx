"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Dot, Masthead, rowBtn } from "@/components/common";
import { BG, BLUE, CATEGORIES, DISPLAY, HAIRLINE, INK, PAPER, POSTER_PALETTE, RUST, SANS, SERIF, catOf } from "@/lib/constants";
import { hashStr, haptic, shortDate } from "@/lib/helpers";
import type { CategoryId, TabProps } from "@/lib/types";

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

export function WishTab({ appState, persist, showToast }: TabProps) {
  const [filter, setFilter] = useState<CategoryId | "all">("all");
  const [input, setInput] = useState("");
  const [inputCat, setInputCat] = useState<CategoryId>("do");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingUrl, setAddingUrl] = useState(false);

  const addWish = () => {
    if (!input.trim()) return;
    haptic();
    const next = structuredClone(appState);
    next.wishes.unshift({ id: `wish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: input.trim(), category: catOf(inputCat).label, categoryId: inputCat, status: "stock", addedAt: new Date().toISOString() });
    persist(next);
    showToast("願望をストックしました");
    setInput("");
  };
  const updateWish = (id: string, patch: Partial<(typeof appState.wishes)[number]>) => {
    const next = structuredClone(appState);
    const w = next.wishes.find((x) => x.id === id);
    if (w) Object.assign(w, patch);
    persist(next);
    setSelectedId(null);
  };
  const removeWish = (id: string) => {
    const next = structuredClone(appState);
    next.wishes = next.wishes.filter((x) => x.id !== id);
    persist(next);
    setSelectedId(null);
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

  const stock = appState.wishes.filter((w) => w.status === "stock" && (filter === "all" || (w.categoryId ?? "do") === filter));

  return (
    <>
      <Masthead title="願望" en="WISHES" statValue={stock.length} statLabel="件ストック中" />
      <nav style={{ display: "flex", gap: 6, padding: "14px 0 4px", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {[{ id: "all" as const, label: "すべて" }, ...CATEGORIES].map((c) => (
          <button key={c.id} onClick={() => setFilter(c.id)} style={{ flexShrink: 0, padding: "6px 13px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, background: filter === c.id ? INK : "transparent", color: filter === c.id ? PAPER : "#5A5A54", border: filter === c.id ? `1.5px solid ${INK}` : "1.5px solid rgba(23,23,21,0.2)" }}>{c.label}</button>
        ))}
      </nav>
      <button onClick={() => setAddingUrl(true)} style={{ margin: "10px 0 4px", width: "100%", padding: "10px 0", background: "transparent", border: "1.5px dashed rgba(23,23,21,0.3)", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#5A5A54" }}>＋ URLから行きたい場所を追加</button>
      <main style={{ flex: 1, paddingTop: 8, paddingBottom: 150 }}>
        {stock.length === 0 ? (
          <div style={{ padding: "40px 4px", textAlign: "center" }}>
            <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>まだ何もありません。</div>
            <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>ふと思った願望を、大小問わず。</p>
          </div>
        ) : stock.map((w, i) => {
          const cat = catOf(w.categoryId ?? "do");
          const isSel = selectedId === w.id;
          return (
            <div key={w.id}>
              <div onClick={() => setSelectedId(isSel ? null : w.id)} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "12px 2px", cursor: "pointer", borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}` }}>
                <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 700, fontSize: 15, color: cat.color, minWidth: 26, textAlign: "right" }}>{String(i + 1).padStart(2, "0")}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 14.5, lineHeight: 1.5 }}>{w.title}</div>
                  <div style={{ marginTop: 4 }}><Dot color={cat.color} label={`${cat.label} ・ ${shortDate(w.addedAt)}`} /></div>
                </div>
              </div>
              {isSel && (
                <div style={{ display: "flex", gap: 8, padding: "2px 2px 12px 38px" }}>
                  <button onClick={() => updateWish(w.id, { status: "fulfilled", fulfilledAt: new Date().toISOString() })} style={rowBtn(INK, PAPER)}>叶えた！</button>
                  <button onClick={() => removeWish(w.id)} style={rowBtn("transparent", RUST, "rgba(168,85,47,0.4)")}>削除</button>
                </div>
              )}
            </div>
          );
        })}
      </main>
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 60, zIndex: 20, display: "flex", justifyContent: "center", background: `linear-gradient(to top, ${BG} 75%, rgba(239,237,230,0))`, paddingTop: 16 }}>
        <div style={{ width: "100%", maxWidth: 420, padding: "0 16px 10px" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            {CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => setInputCat(c.id)} style={{ flexShrink: 0, fontSize: 10, padding: "4px 10px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontWeight: 700, background: inputCat === c.id ? c.color : "transparent", color: inputCat === c.id ? PAPER : "#7A7A72", border: `1px solid ${inputCat === c.id ? c.color : "rgba(23,23,21,0.2)"}` }}>{c.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, background: PAPER, border: `1.5px solid ${INK}`, borderRadius: 999, padding: "4px 4px 4px 18px", boxShadow: "0 6px 20px rgba(23,23,21,0.1)" }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addWish()} placeholder="ふと思った願望を、なんでも" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: SANS, fontSize: 13, color: INK, minWidth: 0 }} />
            <button onClick={addWish} style={{ background: INK, color: PAPER, border: "none", borderRadius: 999, padding: "10px 18px", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>追加</button>
          </div>
        </div>
      </div>
      {addingUrl && <AddPlaceSheet onAdd={addPlaceFromUrl} onClose={() => setAddingUrl(false)} />}
    </>
  );
}
