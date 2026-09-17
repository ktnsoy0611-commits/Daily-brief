import type { AppState, BriefCard } from "./types";

// ★★★**提案のカードを KEEP して `Item` を作る道はここ1つ**（2026-09-17・第118巡）。
//
// ★★★**なぜ切り出したか。** 第117巡まで、この式は
//   `components/tabs/BriefTab.tsx` の中に**インラインで**在った。ところが
//   **ホームの帯から提案のピルを引き下ろす道**も同じことをしなければならない
//   ―― `BandItem.id` が `offer-<card.id>` のとき、その中身は
//   `AppState.generatedDecks` に居るだけで **`AppState.items` には無い**ので、
//   `HomeTab.put` の `items.find(...)` は**原理的に当たらず、何も書かずに
//   return していた**。それでも帯からは消えるので、ユーザーには
//   「**追加されず、消えてしまった**」と見えた（第118巡に報告）。
// ★★**式を2か所に書くと、次に `Item` の欄が増えたとき片方しか直らない。**
//   だから**持ち上げて1つにした**。BriefTab もここを呼ぶだけにしてある。

/**
 * KEEP して `Item` を1件作る。**戻り値は作った `Item` の id**。
 *
 * ★`state` は**その場で書き換える**（呼ぶ側が `structuredClone` 済みの下書きを渡す）。
 * ★★**決定（`briefs[ed].decisions`）も同時に打つ** ―― 打たないと、そのカードは
 *   BriefTab のデッキにも帯にも**残り続けて二重に見える**。
 * ★★**中身は第117巡までの BriefTab とまったく同じ**（情報カードの枝・ウィッシュの
 *   照合・ゴールの実在確認・`origin`）。**1文字も変えていない。**
 *
 * @param ed カードの**元の号**のキー（`YYYY-MM-DD`）。★今の号ではない ――
 *           未消化のプールは号をまたぐので、今の号に記録すると号内でカードと
 *           決定を突き合わせられなくなる。
 */
export function keepCard(state: AppState, ed: string, card: BriefCard): string {
  const brief = state.briefs[ed] ?? { decisions: {} };
  brief.decisions[card.id] = "keep";
  state.briefs[ed] = brief;

  // ウィッシュに応えたカードは origin:"wish" として紐付ける。まず sourceWishId
  // (Gemini が返した願いの id・言い換えに強い)で照合し、無い場合(旧デッキ)だけ
  // 従来の sourceWishTitle 文字一致にフォールバックする。どちらも「まだ叶えて
  // いない(status:"stock")願い」に限る。
  const wish =
    (card.sourceWishId
      ? state.wishes.find((w) => w.id === card.sourceWishId && w.status === "stock")
      : undefined) ??
    (card.sourceWishTitle
      ? state.wishes.find((w) => w.title === card.sourceWishTitle && w.status === "stock")
      : undefined);
  const nowIso = new Date().toISOString();
  const id = `brief-${ed}-${card.id}`;

  // 情報カード(新着記事)は「提案」ではなく「読んで記録するもの」。KEEP したら
  // ストック(候補)には出さず、その日の日付バインダーへ done として直接入れる
  // (別枠の流れ・ユーザー指定 HANDOFF §8.17)。detail に記事の半分要約が入って
  // おり、アーカイブでもそのまま読める。
  if (card.isInfo) {
    state.items.push({
      id, kind: card.kind ?? "info",
      title: card.title, category: card.categoryJp, summary: card.body, detail: card.detail,
      images: card.images, meta: card.meta, sourceUrl: card.sourceUrl, sourceLabel: card.sourceLabel, color: card.color,
      status: "done", addedAt: nowIso, doneAt: nowIso, origin: "info",
    });
    return id;
  }
  state.items.push({
    id, kind: card.kind ?? "place",
    title: card.title, category: card.categoryJp, summary: card.body, detail: card.detail,
    area: card.area && card.area !== "—" ? card.area : undefined,
    lat: card.lat, lng: card.lng, placeId: card.placeId,
    images: card.images, meta: card.meta, sourceUrl: card.sourceUrl, sourceLabel: card.sourceLabel, color: card.color,
    status: "candidate", addedAt: nowIso, expiresAt: card.expiresAt,
    origin: wish ? "wish" : "brief", sourceWishId: wish?.id,
    // ゴール由来のカードは、どのゴールのためかを保持したままストックへ入る
    // (実在するゴールに限る・§8.21)。
    goalId: card.goalId && state.goals.some((g) => g.id === card.goalId) ? card.goalId : undefined,
  });
  return id;
}
