"use client";

import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { BinderModal, Masthead } from "@/components/common";
import { AREA_COORDS, BG, BLUE, DISPLAY, GREEN, HAIRLINE, INK, PAPER, POSTER_PALETTE, RUST, SANS, SERIF, mediaKindOf } from "@/lib/constants";
import { candidateMedia, hashStr, haptic, img, inferMediaKind, mapsUrl, mostRecentThursday, pinPosition, todayKey } from "@/lib/helpers";
import type { Keep, MagazineItemRef, MediaRecord, TabProps } from "@/lib/types";

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

function MapCanvas({ items, selectedIds, onOpenPin }: {
  items: Keep[];
  selectedIds: string[];
  onOpenPin: (item: Keep) => void;
}) {
  return (
    <div style={{
      position: "relative", width: "100%", aspectRatio: "4 / 3", borderRadius: 16, overflow: "hidden",
      background: "#F1EEE5",
      backgroundImage: "repeating-linear-gradient(0deg, rgba(23,23,21,0.05) 0, rgba(23,23,21,0.05) 1px, transparent 1px, transparent 32px), repeating-linear-gradient(90deg, rgba(23,23,21,0.05) 0, rgba(23,23,21,0.05) 1px, transparent 1px, transparent 32px)",
      border: `1px solid ${HAIRLINE}`,
    }}>
      {Object.entries(AREA_COORDS).map(([name, pos]) => (
        <span key={name} style={{ position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)", fontSize: 8.5, letterSpacing: "0.06em", color: "rgba(23,23,21,0.28)", fontFamily: SANS, whiteSpace: "nowrap", pointerEvents: "none" }}>{name}</span>
      ))}
      {items.map((item) => {
        const pos = pinPosition(item);
        const selected = selectedIds.includes(item.id);
        return (
          <button key={item.id} onClick={() => onOpenPin(item)} aria-label={item.title} style={{
            position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, width: 24, height: 24, marginLeft: -12, marginTop: -24,
            borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", cursor: "pointer", padding: 0,
            background: selected ? BLUE : PAPER, border: `2px solid ${selected ? BLUE : (item.color ?? INK)}`,
            boxShadow: "0 3px 7px rgba(23,23,21,0.3)", zIndex: selected ? 6 : 2,
            transition: "transform 0.15s, background 0.15s",
          }}>
            <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(45deg)", width: 7, height: 7, borderRadius: "50%", background: selected ? PAPER : (item.color ?? INK) }} />
          </button>
        );
      })}
    </div>
  );
}

// 地図の下に横スクロールで並ぶ棚。場所のKeep一覧・メディア一覧で共用する
// カード。タップで直接「今日のリスト」への出し入れをトグルする。
function ShelfCard({ title, image, color, sub, selected, onToggle }: {
  title: string; image?: string; color?: string; sub?: string; selected: boolean; onToggle: () => void;
}) {
  return (
    <button onClick={onToggle} style={{ flexShrink: 0, width: 112, textAlign: "left", padding: 0, border: "none", background: "none", cursor: "pointer" }}>
      <div style={{
        position: "relative", width: 112, height: 112, borderRadius: 12, overflow: "hidden",
        boxShadow: "0 6px 16px rgba(23,23,21,0.14)", border: `2.5px solid ${selected ? BLUE : "transparent"}`,
        transition: "border-color 0.15s, transform 0.15s", transform: selected ? "scale(0.96)" : "scale(1)",
      }}>
        {image ? (
          <img src={img(image, 240, 240)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: color ?? "#5A5A54", display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
            <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 12, color: PAPER, textAlign: "center", lineHeight: 1.3 }}>{title}</span>
          </div>
        )}
        {selected && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(43,63,191,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: BLUE, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(23,23,21,0.3)" }}>
              <Check size={16} color={PAPER} strokeWidth={3} />
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 6, fontFamily: SERIF, fontWeight: 700, fontSize: 11.5, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
      {sub && <div style={{ fontSize: 9, color: "#9A988E", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
    </button>
  );
}

function HorizontalShelf({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E" }}>{title}</span>
        {badge && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.05em", color: PAPER, background: BLUE, borderRadius: 999, padding: "2px 7px" }}>{badge}</span>}
      </div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2, marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
        {children}
      </div>
    </section>
  );
}

// タップで追加したものが積み上がっていく様子を見せる「バインダー」。
// 束の写真をタップすると外せる。AreaFolder/BinderModalと同じ重なり写真の
// 表現を踏襲し、アプリ全体で一貫した「束ねる」ビジュアルにしている。
function DraftBinder({ items, onRemove }: {
  items: { id: string; type: MagazineItemRef["type"]; title: string; image?: string; color?: string }[];
  onRemove: (id: string, type: MagazineItemRef["type"]) => void;
}) {
  const shown = items.slice(-5);
  const rotations = [-9, 6, -4, 8, -6];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "2px 2px 14px" }}>
      <div style={{ position: "relative", width: 62, height: 62, flexShrink: 0 }}>
        {shown.map((it, i) => (
          <button key={`${it.type}-${it.id}`} onClick={() => onRemove(it.id, it.type)} aria-label={`${it.title}を外す`} style={{
            position: "absolute", top: 2, left: 2, width: 50, height: 50, borderRadius: 8, overflow: "hidden", padding: 0, cursor: "pointer",
            border: "2.5px solid #fff", boxShadow: "0 3px 8px rgba(23,23,21,0.3)", background: "none",
            transform: `rotate(${rotations[i % rotations.length]}deg) translate(${i * 2}px, ${i * -2}px)`, zIndex: i,
            transition: "transform 0.2s",
          }}>
            {it.image ? (
              <img src={img(it.image, 100, 100)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", background: it.color ?? "#5A5A54" }} />
            )}
          </button>
        ))}
      </div>
      <div>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 14 }}>{items.length}件、たまってきました</div>
        <div style={{ fontSize: 9.5, color: "#9A988E", marginTop: 2 }}>タップで外せます</div>
      </div>
    </div>
  );
}

function MapPlanner({ pool, mediaPool, draftSelection, draftMediaSelection, onOpenPin, onToggleKeep, onToggleMedia, onPickBundle, onInjectDemo, onAddUrl, bundlesAreNew }: {
  pool: Keep[];
  mediaPool: MediaRecord[];
  draftSelection: string[];
  draftMediaSelection: string[];
  onOpenPin: (item: Keep) => void;
  onToggleKeep: (item: Keep) => void;
  onToggleMedia: (item: MediaRecord) => void;
  onPickBundle: (ids: string[]) => void;
  onInjectDemo: () => void;
  onAddUrl: () => void;
  bundlesAreNew: boolean;
}) {
  const sorted = pool.slice().sort((a, b) => new Date(b.keptAt).getTime() - new Date(a.keptAt).getTime());
  const bundles = [
    { id: "light", label: "さらっと", items: sorted.slice(0, 1) },
    { id: "easy", label: "ゆったり", items: sorted.slice(0, 3) },
    { id: "full", label: "じっくり", items: sorted.slice(0, 5) },
  ].filter((b) => b.items.length > 0);

  if (pool.length === 0 && mediaPool.length === 0) {
    return (
      <main style={{ padding: "48px 4px", textAlign: "center" }}>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 19, marginBottom: 10 }}>Keepが、まだありません。</div>
        <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.9, marginBottom: 22 }}>ブリーフでKeepすると、ここに地図として集まります。</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <button onClick={onInjectDemo} style={{ padding: "13px 26px", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em" }}>デモ用データを投入</button>
          <button onClick={onAddUrl} style={{ padding: "10px 20px", background: "transparent", border: "1.5px dashed rgba(23,23,21,0.3)", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#5A5A54" }}>＋ URLから場所を追加</button>
        </div>
      </main>
    );
  }

  const bottomPadding = draftSelection.length + draftMediaSelection.length > 0 ? 168 : 24;

  return (
    <main style={{ paddingTop: 14, paddingBottom: bottomPadding }}>
      <MapCanvas items={pool} selectedIds={draftSelection} onOpenPin={onOpenPin} />
      <p style={{ fontSize: 10.5, color: "#9A988E", lineHeight: 1.8, margin: "10px 2px 14px" }}>ピンやカードをタップして、今日の行き先を選ぶ。</p>
      <button onClick={onAddUrl} style={{ marginBottom: 22, width: "100%", padding: "10px 0", background: "transparent", border: "1.5px dashed rgba(23,23,21,0.3)", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#5A5A54" }}>＋ URLから場所を追加</button>

      {pool.length > 0 && (
        <HorizontalShelf title="KEEP一覧">
          {sorted.map((k) => (
            <ShelfCard key={k.id} title={k.title} image={k.images?.[0]} color={k.color}
              sub={k.area && k.area !== "—" ? k.area : k.category}
              selected={draftSelection.includes(k.id)} onToggle={() => onToggleKeep(k)} />
          ))}
        </HorizontalShelf>
      )}
      {mediaPool.length > 0 && (
        <HorizontalShelf title="メディア">
          {mediaPool.map((r) => (
            <ShelfCard key={r.id} title={r.title} image={r.image} color={r.color}
              sub={mediaKindOf(r.kind).label}
              selected={draftMediaSelection.includes(r.id)} onToggle={() => onToggleMedia(r)} />
          ))}
        </HorizontalShelf>
      )}
      {bundles.length > 0 && (
        <HorizontalShelf title="今週のおすすめ" badge={bundlesAreNew ? "NEW" : undefined}>
          {bundles.map((b) => (
            <ShelfCard key={b.id} title={b.label} image={b.items[0]?.images?.[0]} color={b.items[0]?.color}
              sub={`${b.items.length}件`} selected={false} onToggle={() => onPickBundle(b.items.map((it) => it.id))} />
          ))}
        </HorizontalShelf>
      )}
    </main>
  );
}

interface ExecItem {
  id: string;
  type: MagazineItemRef["type"];
  title: string;
  images?: string[];
  color?: string;
  categoryLabel: string;
  area?: string;
  meta?: string[];
  sourceUrl?: string;
  sourceLabel?: string;
  doneActionLabel: string;
}

function CoverSpread({ items }: { items: { id: string; title: string }[] }) {
  return (
    <div style={{ flexShrink: 0, width: "78%", minWidth: 240, scrollSnapAlign: "center", height: 460, background: INK, color: PAPER, borderRadius: 18, padding: "26px 22px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 10px 30px rgba(23,23,21,0.25)" }}>
      <div>
        <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "rgba(251,250,247,0.55)" }}>TODAY&apos;S ISSUE</div>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 25, lineHeight: 1.45, margin: "14px 0 0" }}>今日のための<br />特集号。</div>
      </div>
      <div>
        <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 700, fontSize: 44, lineHeight: 1 }}>{items.length}</div>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "rgba(251,250,247,0.55)", marginTop: 4 }}>ITEMS</div>
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 6, maxHeight: 150, overflow: "hidden" }}>
          {items.map((it, i) => (
            <div key={it.id} style={{ fontSize: 11.5, color: "rgba(251,250,247,0.85)", display: "flex", gap: 8 }}>
              <span style={{ opacity: 0.5, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DestinationSpread({ item, index, total, onRemove, onMarkDone }: {
  item: ExecItem;
  index: number;
  total: number;
  onRemove: () => void;
  onMarkDone: () => void;
}) {
  const isMapsSource = item.type === "keep" && item.sourceLabel === "地図で見る" && !!item.sourceUrl;
  return (
    <div style={{ flexShrink: 0, width: "78%", minWidth: 240, scrollSnapAlign: "center", height: 460, borderRadius: 18, overflow: "hidden", position: "relative", boxShadow: "0 10px 30px rgba(23,23,21,0.2)", background: PAPER, display: "flex", flexDirection: "column" }}>
      <div style={{ height: "56%", position: "relative", flexShrink: 0 }}>
        {item.images && item.images.length > 0 ? (
          <img src={img(item.images[0], 500, 500)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: item.color ?? "#5A5A54" }} />
        )}
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8 }}>
          <button onClick={onMarkDone} aria-label={item.doneActionLabel} style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: GREEN, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(23,23,21,0.3)" }}><Check size={22} strokeWidth={2.5} /></button>
          <button onClick={onRemove} aria-label="外す" style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: "rgba(23,23,21,0.55)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(23,23,21,0.3)" }}><X size={20} strokeWidth={2.5} /></button>
        </div>
        <div style={{ position: "absolute", top: 16, left: 14, fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 700, fontSize: 13, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
      </div>
      <div style={{ padding: "14px 18px 16px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.18em", color: "#9A988E" }}>{item.categoryLabel}{item.area && item.area !== "—" ? ` ・ ${item.area}` : ""}</div>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16, lineHeight: 1.35, margin: "6px 0 6px" }}>{item.title}</div>
        {item.meta && item.meta.length > 0 && (
          <div style={{ fontSize: 10.5, color: "#7A7A72", lineHeight: 1.6, flex: 1, overflow: "hidden" }}>{item.meta.slice(0, 2).join(" ・ ")}</div>
        )}
        {/* 地図のURLと「Googleマップ」ボタンが同じ行き先を指す場合は、二重に出さず1つにまとめる */}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {item.type === "keep" ? (
            isMapsSource ? (
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: "center", padding: "10px 0", background: INK, color: PAPER, borderRadius: 999, textDecoration: "none", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>Googleマップで開く</a>
            ) : (
              <>
                <a href={mapsUrl(`${item.title} ${item.area && item.area !== "—" ? item.area : ""}`)} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: "center", padding: "10px 0", background: INK, color: PAPER, borderRadius: 999, textDecoration: "none", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>Googleマップ</a>
                {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: "center", padding: "10px 0", border: `1.5px solid ${INK}`, borderRadius: 999, textDecoration: "none", color: INK, fontFamily: SANS, fontSize: 10.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.sourceLabel ?? "詳細"}</a>}
              </>
            )
          ) : (
            item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: "center", padding: "10px 0", background: INK, color: PAPER, borderRadius: 999, textDecoration: "none", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>{item.sourceLabel ?? "詳細"}</a>
          )}
        </div>
      </div>
    </div>
  );
}

// マガジン編集モードで開く「候補から追加」シート(場所のKeepのみ)
function AddToMagazineSheet({ pool, onAdd, onClose }: { pool: Keep[]; onAdd: (id: string) => void; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose} maxHeight="60vh">
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 15, marginBottom: 12 }}>候補から追加</div>
      {pool.length === 0 ? (
        <p style={{ fontSize: 12, color: "#9A988E", lineHeight: 1.8 }}>追加できる候補がありません。</p>
      ) : pool.map((k, i) => (
        <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE}` }}>
          {k.images && k.images.length > 0 ? (
            <img src={img(k.images[0], 90, 90)} alt="" style={{ width: 42, height: 42, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 42, height: 42, borderRadius: 8, background: k.color ?? "#5A5A54", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.title}</div>
            <div style={{ fontSize: 9.5, color: "#9A988E", marginTop: 2 }}>{k.category}{k.area && k.area !== "—" ? ` ・ ${k.area}` : ""}</div>
          </div>
          <button onClick={() => onAdd(k.id)} style={{ flexShrink: 0, padding: "8px 14px", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 10.5, fontWeight: 700 }}>追加</button>
        </div>
      ))}
    </BottomSheet>
  );
}

export function ExecuteTab({ appState, persist, showToast }: TabProps) {
  const magazine = appState.magazine;
  const [mapMode, setMapMode] = useState(false); // マガジン確定後でも地図に戻って選び直すときtrue
  const [pinItem, setPinItem] = useState<Keep | null>(null);
  const [draftSelection, setDraftSelection] = useState<string[]>([]);
  const [draftMediaSelection, setDraftMediaSelection] = useState<string[]>([]);
  const [editingMag, setEditingMag] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [addingUrl, setAddingUrl] = useState(false);

  const showMap = !magazine || mapMode;
  // 地図には実行済み以外の全Keepをピンとして出す(マガジン掲載中plannedも、選び直しのため含める)
  const pool = appState.keeps.filter((k) => k.status !== "done");
  const mediaPool = candidateMedia(appState);
  const notInMagazine = pool.filter((k) => !(magazine?.itemIds ?? []).some((r) => r.type === "keep" && r.id === k.id));
  const magItems: ExecItem[] = magazine ? magazine.itemIds
    .map((ref): ExecItem | null => {
      if (ref.type === "keep") {
        const k = appState.keeps.find((x) => x.id === ref.id);
        if (!k) return null;
        return {
          id: k.id, type: "keep", title: k.title, images: k.images, color: k.color,
          categoryLabel: k.category ?? "", area: k.area, meta: k.meta, sourceUrl: k.sourceUrl, sourceLabel: k.sourceLabel,
          doneActionLabel: "行った",
        };
      }
      const r = appState.records.media.find((x) => x.id === ref.id);
      if (!r) return null;
      return {
        id: r.id, type: "media", title: r.title, images: r.image ? [r.image] : undefined, color: r.color,
        categoryLabel: mediaKindOf(r.kind).label, meta: r.creator ? [r.creator] : undefined,
        sourceUrl: r.sourceUrl, sourceLabel: r.sourceLabel, doneActionLabel: mediaKindOf(r.kind).doneActionLabel,
      };
    })
    .filter((x): x is ExecItem => !!x) : [];

  const currentBundleWeek = mostRecentThursday();
  const bundlesAreNew = (appState.weekendMeta?.lastSeenBundleWeek ?? null) !== currentBundleWeek;

  useEffect(() => {
    if (!showMap || !bundlesAreNew || pool.length === 0) return;
    const t = setTimeout(() => {
      const next = structuredClone(appState);
      next.weekendMeta = { ...(next.weekendMeta ?? {}), lastSeenBundleWeek: currentBundleWeek };
      persist(next);
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap, bundlesAreNew, currentBundleWeek, pool.length]);

  const toggleDraftKeep = (item: Keep) => {
    haptic(8);
    setDraftSelection((prev) => prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id]);
  };
  const toggleDraftMedia = (item: MediaRecord) => {
    haptic(8);
    setDraftMediaSelection((prev) => prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id]);
  };
  const removeDraftItem = (id: string, type: MagazineItemRef["type"]) => {
    if (type === "keep") setDraftSelection((prev) => prev.filter((x) => x !== id));
    else setDraftMediaSelection((prev) => prev.filter((x) => x !== id));
  };

  // 地図での確定。新規作成と選び直し(更新)の両方に対応:
  // まず現在plannedのものを全て候補に戻し、選ばれたidだけをplannedにし直す。
  const confirmMagazine = (keepIds: string[], mediaIds: string[] = []) => {
    if (!keepIds.length && !mediaIds.length) return;
    haptic(16);
    const next = structuredClone(appState);
    next.keeps.forEach((k) => { if (k.status === "planned") k.status = "candidate"; });
    next.keeps.forEach((k) => { if (keepIds.includes(k.id)) k.status = "planned"; });
    const itemIds: MagazineItemRef[] = [
      ...keepIds.map((id) => ({ id, type: "keep" as const })),
      ...mediaIds.map((id) => ({ id, type: "media" as const })),
    ];
    next.magazine = { dateKey: todayKey(), decidedAt: new Date().toISOString(), itemIds };
    persist(next);
    setDraftSelection([]);
    setDraftMediaSelection([]);
    setMapMode(false);
    setEditingMag(false);
  };
  const addToMagazine = (id: string) => {
    haptic(10);
    const next = structuredClone(appState);
    const k = next.keeps.find((x) => x.id === id);
    if (k) k.status = "planned";
    next.magazine!.itemIds = [...next.magazine!.itemIds, { id, type: "keep" }];
    persist(next);
  };
  const removeFromMagazine = (id: string, type: MagazineItemRef["type"]) => {
    const next = structuredClone(appState);
    next.magazine!.itemIds = next.magazine!.itemIds.filter((r) => !(r.id === id && r.type === type));
    if (type === "keep") {
      const k = next.keeps.find((x) => x.id === id);
      if (k) k.status = "candidate";
    }
    if (next.magazine!.itemIds.length === 0) { next.magazine = null; setEditingMag(false); }
    persist(next);
  };
  const markDoneInMagazine = (id: string, type: MagazineItemRef["type"]) => {
    haptic(14);
    const next = structuredClone(appState);
    next.magazine!.itemIds = next.magazine!.itemIds.filter((r) => !(r.id === id && r.type === type));
    if (type === "keep") {
      const k = next.keeps.find((x) => x.id === id);
      if (k) {
        k.status = "done";
        k.doneAt = new Date().toISOString();
        const mediaKind = inferMediaKind(k.category);
        if (mediaKind) {
          next.records = next.records ?? { media: [] };
          next.records.media.unshift({ id: `media-${Date.now()}`, kind: mediaKind, title: k.title, creator: "", addedAt: k.doneAt, status: "done", doneAt: k.doneAt, image: k.images?.[0], color: k.color, sourceKeepId: k.id });
        }
      }
    } else {
      const r = next.records.media.find((x) => x.id === id);
      if (r) {
        r.status = "done";
        r.doneAt = new Date().toISOString();
      }
    }
    if (next.magazine!.itemIds.length === 0) { next.magazine = null; setEditingMag(false); }
    persist(next);
  };
  const dissolveMagazine = () => {
    const next = structuredClone(appState);
    (next.magazine?.itemIds ?? []).forEach((r) => {
      if (r.type === "keep") {
        const k = next.keeps.find((x) => x.id === r.id);
        if (k) k.status = "candidate";
      }
    });
    next.magazine = null;
    persist(next);
    setEditingMag(false);
    setMapMode(false);
  };
  const injectDemo = () => {
    const next = structuredClone(appState);
    const now = Date.now();
    ([
      { title: "「建築と自然」展を観る", category: "展覧会", area: "竹橋", images: ["momat-a", "momat-b"], sourceUrl: "https://www.momat.go.jp/", sourceLabel: "公式サイトを見る", color: "#20304A", meta: ["国立近代美術館", "10:00–17:00", "¥1,800"] },
      { title: "蔵前の焙煎所で豆を買う", category: "近所の発見", area: "蔵前", images: ["kuramae-a", "kuramae-b"], sourceUrl: mapsUrl("COFFEE WRIGHTS 蔵前"), sourceLabel: "地図で見る", color: "#3E4A3A", meta: ["COFFEE WRIGHTS", "9:00–18:00"] },
      { title: "高円寺の古着屋を覗く", category: "古着", area: "高円寺", images: ["vintage-a", "vintage-b"], sourceUrl: mapsUrl("高円寺 古着屋"), sourceLabel: "地図で見る", color: "#5C3A21", meta: ["高円寺北口エリア"] },
      { title: "神保町の古書店街を歩く", category: "近所の発見", area: "神保町", images: ["books-a", "books-b"], sourceUrl: mapsUrl("神保町 古書店街"), sourceLabel: "地図で見る", color: "#3E4A3A", meta: ["神保町"] },
      { title: "『大工の技術史』展を観る", category: "展覧会", area: "両国", images: ["carpentry-a", "carpentry-b"], sourceUrl: mapsUrl("江戸東京博物館"), sourceLabel: "公式サイトを見る", color: "#20304A", meta: ["江戸東京博物館"] },
      { title: "銭湯サウナを開拓する", category: "未知との遭遇", area: "蔵前", images: ["sauna-a", "sauna-b"], sourceUrl: mapsUrl("蔵前 銭湯"), sourceLabel: "地図で見る", color: "#2B3FBF", meta: ["蔵前"] },
    ]).forEach((d, i) => {
      next.keeps.push({ id: `demo-${now}-${i}`, title: d.title, category: d.category, area: d.area, status: "candidate", keptAt: new Date(now - i * 86400000).toISOString(), images: d.images, meta: d.meta, sourceUrl: d.sourceUrl, sourceLabel: d.sourceLabel, color: d.color });
    });
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
      sourceUrl: data.sourceUrl, sourceLabel: data.sourceLabel,
    });
    persist(next);
    showToast("地図に追加しました");
  };

  type DraftBinderEntry = { id: string; type: MagazineItemRef["type"]; title: string; image?: string; color?: string };
  const draftBinderItems: DraftBinderEntry[] = [
    ...draftSelection.map((id): DraftBinderEntry | null => {
      const k = appState.keeps.find((x) => x.id === id);
      return k ? { id, type: "keep", title: k.title, image: k.images?.[0], color: k.color } : null;
    }),
    ...draftMediaSelection.map((id): DraftBinderEntry | null => {
      const r = appState.records.media.find((x) => x.id === id);
      return r ? { id, type: "media", title: r.title, image: r.image, color: r.color } : null;
    }),
  ].filter((x): x is DraftBinderEntry => !!x);

  return (
    <>
      <Masthead title="実行" en="EXECUTE" statValue={magazine && !showMap ? magItems.length : pool.length + mediaPool.length} statLabel={magazine && !showMap ? "件の目的地" : "件の候補"} />

      {showMap ? (
        <>
          {magazine && (
            <button onClick={() => { setMapMode(false); setDraftSelection([]); setDraftMediaSelection([]); }} style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", padding: "12px 2px 0", fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#9A988E" }}>← マガジンに戻る</button>
          )}
          <MapPlanner
            pool={pool} mediaPool={mediaPool} draftSelection={draftSelection} draftMediaSelection={draftMediaSelection}
            onOpenPin={setPinItem} onToggleKeep={toggleDraftKeep} onToggleMedia={toggleDraftMedia}
            onPickBundle={(ids) => confirmMagazine(ids, [])} onInjectDemo={injectDemo} onAddUrl={() => setAddingUrl(true)} bundlesAreNew={bundlesAreNew}
          />
          {(draftSelection.length + draftMediaSelection.length) > 0 && (
            <div style={{ position: "fixed", left: 0, right: 0, bottom: 60, zIndex: 20, display: "flex", justifyContent: "center", background: `linear-gradient(to top, ${BG} 75%, rgba(239,237,230,0))`, paddingTop: 16 }}>
              <div style={{ width: "100%", maxWidth: 420, padding: "0 16px 10px" }}>
                <DraftBinder items={draftBinderItems} onRemove={removeDraftItem} />
                <button onClick={() => confirmMagazine(draftSelection, draftMediaSelection)} style={{ width: "100%", padding: "14px 0", background: INK, color: PAPER, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", boxShadow: "0 8px 24px rgba(23,23,21,0.2)" }}>
                  {draftSelection.length + draftMediaSelection.length}件で{magazine ? "マガジンを更新" : "マガジンを作る"}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <main style={{ paddingTop: 6, paddingBottom: 24 }}>
          {/* 編集への入り口は控えめに: 小さなテキストのみ */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 2px 10px" }}>
            <button onClick={() => {
              setDraftSelection(magazine!.itemIds.filter((r) => r.type === "keep").map((r) => r.id));
              setDraftMediaSelection(magazine!.itemIds.filter((r) => r.type === "media").map((r) => r.id));
              setMapMode(true);
            }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#9A988E" }}>← 地図で選び直す</button>
            <button onClick={() => setEditingMag(!editingMag)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 11, fontWeight: 700, color: editingMag ? INK : "#9A988E" }}>{editingMag ? "完了" : "編集"}</button>
          </div>

          <div style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", gap: 14, padding: "4px 0 6px", WebkitOverflowScrolling: "touch", marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
            <CoverSpread items={magItems} />
            {magItems.map((item, i) => (
              <DestinationSpread key={`${item.type}-${item.id}`} item={item} index={i} total={magItems.length} onRemove={() => removeFromMagazine(item.id, item.type)} onMarkDone={() => markDoneInMagazine(item.id, item.type)} />
            ))}
            {editingMag && (
              <button onClick={() => setAddSheetOpen(true)} style={{
                flexShrink: 0, width: "78%", minWidth: 240, scrollSnapAlign: "center", height: 460, borderRadius: 18, cursor: "pointer",
                border: "2px dashed rgba(23,23,21,0.25)", background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
              }}>
                <span style={{ fontSize: 34, color: "#9A988E", lineHeight: 1 }}>＋</span>
                <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "#9A988E", letterSpacing: "0.08em" }}>候補から追加</span>
              </button>
            )}
          </div>
          <p style={{ fontSize: 10.5, color: "#9A988E", lineHeight: 1.8, margin: "14px 2px 0" }}>横にスワイプで次へ。</p>

          {editingMag && (
            <button onClick={dissolveMagazine} style={{ marginTop: 20, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: RUST, letterSpacing: "0.04em" }}>このマガジンを解散する</button>
          )}
        </main>
      )}

      <BinderModal
        item={pinItem}
        onClose={() => setPinItem(null)}
        actionSlot={pinItem ? ((closeSheet) => (
          <button onClick={() => { toggleDraftKeep(pinItem); closeSheet(); }} style={{
            width: "100%", padding: "12px 0", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
            background: draftSelection.includes(pinItem.id) ? "transparent" : INK,
            color: draftSelection.includes(pinItem.id) ? RUST : PAPER,
            border: draftSelection.includes(pinItem.id) ? `1.5px solid ${RUST}` : "none",
          }}>{draftSelection.includes(pinItem.id) ? "外す" : "＋ 今日に追加"}</button>
        )) : undefined}
      />
      {addSheetOpen && <AddToMagazineSheet pool={notInMagazine} onAdd={(id) => addToMagazine(id)} onClose={() => setAddSheetOpen(false)} />}
      {addingUrl && <AddPlaceSheet onAdd={addPlaceFromUrl} onClose={() => setAddingUrl(false)} />}
    </>
  );
}
