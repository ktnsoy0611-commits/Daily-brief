"use client";

import { Flag, Sprout } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { BinderModal, HOLE_CLEAR, Masthead, PunchHoles } from "@/components/common";
import { BG, CHECKIN_INTERVAL_DAYS, GREEN, HAIRLINE, INK, ITEM_CARD_ASPECT, MILESTONE_INTERVAL_DAYS, PAPER, RUST, SANS, SERIF, SOFT_SHADOW_LG, SWIPE_THRESHOLD, BLUE, DISPLAY } from "@/lib/constants";
import { daysBetween, haptic, img, ratingLabel, todayKey, todayLabel } from "@/lib/helpers";
import type { BriefCard, DeckCard, GrowthCard, TabProps } from "@/lib/types";
import { isGrowthCard } from "@/lib/types";

function CardFace({ card, dx, isTop, onOpenBinder, checkinValue, onCheckinChange, milestoneText, onMilestoneTextChange, milestoneRating, onMilestoneRatingChange, flagged, onFlag }: {
  card: DeckCard;
  dx: number;
  isTop: boolean;
  onOpenBinder?: () => void;
  checkinValue: string;
  onCheckinChange: (v: string) => void;
  milestoneText: string;
  onMilestoneTextChange: (v: string) => void;
  milestoneRating: 1 | 2 | 3 | null;
  onMilestoneRatingChange: (r: 1 | 2 | 3) => void;
  flagged?: boolean;
  onFlag?: () => void;
}) {
  const keepOpacity = isTop ? Math.min(Math.max(dx / SWIPE_THRESHOLD, 0), 1) : 0;
  const skipOpacity = isTop ? Math.min(Math.max(-dx / SWIPE_THRESHOLD, 0), 1) : 0;

  if (isGrowthCard(card)) {
    if (card.type === "checkin") {
      return (
        <div style={{
          width: "100%", height: "100%", background: PAPER, borderRadius: 18, overflow: "hidden",
          display: "flex", flexDirection: "column", boxShadow: SOFT_SHADOW_LG,
          border: `2px solid ${GREEN}`, position: "relative", userSelect: "none",
        }}>
          <div style={{ flex: "0 0 38%", background: GREEN, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: PAPER }}>
            <Sprout size={32} strokeWidth={1.5} />
            <span style={{ fontSize: 9, letterSpacing: "0.26em", opacity: 0.8 }}>CHECK-IN</span>
          </div>
          <div style={{ flex: 1, padding: "18px 20px 20px", paddingLeft: HOLE_CLEAR, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E", marginBottom: 8 }}>{card.goalTitle}</div>
            <h2 style={{ margin: "0 0 12px", fontFamily: SERIF, fontWeight: 700, fontSize: 18, lineHeight: 1.4, color: INK }}>最近は、どうですか？</h2>
            <textarea
              value={checkinValue}
              onChange={(e) => onCheckinChange(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="今取り組んでいることを、ひとことで"
              style={{ flex: 1, resize: "none", border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: 12, fontFamily: SANS, fontSize: 13, outline: "none", background: "#FAFAF6", color: INK }}
            />
          </div>
          <PunchHoles />
        </div>
      );
    }

    return (
      <div style={{
        width: "100%", height: "100%", background: PAPER, borderRadius: 18, overflow: "hidden",
        display: "flex", flexDirection: "column", boxShadow: SOFT_SHADOW_LG,
        border: `2px solid ${RUST}`, position: "relative", userSelect: "none",
      }}>
        <div style={{ flex: "0 0 34%", background: RUST, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: PAPER }}>
          <Sprout size={30} strokeWidth={1.5} />
          <span style={{ fontSize: 9, letterSpacing: "0.26em", opacity: 0.85 }}>MILESTONE</span>
        </div>
        <div style={{ flex: 1, padding: "16px 20px 20px", paddingLeft: HOLE_CLEAR, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "#9A988E", marginBottom: 8 }}>{card.goalTitle}</div>
          <h2 style={{ margin: "0 0 10px", fontFamily: SERIF, fontWeight: 700, fontSize: 17, lineHeight: 1.4, color: INK }}>できるようになったこと、ありますか？</h2>
          <textarea
            value={milestoneText}
            onChange={(e) => onMilestoneTextChange(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="この1〜2ヶ月で、できるようになったこと"
            style={{ flex: 1, resize: "none", border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: 12, fontFamily: SANS, fontSize: 13, outline: "none", background: "#FAFAF6", color: INK, marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 6 }} onPointerDown={(e) => e.stopPropagation()}>
            {([1, 2, 3] as const).map((r) => (
              <button key={r} onClick={() => onMilestoneRatingChange(r)} style={{
                flex: 1, padding: "9px 4px", borderRadius: 10, cursor: "pointer", fontFamily: SANS, fontSize: 10.5, fontWeight: 700,
                background: milestoneRating === r ? RUST : "transparent", color: milestoneRating === r ? PAPER : "#5A5A54",
                border: `1.5px solid ${milestoneRating === r ? RUST : "rgba(23,23,21,0.2)"}`,
              }}>{ratingLabel(r)}</button>
            ))}
          </div>
        </div>
        <PunchHoles />
      </div>
    );
  }

  const hasPhotos = (card.images?.length ?? 0) > 0;
  return (
    <div style={{
      width: "100%", height: "100%", background: PAPER, borderRadius: 18, overflow: "hidden",
      display: "flex", flexDirection: "column", boxShadow: SOFT_SHADOW_LG,
      // セレンディピティ枠も特別な縁取りを付けず、他のカードと同じ見た目に
      // 馴染ませる(「思いがけない提案」であることを声高にラベルしない方が
      // 体験として良い、というユーザー指定)。
      border: "none", position: "relative", userSelect: "none",
    }}>
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => isTop && onOpenBinder && onOpenBinder()}
        style={{ flex: "0 0 52%", position: "relative", overflow: "hidden", background: card.bg, cursor: isTop && hasPhotos ? "pointer" : "default" }}
      >
        {hasPhotos ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img(card.images![0], 500, 400)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span aria-hidden style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "min(42vw, 170px)", lineHeight: 1, color: card.fg, opacity: 0.92 }}>{card.glyph}</span>
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0) 40%, rgba(0,0,0,0.22) 100%)", pointerEvents: "none" }} />
        {isTop && hasPhotos && (
          <span style={{
            position: "absolute", bottom: 12, right: 14, display: "flex", alignItems: "center", gap: 5,
            background: "rgba(23,23,21,0.5)", color: "#fff", borderRadius: 999, padding: "5px 11px 5px 9px",
            fontSize: 10, fontFamily: SANS, fontWeight: 700, pointerEvents: "none",
          }}>写真 {card.images!.length} を見る ⤢</span>
        )}
      </div>
      <div style={{ flex: 1, padding: "16px 20px 18px", paddingLeft: HOLE_CLEAR, display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#5A5A54", flexShrink: 0 }} />
            {/* セレンディピティのカードは「セレンディピティ」の語を出さず、
                カテゴリだけ表示して他カードと同じ見た目にする。 */}
            <span style={{ fontSize: 9, color: "#5A5A54", fontWeight: 700, letterSpacing: "0.05em" }}>{card.category}{card.trigger && card.trigger !== "セレンディピティ" ? ` ・ ${card.trigger}` : ""}</span>
          </span>
        </div>
        <h2 style={{ margin: "0 0 7px", fontFamily: SERIF, fontWeight: 700, fontSize: 19, lineHeight: 1.35, color: INK }}>{card.title}</h2>
        {/* paddingRightはisTopに関わらず常に一定にしている。以前はisTop&&
            onFlagの時だけ26pxを足していたため、peekだったカードがtopに
            切り替わる瞬間にpaddingが0→26へ非連続にジャンプし、transform
            のアニメーションと同時に本文の折り返し位置が一瞬ガクッとズレて
            見える不具合になっていた(flag矢印ボタン自体はisTopの時だけ
            描画されるが、そのための余白は常に確保しておく)。 */}
        {/* flex:1でwebkit-line-clampと組み合わせると、SafariでB本文が
            クランプされずカードの外(角丸の下)へそのまま溢れて見える
            不具合があった(flex-basis:0からのflex-growとline-clampの
            高さ計算がSafari上で噛み合わない)。flexに頼らず、行の高さから
            算出した固定のmaxHeightで確実に頭打ちにする。 */}
        <p style={{ margin: 0, maxHeight: "calc(1.7em * 5)", fontFamily: SANS, fontSize: 12.5, lineHeight: 1.7, color: "#4A4A44", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden", paddingRight: 26 }}>{card.body}</p>
        {isTop && onFlag && (
          <button
            onClick={(e) => { e.stopPropagation(); onFlag(); }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="この情報の質をフィードバック"
            style={{ position: "absolute", bottom: 12, right: 14, background: "none", border: "none", cursor: "pointer", padding: 6, lineHeight: 0 }}
          >
            <Flag size={13} strokeWidth={2} color={flagged ? RUST : "#C8C6BC"} fill={flagged ? RUST : "none"} />
          </button>
        )}
      </div>
      <div style={{ position: "absolute", top: 20, left: 18, transform: "rotate(-12deg)", opacity: keepOpacity, border: `3px solid ${BLUE}`, color: BLUE, fontFamily: SANS, fontWeight: 700, fontSize: 24, letterSpacing: "0.15em", padding: "3px 12px", borderRadius: 6, background: "rgba(251,250,247,0.85)", pointerEvents: "none" }}>KEEP</div>
      <div style={{ position: "absolute", top: 20, right: 18, transform: "rotate(12deg)", opacity: skipOpacity, border: "3px solid #8A8A82", color: "#8A8A82", fontFamily: SANS, fontWeight: 700, fontSize: 24, letterSpacing: "0.15em", padding: "3px 12px", borderRadius: 6, background: "rgba(251,250,247,0.85)", pointerEvents: "none" }}>SKIP</div>
      <PunchHoles />
    </div>
  );
}

type Decision = "keep" | "skip" | "answered" | "skipped";

// 育成カード用フッター(あとで/記録する)の高さぶんの予約枠。isGrowthを
// 問わず常にこの高さを確保しておくことで、フッターの有無によって
// カードの実寸が変わる(=スワイプで昇格した瞬間にガクッと動く)ことが
// 構造的に起こらないようにする。
const GROWTH_FOOTER_SLOT = 58;

export function BriefTab({ appState, persist, goTab, profileButton }: TabProps) {
  const [drag, setDrag] = useState({ dx: 0, dy: 0, active: false });
  const [exit, setExit] = useState<"keep" | "skip" | null>(null);
  const [binderItem, setBinderItem] = useState<BriefCard | null>(null);
  const [checkinAnswer, setCheckinAnswer] = useState("");
  const [milestoneText, setMilestoneText] = useState("");
  const [milestoneRating, setMilestoneRating] = useState<1 | 2 | 3 | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  // commit()の二重発火を防ぐ同期ロックと、その保留中setTimeoutの参照。
  // タブを離れる等でこのコンポーネントがアンマウントされた場合、生の
  // setTimeoutはコンポーネントのライフサイクルと無関係に動き続けてしまう
  // (Reactは自動でクリアしない)ため、アンマウント時に明示的に破棄する。
  const committingRef = useRef(false);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (commitTimerRef.current != null) clearTimeout(commitTimerRef.current);
  }, []);
  // カードの実寸は、dvhベースの割合による推測ではなく、実際にレイアウト
  // された「カードを中央寄せする枠」のサイズを直接測って決める。以前は
  // `calc(Xdvh * 0.75)`という推測値を使っていたが、実機(特にSafari)では
  // 実際のビューポート/ヘッダー/フッターの実寸とズレることがあり、
  // 本文がカードの外へそのままはみ出す不具合の一因になっていた。
  const arenaRef = useRef<HTMLDivElement>(null);
  const [cardBox, setCardBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = arenaRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      // 枠自身の上下パディング(10px×2)は余白として残す。
      const availH = rect.height - 20;
      const availW = rect.width;
      if (availW <= 0 || availH <= 0) return;
      const w = Math.min(availW, 340, availH * 0.75);
      setCardBox({ w, h: w * (4 / 3) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);


  const dateKey = todayKey();
  // ブリーフは1日2回更新される: 正午を境に「朝刊」と「夕刊」。
  // エディションごとに独立したキーを持つため、午後になるとデッキが再び届く。
  const edition = new Date().getHours() < 12 ? "am" : "pm";
  const editionKey = `${dateKey}-${edition}`;
  const editionLabel = edition === "am" ? "朝刊" : "夕刊";
  const decisions: Record<string, Decision> = (appState.briefs?.[editionKey]?.decisions as Record<string, Decision>) ?? {};
  const feedback = appState.briefs?.[editionKey]?.feedback ?? {};

  // カードの質が低かったときの控えめなフィードバック。本実装では
  // このカードを生成した情報源(source)のスコアを下げる材料になる。
  const toggleFlag = (cardId: string | number) => {
    haptic(6);
    const next = structuredClone(appState);
    const brief = next.briefs[editionKey] ?? { decisions: {} };
    brief.feedback = brief.feedback ?? {};
    brief.feedback[cardId] = !brief.feedback[cardId];
    next.briefs[editionKey] = brief;
    persist(next);
  };

  // 目標には2種類の「育成カード」が届く: 軽い問いかけ(checkin, 14日毎)と、
  // 評価つきの振り返り(milestone, 45日毎)。同じ日に何件も届くと煩わしいので、
  // 全目標×両方の種類の中から「間隔に対してもっとも待たせている1件」だけを選ぶ。
  const dueCandidate = useMemo(() => {
    const goals = appState.goals ?? [];
    const candidates: { g: (typeof goals)[number]; kind: "checkin" | "milestone"; urgency: number }[] = [];
    goals.forEach((g) => {
      const sinceCheckin = daysBetween(g.checkIns?.[0]?.at ?? g.addedAt);
      const lastMilestoneAt = g.checkIns?.find((ci) => ci.kind === "milestone")?.at ?? g.addedAt;
      const sinceMilestone = daysBetween(lastMilestoneAt);
      if (sinceCheckin >= CHECKIN_INTERVAL_DAYS) candidates.push({ g, kind: "checkin", urgency: sinceCheckin / CHECKIN_INTERVAL_DAYS });
      if (sinceMilestone >= MILESTONE_INTERVAL_DAYS) candidates.push({ g, kind: "milestone", urgency: sinceMilestone / MILESTONE_INTERVAL_DAYS });
    });
    candidates.sort((a, b) => b.urgency - a.urgency);
    return candidates[0] ?? null;
  }, [appState.goals]);

  // デッキは夜間Cronが生成した generatedDecks[editionKey] のみを使う。その号が
  // まだ無い間は空(休刊表示)にする。以前はダミー(CARDS)へフォールバックして
  // いたが、ダミーのカードid(1〜14)をスワイプするとその決定が残り、生成カードの
  // idと衝突して「もう見た」と誤判定される不具合の原因になっていたため撤去した
  // (SYSTEM-DESIGN §8 のサンプルデータ撤去にも沿う)。
  // この号で既に育成カード(checkin/milestone)を1枚さばいたか。育成カードの
  // 決定キーは "checkin-..."/"milestone-..." で始まる。
  const growthDecidedThisEdition = Object.keys(decisions).some(
    (k) => k.startsWith("checkin-") || k.startsWith("milestone-"),
  );
  const generated = appState.generatedDecks?.[editionKey];
  const deck: DeckCard[] = useMemo(() => {
    const source: BriefCard[] = generated && generated.length > 0 ? generated : [];
    const base: DeckCard[] = [...source];
    // 育成カードは1号につき最大1枚だけ差し込む。**既にこの号で育成カードを
    // 決定済み(記録 or あとで)なら差し込まない**。これが無いと、育成カードを
    // 「あとで」でスキップしても、そのゴールは依然「期限到来中」のままなので
    // dueCandidate が同じ育成カードを再計算で差し込み直し、同じチェックイン
    // カードが延々とループして先へ進めなくなっていた(実機で発見)。
    if (dueCandidate && !growthDecidedThisEdition) {
      const { g, kind } = dueCandidate;
      const growthCard: GrowthCard = { id: `${kind}-${g.id}`, type: kind, goalId: g.id, goalTitle: g.title };
      base.splice(3, 0, growthCard);
    }
    return base;
  }, [dueCandidate, generated, growthDecidedThisEdition]);

  const index = deck.filter((c) => decisions[c.id]).length;
  const done = index >= deck.length;
  // 安全網: 表示すべきカードが進んだ(=決定が保存された)のに、何らかの
  // 理由でexit/dragが定位置に戻っていなければ、ここで強制的にリセットする。
  // 通常のフローではcommit()のsetTimeout内で既に行っているため実質的には
  // 二重の保険だが、万一そこが正しく完了しなかった場合に「カードが画面上
  // 動かせない/めくれない」状態のまま固まるのを防ぐ。
  useEffect(() => {
    setExit(null);
    setDrag({ dx: 0, dy: 0, active: false });
    committingRef.current = false;
  }, [index]);
  // 育成カード(checkin/milestone)は「keep」判定にはならない(answered/skippedのみ)ため、
  // ここでBriefCardであることをTSにも保証する。
  const keptCards = deck.filter((c): c is BriefCard => !isGrowthCard(c) && decisions[c.id] === "keep");
  const currentCard = deck[index];
  const isCheckin = currentCard?.type === "checkin";
  const isMilestone = currentCard?.type === "milestone";
  const isGrowth = !!currentCard && isGrowthCard(currentCard);
  const canRecord = isCheckin ? !!checkinAnswer.trim() : isMilestone ? !!(milestoneText.trim() && milestoneRating) : true;

  const commit = (dir: "keep" | "skip") => {
    // exit(state)だけでの再入防止は、Reactの再レンダーが挟まるまでの間
    // (同じイベントtick内で複数回pointerupが発火した場合など)は効かない
    // ことがある。committingRefは即座に反映される同期フラグなので、その
    // 抜け道を塞ぐ。iOSで合成のpointerup/pointercancelが連続して届くと、
    // stateの反映が間に合わず同じカードへcommitが二重に走り、「keepの
    // 判定はストックされるのに画面のカードが進まない」ように見える不具合の
    // 芽になりうるため、二重の入り口(state+ref)で確実に1回だけに絞る。
    if (done || exit || committingRef.current) return;
    committingRef.current = true;
    const card = deck[index];
    haptic(dir === "keep" ? 18 : 8);
    setExit(dir);
    if (commitTimerRef.current != null) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      const next = structuredClone(appState);
      const brief = next.briefs[editionKey] ?? { decisions: {} };

      if (isGrowthCard(card)) {
        brief.decisions[card.id] = dir === "keep" ? "answered" : "skipped";
        if (dir === "keep") {
          const g = (next.goals ?? []).find((x) => x.id === card.goalId);
          if (g) {
            g.checkIns = g.checkIns ?? [];
            if (card.type === "checkin" && checkinAnswer.trim()) {
              g.checkIns.unshift({ id: `ci-${Date.now()}`, at: new Date().toISOString(), text: checkinAnswer.trim(), source: "prompted" });
            } else if (card.type === "milestone" && milestoneText.trim() && milestoneRating) {
              g.checkIns.unshift({ id: `ci-${Date.now()}`, at: new Date().toISOString(), text: milestoneText.trim(), rating: milestoneRating, kind: "milestone", source: "prompted" });
            }
          }
        }
      } else {
        brief.decisions[card.id] = dir;
        if (dir === "keep") {
          // KEEPは常にItemを1件作るだけ(以前は「作品なら直接records.media、
          // それ以外はkeeps」という2経路の分岐があった)。種類はカード側の
          // kind(省略時は"place")、場所の有無はareaの有無がそのまま決める。
          // ウィッシュに応えたカード(sourceWishTitle)は、まだ叶えていない
          // 同名のウィッシュが実在する場合だけorigin:"wish"として紐付ける。
          const wish = card.sourceWishTitle
            ? next.wishes.find((w) => w.title === card.sourceWishTitle && w.status === "stock")
            : undefined;
          next.items.push({
            id: `brief-${editionKey}-${card.id}`, kind: card.kind ?? "place",
            title: card.title, category: card.categoryJp,
            area: card.area && card.area !== "—" ? card.area : undefined,
            images: card.images, meta: card.meta, sourceUrl: card.sourceUrl, sourceLabel: card.sourceLabel, color: card.color,
            status: "candidate", addedAt: new Date().toISOString(), expiresAt: card.expiresAt,
            origin: wish ? "wish" : "brief", sourceWishId: wish?.id,
          });
        }
      }

      if (Object.keys(brief.decisions).length >= deck.length) brief.completedAt = new Date().toISOString();
      next.briefs[editionKey] = brief;
      setExit(null);
      setDrag({ dx: 0, dy: 0, active: false });
      setCheckinAnswer("");
      setMilestoneText("");
      setMilestoneRating(null);
      committingRef.current = false;
      persist(next);
    }, 320);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (exit || done || isGrowth) return; // 育成カードはテキスト入力と衝突するためドラッグ無効
    startRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ dx: 0, dy: 0, active: true });
    // 合成イベント(自動テスト)やごく稀なブラウザの状態では、有効な
    // ポインタが存在しないとして例外を投げることがある(Binder.tsxの
    // ドラッグ実装と同じ既知の事象)。ここで握りつぶしても、キャプチャに
    // 失敗するだけでドラッグ自体(pointermove/pointerupの追跡)は続行できる。
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.active || exit) return;
    setDrag({ dx: e.clientX - startRef.current.x, dy: (e.clientY - startRef.current.y) * 0.25, active: true });
  };
  const onPointerUp = () => {
    if (!drag.active || exit) return;
    if (drag.dx > SWIPE_THRESHOLD) commit("keep");
    else if (drag.dx < -SWIPE_THRESHOLD) commit("skip");
    else setDrag({ dx: 0, dy: 0, active: false });
  };

  const exitX = exit === "keep" ? window.innerWidth * 1.2 : exit === "skip" ? -window.innerWidth * 1.2 : 0;
  // topTransformとpeekTransformは、常に同じ関数の並び
  // (translate → scale → rotate)で組み立てている。決定直後にpeekだった
  // カードがtop側へ切り替わる瞬間、DOM要素自体は使い回される(下のコメント
  // 参照)ため、transformの値がscale()+translateY()の並びからtranslate()+
  // rotate()の並びへ非連続に変わっていると、ブラウザは単純な成分ごとの
  // 補間ができずマトリクス分解による補間にフォールバックし、意図しない
  // 拡縮・回転が混ざった「変な挙動」に見えていた。同じ並びに揃えることで
  // 各成分がそのまま滑らかに補間されるようにしている。
  const topTransform = exit
    ? `translate(${exitX}px, ${drag.dy - 40}px) scale(1) rotate(${exit === "keep" ? 22 : -22}deg)`
    : `translate(${drag.dx}px, ${drag.dy}px) scale(1) rotate(${drag.dx * 0.06}deg)`;
  const topTransition = exit ? "transform 0.32s cubic-bezier(0.32,0.72,0,1)" : drag.active ? "none" : "transform 0.28s cubic-bezier(0.32,0.72,0,1)";
  // peekの着地(translateY 8→0 / scale 0.95〜1→1)は、以前は「indexが進んで
  // このカードがtop役に切り替わる瞬間」に合わせて起こしていた。しかし
  // それだと『役割の切り替え』と『見た目の値が変わる』が同一のReact
  // コミットで同時に起こることになり、CSSトランジションが正しく発火する
  // 保証がない(スワイプ直後に一瞬で位置が飛ぶ=ガクつきの実体だった。
  // Chromiumでは大抵ごまかせても機種依存で再現したりしなかったりする
  // 不安定な挙動で、そもそもの設計として壊れていた)。
  // 正しい直し方は「いつ着地させるか」をindexの切り替わりから切り離すこと。
  // exitがセットされた瞬間(=手前のカードが飛び始める瞬間)に、peekの
  // 着地アニメーションも同じ長さ(0.32s)で同時に開始する。320ms後に
  // 実際にindexが進んでこのカードがtop役になる頃には、transformの値は
  // 既に定位置(0,0)・scale(1)に収まっているため、役割切り替えの瞬間には
  // 見た目上なにも変化しない=原理的にガクつきようがなくなる。
  const peekTransform = exit
    ? "translate(0, 0px) scale(1) rotate(0deg)"
    : `translate(0, 8px) scale(${0.95 + Math.min(Math.abs(drag.dx) / SWIPE_THRESHOLD, 1) * 0.05}) rotate(0deg)`;
  const peekTransition = exit
    ? "transform 0.32s cubic-bezier(0.32,0.72,0,1)"
    : drag.active ? "none" : "transform 0.28s cubic-bezier(0.32,0.72,0,1)";
  // top(手前)とpeek(次)を別々のDOM要素として固定していると、決定直後に
  // indexが進んだ瞬間、peekだったカードの要素が一旦消えてtop要素として
  // 新規マウントし直され、それまでのtransformが引き継がれずガクッと
  // スナップして見えていた。カードのidそのものをkeyにして同じ要素を
  // 使い回すことで、「peekの見た目→topの見た目」への変化を1枚の要素の
  // transformアニメーションとして連続させる(上のpeekTransform/exit連動と
  // 合わせて、役割が切り替わる瞬間には要素の位置もtransition設定も
  // 何一つ変化しない状態を作る)。
  const visibleCards: { card: DeckCard; isTop: boolean }[] = [
    ...(deck[index] ? [{ card: deck[index], isTop: true }] : []),
    ...(deck[index + 1] ? [{ card: deck[index + 1], isTop: false }] : []),
  ];

  return (
    <>
      <Masthead title="ブリーフ" statValue={done ? keptCards.length : index + 1} statLabel={done ? "件Keep" : `／ ${deck.length} 件目`} dateline={`${todayLabel()} ・ ${editionLabel}`} corner={profileButton} />
      <div style={{ display: "flex", gap: 4, padding: "12px 4px 16px" }}>
        {deck.map((c, i) => (
          <span key={c.id} style={{ flex: 1, height: 3, borderRadius: 2, background: decisions[c.id] === "keep" || decisions[c.id] === "answered" ? (c.type === "checkin" || c.type === "milestone" ? GREEN : BLUE) : decisions[c.id] ? "#D8D6CC" : i === index && !done ? INK : "rgba(23,23,21,0.1)", transition: "background 0.3s" }} />
        ))}
      </div>

      {!done ? (
        // ページ本体はスクロールしない(AppShell側でこのタブの間だけ
        // overflow-yをhiddenにしている)ので、ここがそのまま「残りの
        // 高さいっぱい」になる。カードの実寸はarenaRefで実測したこの枠の
        // サイズから直接計算する(詳細はarenaRefの定義部のコメント参照)。
        // 育成カード(checkin/milestone)の「あとで/記録する」フッターは
        // isGrowthに関わらず常に同じ高さ(GROWTH_FOOTER_SLOT)の枠を確保して
        // おく。これにより、枠(=arenaRefが測る対象)の実寸がフッターの
        // 有無で変わらなくなり、スワイプで育成カードが先頭に昇格した瞬間に
        // カード全体(と本文の折り返し位置)がガクッと動く不具合が構造的に
        // 起こらなくなる。
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* overflowはvisibleのまま(以前はhiddenにしていた)。カードの
              SOFT_SHADOW_LGは要素の外側に描かれるため、hiddenだと左右・
              下側で途中から切れて見えていた。スワイプ確定後にカードを
              画面外まで大きくtranslateXさせるアニメーションがあるが、
              このタブは滞在中ずっとdocument.body.style.overflowを
              hiddenにロックしているため、ここをvisibleにしても実際に
              ページがスクロール/横に伸びることはない。 */}
          <div ref={arenaRef} style={{ flex: "1 1 auto", minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 0" }}>
            <main style={{ position: "relative", width: cardBox ? cardBox.w : "min(88vw, 340px)", height: cardBox ? cardBox.h : undefined, aspectRatio: cardBox ? undefined : ITEM_CARD_ASPECT }}>
              {visibleCards.map(({ card, isTop }) => (
                <div
                  key={card.id}
                  {...(isTop ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } : {})}
                  style={isTop ? {
                    position: "absolute", inset: 0, zIndex: 2, transform: topTransform, transition: topTransition,
                    touchAction: isGrowth ? "auto" : "none", cursor: isGrowth ? "default" : drag.active ? "grabbing" : "grab",
                  } : {
                    position: "absolute", inset: 0, zIndex: 1, transform: peekTransform, transition: peekTransition,
                  }}
                >
                  <CardFace card={card} dx={isTop ? drag.dx : 0} isTop={isTop}
                    onOpenBinder={isTop ? () => setBinderItem(card as BriefCard) : undefined}
                    checkinValue={isTop ? checkinAnswer : ""} onCheckinChange={isTop ? setCheckinAnswer : () => {}}
                    milestoneText={isTop ? milestoneText : ""} onMilestoneTextChange={isTop ? setMilestoneText : () => {}}
                    milestoneRating={isTop ? milestoneRating : null} onMilestoneRatingChange={isTop ? setMilestoneRating : () => {}}
                    flagged={isTop ? !!feedback[card.id] : undefined} onFlag={isTop ? () => toggleFlag(card.id) : undefined} />
                </div>
              ))}
            </main>
          </div>
          {/* 育成カード(テキスト入力を伴う)はドラッグを無効にしているため、
              代わりにボタンで決定させる必要がある。通常カードはスワイプだけで
              完結するため、下部にボタンは置かない。以前はSKIP/KEEPの控えめな
              ヒント文字を置いていたが、カードのドロップシャドウがその文字と
              重なる位置で境目のように見えてしまっていたため撤廃した。 */}
          {/* isGrowthに関わらず常にこの高さの枠を確保する(理由は上の
              コメント参照)。position+zIndexを明示しないと、この非配置
              (static)要素はAppShell側のnav手前のグラデーション
              (zIndex:15、画面下端に常駐)より低い描画レイヤーに置かれ、
              フッターがタブバーの直前でうっすら覆われて見づらくなる。
              バインド！ボタンと同じzIndex:26にして、常にグラデーション・
              navより手前に出す。
              ★zIndexを上げただけでは直りきらなかった: z-indexは「重なった
              時にどちらが手前か」を決めるだけで、要素の透明な部分(ボタン
              同士の隙間・下のpaddingの余白)まで裏を隠すわけではない。
              この枠自体がbackground:transparentのままだったため、隙間から
              下のグラデーション(zIndex:15)がそのまま透けて見え続けていた。
              育成カードでボタンが出ている間だけ、枠自体にページ背景色(BG)を
              敷き、矩形の範囲を丸ごと不透明にすることで、隙間からの透過を
              構造的に無くした(通常カードの時はこの枠は中身が無く見えない
              ため、透明のままにしてカードの影の抜けに影響しないようにする)。
              ★上記だけでは別の境目が生まれた: このフッターのすぐ上にある
              カード自体のSOFT_SHADOW_LG(ぼかしの効いたドロップシャドウ)は
              枠(arenaRef)の外まで滲み出て、本来は徐々にページ背景色へ
              溶け込んでいくはずだった。ところがフッターは矩形のまま一枚岩の
              不透明なBGで、かつzIndexがカードより高いため、影がまだ薄く
              残っている途中の位置でスパッと不透明な壁に切り取られてしまい、
              「影がここで終わっている」という直線的な境目に見えていた。
              フッターの上端を単色の壁ではなく、影の減衰と同じ向きに
              透明→不透明へ滲むグラデーションにすることで、影の自然な
              フェードアウトと視覚的に連続するようにした(境目そのものを
              無くすのではなく、境目が見えなくなるまで滑らかにする)。
              フェードは20pxで完了させ、下側の大部分(タブバー直前の
              もやが出る領域=26px分)は引き続き完全に不透明なままにして
              いるため、もやを隙間から通す構造的な穴は生まれない。 */}
          <footer style={{
            position: "relative", zIndex: 26, minHeight: GROWTH_FOOTER_SLOT, paddingBottom: isGrowth ? 8 : 0, flexShrink: 0,
            background: isGrowth ? `linear-gradient(to bottom, ${BG}00 0, ${BG} 20px, ${BG} 100%)` : "transparent",
          }}>
            {isGrowth && (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => commit("skip")} style={{ flex: 1, padding: "13px 0", background: "transparent", border: "1.5px solid rgba(23,23,21,0.3)", borderRadius: 999, fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: "#5A5A54", cursor: "pointer" }}>あとで</button>
                <button onClick={() => commit("keep")} disabled={!canRecord} style={{ flex: 1.4, padding: "13px 0", background: isMilestone ? RUST : GREEN, border: "none", borderRadius: 999, fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: PAPER, cursor: canRecord ? "pointer" : "default", opacity: canRecord ? 1 : 0.4 }}>記録する</button>
              </div>
            )}
          </footer>
        </div>
      ) : (
        <main className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "28px 4px" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.28em", color: "#9A988E" }}>END OF ISSUE</div>
          <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 26, lineHeight: 1.4, margin: "10px 0 20px" }}>{editionLabel}は、<br />ここまで。</h2>
          <p style={{ fontSize: 11.5, color: "#9A988E", lineHeight: 1.8, margin: "0 0 20px" }}>{edition === "am" ? "夕刊は、正午にお届けします。" : "明日の朝刊で、また。"}</p>
          {keptCards.map((c, i) => (
            <div key={c.id} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "12px 2px", borderTop: `1px solid ${HAIRLINE}` }}>
              <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17, color: BLUE, minWidth: 28 }}>{String(i + 1).padStart(2, "0")}</span>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 14 }}>{c.title}</div>
            </div>
          ))}
          <button onClick={() => goTab("execute")} style={{ marginTop: 22, width: "100%", padding: "13px 0", background: INK, border: "none", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: PAPER }}>
            プランタブで地図を見る
          </button>
        </main>
      )}
      <BinderModal item={binderItem} onClose={() => setBinderItem(null)} />
    </>
  );
}
