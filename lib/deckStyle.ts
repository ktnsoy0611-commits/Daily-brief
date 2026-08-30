// 生成カード(buildDeck の GeneratedCard)を、ブリーフタブが表示できる BriefCard へ
// マップする。BriefCard は見た目のフィールド(bg/fg/color/glyph/category/categoryJp)を
// 持つが、生成カードは kind と内容しか持たないため、kind ごとの意匠テーブルで補う。
// 写真は生成カードが持つOGP画像(og:image)をそのまま引き継ぐ。無ければ images:[] で
// 現行の「写真が無いカードは色ベタ+字面」表示になる。

import { colorOfKind, inkOfKind } from "@/lib/palette";
import type { BriefCard, ItemKind } from "@/lib/types";
import type { GeneratedCard } from "@/lib/briefPipeline";

// ★★★第73巡に **kind ごとの色をやめた**。10 kind に 10 色を当てていたので、
//   同じ「展覧会」が券では橙・ブリーフでは紺と食い違っていた。
//   色は**ドメイン（4つ）**から引き（`lib/palette.ts`）、kind の違いは
//   **文字（category / categoryJp）と字面（glyph）**が担う。
const KIND_META: Record<ItemKind, { category: string; categoryJp: string; glyph: string }> = {
  place:      { category: "PLACE", categoryJp: "場所", glyph: "場" },
  exhibition: { category: "EXHIBITION", categoryJp: "展覧会", glyph: "展" },
  live:       { category: "LIVE", categoryJp: "ライブ", glyph: "演" },
  activity:   { category: "ACTIVITY", categoryJp: "体験", glyph: "体" },
  food:       { category: "FOOD", categoryJp: "食", glyph: "食" },
  movie:      { category: "CINEMA", categoryJp: "映画", glyph: "映" },
  book:       { category: "BOOK", categoryJp: "本", glyph: "本" },
  album:      { category: "MUSIC", categoryJp: "音楽", glyph: "音" },
  info:       { category: "INFO", categoryJp: "情報", glyph: "報" },
  thing:      { category: "THING", categoryJp: "もの", glyph: "物" },
};
const FALLBACK_META = KIND_META.info;

const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());
function hostOf(u?: string): string | undefined {
  if (!u) return undefined;
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return undefined; }
}

export function generatedToBriefCard(gc: GeneratedCard, id: number): BriefCard {
  const kind = (gc.kind && gc.kind in KIND_META ? gc.kind : "info") as ItemKind;
  const s = KIND_META[kind] ?? FALLBACK_META;
  // ★色は kind ではなく**ドメイン**から（第73巡）。
  const color = colorOfKind(kind), fg = inkOfKind(kind);
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
    color,
    kind,
    title: gc.title,
    body: gc.body,
    detail: gc.detail,
    meta: cleanMeta.length ? cleanMeta : undefined,
    bg: color,
    fg,
    // 差し色も同じ組の相方から取る(shade で明るくすると、黄や空の地では
    // 地に溶けて消えてしまう)。
    accent: fg,
    images: gc.images ?? [],
    sourceUrl: gc.sourceUrl,
    sourceLabel,
    sourceWishId: gc.sourceWishId,
    sourceWishTitle: gc.sourceWishTitle,
    expiresAt: gc.expiresAt,
    serendipity: gc.isDerived,
    isInfo: gc.isInfo,
    goalId: gc.goalId,
    goalTitle: gc.goalTitle,
  };
}
