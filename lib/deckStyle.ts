// 生成カード(buildDeck の GeneratedCard)を、ブリーフタブが表示できる BriefCard へ
// マップする。BriefCard は見た目のフィールド(bg/fg/color/glyph/category/categoryJp)を
// 持つが、生成カードは kind と内容しか持たないため、kind ごとの意匠テーブルで補う。
// 写真は生成カードが持つOGP画像(og:image)をそのまま引き継ぐ。無ければ images:[] で
// 現行の「写真が無いカードは色ベタ+字面」表示になる。

import { INK, SCHEME } from "@/lib/constants";
import type { BriefCard, ItemKind } from "@/lib/types";
import type { GeneratedCard } from "@/lib/briefPipeline";

/** スキームの1組を、カードの「地」と「字面」へそのまま写す。 */
function pair(p: { bg: string; ink: string }) { return { color: p.bg, fg: p.ink }; }

// kind → 表示意匠。★色はカラースキームの組をそのまま当てる(2026-08-16)。
// 地(color)と字面(fg)は必ず同じ組から取る — 明るい地に明るい字が乗る事故を
// 構造的に防ぐため、片方だけを差し替えられないようにしてある。
// 墨(INK)だけは無彩色なので、相方に淡いピンクを借りる。
const KIND_STYLE: Record<ItemKind, {
  category: string; categoryJp: string; glyph: string; color: string; fg: string;
}> = {
  place:      { category: "PLACE",      categoryJp: "場所",   glyph: "場", ...pair(SCHEME.forest) },
  exhibition: { category: "EXHIBITION", categoryJp: "展覧会", glyph: "展", ...pair(SCHEME.navy) },
  live:       { category: "LIVE",       categoryJp: "ライブ", glyph: "演", ...pair(SCHEME.violet) },
  activity:   { category: "ACTIVITY",   categoryJp: "体験",   glyph: "体", ...pair(SCHEME.orange) },
  food:       { category: "FOOD",       categoryJp: "食",     glyph: "食", ...pair(SCHEME.red) },
  movie:      { category: "CINEMA",     categoryJp: "映画",   glyph: "映", color: INK, fg: SCHEME.forest.ink },
  book:       { category: "BOOK",       categoryJp: "本",     glyph: "本", ...pair(SCHEME.wine) },
  album:      { category: "MUSIC",      categoryJp: "音楽",   glyph: "音", ...pair(SCHEME.yellow) },
  info:       { category: "INFO",       categoryJp: "情報",   glyph: "報", ...pair(SCHEME.sky) },
  thing:      { category: "THING",      categoryJp: "もの",   glyph: "物", ...pair(SCHEME.pink) },
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
    detail: gc.detail,
    meta: cleanMeta.length ? cleanMeta : undefined,
    bg: s.color,
    fg: s.fg,
    // 差し色も同じ組の相方から取る(shade で明るくすると、黄や空の地では
    // 地に溶けて消えてしまう)。
    accent: s.fg,
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
