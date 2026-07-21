// 生成カード(buildDeck の GeneratedCard)を、ブリーフタブが表示できる BriefCard へ
// マップする。BriefCard は見た目のフィールド(bg/fg/color/glyph/category/categoryJp)を
// 持つが、生成カードは kind と内容しか持たないため、kind ごとの意匠テーブルで補う。
// 写真は生成カードが持つOGP画像(og:image)をそのまま引き継ぐ。無ければ images:[] で
// 現行の「写真が無いカードは色ベタ+字面」表示になる。

import { shade } from "@/lib/helpers";
import type { BriefCard, ItemKind } from "@/lib/types";
import type { GeneratedCard } from "@/lib/briefPipeline";

const PAPER_FG = "#F3ECDD";

// kind → 表示意匠。color は暗めの下地(明るい字面 PAPER_FG が乗る前提)。
const KIND_STYLE: Record<ItemKind, { category: string; categoryJp: string; glyph: string; color: string }> = {
  place:      { category: "PLACE",       categoryJp: "場所",   glyph: "場", color: "#33633F" },
  exhibition: { category: "EXHIBITION",  categoryJp: "展覧会", glyph: "展", color: "#2C4E74" },
  live:       { category: "LIVE",        categoryJp: "ライブ", glyph: "演", color: "#2A4A3A" },
  activity:   { category: "ACTIVITY",    categoryJp: "体験",   glyph: "体", color: "#7A4432" },
  food:       { category: "FOOD",        categoryJp: "食",     glyph: "食", color: "#8A3C2A" },
  movie:      { category: "CINEMA",      categoryJp: "映画",   glyph: "映", color: "#1A1712" },
  book:       { category: "BOOK",        categoryJp: "本",     glyph: "本", color: "#6B4A2E" },
  album:      { category: "MUSIC",       categoryJp: "音楽",   glyph: "音", color: "#A67A2E" },
  info:       { category: "INFO",        categoryJp: "情報",   glyph: "報", color: "#3E5468" },
  thing:      { category: "THING",       categoryJp: "もの",   glyph: "物", color: "#8A6B2E" },
};
const FALLBACK_STYLE = KIND_STYLE.info;

const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());
function hostOf(u?: string): string | undefined {
  if (!u) return undefined;
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return undefined; }
}

export function generatedToBriefCard(gc: GeneratedCard, id: number): BriefCard {
  const kind = (gc.kind && gc.kind in KIND_STYLE ? gc.kind : "info") as ItemKind;
  const s = KIND_STYLE[kind] ?? FALLBACK_STYLE;
  // meta にURLや空文字が紛れ込むとカード内に生URLが表示されてしまうので除く。
  const cleanMeta = (gc.meta ?? []).map((m) => (typeof m === "string" ? m.trim() : "")).filter((m) => m && !isUrl(m));
  // 出典ボタンのラベル: LLMがURLをそのまま入れることがあるので、URLらしければ
  // ドメイン名から「○○で見る」を作る。無ければ「出典を見る」。
  const host = hostOf(gc.sourceUrl);
  const rawLabel = gc.sourceLabel?.trim();
  const sourceLabel = gc.sourceUrl
    ? (rawLabel && !isUrl(rawLabel) ? rawLabel : host ? `${host}で見る` : "出典を見る")
    : undefined;
  return {
    id,
    glyph: s.glyph,
    category: s.category,
    categoryJp: s.categoryJp,
    trigger: gc.trigger,
    area: gc.area,
    lat: gc.lat,
    lng: gc.lng,
    placeId: gc.placeId,
    color: s.color,
    kind,
    title: gc.title,
    body: gc.body,
    meta: cleanMeta.length ? cleanMeta : undefined,
    bg: s.color,
    fg: PAPER_FG,
    accent: shade(s.color, 45),
    images: gc.images ?? [],
    sourceUrl: gc.sourceUrl,
    sourceLabel,
    sourceWishTitle: gc.sourceWishTitle,
    expiresAt: gc.expiresAt,
    serendipity: gc.isDerived,
  };
}
