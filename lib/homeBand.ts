import type { AppState, BriefCard, InboxCandidate, Task } from "./types";
import { PALETTE, SCHEME } from "./constants";

// ★★★**帯に何が並ぶかを決める唯一の場所**（2026-09-07・`docs/home-spec.md` §4）。
//
// 置き場の規則はこれ1本 ―― **日付が無いものは帯（上）。日付が付いたものは山（下）。**
// 提案・急ぎ・声から拾った候補・いつかやるは、**ぜんぶ「まだ日付が無い」で一致する**
// ので4種類ではなく1種類であり、置き場は帯ひとつ。段が分けているのは**出どころ**だけ。
//
// | 段 | 出どころ | 見た目 |
// |---|---|---|
// | 1 | AI から来たもの（提案・急ぎ） | 太いカプセル。★**写真を持つのは提案だけ** |
// | 2 | 自分の声から出た候補 | CREAM のピル |
// | 3 | いつかやる（期限なし） | 縁だけのピル |

/** 帯の1つ。★**印（アイコン）は持たない** ―― 列に印が並ぶと印が「模様」になる。 */
export interface BandItem {
  id: string;
  /** ピルに出る1行。 */
  text: string;
  /** 段1だけ。面の色（提案は STORM → SKY → SEA、急ぎは ROSE）。 */
  color?: string;
  /** 段1の提案だけが持つ写真。 */
  photo?: string;
  /** ★★★**急ぎ（フォローアップ）は、いまは出さない**（2026-09-07 ユーザー確定）。
   *  何を急ぎとするかがデータから決まらないため。印だけ残してあるので、
   *  決まったらここへ `true` を立てる（面は ROSE、写真は持たない）。 */
  urgent?: boolean;
}

/** ★提案の面の色。**1枚目は STORM、2枚目以降は SKY → SEA の順に循環**（§2-d）。 */
const OFFER_COLORS = [PALETTE.storm, PALETTE.sky, PALETTE.sea];
export const offerColor = (i: number): string => OFFER_COLORS[i % OFFER_COLORS.length];

/** その帯が空かどうか。★1段でも空なら**動きの速さを判断できない**ので見本を出す。 */
const SAMPLES: [BandItem[], BandItem[], BandItem[]] = [
  // ★★**見本**（2026-09-07）。実データがまだ無い段にだけ出る。
  //   ★★★段取り7（本物にする）で**この定数ごと消す**。
  [
    { id: "s1", text: "杉本博司の展覧会が今週末まで" },
    { id: "s2", text: "近所に新しい珈琲屋ができた" },
    { id: "s3", text: "読みかけの記事が3本たまっている" },
    { id: "s4", text: "週末に行ける庭園が2つある" },
  ],
  [
    { id: "s5", text: "自転車の空気を入れる" },
    { id: "s6", text: "母に電話する" },
    { id: "s7", text: "名刺を刷り直す" },
  ],
  [
    { id: "s8", text: "いつか京都の庭を見に行く" },
    { id: "s9", text: "写真集を整理する" },
    { id: "s10", text: "ドイツ語をやり直す" },
  ],
];

const cardText = (c: BriefCard): string => c.title || c.trigger || c.category;

/** その日のデッキのうち、まだ決めていないカード。★**未読の枚数**もここから数える。 */
export function unreadCards(state: AppState, dayKey: string): BriefCard[] {
  const deck = state.generatedDecks?.[dayKey] ?? [];
  const decided = new Set(Object.keys(state.briefs?.[dayKey]?.decisions ?? {}));
  return deck.filter((c): c is BriefCard => !("type" in c && c.type) && !decided.has(String(c.id)));
}

/**
 * 帯の3段。★**段の中身は「出どころ」だけで決める**（切実さで混ぜない）。
 * ★実データが無い段には見本を入れる（動きの速さを実機で判断するため）。
 */
export function bandRows(state: AppState, dayKey: string): [BandItem[], BandItem[], BandItem[]] {
  const offers = unreadCards(state, dayKey).map((c, i) => ({
    id: `card-${c.id}`,
    text: cardText(c),
    color: offerColor(i),
    photo: c.images?.[0],
  }));
  const voices = (state.inbox ?? []).filter((c: InboxCandidate) => !c.dueDate)
    .map((c) => ({ id: c.id, text: c.title }));
  const someday = (state.tasks ?? []).filter((t: Task) => !t.done && !t.dueDate)
    .map((t) => ({ id: t.id, text: t.title }));
  // ★見本の色も本番と同じ規則で当てる（急ぎは ROSE、提案だけが循環に数えられる）。
  let n = 0;
  const sample0 = SAMPLES[0].map((s) => ({ ...s, color: s.urgent ? SCHEME.danger : offerColor(n++) }));
  return [
    offers.length ? offers : sample0,
    voices.length ? voices : SAMPLES[1],
    someday.length ? someday : SAMPLES[2],
  ];
}
